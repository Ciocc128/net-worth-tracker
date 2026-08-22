import { cn } from '@/lib/utils';
import type { Narrative } from '@/lib/utils/overviewNarrative';

interface NarrativeTextProps {
  segments: Narrative;
  className?: string;
  /** Weight applied to mono figures — the verdict sentence sets them semibold, tile readings too. */
  figureClassName?: string;
}

/**
 * Renders a `Narrative` (see lib/utils/overviewNarrative.ts): prose stays prose, figures are
 * set in the numeric face and coloured by sign through the theme tokens, so one sentence can
 * mix words and numbers without the numbers losing their financial authority.
 */
export function NarrativeText({ segments, className, figureClassName = 'font-semibold' }: NarrativeTextProps) {
  return (
    <p className={cn('m-0', className)}>
      {segments.map((segment, i) =>
        segment.mono ? (
          <span
            key={i}
            className={cn(
              'font-mono tabular-nums',
              figureClassName,
              segment.sign === 'positive' && 'text-positive',
              segment.sign === 'negative' && 'text-destructive',
              !segment.sign && 'text-foreground',
            )}
          >
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
