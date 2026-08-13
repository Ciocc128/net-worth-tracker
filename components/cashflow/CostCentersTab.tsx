'use client';

/**
 * CostCentersTab — "Panoramica Centri di Costo"
 *
 * Rebuilt around the app's Trade Republic hierarchy: a dominant period total at the
 * top, then a single flat divide-y list of centers ranked by spend — not a grid of
 * identical cards. The list answers "where is the money going across projects?" at a
 * glance, which the old equal-weight card grid could not.
 *
 * IA, top to bottom:
 * 1. Period axis (Mese / Anno / 12 mesi / Sempre) — drives every figure below.
 * 2. Hero: total allocated to centers in the period + how many contributed to it.
 * 3. Flat ranked list with per-center number, share bar and budget signal.
 * 4. Cross-center comparison overlay (collapsible).
 * 5. Archived centers, collapsed.
 *
 * WHY client-side aggregation: we fetch all expenses per center once and derive every
 * period view in memory (pure layer in costCenterUtils). For a typical 2-10 centers
 * with a few hundred expenses each this is cheap and avoids N waterfall queries per
 * period change.
 *
 * The period axis is OWNED HERE and handed to the Detail, which renders its own copy of
 * the control: one axis, two views. The Detail used to display a period it had no way to
 * change, which left its hero disagreeing with its own forecast by an order of magnitude
 * with no visible control to reconcile them.
 */

import { useState, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { CostCenter, CostCenterPeriod } from '@/types/costCenters';
import { Expense } from '@/types/expenses';
import {
  getCostCenters,
  getExpensesForCostCenter,
  deleteCostCenter,
  setCostCenterArchived,
} from '@/lib/services/costCenterService';
import {
  computeCenterStats,
  evaluateCenterBudget,
  getLifecycleStatus,
  buildComparisonSeries,
  rankCentersBySpend,
  resolveLastActivityDate,
} from '@/lib/utils/costCenterUtils';
import { resolveCostCenterColor } from '@/lib/utils/costCenterColors';
import { formatCurrency, cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Plus, Layers, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { CostCenterDialog } from './CostCenterDialog';
import { CostCenterDetail } from './CostCenterDetail';
import { CostCenterErrorNotice } from './CostCenterErrorNotice';
import { EYEBROW_CLASS, CHART_TICK_STYLE } from './costCenterStyles';
import { toast } from 'sonner';

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const LEGEND_STYLE = { fontSize: 12, color: 'var(--muted-foreground)' } as const;

// "Sempre" rather than "Storico": Storico is a top-level page in this app, and the detail
// chart below has its own "Tutto lo storico" toggle — one word, three scopes, one screen.
const PERIOD_OPTIONS: { value: CostCenterPeriod; label: string }[] = [
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
  { value: 'rolling12', label: '12 mesi' },
  { value: 'all', label: 'Sempre' },
];

// Inline form of the axis, for sentences that must name the window they measure.
const SHARE_PERIOD_LABEL: Record<CostCenterPeriod, string> = {
  month: 'del mese',
  year: 'dell’anno',
  rolling12: 'dei 12 mesi',
  all: 'di sempre',
};

// A center plus everything derived for the current period — assembled once and reused
// by the hero, the ranked list and the comparison overlay.
interface CenterRow {
  center: CostCenter;
  expenses: Expense[];
  totalSpent: number;
  transactionCount: number;
  lifecycle: ReturnType<typeof getLifecycleStatus>;
  /** Unscoped, so the row can tell "never used" from "idle for 90 days". */
  lastActivityDate: Date | null;
  budgetRatio: number | null;
  budgetStatus: 'ok' | 'warning' | 'over' | null;
  budgetPeriod: 'monthly' | 'annual' | null;
}

export function CostCentersTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const chartColors = useChartColors();

  // Fetch centers + every center's raw expenses once. Period views are derived in memory,
  // so switching period is instant and needs no refetch.
  const { data, isLoading: loading, isError } = useQuery({
    queryKey: queryKeys.costCenters.all(ownerId ?? ''),
    // Reads the OWNER's data, not the viewer's. On a shared account these differ, and the
    // query used to fetch `user.uid` while keying and mutating on `ownerId` — so a guest
    // saw their own centers under the owner's cache key and deleted against the owner's.
    enabled: !!user && !!ownerId,
    queryFn: async () => {
      const userId = ownerId!;
      const centers = await getCostCenters(userId);
      const entries = await Promise.all(
        centers.map(async (center) => {
          const expenses = await getExpensesForCostCenter(userId, center.id);
          // Two different numbers, deliberately. Every figure on this tab is about SPENDING,
          // so the math runs on outgoing rows only — but deleteCostCenter unlinks whatever is
          // linked, income rows included, so the delete confirmation must count the raw list
          // or it understates its own consequence.
          return [
            center.id,
            { spending: expenses.filter((e) => e.amount < 0), linkedCount: expenses.length },
          ] as [string, { spending: Expense[]; linkedCount: number }];
        }),
      );
      return { centers, byCenter: Object.fromEntries(entries) };
    },
  });

  const centers = useMemo(() => data?.centers ?? [], [data]);
  const byCenter = useMemo(() => data?.byCenter ?? {}, [data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId ?? '') });

  // --- UI state ---
  const [period, setPeriod] = useState<CostCenterPeriod>('year');
  const [selectedCenter, setSelectedCenter] = useState<CostCenter | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  // --- Derived rows for the selected period ---
  const rows = useMemo<CenterRow[]>(() => {
    const now = new Date();
    return centers.map((center) => {
      const expenses = byCenter[center.id]?.spending ?? [];
      const stats = computeCenterStats(expenses, period, now);
      const budget = evaluateCenterBudget(center, expenses, now);
      // Dormancy is a fact about the center, not about the axis — so it reads the
      // unscoped activity date, not the period-filtered one from `stats`.
      const lastActivityDate = resolveLastActivityDate(expenses);
      return {
        center,
        expenses,
        totalSpent: stats.totalSpent,
        transactionCount: stats.transactionCount,
        lifecycle: getLifecycleStatus(center, lastActivityDate, now),
        lastActivityDate,
        budgetRatio: budget?.ratio ?? null,
        budgetStatus: budget?.status ?? null,
        budgetPeriod: budget?.budgetPeriod ?? null,
      };
    });
  }, [centers, byCenter, period]);

  const activeRows = useMemo(
    () => rankCentersBySpend(rows.filter((r) => r.lifecycle !== 'archived')),
    [rows],
  );
  const archivedRows = useMemo(() => rankCentersBySpend(rows.filter((r) => r.lifecycle === 'archived')), [rows]);

  const periodTotal = useMemo(
    () => activeRows.reduce((sum, r) => sum + r.totalSpent, 0),
    [activeRows],
  );
  const spendingCount = activeRows.filter((r) => r.totalSpent > 0).length;
  const maxSpend = activeRows[0]?.totalSpent ?? 0;
  // Archived rows are ranked among themselves: measuring their bars against the active
  // maximum clipped an archived center that had outspent every active one, and rendered
  // every archived bar at zero whenever the active list had no spend at all.
  const archivedMaxSpend = archivedRows[0]?.totalSpent ?? 0;
  // Archived rows are not in `periodTotal` (which sums the active ones), so measuring their
  // share against it printed a percentage of a total they are not part of.
  const archivedTotal = useMemo(
    () => archivedRows.reduce((sum, r) => sum + r.totalSpent, 0),
    [archivedRows],
  );

  // Comparison overlay: top centers over time for the period.
  const comparison = useMemo(
    () =>
      buildComparisonSeries(
        rows
          .filter((r) => r.lifecycle !== 'archived')
          .map((r) => ({
            id: r.center.id,
            name: r.center.name,
            color: r.center.color,
            expenses: r.expenses,
          })),
        period,
      ),
    [rows, period],
  );
  const comparisonData = useMemo(
    () => comparison.buckets.map((b) => ({ label: b.label, ...b.byCenter })),
    [comparison],
  );
  // buildComparisonSeries keeps only the top centers; say so rather than letting the chart
  // read as the whole picture.
  const comparisonHiddenCount = Math.max(
    0,
    activeRows.filter((r) => r.totalSpent > 0).length - comparison.centers.length,
  );

  // --- Handlers ---
  const handleOpenCreate = () => {
    setEditingCenter(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (center: CostCenter) => {
    setEditingCenter(center);
    setDialogOpen(true);
  };

  const handleDialogSuccess = (saved: CostCenter) => {
    if (selectedCenter?.id === saved.id) setSelectedCenter(saved);
    invalidate();
  };

  const handleDelete = async (center: CostCenter) => {
    if (!user || !ownerId) return;
    const unlinkedCount = byCenter[center.id]?.linkedCount ?? 0;
    try {
      await deleteCostCenter(ownerId, center.id);
      // The cascade is the part the user can't see: name the outcome, and name the
      // reassurance too — the expenses survive, they only lose the tag.
      toast.success(
        unlinkedCount > 0
          ? `"${center.name}" eliminato · ${unlinkedCount} ${unlinkedCount === 1 ? 'spesa scollegata resta' : 'spese scollegate restano'} in Cashflow`
          : `"${center.name}" eliminato`,
      );
      setSelectedCenter(null);
      invalidate();
    } catch (error) {
      console.error('Error deleting cost center:', error);
      toast.error("Errore durante l'eliminazione");
    }
  };

  const handleArchiveToggle = async (center: CostCenter) => {
    const archiving = !center.archivedAt;
    try {
      const archivedAt = await setCostCenterArchived(center.id, archiving);
      const updated = { ...center, archivedAt };
      if (selectedCenter?.id === center.id) setSelectedCenter(updated);
      toast.success(archiving ? `"${center.name}" archiviato` : `"${center.name}" ripristinato`);
      invalidate();
    } catch (error) {
      console.error('Error archiving cost center:', error);
      toast.error("Errore durante l'archiviazione");
    }
  };

  // --- Detail view ---
  if (selectedCenter) {
    return (
      <>
        <CostCenterDetail
          costCenter={selectedCenter}
          period={period}
          onPeriodChange={setPeriod}
          periodOptions={PERIOD_OPTIONS}
          linkedExpenseCount={byCenter[selectedCenter.id]?.linkedCount ?? 0}
          // The list already holds this center's spending rows; handing them over seeds the
          // Detail's cache so opening a center paints immediately instead of showing a full
          // skeleton while it re-fetches what is already in memory.
          initialExpenses={byCenter[selectedCenter.id]?.spending}
          onBack={() => setSelectedCenter(null)}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onArchiveToggle={handleArchiveToggle}
          isDemo={isDemo}
        />
        <CostCenterDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          costCenter={editingCenter}
          onSuccess={handleDialogSuccess}
        />
      </>
    );
  }

  // --- List / Panoramica view ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.01em]">Centri di Costo</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Raggruppa le spese per oggetto o progetto e confronta dove vanno i soldi
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          disabled={isDemo}
          aria-label={isDemo ? 'Nuovo centro — non disponibile in modalità demo' : undefined}
          className="w-full sm:w-auto sm:shrink-0"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuovo centro
        </Button>
      </div>

      {loading ? (
        <PanoramicaSkeleton />
      ) : isError ? (
        /* Before the empty-state check, never after: `centers` defaults to [] on failure, so
           the two are indistinguishable downstream. */
        <CostCenterErrorNotice message="Non è stato possibile caricare i centri di costo." />
      ) : centers.length === 0 ? (
        <EmptyState onCreate={handleOpenCreate} isDemo={isDemo} />
      ) : (
        <>
          {/* Period axis */}
          <SegmentedPill
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            layoutId="cost-center-period-list"
            ariaLabel="Periodo"
          />

          {/* HERO — total allocated in the period. */}
          <section>
            <p className={EYEBROW_CLASS}>Totale nei centri di costo</p>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <span className="text-[44px] desktop:text-[54px] leading-none font-bold font-mono tabular-nums tracking-[-0.03em]">
                {formatCurrency(periodTotal)}
              </span>
              {spendingCount > 0 && (
                <span className="text-xs text-muted-foreground pb-1.5">
                  da{' '}
                  <span className="font-mono tabular-nums text-foreground">{spendingCount}</span>{' '}
                  {spendingCount === 1 ? 'centro con spesa' : 'centri con spesa'}
                </span>
              )}
            </div>
          </section>

          {/* RANKED LIST — flat divide-y, ordered by spend. */}
          {activeRows.length > 0 ? (
            <div
              role="list"
              className="divide-y divide-border/60 rounded-2xl border border-border/60 overflow-hidden"
            >
              {activeRows.map((row, i) => (
                <CenterListRow
                  key={row.center.id}
                  row={row}
                  maxSpend={maxSpend}
                  shareBase={periodTotal}
                  periodLabel={SHARE_PERIOD_LABEL[period]}
                  index={i}
                  palette={chartColors}
                  onOpen={() => setSelectedCenter(row.center)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground px-1 py-8 text-center">
              Nessuna spesa nei centri attivi per questo periodo.
            </p>
          )}

          {/* COMPARISON overlay (B3) — only meaningful with 2+ spending centers. */}
          {/* Needs two centers AND two months: on «Mese» the series is a single bucket, and a
              line chart of one point draws nothing — the disclosure opened onto blank space. */}
          {comparison.centers.length >= 2 && comparison.buckets.length >= 2 && (
            <Collapsible open={comparisonOpen} onOpenChange={setComparisonOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Confronta l’andamento dei centri
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 text-muted-foreground transition-transform', comparisonOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="h-56 desktop:h-72 min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    {/* Role on the chart, not a wrapper — see the note on the Detail's chart.
                        The label names the centers, because role="img" hides the <Legend>
                        that was the only mapping from colour to center. */}
                    <LineChart
                      data={comparisonData}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                      accessibilityLayer={false}
                      role="img"
                      aria-label={`Andamento mensile di ${comparison.centers.map((c) => c.name).join(', ')}`}
                    >
                      <XAxis dataKey="label" tick={CHART_TICK_STYLE} tickLine={false} axisLine={false} />
                      <YAxis
                        tickFormatter={(v) => cachedFormatCurrencyEUR(v as number, true)}
                        tick={CHART_TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                      />
                      <Tooltip
                        formatter={(value, name) => [formatCurrency(value as number), name as string]}
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3 }}
                      />
                      <Legend wrapperStyle={LEGEND_STYLE} />
                      {comparison.centers.map((c) => (
                        <Line
                          key={c.id}
                          type="monotone"
                          dataKey={c.id}
                          name={c.name}
                          stroke={resolveCostCenterColor(c.color, c.id, chartColors)}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {comparisonHiddenCount > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Mostrati i{' '}
                    <span className="font-mono tabular-nums">{comparison.centers.length}</span>{' '}
                    centri con più spesa ·{' '}
                    <span className="font-mono tabular-nums">{comparisonHiddenCount}</span>{' '}
                    non {comparisonHiddenCount === 1 ? 'mostrato' : 'mostrati'}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ARCHIVED — collapsed lifecycle bucket (B4). */}
          {archivedRows.length > 0 && (
            <Collapsible open={showArchived} onOpenChange={setShowArchived}>
              {/* py-2.5 -mx-2 px-2: the trigger was a 20px-tall text run, well under the 44px
                  target rule. The negative margin keeps it optically flush with the list. */}
              {/* py-3 around a text-sm (20px) line box = 44px. py-2.5 landed at 40. */}
              <CollapsibleTrigger className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight
                  className={cn('h-4 w-4 transition-transform', showArchived && 'rotate-90')}
                  aria-hidden="true"
                />
                Centri archiviati (
                <span className="font-mono tabular-nums">{archivedRows.length}</span>)
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                {/* No opacity dimming here: the section title already says these are archived,
                    and dimming multiplied with text-muted-foreground put the sub-line below AA. */}
                <div
                  role="list"
                  className="divide-y divide-border/60 rounded-2xl border border-border/60 overflow-hidden"
                >
                  {archivedRows.map((row, i) => (
                    <CenterListRow
                      key={row.center.id}
                      row={row}
                      maxSpend={archivedMaxSpend}
                      shareBase={archivedTotal}
                      // Its own phrase: these rows divide by the archived subtotal, so the
                      // active list's "del totale del mese" would have claimed three
                      // archived centers were the whole month.
                      periodLabel="dei centri archiviati"
                      index={i}
                      palette={chartColors}
                      onOpen={() => setSelectedCenter(row.center)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      <CostCenterDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        costCenter={editingCenter}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}

// --- Row -------------------------------------------------------------------

/**
 * A single center as a flat list row: name + lifecycle + sub-line on the left,
 * dominant period number + share bar on the right.
 *
 * The bar encodes RANK (width = spend / largest center) and the sub-line's percentage
 * encodes SHARE (spend / period total). CompositionList documents why both are needed:
 * with only the bar, the top row is always full and reads as "this center is the hero
 * total" when the hero is in fact the sum of every row.
 */
function CenterListRow({
  row,
  maxSpend,
  shareBase,
  periodLabel,
  index,
  palette,
  onOpen,
}: {
  row: CenterRow;
  maxSpend: number;
  /** Total the row's share is measured against — the active total, or the archived one. */
  shareBase: number;
  periodLabel: string;
  index: number;
  palette: string[];
  onOpen: () => void;
}) {
  const {
    center,
    totalSpent,
    transactionCount,
    lifecycle,
    lastActivityDate,
    budgetStatus,
    budgetRatio,
    budgetPeriod,
  } = row;
  const prefersReducedMotion = useReducedMotion();
  const rankPct = maxSpend > 0 ? Math.round((totalSpent / maxSpend) * 100) : 0;
  const sharePct = shareBase > 0 ? Math.round((totalSpent / shareBase) * 100) : 0;
  const barColor = resolveCostCenterColor(center.color, center.id, palette);
  // `getLifecycleStatus` maps a null activity date to 'dormant' too, so a center that has
  // never had an expense reached a badge asserting ninety days of silence.
  const neverUsed = lastActivityDate === null;

  return (
    <div role="listitem">
    <motion.button
      type="button"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { delay: Math.min(index * 0.03, 0.2), duration: 0.18 }
      }
      onClick={onOpen}
      // No aria-label here: it would REPLACE the row's content, and the numbers in that
      // content are the entire reason the row exists. The affordance is carried by the
      // element being a button plus the sr-only verb below.
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="sr-only">Apri</span>
      <span
        className="h-8 w-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: barColor }}
        aria-hidden="true"
      />
      {/* Everything below is phrasing content (span, not div/p/Badge): a <button>'s content
          model admits nothing else, and shadcn's Badge renders a <div>. */}
      <span className="block min-w-0 flex-1">
        {/* Wraps rather than truncates: at 390px a name plus two badges left the name with
            roughly 50px, and the name is the only thing telling two rows apart. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{center.name}</span>
          {lifecycle === 'dormant' && (
            <RowBadge>
              {neverUsed ? 'Nessuna spesa registrata' : 'Nessuna spesa da 90 giorni'}
            </RowBadge>
          )}
          {budgetStatus === 'over' && (
            <RowBadge className="text-destructive border-destructive/40">Oltre tetto</RowBadge>
          )}
        </span>
        {/* The first two figures are the selected period; the budget ratio is NOT — it
            follows the ceiling's own window. Naming both stops one sentence from reading
            as three facts about the same span. */}
        <span className="block text-xs text-muted-foreground mt-0.5">
          <span className="font-mono tabular-nums">{transactionCount}</span>{' '}
          {transactionCount === 1 ? 'transazione' : 'transazioni'}
          {totalSpent > 0 && (
            <>
              {' · '}
              <span className="font-mono tabular-nums">{sharePct}%</span> del totale {periodLabel}
            </>
          )}
          {budgetRatio !== null && (
            <>
              {' · '}
              <span className="font-mono tabular-nums">{Math.round(budgetRatio * 100)}%</span> del
              tetto {budgetPeriod === 'monthly' ? 'mensile' : 'annuale'}
            </>
          )}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1.5 w-24 desktop:w-32 flex-shrink-0">
        <span className="font-mono font-semibold tabular-nums text-sm">
          {formatCurrency(totalSpent)}
        </span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className="block h-full rounded-full"
            style={{ width: `${rankPct}%`, backgroundColor: barColor, opacity: 0.7 }}
          />
        </span>
      </span>
    </motion.button>
    </div>
  );
}

/** Badge-shaped span. The shared `Badge` renders a `<div>`, which a `<button>` cannot hold. */
function RowBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-border px-1.5 text-[10px] font-normal text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

// --- States ----------------------------------------------------------------

function EmptyState({ onCreate, isDemo }: { onCreate: () => void; isDemo: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center text-muted-foreground">
      <Layers className="h-10 w-10 opacity-30" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">Nessun centro di costo</p>
        <p className="text-sm">
          Crea il primo centro per raggruppare spese per oggetto o progetto (es. &quot;Automobile Dacia&quot;).
        </p>
      </div>
      <Button onClick={onCreate} disabled={isDemo} variant="outline" size="sm">
        <Plus className="h-4 w-4 mr-1" />
        Crea il primo centro
      </Button>
    </div>
  );
}

function PanoramicaSkeleton() {
  return (
    <div
      className="space-y-6 animate-pulse motion-reduce:animate-none"
      aria-busy="true"
      aria-label="Caricamento centri di costo"
    >
      <div className="h-9 w-full max-w-md bg-muted rounded-full" />
      <div className="space-y-2">
        <div className="h-3 w-32 bg-muted rounded" />
        <div className="h-12 w-56 bg-muted rounded" />
      </div>
      <div className="rounded-2xl border border-border/60 divide-y divide-border/60">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="h-8 w-1 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-3 w-1/4 bg-muted rounded" />
            </div>
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
