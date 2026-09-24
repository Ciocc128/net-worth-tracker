# CLAUDE.md - Net Worth Tracker (Lean)

> **Read [WORKFLOW.md](WORKFLOW.md) before starting**: standing session rules (one branch and one
> commit per session, never commit without approval, answer in Italian) and the guided-verification
> protocol. A new rule stated in a session is added there, in that session's commit.

## Project Overview
Next.js app for Italian investors: net worth, assets, cashflow, dividends, performance metrics and long-term planning on Firebase.

**This file is the INDEX**: "what it is + where it lives", nothing more — keep it well under 20.000 characters; it is injected into every turn. Repo-wide conventions and gotchas live in **AGENTS.md**; the per-area rules and traps in **`doc/guide/<tema>.md`** (one file per page/tab/subsystem — the feature index below points to each, and AGENTS.md § 3 carries a stub apiece; the test harness is `doc/guide/e2e-emulatori.md`, its two stubs in AGENTS.md § 5); the aesthetic spec in **DESIGN.md**; env/emulators/Playwright in **SETUP.md**; users and positioning in **PRODUCT.md**. Session rules and the guided-verification protocol in **[WORKFLOW.md](WORKFLOW.md)** (see the note at the top).

> **Language**: this file and AGENTS.md are in English. Italian is reserved for user-facing UI text. Page and feature names stay Italian, because they are the labels the product shows: Panoramica, Patrimonio, Cashflow, Analisi, Rendimenti, Allocazione, Storico, Previdenza, Impostazioni.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic.
- `tsc` clean; **180 files / 4219 tests** green + **33 Playwright spec files** (108 tests, incl. 5 auth setups; last full run 2026-09-23, 3,5 min: 108 green, `modal.origin` included; the FIRE pair re-run green on 2026-09-24). Run Vitest under `TZ=Europe/Rome` too — every date fixture sits at noon, which structurally hides timezone bugs.
- Latest (2026-09-24): **FIRE › Calcolatore — la terza vista del Traguardo, «Distribuzione», e le due code.** L'anno
  FIRE dei 1000 percorsi del ventaglio (`fireYears`, calcolato da sempre e letto da nessuno) come istogramma per anno
  solare (`binYears`, larghezze 1/2/3/5/10, l'anno del base bordato, «oltre l'orizzonte» in grigio), tre KPI a rango
  più vicino («un percorso su dieci entro il 2045, metà entro il 2058, nove su dieci…») e la lettura con il «mai» come
  clausola propria; **la leva** (`solveSavingsForTail`: bisezione sul risparmio annuo, ~13 ri-esecuzioni a SHOCK COMUNI
  — il ventaglio ora è seminato, `createSeededRandom`/`FAN_SEED` — arrotondata ai 100 € e RI-ESEGUITA, cap
  `resolveLeverCap`, la coda fortunata nominata perché il risparmio pesa su entrambe); **«dal FIRE in poi»** (secondo
  registro nel motore, `retirements`: dal proprio anno FIRE il percorso preleva le spese inflazionate con gli STESSI
  rendimenti, orizzonte 90 anni, `paths` intatti → il test di coerenza resta byte-identico). Monte Carlo › Distribuzione
  ha la vista «Esaurimento» (`failureYearBins`: i falliti per anno, prima uno 0 € nel primo bin). Primitiva
  `components/ui/histogram-bars.tsx` (+ `year-bars.tsx`, `FinalValueBars` adattatore; etichette diradate sotto 400 px
  di plot). **Due bug trovati e chiusi**: il ventaglio sotto il vincolo pensione puntava al numero FIRE SENZA vincolo
  mentre il verdetto nominava quello ponte (sul mirror: «meno di metà entro il 2066» sotto «FIRE nel 2049», leva a
  67.000 €/anno) → `buildBridgeFireTargets` + `fireTargets` nel motore, coerenza CON il ponte pinnata; e il bollo sui
  conti correnti era `saldo × 0,2%` con il commento che diceva 34,20 € fissi e il test che fissava 12 € su 6.000 €
  (`lib/constants/stampDuty.ts`, `describeCosts` nomina la cifra). **Verifica**: `tsc`, lint 0, Vitest 4193 nei due fusi
  (46 test nuovi; falsificati: ordine prelievo↔rendimento, nearest-rank→floor, bollo, e la spec E2E con l'aria-label
  rotta), Playwright `fire.spec.ts` (toggle a tre viste) + `fire.mobile.spec.ts` (390 con la Distribuzione aperta)
  6/6; sonda Playwright sul mirror a 1440 e 390 (overflow 0), che ha rivelato entrambi i difetti del ponte e delle
  etichette. Estensione Chrome non connessa. **Seconda parte, «Numero FIRE più onesto»** (stessa PR): UNA regola per
  anno, `resolveFireRequirement` — spese meno le pensioni statali della Coast (nette IRPEF, datate dall'età salvata;
  senza età FUORI e dichiarato), × gross-up fiscale 1/(1 − g·τ) di `lib/utils/withdrawalTax.ts` (base dai PMC in
  euro, liquidità e fondi come base, `null` senza PMC e dichiarato), il fondo allo sblocco — sul walk Coast; il walk
  deterministico la legge per anno e la scrive in `*FireNumber` (la tratteggiata del grafico È il target), il
  ventaglio prende quelle righe (`resolveFanFireTargets`, `buildBridgeFireTargets` rimossa), il registro pensione e
  il Monte Carlo prelevano al netto delle pensioni e al lordo della tassa (`withdrawGross`, base consumata in
  proporzione), What If porta gli stessi input con la base che si muove con l'evento, Coast lo stesso gross-up al
  target. Base di calcolo con due righe nuove (Pensioni statali · Tasse sui prelievi), didascalia del Traguardo,
  verdetto, footer Scenari e «dal FIRE in poi» dichiarano cosa c'è dentro. Vitest 180 file / 4219 (26 nuovi;
  falsificati: gross-up tolto, moltiplicatore forzato a 1, pensioni ignorate — rossi in 3, 1 e 2 punti).
  doc/guide/fire.md, fire-coast.md, fire-what-if.md, fire-monte-carlo.md, patrimonio.md.

## Architecture Snapshot
- App Router; protected pages under `app/dashboard/*`.
- `lib/services/*` (service layer) → pure `lib/utils/*` → `lib/server/*` (server-only). React Query for caching/invalidation.
- Italy timezone helpers in `lib/utils/dateHelpers.ts`.
- Convention: extract logic into pure, tested `lib/utils`/`lib/services` functions; keep Firestore-coupled code thin.

## Key Features (Active)
One line per area: the question it answers, then where it is described. *What the user sees* → README.md; *repo-wide rules* → AGENTS.md; *an area's rules, files and blind spots* → `doc/guide/<tema>.md`; *the aesthetic* → DESIGN.md.

- **Shell**: skip link · compact `PageHeader` · `PageTabBar` · `PageContainer` (1920) + `TileGridSkeleton` · sidebar · bottom pill + «Altro» drawer; a tile's eyebrow is an `<h3>`. DESIGN → §5; AGENTS → *Navigation*.
- **Shared account · Demo mode**: a second user as full co-owner (viewer `user.uid` ≠ owner `ownerId`); the demo auto-logs in from the landing and `useDemoMode()` gates every mutation. doc/guide/account-condiviso-demo.md.
- **Landing**: the Panoramica for someone with no data, the app's real tiles on a declared sample profile. doc/guide/landing.md.
- **Accesso e Registrazione**: one 420px tile, a verdict generated from the registration state, Italian errors only. doc/guide/accesso-registrazione.md.
- **Panoramica**: «come va il mese?» — rule-generated verdict over a tile grid on `GET /api/dashboard/overview`. doc/guide/panoramica.md.
- **Patrimonio**: the portfolio's verdict (its driver an instrument) over six tiles; Strumenti is the management table. doc/guide/patrimonio.md.
- **Registro operazioni**: BUY/SELL/ADJUSTMENT with cash settlement in cents (a sell net of the withheld tax), the asset doc rebuilt by full replay. doc/guide/registro-operazioni.md.
- **Cashflow › Tracciamento**: «come sta andando il mese?» on one period axis. doc/guide/cashflow-tracciamento.md; shared rules (sign, recurrence, a linked account moving on each row's own date, CSV import, grouping, Sankey) in doc/guide/cashflow.md.
- **Cashflow › Budget**: «sto rispettando il budget?», no axis, the ceiling historicised by the daily cron. doc/guide/cashflow-budget.md.
- **Centri di Costo** (optional): «quanto sta costando il progetto?», no axis and no pace. doc/guide/centri-di-costo.md.
- **Cashflow › Divisione** (optional): «quanto è costato in comune, e quanto resta a ciascuno?» — il residuo è di denaro che si è mosso, il calendario è una clausola a parte. doc/guide/cashflow-divisione.md.
- **Analisi**: «dove vanno i soldi, e cosa è cambiato?» on a four-mode axis; the app's only Sankey. doc/guide/cashflow-analisi.md.
- **Dividendi**: «quanto rendono i miei flussi?»; received and announced never one figure; BTP Italia and BTP€i coupons; a payment credits the instrument's account, else the default, never an arrear. doc/guide/cashflow-dividendi.md.
- **Rendimenti**: «quanto rende il portafoglio, e rispetto a cosa?» — configurable base, six EUR benchmarks, per-instrument attribution; below a year the hero is the period's return, Contributi is the ONE capital the formulas neutralise. doc/guide/rendimenti.md.
- **Storico**: «come sono arrivato qui?» — wealth growth, contributions included; the Driver splits it into savings, measured market, sale taxes, mortgage, pension contributions and the rest, as a ledger that adds up to the euro behind each year. doc/guide/storico.md.
- **Allocazione**: «sono allineato al piano, e cosa faccio con i prossimi soldi?» — i tre piani nominano gli STRUMENTI da scambiare e prezzano la ritenuta; «prelevare X» significa X in mano. doc/guide/allocazione.md.
- **Previdenza**: «il fondo sta lavorando?» per contributor, the value typed from the statement ON the page. doc/guide/previdenza.md.
- **FIRE**: Calcolatore, Coast FIRE, What If, Monte Carlo and Obiettivi, one verdict each. doc/guide/fire.md (+ fire-coast, fire-what-if, fire-monte-carlo, fire-obiettivi).
- **Assistente AI**: the verdict IS the context; SSE streaming, memory, goal proposals; flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, blocked in demo. doc/guide/assistente.md.
- **Hall of Fame**: «quali sono stati i mesi e gli anni migliori?», no axis. doc/guide/hall-of-fame.md.
- **Impostazioni**: six tabs, no verdict, one Save per page with the save state per tab (a dot, a bottom bar, «Annulla modifiche»); the write fan-out in doc/guide/impostazioni.md § Settings — the FIVE places.
- **States**: loading · nothing recorded · measured zero · failed read, on 20 surfaces. doc/guide/stati.md; DESIGN → The Absence-Has-Three-Names Rule.
- **Dialogs and forms**: 40 modals on one vocabulary in `ResponsiveModal`; row deletes arm in the row. doc/guide/dialog.md; DESIGN → The Modal-Is-A-Tile Rule.
- **Periodic emails · budget email · PDF export**: rule-generated verdict first, AI comment second; every hex from `printTokens.ts`. doc/guide/email-pdf.md; DESIGN → The Out-Of-DOM Token Rule.
- **Themes**: twelve theme blocks × nine chart slots through `useChartColors`, every block held to the distinctness floor by `__tests__/chartPaletteDistinctness.test.ts`. doc/guide/temi.md.

## Testing
- Vitest: `npx vitest run <file>`, `npm test -- <file>`, `npx tsc --noEmit`. New tests in `__tests__/`; prefer pure functions over Firestore-coupled code.
- **Phantom `tsc` errors** clustered in `e2e/` and `lib/utils/expenseImport.ts` after a branch switch: run `npm install` first (AGENTS → *Commands*).
- **Dev/test without production data**: Firebase Emulator Suite (`npm run emulators` + `emulators:seed` + `dev:emulator`), requires a JDK. SETUP.md → Step 6. **The owner's real data for a tour**: `npm run mirror:seed -- <email>` (production read-only → emulators as `mirror@example.com`, nothing on disk) and `npm run mirror:remove` at the end — the account is the standard, the data is re-read every time (WORKFLOW.md § 3).
- **Browser (E2E)**: Playwright, `npm run test:e2e` with the emulators up (needs **Java ≥ 21**); app on :3100 with an isolated build dir. Accounts and fixtures: SETUP.md → Step 7; gotchas: doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright).

## Data & Integrations
Firestore client + admin · Yahoo Finance (prices, benchmark history) · Borsa Italiana scraping (Italian bonds, dividends) · Frankfurter (FX) · FRED (`FRED_API_KEY`, series ECBDFR) · Anthropic (`claude-sonnet-5` analysis + assistant, `claude-haiku-4-5` extraction).

## Known Issues (Active)
Only what crosses areas; an area's blind spots — the behaviours that look like bugs and are not — close its `doc/guide/<tema>.md` (§ Per-page blind spots). The demo account's manual setup is in README.md → Known Issues, the shared account's prerequisites in SETUP.md → Step 5b.

- **Two Sonnet generations coexist** (`lib/constants/aiModels.ts`): the Rendimenti analysis runs on `claude-sonnet-4-6`, the assistant and the emails on `claude-sonnet-5`. Aligning them changes cost and output, so it is a product decision still to take; until then the four constants stay distinct and each modal reads its OWN route's.
- **Two deliberate dependency pins keep advisories open.** `firebase-admin` at `^13.6.0` (@14 pulls pure-ESM `jose@6` → `ERR_REQUIRE_ESM` on Vercel; 8 moderate `uuid` advisories stay) and `next` at `~16.2.12` (16.3.0 breaks Vercel at `onBuildComplete`; 2 HIGH libvips advisories via `sharp`, low exposure). **Unpin next and re-run `npm audit fix` once Vercel digests 16.3.x.**
- **Per-page blind spots** — the behaviours that look like bugs and are not — live at the end of each `doc/guide/<page>.md` (one *Per-page blind spots* section per page). Moved there verbatim from this file's Known Issues; CLAUDE.md keeps only the cross-cutting ones.
- **Three Vitest cases fail under `TZ=UTC`** (`budgetUtils` › crossing day, `pensionSummary` › value age, `tracciamentoSummary` › `isScheduledRow`), on a clean `develop` too (checked in a worktree, 2026-09-20): they read «today» by Italian calendar day against fixtures built in the process timezone. The suite's two timezones are the machine's and `Europe/Rome`; a CI in UTC would see them red.
- **Every controlled `ResponsiveModal` opened without `returnFocusTo` drops focus on `body` when it closes** (Radix cancels its own restore when there is no `Trigger`; doc/guide/dialog.md). Rendimenti's two are fixed; the others take the opener when they are next touched.
- **`--muted-foreground` measures 4,46:1 on `--background` in the default LIGHT theme** (measured in the browser,
  2026-09-21, on the compact `PageHeader`'s description) — just under the AA floor of 4,5:1, on every page that uses
  the shell, not on one. It is a theme-token change with a twelve-block blast radius, so it belongs to a
  `doc/guide/temi.md` session, not to a page's.
- **`e2e/modal.origin.spec.ts` is intermittent in a FULL run** (2026-09-21): it failed twice in a row and then passed
  twice with the same code — once with `components/ui/period-picker.tsx` reverted and once with it restored, so that
  change is not the cause (and it failed once more in the full run of 2026-09-22, green alone right after). When it fails, Rendimenti's «Periodo personalizzato» button has moved **23,4px** between the
  `boundingBox()` the spec takes and the origin captured at the click: a late reflow under suite load, roughly the
  height of the custom-period chip row. It passes alone, and in the `desktop` project alone. Not reproduced on demand,
  so not yet fixed — re-read this before trusting a single red run of it.
- **The icon rail's 44px targets are measured at 1440 with a mouse**; no fixture covers a ≥1440px tablet in landscape.
- **Two shared primitives stay below 44px on touch, on every page**: the `PageTabBar` pill below 1440 (inactive tabs
  38×32, icon only) and the `Switch` (36×20; its row's `Label` is clickable, the thumb alone is not). Measured on
  Impostazioni, 2026-09-22; left alone there because enlarging either changes every page at once.

## Key Files
Cross-cutting entry points only: each area's files open its guide (`doc/guide/<tema>.md` § Files), every pure module has
`__tests__/{module}.test.ts`, every page its `e2e/{page}*.spec.ts` where one exists.
- **Shell**: `app/dashboard/layout.tsx` (`<main>` = `page-main`), `app/dashboard/template.tsx`, `components/layout/{Sidebar,BottomNavigation,SecondaryMenuDrawer,SceneLink,PageHeader,PageTabBar,PageTabs,PageContainer,ThemePicker,LogoutDialog}.tsx`, `lib/utils/viewTransition.ts` (the ONE `startViewTransition`, `data-vt` scoping) + `lib/hooks/useSceneNavigation.ts` (the page scene), `lib/utils/themeTransition.ts`, `components/ui/sidebar.tsx` (`SIDEBAR_WIDTH_ICON`), `lib/constants/navigation.ts` (the ONE source of the nav arrays); tile primitives `components/ui/{tile,tile-method-note,series-legend,narrative-text,ranked-rows,tile-grid-skeleton,page-verdict}.tsx`, `lib/hooks/useRovingFocus.ts` (a list as ONE Tab stop), `lib/utils/narrative.ts` (`Narrative`, `VerdictTone`, `PageVerdictModel`)
- **Shared primitives / utils** (each the single source of its rule): `components/ui/{composition-list,composition-bar,segmented-pill,drill-breadcrumb,chart-hover}.tsx`; `lib/utils/formatters.ts` · `metricColors.ts` (`getMetricValueColor`) · `assetPricing.ts` (`requiresManualPricing`) · `assetLiquidity.ts` · `expenseTypeTransition.ts` · `firestoreData.ts` (`removeUndefinedDeep`) · `dateHelpers.ts` (`endOfMonthBound`, `getItalyDateIso`, `isItalyDayAfter`) · `spendingProjection.ts` (the ONE month-end projection) · `recurrenceDates.ts` (the ONE source on recurrence)
- **E2E**: `playwright.config.ts`, `e2e/*.ts`, `e2e/global-setup.ts`, fixtures `scripts/{seedEmulator.ts,seedPensionE2E,seedAnalisiE2E,seedCoastFireE2E,seedCostCentersE2E}.mts`; scripts `test:e2e`/`e2e:seed*`/`dev:e2e`; the production mirror `scripts/mirrorProdAccount.mts` (`mirror:seed`/`mirror:remove`)


## Design Context
Authoritative aesthetic spec: **DESIGN.md** — hand-maintained, **never regenerate it**; its YAML frontmatter is the normative layer read by the impeccable detector, `.impeccable/design.json` only the extensions sidecar (its narrative is DESIGN.md verbatim — script-check before rewriting it; its `extensions.motion` is read from the CODE). Product truth: **PRODUCT.md**. Rules are cited by name (DESIGN → **The X Rule**) and enforced by `components/ui/{tile,page-verdict,responsive-modal}.tsx`, `statesNarrative.ts` and `printTokens.ts`. A change to a page starts from its `doc/guide/<page>.md` and DESIGN.md's named rules. History: `git log`.
