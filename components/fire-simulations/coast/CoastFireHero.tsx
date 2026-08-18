'use client';

/**
 * CoastFireHero — the single answer to the Coast FIRE tab's question.
 *
 * Left, dominant: "posso smettere di versare?" — the shortfall (or the surplus once the target
 * is behind), the verdict in words, the progress chip, and the two numbers the verdict compares.
 * Right, companion: what happens if you stop TODAY — the capital the current patrimonio grows
 * into by the target age with no further contributions, against the capital actually required.
 *
 * Every figure is read off `fireService`'s base scenario; this component computes nothing.
 */

import type { ReactNode } from 'react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import {
  resolveCoastHeroValueClass,
  type CoastScenarioMetrics,
  type CoastVerdict,
} from '@/lib/utils/coastFireView';
import { cn } from '@/lib/utils';

interface CoastFireHeroProps {
  verdict: CoastVerdict;
  baseScenario: CoastScenarioMetrics | null;
  currentNetWorth: number;
  liquidNetWorth: number;
  /** Base-scenario progress measured on liquid assets only — the conservative read. */
  liquidProgress: number;
  retirementAge: number | null;
  /** Assumptions, already worded by `buildCoastBasisParts`. */
  basisParts: string[];
}

const VERDICT_TONE_CLASS = {
  positive: 'text-positive',
  neutral: 'text-foreground',
  muted: 'text-muted-foreground',
} as const;

/** Flat row for the companion card — label left, value right, no chrome per row. */
function CompanionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function CoastFireHero({
  verdict,
  baseScenario,
  currentNetWorth,
  liquidNetWorth,
  liquidProgress,
  retirementAge,
  basisParts,
}: CoastFireHeroProps) {
  return (
    <>
      {/* grid-cols-1 + min-w-0 are load-bearing, not tidiness: a grid item defaults to
          min-width:auto and an implicit track sizes to its widest child, so at 390px the card
          would grow past the viewport and the amounts on its right edge would be clipped
          (AGENTS → *Tailwind Breakpoints and Responsive Layout*). */}
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[2fr_1fr]">
        {/* Dominant: can I stop contributing? */}
        <div className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-[22px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Posso smettere di versare?
            </p>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Scenario base
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p
              className={cn(
                'font-mono font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground',
                resolveCoastHeroValueClass(verdict.heroValue)
              )}
            >
              {verdict.heroValue}
            </p>
            {verdict.heroQualifier && (
              <span className="text-[11px] text-muted-foreground">{verdict.heroQualifier}</span>
            )}
          </div>

          <p className="mt-3 text-sm">
            <span className={cn('font-semibold', VERDICT_TONE_CLASS[verdict.tone])}>
              {verdict.headline}
            </span>{' '}
            <span className="text-muted-foreground">{verdict.detail}</span>
          </p>

          {baseScenario && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-foreground">
                {formatPercentage(baseScenario.progressToCoastFI)}
                <span className="ml-1 font-sans font-normal text-muted-foreground">
                  del Coast FIRE Number
                </span>
              </span>
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-foreground">
                {formatPercentage(liquidProgress)}
                <span className="ml-1 font-sans font-normal text-muted-foreground">
                  solo liquidi
                </span>
              </span>
            </div>
          )}

          {/* The two numbers the verdict compares, pinned to the card baseline */}
          <div className="mt-auto pt-4">
            <div className="divide-y divide-border border-t border-border">
              <div className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <span className="text-sm text-muted-foreground">Patrimonio FIRE attuale</span>
                  <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground/70">
                    di cui liquidi {formatCurrency(liquidNetWorth)}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(currentNetWorth)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <span className="text-sm text-muted-foreground">Coast FIRE Number</span>
                  <p className="truncate text-[11px] text-muted-foreground/70">
                    quanto serve OGGI perché il capitale ci arrivi da solo
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {baseScenario ? formatCurrency(baseScenario.coastFireNumberToday) : '–'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Companion: what the patrimonio becomes if contributions stop today */}
        <div className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-[22px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Se smetti oggi
          </p>
          <p className="mt-2 font-mono text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">
            {baseScenario
              ? formatCurrency(baseScenario.futureValueAtRetirementWithoutNewContributions)
              : '–'}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {retirementAge !== null
              ? `a ${retirementAge} anni, senza altri versamenti`
              : 'al target Coast FIRE, senza altri versamenti'}
          </p>

          {baseScenario && (
            <div className="mt-4 divide-y divide-border border-t border-border">
              <CompanionRow label="Capitale richiesto">
                <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {formatCurrency(baseScenario.retirementCapitalRequired)}
                </span>
              </CompanionRow>
              <CompanionRow label="Pensioni statali nette">
                <span className="text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {formatCurrency(baseScenario.totalNetAnnualPensionAtSteadyState)}{' '}
                  <span className="font-sans font-normal text-muted-foreground">a regime</span>
                </span>
              </CompanionRow>
              <CompanionRow label="Fabbisogno al portafoglio">
                <span className="text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {formatCurrency(baseScenario.annualPortfolioNeedAtRetirement)}{' '}
                  <span className="font-sans font-normal text-muted-foreground">al target</span>
                </span>
              </CompanionRow>
            </div>
          )}
        </div>
      </div>

      {/* Basis line — assumptions declared, not implicit (same pattern as Rendimenti) */}
      <p className="px-1 text-xs text-muted-foreground">Base di calcolo: {basisParts.join(' · ')}.</p>
    </>
  );
}
