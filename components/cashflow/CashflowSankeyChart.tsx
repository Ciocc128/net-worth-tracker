/**
 * Cashflow Sankey Diagram — the FLOW view of the period, as a plot only.
 *
 * Since the Analisi redesign (2026-08-25) this component draws ONE view it is handed: the
 * Flusso tile owns the navigation state (the subcategory toggle, the single type drill) and
 * builds the `SankeyView` with the pure builders in lib/utils/cashflowSankey.ts, so the tile's
 * eyebrow, aside and reading can describe exactly what is drawn. Node clicks leave through
 * `onNodeClick` with the node's DESCRIPTOR — the index says what a node is, the handler never
 * infers it from the id's shape.
 *
 * Colours reach it as hex (react-spring cannot interpolate oklch — AGENTS.md → Recharts): the type
 * view's are hardcoded, the 50/30/20 view's are theme tokens resolved by useCssColorTokens.
 *
 * Used by: components/cashflow/analisi/tiles/FlussoTile.tsx
 */
'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { ResponsiveSankey, type CustomSankeyLayerProps } from '@nivo/sankey';
import { LABEL_TEXT_COLORS, type SankeyLink, type SankeyNode, type SankeyNodeDescriptor, type SankeyView } from '@/lib/utils/cashflowSankey';
import { formatCurrencyForSankey, formatPercentage } from '@/lib/services/chartService';
import { chartReveal, fadeVariants } from '@/lib/utils/motionVariants';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface CashflowSankeyChartProps {
  view: SankeyView;
  /** Keyed on identity so switching views remounts the reveal animation. */
  viewKey: string;
  /** Compact layout: labels inside, thinner nodes, no gradients. */
  isMobile: boolean;
  /** The plot's height, from the view's widest column (`resolveSankeyHeight`) — never a fixed 500. */
  height: number;
  /** Inside a type's own view a type node is a no-op — the tooltip must not promise a drill. */
  drilled: boolean;
  /** The svg's accessible name: what is drawn, in the tile's words. */
  ariaLabel: string;
  onNodeClick: (descriptor: SankeyNodeDescriptor, color: string) => void;
  /**
   * 'input' keeps the builder's node order inside each column (the 50/30/20 view: a role's
   * categories stay together instead of interleaving by value); 'auto' is d3-sankey's own.
   */
  nodeSort?: 'auto' | 'input';
  /**
   * 'thin' (Flusso on desktop, both views, owner's pick «B», 2026-09-15): hairline nodes, pale
   * gradient ribbons and a two-line label — the name, then amount · share — instead of thick bordered
   * nodes. Since 2026-09-15 the subcategory layer is thin too (owner): inner labels carry a card halo
   * over the ribbons and the plot grows by 36px per node of its widest column.
   */
  variant?: 'classic' | 'thin';
}

type SankeyLayerNodes = CustomSankeyLayerProps<SankeyNode, SankeyLink>['nodes'];

/** Two-line node labels for the thin variant: left of the first two columns, right of the others. */
function thinLabelsLayer(totalAmount: number) {
  return function ThinLabels({ nodes }: { nodes: SankeyLayerNodes }) {
    const lastLayer = Math.max(...nodes.map((node) => node.layer));
    return (
      <g>
        {nodes.map((node) => {
          const onLeft = node.layer < Math.min(2, lastLayer);
          const x = onLeft ? node.x0 - 10 : node.x1 + 10;
          const y = (node.y0 + node.y1) / 2;
          const anchor = onLeft ? 'end' : 'start';
          const share = totalAmount > 0 ? Math.round((node.value / totalAmount) * 100) : 0;
          return (
            <g key={node.id} style={{ pointerEvents: 'none' }}>
              {/* A card-coloured halo: an inner column's label sits over the ribbons leaving it. */}
              <text x={x} y={y - 7} textAnchor={anchor} dominantBaseline="middle" fontSize={12} fill="var(--foreground)" fontWeight={node.layer === 2 ? 600 : 400} stroke="var(--card)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">
                {(node as unknown as SankeyNode).label}
              </text>
              <text x={x} y={y + 8} textAnchor={anchor} dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)" className="font-mono tabular-nums" stroke="var(--card)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">
                {`${cachedFormatCurrencyEUR(node.value, true)} · ${share}%`}
              </text>
            </g>
          );
        })}
      </g>
    );
  };
}

/** The thin chart's floor, and the pitch of one two-line label in its widest column. */
const THIN_MIN_HEIGHT = 520;
const THIN_ROW_PX = 44;

/** Nodes in the most crowded column, by each node's depth from the sources (d3-sankey's `start` alignment). */
function widestColumn(view: SankeyView): number {
  const incoming = new Map<string, string[]>();
  for (const link of view.links) incoming.set(link.target, [...(incoming.get(link.target) ?? []), link.source]);
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((p) => depthOf(p, seen)));
    depth.set(id, d);
    return d;
  };
  const perColumn = new Map<number, number>();
  for (const node of view.nodes) {
    const d = depthOf(node.id);
    perColumn.set(d, (perColumn.get(d) ?? 0) + 1);
  }
  return Math.max(1, ...perColumn.values());
}

export function CashflowSankeyChart({ view, viewKey, isMobile, height, drilled, ariaLabel, onNodeClick, nodeSort = 'auto', variant = 'classic' }: CashflowSankeyChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const prefersReducedMotion = useReducedMotion();

  // Nivo receives the graph only — never the descriptor index, which is ours.
  const chartData = useMemo(() => ({ nodes: view.nodes, links: view.links }), [view]);

  // Total for the tooltip shares: in the budget view only the income links (which all end at
  // the Budget node) are summed; in a drill-down every link leaves the same root.
  const totalAmount = useMemo(() => {
    const budgetNodeId = view.nodes.find((node) => view.index.get(node.id)?.kind === 'budget')?.id;
    return view.links.reduce((sum, link) => (drilled || link.target === budgetNodeId ? sum + link.value : sum), 0);
  }, [view, drilled]);

  const thin = variant === 'thin' && !isMobile;
  // The labels' base is what flows THROUGH Budget — max(in, out), the node's own value — so Budget
  // reads 100% and the branches add up to it even when spending exceeds income and the type view has
  // no deficit node to balance the left side (income alone gave «Budget · 104%»). In a drill, the root.
  const labelBase = useMemo(() => {
    const budgetId = view.nodes.find((node) => view.index.get(node.id)?.kind === 'budget')?.id;
    if (!budgetId) return totalAmount;
    const sum = (pick: (link: SankeyLink) => boolean) => view.links.filter(pick).reduce((acc, link) => acc + link.value, 0);
    return Math.max(sum((link) => link.target === budgetId), sum((link) => link.source === budgetId));
  }, [view, totalAmount]);
  const thinLabels = useMemo(() => thinLabelsLayer(labelBase), [labelBase]);
  const plotHeight = thin ? Math.max(THIN_MIN_HEIGHT, height, widestColumn(view) * THIN_ROW_PX + 48) : height;

  // The spacing is the floor under an 11px label: with 10px two tiny nodes' labels touched.
  const chartConfig = thin
    ? {
        margin: { top: 24, right: 170, bottom: 24, left: 170 },
        nodeThickness: 4,
        nodeSpacing: 34,
        nodeBorderWidth: 0,
        // Flat ribbons take the SOURCE colour, so Budget → role would be all slate: the gradient
        // lets each ribbon arrive in its role's colour.
        enableLinkGradient: true,
        labelPosition: 'outside' as const,
        labelOffset: 12,
      }
    : isMobile
    ? {
        margin: { top: 20, right: 60, bottom: 20, left: 60 },
        nodeThickness: 15,
        nodeSpacing: 10,
        nodeBorderWidth: 1,
        enableLinkGradient: false,
        labelPosition: 'inside' as const,
        labelOffset: 0,
      }
    : {
        margin: { top: 40, right: 160, bottom: 40, left: 160 },
        nodeThickness: 20,
        nodeSpacing: 14,
        nodeBorderWidth: 2,
        enableLinkGradient: true,
        labelPosition: 'outside' as const,
        labelOffset: 12,
      };

  if (view.nodes.length === 0 || view.links.length === 0) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">Nessun flusso nel periodo.</p>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        variants={prefersReducedMotion ? fadeVariants : chartReveal}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{ height: plotHeight }}
      >
        <ResponsiveSankey
          data={chartData}
          margin={chartConfig.margin}
          // `start`: a node sits at its depth from the sources, so a category without a
          // subcategory layer stays in the categories' column and the savings node beside
          // the types — `justify` pushed every leaf to the last column, 54 nodes deep.
          align="start"
          sort={nodeSort}
          role="img"
          ariaLabel={ariaLabel}
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
          nodeBorderRadius={thin ? 2 : 3}
          linkOpacity={thin ? (isDark ? 0.4 : 0.22) : isDark ? 0.68 : 0.42}
          linkHoverOpacity={thin ? (isDark ? 0.6 : 0.4) : isDark ? 0.88 : 0.62}
          linkContract={thin ? 0 : 3}
          enableLabels={!thin}
          layers={thin ? ['links', 'nodes', thinLabels, 'legends'] : ['links', 'nodes', 'labels', 'legends']}
          enableLinkGradient={chartConfig.enableLinkGradient}
          // No `|| node.id` fallback: ids are namespaced, and a missing label would put
          // "cat:fixed:aB3xK9" on screen. SankeyNode.label is required precisely so that
          // cannot happen; the cast is Nivo's accessor type omitting `label`.
          label={(node) => (node as unknown as SankeyNode).label}
          labelPosition={chartConfig.labelPosition}
          labelPadding={chartConfig.labelOffset}
          labelOrientation="horizontal"
          // One neutral per mode (see LABEL_TEXT_COLORS): a label is read, not coloured.
          labelTextColor={isDark ? LABEL_TEXT_COLORS.dark : LABEL_TEXT_COLORS.light}
          // Links reach this callback too; only node data carries an id.
          onClick={(data) => {
            if (!('id' in data)) return;
            const descriptor = view.index.get(data.id);
            if (descriptor) onNodeClick(descriptor, data.color);
          }}
          nodeTooltip={({ node }) => {
            const descriptor = view.index.get(node.id);
            const kind = descriptor?.kind;
            return (
              <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                <strong>{node.label}</strong>
                <br />
                <span className="font-mono tabular-nums">{formatCurrencyForSankey(node.value || 0)}</span>
                <br />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatPercentage(totalAmount > 0 ? ((node.value || 0) / totalAmount) * 100 : 0, 1)}
                </span>
                {(kind === 'category' || kind === 'subCategory') && (
                  <>
                    <br />
                    <span className="text-xs italic text-muted-foreground">Click per aprire la scheda</span>
                  </>
                )}
                {!drilled && descriptor?.kind === 'others' && descriptor.parent.kind !== 'income' && (
                  <>
                    <br />
                    <span className="text-xs italic text-muted-foreground">Click per vederle tutte</span>
                  </>
                )}
                {!drilled && (kind === 'expenseType' || kind === 'spendingRole') && (
                  <>
                    <br />
                    <span className="text-xs italic text-muted-foreground">
                      {kind === 'spendingRole' ? 'Click per il dettaglio per ruolo' : 'Click per il dettaglio per tipologia'}
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
  );
}
