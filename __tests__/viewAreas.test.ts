/**
 * The «Essenziale · Completa» view (doc/essenziale/README.md § 5, acceptance 1–2): the areas, the menu, the tabs, the
 * «non è nel tuo menu» line, and the pre-hydration script that must resolve the same areas as the TypeScript.
 */
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { navGroups } from '@/lib/constants/navigation';
import {
  buildViewAreasStyle,
  shouldWriteInitialViewPreset,
  VIEW_AREAS_INIT_SCRIPT,
  VIEW_AREA_IDS,
  type ViewAreaId,
} from '@/lib/constants/viewAreas';
import {
  countMenuEntries,
  filterTabsByArea,
  groupViewAreas,
  hiddenAreaAt,
  isPersonalized,
  navAreaCombinations,
  resolveNavGroups,
  resolveViewAreas,
  setAreaOverride,
  type ViewChoice,
} from '@/lib/utils/viewAreas';
import { buildFolders } from '@/lib/utils/folderNav';
import { isNavItemActive } from '@/lib/utils/navUtils';

const onlyOn = (choice: ViewChoice | null) =>
  Object.entries(resolveViewAreas(choice))
    .filter(([, on]) => on)
    .map(([id]) => id)
    .sort();

const ESSENZIALE = resolveViewAreas({ viewPreset: 'essenziale' });
const COMPLETA = resolveViewAreas(null);

describe('resolveViewAreas (acceptance 1)', () => {
  it('no document → every area on (Completa: who was here before sees no change)', () => {
    expect(onlyOn(null)).toEqual([...VIEW_AREA_IDS].sort());
    expect(onlyOn({})).toEqual([...VIEW_AREA_IDS].sort());
  });

  it('Essenziale → every area off', () => {
    expect(onlyOn({ viewPreset: 'essenziale' })).toEqual([]);
  });

  it('Essenziale + Allocazione by hand → only Allocazione; Accumulo stays off (its own preference is the preset)', () => {
    expect(onlyOn({ viewPreset: 'essenziale', viewAreaOverrides: { allocazione: true } })).toEqual(['allocazione']);
  });

  it('Completa − FIRE → FIRE and Simulazioni off, though Simulazioni is not among the overrides (dependency)', () => {
    const areas = resolveViewAreas({ viewPreset: 'completa', viewAreaOverrides: { fire: false } });
    expect(areas.fire).toBe(false);
    expect(areas.simulazioni).toBe(false);
    expect(areas.allocazione).toBe(true);
  });

  it('a dependant turned on by hand under a head that is off stays off', () => {
    expect(onlyOn({ viewPreset: 'essenziale', viewAreaOverrides: { accumulo: true } })).toEqual([]);
  });

  it('a stale preset, a stale area id or a non-boolean override is read as nothing', () => {
    const choice = { viewPreset: 'basic', viewAreaOverrides: { fenicottero: false, fire: 'no' } } as unknown as ViewChoice;
    expect(onlyOn(choice)).toEqual([...VIEW_AREA_IDS].sort());
  });
});

describe('«Personalizzata» and the overrides (§ 5.2, § 5.6)', () => {
  it('is said only when an override differs from the preset', () => {
    expect(isPersonalized({ viewPreset: 'essenziale' })).toBe(false);
    expect(isPersonalized({ viewPreset: 'essenziale', viewAreaOverrides: { fire: false } })).toBe(false);
    expect(isPersonalized({ viewPreset: 'essenziale', viewAreaOverrides: { fire: true } })).toBe(true);
  });

  it('turning a dependant on turns its head on with it; switching back to the preset drops the override', () => {
    const essenziale: ViewChoice = { viewPreset: 'essenziale' };
    const withAccumulo = setAreaOverride(essenziale, 'accumulo', true);
    expect(withAccumulo).toEqual({ accumulo: true, allocazione: true });
    expect(onlyOn({ viewPreset: 'essenziale', viewAreaOverrides: withAccumulo })).toEqual(['accumulo', 'allocazione']);
    expect(setAreaOverride({ viewPreset: 'essenziale', viewAreaOverrides: { fire: true } }, 'fire', false)).toEqual({});
  });
});

describe('resolveNavGroups (acceptance 2)', () => {
  const names = (groups: ReturnType<typeof resolveNavGroups>) => groups.map((g) => [g.label, g.items.map((i) => i.name)]);

  it('Completa → navGroups entry for entry', () => {
    const groups = resolveNavGroups(COMPLETA, { goalsEnabled: false });
    expect(names(groups)).toEqual(names(navGroups));
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(navGroups.flatMap((g) => g.items.map((i) => i.href)));
    // 10 grouped entries + Assistente + Impostazioni = 12, as today.
    expect(countMenuEntries(groups, true)).toBe(12);
  });

  it('Essenziale without Traguardi → 6 entries in the groups + Assistente + Impostazioni = 8, no empty group', () => {
    const groups = resolveNavGroups(ESSENZIALE, { goalsEnabled: false });
    expect(names(groups)).toEqual([
      [null, ['Panoramica']],
      ['Entrate e spese', ['Cashflow', 'Analisi spese']],
      ['Investimenti', ['Patrimonio']],
      ['Storia', ['Storico', 'Hall of Fame']],
    ]);
    expect(countMenuEntries(groups, true)).toBe(8);
  });

  it('Essenziale with the account\'s goals → + Futuro › «Traguardi» on its tab = 9', () => {
    const groups = resolveNavGroups(ESSENZIALE, { goalsEnabled: true });
    const futuro = groups.find((g) => g.label === 'Futuro');
    expect(futuro?.items.map((i) => [i.name, i.href])).toEqual([['Traguardi', '/dashboard/fire-simulations?tab=goals']]);
    expect(countMenuEntries(groups, true)).toBe(9);
    // The entry is active on its page whatever the tab (navUtils strips the query).
    expect(isNavItemActive('/dashboard/fire-simulations?tab=goals', '/dashboard/fire-simulations')).toBe(true);
  });

  it('the page the reader is on stays in its group, without the attribute that hides it before hydration', () => {
    const groups = resolveNavGroups(ESSENZIALE, { goalsEnabled: false }, '/dashboard/allocation');
    const investimenti = groups.find((g) => g.label === 'Investimenti');
    expect(investimenti?.items.map((i) => i.name)).toEqual(['Patrimonio', 'Allocazione']);
    expect(investimenti?.items.every((i) => !('viewArea' in i))).toBe(true);
    // Rendimenti, the other page of the group that is off, does not come back.
    expect(groups.flatMap((g) => g.items.map((i) => i.name))).not.toContain('Rendimenti');
  });

  it('every entry of an area carries its area (the CSS hides it before hydration); a band folder carries its group\'s', () => {
    const groups = resolveNavGroups(COMPLETA, { goalsEnabled: false });
    const all = groups.flatMap((g) => g.items);
    expect(all.find((i) => i.name === 'Allocazione')?.viewArea).toBe('allocazione');
    expect(all.find((i) => i.name === 'Patrimonio')?.viewArea).toBeUndefined();
    const futuro = groups.find((g) => g.label === 'Futuro')!;
    expect(groupViewAreas(futuro)).toEqual(['fire', 'previdenza']);
    expect(groupViewAreas(groups.find((g) => g.label === 'Investimenti')!)).toBeUndefined();
    const folders = buildFolders(true, groups);
    expect(folders.find((f) => f.label === 'Futuro')?.viewArea).toBe('fire previdenza');
  });

  it('a band folder keeps its key when the view hides its first page (the remembered page stays addressable)', () => {
    const essenziale = buildFolders(false, resolveNavGroups(ESSENZIALE, { goalsEnabled: true }));
    const completa = buildFolders(false);
    expect(essenziale.find((f) => f.label === 'Futuro')?.key).toBe(completa.find((f) => f.label === 'Futuro')?.key);
  });
});

describe('tabs (§ 5.4)', () => {
  const FIRE_TABS = ['quando', 'ese', 'approfondimenti', 'goals'].map((value) => ({ value }));
  const values = (tabs: { value: string }[]) => tabs.map((t) => t.value);

  it('Essenziale: FIRE keeps Traguardi alone; Cashflow loses Dividendi; Impostazioni loses Avanzate; Allocazione loses Accumulo', () => {
    expect(values(filterTabsByArea('/dashboard/fire-simulations', FIRE_TABS, ESSENZIALE, 'goals'))).toEqual(['goals']);
    expect(values(filterTabsByArea('/dashboard/cashflow', [{ value: 'tracking' }, { value: 'budget' }, { value: 'dividends' }], ESSENZIALE, 'tracking'))).toEqual(['tracking', 'budget']);
    expect(values(filterTabsByArea('/dashboard/settings', ['account', 'funzioni', 'cashflow', 'investimenti', 'avanzate'].map((value) => ({ value })), ESSENZIALE, 'account'))).toEqual(['account', 'funzioni', 'cashflow', 'investimenti']);
    const withAllocazione = resolveViewAreas({ viewPreset: 'essenziale', viewAreaOverrides: { allocazione: true } });
    expect(values(filterTabsByArea('/dashboard/allocation', ['bilanciamento', 'accumulo', 'strategia'].map((value) => ({ value })), withAllocazione, 'bilanciamento'))).toEqual(['bilanciamento', 'strategia']);
  });

  it('a hidden tab asked for by ?tab= opens anyway and keeps its place in the bar', () => {
    expect(values(filterTabsByArea('/dashboard/cashflow', [{ value: 'tracking' }, { value: 'budget' }, { value: 'dividends' }], ESSENZIALE, 'dividends'))).toEqual(['tracking', 'budget', 'dividends']);
  });

  it('Completa: every tab', () => {
    expect(values(filterTabsByArea('/dashboard/fire-simulations', FIRE_TABS, COMPLETA, 'quando'))).toEqual(values(FIRE_TABS));
  });
});

describe('hiddenAreaAt — the «non è nel tuo menu» line (§ 5.6)', () => {
  it('names the area of the page, or of the open tab', () => {
    expect(hiddenAreaAt('/dashboard/allocation', null, ESSENZIALE)).toBe('allocazione');
    expect(hiddenAreaAt('/dashboard/performance', null, ESSENZIALE)).toBe('rendimenti');
    expect(hiddenAreaAt('/dashboard/pension', null, ESSENZIALE)).toBe('previdenza');
    expect(hiddenAreaAt('/dashboard/cashflow', 'dividends', ESSENZIALE)).toBe('dividendi');
    expect(hiddenAreaAt('/dashboard/settings', 'avanzate', ESSENZIALE)).toBe('simulazioni');
    expect(hiddenAreaAt('/dashboard/fire-simulations', null, ESSENZIALE)).toBe('fire');
    expect(hiddenAreaAt('/dashboard/fire-simulations', 'approfondimenti', ESSENZIALE)).toBe('simulazioni');
    expect(hiddenAreaAt('/dashboard/fire-simulations', 'ese', ESSENZIALE)).toBe('fire');
    // The old ids of a bookmark name the same area.
    expect(hiddenAreaAt('/dashboard/fire-simulations', 'coast', ESSENZIALE)).toBe('simulazioni');
    // A dependant names itself: «Mostrala nel menu» turns its head on with it.
    expect(hiddenAreaAt('/dashboard/allocation', 'accumulo', ESSENZIALE)).toBe('accumulo');
  });

  it('says nothing where everything is on, on a page that is always on, or on FIRE › Traguardi', () => {
    expect(hiddenAreaAt('/dashboard/allocation', null, COMPLETA)).toBeNull();
    expect(hiddenAreaAt('/dashboard/cashflow', 'tracking', ESSENZIALE)).toBeNull();
    expect(hiddenAreaAt('/dashboard/cashflow', null, ESSENZIALE)).toBeNull();
    expect(hiddenAreaAt('/dashboard', null, ESSENZIALE)).toBeNull();
    expect(hiddenAreaAt('/dashboard/settings', 'funzioni', ESSENZIALE)).toBeNull();
    expect(hiddenAreaAt('/dashboard/fire-simulations', 'goals', ESSENZIALE)).toBeNull();
  });
});

describe('first paint (D-ES15)', () => {
  /** Runs the inline script against a fake `localStorage` and `<html>`; returns `data-view-off`. */
  function runScript(stored: string | null): string | null {
    const attributes: Record<string, string> = {};
    runInNewContext(VIEW_AREAS_INIT_SCRIPT, {
      localStorage: { getItem: () => stored },
      document: { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } },
    });
    return attributes['data-view-off'] ?? null;
  }
  const offFromTs = (choice: ViewChoice) => {
    const areas = resolveViewAreas(choice);
    const off = VIEW_AREA_IDS.filter((id) => !areas[id]);
    return off.length ? off.join(' ') : null;
  };
  const stored = (preset: string, overrides: Partial<Record<ViewAreaId, boolean>> = {}) => JSON.stringify({ preset, overrides });

  it('resolves the same areas as resolveViewAreas', () => {
    const cases: ViewChoice[] = [
      { viewPreset: 'essenziale' },
      { viewPreset: 'completa' },
      { viewPreset: 'essenziale', viewAreaOverrides: { allocazione: true, accumulo: true } },
      { viewPreset: 'completa', viewAreaOverrides: { fire: false } },
      { viewPreset: 'essenziale', viewAreaOverrides: { simulazioni: true } },
    ];
    for (const choice of cases) {
      expect(runScript(stored(choice.viewPreset!, choice.viewAreaOverrides))).toBe(offFromTs(choice));
    }
  });

  it('nothing stored, an unreadable value or a throwing storage hide nothing', () => {
    expect(runScript(null)).toBeNull();
    expect(runScript('{fenicottero')).toBeNull();
    const attributes: Record<string, string> = {};
    runInNewContext(VIEW_AREAS_INIT_SCRIPT, {
      localStorage: { getItem: () => { throw new Error('blocked'); } },
      document: { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } },
    });
    expect(attributes).toEqual({});
  });

  it('the style hides one rule per area and one per band group of areas, with display:none', () => {
    const style = buildViewAreasStyle(navAreaCombinations());
    for (const id of VIEW_AREA_IDS) expect(style).toContain(`html[data-view-off~="${id}"] [data-view-area="${id}"]{display:none!important}`);
    expect(style).toContain('html[data-view-off~="fire"][data-view-off~="previdenza"] [data-view-area="fire previdenza"]');
    expect(style).not.toContain('visibility');
  });
});

describe('the first admission (D-ES3)', () => {
  it('writes the view only when the viewer has none yet', () => {
    expect(shouldWriteInitialViewPreset(undefined)).toBe(true);
    expect(shouldWriteInitialViewPreset({})).toBe(true);
    expect(shouldWriteInitialViewPreset({ viewPreset: 'completa' })).toBe(false);
  });
});
