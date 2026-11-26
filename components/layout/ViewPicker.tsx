'use client';

import { useViewAreas } from '@/contexts/ViewAreasContext';
import { useViewChangeAnnouncer } from '@/lib/hooks/useViewNavGroups';
import { VIEW_PRESETS, type ViewPreset } from '@/lib/constants/viewAreas';
import { cn } from '@/lib/utils';

const LABEL: Record<ViewPreset, string> = { essenziale: 'Essenziale', completa: 'Completa' };

/**
 * The account menu's «Vista» (doc/essenziale/README.md § 5.3, D-ES5): the same frame as `ThemePicker`, two words
 * instead of three icons. With areas changed by hand neither is marked (the row says «Vista: personalizzata»); one tap
 * puts the whole view back, without opening Impostazioni. A `radiogroup`, as the pill in Funzioni (§ 6.1).
 */
export function ViewPicker() {
  const { preset, personalized, setPreset } = useViewAreas();
  const announceChange = useViewChangeAnnouncer();
  const active = personalized ? null : preset;

  return (
    <div role="radiogroup" aria-label="Vista" className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
      {VIEW_PRESETS.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={active === value}
          data-view-preset={value}
          // The menu stays open: the reader sees the menu change behind it, and the row says what was chosen.
          onClick={(event) => {
            event.preventDefault();
            announceChange(setPreset(value), LABEL[value]);
          }}
          className={cn(
            'flex h-6 items-center rounded-[max(0px,calc(var(--radius-md)_-_3px))] px-2 text-[12px] font-medium transition-colors pointer-coarse:h-9',
            active === value ? 'bg-segment-active text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {LABEL[value]}
        </button>
      ))}
    </div>
  );
}
