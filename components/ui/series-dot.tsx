import { cn } from '@/lib/utils';

/**
 * A small dot in a series colour beside a figure, so a neutral number still reads as «the
 * green bars» or «the ice bars». Its display is the `--series-dot` token: `none` by default,
 * so only a theme that neutralises the income/spending figures shows it.
 */
export function SeriesDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('mr-1.5 h-2 w-2 shrink-0 rounded-full align-[0.05em] [display:var(--series-dot)]', className)}
      style={{ backgroundColor: color }}
    />
  );
}
