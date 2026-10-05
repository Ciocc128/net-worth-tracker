'use client';

/**
 * «Ipotesi usate», two rows above the verdict of every FIRE tab (doc/fire-ipotesi/README.md § 15, RC1–RC5): the capital the
 * numbers run on with its breakdown, then four chips (Rendimenti · Costi · Spesa · Flussi). A chip is a declaration, not a
 * filter: it opens a popover with the detail in a sentence and the way to change it. The strings come from
 * `describeFireChips`, so the six tabs print the same chips for the same data.
 */
import Link from 'next/link';
import type { FireAssumptions } from '@/lib/utils/fireAssumptions';
import { describeCapitalRow, describeFireChips, type FireChip, type FireChipLink } from '@/lib/utils/fireAssumptionsNarrative';
import { useFirePlan } from '@/lib/hooks/useFirePlan';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const LINK_CLASS = 'inline-flex min-h-11 items-center text-[13px] text-foreground underline underline-offset-2 desktop:min-h-0';

function ChipLink({ link }: { link: FireChipLink }) {
  const plan = useFirePlan();
  if ('href' in link) {
    return (
      <Link href={link.href} className={LINK_CLASS}>
        {link.text}
      </Link>
    );
  }
  // The plan block sits on the same page: the link opens it on the field and keeps the tab.
  if (plan) {
    return (
      <button type="button" onClick={() => plan.focusField(link.planField)} className={LINK_CLASS}>
        {link.text}
      </button>
    );
  }
  return (
    <Link href={`/dashboard/fire-simulations?piano=${link.planField}`} className={LINK_CLASS}>
      {link.text}
    </Link>
  );
}

function Chip({ chip }: { chip: FireChip }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`fire-chip-${chip.id}`}
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3 font-mono text-[12px] tabular-nums text-foreground hover:bg-muted desktop:min-h-7"
        >
          {chip.label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-[13px] leading-[1.45]">
        {chip.lines.map((line) => (
          <p key={line} className="text-muted-foreground">
            {line}
          </p>
        ))}
        <div className="flex flex-wrap gap-x-4">
          {chip.links.map((link) => (
            <ChipLink key={link.text} link={link} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** `view="goals"`: the Obiettivi read no dated flows, and the Flussi chip says so (RC3). */
export function FireAssumptionsRow({ assumptions, view = 'default' }: { assumptions: FireAssumptions | null; view?: 'goals' | 'default' }) {
  if (!assumptions) return null;
  const capital = describeCapitalRow(assumptions);
  const chips = describeFireChips(assumptions, view);
  return (
    <div className="mb-3 space-y-1.5" data-testid="fire-assumptions-row">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-muted-foreground">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em]">Ipotesi usate</span>
        {capital ? (
          <>
            <span className="text-[13px]">
              Capitale <span className="font-mono font-medium text-foreground">{capital.figure}</span>
            </span>
            <span className="text-[11px] leading-[1.4]">{capital.breakdown}</span>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <Chip key={chip.id} chip={chip} />
        ))}
      </div>
    </div>
  );
}
