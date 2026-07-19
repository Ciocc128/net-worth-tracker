/**
 * AllocationHero — the page's one-glance verdict (A1 + A2).
 *
 * Trade Republic asymmetric bento. Left (dominant): the size of the portfolio + its SHAPE.
 * Right (companion): the BalanceScoreGauge (band-INDEPENDENT "how close to target") above the
 * band-DEPENDENT verdict.
 *
 * LEVERAGE DUALITY: when the investable base carries leverage (notional exposure > market
 * capital), the dominant card shows TWO parity figures — "Patrimonio Allocato" (market, the real
 * money) and "Esposizione Nozionale" (leverage-adjusted exposure) — with a "Leva X,XX×" chip
 * between them, and the target leverage beside it when it differs. With no leverage the two
 * coincide, so a single figure is shown (identical to the pre-leverage layout).
 *
 * EXCLUSIONS: cash / real estate the user keeps out of the allocation are surfaced in a quiet
 * "Fuori allocazione" strip, so the base above stays clean while the excluded wealth is still
 * visible.
 *
 * The count-up is isolated in the `HeroValue` leaf so each animation frame re-renders only that
 * span, never the verdict or the rest of the tree (DESIGN.md count-up isolation rule).
 */
'use client';

import { useCountUp } from '@/lib/utils/useCountUp';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import {
  ASSET_CLASS_LABELS,
  type BalanceSummary,
  type BalanceScore,
} from '@/lib/utils/allocationUtils';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { ActionChip } from './ActionChip';
import { AllocationCompositionBar } from './AllocationCompositionBar';
import { BalanceScoreGauge } from './BalanceScoreGauge';
import type { AllocationData, AllocationExcludedClass } from '@/types/assets';

interface AllocationHeroProps {
  /** Notional total of the investable base — the composition bar's width denominator. */
  totalValue: number;
  /** Market capital of the investable base (the real money). Equals `totalValue` when unleveraged. */
  marketValue: number;
  /** Notional / market of the investable base (1 = unleveraged). */
  leverageRatio: number;
  /** Leverage the target set encodes (Σ target % / 100), shown when it differs from current. */
  targetLeverageRatio?: number;
  /** Classes kept out of the allocation base, shown in a quiet strip. */
  excludedClasses: AllocationExcludedClass[];
  byAssetClass: Record<string, AllocationData>;
  summary: BalanceSummary;
  balance: BalanceScore;
  assetClassCount: number;
}

/** A class is meaningfully leveraged only above a small epsilon (avoid 1.00× noise chips). */
const LEVERAGE_EPSILON = 0.005;

/** Leaf so the rAF count-up re-renders only this span. */
function HeroValue({ value }: { value: number }) {
  const animated = useCountUp(value, { duration: 620, once: true });
  // useCountUp returns null on the first frame before the rAF loop seeds a value.
  return <>{cachedFormatCurrencyEUR(animated ?? value)}</>;
}

function formatSignedPp(pp: number): string {
  const sign = pp > 0 ? '+' : pp < 0 ? '−' : '';
  return `${sign}${Math.abs(pp).toFixed(1)} p.p.`;
}

/** Italian-formatted leverage ratio, e.g. "1,32×". */
function formatLeverage(ratio: number): string {
  return `${ratio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

export function AllocationHero({
  totalValue,
  marketValue,
  leverageRatio,
  targetLeverageRatio,
  excludedClasses,
  byAssetClass,
  summary,
  balance,
  assetClassCount,
}: AllocationHeroProps) {
  const { isBalanced, offTargetCount, largestGap } = summary;
  const actionColors = useActionColors();

  const hasLeverage = leverageRatio > 1 + LEVERAGE_EPSILON;
  const hasExclusions = excludedClasses.length > 0;
  const showTargetLeverage =
    targetLeverageRatio !== undefined &&
    Math.abs(targetLeverageRatio - leverageRatio) > LEVERAGE_EPSILON;
  // When some wealth is set aside, the base is "invested" wealth, not the whole portfolio.
  const marketLabel = hasExclusions ? 'Patrimonio investito' : 'Patrimonio allocato';

  return (
    <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
      {/* Dominant: size of the (investable) portfolio + its shape. */}
      <div className="flex flex-col rounded-2xl border border-border bg-card p-[22px]">
        {hasLeverage ? (
          // Two parity figures: market money vs notional exposure, leverage between them.
          // Stacked on phones — two 30px mono figures don't fit side by side on a ~390px
          // viewport and collide; they split into columns only from `tablet:` (768px) up.
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {marketLabel}
              </p>
              <p className="mt-2 font-mono text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[38px]">
                <HeroValue value={marketValue} />
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Esposizione nozionale
              </p>
              <p className="mt-2 font-mono text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[38px]">
                <HeroValue value={totalValue} />
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {marketLabel}
            </p>
            <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[54px]">
              <HeroValue value={marketValue} />
            </p>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {assetClassCount} {assetClassCount === 1 ? 'classe di asset' : 'classi di asset'} · valori correnti
          </span>
          {hasLeverage && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5">
              <span className="font-medium text-foreground">Leva {formatLeverage(leverageRatio)}</span>
              {showTargetLeverage && (
                <span className="text-muted-foreground">
                  · target {formatLeverage(targetLeverageRatio!)}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="mt-auto pt-5">
          <AllocationCompositionBar
            byAssetClass={byAssetClass}
            totalValue={totalValue}
            leverageRatio={leverageRatio}
          />
        </div>

        {/* Fuori allocazione: excluded wealth, still visible but out of the base above. */}
        {hasExclusions && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Fuori allocazione
            </span>
            {excludedClasses.map((excluded) => (
              <span key={excluded.assetClass} className="flex items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">
                  {ASSET_CLASS_LABELS[excluded.assetClass] ?? excluded.assetClass}
                </span>
                <span className="font-mono tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(excluded.marketValue)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Companion: balance score (band-independent) + verdict (band-dependent) */}
      <div className="flex h-full flex-col justify-center gap-4 rounded-2xl border border-border bg-card p-5">
        <BalanceScoreGauge balance={balance} />

        <div className="border-t border-border/60 pt-4">
          {isBalanced ? (
            <>
              <p className="text-sm font-semibold leading-none" style={{ color: actionColors.OK }}>
                In linea
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Tutte le classi sono entro la soglia di ribilanciamento.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-bold leading-none tabular-nums text-foreground">
                  {offTargetCount}
                </span>
                <span className="text-sm text-muted-foreground">
                  {offTargetCount === 1 ? 'classe fuori target' : 'classi fuori target'}
                </span>
              </p>
              {largestGap && (
                <div className="mt-3 flex items-center gap-2">
                  <ActionChip action={largestGap.action} color={actionColors[largestGap.action]} />
                  <span className="truncate text-xs text-muted-foreground" title={largestGap.label}>
                    {largestGap.label}
                  </span>
                  <span
                    className="ml-auto font-mono text-xs font-medium tabular-nums"
                    style={{ color: actionColors[largestGap.action] }}
                  >
                    {formatSignedPp(largestGap.difference)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
