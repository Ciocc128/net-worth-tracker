import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

/**
 * The run record of a cron job (C2, doc/cron-serale § 5.5, D-CS2).
 *
 * `cron-runs/{YYYY-MM-DD}_{job}` (Italian date), Admin only. A second invocation the same day
 * overwrites it and counts in `invocations`. The HTTP status follows the outcome: 200 for `ok`,
 * 500 for `partial` and `failed`, so Vercel paints the run red — the 31/10/2026 run was green.
 */
export const CRON_RUNS_COLLECTION = 'cron-runs';
export const CRON_RUN_RETENTION_DAYS = 90;

export type CronJob = 'dividends' | 'snapshot' | 'recap';
export type CronOutcome = 'ok' | 'partial' | 'failed';
export type PhaseStatus = 'ok' | 'failed' | 'skipped';

export interface CronPhaseRecord {
  name: string;
  status: PhaseStatus;
  durationMs: number;
  counts?: Record<string, number>;
  error?: string;
}

export interface CronUserRecord {
  snapshot?: 'created' | 'updated' | 'no-assets' | 'failed';
  deliveries?: Record<string, { outcome: string; reason?: string }>;
}

/** What a phase returns: counts to keep, and whether something inside it failed without throwing. */
export interface PhaseReport {
  counts?: Record<string, number>;
  failed?: boolean;
  skipped?: boolean;
  error?: string;
}

/** A short code or the first 200 characters of the message: never a stack, an address or a figure. */
export function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 200);
}

export class CronRunRecorder {
  readonly startedAt: Date;
  readonly phases: CronPhaseRecord[] = [];
  readonly users: Record<string, CronUserRecord> = {};
  private failedWhole = false;

  constructor(
    readonly job: CronJob,
    now: Date = new Date()
  ) {
    this.startedAt = now;
  }

  get date(): string {
    return getItalyDateIso(this.startedAt);
  }

  get id(): string {
    return `${this.date}_${this.job}`;
  }

  /** Runs one phase: a throw is recorded and swallowed, so the others still run (UC7). */
  async phase(name: string, run: () => Promise<PhaseReport | void>): Promise<void> {
    const started = Date.now();
    try {
      const report = (await run()) ?? {};
      this.phases.push({
        name,
        status: report.skipped ? 'skipped' : report.failed ? 'failed' : 'ok',
        durationMs: Date.now() - started,
        ...(report.counts ? { counts: report.counts } : {}),
        ...(report.error ? { error: shortError(report.error) } : {}),
      });
    } catch (error) {
      console.error(`[cron:${this.job}] phase ${name} failed:`, error);
      this.phases.push({ name, status: 'failed', durationMs: Date.now() - started, error: shortError(error) });
    }
  }

  user(uid: string): CronUserRecord {
    return (this.users[uid] ??= {});
  }

  /** The whole job threw outside any phase. */
  fail(): void {
    this.failedWhole = true;
  }

  get outcome(): CronOutcome {
    if (this.failedWhole) return 'failed';
    const userFailed = Object.values(this.users).some(
      (user) =>
        user.snapshot === 'failed' ||
        Object.values(user.deliveries ?? {}).some((delivery) => delivery.outcome === 'failed')
    );
    return this.phases.some((phase) => phase.status === 'failed') || userFailed ? 'partial' : 'ok';
  }

  get httpStatus(): number {
    return this.outcome === 'ok' ? 200 : 500;
  }

  /** Writes the record (overwriting the day's earlier one). A failure here never changes the status. */
  async save(finishedAt: Date = new Date()): Promise<void> {
    try {
      const ref = adminDb.collection(CRON_RUNS_COLLECTION).doc(this.id);
      const previous = await ref.get();
      const invocations = ((previous.data()?.invocations as number | undefined) ?? 0) + 1;
      await ref.set({
        job: this.job,
        date: this.date,
        startedAt: Timestamp.fromDate(this.startedAt),
        finishedAt: Timestamp.fromDate(finishedAt),
        durationMs: finishedAt.getTime() - this.startedAt.getTime(),
        invocations,
        outcome: this.outcome,
        phases: this.phases,
        users: this.users,
      });
    } catch (error) {
      console.error(`[cron:${this.job}] could not write the run record:`, error);
    }
  }

  /** The response: today's summary fields plus `outcome` and `runId`, the status following the outcome. */
  respond(summary: Record<string, unknown>): NextResponse {
    return NextResponse.json(
      {
        success: this.outcome === 'ok',
        outcome: this.outcome,
        runId: this.id,
        timestamp: new Date().toISOString(),
        phases: this.phases,
        ...summary,
      },
      { status: this.httpStatus }
    );
  }
}

/** Deletes records older than the retention (one query, limit 50). Never fatal. */
export async function pruneCronRuns(now: Date = new Date()): Promise<number> {
  try {
    const cutoff = getItalyDateIso(new Date(now.getTime() - CRON_RUN_RETENTION_DAYS * 86_400_000));
    const old = await adminDb.collection(CRON_RUNS_COLLECTION).where('date', '<', cutoff).limit(50).get();
    await Promise.all(old.docs.map((doc) => doc.ref.delete()));
    return old.docs.length;
  } catch (error) {
    console.error('[cron] could not prune old run records:', error);
    return 0;
  }
}
