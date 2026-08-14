/**
 * Unified cashflow analysis tab
 *
 * THREE PERIOD MODES:
 * - "Anno Corrente": current year, all months (selectedYear = current, selectedMonth = null)
 * - "Anno": user-selected past year + optional month
 * - "Storico": all available data (selectedYear = null)
 *
 * DRILL-DOWN = ENTITY FOCUS (2026-08-14 redesign):
 * Level 1 (category) → Level 2 (subcategory) → Level 3 (expenseList).
 * Levels 2/3 lead with an EntityDossier — period total, run-rate, per-year table
 * with signed deltas, 24-month trend — whose multi-year blocks deliberately IGNORE
 * the period axis (the period is a cursor over the entity's timeline, not a cage).
 * Consequently the focus SURVIVES period changes and is exited only via
 * breadcrumb/Indietro. Every entry point lands through one path
 * (handleEntitySelect): composition row click, EntitySearch ("Vai a categoria…"),
 * anomaly chips, Confronto delta rows.
 *
 * URL: the period (?period&year&month) AND the focused entity
 * (?focusType&focusCat&focusSub — three flat params, no composite strings) both
 * round-trip through the querystring, so an entity check is a bookmarkable link.
 * This is the declared reversal of the earlier "no drill state in the URL"
 * decision, in the one form it left open: a SINGLE entity, never two machines.
 * The Sankey's internal drill state stays out of the URL.
 *
 * IA: KPI trio (with YoY pacing rows from comparisonDeltas — the same module the
 * Confronto section reads, so the same-months rule cannot diverge) → Anomalie →
 * Spese Maggiori → Sankey + composizioni (with dossier) → Confronto (promoted,
 * arbitrary comparison year + per-category delta ranking) → Collapsible
 * "Dettaglio" (Andamento Storico in history mode, Andamento Risparmio).
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MONTH_NAMES } from '@/lib/constants/months';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Expense,
  ExpenseCategory,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
} from '@/types/expenses';
import { calculateTotalExpenses, calculateTotalIncome } from '@/lib/services/expenseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronLeft, ExternalLink } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatCurrency } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { CashflowSankeyChart } from '@/components/cashflow/CashflowSankeyChart';
import { ConfrontoAnnualeSection } from '@/components/cashflow/ConfrontoAnnualeSection';
import { SavingsRateTrendSection } from '@/components/cashflow/SavingsRateTrendSection';
import { AndamentoStoricoSection } from '@/components/cashflow/AndamentoStoricoSection';
import { AnomalieBlock } from '@/components/cashflow/AnomalieBlock';
import { EntityDossier } from '@/components/cashflow/EntityDossier';
import { EntitySearch } from '@/components/cashflow/EntitySearch';
import {
  buildExpenseComposition,
  buildIncomeComposition,
  buildSubCategoryComposition,
  detectSpendingAnomalies,
  type CategorySlice,
  type SpendingAnomaly,
} from '@/lib/utils/cashflowComposition';
import {
  getCategoryKey,
  getSubCategoryKey,
  getSubCategoryLabel,
  selectExpensesForDrillDown,
  type CategoryScope,
} from '@/lib/utils/expenseGrouping';
import { CompositionList, CompositionListItem } from '@/components/ui/composition-list';
import { CompositionBar } from '@/components/ui/composition-bar';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { DrillBreadcrumb } from '@/components/ui/drill-breadcrumb';
import { computeShadeOpacities } from '@/lib/utils/compositionShading';
import { computeTrailingSavingsRateAverage } from '@/lib/utils/cashflowTimeSeries';
import { computeTotalsPacing, resolveComparisonScope, type PacingSide } from '@/lib/utils/comparisonDeltas';
import { type EntityScope } from '@/lib/utils/expenseEntityStats';
import { type EntitySearchTarget } from '@/lib/utils/entitySearch';
import { chartShellSettle } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';

interface ChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

type DrillDownLevel = 'category' | 'subcategory' | 'expenseList';
type ChartType = 'expenses' | 'income';

interface DrillDownState {
  level: DrillDownLevel;
  chartType: ChartType | null;
  /**
   * The category document being drilled into, not its name. Two categories can share a
   * name under different types, and a name-keyed drill-down showed a mix of both.
   *
   * No color is stored here: a focus can now be restored from the URL on a cold load
   * (before any composition slice has been clicked), so the category color is derived
   * at render time from the current composition instead.
   */
  selectedCategory: (CategoryScope & { label: string }) | null;
  /** Subcategory id, or NO_SUBCATEGORY_KEY for the rows carrying none. */
  selectedSubCategory: { key: string; label: string } | null;
}

export type PeriodMode = 'current' | 'year' | 'history';

// ── TopExpenseRow ────────────────────────────────────────────────────────────
// Module-level component required by React Compiler (no nested components).

function TopExpenseRow({ expense }: { expense: Expense }) {
  const date = toDate(expense.date);
  const dateStr = format(date, 'd MMM', { locale: it });
  const typeLabel = EXPENSE_TYPE_LABELS[expense.type as ExpenseType] ?? expense.type;

  return (
    <div className="flex items-center justify-between px-6 py-3.5 gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{dateStr}</span>
          <span className="text-sm font-medium text-foreground truncate">{expense.categoryName}</span>
          {expense.subCategoryName && (
            <span className="text-xs text-muted-foreground truncate">{'·'} {expense.subCategoryName}</span>
          )}
          <span className="text-xs text-muted-foreground/60 shrink-0">[{typeLabel}]</span>
        </div>
        {expense.notes && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{expense.notes}</p>
        )}
      </div>
      <span className="text-sm font-semibold font-mono tabular-nums text-destructive shrink-0">
        {formatCurrency(Math.abs(expense.amount))}
      </span>
    </div>
  );
}

// ── TopExpensesBlock ─────────────────────────────────────────────────────────
// Shows top N expenses for the selected period, sorted by absolute amount desc.
// Default: 5 visible + collapsible "Mostra tutte" for the rest.

const TOP_EXPENSES_DEFAULT_LIMIT = 5;

function TopExpensesBlock({
  expenses,
  periodLabel,
}: {
  expenses: Expense[];
  periodLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? expenses : expenses.slice(0, TOP_EXPENSES_DEFAULT_LIMIT);

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-border">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Spese Maggiori
          </p>
          <p className="text-sm font-medium text-foreground">{periodLabel}</p>
        </div>
        <span className="text-xs text-muted-foreground">{expenses.length} spese</span>
      </div>
      <div className="divide-y divide-border">
        {visible.map(e => (
          <TopExpenseRow key={e.id} expense={e} />
        ))}
      </div>
      {expenses.length > TOP_EXPENSES_DEFAULT_LIMIT && (
        <div className="px-6 py-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="w-full text-muted-foreground"
            aria-expanded={showAll}
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? 'Mostra meno' : `Mostra tutte (${expenses.length})`}
            <ChevronDown className={cn('h-4 w-4 ml-1 transition-transform duration-200 motion-reduce:transition-none', showAll && 'rotate-180')} />
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Pure chart-data helpers (module-level for stable references) ─────────────
// Each takes `colors` explicitly so useMemo deps are correct when the theme
// switches — avoids re-renders on unrelated state changes.

/**
 * Attach a palette colour to each slice, in rank order.
 *
 * Colours are resolved here rather than inside the pure builders: they come from
 * useChartColors() and would drag a React hook into a module the tests import.
 */
function withColors<T extends { key: string }>(slices: T[], colors: string[]): Array<T & { color: string }> {
  return slices.map((slice, index) => ({ ...slice, color: colors[index % colors.length] }));
}

// Keyed by the type itself, which is already unique — no collision to guard against
// here, unlike the category lists.
function getExpensesByType(expenses: Expense[], colors: string[]): ChartData[] {
  const typeMap = new Map<string, number>();
  expenses.filter(e => e.type !== 'income' && e.type !== 'transfer').forEach(e => {
    const label = EXPENSE_TYPE_LABELS[e.type as ExpenseType] || e.type;
    typeMap.set(label, (typeMap.get(label) || 0) + Math.abs(e.amount));
  });
  const total = Array.from(typeMap.values()).reduce((s, v) => s + v, 0);
  return Array.from(typeMap.entries())
    .map(([name, value], index) => ({
      name, value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: colors[index % colors.length],
    }))
    .sort((a, b) => b.value - a.value);
}

interface AnalisiTabProps {
  allExpenses: Expense[];
  /** Full category taxonomy — resolves labels for a URL-restored focus and feeds the entity search. */
  categories: ExpenseCategory[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  historyStartYear?: number;
}

// The focusable expense types, used to validate the focusType URL param without
// trusting arbitrary query input. Transfers are deliberately absent: they are
// net-zero movements excluded from every Analisi metric, so a transfer "entity"
// has no dossier semantics — a hand-edited ?focusType=transfer degrades to no focus.
const EXPENSE_TYPE_SET = new Set<string>(
  Object.keys(EXPENSE_TYPE_LABELS).filter(type => type !== 'transfer')
);

// Resolves an expense's Italy-calendar month for the pure comparison/stats layer.
const monthOfExpense = (expense: Expense): { year: number; month: number } => {
  const date = toDate(expense.date);
  return { year: getItalyYear(date), month: getItalyMonth(date) };
};

// Sign color for a pacing delta, with the DESIGN.md positiveGood inversion:
// income growing is good, spending growing is bad.
function pacingToneClass(delta: number, positiveGood: boolean): string {
  if (delta === 0) return 'text-muted-foreground';
  const isGood = positiveGood ? delta > 0 : delta < 0;
  return isGood ? 'text-positive' : 'text-destructive';
}

// The pacing line under a KPI value: percentage when a rate exists, absent when the
// baseline is zero (absence = "no comparable data", per the variation-chip rule).
function pacingLine(side: PacingSide): string | null {
  if (side.previous === 0 || side.deltaPercent === null) return null;
  const sign = side.deltaPercent > 0 ? '+' : '';
  return `${sign}${side.deltaPercent.toFixed(1)}%`;
}

interface UrlFocus {
  expenseType: ExpenseType;
  categoryKey: string;
  subCategoryKey: string | null;
}

// Parses the deep-linkable entity focus (?focusType&focusCat&focusSub — three FLAT
// params, no composite string to split: focusCat can be a legacy name-fallback key,
// and a name may contain any delimiter we could pick). Returns null on any
// missing/malformed piece; EXISTENCE validation happens later in resolveFocusLabels,
// because it needs expenses/categories, which load async.
function readFocusFromSearchParams(searchParams: URLSearchParams): UrlFocus | null {
  const typeParam = searchParams.get('focusType');
  const catParam = searchParams.get('focusCat');
  if (!typeParam || !catParam || !EXPENSE_TYPE_SET.has(typeParam)) return null;
  return {
    expenseType: typeParam as ExpenseType,
    categoryKey: catParam,
    subCategoryKey: searchParams.get('focusSub') || null,
  };
}

/**
 * Resolve display labels for a URL-restored focus, or reject it.
 *
 * Label source order: the composition over the full (floored) history — so a
 * "Casa"/"Casa" collision keeps its type qualifier, exactly as a clicked slice
 * would — then the taxonomy (an entity with zero recorded expenses is still a
 * legitimate focus). A category resolving in neither place means a stale or foreign
 * link: the focus is dropped, mirroring readPeriodFromSearchParams' degrade-don't-crash
 * stance. An unresolvable SUBcategory degrades to the parent category focus instead.
 */
function resolveFocusLabels(
  focus: UrlFocus,
  expenses: Expense[],
  categories: ExpenseCategory[]
): { categoryLabel: string; subCategory: { key: string; label: string } | null } | null {
  const composition = focus.expenseType === 'income'
    ? buildIncomeComposition(expenses)
    : buildExpenseComposition(expenses);
  const slice = composition.find(
    candidate => candidate.categoryKey === focus.categoryKey && candidate.expenseType === focus.expenseType
  );
  const taxonomyCategory = categories.find(
    candidate => candidate.id === focus.categoryKey && candidate.type === focus.expenseType
  );
  const categoryLabel = slice?.name ?? taxonomyCategory?.name;
  if (!categoryLabel) return null;

  if (!focus.subCategoryKey) return { categoryLabel, subCategory: null };
  if (focus.subCategoryKey === NO_SUBCATEGORY_KEY) {
    return { categoryLabel, subCategory: { key: NO_SUBCATEGORY_KEY, label: NO_SUBCATEGORY_LABEL } };
  }

  const taxonomySub = taxonomyCategory?.subCategories?.find(sub => sub.id === focus.subCategoryKey);
  const rowWithSub = expenses.find(
    expense =>
      expense.type === focus.expenseType &&
      getCategoryKey(expense) === focus.categoryKey &&
      getSubCategoryKey(expense) === focus.subCategoryKey
  );
  const subLabel = taxonomySub?.name ?? (rowWithSub ? getSubCategoryLabel(rowWithSub) : undefined);
  return { categoryLabel, subCategory: subLabel ? { key: focus.subCategoryKey, label: subLabel } : null };
}

// Parses the "period"/"year"/"month" query params into a valid initial period state.
// Falls back to the "Anno Corrente" default whenever a param is missing or malformed —
// a bad/stale link degrades to the default view rather than crashing or showing garbage.
function readPeriodFromSearchParams(
  searchParams: URLSearchParams,
  currentYear: number
): { periodMode: PeriodMode; selectedYear: number | null; selectedMonth: number | null } {
  const periodParam = searchParams.get('period');
  const periodMode: PeriodMode =
    periodParam === 'year' || periodParam === 'history' ? periodParam : 'current';

  const monthParam = searchParams.get('month');
  const parsedMonth = monthParam ? parseInt(monthParam, 10) : NaN;
  const selectedMonth = periodMode !== 'history' && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : null;

  if (periodMode === 'current') return { periodMode, selectedYear: currentYear, selectedMonth };
  if (periodMode === 'history') return { periodMode, selectedYear: null, selectedMonth: null };

  const yearParam = searchParams.get('year');
  const parsedYear = yearParam ? parseInt(yearParam, 10) : NaN;
  // Only PAST years are valid in 'year' mode — the UI never offers the current
  // year here (Anno Corrente is its dedicated entry point), and accepting it from
  // a crafted URL would run a partial year against a FULL previous year under the
  // fullYear scope, bypassing the same-months rule with a plain "vs" caption.
  const selectedYear =
    Number.isFinite(parsedYear) && parsedYear < currentYear ? parsedYear : currentYear - 1;
  return { periodMode, selectedYear, selectedMonth };
}

export function AnalisiTab({ allExpenses, categories, loading, historyStartYear = 2024 }: AnalisiTabProps) {
  const COLORS = useChartColors();
  const controlClassName = 'transition-colors duration-200 border-border/70 hover:border-primary/40 focus-visible:ring-primary/30 data-[placeholder]:text-muted-foreground';

  const currentYear = getItalyYear();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Three-state period selector — initial value read once from the URL so a
  // shared/refreshed link reopens on the same period (deep-linkable "monthly
  // check" for repeat visits). The entity focus is ALSO in the URL
  // (?focusType&focusCat&focusSub — see the header docstring and the sync effect
  // below); only the Sankey's internal type-drill state stays out.
  const [periodMode, setPeriodMode] = useState<PeriodMode>(
    () => readPeriodFromSearchParams(searchParams, currentYear).periodMode
  );
  const [selectedYear, setSelectedYear] = useState<number | null>(
    () => readPeriodFromSearchParams(searchParams, currentYear).selectedYear
  );
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    () => readPeriodFromSearchParams(searchParams, currentYear).selectedMonth
  );

  // Drill-down state machine — declared alongside the period state because the URL
  // sync effect below reads both.
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'category',
    chartType: null,
    selectedCategory: null,
    selectedSubCategory: null,
  });

  const expensesChartRef = useRef<HTMLDivElement>(null);
  const incomeChartRef = useRef<HTMLDivElement>(null);

  // The ONE scroll on entity focus — owned by the landing path (handleEntitySelect
  // and the URL restore), never by a parallel effect: two mechanisms with mixed
  // smooth/instant grammars used to fire on the same click.
  const scrollToFocusCard = useCallback((chartType: ChartType) => {
    const targetRef = chartType === 'income' ? incomeChartRef : expensesChartRef;
    setTimeout(() => {
      targetRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 50);
  }, []);

  // Keep the URL in sync with the period selection AND the entity focus — replace
  // (not push) so filter changes don't spam browser history with back-button stops.
  // The focus triple makes "check del condominio" a bookmarkable link; this is the
  // declared reversal of the "no drill state in the URL" decision, in the one form
  // that decision left open: a SINGLE focused entity, never two drill machines.
  useEffect(() => {
    const params = new URLSearchParams();
    if (periodMode !== 'current') params.set('period', periodMode);
    if (periodMode === 'year' && selectedYear !== null) params.set('year', String(selectedYear));
    if (selectedMonth !== null) params.set('month', String(selectedMonth));
    if (drillDown.level !== 'category' && drillDown.selectedCategory) {
      params.set('focusType', drillDown.selectedCategory.expenseType);
      params.set('focusCat', drillDown.selectedCategory.key);
      if (drillDown.level === 'expenseList' && drillDown.selectedSubCategory) {
        params.set('focusSub', drillDown.selectedSubCategory.key);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/pathname are stable
  }, [periodMode, selectedYear, selectedMonth, drillDown]);

  // Cold-load focus restore: the URL triple is captured once at mount, then applied
  // as soon as the data needed to validate it has loaded. Deferred because a focus
  // must resolve against expenses/taxonomy (both async) before it can carry a label.
  const initialFocusRef = useRef<UrlFocus | null>(readFocusFromSearchParams(searchParams));
  useEffect(() => {
    const focus = initialFocusRef.current;
    if (!focus || loading) return;
    initialFocusRef.current = null;

    const withinFloor = allExpenses.filter(e => getItalyYear(toDate(e.date)) >= historyStartYear);
    const resolved = resolveFocusLabels(focus, withinFloor, categories);
    if (!resolved) return;
    setDrillDown({
      level: resolved.subCategory ? 'expenseList' : 'subcategory',
      chartType: focus.expenseType === 'income' ? 'income' : 'expenses',
      selectedCategory: {
        expenseType: focus.expenseType,
        key: focus.categoryKey,
        label: resolved.categoryLabel,
      },
      selectedSubCategory: resolved.subCategory,
    });
    // A deep link should LAND on the dossier, not leave it below the fold.
    scrollToFocusCard(focus.expenseType === 'income' ? 'income' : 'expenses');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once when loading settles
  }, [loading, allExpenses, categories, historyStartYear]);

  // useMediaQuery avoids the manual matchMedia + listener pattern and integrates with the
  // project's standard breakpoint hook (all callers are 'use client' post-login).
  const isMobile = useMediaQuery('(max-width: 639px)');

  // "Dettaglio" zone (Andamento Storico in history mode + Savings trend) —
  // collapsed by default, mirrors Rendimenti's "Mostra tutte le metriche" pattern.
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const resetDrillDown = () => {
    setDrillDown({
      level: 'category',
      chartType: null,
      selectedCategory: null,
      selectedSubCategory: null,
    });
  };

  // Period changes deliberately do NOT reset the drill-down anymore: the focused
  // entity is an object of study (its dossier spans every year regardless of the
  // selected window), not a filter of the period. Switching period re-scopes the
  // period-bound blocks (hero, composition, transactions) around the same focus.
  const handlePeriodModeChange = (mode: PeriodMode) => {
    setPeriodMode(mode);
    if (mode === 'current') {
      setSelectedYear(currentYear);
      setSelectedMonth(null);
    } else if (mode === 'history') {
      setSelectedYear(null);
      setSelectedMonth(null);
    } else if (mode === 'year') {
      // Initialize to the most recent *past* year — current year is handled by "Anno Corrente"
      const firstPastYear = availableYears.find(y => y < currentYear) ?? currentYear - 1;
      setSelectedYear(firstPastYear);
      setSelectedMonth(null);
    }
  };

  // True whenever a month filter is active — drives the "Ripristina" button
  // in both "Anno Corrente" (month picker) and "Anno" (year + month picker)
  const isMonthFiltered = selectedMonth !== null;

  const handleResetFilters = () => {
    // Clear month only — year is intentional in "Anno" mode, currentYear is fixed in "Anno Corrente"
    setSelectedMonth(null);
  };

  const handleYearChange = (value: string) => {
    setSelectedYear(parseInt(value));
    setSelectedMonth(null);
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value === '__all__' ? null : parseInt(value));
  };

  // Data visible in "Analisi Periodo" section — respects historyStartYear filter
  const baseExpenses = useMemo(() => {
    return allExpenses.filter(e => getItalyYear(toDate(e.date)) >= historyStartYear);
  }, [allExpenses, historyStartYear]);

  // All years with data — used for baseExpenses filtering and "Anno Corrente" context.
  // The "Anno" dropdown uses pastYears (excludes currentYear) since Anno Corrente
  // is the dedicated entry point for the current year.
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    baseExpenses.forEach(e => years.add(getItalyYear(toDate(e.date))));
    return Array.from(years).sort((a, b) => b - a);
  }, [baseExpenses]);

  const pastYears = useMemo(
    () => availableYears.filter(y => y < currentYear),
    [availableYears, currentYear]
  );

  const periodFilteredExpenses = useMemo(() => {
    if (selectedYear === null) return baseExpenses;
    return baseExpenses.filter(e => {
      const date = toDate(e.date);
      if (getItalyYear(date) !== selectedYear) return false;
      if (selectedMonth !== null && getItalyMonth(date) !== selectedMonth) return false;
      return true;
    });
  }, [baseExpenses, selectedYear, selectedMonth]);

  const periodLabel = selectedYear === null
    ? 'Storico Completo'
    : selectedMonth
      ? `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
      : `${selectedYear}`;

  const totalIncome = calculateTotalIncome(periodFilteredExpenses);
  const totalExpenses = calculateTotalExpenses(periodFilteredExpenses);
  const netBalance = totalIncome - totalExpenses;
  // Savings rate as percentage (0–100). Drives the hero KPI color threshold.
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  // Sort non-income expenses by amount ascending — most negative amount = largest expense first
  const topExpenses = useMemo(() => {
    return periodFilteredExpenses
      .filter(e => e.type !== 'income' && e.type !== 'transfer')
      .sort((a, b) => a.amount - b.amount);
  }, [periodFilteredExpenses]);

  // Memoized pie chart datasets — computed here (before early returns) so hooks
  // are never called conditionally and renders inside drill-down don't recompute.
  const expensesByCategoryData = useMemo(
    () => withColors(buildExpenseComposition(periodFilteredExpenses), COLORS),
    [periodFilteredExpenses, COLORS]
  );
  const incomeByCategoryData = useMemo(
    () => withColors(buildIncomeComposition(periodFilteredExpenses), COLORS),
    [periodFilteredExpenses, COLORS]
  );
  const expensesByTypeData = useMemo(
    () => getExpensesByType(periodFilteredExpenses, COLORS),
    [periodFilteredExpenses, COLORS]
  );

  // Category color for the active focus, derived from the current composition
  // instead of stored in state: a focus restored from the URL never went through a
  // slice click, and a period switch may re-rank (and so re-color) the composition.
  // Falls back to the first palette slot when the entity has no rows in the period.
  const focusColor = useMemo(() => {
    if (!drillDown.selectedCategory) return COLORS[0];
    const slices = drillDown.chartType === 'income' ? incomeByCategoryData : expensesByCategoryData;
    const slice = slices.find(
      candidate =>
        candidate.categoryKey === drillDown.selectedCategory!.key &&
        candidate.expenseType === drillDown.selectedCategory!.expenseType
    );
    return slice?.color ?? COLORS[0];
    // Dep is the whole drillDown object (not its sub-properties): the React Compiler
    // tracks it as a unit and over-narrowed deps make it skip compiling the component.
  }, [drillDown, incomeByCategoryData, expensesByCategoryData, COLORS]);

  // The entity the drill-down is focused on, in the pure layer's vocabulary — feeds
  // the dossier. Null at level 1 (no focus).
  const focusScope = useMemo<EntityScope | null>(() => {
    if (!drillDown.selectedCategory || drillDown.level === 'category') return null;
    return {
      category: {
        expenseType: drillDown.selectedCategory.expenseType,
        key: drillDown.selectedCategory.key,
      },
      subCategory:
        drillDown.level === 'expenseList' && drillDown.selectedSubCategory
          ? { key: drillDown.selectedSubCategory.key }
          : undefined,
    };
  }, [drillDown]);

  const focusPeriod = useMemo(
    () => ({ year: selectedYear, month: selectedMonth }),
    [selectedYear, selectedMonth]
  );

  // YoY pacing for the KPI trio ("−8,4% vs 2025 (stessi mesi)") — scope AND caption
  // from the SAME pure module the Confronto section reads, so the two can never
  // disagree on the same-months rule. Null (row absent) in Storico, for a month
  // that has not started yet, or when the previous year predates the tracked history.
  const pacing = useMemo(() => {
    if (selectedYear === null) return null;
    const comparisonYear = selectedYear - 1;
    if (comparisonYear < historyStartYear) return null;
    const scope = resolveComparisonScope(periodMode, selectedMonth, getItalyMonth());
    if (!scope) return null;
    return computeTotalsPacing(allExpenses, selectedYear, comparisonYear, scope, monthOfExpense);
  }, [allExpenses, periodMode, selectedYear, selectedMonth, historyStartYear]);

  // One landing path for every entity entry point (search, Confronto delta rows,
  // and later the Sankey): resolve labels exactly like a URL-restored focus, then
  // drill and scroll to the right card.
  const handleEntitySelect = useCallback(
    (target: EntitySearchTarget) => {
      const resolved = resolveFocusLabels(
        {
          expenseType: target.expenseType,
          categoryKey: target.categoryKey,
          subCategoryKey: target.subCategoryKey ?? null,
        },
        baseExpenses,
        categories
      );
      if (!resolved) return;
      setDrillDown({
        level: resolved.subCategory ? 'expenseList' : 'subcategory',
        chartType: target.expenseType === 'income' ? 'income' : 'expenses',
        selectedCategory: {
          expenseType: target.expenseType,
          key: target.categoryKey,
          label: resolved.categoryLabel,
        },
        selectedSubCategory: resolved.subCategory,
      });
      scrollToFocusCard(target.expenseType === 'income' ? 'income' : 'expenses');
    },
    [baseExpenses, categories, scrollToFocusCard]
  );

  // The single (year, month) this period resolves to — null for "Anno"/"Storico"
  // views spanning more than one month. Shared by anomaly detection and the
  // deficit-month reassurance line so both agree on "which month is this".
  const singleMonthContext = useMemo(() => {
    // An explicitly picked month wins; the bare "Anno Corrente" falls back to the
    // running calendar month (the only month a live check can mean).
    if (periodMode === 'current') {
      return { year: getItalyYear(), month: selectedMonth ?? getItalyMonth() };
    }
    if (periodMode === 'year' && selectedMonth !== null && selectedYear !== null) {
      return { year: selectedYear, month: selectedMonth };
    }
    return null;
  }, [periodMode, selectedMonth, selectedYear]);

  /**
   * Compute spending anomalies for the current month context.
   *
   * Anomalies are only meaningful at a monthly granularity.
   * For annual or historical views, returns empty array.
   *
   * Algorithm: for each expense category in the anomaly month,
   * compare current month total vs rolling 6-month average.
   * Flag if delta > 25% AND absolute delta > €50.
   * Skip categories with fewer than 3 months of history.
   */
  const anomalieData = useMemo<SpendingAnomaly[]>(() => {
    // Anomaly detection is only meaningful at monthly granularity.
    if (!singleMonthContext) return [];
    // The month resolver is injected so the detector stays free of timezone helpers and
    // can be tested with plain dates.
    return detectSpendingAnomalies(
      allExpenses,
      singleMonthContext.year,
      singleMonthContext.month,
      (expense) => {
        const date = toDate(expense.date);
        return { year: getItalyYear(date), month: getItalyMonth(date) };
      }
    );
  }, [allExpenses, singleMonthContext]);

  // Reassurance figure for a deficit month — the trailing 12-month average savings
  // rate, so a single bad month reads next to a stabilizing long-run number instead
  // of standing alone (mirrors Panoramica's 12-month reassurance line, CLAUDE.md
  // "Panoramica: hero critique follow-up"). Only computed when there's something to
  // reassure about: a genuine single-month deficit.
  const trailingSavingsAverage = useMemo(() => {
    if (!singleMonthContext || netBalance >= 0) return null;
    return computeTrailingSavingsRateAverage(allExpenses, singleMonthContext.year, singleMonthContext.month, 12);
  }, [allExpenses, singleMonthContext, netBalance]);

  // ── Drill-down handlers ────────────────────────────────────────────────
  // Every entry point converges on handleEntitySelect: it carries the category's
  // IDENTITY (so a click on "Casa (Spese Fisse)" can never resolve to the variable
  // "Casa" one row below it), resolves labels once, and owns the single scroll.

  const handleAnomaliaClick = useCallback(
    (anomaly: SpendingAnomaly) => {
      // The chip lands on the category's dossier — strictly more context than the chip.
      handleEntitySelect({ expenseType: anomaly.expenseType, categoryKey: anomaly.categoryKey });
    },
    [handleEntitySelect]
  );

  const handleCategoryClick = (item: CompositionListItem, chartType: ChartType) => {
    const slice = (chartType === 'income' ? incomeByCategoryData : expensesByCategoryData)
      .find(candidate => candidate.key === item.id);
    if (!slice) return;
    handleEntitySelect({ expenseType: slice.expenseType, categoryKey: slice.categoryKey });
  };

  const handleSubcategoryClick = (item: CompositionListItem) => {
    if (!drillDown.selectedCategory) return;
    handleEntitySelect({
      expenseType: drillDown.selectedCategory.expenseType,
      categoryKey: drillDown.selectedCategory.key,
      subCategoryKey: item.id,
    });
  };

  const handleBack = () => {
    if (drillDown.level === 'expenseList') {
      setDrillDown(prev => ({ ...prev, level: 'subcategory', selectedSubCategory: null }));
    } else if (drillDown.level === 'subcategory') {
      resetDrillDown();
    }
  };

  // ── Computed chart data ────────────────────────────────────────────────

  const currentSubcategoriesData = drillDown.level === 'subcategory' && drillDown.selectedCategory
    ? buildSubCategoryComposition(periodFilteredExpenses, drillDown.selectedCategory)
    : [];

  const currentFilteredExpenses = drillDown.level === 'expenseList' && drillDown.selectedCategory
    ? selectExpensesForDrillDown(
        periodFilteredExpenses,
        drillDown.selectedCategory,
        drillDown.selectedSubCategory ?? undefined
      )
    : [];

  // Slice → CompositionListItem: `id` is the identity the click resolves through,
  // `name` the already-disambiguated label; color arrives pre-resolved from useChartColors().
  const toCompositionItems = (slices: Array<CategorySlice & { color: string }>): CompositionListItem[] =>
    slices.map(slice => ({
      id: slice.key,
      name: slice.name,
      value: slice.value,
      percentage: slice.percentage,
      color: slice.color,
    }));

  // Subcategory rows: color = parent category color, opacity ramps via computeShadeOpacities
  // (format-independent — works whether useChartColors() returns oklch, hex, or rgb).
  const subcategoryCompositionItems: CompositionListItem[] = (() => {
    const baseColor = focusColor;
    const opacities = computeShadeOpacities(currentSubcategoriesData.length);
    return currentSubcategoriesData.map((slice, i) => ({
      id: slice.key,
      name: slice.name,
      value: slice.value,
      percentage: slice.percentage,
      color: baseColor,
      barOpacity: opacities[i],
    }));
  })();

  // Show structural skeleton only on initial load (no data yet).
  // Re-fetches while data is present show stale data, not a skeleton — avoids jarring blank flash.
  if (loading && allExpenses.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Period pill placeholder */}
        <div className="h-9 w-64 rounded-full bg-muted" />
        {/* Hero KPI trio */}
        <div className="grid grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 space-y-2">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-8 w-28 rounded bg-muted" />
            </div>
          ))}
        </div>
        {/* Sankey placeholder */}
        <div className="h-64 rounded-xl bg-muted" />
        {/* Charts placeholder */}
        <div className="grid gap-4 desktop:grid-cols-2">
          <div className="h-48 rounded-xl bg-muted" />
          <div className="h-48 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (allExpenses.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-muted-foreground">Nessun dato disponibile.</p>
        <p className="text-sm text-muted-foreground mt-2">Aggiungi alcune spese per visualizzare le analisi.</p>
      </div>
    );
  }

  // ── Drill-down breadcrumb path ─────────────────────────────────────────
  // Shared with the Sankey's own drill-down (components/ui/drill-breadcrumb.tsx)
  // so both give the same clickable-crumb navigation language on this page.
  const drillBreadcrumb = drillDown.level !== 'category' && drillDown.chartType ? (
    <DrillBreadcrumb
      ariaLabel="Posizione nel drill-down"
      steps={[
        { label: drillDown.chartType === 'expenses' ? 'Spese' : 'Entrate', onClick: resetDrillDown },
        ...(drillDown.selectedCategory
          ? [{
              label: drillDown.selectedCategory.label,
              onClick: drillDown.level === 'expenseList'
                ? () => setDrillDown(prev => ({ ...prev, level: 'subcategory', selectedSubCategory: null }))
                : undefined,
            }]
          : []),
        ...(drillDown.level === 'expenseList' && drillDown.selectedSubCategory
          ? [{ label: drillDown.selectedSubCategory.label }]
          : []),
      ]}
    />
  ) : null;

  return (
    <div className="space-y-6">
      {/* ── Period selector ────────────────────────────────────────────── */}
      {/* Stacked + centered on mobile/tablet (pill over picker) to avoid the
          unbalanced pill-left / picker-far-right gap; switches to the row layout
          (pill left, picker right) only from desktop (1440px) up. */}
      <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center desktop:justify-between">
        {/* Three-state pill — self-center centers it on the stacked column without
            stretching the picker; desktop:self-auto restores row placement. */}
        <SegmentedPill
          ariaLabel="Periodo di analisi"
          layoutId="analisi-period-pill"
          className="self-center desktop:self-auto"
          value={periodMode}
          onChange={handlePeriodModeChange}
          options={[
            { value: 'current', label: 'Anno Corrente' },
            { value: 'year', label: 'Anno' },
            { value: 'history', label: 'Storico' },
          ]}
        />

        {/* Month picker — wrapped in AnimatePresence so the exit animation plays
            when switching between period modes (not just on mount). */}
        <AnimatePresence mode="wait">
        {periodMode === 'current' && (
          <motion.div
            key="picker-current"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:self-center desktop:self-auto"
          >
            <Select
              value={selectedMonth?.toString() || '__all__'}
              onValueChange={handleMonthChange}
            >
              <SelectTrigger className={cn('w-full sm:w-[160px]', controlClassName)}>
                <SelectValue placeholder="Tutto l'anno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutto l&apos;anno</SelectItem>
                {MONTH_NAMES.map((month, index) => (
                  <SelectItem key={index + 1} value={(index + 1).toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isMonthFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-muted-foreground hover:text-foreground whitespace-nowrap self-start sm:self-auto"
              >
                Ripristina
              </Button>
            )}
          </motion.div>
        )}

        {/* Year + Month dropdowns — "Anno" mode (past years only) */}
        {periodMode === 'year' && (
          <motion.div
            key="picker-year"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:self-center desktop:self-auto"
          >
            <Select
              value={selectedYear?.toString() || pastYears[0]?.toString()}
              onValueChange={handleYearChange}
            >
              <SelectTrigger className={cn('w-full sm:w-[140px]', controlClassName)}>
                <SelectValue placeholder="Anno" />
              </SelectTrigger>
              <SelectContent>
                {/* currentYear excluded — Anno Corrente is the dedicated entry point */}
                {pastYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedMonth?.toString() || '__all__'}
              onValueChange={handleMonthChange}
              disabled={selectedYear === null}
            >
              <SelectTrigger className={cn('w-full sm:w-[160px]', controlClassName)}>
                <SelectValue placeholder="Tutto l'anno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutto l&apos;anno</SelectItem>
                {MONTH_NAMES.map((month, index) => (
                  <SelectItem key={index + 1} value={(index + 1).toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isMonthFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-muted-foreground hover:text-foreground whitespace-nowrap self-start sm:self-auto"
              >
                Ripristina
              </Button>
            )}
          </motion.div>
        )}
        </AnimatePresence>

        {/* Entity search — the 1-interaction path to any category/subcategory,
            including ones with zero expenses in the selected period. */}
        <EntitySearch
          categories={categories}
          expenses={baseExpenses}
          onSelect={handleEntitySelect}
          className="w-full sm:w-auto sm:self-center desktop:self-auto"
        />
      </div>

      {/* ── Hero KPI trio ─────────────────────────────────────────────── */}
      {/* Three dominant metrics in flat layout (Trade Republic hierarchy).
          Mobile: stacked rows (full width). Desktop: 3 columns side by side.
          Savings rate sits below Risparmio as a secondary metric, not a 4th column. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
        {/* Entrate
            Mobile: flex row — label+count left, value right.
            Desktop (sm:block): vertical stack — label → value → count. */}
        <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 flex items-center justify-between sm:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Entrate</p>
            <p className="text-xs text-muted-foreground sm:hidden">
              {periodFilteredExpenses.filter(e => e.type === 'income').length} voci
            </p>
          </div>
          <div className="text-right sm:text-left sm:mt-1">
            <p className="text-[36px] font-bold font-mono tracking-[-0.03em] leading-none text-positive tabular-nums">
              {formatCurrency(totalIncome)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
              {periodFilteredExpenses.filter(e => e.type === 'income').length} voci
            </p>
            {/* YoY pacing — income growing is good (positiveGood: true) */}
            {pacing && pacingLine(pacing.income) && (
              <p className={cn('text-[12px] font-mono tabular-nums mt-1', pacingToneClass(pacing.income.delta, true))}>
                {pacingLine(pacing.income)}{' '}
                <span className="text-muted-foreground">{pacing.baselineLabel}</span>
              </p>
            )}
          </div>
        </div>

        {/* Spese */}
        <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 flex items-center justify-between sm:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Spese</p>
            <p className="text-xs text-muted-foreground sm:hidden">
              {periodFilteredExpenses.filter(e => e.type !== 'income' && e.type !== 'transfer').length} voci
            </p>
          </div>
          <div className="text-right sm:text-left sm:mt-1">
            <p className="text-[36px] font-bold font-mono tracking-[-0.03em] leading-none text-destructive tabular-nums">
              {formatCurrency(totalExpenses)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
              {periodFilteredExpenses.filter(e => e.type !== 'income' && e.type !== 'transfer').length} voci
            </p>
            {/* YoY pacing — spending growing is bad (positiveGood: false) */}
            {pacing && pacingLine(pacing.expenses) && (
              <p className={cn('text-[12px] font-mono tabular-nums mt-1', pacingToneClass(pacing.expenses.delta, false))}>
                {pacingLine(pacing.expenses)}{' '}
                <span className="text-muted-foreground">{pacing.baselineLabel}</span>
              </p>
            )}
          </div>
        </div>

        {/* Risparmio — netBalance drives sign color, savingsRate drives the secondary label */}
        <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 flex items-center justify-between sm:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Risparmio</p>
            {totalIncome > 0 && (
              <p className={cn(
                'text-xs font-medium font-mono sm:hidden',
                savingsRate >= 20
                  ? 'text-positive'
                  : savingsRate >= 10
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-destructive'
              )}>
                {savingsRate >= 0 ? `${savingsRate.toFixed(1)}% risparmiato` : `${savingsRate.toFixed(1)}% (deficit)`}
              </p>
            )}
          </div>
          <div className="text-right sm:text-left sm:mt-1">
            <p className={cn(
              'text-[36px] font-bold font-mono tracking-[-0.03em] leading-none tabular-nums',
              netBalance >= 0 ? 'text-foreground' : 'text-destructive'
            )}>
              {formatCurrency(netBalance)}
            </p>
            {totalIncome > 0 && (
              <p className={cn(
                'text-xs font-medium font-mono mt-0.5 hidden sm:block',
                savingsRate >= 20
                  ? 'text-positive'
                  : savingsRate >= 10
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-destructive'
              )}>
                {savingsRate >= 0 ? `${savingsRate.toFixed(1)}% risparmiato` : `${savingsRate.toFixed(1)}% (deficit)`}
              </p>
            )}
            {/* Reassurance line — only for a genuine deficit month, so a bad month
                isn't the only figure on screen (see trailingSavingsAverage above). */}
            {trailingSavingsAverage !== null && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Media ultimi 12 mesi: {trailingSavingsAverage.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Anomalie (condizionale) ───────────────────────────────────── */}
      {/* Rendered only when anomalies detected — no "all clear" empty state.
          The month label declares the actual window: in "Anno Corrente" without a
          month filter the anomalies run on the CURRENT calendar month while the
          KPIs above cover the whole year. */}
      <AnomalieBlock
        anomalie={anomalieData}
        monthLabel={
          singleMonthContext
            ? `${MONTH_NAMES[singleMonthContext.month - 1]} ${singleMonthContext.year}`
            : null
        }
        onCategoryClick={handleAnomaliaClick}
      />

      {/* ── Spese Maggiori ────────────────────────────────────────────── */}
      {topExpenses.length > 0 && (
        <TopExpensesBlock key={periodLabel} expenses={topExpenses} periodLabel={periodLabel} />
      )}

      {/* ── Analisi flusso ────────────────────────────────────────────── */}
      {/* The placeholder only replaces the zone when NO focus is active: a focused
          dossier stays reachable in an empty period (its multi-year blocks ignore
          the period axis — the dossier is never empty). */}
      {periodFilteredExpenses.length === 0 && drillDown.level === 'category' ? (
        <div className="rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground">Nessuna transazione trovata per {periodLabel}.</p>
        </div>
      ) : (
        <motion.div
          variants={chartShellSettle}
          initial={false}
          animate="settle"
          className="space-y-4 sm:space-y-6"
        >
          {/* Sankey — the flow view. Category/subcategory node clicks land on the
              same entity-focus path as every other entry point (no internal
              category drill, no third transaction list). */}
          {periodFilteredExpenses.length > 0 && (
            <CashflowSankeyChart
              expenses={periodFilteredExpenses}
              isMobile={isMobile}
              title={`Flusso Cashflow ${periodLabel}`}
              onEntityClick={handleEntitySelect}
            />
          )}

          {/* Spese per Categoria drill-down */}
          {(expensesByCategoryData.length > 0 || (drillDown.chartType === 'expenses' && drillDown.level !== 'category')) && (
            <Card ref={expensesChartRef}>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    {drillDown.chartType === 'expenses' && drillDown.level !== 'category' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleBack} className="h-7 px-2">
                            <ChevronLeft className="h-4 w-4" />
                            Indietro
                          </Button>
                        </div>
                        {drillBreadcrumb}
                      </>
                    ) : (
                      <CardTitle>Spese per Categoria — {periodLabel}</CardTitle>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* The level-1 list also renders while the OTHER side is focused —
                    a card whose only content requires the sibling's drill state
                    would otherwise mount as a title-only empty shell. */}
                {(drillDown.level === 'category' || drillDown.chartType !== 'expenses') &&
                  expensesByCategoryData.length > 0 && (
                  <CompositionList
                    items={toCompositionItems(expensesByCategoryData)}
                    onItemClick={(item) => handleCategoryClick(item, 'expenses')}
                    ariaLabel={`Spese per categoria — ${periodLabel}`}
                  />
                )}
                {drillDown.level === 'subcategory' && drillDown.chartType === 'expenses' && focusScope && (
                  <div className="space-y-5">
                    <EntityDossier
                      allExpenses={allExpenses}
                      scope={focusScope}
                      color={focusColor}
                      period={focusPeriod}
                      periodLabel={periodLabel}
                      historyStartYear={historyStartYear}
                      isIncome={false}
                    />
                    {subcategoryCompositionItems.length > 0 && (
                      <div className="border-t border-border/40 pt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">
                          Sottocategorie · {periodLabel}
                        </p>
                        <CompositionList
                          items={subcategoryCompositionItems}
                          onItemClick={handleSubcategoryClick}
                          ariaLabel={`Sottocategorie di ${drillDown.selectedCategory?.label ?? ""}`}
                        />
                      </div>
                    )}
                  </div>
                )}
                {drillDown.level === 'expenseList' && drillDown.chartType === 'expenses' && focusScope && (
                  <div className="space-y-5">
                    <EntityDossier
                      allExpenses={allExpenses}
                      scope={focusScope}
                      color={focusColor}
                      period={focusPeriod}
                      periodLabel={periodLabel}
                      historyStartYear={historyStartYear}
                      isIncome={false}
                    />
                    <div className="border-t border-border/40 pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">
                        Transazioni · {periodLabel}
                      </p>
                      <ExpenseList expenses={currentFilteredExpenses} isIncome={false} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Spese per Tipo — compressed to a single stacked bar (chrome reduction):
              the type domain is 3 fixed values, a ranked list added no information
              over the bar + legend. Type names are unique, so the label is the key. */}
          {expensesByTypeData.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Spese per Tipo — {periodLabel}</CardTitle></CardHeader>
              <CardContent>
                <CompositionBar
                  segments={expensesByTypeData.map(d => ({
                    key: d.name,
                    label: d.name,
                    pct: d.percentage,
                    color: d.color,
                  }))}
                  ariaLabel={`Spese per tipo — ${periodLabel}`}
                />
              </CardContent>
            </Card>
          )}

          {/* Entrate per Categoria drill-down */}
          {(incomeByCategoryData.length > 0 || (drillDown.chartType === 'income' && drillDown.level !== 'category')) && (
            <Card ref={incomeChartRef}>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    {drillDown.chartType === 'income' && drillDown.level !== 'category' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleBack} className="h-7 px-2">
                            <ChevronLeft className="h-4 w-4" />
                            Indietro
                          </Button>
                        </div>
                        {drillBreadcrumb}
                      </>
                    ) : (
                      <CardTitle>Entrate per Categoria — {periodLabel}</CardTitle>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Same sibling rule as the expenses card above. */}
                {(drillDown.level === 'category' || drillDown.chartType !== 'income') &&
                  incomeByCategoryData.length > 0 && (
                  <CompositionList
                    items={toCompositionItems(incomeByCategoryData)}
                    onItemClick={(item) => handleCategoryClick(item, 'income')}
                    ariaLabel={`Entrate per categoria — ${periodLabel}`}
                  />
                )}
                {drillDown.level === 'subcategory' && drillDown.chartType === 'income' && focusScope && (
                  <div className="space-y-5">
                    <EntityDossier
                      allExpenses={allExpenses}
                      scope={focusScope}
                      color={focusColor}
                      period={focusPeriod}
                      periodLabel={periodLabel}
                      historyStartYear={historyStartYear}
                      isIncome={true}
                    />
                    {subcategoryCompositionItems.length > 0 && (
                      <div className="border-t border-border/40 pt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">
                          Sottocategorie · {periodLabel}
                        </p>
                        <CompositionList
                          items={subcategoryCompositionItems}
                          onItemClick={handleSubcategoryClick}
                          ariaLabel={`Sottocategorie di ${drillDown.selectedCategory?.label ?? ""}`}
                        />
                      </div>
                    )}
                  </div>
                )}
                {drillDown.level === 'expenseList' && drillDown.chartType === 'income' && focusScope && (
                  <div className="space-y-5">
                    <EntityDossier
                      allExpenses={allExpenses}
                      scope={focusScope}
                      color={focusColor}
                      period={focusPeriod}
                      periodLabel={periodLabel}
                      historyStartYear={historyStartYear}
                      isIncome={true}
                    />
                    <div className="border-t border-border/40 pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">
                        Transazioni · {periodLabel}
                      </p>
                      <ExpenseList expenses={currentFilteredExpenses} isIncome={true} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* ── Confronto ─────────────────────────────────────────────────── */}
      {/* Promoted out of the Dettaglio Collapsible (2026-08-14): the year-over-year
          comparison is a first-class answer (JTBD "meglio o peggio dell'anno
          scorso?"), not reference material. Its "Per Categoria" view is the delta
          ranking — the page-level driver list; a row click focuses that category's
          dossier via the same landing path as search and the composition lists. */}
      <ConfrontoAnnualeSection
        allExpenses={allExpenses}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        periodMode={periodMode}
        historyStartYear={historyStartYear}
        availableDataYears={availableYears}
        onCategoryFocus={handleEntitySelect}
      />

      {/* ── Dettaglio ─────────────────────────────────────────────────── */}
      {/* KPI trio + Anomalie + Sankey + Spese Maggiori above are the 30-second
          answer; everything below is reference material for whoever wants to go
          deeper. Collapsed by default (progressive disclosure) — this page used
          to render 7-9 always-open sections, which is why the impeccable critique
          (2026-07-21) flagged it as the page's biggest cognitive-load issue. */}
      <Collapsible open={isDetailOpen} onOpenChange={setIsDetailOpen} className="border-t border-border/60 pt-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-md"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {isDetailOpen ? 'Nascondi dettaglio' : 'Mostra dettaglio'}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                isDetailOpen && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200">
          <div className="space-y-6 pt-4">
            {/* Andamento nel Tempo — history-only: in Anno Corrente/Anno the YoY
                section above already covers the period, and the Mese/Anno axis would
                degenerate to one bucket. */}
            {periodMode === 'history' && (
              <AndamentoStoricoSection
                allExpenses={allExpenses}
                historyStartYear={historyStartYear}
              />
            )}

            {/* Andamento Risparmio — year-scoped whenever a year is selected (Anno
                Corrente → current year, Anno → the chosen past year); full history
                (with the 12m/24m/Tutto toggle) only in "Storico".
                NOTE: CategoryTrendsGrid used to live here too — removed 2026-08-14:
                the EntityDossier renders the same answer (a category's trend) with
                full history instead of 12 months, and two renderings of one answer
                inevitably drift. */}
            <SavingsRateTrendSection
              allExpenses={allExpenses}
              historyStartYear={historyStartYear}
              scopeYear={selectedYear}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ── Shared expense/income list renderer ───────────────────────────────────
function ExpenseList({ expenses, isIncome }: { expenses: Expense[]; isIncome: boolean }) {
  if (expenses.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {isIncome ? 'Nessuna entrata trovata' : 'Nessuna spesa trovata'}
      </div>
    );
  }

  // Sum all amounts — income entries are positive, expense entries are negative.
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const amountClass = isIncome ? 'text-positive' : 'text-destructive';

  return (
    <div className="space-y-4">
      {/* Mobile list */}
      <div className="space-y-3 desktop:hidden">
        {expenses.map(e => {
          const date = toDate(e.date);
          return (
            <div key={e.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{format(date, 'dd/MM/yyyy', { locale: it })}</span>
                <span className={cn('font-medium', amountClass)}>{formatCurrency(e.amount)}</span>
              </div>
              {e.notes && <p className="text-sm text-muted-foreground">{e.notes}</p>}
              {e.link && (
                <a href={e.link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Apri link <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          );
        })}

        {/* Mobile total row — mirrors the desktop tfoot style. "Netto" because this
            sums SIGNED amounts (a refund nets off), while the dossier hero above is
            gross by magnitude — same word on both would collide on refund rows. */}
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold">
            Totale netto ({expenses.length} {expenses.length === 1 ? 'voce' : 'voci'})
          </span>
          <span className={cn('text-sm font-semibold font-mono', amountClass)}>
            {formatCurrency(totalAmount)}
          </span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden desktop:block rounded-md border">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Data</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Importo</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Note</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => {
                const date = toDate(e.date);
                return (
                  <tr key={e.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">{format(date, 'dd/MM/yyyy', { locale: it })}</td>
                    <td className={cn('px-4 py-3 text-sm text-right font-medium', amountClass)}>{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.notes || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noopener noreferrer" className="inline-flex text-primary hover:text-primary/80">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Total footer row — not sticky, appears naturally at end of table.
                "Netto": signed sum, unlike the gross-by-magnitude dossier hero. */}
            <tfoot className="bg-muted/50 border-t">
              <tr>
                <td className="px-4 py-3 text-sm font-semibold">
                  Totale netto ({expenses.length} {expenses.length === 1 ? 'voce' : 'voci'})
                </td>
                <td className={cn('px-4 py-3 text-sm text-right font-semibold font-mono', amountClass)}>
                  {formatCurrency(totalAmount)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
