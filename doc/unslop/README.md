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
| 2 | A3, M5, N1, N3 | AI button, header words, curve, tile border | not started |
| 3 | A4, M7, N2 | Stretched tiles, FIRE head, empty Hall of Fame (Mac measurements) | not started |
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
