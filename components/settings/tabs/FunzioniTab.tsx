'use client';

/**
 * Impostazioni › Funzioni (`funzioni`) — which pieces of the app exist: one switch per piece, each
 * with the line that says what appears when it is on (D-RU19). A switch here turns a page, a tab
 * or a control on or off; the stamp duty changes a calculation, so it stays with its rate in
 * Investimenti › Costi. Budget and the Assistant have no switch and get none here (F17 decides).
 *
 * The head of this tab is reserved for the Essenziale · Completa choice (F17); until it lands the
 * tile is the first thing on the tab.
 *
 * A controlled view of the `funzioni` slice: `slice` in, `onChange(patch)` out. Turning «Traguardi
 * di investimento» off turns the goal-driven targets of Allocazione › Strategia off with it — the
 * write does it (`composeSettingsDocument`), this view only edits the flag.
 */

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NarrativeText } from '@/components/ui/narrative-text';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import { describeFunctions, describeSpendingRolesSetting } from '@/lib/utils/settingsNarrative';
import type { SurfaceState } from '@/lib/utils/statesNarrative';
import type { CategoryClassificationCounts } from '@/lib/utils/spendingRoles';
import type { FunzioniSlice } from '@/lib/utils/settingsDraft';
import { INTERACTIVE_CONTROL_CLASS, SettingsTabPanel } from './shared';

export interface FunzioniTabProps {
  slice: FunzioniSlice;
  onChange: (patch: Partial<FunzioniSlice>) => void;
  /** Famiglia's size (Account's slice): the Divisione needs two people. */
  familyMemberCount: number;
  /** How many spending categories carry a 50/30/20 role — the Ruoli row says it while the roles are on. */
  classification: CategoryClassificationCounts;
  categoriesState: SurfaceState;
}

export function FunzioniTab({ slice, onChange, familyMemberCount, classification, categoriesState }: FunzioniTabProps) {
  const { goalBasedInvestingEnabled, costCentersEnabled, expenseSplitEnabled, spendingRolesEnabled } = slice;

  // The row's switch id, label, the line that says what shows up when it is on, and its value.
  const rows = [
    {
      id: 'goalBasedInvesting',
      label: 'Traguardi di investimento',
      help: 'Compare FIRE › Traguardi con le assegnazioni del portafoglio, e in Allocazione › Strategia i target possono venire da lì',
      checked: goalBasedInvestingEnabled,
      patch: (checked: boolean) => ({ goalBasedInvestingEnabled: checked }),
    },
    {
      id: 'costCentersEnabled',
      label: 'Centri di Costo',
      help: 'Il tab appare in Cashflow, il selettore nel modulo delle spese',
      checked: costCentersEnabled,
      patch: (checked: boolean) => ({ costCentersEnabled: checked }),
    },
    {
      id: 'expenseSplitEnabled',
      label: 'Divisione delle spese',
      help: 'Il tab appare in Cashflow, e ogni voce si può marcare come personale',
      checked: expenseSplitEnabled,
      patch: (checked: boolean) => ({ expenseSplitEnabled: checked }),
    },
    {
      id: 'spendingRolesEnabled',
      label: 'Ruoli 50/30/20',
      help: 'Ogni categoria di spesa riceve un ruolo (necessità, desideri, risparmi), e il flusso di Analisi si legge anche per ruolo',
      checked: spendingRolesEnabled,
      patch: (checked: boolean) => ({ spendingRolesEnabled: checked }),
    },
  ];

  return (
    <SettingsTabPanel tab="funzioni" label="Funzioni">
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <Tile
          eyebrow="Funzioni"
          reading={describeFunctions({
            goalBasedInvesting: goalBasedInvestingEnabled,
            costCenters: costCentersEnabled,
            expenseSplit: expenseSplitEnabled,
            spendingRoles: spendingRolesEnabled,
            familyMemberCount,
          })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <div key={row.id} className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Label htmlFor={row.id} className="text-[13px] font-medium">{row.label}</Label>
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{row.help}</p>
                  </div>
                  <Switch
                    id={row.id}
                    checked={row.checked}
                    onCheckedChange={(checked) => onChange(row.patch(checked))}
                    className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
                  />
                </div>
                {/* The roles live on the categories: with the switch on, how far the classification has got. */}
                {row.id === 'spendingRolesEnabled' && spendingRolesEnabled && categoriesState !== 'loading' && (
                  <NarrativeText
                    className="mt-2 text-[11px] leading-[1.4] text-muted-foreground"
                    segments={describeSpendingRolesSetting({
                      enabled: true,
                      classification,
                      categoriesUnread: categoriesState === 'failed',
                    })}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Spegnere una funzione la nasconde senza cancellare i dati; spegnere i Traguardi toglie anche la fonte «Dai traguardi» ai target di Strategia.
          </div>
        </Tile>
      </div>
    </SettingsTabPanel>
  );
}
