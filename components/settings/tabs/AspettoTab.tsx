'use client';

/**
 * Impostazioni › Aspetto — light/dark/system beside the seven colour themes.
 *
 * No slice: both choices save themselves (the mode through next-themes, per device; the theme
 * through `ColorThemeContext`, on the account) outside the page's «Salva», and mark no tab
 * (doc/guide/impostazioni.md). The view reads the two contexts itself.
 */

import { useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useColorTheme, type ColorTheme } from '@/contexts/ColorThemeContext';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import { applyThemeWithTransition } from '@/lib/utils/themeTransition';
import { describeColorTheme, describeThemeMode, describeTopBand, type ThemeMode } from '@/lib/utils/settingsNarrative';
import {
  TOP_BAND_LABELS,
  TOP_BAND_NONE,
  TOP_BAND_OPTIONS,
  TOP_BAND_SWATCHES,
  isTopBandTheme,
  type TopBandOption,
  type TopBandTheme,
} from '@/lib/constants/topBand';
import { SettingsTabPanel } from './shared';
import { NarrativeText } from '@/components/ui/narrative-text';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Stable no-op store for the SSR/hydration split (same guard ThemePicker uses).
const neverChanges = () => () => {};

// Modalità: the three next-themes modes, applied with the circle view transition.
const THEME_MODES = [
  { value: 'light',  label: 'Chiaro',  Icon: Sun     },
  { value: 'dark',   label: 'Scuro',   Icon: Moon    },
  { value: 'system', label: 'Sistema', Icon: Monitor },
] as const;

// Tema colori. The fork's two themes lead the list (owner, 2026-11-06), then upstream's in its order.
// Swatch previews carry each theme's own oklch values on purpose:
// they PREVIEW a palette that is not active, which no CSS token can express.
const COLOR_THEME_SWATCHES = [
  {
    id: 'lime-frost' as ColorTheme,
    name: 'Lime Frost',
    description: 'Lime su ardesia',
    swatchBg: 'oklch(0.9600 0.0120 118.0000)',
    swatchBgDark: 'oklch(0.1288 0.0406 264.6952)',
    swatchPrimary: 'oklch(0.5200 0.1480 128.5041)',
    swatchPrimaryDark: 'oklch(0.8871 0.2122 128.5041)',
    swatchAccent: 'oklch(0.3717 0.0392 257.2870)',
  },
  {
    // Fork only (2026-11-02): zinc made minimal, one blue accent and one green (doc/guide/temi.md § Graphite).
    id: 'graphite' as ColorTheme,
    name: 'Graphite',
    description: 'Grafite, blu e verde',
    swatchBg: 'oklch(0.9550 0 0)',
    swatchBgDark: 'oklch(0.1000 0 0)',
    swatchPrimary: 'oklch(0.2050 0 0)',
    swatchPrimaryDark: 'oklch(0.9220 0 0)',
    swatchAccent: 'oklch(0.5200 0.1500 255.0000)',
  },
  {
    id: 'default' as ColorTheme,
    name: 'Default',
    description: 'Zinc classico',
    swatchBg: 'oklch(1 0 0)',
    swatchBgDark: 'oklch(0.145 0 0)',
    swatchPrimary: 'oklch(0.205 0 0)',
    swatchPrimaryDark: 'oklch(0.922 0 0)',
    swatchAccent: 'oklch(0.97 0 0)',
  },
  {
    id: 'solar-dusk' as ColorTheme,
    name: 'Solar Dusk',
    description: 'Ambra calda',
    swatchBg: 'oklch(0.9885 0.0057 84.5659)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.5553 0.1455 48.9975)',
    swatchPrimaryDark: 'oklch(0.7049 0.1867 47.6044)',
    swatchAccent: 'oklch(0.9000 0.0500 74.9889)',
  },
  {
    id: 'elegant-luxury' as ColorTheme,
    name: 'Elegant Luxury',
    description: 'Borgogna raffinato',
    swatchBg: 'oklch(0.9779 0.0042 56.3756)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.4650 0.1470 24.9381)',
    swatchPrimaryDark: 'oklch(0.5054 0.1905 27.5181)',
    swatchAccent: 'oklch(0.9619 0.0580 95.6174)',
  },
  {
    id: 'midnight-bloom' as ColorTheme,
    name: 'Midnight Bloom',
    description: 'Viola profondo',
    swatchBg: 'oklch(0.9821 0 0)',
    swatchBgDark: 'oklch(0.2303 0.0125 264.2926)',
    swatchPrimary: 'oklch(0.5676 0.2021 283.0838)',
    swatchPrimaryDark: 'oklch(0.5676 0.2021 283.0838)',
    swatchAccent: 'oklch(0.8214 0.0720 249.3482)',
  },
  {
    id: 'cyberpunk' as ColorTheme,
    name: 'Cyberpunk',
    description: 'Neon pink & teal',
    swatchBg: 'oklch(0.9816 0.0017 247.8390)',
    swatchBgDark: 'oklch(0.1649 0.0352 281.8285)',
    swatchPrimary: 'oklch(0.6726 0.2904 341.4084)',
    swatchPrimaryDark: 'oklch(0.6726 0.2904 341.4084)',
    swatchAccent: 'oklch(0.8903 0.1739 171.2690)',
  },
  {
    id: 'retro-arcade' as ColorTheme,
    name: 'Retro Arcade',
    description: 'Rosso & teal vintage',
    swatchBg: 'oklch(0.9735 0.0261 90.0953)',
    swatchBgDark: 'oklch(0.2673 0.0486 219.8169)',
    swatchPrimary: 'oklch(0.5924 0.2025 355.8943)',
    swatchPrimaryDark: 'oklch(0.5924 0.2025 355.8943)',
    swatchAccent: 'oklch(0.6437 0.1019 187.3840)',
  },
] as const;

/**
 * The phone's top band of a theme (doc/fascia/README.md): the popover that opens on the theme's card
 * when the reader picks it (owner, 2026-11-06), three colours of the theme and «Nessuna».
 */
function BandPicker({ theme, band, onPick }: { theme: TopBandTheme; band: TopBandOption | null; onPick: (option: TopBandOption) => void }) {
  return (
    <>
      <p className="text-[12px] text-muted-foreground">Fascia in alto sul telefono</p>
      <div className="mt-1 text-[13px] leading-[1.45]">
        <NarrativeText segments={describeTopBand(band === null || band === TOP_BAND_NONE ? null : TOP_BAND_LABELS[band])} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Colore della fascia">
        {TOP_BAND_OPTIONS[theme].map((option) => {
          const isActive = band === option;
          const swatch = TOP_BAND_SWATCHES[theme][option];
          return (
            <button
              key={option}
              type="button"
              onClick={() => onPick(option)}
              aria-pressed={isActive}
              className={cn(
                'relative flex min-h-11 flex-col rounded-[10px] border-2 p-2 text-left transition-[border-color] hover:border-primary/60',
                isActive ? 'border-primary' : 'border-border'
              )}
            >
              {/* Light over dark, the band's own two values (TOP_BAND_SWATCHES) */}
              <div className="mb-2 h-8 overflow-hidden rounded-md border border-border/50" aria-hidden="true">
                <div className="h-4 w-full" style={{ background: swatch.light }} />
                <div className="h-4 w-full" style={{ background: swatch.dark }} />
              </div>
              <span className="text-[13px] font-medium leading-none">{TOP_BAND_LABELS[option]}</span>
              {isActive && <div className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-[1.45] text-muted-foreground">Ogni tema ricorda la sua. Si salva da sola sull&apos;account.</p>
    </>
  );
}

export function AspettoTab() {
  const { colorTheme, setColorTheme, topBand, setTopBand } = useColorTheme();
  // The theme whose band popover is open: it opens when a theme with a band is picked (or tapped again).
  const [bandFor, setBandFor] = useState<TopBandTheme | null>(null);
  const { theme, setTheme } = useTheme();
  // The active next-themes mode does not exist until hydration (same guard as ThemePicker).
  const isThemeHydrated = useSyncExternalStore(neverChanges, () => true, () => false);
  const resolvedThemeMode = isThemeHydrated ? (theme as ThemeMode | undefined) : undefined;
  const activeSwatch = COLOR_THEME_SWATCHES.find((swatch) => swatch.id === colorTheme) ?? COLOR_THEME_SWATCHES[0];

  return (
    <SettingsTabPanel tab="aspetto" label="Aspetto">
      {/* Modalità — next-themes, per device, with the circle view transition */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
        <Tile eyebrow="Modalità" aside="questo dispositivo" reading={describeThemeMode(resolvedThemeMode)}>
          <div className="mt-3.5 flex rounded-lg bg-muted p-1" role="group" aria-label="Modalità del tema">
            {THEME_MODES.map(({ value, label, Icon }) => {
              const isActive = resolvedThemeMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={(e) => applyThemeWithTransition(value, e, setTheme)}
                  className={cn(
                    'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors',
                    isActive ? 'bg-segment-active text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Il passaggio anima con la transizione circolare dal punto del clic; il selettore resta anche nel menu
            account della sidebar.
          </div>
        </Tile>
      </div>

      {/* Tema colori — the seven palettes, synced on the account */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-8')}>
        <Tile eyebrow="Tema colori" aside="tutti i dispositivi" reading={describeColorTheme(activeSwatch.name)}>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {COLOR_THEME_SWATCHES.map((swatch, index) => {
              const isActive = colorTheme === swatch.id;
              const bandTheme = isTopBandTheme(swatch.id) ? swatch.id : null;
              const card = (
                <button
                  key={swatch.id}
                  type="button"
                  onClick={() => {
                    setColorTheme(swatch.id);
                    // A theme with a band asks for its colour right away (owner, 2026-11-06).
                    if (bandTheme) setBandFor(bandTheme);
                  }}
                  aria-label={`Colore ${index + 1} di ${COLOR_THEME_SWATCHES.length}: ${swatch.name}`}
                  aria-pressed={isActive}
                  className={cn(
                    'relative flex flex-col rounded-[10px] border-2 p-2.5 text-left transition-[border-color] hover:border-primary/60',
                    isActive ? 'border-primary shadow-sm' : 'border-border'
                  )}
                >
                  {/* Mini preview: light half over dark half, in the theme's own values */}
                  <div className="mb-2.5 h-14 overflow-hidden rounded-md border border-border/50" aria-hidden="true">
                    <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBg }}>
                      <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimary }} />
                      <div className="h-2 flex-1 rounded-full" style={{ background: swatch.swatchAccent }} />
                    </div>
                    <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBgDark }}>
                      <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimaryDark }} />
                      <div className="h-2 flex-1 rounded-full opacity-30" style={{ background: swatch.swatchPrimaryDark }} />
                    </div>
                  </div>
                  <span className="text-[13px] font-medium leading-none">{swatch.name}</span>
                  <span className="mt-1 text-[11px] text-muted-foreground">{swatch.description}</span>
                  {isActive && bandTheme && topBand !== null && (
                    <span className="mt-1 text-[11px] text-muted-foreground">Fascia: {TOP_BAND_LABELS[topBand].toLowerCase()}</span>
                  )}
                  {isActive && (
                    <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  )}
                </button>
              );
              if (!bandTheme) return card;
              return (
                <Popover key={swatch.id} open={bandFor === bandTheme} onOpenChange={(open) => { if (!open) setBandFor(null); }}>
                  <PopoverTrigger asChild>{card}</PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
                    <BandPicker theme={bandTheme} band={topBand} onPick={(option) => setTopBand(bandTheme, option)} />
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            La scelta si salva da sola sull&apos;account: nessun Salva necessario.
          </div>
        </Tile>
      </div>

    </SettingsTabPanel>
  );
}
