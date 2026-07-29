/**
 * Cashflow Sankey Diagram Component with Budget Flow and Drill-down
 *
 * THREE MODES:
 * 1. Budget View (default): Income Categories → Budget → Expense Types → Expense Categories + Savings
 * 2. Type Drill-down: Expense Type → Categories (for that type)
 * 3. Category Drill-down: Category → Subcategories
 *
 * Data Flow (Budget View - 4-layer):
 * - Layer 1 (Left): Income categories (Stipendio, Bonus, etc.)
 * - Layer 2 (Center-left): Budget node (total income)
 * - Layer 3 (Center-right): Expense types (Spese Fisse, Variabili, Debiti)
 * - Layer 4 (Right): Expense categories (grouped by type) + Savings
 *
 * Interaction:
 * - Click on expense type → drill down to type → categories
 * - Click on any category → drill down to category → subcategories
 * - Click Budget/Risparmi → no action
 * - Back button → return to budget view
 *
 * The graph construction itself lives in lib/utils/cashflowSankey.ts — this file owns
 * the navigation state, the transaction list and the Nivo wiring.
 *
 * Used by: AnalisiTab
 */
'use client';

import { useState, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { ResponsiveSankey } from '@nivo/sankey';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  buildBudgetFlowData,
  buildBudgetFlowDataWithSubcategories,
  buildDrillDownData,
  buildTypeDrillDownData,
  categoryHasRealSubCategories,
  selectExpensesForDrillDown,
  type CategoryRef,
  type SankeyNode,
  type SankeyView,
  type SubCategoryRef,
} from '@/lib/utils/cashflowSankey';
import { formatCurrency, formatCurrencyForSankey } from '@/lib/services/chartService';
import { toDate } from '@/lib/utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DrillBreadcrumb, type DrillBreadcrumbStep } from '@/components/ui/drill-breadcrumb';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { chartReveal, fadeVariants } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';

interface CashflowSankeyChartProps {
  expenses: Expense[];    // All expenses for the period (income + expenses)
  isMobile: boolean;      // Responsive flag (computed in parent)
  title?: string;         // Optional custom title
}

/**
 * The expense-type level, when it is on the navigation path.
 *
 * `color` is the TYPE node's own color. Restoring the category's derived shade instead
 * paints the whole drill-down in near-grays — the bug this pairing exists to prevent.
 * Presence of the object answers "did we come from a type?", so the answer and the
 * value it implies can no longer disagree.
 */
interface TypeParent {
  expenseType: ExpenseType;
  color: string;
}

type SankeyDrillState =
  | { mode: 'type'; expenseType: ExpenseType; color: string }
  | { mode: 'category'; category: CategoryRef; color: string; parent?: TypeParent }
  | {
      mode: 'transactions';
      category: CategoryRef;
      color: string;
      parent?: TypeParent;
      subCategory?: SubCategoryRef;
    };

const EMPTY_VIEW: SankeyView = { nodes: [], links: [], index: new Map() };

export function CashflowSankeyChart({
  expenses,
  isMobile,
  title,
}: CashflowSankeyChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const prefersReducedMotion = useReducedMotion();

  // Drill-down state.
  //
  // A discriminated union, so a level cannot carry fields belonging to another one. The
  // type level collapses into a single optional `parent`: it used to be spread across
  // `parentType` (the label), `parentTypeColor` (the color to restore) and the implicit
  // "did we come from a type?" test on the former being defined. Keeping the answer and
  // the color in one object is what stops them drifting apart — the drift is exactly how
  // the gray-panel bug happened (AGENTS.md → Sankey Drill-Down).
  const [drill, setDrill] = useState<SankeyDrillState | null>(null);

  // Toggle for showing subcategories in budget view (5-layer vs 4-layer)
  const [showSubcategories, setShowSubcategories] = useState(false);

  // Build Sankey data based on current mode (budget view vs drill-down modes vs transactions)
  const view = useMemo((): SankeyView => {
    if (drill?.mode === 'type') {
      return buildTypeDrillDownData(expenses, drill.expenseType, drill.color, isMobile);
    }
    if (drill?.mode === 'category') {
      return buildDrillDownData(expenses, drill.category, drill.color, isMobile);
    }
    if (drill?.mode === 'transactions') {
      // Transaction list mode: don't render Sankey, render table instead
      return EMPTY_VIEW;
    }
    return showSubcategories
      ? buildBudgetFlowDataWithSubcategories(expenses, isMobile)
      : buildBudgetFlowData(expenses, isMobile);
  }, [expenses, drill, isMobile, showSubcategories]);

  // Nivo receives the graph only — never the descriptor index, which is ours.
  const chartData = useMemo(() => ({ nodes: view.nodes, links: view.links }), [view]);

  // Calculate total amount for percentage display in tooltips
  const totalAmount = useMemo(() => {
    // Avoid double-counting: in the budget view only the income links (which all end at
    // the Budget node) are summed; in a drill-down every link leaves the same root.
    const budgetNodeId = view.nodes.find((node) => view.index.get(node.id)?.kind === 'budget')?.id;
    return view.links.reduce((sum, link) => {
      if (drill || link.target === budgetNodeId) return sum + link.value;
      return sum;
    }, 0);
  }, [view, drill]);

  // Responsive configuration
  const chartConfig = isMobile
    ? {
        // Mobile: compact layout, labels inside, simplified
        height: 400,
        margin: { top: 20, right: 60, bottom: 20, left: 60 },
        nodeThickness: 15,
        nodeSpacing: 8,
        nodeBorderWidth: 1,
        enableLinkGradient: false, // Performance optimization
        labelPosition: 'inside' as const,
        labelOffset: 0,
      }
    : {
        // Desktop: spacious layout, labels outside, full detail
        height: 500,
        margin: { top: 40, right: 160, bottom: 40, left: 160 },
        nodeThickness: 20,
        nodeSpacing: 10,
        nodeBorderWidth: 2,
        enableLinkGradient: true,
        labelPosition: 'outside' as const,
        labelOffset: 12,
      };

  // Handle node click for multi-level drill-down navigation.
  //
  // The index says what a node IS, so the handler no longer has to infer it from the
  // current mode plus string shape — no '__' split, no "is this id one of the type
  // labels?" probe (which also matched a category literally named "Trasferimento"), no
  // re-derivation of income-ness by scanning the rows.
  const handleNodeClick = (node: { id: string; color: string }) => {
    const descriptor = view.index.get(node.id);
    // Nivo hands link objects to the same callback, and they carry an id too.
    if (!descriptor) return;

    switch (descriptor.kind) {
      case 'budget':
      case 'savings':
        return;

      case 'expenseType':
        // Clicking the root of the view we are already in is a no-op, not a re-entry.
        if (drill?.mode === 'type') return;
        setDrill({ mode: 'type', expenseType: descriptor.expenseType, color: node.color });
        return;

      case 'category': {
        // Same no-op as above: in category mode the only category node is the one we
        // already drilled into. Compared on the full identity, not just the key.
        if (
          drill?.mode === 'category' &&
          drill.category.key === descriptor.categoryKey &&
          drill.category.expenseType === descriptor.expenseType
        ) {
          return;
        }

        const category: CategoryRef = {
          expenseType: descriptor.expenseType,
          key: descriptor.categoryKey,
          label: descriptor.categoryLabel,
        };
        // node.color here is the category's derived shade; the type node's own color is
        // what has to be restored on the way back, so it is captured from the level above.
        const parent: TypeParent | undefined =
          drill?.mode === 'type' ? { expenseType: drill.expenseType, color: drill.color } : undefined;

        setDrill({
          mode: categoryHasRealSubCategories(expenses, category) ? 'category' : 'transactions',
          category,
          color: node.color,
          parent,
        });
        return;
      }

      case 'subCategory': {
        // Reached either from the 5-layer budget view (the category level is not on the
        // path) or from the category drill-down (it already is).
        const fromCategoryLevel = drill?.mode === 'category';
        setDrill({
          mode: 'transactions',
          category: fromCategoryLevel
            ? drill.category
            : {
                expenseType: descriptor.expenseType,
                key: descriptor.categoryKey,
                label: descriptor.categoryLabel,
              },
          color: fromCategoryLevel ? drill.color : node.color,
          parent: fromCategoryLevel ? drill.parent : undefined,
          subCategory: { key: descriptor.subCategoryKey, label: descriptor.subCategoryLabel },
        });
        return;
      }
    }
  };

  // Rows behind the current transaction list.
  const filteredExpenses = useMemo(
    () =>
      drill?.mode === 'transactions'
        ? selectExpensesForDrillDown(expenses, drill.category, drill.subCategory)
        : [],
    [expenses, drill]
  );

  // Handle back button click for multi-level navigation
  const handleBack = () => {
    if (drill?.mode !== 'transactions') {
      setDrill(null);
      return;
    }

    // Why: Prevent back navigation to an empty category drill-down.
    // A category whose rows carry no subcategory has nothing to show at that level, so
    // stepping back into it would strand the user on a view that just repeats the
    // category — skip straight to whatever level brought them here.
    if (categoryHasRealSubCategories(expenses, drill.category)) {
      setDrill({ mode: 'category', category: drill.category, color: drill.color, parent: drill.parent });
      return;
    }

    // Restore the type node's own color, not the category's derived shade: the shade is
    // a lighter/darker variant, and using it as the base would render the whole
    // drill-down chart in near-grays.
    if (drill.parent) {
      setDrill({ mode: 'type', expenseType: drill.parent.expenseType, color: drill.parent.color });
      return;
    }

    setDrill(null);
  };

  // The path from the root to the current level, as display labels.
  const breadcrumbLabels = ((): string[] => {
    if (!drill) return [];
    if (drill.mode === 'type') return [EXPENSE_TYPE_LABELS[drill.expenseType]];

    const typeStep = drill.parent ? [EXPENSE_TYPE_LABELS[drill.parent.expenseType]] : [];
    if (drill.mode === 'category') return [...typeStep, drill.category.label];
    return [...typeStep, drill.category.label, ...(drill.subCategory ? [drill.subCategory.label] : [])];
  })();

  const baseTitle = title || 'Flusso Cashflow';
  const getBreadcrumbTitle = (): string => [baseTitle, ...breadcrumbLabels].join(' - ');

  // ── Breadcrumb jump handlers ─────────────────────────────────────────────
  // Reuse the exact same target states handleBack already produces for each
  // level, so jumping directly to an intermediate crumb is equivalent to
  // clicking "Indietro" the corresponding number of times.

  const jumpToTypeLevel = () => {
    setDrill(prev =>
      prev && prev.mode !== 'type' && prev.parent
        ? { mode: 'type', expenseType: prev.parent.expenseType, color: prev.parent.color }
        : null
    );
  };

  const jumpToCategoryLevel = () => {
    setDrill(prev =>
      prev?.mode === 'transactions'
        ? { mode: 'category', category: prev.category, color: prev.color, parent: prev.parent }
        : prev
    );
  };

  // Build the clickable breadcrumb steps for the current drill-down path. The
  // last step never has an onClick (it's the current level) — lets a user jump
  // straight to an intermediate level instead of clicking "Indietro" repeatedly
  // (Nielsen heuristic #6, flagged in the 2026-07-21 impeccable critique).
  const getBreadcrumbSteps = (): DrillBreadcrumbStep[] => {
    if (!drill) return [];

    const root: DrillBreadcrumbStep = { label: baseTitle, onClick: () => setDrill(null) };
    // One handler per level, in the same order breadcrumbLabels lists them.
    const jumps: Array<(() => void) | undefined> =
      drill.mode !== 'type' && drill.parent
        ? [jumpToTypeLevel, jumpToCategoryLevel, undefined]
        : [jumpToCategoryLevel, undefined];

    return [
      root,
      ...breadcrumbLabels.map((label, position) => ({
        label,
        // The current level is never clickable.
        onClick: position === breadcrumbLabels.length - 1 ? undefined : jumps[position],
      })),
    ];
  };

  // Empty state: no data to visualize (but allow transactions mode to render table)
  if ((view.nodes.length === 0 || view.links.length === 0) && drill?.mode !== 'transactions') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{getBreadcrumbTitle()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Nessun dato disponibile per questo periodo
          </p>
        </CardContent>
      </Card>
    );
  }

  // Keyed on identity, not on labels: two same-named categories must not share a
  // Framer key, or switching between them would skip the remount and the reveal.
  const sankeyViewKey = (() => {
    if (!drill) return `budget-${showSubcategories ? 'subcategories' : 'categories'}`;
    if (drill.mode === 'type') return `type-${drill.expenseType}`;
    const subKey = drill.mode === 'transactions' ? drill.subCategory?.key ?? 'all' : 'all';
    return `${drill.mode}-${drill.category.expenseType}-${drill.category.key}-${subKey}`;
  })();

  const sankeyModeLabel = drill
    ? drill.mode === 'type'
      ? 'Dettaglio per tipologia'
      : drill.mode === 'category'
        ? 'Dettaglio per categoria'
        : 'Dettaglio movimenti'
    : showSubcategories
      ? 'Vista con sottocategorie'
      : 'Vista compatta';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {drill && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Indietro
                </Button>
              )}
              {drill ? (
                <DrillBreadcrumb ariaLabel="Posizione nel flusso" steps={getBreadcrumbSteps()} />
              ) : (
                <CardTitle>{getBreadcrumbTitle()}</CardTitle>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {sankeyModeLabel} · {view.nodes.length} nodi · {view.links.length} flussi
            </p>
          </div>
          {!drill && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSubcategories(!showSubcategories)}
              className="transition-colors duration-200 hover:border-primary/40"
            >
              {showSubcategories ? 'Nascondi sottocategorie' : 'Mostra sottocategorie'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Render Sankey chart only when NOT in transactions mode */}
        {drill?.mode !== 'transactions' && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sankeyViewKey}
              variants={prefersReducedMotion ? fadeVariants : chartReveal}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ height: chartConfig.height }}
            >
              <ResponsiveSankey
                data={chartData}
                margin={chartConfig.margin}
                align="justify"
                colors={{ datum: 'nodeColor' }}
                valueFormat={(value) => formatCurrencyForSankey(value)}
                animate={!prefersReducedMotion}
                motionConfig="gentle"
                nodeOpacity={1}
                nodeHoverOpacity={0.84}
                nodeThickness={chartConfig.nodeThickness}
                nodeSpacing={chartConfig.nodeSpacing}
                nodeBorderWidth={chartConfig.nodeBorderWidth}
                nodeBorderColor={{ from: 'color', modifiers: [['darker', 0.8]] }}
                nodeBorderRadius={3}
                linkOpacity={isDark ? 0.68 : 0.42}
                linkHoverOpacity={isDark ? 0.88 : 0.62}
                linkContract={3}
                enableLinkGradient={chartConfig.enableLinkGradient}
                // No `|| node.id` fallback anywhere: ids are namespaced now, so a missing
                // label would put "cat:fixed:aB3xK9" on screen. SankeyNode.label is
                // required precisely so that cannot happen. The cast is Nivo's doing —
                // its accessor type omits `label` because the accessor is what normally
                // produces it, while the datum at runtime is our node, label included.
                label={(node) => (node as unknown as SankeyNode).label}
                labelPosition={chartConfig.labelPosition}
                labelPadding={chartConfig.labelOffset}
                labelOrientation="horizontal"
                labelTextColor={isDark ? { from: 'color', modifiers: [['brighter', 1.5]] } : { from: 'color', modifiers: [['darker', 2]] }}
                // Links reach this callback too; only node data carries an id.
                onClick={(data) => { if ('id' in data) handleNodeClick(data); }}
                // Custom tooltip to match existing chart tooltip style
                nodeTooltip={({ node }) => {
                  const kind = view.index.get(node.id)?.kind;
                  return (
                    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-sm text-popover-foreground">
                      <strong>{node.label}</strong>
                      <br />
                      {formatCurrencyForSankey(node.value || 0)}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {totalAmount > 0
                          ? ((node.value || 0) / totalAmount * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                      {!drill && kind !== 'budget' && kind !== 'savings' && (
                        <>
                          <br />
                          <span className="text-xs text-muted-foreground italic">
                            Click per dettagli
                          </span>
                        </>
                      )}
                    </div>
                  );
                }}
                theme={{
                  tooltip: {
                    container: {
                      background: 'var(--popover)',
                      border: '1px solid var(--border)',
                      color: 'var(--popover-foreground)',
                      fontSize: '14px',
                    },
                  },
                }}
              />
            </motion.div>
          </AnimatePresence>
        )}

        {/* Transaction list view: shown when mode='transactions' */}
        {drill?.mode === 'transactions' && (() => {
          // Sum all transaction amounts to display the grand total alongside the row count.
          const listTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

          return (
            <div className="mt-6">
              {/* Empty state */}
              {filteredExpenses.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  Nessuna transazione trovata
                </div>
              )}

              {/* Desktop table view (sm and above) */}
              {filteredExpenses.length > 0 && (
                <>
                  <div className="hidden rounded-md border desktop:block">
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
                          {filteredExpenses.map((expense) => {
                            // Use semantic Tailwind tokens instead of hardcoded hex colors.
                            const rowAmountClass = expense.type === 'income'
                              ? 'text-positive'
                              : 'text-destructive';
                            return (
                              <tr key={expense.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 text-sm">
                                  {format(toDate(expense.date), 'dd/MM/yyyy', { locale: it })}
                                </td>
                                <td className={cn('px-4 py-3 text-right text-sm font-medium', rowAmountClass)}>
                                  {formatCurrency(expense.amount)}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  {expense.notes || '-'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {expense.link && (
                                    <a
                                      href={expense.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center text-primary hover:text-primary/80 transition-colors"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {/* Total footer row — not sticky, appears naturally at end of table */}
                        <tfoot className="bg-muted/50 border-t">
                          <tr>
                            <td className="px-4 py-3 text-sm font-semibold">
                              Totale ({filteredExpenses.length} {filteredExpenses.length === 1 ? 'voce' : 'voci'})
                            </td>
                            <td className={cn(
                              'px-4 py-3 text-sm text-right font-semibold font-mono',
                              listTotal >= 0 ? 'text-positive' : 'text-destructive'
                            )}>
                              {formatCurrency(listTotal)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Mobile card view (below sm) */}
                  <div className="space-y-3 desktop:hidden">
                    {filteredExpenses.map((expense) => {
                      const rowAmountClass = expense.type === 'income'
                        ? 'text-positive'
                        : 'text-destructive';
                      return (
                        <div key={expense.id} className="rounded-md border p-3 bg-card">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              {format(toDate(expense.date), 'dd/MM/yyyy', { locale: it })}
                            </span>
                            <span className={cn('text-sm font-medium', rowAmountClass)}>
                              {formatCurrency(expense.amount)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {expense.notes || '-'}
                          </p>
                          {expense.link && (
                            <a
                              href={expense.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                            >
                              Apri link <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      );
                    })}

                    {/* Mobile total row */}
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        Totale ({filteredExpenses.length} {filteredExpenses.length === 1 ? 'voce' : 'voci'})
                      </span>
                      <span className={cn(
                        'text-sm font-semibold font-mono',
                        listTotal >= 0 ? 'text-positive' : 'text-destructive'
                      )}>
                        {formatCurrency(listTotal)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
