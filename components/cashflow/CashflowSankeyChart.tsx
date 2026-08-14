/**
 * Cashflow Sankey Diagram Component — the FLOW view of the period.
 *
 * TWO MODES (2026-08-14 redesign):
 * 1. Budget View (default): Income Categories → Budget → Expense Types → Expense
 *    Categories + Savings (a 5-layer variant adds the subcategory layer).
 * 2. Type Drill-down: Expense Type → Categories (for that type).
 *
 * Interaction:
 * - Click on an expense type → internal drill to that type's flow.
 * - Click on a CATEGORY or SUBCATEGORY → `onEntityClick`: the parent (AnalisiTab)
 *   opens that entity's dossier in the composition drill-down. The Sankey used to
 *   own a third navigation machine (category → subcategories → transaction table);
 *   rerouting entity clicks to the one shared landing path removed a duplicated
 *   transaction list and made every entity click on the page mean the same thing.
 * - Click Budget/Risparmi → no action. Back button → budget view.
 *
 * The graph construction lives in lib/utils/cashflowSankey.ts — this file owns
 * the (now single-level) navigation state and the Nivo wiring.
 *
 * Used by: AnalisiTab
 */
'use client';

import { useState, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { ResponsiveSankey } from '@nivo/sankey';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  buildBudgetFlowData,
  buildBudgetFlowDataWithSubcategories,
  buildTypeDrillDownData,
  type SankeyNode,
  type SankeyView,
} from '@/lib/utils/cashflowSankey';
import { formatCurrencyForSankey } from '@/lib/services/chartService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DrillBreadcrumb, type DrillBreadcrumbStep } from '@/components/ui/drill-breadcrumb';
import { ChevronLeft } from 'lucide-react';
import { chartReveal, fadeVariants } from '@/lib/utils/motionVariants';

interface CashflowSankeyChartProps {
  expenses: Expense[];    // All expenses for the period (income + expenses)
  isMobile: boolean;      // Responsive flag (computed in parent)
  title?: string;         // Optional custom title
  /**
   * Category/subcategory node clicks land HERE, not in an internal drill —
   * the parent routes them to the same entity-focus path as every other
   * entry point (composition rows, search, anomaly chips).
   */
  onEntityClick: (target: {
    expenseType: ExpenseType;
    categoryKey: string;
    subCategoryKey?: string;
  }) => void;
}

/** The only internal drill left: one expense type's flow. */
interface TypeDrillState {
  expenseType: ExpenseType;
  /** The TYPE node's own color — the drill-down view derives its shades from it. */
  color: string;
}

export function CashflowSankeyChart({
  expenses,
  isMobile,
  title,
  onEntityClick,
}: CashflowSankeyChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const prefersReducedMotion = useReducedMotion();

  // The single internal drill level: one expense type's flow. Category and
  // subcategory levels navigate OUT via onEntityClick instead.
  const [drill, setDrill] = useState<TypeDrillState | null>(null);

  // Toggle for showing subcategories in budget view (5-layer vs 4-layer)
  const [showSubcategories, setShowSubcategories] = useState(false);

  // Build Sankey data based on current mode (budget view vs type drill-down)
  const view = useMemo((): SankeyView => {
    if (drill) {
      return buildTypeDrillDownData(expenses, drill.expenseType, drill.color, isMobile);
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

  // Handle node click.
  //
  // The index says what a node IS, so the handler never infers it from string shape —
  // no '__' split, no "is this id one of the type labels?" probe. Entity nodes
  // (category/subcategory) leave the component entirely via onEntityClick.
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
        if (drill) return;
        setDrill({ expenseType: descriptor.expenseType, color: node.color });
        return;

      case 'category':
        onEntityClick({
          expenseType: descriptor.expenseType,
          categoryKey: descriptor.categoryKey,
        });
        return;

      case 'subCategory':
        onEntityClick({
          expenseType: descriptor.expenseType,
          categoryKey: descriptor.categoryKey,
          subCategoryKey: descriptor.subCategoryKey,
        });
        return;
    }
  };

  // With a single internal level, back always means "to the budget view".
  const handleBack = () => setDrill(null);

  const baseTitle = title || 'Flusso Cashflow';
  const getBreadcrumbTitle = (): string =>
    drill ? `${baseTitle} - ${EXPENSE_TYPE_LABELS[drill.expenseType]}` : baseTitle;

  // Root crumb clickable, current type level not (it's where the user is).
  const getBreadcrumbSteps = (): DrillBreadcrumbStep[] => {
    if (!drill) return [];
    return [
      { label: baseTitle, onClick: () => setDrill(null) },
      { label: EXPENSE_TYPE_LABELS[drill.expenseType] },
    ];
  };

  // Empty state: no data to visualize
  if (view.nodes.length === 0 || view.links.length === 0) {
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

  // Keyed on identity so switching views remounts the reveal animation.
  const sankeyViewKey = drill
    ? `type-${drill.expenseType}`
    : `budget-${showSubcategories ? 'subcategories' : 'categories'}`;

  const sankeyModeLabel = drill
    ? 'Dettaglio per tipologia'
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
            {/* The mobile chart drops small slices for legibility — declared, never
                silent ("la precisione costruisce fiducia"). The full accounting is
                one scroll below, in the composition lists. */}
            {isMobile && (
              <p className="text-[11px] text-muted-foreground">
                Su schermi piccoli il grafico mostra solo le voci principali — l&apos;elenco
                completo &egrave; nelle liste sotto.
              </p>
            )}
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
                      {/* Entity nodes open the dossier from ANY view; a type node
                          only drills at the root (inside its own view it's a no-op). */}
                      {(kind === 'category' || kind === 'subCategory') && (
                        <>
                          <br />
                          <span className="text-xs text-muted-foreground italic">
                            Click per aprire la scheda
                          </span>
                        </>
                      )}
                      {!drill && kind === 'expenseType' && (
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
      </CardContent>
    </Card>
  );
}
