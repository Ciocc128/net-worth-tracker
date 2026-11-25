import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getSettingsAdmin } from '@/lib/server/monthlyEmailService';
import { deliverPeriodEmail } from '@/lib/server/periodEmailDelivery';
import { claimDelivery, readDeliveryStates, settleDelivery } from '@/lib/server/deliveryRecord';
import { CronRunRecorder, shortError } from '@/lib/server/cronRun';
import { filterAllowedRecipients } from '@/lib/server/emailTransport';
import { verifyCronSecret } from '@/lib/server/apiAuth';
import { createVaultClient, readVaultConfig } from '@/lib/server/wiki/githubVault';
import { retryPendingTheBull } from '@/lib/server/wiki/thebullCompiler';
import { exportToVault } from '@/lib/server/wiki/vaultExport';
import { duePeriods, type RecapPeriod, type RecapPeriodKind } from '@/lib/utils/periodRecapDue';
import { ALLOWED_USERS_COLLECTION } from '@/types/account';
import type { AssetAllocationSettings } from '@/types/assets';

// The Hobby plan's ceiling with Fluid compute: the period emails' AI comments run inside it (F6b).
export const maxDuration = 300;

const EMAIL_TOGGLES: Record<Exclude<RecapPeriodKind, 'vault'>, keyof AssetAllocationSettings> = {
  monthly: 'monthlyEmailEnabled',
  quarterly: 'quarterlyEmailEnabled',
  semiannual: 'semiAnnualEmailEnabled',
  yearly: 'yearlyEmailEnabled',
  'budget-week': 'weeklyBudgetEmailEnabled',
};

/**
 * GET /api/cron/period-recap
 *
 * The recap: the period emails, the weekly budget email, TheBull's retries and the vault export.
 * Scheduled: every day at 19:00 UTC (20:00/21:00 Italian) via Vercel Cron — the THIRD of three crons in
 * three hours (doc/cron-serale § 5.1, D-CS1), so the day's dividends and the evening's photo are done.
 *
 * What is due (§ 5.3, D-SN12, D-CS6): a CLOSED period — the month that closed yesterday, on the 1st —
 * is built by this run on its final cashflow; a period whose delivery record is not `sent` is taken by
 * any run up to 7 days after its end (Vercel does not retry a missed run). The weekly budget email
 * keeps its Sunday evening. Each email goes through its delivery record (claim → transport check →
 * build → send), so a duplicated run sends nothing twice and a failed send keeps the paid AI comment.
 *
 * Phases (recorded in `cron-runs`): period-emails · weekly-budget · thebull-retries · vault-export.
 * A failed phase or delivery makes the run `partial` and the response HTTP 500 (D-CS2).
 *
 * Security: requires CRON_SECRET via Authorization header.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!verifyCronSecret(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const run = new CronRunRecorder('recap');
  const now = run.startedAt;
  const userIds: string[] = [];
  const settingsByUser = new Map<string, AssetAllocationSettings | null>();
  const duePerUser = new Map<string, RecapPeriod[]>();
  let wikiRetrySummary: { retried: number; compiled: number } | null = null;
  let vaultExportSummary: { written: string[]; skipped: string[] } | null = null;

  try {
    await run.phase('users', async () => {
      const usersSnapshot = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
      userIds.push(...usersSnapshot.docs.map((doc) => doc.id));

      const exportUid = process.env.WIKI_EXPORT_UID;
      for (const userId of userIds) {
        // The demo's data is synthetic: no email, no vault.
        if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) continue;
        const candidates = duePeriods(now);
        const states = await readDeliveryStates(userId, candidates.map((period) => period.key));
        const due = duePeriods(now, states).filter((period) => period.kind !== 'vault' || userId === exportUid);
        if (due.length === 0) continue;
        duePerUser.set(userId, due);
        settingsByUser.set(userId, await getSettingsAdmin(userId));
      }
      return { counts: { users: userIds.length, withDuePeriods: duePerUser.size } };
    });

    const deliver = async (kinds: RecapPeriodKind[]) => {
      const counts = { sent: 0, skipped: 0, failed: 0, alreadySent: 0, off: 0 };
      for (const [userId, due] of duePerUser) {
        const settings = settingsByUser.get(userId);
        for (const period of due.filter((p) => kinds.includes(p.kind))) {
          const toggle = EMAIL_TOGGLES[period.kind as keyof typeof EMAIL_TOGGLES];
          // D-CS9: only the allowed addresses; none left counts as «off»: no record, no AI comment, a green run.
          const recipients = filterAllowedRecipients(settings?.monthlyEmailRecipients ?? []);
          if (!settings?.[toggle] || recipients.length === 0) {
            counts.off++;
            continue;
          }
          const result = await deliverPeriodEmail({ userId, recipients, period, source: 'cron', now });
          run.user(userId).deliveries = {
            ...run.user(userId).deliveries,
            [period.key]: { outcome: result.outcome, ...('reason' in result ? { reason: result.reason } : {}) },
          };
          if (result.outcome === 'sent') counts.sent++;
          else if (result.outcome === 'failed') counts.failed++;
          else if (result.outcome === 'skipped') counts.skipped++;
          else counts.alreadySent++;
        }
      }
      return { counts, failed: counts.failed > 0 };
    };

    // The four period emails SIDE BY SIDE (F6b): each waits on its AI comment (a reasoning model, up to
    // EMAIL_AI_TIMEOUT_MS) and on 1 January all four are due — in a row they could outlast the 300 s.
    await run.phase('period-emails', async () => {
      const reports = await Promise.all(
        (['monthly', 'quarterly', 'semiannual', 'yearly'] as const).map((kind) => deliver([kind]))
      );
      const counts = { sent: 0, skipped: 0, failed: 0, alreadySent: 0, off: 0 };
      for (const report of reports) {
        for (const key of Object.keys(counts) as Array<keyof typeof counts>) counts[key] += report.counts[key];
      }
      return { counts, failed: reports.some((report) => report.failed) };
    });

    await run.phase('weekly-budget', () => deliver(['budget-week']));

    // TheBull weeks whose compilation is still owed (up to three tries; doc/ai-open-models-wiki.md § 5.2).
    const vaultConfig = readVaultConfig();
    await run.phase('thebull-retries', async () => {
      if (!vaultConfig) return { skipped: true };
      wikiRetrySummary = await retryPendingTheBull({ vault: createVaultClient(vaultConfig) });
      return { counts: { ...wikiRetrySummary } };
    });

    // The closed month's numbers to the vault's dati/ (doc/ai-open-models-wiki.md § 6.1), one owner,
    // WIKI_EXPORT_UID, through the same delivery record: a duplicate run commits once, a missed 1st is caught up.
    await run.phase('vault-export', async () => {
      const exportUid = process.env.WIKI_EXPORT_UID;
      const periods = (exportUid ? duePerUser.get(exportUid) ?? [] : []).filter((p) => p.kind === 'vault');
      if (!vaultConfig || !exportUid || periods.length === 0) return { skipped: true };

      let failed = false;
      const written: string[] = [];
      const skipped: string[] = [];
      for (const period of periods) {
        const claim = await claimDelivery(exportUid, period.key, { source: 'cron', now });
        if (!claim.claimed) continue;
        try {
          const result = await exportToVault(exportUid, [{ year: period.year, month: period.month }], {
            vault: createVaultClient(vaultConfig),
          });
          written.push(...result.written);
          skipped.push(...result.skipped);
          await settleDelivery(exportUid, period.key, 'sent', { now });
          run.user(exportUid).deliveries = { ...run.user(exportUid).deliveries, [period.key]: { outcome: 'sent' } };
        } catch (error) {
          failed = true;
          console.error(`[cron] vault export of ${period.key} failed:`, error);
          await settleDelivery(exportUid, period.key, 'failed', { reason: 'export-failed', now });
          run.user(exportUid).deliveries = {
            ...run.user(exportUid).deliveries,
            [period.key]: { outcome: 'failed', reason: 'export-failed' },
          };
        }
      }
      vaultExportSummary = { written, skipped };
      return { failed, counts: { written: written.length, skipped: skipped.length } };
    });
  } catch (error) {
    console.error('Error in period recap cron job:', shortError(error));
    run.fail();
  }

  await run.save();
  return run.respond({
    message: 'Period recap job completed',
    usersWithDuePeriods: duePerUser.size,
    users: run.users,
    wikiRetrySummary,
    vaultExportSummary,
  });
}
