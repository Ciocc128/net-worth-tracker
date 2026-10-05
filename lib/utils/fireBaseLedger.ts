/**
 * The FIRE number as a sum of steps (doc/fire-ipotesi/README.md § 15, RB1–RB2, D-T9): spending ÷ SWR, then the withdrawal tax,
 * the state pensions, the locked pension fund and the dated flows, in that fixed order. Every step is the difference between two
 * successive calls of `resolveFireRequirement`, each with one more ingredient — so the steps add up to the number BY CONSTRUCTION,
 * and the last call is the very requirement the Calcolatore shows. The order is a declared choice: an interaction (the pensions are
 * read net of the tax already put in, the flows after everything else) goes to the step that comes after.
 *
 * Pure. An ingredient that does not enter prints no step (`null`, the tile's «—»), never a 0.
 */
import { resolveFireRequirement, type FireHonestInputs, type FireRequirementInput } from '@/lib/services/fireService';

export type FireLedgerStepKey = 'tax' | 'pensions' | 'bridge' | 'flows';

export interface FireLedgerStep {
  key: FireLedgerStepKey;
  /** The step in whole euro, as the difference of the ROUNDED cumulatives (RB2); null = the ingredient does not enter. */
  amount: number | null;
}

export interface FireLedger {
  /** `round(R0)`: expenses ÷ SWR. */
  base: number;
  steps: FireLedgerStep[];
  /** `round(R4)`: the FIRE number; `base` plus the steps, to the euro. */
  total: number;
  /** The unrounded cumulatives R0…R4, for the consistency check against the Calcolatore's number. */
  cumulative: [number, number, number, number, number];
}

export type FireLedgerInput = Pick<FireRequirementInput, 'annualExpenses' | 'withdrawalRate' | 'scenario' | 'gainShare' | 'flows' | 'flowsRealReturnRate' | 'bridge'> & {
  honest: FireHonestInputs;
};

export function buildFireLedger(input: FireLedgerInput): FireLedger {
  const { honest, bridge, flows, ...shared } = input;
  const common = { ...shared, yearsElapsed: 0 };
  const requirement = (extra: Partial<FireRequirementInput>) => resolveFireRequirement({ ...common, ...extra });

  const taxEnters = honest.withdrawalTax !== undefined;
  const bridgeEnters = !!bridge && bridge.compartmentValue > 0 && bridge.yearsToUnlock > 0;
  const flowsEnter = !!flows && flows.flows.length > 0;

  const r0 = requirement({});
  const r1 = taxEnters ? requirement({ honest: { ...honest, pensions: [] } }) : r0;
  const r2full = requirement({ honest });
  const r3full = bridgeEnters ? requirement({ honest, bridge }) : r2full;
  const r4full = flowsEnter ? requirement({ honest, bridge, flows }) : r3full;

  const cumulative: FireLedger['cumulative'] = [r0.requirement, r1.requirement, r2full.requirement, r3full.requirement, r4full.requirement];
  const rounded = cumulative.map(Math.round);
  const step = (index: 1 | 2 | 3 | 4, enters: boolean): number | null => (enters ? rounded[index] - rounded[index - 1] : null);
  return {
    base: rounded[0],
    steps: [
      { key: 'tax', amount: step(1, taxEnters) },
      { key: 'pensions', amount: step(2, r2full.pensionsConsidered) },
      { key: 'bridge', amount: step(3, bridgeEnters) },
      { key: 'flows', amount: step(4, flowsEnter) },
    ],
    total: rounded[4],
    cumulative,
  };
}
