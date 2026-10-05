/**
 * The «Ipotesi usate» row of the FIRE page (doc/fire-ipotesi/README.md §§ 4.2 and 15, RC1–RC3): the capital line and four chips
 * (Rendimenti · Costi · Spesa · Flussi), each with the sentence of its popover. The same strings in every tab for the same data. Pure;
 * the component only adds the popovers and the links.
 */
import { formatPercentage } from '@/lib/services/chartService';
import { formatLeverage } from '@/lib/utils/monteCarloNarrative';
import { FLOW_KIND_LABEL } from '@/lib/utils/datedFlowsNarrative';
import type { ResolvedFlow, ExcludedFlow } from '@/lib/utils/datedFlows';
import { MONTE_CARLO_EXCLUDED_CLASSES, MONTE_CARLO_EXCLUDED_LABELS } from '@/lib/constants/monteCarloClasses';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { FireAssumptions, FireCapital } from '@/lib/utils/fireAssumptions';


/** One decimal, Italian comma: «8,3%». */
const pct = (value: number): string => formatPercentage(Math.round(value * 10) / 10, 1);

/** What a chip is: its label, the sentences of its popover and where the figure is changed (RC2). */
export interface FireChip {
  id: 'returns' | 'costs' | 'expenses' | 'flows';
  label: string;
  lines: string[];
  links: FireChipLink[];
}

/** `plan` = a field of «Il mio piano» (the row opens the block on it); `href` = another page. */
export type FireChipLink = { text: string; href: string } | { text: string; planField: 'spesa' | 'flussi' };

function describeWeights(assumptions: FireAssumptions): string {
  switch (assumptions.weightsOrigin) {
    case 'targets':
      return 'Portafoglio target';
    case 'holdings':
      return 'Portafoglio di oggi (nessun target in Allocazione)';
    default:
      return 'Portafoglio 60/40 predefinito (nessun asset in elenco)';
  }
}

const euro = (value: number): string => cachedFormatCurrencyEUR(Math.round(value), true);

/**
 * «fondo di emergenza 30.000 €, Immobili 250.000 €, Crypto 10.000 €» — what the plan's capital leaves out (RK8); null when
 * nothing is left out. The cash not invested and the other excluded instruments come first: they are the owner's to decide.
 */
export function describeOutsideCapital(outside: FireCapital['outside']): string | null {
  const parts: string[] = [];
  if (Math.round(outside.cash) > 0) parts.push(`${outside.cashIsFund ? 'fondo di emergenza' : 'Liquidità'} ${euro(outside.cash)}`);
  if (Math.round(outside.otherExcluded) > 0) parts.push(`Altri strumenti esclusi ${euro(outside.otherExcluded)}`);
  for (const cls of MONTE_CARLO_EXCLUDED_CLASSES) if (outside[cls] > 0) parts.push(`${MONTE_CARLO_EXCLUDED_LABELS[cls]} ${euro(outside[cls])}`);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Two decimals, Italian comma: «0,36%» — the costs are a fraction of a point, one decimal would erase them. */
const pct2 = (value: number): string => formatPercentage(Math.round(value * 100) / 100, 2);

/** True when the costs ignore the stamp duty because Impostazioni › Allocazione has it off: the row links the tile (C12). */
export function costsLackStampDuty(assumptions: FireAssumptions): boolean {
  return !!assumptions.costs && !assumptions.costs.stampDutyEnabled;
}

/**
 * §§ 11.6 and 14.6: «capitale 430.000 € (portafoglio 400.000 € + 30.000 € di liquidità oltre il fondo; fuori: fondo di emergenza 30.000 €, Immobili 250.000 €)».
 * With nothing of the cash entering: «capitale 400.000 € (portafoglio; fuori: Liquidità 60.000 €, …)». Shared by the six tabs and the two Parametri tiles.
 */
export function describeCapitalBreakdown(capital: FireCapital): string {
  const outside = describeOutsideCapital(capital.outside);
  const used = Math.round(capital.cashToInvest.used) > 0 ? ` ${euro(capital.portfolio)} + ${euro(capital.cashToInvest.used)} di liquidità oltre il fondo` : '';
  const head = used ? `portafoglio${used}` : 'portafoglio';
  return `(${head}${outside ? `; fuori: ${outside}` : ''})`;
}

/** RE4: «10 mesi», «10,3 mesi», «1 mese» — one decimal, «,0» dropped; null without a fund or a plan expense. */
export function describeFundMonths(fund: number | null, annualExpense: number | null | undefined): string | null {
  if (fund === null || !(fund > 0) || annualExpense === null || annualExpense === undefined || !(annualExpense > 0)) return null;
  const months = Math.round((fund / (annualExpense / 12)) * 10) / 10;
  const text = Number.isInteger(months) ? String(months) : String(months).replace('.', ',');
  return `${text} ${months === 1 ? 'mese' : 'mesi'}`;
}

/**
 * § 14.6, under the «Fondo di emergenza» field: «60.000 € fuori dal portafoglio (conti esclusi 45.000 €, oltre il target 15.000 €):
 * 30.000 € restano come fondo, pari a 10 mesi della spesa del piano, e 30.000 € entrano nei pesi target.» The parts that are zero are left out;
 * `annualExpense` is the plan's (RP6) for the months, absent = no months.
 */
export function describeEmergencyFund(cash: FireCapital['cashToInvest'], annualExpense?: number | null): string {
  if (cash.total <= 0 && cash.fund === null) return 'Nessuna liquidità fuori dal portafoglio.';
  if (cash.fundShortfall > 0) {
    return `Il fondo supera di ${euro(cash.fundShortfall)} la liquidità fuori dal portafoglio (${euro(cash.total)}): non entra niente nel capitale e il fondo non è coperto.`;
  }
  const parts: string[] = [];
  if (Math.round(cash.excludedAccounts) !== 0) parts.push(`conti esclusi ${euro(cash.excludedAccounts)}`);
  if (Math.round(cash.overTarget) > 0) parts.push(`oltre il target ${euro(cash.overTarget)}`);
  const where = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  const head = `${euro(cash.total)} fuori dal portafoglio${where}`;
  const kept = cash.total - cash.used;
  let body: string;
  if (cash.fund === null) body = 'senza un fondo indicato restano tutti fuori.';
  else if (Math.round(cash.used) === 0) body = `restano tutti come fondo${monthsClause(cash.fund, annualExpense)}.`;
  else if (Math.round(kept) === 0) body = 'entrano tutti nei pesi target.';
  else body = `${euro(kept)} restano come fondo${monthsClause(kept, annualExpense)}, e ${euro(cash.used)} entrano nei pesi target.`;
  const derived = cash.fundFromPct !== null ? ` Calcolato dalla quota del ${formatPercentage(Math.round(cash.fundFromPct * 10) / 10, 0)} salvata prima: salva per fissarlo in euro.` : '';
  return `${head}: ${body}${derived}`;
}

const monthsClause = (fund: number, annualExpense: number | null | undefined): string => {
  const months = describeFundMonths(fund, annualExpense);
  return months ? `, pari a ${months} della spesa del piano` : '';
};


/** RC1: the capital row, «Capitale 430.000 €» and its breakdown in a smaller body; null until the tab has the capital. */
export function describeCapitalRow(assumptions: FireAssumptions): { figure: string; breakdown: string } | null {
  if (!assumptions.capital) return null;
  return { figure: euro(assumptions.capital.total), breakdown: describeCapitalBreakdown(assumptions.capital).slice(1, -1) };
}

/** RC3, Rendimenti: «Rendimento Base 8,3% · reale 5,1%»; the popover says where the weights come from, Bear and Bull, the inflation and the leverage. */
export function describeReturnsChip(assumptions: FireAssumptions): FireChip {
  const { bear, base, bull } = assumptions.scenarios;
  const lines = [describeWeights(assumptions), `Bear ${pct(bear.growthRate)}, Bull ${pct(bull.growthRate)}`, `Inflazione ${pct(base.inflationRate)}`];
  if (assumptions.leverage > 1) lines.push(`Leva ${formatLeverage(assumptions.leverage)}`);
  return {
    id: 'returns',
    label: `Rendimento Base ${pct(base.growthRate)} · reale ${pct(base.realReturnRate)}`,
    lines,
    links: [{ text: 'Modifica in Impostazioni › Simulazioni', href: '/dashboard/settings?tab=simulazioni' }],
  };
}

/** RC3, Costi: the three readings of the costs (doc/fire-ipotesi § 9, C12); null when the costs were not computed. */
export function describeCostsChip(assumptions: FireAssumptions): FireChip | null {
  const { costs, cost } = assumptions;
  if (!costs || !cost) return null;
  const stampOff = 'bollo non attivo in Impostazioni › Allocazione';
  const terMissing = 'TER non inseriti negli strumenti';
  const href = '/dashboard/settings?tab=allocazione';
  const link: FireChipLink = { text: costsLackStampDuty(assumptions) ? 'Attiva il bollo' : 'Impostazioni › Allocazione', href };
  if (!costs.anyTer && !costs.stampDutyEnabled) return { id: 'costs', label: 'Nessun costo', lines: [`${terMissing}; ${stampOff}`], links: [link] };
  if (!costs.anyTer) return { id: 'costs', label: `Costi ${pct2(cost.total)}`, lines: [`Solo bollo; ${terMissing}`], links: [link] };
  if (!costs.stampDutyEnabled) return { id: 'costs', label: `Costi ${pct2(cost.total)}`, lines: [`Solo TER; ${stampOff}`], links: [link] };
  return { id: 'costs', label: `Costi ${pct2(cost.total)}`, lines: [`TER ${pct2(cost.ter)}, bollo ${pct2(cost.stampDuty)}`, 'I rendimenti sono già al netto.'], links: [link] };
}

/** RC3, Spesa: «Spesa 25.200 €» and where it comes from; null until the tab has the expenses. */
export function describeExpensesChip(assumptions: FireAssumptions): FireChip | null {
  const expenses = assumptions.expenses;
  if (!expenses) return null;
  const link: FireChipLink = { text: 'Il mio piano', planField: 'spesa' };
  if (expenses.origin === 'settings') return { id: 'expenses', label: `Spesa ${euro(expenses.annual)}`, lines: ['Spesa del piano, da Il mio piano'], links: [link] };
  if (!(expenses.annual > 0)) return { id: 'expenses', label: 'Spesa non rilevata', lines: ['Nessuna spesa nel Cashflow'], links: [link] };
  return { id: 'expenses', label: `Spesa ${euro(expenses.annual)}`, lines: [`Dal Cashflow ${expenses.referenceYear ?? ''}${expenses.isAnnualized ? ', annualizzato' : ''}`.trimEnd()], links: [link] };
}

/** One line of the Flussi popover: «Eredità · una tantum · 100.000 € · 2036»; the year is the calendar one, or «dal FIRE». */
function describeFlowLine(flow: ResolvedFlow, currentYear: number): string {
  const recurring = flow.kind === 'expense' || flow.kind === 'income';
  const amount = `${euro(flow.amount)}${recurring ? '/anno' : ''}`;
  const when = flow.anchor === 'fire' ? (flow.start > 0 ? `${flow.start} anni dopo il FIRE` : 'dal FIRE') : String(currentYear + flow.start);
  return `${flow.label} · ${FLOW_KIND_LABEL[flow.kind]} · ${amount} · ${when}`;
}

/**
 * The flows a tab runs on, for the popover: the lines of the resolved flows and the excluded ones with the reason. The tabs lay it on
 * `FireAssumptions` once, next to the count (`withFlowsDetail`).
 */
export function withFlowsDetail(assumptions: FireAssumptions, resolved: readonly ResolvedFlow[], excluded: readonly ExcludedFlow[], currentYear: number = getItalyYear()): FireAssumptions {
  return {
    ...assumptions,
    datedFlowsCount: resolved.length,
    datedFlowsDetail: { lines: resolved.map((flow) => describeFlowLine(flow, currentYear)), excluded: excluded.map((flow) => `${flow.label}: ${flow.reason}`) },
  };
}

/** RC3, Flussi: «Flussi 4» / «Flussi: nessuno»; the Obiettivi read none of them, and say so. Null until a tab has set the count. */
export function describeFlowsChip(assumptions: FireAssumptions, view: 'goals' | 'default' = 'default'): FireChip | null {
  const link: FireChipLink = { text: 'Il mio piano', planField: 'flussi' };
  if (view === 'goals') return { id: 'flows', label: "Flussi: solo nell'Effetto sul FIRE", lines: ['Gli obiettivi non leggono i flussi datati: li usa solo l\'effetto sul FIRE.'], links: [link] };
  if (assumptions.datedFlowsCount === undefined) return null;
  const count = assumptions.datedFlowsCount;
  const detail = assumptions.datedFlowsDetail;
  const excluded = detail?.excluded.length ? [`Esclusi: ${detail.excluded.join('; ')}`] : [];
  if (count === 0) return { id: 'flows', label: 'Flussi: nessuno', lines: excluded.length > 0 ? excluded : ['Nessun flusso nel piano.'], links: [link] };
  return { id: 'flows', label: `Flussi ${count}`, lines: [...(detail?.lines ?? []), ...excluded], links: [link] };
}

/** The chips in the order of RC1; a chip with nothing to say (no costs computed yet, no expenses) is left out, never a «—» (RC5). */
export function describeFireChips(assumptions: FireAssumptions, view: 'goals' | 'default' = 'default'): FireChip[] {
  return [describeReturnsChip(assumptions), describeCostsChip(assumptions), describeExpensesChip(assumptions), describeFlowsChip(assumptions, view)].filter((chip): chip is FireChip => chip !== null);
}
