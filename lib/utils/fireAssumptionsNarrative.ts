/**
 * The «Ipotesi usate» line of the FIRE page (doc/fire-ipotesi/README.md § 4.2): one sentence, the
 * same in every tab, saying which hypotheses the numbers below run on. Pure; the component only
 * adds the link to Impostazioni › Simulazioni.
 */
import { formatPercentage } from '@/lib/services/chartService';
import { formatLeverage } from '@/lib/utils/monteCarloNarrative';
import { MONTE_CARLO_EXCLUDED_CLASSES, MONTE_CARLO_EXCLUDED_LABELS } from '@/lib/constants/monteCarloClasses';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { FireAssumptions, FireCapital, FireExpenses } from '@/lib/utils/fireAssumptions';
import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** One decimal, Italian comma: «8,3%». */
const pct = (value: number): string => formatPercentage(Math.round(value * 10) / 10, 1);

function describeWeights(assumptions: FireAssumptions): Narrative {
  switch (assumptions.weightsOrigin) {
    case 'targets':
      return [prose('Portafoglio target')];
    case 'holdings':
      return [prose('Portafoglio di oggi (nessun target in Allocazione)')];
    default:
      return [prose('Portafoglio 60/40 predefinito (nessun asset in elenco)')];
  }
}

const euro = (value: number): string => cachedFormatCurrencyEUR(Math.round(value), true);

/** «Immobili 250.000 €, Crypto 5.000 €» — what the plan's capital leaves out; null when nothing is left out (RP5). */
export function describeOutsideCapital(outside: FireCapital['outside']): string | null {
  const left = MONTE_CARLO_EXCLUDED_CLASSES.filter((cls) => outside[cls] > 0);
  return left.length > 0 ? left.map((cls) => `${MONTE_CARLO_EXCLUDED_LABELS[cls]} ${euro(outside[cls])}`).join(', ') : null;
}

/** «spesa 32.000 € dal Cashflow 2025» / «… da Impostazioni» / «… dal Cashflow 2026, annualizzato»; a Cashflow with no expenses says so. */
function describeExpenses(expenses: FireExpenses): Narrative {
  if (expenses.origin === 'settings') return [prose(' · spesa '), figure(euro(expenses.annual)), prose(' da Impostazioni')];
  if (!(expenses.annual > 0)) return [prose(' · spesa '), figure('non rilevata'), prose(' (nessuna spesa nel Cashflow)')];
  return [prose(' · spesa '), figure(euro(expenses.annual)), prose(` dal Cashflow ${expenses.referenceYear ?? ''}${expenses.isAnnualized ? ', annualizzato' : ''}`.trimEnd())];
}

/** Two decimals, Italian comma: «0,36%» — the costs are a fraction of a point, one decimal would erase them. */
const pct2 = (value: number): string => formatPercentage(Math.round(value * 100) / 100, 2);

/** The three readings of the costs (doc/fire-ipotesi § 9, C12): TER and duty, TER only, duty only, or none. Null when the costs were not computed. */
function describeCosts(assumptions: FireAssumptions): Narrative | null {
  const { costs, cost } = assumptions;
  if (!costs || !cost) return null;
  const stampOff = 'bollo non attivo in Impostazioni › Allocazione';
  const terMissing = 'TER non inseriti negli strumenti';
  if (!costs.anyTer && !costs.stampDutyEnabled) return [prose(' · nessun costo ('), prose(`${terMissing}; ${stampOff})`)];
  if (!costs.anyTer) return [prose(' · costi '), figure(pct2(cost.total)), prose(` (solo bollo; ${terMissing})`)];
  if (!costs.stampDutyEnabled) return [prose(' · costi '), figure(pct2(cost.total)), prose(` (solo TER; ${stampOff})`)];
  return [prose(' · costi '), figure(pct2(cost.total)), prose(' (TER '), figure(pct2(cost.ter)), prose(', bollo '), figure(pct2(cost.stampDuty)), prose(')')];
}

/** True when the costs ignore the stamp duty because Impostazioni › Allocazione has it off: the row links the tile (C12). */
export function costsLackStampDuty(assumptions: FireAssumptions): boolean {
  return !!assumptions.costs && !assumptions.costs.stampDutyEnabled;
}

/** «capitale 410.000 € (fuori: Immobili 250.000 €)». */
function describeCapital(capital: FireCapital): Narrative {
  const outside = describeOutsideCapital(capital.outside);
  return [prose(' · capitale '), figure(euro(capital.total)), ...(outside ? [prose(` (fuori: ${outside})`)] : [])];
}

/**
 * «Portafoglio target · Base 8,3% (reale 5,1%), Orso 6,0%, Toro 11,1% · inflazione 3,0%», with «· leva 1,5×» when the weights
 * sum above 100%, then «· costi 0,36% (TER 0,16%, bollo 0,20%)» (the rates above are net of them), then «· spesa 32.000 € dal Cashflow 2025 · capitale 410.000 € (fuori: Immobili 250.000 €)».
 */
export function describeFireAssumptions(assumptions: FireAssumptions): Narrative {
  const { bear, base, bull } = assumptions.scenarios;
  const out: Narrative = [
    ...describeWeights(assumptions),
    prose(' · Base '),
    figure(pct(base.growthRate)),
    prose(' (reale '),
    figure(pct(base.realReturnRate)),
    prose('), Orso '),
    figure(pct(bear.growthRate)),
    prose(', Toro '),
    figure(pct(bull.growthRate)),
    prose(' · inflazione '),
    figure(pct(base.inflationRate)),
  ];
  if (assumptions.leverage > 1) {
    out.push(prose(' · leva '), figure(formatLeverage(assumptions.leverage)));
  }
  // RC: the yearly costs the rates are net of.
  const costs = describeCosts(assumptions);
  if (costs) out.push(...costs);
  // L2: the expenses and the capital, once the tab has them (RP5, RP6).
  if (assumptions.expenses) out.push(...describeExpenses(assumptions.expenses));
  if (assumptions.capital) out.push(...describeCapital(assumptions.capital));
  return out;
}
