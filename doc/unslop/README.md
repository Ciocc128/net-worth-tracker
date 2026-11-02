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
| 4 | M1, M2, M3, M6 | Number formats, text sizes, pills, Cashflow verdict | not started |
| 5 | M4 (if wanted), B1–B3, N4, N5 | Page ground, chart weights, spacing, motion, violet, nav | not started |

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
