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
  DEFAULT_SPENDING_ROLE_PALETTE,
  SPENDING_BUCKET_LABELS,
  TYPE_COLORS,
  type FlowGrouping,
  type SankeyNodeDescriptor,
  type SankeyView,
  type SpendingRolePalette,
} from '@/lib/utils/cashflowSankey';
import type { SpendingBucket, SpendingRoleSource, SpendingRolesSummary } from '@/lib/utils/spendingRoles';
import { useCssColorTokens } from '@/lib/hooks/useCssColorTokens';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { DrillBreadcrumb } from '@/components/ui/drill-breadcrumb';
import { CashflowSankeyChart } from '@/components/cashflow/CashflowSankeyChart';
import { SpendingRolesMobileFlow } from '@/components/cashflow/analisi/SpendingRolesMobileFlow';

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
// is grouped by, one always pressed (owner's call, 2026-09-15).
const FLOW_MODE_OPTIONS: ReadonlyArray<{ value: FlowMode; label: string }> = [
  { value: 'roles', label: 'Per ruolo' },
  { value: 'types', label: 'Per tipo' },
];

const TOGGLE_CLASS =
  'h-11 rounded-md border border-border px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40 desktop:h-7 desktop:px-2.5';

/** Desktop's thin chart draws the three largest sources and four categories a branch; the rest is «Altre». */
const DESKTOP_GROUPING: FlowGrouping = { incomeSources: 3, categoriesPerBranch: 4 };

/** The only internal drill left: one expense type's flow, or one role's. */
type DrillState =
  | { kind: 'type'; expenseType: ExpenseType; color: string }
  | { kind: 'role'; bucket: SpendingBucket; color: string };

// Module-level so useCssColorTokens' effect sees stable identities.
const ROLE_TOKENS: Record<keyof SpendingRolePalette, string> = {
  income: '--flow-in',
  budget: '--muted-foreground',
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
 * On desktop both views use the thin chart with grouped tails (owner's pick «B», 2026-09-15); only
 * the five-column subcategory layer keeps the classic one. On a phone the roles view is not a
 * Sankey at all: the 50/30/20 bar and the categories as rows (SpendingRolesMobileFlow).
 */
export function FlussoTile({ expenses, isMobile, reading, spendingRoles, onEntityClick, className }: FlussoTileProps) {
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [showSubcategories, setShowSubcategories] = useState(false);
  const [preferredMode, setPreferredMode] = useState<FlowMode>('roles');
  const palette = useCssColorTokens(ROLE_TOKENS, DEFAULT_SPENDING_ROLE_PALETTE);

  // With the setting off there is only one view, whatever was chosen before.
  const mode: FlowMode = spendingRoles ? preferredMode : 'types';
  const mobileRoles = isMobile && spendingRoles !== null && mode === 'roles' && !drill;
  const grouping = isMobile ? undefined : DESKTOP_GROUPING;

  const view = useMemo((): SankeyView => {
    if (drill?.kind === 'type') return buildTypeDrillDownData(expenses, drill.expenseType, drill.color, isMobile);
    if (spendingRoles && drill?.kind === 'role') {
      return buildSpendingRoleDrillDownData(expenses, spendingRoles.categories, drill.bucket, drill.color, isMobile);
    }
    if (spendingRoles && mode === 'roles') {
      return showSubcategories
        ? buildSpendingRolesFlowDataWithSubcategories(expenses, spendingRoles.categories, palette, isMobile)
        : buildSpendingRolesFlowData(expenses, spendingRoles.categories, palette, isMobile, grouping);
    }
    return showSubcategories ? buildBudgetFlowDataWithSubcategories(expenses, isMobile) : buildBudgetFlowData(expenses, isMobile, grouping);
  }, [expenses, drill, isMobile, showSubcategories, spendingRoles, mode, palette, grouping]);

  const layer = showSubcategories ? 'subcategories' : 'categories';
  const viewKey = drill
    ? drill.kind === 'type' ? `type-${drill.expenseType}` : `role-${drill.bucket}`
    : `${mode === 'roles' ? 'roles' : 'budget'}-${layer}`;
  const modeLabel = drill
    ? drill.kind === 'type' ? 'Dettaglio per tipologia' : 'Dettaglio per ruolo'
    : showSubcategories ? 'Con sottocategorie' : 'Vista compatta';
  const drillLabel = drill ? (drill.kind === 'type' ? EXPENSE_TYPE_LABELS[drill.expenseType] : SPENDING_BUCKET_LABELS[drill.bucket]) : null;

  const roleColor = (bucket: SpendingBucket) =>
    ({ need: palette.need, want: palette.want, saving: palette.saving, unclassified: palette.unclassified })[bucket];

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
      case 'others': {
        // «Altre N» opens the branch it belongs to, where every category is drawn; the income tail has nowhere to go.
        if (drill) return;
        const { parent } = descriptor;
        if (parent.kind === 'type') setDrill({ kind: 'type', expenseType: parent.expenseType, color: TYPE_COLORS[parent.expenseType] });
        if (parent.kind === 'role') setDrill({ kind: 'role', bucket: parent.bucket, color: roleColor(parent.bucket) });
        return;
      }
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
          {!mobileRoles && (
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
          {!drill && !mobileRoles && (
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
      reading={mode === 'roles' && spendingRoles && !drill ? spendingRoles.reading : reading}
      className={className}
    >
      {drill && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrill(null)}
            className="inline-flex h-11 items-center gap-1 rounded-md border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground desktop:h-7 desktop:border-0 desktop:px-2"
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
      {mobileRoles && spendingRoles ? (
        <SpendingRolesMobileFlow summary={spendingRoles.summary} onEntityClick={onEntityClick} />
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
              drilled={drill !== null}
              onNodeClick={handleNodeClick}
              nodeSort={mode === 'roles' && !drill ? 'input' : 'auto'}
              variant={showSubcategories && !drill ? 'classic' : 'thin'}
            />
          </div>
        </>
      )}
    </Tile>
  );
}
