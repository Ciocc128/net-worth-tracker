import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { CRON_RUNS_COLLECTION } from '@/lib/server/cronRun';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

/** The latest run of each job in the last 8 days (doc/cron-serale § 5.7). */
const LOOKBACK_DAYS = 8;

/**
 * GET /api/user/cron-status?ownerId=…
 *
 * What the evening crons did for the caller's account (D-CS3): per job, the latest run in the last 8
 * days — its outcome and time, the phase names that failed, and ONLY `users[ownerId]` (the snapshot
 * state and the deliveries). No other account's uid appears. A delegated member reads the owner's.
 * The line in Impostazioni that will show it comes after RU9 (§ 9 P3).
 *
 * Auth: a token of an admitted user; `ownerId` defaults to the caller's own account.
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const ownerId = request.nextUrl.searchParams.get('ownerId') || decodedToken.uid;
    await assertCanAccessAccount(decodedToken, ownerId);

    const since = getItalyDateIso(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000));
    const runs = await adminDb.collection(CRON_RUNS_COLLECTION).where('date', '>=', since).get();

    type Latest = { date: string; data: Record<string, unknown> };
    const latest: Record<string, Latest> = {};
    for (const doc of runs.docs) {
      const data = doc.data();
      const job = String(data.job);
      const date = String(data.date);
      if (!latest[job] || latest[job].date < date) latest[job] = { date, data };
    }

    const jobs = Object.entries(latest).map(([job, { date, data }]) => {
      const phases = (data.phases as Array<{ name: string; status: string }> | undefined) ?? [];
      const users = (data.users as Record<string, unknown> | undefined) ?? {};
      return {
        job,
        date,
        outcome: data.outcome,
        finishedAt: (data.finishedAt as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null,
        failedPhases: phases.filter((phase) => phase.status === 'failed').map((phase) => phase.name),
        account: users[ownerId] ?? null,
      };
    });

    return NextResponse.json({ ownerId, jobs });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error reading the cron status:', error);
    return NextResponse.json({ error: 'Failed to read the cron status' }, { status: 500 });
  }
}
