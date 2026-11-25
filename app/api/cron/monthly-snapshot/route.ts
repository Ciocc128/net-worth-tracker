import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import { verifyExpenseTotals, type VerifyResult } from '@/lib/server/expenseTotals';
import { refreshEcbRatesIfStale } from '@/lib/server/ecbRatesService';
import { refreshMarketAnchorsIfStale } from '@/lib/server/marketAnchorsService';
import { evaluateActiveGoals } from '@/lib/server/assistant/goalEvaluationService';
import { captureBudgetHistory } from '@/lib/server/budgetHistoryService';
import { createPortfolioSnapshot } from '@/lib/server/portfolioSnapshot';
import { CronRunRecorder, pruneCronRuns, shortError } from '@/lib/server/cronRun';
import { verifyCronSecret } from '@/lib/server/apiAuth';
import { ALLOWED_USERS_COLLECTION } from '@/types/account';

// The Hobby plan's ceiling with Fluid compute.
export const maxDuration = 300;

/**
 * GET /api/cron/monthly-snapshot
 *
 * The evening photo. Scheduled: every day at 18:00 UTC (19:00/20:00 Italian) via Vercel Cron — the
 * SECOND of three crons in three hours (doc/cron-serale § 5.1, D-CS1): the dividends are credited at
 * 17:00 UTC, before the photo; the period emails are the recap cron's, at 19:00 UTC.
 *
 * Runs daily — snapshot ID is {userId}-{year}-{month}, so each run overwrites the same document
 * throughout the month (upsert). The last run of the month becomes the permanent historical record.
 * The goal re-evaluation (phase 4) and the budget history capture (phase 5, overwritten daily so a
 * month's record is its last captured configuration) run every day too.
 *
 * Phases (each recorded in `cron-runs`, doc/cron-serale § 5.5):
 *   1. per user: `createPortfolioSnapshot` (a direct call — C7, no HTTP), then `verifyExpenseTotals`,
 *      then `updateHallOfFame` when the snapshot was written
 *   2. ECB rates · 3. market anchors · 4. assistant goals · 5. budget history
 *
 * Failure: one phase or one user failing does not stop the others; the run is then `partial` and the
 * response is HTTP 500, so Vercel shows it red (D-CS2).
 *
 * Security: requires CRON_SECRET via Authorization header; the Admin SDK reads every admitted user.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!verifyCronSecret(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const run = new CronRunRecorder('snapshot');
  const results: Array<{ userId: string; snapshotId: string | null; status: string }> = [];
  const errors: Array<{ userId: string; error: string }> = [];
  const goalSummary = { evaluated: 0, suggestions: 0, skipped: 0, errors: 0 };
  let budgetHistorySummary = { captured: 0, skipped: 0, errors: 0 };

  try {
    // Every ADMITTED user (doc/sicurezza/S2-utenti-ammessi.md RU5): `users/{uid}` is a profile a
    // client writes; it no longer decides who is processed.
    const userIds: string[] = [];
    await run.phase('users', async () => {
      const usersSnapshot = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
      userIds.push(...usersSnapshot.docs.map((doc) => doc.id));
      return { counts: { users: userIds.length } };
    });

    // Nobody admitted: nothing to photograph, and the shared caches are not worth refreshing for no one.
    if (userIds.length === 0) {
      await run.save();
      return run.respond({ message: 'No users found', snapshotsCreated: 0 });
    }

    await run.phase('snapshots', async () => {
      for (const userId of userIds) {
        try {
          const snapshot = await createPortfolioSnapshot(userId, { writtenBy: 'cron', now: run.startedAt });
          run.user(userId).snapshot = snapshot.status;

          // The monthly totals' nightly check (doc/totali-mensili § 5.3), after the snapshot and before
          // the Hall of Fame, which then reads the documents it left in memory. Never fatal.
          let verified: VerifyResult | undefined;
          try {
            verified = await verifyExpenseTotals(userId);
            const { report } = verified;
            console.log(`Expense totals checked for user ${userId}`, {
              changed: report.changed.length,
              mismatched: report.mismatched.length,
              missingYears: report.missingYears,
            });
          } catch (totalsError) {
            console.error(`Error checking expense totals for user ${userId}:`, totalsError);
          }

          if (snapshot.status !== 'no-assets') {
            try {
              await updateHallOfFame(userId, { verified });
              console.log(`Hall of Fame updated for user ${userId}`);
            } catch (hallOfFameError) {
              console.error(`Error updating Hall of Fame for user ${userId}:`, hallOfFameError);
            }
          }
          results.push({ userId, snapshotId: snapshot.snapshotId, status: snapshot.status });
        } catch (error) {
          console.error(`Error creating snapshot for user ${userId}:`, error);
          run.user(userId).snapshot = 'failed';
          errors.push({ userId, error: shortError(error) });
        }
      }
      return {
        failed: errors.length > 0,
        counts: { snapshots: results.length, failed: errors.length },
      };
    });

    await run.phase('ecb-rates', async () => {
      await refreshEcbRatesIfStale();
    });

    // The Monte Carlo market's ECB anchors (Q3): €STR, AAA 10y, SPF.
    await run.phase('market-anchors', async () => {
      await refreshMarketAnchorsIfStale();
    });

    // The assistant's structured goals, re-evaluated every day after the snapshot of the month: what
    // makes a goal reached "by itself" — the market moved, not the user — surface without anyone opening it.
    await run.phase('goals', async () => {
      for (const userId of userIds) {
        if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
          goalSummary.skipped++;
          continue;
        }
        try {
          const result = await evaluateActiveGoals(userId);
          if (result.skippedReason) {
            goalSummary.skipped++;
          } else {
            goalSummary.evaluated += result.evaluatedGoals;
            goalSummary.suggestions += result.suggestionsCreated;
          }
        } catch (goalError) {
          console.error(`Goal re-evaluation failed for user ${userId}:`, goalError);
          goalSummary.errors++;
        }
      }
      return { failed: goalSummary.errors > 0, counts: { ...goalSummary } };
    });

    // The Budget tab compares a closed month with the ceiling it had, not today's.
    await run.phase('budget-history', async () => {
      budgetHistorySummary = await captureBudgetHistory(run.startedAt, process.env.NEXT_PUBLIC_DEMO_USER_ID);
      return { failed: budgetHistorySummary.errors > 0, counts: { ...budgetHistorySummary } };
    });

    await run.phase('prune-runs', async () => ({ counts: { deleted: await pruneCronRuns(run.startedAt) } }));
  } catch (error) {
    console.error('Error in snapshot cron job:', error);
    run.fail();
  }

  await run.save();
  return run.respond({
    message: 'Snapshot job completed',
    snapshotsCreated: results.length,
    errors: errors.length,
    results,
    errorDetails: errors,
    goalEvaluationSummary: goalSummary,
    budgetHistorySummary,
  });
}
