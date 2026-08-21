/**
 * Storico → "Composizione" chapter.
 *
 * Replaces two side-by-side cards ("Patrimonio per Asset Class" and "Liquidità vs Illiquidità"),
 * each with its own `€ | %` toggle, with a single card on one axis of choice.
 *
 * Three decisions are load-bearing here:
 *
 *  1. **One card, one pill.** Asset class and liquid/illiquid are not two questions — they are two
 *     cuts of the same euro. Two peer cards with two identically-labelled independent toggles
 *     produced four states and labelled none of them.
 *
 *  2. **The chart plots shares, never euro.** The chapter's question is the mix, and the mix is a
 *     percentage: band thickness IS the share, and the flat 100% top edge is a permanent check
 *     that the arithmetic closes. Euro figures did not disappear — they moved to the tooltip
 *     (per month) and the breakdown list (latest month), where they are more precise than any
 *     axis read. That pairing is what let the `€ | %` toggle be deleted rather than repaired;
 *     euro-over-time is already answered twice on this page, by Evoluzione and by Valore per
 *     strumento.
 *
 *  3. **The breakdown list is the legend.** A Recharts `<Legend>` carried no values, no order and
 *     no interaction, was `display:none` on mobile, and was replaced there by a second hand-built
 *     legend using different words for the same series. One ranked list, identical at every
 *     breakpoint, carries swatch + value + share + drift — and putting every number on the page as
 *     text is what makes `role="img"` on the chart honest rather than a way to hide it.
 *
 * The maths lives in `lib/utils/historyComposition.ts`; this file only renders.
 */
'use client';

import { useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Info } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import type { AssetClassHistoryPoint } from '@/lib/services/chartService';
import {
  buildAssetClassComposition,
  buildChartAriaLabel,
  buildLiquidityComposition,
  formatPeriodLabel,
  shareKey,
  valueKey,
  PENSION_BAND_KEY,
  RESIDUAL_BAND_KEY,
  type CompositionBand,
  type CompositionBreakdownEntry,
  type CompositionCut,
  type CompositionRow,
  type CompositionSeries,
  type LiquidityHistoryPoint,
} from '@/lib/utils/historyComposition';

/** The pill's options, typed to the domain rather than to its own labels. */
const COMPOSITION_CUTS: ReadonlyArray<{ value: CompositionCut; label: string }> = [
  { value: 'assetClass', label: 'Asset class' },
  { value: 'liquidity', label: 'Liquidità' },
];

/**
 * A band with no palette slot is the unattributed remainder, which must read as absence rather
 * than as one more holding — hence a neutral fill instead of the next hue in the ramp.
 */
function resolveBandColor(band: CompositionBand, chartColors: string[]): string {
  if (band.colorIndex === null) return 'var(--muted-foreground)';
  return chartColors[band.colorIndex] ?? `var(--chart-${(band.colorIndex % 5) + 1})`;
}

/** Tooltip surface tokens. Module-level `as const`: a fresh literal per render re-mounts it. */
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
} as const;

interface CompositionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: CompositionRow }>;
  bands: CompositionBand[];
  chartColors: string[];
}

/**
 * The month's balance sheet, not a list of series.
 *
 * It leads with the total so the parts have a whole to belong to, ranks rows by share instead of
 * by declaration order, drops empty bands (a `0,00 €` row is noise that grows with every class
 * added), and prints BOTH units on every row — which is precisely what makes the deleted `€ | %`
 * toggle unnecessary rather than merely absent.
 *
 * Module-level, per the Recharts rule: an inline arrow is a new component type every render.
 */
function CompositionTooltip({ active, payload, bands, chartColors }: CompositionTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const entries = bands
    .map((band) => ({
      band,
      share: (row[shareKey(band.key)] as number) ?? 0,
      value: (row[valueKey(band.key)] as number) ?? 0,
    }))
    .filter((entry) => entry.share > 0.05)
    .sort((a, b) => b.share - a.share);

  return (
    <div style={TOOLTIP_CONTENT_STYLE}>
      <p className="text-[13px] font-semibold text-card-foreground">
        {formatPeriodLabel(row.month as number, row.year as number)}
      </p>
      <p className="mt-0.5 font-mono text-[13px] tabular-nums text-card-foreground">
        {formatCurrency(row.totalNetWorth as number)}
      </p>
      <div className="mt-2 space-y-1 border-t border-border pt-2">
        {entries.map(({ band, share, value }) => (
          <div key={band.key} className="flex items-center gap-2 text-[12px]">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: resolveBandColor(band, chartColors) }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{band.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-card-foreground">
              {formatCurrency(value)}
            </span>
            <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
              {formatPercentage(share, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Italian separators: every other number in the row is `Intl('it-IT')`, and `toFixed` would put a
 * dot next to a comma in the same monospace line.
 */
const PP_FORMATTER = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Drift in percentage points.
 *
 * Deliberately NOT rendered with the sign tokens: `text-positive` / `text-destructive` mean gain
 * and loss, and a class gaining share is neither. Colouring it would assert a judgement the
 * chapter has no target to justify — that verdict belongs to Allocazione, which knows the target.
 */
function DriftAnnotation({ deltaPp }: { deltaPp: number | null }) {
  if (deltaPp === null) {
    return (
      <span className="w-[72px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/60">
        –
      </span>
    );
  }
  const sign = deltaPp > 0 ? '+' : deltaPp < 0 ? '−' : '';
  return (
    <span className="w-[72px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
      {sign}
      {PP_FORMATTER.format(Math.abs(deltaPp))} pp
    </span>
  );
}

/**
 * One breakdown row, in two layouts.
 *
 * Four values (name, euro, share, drift) do not fit one 390px line: squeezing them truncated
 * "Obbligazioni" to "Obbl…", which defeats the point of replacing the mobile legend that used
 * abbreviations. Below `tablet:` the row is two lines — identity and share on top, the euro figure
 * and the drift beneath — so the WORDS stay identical to desktop and only the arrangement changes.
 * Duplicated markup is the house prescription here over one implementation that degrades at both
 * sizes (DESIGN.md → Do's).
 */
function BreakdownRow({
  entry,
  chartColors,
}: {
  entry: CompositionBreakdownEntry;
  chartColors: string[];
}) {
  const swatch = (
    <span
      className="h-2 w-2 shrink-0 rounded-[2px]"
      style={{
        background: resolveBandColor(
          { key: entry.key, label: entry.label, colorIndex: entry.colorIndex },
          chartColors
        ),
      }}
    />
  );

  return (
    <div className="py-2">
      {/* Mobile: two lines */}
      <div className="tablet:hidden">
        <div className="flex items-center gap-2.5">
          {swatch}
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.label}</span>
          <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
            {formatPercentage(entry.sharePct, 1)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between pl-[18px]">
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {formatCurrency(entry.valueEur)}
          </span>
          <DriftAnnotation deltaPp={entry.deltaPp} />
        </div>
      </div>

      {/* Tablet and up: one line */}
      <div className="hidden items-center gap-2.5 tablet:flex">
        {swatch}
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.label}</span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
          {formatCurrency(entry.valueEur)}
        </span>
        <span className="w-16 shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
          {formatPercentage(entry.sharePct, 1)}
        </span>
        <DriftAnnotation deltaPp={entry.deltaPp} />
      </div>
    </div>
  );
}

interface CompositionSectionProps {
  assetClassHistory: AssetClassHistoryPoint[];
  liquidityHistory: LiquidityHistoryPoint[];
  /** True when the user holds at least one `pensionFund` asset — gates the approximation note. */
  hasPensionFunds: boolean;
}

export function CompositionSection({
  assetClassHistory,
  liquidityHistory,
  hasPensionFunds,
}: CompositionSectionProps) {
  const [cut, setCut] = useState<CompositionCut>('assetClass');
  const chartColors = useChartColors();
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isLandscape = useMediaQuery(
    '(min-width: 568px) and (max-height: 500px) and (orientation: landscape)'
  );

  const assetClassSeries = useMemo(
    () => buildAssetClassComposition(assetClassHistory),
    [assetClassHistory]
  );
  const liquiditySeries = useMemo(
    () => buildLiquidityComposition(liquidityHistory),
    [liquidityHistory]
  );

  const series: CompositionSeries = cut === 'assetClass' ? assetClassSeries : liquiditySeries;
  const chartHeight = isLandscape ? 260 : isMobile ? 240 : 320;

  const hasData = series.rows.length > 0;
  const showsPensionBand =
    hasPensionFunds && series.bands.some((band) => band.key === PENSION_BAND_KEY);
  const showsResidualBand = series.bands.some((band) => band.key === RESIDUAL_BAND_KEY);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Quota sul patrimonio
            </p>
            {/* The window the figures describe, stated on the surface that uses them. */}
            <p className="mt-1 text-sm text-muted-foreground">
              {hasData
                ? `Da ${formatPeriodLabel(series.rows[0].month as number, series.rows[0].year as number)} a ${series.latestPeriodLabel}`
                : 'Nessun periodo disponibile'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedPill
              options={COMPOSITION_CUTS}
              value={cut}
              onChange={setCut}
              layoutId="history-composition-cut"
              ariaLabel="Taglio della composizione"
            />
            {showsPensionBand && (
              <Popover>
                <PopoverTrigger
                  aria-label="Come viene calcolata la banda Previdenza"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="h-4 w-4" />
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm">
                  <p className="font-semibold text-foreground">Previdenza</p>
                  <p className="mt-1.5 text-muted-foreground">
                    Il fondo pensione compare come banda a sé e viene scorporato dalle classi in
                    cui era stato ripartito. Lo scorporo usa la composizione{' '}
                    <strong className="text-foreground">attuale</strong> del fondo applicata ai mesi
                    passati, perché la composizione storica non viene salvata: sui mesi lontani è
                    quindi una stima, non una misura.
                  </p>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <div className="flex h-52 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm text-muted-foreground">Nessuno storico disponibile.</p>
            <p className="text-xs text-muted-foreground/80">
              Gli snapshot mensili vengono creati automaticamente: la composizione compare dal primo
              rilevamento.
            </p>
          </div>
        ) : (
          <>
            <ResponsiveContainer
              key={`${cut}-${isLandscape ? 'landscape' : 'portrait'}`}
              width="100%"
              height={chartHeight}
            >
              <AreaChart
                data={series.rows}
                // `right` is not padding: `interval="preserveStartEnd"` centres the last tick on
                // the final data point, which sits ON the plot's right edge, so half the label
                // falls outside the SVG without room reserved for it. `left` stays at 0 even on
                // mobile — a negative margin there clips the "100%" tick down to "0%", which reads
                // as a wrong number rather than as a cropped one.
                margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
                role="img"
                aria-label={buildChartAriaLabel(cut, series)}
                accessibilityLayer={false}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={CHART_TICK_STYLE}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={isMobile ? 40 : 24}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(value: number) => `${value}%`}
                  tick={CHART_TICK_STYLE}
                  axisLine={false}
                  tickLine={false}
                  width={isMobile ? 44 : 48}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                  content={
                    <CompositionTooltip bands={series.bands} chartColors={chartColors} />
                  }
                />
                {series.bands.map((band) => {
                  const color = resolveBandColor(band, chartColors);
                  return (
                    <Area
                      key={band.key}
                      type="monotone"
                      dataKey={shareKey(band.key)}
                      name={band.label}
                      // The stack is what makes this a composition rather than seven overlapping
                      // shapes. Safe here because no band can be negative: asset values are
                      // non-negative by construction and the shares are floored at 0.
                      stackId="composition"
                      stroke={color}
                      fill={color}
                      fillOpacity={0.75}
                      strokeWidth={1}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>

            {/* The legend, carrying the numbers the chart cannot. Same words at every breakpoint. */}
            <div className="mt-4 divide-y divide-border/60 border-t border-border/60">
              {series.breakdown.map((entry) => (
                <BreakdownRow key={entry.key} entry={entry} chartColors={chartColors} />
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Valori e quote dell&apos;ultimo mese; l&apos;ultima colonna è la variazione della
              quota rispetto allo stesso mese dell&apos;anno precedente, in punti percentuali.
              {showsResidualBand && (
                <>
                  {' '}
                  <strong className="font-medium text-foreground">Non attribuito</strong> è la parte
                  del patrimonio che gli snapshot non riescono a ripartire in questo taglio.
                </>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
