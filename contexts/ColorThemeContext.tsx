'use client';

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserPreferences, setUserPreferences } from '@/lib/services/userPreferencesService';
import {
  BASE_COLOR_THEME,
  COLOR_THEME_ATTRIBUTE,
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  isColorTheme,
  type ColorTheme,
} from '@/lib/constants/colorTheme';
import {
  TOP_BAND_ATTRIBUTE,
  TOP_BAND_STORAGE_KEY,
  parseTopBandChoices,
  resolveTopBand,
  type TopBandChoices,
  type TopBandOption,
  type TopBandTheme,
} from '@/lib/constants/topBand';

export type { ColorTheme };

// The key and the attribute live in `lib/constants/colorTheme.ts` (no 'use client'), because the
// root layout's pre-hydration script reads the same two strings from a Server Component.
const STORAGE_KEY = COLOR_THEME_STORAGE_KEY;

interface ColorThemeContextType {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
  /** The band the active theme paints (null: the theme has none). doc/fascia/README.md. */
  topBand: TopBandOption | null;
  setTopBand: (theme: TopBandTheme, option: TopBandOption) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => {},
  topBand: null,
  setTopBand: () => {},
});

function applyThemeAttribute(theme: ColorTheme) {
  // Only the `:root` block (upstream's zinc) goes without the attribute — not the fork's default.
  if (theme === BASE_COLOR_THEME) {
    document.documentElement.removeAttribute(COLOR_THEME_ATTRIBUTE);
  } else {
    document.documentElement.setAttribute(COLOR_THEME_ATTRIBUTE, theme);
  }
}

/** `data-band` on <html>: off for a theme without a band, else the resolved option (the default included). */
function applyBandAttribute(theme: ColorTheme, choices: TopBandChoices) {
  const band = resolveTopBand(theme, choices);
  if (band === null) document.documentElement.removeAttribute(TOP_BAND_ATTRIBUTE);
  else document.documentElement.setAttribute(TOP_BAND_ATTRIBUTE, band);
}

// ─── The theme as an external store ──────────────────────────────────────────
//
// localStorage is the source of truth on the client and does not exist on the server, so the
// theme is read through `useSyncExternalStore`: the server snapshot is the fork's default (Lime Frost), the client
// snapshot the stored value, and the hydration split is declared in the signature instead of
// being restored by an effect that sets state (react-hooks/set-state-in-effect).

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStoredTheme(): ColorTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // The same acceptance as the pre-hydration script: a stale or hand-edited value is the default.
    return isColorTheme(stored) ? stored : DEFAULT_COLOR_THEME;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

function readServerTheme(): ColorTheme {
  return DEFAULT_COLOR_THEME;
}

// The band's choices: the same store pattern, a JSON map per theme under its own key. The snapshot
// must be referentially stable between reads, so the parsed map is cached on the raw string.
let bandRaw: string | null = null;
let bandChoices: TopBandChoices = {};
const EMPTY_BAND_CHOICES: TopBandChoices = {};

function readStoredBands(): TopBandChoices {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TOP_BAND_STORAGE_KEY);
  } catch {
    return EMPTY_BAND_CHOICES;
  }
  if (raw !== bandRaw) {
    bandRaw = raw;
    bandChoices = parseTopBandChoices(raw);
  }
  return bandChoices;
}

function readServerBands(): TopBandChoices {
  return EMPTY_BAND_CHOICES;
}

function writeStoredBands(choices: TopBandChoices) {
  try {
    localStorage.setItem(TOP_BAND_STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // A storage that throws keeps the choice for this page view only, through the attribute below.
  }
  applyBandAttribute(readStoredTheme(), choices);
  listeners.forEach((listener) => listener());
}

/** Persists the theme and applies it to the document at once — before React re-renders. */
function writeStoredTheme(theme: ColorTheme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyThemeAttribute(theme);
  applyBandAttribute(theme, readStoredBands());
  listeners.forEach((listener) => listener());
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const colorTheme = useSyncExternalStore(subscribe, readStoredTheme, readServerTheme);
  const bands = useSyncExternalStore(subscribe, readStoredBands, readServerBands);
  const topBand = resolveTopBand(colorTheme, bands);
  // Tracks the uid whose prefs have already been loaded — avoids re-fetching on rerender
  const syncedUid = useRef<string | null>(null);

  // Keep the document attribute in step with the store — this is what restores the stored
  // theme on the first client render, when no write has happened yet.
  useEffect(() => {
    applyThemeAttribute(colorTheme);
    applyBandAttribute(colorTheme, bands);
  }, [colorTheme, bands]);

  // Sync from Firestore when user authenticates (once per uid)
  useEffect(() => {
    if (!uid || syncedUid.current === uid) return;
    syncedUid.current = uid;

    getUserPreferences(uid).then((prefs) => {
      // Writing the same value again is a no-op in every sink (storage, attribute, snapshot).
      if (prefs.colorTheme) writeStoredTheme(prefs.colorTheme);
      if (prefs.topBand) writeStoredBands(parseTopBandChoices(prefs.topBand));
    });
  }, [uid]);

  function setColorTheme(theme: ColorTheme) {
    writeStoredTheme(theme);
    if (user) {
      setUserPreferences(user.uid, { colorTheme: theme });
    }
  }

  function setTopBand(theme: TopBandTheme, option: TopBandOption) {
    const next = { ...readStoredBands(), [theme]: option };
    writeStoredBands(next);
    if (user) {
      setUserPreferences(user.uid, { topBand: next });
    }
  }

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme, topBand, setTopBand }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  return useContext(ColorThemeContext);
}
