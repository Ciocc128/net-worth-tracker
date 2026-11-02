/**
 * ActionChip — compact compra / vendi / ok status pill for allocation rows.
 *
 * The `color` is a resolved, legibility-clamped color from the active theme's chart palette
 * (provided by the parent via `useActionColors()` — see that hook for why it is resolved
 * once per section, not per chip). Background and border are `color-mix` tints of the same
 * color, so the whole chip follows the theme. The word is the signal; the color is reinforcement.
 */
'use client';

import { cn } from '@/lib/utils';
import { ACTION_CHIP_FILL_PCT, type AllocationAction } from '@/lib/utils/allocationUtils';

/** The word the chip prints: lowercase, a verb in a sentence (The Quiet-Pill Rule). */
const ACTION_WORD: Record<AllocationAction, string> = {
  COMPRA: 'compra',
  VENDI: 'vendi',
  OK: 'ok',
};

export function ActionChip({
  action,
  color,
  className,
}: {
  action: AllocationAction;
  /** Resolved, legibility-clamped color from `useActionColors()`. */
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        className
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} ${ACTION_CHIP_FILL_PCT}%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
      }}
    >
      {ACTION_WORD[action]}
    </span>
  );
}
