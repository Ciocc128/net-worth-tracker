'use client';

/**
 * FIREProjectionSection Component — the "Proiezione" chapter of the FIRE tab (Spec 4).
 *
 * Two views of the same projection, switched by a segmented pill:
 *   - Scenari: the deterministic Bear/Base/Bull chart (3 series + ONE dashed base target);
 *   - Ventaglio: the Monte Carlo fan (runAccumulationSimulation) with percentile bands,
 *     deterministic spaghetti sample and the cumulative FIRE probability.
 *
 * The projection itself is computed by the PARENT (FireCalculatorTab needs it for the hero
 * verdict), so this section is presentation + the fan's useMemo. The scenario parameter
 * inputs and the year-by-year table live in a "Parametri e tabella" collapsible: they are
 * configuration, not answer.
 *
 * The fan runs client-side in a useMemo keyed on its inputs, and ONLY while the Ventaglio
 * view is open — 1000 simulations are cheap (~40k random draws) but not free on mobile.
 */

import { useMemo, useState } from 'react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useChartColors } from '@/lib/hooks/useChartColors';
import {
  FIREProjectionScenarios,
  FIREScenarioParams,
  FIREProjectionResult,
} from '@/types/assets';
import {
  runAccumulationSimulation,
  type AccumulationSimulationParams,
} from '@/lib/services/monteCarloService';
import { formatCurrency } from '@/lib/services/chartService';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { TrendingUp, TrendingDown, Target, RotateCcw, Save, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FIREProjectionChart } from './FIREProjectionChart';
import { FIREProjectionTable } from './FIREProjectionTable';
import { FireFanChart } from './FireFanChart';
import { useCountUp } from '@/lib/utils/useCountUp';

/** The fan's inputs minus the horizon, which is derived from the deterministic projection. */
export type FanSimulationInputs = Omit<AccumulationSimulationParams, 'years'>;

interface FIREProjectionSectionProps {
  projection: FIREProjectionResult | null;
  scenarios: FIREProjectionScenarios;
  onScenariosChange: (scenarios: FIREProjectionScenarios) => void;
  onSaveScenarios: () => void;
  onResetScenarios: () => void;
  isSavingScenarios: boolean;
  /** Cashflow-derived figures the projection runs on — named in the section caption. */
  annualSavings: number;
  annualExpenses: number;
  cashflowReferenceYear: number | null;
  cashflowIsAnnualized: boolean;
  /** null = the fan cannot run (no allocation in the 4 MC classes, or no data). */
  fanInputs: FanSimulationInputs | null;
  /** Spec 3 bridge: calendar year of the pension unlock, for the Scenari tooltip step. */
  pensionUnlockCalendarYear: number | null;
}

type ProjectionView = 'scenari' | 'ventaglio';

const VIEW_OPTIONS = [
  { value: 'scenari' as const, label: 'Scenari' },
  { value: 'ventaglio' as const, label: 'Ventaglio' },
];

/** Fan horizon cap (Spec 4): the deterministic projection's years, at most 40. */
const FAN_MAX_YEARS = 40;

// Scenario display config — colors resolved at runtime via useChartColors()
const SCENARIO_CONFIG = {
  bear: { label: 'Scenario Orso', icon: TrendingDown },
  base: { label: 'Scenario Base', icon: Target },
  bull: { label: 'Scenario Toro', icon: TrendingUp },
} as const;

type ScenarioKey = keyof typeof SCENARIO_CONFIG;

function SettledYearsToFire({ years }: { years: number | null }) {
  const animatedYears = useCountUp(years, { fromPrevious: true, duration: 500, startDelay: 0 });

  if (years === null) {
    return <span>50+ anni</span>;
  }

  const rounded = Math.round(animatedYears ?? years);
  return (
    <span>
      {rounded} {rounded === 1 ? 'anno' : 'anni'}
    </span>
  );
}

export function FIREProjectionSection({
  projection,
  scenarios,
  onScenariosChange,
  onSaveScenarios,
  onResetScenarios,
  isSavingScenarios,
  annualSavings,
  annualExpenses,
  cashflowReferenceYear,
  cashflowIsAnnualized,
  fanInputs,
  pensionUnlockCalendarYear,
}: FIREProjectionSectionProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const chartColors = useChartColors();
  const [view, setView] = useState<ProjectionView>('scenari');
  const [paramsOpen, setParamsOpen] = useState(false);

  // Semantic mapping: Orso (bear) → red [4], Base → primary [0], Toro (bull) → green [1]
  const scenarioColors: Record<ScenarioKey, string> = {
    bear: chartColors[4],
    base: chartColors[0],
    bull: chartColors[1],
  };

  const updateScenario = (key: ScenarioKey, field: keyof FIREScenarioParams, value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    // Validate ranges
    if (field === 'growthRate' && (numValue < 0 || numValue > 30)) return;
    if (field === 'inflationRate' && (numValue < 0 || numValue > 15)) return;

    onScenariosChange({
      ...scenarios,
      [key]: { ...scenarios[key], [field]: numValue },
    });
  };

  // The fan only pays its CPU cost while its view is open. Keyed on the same inputs that
  // change the deterministic projection, so an edited parameter re-runs it immediately.
  const fanYears = projection ? Math.min(projection.yearlyData.length, FAN_MAX_YEARS) : 0;
  const fanResult = useMemo(() => {
    if (view !== 'ventaglio' || !fanInputs || fanYears <= 0) return null;
    return runAccumulationSimulation({ ...fanInputs, years: fanYears });
  }, [view, fanInputs, fanYears]);

  const allocationLabel = fanInputs
    ? [
        `${fanInputs.equityPercentage}% azioni`,
        `${fanInputs.bondsPercentage}% obbligazioni`,
        `${fanInputs.realEstatePercentage}% immobili`,
        `${fanInputs.commoditiesPercentage}% materie prime`,
      ]
        .filter((part) => !part.startsWith('0%'))
        .join(', ')
    : '';

  const dataCaption =
    cashflowReferenceYear !== null
      ? `Risparmio ${formatCurrency(annualSavings)}/anno e spese ${formatCurrency(annualExpenses)}/anno dal cashflow ${cashflowReferenceYear}${cashflowIsAnnualized ? ' (annualizzati)' : ''}.`
      : 'Nessun dato cashflow disponibile: aggiungi entrate e uscite per una proiezione accurata.';

  return (
    <section className="space-y-4">
      {/* Section header: one view switcher, one caption naming the data source */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            Proiezione
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{dataCaption}</p>
        </div>
        <SegmentedPill
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          layoutId="fire-projection-view"
          ariaLabel="Vista della proiezione"
        />
      </div>

      {projection ? (
        <>
          {/* Years-to-FIRE strip: the three scenario outcomes at a glance (KPI chip variant) */}
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
            {(Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map((key) => {
              const config = SCENARIO_CONFIG[key];
              const Icon = config.icon;
              const yearsKey = `${key}YearsToFIRE` as const;
              const years = projection[yearsKey];
              return (
                <div key={key} className="rounded-xl bg-muted/40 p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" style={{ color: scenarioColors[key] }} aria-hidden="true" />
                    {config.label}
                  </p>
                  <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tabular-nums text-foreground">
                    <SettledYearsToFire years={years} />
                  </p>
                  <p className="mt-1.5 text-[12px] font-mono text-muted-foreground">
                    {years !== null ? `FIRE nel ${getItalyYear() + years}` : 'oltre 50 anni'}
                  </p>
                </div>
              );
            })}
          </div>

          {/* The chart, in the selected view */}
          <Card>
            <CardContent className="pt-6">
              {view === 'scenari' ? (
                <FIREProjectionChart
                  yearlyData={projection.yearlyData}
                  bearYearsToFIRE={projection.bearYearsToFIRE}
                  baseYearsToFIRE={projection.baseYearsToFIRE}
                  bullYearsToFIRE={projection.bullYearsToFIRE}
                  height={isMobile ? 280 : 400}
                  marginLeft={isMobile ? 10 : 50}
                  pensionUnlockCalendarYear={pensionUnlockCalendarYear}
                />
              ) : fanResult && fanInputs ? (
                <FireFanChart
                  result={fanResult}
                  deterministicBaseYearsToFIRE={projection.baseYearsToFIRE}
                  startCalendarYear={getItalyYear()}
                  simulationCount={fanInputs.numberOfSimulations}
                  allocationLabel={allocationLabel}
                  hasPensionInflows={(fanInputs.capitalInflows?.length ?? 0) > 0}
                  height={isMobile ? 280 : 400}
                />
              ) : (
                <p className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  Il ventaglio richiede un&apos;allocazione in azioni, obbligazioni, immobili o
                  materie prime: aggiungi asset in queste classi per derivare i parametri di
                  mercato.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Parameters + table: configuration demoted below the answer */}
          <Collapsible open={paramsOpen} onOpenChange={setParamsOpen}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="flex cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Parametri e tabella</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Crescita e inflazione per scenario, dettaglio anno per anno
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                      paramsOpen && 'rotate-180'
                    )}
                    aria-hidden="true"
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-4 border-t border-border px-6 py-4">
                  <div className="grid gap-4 desktop:grid-cols-3">
                    {(Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map((key) => {
                      const config = SCENARIO_CONFIG[key];
                      const Icon = config.icon;
                      const color = scenarioColors[key];
                      return (
                        <div key={key} className="rounded-xl border border-border bg-muted p-3.5">
                          <p
                            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
                            style={{ color }}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {config.label}
                          </p>
                          <div className="mt-3 space-y-3">
                            <div>
                              <Label className="text-xs">Crescita Mercati (%)</Label>
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                max="30"
                                value={scenarios[key].growthRate}
                                onChange={(e) => updateScenario(key, 'growthRate', e.target.value)}
                                className="mt-1 h-8"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Inflazione (%)</Label>
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                max="15"
                                value={scenarios[key].inflationRate}
                                onChange={(e) =>
                                  updateScenario(key, 'inflationRate', e.target.value)
                                }
                                className="mt-1 h-8"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onResetScenarios}
                      className="w-full sm:w-auto"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Ripristina Default
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onSaveScenarios}
                      disabled={isSavingScenarios}
                      className="w-full sm:w-auto"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingScenarios ? 'Salvataggio...' : 'Salva Parametri'}
                    </Button>
                  </div>

                  <FIREProjectionTable yearlyData={projection.yearlyData} />
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
          <p className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Nessun dato per la proiezione: servono spese registrate nel Cashflow e un patrimonio
            FIRE positivo.
          </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
