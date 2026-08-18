'use client';

/**
 * CoastInflowTimeline — the events the backward walk already discounts.
 *
 * The Coast FIRE number is lower than a full FIRE number for one reason: money that arrives
 * later. Each state pension from its decorrenza, and — with the pension bridge on — the pension
 * fund re-entering at its unlock. Without this row the drop is an unexplained discount.
 *
 * The rail is an ORDER, not a scale: the segments are equal-width and every marker prints its
 * own year, so nothing here implies a proportional time axis it does not have.
 */

import { Landmark, LockOpen } from 'lucide-react';
import type { CoastInflowEvent } from '@/lib/utils/coastFireView';

interface CoastInflowTimelineProps {
  events: CoastInflowEvent[];
}

const EVENT_ICON = {
  statePension: Landmark,
  pensionFund: LockOpen,
} as const;

export function CoastInflowTimeline({ events }: CoastInflowTimelineProps) {
  if (events.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-[22px]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Afflussi già considerati
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Il calcolo li sconta già: è per questo che il Coast FIRE Number è più basso del FIRE
        Number pieno.
      </p>

      <ol
        aria-label="Afflussi già considerati"
        className="mt-5 grid gap-5 tablet:grid-flow-col tablet:auto-cols-fr tablet:gap-0"
      >
        {events.map((event, index) => {
          const Icon = EVENT_ICON[event.kind];
          const isLast = index === events.length - 1;
          return (
            <li key={event.id} className="min-w-0 tablet:pr-5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-border bg-muted"
                />
                <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {event.year}
                </span>
                {/* Rail segment, in flow rather than absolutely positioned: it is then centred on
                    the marker by the row itself, and it stops at the last event instead of
                    trailing off into nothing. */}
                {!isLast && (
                  <span aria-hidden="true" className="hidden h-px flex-1 bg-border tablet:block" />
                )}
              </div>
              <div className="mt-2 flex items-start gap-1.5 tablet:ml-[2px]">
                <Icon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{event.title}</p>
                  <p className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-foreground">
                    {event.amount}{' '}
                    <span className="font-sans text-[11px] font-normal text-muted-foreground">
                      {event.amountCaption}
                    </span>
                  </p>
                  {event.note && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{event.note}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
