'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { EXPENSE_TYPE_LABELS, type Expense, type ExpenseType } from '@/types/expenses';
import type { Narrative } from '@/lib/utils/narrative';
import {
  buildBudgetFlowData,
  buildBudgetFlowDataWithSubcategories,
  buildSpendingRoleDrillDownData,
  buildSpendingRolesFlowData,
  buildSpendingRolesFlowDataWithSubcategories,
  buildTypeDrillDownData,
  countSankeyLayers,
  DEFAULT_SPENDING_ROLE_PALETTE,
  resolveSankeyHeight,
  MAX_SUBCATEGORY_CATEGORIES,
  SPENDING_BUCKET_LABELS,
  type SankeyNodeDescriptor,
  type SankeyView,
  type SpendingRolePalette,
} from '@/lib/utils/cashflowSankey';
import type { SpendingBucket, SpendingRoleSource, SpendingRolesSummary } from '@/lib/utils/spendingRoles';
import { useCssColorTokens } from '@/lib/hooks/useCssColorTokens';
import { narrativeToText } from '@/lib/utils/narrative';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { DrillBreadcrumb } from '@/components/ui/drill-breadcrumb';
import { CashflowSankeyChart } from '@/components/cashflow/CashflowSankeyChart';
import { SpendingRolesMobileFlow } from '@/components/cashflow/analisi/SpendingRolesMobileFlow';
import { SpendingTypesMobileFlow } from '@/components/cashflow/analisi/SpendingTypesMobileFlow';
import type { TypeFlowBreakdown } from '@/lib/utils/analisiSummary';

/** The 50/30/20 view's inputs; `null` while settings.spendingRolesEnabled is off. */
export interface SpendingRolesFlowInput {
  categories: SpendingRoleSource[];
  summary: SpendingRolesSummary;
  reading: Narrative | null;
}

interface FlussoTileProps {
  /** The period's rows (income + spending); transfers are not flows. */
  expenses: Expense[];
  isMobile: boolean;
  /** The reading of the type view. */
  reading: Narrative | null;
  /** The type view on a phone: the reading's own type shares plus each type's categories. */
  typeBreakdown: TypeFlowBreakdown;
  spendingRoles: SpendingRolesFlowInput | null;
  /**
   * Category/subcategory node clicks land HERE, not in an internal drill — the page routes
   * them to the one entity-focus path every other entry point uses.
   */
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string; subCategoryKey?: string }) => void;
  className?: string;
}

type FlowMode = 'types' | 'roles';

// Two twin toggles in the Sottocategorie button's own style: parallel names that say what the flow
// is grouped by, one always pressed.
const FLOW_MODE_OPTIONS: ReadonlyArray<{ value: FlowMode; label: string }> = [
  { value: 'roles', label: 'Per ruolo' },
  { value: 'types', label: 'Per tipo' },
];

const TOGGLE_CLASS =
  'h-11 rounded-md border border-border px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40 desktop:h-8 desktop:px-2.5';

/**
 * The only internal drill left: one expense type's flow, or one role's. `color` is the root
 * node's own colour — the drill-down view derives its shades from it.
 */
type DrillState =
  | { kind: 'type'; expenseType: ExpenseType; color: string }
  | { kind: 'role'; bucket: SpendingBucket; color: string };

// Module-level so useCssColorTokens' effect sees stable identities. The five aliases are declared
// once in globals.css :root on the theme's own slots; a theme may name its own.
const ROLE_TOKENS: Record<keyof SpendingRolePalette, string> = {
  need: '--role-need',
  want: '--role-want',
  saving: '--role-saving',
  unclassified: '--role-unclassified',
  deficit: '--role-deficit',
};

/**
 * «Come scorrono i soldi?» — the app's one Sankey inside a tile: eyebrow, the reading over the
 * flow, the view's size and its toggles as the aside, then the plot. The tile owns the navigation
 * the chart has — the view (by type or by 50/30/20 role, the latter the default once the setting is
 * on), the subcategory layer and the single type/role drill — and builds the view, so the words
 * above the plot describe exactly what is drawn.
 *
 * On a phone the roles view is not a Sankey (a four-column flow gets ~80px a column at 390px): the
 * 50/30/20 bar and each role's categories as rows (SpendingRolesMobileFlow). Nor is the type view
 * — the only one with the roles off: one bar of the spending by type and each type's categories as
 * rows (SpendingTypesMobileFlow). Both are drawn by FlowShareMobile.
 */
export function FlussoTile({ expenses, isMobile, reading, typeBreakdown, spendingRoles, onEntityClick, className }: FlussoTileProps) {
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [showSubcategories, setShowSubcategories] = useState(false);
  const [preferredMode, setPreferredMode] = useState<FlowMode>('roles');
  const palette = useCssColorTokens(ROLE_TOKENS, DEFAULT_SPENDING_ROLE_PALETTE);

  // With the setting off there is only one view, whatever was chosen before.
  const mode: FlowMode = spendingRoles ? preferredMode : 'types';
  // A phone draws no Sankey in either view: a bar and rows (a drill is reachable only from a Sankey node,
  // so it appears here only when carried from a wider width).
  const phoneRows = isMobile && !drill;

  const view = useMemo((): SankeyView => {
    if (drill?.kind === 'type') return buildTypeDrillDownData(expenses, drill.expenseType, drill.color, isMobile);
    if (spendingRoles && drill?.kind === 'role') {
      return buildSpendingRoleDrillDownData(expenses, spendingRoles.categories, drill.bucket, drill.color, isMobile);
    }
    if (spendingRoles && mode === 'roles') {
      return showSubcategories
        ? buildSpendingRolesFlowDataWithSubcategories(expenses, spendingRoles.categories, palette, isMobile)
        : buildSpendingRolesFlowData(expenses, spendingRoles.categories, palette, isMobile);
    }
    return showSubcategories ? buildBudgetFlowDataWithSubcategories(expenses, isMobile) : buildBudgetFlowData(expenses, isMobile);
  }, [expenses, drill, isMobile, showSubcategories, spendingRoles, mode, palette]);

  const layer = showSubcategories ? 'subcategories' : 'categories';
  const viewKey = drill
    ? drill.kind === 'type' ? `type-${drill.expenseType}` : `role-${drill.bucket}`
    : `${mode === 'roles' ? 'roles' : 'budget'}-${layer}`;
  const modeLabel = drill
    ? drill.kind === 'type' ? 'Dettaglio per tipologia' : 'Dettaglio per ruolo'
    : showSubcategories ? `Con sottocategorie · prime ${MAX_SUBCATEGORY_CATEGORIES} categorie` : 'Vista compatta';
  const drillLabel = drill ? (drill.kind === 'type' ? EXPENSE_TYPE_LABELS[drill.expenseType] : SPENDING_BUCKET_LABELS[drill.bucket]) : null;
  const shownReading = mode === 'roles' && spendingRoles && !drill ? spendingRoles.reading : reading;
  // The plot grows with its widest column, so every label keeps its own line (see resolveSankeyHeight).
  const height = resolveSankeyHeight(countSankeyLayers(view), isMobile);
  // The chart is an image to a screen reader: its name is the tile's reading and its size.
  const chartLabel = `Flusso del periodo, ${modeLabel.toLowerCase()}: ${view.nodes.length} nodi e ${view.links.length} flussi.${shownReading ? ` ${narrativeToText(shownReading)}` : ''}`;

  const handleNodeClick = (descriptor: SankeyNodeDescriptor, color: string) => {
    switch (descriptor.kind) {
      case 'budget':
      case 'savings':
      case 'deficit':
        return;
      case 'expenseType':
        // Clicking the root of the view we are already in is a no-op, not a re-entry.
        if (!drill) setDrill({ kind: 'type', expenseType: descriptor.expenseType, color });
        return;
      case 'spendingRole':
        if (!drill) setDrill({ kind: 'role', bucket: descriptor.bucket, color });
        return;
      case 'category':
        onEntityClick({ expenseType: descriptor.expenseType, categoryKey: descriptor.categoryKey });
        return;
      case 'subCategory':
        onEntityClick({ expenseType: descriptor.expenseType, categoryKey: descriptor.categoryKey, subCategoryKey: descriptor.subCategoryKey });
        return;
    }
  };

  const handleModeChange = (next: FlowMode) => {
    setPreferredMode(next);
    setDrill(null);
  };

  return (
    <Tile
      eyebrow="Flusso"
      aside={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {!phoneRows && (
            <span>
              {modeLabel} · <span className="font-mono tabular-nums">{view.nodes.length}</span> nodi ·{' '}
              <span className="font-mono tabular-nums">{view.links.length}</span> flussi
            </span>
          )}
          {spendingRoles && !drill && (
            <div role="group" aria-label="Raggruppa il flusso" className="flex items-center gap-1.5">
              {FLOW_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleModeChange(option.value)}
                  aria-pressed={mode === option.value}
                  className={cn(TOGGLE_CLASS, mode === option.value && 'bg-muted')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {!drill && !phoneRows && (
            <button
              type="button"
              onClick={() => setShowSubcategories((value) => !value)}
              aria-pressed={showSubcategories}
              className={cn(TOGGLE_CLASS, showSubcategories && 'bg-muted')}
            >
              Sottocategorie
            </button>
          )}
        </div>
      }
      reading={shownReading}
      className={className}
    >
      {drill && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrill(null)}
            className="inline-flex h-11 items-center gap-1 rounded-md border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground desktop:h-8 desktop:border-0 desktop:px-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Indietro
          </button>
          <DrillBreadcrumb
            ariaLabel="Posizione nel flusso"
            steps={[{ label: 'Flusso', onClick: () => setDrill(null) }, { label: drillLabel ?? '' }]}
          />
        </div>
      )}
      {phoneRows ? (
        spendingRoles && mode === 'roles' ? (
          <SpendingRolesMobileFlow summary={spendingRoles.summary} onEntityClick={onEntityClick} />
        ) : (
          <SpendingTypesMobileFlow breakdown={typeBreakdown} onEntityClick={onEntityClick} />
        )
      ) : (
        <>
          {/* The mobile chart drops small slices for legibility — declared, never silent. */}
          {isMobile && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Su schermi piccoli il grafico mostra solo le voci principali — l&apos;elenco completo è nelle tessere per categoria.
            </p>
          )}
          <div className="mt-3">
            <CashflowSankeyChart
              view={view}
              viewKey={viewKey}
              isMobile={isMobile}
              height={height}
              drilled={drill !== null}
              ariaLabel={chartLabel}
              onNodeClick={handleNodeClick}
              nodeSort={mode === 'roles' && !drill ? 'input' : 'auto'}
            />
          </div>
        </>
      )}
      {/* What a click does, in words — it used to live in a hover tooltip only, invisible to touch. */}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        {phoneRows
          ? 'Una categoria apre la sua scheda.'
          : drill
            ? 'Una categoria apre la sua scheda; «Indietro» torna al flusso intero.'
            : mode === 'roles'
              ? 'Un ruolo apre il suo dettaglio; una categoria o una sottocategoria apre la scheda.'
              : 'Un tipo di spesa apre il suo dettaglio; una categoria o una sottocategoria apre la scheda.'}
      </p>
    </Tile>
  );
}
