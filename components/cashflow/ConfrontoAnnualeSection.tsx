/**
 * Year-over-year comparison section for AnalisiTab — always visible.
 *
 * Display variants by periodMode:
 * - current/year: user-selectable comparison year ("vs" Select) with two views —
 *   'mensile' (side-by-side monthly bars) and 'categoria' (signed delta ranking:
 *   which categories DROVE the difference, not two bars per category).
 * - history: multi-year annual totals bar chart.
 *
 * All windowing and magnitudes come from lib/utils/comparisonDeltas.ts — the
 * same-months rule and the baseline caption are produced by the module, never
 * rebuilt here, so this section cannot diverge from the KPI pacing row.
 *
 * Colors: chartColors[0] = current year, chartColors[1] = comparison year
 * (useChartColors, per AGENTS.md). Delta rows use the sign tokens with inverted
 * spending semantics: delta > 0 (spending grew) is destructive.
 */
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { type Expense, type ExpenseType } from '@/types/expenses';
import {
  buildCategoryComparison,
  computeTotalsPacing,
  resolveComparisonScope,
  type CategoryDeltaRow,
} from '@/lib/utils/comparisonDeltas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { type PeriodMode } from '@/components/cashflow/AnalisiTab';
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

// ── Module-level helpers ──────────────────────────────────────────────────────

/** Resolves an expense's Italy-calendar bucket for the pure comparison layer. */
const monthOf = (expense: Expense): { year: number; month: number } => {
  const date = toDate(expense.date);
  return { year: getItalyYear(date), month: getItalyMonth(date) };
};

/** Intl already emits the minus sign; only the plus needs to be added. */
const formatSignedCurrency = (value: number): string =>
  `${value > 0 ? '+' : ''}${formatCurrency(value)}`;

const formatSignedPercent = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

// Spending sign semantics are inverted (DESIGN.md): a positive delta means
// spending grew → destructive; a drop is good → positive token.
const deltaTextClass = (delta: number): string =>
  delta > 0 ? 'text-destructive' : delta < 0 ? 'text-positive' : 'text-muted-foreground';

/** e.g. "Casa, più 320 euro rispetto al 2025" — spoken form of a delta row. */
function deltaRowAriaLabel(row: CategoryDeltaRow, comparisonYear: number): string {
  const status =
    row.status === 'new' ? ', nuova' : row.status === 'gone' ? ', cessata' : '';
  if (row.delta === 0) return `${row.label}${status}, invariata rispetto al ${comparisonYear}`;
  const direction = row.delta > 0 ? 'più' : 'meno';
  const amount = Math.round(Math.abs(row.delta)).toLocaleString('it-IT');
  return `${row.label}${status}, ${direction} ${amount} euro rispetto al ${comparisonYear}`;
}

/** Ranking rows shown before the "Altre N voci" footer takes over. */
const MAX_DELTA_ROWS = 10;

// ── MensileBarChart ───────────────────────────────────────────────────────────

/**
 * Side-by-side monthly bar chart for YoY comparison.
 * Colors: colors[0] = current year, colors[1] = comparison year.
 */
function MensileBarChart({
  data,
  currentYear,
  comparisonYear,
  colors,
}: {
  data: Array<{ month: string; current: number; comparison: number }>;
  currentYear: number;
  comparisonYear: number;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        barCategoryGap="20%"
        barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value ?? 0)),
            name === 'current' ? currentYear.toString() : comparisonYear.toString(),
          ]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Legend
          formatter={(value) =>
            value === 'current' ? currentYear.toString() : comparisonYear.toString()
          }
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        />
        <Bar
          dataKey="current"
          fill={colors[0]}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="comparison"
          fill={colors[1]}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── CategoryDeltaList ─────────────────────────────────────────────────────────

/**
 * Signed delta ranking — the drivers of the YoY difference, biggest movers first.
 * Each row is a button that opens the category's dossier. The track fill scales
 * on |delta| against the largest mover; color follows the inverted spending rule.
 */
function CategoryDeltaList({
  rows,
  comparisonYear,
  onCategoryFocus,
}: {
  rows: CategoryDeltaRow[];
  comparisonYear: number;
  onCategoryFocus: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
        Nessuna spesa da confrontare in questo periodo
      </div>
    );
  }

  const visible = rows.slice(0, MAX_DELTA_ROWS);
  const hidden = rows.slice(MAX_DELTA_ROWS);
  // Rows arrive sorted by |delta| descending, so the first row carries the scale.
  const maxAbsDelta = Math.abs(visible[0].delta) || 1;
  const hiddenDelta = hidden.reduce((sum, row) => sum + row.delta, 0);

  return (
    <div>
      <ul className="-mx-2">
        {visible.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() =>
                onCategoryFocus({ expenseType: row.expenseType, categoryKey: row.categoryKey })
              }
              aria-label={deltaRowAriaLabel(row, comparisonYear)}
              className="grid w-full grid-cols-[minmax(0,1fr)_1fr_auto] items-center gap-x-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm">{row.label}</span>
                {row.status !== 'ongoing' && (
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                    {row.status === 'new' ? 'Nuova' : 'Cessata'}
                  </Badge>
                )}
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {row.delta !== 0 && (
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(Math.abs(row.delta) / maxAbsDelta) * 100}%`,
                      // Sanctioned sign tokens as raw CSS vars (inline style
                      // cannot take a Tailwind class) — inverted spending rule.
                      backgroundColor:
                        row.delta > 0 ? 'var(--destructive)' : 'var(--positive)',
                    }}
                  />
                )}
              </span>
              <span className="text-right">
                <span
                  className={cn('block font-mono text-sm tabular-nums', deltaTextClass(row.delta))}
                >
                  {formatSignedCurrency(row.delta)}
                </span>
                <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                  {row.deltaPercent === null ? '—' : formatSignedPercent(row.deltaPercent)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {hidden.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {hidden.length === 1 ? "Un'altra voce" : `Altre ${hidden.length} voci`} ·{' '}
          <span className="font-mono tabular-nums">Δ {formatSignedCurrency(hiddenDelta)}</span>
        </p>
      )}
    </div>
  );
}

// ── HistoryLineChart ──────────────────────────────────────────────────────────

/**
 * Multi-year annual totals bar chart for historical mode.
 * Single bar per year — no side-by-side comparison needed.
 */
function HistoryLineChart({
  data,
  colors,
}: {
  data: Array<{ year: string; spese: number }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="year" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Spese']}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Bar
          dataKey="spese"
          fill={colors[0]}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── ConfrontoAnnualeSection ───────────────────────────────────────────────────

interface ConfrontoAnnualeSectionProps {
  allExpenses: Expense[];
  /** null only when periodMode === 'history' */
  selectedYear: number | null;
  selectedMonth: number | null;
  periodMode: PeriodMode;
  historyStartYear: number;
  /** Years that have any data, descending (the integrator passes availableYears). */
  availableDataYears: number[];
  /** Focus a category's dossier (drill-down) from a delta row click. */
  onCategoryFocus: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

export function ConfrontoAnnualeSection({
  allExpenses,
  selectedYear,
  selectedMonth,
  periodMode,
  historyStartYear,
  availableDataYears,
  onCategoryFocus,
}: ConfrontoAnnualeSectionProps) {
  const chartColors = useChartColors();
  const [viewMode, setViewMode] = useState<'mensile' | 'categoria'>('mensile');
  const [comparisonYearChoice, setComparisonYearChoice] = useState<number | null>(null);

  // ── Derived year labels ───────────────────────────────────────────────────

  const currentYearLabel = useMemo(() => {
    if (periodMode === 'current') return getItalyYear();
    if (periodMode === 'year' && selectedYear !== null) return selectedYear;
    return null;
  }, [periodMode, selectedYear]);

  // availableDataYears is already floored to historyStartYear upstream, so
  // filtering to "before the year under review" is the only constraint left.
  const comparisonOptions = useMemo(() => {
    if (currentYearLabel === null) return [];
    return availableDataYears.filter((year) => year < currentYearLabel);
  }, [availableDataYears, currentYearLabel]);

  // The user's pick survives only while it is a valid option (switching the
  // period can invalidate it); otherwise fall back to the natural baseline
  // (previous year), then to the newest year available.
  const comparisonYear = useMemo(() => {
    if (comparisonYearChoice !== null && comparisonOptions.includes(comparisonYearChoice)) {
      return comparisonYearChoice;
    }
    if (currentYearLabel !== null && comparisonOptions.includes(currentYearLabel - 1)) {
      return currentYearLabel - 1;
    }
    return comparisonOptions[0] ?? null;
  }, [comparisonYearChoice, comparisonOptions, currentYearLabel]);

  // ── Month scope ───────────────────────────────────────────────────────────
  // Resolved by the pure module — the SAME resolver the KPI pacing row uses, so
  // every consumer below (subtitle, monthly bars, delta ranking) windows both
  // years through one rule. Null for history mode and for a selected month that
  // has not started yet (nothing honest to compare).

  const scope = useMemo(
    () => resolveComparisonScope(periodMode, selectedMonth, getItalyMonth()),
    [selectedMonth, periodMode]
  );

  /** A month picked in "Anno Corrente" that has not started yet — declared, not compared. */
  const isFutureMonth = periodMode !== 'history' && scope === null;

  // ── hasComparisonData ─────────────────────────────────────────────────────
  // history mode needs ≥2 distinct years; current/year needs a selectable
  // comparison year (availableDataYears only lists years that have data) AND a
  // comparable window.

  const hasComparisonData = useMemo(() => {
    if (periodMode === 'history') {
      const years = new Set(allExpenses.map((e) => getItalyYear(toDate(e.date))));
      return years.size >= 2;
    }
    return comparisonYear !== null && scope !== null;
  }, [allExpenses, periodMode, comparisonYear, scope]);

  // ── Totals pacing — the module owns the baseline caption ──────────────────

  const pacing = useMemo(() => {
    if (periodMode === 'history' || currentYearLabel === null || comparisonYear === null || scope === null) {
      return null;
    }
    return computeTotalsPacing(allExpenses, currentYearLabel, comparisonYear, scope, monthOf);
  }, [allExpenses, periodMode, currentYearLabel, comparisonYear, scope]);

  // ── mensileData ───────────────────────────────────────────────────────────
  // Spending totals per month for both years, months derived from the scope.
  // Future months in 'current' mode stay 0 (no bars rendered by Recharts).

  const mensileData = useMemo(() => {
    if (periodMode === 'history' || currentYearLabel === null || comparisonYear === null || scope === null) {
      return [];
    }

    const monthsToShow =
      scope.kind === 'singleMonth'
        ? [scope.month]
        : Array.from(
            { length: scope.kind === 'sameMonths' ? scope.upToMonth : 12 },
            (_, i) => i + 1,
          );

    const currentTotals = new Map<number, number>();
    const comparisonTotals = new Map<number, number>();
    for (const expense of allExpenses) {
      if (expense.type === 'income' || expense.type === 'transfer') continue;
      const { year, month } = monthOf(expense);
      const target =
        year === currentYearLabel
          ? currentTotals
          : year === comparisonYear
            ? comparisonTotals
            : null;
      if (!target) continue;
      target.set(month, (target.get(month) ?? 0) + Math.abs(expense.amount));
    }

    return monthsToShow.map((month) => ({
      // MONTH_NAMES is 0-indexed; slice to 3 chars for axis labels ("Gennaio" → "Gen").
      month: MONTH_NAMES[month - 1].slice(0, 3),
      current: currentTotals.get(month) ?? 0,
      comparison: comparisonTotals.get(month) ?? 0,
    }));
  }, [allExpenses, periodMode, currentYearLabel, comparisonYear, scope]);

  // ── deltaRows — the "driver del delta" ranking ────────────────────────────

  const deltaRows = useMemo(() => {
    if (periodMode === 'history' || currentYearLabel === null || comparisonYear === null || scope === null) {
      return [];
    }
    return buildCategoryComparison(allExpenses, currentYearLabel, comparisonYear, scope, monthOf);
  }, [allExpenses, periodMode, currentYearLabel, comparisonYear, scope]);

  // ── multiYearData ─────────────────────────────────────────────────────────
  // Annual expense totals from historyStartYear forward — used only in history mode.

  const multiYearData = useMemo(() => {
    if (periodMode !== 'history') return [];

    const years = new Set(allExpenses.map((e) => getItalyYear(toDate(e.date))));
    // Oldest first: time flows left-to-right, like every other chart on the page.
    return Array.from(years)
      .filter((y) => y >= historyStartYear)
      .sort((a, b) => a - b)
      .map((year) => ({
        year: year.toString(),
        spese: allExpenses
          .filter(
            (e) =>
              e.type !== 'income' &&
              e.type !== 'transfer' &&
              getItalyYear(toDate(e.date)) === year,
          )
          .reduce((s, e) => s + Math.abs(e.amount), 0),
      }));
  }, [allExpenses, periodMode, historyStartYear]);

  // Type assertions are safe: currentYearLabel/comparisonYear are non-null
  // whenever periodMode !== 'history' and hasComparisonData is true.
  const safeCurrentYear = currentYearLabel as number;
  const safeComparisonYear = comparisonYear as number;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Confronto Annuale
          </CardTitle>

          {/* Controls only outside history mode (which has its own single-chart
              layout) and only when a comparison year exists to control. */}
          {periodMode !== 'history' && comparisonYear !== null && (
            <div className="flex items-center flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">vs</span>
                <Select
                  value={String(comparisonYear)}
                  onValueChange={(value) => setComparisonYearChoice(Number(value))}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Anno di confronto"
                    className="w-[84px] font-mono tabular-nums text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {comparisonOptions.map((year) => (
                      <SelectItem
                        key={year}
                        value={String(year)}
                        className="font-mono tabular-nums"
                      >
                        {String(year)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <SegmentedPill
                ariaLabel="Vista confronto"
                layoutId="confronto-view-pill"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: 'mensile', label: 'Mensile' },
                  { value: 'categoria', label: 'Per Categoria' },
                ]}
              />
            </div>
          )}
        </div>

        {/* Baseline caption comes verbatim from the module — never rebuilt here. */}
        {pacing && currentYearLabel !== null && (
          <p className="text-xs font-mono tabular-nums text-muted-foreground">
            {currentYearLabel} {pacing.baselineLabel}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Placeholder when no honest comparison exists — each cause states itself */}
        {!hasComparisonData && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            {periodMode === 'history'
              ? 'Servono almeno 2 anni di dati per il confronto'
              : isFutureMonth
                ? 'Il mese selezionato non è ancora iniziato'
                : 'Servono dati di un anno precedente per il confronto'}
          </div>
        )}

        {/* History mode: multi-year totals — no year toggle */}
        {periodMode === 'history' && hasComparisonData && (
          <HistoryLineChart data={multiYearData} colors={chartColors} />
        )}

        {/* Current/year mode: monthly side-by-side bars */}
        {periodMode !== 'history' && hasComparisonData && viewMode === 'mensile' && (
          <MensileBarChart
            data={mensileData}
            currentYear={safeCurrentYear}
            comparisonYear={safeComparisonYear}
            colors={chartColors}
          />
        )}

        {/* Current/year mode: signed delta ranking — the drivers of the difference */}
        {periodMode !== 'history' && hasComparisonData && viewMode === 'categoria' && (
          <CategoryDeltaList
            rows={deltaRows}
            comparisonYear={safeComparisonYear}
            onCategoryFocus={onCategoryFocus}
          />
        )}

        {/* Honesty caption: comparing against the first tracked year may cut data */}
        {periodMode !== 'history' && hasComparisonData && comparisonYear === historyStartYear && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Storico dal <span className="font-mono tabular-nums">{historyStartYear}</span>: il
            confronto potrebbe essere parziale.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
