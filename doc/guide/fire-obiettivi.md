# FIRE › Obiettivi

> **When to open this guide** — you are touching `components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/*` (`tiles/*`, `GoalsDettaglio`, the chart, the two dialogs, `goalVerdictMeta`), `lib/utils/{goalsSummary,goalsNarrative}.ts`, or the math underneath (`lib/utils/{goalTrajectory,goalMath}.ts`, `lib/services/goalService.ts`). The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `doc/guide/fire.md` § *Files*. The Assistant's side of goals — `goalProposal.ts`, `POST /api/goals` — is in `doc/guide/assistente.md`. No Playwright spec covers this tab.

## FIRE › Obiettivi — a verdict over tiles (`components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/tiles/*`, `lib/utils/{goalsSummary,goalsNarrative}.ts`)

- The tab answers «sono in rotta?» and computes nothing: `computeGoalTrajectory` (per goal, ONE `now` per mount) and `calculateGoalProgress` run as
  before, `goalsSummary.ts` chooses what each tile shows (`summarizeGoals` in urgency order with the counts and the assigned share, `summarizeTrajectory`
  with the chart's series, `summarizeDerivedAllocation` over `deriveTargetAllocationFromGoals`, `summarizeAssignments` closed by the
  free shares), `goalsNarrative.ts` puts it into words. The verdict per goal is the trajectory's own (projected value at the deadline against the target,
  1% tolerance); the headline judges the DATED goals only (`counts.dated`) — every one in time positive, some late warning, all late negative, nothing to
  judge neutral — and the sentence gives every goal its clause, the late ones with the EXTRA pace (`required − planned`, the whole pace when nothing is planned).
- **Dates are `{ year, month }`** (`goalDateFromIso` reads the ISO string, never a `Date`): a deadline typed as «2029-06-30» stays in June whatever
  timezone renders it. `monthsBetween` still ceils on 30.44-day months, so «giugno 2029» from 2026-08-26 is 35 months, not 34 — derive a test
  expectation from the function, never by hand (the first cut of the tests lost ten assertions to that and to Intl's ungrouped four-digit amounts, «1531 €»).
- **The selection is a row** (`selectedGoalId`, falling back to the most urgent, following a deletion, session-only); the Traiettoria's actions (Modifica,
  Elimina through `useArmedDelete`, the disarm announced by a `role="status"` span) sit in its aside — the Scheda's ghost buttons from `desktop:`, 44px
  targets below. In demo the aside says «non modificabile in demo» and the Assegnazioni footer «In demo le quote non si modificano».
- **The return is the page's common hypotheses (D8)**: `computeGoalTrajectory` takes `assumptions` (`resolveFireAssumptions`, read by the tab through
  `useFireAssumptions`) and derives the return with `goalAnnualReturn` — RP1 on the Base scenario of Impostazioni › Simulazioni, from the goal's own allocation
  (crypto and real estate out, the rest rescaled to 100, said in the Traiettoria footer) or, with none usable, the target portfolio's Base return. The tab
  shows the «Ipotesi usate» row above the verdict, the same string as the other four tabs; a goal's return is net of the costs of ITS allocation (RC5, `goalAnnualReturn`: 80/20 → 8,79% against 9,21% gross). Typical amounts are nominal, with no inflation.
- **The goal's hex is identity** (dot, track, projection, the Panoramica's ObiettivoTile); the classes of Allocazione derivata take
  `ASSET_CLASS_CHART_INDEX` through `useChartColors` — the deleted `AllocationComparisonBar` carried a map of its own. Its «assigned» bar aggregates
  every goal's quotas by euro (reached included) while the derived target excludes the reached goals: the footer says the reached do not weigh.
- **The free shares are the residual**: `summarizeAssignments` lists an instrument with more than 0,5% and 0,50 € free, sums `freeTotal` over EVERY
  instrument so the «Non assegnato» row adds up, and names an instrument assigned past 100% in the footer's warning tone (the amber card is gone). Orphaned
  quotas are skipped as `goalMath` does; the tab still runs `cleanOrphanedAssignments` before every write, and every write rewrites the document whole.
- **A late goal's row never shows a deadline as an arrival** (the Milestone tile is gone, 2026-10-07): the status line of an off-track goal ends «arriva a settembre 2030, 15 mesi dopo la scadenza»
  (the PROJECTED month, `lateArrival` in `goalsNarrative.ts`), a goal the pace never reaches reads «mai, al ritmo attuale»; the order stays urgency, not arrival date.
- Playwright locates the tiles by `role=region` + `aria-label` («Obiettivi», «Allocazione derivata», «Assegnazioni» — pass `exact: true`,
  «Obiettivi» is a prefix of the list's name; the Traiettoria by `/^Traiettoria di /`), the verdict by «Verdetto sugli obiettivi», the rows by the list
  «Obiettivi in ordine di urgenza» (buttons named «{name}, {chip}», `aria-current` on the selected), the residual by the rowheader «Non assegnato», the
  disclosure by `/^Dettaglio/`, the split by the list «Ripartizione del versamento». The base account has no goals: a spec plants its own fixture
  (`goalBasedInvesting/{uid}` + the two settings flags with `merge: true`) and removes it.

## O1 — obiettivi dentro il FIRE (2026-10-04, doc/fire-ipotesi/README.md § 13, RO1–RO2, D-G1–D-G4)

- **`countsInFire`** (`InvestmentGoal`, «Alla scadenza lo spendo» in `GoalFormDialog`): spento di default, acceso dai modelli «Acquisto Casa» e «Auto». Lives in `goalBasedInvesting/{uid}`, NOT in `fireDatedFlows`: a goal is never a saved flow, so it cannot orphan and does not count in the 20-flow cap. `serializeGoalForFirestore` writes `false` too (a value, not an absence).
- **RO1** `resolveGoalFlows` (`lib/utils/datedFlows.ts`): a goal that counts becomes a fixed `lumpOut` at year `year(deadline) − currentYear`, source `goal`, amount = target minus what sits OUTSIDE the capital today (`assetInsideShare` over `FireAssumptions.legShare`, the K1 shares; value of today, no growth). End of the deadline's year (RF1). Missing amount/deadline, a past deadline or «tutto fuori dal capitale FIRE» → excluded with the reason. `useFireDatedFlows` merges the goal flows after the saved ones for every tab (it now takes `{ lockedAssetIds, cashToInvestPct }` so the capital matches the tab's) and exposes `goalFlows` for the read-only rows of Calcolatore › Parametri › «Flussi nel tempo» (`describeGoalFlowRow`).
- **RO2** `goalFireEffect` / `goalFireNarrative` (`lib/utils/goalFire.ts`): the Base FIRE year of the What If's baseline (`useWhatIfBaseline`, extracted from the What If tab, same plan) with and without the goal's flow (`baseYearsToFIREWithFlows`). `Traiettoria` shows the «Effetto sul FIRE» line for the selected goal and «Conta nel FIRE» (one-field write) when it does not count yet. The verdict, the trajectory and the Assistant do NOT read the switch.
- **Blind spots**: the double count of a counted goal and a hand-written flow for the same spend is visible in the Parametri row, not prevented; the goal's monthly contribution is already inside the Cashflow saving and is neither added nor subtracted; the line is absent while the plan loads or fails, and says «servono spesa e SWR nel Calcolatore» without a plan.

## O2 — obiettivi con incertezza (2026-10-04, doc/fire-ipotesi/README.md § 13, RO3–RO7, D-G5–D-G8)

- **RO3** `monthlyRate` (`lib/utils/goalTrajectory.ts`): `futureValue`, `requiredMonthlyContribution`, `monthsToReach` and the chart series compound at `(1+R)^(1/12) − 1`, not `R/12`: twelve months earn exactly R (6% → 10.600,00 €, it was 10.616,78 €). Every existing Traiettoria moves slightly (−0,25% over three years at 5%); that is the declared return finally being the one used.
- **RO4–RO6** `lib/utils/goalUncertainty.ts` (pure): the goal's portfolio (own allocation, else the target portfolio; Base scenario; net of RC5 costs; `goalPortfolioMoments`) as a monthly lognormal from `portfolioCompoundReturn`'s moments, 10.000 paths, `createSeededRandom(MONTE_CARLO_SEED)` fresh per goal and per valuation. The value is linear in the contribution (`V = A + c·B` per path), so one pass keeps `A` and `B` and every probability — the 10 € solver for «9 casi su 10» included — is a count over them: same shocks at every step, no path stored. At zero volatility it is `futureValue`.
- **RO7** a goal with an amount and no deadline: `simulateGoalArrival`, the 50th and 90th percentile of the first month `V ≥ target` (cap 600 = «non entro 50 anni»).
- **What the page shows**: Traiettoria — «Probabilità di arrivarci entro …», the contribution for 9 cases in 10 (or «Al ritmo di oggi ci arrivi in 9 casi su 10»), the 10°–90° band under the curve (tooltip with the three percentiles) and the method note in the footer; the Obiettivi list — the probability after the verdict chip. The list computes the probability of every dated goal (light reading, independent of the selection); the full reading (band, solver) only the selected goal. The arrival months of a goal with no deadline only in the Traiettoria.
- **D-G8: the verdict stays deterministic** (the trajectory's centre path, 1% tolerance); «In rotta · 55%» is not a contradiction: one is the central path, the other the share of paths. Panoramica and the Assistant do not read the simulation.
- **Blind spots**: probability is shown whole and rounded (99,6% reads 100%); a deadline past, a reached goal or an open goal has no reading; the portfolio has no leverage and no ruin (a path never zeroes); the contribution is the one of today, constant, and is already inside the Cashflow saving; solver and band use the Base scenario only; with 10 dated goals the page runs ≈21 ms per goal of 36 months (longer deadlines scale linearly) in a `useMemo`.

## CG-A — Effetto sul FIRE out of the horizon (2026-10-09, doc/fire-ipotesi/README.md § 21, RE10)
- When both years are beyond the horizon and the target age is known, `goalFireEffect` carries `quotaWith` / `quotaWithout` /
  `targetCalendarYear` (`baseQuotaAtTargetWithFlows`, same walk as `baseYearsToFIREWithFlows`) and the line reads «Con questa spesa
  all'età obiettivo (2036) avrai il 15% del numero FIRE invece del 20% (scenario Base).»; equal shares say so. If only one year is null,
  the sentence of before stays.

## Per-page blind spots

- **FIRE › Obiettivi, return**: the allocation of a goal has no gold level, so a commodity share is simulated as Materie prime; a goal's return is the Base scenario only (no Bear/Bull view); the Assistant's figure ignores the pension lock.

- **FIRE › Obiettivi**: no Playwright spec; ONE `now` per mount; with three goals the Obiettivi tile leaves air under the rows; a goal past its deadline gets no pace; free shares under 0,5% / 0,50 € are not listed; the selection is session-only; the «assigned» bar counts the reached goals, the derived target does not; the two dialogs keep their old chrome and two pre-existing `react-hooks` errors.
