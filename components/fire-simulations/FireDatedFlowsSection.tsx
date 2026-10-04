'use client';

/**
 * «Flussi nel tempo», in Parametri › Impostazioni (doc/fire-ipotesi/README.md § 12.7, D-F3): the list of the dated flows the
 * simulating tabs read — a mortgage that ends, a child, an inheritance, a part-time job after FIRE — one row each, a flow
 * left out in warning ink with its reason, the state pensions after them in read-only (D-F4). Every edit is a PREVIEW until
 * the section's «Salva»; the Calcolatore's `form` owns the list, this component only edits it.
 */
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { CoastFirePensionInput, DatedFlow } from '@/types/assets';
import type { ExcludedFlow, ResolvedFlow } from '@/lib/utils/datedFlows';
import type { MortgageOption } from '@/lib/hooks/useFireDatedFlows';
import { MAX_DATED_FLOWS } from '@/lib/utils/datedFlowValidation';
import { describeFlowRow, describeGoalFlowRow, describeMortgageOption, describePensionFlowRow } from '@/lib/utils/datedFlowsNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DatedFlowDialog } from '@/components/fire-simulations/DatedFlowDialog';

interface FireDatedFlowsSectionProps {
  flows: DatedFlow[];
  onChange: (flows: DatedFlow[]) => void;
  excluded: readonly ExcludedFlow[];
  mortgages: readonly MortgageOption[];
  pensions: readonly CoastFirePensionInput[];
  /** The goals that count in the FIRE plan (§ 13, RO1): read-only rows after the pensions. */
  goalFlows: { resolved: readonly ResolvedFlow[]; excluded: readonly ExcludedFlow[] };
  currentYear: number;
  userAge: number | undefined;
  isDemo: boolean;
}

/** The calendar year a state pension starts in, from its date or its legacy age; null when neither can be placed. */
function pensionStartYear(pension: CoastFirePensionInput, currentYear: number, userAge: number | undefined): number | null {
  if (pension.startDate) {
    const year = Number.parseInt(pension.startDate.slice(0, 4), 10);
    if (Number.isFinite(year)) return year;
  }
  return pension.startAge !== undefined && userAge !== undefined ? currentYear + Math.max(0, pension.startAge - userAge) : null;
}

const ROW_BUTTON_CLASS = 'inline-flex min-h-11 items-center px-1 text-[13px] text-foreground underline underline-offset-2 desktop:min-h-0';

export function FireDatedFlowsSection({ flows, onChange, excluded, mortgages, pensions, goalFlows, currentYear, userAge, isDemo }: FireDatedFlowsSectionProps) {
  const [dialog, setDialog] = useState<{ flow: DatedFlow | null } | null>(null);
  const [linking, setLinking] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const excludedById = new Map(excluded.map((flow) => [flow.id, flow.reason]));
  const mortgageByProperty = new Map(mortgages.map((option) => [option.propertyId, option]));
  const linkedIds = new Set(flows.flatMap((flow) => (flow.source?.kind === 'mortgage' ? [flow.source.propertyId] : [])));
  const linkable = mortgages.filter((option) => !linkedIds.has(option.propertyId) && option.source.schedule.kind !== 'none');
  const full = flows.length >= MAX_DATED_FLOWS;

  const save = (flow: DatedFlow) => onChange(flows.some((entry) => entry.id === flow.id) ? flows.map((entry) => (entry.id === flow.id ? flow : entry)) : [...flows, flow]);
  const link = (option: MortgageOption) => {
    const schedule = option.source.schedule;
    onChange([
      ...flows,
      {
        id: crypto.randomUUID(),
        label: `Mutuo ${option.propertyName}`,
        kind: 'expense',
        amount: schedule.kind === 'schedule' ? schedule.instalment * 12 : 1,
        indexed: false,
        start: { anchor: 'year', year: currentYear },
        durationYears: schedule.kind === 'schedule' ? Math.ceil(schedule.months / 12) : null,
        inCashflowToday: true,
        source: { kind: 'mortgage', propertyId: option.propertyId },
      },
    ]);
    setLinking(false);
  };

  return (
    <div className="border-t border-border pt-3.5">
      <p className="text-[13px] text-foreground">Flussi nel tempo</p>
      <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
        Un mutuo che finisce, un figlio, un&apos;eredità, un lavoro part-time dopo il FIRE: importi netti, da un anno per un certo numero di anni. Se scrivi a mano la spesa del piano, scrivila senza il mutuo e le altre voci che hai qui:
        le aggiungono loro.
      </p>

      {flows.length === 0 && pensions.length === 0 && goalFlows.resolved.length === 0 && goalFlows.excluded.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">Nessun flusso.</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border" data-testid="fire-dated-flows">
          {flows.map((flow) => {
            const reason = excludedById.get(flow.id);
            const mortgage = flow.source?.kind === 'mortgage' ? mortgageByProperty.get(flow.source.propertyId)?.source.schedule : undefined;
            return (
              <li key={flow.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 basis-[220px]">
                  <span className="block text-[13px] leading-[1.4] text-foreground">{describeFlowRow(flow, mortgage)}</span>
                  {reason && <span className="block text-[11px] leading-[1.4] text-warning-foreground">Escluso: {reason}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" className={ROW_BUTTON_CLASS} onClick={() => setDialog({ flow })} disabled={isDemo} aria-label={`Modifica ${flow.label}`}>
                    Modifica
                  </button>
                  <button type="button" className={ROW_BUTTON_CLASS} onClick={() => onChange(flows.filter((entry) => entry.id !== flow.id))} disabled={isDemo} aria-label={`Rimuovi ${flow.label}`}>
                    Rimuovi
                  </button>
                </span>
              </li>
            );
          })}
          {pensions.map((pension) => (
            <li key={pension.id} className="py-2 text-[13px] leading-[1.4] text-muted-foreground">
              {describePensionFlowRow(pension.label, pensionStartYear(pension, currentYear, userAge))}
            </li>
          ))}
          {goalFlows.resolved.map((goal) => (
            <li key={`goal-${goal.id}`} className="py-2 text-[13px] leading-[1.4] text-muted-foreground">
              {describeGoalFlowRow(goal.label, { amount: goal.amount, year: currentYear + goal.start })}
            </li>
          ))}
          {goalFlows.excluded.map((goal) => (
            <li key={`goal-${goal.id}`} className="py-2 text-[13px] leading-[1.4] text-muted-foreground">
              {describeGoalFlowRow(goal.label, { reason: goal.reason })}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button ref={addRef} type="button" variant="outline" size="sm" onClick={() => setDialog({ flow: null })} disabled={isDemo || full} className="h-11 desktop:h-8">
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Aggiungi un flusso
        </Button>
        {linkable.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinking((prev) => !prev)} disabled={isDemo || full} aria-expanded={linking} className="h-11 desktop:h-8">
            Collega un mutuo
          </Button>
        )}
        {full && <span className="text-[11px] text-muted-foreground">Al massimo {MAX_DATED_FLOWS} flussi.</span>}
      </div>
      {linking && (
        <ul className={cn('mt-2 flex flex-col divide-y divide-border rounded-lg border border-border')}>
          {linkable.map((option) => {
            return (
              <li key={option.propertyId}>
                <button type="button" onClick={() => link(option)} className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-[13px] hover:bg-muted desktop:min-h-0">
                  <span className="text-foreground">{option.propertyName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {describeMortgageOption(option.source.schedule)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <DatedFlowDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        flow={dialog?.flow ?? null}
        currentYear={currentYear}
        userAge={userAge}
        isDemo={isDemo}
        onSave={save}
        returnFocusTo={addRef}
      />
    </div>
  );
}
