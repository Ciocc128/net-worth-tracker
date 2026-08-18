'use client';

/**
 * CoastFireConfigSection — the one "Impostazioni" collapsible of the Coast FIRE tab.
 *
 * Holds every input the projection reads: personal timeline, custom expenses, state pensions
 * and the IRPEF brackets. Fully controlled — the tab owns the draft state and the mutation, so
 * this file is layout, labels and validation copy only.
 *
 * The panel is collapsed once the user has configured their age (the config-first decision is
 * taken by the tab with a seeded useRef, never keyed on the transient `hasUnsavedChanges` —
 * AGENTS → *FIRE, What If and Goals*).
 */

import { AlertTriangle, ChevronDown, Info, Loader2, Mountain, Plus, Save, Trash2 } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { formatDate } from '@/lib/utils/formatters';
import { getItalyDateIso, toDate } from '@/lib/utils/dateHelpers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type {
  CoastFirePensionDraft,
  CoastFireTaxBracketDraft,
  PensionConfigurationState,
  PensionDraftIssue,
} from '@/lib/utils/coastFireView';
import { cn } from '@/lib/utils';

const COAST_CONTROL_CLASSNAME =
  'mt-1 transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

const SECTION_TITLE_CLASS = 'text-sm font-semibold text-foreground';

/** How many pension rows before the editor tightens its column widths to stay on one line. */
const COMPACT_PENSION_EDITOR_THRESHOLD = 3;

type PensionDraftField = keyof Omit<CoastFirePensionDraft, 'id'>;
type TaxBracketDraftField = keyof Omit<CoastFireTaxBracketDraft, 'id'>;

interface CoastFireConfigSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  userAge: string;
  onUserAgeChange: (value: string) => void;
  retirementAge: string;
  onRetirementAgeChange: (value: string) => void;
  useCustomExpenses: boolean;
  onUseCustomExpensesChange: (value: boolean) => void;
  customExpenses: string;
  onCustomExpensesChange: (value: string) => void;

  pensions: CoastFirePensionDraft[];
  onAddPension: () => void;
  onUpdatePension: (pensionId: string, field: PensionDraftField, value: string) => void;
  onRemovePension: (pensionId: string) => void;

  taxBrackets: CoastFireTaxBracketDraft[];
  onAddTaxBracket: () => void;
  onUpdateTaxBracket: (bracketId: string, field: TaxBracketDraftField, value: string) => void;
  onRemoveTaxBracket: (bracketId: string) => void;

  pensionIssues: PensionDraftIssue[];
  pensionConfigurationState: PensionConfigurationState;
  /** Summary shown on the collapsed trigger — already worded by the tab. */
  ageLabel: string;
  retirementAgeLabel: string;

  effectiveAnnualExpenses: number | undefined;
  detectedAnnualExpenses: number | undefined;
  withdrawalRate: number;
  includePrimaryResidence: boolean;
  liquidNetWorth: number;

  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isDemo: boolean;
  onSave: () => void;
  onReset: () => void;
}

const PENSION_STATE_LABEL: Record<PensionConfigurationState, string> = {
  valid: 'Pensioni configurate',
  informational: 'Configurazione con avviso',
  incomplete: 'Dati incompleti',
  empty: 'Nessuna pensione',
};

/**
 * The state chip is a data signal, not chrome, so it takes chart slots resolved through CSS
 * custom properties rather than a raw hue — the theme keeps ownership of the colour.
 */
const PENSION_STATE_COLOR: Record<PensionConfigurationState, string | undefined> = {
  valid: 'var(--chart-2)',
  informational: 'var(--chart-1)',
  incomplete: 'var(--chart-3)',
  empty: undefined,
};

export function CoastFireConfigSection({
  open,
  onOpenChange,
  userAge,
  onUserAgeChange,
  retirementAge,
  onRetirementAgeChange,
  useCustomExpenses,
  onUseCustomExpensesChange,
  customExpenses,
  onCustomExpensesChange,
  pensions,
  onAddPension,
  onUpdatePension,
  onRemovePension,
  taxBrackets,
  onAddTaxBracket,
  onUpdateTaxBracket,
  onRemoveTaxBracket,
  pensionIssues,
  pensionConfigurationState,
  ageLabel,
  retirementAgeLabel,
  effectiveAnnualExpenses,
  detectedAnnualExpenses,
  withdrawalRate,
  includePrimaryResidence,
  liquidNetWorth,
  hasUnsavedChanges,
  isSaving,
  isDemo,
  onSave,
  onReset,
}: CoastFireConfigSectionProps) {
  const hasCompactPensionEditor = pensions.length >= COMPACT_PENSION_EDITOR_THRESHOLD;
  const primaryIncompleteIssue = pensionIssues.find((issue) => issue.kind === 'incomplete') ?? null;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card className="overflow-hidden">
        {/* Trigger covers the full header — keyboard-accessible via native button */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer items-start justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mountain className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">Impostazioni Coast FIRE</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {'Età '}
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {ageLabel}
                  </span>
                </span>
                <span>
                  {'Target '}
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {retirementAgeLabel}
                  </span>
                </span>
                <span>
                  {'Pensioni '}
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {pensions.length}
                  </span>
                </span>
                {pensionConfigurationState !== 'empty' && (
                  <span
                    className="font-medium"
                    style={{ color: PENSION_STATE_COLOR[pensionConfigurationState] }}
                  >
                    {PENSION_STATE_LABEL[pensionConfigurationState]}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1 flex shrink-0 items-center gap-2">
              {hasUnsavedChanges && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-amber-500"
                  aria-label="Modifiche non salvate"
                />
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                  open && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-6 pb-6 pt-4">
            {hasUnsavedChanges && (
              <div
                role="status"
                aria-live="polite"
                className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm"
              >
                <div className="flex items-start gap-3">
                  {isSaving ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium text-foreground">Anteprima locale attiva</p>
                    <p className="text-muted-foreground">
                      Le metriche riflettono i valori inseriti ma non ancora salvati.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onReset}
                    disabled={isSaving}
                    className="shrink-0"
                  >
                    Annulla
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-6 desktop:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              {/* Personal timeline */}
              <div className="space-y-4">
                <div>
                  <p className={SECTION_TITLE_CLASS}>Timeline personale</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Definisce la distanza tra oggi, il target Coast FIRE e la decorrenza pensione.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="coastCurrentAge">Età attuale</Label>
                    <Input
                      id="coastCurrentAge"
                      type="number"
                      min="18"
                      max="100"
                      step="1"
                      value={userAge}
                      onChange={(event) => onUserAgeChange(event.target.value)}
                      className={COAST_CONTROL_CLASSNAME}
                      placeholder="Es. 35"
                    />
                  </div>
                  <div>
                    <Label htmlFor="coastRetirementAge">Età target Coast FIRE</Label>
                    <Input
                      id="coastRetirementAge"
                      type="number"
                      min="18"
                      max="100"
                      step="1"
                      value={retirementAge}
                      onChange={(event) => onRetirementAgeChange(event.target.value)}
                      className={COAST_CONTROL_CLASSNAME}
                    />
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">{'Età attuale'}</span>
                    {': punto di partenza del capitale che cresce senza nuovi contributi pensionistici.'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">{'Età target'}</span>
                    {': quando il capitale deve essere sufficiente, anche se le pensioni partono dopo.'}
                  </p>
                </div>
              </div>

              {/* Assumptions inherited from the general settings */}
              <div className="space-y-4">
                <div>
                  <p className={SECTION_TITLE_CLASS}>Assunzioni già attive</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    SWR, spese e patrimonio dalle impostazioni generali.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Spese personalizzate</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {useCustomExpenses
                          ? 'Importo inserito manualmente: sostituisce le spese rilevate.'
                          : "Spese rilevate dall'ultimo anno completo."}
                      </p>
                    </div>
                    <Switch
                      id="coastUseCustomExpenses"
                      checked={useCustomExpenses}
                      onCheckedChange={onUseCustomExpensesChange}
                      aria-label="Usa spese personalizzate"
                    />
                  </div>
                  {useCustomExpenses && (
                    <div className="space-y-1">
                      <Label htmlFor="coastCustomExpenses">{'Spese annue desiderate (€)'}</Label>
                      <Input
                        id="coastCustomExpenses"
                        type="number"
                        min="0"
                        step="100"
                        value={customExpenses}
                        onChange={(event) => onCustomExpensesChange(event.target.value)}
                        className={COAST_CONTROL_CLASSNAME}
                        placeholder="Es. 30000"
                      />
                      {detectedAnnualExpenses !== undefined && detectedAnnualExpenses > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Ultimo anno rilevato: {formatCurrency(detectedAnnualExpenses)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="divide-y divide-border rounded-lg border border-border">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">Spese usate</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(effectiveAnnualExpenses ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">SWR · Prima casa</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatPercentage(withdrawalRate)} · {includePrimaryResidence ? 'Con' : 'Senza'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">{'Liquidità FIRE'}</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(liquidNetWorth)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* State pensions */}
            <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
              <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                <div>
                  <h3 className={SECTION_TITLE_CLASS}>Pensioni statali</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ogni pensione riduce il fabbisogno del portafoglio solo dalla sua data di
                    decorrenza. Puoi inserirne più di una se hai contributi in casse diverse.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAddPension}
                  className="w-full desktop:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi pensione
                </Button>
              </div>

              {pensionIssues.length > 0 && (
                <div
                  className="rounded-md border p-4 text-sm"
                  style={{
                    borderColor: primaryIncompleteIssue
                      ? 'color-mix(in srgb, var(--chart-3) 30%, transparent)'
                      : 'color-mix(in srgb, var(--chart-1) 30%, transparent)',
                    backgroundColor: primaryIncompleteIssue
                      ? 'color-mix(in srgb, var(--chart-3) 10%, transparent)'
                      : 'color-mix(in srgb, var(--chart-1) 10%, transparent)',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {primaryIncompleteIssue ? 'Dati mancanti' : 'Note sulla decorrenza'}
                      </p>
                      {pensionIssues.slice(0, 3).map((issue) => (
                        <p key={`${issue.pensionId}-${issue.message}`} className="text-muted-foreground">
                          {issue.message}
                        </p>
                      ))}
                      {pensionIssues.length > 3 && (
                        <p className="text-muted-foreground">
                          Altri avvisi: {pensionIssues.length - 3}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {pensions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Nessuna pensione inserita. Il calcolo assume che il portafoglio debba sostenere per
                  intero le spese annue anche dopo il target Coast FIRE.
                </div>
              ) : (
                <div className="space-y-3">
                  {pensions.map((pension, index) => (
                    // bg-muted, never bg-card: a card inside the settings Card would be a
                    // card-within-card (DESIGN.md → Muted Sub-tile).
                    <div key={pension.id} className="rounded-xl border border-border bg-muted/40 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {pension.label.trim() || `Pensione ${index + 1}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pension.startDate
                              ? `Decorrenza prevista ${formatDate(toDate(pension.startDate))}.`
                              : 'Decorrenza non ancora impostata.'}
                          </p>
                        </div>
                        {/* h-10 w-10 ensures a 40px touch target — minimum for destructive actions */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemovePension(pension.id)}
                          aria-label={`Rimuovi ${pension.label.trim() || `Pensione ${index + 1}`}`}
                          className="h-10 w-10 shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* Always 2-col on mobile so inputs are paired (Name+Amount, Months+Date),
                          then expand to 4-col at desktop. items-start rather than items-end:
                          hint text under some fields makes bottom-alignment impossible without
                          a subgrid, and top-alignment is cleaner and more readable. */}
                      <div
                        className={
                          hasCompactPensionEditor
                            ? 'grid grid-cols-2 items-start gap-3 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_160px]'
                            : 'grid grid-cols-2 items-start gap-3 desktop:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_160px_160px]'
                        }
                      >
                        <div>
                          <Label htmlFor={`coast-pension-label-${pension.id}`}>Nome</Label>
                          <Input
                            id={`coast-pension-label-${pension.id}`}
                            value={pension.label}
                            onChange={(event) => onUpdatePension(pension.id, 'label', event.target.value)}
                            className={COAST_CONTROL_CLASSNAME}
                            placeholder={`Pensione ${index + 1}`}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-gross-${pension.id}`}>Lordo mensile</Label>
                          <Input
                            id={`coast-pension-gross-${pension.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={pension.grossMonthlyAmount}
                            onChange={(event) =>
                              onUpdatePension(pension.id, 'grossMonthlyAmount', event.target.value)
                            }
                            className={COAST_CONTROL_CLASSNAME}
                            placeholder="Es. 4242"
                          />
                          {/* The model expects a future nominal amount (euros at the pension start date),
                              not today's equivalent. Getting this wrong silently distorts the calculation. */}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {"Lordo stimato alla decorrenza, in euro di quell'anno (nominale futuro)."}
                          </p>
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-months-${pension.id}`}>
                            {'Mensilità annue'}
                          </Label>
                          <Input
                            id={`coast-pension-months-${pension.id}`}
                            type="number"
                            min="1"
                            max="24"
                            step="1"
                            value={pension.monthsPerYear}
                            onChange={(event) =>
                              onUpdatePension(pension.id, 'monthsPerYear', event.target.value)
                            }
                            className={COAST_CONTROL_CLASSNAME}
                            placeholder="Es. 13"
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            13 con tredicesima, 14 con quattordicesima.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-date-${pension.id}`}>Decorrenza</Label>
                          <Input
                            id={`coast-pension-date-${pension.id}`}
                            type="date"
                            value={pension.startDate}
                            // Italian wall-clock today: toISOString() proposes yesterday from
                            // 22:00 CET (AGENTS → *Firebase Dates and Timezone*).
                            min={getItalyDateIso()}
                            onChange={(event) =>
                              onUpdatePension(pension.id, 'startDate', event.target.value)
                            }
                            className={COAST_CONTROL_CLASSNAME}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Model assumptions — progressive disclosure inside the settings panel */}
              <Collapsible className="rounded-lg border border-border bg-muted/20">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="group flex w-full items-center justify-between rounded-lg px-4 py-3 text-left"
                  >
                    <span className="text-sm font-medium text-foreground">
                      Assunzioni del modello pensione
                    </span>
                    <ChevronDown
                      className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">{'Importo lordo mensile'}</span>
                    {": stima dell'importo che riceverai alla decorrenza, espresso in euro di quell'anno (nominale futuro)."}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Deflazione</span>
                    {": il modello converte il lordo nominale in potere d'acquisto ai prezzi di oggi, usando il rendimento reale dello scenario."}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">IRPEF</span>
                    {': imposta calcolata sul lordo annuo reale con gli scaglioni configurati. Il netto reale è ciò che abbatte il fabbisogno del portafoglio.'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Decorrenza</span>
                    {': prima di quella data la pensione non riduce nulla — il portafoglio copre da solo.'}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* IRPEF brackets */}
            <div className="mt-6 space-y-4 border-t border-border/40 pt-4">
              <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                <div>
                  <h3 className={SECTION_TITLE_CLASS}>Scaglioni IRPEF</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {"Applicati al lordo annuo reale di ciascuna pensione. Modificali se la normativa cambia o se usi un'aliquota media personalizzata."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAddTaxBracket}
                  className="w-full desktop:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi scaglione
                </Button>
              </div>

              <div className="divide-y divide-border rounded-lg border border-border">
                {taxBrackets.map((bracket, index) => (
                  <div
                    key={bracket.id}
                    className="grid grid-cols-[minmax(0,1fr)_100px_44px] items-end gap-3 px-4 py-3 desktop:grid-cols-[minmax(0,1fr)_200px_52px]"
                  >
                    <div>
                      <Label htmlFor={`coast-tax-limit-${bracket.id}`}>
                        {index === taxBrackets.length - 1
                          ? 'Fino a (vuoto = illimitato)'
                          : 'Fino a (€ annui)'}
                      </Label>
                      <Input
                        id={`coast-tax-limit-${bracket.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={bracket.upTo}
                        onChange={(event) => onUpdateTaxBracket(bracket.id, 'upTo', event.target.value)}
                        className={COAST_CONTROL_CLASSNAME}
                        placeholder={index === taxBrackets.length - 1 ? 'Illimitato' : 'Es. 28000'}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`coast-tax-rate-${bracket.id}`}>{'Aliquota %'}</Label>
                      <Input
                        id={`coast-tax-rate-${bracket.id}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={bracket.rate}
                        onChange={(event) => onUpdateTaxBracket(bracket.id, 'rate', event.target.value)}
                        className={COAST_CONTROL_CLASSNAME}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveTaxBracket(bracket.id)}
                      disabled={taxBrackets.length === 1}
                      aria-label={`Rimuovi lo scaglione ${index + 1}`}
                      className="h-10 w-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/40 pt-4">
              <Button
                onClick={onSave}
                disabled={isDemo || isSaving}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Salvataggio...' : 'Salva'}
              </Button>
              {hasUnsavedChanges && (
                <Button type="button" variant="outline" onClick={onReset} disabled={isSaving}>
                  Annulla
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
