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
 *   Desktop (12 col): Evento(4) | the verdict over  Prima e dopo(5) | Delta(3)  (a column of 8)
 *   Mobile (1 col):   Evento → verdict → Prima e dopo → Delta
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
import { resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import type { IncomeSourceCategory } from '@/lib/services/fireService';
import { calculateWhatIfImpact, maxEventYear, parseWhenYear, WHAT_IF_HORIZON_YEARS } from '@/lib/services/whatIfService';
import { useWhatIfBaseline } from '@/lib/hooks/useWhatIfBaseline';
import { summarizeLock } from '@/lib/utils/fireSummary';
import {
  buildWhatIfComparisonSeries,
  decomposeJobLossHit,
  summarizeDivergence,
  summarizeWhatIf,
  summarizeWhatIfEvent,
} from '@/lib/utils/whatIfSummary';
import {
  buildDeltaView,
  buildWhatIfVerdict,
  describeBeforeAfter,
  describeBeforeAfterAside,
  describeBeforeAfterFooter,
  describeDelta,
  describeDeltaFooter,
  describeEvent,
  describeEventFooter,
} from '@/lib/utils/whatIfNarrative';
import type { WhatIfEventType, WhatIfScenario } from '@/types/whatIf';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { FireAssumptionsRow } from '@/components/fire-simulations/FireAssumptionsRow';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { categoryLeafKeys, collectLeafKeys, sumSelectedIncome } from '@/components/fire-simulations/whatif/incomeSelection';
import { WhatIfProjectionChart } from '@/components/fire-simulations/whatif/WhatIfProjectionChart';
import { PrimaDopoTile } from '@/components/fire-simulations/whatif/tiles/PrimaDopoTile';
import { DeltaTile } from '@/components/fire-simulations/whatif/tiles/DeltaTile';
import { EventoTile, type WhatIfEventForm } from '@/components/fire-simulations/whatif/tiles/EventoTile';
import { JobLossEffect } from '@/components/fire-simulations/whatif/JobLossEffect';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 4, lines: 10 },
  { span: 5, lines: 12 },
  { span: 3, lines: 9 },
];

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
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sul What If" />
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
      {/* D-W7 (2026-10-09, revises D-W1): the verdict under «Ipotesi usate», full width and left-aligned as on every
          other FIRE tab; then Evento 4 | Prima e dopo 5 | Delta 3. Below `desktop:` one column, in that order. */}
      <div className="pt-1">
        <FireAssumptionsRow assumptions={assumptionsWithFlows} />
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul What If" />
      </div>

      <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
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
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
          <PrimaDopoTile
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

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-3')}>
          <DeltaTile
            reading={describeDelta(summary)}
            view={deltaView}
            coastRetirementAge={summary.coast?.retirementAge ?? null}
            footer={describeDeltaFooter(deltaView.hasCoast)}
            effect={jobLossHit && event.kind === 'jobLoss' ? <JobLossEffect hit={jobLossHit} months={event.months} annualSavings={annualSavings} lostAnnualIncome={event.lostAnnualIncome} /> : null}
          />
        </div>
      </div>
    </div>
  );
}
