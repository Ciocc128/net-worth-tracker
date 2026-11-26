/**
 * «Verso il FIRE» — what Panoramica says to a viewer with FIRE off (doc/essenziale/README.md § 5.7, D-ES2).
 *
 * Pure: the tile hands it the figures `useFireProgress` already derived for the Calculator (the capital `K`, the requirement
 * of today, the Base walk), so the two pages print the same numbers. «Numero FIRE» is the Calculator's requirement and
 * nothing else (NF1): this module never computes a second one.
 */
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { AssetAllocationSettings } from '@/types/assets';

/**
 * Whether the account has a FIRE plan to read: the age and the withdrawal rate are saved (§ 5.7). Without them the
 * Calculator would run on defaults, and a tile must not speak for a plan nobody wrote.
 */
export function isFirePlanFilled(settings: Pick<AssetAllocationSettings, 'userAge' | 'withdrawalRate'> | null | undefined): boolean {
  if (!settings) return false;
  const { userAge, withdrawalRate } = settings;
  return typeof userAge === 'number' && userAge > 0 && typeof withdrawalRate === 'number' && withdrawalRate > 0;
}

export interface FireProgressInput {
  /** The capital the plan stands on (`K`), euro. */
  capital: number;
  /** The Calculator's requirement of today, euro (`displayedFireMetrics.fireNumber`). */
  fireNumber: number;
  /** Years to the FIRE of the Base walk: `null` beyond the horizon, `0` already there. */
  baseYearsToFIRE: number | null;
  /** The calendar year of the read. */
  currentYear: number;
}

export interface FireProgressReading {
  /** The hero figure: the capital over the number, whole percent. */
  percent: number;
  /** «{capitale} di {numero FIRE}» — both as the Calculator prints them. */
  amounts: string;
  /** «FIRE previsto nel 2041», «FIRE già raggiunto» or «FIRE oltre l'orizzonte». */
  forecast: string;
  /** The bar's fill, 0–100. */
  fill: number;
}

/** The tile's words and figures; `null` when there is no requirement to measure against. */
export function describeFireProgress({ capital, fireNumber, baseYearsToFIRE, currentYear }: FireProgressInput): FireProgressReading | null {
  if (!(fireNumber > 0)) return null;
  const ratio = (capital / fireNumber) * 100;
  const forecast =
    baseYearsToFIRE === null
      ? "FIRE oltre l'orizzonte"
      : baseYearsToFIRE === 0
        ? 'FIRE già raggiunto'
        : `FIRE previsto nel ${currentYear + baseYearsToFIRE}`;
  return {
    percent: Math.round(ratio),
    amounts: `${cachedFormatCurrencyEUR(capital)} di ${cachedFormatCurrencyEUR(fireNumber)}`,
    forecast,
    fill: Math.min(100, Math.max(0, ratio)),
  };
}
