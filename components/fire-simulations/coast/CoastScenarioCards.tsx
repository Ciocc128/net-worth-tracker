'use client';

/**
 * CoastScenarioCards — Orso / Base / Toro, one card each.
 *
 * Each card answers "quanto sei vicino in questo scenario" with progress as its own dominant
 * value, then the figures behind it as flat rows. The three cards are peers, so none of them
 * takes the page-hero scale: the page's dominant number lives in the hero above.
 *
 * The @container query (px-consistent) keeps all three on one row from 960px; Tailwind v4
 * mis-orders arbitrary min-[px] against rem-based sm:, so plain media queries fail here
 * (AGENTS → *Tailwind Breakpoints and Responsive Layout*).
 */

import { Target, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import type { CoastFIREProjectionResult } from '@/lib/services/fireService';
import { cn } from '@/lib/utils';

interface CoastScenarioCardsProps {
  scenarios: CoastFIREProjectionResult['scenarios'];
  /** FIRE-eligible liquid patrimonio — the numerator of the conservative progress read. */
  liquidNetWorth: number;
}

const SCENARIO_ORDER = ['bear', 'base', 'bull'] as const;
type ScenarioKey = (typeof SCENARIO_ORDER)[number];

const SCENARIO_ICON = {
  bear: TrendingDown,
  base: Target,
  bull: TrendingUp,
} as const;

function ScenarioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function CoastScenarioCards({ scenarios, liquidNetWorth }: CoastScenarioCardsProps) {
  const chartColors = useChartColors();
  // Same semantic mapping as every other FIRE surface: Orso → red [4], Base → primary [0],
  // Toro → green [1]. Re-keying one means re-keying all of them.
  const scenarioColor: Record<ScenarioKey, string> = {
    bear: chartColors[4] || 'var(--chart-5)',
    base: chartColors[0] || 'var(--chart-1)',
    bull: chartColors[1] || 'var(--chart-2)',
  };

  return (
    <section className="@container">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Scenari</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Lo stesso patrimonio contro tre ipotesi di rendimento reale. Il Coast FIRE Number scende
        quando il rendimento sale, perché al capitale serve meno spinta iniziale.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 @[640px]:grid-cols-2 @[960px]:grid-cols-3">
        {SCENARIO_ORDER.map((key) => {
          const scenario = scenarios[key];
          const Icon = SCENARIO_ICON[key];
          const liquidProgress =
            scenario.coastFireNumberToday > 0
              ? (liquidNetWorth / scenario.coastFireNumberToday) * 100
              : 0;
          const isBase = key === 'base';

          return (
            <div
              key={key}
              className={cn(
                'rounded-2xl border bg-card p-5',
                isBase ? 'border-border' : 'border-border/60'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <Icon
                    className="h-3.5 w-3.5"
                    style={{ color: scenarioColor[key] }}
                    aria-hidden="true"
                  />
                  {scenario.label}
                </p>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  reale {formatPercentage(scenario.realReturnRate)}
                </span>
              </div>

              <p className="mt-3 font-mono text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">
                {formatPercentage(scenario.progressToCoastFI)}
              </p>
              <p className="mt-1.5 text-[12px]">
                {scenario.isCoastReached ? (
                  <span className="font-medium text-positive">Coast FIRE raggiunto</span>
                ) : (
                  <span className="text-muted-foreground">
                    mancano{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {formatCurrency(scenario.gapToCoastFI)}
                    </span>
                  </span>
                )}
              </p>

              <div className="mt-4 divide-y divide-border border-t border-border">
                <ScenarioRow
                  label="Progresso liquido"
                  value={formatPercentage(liquidProgress)}
                />
                <ScenarioRow
                  label="Pensione netta al target"
                  value={formatCurrency(scenario.totalNetAnnualPensionAtRetirement)}
                />
                <ScenarioRow
                  label="Capitale a pensione"
                  value={formatCurrency(scenario.retirementCapitalRequired)}
                />
                <ScenarioRow
                  label="Capitale a regime"
                  value={formatCurrency(scenario.steadyStatePortfolioNeed)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
