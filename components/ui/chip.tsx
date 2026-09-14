import * as React from 'react';
import { cn } from '@/lib/utils';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the chip is in the selected/active state. */
  readonly active?: boolean;
  /** Label text rendered inside the chip. */
  readonly label: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Chip — pill-shaped toggle button.
 *
 * Intended for horizontal, flex-wrap lists of selectable options (e.g. period
 * presets, filter tags). Active state uses the theme's pressed-toggle token (the primary
 * unless a theme keeps its filled colour for actions); inactive state uses bordered
 * transparent style with accent hover.
 */
export function Chip({ label, active = false, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'px-3 py-1.5 rounded-full text-sm border transition-colors motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-toggle-on text-toggle-on-foreground border-toggle-on'
          : 'bg-transparent text-foreground border-border hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {label}
    </button>
  );
}
