/**
 * Dated flows of the FIRE plan — ONE model for the events (a child, a mortgage ending, an inheritance) and
 * for the income after FIRE (doc/fire-ipotesi/README.md § 12, rules RF1–RF5).
 *
 * Notation: year `t` = years from today (the running calendar year is `t = 0`, as in `calculateFIREProjection`),
 * π the scenario's inflation, `σ = +1` for an expense and `−1` for an income. Every flow lands at the END of its
 * year, like the saving and the withdrawal. Pure: `resolveDatedFlows` turns what the user saved into windows and
 * reasons for exclusion; `buildFlowSchedule` reads them per scenario; `flowsRequirementAdjustment` is RF5.
 */
import type { DatedFlow, DatedFlowKind } from '@/types/assets';
import type { MortgageFlowSchedule } from './mortgageSummary';

/** What the resolution needs about the user's mortgages, by property id (Patrimonio's «Mutuo» tile, D-F5). */
export interface MortgageFlowSource {
  propertyName: string;
  schedule: MortgageFlowSchedule;
}

export interface ResolveDatedFlowsContext {
  /** The Italian calendar year of today. */
  currentYear: number;
  /** The user's age; without it an age-anchored flow is excluded and said so, like the pensions. */
  userAge?: number;
  mortgages?: ReadonlyMap<string, MortgageFlowSource>;
}

export interface ResolvedFlow {
  id: string;
  label: string;
  kind: DatedFlowKind;
  /** `+1` an expense, `−1` an income, `0` a lump (its direction is in `kind`). */
  sigma: 1 | -1 | 0;
  indexed: boolean;
  /** Yearly amount for a recurring flow (today's euro if indexed, nominal if fixed); the amount for a lump. */
  amount: number;
  /** A mortgage-linked flow: the fixed nominal amount of each year offset (no other year is active). */
  yearly?: ReadonlyMap<number, number>;
  /** `fixed` = `start` is the year offset `s₀`; `fire` = `start` is `afterYears` and the window opens the year after the FIRE year. */
  anchor: 'fixed' | 'fire';
  start: number;
  /** Recurring only; null = forever. */
  durationYears: number | null;
  /** Already inside today's saving (and, from the Cashflow, the plan's expenses). */
  inCashflowToday: boolean;
  source?: DatedFlow['source'];
  /**
   * What a recurring flow touches: absent = both the saving (RF3) and the need (RF4), as every saved flow does. The What
   * If's «Quando» (RF11) overlays a cashflow change as two independent flows — a yearly saving delta (`saving`) and a
   * yearly expense delta (`need`) — so that neither moves the other figure a second time.
   */
  scope?: 'saving' | 'need';
}

export interface ExcludedFlow {
  id: string;
  label: string;
  reason: string;
}

export interface ResolvedDatedFlows {
  resolved: ResolvedFlow[];
  excluded: ExcludedFlow[];
}

const isLump = (kind: DatedFlowKind): boolean => kind === 'lumpIn' || kind === 'lumpOut';

/** RF1: windows and reasons for exclusion. A flow in the past stays resolved: it simply never counts. */
export function resolveDatedFlows(flows: readonly DatedFlow[] | undefined, context: ResolveDatedFlowsContext): ResolvedDatedFlows {
  const resolved: ResolvedFlow[] = [];
  const excluded: ExcludedFlow[] = [];
  for (const flow of flows ?? []) {
    const base = { id: flow.id, label: flow.label, source: flow.source };
    if (flow.source?.kind === 'mortgage') {
      const source = context.mortgages?.get(flow.source.propertyId);
      const schedule = source?.schedule;
      if (!schedule || schedule.kind === 'none') {
        excluded.push({ ...base, reason: `nessuna rata collegata al mutuo di ${source?.propertyName ?? flow.label}: collegala in Cashflow o scrivi il flusso a mano` });
        continue;
      }
      if (schedule.kind === 'never') {
        excluded.push({ ...base, reason: 'la rata non copre gli interessi: il mutuo non finisce' });
        continue;
      }
      const yearly = new Map<number, number>();
      for (const [year, amount] of schedule.byYear) yearly.set(year - context.currentYear, amount);
      const offsets = [...yearly.keys()];
      const first = Math.min(...offsets);
      resolved.push({
        ...base,
        kind: 'expense',
        sigma: 1,
        indexed: false,
        amount: schedule.instalment * 12,
        yearly,
        anchor: 'fixed',
        start: first,
        durationYears: Math.max(...offsets) - first + 1,
        inCashflowToday: true,
      });
      continue;
    }
    if (flow.source?.kind === 'goal') continue;
    const lump = isLump(flow.kind);
    let start: number;
    if (flow.start.anchor === 'year') {
      start = flow.start.year - context.currentYear;
    } else if (flow.start.anchor === 'age') {
      if (context.userAge === undefined || !Number.isFinite(context.userAge)) {
        excluded.push({ ...base, reason: 'manca l\'età' });
        continue;
      }
      start = flow.start.age - context.userAge;
    } else {
      if (lump) {
        excluded.push({ ...base, reason: 'una voce una tantum non può partire dal FIRE' });
        continue;
      }
      start = flow.start.afterYears;
    }
    if (!Number.isFinite(flow.amount) || flow.amount === 0) {
      excluded.push({ ...base, reason: 'importo non valido' });
      continue;
    }
    const activeToday = flow.start.anchor !== 'fire' && !lump && start <= 0;
    resolved.push({
      ...base,
      kind: flow.kind,
      sigma: lump ? 0 : flow.kind === 'expense' ? 1 : -1,
      indexed: flow.indexed,
      amount: flow.amount,
      anchor: flow.start.anchor === 'fire' ? 'fire' : 'fixed',
      start,
      durationYears: lump ? null : flow.durationYears,
      inCashflowToday: activeToday && flow.inCashflowToday !== false,
    });
  }
  return { resolved, excluded };
}

/** The year offsets `[first, last]` a flow is active in, with `retirementYear` (T) for a FIRE anchor; `last` null = forever. Null = never exists. */
function windowOf(flow: ResolvedFlow, retirementYear: number | null): { first: number; last: number | null } | null {
  let first: number;
  if (flow.anchor === 'fire') {
    if (retirementYear === null) return null;
    first = retirementYear + 1 + flow.start;
  } else {
    first = flow.start;
  }
  if (isLump(flow.kind)) return { first, last: first };
  if (flow.yearly) return { first, last: first + (flow.durationYears ?? 1) - 1 };
  return { first, last: flow.durationYears === null ? null : first + flow.durationYears - 1 };
}

function isActive(flow: ResolvedFlow, year: number, retirementYear: number | null): boolean {
  if (flow.yearly) return flow.yearly.has(year);
  const window = windowOf(flow, retirementYear);
  return window !== null && year >= window.first && (window.last === null || year <= window.last);
}

export interface FlowScheduleOptions {
  /** The scenario's inflation, percent. */
  inflationRate: number;
  /** True when the plan's expenses are read off the Cashflow (RP6): an «already in the Cashflow» expense is then inside them (D-F6). */
  planExpensesFromCashflow: boolean;
}

/** The per-scenario reading of the flows: RF3 on the saving, RF4 on the need, the lumps, and the horizon RF5 sums to. */
export interface FlowSchedule {
  readonly flows: readonly ResolvedFlow[];
  readonly inflationRate: number;
  /** RF3: the change of the year-`t` saving (t ≥ 1), recurring flows anchored to a year or an age. */
  savingsDelta(t: number): number;
  /** The net lump of year `s` (inflows +, outflows −), nominal. */
  lump(s: number): number;
  /** The lumps of year `s` apart (both ≥ 0, nominal): RF8's ledger takes the inflows in after the return and the outflows out with the withdrawal. */
  lumpParts(s: number): { inflow: number; outflow: number };
  /** RF4: the change of the need in year `s > T`, nominal, retiring at the end of year `T`. */
  needDelta(s: number, retirementYear: number): number;
  /** Years after `T` of the last start or end of any flow (0 when none is ahead). */
  horizon(retirementYear: number): number;
}

/** RF2: the nominal amount of a recurring flow in year `s`; `ctx` says whether it modifies the spending (`s`) or the saving (`s − 1`). */
function nominalAmount(flow: ResolvedFlow, s: number, inflation: number, ctx: 'need' | 'saving'): number {
  if (flow.yearly) return flow.yearly.get(s) ?? 0;
  if (!flow.indexed) return flow.amount;
  return flow.amount * Math.pow(1 + inflation, ctx === 'need' ? s : s - 1);
}

export function buildFlowSchedule(resolved: readonly ResolvedFlow[], options: FlowScheduleOptions): FlowSchedule {
  const pi = options.inflationRate / 100;
  const recurring = resolved.filter((flow) => !isLump(flow.kind));
  const lumps = resolved.filter((flow) => isLump(flow.kind));
  return {
    flows: resolved,
    inflationRate: options.inflationRate,
    savingsDelta(t) {
      let delta = 0;
      for (const flow of recurring) {
        if (flow.anchor === 'fire' || flow.scope === 'need') continue;
        const active = isActive(flow, t, null) ? nominalAmount(flow, t, pi, 'saving') : 0;
        const inside = flow.inCashflowToday ? flow.amount * Math.pow(1 + pi, t - 1) : 0;
        delta += -flow.sigma * (active - inside);
      }
      return delta;
    },
    lump(s) {
      let total = 0;
      for (const flow of lumps) {
        if (!isActive(flow, s, null)) continue;
        total += (flow.kind === 'lumpIn' ? 1 : -1) * nominalAmount(flow, s, pi, 'need');
      }
      return total;
    },
    lumpParts(s) {
      let inflow = 0;
      let outflow = 0;
      for (const flow of lumps) {
        if (!isActive(flow, s, null)) continue;
        if (flow.kind === 'lumpIn') inflow += nominalAmount(flow, s, pi, 'need');
        else outflow += nominalAmount(flow, s, pi, 'need');
      }
      return { inflow, outflow };
    },
    needDelta(s, retirementYear) {
      let need = 0;
      for (const flow of recurring) {
        if (flow.scope === 'saving') continue;
        const active = isActive(flow, s, retirementYear) ? nominalAmount(flow, s, pi, 'need') : 0;
        const inside = flow.inCashflowToday && flow.sigma === 1 && options.planExpensesFromCashflow ? flow.amount * Math.pow(1 + pi, s) : 0;
        need += flow.sigma * (active - inside);
      }
      return need;
    },
    horizon(retirementYear) {
      let last = retirementYear;
      for (const flow of resolved) {
        if (flow.yearly) {
          for (const year of flow.yearly.keys()) last = Math.max(last, year);
          continue;
        }
        const window = windowOf(flow, retirementYear);
        if (window === null) continue;
        last = Math.max(last, window.first, window.last ?? window.first);
      }
      return last - retirementYear;
    },
  };
}

export interface FlowsRequirementInput {
  schedule: FlowSchedule;
  /** `T`: the year offset the requirement is read at (the retirement day, end of year). */
  retirementYear: number;
  /** The yearly expenses of that year, in the unit the requirement is expressed in. */
  expensesAtRetirement: number;
  /** Percent. */
  realReturnRate: number;
  /** Percent, > 0. */
  withdrawalRate: number;
  /** The gross-up the portfolio-funded need carries (1 without tax). */
  taxMultiplier: number;
  /** The net state pensions active `j` years after `T`, in the same unit as `expensesAtRetirement`. */
  pensionNetAt: (yearsAfter: number) => number;
  /** Years after `T` by which every pension has started. */
  pensionHorizon: number;
  /** Multiplies the amounts the flows give (nominal euro of year `T`): `1` in the euro of year `T`, `(1+π)^−T` for today's euro (Coast). */
  scale?: number;
}

/**
 * RF5: what the flows add to (or take off) the requirement `R_T` the base rule resolved — never extend the base's
 * backward walk, which would LOWER the requirement when the real return beats the SWR (D-F7).
 *
 *   n'_j = n_{T+j} / (1+π)^j          δ_j = max(0, E_T − P_j + n'_j) − max(0, E_T − P_j)
 *   adj  = m·Σ_{j=1..J} δ_j/(1+r)^j + m·δ_{J+1}/SWR/(1+r)^J − Σ_{k=1..J} c_k·L'_k/(1+r)^k
 *
 * The temporary parts are financed at the real return, the permanent part (equal for every year after J) at the
 * SWR; the surplus of a year in which the income beats the need is not reinvested (D-F8).
 */
export function flowsRequirementAdjustment(input: FlowsRequirementInput): number {
  const { schedule, retirementYear: T } = input;
  if (schedule.flows.length === 0) return 0;
  const swr = input.withdrawalRate / 100;
  const r = input.realReturnRate / 100;
  if (!(swr > 0) || !(1 + r > 0)) return 0;
  const pi = schedule.inflationRate / 100;
  const scale = input.scale ?? 1;
  const m = input.taxMultiplier;
  const J = Math.max(schedule.horizon(T), input.pensionHorizon);
  const delta = (j: number): number => {
    const needAfter = (schedule.needDelta(T + j, T) / Math.pow(1 + pi, j)) * scale;
    const covered = input.expensesAtRetirement - input.pensionNetAt(j);
    return Math.max(0, covered + needAfter) - Math.max(0, covered);
  };
  let adjustment = 0;
  for (let j = 1; j <= J; j++) {
    adjustment += (m * delta(j)) / Math.pow(1 + r, j);
    const lump = (schedule.lump(T + j) / Math.pow(1 + pi, j)) * scale;
    if (lump !== 0) adjustment -= ((lump > 0 ? 1 : m) * lump) / Math.pow(1 + r, j);
  }
  adjustment += (m * delta(J + 1)) / swr / Math.pow(1 + r, J);
  return adjustment;
}

/** A sign on the years axis for each lump from next year on (the running year's lump is the starting capital). */
export function lumpMarkersOf(resolved: readonly ResolvedFlow[], currentYear: number): Array<{ calendarYear: number; label: string; direction: 'in' | 'out' }> {
  return resolved
    .filter((flow) => isLump(flow.kind) && flow.anchor === 'fixed' && flow.start >= 1)
    .map((flow) => ({ calendarYear: currentYear + flow.start, label: flow.label, direction: flow.kind === 'lumpIn' ? ('in' as const) : ('out' as const) }));
}

/**
 * What the stochastic engines read of the flows (RF7, RF8, RF10): the resolved list and where the plan's expenses come
 * from (D-F6). Each engine builds the schedule from ITS scenario's inflation, so one list serves the three scenarios.
 */
export interface DatedFlowsInput {
  resolved: readonly ResolvedFlow[];
  planExpensesFromCashflow: boolean;
}

/** The per-year tables of a schedule, computed once per run: a stochastic run reads them thousands of times (index = year `s`, 0…`years`). */
export interface FlowYearTables {
  /** RF3: the change of the year-`s` saving (index 0 unused: 0). */
  savingsDelta: Float64Array;
  /** The net lump of year `s` — exactly `schedule.lump(s)`, so a path sums the same floats the deterministic walk does. */
  lumpNet: Float64Array;
  lumpInflow: Float64Array;
  lumpOutflow: Float64Array;
  /** RF4: the change of the need in year `s > T` when retiring at the end of year `T`; memoised per `T`. */
  needFor(retirementYear: number): Float64Array;
}

export function buildFlowYearTables(schedule: FlowSchedule, years: number): FlowYearTables {
  const savingsDelta = new Float64Array(years + 1);
  const lumpNet = new Float64Array(years + 1);
  const lumpInflow = new Float64Array(years + 1);
  const lumpOutflow = new Float64Array(years + 1);
  for (let year = 0; year <= years; year++) {
    if (year >= 1) savingsDelta[year] = schedule.savingsDelta(year);
    lumpNet[year] = schedule.lump(year);
    const parts = schedule.lumpParts(year);
    lumpInflow[year] = parts.inflow;
    lumpOutflow[year] = parts.outflow;
  }
  const needs = new Map<number, Float64Array>();
  return {
    savingsDelta,
    lumpNet,
    lumpInflow,
    lumpOutflow,
    needFor(retirementYear) {
      let need = needs.get(retirementYear);
      if (!need) {
        need = new Float64Array(years + 1);
        for (let year = retirementYear + 1; year <= years; year++) need[year] = schedule.needDelta(year, retirementYear);
        needs.set(retirementYear, need);
      }
      return need;
    },
  };
}

/** A string that is equal for two lists exactly when they read the same (the mortgage's `Map` does not survive `JSON.stringify`): the stale-run check of the tabs. */
export function datedFlowsSignature(flows: DatedFlowsInput | undefined): string {
  if (!flows || flows.resolved.length === 0) return '';
  return JSON.stringify([flows.planExpensesFromCashflow, flows.resolved.map((flow) => ({ ...flow, yearly: flow.yearly ? [...flow.yearly.entries()] : undefined }))]);
}
