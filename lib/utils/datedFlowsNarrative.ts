/**
 * The words of the dated flows (doc/fire-ipotesi/README.md § 12.7): a row of the list in Parametri, the row of the
 * Base di calcolo, the clause of «Ipotesi usate». Every sentence is generated from the data, never typed (The Narrative
 * Honesty Rule): a flow left out says why.
 */
import type { DatedFlow, DatedFlowKind } from '@/types/assets';
import type { ExcludedFlow } from '@/lib/utils/datedFlows';
import type { MortgageFlowSchedule } from '@/lib/utils/mortgageSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';

export const FLOW_KIND_LABEL: Record<DatedFlowKind, string> = {
  expense: 'Spesa ricorrente',
  income: 'Entrata ricorrente',
  lumpIn: 'Una tantum in entrata',
  lumpOut: 'Una tantum in uscita',
};

const KIND_SHORT: Record<DatedFlowKind, string> = {
  expense: 'spesa',
  income: 'entrata',
  lumpIn: 'entrata una tantum',
  lumpOut: 'uscita una tantum',
};

const eur = (value: number): string => cachedFormatCurrencyEUR(Math.round(value), true);
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

function describeStart(flow: DatedFlow): string {
  const recurring = flow.kind === 'expense' || flow.kind === 'income';
  const { start } = flow;
  if (start.anchor === 'year') return recurring ? `dal ${start.year}` : String(start.year);
  if (start.anchor === 'age') return recurring ? `dai ${start.age} anni` : `a ${start.age} anni`;
  return start.afterYears === 0 ? 'dal FIRE' : `${plural(start.afterYears, 'anno', 'anni')} dopo il FIRE`;
}

/** The mortgage's end as «marzo 2034». */
function describeEnd(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
}

/** «800 €/mese fissi · fino a marzo 2034», or why the mortgage cannot be linked. */
export function describeMortgageOption(schedule: MortgageFlowSchedule): string {
  if (schedule.kind === 'schedule') return `${eur(schedule.instalment)}/mese fissi · fino a ${describeEnd(schedule.endDate)}`;
  return schedule.kind === 'never' ? 'la rata non copre gli interessi: il mutuo non finisce' : 'nessuna rata collegata';
}

/**
 * «Part-time · entrata · 9.600 €/anno · dal FIRE per 10 anni», «Eredità · entrata una tantum · 100.000 € fissi · 2036»,
 * «Mutuo Casa · spesa · 800 €/mese fissi · fino a marzo 2034 · già nel Cashflow». `mortgage` is the linked property's schedule.
 */
export function describeFlowRow(flow: DatedFlow, mortgage?: MortgageFlowSchedule | null): string {
  if (flow.source?.kind === 'mortgage') {
    if (mortgage?.kind === 'schedule') return `${flow.label} · spesa · ${describeMortgageOption(mortgage)} · già nel Cashflow`;
    return `${flow.label} · spesa · mutuo collegato`;
  }
  const recurring = flow.kind === 'expense' || flow.kind === 'income';
  const fixed = flow.indexed ? '' : ' fissi';
  const amount = recurring ? `${eur(flow.amount)}/anno${fixed}` : `${eur(flow.amount)}${fixed}`;
  const duration = recurring ? (flow.durationYears === null ? ' per sempre' : ` per ${plural(flow.durationYears, 'anno', 'anni')}`) : '';
  const inside = recurring && flow.inCashflowToday !== false && flow.start.anchor !== 'fire' ? ' · già nel Cashflow' : '';
  return `${flow.label} · ${KIND_SHORT[flow.kind]} · ${amount} · ${describeStart(flow)}${duration}${inside}`;
}

/** «Pensione INPS · dal 2058 · si modifica in Coast FIRE › Ipotesi»: the pensions are shown, never edited here (D-F4). */
export function describePensionFlowRow(label: string, startYear: number | null): string {
  return `${label} · ${startYear === null ? 'data da stimare' : `dal ${startYear}`} · si modifica in Coast FIRE › Ipotesi`;
}

export interface FlowsEffect {
  /** Flows the engines read. */
  count: number;
  excluded: readonly ExcludedFlow[];
  /** Calendar year of the Base FIRE without / with the flows; null = beyond the horizon. */
  yearWithout: number | null;
  yearWith: number | null;
}

/**
 * The Base di calcolo's «Flussi nel tempo» row: «4» and «spostano il FIRE dal 2034 al 2029», «non spostano l'anno FIRE»,
 * or «nessuno: aggiungili nei Parametri»; what was left out is said after («1 escluso: manca l'età»).
 */
export function describeFlowsRow(effect: FlowsEffect): { value: string | null; caption: string } {
  const excluded = effect.excluded.length > 0 ? `${plural(effect.excluded.length, 'escluso', 'esclusi')}: ${effect.excluded.map((flow) => flow.reason).join('; ')}` : null;
  if (effect.count === 0) {
    return { value: null, caption: excluded ? `nessuno in uso · ${excluded}` : 'nessuno: aggiungili nei Parametri' };
  }
  const { yearWithout, yearWith } = effect;
  const many = effect.count !== 1;
  const shift =
    yearWithout === yearWith
      ? `${many ? 'non spostano' : 'non sposta'} l'anno FIRE`
      : yearWithout !== null && yearWith !== null
        ? `${many ? 'spostano' : 'sposta'} il FIRE dal ${yearWithout} al ${yearWith}`
        : yearWith === null
          ? `${many ? 'portano' : 'porta'} il FIRE oltre l'orizzonte della proiezione`
          : `${many ? 'portano' : 'porta'} il FIRE al ${yearWith}`;
  return { value: String(effect.count), caption: [shift, excluded].filter(Boolean).join(' · ') };
}

/** Settings › Parametri del piano: «4» or «nessuno». */
export function describeFlowsDeclaration(count: number): string {
  return count > 0 ? String(count) : 'nessuno';
}
