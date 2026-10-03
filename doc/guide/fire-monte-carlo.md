# FIRE › Monte Carlo

> **When to open this guide** — you are touching `components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*` (`tiles/*`, `MonteCarloFanChart`, `FinalValueBars`, `ScenarioOverlayChart`, `MonteCarloDettaglio`), `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts` or `lib/services/monteCarloService.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `doc/guide/fire.md` § *Files*. No Playwright spec covers this tab.

## FIRE › Monte Carlo — a verdict over tiles (`components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*`, `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts`)

- **The weights are seeded from `useFireAssumptions`** (2026-10-03, doc/fire-ipotesi/README.md L1): the page's ONE reading of RP4 (Allocazione targets, else the
  portfolio held, else 60/40) — the same the Calcolatore's Ventaglio now simulates. The two buttons «Importa dai target / dal portafoglio di oggi» keep their own seeds.
  The «Ipotesi usate» line above the verdict says the weights' origin; it does not follow a hand edit (the Parametri tile says «a mano»).
  **Since L2** it also carries the plan's expenses and `K` (the same string as the other tabs), the withdrawal is seeded with the plan's expenses
  (`resolvePlanExpenses`, the 30.000 € fallback only while there are none) and the withdrawal-tax basis is `K`'s (`assumptions.capital.taxProfile`).
  The tab waits for the Cashflow read too: a failed read is the tab's `ErrorNotice`.

- The tab answers «quanto è probabile?» and computes nothing: `runMonteCarloSimulation` runs, `monteCarloSummary.ts` reads the run (the base
  scenario's horizon dated in years and in age, the first year the 10th percentile touches zero, the final percentiles of ALL simulations, the
  histogram with the median's bin, the three scenarios, the Dettaglio's overlay and percentile rows, the plan as typed), `monteCarloNarrative.ts`
  puts it into words. **The median the page reads is the last percentile row's p50** — `results.medianFinalValue` is the median of the SURVIVORS
  only and overstates a plan that fails often; it stays in the payload, no surface prints it.
- **ONE run = the three scenarios** (Orso · Base · Toro, `buildParamsFromScenario` over the shared plan): the verdict, Probabilità and
  Distribuzione read Base, the Scenari tile reads all three. The «Simulazione singola | Confronto scenari» toggle went with the mode it switched;
  the single form's market fields ARE the Base scenario's, and the plan's `params` carry `getDefaultMarketParameters()` only as a placeholder
  every run overrides.
- **Auto-run once, explicit afterwards** (The Stale-Run Rule): the seeded plan runs on its own (`didAutoRunRef`, inside a `setTimeout(0)` —
  react-hooks/set-state-in-effect); every later run is «Esegui». A run keeps the inputs it was made with (`MonteCarloRunState.inputs`) and
  `haveRunInputsChanged` compares the PLAN fields, the scenarios and the inflows — never the single form's market fields — so the Parametri footer
  says «I risultati sopra usano i parametri dell'ultima esecuzione» in the warning tone while every tile keeps the last run. A 30.000-path run on
  every keystroke was one alternative; a silent re-run that changed the verdict under the reader's eyes was the other.
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
  pension funds) and «Liquido» its liquid part. «Fuori dalla simulazione: Immobili …, Crypto …» is read-only and absent when
  nothing is left out.
- **The draw is lognormal on CAGR and volatility** (rule R1, `lib/utils/monteCarloDraw.ts`): the typed return is the median
  compound growth, the volatility the std of SIMPLE annual returns; `ln(1+r) = m + s·z`, every `r > −100%`, zero volatility
  returns the CAGR exactly (the Ventaglio's coherence test relies on it). The arithmetic mean (shown read-only in
  Impostazioni) is higher than the CAGR. The number of draws per year
  is fixed (7 classes × 2 uniforms) so T3's shared shocks hold. Defaults: `lib/constants/monteCarloMarketDefaults.ts`, the ONLY
  file the research numbers (R0) enter the code in, with a `source` per class.
- **The classes move together through ONE correlation matrix** (T2, 2026-10-03; README § 6): 21 pairs of log-returns, the
  same for Orso, Base and Toro (D6), saved in `monteCarloMarket.correlations` ONLY when they differ from the research
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
- Playwright locates the tiles by `role=region` + `aria-label` («Probabilità di successo», «Distribuzione dei valori finali», «Scenari a
  confronto», «Parametri della simulazione» — pass `exact: true`: the first is a prefix of the scenario list's name), the verdict by «Verdetto sul
  Monte Carlo», the hero as `p:has-text("Probabilità di successo") + span`, the scenario rows by the list «Probabilità di successo per scenario»,
  the fan by `[role="img"][aria-label*="Ventaglio del piano di prelievo"]` (the Calcolatore's is «Ventaglio Monte Carlo»), the inputs by their
  `#mc-*` ids, the disclosure by `/^Dettaglio/`. The figures are random draws: a spec asserts structure, format and the stale flag's round trip
  (edit → warning footer → Esegui → «Ultima esecuzione con questi parametri»), never a rate.

## Per-page blind spots

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
