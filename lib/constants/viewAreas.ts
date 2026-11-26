/**
 * The viewer's areas (doc/essenziale/README.md § 5.1, D-ES8): which doors — a menu entry, a tab, a link with its
 * sentence — belong to which area of the «Essenziale · Completa» view. ONE table; the menu, the tabs, the doors and
 * the «non è nel tuo menu» line all read it through `lib/utils/viewAreas.ts`.
 *
 * Without `'use client'`, like `colorTheme.ts`: `app/layout.tsx` (a Server Component) inlines the pre-hydration script
 * and the style built from these strings (D-ES15).
 *
 * DESIGN.md → The Door-Not-Room Rule: an area hides doors; it never changes what a tile shows or what a figure counts.
 */

export const VIEW_AREA_IDS = ['allocazione', 'accumulo', 'rendimenti', 'fire', 'simulazioni', 'dividendi', 'previdenza'] as const;

export type ViewAreaId = (typeof VIEW_AREA_IDS)[number];

export const VIEW_PRESETS = ['essenziale', 'completa'] as const;

export type ViewPreset = (typeof VIEW_PRESETS)[number];

/** A document without `viewPreset` reads as Completa: who was here before F17 sees no change (D-ES3). */
export const DEFAULT_VIEW_PRESET: ViewPreset = 'completa';

export interface ViewAreaDef {
  id: ViewAreaId;
  /** The area's name, as the menu and the «{Area} non è nel tuo menu» line say it. */
  label: string;
  /** What appears when it is on: the row's help line in Impostazioni › Funzioni › Cosa vedi. */
  help: string;
  /** A dependent area is off whenever its head is off, whatever its own preference says. */
  requires?: ViewAreaId;
}

/** In the order of the rows in «Cosa vedi»: a dependent area right under its head. */
export const VIEW_AREAS: readonly ViewAreaDef[] = [
  { id: 'allocazione', label: 'Allocazione', help: 'Aggiunge Allocazione al menu: Bilanciamento e Strategia' },
  { id: 'accumulo', label: 'Piano di accumulo', help: 'Aggiunge la scheda Accumulo ad Allocazione', requires: 'allocazione' },
  { id: 'rendimenti', label: 'Rendimenti', help: 'Aggiunge Rendimenti al menu: TWR, IRR e benchmark' },
  { id: 'fire', label: 'FIRE', help: 'Aggiunge FIRE al menu: Calcolatore e What If' },
  { id: 'simulazioni', label: 'Simulazioni', help: 'Aggiunge a FIRE Coast FIRE, Dopo il FIRE e Proiezione, e la scheda Avanzate alle Impostazioni', requires: 'fire' },
  { id: 'dividendi', label: 'Dividendi', help: 'Aggiunge la scheda Dividendi a Cashflow' },
  { id: 'previdenza', label: 'Previdenza', help: 'Aggiunge Previdenza al menu' },
];

export const VIEW_AREA_BY_ID: Readonly<Record<ViewAreaId, ViewAreaDef>> = Object.fromEntries(
  VIEW_AREAS.map((area) => [area.id, area]),
) as Record<ViewAreaId, ViewAreaDef>;

/**
 * The routes whose doors belong to an area (§ 5.1). `area` is the page's; `tabs` the tabs that differ from it —
 * `null` means a tab that is never hidden (FIRE › Traguardi follows the account's switch, D-ES9, until RU11); `defaultTab` is
 * what the page opens on without `?tab=`. A route absent from here is always on.
 */
export interface ViewRoute {
  href: string;
  area?: ViewAreaId;
  tabs?: Readonly<Record<string, ViewAreaId | null>>;
  defaultTab?: string;
}

export const VIEW_ROUTES: readonly ViewRoute[] = [
  { href: '/dashboard/allocation', area: 'allocazione', tabs: { accumulo: 'accumulo' }, defaultTab: 'bilanciamento' },
  { href: '/dashboard/performance', area: 'rendimenti' },
  {
    href: '/dashboard/fire-simulations',
    area: 'fire',
    // The old ids (`coast`, `montecarlo`, `proiezione`) stay for a bookmark: `hiddenAreaAt` reads `?tab=` as it is.
    tabs: { approfondimenti: 'simulazioni', coast: 'simulazioni', montecarlo: 'simulazioni', proiezione: 'simulazioni' },
    defaultTab: 'quando',
  },
  { href: '/dashboard/pension', area: 'previdenza' },
  { href: '/dashboard/cashflow', tabs: { dividends: 'dividendi' }, defaultTab: 'tracking' },
  { href: '/dashboard/settings', tabs: { avanzate: 'simulazioni' }, defaultTab: 'account' },
];

// ─── First paint (D-ES15) ────────────────────────────────────────────────────

/** localStorage: `{ "preset": "essenziale", "overrides": { "allocazione": true } }`. */
export const VIEW_AREAS_STORAGE_KEY = 'view-areas';

/** On `<html>`: the ids of the areas that are off, space-separated (`~=` in CSS). */
export const VIEW_OFF_ATTRIBUTE = 'data-view-off';

/** On a door: the area(s) it belongs to, space-separated; it hides when every one of them is off. */
export const VIEW_AREA_ATTRIBUTE = 'data-view-area';

/**
 * The script `app/layout.tsx` inlines in `<head>` after the theme's: it reads the stored view and puts the areas that
 * are off on `<html>`, so the menu's doors are hidden by CSS before the first paint (no entry flashes for a reader in
 * Essenziale). The same resolution as `resolveViewAreas`, written in ES5 because it runs before any module; a stored
 * value it cannot read is Completa (nothing hidden). Kept in step with the TypeScript by `__tests__/viewAreas.test.ts`,
 * which runs it.
 */
export const VIEW_AREAS_INIT_SCRIPT =
  '(function(){try{' +
  `var raw=localStorage.getItem(${JSON.stringify(VIEW_AREAS_STORAGE_KEY)});if(!raw)return;` +
  'var v=JSON.parse(raw);if(!v||typeof v!=="object")return;' +
  `var defs=${JSON.stringify(VIEW_AREAS.map((area) => [area.id, area.requires ?? null]))};` +
  'var base=v.preset==="essenziale"?false:true;var o=v.overrides&&typeof v.overrides==="object"?v.overrides:{};' +
  'var on={},off=[];' +
  'for(var i=0;i<defs.length;i++){var id=defs[i][0],req=defs[i][1];' +
  'var value=typeof o[id]==="boolean"?o[id]:base;if(req&&!on[req])value=false;on[id]=value;if(!value)off.push(id)}' +
  `if(off.length)document.documentElement.setAttribute(${JSON.stringify(VIEW_OFF_ATTRIBUTE)},off.join(" "))` +
  '}catch(e){}})()';

/**
 * The CSS that hides a door whose areas are all off: one rule per combination the shell writes (a single area, or a
 * group's areas in the band). `display:none`, never `visibility`: out of the accessibility tree too (§ 6.1).
 */
export function buildViewAreasStyle(combinations: readonly (readonly ViewAreaId[])[]): string {
  const seen = new Set<string>();
  const rules: string[] = [];
  const all = [...VIEW_AREA_IDS.map((id) => [id] as const), ...combinations];
  for (const combination of all) {
    const key = combination.join(' ');
    if (seen.has(key) || combination.length === 0) continue;
    seen.add(key);
    const html = combination.map((id) => `[${VIEW_OFF_ATTRIBUTE}~="${id}"]`).join('');
    rules.push(`html${html} [${VIEW_AREA_ATTRIBUTE}="${key}"]{display:none!important}`);
  }
  return rules.join('');
}

// ─── The first admission (D-ES3) ─────────────────────────────────────────────

export const USER_PREFERENCES_COLLECTION = 'userPreferences';

/** What the first admission in production writes: a new account starts in Essenziale (§ 5.2). */
export const FIRST_ADMISSION_VIEW_PRESET: ViewPreset = 'essenziale';

/**
 * Whether the first admission may write the view: only when the viewer's preferences carry no `viewPreset` yet — a
 * view already chosen (on another account, by a co-owner who existed before) is the viewer's and stays (D-ES3, D-ES7).
 */
export function shouldWriteInitialViewPreset(existing: { viewPreset?: unknown } | undefined | null): boolean {
  return existing?.viewPreset === undefined;
}
