'use client';

/**
 * «Ipotesi usate», the verdict's scope line on every FIRE tab (doc/fire-ipotesi/README.md § 15, RC1–RC5; D-CU14 on the
 * phone, D-AS9 at every width since 2026-11-02): «Ipotesi: Base 4,1% reale, costi 0,30%» and a «Dettagli» popover that
 * holds the capital with its breakdown and the four chips' entries (Rendimenti · Costi · Spesa · Flussi): a chip is a
 * declaration, with the detail in a sentence and the way to change it. The strings come from `describeFireChips`, so the
 * six tabs print the same entries for the same data. Passed to `PageVerdict` as `scope`.
 */
import Link from 'next/link';
import type { FireAssumptions } from '@/lib/utils/fireAssumptions';
import { describeCapitalRow, describeFireChips, describeFireScopeLine, type FireChipLink } from '@/lib/utils/fireAssumptionsNarrative';
import { useFirePlan } from '@/lib/hooks/useFirePlan';
import { FireLockScope } from '@/components/fire-simulations/FireLockScope';
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

/**
 * D-CU14: the verdict's scope below `desktop:` — the pension lock first when the tab has one (`FireLockScope`), then the
 * assumptions line with «Dettagli». The popover holds what the two rows of 1440 hold: the capital with its breakdown and every
 * chip's label, sentences and links. The tabs pass it only with `compact` (at 1440 the row above the verdict is drawn).
 */
export function FireVerdictScope({ lockText, assumptions, view = 'default' }: { lockText: string | null; assumptions: FireAssumptions | null; view?: 'goals' | 'default' }) {
  if (!lockText && !assumptions) return null;
  return (
    <div className="flex flex-col gap-1">
      {lockText ? <FireLockScope text={lockText} /> : null}
      {assumptions ? <AssumptionsScopeLine assumptions={assumptions} view={view} /> : null}
    </div>
  );
}

function AssumptionsScopeLine({ assumptions, view }: { assumptions: FireAssumptions; view: 'goals' | 'default' }) {
  const capital = describeCapitalRow(assumptions);
  const chips = describeFireChips(assumptions, view);
  return (
    <div className="flex flex-wrap items-center gap-x-2" data-testid="fire-assumptions-scope">
      <p className="text-[12px] leading-[1.5] text-muted-foreground">{describeFireScopeLine(assumptions, view)}</p>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="fire-assumptions-details"
            className="inline-flex min-h-11 items-center px-1 text-[12px] font-medium text-foreground underline underline-offset-2 desktop:min-h-0"
          >
            Dettagli
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] space-y-3 text-[13px] leading-[1.45]">
          <p className="text-xs font-medium text-muted-foreground">Ipotesi usate</p>
          {capital ? (
            <div>
              <p>
                Capitale <span className="font-mono font-medium">{capital.figure}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">{capital.breakdown}</p>
            </div>
          ) : null}
          {chips.map((chip) => (
            <div key={chip.id} data-testid={`fire-detail-${chip.id}`}>
              <p className="font-mono text-[12px] tabular-nums">{chip.label}</p>
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
            </div>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
