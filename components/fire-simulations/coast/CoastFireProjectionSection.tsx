'use client';

/**
 * CoastFireProjectionSection — the "Proiezione" chapter of the Coast FIRE tab.
 *
 * Above the fold of the chapter: the chart, unchanged in substance, with the unlock step
 * named in its tooltip. Below it, ONE "Dettaglio" collapsible carrying everything that explains
 * the chart rather than answering the page's question — coverage phases, the target/steady-state
 * pair, the per-pension impact, the automatic interpretation and the Coast FIRE explainer.
 *
 * Nothing is computed here: every string arrives already worded from `lib/utils/coastFireView`.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { formatCurrency } from '@/lib/services/chartService';
import { formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CoastFireProjectionChart } from '../CoastFireProjectionChart';
import type { CoastFIREPensionBreakdown, CoastFIREProjectionPoint } from '@/lib/services/fireService';
import {
  formatAgeYears,
  formatYearCount,
  type CoastCoverageStep,
  type CoastScenarioMetrics,
} from '@/lib/utils/coastFireView';
import { cn } from '@/lib/utils';

interface CoastFireProjectionSectionProps {
  projectionData: CoastFIREProjectionPoint[];
  baseScenario: CoastScenarioMetrics;
  /** Pension breakdown ordered by start age — shared with the coverage steps. */
  sortedPensionBreakdown: CoastFIREPensionBreakdown[];
  coverageSteps: CoastCoverageStep[];
  interpretation: string[];
  effectiveAnnualExpenses: number;
  bridgeYears: number;
  pensionUnlockCalendarYear: number | null;
}

const CHAPTER_TITLE_CLASS = 'text-sm font-semibold text-foreground';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function CoastFireProjectionSection({
  projectionData,
  baseScenario,
  sortedPensionBreakdown,
  coverageSteps,
  interpretation,
  effectiveAnnualExpenses,
  bridgeYears,
  pensionUnlockCalendarYear,
}: CoastFireProjectionSectionProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1023px)');
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <section className="space-y-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Proiezione</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Il patrimonio FIRE che cresce da solo fino all&apos;età target, senza nuovi versamenti.
          La linea tratteggiata è il capitale reale richiesto a pensione.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <CoastFireProjectionChart
            projectionData={projectionData}
            height={isMobile ? 280 : 360}
            marginLeft={isMobile ? 10 : isTablet ? 30 : 50}
            pensionUnlockCalendarYear={pensionUnlockCalendarYear}
          />
        </CardContent>
      </Card>

      {/* Dettaglio — everything that explains the chart, one interaction away */}
      <Collapsible
        open={detailOpen}
        onOpenChange={setDetailOpen}
        className="border-t border-border/60 pt-4"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {detailOpen ? 'Nascondi dettaglio' : 'Mostra dettaglio'}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                detailOpen && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <div className="space-y-4 pt-4">
            {/* Coverage phases: how the portfolio's burden changes as pensions start */}
            {coverageSteps.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-5 py-4">
                  <p className={CHAPTER_TITLE_CLASS}>Fasi di copertura</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Come cambia il fabbisogno al portafoglio man mano che le pensioni diventano
                    attive.
                  </p>
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {coverageSteps.map((step, index) => (
                    <div
                      key={step.id}
                      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          {index + 1}
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[13px] font-medium text-foreground">{step.label}</p>
                          <p className="text-[13px] text-muted-foreground">{step.detail}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-foreground">
                        {step.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Target vs steady state, side by side */}
            <div className="grid gap-4 desktop:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="px-5 py-4">
                  <p className={CHAPTER_TITLE_CLASS}>All&apos;età target</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cosa deve coprire il portafoglio quando arrivi all&apos;età Coast FIRE.
                  </p>
                </div>
                <div className="divide-y divide-border border-t border-border">
                  <DetailRow
                    label="Spese reali annue"
                    value={formatCurrency(effectiveAnnualExpenses)}
                  />
                  <DetailRow
                    label="Pensione netta reale al target"
                    value={formatCurrency(baseScenario.totalNetAnnualPensionAtRetirement)}
                  />
                  <DetailRow
                    label="Fabbisogno da portafoglio"
                    value={formatCurrency(baseScenario.annualPortfolioNeedAtRetirement)}
                  />
                  <DetailRow
                    label="Capitale richiesto a pensione"
                    value={formatCurrency(baseScenario.retirementCapitalRequired)}
                  />
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="px-5 py-4">
                  <p className={CHAPTER_TITLE_CLASS}>A regime</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {baseScenario.pensionBreakdown.length > 0
                      ? `Assetto stabile dopo l'ultima decorrenza pensionistica${
                          baseScenario.latestPensionStartDate
                            ? ` (${formatDate(toDate(baseScenario.latestPensionStartDate))})`
                            : ''
                        }.`
                      : 'Nessuna pensione configurata: il fabbisogno a regime coincide col target.'}
                  </p>
                </div>
                <div className="divide-y divide-border border-t border-border">
                  <DetailRow
                    label="Pensione netta reale a regime"
                    value={formatCurrency(baseScenario.totalNetAnnualPensionAtSteadyState)}
                  />
                  <DetailRow
                    label="Fabbisogno da portafoglio"
                    value={formatCurrency(baseScenario.annualPortfolioNeedAtSteadyState)}
                  />
                  <DetailRow
                    label="Capitale a regime"
                    value={formatCurrency(baseScenario.steadyStatePortfolioNeed)}
                  />
                  <DetailRow
                    label="Ponte prima dell'ultima pensione"
                    value={bridgeYears > 0 ? formatYearCount(bridgeYears) : 'Nessuno'}
                  />
                </div>
              </Card>
            </div>

            {/* Per-pension impact: the three amounts behind each net-real figure */}
            {sortedPensionBreakdown.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-5 py-4">
                  <p className={CHAPTER_TITLE_CLASS}>Impatto delle singole pensioni</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Dal lordo nominale che indichi al netto reale che abbatte il fabbisogno.
                  </p>
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {sortedPensionBreakdown.map((pension) => (
                    <div key={pension.id} className="px-5 py-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-medium text-foreground">{pension.label}</p>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {pension.isActiveAtRetirement
                              ? 'Già attiva al target'
                              : `Parte a ${formatAgeYears(pension.startAge)}`}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {'Decorrenza '}
                          {pension.startDate ? formatDate(toDate(pension.startDate)) : 'non disponibile'}
                          {' · '}
                          {formatYearCount(Math.ceil(pension.yearsUntilStart))}
                        </p>
                      </div>
                      {/* 2-col on mobile keeps labels and values paired without a tall single column */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 desktop:grid-cols-3">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Lordo nominale</p>
                          <p className="font-mono text-[13px] font-medium tabular-nums text-foreground">
                            {formatCurrency(pension.grossAnnualFutureNominal)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Lordo reale</p>
                          <p className="font-mono text-[13px] font-medium tabular-nums text-foreground">
                            {formatCurrency(pension.grossAnnualRealAtStart)}
                          </p>
                        </div>
                        <div className="col-span-2 desktop:col-span-1">
                          <p className="text-[11px] text-muted-foreground">Netto reale</p>
                          <p className="font-mono text-[13px] font-medium tabular-nums text-foreground">
                            {formatCurrency(pension.netAnnualRealAtStart)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Automatic interpretation + the standing explainer */}
            <Card className="overflow-hidden">
              <div className="px-5 py-4">
                <p className={CHAPTER_TITLE_CLASS}>Come leggere il Coast FIRE</p>
              </div>
              <div className="space-y-2.5 border-t border-border px-5 py-4 text-[13px] text-muted-foreground">
                {interpretation.map((line) => (
                  <p key={line} className="text-foreground/90">
                    {line}
                  </p>
                ))}
                <p>
                  <span className="font-medium text-foreground">Coast FIRE</span>
                  {
                    ' significa che puoi smettere di versare per la pensione, non smettere di lavorare. Dopo il traguardo Coast, il tuo capitale attuale dovrebbe bastare a coprire il capitale richiesto al pensionamento grazie alla capitalizzazione composta.'
                  }
                </p>
                <p>
                  <span className="font-medium text-foreground">Spese usate</span>
                  {
                    ": il target si basa sulle spese reali dell'ultimo anno completo, salvo un importo personalizzato nelle impostazioni."
                  }
                </p>
                <p>
                  <span className="font-medium text-foreground">Pensione statale</span>
                  {
                    ": ogni importo inserito viene trattato come lordo mensile nominale futuro, deflazionato con l'inflazione dello scenario e convertito in netto reale con IRPEF progressiva."
                  }
                </p>
              </div>
            </Card>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
