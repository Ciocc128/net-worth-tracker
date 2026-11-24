import { getItalyDateIso } from '@/lib/utils/dateHelpers';

/**
 * Which periods a recap run owes (doc/cron-serale § 5.3, D-SN12, D-CS6). Pure: the Italian day of
 * the run, the closed periods around it, and what the delivery records already say.
 */

export const RECAP_CATCHUP_DAYS = 7;

export type RecapPeriodKind = 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'budget-week' | 'vault';

export interface RecapPeriod {
  kind: RecapPeriodKind;
  /** The record's key part: `monthly-2026-10`, `quarterly-2026-Q4`, `semiannual-2026-H2`, `yearly-2026`, `budget-week-2026-11-01`, `vault-2026-10`. */
  key: string;
  year: number;
  /** The period's LAST month (1–12); for `budget-week` the month of the Sunday. */
  month: number;
  /** Italian ISO day of the period's last day (the Sunday itself for `budget-week`). */
  end: string;
}

/** A delivery's state as the due logic needs it. */
export interface DeliveryState {
  status: 'sending' | 'sent' | 'failed' | 'skipped';
  claimedAtMs?: number;
}

export const CLAIM_TTL_MS = 10 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Whole days from ISO day `a` to ISO day `b` (b − a). */
export function isoDayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function monthlyPeriod(year: number, month: number): RecapPeriod {
  return { kind: 'monthly', key: `monthly-${year}-${pad(month)}`, year, month, end: isoOf(year, month, daysInMonth(year, month)) };
}
export function quarterlyPeriod(year: number, quarter: number): RecapPeriod {
  const month = quarter * 3;
  return { kind: 'quarterly', key: `quarterly-${year}-Q${quarter}`, year, month, end: isoOf(year, month, daysInMonth(year, month)) };
}
export function semiannualPeriod(year: number, half: number): RecapPeriod {
  const month = half === 1 ? 6 : 12;
  return { kind: 'semiannual', key: `semiannual-${year}-H${half}`, year, month, end: isoOf(year, month, daysInMonth(year, month)) };
}
export function yearlyPeriod(year: number): RecapPeriod {
  return { kind: 'yearly', key: `yearly-${year}`, year, month: 12, end: isoOf(year, 12, 31) };
}
export function vaultPeriod(year: number, month: number): RecapPeriod {
  return { kind: 'vault', key: `vault-${year}-${pad(month)}`, year, month, end: isoOf(year, month, daysInMonth(year, month)) };
}
export function budgetWeekPeriod(sundayIso: string): RecapPeriod {
  const [year, month] = sundayIso.split('-').map(Number);
  return { kind: 'budget-week', key: `budget-week-${sundayIso}`, year, month, end: sundayIso };
}

/**
 * Candidate periods: every one whose end lies in the catch-up window up to `todayIso`, closed or not.
 * `isDue` then decides on the end date.
 */
function candidates(todayIso: string): RecapPeriod[] {
  const [year, month] = todayIso.split('-').map(Number);
  const out: RecapPeriod[] = [];
  // Months: the last two calendar months cover a 7-day window from any day.
  for (let back = 0; back <= 1; back++) {
    const m = month - back;
    const y = m >= 1 ? year : year - 1;
    const mm = m >= 1 ? m : m + 12;
    out.push(monthlyPeriod(y, mm), vaultPeriod(y, mm));
    if (mm % 3 === 0) out.push(quarterlyPeriod(y, mm / 3));
    if (mm === 6 || mm === 12) out.push(semiannualPeriod(y, mm / 6));
    if (mm === 12) out.push(yearlyPeriod(y));
  }
  return out;
}

/** The Sunday of `todayIso`, when it is one. */
function sundayOf(todayIso: string): string | null {
  return new Date(`${todayIso}T00:00:00Z`).getUTCDay() === 0 ? todayIso : null;
}

/** Whether the delivery state lets a run take the period (rule 4 of § 5.3). */
export function isOpenForDelivery(state: DeliveryState | undefined, nowMs: number): boolean {
  if (!state) return true;
  if (state.status === 'sent' || state.status === 'skipped') return false;
  if (state.status === 'sending' && state.claimedAtMs !== undefined && nowMs - state.claimedAtMs < CLAIM_TTL_MS) return false;
  return true;
}

/**
 * The periods due at the run `now`, in a fixed order (monthly, quarterly, semiannual, yearly,
 * budget-week, vault). `deliveries` is keyed by period key; a period of the budget week is due only
 * on its own Sunday evening. Toggles and recipients are the caller's filter, per user.
 */
export function duePeriods(now: Date, deliveries: Record<string, DeliveryState | undefined> = {}): RecapPeriod[] {
  const todayIso = getItalyDateIso(now);
  const list = candidates(todayIso);
  const sunday = sundayOf(todayIso);
  if (sunday) list.push(budgetWeekPeriod(sunday));

  const order: RecapPeriodKind[] = ['monthly', 'quarterly', 'semiannual', 'yearly', 'budget-week', 'vault'];
  return list
    .filter((period) => {
      const age = isoDayDiff(period.end, todayIso);
      const inWindow = period.kind === 'budget-week' ? age === 0 : age >= 1 && age <= RECAP_CATCHUP_DAYS;
      return inWindow && isOpenForDelivery(deliveries[period.key], now.getTime());
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.end.localeCompare(b.end));
}
