# FIRE › Dopo il FIRE (Monte Carlo)

> **When to open this guide** — you are touching `components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*` (`tiles/*`, `MonteCarloFanChart`, `FinalValueBars`, `ScenarioOverlayChart`, `MonteCarloDettaglio`), `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts` or `lib/services/monteCarloService.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `doc/guide/fire.md` § *Files*. No Playwright spec covers this tab.

> **Shared with Proiezione** (T4, 2026-10-04): the Allocazione block of the Parametri tile is `components/monte-carlo/WeightsFields.tsx` (ids `mc-weight-*` kept), `MonteCarloFanChart` takes optional `zeroLine` / `referenceLine` / `markedCalendarYear` (the Monte Carlo passes none: unchanged), and the final-value binning is `lib/utils/valueHistogram.ts` (`createDistribution` calls it). The accumulation-only tab is `doc/guide/fire-proiezione.md`.

## FIRE › Dopo il FIRE (Monte Carlo) — a verdict over tiles (`components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*`, `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts`)

- **T5 «Dopo il FIRE» (2026-10-05, doc/montecarlo/README.md § 12, DF1–DF9)** — the tab is named «Dopo il FIRE» (tab bar, verdict `ariaLabel` «Verdetto su Dopo il FIRE», Proiezione's Dettaglio, landing, Impostazioni, Parametri of the Calcolatore); «Monte Carlo» stays the NAME OF THE METHOD (aside of Probabilità «… simulazioni Monte Carlo …», title «Dettaglio · Monte Carlo», Impostazioni › Simulazioni). `value: 'montecarlo'`, the file names and the `mc-*` ids did not change.
  - **Where it starts (RD1–RD4)**: `MonteCarloParams.startYear` (T, years from today; absent or 0 = «if I stop today», the engine of before FLOAT FOR FLOAT, S10 and A-T1 pin it). `ledgerSchedule` restarts the price clock at T: pensions `fromYear ≤ T + s` (amount `(1+π)^s`), unlocks `u − T` for `u > T` at `X / (1+π)^T` (an unlock at or before T is already in the capital: discarded, the start inflows are empty), dated-flow tables built on `T + N` years and read at `T + s` ÷ `(1+π)^T` (`needFor(T)`, a «dal FIRE» flow opens the year after the FIRE year, no `start` lump). The draws do not change: a run consumes `7 × 2 × N` uniforms whatever T is. `initialPortfolio` and `withdrawalTax.basisToday` are the figures AT T in today's euros: do not mutate a `params` after its first replay (WeakMap cache) and never put a nominal figure in them.
  - **The FIRE year is the Calcolatore's, on the SAVED plan**: the tab calls `useWhatIfBaseline()` (same query keys: no extra fetch), `runBaselineProjection(baseline)` (`whatIfService.ts`, the What If's «prima» and the Obiettivi's «Effetto sul FIRE» read the same walk) and `resolveFireStart` (`lib/utils/fireStart.ts`): `{ kind: 'fire', years, calendarYear, ageAtFire, capitalNominal, capitalToday, gainShare }` or `{ kind: 'today', reason: 'already' | 'never' | 'no-plan' }` (DF6: the selector is absent and the Parametri line says why). `K_T = baseNetWorth_T / (1+π_b)^T`, the SAME `K_T` and `T` for Orso, Base and Toro (DF3: the scenarios differ only after the FIRE; the card in Parcheggio «simulazione in due fasi» is the faithful version). `calculateFIREProjection` rows carry `baseCostBasis` ONLY when the walk models the withdrawal tax (RD3: gain share at the FIRE year, not today's).
  - **Quando smetto** (first field of Parametri, `SegmentedPill` radio «Al FIRE (2031)» · «Oggi», ≥ 44px on touch): the capital shortcut becomes «Al FIRE · 812.000 €», the horizon defaults to `defaultWithdrawalYears(age, T)` = `clamp(90 − (age + T), 1, 60)`, 30 without age (RD5; it follows the mode until typed, `yearsTouchedRef`); changing the mode re-seeds the capital (a typed value wins only until then) and makes the last run stale (`startYear` is in `PLAN_FIELDS`). The first auto-run is «Al FIRE» when there is a FIRE year; the form is seeded only after the baseline has loaded. The run keeps ITS start (`runCtx` from `runParams.startYear`): a mode changed since is stale, never a re-read of the figures.
  - **Euro di oggi (RD6, DF7)**: `deflate(value, s, π)` / `deflatePercentiles` in `monteCarloSummary.ts`, applied to the final percentiles and the median, the fan, the overlay (each scenario with ITS inflation, `ScenarioInflation`), the percentile rows (+ the `p50Nominal` column, the only nominal figure) and the scenario notes. Probabilities, failure counts and years, the P10 depletion year and the Spesa sostenibile do NOT change (the ruin threshold is zero in every unit, A-T10). `MonteCarloContext` gained `startYears` and `inflationRate`; an absent `inflationRate` keeps the nominal reading (old tests, and the narrative's «di oggi» follows `run.todayEuros`).
  - **Grid (DF9)**: Spesa sostenibile 12 · Probabilità 8 | Scenari 4 · Parametri 12; phone/tablet Spesa → Probabilità → Scenari → Parametri; the verdict names the start («Smettendo nel 2031 (a 45 anni) con 812.000 € di oggi, nel 63% …» / «Smettendo oggi con 700.000 €, …») and the Spesa sostenibile sentence comes right after the first one, before leverage, scenarios and bridge. The **Distribuzione tile and its «Esaurimento» view are gone** (DF8: `DistribuzioneTile`, `describeDistribuzione*`, `describeEsaurimento*`, `histogram*`, `failureYearBins`, `failureFirst/LastCalendarYear` out of `MonteCarloRun`; `HistogramBin` stays exported for the Proiezione's `FinalValueBars`); the mean year of depletion stays in Probabilità' reading, the percentiles every 5 years in the Dettaglio. Where the bullets below still say Probabilità 5 · Distribuzione 4 · Scenari 3 or describe the Distribuzione, read them as superseded by this block.
  - **Measured (2026-10-05, Node/vitest in the cloud container, 10.000 paths × 3 scenarios + Spesa sostenibile, 60/40, tax + one pension)**: 30 years ≈ 2,3 s (runs 1,1 + replays 1,3), 45 years (the new default at 40 y/o, FIRE in 5) ≈ 3,2 s, 50 years ≈ 3,9 s. The default horizon of 90 years of age pushes the default run just above the 3 s the spec set as the line to report: nothing was changed (the per-path-threshold variant, ~3× cheaper, is the lever noted under S1).

- **The weights are seeded from `useFireAssumptions`** (2026-10-03, doc/fire-ipotesi/README.md L1): the page's ONE reading of RP4 (Allocazione targets, else the
  portfolio held, else 60/40) — the same the Calcolatore's Ventaglio now simulates. The two buttons «Importa dai target / dal portafoglio di oggi» keep their own seeds.
  The cost of every run is `portfolioCost(the run's weights)` (`annualCostRate`, taken off after the return, before the withdrawal; the unleveraged Base keeps it, the weights being brought to 100): moving the weights re-prices it (doc/guide/fire.md, RC1–RC5). The «Ipotesi usate» line above the verdict says the weights' origin; it does not follow a hand edit (the Parametri tile says «a mano»).
  **Since L2** it also carries the plan's expenses and `K` (the same string as the other tabs), the withdrawal is seeded with the plan's expenses
  (`resolvePlanExpenses`, the 30.000 € fallback only while there are none) and the withdrawal-tax basis is `K`'s (`assumptions.capital.taxProfile`).
  The tab waits for the Cashflow read too: a failed read is the tab's `ErrorNotice`.

- The tab answers «quanto è probabile?» and computes nothing: `runMonteCarloSimulation` runs, `monteCarloSummary.ts` reads the run (the base
  scenario's horizon dated in years and in age, the first year the 10th percentile touches zero, the final percentiles of ALL simulations, the
  histogram with the median's bin, the three scenarios, the Dettaglio's overlay and percentile rows, the plan as typed), `monteCarloNarrative.ts`
  puts it into words. **The median the page reads is the last percentile row's p50** — `results.medianFinalValue` is the median of the SURVIVORS
  only and overstates a plan that fails often; it stays in the payload, no surface prints it.
- **ONE run = the three scenarios** (Bear · Base · Bull, `buildParamsFromScenario` over the shared plan): the verdict, Probabilità and
  Distribuzione read Base, the Scenari tile reads all three. The «Simulazione singola | Confronto scenari» toggle went with the mode it switched;
  the single form's market fields ARE the Base scenario's, and the plan's `params` carry `getDefaultMarketParameters()` only as a placeholder
  every run overrides.
- **Auto-run once, explicit afterwards** (The Stale-Run Rule): the seeded plan runs on its own (`didAutoRunRef`, inside a `setTimeout(0)` —
  react-hooks/set-state-in-effect); every later run is «Esegui». A run keeps the inputs it was made with (`MonteCarloRunState.inputs`) and
  `haveRunInputsChanged` compares the PLAN fields, the scenarios and the inflows — never the single form's market fields — so the Parametri footer
  says «I risultati sopra usano i parametri dell'ultima esecuzione» in the warning tone while every tile keeps the last run. A 30.000-path run on
  every keystroke was one alternative; a silent re-run that changed the verdict under the reader's eyes was the other.
- **Spesa sostenibile (S1, 2026-10-04, doc/fire-ipotesi/README.md § 10)** — the sixth tile, «Quanto posso prelevare?»: the largest annual withdrawal
  (today's euros, multiples of 100 €) that lasts the horizon in 80 / 90 / 95% of the paths, for Bear, Base and Bull; the hero is Base 90% with its monthly
  and its share of the capital, and the verdict gains one sentence in three forms (typed withdrawal ≤ W90 «Per restare al 90% potresti prelevare fino a…»,
  above it «Per tornare al 90% il prelievo dovrebbe scendere a…», no withdrawal at all «Con questa leva nessun prelievo arriva al 90%…»), no tone of its own.
  Grid: desktop Probabilità 5 · Distribuzione 4 · Scenari 3, then **Spesa sostenibile 12** (hero left, 3 × 3 table right on a container query), then Parametri;
  phone/tablet Probabilità → Spesa sostenibile → Distribuzione → Scenari → Parametri. Locator: `role=region`, `aria-label` «Spesa sostenibile».
  - **The factors are drawn once, the withdrawal is replayed** (RS1–RS2): `monteCarloService.ts` splits the old `runSingleSimulation` into `drawPathFactors`
    (`1 + portfolioReturn` of every year, ALL years drawn even after a failure, so the uniform order is unchanged) and `runWithdrawalLedger` (inflow → return →
    withdrawal). `runMonteCarloSimulation(params, { keepFactors: true })` returns `factors` (`n × N` Float64Array, row per path); `countSuccesses(factors, n,
    params, W)` replays a withdrawal without drawing, so `success(W)` equals a fresh run's `successCount` at that `W` EXACTLY (S5, pinned in
    `monteCarloService.test.ts`) and the seeded run is the same float for float as before the split (S10, `monteCarloSeededRegression.test.ts`, a snapshot taken
    on the code before the refactoring, leverage ruin included). The tab asks for `keepFactors` on the three scenario runs, NOT on the unleveraged Base.
  - **The figures are the LAST run's** (The Stale-Run Rule): `summarizeSustainableSpending` runs inside `runScenarios` (so the running state covers it), lives in
    `MonteCarloRunState.sustainable`, and the factors are dropped from the results right after (`n × N × 8` bytes a scenario: 2,4 MB at 10.000 × 30, 4 MB at
    10.000 × 50, ~12 MB for the three at 50 years, held only for the instant of the solve).
  - **RS3** (`lib/utils/sustainableWithdrawal.ts`, pure): bisection over the multiples of 100 € between 0 and a bracket doubled from the capital until
    `success < p`, then the printed figure is re-verified and lowered while it misses the threshold. `success(0) < p` (leverage ruin above `1 − p`) = «nessun
    prelievo» in that cell. The pure replay caches the plan's yearly schedule (inflation index, pensions, inflows) in a `WeakMap` keyed by the `params` object:
    **do not mutate a `params` after its first replay**.
  - **Measured (2026-10-04, Node, 10.000 paths, tax + 2 asset classes, the cloud container)**: the three bisections of ONE scenario take ~0,40 s at 30 years and
    ~0,67 s at 50, so the nine figures ~1,2 s and ~2,0 s on top of a run that takes ~0,36 s (30 y) / ~0,58 s (50 y) per scenario. The first version (bisection on
    euros, `Math.pow` and the pensions recomputed every step) took 1,7 s per scenario — the integer bisection and the cached schedule are what bring it under 0,5.
    The spec's estimate («decine di ms») was wrong by two orders of magnitude: each `success(W)` is a full replay of `n × N` ledger steps, ~14 of them per level.
    Not yet moved off the main thread; if the Esegui ever feels slow, the per-path-threshold variant (one bisection per path, the three quantiles read at once) is ~3× cheaper.

- **The form is strings, the run is numbers**: the tab owns `MonteCarloForm` (as FireParametri's form) and derives `MonteCarloParams` with
  `parseItalianNumber` (it-IT amounts, plain numbers, a hand-typed «12.5») and `formatInputAmount`; the «Totale / Liquido» shortcuts write the
  string. The seed happens ONCE (`didSeedRef`) from the portfolio net of the locked funds, `plannedAnnualExpenses` and
  `computeSimulatedCapital` and the weights from `seedWeightsFromTargets` / `weightsFromHoldings` (T3: the Allocazione targets first, leverage included; 60/40 when nothing is held) — a refetch never
  clobbers a typed value. Until the seeded plan has run once the tab shows the `TileGridSkeleton`; a plan that cannot run shows the verdict
  («Monte Carlo non calcolabile.») over the Parametri tile alone.
- **The market assumptions are DECLARED here, edited in Impostazioni › Simulazioni** (T1, 2026-10-03; The Declaration-Tile
  Rule): the Parametri tile prints where they come from (`describeMarketDeclaration`: valori predefiniti · salvate · migrate)
  with a link to `/dashboard/settings?tab=simulazioni`, and the tab holds no scenario state and no Save. The run's inputs
  carry the RESOLVED scenarios, so a save in Impostazioni makes the last run stale (The Stale-Run Rule) — pinned in
  `haveRunInputsChanged`. Seven weight fields (Σ = 100) replace the four; «Totale» is `K` (the seven classes net of the closed
  pension funds) and «Liquido» its liquid part — **since K1 (2026-10-04) «Totale» is the page's capital, the PORTFOLIO plus the share of the cash to invest (`assumptions.capital`, never recomputed in the tab), and the line under «Capitale iniziale» is `describeCapitalBreakdown`** (the old «Fuori dalla simulazione» row and `describeExcludedRow` are gone). «Fuori dalla simulazione: Immobili …, Crypto …» is read-only and absent when
  nothing is left out.
- **The draw is lognormal on CAGR and volatility** (rule R1, `lib/utils/monteCarloDraw.ts`): the typed return is the median
  compound growth, the volatility the std of SIMPLE annual returns; `ln(1+r) = m + s·z`, every `r > −100%`, zero volatility
  returns the CAGR exactly (the Ventaglio's coherence test relies on it). The arithmetic mean (shown read-only in
  Impostazioni) is higher than the CAGR. The number of draws per year
  is fixed (7 classes × 2 uniforms) so T3's shared shocks hold. Defaults: `lib/constants/monteCarloMarketDefaults.ts`, the ONLY
  file the research numbers (R0) enter the code in, with a `source` per class.
- **Q1 «ipotesi reali in euro»** (2026-10-10, doc/montecarlo/README.md § 14.9, RQ0–RQ5, RQ8): the market is typed **real, in euro, one Base per class**
  (CAGR, volatility, uncertainty on the mean of the log-returns) plus ONE expected inflation; there is no Bear/Bull per class any more. The engines
  still run **nominal**: `buildMarketNumbers(overrides, anchors)` (`lib/utils/monteCarloMarket.ts`) turns the real figures into `scenarios.base` with
  `G = (1+g)(1+π)−1`, `Σ = σ(1+π)` (so changing π moves no historical class), and `scenarios.bear/bull` are a **stress per class**: every class at
  the 15th/85th percentile of ITS uncertainty, together (`exp(ln(1+G) ∓ z·u) − 1`, same dispersion) — the footer of Scenari says so, the Dettaglio
  lists what the lognormal does not model (fat tails, rates frozen, hedging cost). **Obbligazioni and Liquidità follow the ECB rates**
  (`MONTE_CARLO_FROZEN_ANCHORS`: €STR 2,439, AAA 10 anni 3,5192, SPF 2,0369, 08/10/2026; Q3 will refresh them daily), **Trend and Carry are a
  premium over the Liquidità in force** (V-D13): a written Liquidità moves both. `ResolvedMonteCarloMarket` also carries `classes` (the real
  figures with their `origin`: default · anchor · saved), `overrides` (what the user wrote), `anchors`, `hedged` (all false until Q4) and, for an old
  document, `migration`.
- **The deterministic tabs (Calcolatore, Coast, What If, Obiettivi) read the portfolio's own Bear/Bull** (RQ3, `portfolioScenarioBand` in
  `fireAssumptions.ts`): the 15th/85th percentile of the 30-year CAGR of the portfolio WITH the uncertainty on the parameter, closed form
  (`exp(m_p ∓ z·√(s_p²/30 + SE_p²)) − 1`, costs as `(1+x)·f − 1`). The Base is untouched (RP1). Checked against 100.000 seeded paths in
  `portfolioScenarioBand.test.ts` (≤ 0,1 points; the closed form ignores the non-lognormality of a leveraged portfolio, declared).
- **A saved document holds only what the user typed** (format v2, RQ8): `toMonteCarloMarketSettings(overrides, …)` drops every field equal to the
  default in force, so an improved default reaches whoever never touched it. A v1 (or the legacy field) is migrated **at read, never rewritten**
  (`migrateV1`): values equal to the old default take the new one, different ones stay, converted with the inflation they were written with (Trend/Carry
  as a premium); a hand-typed Bear/Bull is dropped and the tile says so (`bearBullDropped`). The first «Salva» of the tab writes the v2.
  **Merge writes need explicit deletions**: `setSettings`' merge branch recurses into maps, so a v2 over a stored v1 would keep the 42 numbers of
  `scenarios` and every field the user restored; `monteCarloMarketForMergeWrite` completes the v2 with `deleteField()` for every key it does not carry
  (the `targets` branch replaces the document and needs nothing).
- **S10 is pinned on parameters written in the test** (`__tests__/legacyMarketFixture.ts`, digests in `__tests__/fixtures/monteCarloSeededDigests.json`,
  relative tolerance 1e-9): a change of the defaults never moves it, and it is portable (the Mac's last-ulp difference is gone). The engines'
  tests import the fixture, not the product defaults.
- **Q2 «incertezza sul parametro»** (2026-10-10, doc/montecarlo/README.md § 14.10, RQ6): in the **Base** of every stochastic engine (Monte Carlo
  and its unleveraged twin, «Dopo il FIRE», Spesa sostenibile, which replays the Base's factors, the Ventaglio, the Proiezione) each path draws its
  own mean of the log-returns per class ONCE, before its years: `m_c + u_c·η_c` (`drawPathMeans` in `monteCarloDraw.ts`, `u` from
  `marketUncertainty(market)`), then `drawYear(plan, random, means)`. The `η` come from a **separate generator**, a fresh
  `createSeededRandom(MONTE_CARLO_PARAMETER_SEED)` per run (`parameterRandom`), so the yearly shocks never move: without uncertainty (absent or
  all 0) `drawPathMeans` returns `plan.m` and consumes nothing — the run of Q1, float for float — and the leveraged and unleveraged Base meet the
  same means and the same `ε` (A13). **Bear and Bull never receive it** (they are the RQ5 stress). The errors are independent across classes,
  declared in «I limiti». The personal SWR of «Il mio piano» (RS5) stays without it: the spec does not name it. Cost (AQ29, cloud container,
  10.000 paths × 3 scenarios × 50 years, median of 5): 2,20 s without, 2,16 s with — within the noise (7 normals per path against 350 for the years).
  The fourth S10 case pins a run with the uncertainty; the three of Q1 run without it and did not move.
- **Q3 «ancore BCE aggiornate»** (2026-10-10, doc/montecarlo/README.md § 14.11, RQ9): the daily cron (`app/api/cron/monthly-snapshot/route.ts`, its own `try`)
  calls `refreshMarketAnchorsIfStale()` (`lib/server/marketAnchorsService.ts`): €STR, AAA spot 10 years and the SPF long-run inflation are read from the
  ECB Data API (`lastNObservations=1&format=csvdata`, parser `lib/utils/ecbCsv.ts`) and written to `ecb-rate-cache/market-anchors`
  (`{ estr:{value,date}, aaa10y:{value,date}, inflation:{value,period}, fetchedAt }`; the collection's rule already reads for any signed-in user and
  writes for nobody). A second call within 20 hours downloads nothing; a value outside [−2, 15] (rates) / [−2, 10] (inflation) is discarded and a
  failed series keeps its previous value, the others update (`mergeStoredAnchors`, `lib/utils/marketAnchors.ts`). The client reads the document through
  `useMarketAnchors()` (React Query, key `['market-anchors']`, 1 h) → `toMonteCarloAnchors` (series by series over `MONTE_CARLO_FROZEN_ANCHORS`: no
  document, no permission or a failed read = the frozen figures of 08/10/2026) and EVERY consumer passes them to the resolver:
  `useFireAssumptions` → `resolveFireAssumptions({ anchors })`, `MonteCarloTab` and `ProjectionTab` → `resolveMonteCarloMarketForPortfolio(settings,
  assets, anchors)`, the Impostazioni tile (`describeAnchorLines`: value and date of each ECB figure, «non aggiornato dal …» past 10 days for the rates
  and 120 for the SPF, «valori dell'08/10/2026» for a series never read). The saved runs go stale by themselves when the anchors move (the Stale-Run
  Rule already compares the RESOLVED scenarios). Left on the frozen anchors on purpose: the Landing, the assistant's server context
  (`assistantMonthContextService`, no client read there) and the Impostazioni load that migrates a v1 (a transient reading: the first save writes the v2).
  A written inflation wins over the SPF; the rate anchors stay (AQ34).
- **Q4 «copertura del cambio»** (2026-10-10, doc/montecarlo/README.md § 14.12, RQ7): four switches (Azioni, Oro, Trend, Carry) in Impostazioni › Simulazioni ›
  Ipotesi di mercato, default none hedged. `MonteCarloMarketSettingsV2.hedged` is written ONLY with at least one `true` (`toMonteCarloMarketSettings`; a merge
  write deletes the keys turned off, `monteCarloMarketForMergeWrite`). It changes two defaults and nothing else: the volatility (`volatilityHedged` in
  `MONTE_CARLO_CLASS_DEFAULTS`, 17,15 · 17,98 · 11,00 · 10,03) and the pairs of the default matrix (`HEDGE_PAIR_RULES` → `defaultCorrelations(hedged)`, 16 combinations all
  positive semi-definite, minimum eigenvalue 0,198). The Base never moves (AQ39). A WRITTEN value stays: a typed volatility is compared with the default IN FORCE
  (so 17,15 typed under the hedge is not a choice), a custom matrix stays under any switch and `countEditedCorrelations(corr, hedged)` counts on the combination
  in force; toggling a switch carries an UNEDITED matrix to the new defaults in the tile (`withHedge`). «Ripristina default» of the market tile also clears the
  switches. The hedge cost (USD − EUR short rate) is zero on average in the model: declared. «Coperte: Trend, Carry» is the last line of the FIRE «Rendimenti» chip.
- **The classes move together through ONE correlation matrix** (T2, 2026-10-03; README § 6): 21 pairs of log-returns, the
  same for Bear, Base and Bull (D6), saved in `monteCarloMarket.correlations` ONLY when they differ from the research
  defaults (`MONTE_CARLO_DEFAULT_CORRELATIONS`), so an improved default reaches whoever never touched them. `buildDrawPlan`
  takes the Cholesky factor `L` once per run and `drawYear` multiplies `z = L·ε` (identity ⇒ `z = ε`, float for float, and the
  same uniforms are consumed). The matrix is corrected (rule R5, `lib/utils/correlationMatrix.ts`: Higham + Dykstra, then
  eigenvalues ≥ 1e-6) at the Save in Impostazioni AND silently in `buildCorrelationFactor`, so a document written elsewhere
  can never fail a run. The Parametri declaration adds «Correlazioni predefinite / personalizzate»; the correlations ride on
  the shared params, so `haveRunInputsChanged` marks a saved matrix as stale. Measured 2026-10-03 (cloud container, 10.000
  paths × 3 scenarios × 50 years): ≈1,48 s without correlations, ≈1,51 s with them — the matrix costs about 2%; the dossier's
  «under half a second» estimate was not met, the cost is the draw itself (Box-Muller on 7 classes), not the matrix.
- **Leverage, seed and the second Base run** (T3, 2026-10-03; README § 7): weights summing above 100% ARE the leverage (no separate
  field, D8). `portfolioReturn(weights, returns, spread)` (`lib/utils/monteCarloDraw.ts`) applies R4: `Σ w·(1+r) − (W−1)·(1+c)`,
  `c` = the Liquidità return drawn THAT year + `leverageSpread` (Impostazioni › Simulazioni, 2,0% default, R0 § 6); the debt term does
  not exist at `W ≤ 1`, so the unleveraged result is identical float for float (A12). A year with `1 + r_p ≤ 0` fails the path with
  `failureCause: 'leverage'`; the withdrawals running it out is `'withdrawals'` (`leverageFailureCount` on the results, carried by
  `MonteCarloRun`). **A failed path keeps drawing to the end of the horizon** (`failRun`): every path consumes exactly 7 × 2 ×
  years uniforms, which is what makes the shocks identical across scenarios and between the leveraged and the unleveraged run (A13) —
  a «shortcut» that returns early on failure breaks the comparison. The tab is SEEDED: `MONTE_CARLO_SEED`
  (`monteCarloParams.ts`), one fresh `createSeededRandom` per run, so two «Esegui» with the same inputs give the same figures. With
  `Σw > 100` the Base runs again with `w/W` and `leverageSpread: 0` on the same shocks (`results.unleveragedBase`); the verdict reads
  its success rate («Con leva 1,5× … senza leva, sugli stessi rendimenti, …»; the comparison has no tone — only the leveraged rate
  does). The weights are seeded from the EFFECTIVE targets of Allocazione (`seedWeightsFromTargets`, R6, fed by
  `resolveEffectiveTargets`), else from the notional held (`weightsFromHoldings`, also the Ventaglio's); the buttons «Usa i target» and
  «Importa il portafoglio di oggi» reload either, typing marks them «a mano». The run is blocked below 100% and above 300%. Measured
  2026-10-03 (cloud container, 10.000 paths × 50 years, default market): three scenarios ≈1,7 s unleveraged; with leverage 1,5× the
  fourth (unleveraged) run is added, ≈2,2 s; at 2,5× ≈2,4 s.
- **A legacy `monteCarloScenarios` is migrated at read, never rewritten** (R2): arithmetic mean → CAGR with the same mean and
  variance of `1+r`, the real-estate pair dropped, the classes the old field never knew take the defaults. The field stays in
  the document (upstream still writes it); `monteCarloMarket` wins as soon as it is saved. The Simulazioni tile says
  «migrate … rileggile e salva» until the reader edits.
- **The pension lock rides as inflows at today's value** (`resolvePensionLockState` → `capitalInflows`; order inflow → return → withdrawal in the
  service): the starting capital is net of the locked total, the read-only row under the amount field names each inflow, the fan draws a dashed
  muted guide at the unlock year when it is on the plot and the Probabilità footer names the step.
- **The withdrawal is net of the state pensions and gross of the tax** (2026-09-24, `MonteCarloParams.annualInflows` and `withdrawalTax`,
  doc/guide/fire.md § the tax rule): the tab dates the Coast pensions by the saved age (`calculateCoastFireNetRealAnnualPension`, base-scenario
  inflation) and reads the tax profile of everything but the locked funds, carrying its gain share onto whatever capital is typed
  (`basisToday = capital × (1 − gainShare)`). Per year: `max(0, W_t − P_t)`, both indexed on an inflation-indexed plan, then `withdrawGross` —
  the basis grows with the lump inflows and shrinks with the sales. Two read-only rows under the plan say what is in («Pensione statale: −13.000 €
  l'anno tolti dal prelievo dall'anno 34 (2060)…», «Tasse sui prelievi: ogni prelievo vende quanto serve a pagare il 26% sulla plusvalenza (40% del
  capitale oggi)») or why not («nessuna datata in Coast FIRE › Ipotesi (serve l'età)», «non stimate, nessun PMC in euro»). `haveRunInputsChanged`
  compares them too: a saved age or a new PMC is a new plan, flagged until «Esegui».
- **`createDistribution` caps the equal-width bins at the 95th percentile** (2026-08-26) and the last bin takes the tail to the maximum
  (`from`/`to` on every bin, the last one closed on `to`): bins stretched to a ten-times-the-median outlier left nine of ten empty on the first
  screenshot. The Distribuzione footer names both bounds; the bars are hand-written SVG (`FinalValueBars` over the shared `HistogramBars`
  primitive since 2026-09-24, the In-tile Bars rule: labels outside the SVG, the median's bin outlined, hover reading under `(pointer: fine)`).
- **The Distribuzione tile has a second view, «Esaurimento»** (2026-09-24): the failed simulations by the calendar year their capital ran out —
  they used to vanish into the first bin of the final values, 0 € beside the low survivors. `summarizeMonteCarloRun` reads
  `results.simulations[].failureYear` (kept in full, read by no screen until then) into `failureYearBins` through `binYears`
  (`lib/utils/yearHistogram.ts`, the binning shared with the Calcolatore's Distribuzione), the median failure year's bin as the reference,
  shares of ALL simulations like the final-value bins'; `describeEsaurimento` dates first, last and median. The view exists only while
  something fails: with `failureCount === 0` the aside stays the plain window label and the tab forces «Valori finali». The `AsideToggle`
  is «Vista della distribuzione»; the tile's `aria-label` stays «Distribuzione dei valori finali» in both views (the locator every spec
  would use). The footer of «Valori finali» now closes on «scenario base», which the aside carried before the toggle took its place.
- **No figure on the page wears a sign token** — a probability is not a gain, a projected value not a loss; the headline's tone
  (`resolveSuccessTone`: ≥ 90 positive, 80–89 warning, below negative — the old hero's thresholds) is the one judgement, and the fan's dashed
  zero line is the one `--destructive` stroke (the capital exhausted is a fact with a sign). Scenario colours are ONE map, `SCENARIO_SLOT`
  (bear 4 · base 0 · bull 1, the Calcolatore's), read by the Scenari rows, the Parametri swatches, the overlay and its footer legend.
- **The elision before a percentage follows the Italian number name** (`startsWithVowel`): «nel 10,6%», «nell'11%», «nell'84,2%», «nel 18,2%» —
  a digit-based rule printed «nell'10,6%» on the first screenshot.
- Playwright locates the tiles by `role=region` + `aria-label` («Probabilità di successo», «Scenari a
  confronto», «Parametri della simulazione» — pass `exact: true`: the first is a prefix of the scenario list's name), the verdict by «Verdetto su
  Dopo il FIRE», the hero as `p:has-text("Probabilità di successo") + span`, the scenario rows by the list «Probabilità di successo per scenario»,
  the fan by `[role="img"][aria-label*="Ventaglio del piano di prelievo"]` (the Calcolatore's is «Ventaglio Monte Carlo»), the inputs by their
  `#mc-*` ids, the disclosure by `/^Dettaglio/`. The figures are random draws: a spec asserts structure, format and the stale flag's round trip
  (edit → warning footer → Esegui → «Ultima esecuzione con questi parametri»), never a rate.

## CG-A — «Dopo il FIRE» from the target age (2026-10-09, doc/fire-ipotesi/README.md § 21, RE9)
- With no FIRE year in the horizon, `resolveFireStart` (`targetYears` input) returns `kind: 'target'` (years = the years to the target age, the
  Base capital of that year, `quota` = its share of the FIRE number): the run starts there, the selector reads «All'età obiettivo · Oggi»
  and the row says «Il FIRE non arriva entro il {anno}: la simulazione parte dall'età obiettivo …». If the capital is gone by then it
  returns `kind: 'depleted'`: the row says «All'età obiettivo il capitale è esaurito (nel {anno}): non c'è nulla da prelevare.» and
  «Prova» is disabled (`canRun`). The engine is untouched.

## Per-page blind spots

- **FIRE › Monte Carlo, dated flows (F2, 2026-10-04, doc/guide/fire.md § F2)**: the plan reads the SAVED flows as «if I stop today» — a flow anchored to the FIRE opens in year 1 + its delay, so a flow typed «dal FIRE» in the Calcolatore does not wait for the Base's FIRE year here; the flows are the same in every path; the typed withdrawal replaces the plan's expenses in RF4, so a flow already in the Cashflow that the plan's expenses contain is taken out of the need (as in the Calcolatore); the personal SWR (Calcolatore) stays pure, without flows or pensions.

- **FIRE › Monte Carlo, Spesa sostenibile (S1)**: the withdrawal is a FIXED amount indexed with the inflation, not a rule that adapts to the market (that is P3,
  out of scope): it is the figure a plan that never changes course can afford, so a reader who would cut spending after a bad year can afford more. The
  figure is STABLE, not exact: the seed is fixed and with 10.000 paths another seed would move it by ~1–2% (±800 € on 43.300 €); it is rounded DOWN to 100 €
  and re-verified, so the plan at that figure holds in at least p of THESE paths. The cells belong to the last run: a plan edited and not re-run keeps the
  old figures, as every tile of the tab does. With the tax on, the figure counts the gain share of the plan's basis, so it is lower than the same plan without.

- **FIRE › Monte Carlo, leverage (T3)**: the leverage is CONSTANT and rebalanced every year (an ETF's, not a margin account's: a fixed
  debt with maintenance margin is not modelled, README § 7.4), so a bad year cannot be «waited out» — a loss above the capital is
  final (`leva` failure) even if the next years would have recovered. The cost of the debt is the drawn Liquidità return plus a
  spread measured on a 2x ETF (2,0%), NOT a retail broker's. The Ventaglio floors a leveraged year at zero (the fan never fails)
  and counts it as ruin in its retirement ledger. The target seed rescales the modelled classes by `100/(100 − t_crypto −
  t_immobili)`, so with 5% targeted to crypto the other targets read a little higher than typed. The figures with and without
  leverage share the seed, so their difference is the leverage and nothing else; a seed this fixed does not make the figure exact.

- **FIRE › Monte Carlo, correlations (T2)**: they are annual and FIXED across the three scenarios, so a crisis does not raise
  them (in a real one they rise); on MONTHLY data Materie prime–Carry is about −0,58 against the −0,23 annual that the model
  uses. A matrix the reader types can be impossible (three classes all at −0,9): the Save adapts it and says which pairs
  moved, and the Monte Carlo reads the adapted one.

- **FIRE › Monte Carlo**: the weights come from the portfolio today, so a portfolio with a lot of cash now simulates it at the Liquidità CAGR (3,37% default) instead of at the mix's return; real estate and crypto never enter, and the tile says so. No Playwright spec; the paths are seeded since T3 (two runs with the same inputs give the same figures, the seed is fixed and the Dettaglio says so) and the figures are the last run's until «Esegui» (an edited parameter only flags the Parametri footer); the plan is ephemeral, seeded once per mount; the withdrawal is always inflation-indexed; «fino a 81 anni» needs the Coast FIRE age; the histogram's last bin takes the tail past the 95th percentile (said in the footer); the «Esaurimento» view disappears with the toggle when a re-run fails nothing, and its shares are of all simulations, so its bars are short by construction on a plan that holds; `results.medianFinalValue` has no surface.
