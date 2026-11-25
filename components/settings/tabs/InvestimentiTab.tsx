'use client';

/**
 * Impostazioni › Investimenti (`investimenti`) — the rules the wealth is MEASURED with: which
 * capital the returns count, the risk-free rate (Sharpe's, Sortino's and the age formula of
 * Allocazione › Strategia read it from here, D-RU24), the stamp duty, and whether the home sits in
 * the wealth the FIRE plan simulates. The class targets and the model's criteria are Strategia's
 * and the plan is FIRE › Il mio piano's: they are named in «Si regola altrove», never copied
 * into a read-only tile (D-RU20).
 *
 * A controlled view of the `investimenti` slice: `slice` in, `onChange(patch)` out.
 */

import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import type { RiskFreeResolution } from '@/lib/utils/riskFreeRate';
import { describeCosts, describePerformanceBase, describeRiskFreeSource } from '@/lib/utils/settingsNarrative';
import { NO_SELECTION, STRATEGIA_TARGETS_HREF, type InvestimentiSlice } from '@/lib/utils/settingsDraft';
import { ElsewhereLine, INTERACTIVE_CONTROL_CLASS, SettingsTabPanel } from './shared';

const ELSEWHERE = [
  { what: 'Target per classe e criteri del modello', where: 'Allocazione › Strategia', href: STRATEGIA_TARGETS_HREF },
  { what: 'Piano FIRE (età, spesa, SWR, fondo, flussi, pensioni)', where: 'FIRE › Il mio piano', href: '/dashboard/fire-simulations?piano=aperto' },
];

export interface InvestimentiTabProps {
  slice: InvestimentiSlice;
  onChange: (patch: Partial<InvestimentiSlice>) => void;
  /** Liquidità's subcategory names when its sub-targets are on (as saved), else empty — the Costi select reads Strategia's rows. */
  cashSubCategories: string[];
  /** The ECB estimate of the risk-free rate: what the field follows while nothing is typed (`resolveRiskFreeEstimate`). */
  riskFreeEstimate: RiskFreeResolution;
}

export function InvestimentiTab({ slice, onChange, cashSubCategories, riskFreeEstimate }: InvestimentiTabProps) {
  const {
    performanceIncludesPensionFunds, performanceIncludesExcludedAssets, performanceExcludesCash, pensionReturnStartMonth,
    riskFreeRate, stampDutyEnabled, stampDutyRate, checkingAccountSubCategory, includePrimaryResidenceInFIRE,
  } = slice;

  return (
    <SettingsTabPanel tab="investimenti" label="Investimenti">
      {/* Calcolo dei rendimenti — measurement base + pension-return start month */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6 desktop:row-span-2')}>
        <Tile
          eyebrow="Calcolo dei rendimenti"
          aside="Rendimenti"
          reading={describePerformanceBase({
            includesPensionFunds: performanceIncludesPensionFunds,
            includesExcludedAssets: performanceIncludesExcludedAssets,
            excludesCash: performanceExcludesCash,
            pensionReturnStartMonth,
          })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="performanceIncludesPensionFunds" className="text-[13px] font-medium">
                  Includi i fondi pensione
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Dentro dal mese in cui i versamenti sono tracciati: TFR, datoriale e busta paga sono flussi, non rendimento
                </p>
              </div>
              <Switch
                id="performanceIncludesPensionFunds"
                checked={performanceIncludesPensionFunds}
                onCheckedChange={(checked) => onChange({ performanceIncludesPensionFunds: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="performanceIncludesExcludedAssets" className="text-[13px] font-medium">
                  Includi gli asset esclusi
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  La casa valutata a mano non si muove mai: abbassa la volatilità e alza lo Sharpe
                </p>
              </div>
              <Switch
                id="performanceIncludesExcludedAssets"
                checked={performanceIncludesExcludedAssets}
                onCheckedChange={(checked) => onChange({ performanceIncludesExcludedAssets: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="performanceExcludesCash" className="text-[13px] font-medium">
                  Liquidità fuori dalla base
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  I conti escono dai rendimenti (restano nell&apos;Allocazione); un ETF monetario ha un prezzo e resta dentro. Gli acquisti pagati dai conti diventano flussi misurati
                </p>
              </div>
              <Switch
                id="performanceExcludesCash"
                checked={performanceExcludesCash}
                onCheckedChange={(checked) => onChange({ performanceExcludesCash: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            {/* The risk-free rate (RU8, D-ST4): typed, or the ECB estimate while empty, with the way back. */}
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="riskFreeRate" className="text-[13px] font-medium">Risk-free rate</Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  {describeRiskFreeSource({ typed: riskFreeRate, estimate: riskFreeEstimate })}
                  {riskFreeRate !== undefined && (
                    <>
                      {' '}
                      <button type="button" onClick={() => onChange({ riskFreeRate: undefined })} className={TILE_FOOTER_ACTION_CLASS}>
                        Torna alla stima
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  id="riskFreeRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={riskFreeRate ?? ''}
                  onChange={(e) => onChange({ riskFreeRate: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder={riskFreeEstimate.value.toFixed(2).replace('.', ',')}
                  className={cn('w-24 text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="pensionReturnStartMonth" className="text-[13px] font-medium">
                  Rendimento del fondo calcolabile da
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Se lo lasci vuoto, il rendimento parte dal primo versamento registrato.
                </p>
              </div>
              <Input
                id="pensionReturnStartMonth"
                type="month"
                value={pensionReturnStartMonth}
                onChange={(e) => onChange({ pensionReturnStartMonth: e.target.value })}
                className={cn('w-40 shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Le metriche si ricalcolano alla prossima visita di Rendimenti; il risk-free vale per Sharpe, Sortino
            e per la formula per età di{' '}
            <Link href={STRATEGIA_TARGETS_HREF} className={TILE_FOOTER_ACTION_CLASS}>
              Allocazione › Strategia
            </Link>
            .
          </div>
        </Tile>
      </div>

      {/* Costi e patrimonio — the stamp duty and the home in the FIRE wealth, ONE tile (2026-11-25), not stretched to Calcolo's height */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6 desktop:self-start')}>
        <Tile
          eyebrow="Costi e patrimonio"
          aside="stima annua"
          reading={describeCosts({ stampDutyEnabled, stampDutyRate, checkingAccountSubCategory })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <Label htmlFor="stampDutyToggle" className="text-[13px] font-medium">Imposta di bollo</Label>
              <Switch
                id="stampDutyToggle"
                checked={stampDutyEnabled}
                onCheckedChange={(checked) => onChange({ stampDutyEnabled: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            {stampDutyEnabled && (
              <div className="flex items-center justify-between gap-4 py-3">
                <Label htmlFor="stampDutyRate" className="text-[13px] font-medium">Aliquota</Label>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    id="stampDutyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={stampDutyRate}
                    onChange={(e) => onChange({ stampDutyRate: parseFloat(e.target.value) || 0 })}
                    placeholder="es. 0.20"
                    className={cn('w-24 text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            )}
            {stampDutyEnabled && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">Sottocategoria conti correnti</p>
                  <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                    Applica la soglia dei 5.000&nbsp;€ ai conti
                  </p>
                </div>
                {cashSubCategories.length > 0 ? (
                  <Select value={checkingAccountSubCategory} onValueChange={(value) => onChange({ checkingAccountSubCategory: value })}>
                    <SelectTrigger className={cn('w-44', INTERACTIVE_CONTROL_CLASS)} aria-label="Sottocategoria conti correnti">
                      <SelectValue placeholder="Seleziona sottocategoria…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SELECTION}>Nessuna (soglia non applicata)</SelectItem>
                      {cashSubCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-[11px] leading-[1.4] text-warning-foreground">
                    Configura le sottocategorie di Liquidità, in{' '}
                    <Link href={STRATEGIA_TARGETS_HREF} className={TILE_FOOTER_ACTION_CLASS}>
                      Allocazione › Strategia
                    </Link>
                    , per abilitarla.
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="firePrimaryResidence" className="text-[13px] font-medium">
                  Casa nel patrimonio FIRE
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  {includePrimaryResidenceInFIRE ? 'Il piano la conta come capitale da cui prelevare' : 'Lo standard FIRE la esclude'}
                </p>
              </div>
              <Switch
                id="firePrimaryResidence"
                checked={includePrimaryResidenceInFIRE}
                onCheckedChange={(checked) => onChange({ includePrimaryResidenceInFIRE: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Gli asset esenti si marcano dalla scheda dello strumento, in Patrimonio.
          </div>
        </Tile>
      </div>

      <ElsewhereLine items={ELSEWHERE} />
    </SettingsTabPanel>
  );
}
