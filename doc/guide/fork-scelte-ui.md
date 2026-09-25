# Fork UI choices: the owner's calls vs upstream, and the Lime Frost theme

The single record of every UI decision the fork's owner made where the fork **diverges from upstream**
(GiuseppeDM98/net-worth-tracker) or where the **Lime Frost** colour theme sets its own rule. Read it before a merge
from upstream (to know which side to keep) and before touching a colour (to know whether the rule is fork-wide or
Lime Frost only). Token mechanics live in [temi.md](temi.md); the theme's charter with swatches and the page audit is
the artifact «Carta del tema Lime Frost». Dates are 2026.

Branch: `feat/ui-lime-frost-agentation` (theme + 50/30/20 + third upstream merge `79816d1` + the 2026-09-15 passes),
merged into `main` with PR #3; fourth upstream merge (#364–#378) on `merge/upstream-2026-09-21` (PR #9); fifth
(#379–#389) on `merge/upstream-2026-09-24`, over `origin/main`; sixth (#392–#393, transfer fee and mortgage principal —
no fork-side conflict in code) on `merge/upstream-2026-09-25`.

---

## 1. Where the fork keeps its own side against upstream

Keep these on every merge; each one conflicted, or will conflict, with an upstream commit.

| Area | Upstream | Fork (owner's call) | Files |
|---|---|---|---|
| **Storico scrub** | Retired 09-13 (`5e6e3c6`): a hover reads only the chart it is on | **Restored 09-15**: the month under the pointer drives Evoluzione's head, Composizione, Valore per strumento and the Driver slot. The milestone confetti stays retired | `lib/utils/storicoScrub.ts`, `components/history/tiles/{Evoluzione,Composizione,Driver}Tile.tsx`, `app/dashboard/history/page.tsx`, `lib/utils/historyComposition.ts`. 09-21: re-applied over upstream's two-column grid and its ledger Driver (three bars: savings, market, tax) |
| **Current month in monthly bar charts** | A 1px foreground outline around the month's bars | A faint column behind the slot + the month name in a pill (`CurrentSlotBand`, `CURRENT_SLOT_LABEL_CLASS`), in every monthly bar chart: Tracciamento, Budget, Analisi, Risparmio nel tempo, Dividendi, Storico Driver, Hall of Fame | `components/ui/chart-hover.tsx` + the seven charts |
| **Truncated labels** | `truncate` on ranked rows, feed titles, Strumenti names, Piano rows (09-24: Hall of Fame's record rows and Note periods stopped cutting too — `min-w-`, `whitespace-nowrap`) | **Never cut**: two-line clamp (`line-clamp-2 break-words`); on a phone a ranked row's caption drops under the name. Hall of Fame: upstream's own fix taken on 09-24 (the fork's `w-[108px]` retired); the Note tile's ranking names wrap instead of upstream's `truncate` | `components/ui/{ranked-rows,composition-list}.tsx`, `components/hall-of-fame/tiles/NoteTile.tsx`, `components/cashflow/CompactExpenseRow.tsx`, `components/assets/AssetRow.tsx`, `components/allocation/{PlanRow,InstrumentTradeList,tiles/PianoTile}.tsx` |
| **Analisi Flusso** | One classic Sankey, types only; upstream's column-driven height, `align="start"`, top-6×4 subcategories | **50/30/20 view «Per ruolo»** (default, opt-in setting) beside «Per tipo»; the **thin** Sankey in every desktop view, subcategories included (two-line labels with a card halo, 44px per node of the widest column); the same top-6×4 subcategory rule in both views; on a phone the roles view is the 50/30/20 bar + rows | `components/cashflow/{CashflowSankeyChart,analisi/tiles/FlussoTile,analisi/SpendingRolesMobileFlow}.tsx`, `lib/utils/{cashflowSankey,spendingRoles}.ts` |
| **Phone 50/30/20 bar** | — | Shares on the **same base as the reading** (income + what the wealth covered = what left): 58/42, never 60/44 on income; the deficit is a red «entrate» line inside the bar, labelled under it | `SpendingRolesMobileFlow.tsx` |
| **Category badge colours in Impostazioni** | The hue the user saved | With the 50/30/20 roles on, the **role's colour** (need · want · saving · unclassified; income the income flow); the saved hue appears nowhere else | `lib/utils/categoryIconStyle.ts` (`categoryRoleColor`), `app/dashboard/settings/page.tsx` |
| **Deletes** | Upstream's armed delete, `outline` + red text | Upstream's armed flow kept, on the fork's `outlineDestructive` variant; Previdenza's bins appear on row hover on desktop | `components/assets/{AssetRow,CashAccountDialog}.tsx`, `components/pension/tiles/VersamentiTile.tsx`, `components/ui/button.tsx` |
| **Allocazione grid** | 09-21: two columns at natural height (Bilanciamento + Per classe \| Piano), then Esposizione and Previdenza as full-width rows | 09-25: **two independent stacks, no full-width row** — Bilanciamento, Per classe, Accumulo \| Piano, Composizione ideale, Esposizione, Previdenza. The Piano's height swings with the mode and the instruments (381–1159px on the owner's account), and a full-width row under two columns left a 250–580px hole; in stacks only the page's bottom edge moves. Accumulo's and Previdenza's inner columns are container queries | `app/dashboard/allocation/page.tsx`, `components/allocation/tiles/{AccumuloTile,PrevidenzaTile}.tsx`, `e2e/allocation.spec.ts` |
| **Liquidità (Patrimonio)** | «Mostra tutti» expanding the tile | Fixed-height list (5.5 rows as the scroll cue), flat divided rows | `components/assets/tiles/LiquiditaTile.tsx` |
| **Type colour map** | One map, income dot/badge `bg-positive`, series on `--chart-2`/`--chart-1` | Same single map, reading the role tokens `--flow-in`/`--flow-out` (defaults = upstream's slots), income dot/badge on `--flow-in` (a type marker, not a verdict) | `lib/constants/expenseTypeColors.ts` |
| **FIRE scenario colours** | Slots `--chart-5/1/2` per scenario; 09-24: the three histograms (`HistogramBars`) on `--chart-1`, Coast/FIRE target lines neutral | The same slots through `SCENARIO_COLOR` (`--scenario-bear/base/bull`, `:root` defaults = upstream's slots); `HistogramBars` on `--scenario-base`; the Dettaglio's income/spending lines on `--flow-in`/`--flow-out` | `lib/constants/scenarioColors.ts`, `components/fire-simulations/*`, `components/ui/histogram-bars.tsx` |
| **Storico and Rendimenti series** | 09-20: one word, one colour per page on the chart slots — market/portfolio `--chart-1`, savings `--chart-2`, invested base the neutral ink | The same pairing on the **role tokens**: market/portfolio `--hero-series`, savings `--flow-in`, a losing market `--sign-chart-loss`, capital `--capital-networth`/`--capital-invested` (09-21: their `:root` defaults moved to upstream's new pair, `--chart-1` / `--muted-foreground`), heatmap on `--sign-chart-gain/loss`, Sharpe `--sharpe-series` | `components/history/{tiles/DriverTile,StoricoDettaglio}.tsx`, `components/dashboard/LaborMetricsChart.tsx`, `components/performance/*` |
| **COMPRA / VENDI / OK** | 09-21: the clamp finally runs (`lib/utils/actionColor.ts`, AA-tested on the chart slots) | Upstream's clamp, reading the role tokens `--trade-buy/sell/ok` and also parsing `#hex` (served form of an in-gamut colour). The contrast test does not read `--trade-*` | `lib/hooks/useActionColors.ts`, `lib/utils/actionColor.ts` |
| **Esposizione reading** | 09-21: the clause of the open view first (three views) | Same rule on the fork's five views: Valuta opens on the currency contrast, Geografia keeps holding-first | `lib/utils/allocazioneNarrative.ts` (`describeExposure`) |
| **Cache key** | `v8` | `v8-fork` — always `v{n}-fork` | `lib/services/performanceService.ts` |
| **Solo-fork features** (older) | absent | Esposizione a cinque viste, leveraged ETF + Trend/Carry, CSV import, ticker alias, first-trade guard | see CLAUDE.md |

Accepted from upstream as is: the light chart palette re-pitch, `RankedRows` 42% label column and share column that
yields under 250px, `SegmentedPill` 70% inactive label and scroll, Budget's booked-vs-scheduled split, the Sankey's
neutral labels and aria name, cost figures neutral **by default**.

## 2. Lime Frost light — the owner's rules

The theme is scoped: every choice below is a token whose `:root` default keeps the other themes as they were
(R10), and Lime Frost dark resets it. **Only Lime Frost light carries these rules today.**

**Ground and interaction.** Flat green ground (L 0.955, hue 133); white tiles; slate text. Lime is the fill of the
page's main action with a slate label; a pressed toggle is light green, a chosen option white; ghost icons hover in
ice — **except a bin, which hovers red** (`--ghost-destructive-hover`).

**Data vocabulary (cold).** Net worth ice 228 (`--hero-series`) everywhere a series is the portfolio or a part of it;
income green 138 (`--flow-in`), spending ice 232 (`--flow-out`) in every bar, column and line; frost lavender 295 for
secondary series, VENDI and the bear scenario; capital, benchmarks and 60/40 neutral. Chart slots (`--chart-N`)
mean **asset classes only**; Liquidità's slot is a neutral ice grey.

**Sign = judgement only.** Green/red for deltas, deficits, overruns, gains and losses — never for a type. Income and
spending **figures** are ink with a series dot; only the savings (and its rate) take the sign. Owner, 09-15: **keep
this in Lime Frost only for now** (it was briefly decided for all themes, then scoped back).

**Amber = costs and estimates.** The annual cost (Panoramica), the estimated tax (Sintesi) and the estimated IRPEF
saving (Previdenza) are amber (`--cost-figure`, `--estimate-figure`); amber otherwise stays for warnings and
thresholds. (This reverses the slate of 09-14.)

**Bars and tracks.** No near-black bar anywhere: progress tracks in mid slate (`--progress-fill`); a doubling's
track **warms toward the finish**, pale ice → net-worth ice (`--milestone-far/near`). Allocazione's Per classe rows
wear **their class colour**; Esposizione's look-through rows are neutral ice. Sign charts (savings per month, the
returns heatmap, the Driver's losing market) keep the sign but **lighter** (`--sign-chart-gain/loss`).

**Categories.** Icons in the feed and the table are neutral (no saved hues). The 50/30/20 triad: Necessità ice 232,
Desideri lavender 295, Risparmi green-teal 175, Da classificare Liquidità's grey, deficit the sign red. The Sankey's
«Per tipo» view uses the same register (`--type-flow-*`): income green, fixed ice, variable lavender, debt muted
amber, categories flat in their type colour.

**Measured floors (R9).** Text ≥ 4.5:1 on tile and ground; series ≥ 3:1 on white; tile vs ground ≥ 1.1:1
(`limeFrostTheme.test.ts`).

## 3. Open — TODO

**Roadmap** (agreed with the owner on 2026-09-22, reviewed on 2026-09-24 after the fifth upstream merge #379–#389).
One session per step; each step's detailed items are in the list below.

*The branch rule (non-negotiable)*: every PR to upstream is a branch cut from `upstream/main` carrying ONLY its topic
(cherry-pick or rewrite), never from the fork's main, which holds Lime Frost, the scrub and the fork's UI choices.
Lime Frost never reaches an upstream PR; at most its logic (role tokens with neutral `:root` defaults) goes to an
issue. Fork PRs merge with a merge commit, never squash (it keeps upstream's history).

1. **Upstream PR A — the Piano on a leveraged portfolio** (the item «Piano on a leveraged portfolio» below). First
   because it fills a gap upstream has too; still untouched upstream on 09-24. **09-24 night: opened as upstream
   draft #391** (branch `fix/leveraged-plan`, one commit on `upstream/develop`). The owner's calls: a composite order
   split by composition across its classes, a same-class swap as two moves, the first-trade guard NOT bundled (its own
   PR), and the fork WAITS for upstream's merge — at that realignment `InstrumentTradeList.tsx` conflicts (deleted
   upstream, modified here): take the deletion, and bring «Mostra tutte» to the tree only if the Piano grows too tall.
   **09-25: the owner pulled it into the fork before upstream's merge** — merged (not cherry-picked) into
   `feat/allocazione-pac-composizione-ui`, so upstream's own merge will find the same commit `9486aa7f`. The deletion
   taken; «Mostra tutte» NOT restored (owner: full height — in two stacks a tall Piano leaves no hole); the fork's
   `line-clamp-2` kept on `MoveRow`. The Ribilancia is 1159px on the owner's account.
2. **Fork UI** (fork branch → fork main). **09-25**: the owner chose to open it with Allocazione's Accumulo and
   Composizione ideale (done 09-25), the other items in later sessions: staggered tiles; Accumulo and Composizione ideale; Esposizione pie/donut
   (neutral class colours, not Lime tokens, so it can travel in PR C); Flusso «Per tipo» on a phone, designed
   upstream-neutral (PR B needs it). **Added 09-24**: the FIRE page in Lime Frost — the Distribuzione histograms
   (`HistogramBars` on `--scenario-base`), the Coast pace line, the scenario colours on the new tiles.
3. **Upstream PR B — 50/30/20 roles** (issue first): `spendingRoles.ts`, the category field + dialog + settings
   (the five write places), Flusso «Per ruolo» and its phone bar, the phone «Per tipo» from step 2. Role tokens only
   as `:root` aliases. **09-24**: built on upstream's rewritten Impostazioni (`CategoryRow` carries the role colour,
   per-tab dirty state, failed-read states — the roles clause says «non letti» when the categories failed).
4. **Lime Frost** (fork only): the three light points (Lime-only rules fork-wide or not; class palette ΔE and
   `--chart-9`; ~25 tokens into four families), then the Carta's five dark decisions and the dark audit.
5. **Upstream PR C — Esposizione a cinque viste** (issue first; it replaces upstream's three-view tile) —
   prerequisite of the optimizer.
6. **Upstream PR D — PAC + weight optimizer** on top of C (issue first); coupled through `OptimizerPanel`.
7. **Upstream PR E — the composite class chip on Patrimonio › Strumenti** (added 09-24, the item «Composite class
   chip» below). Small and upstream-neutral (chart slots, no Lime token), so it can move ahead of steps 2–6 whenever a
   short session is free; branch from `upstream/develop`, never from the fork's main.

**Next UI session — the owner's list after the fourth upstream merge (2026-09-22):**
- [ ] **Staggered tiles with the new layouts**: upstream's natural-height columns (Storico, Allocazione, Rendimenti)
  leave some tiles out of line with their neighbours — walk the pages at 1440 and 390 and name each one.
- [x] **Allocazione — the two fork features' UI** (done 2026-09-25, branch `feat/allocazione-pac-composizione-ui`):
  the page as two independent stacks (§ 1, «Allocazione grid»), Composizione ideale under the Piano, its reading its own («Il portafoglio che rispetta
  meglio…») and the index by name; Accumulo in two columns from `desktop:` (lines | «Classi del piano»), the class
  strip as rows with a track (today · target · end-of-plan ring, dormant classes dropped, amber only out of band),
  44px targets on a phone, the undo actions as ghosts, the months bar on `--progress-fill`. doc/guide/accumulo.md
  § Il tile attivo — forma.
- [ ] **Esposizione on desktop is now full width**: enrich it with a pie/donut beside the ranked rows (one per view),
  using the space upstream gave it.
- [ ] **Analisi › Flusso «Per tipo» on a phone is still a Sankey**, unreadable at 390 and with no insight (same item as
  the one below, owner re-raised it): design a mobile view like the roles view's bar + rows.
- [ ] **Is Lime Frost light ready to flip to dark?** Decide what must close first (see the Carta's «Verso il tema
  scuro» and the light items below) before touching `.dark[data-theme="lime-frost"]`.

- [ ] **Flusso on a phone, «Per tipo»**: the Sankey does not read at 390px. Rethink an insight view for the type
  split on mobile (the roles view already has the 50/30/20 bar + rows); owner's note 09-15.
- [x] **Production 50/30/20 data**: applied by the owner on 2026-09-15 (one atomic batch: 16 categories, 25 rows,
  2 deletions; backup `scratchpad/backup-503020-prod-2026-09-15T19-52-43-025Z.json`, `--restore` undoes).
- [x] **Deploy the roles code** (PR #3 merged, main `f6c834d`, 2026-09-15 20:17; Vercel green) — then: Production code (`origin/main` = `9f1f6da`) does not have the roles yet: after
  deploying, turn on «Ruoli 50/30/20» in Impostazioni (the script does not write `spendingRolesEnabled`). Until the
  deploy, avoid editing categories from the live app (a subcategory edit could rewrite the array without its role
  override).
- [ ] **Dark Lime Frost**: the five open decisions of the Carta (ground tint, hover direction, lime as text, series
  lightness, neutral «Elimina» on navy), then the same page audit in dark, desktop and iPhone.
- [ ] **Composite class chip** (owner, 09-24): in Patrimonio › Strumenti a composite instrument (a 60/40 fund, a
  leveraged equity/bond ETF) stays ONE row — it is one instrument — but its chip shows only the prevailing class
  (`resolveDisplayAssetClass`), so a 60/40 reads as pure «Azioni». Make the chip split: one segment per composition
  leg, each tinted like that class's own chip (`AssetClassChip`: `getAssetClassCssVar`, 15% fill, 30% border), the
  owner's picture being half Azioni, half Obbligazioni. Where: the desktop row (`StrumentiTile.tsx`, the `Classe`
  column) and the phone row (`AssetRow.tsx`); NOT the group header, which names the group, and the row stays grouped
  and sorted under the prevailing class. To settle in the session: equal halves or widths by composition (60/40), the
  label for two legs and for three or more («Azioni · Obbl.», «Misto»), the accessible name with the shares («Azioni
  60%, Obbligazioni 40%»), and a phone width that does not squeeze the name. Same look-through as Classi and the
  Piano (`assetClassLegs` in `assetDisplayClass.ts`), so the three surfaces tell one story.
- [x] **Piano on a leveraged portfolio misses upstream's 09-21 redesign** (#377) — **upstream PR #391, in the fork since 09-25** (merged ahead of upstream): with `targetLeverageRatio` the Piano
  takes the leverage engine's flat `InstrumentTrade` list (`view.trades`), so no class row with its instruments
  under it, no withholding estimate (`estimatePlanSaleTax` reads `PlanNode`s only, `allocazioneSummary.ts` ~457) and a
  GROSS withdrawal (`grossedUp: false`). Same gap in upstream's own code (its demo has no leverage, so it never shows).
  To do: group the trades by class into `MoveRow`s with legs, price the sold instruments through `estimateSaleTax`,
  solve the net withdrawal (`solveWithdrawalGross`) on the leverage path too; tests + mirror. Candidate PR to upstream.
- [ ] **Lime Frost fails upstream's chart-distinctness floors** (`__tests__/chartPaletteDistinctness.test.ts`, which
  lists the twelve upstream blocks, not Lime Frost): light Liquidità ↔ Trend Following ΔE00 11,7 (< 14), and dark's
  slots are not the light ones' hue bands (Azioni 264° light vs 128° dark). Settle it with the dark decisions, then add
  `'lime-frost'` to the test's `THEMES`. `--chart-9` (Previdenza band) was added on 09-21 at hue 40, unreviewed.
- [ ] The annual-cost amber and the sign rule are Lime-only: decide whether they become fork-wide.
- [ ] Commit, push and PR of `feat/ui-lime-frost-agentation`; build and Playwright not run on the 09-15 passes.
