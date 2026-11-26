'use client';

/**
 * The viewer's «Essenziale · Completa» view (doc/essenziale/README.md § 5.2, D-ES15), on the model of
 * `ColorThemeContext`: `localStorage` is the source of truth on the client (`view-areas`), read through
 * `useSyncExternalStore` (the server's snapshot is Completa), mirrored on `<html data-view-off>` so the menu's doors
 * are hidden by CSS before hydration (`VIEW_AREAS_INIT_SCRIPT`). After the authentication the provider reads
 * `userPreferences/{uid}` ONCE per uid and aligns the storage with it: the document wins, and a document without the
 * view is Completa.
 *
 * The view is the VIEWER's (`user.uid`, never `ownerId`, D-ES7). The demo account reads Completa and never writes
 * (D-ES16): the choice works for the browser's session only.
 *
 * Nothing here changes a figure: an area hides doors (DESIGN.md → The Door-Not-Room Rule).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { getUserPreferences, setViewPreferences } from '@/lib/services/userPreferencesService';
import { DEFAULT_VIEW_PRESET, VIEW_AREAS_STORAGE_KEY, VIEW_AREA_IDS, VIEW_OFF_ATTRIBUTE, type ViewAreaId, type ViewPreset } from '@/lib/constants/viewAreas';
import {
  isPersonalized,
  isViewPreset,
  resolveViewAreas,
  sanitizeOverrides,
  setAreaOverride,
  type ViewAreaOverrides,
  type ViewAreas,
  type ViewChoice,
} from '@/lib/utils/viewAreas';

// ─── The view as an external store ───────────────────────────────────────────

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const COMPLETA: Required<ViewChoice> = { viewPreset: DEFAULT_VIEW_PRESET, viewAreaOverrides: {} };

// The snapshot must be referentially stable between reads: the parsed choice is cached on the raw string.
let cachedRaw: string | null = null;
let cachedChoice: Required<ViewChoice> = COMPLETA;
// A storage that throws (a sandboxed frame) keeps the choice for this page view only, here.
let memoryChoice: Required<ViewChoice> | null = null;

export function parseStoredView(raw: string | null): Required<ViewChoice> {
  if (!raw) return COMPLETA;
  try {
    const parsed = JSON.parse(raw) as { preset?: unknown; overrides?: unknown };
    return {
      viewPreset: isViewPreset(parsed?.preset) ? parsed.preset : DEFAULT_VIEW_PRESET,
      viewAreaOverrides: sanitizeOverrides(parsed?.overrides),
    };
  } catch {
    return COMPLETA;
  }
}

function readStoredView(): Required<ViewChoice> {
  if (memoryChoice) return memoryChoice;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(VIEW_AREAS_STORAGE_KEY);
  } catch {
    return COMPLETA;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedChoice = parseStoredView(raw);
  }
  return cachedChoice;
}

function readServerView(): Required<ViewChoice> {
  return COMPLETA;
}

/** `data-view-off` on <html>: the areas that are off, or no attribute at all when every area is on. */
function applyOffAttribute(areas: ViewAreas) {
  const off = VIEW_AREA_IDS.filter((id) => !areas[id]);
  if (off.length === 0) document.documentElement.removeAttribute(VIEW_OFF_ATTRIBUTE);
  else document.documentElement.setAttribute(VIEW_OFF_ATTRIBUTE, off.join(' '));
}

function writeStoredView(choice: ViewChoice) {
  const next: Required<ViewChoice> = {
    viewPreset: isViewPreset(choice.viewPreset) ? choice.viewPreset : DEFAULT_VIEW_PRESET,
    viewAreaOverrides: sanitizeOverrides(choice.viewAreaOverrides),
  };
  try {
    localStorage.setItem(VIEW_AREAS_STORAGE_KEY, JSON.stringify({ preset: next.viewPreset, overrides: next.viewAreaOverrides }));
    memoryChoice = null;
  } catch {
    memoryChoice = next;
  }
  applyOffAttribute(resolveViewAreas(next));
  listeners.forEach((listener) => listener());
}

// ─── The open tab, for the «non è nel tuo menu» line ─────────────────────────

/**
 * The tab a tabbed page has open, published by the page (`usePublishOpenTab`): FIRE keeps its tab in state, not in
 * the URL, so `?tab=` alone would leave the line on a tab the reader has already left.
 */
let openTab: { path: string; tab: string } | null = null;
const openTabListeners = new Set<() => void>();

function subscribeOpenTab(listener: () => void): () => void {
  openTabListeners.add(listener);
  return () => {
    openTabListeners.delete(listener);
  };
}

function setOpenTab(next: { path: string; tab: string } | null) {
  if (openTab?.path === next?.path && openTab?.tab === next?.tab) return;
  openTab = next;
  openTabListeners.forEach((listener) => listener());
}

/** The open tab of the page at `path`, or `null` when that page published none. */
export function useOpenTab(path: string): string | null {
  const snapshot = useSyncExternalStore(subscribeOpenTab, () => openTab, () => null);
  return snapshot && snapshot.path === path ? snapshot.tab : null;
}

/** A tabbed page names its open tab while it is mounted. */
export function usePublishOpenTab(path: string, tab: string) {
  useEffect(() => {
    setOpenTab({ path, tab });
  }, [path, tab]);
  useEffect(() => () => setOpenTab(null), []);
}

// ─── The context ─────────────────────────────────────────────────────────────

interface ViewAreasContextType {
  areas: ViewAreas;
  preset: ViewPreset;
  overrides: ViewAreaOverrides;
  /** «Personalizzata»: an override differs from the preset (§ 5.2). */
  personalized: boolean;
  /** A preset chosen whole: the overrides go. Returns the areas it leads to, for the announcement. */
  setPreset: (preset: ViewPreset) => ViewAreas;
  /** One area flipped (with its head when a dependant is turned on). */
  setArea: (id: ViewAreaId, on: boolean) => ViewAreas;
  /** The «non è nel tuo menu» line's «Mostrala nel menu»: the area on, and its head. */
  showArea: (id: ViewAreaId) => ViewAreas;
  /** A polite sentence for the live region the provider renders (§ 6.1). */
  announce: (sentence: string) => void;
}

const ViewAreasContext = createContext<ViewAreasContextType>({
  areas: resolveViewAreas(null),
  preset: DEFAULT_VIEW_PRESET,
  overrides: {},
  personalized: false,
  setPreset: () => resolveViewAreas(null),
  setArea: () => resolveViewAreas(null),
  showArea: () => resolveViewAreas(null),
  announce: () => {},
});

export function ViewAreasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const isDemo = useDemoMode();
  const choice = useSyncExternalStore(subscribe, readStoredView, readServerView);
  const areas = useMemo(() => resolveViewAreas(choice), [choice]);
  const syncedUid = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Keeps <html> in step with the store — what restores the stored view on the first client render.
  useEffect(() => {
    applyOffAttribute(areas);
  }, [areas]);

  // Once per uid: the document wins over what this browser stored (another reader may have used it).
  useEffect(() => {
    if (!uid || syncedUid.current === uid) return;
    syncedUid.current = uid;
    if (isDemo) {
      // D-ES16: the demo is Completa; a choice made in it lives in this browser only.
      writeStoredView(COMPLETA);
      return;
    }
    getUserPreferences(uid)
      .then((prefs) => writeStoredView({ viewPreset: prefs.viewPreset, viewAreaOverrides: prefs.viewAreaOverrides }))
      .catch((error: unknown) => {
        // The stored view stays: a failed read is not a reason to change the menu under the reader.
        console.error('Failed to read the view preferences', { userId: uid, error });
      });
  }, [uid, isDemo]);

  const persist = useCallback(
    (next: Required<ViewChoice>) => {
      writeStoredView(next);
      if (uid && !isDemo) {
        setViewPreferences(uid, next).catch((error: unknown) => {
          console.error('Failed to save the view preferences', { userId: uid, error });
        });
      }
      return resolveViewAreas(next);
    },
    [uid, isDemo],
  );

  const setPreset = useCallback((preset: ViewPreset) => persist({ viewPreset: preset, viewAreaOverrides: {} }), [persist]);
  const setArea = useCallback(
    (id: ViewAreaId, on: boolean) => {
      const current = readStoredView();
      return persist({ viewPreset: current.viewPreset, viewAreaOverrides: setAreaOverride(current, id, on) });
    },
    [persist],
  );
  const showArea = useCallback((id: ViewAreaId) => setArea(id, true), [setArea]);

  const value = useMemo<ViewAreasContextType>(
    () => ({
      areas,
      preset: choice.viewPreset,
      overrides: choice.viewAreaOverrides,
      personalized: isPersonalized(choice),
      setPreset,
      setArea,
      showArea,
      announce: setAnnouncement,
    }),
    [areas, choice, setPreset, setArea, showArea],
  );

  return (
    <ViewAreasContext.Provider value={value}>
      {children}
      {/* One stable live region: a change of view says how long the menu is now (§ 6.1). */}
      <p role="status" aria-live="polite" className="sr-only" data-view-announcement="">
        {announcement}
      </p>
    </ViewAreasContext.Provider>
  );
}

export function useViewAreas() {
  return useContext(ViewAreasContext);
}

/** Whether ONE area is on — what a door reads (§ 5.5). */
export function useViewArea(id: ViewAreaId): boolean {
  return useContext(ViewAreasContext).areas[id];
}
