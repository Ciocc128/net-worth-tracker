'use client';

/**
 * «Parametri», below the grid behind a disclosure: the settings the calculator runs on — the
 * SWR, the plan's expenses (empty = from the Cashflow), the RITA details of the pension lock — and the three scenarios'
 * market assumptions, as two tiles (Impostazioni 6 · Scenari 6). The scenarios are DECLARED here, never typed:
 * they are the target portfolio's rates computed from Impostazioni › Simulazioni (doc/fire-ipotesi/README.md D1). Configuration, not a reading
 * of the plan, so it does not earn a place in the grid (the Budget «Impostazioni» precedent).
 *
 * Config-first: the disclosure opens by itself only when no SWR is saved yet, or when an unsaved
 * edit appears — the page owns that state (`open`/`onOpenChange`) because the decision has to be
 * taken ONCE after the form has settled (doc/guide/fire.md § FIRE, What If and Goals: a `useRef` seeded flag, never the
 * transient `hasUnsavedChanges`). Every edit here is a PREVIEW — the verdict and the tiles read
 * the typed values at once — until «Salva»; the trigger carries an amber dot while something is
 * unsaved, so the state is visible with the panel closed.
 *
 * The pension-lock switch itself is NOT here: it is the Base di calcolo tile's control and saves
 * on change. What stays here is what needs a typed value: the INPS age and the long-unemployment
 * hypothesis that move the RITA unlock. The scenarios keep the Muted Sub-tile Variant B (bordered,
 * dense), now read-only.
 */

import Link from 'next/link';
import { ChevronDown, HelpCircle, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { CoastFirePensionInput, DatedFlow } from '@/types/assets';
import type { ExcludedFlow, ResolvedFlow } from '@/lib/utils/datedFlows';
import type { MortgageOption } from '@/lib/hooks/useFireDatedFlows';
import { FireDatedFlowsSection } from '@/components/fire-simulations/FireDatedFlowsSection';
import type { FireAssumptions, FireScenarioKey } from '@/lib/utils/fireAssumptions';
import { formatPercentage } from '@/lib/services/chartService';
import { describeCashToInvest } from '@/lib/utils/fireAssumptionsNarrative';
import type { Narrative } from '@/lib/utils/narrative';
import { describeImpostazioni, describePersonalSwr, describeScenarioParams, formatRate } from '@/lib/utils/fireNarrative';
import { isValidAge, parseOptionalInteger } from '@/lib/utils/coastFireView';
import type { PersonalSwr } from '@/lib/utils/sustainableWithdrawal';
import { SCENARIO_COLOR } from '@/lib/constants/scenarioColors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

/** 44px on touch, the 36px control from desktop: (`h-11 desktop:h-9`, AGENTS → Accessibility). */
const CONTROL_CLASS =
  'mt-1 h-11 desktop:h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

export interface FireSettingsForm {
  withdrawalRate: string;
  /** The page's one target age (`coastFireRetirementAge`, shared with Coast FIRE and What If), typed. */
  targetAge: string;
  /** The plan's yearly expenses, typed; empty = read from the Cashflow (doc/fire-ipotesi/README.md D5). */
  plannedExpenses: string;
  /** K1: the share (0–100) of the cash outside the portfolio that enters the capital, typed; absent saved = 0. */
  cashToInvestPct: string;
  /** § 12: the dated flows, edited as a preview; saved with the rest. */
  datedFlows: DatedFlow[];
  inpsRetirementAge: string;
  ritaLongUnemployment: boolean;
}

interface FireParametriProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `describeParametri(...)` — the saved settings in one line. */
  description: string;
  form: FireSettingsForm;
  onFormChange: (patch: Partial<FireSettingsForm>) => void;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isDemo: boolean;
  onSave: () => void;
  onReset: () => void;
  /** `describeRitaPreview(...)` — the unlock the RITA controls imply, or what is missing to estimate it. */
  ritaPreview: Narrative;
  /** The page's hypotheses (read-only): the three scenarios of the target portfolio. */
  assumptions: FireAssumptions | null;
  /** Today's age (Coast › Ipotesi), the lower bound of the target age; undefined when never written. */
  userAge: number | undefined;
  /** RS5: the personal SWR; null while it is not computed (the panel closed, no assumptions). */
  personalSwr: PersonalSwr | null;
  /** § 12: what the flows section needs besides the list in `form`. */
  flows: { excluded: readonly ExcludedFlow[]; mortgages: readonly MortgageOption[]; pensions: readonly CoastFirePensionInput[]; goalFlows: { resolved: readonly ResolvedFlow[]; excluded: readonly ExcludedFlow[] }; currentYear: number };
}

type ScenarioKey = FireScenarioKey;

const SCENARIO_META: { key: ScenarioKey; label: string; icon: typeof Target }[] = [
  { key: 'bear', label: 'Scenario Orso', icon: TrendingDown },
  { key: 'base', label: 'Scenario Base', icon: Target },
  { key: 'bull', label: 'Scenario Toro', icon: TrendingUp },
];

export function FireParametri({
  open,
  onOpenChange,
  description,
  form,
  onFormChange,
  hasUnsavedChanges,
  isSaving,
  isDemo,
  onSave,
  onReset,
  ritaPreview,
  assumptions,
  userAge,
  personalSwr,
  flows,
}: FireParametriProps) {

  // The same bounds `handleSaveSettings` enforces, said AT the field while typing: a toast on
  // «Salva» names the problem after the fact, `aria-invalid` names it where it is (2026-09-22).
  const parsedSwr = Number.parseFloat(form.withdrawalRate);
  const swrInvalid = form.withdrawalRate.trim() !== '' && !(Number.isFinite(parsedSwr) && parsedSwr > 0 && parsedSwr <= 100);
  const parsedTargetAge = parseOptionalInteger(form.targetAge);
  const targetAgeInvalid = form.targetAge.trim() !== '' && !(isValidAge(parsedTargetAge) && (userAge === undefined || parsedTargetAge > userAge));
  const personalRate = personalSwr?.rate ?? null;
  // «Usa» is absent when the typed SWR already is the proposal.
  const canUsePersonalSwr = personalRate !== null && !(Number.isFinite(parsedSwr) && Math.abs(parsedSwr - personalRate) < 1e-9);
  const parsedPlannedExpenses = Number.parseFloat(form.plannedExpenses.replace(',', '.'));
  const plannedExpensesInvalid = form.plannedExpenses.trim() !== '' && !(Number.isFinite(parsedPlannedExpenses) && parsedPlannedExpenses > 0);
  const cashToInvest = assumptions?.capital?.cashToInvest ?? null;
  const parsedCashToInvestPct = Number.parseFloat(form.cashToInvestPct.replace(',', '.'));
  const cashToInvestInvalid = form.cashToInvestPct.trim() === '' || !(Number.isFinite(parsedCashToInvestPct) && parsedCashToInvestPct >= 0 && parsedCashToInvestPct <= 100);
  const parsedInpsAge = Number.parseInt(form.inpsRetirementAge, 10);
  const inpsAgeInvalid = form.inpsRetirementAge.trim() !== '' && !(Number.isFinite(parsedInpsAge) && parsedInpsAge >= 60 && parsedInpsAge <= 75);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      {/* No aria-label: the trigger's name is its visible text, so «Anteprima non salvata» reaches a
          screen reader too. */}
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Parametri</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-warning-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-warning-foreground" aria-hidden="true" />
              Anteprima non salvata
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          {/* Impostazioni (6) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Impostazioni" aside="salvate nel profilo" reading={describeImpostazioni(hasUnsavedChanges)} ariaLabel="Impostazioni FIRE">
              <div className="mt-3.5 flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="withdrawalRate" className="text-[13px]">
                      Safe Withdrawal Rate (%)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        {/* A 14px glyph on a 32px target (44 on touch), the padding folded back by
                            negative margins so the label's line height is unchanged. */}
                        <button
                          type="button"
                          className="-my-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:-my-3.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                          aria-label="Informazioni sul Safe Withdrawal Rate"
                        >
                          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="max-w-[280px] text-[13px] leading-relaxed">
                        La percentuale del patrimonio che puoi prelevare ogni anno in modo sostenibile. Il 4% (regola del 4%, Trinity
                        Study) garantisce la sopravvivenza del portafoglio su 30 anni nel 95% degli scenari storici.
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
                    onChange={(e) => onFormChange({ withdrawalRate: e.target.value })}
                    aria-invalid={swrInvalid || undefined}
                    aria-describedby="withdrawalRate-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <p id="withdrawalRate-help" className={cn('mt-1 text-[11px] leading-[1.4]', swrInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                    {swrInvalid ? 'Serve un valore sopra 0 e fino a 100.' : 'Tipicamente 4% secondo la regola del 4% (Trinity Study).'}
                  </p>
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
                    onChange={(e) => onFormChange({ targetAge: e.target.value })}
                    aria-invalid={targetAgeInvalid || undefined}
                    aria-describedby="targetAge-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <p id="targetAge-help" className={cn('mt-1 text-[11px] leading-[1.4]', targetAgeInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                    {targetAgeInvalid
                      ? userAge !== undefined
                        ? `Serve un'età sopra la tua (${userAge}) e fino a 100.`
                        : "Serve un'età tra 18 e 100."
                      : 'La stessa di Coast FIRE: a che età vuoi smettere.'}
                  </p>
                </div>

                <div className="border-t border-border pt-3.5">
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
                    onChange={(e) => onFormChange({ plannedExpenses: e.target.value })}
                    aria-invalid={plannedExpensesInvalid || undefined}
                    aria-describedby="plannedExpenses-help"
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <p id="plannedExpenses-help" className={cn('mt-1 text-[11px] leading-[1.4]', plannedExpensesInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                    {plannedExpensesInvalid
                      ? 'Serve un importo sopra 0, oppure lascia vuoto.'
                      : 'Usata da tutte le simulazioni (Calcolatore, Coast FIRE, What If, Monte Carlo); vuota = l\'ultimo anno del Cashflow.'}
                  </p>
                </div>

                {/* K1 (§ 11.6): only when some cash sits outside the portfolio; otherwise the line says there is none. */}
                <div className="border-t border-border pt-3.5">
                  {cashToInvest && cashToInvest.total > 0 ? (
                    <>
                      <Label htmlFor="cashToInvestPct" className="text-[13px]">
                        Liquidità da investire (%)
                      </Label>
                      <Input
                        id="cashToInvestPct"
                        type="number"
                        inputMode="decimal"
                        step="5"
                        min="0"
                        max="100"
                        value={form.cashToInvestPct}
                        onChange={(e) => onFormChange({ cashToInvestPct: e.target.value })}
                        aria-invalid={cashToInvestInvalid || undefined}
                        aria-describedby="cashToInvestPct-help"
                        className={cn(CONTROL_CLASS, 'w-[160px]')}
                      />
                      <p id="cashToInvestPct-help" className={cn('mt-1 text-[11px] leading-[1.4]', cashToInvestInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                        {cashToInvestInvalid ? 'Serve una quota tra 0 e 100.' : describeCashToInvest(cashToInvest)}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">Nessuna liquidità fuori dal portafoglio.</p>
                  )}
                </div>

                <FireDatedFlowsSection
                  flows={form.datedFlows}
                  onChange={(datedFlows) => onFormChange({ datedFlows })}
                  excluded={flows.excluded}
                  mortgages={flows.mortgages}
                  pensions={flows.pensions}
                  goalFlows={flows.goalFlows}
                  currentYear={flows.currentYear}
                  userAge={userAge}
                  isDemo={isDemo}
                />

                <div className="flex flex-col gap-3 border-t border-border pt-3.5">
                  <div>
                    <p className="text-[13px] text-foreground">Sblocco del fondo pensione</p>
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                      Il vincolo si attiva nella tessera Base di calcolo; qui la regola RITA che ne stima l&apos;anno, salvo data impostata
                      sul singolo fondo.
                    </p>
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
                        onChange={(e) => onFormChange({ inpsRetirementAge: e.target.value })}
                        aria-invalid={inpsAgeInvalid || undefined}
                        aria-describedby="pensionInpsRetirementAge-help"
                        className={CONTROL_CLASS}
                      />
                      <p id="pensionInpsRetirementAge-help" className={cn('mt-1 text-[11px] leading-[1.4]', inpsAgeInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                        {inpsAgeInvalid ? 'Serve un\'età tra 60 e 75 anni.' : 'RITA anticipa lo sblocco di 5 anni rispetto a questa età.'}
                      </p>
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
              </div>

              <div className="mt-auto flex items-center gap-3 pt-4">
                <Button onClick={onSave} disabled={isDemo || isSaving} className="h-11 desktop:h-9">
                  {isSaving ? 'Salvataggio…' : hasUnsavedChanges ? 'Salva anteprima' : 'Salva impostazioni'}
                </Button>
                {hasUnsavedChanges && (
                  <Button variant="ghost" size="sm" onClick={onReset} disabled={isSaving} className="h-11 desktop:h-9">
                    Annulla
                  </Button>
                )}
                {isDemo && <span className="text-[11px] text-muted-foreground">non modificabile in demo</span>}
              </div>
            </Tile>
          </div>

          {/* Scenari (6) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Scenari" aside="rendimento composto annuo, %" reading={describeScenarioParams()} ariaLabel="Parametri degli scenari">
              {assumptions ? (
                <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {SCENARIO_META.map(({ key, label, icon: Icon }) => {
                    const scenario = assumptions.scenarios[key];
                    return (
                      <div key={key} className="rounded-xl border border-border bg-muted p-3.5">
                        {/* A chart slot is not a text colour: the slot is the swatch, the label stays muted. */}
                        <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SCENARIO_COLOR[key] }} aria-hidden="true" />
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {label}
                        </p>
                        <dl className="mt-3 flex flex-col gap-2 text-[13px]">
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-[11px] text-muted-foreground">Rendimento</dt>
                            <dd className="m-0 font-mono tabular-nums font-semibold">{formatPercentage(scenario.growthRate, 2)}</dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-[11px] text-muted-foreground">Reale</dt>
                            <dd className="m-0 font-mono tabular-nums">{formatPercentage(scenario.realReturnRate, 2)}</dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-[11px] text-muted-foreground">Inflazione</dt>
                            <dd className="m-0 font-mono tabular-nums">{formatPercentage(scenario.inflationRate, 2)}</dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-[11px] text-muted-foreground">Media</dt>
                            <dd className="m-0 font-mono tabular-nums">{formatPercentage(scenario.arithmeticMean, 2)}</dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-[11px] text-muted-foreground">Volatilità</dt>
                            <dd className="m-0 font-mono tabular-nums">{formatPercentage(scenario.volatility, 2)}</dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-auto pt-4">
                <Link href="/dashboard/settings?tab=simulazioni" className="inline-flex min-h-11 items-center text-[13px] text-foreground underline underline-offset-2 desktop:min-h-0">
                  Modifica in Impostazioni › Simulazioni
                </Link>
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
