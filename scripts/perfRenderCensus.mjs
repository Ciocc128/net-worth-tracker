/**
 * perf:census — «how much of the page does ONE keystroke re-render?», on a production build served
 * against the emulators (the manual: doc/guide/velocita.md § Il census). Written to measure the React
 * Compiler (2026-10-05); a change that claims fewer re-renders runs a before/after of the same
 * scenario, same machine, same session, and adds its own scenario when none of these fits.
 *
 * Two measures per scenario, over the same window (the keys typed, plus a settle):
 *   (a) The browser's work, from CDP `Performance.getMetrics` read before and after: LayoutCount,
 *       RecalcStyleCount, and the Script/Layout/RecalcStyle/Task durations; long tasks from a
 *       `PerformanceObserver`. These are the counters of «How we made claude.ai faster».
 *   (b) React's work, from a stand-in for the React DevTools hook (`__REACT_DEVTOOLS_GLOBAL_HOOK__`)
 *       installed before the bundle by `addInitScript`. React DOM — production builds included —
 *       hands it every committed root (`onCommitFiberRoot`); the census walks the committed tree the
 *       way the DevTools do and counts the component fibers that RAN in that commit: a fiber whose
 *       parent bailed out keeps `child === alternate.child` (the subtree was not even visited, so it
 *       is skipped), and a visited fiber ran only if it carries the `PerformedWork` flag (bit 0,
 *       set by `beginWork` when the component function was called). That is what the compiler
 *       changes: a memoized JSX element reaches its child with the SAME props object, React bails
 *       out, and the flag stays off. On a `--profile` build the root's `actualDuration` adds the
 *       render time of the commit; on a plain build it is absent and printed as «-».
 *
 * Scenarios (`--scenario=`, comma-separated, default all five):
 *   settings   Impostazioni › Preferenze: 10 keys in «Anno inizio storico cashflow» — a controlled
 *              input of the settings page. Until 2026-10-08 every key was a `setState` on a
 *              4000-line page root (286 components per key on one machine with the compiler, 318 on
 *              another); since then the page holds ONE draft and the tab is a view of its slice.
 *   allocation Impostazioni › Allocazione: 10 keys in «Target Criptovalute», a class target of
 *              the biggest tab (added 2026-10-08 to measure that view on its own — the class list
 *              used to render every collapsed sub-target editor too).
 *   expense    Cashflow › «Nuova Spesa» › Spesa variabile: 10 keys in «Importo», watched by
 *              `useWatch` at the dialog's root.
 *   tabs       Cashflow: Tracciamento ⇄ Budget, both already mounted (`forceMount`), four switches —
 *              does the hidden tab re-render?
 *   asset      Patrimonio › «Aggiungi asset» › ETF: 10 keys in «Quantità» of the opening position,
 *              watched by a leaf of `AssetDialog` since 2026-10-07 — at the dialog's root it
 *              re-rendered the whole form, 562 components per key (doc/guide/patrimonio.md
 *              § Two-Step). Not an edit: an ETF is a ledger type, and editing one shows quantity
 *              and PMC read-only.
 *   mount      A full load of one route (`--route=`, comma-separated; default `history`): recording is
 *              switched on by an init script BEFORE the navigation and stops when the page's data is
 *              on screen (`main h1`, a euro figure, no skeleton left) plus 1 s. One unit per load.
 *              Added 2026-10-08 to count what a mount costs on its own — a host of
 *              `useChartColors` used to render twice, the second time one frame after mounting.
 *   nav        A pathname change at the viewport's width, through the sidebar's own links: Hall of
 *              Fame ⇄ Previdenza, four switches, each waited until the new page has no skeleton
 *              (+ 800 ms). Added 2026-10-08: the bottom nav, hidden at 1440, measured its
 *              layout at every pathname change.
 *   hall-of-fame  A tap on a CLOSED row of the phone composition, on the `tabs` model: Hall of Fame
 *              at 390 (`--mobile` is required — at 1440 there is no row and the scenario fails
 *              naming it), the Anni row opened and closed twice, four taps. Added 2026-10-10
 *              (the composition's own measure): a tap must re-render that row, `PageRest` and the page
 *              that holds the controller — never another tile, nor `PageVerdict` or `VerdictStrip`;
 *              read `byName` on a `--no-mangling` build to see who ran.
 *   view       Allocazione › Esposizione: Settori → Paesi → Valute → Titoli through the tile's own
 *              view switch, four switches, each given 900 ms so a glide's frames are inside the
 *              window (opened first with `--mobile`, where the tile is a closed row). Added
 *              2026-10-23 for the views that transform (doc/animazioni/README.md § 5.4, AN2).
 *   period     Cashflow › Tracciamento: «Quest'anno» ⇄ «Questo mese» from the period picker, four
 *              switches after one unmeasured lap (each window read once and cached), so it counts
 *              the axis moving over data in memory — the transform, not the read (§ 5.6).
 *   analisi-period  Analisi: «Da inizio anno» ⇄ «Anno corrente» on the page's pill, four switches;
 *              Analisi reads the history whole, so no read is in the window (§ 5.6).
 *   drill      Analisi › Scheda: down to the first subcategory and back up by its crumb, twice
 *              (four steps), from the first category of «Spese per categoria» (§ 5.5).
 * Never saves anything: the typed values are dropped with the context.
 *
 * Prerequisites, in the owner's terminals: `npm run emulators`, the mirror
 * (`npm run mirror:seed -- <production email>`), `npm run perf:build -- --profile`, `npm run perf:serve` (:3200).
 * Usage — options ALWAYS after `--` (doc/guide/velocita.md):
 *   npm run perf:census -- --runs=3 --scenario=settings,expense --label=prima
 *   npm run perf:census -- --scenario=mount,nav --route=history,fire-simulations,dashboard --label=prima
 *   npm run perf:census -- --mobile --scenario=hall-of-fame
 * Writes perf/last-census.json (gitignored): every run and the medians, with the label.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const RUNS = Number(args.runs ?? 3);
const EMAIL = args.email ?? 'mirror@example.com';
const PASSWORD = 'test1234';
const LABEL = args.label ?? '';
const MOBILE = args.mobile === 'true';
const VIEWPORT = MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 };
// `mount` expands to one scenario per route: «mount:/dashboard/history». A route token is a path
// («/dashboard/history»), a segment under /dashboard («history») or «dashboard» for the Panoramica.
const MOUNT_ROUTES = (args.route ?? 'history').split(',').map((token) =>
  token.startsWith('/') ? token : token === 'dashboard' ? '/dashboard' : `/dashboard/${token}`,
);
const SCENARIOS = (args.scenario ?? 'settings,allocation,expense,tabs,asset')
  .split(',')
  .flatMap((name) => (name === 'mount' ? MOUNT_ROUTES.map((href) => `mount:${href}`) : [name]));
// :3000 is the tour server, :3100 the Playwright one, :3200 the benchmark's (doc/guide/velocita.md).
const BASE = args.base ?? 'http://localhost:3200';
const OUT = 'perf/last-census.json';
const KEYS = '1234567890'; // each key yields a DIFFERENT value, so each one is a real state change
const KEY_GAP_MS = 150;    // a brisk typist; every commit of a key lands before the next one
const SETTLE_MS = 600;     // after the last key: effects, deferred work, a debounced reader
// After a view, period or drill switch: longer than the longest glide it may start (620 ms), so
// every frame of the transition lands inside the window and is counted.
const VIEW_SETTLE_MS = 900;

/**
 * Injected before any page script. Runs IN THE PAGE, so it is self-contained. React DOM looks for
 * the hook when it is first evaluated, so it must exist before the bundle — which is why this is
 * an init script and not an `evaluate`.
 */
function installRenderProbe() {
  const COMPONENT_TAGS = new Set([0, 1, 11, 15]); // Function, Class, ForwardRef, SimpleMemo
  const PERFORMED_WORK = 1;
  const census = { recording: false, commits: 0, rendered: 0, renderMs: 0, hasDuration: false, byName: {} };
  window.__census = census;

  const nameOf = (fiber) => {
    const type = fiber.type;
    if (!type) return '?';
    if (fiber.tag === 11) return type.displayName || type.render?.displayName || type.render?.name || 'ForwardRef';
    return type.displayName || type.name || '?';
  };

  // DevTools' own traversal (`updateFiberRecursively`): `prev` is the fiber's previous version,
  // null for a mount. An untouched subtree is shared between the two trees — stop there.
  const walk = (fiber, prev) => {
    let child = fiber.child;
    let prevChild = prev ? prev.child : null;
    if (prev && child === prevChild) return;
    while (child) {
      const childPrev = child.alternate && prev ? child.alternate : null;
      if (COMPONENT_TAGS.has(child.tag) && (childPrev === null || (child.flags & PERFORMED_WORK) === PERFORMED_WORK)) {
        census.rendered++;
        const name = nameOf(child);
        census.byName[name] = (census.byName[name] || 0) + 1;
      }
      walk(child, childPrev);
      child = child.sibling;
    }
  };

  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      const id = nextId++;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(_id, root) {
      if (!census.recording) return;
      census.commits++;
      const current = root.current;
      if (typeof current.actualDuration === 'number') {
        census.hasDuration = true;
        census.renderMs += current.actualDuration;
      }
      walk(current, current.alternate);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    setStrictMode() {},
    checkDCE() {},
  };

  window.__census_long = { count: 0, ms: 0 };
  try {
    new PerformanceObserver((list) => {
      if (!census.recording) return;
      for (const entry of list.getEntries()) { window.__census_long.count++; window.__census_long.ms += entry.duration; }
    }).observe({ type: 'longtask' });
  } catch {
    // No longtask entry type: the CDP counters still say the rest.
  }
}

/** The real form, as the owner logs in (the same as perf:bench). */
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

const CDP_METRICS = ['LayoutCount', 'RecalcStyleCount', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'];

async function readMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.filter((m) => CDP_METRICS.includes(m.name)).map((m) => [m.name, m.value]));
}

/**
 * Record what `act` costs: React's commits and rendered components (b), the browser's counters (a).
 * `units` divides the totals into «per key» / «per switch».
 */
async function record(page, cdp, units, act) {
  await page.evaluate(() => {
    Object.assign(window.__census, { recording: true, commits: 0, rendered: 0, renderMs: 0, byName: {} });
    Object.assign(window.__census_long, { count: 0, ms: 0 });
  });
  const before = await readMetrics(cdp);
  await act();
  await page.waitForTimeout(SETTLE_MS);
  return collect(page, cdp, units, before);
}

/** Stop the recording and turn the counters into per-unit figures against `before`. */
async function collect(page, cdp, units, before) {
  const after = await readMetrics(cdp);
  const react = await page.evaluate(() => {
    window.__census.recording = false;
    return { ...window.__census, long: { ...window.__census_long } };
  });
  const delta = (name) => after[name] - before[name];
  const per = (value, digits = 1) => Number((value / units).toFixed(digits));
  const topNames = Object.entries(react.byName).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return {
    units,
    commitsPerUnit: per(react.commits),
    renderedPerUnit: per(react.rendered),
    renderMsPerUnit: react.hasDuration ? per(react.renderMs, 2) : null,
    layoutPerUnit: per(delta('LayoutCount')),
    recalcStylePerUnit: per(delta('RecalcStyleCount')),
    scriptMs: Math.round(delta('ScriptDuration') * 1000),
    layoutMs: Math.round(delta('LayoutDuration') * 1000),
    recalcStyleMs: Math.round(delta('RecalcStyleDuration') * 1000),
    taskMs: Math.round(delta('TaskDuration') * 1000),
    longTasks: react.long.count,
    longTaskMs: Math.round(react.long.ms),
    topNames,
    // Every component's count, for the JSON only: a host that should render once instead of
    // twice is read by name here (a `--no-mangling` build gives the names).
    byName: react.byName,
  };
}

async function typeKeys(page, input) {
  await input.click();
  await page.keyboard.press('ControlOrMeta+A');
  for (const key of KEYS) {
    await page.keyboard.type(key);
    await page.waitForTimeout(KEY_GAP_MS);
  }
}

const scenarioRunners = {
  async settings(page, cdp) {
    await page.goto(`${BASE}/dashboard/settings?tab=generale`, { waitUntil: 'load' });
    const input = page.locator('#cashflowHistoryStartYear');
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the settings document and the count-ups land first
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
  async allocation(page, cdp) {
    await page.goto(`${BASE}/dashboard/settings?tab=allocazione`, { waitUntil: 'load' });
    // Crypto: never owned by the auto-calculated formula, so the field is enabled on any account.
    const input = page.getByRole('spinbutton', { name: 'Target Criptovalute' });
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the settings document lands first
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
  async expense(page, cdp) {
    await page.goto(`${BASE}/dashboard/cashflow`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Nuova Spesa' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^Spesa variabile/ }).click();
    const input = dialog.locator('#amount');
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the drawer's entrance and the categories
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
  async tabs(page, cdp) {
    await page.goto(`${BASE}/dashboard/cashflow`, { waitUntil: 'load' });
    const tab = (name) => page.getByRole('tab', { name, exact: true }).filter({ visible: true }).first();
    await tab('Tracciamento').waitFor({ state: 'visible', timeout: 30_000 });
    // Mount Budget once, come back: from here on both panels stay mounted and hidden in turn.
    await tab('Budget').click();
    await page.waitForTimeout(1_500);
    await tab('Tracciamento').click();
    await page.waitForTimeout(1_500);
    const switches = ['Budget', 'Tracciamento', 'Budget', 'Tracciamento'];
    return record(page, cdp, switches.length, async () => {
      for (const name of switches) {
        await tab(name).click();
        await page.waitForTimeout(400);
      }
    });
  },
  async asset(page, cdp) {
    await page.goto(`${BASE}/dashboard/assets`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Aggiungi asset' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^ETF/ }).click();
    const input = dialog.locator('#quantity');
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000); // the dialog's entrance and the settings read it starts on open
    return record(page, cdp, KEYS.length, () => typeKeys(page, input));
  },
  async 'hall-of-fame'(page, cdp) {
    if (!MOBILE) throw new Error('hall-of-fame: the rows exist only below 1440 — run with --mobile');
    await page.goto(`${BASE}/dashboard/hall-of-fame`, { waitUntil: 'load' });
    await page.waitForFunction(isPageSettled, { previousHeading: null, needsEuro: true }, { timeout: 30_000, polling: 100 });
    const anni = page.locator('#hof-anni-trigger');
    await anni.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000);
    // Open once first: the row's content mounts on the first opening and stays, so every measured
    // tap toggles a mounted row, as `tabs` toggles two mounted panels.
    await anni.click();
    await page.waitForTimeout(600);
    await anni.click();
    await page.waitForTimeout(600);
    return record(page, cdp, 4, async () => {
      for (let i = 0; i < 4; i++) {
        await anni.click();
        await page.waitForTimeout(400);
      }
    });
  },
  async view(page, cdp) {
    await page.goto(`${BASE}/dashboard/allocation`, { waitUntil: 'load' });
    await page.waitForFunction(isPageSettled, { previousHeading: null, needsEuro: true }, { timeout: 30_000, polling: 100 });
    // Below `desktop:` the Esposizione is a closed row: open it once, so its read starts and the
    // measured switches toggle a mounted list, as `tabs` toggles two mounted panels.
    if (MOBILE) await page.locator('#alloc-esposizione-trigger').click();
    const group = page.getByRole('group', { name: "Vista dell'esposizione" }).filter({ visible: true }).first();
    await group.waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('list', { name: 'Titoli più pesanti' }).first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1_000);
    const switches = ['Settori', 'Paesi', 'Valute', 'Titoli'];
    return record(page, cdp, switches.length, async () => {
      for (const name of switches) {
        await group.getByRole('button', { name, exact: true }).click();
        await page.waitForTimeout(VIEW_SETTLE_MS);
      }
    });
  },
  async period(page, cdp) {
    await page.goto(`${BASE}/dashboard/cashflow`, { waitUntil: 'load' });
    await page.waitForFunction(isPageSettled, { previousHeading: null, needsEuro: true }, { timeout: 30_000, polling: 100 });
    const choose = async (name) => {
      await page.getByRole('combobox', { name: /^Periodo selezionato/ }).filter({ visible: true }).first().click();
      await page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
      await page.waitForFunction(isGridSettled, null, { timeout: 30_000, polling: 100 });
      await page.waitForTimeout(VIEW_SETTLE_MS);
    };
    // One lap first: each window is read once and lands in the cache, so the measured switches
    // are the axis moving over data already in memory — what the glide adds, not the read.
    const month = 'Questo mese';
    await choose("Quest'anno");
    await choose(month);
    const switches = ["Quest'anno", month, "Quest'anno", month];
    return record(page, cdp, switches.length, async () => {
      for (const name of switches) await choose(name);
    });
  },
  async 'analisi-period'(page, cdp) {
    await page.goto(`${BASE}/dashboard/analisi`, { waitUntil: 'load' });
    await page.waitForFunction(isPageSettled, { previousHeading: null, needsEuro: true }, { timeout: 30_000, polling: 100 });
    const pill = page.getByRole('radiogroup', { name: 'Periodo di analisi' }).filter({ visible: true }).first();
    await pill.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1_000);
    const switches = ['Da inizio anno', 'Anno corrente', 'Da inizio anno', 'Anno corrente'];
    return record(page, cdp, switches.length, async () => {
      for (const name of switches) {
        await pill.getByRole('radio', { name, exact: true }).click();
        await page.waitForTimeout(VIEW_SETTLE_MS);
      }
    });
  },
  async drill(page, cdp) {
    await page.goto(`${BASE}/dashboard/analisi`, { waitUntil: 'load' });
    await page.waitForFunction(isPageSettled, { previousHeading: null, needsEuro: true }, { timeout: 30_000, polling: 100 });
    if (MOBILE) await page.locator('#analisi-spese-trigger').click();
    // The Scheda opens on the first category with subcategories: its rows are the drill's way down.
    const categories = page.getByRole('list', { name: 'Spese per categoria' }).filter({ visible: true }).first();
    await categories.waitFor({ state: 'visible', timeout: 30_000 });
    await categories.getByRole('button').first().click();
    const subcategories = page.getByRole('list', { name: /^Sottocategorie di / }).filter({ visible: true }).first();
    await subcategories.waitFor({ state: 'visible', timeout: 30_000 });
    const category = (await subcategories.getAttribute('aria-label')).replace(/^Sottocategorie di /, '');
    const crumbs = page.getByRole('navigation', { name: 'Posizione nel drill-down' }).filter({ visible: true }).first();
    await page.waitForTimeout(1_000);
    return record(page, cdp, 4, async () => {
      for (let i = 0; i < 2; i++) {
        await subcategories.getByRole('button').first().click();
        await page.waitForTimeout(VIEW_SETTLE_MS);
        await crumbs.getByRole('button', { name: category, exact: true }).click();
        await subcategories.waitFor({ state: 'visible', timeout: 10_000 });
        await page.waitForTimeout(VIEW_SETTLE_MS);
      }
    });
  },
  async nav(page, cdp) {
    await page.goto(`${BASE}/dashboard/hall-of-fame`, { waitUntil: 'load' });
    await page.waitForFunction(isPageSettled, { previousHeading: null }, { timeout: 30_000, polling: 100 });
    await page.waitForTimeout(1_000);
    const link = (name) => page.getByRole('link', { name, exact: true }).filter({ visible: true }).first();
    const switches = [
      ['Previdenza', '/dashboard/pension'],
      ['Hall of Fame', '/dashboard/hall-of-fame'],
      ['Previdenza', '/dashboard/pension'],
      ['Hall of Fame', '/dashboard/hall-of-fame'],
    ];
    return record(page, cdp, switches.length, async () => {
      for (const [name, path] of switches) {
        const previousHeading = await page.evaluate(() => document.querySelector('main h1')?.textContent ?? null);
        await link(name).click();
        await page.waitForURL(`**${path}`);
        await page.waitForFunction(isPageSettled, { previousHeading }, { timeout: 30_000, polling: 100 });
        await page.waitForTimeout(800);
      }
    });
  },
};

/** In the page: no skeleton left in `main` — a period's read has landed and the tiles are back. */
function isGridSettled() {
  return !document.querySelector('main [data-slot="skeleton"]');
}

/**
 * In the page: the route's own heading is there (a different one than `previousHeading`, after a
 * client navigation), and no skeleton is left in `main`. The mount scenario also wants a euro
 * figure — «data on screen», the benchmark's `data` mark.
 */
function isPageSettled({ previousHeading, needsEuro = false }) {
  const main = document.querySelector('main');
  const heading = main?.querySelector('h1')?.textContent ?? null;
  if (!heading || heading === previousHeading) return false;
  if (main.querySelector('[data-slot="skeleton"]')) return false;
  return !needsEuro || /\d\s?€/.test(main.textContent || '');
}

/**
 * A full load of `href`, recorded from before its first byte. The login has already landed on the
 * Panoramica; its reads are given 2 s to reach the persisted cache, so every run starts from the
 * same record (the Panoramica's own mount then restores it, as a revisit does).
 */
async function mountRoute(page, cdp, href) {
  await page.locator('main h1').filter({ visible: true }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  // Registered after installRenderProbe, so it runs after it on the NEXT document: the probe
  // exists and starts recording before React DOM is evaluated.
  await page.addInitScript(() => {
    window.__census.recording = true;
  });
  await page.goto(`${BASE}${href}`, { waitUntil: 'commit' });
  await page.waitForFunction(isPageSettled, { previousHeading: null, needsEuro: true }, { timeout: 30_000, polling: 100 });
  await page.waitForTimeout(1_000);
  // CDP's counters belong to the DOCUMENT and start from zero on a full navigation (measured
  // 2026-10-08: LayoutCount 5 → 2 across a reload), so the new document's own reading is the delta.
  const zero = Object.fromEntries(CDP_METRICS.map((name) => [name, 0]));
  return collect(page, cdp, 1, zero);
}

function runnerFor(name) {
  if (name.startsWith('mount:')) return (page, cdp) => mountRoute(page, cdp, name.slice('mount:'.length));
  return scenarioRunners[name];
}

async function runScenario(browser, name) {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: MOBILE, hasTouch: MOBILE });
  const page = await context.newPage();
  await page.addInitScript(installRenderProbe);
  try {
    await login(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    return { scenario: name, ok: true, ...(await runnerFor(name)(page, cdp)) };
  } catch (error) {
    return { scenario: name, ok: false, error: String(error?.message ?? error) };
  } finally {
    await context.close();
  }
}

function median(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

async function assertReachable(url, hint) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch {
    console.error(`[perf:census] ${url} does not answer: ${hint}`);
    process.exit(1);
  }
}

for (const name of SCENARIOS) {
  if (!runnerFor(name)) throw new Error(`--scenario: «${name}» is not one of mount, ${Object.keys(scenarioRunners).join(', ')}`);
}
await assertReachable(`${BASE}/login`, 'start `npm run perf:serve` (after `npm run perf:build -- --profile`).');
await assertReachable('http://127.0.0.1:9099', 'start `npm run emulators` and seed the account (`npm run mirror:seed -- <email>`).');

const browser = await chromium.launch();
const runs = [];
for (const name of SCENARIOS) {
  for (let i = 0; i < RUNS; i++) {
    const r = await runScenario(browser, name);
    runs.push(r);
    console.log(r.ok
      ? `[${name} ${i + 1}/${RUNS}] commits=${r.commitsPerUnit} rendered=${r.renderedPerUnit} renderMs=${r.renderMsPerUnit ?? '-'} layout=${r.layoutPerUnit} style=${r.recalcStylePerUnit} script=${r.scriptMs}ms task=${r.taskMs}ms long=${r.longTasks}/${r.longTaskMs}ms`
      : `[${name} ${i + 1}/${RUNS}] FAILED ${r.error}`);
  }
}
await browser.close();

// Medians per scenario; «per unit» = per key, per switch (tabs, nav) or per load (mount).
const FIELDS = ['commitsPerUnit', 'renderedPerUnit', 'renderMsPerUnit', 'layoutPerUnit', 'recalcStylePerUnit', 'scriptMs', 'layoutMs', 'recalcStyleMs', 'taskMs', 'longTasks', 'longTaskMs'];
const table = SCENARIOS.map((name) => {
  const ok = runs.filter((r) => r.scenario === name && r.ok);
  return { scenario: name, runs: ok.length, ...Object.fromEntries(FIELDS.map((f) => [f, median(ok.map((r) => r[f]))])), topNames: ok.at(-1)?.topNames ?? [] };
});
console.log(`\nperf:census${LABEL ? ` «${LABEL}»` : ''} — medians of ${RUNS} (per key; per switch for tabs and nav; per load for mount)`);
console.table(table.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'topNames'))));
for (const row of table) console.log(`${row.scenario}: ${row.topNames.map(([n, c]) => `${n}×${c}`).join(', ')}`);
writeFileSync(OUT, JSON.stringify({ label: LABEL, at: new Date().toISOString(), base: BASE, viewport: VIEWPORT, runs, table }, null, 2));
console.log(`\n→ ${OUT}`);
