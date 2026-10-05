# FIRE › What If

> **When to open this guide** — you are touching `components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*` (`tiles/*`, `WhatIfProjectionChart`, `incomeSelection.ts`), `lib/utils/{whatIfSummary,whatIfNarrative}.ts`, `lib/services/whatIfService.ts` or `types/whatIf.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `doc/guide/fire.md` § *Files*. No Playwright spec covers this tab.

## FIRE › What If — a verdict over tiles (`components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*`, `lib/utils/{whatIfSummary,whatIfNarrative}.ts`)

- **Same hypotheses as the Calcolatore** (2026-10-03, doc/fire-ipotesi/README.md L1): `scenarios` come from `useFireAssumptions` (target portfolio, Impostazioni ›
  Simulazioni), the Coast baseline's `realReturnRate` is Fisher (`realReturn`), and the «Ipotesi usate» line sits above the verdict; the scenario rates, and so the sensitivity matrix, are net of TER and stamp duty (doc/guide/fire.md).
  **Since L2** the net worth is `K`, the expenses are the plan's (Coast's too: its own «spesa personalizzata» is gone), the baseline walk and the Sensibilità
  save with the indexed saving (`indexSavings`), and `annualIncome` (Cashflow expenses + savings) keeps the job loss on the real income.

- The tab answers «cosa cambia se…?» and computes nothing: `calculateWhatIfImpact` (service) perturbs and diffs, `whatIfSummary.ts`
  turns the impact into the event as stated, the before/after pairs, the merged series, the divergence and the sensitivity reading,
  `whatIfNarrative.ts` puts them into words. The service now RETURNS the two base-scenario walks it runs (`projections`), so the
  chart draws the series the years were read from — never a third walk in a component. The job-loss decomposition (retained income
  covers the expenses first, the portfolio pays the uncovered part) is `decomposeJobLossHit`, out of the component.
- **The headline and the tone come from the delta in years** (`timelineCase`: keeps · loses · gains · neverBoth · leaves · returns ·
  same · moves), shared by the verdict and the Prima e dopo reading; a `yearsToFIRE` of 0 means reached, null means beyond the
  50-year horizon (`WHAT_IF_HORIZON_YEARS`, the Calcolatore's). **Only the deltas carry a sign** (`signedAmount`), by the direction
  that is good for the row (`buildDeltaRows`: net worth and income higherBetter, FIRE number, Coast number and gap lowerBetter);
  a change under half a unit is «invariato», never «+0 €». **An empty perturbation** (`WhatIfEvent.isEmpty`: no months or no lost
  income, a lump sum of 0, both cashflow deltas 0) gets «Nessun evento da simulare.» with today's plan, not a zero delta.
- **The baseline carries the honest inputs** (2026-09-24, `WhatIfBaseline.honest`, built like the Calcolatore's: the tax profile of the
  FIRE-eligible assets minus the locked funds, the Coast pensions dated by the saved age): both sides of every event read
  `resolveFireRequirement` and the walk with `honest`, so «prima» agrees with the Calcolatore's number. The basis MOVES with the event
  (`honestFor`): money that arrives — a windfall — is basis, money that leaves — a purchase, the months without income — is sold at the
  portfolio's own gain share, so the basis shrinks in proportion. Pinned: a 50k windfall on 200k/100k lowers the number (1/(1−0,104)), a 50k
  purchase keeps it (still half gain).
- **The event clause is household-agnostic**: months, the lost amount and its share of expenses + savings (`lostShareOfIncomePct`,
  null when the household earns nothing, and the clause drops). The names of the sources live only in the Evento tile's picker.
- **The Prima e dopo tile has no hero on purpose** (the canvas's proposal): the year is the verdict's headline and the Delta's first
  row. Its one figure is the divergence — both capitals at the FIRE year of the plan of today (`summarizeDivergence`; the
  after-event year when today's never gets there; null when neither does or the target is already reached), read from the merged
  series (`buildWhatIfComparisonSeries`: the union of the years, null where a walk stops — a walk ends five years after its last
  scenario reaches FIRE, so a purchase lengthens the after side and `connectNulls={false}` leaves the gap). The plan of today is
  `--muted-foreground` (a baseline is neutral), the plan after the event `--chart-1`; the before target is drawn only when the
  event moves the FIRE number (`targetsDiffer`). Reference lines mark the two FIRE years, none for a side reached today.
- **The Sensibilità is NOT on this tab any more** (FEAT FIRE 2026-10-05, doc/fire-ipotesi/README.md § 16 D-W5/D-W6): it is the Calcolatore's, under Età obiettivo
  (`FireCalculatorTab`; the tile, `summarizeSensitivity` and `describeSensitivity` keep their files here). It runs on the plan of TODAY, centred on the plan's or the
  typed reference expenses, and walks exactly the verdict's path (bridge, pensions, tax, flows). Cells: the baseline outlined (`border-foreground`), better `bg-positive/15`,
  worse `bg-destructive/15` — the sign tokens, not chart slots. Below `desktop:` it is one block per expense level with the savings
  cells in two columns (a cardified matrix needs its own labels). `summarizeSensitivity` reads the −10% row at the baseline column
  and the column right after the baseline (`+25%`, or `€5k` on the zero-savings fallback, whose label starts without `+`).
- **Layout since 2026-10-05 (D-W1–D-W4)**: the Evento is first at every width, before the verdict; on a desktop it is the left 4 columns and the right 8 hold
  the verdict over Prima e dopo (5) and Delta (3). The event stays preset (6 months). The Delta shows only the rows that change (`buildDeltaView`: fixed order, an
  unchanged row leaves, one closing line «Invariati: …», a row with no computable delta stays, and when nothing moves the tile is `DELTA_NOTHING_MOVES`); the
  job-loss decomposition (`whatif/JobLossEffect.tsx`) lives in the Delta, drawn only for a job loss of today.
- **Every Delta row is `flex-wrap`**: «Raggiunto → Raggiunto» in a 3-column tile drops under the label, right-aligned, instead of
  splitting «Numero Coast oggi» over three lines (the Per classe row's rule).
- Playwright locates the tiles by `role=region` + `aria-label` («Prima e dopo l'evento», «Delta dell'evento», «Evento simulato»), the verdict by «Verdetto sul What If» (its sentence is the `p` under the heading — the region's
  text starts with the headline), the event switch by `role=group` «Tipo di evento» (`aria-pressed` buttons), the rows by the lists
  «Prima e dopo per il FIRE» / «…per il Coast FIRE», the picker by «Fonti di reddito», the matrix by its `table` (1440) or the
  list «Anni al FIRE per livello di spesa» (390). On the base account the target is REACHED (small expenses), so a spec asserts the
  headline against the set of live phrasings and the deltas against a typed amount, never a year.

- **«Quando» (F3, 2026-10-04, doc/fire-ipotesi/README.md § 12 RF11)**: the Evento tile has a year field (blank = today, the running year or earlier = today, capped at the 50-year horizon with a hint). A later event does not move today's capital or the Sensibilità: it is lumps / recurring deltas laid over the SAVED flows on the «dopo» side (`buildEventFlows`, amounts in today's euro revalued), and the verdict, the Evento reading, its aside and footer and the chart footer name the year. «Prima» now includes the saved dated flows (the same plan as the Calcolatore), and the tab's «Ipotesi usate» line carries «· N flussi datati». The job-loss decomposition is only drawn for an event of today.

## Per-page blind spots

- **The age it reads is the page's** (E1, 2026-10-04): the Coast block's target age (`coastFireRetirementAge`) can now also be written from the Calcolatore's Parametri; nothing changes here, the field is the same.

- **FIRE › What If**: no Playwright spec; every event is a year-0 perturbation unless «Quando» puts it in a later year (then it is dated flows on the «dopo» side, `doc/guide/fire.md` § F3), nothing persisted; the Coast block reads the SAVED age and pensions (no age → no block); the job-loss picker seeds from `laborIncomeCategoryIds` once per mount; the «Prima e dopo» walk of today stops five years after its last scenario reaches FIRE (a gap after a big purchase, by design); with the bridge on the FIRE numbers are bridge numbers while the chart reads `baseNetWorth`; `isPrimaryResidence` is informational.

## O1 — the baseline is a hook (2026-10-04)

`WhatIfAnalysisTab` no longer assembles the `WhatIfBaseline`: `lib/hooks/useWhatIfBaseline.ts` does (same queries, same assembly, extracted verbatim) and Obiettivi's «Effetto sul FIRE» reads the same one (`goalFireEffect`). Change the baseline in the hook, never in a tab.
