# Anti-slop UI refactor — dossier

Source: the desktop report «Quanta AI slop c'è nell'app» (2 November 2026, 1440px, Lime Frost light plus
Panoramica in dark and Graphite): <https://claude.ai/artifact/LY6A5L28KkgKqDwHaHkh2T>. Verdict «slop leggera»:
the palette, layout and components stay, only the points below are polished. The report mixes two checklists
(unslop and taste-skill) that sometimes disagree; where they do, the report's «correzione» is what is proposed.

**Working rule (owner, 2026-11-02).** One session per group of points, in the report's order. Every session first
spells out the problems it addresses (report ID, where, what changes) and asks the owner, point by point, whether
he really wants the change. Only accepted points are implemented; refusals are recorded here with the reason.
Sessions do not load the unslop / taste-skill / impeccable skills: they work from this dossier. Accepted rules
become named rules in DESIGN.md at the end of the session that accepts them.

Check every change on **Lime Frost (the fork default) and Graphite, light and dark**.

## Sessions

| # | Points | Subject | State |
| --- | --- | --- | --- |
| 1 | A1, B4, A2 | Type and figures (+ DESIGN.md) | implemented 2026-11-02, draft PR pending |
| 2 | A3, M5, N1, N3 | AI button, header words, curve, tile border | implemented 2026-11-02 (N1 refused), PR pending |
| 3 | A4, M7, N2 | Stretched tiles, FIRE head, empty Hall of Fame | implemented 2026-11-02, PR pending |
| 4 | M1, M2, M3, M6 | Number formats, text sizes, pills, Cashflow verdict | implemented 2026-11-02, PR pending |
| 5 | M4 (if wanted), B1–B3, N4, N5 | Page ground, chart weights, spacing, motion, violet, nav | implemented 2026-11-03, PR pending |

## Session 1 — «Tipografia e cifre»

### Points

**A1 — spaced uppercase labels at 9–10px on every tile** (high; report: confirmed by both checklists).
Where: `components/ui/tile.tsx` `TILE_EYEBROW_CLASS` (`text-[10px] font-semibold uppercase tracking-[0.1em]`) and
`TILE_SUB_EYEBROW_CLASS` (`text-[9px] … tracking-[0.08em]`), used by 115 files. Proposal: 12px, weight 500,
sentence case, no tracking. Conflicts with DESIGN.md: *Eyebrow Label*, *The One-Eyebrow Rule*, scale steps
`eyebrow`/`sub-eyebrow`, «One eyebrow voice».

**B4 — leftover uppercase labels outside the tiles** (low). Where: `period-picker.tsx` (Anni, Mesi, Da, A),
`chart-hover.tsx:57`, `ValoreStrumentoTile.tsx`, `EvoluzioneTile.tsx`, `StrumentiTile.tsx` sort buttons,
`OptimizerReport.tsx`, `AccumulationPlanDialog.tsx`, `AssistantPreferencesPopover.tsx`,
`CategoryManagementDialog.tsx`, `ExpenseDialog.tsx`, `GeneraleTab.tsx:818` («Strumenti di sviluppo», orange).
Proposal: same label style as A1, so no uppercase label is left.

**A2 — everything highlighted: bold/coloured figures and a 54px hero** (high; taste-skill corrected the report:
the hero's issue is its size, not the weight). Two separable parts:
- **A2a, hero size.** `RendimentoTile`, `PatrimonioTile`, `ProbabilitaTile`, `TettoTile`: 44px mobile / 54px
  desktop, weight 700, mono, tracking −0.03em. Proposal: 40px desktop (the overflow guard steps become 32/…),
  weight 600. Conflicts with DESIGN.md: *Display — Page Hero*, `page-hero-desktop`.
- **A2b, figures inside prose.** `narrative-text.tsx` (`figureClassName = 'font-semibold'`, mono) and the verdict
  paragraph: today every figure is mono, bold and sign-coloured (9 figures, 6 coloured, on the Panoramica).
  Proposal: figures stay mono but in the text colour at regular weight, colour only on the figure that answers the
  headline; variations as text with their period («+1039 € su ottobre»), not as a pill. Conflicts with DESIGN.md:
  *Reading Line* («figures are `font-mono font-semibold` and take the sign colour»), «the figures inside it are
  mono and sign-coloured».

### Decisions (owner, 2026-11-02)

| ID | Point | Decision | Alternatives discarded | Reason |
| --- | --- | --- | --- | --- |
| D-AS1 | A1 | **Yes, as proposed**: eyebrow and sub-eyebrow 12px, weight 500, sentence case, no tracking | keep; 11px | confirmed by both checklists; 9–10px caps was the least legible text on the page |
| D-AS2 | B4 | **Yes, all** residual uppercase labels (picker, hover labels, table heads, dialogs, «Strumenti di sviluppo») | leave tables; leave all | one label style, no second register |
| D-AS3 | A2a | **40px, weight 600** (hero and its overflow guard 32px) | 48px; keep 54px | taste-skill: in a work screen no figure exceeds 40px |
| D-AS4 | A2b | **Only drop the bold** of the figures in the verdict / reading line (`NarrativeText` default `font-semibold` → `font-normal`); sign colours stay | full proposal (colour only the key figure, variations as text); keep | owner kept the colours, wanted less weight |

### Implemented (branch `claude/unslop-s1-tipografia`)

- `components/ui/tile.tsx`: `TILE_EYEBROW_CLASS` and `TILE_SUB_EYEBROW_CLASS` → `text-xs font-medium text-muted-foreground`.
- B4: every `uppercase` label in `app/` and `components/` outside the PDF primitives (print tokens stay): period picker,
  chart hover labels, Strumenti sort heads, Optimizer report, PAC dialog, model/ideal-composition/objectives dialogs,
  Piani conclusi, EntityDossier, calendar cell, cashflow andamento chart, assistant preferences, category and expense
  dialogs, `GeneraleTab` dev tools. Left: the `Badge` in `AssistantThreadList` (a badge, not a label).
- A2a: `resolveHeroValueClass` (Patrimonio, Costo, Totale, Fondo oggi), `RendimentoTile`, `ProbabilitaTile`,
  `TettoTile`: 40px / 600 on every width (the mobile 44px was dropped too, a phone hero larger than the desktop one
  made no sense; the mobile report will revisit phone sizes), guard 32px.
- A2b: `NarrativeText`/`NarrativeSegments` default and the landing's explicit `font-semibold` → `font-normal`. Asides
  and footers that pass `font-medium` keep it; sub-labels such as the Cashflow window label (`font-semibold` figure
  inside a label) are not touched.
- DESIGN.md: **The Sentence-Case-Label Rule**, **The Quiet-Figures Rule**; Eyebrow Label, Page Hero, Reading Line, One-Eyebrow Rule, tile anatomy and the frontmatter hero rewritten.

### Checks

`npx tsc --noEmit` clean; `TZ=Europe/Rome npx vitest run`: 7463 / 7464 (the one red is `monteCarloDefaultsArchive`, the known cloud-only flake, unrelated). Screenshots before/after at 1440, Lime Frost light and dark, Graphite light and dark (Panoramica; Cashflow and Rendimenti in Lime Frost light and Graphite dark), in the project library `unslop/s1/`. Not run: Playwright suite and `mobile:budget` (Mac).

### Refused points

None.

## Session 2 — «Pulsante AI, testata, curva, tile»

Mac collaudo (`test:e2e`, `mobile:budget`) is done once, at the end of the whole refactor (owner, 2026-11-02).

### Points

**A3 — «Analizza con AI» with sparkles and violet glow** (high). Where: `app/dashboard/performance/page.tsx:298–310` (header button: violet border,
text and 14px glow on hover, sparkles icon rotating and scaling) and `:728–730` (second button with the same label and
icon); the `--ai-accent` token in `app/globals.css:133,312` and DESIGN.md (frontmatter, *AI accent*), whose only use is that hover;
`components/assistant/AssistantPromptRows.tsx:49` (a muted Sparkles icon). Proposal: a plain outline button like its
neighbours, a still document icon, a label that names the result («Commento del periodo»), hover = the other buttons'
background change; delete `--ai-accent`. Open: the label wording.

**M5 — greeting and generic subtitles in the page header** (medium). Where: `lib/utils/getGreeting.ts` (Buongiorno /
Buon pomeriggio / Buonasera + a subtitle such as «Aggiornamento pomeridiano») used by `app/dashboard/page.tsx:197`; the Cashflow
subtitle «Traccia e analizza le tue entrate e uscite nel tempo» (`app/dashboard/cashflow/page.tsx`); FIRE «Libertà finanziaria e sostenibilità del
piano»; the section eyebrow («Operatività», «Analisi», «Pianificazione») before the page name, which the sidebar already says. Proposal: title =
page name, then a fact («lunedì 2 novembre 2026», «novembre 2026»), no greeting, no section eyebrow.

**N1 — the net-worth curve is smoothed and invents values** (medium). Where: `components/dashboard/NetWorthSparkline.tsx:39–53`
(`catmullRomPath`), used by the Panoramica and Patrimonio tile; `type="monotone"` in 16 more files with Recharts. Points are month-end
snapshots: the spline draws bumps and valleys the data does not have. Proposal: straight segments through the real points
(`linePath` as a polyline; `type="linear"` in the Recharts charts), 2px, the fade under the line stays.

**N3 — border and shadow together on every tile** (low). Where: `TILE_SURFACE_CLASS` in `components/ui/tile.tsx:95`
(`border border-border … shadow-sm`). Proposal: drop `shadow-sm`, keep the border; shadows stay for what floats (menus, popovers, dialogs).

### Decisions

| ID | Point | Decision | Alternatives | Reason |
| --- | --- | --- | --- | --- |
| D-AS5 | A3 | **Yes, neutral button, keep the name «Analizza con AI»** (outline, still document icon, no glow, `--ai-accent` deleted) | rename to «Commento del periodo»; keep | owner kept the label |
| D-AS6 | M5 | **Yes, all**: no greeting, no section eyebrow, no generic subtitle | greeting and subtitle only; keep | the sidebar already says the section |
| D-AS7 | N1 | **Refused**: the curve stays smoothed | straight segments in every line chart; in the net-worth curve only | owner's call, no reason given |
| D-AS8 | N3 | **Yes**: no `shadow-sm` on tiles, border stays | keep | one line, reversible |

### Implemented (branch `claude/unslop-s2-pulsante-ai`)

- A3: `performance/page.tsx` both AI buttons (`FileText` icon, plain outline / ghost, no hover glow or rotation); `--ai-accent` removed from `app/globals.css`, DESIGN.md and `.impeccable/design.json`.
- M5: `PageHeader` loses the `label` prop and its eyebrow (all callers updated); Panoramica title is «Panoramica» + today's date (`getGreeting.ts` and its test deleted); the generic descriptions of Cashflow, FIRE, Previdenza and Analisi are gone (no fact to state: title alone). Pages that already state a fact (Patrimonio, Rendimenti, Storico, Allocazione, Hall of Fame, Assistente) keep it.
- N3: `TILE_SURFACE_CLASS` without `shadow-sm`.
- DESIGN.md: **The Quiet-Header Rule**, **The Border-Not-Shadow Rule**, **The Neutral-AI Rule**; the sidecar's stale hero purpose (54px) corrected.
- Checks: `tsc` clean; Vitest 7446 / 7447 (the same cloud-only `monteCarloDefaultsArchive` flake); screenshots in the project library `unslop/s2/`.

### Refused points

- **N1** (D-AS7): smoothed net-worth curve and `type="monotone"` charts stay as they are.

## Session 3 — «Griglia e stati vuoti»

Mac collaudo (`test:e2e`, `mobile:budget`) is done once, at the end of the whole refactor (owner, 2026-11-02). Sketch «oggi / proposta»: <https://claude.ai/artifact/EP6DogWxBWsThqafei8CNu>.

### Points

**A4 — tiles stretched to the row height, with white gaps** (high; taste-skill corrected the report: tiles of one row at different heights are an error too, so the order is balance the content, fill the empty tile with a reference datum, stretch last). Where: `TILE_CELL_CLASS` (`[&>section]:flex-1`); seen on Patrimonio «Movimenti del mese» (one line in 270px) and Analisi «Fuori scala» (one sentence in 435px).

**M7 — five bands before the FIRE verdict** (medium). Where: `FireAssumptionsRow` on the six FIRE tabs: header, «Il mio piano», tabs, «Ipotesi usate» with the capital, four mono chips, and only then the verdict at 260px from the top.

**N2 — empty Hall of Fame is a blank screen** (medium). Where: `app/dashboard/hall-of-fame/page.tsx`, branch `!summary.hasRecords`: title, two lines, 700px of ground; the actions sit at the top right.

### Decisions (owner, 2026-11-02: «B, B e B»)

| ID | Point | Decision | Alternatives discarded | Reason |
| --- | --- | --- | --- | --- |
| D-AS9 | M7 | **B**: «Ipotesi usate» is the verdict's scope line («Ipotesi: Base r% reale, costi c%» + «Dettagli» popover) at every width; the row of chips is deleted | keep; keep the row without chips | the phone already does it; the title answers first |
| D-AS10 | A4 | **B**: an empty tile shows its sentence and a labelled reference datum (Movimenti: the last three trades of the month before; Fuori scala: the category nearest to its threshold, `nearestToAnomaly`) | leave; shorten the empty tiles (ragged row bottoms) | taste-skill rejects both the white gap and the ragged row |
| D-AS11 | N2 | **B**: at 1440 the empty page draws Record del patrimonio, Entrate and Risparmio as tiles with one sentence each and «Vai alla Panoramica» where the first record will appear | leave; the button alone under the verdict | the page keeps its frame |

### Implemented (branch `claude/unslop-s3-griglia-vuoti`)

- M7: `FireAssumptionsRow.tsx` keeps only `FireVerdictScope` (the row and its chips deleted); the six tabs pass `scope` at every width; the verdict cell gets `desktop:pt-4` where the row's bottom margin used to be. `e2e/fire.spec.ts` reads the line and its popover instead of the chips.
- A4: `detectSpendingAnomalies` split into `measureSpendingCategories` + the thresholds, new `nearestToAnomaly` (test in `__tests__/cashflowComposition.test.ts`); `FuoriScalaTile` takes `nearest`; `MovimentiTile` takes `previous` (the month before's `summarizeMonthTrades`) and shows its first three rows under «Gli ultimi, di {mese}» when the month is empty and its ledger is read. The other stretched tiles are unchanged.
- N2: the empty branch of Hall of Fame renders three tiles (regions named «In attesa: …», so no spec of the real tiles matches them) and the Panoramica link, at `desktop:` only.
- DESIGN.md: **The Empty-Tile-Has-A-Reference Rule**, **The Frame-Stays Rule**, **The Assumptions-Under-The-Verdict Rule**.
- Checks: `tsc` clean, eslint clean; screenshots at 1440 Lime Frost light and Graphite dark (FIRE, Patrimonio, Analisi, Hall of Fame empty). The census fixture has no trades in the month before and no expenses in the running month, so the two reference rows were not seen on screen: covered by the unit test only. Not run: Playwright and `mobile:budget` (Mac, at the end of the refactor).

### Refused points

None.

## Session 4 — «Formati, scala, pillole, verdetto di Cashflow»

Mac collaudo (`test:e2e`, `mobile:budget`) is done once, at the end of the whole refactor (owner, 2026-11-02).

### Points

**M1 — mixed number formats** (medium). Panoramica: hero «301.955,00 €», «8000,00 €» in Sintesi, «8000 €» in Composizione, «+1039,00 €» beside «−2760 €» in the verdict; Storico «+7320 € ( +2,5% )».
**M2 — 20 fixed text sizes**, 548 uses of 11px and 86 below it (9 · 9,5 · 10 · 10,5px).
**M3 — pills everywhere**: the green variation capsule under every hero, «Massimo storico», «↗ COMPRA» in uppercase with icon and bold in Allocazione.
**M6 — Cashflow verdict says the calendar twice**: the paragraph («Con 3840 € di spese e 5000 € di entrate già in calendario…») and the scope line under it («Nel totale ci sono ancora…»).

### Decisions (owner, 2026-11-02)

| ID | Point | Decision | Alternatives discarded | Reason |
| --- | --- | --- | --- | --- |
| D-AS12 | M1 | **Whole euros in tiles, verdicts, strips and charts**; cents only in the register, accounts, tables and dialogs | only the same-view inconsistencies; leave | one rule in `formatters.ts` |
| D-AS13 | M2 | **Drop only the intermediate steps**: 9 · 9,5 · 10 · 10,5 → 11; 15 → 14; 17 · 18 → 16; 20 · 24 → 22; 28 · 32 · 34 → 30; 36 · 42 → 40; 11px stays the floor | scale of 7 steps with a 12px floor (550 uses, mobile risk); leave | low risk; the 11 → 12 step can be a later session |
| D-AS14 | M3 | **Quieter pill**: «compra / vendi / ok» lowercase, 11px, no icon, no bold; the variation under a hero and «Massimo storico» become text in the sign colour | words without a pill; leave | an in-row status word is fine, a capsule under every number is not |
| D-AS15 | M6 | **Shorten the paragraph**: «Il mese chiude a +1160 € (il 23%).» / «Senza entrate attese, l'anno chiude…»; the scope line stays | drop the scope line; leave | the scope line keeps the strip's totals bound to the calendar at every width |

### Implemented (branch `claude/unslop-s4-formati`)

- M1: `formatSignedEuro` compact by default; `signedCurrency` of `overviewNarrative` and `patrimonioNarrative` compact by default; every `cachedFormatCurrencyEUR(x)` of the Panoramica, Patrimonio, Mutuo, Storico, Previdenza and Allocazione tiles, the narratives and `composition-list` now `…, true`; Storico/FIRE/Labor chart tooltips and the Sankey at 0 decimals; the two strip cells with `decimals: 2` on a euro lost it. Storico's chip no longer prints «( +2,5%)» (the flex gap sat inside the parenthesis).
- M2: 122 `text-[Npx]` classes snapped to the ladder above (no class left in 9–10,5, 15, 17, 18, 20, 24, 28, 32, 34, 36, 42); chart `fontSize: 10` → 11 in five charts; redundant `desktop:` twins removed. The ladder is now 11 · 12 · 13 · 14 · 16 · 22 · 30 · 40px.
- M3: the five hero variation capsules (`VariationChip`, Storico, Rendimenti, Fondo oggi, Incasso netto) and «Massimo storico» are text; `ActionChip` lowercase, no icon.
- M6: `calendarSentence` no longer repeats the amounts.
- DESIGN.md: **The One-Euro-Format Rule**, **The Fewer-Steps Rule**, **The Quiet-Pill Rule**, **The One-Sentence-Per-Fact Rule**; the scale in the frontmatter, the Verdict Headline (22px mobile), ActionChip and the hero guard (30px) updated.
- Checks: `tsc` clean, eslint clean, Vitest 7449 / 7449 (35 expectations rewritten to whole euros and the new Cashflow sentence); screenshots before / after at 1440 Lime Frost light and Graphite dark in `unslop/s4/`. Not run: Playwright (specs that read «COMPRA» or cents may need updating on the Mac) and `mobile:budget` (text sizes changed on phones too).

### Refused points

None.

## Session 5 — «Fondo, grafici, spaziature, transizioni, viola, menu»

Mac collaudo (`test:e2e`, `mobile:budget`) is done once, at the end of the whole refactor (owner, 2026-11-02).

### Points

**M4 — Lime Frost page ground** (medium). Light ground pea green (C 0.020), dark ground night blue (C 0.041); in dark the sidebar shared the ground while the tiles were slate.
**B1 — Income/spending bars at equal weight** (low). Cashflow › Tracciamento «Ultimi 6 mesi»: twelve saturated bars, the current month marked only by a band.
**B2 — Spacing off the 4px grid** (low). 52 `py-[9px]`, 6 `px-[11px]`, 7 `py-[7px]`, 6 `mt-[18px]`; 16 icons at 13px.
**B3 — `transition-all` and unused motion** (low). `transition-all` in 8 files (the `Button` base among them), `hover:animate-pulse` and `hover:scale-110` in `multi-select.tsx`, `hover:scale-105` on the colour dots of two dialogs.
**N4 — Violet in the data, a legend on one series** (low). Immobili violet (slot 4) in Composizione, Storico and Allocazione; «Portafoglio» legend over Rendimenti › Crescita di 100.
**N5 — Green active nav row** (low). Lime Frost light: the sidebar's active row was a pale green pill.

Sketch page (today · proposal, real screenshots): <https://claude.ai/artifact/QtYaLRDLXQHeTyYBhi4dcy>; the dark-theme comparisons for M4: <https://claude.ai/artifact/GfYdgTxoJxxhoCsqy4oMYu>.

### Decisions (owner, 2026-11-03)

| ID | Point | Decision | Alternatives discarded | Reason |
| --- | --- | --- | --- | --- |
| D-AS16 | M4 | **Light untouched; dark keeps its night-blue ground and slate tiles, the sidebar takes the tiles' colour** (`--sidebar` = `--card`) | dark ground cool grey 0.15 or 0.17 (with or without grey tiles); night-blue ground with neutral or cool-grey tiles and sidebar | the only change that makes dark mirror light (ground = the theme's colour, sidebar and tiles = one surface) without moving the theme's tones; the report's «no navy ground» stays refused by choice |
| D-AS17 | B1 | **Past months in grey**, the page's month in the series colours | leave | one accent per chart, on the month that answers |
| D-AS18 | B2 | **Padding and margins on the 4px grid**; 13px icons stay | also the icons; leave | invisible change, rows 1px apart today |
| D-AS19 | B3 | **Named transitions, no hover scale, no pulse** | only `transition-all`; leave | no visible change; motion only where it explains |
| D-AS20 | N4 | **Immobili brown (hue 55) in Lime Frost and Graphite; no legend on a single series** | only the legend; only the tint; leave | violet was the loudest colour on Storico and Allocazione |
| D-AS21 | N5 | **Neutral grey active row** in Lime Frost light | leave | the frame carries no accent |

### Implemented (branch `claude/unslop-s5`)

- M4: `.dark[data-theme="lime-frost"]` `--sidebar` from the ground's night blue (0.1288 0.0406 264.7) to the tiles' slate (0.2077 0.0398 265.8); nothing else in the dark block moves.
- B1: `FlowBarsChart` paints the non-highlighted months `color-mix(in oklab, var(--muted-foreground) 40% / 75%, var(--card))`; the scheduled month keeps its 0.45 opacity.
- B2: `py-[9px]`/`py-[7px]` → `py-2`, `px-[11px]` → `px-3`, `mt-[18px]` → `mt-5` in 57 files; `h-[13px]`/`w-[13px]` icons untouched.
- B3: `transition-all` replaced by named properties in `button.tsx`, `tabs.tsx`, `sidebar.tsx` (rail), `multi-select.tsx`, `GoalFormDialog`, `CategoryManagementDialog`, `AspettoTab`, `SubTargetEditor`; `multi-select`'s `pulse` variant removed and `lift` no longer scales (it is the default badge animation, so it was not unused as the report said: it lifts 2px); `hover:scale-105` removed from the colour dots of `CategoryManagementDialog` and `CostCenterDialog`.
- N4: `--chart-4` in Lime Frost (light 0.52 0.08 55, dark 0.58 0.06 55) and Graphite (light 0.42 0.07 55, dark 0.52 0.05 55). A first try in teal (hue 195) failed `chartPaletteDistinctness` against Trend Following (ΔE00 7.4–7.9); brown passes. Storico's «Tasse sulle vendite» series reads slot 4 too and is brown with it. `RendimentoTile` shows its `SeriesLegend` only with a benchmark.
- N5: Lime Frost light `--sidebar-accent` 0.94 0.004 257.
- DESIGN.md: **The One-Accent-Per-Chart Rule**, **The Four-Pixel Rule**, **The Named-Transition Rule**, **The No-Violet-Data Rule**, **The Neutral-Frame Rule**.
- Checks: `tsc` clean, eslint clean on the changed files, Vitest 7448 / 7449 (the one red is `monteCarloDefaultsArchive` AQ42, the known intermittent of the full run); `chartPaletteDistinctness`, `limeFrostTheme`, `graphiteTheme` 397 / 397. Screenshots at 1440 Lime Frost light and dark. Not run: Playwright and `mobile:budget` (B2 moves row heights by 1px: re-measure on the Mac at the end of the refactor).

### Refused points

- M4's dark ground: kept night blue by the owner's choice after four dark variants side by side (D-AS16).

## Follow-up — the past months' greys (2026-11-03)

The owner's four iPhone screenshots of Cashflow › Tracciamento after session 5 (Lime Frost and Graphite, light and dark), measured pixel by pixel against the tokens of main `7eb161d` (they match): the greys of B1 were one formula for every theme (income 40%, spending 75% of `--muted-foreground` into the tile). Sketch page (today · proposal, the real tokens): <https://claude.ai/artifact/7eyrBfMuiVWmtjLhxv8NL8>.

| Theme | Past income | Past spending | Month's income | Month's spending |
| --- | --- | --- | --- | --- |
| Lime Frost light | 1.81:1, slate 257 | 3.37:1 | 3.14:1 | 3.24:1 |
| Lime Frost dark | 2.00:1 | 4.22:1 | 8.26:1 | 8.05:1 |
| Graphite light | 1.82:1, C 0 | 3.36:1 | 5.58:1 | 3.13:1 |
| Graphite dark | 1.99:1 | 4.24:1 | 6.65:1 | 3.67:1 |

### Decisions (owner, 2026-11-03)

| ID | Decision | Alternatives discarded | Reason |
| --- | --- | --- | --- |
| D-AS22 | **Lime Frost's greys stay slate** | pure grey (C 0); a green-tinted grey | slate is every neutral of the theme (text, borders, pill); a green grey would read as a faded income |
| D-AS23 | **The weight, not the lightness, is the rule**: income the grey nearer the tile, spending the farther, so in dark income is the darker one; DESIGN.md said «income lighter» | fixed lightness (income always lighter) | the pair weighs the same in both modes |
| D-AS24 | **Graphite swaps the pair** (income 75%, spending 40%) | leave | in Graphite income is the strong blue of the month; the past spending grey outweighed November's spending bar |
| D-AS25 | **Lime Frost light spending grey 75% → 65%** (2.79:1); dark unchanged | leave | the grey outweighed the month's colours (3.1–3.2:1) |
| D-AS26 | **The greys are reference data under 3:1 by choice**; the code comment that claimed 3:1 corrected | both greys to ≥ 3:1 (spending ≈ 4.5:1) | at 3:1 the past months would outweigh the one accent |

### Implemented (branch `claude/project-thread-cbbht8`)

- `--flow-past-in` / `--flow-past-out` in the four blocks of Lime Frost and Graphite; `FlowBarsChart` reads them, with today's formula as the fallback for every other theme.
- DESIGN.md → The One-Accent-Per-Chart Rule rewritten on the weight.
