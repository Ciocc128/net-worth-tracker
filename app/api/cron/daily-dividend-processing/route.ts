import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  COUPON_CATCHUP_LOOKBACK_DAYS,
  runDividendScraping,
  runExpenseCreation,
  runNextCouponScheduling,
} from '@/lib/server/dividendProcessor';
import { CronRunRecorder } from '@/lib/server/cronRun';
import { verifyCronSecret } from '@/lib/server/apiAuth';
import { ALLOWED_USERS_COLLECTION } from '@/types/account';
import { getItalyDayBoundsUtc } from '@/lib/utils/dateHelpers';

// The Hobby plan's ceiling with Fluid compute: scraping every instrument runs inside it.
export const maxDuration = 300;

/**
 * GET /api/cron/daily-dividend-processing
 *
 * Daily automated dividend processing cron job
 * Scheduled execution: 17:00 UTC via Vercel Cron — the FIRST of three crons in three hours
 * (doc/cron-serale § 5.1, D-CS1): a coupon paid today is credited to its account BEFORE the evening
 * photo of the month is taken (18:00 UTC), whichever day of the month it is.
 *
 * Three-Phase Architecture (see dividendProcessor.ts for implementation):
 *   Phase 1: Dividend Discovery — scrapes Borsa Italiana, 60-day lookback
 *   Phase 2: Expense Creation  — creates cashflow entries for dividends paid today
 *   Phase 3: Coupon Scheduling — schedules next coupon for bonds paid today
 *
 * Each phase is recorded in `cron-runs` (doc/cron-serale § 5.5); a phase with errors, or one that
 * throws, makes the run `partial` and the response HTTP 500 (D-CS2).
 *
 * Security: requires CRON_SECRET via Authorization header
 * Error handling: non-blocking per-user; returns summary statistics for monitoring
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!verifyCronSecret(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('Starting daily dividend processing cron job...');
  const run = new CronRunRecorder('dividends');
  const summary: Record<string, unknown> = {};

  try {
    // Every ADMITTED user (doc/sicurezza/S2-utenti-ammessi.md RU5); the three phases read only the id.
    const usersSnapshot = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
    const users = usersSnapshot.docs;

    if (users.length === 0) {
      summary.message = 'No users found';
    } else {
      // Phase 1: Scrape recent dividends (60-day lookback)
      await run.phase('scraping', async () => {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const scrapingResult = await runDividendScraping(users, sixtyDaysAgo);
        console.log(`Phase 1 completed: Scraped ${scrapingResult.assetsScraped} assets, created ${scrapingResult.newDividends} new dividends, ${scrapingResult.errors} errors`);
        summary.scraping = {
          assetsScraped: scrapingResult.assetsScraped,
          newDividends: scrapingResult.newDividends,
          errors: scrapingResult.errors,
        };
        return {
          failed: scrapingResult.errors > 0,
          counts: { assetsScraped: scrapingResult.assetsScraped, newDividends: scrapingResult.newDividends, errors: scrapingResult.errors },
        };
      });

      // The "today" window is the Italian calendar day, not UTC midnight: payment dates are Italian days.
      const { start: todayStartDate, end: todayEndDate } = getItalyDayBoundsUtc();
      const todayStart = Timestamp.fromDate(todayStartDate);
      const todayEndTimestamp = Timestamp.fromDate(todayEndDate);
      // Catch-up lower bound: coupons/premiums missed on a past run are recovered down to this date so
      // a single miss never permanently breaks the coupon chain. See dividendProcessor.ts.
      const lookbackStartDate = new Date(todayStartDate);
      lookbackStartDate.setDate(lookbackStartDate.getDate() - COUPON_CATCHUP_LOOKBACK_DAYS);
      const lookbackStart = Timestamp.fromDate(lookbackStartDate);

      // Phase 2: Create cashflow expenses for dividends due today
      await run.phase('expense-creation', async () => {
        const expenseResult = await runExpenseCreation(users, todayStart, todayEndTimestamp, lookbackStart);
        console.log(`Phase 2 completed: ${expenseResult.processedCount} expenses created, ${expenseResult.errorCount} errors`);
        summary.expenseCreation = {
          processedCount: expenseResult.processedCount,
          errorCount: expenseResult.errorCount,
          processedDividends: expenseResult.processedDividends,
          errors: expenseResult.errors,
        };
        return { failed: expenseResult.errorCount > 0, counts: { created: expenseResult.processedCount, errors: expenseResult.errorCount } };
      });

      // Phase 3: Schedule next coupon for bonds due on or before today
      await run.phase('coupon-scheduling', async () => {
        const couponResult = await runNextCouponScheduling(users, todayStart, todayEndTimestamp, lookbackStart);
        console.log(`Phase 3 completed: ${couponResult.scheduled} next coupons scheduled, ${couponResult.skipped} skipped, ${couponResult.errors} errors`);
        summary.couponScheduling = {
          scheduled: couponResult.scheduled,
          skipped: couponResult.skipped,
          errors: couponResult.errors,
        };
        return { failed: couponResult.errors > 0, counts: { scheduled: couponResult.scheduled, skipped: couponResult.skipped, errors: couponResult.errors } };
      });
    }
  } catch (error) {
    console.error('Error in daily dividend processing cron job:', error);
    run.fail();
  }

  await run.save();
  return run.respond({ message: 'Daily dividend processing job completed', ...summary });
}
