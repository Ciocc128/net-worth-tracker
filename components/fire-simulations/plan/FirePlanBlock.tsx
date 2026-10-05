'use client';

/**
 * «Il mio piano» — the one place of the FIRE page where the plan is written (doc/fire-ipotesi/README.md § 15, H1).
 *
 * A disclosure between the page header and the tab bar, OUTSIDE the tab panels, so it is the same block, open or
 * closed, in every tab. Closed it is a 44px row — eyebrow, the state («salvato nel profilo» or the amber dot of an
 * unsaved preview), the chevron — and no figure: the figures are the «Ipotesi usate» line's, one row below (RP2).
 * Open it is four tiles — Tu · Spesa e prelievo · Flussi nel tempo · Pensioni — and one action row.
 *
 * Every edit is a PREVIEW: the draft lives in the page (`useFirePlanDraft`), every tab reads it over the saved settings
 * (`useFireSettings`), and «Salva il piano» writes ALL the plan's fields in one `setSettings` (RP3, RP4). Each field says
 * on which tabs it acts (RP1, `FIRE_PLAN_AFFECTS`). The laws (IRPEF brackets) and the market hypotheses are NOT here:
 * they are Impostazioni › Simulazioni's.
 *
 * Config-first: the block opens by itself once per visit when the plan is not written yet (RP5, in the hook).
 */

import { useDeferredValue, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useFirePlan, useFireSettings } from '@/lib/hooks/useFirePlan';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { useFireDatedFlows } from '@/lib/hooks/useFireDatedFlows';
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { normalizeCoastFirePensions } from '@/lib/services/fireService';
import { DEFAULT_INPS_RETIREMENT_AGE, resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { summarizeLock } from '@/lib/utils/fireSummary';
import { describeEmergencyFund } from '@/lib/utils/fireAssumptionsNarrative';
import { describeLock, describePersonalSwr, describeRitaPreview, formatRate } from '@/lib/utils/fireNarrative';
import { addYearsToDate, createPensionDraft, describePensioniStatali, isValidAge, parseOptionalInteger, type PensionDraftIssue } from '@/lib/utils/coastFireView';
import { resolvePersonalSwrHorizon, solvePersonalSwr } from '@/lib/utils/sustainableWithdrawal';
import { DEFAULT_FIRE_TARGET_AGE, FIRE_PLAN_AFFECTS, describePlanFlows, describePlanSpending, describePlanYou } from '@/lib/utils/firePlan';
import { getItalyDateIso, getItalyYear } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { FireDatedFlowsSection } from '@/components/fire-simulations/FireDatedFlowsSection';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NarrativeText } from '@/components/ui/narrative-text';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';

/** 44px on touch, the 36px control from desktop: (`h-11 desktop:h-9`, AGENTS → Accessibility). */
const CONTROL_CLASS =
  'mt-1 h-11 desktop:h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';
const HELP_CLASS = 'mt-1 text-[11px] leading-[1.4]';

function Help({ id, invalid, children }: { id: string; invalid?: string; children: React.ReactNode }) {
  return (
    <p id={id} className={cn(HELP_CLASS, invalid ? 'text-destructive' : 'text-muted-foreground')}>
      {invalid ?? children}
    </p>
  );
}

function IssueLine({ issue }: { issue: PensionDraftIssue }) {
  return <p className={cn('max-w-[72ch] text-[11px] leading-[1.4]', issue.kind === 'incomplete' ? 'text-warning-foreground' : 'text-muted-foreground')}>{issue.message}</p>;
}

export function FirePlanBlock() {
  const plan = useFirePlan();
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: settings } = useFireSettings();

  // The lock state the Pensioni tile describes, and the funds it keeps closed (the capital's `K` reads them).
  const { data: assets } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });
  const lockActive = settings?.respectPensionLockInFire ?? false;
  const inpsAge = settings?.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE;
  const ritaLong = settings?.pensionRitaLongUnemployment ?? false;
  const userAge = settings?.userAge;
  const pensionLockState = useMemo(
    () => (lockActive && assets ? resolvePensionLockState(assets, { userAge, pensionInpsRetirementAge: inpsAge, pensionRitaLongUnemployment: ritaLong }, new Date(), calculateAssetValue) : null),
    [lockActive, assets, userAge, inpsAge, ritaLong],
  );
  const lockedIds = useMemo(() => new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [pensionLockState]);
  const { assumptions } = useFireAssumptions(lockedIds, { withCashflow: true });
  const { excluded: excludedFlows, mortgages, goalFlows } = useFireDatedFlows({ lockedAssetIds: lockedIds });

  const currentYear = getItalyYear();
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: inpsAge, pensionRitaLongUnemployment: ritaLong });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);

  // RS5: the personal SWR, only while the block is open, from a deferred request (≈0,4 s at 30 years, ≈0,65 s at 60 on the cloud
  // container): the panel paints first and the figure lands after, and typing the age does not stall.
  const open = plan?.open ?? false;
  const targetAge = settings?.coastFireRetirementAge ?? DEFAULT_FIRE_TARGET_AGE;
  const savedMarket = assumptions?.market;
  const savedWeights = assumptions?.weights;
  const savedCostPct = assumptions?.cost?.total;
  const personalSwrHorizon = resolvePersonalSwrHorizon(targetAge);
  const personalSwrRequest = useMemo(
    () => (open && savedMarket && savedWeights ? { market: savedMarket, weights: savedWeights, costPct: savedCostPct, horizonYears: personalSwrHorizon } : null),
    [open, savedMarket, savedWeights, savedCostPct, personalSwrHorizon],
  );
  const deferredPersonalSwrRequest = useDeferredValue(personalSwrRequest);
  const personalSwr = useMemo(
    () =>
      deferredPersonalSwrRequest
        ? solvePersonalSwr({
            weights: deferredPersonalSwrRequest.weights,
            market: deferredPersonalSwrRequest.market.scenarios.base,
            correlations: deferredPersonalSwrRequest.market.correlations,
            leverageSpread: deferredPersonalSwrRequest.market.leverageSpread,
            costPct: deferredPersonalSwrRequest.costPct,
            horizonYears: deferredPersonalSwrRequest.horizonYears,
          })
        : null,
    [deferredPersonalSwrRequest],
  );

  if (!plan) return null;
  const { form, onFormChange, problems, pensionIssues, hasUnsavedChanges } = plan;

  const parsedSwr = Number.parseFloat(form.withdrawalRate);
  const personalRate = personalSwr?.rate ?? null;
  // «Usa» is absent when the typed SWR already is the proposal.
  const canUsePersonalSwr = personalRate !== null && !(Number.isFinite(parsedSwr) && Math.abs(parsedSwr - personalRate) < 1e-9);
  const cashToInvest = assumptions?.capital?.cashToInvest ?? null;
  const annualExpense = assumptions?.expenses?.annual ?? null;
  const emergencyFundValue = form.fundDerived ? String(Math.round(cashToInvest?.fund ?? 0)) : form.emergencyFund;
  const typedAge = parseOptionalInteger(form.userAge);
  const typedTarget = parseOptionalInteger(form.targetAge);
  const incompleteCount = new Set(pensionIssues.filter((issue) => issue.kind === 'incomplete').map((issue) => issue.pensionId)).size;
  const hasCompactPensionEditor = form.pensions.length >= 3;
  const flowsInUse = settings?.fireDatedFlows?.length ?? 0;

  const updatePension = (id: string, field: 'label' | 'grossMonthlyAmount' | 'monthsPerYear' | 'startDate', value: string) =>
    onFormChange({ pensions: form.pensions.map((pension) => (pension.id === id ? { ...pension, [field]: value } : pension)) });
  const addPension = () => {
    const defaultDate =
      isValidAge(typedAge) && isValidAge(typedTarget) ? addYearsToDate(new Date(), Math.max(typedTarget - typedAge, 0)).toISOString().slice(0, 10) : '';
    onFormChange({ pensions: [...form.pensions, createPensionDraft(defaultDate)] });
  };

  const ritaPreview = describeRitaPreview({
    ritaUnlockAge,
    unlockCalendarYear: userAge !== undefined && ritaUnlockAge > userAge ? currentYear + (ritaUnlockAge - userAge) : null,
    alreadyUnlockable: userAge !== undefined && ritaUnlockAge <= userAge,
  });

  return (
    <Collapsible open={plan.open} onOpenChange={plan.setOpen}>
      {/* No aria-label: the trigger's name is its visible text, so «Anteprima non salvata» reaches a screen reader too. */}
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-y border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Il mio piano</span>
          {hasUnsavedChanges ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-warning-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-warning-foreground" aria-hidden="true" />
              Anteprima non salvata
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">salvato nel profilo</span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', plan.open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-3">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          {/* Tu (4) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
            <Tile eyebrow="Tu" aside="salvato nel profilo" reading={describePlanYou(isValidAge(typedAge) ? typedAge : null, isValidAge(typedTarget) ? typedTarget : null)} ariaLabel="Il mio piano: tu">
              <div className="mt-3.5 flex flex-col gap-4">
                <div>
                  <Label htmlFor="coastCurrentAge" className="text-[13px]">
                    Età attuale
                  </Label>
                  <Input
                    id="coastCurrentAge"
                    type="number"
                    inputMode="numeric"
                    min="18"
                    max="100"
                    step="1"
                    value={form.userAge}
                    onChange={(event) => onFormChange({ userAge: event.target.value })}
                    aria-invalid={problems.userAge ? true : undefined}
                    aria-describedby="coastCurrentAge-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                    placeholder="Es. 35"
                  />
                  <Help id="coastCurrentAge-help" invalid={problems.userAge}>
                    Da qui il capitale cresce e le pensioni hanno una data. {FIRE_PLAN_AFFECTS.age}.
                  </Help>
                </div>
                <div className="border-t border-border pt-3.5">
                  <Label htmlFor="targetAge" className="text-[13px]">
                    Età obiettivo
                  </Label>
                  <Input
                    id="targetAge"
                    type="number"
                    inputMode="numeric"
                    min="18"
                    max="100"
                    step="1"
                    value={form.targetAge}
                    onChange={(event) => onFormChange({ targetAge: event.target.value })}
                    aria-invalid={problems.targetAge ? true : undefined}
                    aria-describedby="targetAge-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <Help id="targetAge-help" invalid={problems.targetAge}>
                    A che età vuoi smettere. {FIRE_PLAN_AFFECTS.targetAge}.
                  </Help>
                </div>
              </div>
            </Tile>
          </div>

          {/* Spesa e prelievo (8) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-8')}>
            <Tile
              eyebrow="Spesa e prelievo"
              aside="salvati nel profilo"
              reading={describePlanSpending({
                expense: annualExpense,
                fromCashflow: (assumptions?.expenses?.origin ?? 'cashflow') === 'cashflow',
                swr: Number.isFinite(parsedSwr) && parsedSwr > 0 ? parsedSwr : null,
              })}
              ariaLabel="Il mio piano: spesa e prelievo"
            >
              <div className="mt-3.5 flex flex-col gap-4">
                <div>
                  <Label htmlFor="plannedExpenses" className="text-[13px]">
                    Spesa del piano (€ l&apos;anno)
                  </Label>
                  <Input
                    id="plannedExpenses"
                    type="number"
                    inputMode="decimal"
                    step="100"
                    min="0"
                    placeholder="dal Cashflow"
                    value={form.plannedExpenses}
                    onChange={(event) => onFormChange({ plannedExpenses: event.target.value })}
                    aria-invalid={problems.plannedExpenses ? true : undefined}
                    aria-describedby="plannedExpenses-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <Help id="plannedExpenses-help" invalid={problems.plannedExpenses}>
                    Vuota = l&apos;ultimo anno del Cashflow. {FIRE_PLAN_AFFECTS.expenses}.
                  </Help>
                </div>

                <div className="border-t border-border pt-3.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="withdrawalRate" className="text-[13px]">
                      Safe Withdrawal Rate (%)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        {/* A 14px glyph on a 32px target (44 on touch), the padding folded back by negative margins so the label's line height is unchanged. */}
                        <button
                          type="button"
                          className="-my-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:-my-3.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                          aria-label="Informazioni sul Safe Withdrawal Rate"
                        >
                          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="max-w-[280px] text-[13px] leading-relaxed">
                        La percentuale del patrimonio che puoi prelevare ogni anno in modo sostenibile. Il 4% (regola del 4%, Trinity Study) garantisce la sopravvivenza del portafoglio su 30 anni nel 95% degli scenari storici.
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Input
                    id="withdrawalRate"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.withdrawalRate}
                    onChange={(event) => onFormChange({ withdrawalRate: event.target.value })}
                    aria-invalid={problems.withdrawalRate ? true : undefined}
                    aria-describedby="withdrawalRate-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <Help id="withdrawalRate-help" invalid={problems.withdrawalRate}>
                    Tipicamente 4% secondo la regola del 4% (Trinity Study). {FIRE_PLAN_AFFECTS.swr}.
                  </Help>
                  {personalSwr && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <NarrativeText segments={describePersonalSwr(personalSwr)} className="min-w-0 flex-1 basis-[220px] text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
                      {canUsePersonalSwr && personalRate !== null && (
                        <Button type="button" variant="outline" size="sm" onClick={() => onFormChange({ withdrawalRate: String(personalRate) })} className="h-11 desktop:h-8">
                          Usa {formatRate(personalRate)}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* § 14.6: always shown, a fund typed can exceed the cash outside the portfolio (RE3). */}
                <div className="border-t border-border pt-3.5">
                  <Label htmlFor="emergencyFund" className="text-[13px]">
                    Fondo di emergenza (€)
                  </Label>
                  <Input
                    id="emergencyFund"
                    type="number"
                    inputMode="decimal"
                    step="1000"
                    min="0"
                    placeholder="nessuno"
                    value={emergencyFundValue}
                    onChange={(event) => onFormChange({ emergencyFund: event.target.value, fundDerived: false })}
                    aria-invalid={problems.emergencyFund ? true : undefined}
                    aria-describedby="emergencyFund-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <p
                    id="emergencyFund-help"
                    className={cn(HELP_CLASS, problems.emergencyFund ? 'text-destructive' : cashToInvest && cashToInvest.fundShortfall > 0 ? 'text-warning-foreground' : 'text-muted-foreground')}
                  >
                    {problems.emergencyFund ?? (cashToInvest ? describeEmergencyFund(cashToInvest, annualExpense) : 'Nessuna liquidità fuori dal portafoglio.')} {FIRE_PLAN_AFFECTS.fund}.
                  </p>
                </div>
              </div>
            </Tile>
          </div>

          {/* Flussi nel tempo (12) */}
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Flussi nel tempo" aside="salvati nel profilo" reading={describePlanFlows(flowsInUse + goalFlows.resolved.length, excludedFlows.length)} ariaLabel="Il mio piano: flussi nel tempo">
              <FireDatedFlowsSection
                flows={form.datedFlows}
                onChange={(datedFlows) => onFormChange({ datedFlows })}
                excluded={excludedFlows}
                mortgages={mortgages}
                pensions={normalizeCoastFirePensions(settings?.coastFirePensions)}
                goalFlows={goalFlows}
                currentYear={currentYear}
                userAge={userAge}
                isDemo={isDemo}
              />
            </Tile>
          </div>

          {/* Pensioni (12) */}
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Pensioni" aside="lordo mensile nominale alla decorrenza" reading={describePensioniStatali(form.pensions.length, incompleteCount)} ariaLabel="Il mio piano: pensioni">
              {pensionIssues.length > 0 && (
                <div className="mt-2 flex flex-col gap-0.5" role="status" aria-live="polite">
                  {pensionIssues.map((issue) => (
                    <IssueLine key={`${issue.pensionId}-${issue.message}`} issue={issue} />
                  ))}
                </div>
              )}

              {form.pensions.length > 0 && (
                <div className="mt-2.5 flex flex-col divide-y divide-border">
                  {form.pensions.map((pension, index) => (
                    <div key={pension.id} className="py-3">
                      {/* Always 2-col on mobile so inputs are paired (Name+Amount, Months+Date), then one line at desktop with the delete at the end. */}
                      <div
                        className={cn(
                          'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3',
                          hasCompactPensionEditor ? 'desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_150px_36px]' : 'desktop:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_150px_36px]',
                        )}
                      >
                        <div>
                          <Label htmlFor={`coast-pension-label-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Nome
                          </Label>
                          <Input id={`coast-pension-label-${pension.id}`} value={pension.label} onChange={(event) => updatePension(pension.id, 'label', event.target.value)} className={cn(CONTROL_CLASS, 'font-sans')} placeholder={`Pensione ${index + 1}`} />
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-gross-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Lordo mensile
                          </Label>
                          <Input id={`coast-pension-gross-${pension.id}`} type="number" inputMode="decimal" min="0" step="0.01" value={pension.grossMonthlyAmount} onChange={(event) => updatePension(pension.id, 'grossMonthlyAmount', event.target.value)} className={CONTROL_CLASS} placeholder="Es. 2200" />
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-months-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Mensilità
                          </Label>
                          <Input id={`coast-pension-months-${pension.id}`} type="number" inputMode="numeric" min="1" max="24" step="1" value={pension.monthsPerYear} onChange={(event) => updatePension(pension.id, 'monthsPerYear', event.target.value)} className={CONTROL_CLASS} placeholder="13" />
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-date-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Decorrenza
                          </Label>
                          <Input
                            id={`coast-pension-date-${pension.id}`}
                            type="date"
                            value={pension.startDate}
                            // Italian wall-clock today: toISOString() proposes yesterday from 22:00 CET (AGENTS → *Firebase Dates and Timezone*).
                            min={getItalyDateIso()}
                            onChange={(event) => updatePension(pension.id, 'startDate', event.target.value)}
                            className={CONTROL_CLASS}
                                  />
                        </div>
                        <div className="col-span-2 flex justify-end desktop:col-span-1 desktop:pt-5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onFormChange({ pensions: form.pensions.filter((entry) => entry.id !== pension.id) })}
                                    aria-label={`Rimuovi ${pension.label.trim() || `Pensione ${index + 1}`}`}
                            className="h-11 w-11 desktop:h-9 desktop:w-9"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3.5">
                <Button id="plan-add-pension" type="button" variant="outline" size="sm" onClick={addPension} className="h-11 desktop:h-9">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Aggiungi pensione
                </Button>
                <span className="text-[11px] leading-[1.4] text-muted-foreground">
                  Lordo stimato alla decorrenza, in euro di quell&apos;anno (nominale futuro); 13 mensilità con la tredicesima. Gli scaglioni IRPEF sono in Impostazioni › Simulazioni. {FIRE_PLAN_AFFECTS.pensions}.
                </span>
              </div>

              {/* D-T4: the lock is the plan's, and is saved with the rest. */}
              <div className="mt-3.5 flex flex-col gap-3 border-t border-border pt-3.5">
                <div className="flex items-start justify-between gap-3">
                  <label htmlFor="respectPensionLockInFire" className="min-w-0 cursor-pointer">
                    <span className="block text-[13px] text-foreground">Fondo pensione bloccato</span>
                    <NarrativeText segments={describeLock(lock)} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
                    <span className="block text-[11px] leading-[1.4] text-muted-foreground">{FIRE_PLAN_AFFECTS.lock}.</span>
                  </label>
                  <Switch
                    id="respectPensionLockInFire"
                    checked={form.respectPensionLock}
                    onCheckedChange={(checked) => onFormChange({ respectPensionLock: checked })}
                    aria-label="Considera il fondo pensione come capitale bloccato fino allo sblocco"
                    className="mt-0.5 shrink-0"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pensionInpsRetirementAge" className="text-[13px]">
                      Età pensione INPS
                    </Label>
                    <Input
                      id="pensionInpsRetirementAge"
                      type="number"
                      inputMode="numeric"
                      min="60"
                      max="75"
                      step="1"
                      value={form.inpsRetirementAge}
                      onChange={(event) => onFormChange({ inpsRetirementAge: event.target.value })}
                      aria-invalid={problems.inpsRetirementAge ? true : undefined}
                      aria-describedby="pensionInpsRetirementAge-help"
                      className={CONTROL_CLASS}
                      />
                    <Help id="pensionInpsRetirementAge-help" invalid={problems.inpsRetirementAge}>
                      RITA anticipa lo sblocco di 5 anni rispetto a questa età. {FIRE_PLAN_AFFECTS.rita}.
                    </Help>
                  </div>
                  <div className="flex items-start justify-between gap-3 sm:pt-6">
                    <div className="min-w-0">
                      <Label htmlFor="pensionRitaLongUnemployment" className="text-[13px] leading-normal">
                        {'Disoccupato ≥ 24 mesi dopo il FIRE'}
                      </Label>
                      <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{'Anticipa lo sblocco a INPS − 10 anni.'}</p>
                    </div>
                    <Switch
                      id="pensionRitaLongUnemployment"
                      checked={form.ritaLongUnemployment}
                      onCheckedChange={(checked) => onFormChange({ ritaLongUnemployment: checked })}
                        className="mt-0.5 shrink-0"
                    />
                  </div>
                </div>
                <NarrativeText segments={ritaPreview} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
              </div>
            </Tile>
          </div>
        </div>

        {/* RP2: ONE action row for the four tiles — the plan is one document. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => plan.save({ derivedFund: cashToInvest?.fund })} disabled={isDemo || plan.isSaving || plan.isLoadingSettings} className="h-11 desktop:h-9">
            {plan.isSaving ? 'Salvataggio…' : 'Salva il piano'}
          </Button>
          {hasUnsavedChanges && (
            <Button variant="ghost" size="sm" onClick={plan.reset} disabled={plan.isSaving} className="h-11 desktop:h-9">
              Annulla
            </Button>
          )}
          {isDemo && <span className="text-[11px] text-muted-foreground">non modificabile in demo</span>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
