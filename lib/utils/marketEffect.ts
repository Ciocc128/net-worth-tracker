/**
 * The market effect of one instrument between two valuations — the ONE rule the Panoramica (the
 * live portfolio against the previous snapshot) and Storico's Driver (snapshot against snapshot)
 * share, so «mercato» means the same thing on both pages.
 *
 * SDK-free: both callers hand in plain `{ quantity, totalValue }` rows; nothing here reaches the
 * Firebase layer, so the module is readable by the server and by the tests without mocks.
 */

import type { AssetTransaction } from '@/types/assetTransactions';
import type { PensionContribution } from '@/types/pension';
import type { Asset } from '@/types/assets';
import { valueEffectMonth } from '@/lib/utils/pensionReturn';
import { PENSION_BAND_KEY } from '@/lib/utils/historyComposition';

/** A position at one valuation: EUR value and the quantity it was held in. */
export interface PositionValue {
  quantity: number;
  totalValue: number;
}

/**
 * The market effect of an instrument traded between two valuations, from the ledger:
 *
 *   Δvalue − net money put in − quantity the ledger does not explain × today's unit value
 *
 * where «money put in» is Σ buys (quantity × priceEur + fees) − Σ sells (quantity × priceEur −
 * fees). For a held quote this is the old `q_prev × Δu`; for a bought one `q × (u_now − p) − fees`;
 * for a sold one `q × (p − u_prev) − fees`. A quantity change no BUY/SELL explains — a migration
 * baseline, an adjustment, a hand-edited quantity — moves no money the ledger knows, so it is
 * valued at the current unit price and kept OUT of the market (it lands in «altre variazioni»).
 *
 * `trades` must already be scoped to the window between the two valuations. Returns null when the
 * instrument has no BUY/SELL in it (the caller keeps `q_prev × Δu`), and for a position closed
 * with an unexplained remainder (no price left to value it at).
 */
export function tradeAwarePriceEffect(
  previous: PositionValue | undefined,
  current: PositionValue | undefined,
  trades: AssetTransaction[]
): number | null {
  const money = tradedMoney(trades);
  if (!money) return null;

  const previousQuantity = previous?.quantity ?? 0;
  const currentQuantity = current?.quantity ?? 0;
  const unexplainedQuantity = currentQuantity - previousQuantity - money.quantity;
  const currentUnit = current && current.quantity > 0 ? current.totalValue / current.quantity : null;
  // Float noise from quantities like 0.1 + 0.2 is not a quantity the ledger failed to explain.
  const hasUnexplained = Math.abs(unexplainedQuantity) > 1e-9;
  if (hasUnexplained && currentUnit === null) return null;

  const valueChange = (current?.totalValue ?? 0) - (previous?.totalValue ?? 0);
  return valueChange - money.moneyIn - (hasUnexplained ? unexplainedQuantity * currentUnit! : 0);
}

/**
 * The money a window's BUY/SELL put into an instrument — Σ buys (quantity × priceEur + fees) −
 * Σ sells (quantity × priceEur − fees) — and the quantity they moved. A baseline BUY moves no
 * money and is ignored. Null without a money trade. The ONE definition `tradeAwarePriceEffect`
 * nets out of the value change, and what the periodic email calls «acquisti e vendite».
 */
export function tradedMoney(trades: AssetTransaction[]): { moneyIn: number; quantity: number } | null {
  const moneyTrades = trades.filter((t) => (t.type === 'buy' && !t.isBaseline) || t.type === 'sell');
  if (moneyTrades.length === 0) return null;

  let moneyIn = 0;
  let quantity = 0;
  for (const trade of moneyTrades) {
    const fees = trade.fees ?? 0;
    if (trade.type === 'buy') {
      moneyIn += trade.quantity * trade.priceEur + fees;
      quantity += trade.quantity;
    } else {
      moneyIn -= trade.quantity * trade.priceEur - fees;
      quantity -= trade.quantity;
    }
  }
  return { moneyIn, quantity };
}

/**
 * What was paid into one pension fund after the month `afterKey` ('YYYY-MM'), through
 * `throughKey` when given — attributed to the month its VALUE moved (`valueEffectMonth`, the rule
 * Previdenza's «Rendimento del fondo» uses). A fund's market effect is its value change minus this.
 */
export function pensionPaidInBetween(
  contributions: PensionContribution[],
  assetId: string,
  afterKey: string,
  throughKey?: string
): number {
  return contributions
    .filter((c) => {
      if (c.assetId !== assetId) return false;
      const key = valueEffectMonth(c);
      return key > afterKey && (throughKey === undefined || key <= throughKey);
    })
    .reduce((sum, c) => sum + c.amount, 0);
}

/**
 * Per-instrument amounts summed into the bands the market digest names: a pension fund into its
 * OWN band (`PENSION_BAND_KEY`, «Previdenza» — folded into Azioni/Obbligazioni its return would
 * vanish), a composite asset split across its `composition`, anything else into its asset class.
 * The ONE grouping behind the Panoramica's «Mercato:» digest (`computeTopMovers`) and the periodic
 * email's «Andamento per classe». An asset `amountOf` answers undefined for is skipped.
 */
export function sumByMarketBand(
  assets: Pick<Asset, 'id' | 'type' | 'assetClass' | 'composition'>[],
  amountOf: (assetId: string) => number | undefined
): Map<string, number> {
  const byBand = new Map<string, number>();
  const add = (band: string, amount: number) => byBand.set(band, (byBand.get(band) ?? 0) + amount);
  for (const asset of assets) {
    const amount = amountOf(asset.id);
    if (amount === undefined) continue;
    if (asset.type === 'pensionFund') {
      add(PENSION_BAND_KEY, amount);
    } else if (asset.composition && asset.composition.length > 0) {
      for (const component of asset.composition) add(component.assetClass, (amount * component.percentage) / 100);
    } else {
      add(asset.assetClass, amount);
    }
  }
  return byBand;
}
