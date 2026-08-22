import type { OverviewVerdict as OverviewVerdictModel } from '@/lib/utils/overviewNarrative';
import { NarrativeText } from './NarrativeText';

interface OverviewVerdictProps {
  verdict: OverviewVerdictModel;
}

/**
 * The headline of the page: the verdict in one sentence, the facts in the next. The tone only
 * colours the headline's full stop — a whole coloured headline would shout, and the figures in
 * the sentence already carry their own sign colours.
 */
const TONE_DOT_CLASS: Record<OverviewVerdictModel['tone'], string> = {
  positive: 'text-positive',
  neutral: 'text-muted-foreground',
  warning: 'text-warning-foreground',
  negative: 'text-destructive',
};

export function OverviewVerdict({ verdict }: OverviewVerdictProps) {
  const headline = verdict.headline.endsWith('.') ? verdict.headline.slice(0, -1) : verdict.headline;

  return (
    <section aria-label="Verdetto del mese" className="flex max-w-[920px] flex-col gap-2">
      <h2 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]">
        {headline}
        <span className={TONE_DOT_CLASS[verdict.tone]} aria-hidden="true">
          .
        </span>
      </h2>
      <NarrativeText
        segments={verdict.sentence}
        className="text-[14px] leading-[1.6] text-muted-foreground desktop:text-[15px]"
      />
    </section>
  );
}
