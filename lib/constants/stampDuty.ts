/**
 * Imposta di bollo on a conto corrente held by a private individual: a FLAT 34,20 € a year, due
 * only when the balance is above 5.000 € — not a share of the balance. Securities and every other
 * financial product pay the proportional rate the Impostazioni set (0,2% by default), which is
 * why the two rules live apart: `calculateStampDuty` (lib/services/assetService.ts) reads the
 * checking-account pair from here and takes the rate as a parameter.
 *
 * Client-safe and import-free (a type-only import aside): the settings narrative (SDK-free by rule) reads it too.
 */

import type { Asset } from '@/types/assets';

/** The balance above which a checking account pays the duty. */
export const CHECKING_ACCOUNT_STAMP_DUTY_THRESHOLD_EUR = 5000;

/** The flat annual duty a checking account above the threshold pays. */
export const CHECKING_ACCOUNT_STAMP_DUTY_EUR = 34.2;

/**
 * A conto corrente, the only asset the flat rule applies to. Strict convention: `type === 'cash' &&
 * assetClass === 'cash'` and the sub-category the settings name — a money-market ETF (e.g. XEON) can
 * carry `assetClass: 'cash'` for allocation while remaining a security for tax (0,2% like any other
 * instrument). Spec 6-asset-class-selection.md decision 4; one rule for `calculateStampDuty` and the
 * FIRE costs (`lib/utils/fireCosts.ts`).
 */
export function isCheckingAccount(asset: Pick<Asset, 'type' | 'assetClass' | 'subCategory'>, checkingAccountSubCategory: string | undefined | null): boolean {
  return asset.type === 'cash' && asset.assetClass === 'cash' && !!checkingAccountSubCategory && asset.subCategory === checkingAccountSubCategory;
}
