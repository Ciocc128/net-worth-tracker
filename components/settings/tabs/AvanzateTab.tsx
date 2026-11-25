'use client';

/**
 * Impostazioni › Avanzate (`avanzate`, fork) — the assumptions of the simulations: the market both
 * Monte Carlo engines read, the correlation matrix and the IRPEF brackets the state pensions' net is
 * computed with. It is the old Simulazioni tab, whole, with its «Dove si usano» tile turned into the
 * introduction (D-RU20: read-only declarations are lines, not tiles).
 *
 * A controlled view of the `avanzate` slice: `slice` in, `onChange(patch)` out, no form state —
 * Radix unmounts an inactive panel, and «Salva» from another tab must see it.
 *
 * What it reads besides the slice: the portfolio (the Oro choices, the held classes, the share
 * of each class held hedged) and the weights the FIRE page simulates — both through the shared
 * React Query keys, never a read of its own.
 */

import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import { MonteCarloMarketTile } from '@/components/settings/MonteCarloMarketTile';
import { MonteCarloCorrelationsTile } from '@/components/settings/MonteCarloCorrelationsTile';
import { TaxBracketsTile } from '@/components/settings/TaxBracketsTile';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { useMarketAnchors } from '@/lib/hooks/useMarketAnchors';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { hedgedClassList, normalizeHedge } from '@/lib/constants/monteCarloMarketDefaults';
import { computeSimulatedCapital } from '@/lib/utils/monteCarloParams';
import { countEditedClasses, countEditedCorrelations } from '@/lib/utils/monteCarloMarket';
import { hedgedShareByClass } from '@/lib/utils/monteCarloHedgeShare';
import { describeMonteCarloCorrelations, describeMonteCarloMarket } from '@/lib/utils/settingsNarrative';
import { isMarketEdited, type AvanzateSlice, type SettingsSlices } from '@/lib/utils/settingsDraft';
import type { Asset } from '@/types/assets';
import { ElsewhereLine, SettingsTabPanel } from './shared';

const ELSEWHERE = [
  { what: 'La simulazione che le usa', where: 'FIRE › Dopo il FIRE', href: '/dashboard/fire-simulations?tab=montecarlo' },
  { what: 'La proiezione che le usa', where: 'FIRE › Proiezione', href: '/dashboard/fire-simulations?tab=proiezione' },
];

export interface AvanzateTabProps {
  slice: AvanzateSlice;
  /** The slices as last read or written: the reading line says «modificato» only against them. */
  saved: SettingsSlices;
  onChange: (patch: Partial<AvanzateSlice>) => void;
  /** The portfolio, from the assets key every page shares; `undefined` until read. */
  assets: Asset[] | undefined;
  /** The sub-categories that can be named «Oro», and the one in force (`resolveAvanzateGold`). */
  commoditySubCategories: string[];
  effectiveGoldSubCategory: string | null;
  isDemo: boolean;
}

export function AvanzateTab({
  slice,
  saved,
  onChange,
  assets,
  commoditySubCategories,
  effectiveGoldSubCategory,
  isDemo,
}: AvanzateTabProps) {
  const { market, marketOrigin, marketMigration, marketLegacyInflation, taxBrackets, correlationCorrections } = slice;
  // The weights the FIRE page simulates, for the «Il portafoglio target rende» line (saved targets).
  const { assumptions: fireAssumptions } = useFireAssumptions();
  const marketAnchors = useMarketAnchors();

  // AL20: the share of each hedgeable class held in instruments flagged «Coperto in EUR» (the tile proposes the switch).
  const hedgedShares = assets ? hedgedShareByClass(assets, { goldSubCategory: effectiveGoldSubCategory }) : undefined;
  // The classes the portfolio holds (their correlation lists open first).
  let heldClasses: MonteCarloClass[] = [];
  if (assets) {
    const { byClass } = computeSimulatedCapital(assets, calculateAssetValue, { goldSubCategory: effectiveGoldSubCategory });
    heldClasses = MONTE_CARLO_CLASSES.filter((cls) => byClass[cls] > 0);
  }
  // A legacy document has something to write even when nothing was typed (RQ8): the reading says «modificato» only for typed edits.
  const marketDirty = isMarketEdited(slice, saved.avanzate);

  return (
    <SettingsTabPanel tab="avanzate" label="Avanzate">
      {/* What «Dove si usano» said, as the tab's introduction: the Monte Carlo and the Ventaglio read these numbers, none keeps a copy */}
      <p className="max-w-[72ch] text-[13px] leading-[1.5] text-muted-foreground tablet:col-span-2 desktop:col-span-12">
        Il Monte Carlo e il Ventaglio del Calcolatore leggono gli stessi numeri: nessuno dei due ne ha una copia propria. Il
        rendimento è il CAGR, la crescita composta mediana; la volatilità è la deviazione standard dei rendimenti annui; immobili e
        crypto restano fuori dalla simulazione. Qui salvi le ipotesi di mercato e le regole di legge, con il «Salva» della pagina.
      </p>
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <MonteCarloMarketTile
          reading={describeMonteCarloMarket({
            origin: marketOrigin,
            editedClassCount: countEditedClasses(market.overrides).length,
            migration: marketMigration ?? undefined,
            legacyInflation: marketLegacyInflation,
            inflationKept: market.overrides.inflationRate !== undefined,
            dirty: marketDirty,
            goldSubCategory: effectiveGoldSubCategory,
          })}
          draft={market}
          onDraftChange={(next) => onChange({ market: next })}
          commoditySubCategories={commoditySubCategories}
          effectiveGoldSubCategory={effectiveGoldSubCategory}
          portfolio={fireAssumptions ? { weights: fireAssumptions.weights, origin: fireAssumptions.weightsOrigin, costPct: fireAssumptions.cost?.total } : null}
          hedgedShares={hedgedShares}
          anchors={marketAnchors}
          disabled={isDemo}
        />
      </div>
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <MonteCarloCorrelationsTile
          reading={describeMonteCarloCorrelations({
            editedPairCount: countEditedCorrelations(market.correlations, market.overrides.hedged),
            hedgedLabels: hedgedClassList(normalizeHedge(market.overrides.hedged)).map((cls) => MONTE_CARLO_CLASS_LABELS[cls]),
            correctedPairCount: Object.keys(correlationCorrections).length,
          })}
          correlations={market.correlations}
          onChange={(correlations) => onChange({ market: { ...market, correlations } })}
          heldClasses={heldClasses}
          hedged={market.overrides.hedged}
          corrections={correlationCorrections}
          disabled={isDemo}
        />
      </div>
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <TaxBracketsTile brackets={taxBrackets} onChange={(next) => onChange({ taxBrackets: next })} disabled={isDemo} />
      </div>
      <ElsewhereLine items={ELSEWHERE} />
    </SettingsTabPanel>
  );
}
