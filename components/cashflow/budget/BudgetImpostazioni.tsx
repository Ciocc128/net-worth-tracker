'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Switch } from '@/components/ui/switch';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { validateBudgetAllocation } from '@/lib/utils/budgetUtils';
import { DEFAULT_ALERT_THRESHOLDS, type BudgetItem } from '@/types/budget';
import { cn } from '@/lib/utils';
import {
  ALERTS_SETTING_FOOTER,
  ALERTS_SETTING_READING,
  CEILING_SETTING_FOOTER,
  CEILING_SETTING_INVALID,
  describeCeilingSetting,
} from '@/lib/utils/budgetNarrative';

export interface BudgetSettingsValues {
  overallMonthlyAmount: number | undefined;
  alertsEnabled: boolean;
  alertThresholds: number[];
}

interface BudgetImpostazioniProps {
  open: boolean;
  onClose: () => void;
  /** The pencil that opened the modal: the focus returns to it (Safari does not focus a clicked button). */
  returnFocusTo: React.RefObject<HTMLElement | null>;
  /** The saved values: the draft starts from them and «Salva» is off while it equals them. */
  saved: BudgetSettingsValues;
  /** The budget rows, for the allocation check against the draft's ceiling. */
  items: BudgetItem[];
  isDemo: boolean;
  onSave: (values: BudgetSettingsValues) => void;
}

const sameThresholds = (a: number[], b: number[]) => a.length === b.length && a.every((t, i) => t === b[i]);

/**
 * «Tetto e avvisi» — the ceiling and the threshold alerts in a modal opened from the pencil on the
 * Tetto tile (R6, D-RU7). It works on a LOCAL DRAFT: «Annulla» discards it, «Salva» hands it to
 * `useBudgetConfig` (whose own debounced write is the real save). Before 2026-11-21 these were
 * a disclosure below the grid that saved while the number was being typed, so closing mid-digit
 * saved half a ceiling. Mounted only while open: the draft is born from the saved values.
 *
 * Two sections side by side from `desktop:`, one column below. Every control is 44px on touch and
 * the dense size from `desktop:` (AGENTS.md → Accessibility).
 */
export function BudgetImpostazioni({ open, onClose, returnFocusTo, saved, items, isDemo, onSave }: BudgetImpostazioniProps) {
  const [overall, setOverall] = useState<number | undefined>(saved.overallMonthlyAmount);
  const [alertsEnabled, setAlertsEnabled] = useState(saved.alertsEnabled);
  const [thresholds, setThresholds] = useState<number[]>(saved.alertThresholds);

  const validation = useMemo(() => validateBudgetAllocation(items, overall), [items, overall]);
  const unchanged =
    overall === saved.overallMonthlyAmount && alertsEnabled === saved.alertsEnabled && sameThresholds(thresholds, saved.alertThresholds);
  const canSave = !isDemo && validation.valid && !unchanged;

  const toggleThreshold = (threshold: number) => {
    setThresholds((current) =>
      current.includes(threshold) ? current.filter((t) => t !== threshold) : [...current, threshold].sort((a, b) => a - b),
    );
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave({ overallMonthlyAmount: overall, alertsEnabled, alertThresholds: thresholds });
    onClose();
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow="Budget"
      title="Tetto e avvisi"
      description="Il tetto mensile su tutte le spese e le soglie degli avvisi."
      width="lg"
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button variant="outline" className="h-11 desktop:h-9" onClick={onClose}>
            Annulla
          </Button>
          <Button className="h-11 desktop:h-9" onClick={handleSave} disabled={!canSave}>
            Salva
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-2">
        <section aria-label="Tetto complessivo mensile" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className={TILE_EYEBROW_CLASS}>Tetto complessivo mensile</h3>
            <span className="text-[11px] text-muted-foreground">su tutte le spese del mese</span>
          </div>
          <NarrativeText segments={describeCeilingSetting(validation)} className="text-[13px] leading-[1.45] text-foreground" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="overall-budget" className="text-[13px]">
              Tetto (€)
            </Label>
            <Input
              id="overall-budget"
              type="number"
              inputMode="decimal"
              min={0}
              disabled={isDemo}
              value={overall ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setOverall(v === '' ? undefined : parseFloat(v) || 0);
              }}
              placeholder="Nessun tetto"
              className="h-11 w-full max-w-[240px] font-mono tabular-nums desktop:h-9"
              aria-invalid={!validation.valid}
            />
          </div>
          <NarrativeText
            segments={validation.valid ? CEILING_SETTING_FOOTER : CEILING_SETTING_INVALID}
            className={cn('border-t border-border pt-3.5 text-[11px] leading-[1.45]', validation.valid ? 'text-muted-foreground' : 'text-destructive')}
          />
        </section>

        <section aria-label="Avvisi soglia" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className={TILE_EYEBROW_CLASS}>Avvisi soglia</h3>
            <span className="text-[11px] text-muted-foreground">qui e nell&apos;email mensile</span>
          </div>
          <NarrativeText segments={ALERTS_SETTING_READING} className="text-[13px] leading-[1.45] text-foreground" />
          {/* The label is the switch's 44px target on touch: it toggles through `htmlFor`. */}
          <div className="flex min-h-11 items-center justify-between gap-3 desktop:min-h-0">
            <Label htmlFor="alerts-enabled" className="flex min-h-11 flex-1 cursor-pointer items-center text-[13px] desktop:min-h-0">
              Avvisi attivi
            </Label>
            <Switch id="alerts-enabled" checked={alertsEnabled} disabled={isDemo} onCheckedChange={setAlertsEnabled} />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Soglie di avviso">
            {DEFAULT_ALERT_THRESHOLDS.map((t) => {
              const active = thresholds.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  disabled={isDemo || !alertsEnabled}
                  onClick={() => toggleThreshold(t)}
                  className={cn(
                    'h-11 min-w-11 rounded-full border px-3.5 font-mono text-[12px] tabular-nums transition-colors disabled:opacity-50 desktop:h-8 desktop:min-w-0 desktop:px-3',
                    active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
                  )}
                >
                  {t}%
                </button>
              );
            })}
          </div>
          <NarrativeText segments={ALERTS_SETTING_FOOTER} className="border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
        </section>
      </div>
    </ResponsiveModal>
  );
}
