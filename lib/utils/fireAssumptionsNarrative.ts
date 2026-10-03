/**
 * The «Ipotesi usate» line of the FIRE page (doc/fire-ipotesi/README.md § 4.2): one sentence, the
 * same in every tab, saying which hypotheses the numbers below run on. Pure; the component only
 * adds the link to Impostazioni › Simulazioni.
 */
import { formatPercentage } from '@/lib/services/chartService';
import { formatLeverage } from '@/lib/utils/monteCarloNarrative';
import type { FireAssumptions } from '@/lib/utils/fireAssumptions';
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

/** «Portafoglio target · Base 8,3% (reale 5,1%), Orso 6,0%, Toro 11,1% · inflazione 3,0%», with «· leva 1,5×» when the weights sum above 100%. */
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
  return out;
}
