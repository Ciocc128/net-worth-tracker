'use client';

/**
 * FIRE › WHAT IF — a verdict over tiles (2026-08-25)
 *
 * The tab answers «cosa cambia se…?» before it shows a number: a rule-generated verdict
 * (`buildWhatIfVerdict` in lib/utils/whatIfNarrative.ts) takes its headline and its tone from the
 * delta in years («Il FIRE slitta di 1 anno.») and names, with their bounds, what the event does
 * to the capital, the FIRE number, the year, the passive income and the Coast plan, over a
 * 12-column grid of tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Evento(4) | Prima e dopo(5) | Delta(3)  (under the verdict, full width)
 *   Below desktop:    ONE sequence, the DOM above (The First-Screen Rule, The Input Tile Rule,
 *                     since 2026-10-15): the verdict's title → the first sentence (the event
 *                     and its clauses) → the strip of two figures (the hit today, the hit at the
 *                     FIRE year) → the lock as the scope line with the bridge on → «Il perché»
 *                     (the Coast, the bridge note) → Evento open → «Il resto della pagina» → Prima
 *                     e dopo, Delta as closed rows (`useMobileSections` with `tab: 'whatif'`,
 *                     doc/guide/fire-what-if.md § Composizione mobile).
 *
 * The Evento comes first at every width, BEFORE the verdict (FEAT FIRE 2026-10-05): on this tab the
 * event IS the question, the verdict is about what is typed there. The page has NO period axis — an
 * event is applied today (year 0) unless «Quando» says otherwise — and the one control that moves
 * the verdict, the event form, is a tile of the grid, not a disclosure. The Sensibilità matrix left
 * for the Calcolatore (next to Età obiettivo): it asks «cosa cambio io?», not «e se succede?». The
 * event stays preset (6 months without income): an empty tab would have nothing to say.
 *
 * Data flow:
 * 1. settings + assets + annual cashflow queries (shared React Query keys with the other FIRE
 *    tabs, so the cache is reused — no extra fetching), keyed by `ownerId`;
 * 2. a `WhatIfBaseline` assembled with useMemo — the pension bridge included, so the «prima» side
 *    agrees with the Calcolatore's year when the lock is on;
 * 3. the active event + its inputs build a `WhatIfScenario`; `calculateWhatIfImpact` re-runs the
 *    pure FIRE/Coast functions on baseline vs adjusted and diffs them.
 *
 * This file is the ORCHESTRATOR and computes nothing: the numbers come from
 * lib/utils/whatIfSummary.ts over the impact the service returns, the words from
 * lib/utils/whatIfNarrative.ts. The income-source selection and its sum stay here (UI-only): the
 * pure layer is category-agnostic. Scenario inputs are ephemeral local state — exploration, not
 * persisted settings.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useFirePlan } from '@/lib/hooks/useFirePlan';
import { MAX_DATED_FLOWS } from '@/lib/utils/datedFlowValidation';
import { eventToDatedFlows } from '@/lib/utils/whatIfToPlan';
import { resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import type { IncomeSourceCategory } from '@/lib/services/fireService';
import { calculateWhatIfImpact, maxEventYear, parseWhenYear, WHAT_IF_HORIZON_YEARS } from '@/lib/services/whatIfService';
import { useWhatIfBaseline } from '@/lib/hooks/useWhatIfBaseline';
import { summarizeLock } from '@/lib/utils/fireSummary';
import { describeFireLockScope } from '@/lib/utils/fireNarrative';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  LEAD_CELL_CLASS,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import {
  buildWhatIfComparisonSeries,
  decomposeJobLossHit,
  selectWhatIfStrip,
  summarizeDivergence,
  summarizeWhatIf,
  summarizeWhatIfEvent,
  WHAT_IF_SECTION_IDS,
} from '@/lib/utils/whatIfSummary';
import {
  buildDeltaView,
  WHAT_IF_CLOSED_ASIDES,
  buildWhatIfVerdict,
  describeBeforeAfter,
  describeBeforeAfterAside,
  describeBeforeAfterFooter,
  describeDelta,
  describeDeltaFooter,
  describeEvent,
  describeEventFooter,
  describeWhatIfClosedAnswers,
} from '@/lib/utils/whatIfNarrative';
import type { WhatIfEventType, WhatIfScenario } from '@/types/whatIf';
import { WHAT_IF_TAB_SKELETON_CELLS } from './tabSkeletons';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { FireAssumptionsRow, FireVerdictScope } from '@/components/fire-simulations/FireAssumptionsRow';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { RowAnswers } from '@/components/ui/row-answers';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { categoryLeafKeys, collectLeafKeys, sumSelectedIncome } from '@/components/fire-simulations/whatif/incomeSelection';
import { WhatIfProjectionChart } from '@/components/fire-simulations/whatif/WhatIfProjectionChart';
import { PrimaDopoTile } from '@/components/fire-simulations/whatif/tiles/PrimaDopoTile';
import { DeltaTile } from '@/components/fire-simulations/whatif/tiles/DeltaTile';
import { EventoTile, type WhatIfEventForm } from '@/components/fire-simulations/whatif/tiles/EventoTile';
import { JobLossEffect } from '@/components/fire-simulations/whatif/JobLossEffect';

/** The grid's geometry, for the skeleton: the same spans as the tiles below — shared with the page's lazy-tab wait. */
const SKELETON_CELLS = WHAT_IF_TAB_SKELETON_CELLS;

/** The rows below `desktop:`, in the DOM's order: every tile but Evento, THE tile (The Input Tile Rule). No row carries `failed`. */
const WHAT_IF_SECTIONS: readonly SectionSpec[] = [
  { id: WHAT_IF_SECTION_IDS.primaDopo, eyebrow: 'Prima e dopo' },
  { id: WHAT_IF_SECTION_IDS.delta, eyebrow: 'Delta' },
];

/** Without a base the tab renders the verdict alone: the controller knows no row (since 2026-10-16, as Monte Carlo and Obiettivi do). */
const NO_SECTIONS: readonly SectionSpec[] = [];

const EMPTY_FORM: WhatIfEventForm = {
  monthsWithoutIncome: '6',
  purchaseAmount: '',
  savingsDelta: '',
  expensesDelta: '',
  windfallAmount: '',
  whenYear: '',
};

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function WhatIfAnalysisTab() {
  const {
    settings,
    cashflowData,
    isLoadingSettings,
    isLoadingAssets,
    isLoadingCashflow,
    isLoadingFlows,
    settingsError,
    assetsError,
    cashflowError,
    assumptionsWithFlows,
    scenarios,
    currentYear,
    pensionLockState,
    annualExpenses,
    annualSavings,
    cashflowExpenses,
    baseline,
    hasBaseline,
  } = useWhatIfBaseline();

  // ─── Scenario state (ephemeral) ──────────────────────────────────────────────
  const [eventType, setEventType] = useState<WhatIfEventType>('jobLoss');
  const [form, setForm] = useState<WhatIfEventForm>(EMPTY_FORM);
  const onFormChange = useCallback((patch: Partial<WhatIfEventForm>) => setForm((prev) => ({ ...prev, ...patch })), []);
  // Selected income-source leaves (`categoryId::subCategoryId`) that disappear on job loss.
  const [selectedIncomeLeaves, setSelectedIncomeLeaves] = useState<Set<string>>(new Set());
  const didInitIncomeSelection = useRef(false);

  // ─── Income sources for the job-loss picker (UI-only) ────────────────────────
  const incomeSources = useMemo(() => cashflowData?.incomeSources ?? [], [cashflowData]);
  const hasIncomeSources = incomeSources.length > 0;
  const laborIncomeCategoryIds = settings?.laborIncomeCategoryIds;

  // Default selection: the categories flagged as labor income in Settings; if none match the
  // available sources, fall back to every source (the original "all household income" behaviour).
  const defaultIncomeLeaves = useMemo(() => {
    const laborSet = new Set(laborIncomeCategoryIds ?? []);
    const laborLeaves = incomeSources.filter((category) => laborSet.has(category.categoryId)).flatMap(categoryLeafKeys);
    return new Set(laborLeaves.length > 0 ? laborLeaves : collectLeafKeys(incomeSources));
  }, [incomeSources, laborIncomeCategoryIds]);

  // Seed the selection once, after the data has loaded, without clobbering later user edits.
  // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (didInitIncomeSelection.current || isLoadingSettings || isLoadingCashflow) return;
    const timer = setTimeout(() => {
      didInitIncomeSelection.current = true;
      setSelectedIncomeLeaves(defaultIncomeLeaves);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingSettings, isLoadingCashflow, defaultIncomeLeaves]);

  const selectedAnnualIncome = useMemo(() => sumSelectedIncome(incomeSources, selectedIncomeLeaves), [incomeSources, selectedIncomeLeaves]);

  const toggleIncomeLeaf = useCallback((key: string) => {
    setSelectedIncomeLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleIncomeCategory = useCallback((category: IncomeSourceCategory) => {
    const keys = categoryLeafKeys(category);
    setSelectedIncomeLeaves((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((key) => next.has(key));
      // All selected → clear the category; otherwise select it fully.
      keys.forEach((key) => (allSelected ? next.delete(key) : next.add(key)));
      return next;
    });
  }, []);
  const selectAllIncome = useCallback(() => setSelectedIncomeLeaves(new Set(collectLeafKeys(incomeSources))), [incomeSources]);
  const selectNoIncome = useCallback(() => setSelectedIncomeLeaves(new Set()), []);

  const whenYear = parseWhenYear(form.whenYear, currentYear) ?? undefined;

  const scenario = useMemo<WhatIfScenario>(() => {
    switch (eventType) {
      case 'jobLoss':
        return {
          eventType,
          whenYear,
          monthsWithoutIncome: parseAmount(form.monthsWithoutIncome),
          // Only constrain the lost income when we actually have categorised sources to select.
          lostAnnualIncome: hasIncomeSources ? selectedAnnualIncome : undefined,
        };
      case 'majorPurchase':
        return { eventType, whenYear, lumpSumAmount: parseAmount(form.purchaseAmount) };
      case 'cashflowChange':
        return { eventType, whenYear, annualSavingsDelta: parseAmount(form.savingsDelta), annualExpensesDelta: parseAmount(form.expensesDelta) };
      case 'windfall':
        return { eventType, whenYear, lumpSumAmount: parseAmount(form.windfallAmount) };
    }
  }, [eventType, form, whenYear, hasIncomeSources, selectedAnnualIncome]);

  // ─── The numbers (pure layer over the service) ───────────────────────────────
  const impact = useMemo(() => (hasBaseline ? calculateWhatIfImpact(baseline, scenario) : null), [hasBaseline, baseline, scenario]);
  const event = useMemo(() => (impact ? summarizeWhatIfEvent(scenario, baseline, impact.adjusted) : null), [impact, scenario, baseline]);
  const baseYears = impact?.fire.yearsToFIRE.before ?? null;
  // «Aggiungi al piano» (§ 22): the event becomes the plan's dated flows (the draft of «Il mio piano», saved there), and the
  // event is cleared: the baseline now carries the flows, so keeping it would count the event twice.
  const plan = useFirePlan();
  const planFlows = plan?.form.datedFlows;
  const planFull = (planFlows?.length ?? 0) >= MAX_DATED_FLOWS;
  const addToPlan = useCallback(() => {
    if (!plan || !hasBaseline) return;
    const added = eventToDatedFlows(baseline, scenario, whenYear ?? currentYear, baseYears === null ? null : currentYear + baseYears);
    if (added.length === 0) return;
    const next = [...plan.form.datedFlows, ...added];
    if (next.length > MAX_DATED_FLOWS) {
      toast.error(`Il piano ha già ${MAX_DATED_FLOWS} flussi.`);
      return;
    }
    plan.onFormChange({ datedFlows: next });
    setForm(EMPTY_FORM);
    toast.success(added.length === 1 ? 'Evento aggiunto a Il mio piano: salvalo lì per tenerlo.' : 'Eventi aggiunti a Il mio piano: salvali lì per tenerli.');
  }, [plan, hasBaseline, baseline, scenario, whenYear, currentYear, baseYears]);

  const summary = useMemo(() => (impact ? summarizeWhatIf(impact, baseline, currentYear, WHAT_IF_HORIZON_YEARS) : null), [impact, baseline, currentYear]);
  const series = useMemo(() => (impact ? buildWhatIfComparisonSeries(impact.projections.before, impact.projections.after) : []), [impact]);
  const divergence = useMemo(() => (summary ? summarizeDivergence(series, summary.timeline) : null), [series, summary]);
  const jobLossHit = useMemo(
    () => (event && event.kind === 'jobLoss' && !event.isEmpty && event.calendarYear === null ? decomposeJobLossHit({ annualSavings, annualExpenses: cashflowExpenses, lostAnnualIncome: event.lostAnnualIncome, months: event.months }) : null),
    [event, annualSavings, cashflowExpenses],
  );

  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const verdict = useMemo(() => buildWhatIfVerdict({ hasBaseline, event, summary }), [hasBaseline, event, summary]);
  // What each closed row answers in the landscape index (2026-10-16): the Delta's progress row,
  // read from the same summary the tile prints.
  const rowAnswers = useMemo(
    () => describeWhatIfClosedAnswers({ event, summary, sensitivity: null }),
    [event, summary],
  );

  // ─── The phone composition (2026-10-15) ──────────────────────────────────────
  // The rows and «Il perché» from the controller (one memory per tab); the strip from the event's
  // hit today and at the FIRE year; the lock as the scope line only with the bridge on and below
  // `desktop:` — the bridge note in the paragraph says it at 1440.
  const whatIfSections = hasBaseline && impact && event && summary ? WHAT_IF_SECTIONS : NO_SECTIONS;
  const sections = useMobileSections({ route: 'fire-simulations', tab: 'whatif', sections: whatIfSections });
  // At 768 the same rows on two columns; on a tablet in landscape the index beside the verdict and
  // THE tile (lib/utils/tabletComposition.ts). The specs ARE the DOM's rows.
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: whatIfSections.map((section) => section.id) });
  const { reveal: handleStripOpen } = sections;
  const strip = event && summary ? selectWhatIfStrip({ event, summary, divergence }) : [];
  const lockScope = sections.compact && summary?.isBridge ? describeFireLockScope(lock) : null;

  // ─── Loading ─────────────────────────────────────────────────────────────────
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingSettings || isLoadingAssets || isLoadingCashflow || isLoadingFlows, failed: settingsError || assetsError || cashflowError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio, ipotesi e cashflow non sono stati letti: senza la base non c’è uno scenario da confrontare.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoadingSettings || isLoadingAssets || isLoadingCashflow || isLoadingFlows) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  // ─── Empty state: the verdict says what is missing ───────────────────────────
  if (!hasBaseline || !impact || !event || !summary) {
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <FireAssumptionsRow assumptions={assumptionsWithFlows} />
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sul What If" scope={sections.compact ? <FireVerdictScope lockText={lockScope} assumptions={assumptionsWithFlows} /> : undefined} />
        </div>
      </div>
    );
  }

  const targetsDiffer = Math.abs(summary.fireNumber.delta) >= 0.5;
  const lastProjectedYear = series.length > 0 ? series[series.length - 1].calendarYear : null;
  const eventFooterInput = { kind: eventType, calendarYear: event.calendarYear, referenceYear: cashflowData?.referenceYear ?? null, isAnnualized: cashflowData?.isAnnualized ?? false };

  // ─── Render ──────────────────────────────────────────────────────────────────
  const deltaView = buildDeltaView(summary);
  return (
    <div className="space-y-4">
      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
          (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
      <div className={STAGE_WRAPPER_CLASS}>
      <div ref={stageRef} className={STAGE_CLASS}>
      <div data-stage="verdict" className={cn('pt-1', VERDICT_CELL_CLASS)}>
        <FireAssumptionsRow assumptions={assumptionsWithFlows} />
        <PageVerdict
          verdict={verdict}
          ariaLabel="Verdetto sul What If"
          strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={sections.eyebrows} />}
          scope={sections.compact ? <FireVerdictScope lockText={lockScope} assumptions={assumptionsWithFlows} /> : undefined}
          restCollapse={sections.collapse(VERDICT_REST_SECTION)}
        />
      </div>

      {/* ONE sequence, Evento first at every width (The First-Screen Rule, The Input Tile Rule).
          Tablet: Evento on two columns, the closed rows two by two at 768, an open row on the whole
          grid row; in landscape the rows in the index beside the verdict and Evento. */}
      <div className={COMPACT_GRID_WRAPPER_CLASS}>
      <div className={COMPACT_GRID_CLASS}>
        <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-4')}>
          <EventoTile
            reading={describeEvent(event)}
            event={event}
            eventType={eventType}
            onEventTypeChange={setEventType}
            form={form}
            onFormChange={onFormChange}
            incomeSelection={
              hasIncomeSources
                ? {
                    sources: incomeSources,
                    selected: selectedIncomeLeaves,
                    onToggleLeaf: toggleIncomeLeaf,
                    onToggleCategory: toggleIncomeCategory,
                    onSelectAll: selectAllIncome,
                    onSelectNone: selectNoIncome,
                  }
                : null
            }
            currentYear={currentYear}
            maxYear={maxEventYear(currentYear)}
            annualSavings={annualSavings}
            annualExpenses={annualExpenses}
            footer={describeEventFooter(eventFooterInput)}
            addToPlan={plan ? { onAdd: addToPlan, disabledReason: planFull ? `Il piano ha già ${MAX_DATED_FLOWS} flussi.` : null } : undefined}
          />
        </div>

        <RowAnswers value={rowAnswers}>
        <div className={INDEX_CLASS}>
        <PageRest sections={sections} className={REST_CELL_CLASS} />

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(WHAT_IF_SECTION_IDS.primaDopo), 'desktop:col-span-5')}>
          <PrimaDopoTile
            collapse={sections.collapse(WHAT_IF_SECTION_IDS.primaDopo)}
            asideWhenClosed={WHAT_IF_CLOSED_ASIDES[WHAT_IF_SECTION_IDS.primaDopo]}
            reading={describeBeforeAfter(summary, divergence)}
            aside={describeBeforeAfterAside(scenarios.base)}
            chart={
              <WhatIfProjectionChart
                series={series}
                calendarBefore={summary.timeline.reachedBefore ? null : summary.timeline.calendarBefore}
                calendarAfter={summary.timeline.reachedAfter ? null : summary.timeline.calendarAfter}
                targetsDiffer={targetsDiffer}
                height="100%"
                pensionUnlockCalendarYear={summary.isBridge ? lock.unlockCalendarYear : null}
              />
            }
            targetsDiffer={targetsDiffer}
            footer={describeBeforeAfterFooter({ eventCalendarYear: event.calendarYear, isBridge: summary.isBridge, unlockCalendarYear: lock.unlockCalendarYear, lastProjectedYear })}
          />
        </div>

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(WHAT_IF_SECTION_IDS.delta), 'desktop:col-span-3')}>
          <DeltaTile
            collapse={sections.collapse(WHAT_IF_SECTION_IDS.delta)}
            asideWhenClosed={WHAT_IF_CLOSED_ASIDES[WHAT_IF_SECTION_IDS.delta]}
            reading={describeDelta(summary)}
            view={deltaView}
            coastRetirementAge={summary.coast?.retirementAge ?? null}
            footer={describeDeltaFooter(deltaView.hasCoast)}
            effect={jobLossHit && event.kind === 'jobLoss' ? <JobLossEffect hit={jobLossHit} months={event.months} annualSavings={annualSavings} lostAnnualIncome={event.lostAnnualIncome} /> : null}
          />
        </div>
        </div>
        </RowAnswers>
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
