/**
 * performanceBase — quale capitale misurano le metriche di Rendimenti (spec 2-pension-fund/04 §7).
 *
 * DUE ESCLUSIONI, UNA DOMANDA SOLA
 * Rendimenti risponde a "come sta andando il portafoglio che gestisco", non "quanto vale tutto
 * quello che possiedo" (quella è Storico). Due categorie di capitale non appartengono alla domanda:
 *
 *  - **Fondi pensione** (`AssetType 'pensionFund'`): capitale illiquido e non ribilanciabile,
 *    alimentato da versamenti (TFR/datoriale/volontario) invece che da attività di mercato.
 *    Includerlo distorce TWR, Sharpe, volatilità, Max Drawdown, ROI e CAGR.
 *  - **Asset `allocationRole: 'excluded'`** (tipicamente la casa in cui vivi): valutati a mano,
 *    fermi per mesi e poi aggiornati con uno scalino. Dentro le metriche di rischio fanno due danni
 *    opposti — deprimono la volatilità mentre il valore resta fermo, e generano un mese-fantasma
 *    quando la stima viene aggiornata.
 *
 * Entrambe sono attivabili/disattivabili dall'utente (Impostazioni → Preferenze), ma il default
 * esclude entrambe: è la base onesta.
 *
 * PERCHÉ SI LEGGE `byAsset` E NON `byAssetClass`
 * Il valore di un fondo pensione può essere già spalmato su equity/bonds dentro `byAssetClass` per
 * via del look-through di `composition` (`calculateCurrentAllocation` — la stessa funzione che
 * produce sia il denominatore di Allocazione sia il `byAssetClass` dello snapshot), quindi
 * sottrarre da lì richiederebbe di sapere esattamente in quali bucket è finito. `byAsset` porta il
 * valore totale sotto il suo `assetId`, indipendentemente da come è stato fatto lo split.
 *
 * IL BACKFILL, E PERCHÉ SERVE (fix 2026-07-27)
 * `byAsset` è popolato solo dagli snapshot generati dal cron; quelli storici creati a mano non ce
 * l'hanno. La prima versione di questo modulo sottraeva l'esclusione solo dove `byAsset` esisteva:
 * il capitale escluso restava dentro il patrimonio fino all'ultimo mese senza breakdown e ne usciva
 * al primo mese con breakdown, producendo uno **scalino di base** letto come crollo di mercato.
 * Sui dati reali questo valeva −9,37% a novembre 2025 (fondo pensione da 23.597 € su 256.801 € di
 * patrimonio) contro un patrimonio che quel mese era cresciuto di 377 €, e teneva il Max Drawdown
 * inchiodato a −12,10% invece del −7% reale.
 *
 * La correzione: per i mesi **senza** `byAsset` si sottrae una costante `E₀`, il valore escluso del
 * primo mese che il breakdown ce l'ha. È corretto in due passaggi:
 *   1. dentro il blocco pre-breakdown la sottrazione è costante → non introduce nessun rendimento
 *      spurio (una costante si semplifica al numeratore di `(V_fine − CF) / V_inizio`);
 *   2. al giunto il salto vale `E₀ − E₀ = 0` → **artefatto nullo per costruzione**.
 *
 * Uno snapshot che HA `byAsset` ma non contiene l'asset non viene backfillato: quella è evidenza
 * genuina che l'asset non esisteva quel mese, e va sottratto 0.
 *
 * APPROSSIMAZIONE DICHIARATA: il backfill corregge il **denominatore** dei mesi storici, non il
 * **numeratore**. Il capitale escluso non valeva `E₀` tre anni fa, e soprattutto la sua variazione
 * in quei mesi (rivalutazione della casa, versamenti TFR/datoriali che non transitano da nessun
 * conto e quindi sono invisibili al cashflow) resta dentro il rendimento misurato. Non è
 * ricostruibile — quegli snapshot non hanno il dettaglio per strumento — ed è un errore di secondo
 * ordine rispetto allo scalino che sostituisce.
 *
 * `PerformanceBase` resta il seam minimale: due valori oggi — `portfolio` (applica le esclusioni) e
 * `netWorth` (tutto) — pronti a crescere senza riscrivere i chiamanti.
 *
 * KNOWN LIMITATION: un versamento VOLONTARIO è un trasferimento dal portafoglio (cassa) verso il
 * fondo escluso, quindi sulla base `portfolio` appare come un piccolo deflusso non neutralizzato.
 * TFR e datoriale non toccano mai il portafoglio e non sono interessati.
 */

import type { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { hasAssetBreakdown } from '@/lib/utils/snapshotAssetBreakdown';

export type PerformanceBase = 'portfolio' | 'netWorth';

/**
 * Cosa tenere DENTRO la base, letto dalle impostazioni utente. Entrambi i flag sono opt-in:
 * assenti (o `false`) significa "escludi", che è il default del prodotto.
 *
 * WARNING (checklist comment): i due chiamanti di `resolvePerformanceExclusions` devono passare
 * le STESSE opzioni, o un periodo CUSTOM finisce per disaccordarsi con le metriche precalcolate —
 * `lib/services/performanceService.ts` (`getAllPerformanceData`) e
 * `app/dashboard/performance/page.tsx` (`cachedSnapshots`).
 */
export interface PerformanceBaseOptions {
  /** `true` = i fondi pensione restano nella base. Default `false`. */
  includePensionFunds?: boolean;
  /** `true` = gli asset `allocationRole: 'excluded'` restano nella base. Default `false`. */
  includeExcludedAssets?: boolean;
}

/**
 * Traduce le impostazioni salvate in opzioni della base.
 *
 * Esiste per un motivo solo: i due chiamanti devono leggere gli STESSI campi con gli STESSI default.
 * Un'impostazione assente (account mai configurato) vale `false` su entrambi i flag, cioè la base
 * esclusiva — mai dedurre il contrario dal silenzio.
 */
export function resolvePerformanceBaseOptions(
  settings: AssetAllocationSettings | null | undefined
): PerformanceBaseOptions {
  return {
    includePensionFunds: settings?.performanceIncludesPensionFunds ?? false,
    includeExcludedAssets: settings?.performanceIncludesExcludedAssets ?? false,
  };
}

/**
 * Gli `assetId` da togliere dalla base, secondo le opzioni.
 *
 * Unica fonte di verità sulla composizione della base: entrambi i chiamanti passano di qui invece
 * di rifiltrare gli asset per conto proprio. Il ruolo di allocazione arriva da
 * `resolveAllocationRole` (che gestisce anche il flag legacy `excludeFromAllocation`), mai
 * reimplementato qui.
 *
 * @param assets - Tutti gli asset dell'account
 * @param options - Cosa tenere dentro (default: escludi fondi pensione e asset non allocati)
 * @returns Lista di assetId, senza duplicati (un fondo pensione marcato `excluded` compare una volta)
 */
export function resolvePerformanceExclusions(
  assets: Asset[],
  options: PerformanceBaseOptions = {}
): string[] {
  const { includePensionFunds = false, includeExcludedAssets = false } = options;
  if (includePensionFunds && includeExcludedAssets) return [];

  const excluded = new Set<string>();
  for (const asset of assets) {
    if (!includePensionFunds && asset.type === 'pensionFund') excluded.add(asset.id);
    if (!includeExcludedAssets && resolveAllocationRole(asset) === 'excluded') excluded.add(asset.id);
  }

  return [...excluded];
}

/** Somma il valore degli asset esclusi presenti nel breakdown di uno snapshot. */
function sumExcludedValue(snapshot: MonthlySnapshot, excludedIds: Set<string>): number {
  return (snapshot.byAsset ?? []).reduce(
    (sum, entry) => (excludedIds.has(entry.assetId) ? sum + entry.totalValue : sum),
    0
  );
}

/**
 * Il valore `E₀` da riportare indietro sui mesi privi di breakdown: quello del primo mese, in
 * ordine cronologico, che il breakdown ce l'ha. Zero quando nessuno snapshot ha `byAsset` (niente
 * da sottrarre, e niente scalino possibile).
 */
function resolveBackfillValue(snapshots: MonthlySnapshot[], excludedIds: Set<string>): number {
  const earliestWithBreakdown = [...snapshots]
    .filter(hasAssetBreakdown)
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))[0];

  return earliestWithBreakdown ? sumExcludedValue(earliestWithBreakdown, excludedIds) : 0;
}

/**
 * Proietta gli snapshot sulla base richiesta.
 *
 * Per `netWorth` gli snapshot tornano intatti. Per `portfolio` (default) il valore degli asset
 * esclusi viene tolto da `totalNetWorth` e `illiquidNetWorth` (sia i fondi pensione sia la prima
 * casa sono illiquidi): dal breakdown quando c'è, dal backfill costante quando manca — vedi la nota
 * sul backfill in testa al file.
 *
 * @param snapshots - Snapshot dell'account, in qualsiasi ordine (l'ordine di input è preservato)
 * @param excludedAssetIds - Da `resolvePerformanceExclusions`
 * @param base - `portfolio` applica le esclusioni, `netWorth` non tocca nulla
 */
export function toPerformanceBaseSnapshots(
  snapshots: MonthlySnapshot[],
  excludedAssetIds: string[],
  base: PerformanceBase = 'portfolio'
): MonthlySnapshot[] {
  if (base === 'netWorth' || excludedAssetIds.length === 0) return snapshots;
  const excludedIds = new Set(excludedAssetIds);
  const backfillValue = resolveBackfillValue(snapshots, excludedIds);

  return snapshots.map((snapshot) => {
    const excludedValue = hasAssetBreakdown(snapshot)
      ? sumExcludedValue(snapshot, excludedIds)
      : backfillValue;
    if (!excludedValue) return snapshot;

    return {
      ...snapshot,
      totalNetWorth: snapshot.totalNetWorth - excludedValue,
      illiquidNetWorth: Math.max(0, snapshot.illiquidNetWorth - excludedValue),
    };
  });
}
