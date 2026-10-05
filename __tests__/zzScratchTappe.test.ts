import { it, vi } from 'vitest';
import type { DatedFlow } from '@/types/assets';
import { resolveDatedFlows, buildFlowSchedule, flowsRequirementAdjustment } from '@/lib/utils/datedFlows';
import { calculateCoastFIREMetrics, calculateCoastFIREProjection } from '@/lib/services/fireService';
import { realReturn } from '@/lib/utils/realReturn';
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
const YEAR = 2026, G = 7, PI = 2, r = realReturn(G, PI) / 100;
const S = { growthRate: G, inflationRate: PI };
const pension = [{ id: 'inps', label: 'Pensione INPS', grossMonthlyAmount: 1500, monthsPerYear: 13, startDate: '2058-01-01' }];
const INH: DatedFlow = { id: 'inh', label: 'Eredità', kind: 'lumpIn', amount: 100_000, indexed: false, start: { anchor: 'year', year: 2036 }, durationYears: null };
const RENT: DatedFlow = { id: 'rent', label: 'Affitto', kind: 'income', amount: 6_000, indexed: true, start: { anchor: 'fire', afterYears: 0 }, durationYears: null };
function run(name: string, cap: number, flows?: DatedFlow[], inflows?: {yearsFromNow:number;amountToday:number}[]) {
  const fi = flows ? { resolved: resolveDatedFlows(flows, { currentYear: YEAR }).resolved, planExpensesFromCashflow: true } : undefined;
  const m = calculateCoastFIREMetrics(cap, 30_000, 4, 35, 50, r * 100, PI, pension, undefined, new Date(YEAR, 0, 1), inflows, undefined, fi);
  const B = 17, T = 15;
  let SB = m.steadyStatePortfolioNeed;
  if (fi) {
    const schedule = buildFlowSchedule(fi.resolved, { inflationRate: PI, planExpensesFromCashflow: true });
    SB += flowsRequirementAdjustment({ schedule, retirementYear: T + B, expensesAtRetirement: 30_000, realReturnRate: r * 100, withdrawalRate: 4, taxMultiplier: 1, pensionNetAt: () => m.totalNetAnnualPensionAtSteadyState, pensionHorizon: 0, scale: Math.pow(1 + PI / 100, -(T + B)) });
  }
  const M = cap - m.coastFireNumberToday;
  // forward simulation (no flows): from Y at target, need 30000 for B years, inflows at yearsFromRetirement
  let Cf = cap * (1 + r) ** T;
  for (let t = 0; t < B; t++) { const inf = (inflows ?? []).filter(i => Math.round(i.yearsFromNow - T) === t).reduce((s, i) => s + i.amountToday * (1+r)**0, 0); Cf = (Cf + inf) * (1 + r) - 30_000; }
  console.log(name, JSON.stringify({ C: m.coastFireNumberToday.toFixed(2), M: M.toFixed(2), RT: m.retirementCapitalRequired.toFixed(2), YT: (m.retirementCapitalRequired + M * (1 + r) ** T).toFixed(2), MT: (M*(1+r)**T).toFixed(2), steady: m.steadyStatePortfolioNeed.toFixed(2), SB: SB.toFixed(2), ZB: (SB + M * (1 + r) ** (T + B)).toFixed(2), MB: (M*(1+r)**(T+B)).toFixed(2), forwardZ_noflow: Cf.toFixed(2), pens: m.totalNetAnnualPensionAtSteadyState.toFixed(2) }));
}
it('tappe', () => {
  run('base 200k', 200_000);
  run('base 300k', 300_000);
  run('eredita 200k', 200_000, [INH]);
  run('affitto 200k', 200_000, [RENT]);
});
