'use client';

/**
 * ETÀ OBIETTIVO — «cosa serve per smettere a quell'età?» (E1, doc/fire-ipotesi/README.md § 10.6): the
 * saving the Base needs, the saving that lets nine paths in ten arrive, and the plan's expenses
 * today's saving allows, side by side. The age is the page's one target age (Coast FIRE's), so the
 * tile asks for no input: it links to where the age is written, and to the Parametri where it is edited.
 *
 * No figure carries a sign colour: a required saving is a projection, neither a gain nor a loss.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { TargetAgeSummary } from '@/lib/utils/fireTargetAge';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { NarrativeSegments } from '@/components/ui/narrative-text';
import { describeTargetAgeFooter } from '@/lib/utils/fireNarrative';

interface EtaObiettivoTileProps {
  reading: Narrative;
  summary: TargetAgeSummary;
  /** `describeTargetAgeMethod()`. */
  method: string[];
  /** Opens the Coast FIRE tab, where the age is written; absent = no action. */
  onOpenCoast?: () => void;
  className?: string;
}

const money = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true);

function Figure({ label, value, caption, reference }: { label: string; value: ReactNode; caption: string; reference?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-[1.4] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">{caption}</p>
      {reference && <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{reference}</p>}
    </div>
  );
}

export function EtaObiettivoTile({ reading, summary, method, onOpenCoast, className }: EtaObiettivoTileProps) {
  const aside = summary.kind === 'figures' ? `a ${summary.targetAge} anni · ${summary.calendarYear}` : undefined;

  return (
    <Tile eyebrow="Età obiettivo" aside={aside} reading={reading} ariaLabel="Età obiettivo" className={className}>
      {summary.kind === 'figures' && (
        <div className="mt-3.5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Figure
            label="Risparmio nel base"
            value={summary.required.amount === null ? `> ${money(summary.required.cap)}` : money(summary.required.amount)}
            caption={summary.required.amount === 0 ? "nel base, il capitale di oggi basta" : "l'anno, nel base"}
            reference={`oggi ${money(summary.annualSavings)}`}
          />
          <Figure
            label="Risparmio per 9 percorsi su 10"
            value={summary.tail.kind === 'total' ? money(summary.tail.amount) : summary.tail.kind === 'unreachable' ? `> ${money(summary.annualSavings + summary.tail.cap)}` : '—'}
            caption={
              summary.tail.kind === 'unavailable'
                ? 'Ventaglio non disponibile'
                : summary.tail.kind === 'total' && summary.tail.extra === 0
                  ? "l'anno, 9 percorsi su 10 (il tuo risparmio di oggi basta)"
                  : "l'anno, 9 percorsi su 10"
            }
            reference={`oggi ${money(summary.annualSavings)}`}
          />
          <Figure
            label="Spesa massima del piano"
            value={summary.maxExpenses !== null && summary.maxExpenses > 0 ? money(summary.maxExpenses) : '—'}
            caption="l'anno, col risparmio di oggi"
            reference={`oggi ${money(summary.planExpenses)}`}
          />
        </div>
      )}

      {summary.kind === 'no-age' && onOpenCoast && (
        <p className="mt-3.5">
          <button
            type="button"
            onClick={onOpenCoast}
            className="inline-flex min-h-8 items-center text-[13px] text-foreground underline underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
          >
            Scrivi l&apos;età in Coast FIRE
          </button>
        </p>
      )}

      <TileMethodNote subject="Età obiettivo" summary={<NarrativeSegments segments={describeTargetAgeFooter()} figureClassName="font-medium" />}>
        {method.map((paragraph) => (
          <span key={paragraph}>{paragraph}</span>
        ))}
      </TileMethodNote>
    </Tile>
  );
}
