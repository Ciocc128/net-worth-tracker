/**
 * The «Essenziale · Completa» view, as pure functions (doc/essenziale/README.md § 5): what is on, what the menu
 * shows, which tabs a page draws, which area a location belongs to. Nothing here reads the DOM, the storage or
 * Firestore — `contexts/ViewAreasContext.tsx` does, and hands these functions what it read.
 */

import { Target } from 'lucide-react';
import { navGroups, type NavGroup, type NavItem } from '@/lib/constants/navigation';
import {
  DEFAULT_VIEW_PRESET,
  GOALS_NAV_HREF,
  VIEW_AREAS,
  VIEW_AREA_BY_ID,
  VIEW_AREA_IDS,
  VIEW_PRESETS,
  VIEW_ROUTES,
  type ViewAreaId,
  type ViewPreset,
  type ViewRoute,
} from '@/lib/constants/viewAreas';
import { isNavItemActive } from '@/lib/utils/navUtils';

export type ViewAreas = Readonly<Record<ViewAreaId, boolean>>;
export type ViewAreaOverrides = Partial<Record<ViewAreaId, boolean>>;

/** What the viewer chose, as `userPreferences/{uid}` and the local storage keep it (§ 5.2). */
export interface ViewChoice {
  viewPreset?: ViewPreset;
  viewAreaOverrides?: ViewAreaOverrides;
}

export function isViewPreset(value: unknown): value is ViewPreset {
  return typeof value === 'string' && (VIEW_PRESETS as readonly string[]).includes(value);
}

export function isViewAreaId(value: unknown): value is ViewAreaId {
  return typeof value === 'string' && (VIEW_AREA_IDS as readonly string[]).includes(value);
}

/** Only known areas and boolean values survive: a stale or hand-edited key is dropped, never trusted. */
export function sanitizeOverrides(value: unknown): ViewAreaOverrides {
  if (!value || typeof value !== 'object') return {};
  const overrides: ViewAreaOverrides = {};
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    if (isViewAreaId(key) && typeof flag === 'boolean') overrides[key] = flag;
  }
  return overrides;
}

/** The value every area takes under a preset, before the overrides. */
function presetValue(preset: ViewPreset): boolean {
  return preset === 'completa';
}

/**
 * Every area on or off (§ 5.1, acceptance 1): the preset's value (absent = Completa), then the viewer's overrides,
 * then the dependencies — a dependent area is off whenever its head is off, whatever its own preference says.
 */
export function resolveViewAreas(choice: ViewChoice | null | undefined): ViewAreas {
  const preset = isViewPreset(choice?.viewPreset) ? choice.viewPreset : DEFAULT_VIEW_PRESET;
  const overrides = sanitizeOverrides(choice?.viewAreaOverrides);
  const areas = {} as Record<ViewAreaId, boolean>;
  // VIEW_AREAS lists a head before its dependants, so the head is resolved when a dependant reads it.
  for (const area of VIEW_AREAS) {
    let on = overrides[area.id] ?? presetValue(preset);
    if (area.requires && !areas[area.requires]) on = false;
    areas[area.id] = on;
  }
  return areas;
}

export const ALL_AREAS_ON: ViewAreas = resolveViewAreas(null);

/**
 * «Personalizzata» is not a stored value (§ 5.2): it is what the view says when at least one override differs from
 * the preset's value. An override equal to the preset changes nothing and does not count.
 */
export function isPersonalized(choice: ViewChoice | null | undefined): boolean {
  const preset = isViewPreset(choice?.viewPreset) ? choice.viewPreset : DEFAULT_VIEW_PRESET;
  const overrides = sanitizeOverrides(choice?.viewAreaOverrides);
  return Object.values(overrides).some((value) => value !== presetValue(preset));
}

/**
 * The overrides after the viewer flips ONE area (Impostazioni › Funzioni › Cosa vedi): the area takes the value, an
 * override equal to the preset is dropped, and turning on a dependant turns on its head with it (it would stay off
 * otherwise, § 5.1 «Richiede»).
 */
export function setAreaOverride(choice: ViewChoice | null | undefined, id: ViewAreaId, on: boolean): ViewAreaOverrides {
  const preset = isViewPreset(choice?.viewPreset) ? choice.viewPreset : DEFAULT_VIEW_PRESET;
  const next: ViewAreaOverrides = { ...sanitizeOverrides(choice?.viewAreaOverrides), [id]: on };
  const head = VIEW_AREA_BY_ID[id].requires;
  if (on && head) next[head] = true;
  for (const key of Object.keys(next) as ViewAreaId[]) {
    if (next[key] === presetValue(preset)) delete next[key];
  }
  return next;
}

/** «Mostrala nel menu» (§ 5.6): that area on, and its head if it depends on one. */
export function showAreaOverride(choice: ViewChoice | null | undefined, id: ViewAreaId): ViewAreaOverrides {
  return setAreaOverride(choice, id, true);
}

// ─── The menu ────────────────────────────────────────────────────────────────

/** A menu entry with the area that hides it, for the pre-hydration CSS (`data-view-area`); absent = never hidden. */
export type ViewNavItem = NavItem & { viewArea?: ViewAreaId };
export type ViewNavGroup = { label: string | null; items: ViewNavItem[] };

/** The area of a route (its page, not its tabs); `undefined` for a page that is always on. */
export function routeArea(href: string): ViewAreaId | undefined {
  const path = stripQuery(href);
  return VIEW_ROUTES.find((route) => route.href === path)?.area;
}

export function stripQuery(href: string): string {
  const index = href.indexOf('?');
  return index === -1 ? href : href.slice(0, index);
}

const GOALS_NAV_ITEM: NavItem = { name: 'Traguardi', href: GOALS_NAV_HREF, icon: Target };

/**
 * The menu's groups for this view (§ 5.4, acceptance 2): `navGroups` without the entries of the areas that are off; a
 * group left empty goes. With FIRE off and the account's goals on, FIRE's entry is «Traguardi» on its tab (D-ES9). The
 * page the reader is on stays in its group while they are on it (`pathname`), so a link to a hidden page does not lose
 * where they are. In Completa the result is `navGroups` entry for entry.
 */
export function resolveNavGroups(
  areas: ViewAreas,
  account: { goalsEnabled: boolean },
  pathname?: string,
): ViewNavGroup[] {
  const groups: ViewNavGroup[] = [];
  for (const group of navGroups) {
    const items: ViewNavItem[] = [];
    for (const item of group.items) {
      const area = routeArea(item.href);
      const isOpen = !!pathname && isNavItemActive(item.href, pathname);
      if (!area || areas[area]) {
        // The open page never carries the attribute: the pre-hydration CSS must not hide where the reader is.
        items.push(area && !isOpen ? { ...item, viewArea: area } : item);
        continue;
      }
      if (area === 'fire' && account.goalsEnabled) {
        items.push(GOALS_NAV_ITEM);
        continue;
      }
      // The open page stays, without the attribute that would hide it.
      if (isOpen) items.push(item);
    }
    if (items.length > 0) groups.push({ label: group.label, items });
  }
  return groups;
}

/**
 * The areas a band folder hides with (`data-view-area` on the group's name, D-ES15): every distinct area of its
 * entries when each entry has one, `undefined` when one entry is always on (the folder never hides).
 */
export function groupViewAreas(group: ViewNavGroup | NavGroup): ViewAreaId[] | undefined {
  const areas: ViewAreaId[] = [];
  for (const item of group.items as ViewNavItem[]) {
    const area = 'viewArea' in item ? item.viewArea : undefined;
    if (!area) return undefined;
    if (!areas.includes(area)) areas.push(area);
  }
  return areas.length > 0 ? areas : undefined;
}

/** Every combination of areas a band folder can carry, for `buildViewAreasStyle`. */
export function navAreaCombinations(): ViewAreaId[][] {
  return resolveNavGroups(ALL_AREAS_ON, { goalsEnabled: false })
    .map(groupViewAreas)
    .filter((areas): areas is ViewAreaId[] => !!areas && areas.length > 1);
}

/** How many entries the menu holds (the groups' pages, the Assistente, Impostazioni) — the change's announcement. */
export function countMenuEntries(groups: readonly ViewNavGroup[], showAssistant: boolean): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0) + (showAssistant ? 1 : 0) + 1;
}

// ─── Tabs and locations ──────────────────────────────────────────────────────

function findRoute(pathname: string): ViewRoute | undefined {
  return VIEW_ROUTES.find((route) => isNavItemActive(route.href, pathname));
}

/** The area a tab of a route belongs to: its own entry in `tabs` (`null` = never hidden), else the page's. */
export function tabArea(routeHref: string, tab: string): ViewAreaId | undefined {
  const route = VIEW_ROUTES.find((r) => r.href === routeHref);
  if (!route) return undefined;
  if (route.tabs && tab in route.tabs) return route.tabs[tab] ?? undefined;
  return route.area;
}

/**
 * The tabs a page draws (§ 5.4): those whose area is on, plus the open one — a tab asked for by `?tab=` opens anyway,
 * with the «non è nel tuo menu» line, and keeps its place in the bar while it is open.
 */
export function filterTabsByArea<T extends { value: string }>(
  routeHref: string,
  tabs: readonly T[],
  areas: ViewAreas,
  activeTab?: string,
): T[] {
  return tabs.filter((tab) => {
    const area = tabArea(routeHref, tab.value);
    return !area || areas[area] || tab.value === activeTab;
  });
}

/**
 * The area that is off where the reader stands (§ 5.6): the open tab's, else the page's; `null` when everything there
 * is on, or the route has no area. `tab` is the open tab (`?tab=` or the page's own), absent = the page's default.
 */
export function hiddenAreaAt(pathname: string, tab: string | null | undefined, areas: ViewAreas): ViewAreaId | null {
  const route = findRoute(pathname);
  if (!route) return null;
  const openTab = tab ?? route.defaultTab;
  const area = openTab !== undefined ? tabArea(route.href, openTab) : route.area;
  // A dependant whose head is off is named itself: «Mostrala nel menu» turns its head on with it (`showAreaOverride`).
  return !area || areas[area] ? null : area;
}

/** «Vista Essenziale: 8 voci nel menu» — the polite announcement of a change of view (§ 6.1). */
export function describeViewChange(label: string, entries: number): string {
  return `Vista ${label}: ${entries} voci nel menu`;
}
