'use client';

/**
 * Impostazioni › Funzioni › «Cosa vedi» (doc/essenziale/README.md § 5.3): the viewer's «Essenziale · Completa» view
 * and one switch per area. It saves itself, like the theme — it is the VIEWER's (`userPreferences/{uid}`, D-ES7), not
 * the account's, so it never enters the page's draft, never lights the tab's dot and «Salva» does not write it.
 * «Personalizzata» is not a third button: it is written beside the pill when an area differs from the preset.
 */

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { useViewAreas } from '@/contexts/ViewAreasContext';
import { useViewChangeAnnouncer } from '@/lib/hooks/useViewNavGroups';
import { VIEW_AREAS, VIEW_AREA_BY_ID, type ViewPreset } from '@/lib/constants/viewAreas';
import { cn } from '@/lib/utils';
import { INTERACTIVE_CONTROL_CLASS } from './shared';

const PRESET_OPTIONS = [
  { value: 'essenziale', label: 'Essenziale' },
  { value: 'completa', label: 'Completa' },
] as const;

/** The pill's value: the preset, or nothing chosen while the view is «Personalizzata». */
type PillValue = ViewPreset | 'personalizzata';

export const PRESET_LABEL: Record<ViewPreset, string> = { essenziale: 'Essenziale', completa: 'Completa' };

export function CosaVediTile() {
  const { areas, preset, personalized, setPreset, setArea } = useViewAreas();
  const announceChange = useViewChangeAnnouncer();
  const pillValue: PillValue = personalized ? 'personalizzata' : preset;

  return (
    <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
      <Tile eyebrow="Cosa vedi">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-view-choice="">
          <SegmentedPill<PillValue>
            options={PRESET_OPTIONS}
            value={pillValue}
            onChange={(next) => {
              if (next === 'personalizzata') return;
              announceChange(setPreset(next), PRESET_LABEL[next]);
            }}
            layoutId="view-preset"
            ariaLabel="Vista"
            semantics="radio"
            optionClassName="max-desktop:min-h-11"
          />
          {personalized && (
            <span data-view-personalized="" className="text-[13px] text-muted-foreground">
              Personalizzata
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">
          Vale solo per te: chi usa l&apos;account con te sceglie la sua.
        </p>
        <div className="mt-1 flex flex-col divide-y divide-border">
          {VIEW_AREAS.map((area) => {
            const head = area.requires ? VIEW_AREA_BY_ID[area.requires] : undefined;
            const blocked = !!head && !areas[head.id];
            const switchId = `view-area-${area.id}`;
            const helpId = `${switchId}-help`;
            return (
              <div key={area.id} className={cn('py-3', head && 'pl-5')} data-view-area-row={area.id}>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Label htmlFor={switchId} className={cn('text-[13px] font-medium', blocked && 'text-muted-foreground')}>
                      {area.label}
                    </Label>
                    <p id={helpId} className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                      {blocked ? `Richiede ${head.label}` : area.help}
                    </p>
                  </div>
                  <Switch
                    id={switchId}
                    checked={areas[area.id]}
                    disabled={blocked}
                    aria-describedby={helpId}
                    onCheckedChange={(checked) => announceChange(setArea(area.id, checked), 'personalizzata')}
                    className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
          Spegnere un&apos;area toglie la sua voce dal menu e le sue schede; nessun dato e nessun calcolo cambia, e la pagina resta raggiungibile da un link.
        </div>
      </Tile>
    </div>
  );
}
