'use client';

/**
 * Impostazioni › Simulazioni (fork) — the market assumptions both Monte Carlo engines read, the
 * correlation matrix and the IRPEF brackets the state pensions' net is computed with. The
 * seventh view of the page, a controlled view of the `simulazioni` slice (ported from the
 * inline tab of the old page at the tenth realignment, T3): `slice` in, `onChange(patch)` out,
 * no form state — Radix unmounts an inactive panel, and «Salva» from another tab must see it.
 *
 * What it reads besides the slice: the portfolio (the Oro choices, the held classes, the share
 * of each class held hedged) and the weights the FIRE page simulates — both through the shared
 * React Query keys, never a read of its own.
 */

import Link from 'next/link';
import { Tile, TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
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
import { isMarketEdited, type SettingsSlices, type SimulazioniSlice } from '@/lib/utils/settingsDraft';
import type { Asset } from '@/types/assets';
import { DeclarationRow, SettingsTabPanel } from './shared';

export interface SimulazioniTabProps {
  slice: SimulazioniSlice;
  /** The slices as last read or written: the reading line says «modificato» only against them. */
  saved: SettingsSlices;
  onChange: (patch: Partial<SimulazioniSlice>) => void;
  /** The portfolio, from the assets key every page shares; `undefined` until read. */
  assets: Asset[] | undefined;
  /** The sub-categories that can be named «Oro», and the one in force (`resolveSimulazioniGold`). */
  commoditySubCategories: string[];
  effectiveGoldSubCategory: string | null;
  isDemo: boolean;
}

export function SimulazioniTab({
  slice,
  saved,
  onChange,
  assets,
  commoditySubCategories,
  effectiveGoldSubCategory,
  isDemo,
}: SimulazioniTabProps) {
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
  const marketDirty = isMarketEdited(slice, saved.simulazioni);

  return (
    <SettingsTabPanel tab="simulazioni" label="Simulazioni">
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-8')}>
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
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-8')}>
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
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-8')}>
        <TaxBracketsTile brackets={taxBrackets} onChange={(next) => onChange({ taxBrackets: next })} disabled={isDemo} />
      </div>
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4 desktop:col-start-9 desktop:row-start-1')}>
        <Tile
          eyebrow="Dove si usano"
          reading={[{ text: 'Il Monte Carlo e il Ventaglio del Calcolatore leggono gli stessi numeri: nessuno dei due ne ha una copia propria.' }]}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <DeclarationRow label="Rendimento" value="CAGR: la crescita composta mediana" mono={false} />
            <DeclarationRow label="Volatilità" value="dev. std dei rendimenti annui" mono={false} />
            <DeclarationRow label="Fuori dalla simulazione" value="Immobili e crypto" mono={false} />
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Il piano (età, spesa, SWR, pensioni) si imposta in{' '}
            <Link href="/dashboard/fire-simulations?piano=aperto" className={TILE_FOOTER_ACTION_CLASS}>
              FIRE › Il mio piano
            </Link>
            . Qui salvi le ipotesi di mercato e le regole di legge, con il «Salva» della pagina.
          </div>
        </Tile>
      </div>
    </SettingsTabPanel>
  );
}
