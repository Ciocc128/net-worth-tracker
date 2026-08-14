/**
 * EntityDossier — the per-entity stats block rendered at the heart of the
 * Analisi drill-down (levels 2 and 3: a category, or one of its subcategories).
 *
 * WHY THIS EXISTS
 * The drill-down used to end in a period-scoped transaction list, so "how has
 * this entity changed over time?" (the condominio question) was unanswerable
 * without leaving the page. The dossier answers it in place: period total,
 * run-rate, a per-year table with signed deltas, and a 24-month trend.
 *
 * PERIOD SEMANTICS — deliberately split, each block declares its own horizon:
 * - Period-scoped: the hero total and its share of the period.
 * - Period-INDEPENDENT: the per-year table, the 12-month average and the
 *   monthly trend. They ignore the page's period axis on purpose — the period
 *   is a cursor over the entity's timeline, not a cage around it. This is what
 *   makes the dossier answer "this year vs last year" without ever holding two
 *   periods in state.
 *
 * All figures come from the pure, tested layer (lib/utils/expenseEntityStats).
 */
'use client';

import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Expense } from '@/types/expenses';
import {
  buildEntityMonthlySeries,
  buildEntityYearRows,
  computeEntityRunRate,
  type EntityScope,
  type EntityYearRow,
} from '@/lib/utils/expenseEntityStats';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';

// ── Shared chart styles (module-level, as-const — see AGENTS.md Recharts rules) ──

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = {
  fontWeight: 600,
  color: 'var(--card-foreground)',
} as const;

const TOOLTIP_ITEM_STYLE = {
  color: 'var(--card-foreground)',
} as const;

// Axis ticks are numbers/dates → the Mono Mandate applies, and a Tailwind class
// cannot reach Recharts' SVG <text>, so the family goes through the tick prop.
const CHART_TICK_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-geist-mono)',
  fill: 'var(--muted-foreground)',
} as const;

const EYEBROW_CLASS = 'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

// Resolves an expense's Italy-calendar month for the pure layer.
const monthOf = (expense: Expense): { year: number; month: number } => {
  const date = toDate(expense.date);
  return { year: getItalyYear(date), month: getItalyMonth(date) };
};

// ── DossierChip ──────────────────────────────────────────────────────────────
// Module-level component required by React Compiler (no nested components).

function DossierChip({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption?: string;
}) {
  return (
    <div className="bg-muted/40 rounded-xl p-3.5 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
        {label}
      </p>
      <p className="text-lg font-bold font-mono tabular-nums text-foreground leading-none break-words">
        {formatCurrency(value)}
      </p>
      {caption && <p className="text-[11px] text-muted-foreground mt-1.5">{caption}</p>}
    </div>
  );
}

// ── YearRow ──────────────────────────────────────────────────────────────────

/**
 * One row of the per-year table. The delta line inverts its sign colors for
 * spending entities (spending UP is bad → destructive), per the DESIGN.md
 * positiveGood rule.
 */
function YearRow({
  row,
  isIncome,
  historyStartYear,
}: {
  row: EntityYearRow;
  isIncome: boolean;
  historyStartYear: number;
}) {
  const deltaClass =
    row.delta === null || row.delta === 0
      ? 'text-muted-foreground'
      : (isIncome ? row.delta > 0 : row.delta < 0)
        ? 'text-positive'
        : 'text-destructive';

  // The partial year compares like-for-like ("stessi mesi"); a partial year whose
  // baseline predates the tracked history says so instead of showing a fake 0.
  const deltaLine = (() => {
    if (row.isPartial && row.prevSameMonthsTotal === null) {
      return <span className="text-muted-foreground">storico dal {historyStartYear}</span>;
    }
    if (row.delta === null) return <span className="text-muted-foreground">—</span>;
    const sign = row.delta > 0 ? '+' : '';
    const pct = row.deltaPercent !== null ? ` (${sign}${row.deltaPercent.toFixed(1)}%)` : '';
    const context = row.isPartial ? ` vs ${row.year - 1} stessi mesi` : ` vs ${row.year - 1}`;
    return (
      <span className={deltaClass}>
        {sign}
        {formatCurrency(row.delta)}
        {pct}
        <span className="text-muted-foreground">{context}</span>
      </span>
    );
  })();

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-medium font-mono tabular-nums text-foreground">{row.year}</span>
        {row.isPartial && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-px">
            YTD
          </span>
        )}
      </div>
      <div className="text-right min-w-0">
        <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
          {formatCurrency(row.total)}
        </p>
        <p className="text-[11px] font-mono tabular-nums">{deltaLine}</p>
      </div>
    </div>
  );
}

// ── EntityDossier ────────────────────────────────────────────────────────────

interface EntityDossierProps {
  /** Full expense history — the dossier floors it itself via historyStartYear. */
  allExpenses: Expense[];
  scope: EntityScope;
  /** Category color from the composition (theme-aware, resolved by the caller). */
  color: string;
  /** The page's period state — scopes ONLY the hero total and its share. */
  period: { year: number | null; month: number | null };
  periodLabel: string;
  historyStartYear: number;
  /** Inverts delta sign semantics: income up = good, spending up = bad. */
  isIncome: boolean;
}

export function EntityDossier({
  allExpenses,
  scope,
  color,
  period,
  periodLabel,
  historyStartYear,
  isIncome,
}: EntityDossierProps) {
  const now = { year: getItalyYear(), month: getItalyMonth() };

  const yearRows = useMemo(
    () => buildEntityYearRows(allExpenses, scope, historyStartYear, now, monthOf),
    // now derives from the clock: stable within a render session, deliberately not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allExpenses, scope, historyStartYear]
  );

  const runRate = useMemo(
    () => computeEntityRunRate(allExpenses, scope, period, historyStartYear, now, monthOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allExpenses, scope, period, historyStartYear]
  );

  const monthlySeries = useMemo(
    () => buildEntityMonthlySeries(allExpenses, scope, 24, historyStartYear, now, monthOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allExpenses, scope, historyStartYear]
  );

  const hasAnyData = yearRows.some(row => row.total > 0);
  const hasTrendData = monthlySeries.some(point => point.value > 0 || (point.prevYearValue ?? 0) > 0);
  const seriesName = isIncome ? 'Entrate' : 'Spesa';

  // A single-month period's "monthly average" IS the hero total — hide the chip.
  const showPeriodAverage = runRate.periodMonthlyAverage !== null && period.month === null;

  return (
    <div className="space-y-5">
      {/* Hero: the period-scoped total (the ONLY period-scoped figure with the share) */}
      <div>
        <p className={EYEBROW_CLASS}>Totale · {periodLabel}</p>
        <p className="text-[22px] font-bold font-mono tracking-[-0.025em] tabular-nums leading-none mt-1.5 text-foreground">
          {formatCurrency(runRate.periodTotal)}
        </p>
        {runRate.shareOfPeriodTotal !== null && runRate.periodTotal > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {/* The pure layer returns a 0-1 share (its tests pin that contract) — scaled here. */}
            {(runRate.shareOfPeriodTotal * 100).toFixed(1)}% {isIncome ? 'delle entrate' : 'delle spese'} del periodo
          </p>
        )}
        {runRate.periodTotal === 0 && hasAnyData && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Nessuna transazione nel periodo — la tabella sotto copre tutto lo storico.
          </p>
        )}
      </div>

      {!hasAnyData ? (
        <p className="text-sm text-muted-foreground">
          Nessuna transazione registrata per questa voce dal {historyStartYear}.
        </p>
      ) : (
        <>
          {/* Run-rate — period-independent except the first chip; grid per the
              Equal-Column Chip Rule (same-purpose chips share column widths) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {showPeriodAverage && (
              <DossierChip label="Media mensile (periodo)" value={runRate.periodMonthlyAverage ?? 0} />
            )}
            {/* "ultimi" declares the anchor (today) — under a past-year or Storico
                period this is NOT the selected period's monthly average. */}
            <DossierChip
              label="Media ultimi 12 mesi"
              value={runRate.trailing12MonthlyAverage}
              caption={runRate.observedMonths < 12 ? `ultimi ${runRate.observedMonths} mesi` : undefined}
            />
            {runRate.currentYearProjection !== null && (
              <DossierChip label={`Proiezione ${now.year}`} value={runRate.currentYearProjection} />
            )}
          </div>

          {/* Per anno — the year-over-year answer, period-independent */}
          <div>
            <p className={EYEBROW_CLASS}>Per anno</p>
            <div className="divide-y divide-border/60 mt-1">
              {yearRows.map(row => (
                <YearRow key={row.year} row={row} isIncome={isIncome} historyStartYear={historyStartYear} />
              ))}
            </div>
          </div>

          {/* Trend mensile — period-independent. Always rendered (AGENTS.md: rolling
              charts never disappear silently); the empty window states itself. */}
          <div>
            <p className={cn(EYEBROW_CLASS, 'mb-1')}>Trend mensile · ultimi 24 mesi</p>
            {hasTrendData ? (
              <>
                {/* Series legend as a normal-case caption — chart apparatus does not
                    belong inside a 10px uppercase eyebrow. */}
                <p className="text-[11px] text-muted-foreground mb-2">
                  La linea tratteggiata &egrave; lo stesso mese dell&apos;anno precedente.
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={monthlySeries} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={CHART_TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={formatCurrencyCompact}
                      tick={CHART_TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      // A null baseline (pre-floor month) is a gap, not a zero — the
                      // tooltip must not resurrect the fabricated 0 the series refused.
                      formatter={(value) => (value == null ? '—' : formatCurrency(Number(value)))}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
                    />
                    <Bar
                      dataKey="value"
                      name={seriesName}
                      fill={color}
                      animationDuration={600}
                      animationEasing="ease-out"
                      radius={[2, 2, 0, 0]}
                    />
                    {/* connectNulls stays false: pre-floor baseline months render as a gap. */}
                    <Line
                      dataKey="prevYearValue"
                      name="Anno precedente"
                      stroke="var(--muted-foreground)"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-3">
                Nessun movimento negli ultimi 24 mesi.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
