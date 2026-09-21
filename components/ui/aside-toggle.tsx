'use client';

import { cn } from '@/lib/utils';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';

export interface AsideToggleOption<T extends string> {
  value: T;
  label: string;
}

interface AsideToggleProps<T extends string> {
  options: ReadonlyArray<AsideToggleOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * The two states wear Strumenti's «Andamento / Raggruppa per classe» toggles through theme tokens:
 * off is an outline button (outline fill, hover pressing into the accent), on is the pressed-toggle
 * colour. `--aside-toggle-on` defaults to `--muted`, so a theme that does not name it keeps the
 * quiet grey this switch always had instead of the filled primary.
 */
const ASIDE_TOGGLE_ON_CLASS = 'border-border bg-aside-toggle-on text-aside-toggle-on-foreground';
const ASIDE_TOGGLE_OFF_CLASS = 'border-border bg-outline-surface text-muted-foreground hover:bg-accent hover:text-accent-foreground';

/**
 * The view switch that lives in a tile's aside (the Strumenti form: 11px outline buttons,
 * `aria-pressed`; 32px on a pointer — the dense-list floor, `desktop:h-7` is 28px and never a
 * target, AGENTS.md → Accessibility) — on the Confronto («Mensile | Per categoria») and the Dettaglio tiles. Below
 * `desktop:` the buttons grow to the 44px touch target. A `SegmentedPill` at 14px in the 10px
 * aside slot read as a second control register.
 *
 * ONE Tab stop per group since 2026-09-21 (`useRovingFocus`, horizontal): Allocazione carries
 * three of these — the band, the plan mode and the exposure view — and ten independent stops put
 * everything below them ten presses further away. The role stays `group` with `aria-pressed`
 * buttons, the APG's toolbar arrangement: turning it into a radiogroup would change the accessible
 * role of every caller on four other pages, and their locators with it.
 */
export function AsideToggle<T extends string>({ options, value, onChange, ariaLabel, className }: AsideToggleProps<T>) {
  const roving = useRovingFocus(options.length, 'horizontal');
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-1', className)} {...roving.containerProps}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'h-11 rounded-md border px-3 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-8 desktop:px-2.5',
              active ? ASIDE_TOGGLE_ON_CLASS : ASIDE_TOGGLE_OFF_CLASS,
            )}
            {...roving.itemProps(index)}
            // The Tab stop is the SELECTED option, not the last one focused: coming back to the
            // group must land on the state it is in. The hook's arrow handler reads the DOM, so
            // overriding its tabIndex costs it nothing.
            tabIndex={active ? 0 : -1}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
