---
name: Net Worth Tracker
description: Precision financial dashboard for Italian self-directed investors.
# OKLCH-native project. Stitch linter will flag non-hex values; OKLCH is the canonical format.
colors:
  # Achromatic neutrals — default theme (dark mode = primary experience)
  deep-void: "oklch(0.145 0 0)"
  charcoal-surface: "oklch(0.205 0 0)"
  graphite-lift: "oklch(0.269 0 0)"
  off-blanc: "oklch(0.985 0 0)"
  near-white: "oklch(1 0 0)"
  mid-ash: "oklch(0.708 0 0)"
  subtle-ash: "oklch(0.556 0 0)"
  border-ghost: "oklch(1 0 0 / 10%)"
  border-stone: "oklch(0.922 0 0)"
  # Data visualization (dark mode defaults)
  indigo-signal: "oklch(0.488 0.243 264.376)"
  jade-return: "oklch(0.696 0.17 162.48)"
  amber-watch: "oklch(0.769 0.188 70.08)"
  violet-risk: "oklch(0.627 0.265 303.9)"
  coral-loss: "oklch(0.645 0.246 16.439)"
  # Semantic — sign colours. These are the DEFAULT theme's values; the five named themes
  # override destructive (positive they inherit). All are chosen to clear WCAG AA 4.5:1 as
  # text against their own theme's --card, which a chart slot is never constrained to do.
  destructive: "oklch(0.577 0.245 27.325)"
  positive: "oklch(0.482 0.194 149.214)"
  warning-foreground: "oklch(0.468 0.098 75)"
typography:
  # The enumerated Trade Republic ramp. The named roles below describe the generic
  # Geist Sans/Mono hierarchy; this scale is the project's actual step ladder, spelled
  # out in section 3 (Typography) and enforced by "the jump from 22->36->44->54 is
  # intentional". It lives here because the roles alone cannot express a ramp, and the
  # machine-readable layer must agree with the prose — otherwise tooling reads the
  # documented hero sizes as off-system values.
  scale:
    sub-eyebrow: "9px"          # compact-cell eyebrow (section 3)
    eyebrow: "10px"             # Eyebrow Label above a dominant number
    metadata: "11px"            # tertiary metadata, invisible at a glance
    delta: "12px"               # Delta Annotation under a KPI value; Variation Chip inside a tile
    row: "13px"                 # list/composition row text
    chip: "15px"                # verdict sentence on desktop (section 3); the 15px hero chip retired with Patrimonio, tiles use 12px
    compact-hero: "18px"        # secondary row value inside a tile that has its own hero
    sub-hero: "22px"            # paired secondary values, tile KPIs
    verdict: "24px"             # Verdict Headline, mobile (section 3)
    verdict-desktop: "30px"     # Verdict Headline, desktop
    hero-step-down: "32px"      # hero overflow guard, mobile (see AGENTS.md)
    section-hero: "36px"        # primary metric of a section or bento card
    hero-step-down-desktop: "40px"  # hero overflow guard, desktop (see AGENTS.md)
    page-hero: "44px"           # the single dominant number, mobile
    page-hero-desktop: "54px"   # the single dominant number, desktop
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  numeric:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.off-blanc}"
    textColor: "{colors.charcoal-surface}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.border-stone}"
    textColor: "{colors.charcoal-surface}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.off-blanc}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.mid-ash}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 12px"
  card-default:
    backgroundColor: "{colors.charcoal-surface}"
    textColor: "{colors.off-blanc}"
    rounded: "{rounded.xl}"
    padding: "24px"
  tile-default:
    backgroundColor: "{colors.charcoal-surface}"
    textColor: "{colors.off-blanc}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.off-blanc}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  badge-default:
    backgroundColor: "{colors.off-blanc}"
    textColor: "{colors.charcoal-surface}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
---

# Design System: Net Worth Tracker

## 1. Overview

**Creative North Star: "Effortless Precision"**

This system is built for one purpose: total clarity about your financial position. The design ambition is to be the Apple of personal finance trackers — not the most feature-rich instrument, but the one that makes you immediately understand your financial situation, beautifully and effortlessly. Every element earns its place by communicating a number, a trend, or a relationship. The aesthetic draws from three co-primary references: Linear/Vercel clarity, Trade Republic data hierarchy, and Apple's effortless premium.

**Linear / Vercel** provides the structural foundation: tight geometry, achromatic palette, strong typography, physics-native motion, zero decorative chrome.

**Trade Republic** provides the data hierarchy: the primary number dominates physically and visually. Layout flows vertically — dominant value → inline variation chip → small label metadata. Flat `divide-y` lists instead of card-within-card nesting. No decorative progress bars. No box-within-box. Visual chrome is reduced to its structural minimum: only what separates, never what decorates.

**Apple (Stocks, Wallet, Health)** provides the quality benchmark: complex data made effortlessly readable. Generous whitespace as a design material — not wasted space, but earned breathing room. Light mode equally premium to dark. Surfaces that feel considered and valuable. Progressive disclosure: the essential at a glance, depth on interaction. The interface recedes so the numbers speak.

The three references are compatible. All share zero tolerance for decoration that doesn't carry information, strong typography as structure, and the conviction that simplicity is harder to achieve than complexity.

**The Unifying Law — Form Follows Function.** Beneath all three references sits a single conviction, the one Jony Ive carries forward from the modernist tradition: form follows function. Every visual property of every element — its size, weight, color, position, motion, even its corner radius — is a *consequence* of what that element does, never a costume applied to it afterward. A number is large because it is the most important fact on the screen, not because "large" looks impressive. A border is 1px at 10% opacity because that is precisely the contrast required to separate — no more. Motion exists to reveal a relationship the eye would otherwise miss. When form and decoration disagree, function wins, every time. Three corollaries follow Ive's reading of the principle: **honesty** — a surface never fakes a depth, material, or state it doesn't have (no false glass, no invented shadow hierarchy); **deference** — the interface is a quiet instrument that recedes so the data can speak; **inevitability** — a well-resolved element looks like the only possible answer, as if it could not have been otherwise. This law is the *why* behind every rule that follows: zero-chroma, the Mono Mandate, ambient elevation, chrome reduction — each is form bending to function, not the reverse.

Both dark and light modes are primary, equally refined experiences. An Italian investor reviewing portfolio performance deserves precision and premium quality regardless of their environment or preference.

The five named color themes (Solar Dusk, Elegant Luxury, Midnight Bloom, Cyberpunk, Retro Arcade) are personality layers on top of a structural foundation. They change accent and surface palette without touching the underlying type scale, radius, or component API. The default theme is the instrument in its raw state. The themes are its finishes.

**The 2026-08-22 turn — Verdict over Tiles.** The Panoramica redesign settled the shape every page will take: a *verdict* — one rule-generated sentence that answers the page's question before any number — over a *grid of tiles*, each answering one question with a one-line reading above its figures. Chrome stays what it was (achromatic, 16px cards, flat rows); what changed is the order of reading: words first, then numbers, then detail. Pages are propagated onto this shape one at a time; patterns the Panoramica superseded are marked as such below and stay documented until the last page that uses them is redesigned. The shell followed on the same day: the compact header became the default, the sidebar and the phone drawer took the tiles' eyebrow as their group label, the assistant banner became a plain route, and the frame receded enough for the verdict to be the first thing read. Patrimonio was the first page propagated (2026-08-22, evening): the same verdict shape with an *instrument* as the driver of the month, five tiles over the hero, and the management table kept as a table but given the tile's cadence — eyebrow, reading line, then the rows (see **Table inside a Tile**). Cashflow › Tracciamento followed the same night: the verdict answers «come sta andando il mese?» for whatever period the picker selects — the picker sits beside the verdict, because it is the page's one axis — over four tiles and the transaction feed, which stays the last tile as the inventory it is (see **Feed inside a Tile** and **In-tile Bars**). Cashflow › Dividendi was the third (2026-08-23): the verdict answers «quanto rendono i miei flussi?» over six tiles, one of which — Rendimento — is measured on a window the picker cannot change and therefore names its own (see **The Off-Axis Tile Rule**), and the whole page keeps money already in the account visibly apart from money merely announced (see **The Received-vs-Announced Rule**). Cashflow › Budget was the fourth (2026-08-23): the verdict answers «sto rispettando il budget?» with no period axis at all — a budget is always read on the running month, and the one tile measured year-to-date (Budget annuali) names its own window — over five tiles whose bars carry today's mark so a used share is read against the calendar's (see **Budget Track**), and whose projected overruns and crossed thresholds never share a tile (see **The Risk-vs-Fact Rule**); the configuration (ceiling, alerts, thresholds) lives below the grid behind a disclosure, open only while no ceiling is set. Cashflow › Centri di Costo was the fifth (2026-08-23): the verdict answers «quanto sta costando il progetto?» with no period axis at all — a project's cost is its whole cost, so every figure is «in totale» and a tile measured on another window names it («quest'anno», «ultimi 12 mesi», the ceiling's own month or year with today's mark) — over three tiles for the list (the total with the trailing months stacked by center, the ranked inventory, the dormant centers) and five for one center (its cost with the ceiling's track and the month-end and year-end projections at the app's one rule, the composition by category and by subcategory with a session-only «al netto di» lens, the lifecycle dates, the linked movements), the archived centers below the grid behind a disclosure; the verdict ranks a crossed ceiling over a projected one over the most expensive center (the Risk-vs-Fact Rule again), and a dormant or archived center gets no projection (see **The Whole-Cost Corollary** under The Off-Axis Tile Rule). Analisi was the sixth (2026-08-25): the verdict answers «dove vanno i soldi, e cosa è cambiato?» for the three-mode axis the page already had (Anno corrente | Anno | Storico, with an optional month) — the axis beside the verdict, the entity search in the compact header's actions — over five tiles (the period's three figures with their year-over-year pacing and the year's spending per month beside the previous year's, the categories over their own six-month average on ONE month the tile names, the largest single expenses, the full composition of spending and of income as ranked rows that open an entity) and the app's one Sankey inside a wide tile; a focused entity is a tile of the grid too (see **Scheda inside the Grid**), the year-over-year comparison and the reference charts sit below the grid behind two disclosures, and the page keeps its deep-linked focus and its one landing path.

This system explicitly rejects four aesthetic modes: Bloomberg terminal coldness (too dense and impersonal for a personal wealth journal), consumer fintech brightness (Revolut-style gradients and playful fills trivialize serious data), Material Design genericism (component conventions that serve any app therefore serve this one poorly), and **ostentated complexity** (UI that demonstrates how hard the domain is rather than hiding that complexity behind a calm surface).

**Key Characteristics:**
- Form follows function: every visual property is derived from what an element does — honesty over illusion, deference over decoration, inevitability over ornament
- Achromatic structural palette; data colors carry all chromatic meaning in the default theme
- Geist Sans for interface text, Geist Mono for every number that matters
- Radius is refined: 10px (inputs, buttons), 16px (cards) — premium curve without losing authority
- Elevation is ambient: surfaces layer through background steps, shadows are atmospheric whispers
- Motion is physics-native: spring dialogs, ease-out-quart state transitions, circle-reveal theme toggle
- Hierarchy is Trade Republic-style: one dominant value per section, everything else is context
- Chrome reduction is deliberate: flat lists over nested cards, divide-y over borders-on-boxes
- Mobile-first: layouts are designed at 390px first; desktop adds columns, never simplifies
- Light and dark modes are equally premium — different materials, same quality standard
- Verdict first: every page opens with one rule-generated sentence that answers its question before any number is read — the prose is the hero, the figures inside it are mono and sign-coloured
- One tile, one question: a page is a 12-column grid of tiles, each naming its question (eyebrow), answering it in words (reading line), then showing the figures — no tile repeats another tile's rows
- Honest narratives: a sentence never claims what the data cannot support; a missing input drops its clause, it never prints a placeholder
- One eyebrow voice: the 10px/0.1em eyebrow names a tile's question, a page's section in the compact header, and a navigation group in the sidebar and the phone drawer — the frame and the content share one label register

### How this file is read by tooling

This document is the **normative** layer, in two parts: the YAML frontmatter (colors, typography,
`rounded`, spacing, components) is the machine-readable half, the prose below it is the human half,
and the two must always agree — a rule documented here but absent from the frontmatter reads as an
off-system value to any linter.

`.impeccable/design.json` is an **extensions-only sidecar**: tonal ramps, shadows, motion,
breakpoints, component HTML/CSS snippets, narrative. It never redefines a frontmatter token, and its
`narrative` is a verbatim mirror of this file — never paraphrase it, never let it carry a rule this
file lacks.

**Never regenerate this file.** It is hand-maintained and authoritative; CLAUDE.md, AGENTS.md,
PRODUCT.md and every `docs/*-prompts.md` cite it. Extend the frontmatter additively when a real token
is missing, and refresh the sidecar on its own when the sidecar is what is stale.

## 2. Colors: The Zero-Chroma Foundation

The default palette has no hue anywhere. Every neutral is a pure OKLCH gray. Chart colors, financial indicators, and user-chosen themes supply all chromatic energy. The interface does not compete with the data it presents.

### Primary (Structural — Dark Mode)

- **Deep Void** (`oklch(0.145 0 0)`): The page background in dark mode. Zero chroma, minimum lightness. Numbers feel more precise against it than any tinted dark.
- **Charcoal Surface** (`oklch(0.205 0 0)`): Card and modal backgrounds. The first elevation step above the void.
- **Graphite Lift** (`oklch(0.269 0 0)`): Muted panels, secondary surfaces, hovered interactive backgrounds. The second elevation step.
- **Off-Blanc** (`oklch(0.985 0 0)`): Primary text in dark mode; page background in light mode. Near-white without the harshness of pure `oklch(1 0 0)`.
- **Near-White** (`oklch(1 0 0)`): Light mode card backgrounds and the lightest possible highlight. Used sparingly.

### Neutral

- **Mid-Ash** (`oklch(0.708 0 0)`): Secondary text, timestamps, supplementary labels. The workhorse of de-emphasis.
- **Subtle Ash** (`oklch(0.556 0 0)`): Placeholder text, disabled labels, tertiary metadata.
- **Border Ghost** (`oklch(1 0 0 / 10%)`): Card and container borders in dark mode. Near-invisible; enforces separation through barely-perceptible contrast rather than hard lines.
- **Border Stone** (`oklch(0.922 0 0)`): Card and input borders in light mode. Soft, unobtrusive.

### Data Visualization (Dark Mode Defaults)

Five chart colors cover the semantic range of portfolio data. These are the system's only sanctioned source of hue in the default theme.

- **Indigo Signal** (`oklch(0.488 0.243 264.376)`): Primary chart series; equities, main portfolio line. Also the sidebar active-state indicator in dark mode.
- **Jade Return** (`oklch(0.696 0.17 162.48)`): Secondary chart series; bonds, positive comparison benchmarks.
- **Amber Watch** (`oklch(0.769 0.188 70.08)`): Tertiary series; commodities, warning badge backgrounds.
- **Violet Risk** (`oklch(0.627 0.265 303.9)`): Quaternary series; crypto, drawdown overlays.
- **Coral Loss** (`oklch(0.645 0.246 16.439)`): Fifth series; negative returns, expense categories. Red-adjacent without alarm.

### Semantic

- **Destructive Flame** (`oklch(0.577 0.245 27.325)`): Destructive actions **and** the negative half of every sign colour. Saturated enough to demand attention without being an emergency siren. The five named themes each declare their own; seven of those twelve declarations were raised or lowered on 2026-08-13 to clear 4.5:1 as text against their own `--card` — the default theme already did and was left untouched.
- **Positive Jade** (`oklch(0.482 0.194 149.214)` light / `oklch(0.740 0.156 148.655)` dark): the positive half of every sign colour. **No named theme overrides it**, so one pair of values serves all twelve combinations. The light value was darkened from `0.627` on 2026-08-13: at that lightness it measured 2.62–3.22:1 across the light themes, so the reassuring half of every verdict read fainter than the alarming half — an asymmetry in what the interface was emphasising, not just a contrast number.

### Named Rules

**The Zero-Chroma Rule.** The default surface palette has no hue. Adding a brand color to buttons, cards, or navigation in the default theme is forbidden. Color is earned by data, not decoration.

**The Data Owns Color Rule.** Chart palettes, performance indicators, and the five named themes are the only sanctioned sources of chromatic energy. Interface chrome in the default theme is always achromatic.

**The Sign-Color Token Rule.** Positive/negative *value* coloring (gain vs loss, income vs expense, up vs down deltas, variation chips, fiscal gains) always uses the theme-aware semantic tokens: `text-positive` for positive, `text-destructive` for negative, with `bg-positive/10` / `bg-destructive/10` for chip tints. Raw Tailwind `text-green-*` / `text-red-*` is forbidden here — those classes stay literal regardless of the active theme and diverge from `--destructive` on non-default themes (e.g. Cyberpunk renders destructive as orange), which would put two different "negative" colors on the same screen. `getMetricValueColor()` in `lib/utils/metricColors.ts` is the single source of truth for resolving the sign color. (Buy/sell *signal* chips — COMPRA/VENDI/OK — are a separate case, theme-mapped to the chart palette via `useActionColors`; see the ActionChip component.)

## 3. Typography

**UI Font:** Geist Sans (with `system-ui, sans-serif` fallback)
**Numeric Font:** Geist Mono (with `ui-monospace, monospace` fallback)

**Character:** Geist Sans is a neo-grotesque that reads precisely without clinical coldness. Its slightly geometric construction aligns with the Linear/Vercel reference. Geist Mono is not an afterthought: it is half the design system. Every monetary value, percentage, ratio, and structured date uses monospace figures — tabular numeral alignment is non-negotiable when columns of numbers must read as columns.

### Hierarchy

- **Display — Page Hero** (700 weight, `44px` mobile / `54px` desktop, lh implicit, ls `-0.03em`): The single dominant number on the page — net worth total on Overview. Always `font-mono tabular-nums`. In Tailwind: `text-[44px] font-bold font-mono tracking-[-0.03em] desktop:text-[54px]`. One instance per view maximum.
- **Display — Section Hero** (700 weight, `36px`, lh 1, ls `-0.03em`): Primary metric in a bento card or section hero block — e.g. TER, Annual Cost, FIRE Number. In Tailwind: `text-[36px] font-bold font-mono tabular-nums tracking-[-0.03em] leading-none`.
- **Sub-hero Value** (700 weight, `22px`, lh 1, ls `-0.025em`): Secondary metrics that sit below the dominant number or in paired value blocks — e.g. Liquid / Illiquid amounts, Entrate / Spese figures. In Tailwind: `text-[22px] font-bold font-mono tracking-[-0.025em] tabular-nums leading-none`.
- **Verdict Headline** (Geist Sans, 600 weight, `24px` mobile / `30px` desktop, lh 1.15, ls `-0.025em`): the page's opening sentence — the one place where prose, not a number, is the hero. In Tailwind: `text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] desktop:text-[30px]`. The trailing full stop is a separate span coloured by tone (see **The Verdict-First Rule**). The sentence under it is Body at `14px`/`15px` (`desktop:`), muted, with figures as mono `font-semibold` spans coloured by sign.
- **Compact Hero** (700 weight, `18px`, lh 1, ls `-0.03em`): the value of a secondary row inside a tile that already has its own hero — the second and third goals under the featured one. In Tailwind: `text-[18px] font-bold font-mono leading-none tracking-[-0.03em] tabular-nums`.
- **Headline** (600 weight, 1.25rem, lh 1.25, ls -0.01em): Section headers, dialog titles, card-level titles where data density demands authority.
- **Title** (600 weight, 1rem, lh 1.4, ls -0.005em): Sub-section headers, table group labels, the step below Headline.
- **Body** (400 weight, 0.875rem, lh 1.6): All prose, descriptions, note content. Max line length 65ch.
- **Reading Line** (Geist Sans, 400 weight, `13px`, lh 1.45): the one-line answer under a tile's eyebrow, before the figures. Figures inside it are `font-mono font-semibold tabular-nums` and take the sign colour; the prose stays `text-foreground`. Rendered by `NarrativeText` from a `Narrative` (segments with `mono`/`sign`), never assembled in JSX.
- **Label** (500 weight, 0.75rem, lh 1.4, ls +0.01em): Input labels, tags, stat captions, tab text. Slightly tracked for legibility at small sizes.
- **Eyebrow Label** (600 weight, `10px`, uppercase, ls `0.1em`, muted): Section eyebrow — the small all-caps label placed above a dominant number. In Tailwind: `text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground`. Never competes with the number it names. It is also the compact page header's eyebrow and the group label of the sidebar and the phone drawer (`TILE_EYEBROW_CLASS` in `components/ui/tile.tsx`; on the sidebar surface its colour is `text-sidebar-foreground/60`) — see **The One-Eyebrow Rule**. Use 9px / `tracking-[0.08em]` for sub-eyebrows inside compact cells. Context can be appended with a centered-dot separator: `Cashflow · MAGGIO 2026` — the `·` joins without adding another label.
- **Delta Annotation** (Geist Mono, 400 weight, `12px`, ls 0): The small trend line that appears directly below a sub-hero value inside a KPI chip — e.g. `+5.2% vs mese scorso`. Always `font-mono`. Color follows sign semantics via the theme tokens (see **The Sign-Color Token Rule**): `text-positive` for positive, `text-destructive` for negative — never raw `text-green-*`/`text-red-*`. **Inverted semantics for expense metrics**: a positive delta on Spese is bad; parameter the color via `positiveGood: boolean`. In Tailwind: `text-[12px] font-mono mt-1.5 text-positive` (or `text-destructive`); prefer `getMetricValueColor()`. A neutral subline (non-trend) uses `text-[12px] text-muted-foreground mt-1.5`.
- **Numeric** (Geist Mono, 400 weight, 0.875rem, lh 1.4, `font-feature-settings: "tnum" 1`): All monetary values, percentages, dates, quantities in financial contexts. Tabular figures always enabled.

### Named Rules

**The Mono Mandate.** Every number in a financial context uses Geist Mono with `tnum` features. No exceptions: KPI cards, table cells, chart axis labels, percentage badges. A number set in Geist Sans loses its financial authority.

**The Ramp Lives in the Frontmatter.** The enumerated step ladder — 9/10/11/12/13/15/22/32/36/40/44/54px — is declared in `typography.scale`, because the named roles above cannot express a ramp. Two consequences. First, the two layers of this file must agree: the prose documented the Trade Republic scale for months while the frontmatter still said `display: clamp(1.75rem, 3vw, 2.5rem)`, which made every documented hero size read as off-system. Second, a linter takes its font sizes **only** from the frontmatter (`typography` + `typography.scale`) — from `.impeccable/design.json` it takes only `colorMeta` and `roundedMeta`. So a `design-system-font-size` finding is never fixed by regenerating the sidecar, whatever the tool's own hint suggests; declare the size here instead. 32px and 40px sit in the ramp because they are genuinely used — they are the hero **overflow step-down** (AGENTS.md → *Panoramica*), not a step to reach for.

**The Two-Font Rule.** The system uses exactly two fonts. No display serif, no decorative typeface, no icon font treated as type. Hierarchy is expressed through scale and weight within the same two families.

**The Verdict-First Rule.** A page opens with a sentence, not a number. The headline states the verdict ("Agosto sta andando bene.", "Agosto è in calo: il mercato ha pesato.") and the sentence under it carries the facts with mono figures set inside the prose; only then comes the grid. The headline is Geist Sans 600 at 24px (30px from `desktop:`), the sentence 14/15px muted, both capped at `max-w-[920px]`. Tone is encoded ONLY in the colour of the headline's full stop (`text-positive` / `text-muted-foreground` / `text-warning-foreground` / `text-destructive`): colouring the whole headline would shout, and the figures already carry their own sign colours. The words come from rules in a pure module (`lib/utils/overviewNarrative.ts` for the Panoramica), never from a component: each phrasing is pinned by a test, and Italian grammar (gender and number of the subject, `a`/`ad` before a vowel month) is data in that module, not guessed at render.

**The Narrative Honesty Rule.** A generated sentence must never claim what the data cannot support. The canonical case: a month whose total fell while the market GAINED is not "il mercato ha pesato" — the cause is the user's own flows, and the headline says "nonostante il mercato". Corollaries: a missing input drops its clause (no prior snapshot → no monthly clause; no income → no savings clause; nothing attributable → no market driver) and never prints "N/D" or a placeholder; a figure that is a projection says so in the words next to it ("al ritmo attuale"); a list titled "per categoria" closes with the residual row ("Altre categorie") so it visibly adds up to the total it is a share of; and a digest labelled as return measures return — `Mercato:` is the price effect on what was held at the start of the period, never the user's buys and sells.

**The Comma Rule.** Every percentage the user reads is formatted for `it-IT` — `+1,01%`, `72,8%` — through chartService's `formatPercentage`, never `toFixed` (which prints `1.01%`, a dot the rest of the screen never uses). Currency comes from `cachedFormatCurrencyEUR`, which puts a no-break space before `€` and leaves four-digit amounts ungrouped (`4120,18 €`): tests flatten the nbsp and expect the real output. Signs are typographic: `+` and the true minus `−` (U+2212), never a hyphen. The `toFixed` chips still on Rendimenti are legacy to retire page by page (Patrimonio and Tracciamento retired theirs on 2026-08-22; a ratio such as «1,67×» goes through `formatNumber`).

**The One-Eyebrow Rule.** The app has one eyebrow — `text-[10px] font-semibold uppercase tracking-[0.1em]` — and it is the same element whether it names a tile's question, the section a compact page header belongs to ("PANORAMICA", "OPERATIVITÀ") or a navigation group ("ANALISI", "PIANIFICAZIONE") in the sidebar and the phone drawer. The 12px `tracking-widest` eyebrow of the legacy header and the 12px group labels the sidebar used to have were three sizes for one job; when the frame and the content use the same label, the frame stops reading as a second voice and the verdict is what the eye lands on.

## 4. Elevation

This system uses ambient depth: tonal background stepping combined with a consistent, low-opacity shadow vocabulary. Neither approach alone; both together.

Surfaces build depth first through background-value steps (Deep Void → Charcoal Surface → Graphite Lift), then layer shadow to signal function. A surface that floats above the page (modal, floating nav pill) gets a shadow that physically separates it. A surface that organizes content in place (card) gets a whisper shadow that barely catches light.

### Shadow Vocabulary

- **Whisper** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)`): Inputs, form fields. Barely perceptible — gives a field its "inset" quality without adding visual weight.
- **Lift** (`box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`): Cards, contained data panels. Separates a surface from the page without announcing itself.
- **Float** (`box-shadow: 0 4px 24px rgba(0,0,0,0.28)`): Floating elements that leave document flow — the mobile nav pill, dropdown menus, detached popovers. The one shadow that is large and felt. Reserved for elements that genuinely hover above the page.

### Named Rules

**The Ambient Rule.** Shadows here are atmospheric, not structural. A card's 1px border at 10% opacity does more compositional work than its shadow. Don't increase shadow size when a lighter border or a background-step change solves the separation problem.

**The Float Threshold.** The Float shadow is reserved for elements that physically exit the document flow. Using it on an in-flow card creates false depth hierarchy and is an error.

## 5. Components

### Page Verdict (Verdict-First Pattern)

The opening of every redesigned page: the verdict as a headline, the facts as a sentence, both generated by rules.

**Structure:**
```
[headline — text-[24px] desktop:text-[30px] font-semibold leading-[1.15] tracking-[-0.025em], trailing "." in the tone colour]
[sentence — text-[14px] desktop:text-[15px] leading-[1.6] text-muted-foreground, figures as font-mono font-semibold spans with sign colour]
```
`max-w-[920px]`, `gap-2`, rendered by `PageVerdict` (`components/ui/page-verdict.tsx`, `ariaLabel` = what the verdict is about; `OverviewVerdict` is the Panoramica's thin wrapper) over the page's `build*Verdict()` — `buildOverviewVerdict()` in `lib/utils/overviewNarrative.ts`, `buildPatrimonioVerdict()` in `lib/utils/patrimonioNarrative.ts`. The `Narrative` segment type, `VerdictTone` and the `PageVerdictModel` every narrative module returns live in `lib/utils/narrative.ts`.

**Rules:**
- The words are a pure function of the payload, tested clause by clause; no component writes copy.
- Tone colours the full stop only: `positive` / `neutral` / `warning` / `negative` → `text-positive` / `text-muted-foreground` / `text-warning-foreground` / `text-destructive`.
- A missing input drops its clause; the sentence is never padded (The Narrative Honesty Rule).
- The page header above it is the compact `PageHeader` (the default variant since 2026-08-22): the verdict IS the page title.
- A control that resets filters never resets the axis: «Ripristina» clears the Movimenti filters, the period is the picker's.
- A page whose question has an axis (Tracciamento's period) renders that control beside the verdict from `desktop:` — `flex items-start justify-between gap-6`, the verdict keeping its `max-w-[920px]` — and moves it under the verdict below that width (on Tracciamento, the period picker alone; the list filters go with the list). One axis governs the verdict AND every tile; a toolbar that narrows a list narrows only that list.

### Tile (One Question)

The unit of every redesigned page: `Tile` in `components/ui/tile.tsx` (the Panoramica's `OverviewTile` is a re-export of it, as are `NarrativeText` → `components/ui/narrative-text.tsx` and `RankedRows` → `components/ui/ranked-rows.tsx`). `TILE_CELL_CLASS` is the grid-cell wrapper.

**Structure:**
```tsx
<section className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
  <div className="flex items-baseline justify-between gap-3">
    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{eyebrow}</p>
    <div className="shrink-0 text-[10px] text-muted-foreground">{aside}</div>
  </div>
  <NarrativeText segments={reading} className="mt-2 text-[13px] leading-[1.45] text-foreground" />
  {/* figures: KPIs at 22px, rows at 13px, 3px bars */}
  <div className="mt-auto border-t border-border pt-3.5">{/* secondary fact */}</div>
</section>
```

**Rules:**
- Eyebrow = the question; aside = its scope (a period, a count, "stima annua"); reading = the answer in words; figures after. Sub-labels inside the tile use the 9px sub-eyebrow.
- `p-5` (20px) and `gap-3` (12px) between tiles — tighter than the 22/16 of the previous bento; tiles are many and small.
- The dominant tile (net worth) spans two rows and lets its chart stretch (`relative flex-1 min-h-[180px]` with the SVG `absolute inset-0`); numbers and chips keep their size.
- No tile repeats another tile's rows (The One-Tile-One-Question Rule).

### Tile Grid (12-Column Bento)

```tsx
<div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
  <div className="flex min-w-0 [&>section]:flex-1 tablet:col-span-2 desktop:col-span-5 desktop:row-span-2">…</div>
  <div className="flex min-w-0 [&>section]:flex-1 order-2 desktop:order-none desktop:col-span-3">…</div>
  …
</div>
```
Page root is `<PageContainer width="wide">` (`max-w-[1920px]`; the default `PageContainer` keeps the 1600px of the un-propagated pages). Spans on the Panoramica: Patrimonio 5 (2 rows) · Sintesi 3 · Cashflow 4 / Composizione 3 · Costi 2 · Obiettivi 2 / Spese 4 · Entrate 3 · Asset principali 5. On Patrimonio: Patrimonio 5 (2 rows) · Liquidità 3 · Movimenti del mese 4 / Classi 3 · Rendimento 4 / Strumenti 12. On Tracciamento: Cashflow del periodo 5 (2 rows) · Spese per categoria 4 · Entrate per categoria 3 / Risparmio nel tempo 7 / Movimenti 12. On Dividendi: Incasso netto 5 (2 rows) · Affidabilità 3 · Rendimento 4 / Chi paga di più 4 · Per anno 3 / Pagamenti 12, with a «Dettaglio» disclosure of two tiles (7 · 5) below the grid. On Budget: Tetto del mese 5 (2 rows) · Categorie a rischio 4 · Avvisi 3 / Budget annuali 7 / Per categoria 12, with an «Impostazioni» disclosure of two tiles (6 · 6) below the grid; without a ceiling the hero's cell stays empty (a hidden spacer) rather than faked, and the disclosure opens. On Centri di Costo: Totale 5 (2 rows) · Centri 7 / Dormienti 7, with an «Archiviati» disclosure of one tile below the grid; on one center: Costo 5 (2 rows) · Per categoria 4 · Ciclo di vita 3 / Per sottocategoria 7 / Movimenti collegati 12, the three actions beside the verdict from `desktop:` and under it at 44px below. On Analisi: Periodo 5 (2 rows) · Fuori scala 3 · Spese maggiori 4 / Spese per categoria 4 · Entrate per categoria 3 / Scheda 12 (only with a focus) / Flusso 12, with «Confronto annuale» and «Dettaglio» as two disclosures below the grid (one tile each; three in history mode); without a month to run on (a past year, the history) Fuori scala is absent and Spese maggiori takes 7. A tile that may be absent (Costi, Obiettivi, Fuori scala) hands its columns to its neighbour, or a hidden spacer closes the row. See **The Tile Grid Rule**.

### Compact Page Header

`PageHeader` — `variant="compact"` is the **default** since the shell redesign. On `desktop:` one line — eyebrow (`TILE_EYEBROW_CLASS`, 10px/0.1em, the same as the tiles) · title (`text-sm font-medium`) · description (`text-sm text-muted-foreground`, joined with `·`) — actions right, `min-h-9`, no separator. Below `desktop:` the sticky navbar is unchanged (title 17px, description under it). The page's real headline is its verdict, so the header is a breadcrumb, not a title.

`variant="legacy"` is the pre-redesign header (2xl/3xl title, description under it, optional `border-b`), declared explicitly by the pages not yet propagated (Rendimenti, Storico, Allocazione, Previdenza) so their render is byte-identical; it is deleted with the last of them.

**With section tabs** (Cashflow, FIRE e Simulazioni, Impostazioni): `PageTabBar` sits directly under the compact header row — from `desktop:` an underline bar of 13px `font-medium` tabs whose `border-b` is the header's only separator; below `desktop:` the segmented pill. The header keeps the page title, the tab keeps the section: no title is printed twice. Every tab carries `aria-label` unconditionally (the icon-only pill had no accessible name below 1440px) and the tablist is named after what it switches ("Sezioni di Cashflow").

### Tile Grid Skeleton

`components/ui/tile-grid-skeleton.tsx` — the ONE loading state of a redesigned page: the verdict's two muted lines, then the tile grid with the page's own spans (`cells: { span, rows?, lines? }[]`, class lookup in `lib/utils/tileGridSkeleton.ts`) and no numbers. It replaces the per-page skeleton components as each page is propagated; the Panoramica uses it with its default cells. Same root width as the page (`PageContainer width="wide"`), so nothing jumps when the data lands.

### Market Digest Line

The footer line of the net-worth tile: `Mercato:` followed by every asset class whose market price moved (on Patrimonio: the three instruments that moved the most, closed by an «altri» entry equal to the rest of the measured market effect — the same attribution before it is folded into classes, so the two pages never print the same line and three gains can never hide a negative total), largest effect first, as `{label} {±€}` pairs in a `flex flex-wrap gap-x-2` row (`·` between pairs, pairs `whitespace-nowrap` so a class never splits across lines). It measures return — the price effect on what was held at the start of the period — never the user's flows; pension funds get their own `Previdenza` entry (value net of the month's contributions); real estate is measured gross of debt. Hidden when nothing can be attributed, never shown as zeros.

### Ranked Rows with Residual

`components/dashboard/overview/RankedRows.tsx` — the CompositionList idea inside a tile: label · 3px bar (width = rank, the largest row fills the track) · mono amount · share. When the rows are a subset of a stated total, the list closes with a muted residual row (`Altre categorie`, no bar) so the shares visibly sum to 100% (The Narrative Honesty Rule). Bar colour is a chart slot (`var(--chart-1)` expenses, `var(--chart-2)` income), never a hex.

### Table inside a Tile (Strumenti)

The management table of Patrimonio keeps being a table — sortable columns, the three Δ columns behind «Andamento», the optional grouping by class, the `--chart-3` tint on hand-priced rows, the 2-click delete — but it lives inside a tile and takes its cadence: eyebrow (`Strumenti`), the toggles as the aside (`h-7`, 11px outline buttons, `aria-pressed`), a reading line («16 strumenti, 2 valutati a mano; i 3 maggiori pesano il 39,3%»), then the rows. Column headers are the 9px sub-eyebrow (`TILE_SUB_EYEBROW_CLASS`, `scope="col"`, `aria-sort` on the sortable ones), cells are 13px with every number `font-mono tabular-nums`, rows separate with a 1px `border-border` and nothing else, and the first cell of each row is a `<th scope="row">`. By default the table fits the tile at 1440; with the Δ columns on it scrolls inside its own `overflow-x-auto` wrapper (`-mx-5 px-5`, so the scroll reaches the tile's edge), never the page. A muted footer pinned with `mt-auto` explains the tint and what a Δ is.

Below `desktop:` the same rows are a flat `divide-y` list of expandable rows (`AssetRow`): name · class chip · value · G/P on the closed row, and on open — the CSS `grid-rows-[0fr] → [1fr]` technique with `inert` on the closed panel — the details grid, the unit-price sparkline, the three Δ windows and the actions as `h-11` (44px) outline buttons in a two-column grid. A card per row would be a card inside the tile (the old `AssetCard` was one), so the rows are flat on purpose.

### Feed inside a Tile (Movimenti)

The transaction feed of Tracciamento stays the inventory it is — day groups, flat rows, the detail drawer with its drawer-confirm delete, the dense `ExpenseTable` behind a «Feed | Tabella» switch — but it lives inside a tile and takes its cadence: eyebrow (`Movimenti`), the count as the aside («47 voci», or «12 di 47 voci» while the toolbar narrows the list), a reading line that counts the rows by type and names the largest («47 movimenti: 40 spese, 5 entrate e 2 trasferimenti; la voce più grande è Stipendio (4200 €)»), then the toolbar (search, categories, subcategory, account, sort on the left; the view switch and «Esporta CSV» on the right, `ml-auto`) and the rows. The feed keeps `surface="flat"` on every width — a card per day inside a tile would be a card inside a card — and the toolbar is `hidden desktop:block`: below that width the `[Filtri · ordina]` bar of `MobileFiltersDrawer` renders inside the tile (`mobileToolbar`, `desktop:hidden`) — next to the list it narrows — while the period picker alone stays under the verdict. **The toolbar narrows only this tile**: the verdict and the other tiles read the period slice, never the filtered list, because a savings rate computed over one category is not a savings rate.

### In-tile Bars (hand-written SVG)

A small bar chart inside a tile — income beside spending per month on Tracciamento's hero, the savings rate per month on «Risparmio nel tempo», net dividend income per month AND per year on Dividendi (one component, `NetIncomeBars`, two windows: a second implementation of the same quantity would drift) — is a hand-written `<svg viewBox preserveAspectRatio="none">` of `<rect>`s positioned `absolute inset-0` inside a `relative flex-1` box with a `minHeight` (the sparkline's stretch technique), never Recharts: the bars stretch with the tile's free height and nothing else on the page pays for a chart library. Three rules. The **axis labels live outside the SVG**, in a CSS grid with as many columns as bars (`font-mono text-[10px]`), so they never stretch with the plot. **Colour is the chart slot the rest of the page already uses for that quantity** — `--chart-2` for income, `--chart-1` for spending, the same two the category tiles' bars take — and a month below zero is `--destructive` drawn under the baseline. **A reference line is a dashed `--foreground` at 60% and carries no label**: the reading line above the chart says what it is («In media il 31%»), and a label on the plot would paint over whichever bar stands at the edge. **The month the page is about is outlined** (`stroke="var(--foreground)"`, `vectorEffect="non-scaling-stroke"`) and its axis label set `font-semibold` — never the other months dimmed, since a dimmed slot falls under the 3:1 floor for graphical objects on the light card. **A baseline series is a neutral, and an unknowable baseline is a gap** (Analisi, 2026-08-25): the previous year's same month stands beside the current bar in `--muted-foreground` — neither the gain nor the loss colour, because a baseline is neither — and a month whose baseline cannot be known (below the history floor, or a previous year with no rows at all) draws nothing there, never a flat zero that would read as «spent nothing»; the footer under the chart says which of the two it is. **A window still RUNNING is drawn at reduced fill AND outlined** (Dividendi's current year): it is real data the reader must see, and it is not comparable with the closed ones the reading ranks — the outline says «this one is different», the reduced fill says «not yet finished», and the footer says which; every `<g>` carries a `<title>` with the month's figures, the native tooltip. **With a mouse, the plot reads the point under it** (`components/ui/chart-hover.tsx`: `useChartHover` snaps to the slot of a bar chart or the nearest point of a line, `ChartHoverTip` is the small `bg-popover` card at the top of the plot, centred on the anchor and kept inside it at the edges, figures mono and sign-coloured; a hovered slot is washed with `--foreground` at 6%, a hovered sparkline point gets a dot and a 25% guide line). It mounts only under `(pointer: fine)`: on a phone or a tablet the chart stays a shape and the `<title>`/`aria-label` carry the figures — the same reading exists for the net-worth sparkline of the Panoramica and Patrimonio (`NetWorthSparkline interactive`). The SVG carries `role="img"` and an `aria-label` that lists every month's figures, so the chart reads as a sentence to a screen reader; the legend swatches (`rounded-[2px]`, 8px) are `aria-hidden`.

### Budget Track (the 3px bar with today's mark)

Every budget row of Cashflow › Budget — the ceiling's hero, the annual budgets, the per-category list — is a 3px track whose fill is what is used and whose 1px `--muted-foreground` mark is **today on the window** (day / days in month for a monthly budget, day of year / days in year for an annual one): «73% used at 71% of the month» is legible at a glance only because the two are drawn on the same track, and the reading line says the same in points («2 punti avanti rispetto al calendario»). `BudgetTrack` (`components/cashflow/budget/BudgetTrack.tsx`) is the one component; an income target carries no mark (a salary lands once, the calendar says nothing about it). Fill colour follows the budget, not the sign tokens: `--foreground` while under the limit (a budget under its limit is not a gain), `--warning-foreground` from 90%, `--destructive` over it; an income target is muted until reached and `--positive` then (`budgetProgressStyle.ts`). The `h-1.5` bars of the old budget list retired with it (2026-08-23). On the hero's six-month bars the ceiling is drawn **per month** — one dashed segment at the ceiling that month HAD (the daily cron records it in `budgetHistory/{uid}/months/{YYYY-MM}`), a step where it changed — and the caption names whose ceiling each month is read against; once the ceiling is crossed, the KPIs change face: «Restano / Al giorno per restare nel tetto» becomes «Oltre, dal 22 / spesi al giorno · il tetto ne regge 65», and the verdict says WHEN («Lo hai superato il 22; …», «…, superando il tetto il 29»).

### Scheda inside the Grid (Analisi)

The focused entity of Analisi — a category, or one of its subcategories — is a tile of the grid, not a mode of another tile: a 12-column «Scheda · {name}» that appears under the two category tiles the moment a row, an anomaly, a top expense, a Sankey node, the search or a Confronto row selects an entity (ONE landing path, `handleEntitySelect`), and that the page scrolls to. Its head carries the breadcrumb («Spese › Casa › Condominio», every step but the last a link), the type and the history floor as the aside, and the two actions — «Indietro» (one level) and «Chiudi» — as 28px ghost buttons from `desktop:` and a full-width row of 44px outline buttons below it; its reading states the period total, its share of the parent and of the period, the newest year's delta on the like-for-like window and the pace («Nel 2026 hai speso 1200 € in Condominio, l'11,5% di Casa e il 3,8% delle spese; +8,1% sugli stessi mesi del 2025, al ritmo di 150 € al mese.»); its body is the `EntityDossier` in two columns from `desktop:` — the period total, the run-rate chips and the per-year table on the left; the 24-month trend and, under it, the period's subcategory ranking (category level) or its transactions (subcategory level) on the right, as flat rows below `desktop:` and a table with the sub-eyebrow as its header from it. Inside the Scheda the run-rate figures are flat KPIs (sub-eyebrow · 18px · caption, without cents: they are estimates), never tinted sub-cards — a card inside a tile is a card inside a card. The «Confronto annuale» tile below the grid draws the comparison year as the same neutral baseline the Periodo tile uses, and its view switch is the aside's 11px toggle (`AsideToggle`: `h-7` from `desktop:`, 44px below), the Strumenti form — a 14px pill in the 10px aside slot read as a second control register. The category tiles keep their place and their rows while the Scheda is open — the focused row is `aria-current` and its tile unfolds past «Mostra tutte» if the row is hidden there — so the reader can move to a sibling without closing anything. The focus lives in the URL (`?focusType&focusCat&focusSub`) and survives a period change: the per-year table and the trend ignore the axis on purpose, the total and the transactions follow it, and every block names its window.

**Rule — a Δ is a unit-price variation.** The three windows (Mese, YTD, Inizio) measure the canonical EUR unit price `totalValue / quantity` of the snapshot against today's, gross of debt for the hand-valued property (by type, never by class), never the position's total value: a purchase never moves a Δ, and a snapshot taken this month is no base for any window. Pension funds and cash accounts, whose quantity IS the value, print `—` (`lib/utils/assetPerformanceDeltas.ts`).

**The One-Tile-One-Question Rule.** A tile answers exactly one question, and its anatomy is fixed: eyebrow (the question, 10px uppercase), optional aside (scope or period, 10px muted, right), reading line (the answer in words, 13px/1.45 with mono figures), then the figures, and optionally a footer pinned to the bottom with `mt-auto` + `border-t` for the secondary fact. Two rows that say the same thing never appear in two tiles — when "Spese per categoria" exists, the Cashflow tile shows the month's pace and last month's figure instead of the same top-3. The shell is one component (`OverviewTile`): the app's card (`bg-card`, 1px `border-border`, 16px radius, Lift shadow, 20px padding) as a naked `section` so the tile owns its flex column. Inside a tile, chrome stays flat: `divide-y` rows, 3px bars, no sub-cards.

**The Tile Grid Rule.** Pages are laid out on a 12-column grid with explicit spans (`grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-12`, `gap-3`), the dominant tile spanning two rows (`desktop:col-span-5 desktop:row-span-2`), and the page root at `max-w-[1920px]` — a bento uses width, and at 1600px a 27" monitor left a third of the main area empty. Every grid cell wraps its tile in `flex min-w-0 [&>section]:flex-1` so tiles stretch to their row and `mt-auto` footers align across a row. Below `desktop:` the grid collapses and the reading order is set explicitly with `order-*` (the month's cashflow before the wealth split on a phone). Scrolling is allowed by design: density is a feature, "everything in one screen" is not a rule — the third row lives below the fold at 1440×900.

**The Hover Reading Rule.** A hand-written chart (the in-tile bars, the net-worth sparkline) names the point under the mouse — month and figures, mono and sign-coloured — through ONE primitive, `components/ui/chart-hover.tsx` (`useChartHover` for the index, `ChartHoverTip` for the card), and only under `(pointer: fine)`: a phone or a tablet never mounts the overlay, the chart stays a shape there, and the figures stay where they already are — the reading line, the `<title>` of each month, the `aria-label` of the plot. The tip is HTML positioned against the plot box, never an SVG element (a `preserveAspectRatio="none"` plot would stretch it), and carries no interaction of its own (`pointer-events-none`): it reads, it never offers an action. Recharts charts keep their own tooltip; this rule is for the charts the pages draw by hand.

**The Grouped Chip Rule.** Inside a tile, same-purpose chips (monthly change, yearly change, record) sit in ONE grouped row from `tablet:` up — `flex flex-wrap items-start gap-x-2.5 gap-y-2`, each chip `w-fit whitespace-nowrap` with its caption under it — and stack in a column on phones. This supersedes the Equal-Column Chip Rule for hero tiles: equal grid columns made two chips sit a tile-width apart, which read as two unrelated facts. The equal-column grid remains correct for full-width chip rows outside a tile.

**The Received-vs-Announced Rule.** Where a surface shows money that has arrived beside money that
has only been announced, the two are never one figure and never one colour. The received half keeps
the sign colour and its own total; the announced half is muted, badged («Attesa»), and totalled
separately — two `tfoot` rows, two subtotals in a dialog, its own chip beside the hero, its own
clause in the reading («12 incassate (1484 €) e 3 annunciate (277 €)»). A single grand total is
forbidden however convenient: it tells the reader they have what they do not. First applied on
Dividendi, where the calendar, the table, the day dialog, the hero and the leaderboard footer each
draw the line in their own material. The announced half is also **on the page's own window**: it is
bounded by the period exactly like the received half, upper bound at the end of the period's unit
rather than at today. An unscoped total beside a scoped one is two windows in one tile — the first
cut of Dividendi printed «127 €» of announced money next to a list holding one 57 € coupon, and put
a final premium dated 2032 in the list for August.

**The Off-Axis Tile Rule.** A page has ONE axis, and a tile whose figures are NOT on it must say so
rather than appear to follow. Dividendi's Rendimento tile is measured on the trailing twelve months
of the current holding whatever the picker says, so its aside reads «ultimi 12 mesi» and its footer
spells the base out — the coverage, and that the window does not follow the period. This is the
tile-level form of a rule first stated on Centri di Costo while it still had an axis: *a surface
that shows a period must be able to change it, or must name the window of every figure that uses a
different one.* Never "fix" it by wiring the axis into a figure the axis cannot honestly move.

**The Whole-Cost Corollary** (Centri di Costo, 2026-08-23). A page may have NO axis at all when
its question has none: a project's cost is its whole cost, so Centri di Costo dropped its
Mese|Anno|12 mesi|Sempre picker and reads everything «in totale». The rule then inverts — every
figure is lifetime unless it says otherwise, and the ones that use a window carry it in their own
words: «quest'anno», «anno scorso», «ultimi 12 mesi», «Tetto mensile · agosto» with today's mark,
«Fine mese» and «Fine anno» «al ritmo attuale». A delta against "the previous period" has no honest
predecessor without an axis, so it is gone rather than faked.

**The Risk-vs-Fact Rule.** A projected overrun and a crossed threshold are two different things
and never sit in the same tile. «Categorie a rischio» lists the monthly budgets whose month-end
projection exceeds their amount — money not yet spent, named as a projection («a fine mese», «al
ritmo attuale») — and a budget ALREADY over is not there: it is a fact, and facts belong to
«Avvisi» («Superato», with the threshold it crossed). The alert evaluator still fires a
forecast-only alert for the email, but the tile filters it out (`thresholdCrossed`), so no row
appears twice. Corollary on the projection itself: it is the app's ONE rule (the pace on what is
booked to date plus the rows already in the calendar — Tracciamento's and the Panoramica's), and a
FIXED or debt category never follows the pace: rent paid on the 1st, extrapolated by the day, would
read «at risk» all month. First applied on Budget, 2026-08-23.

### Buttons

Each variant has a physical quality: an opacity shift on hover that reads as gentle press, a soft focus ring that glows without screaming. Efficient and tactile.

- **Shape:** Medium curvature (8px radius). Not sharp enough to feel harsh; not rounded enough to feel playful. Matches input fields for optical consistency across form contexts.
- **Primary (dark mode):** Off-Blanc fill (`oklch(0.985 0 0)`), Charcoal Surface text (`oklch(0.205 0 0)`). Height 36px, horizontal padding 16px. Hover: 10% opacity reduction via `/90` modifier.
- **Primary (light mode):** Deep Void fill, Off-Blanc text. Same geometry, inverted colors.
- **Focus:** `ring-[3px] ring-ring/50` — a soft glow. The `/50` opacity prevents the ring from overwhelming surrounding content.
- **Outline:** Border + transparent background. Hover fills with `--accent` surface step. Secondary actions alongside a primary.
- **Ghost:** No border, no background at rest. Hover reveals `--accent` fill at 50% opacity in dark mode. Dense data tables and toolbars where button chrome adds noise.
- **Destructive:** Destructive Flame fill. Irreversible actions only. Never a general negative indicator.
- **Disabled:** `opacity-50`, pointer events off. Shape persists at half presence.

### Cards

Cards organize data panels, KPI groups, and chart containers. Structural, not decorative.

- **Corner Style:** `rounded-2xl` (16px). This is the standard for all primary cards, hero cards, and bento cells. Use `rounded-xl` (14px) only for sub-elements inside a card (e.g. muted sub-tiles). Buttons and inputs remain at 8px (md) — the larger radius signals a container, not an interactive target.
- **Background:** `--card` (dark: Charcoal Surface `oklch(0.205 0 0)`; light: Near-White `oklch(1 0 0)`).
- **Shadow Strategy:** Lift shadow (`0 1px 3px rgba(0,0,0,0.1)`). Always present; always quiet.
- **Border:** 1px, `--border` (Border Ghost dark; Border Stone light). The border carries most of the compositional separation work.
- **Internal Padding:** `p-5` (20px) for tiles (the unit of every redesigned page) and chart containers. `p-[22px]` (22px) for the legacy hero cards still on the un-propagated pages. The older `p-6` (24px) is only acceptable in dialogs or settings forms. The difference is intentional: 22px feels tighter and more "instrument-like" than 24px at data density.

#### Bento Cell (Naked Card Variant)

For bento grid cells that sit alongside a Card component, use the naked pattern — raw `div` instead of the `Card` component — to avoid shadcn's internal flex-col that can break inner layouts:

```tsx
<div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
```

This is preferred over `<Card><CardContent>` when the cell needs explicit flex direction control or when `flex-1` / `h-full` behavior is critical for grid row height matching.

### Inputs / Fields

- **Style:** Transparent background at rest, 1px stroke (`--input`/`--border`), 8px radius. Height 36px. Whisper shadow (`0 1px 2px rgba(0,0,0,0.05)`) for faint depth. Dark mode adds `bg-input/30` fill to signal editability on a dark surface.
- **Focus:** `border-ring` + `ring-[3px] ring-ring/50`. The ring opacity softens what would otherwise be an overpowering indicator.
- **Error:** `border-destructive` + `ring-destructive/20`. Error state is communicated through border color, not background change.
- **Placeholder:** `--muted-foreground`. Subdued; clearly not content.
- **Disabled:** `opacity-50 pointer-events-none`. Geometry preserved, content grayed.

### Badges

- **Style:** `rounded-md` (8px), border treatment, `px-2.5 py-0.5`, `text-xs font-semibold`. Height follows content.
- **Default:** Primary fill. Asset type labels, active status indicators.
- **Secondary:** Secondary surface fill. Secondary metadata, lower-emphasis tags.
- **Outline:** Border only, no background. Filter chips and neutral tags where fill adds excess weight.
- **Destructive:** Destructive Flame fill. Delete confirmations, critical status.

### Navigation

The frame recedes so the verdict is the first thing read: nothing in the chrome is louder than a tile's eyebrow, and nothing in the default theme's chrome has a hue.

- **Desktop sidebar** (`components/layout/Sidebar.tsx` over the shadcn primitive): `--sidebar` background, a 13px `font-semibold` wordmark (no filled logo block — a square of `--primary` was the brightest element on the screen), three route groups whose labels are the tiles' eyebrow (`TILE_EYEBROW_CLASS` + `text-sidebar-foreground/60`), one hairline before the assistant, which is a plain route (`assistantNavItem`, no banner), and the account at the bottom: a 28px initials square on `--sidebar-accent`, name 13px, email 11px, in a 44px row. **Active state = `--sidebar-accent` background + `font-semibold`, and nothing else** (the `--sidebar-primary` Indigo statement below is superseded).
- **Icon rail** (collapsed): `3.5rem` wide so every target — routes, toggle, account — is `44×44px` with 6px of padding; the route name is a tooltip on hover.
- **Mobile:** Floating pill at bottom of viewport. `border-radius: 9999px`, `--sidebar` background, `1px solid --sidebar-border`, Float shadow (`0 4px 24px rgba(0,0,0,0.28)`). Positioned `bottom: calc(env(safe-area-inset-bottom, 0px) + 12px)`. Three primary routes + "Altro" drawer trigger, labels 11px. Landscape orientation hides the pill entirely (horizontal screen real estate is used differently) and shows a top bar with the Sheet trigger and the 13px wordmark.
- **"Altro" drawer** (`SecondaryMenuDrawer`): the two secondary groups under the same eyebrow labels as the sidebar ("Analisi", "Pianificazione"), 14px rows of 44px, the assistant as a row after a hairline, the account block with a 44px options button.
- **Active indicator:** Framer Motion animated highlight under active item. State changes trigger instant color switch; route transitions use page-level animation.

**Superseded (2026-08-22).** "Active state: `--sidebar-primary` color. In the default dark theme this is Indigo Signal — the only context where a non-achromatic color appears in the default theme on the interface chrome" — the sidebar has used `--sidebar-accent` for the active route since the pill highlight, and the violet assistant banner (the one hue left in the chrome) was retired with the shell redesign. `--sidebar-primary` stays a token of the theme files; no component paints it.

### The Net Worth Counter (Signature Component)

The animated currency counter in Overview KPI cards is the system's most distinctive interactive element. Count-up animation is isolated to the leaf `<span>` containing the value, preventing surrounding layout reflow. `Intl.NumberFormat` results are cached via `cachedFormatCurrencyEUR` to prevent allocation on every render frame. Mounting is deferred through `requestIdleCallback`: the hero section settles first, charts mount after. Numbers land — they count from a prior value, never from zero.

### Variation Chips (Canonical Pattern)

**Superseded (2026-08-22).** Inside a tile the chips are `text-[12px]` with `px-[11px] py-[6px]`, each with an 11px caption under it ("questo mese", "da inizio anno"), grouped in one row from `tablet:` up — see **The Grouped Chip Rule**. The 15px grid-of-equal-columns form below was the Panoramica's and then Patrimonio's hero chip; since Patrimonio's redesign no page renders it. It stays documented for the Equal-Column Chip Rule, which still governs full-width chip rows outside a tile.

Periodic changes (monthly, YTD) are displayed as compact inline chips directly below the hero number — not as separate cards. This keeps the primary number dominant while giving immediate trend context.

**Structure:** `inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px] text-[15px] font-semibold font-mono tracking-[-0.01em]`

**Colors:** (theme-aware tokens — see **The Sign-Color Token Rule**)
- Positive: `bg-positive/10 text-positive`
- Negative: `bg-destructive/10 text-destructive`

Never use raw `bg-green-500/10 text-green-500` / `bg-red-500/10 text-red-500` here: those stay literal red/green regardless of theme and clash with `--destructive` on non-default themes (e.g. Cyberpunk = orange). Resolve the text color via `getMetricValueColor()` (`lib/utils/metricColors.ts`) where practical.

**Content:** `{icon} {+/-}{formattedValue} ({+/-}{pct}%) {period label}` — e.g. `↗ +€1.240,00 (+2.34%) questo mese`

**Rules:** Only render when snapshot data exists (at least one prior period). Never show a placeholder chip — absence communicates "no prior data" cleanly. Icon is `TrendingUp` or `TrendingDown` at `h-[13px] w-[13px]`. A row of several chips is laid out as a grid, not `flex-wrap` — see **The Equal-Column Chip Rule** below. Use `font-mono` for the value — the chip contains a financial number and must satisfy the Mono Mandate.

**Note (delta semantics):** For expense metrics, the sign convention is inverted: a positive delta on Spese is bad (spending went up), a negative delta is good. The color logic must be parameterized, not hard-coded: `positiveGood: boolean` governs the `text-positive` / `text-destructive` assignment.

**The Equal-Column Chip Rule.** A row of same-purpose chips whose labels are different lengths is laid out as a grid — `grid grid-cols-1 gap-2 tablet:grid-cols-2` — never `flex-wrap`. Chips that say the same *kind* of thing should be the same size; under `flex-wrap` each one shrinks to its own content, so "questo mese" and "da inizio anno" end up different widths and a wrapped third chip lands at a width unrelated to the two above it. Grid columns size together across every row, so a lone third chip still matches the first column — the alignment is a consequence of the layout, with no JS measurement and no fixed width. One column on mobile (each chip takes the full card width), two from `tablet:` up. `flex-wrap` remains correct where chips are genuinely heterogeneous and are meant to flow, such as filter tags. Superseded inside tiles by The Grouped Chip Rule (2026-08-22).

### Dominant Value Block (Trade Republic Pattern)

The canonical layout for any section where one number is the primary takeaway — asset value, allocation total, account balance.

**Structure:**
```
[eyebrow label — text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground]
[primary value — text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em]]
[variation chips — inline-flex, laid out as grid grid-cols-1 gap-2 tablet:grid-cols-2]
[tertiary metadata — text-[11px] text-muted-foreground]
```

**Rules:**
- Primary value is always `font-bold font-mono`. Page heroes use `text-[44px] desktop:text-[54px]`. Section heroes use `text-[36px]`. Sub-hero paired values use `text-[22px]`. Never `text-2xl` (24px) for a page or section hero — the jump from 22→36→44→54 is intentional.
- The eyebrow label above is `text-[10px]` uppercase and muted — it names the number without competing with it.
- Variation (gain/loss, percentage) appears inline directly below the value as chips, never as a separate card or column.
- Tertiary metadata (count, footnote) uses `text-[11px] text-muted-foreground` — present for reference, invisible at a glance.
- Never place two equally-weighted numbers side by side. One must dominate; the other is context.

### Flat List Row (Trade Republic Chrome Reduction)

The canonical pattern for lists of financial items — assets, allocation rows, transaction history — where card-within-card nesting would add visual weight without adding information.

**Structure:** `divide-y divide-border` container, each row is a `flex items-center justify-between py-3 px-0` div (no background, no border-radius, no shadow).

**Rules:**
- No card box per row. The `divide-y` line is the only separator.
- Container may live inside a Card for page-level organization, but rows inside are always flat.
- Hover state: `hover:bg-muted/30` — barely perceptible, confirms interactivity without adding chrome.
- Row content follows Dominant Value Block hierarchy: primary value right-aligned in `font-mono`, label left-aligned.
- Use this pattern wherever a `<ul>` of items would otherwise become a grid of `<Card>` boxes.

### ActionChip

A compact, text-only chip for contextual financial actions (buy / sell / hold signals, allocation status). Replaces color-coded icons where the action label carries more information than the icon.

**Variants:**
- **COMPRA** (buy signal): `bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20`
- **VENDI** (sell signal): `bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20`
- **OK** (on-target): `bg-muted text-muted-foreground border border-border`

**Structure:** `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium`

**Rules:**
- Text only — no icons inside an ActionChip. The label is the signal.
- Never use ActionChip for navigation or primary actions. It is a status indicator, not a button.
- On touch devices, ensure minimum 32px tap height via parent padding.

### Segmented Pill Control

A tab switcher for mutually exclusive views within a section. Replaces `<Select>` dropdowns where options are few and always visible. The active pill animates via Framer Motion `layoutId` spring.

**Structure:** `role="tablist"` container with `bg-muted rounded-lg p-1 w-fit mx-auto`, each option is a `role="tab"` `motion.button` with `layout="size"`. Active pill is a `motion.div` with `layoutId` and `bg-background shadow-sm` that slides between options.

**Spring:** `stiffness: 400, damping: 35` — snappy without overshooting. Same constant on both `motion.button` `transition` and `motion.div` `transition`.

#### Variant A — Icon tabs (section navigation)

Used in `PageTabBar` for pages with multiple named sections (Cashflow, Settings, FIRE). Each tab has a meaningful icon.

- **Active tab:** icon + full label. `motion.button layout="size"` expands smoothly.
- **Inactive tabs:** icon only — label hidden. Tabs shrink to icon width.
- **Fallback:** if a tab has no icon, always show the label regardless of active state.
- **Centering:** `w-fit mx-auto` on the container — the pill sizes to content and centers in the page.
- **Implementation:** `components/layout/PageTabBar.tsx`

#### Variant B — Text tabs (period / filter selection)

Used for compact period selectors (e.g. YTD / 1A / 3A / 5A / MAX on Rendimenti) where labels ARE the identifier and no icons exist.

- All options always show their label (already ≤3–4 chars — no overflow risk).
- Uses underline `motion.div` indicator instead of background pill — appropriate for horizontal period strips.
- Do not force icons onto period selectors. "1 year" has no meaningful icon.

**Shared rules:**
- Full ARIA: `role="tablist"` on container, `role="tab"` + `aria-selected` per button.
- Only use for view-switching within a page section. Global navigation uses the bottom pill or sidebar.
- Desktop (`≥ 1440px`): `PageTabBar` renders the animated underline tab bar instead. The segmented pill is mobile-only (`desktop:hidden`).

### Bento Asymmetric Hero Layout

**Superseded (2026-08-22).** The Panoramica no longer uses the `[2fr_1fr]` hero + companion; it uses the **Tile Grid** above, where the dominant tile spans 5 of 12 columns and two rows. The pattern below stays documented because Rendimenti, Allocazione and FIRE still use it; redesign them onto the Tile Grid, do not add new `[2fr_1fr]` pages.

The canonical top-of-page layout when a hero card needs a companion context card (e.g. Overview: Net Worth + Liquidity, Performance: TWR + period selector).

**Structure:** `grid gap-4 desktop:grid-cols-[2fr_1fr]`

- The `[2fr_1fr]` ratio gives the hero approximately 66% width and the companion 33%. This is not a 50/50 split — the asymmetry is intentional and communicates hierarchy through space allocation.
- On mobile, the grid stacks: hero first, companion second.
- The companion card uses `h-full` to match the hero's variable height (sparkline, chips, etc.).
- Below the hero row, a secondary bento row uses equal `grid-cols-3` (or `grid-cols-2`) for metric cards of equal weight.

**Section separator:** Use `border-t border-border/40 pt-4` between major page sections. The 40% border opacity is lighter than the standard `border-border` — it suggests chapter separation without visual interruption.

### Hero Sparkline (Edge-to-Edge Area Chart)

A minimal area chart rendered inside the hero card, breaking out of card padding to fill the full card width. No axes, no grid, no legend — the variation chips above carry numeric context; the sparkline adds only visual shape. Since 2026-08-22 a mouse reads a point (`interactive`, **The Hover Reading Rule** below); the touch surfaces keep the bare shape.

**Implementation:**
```tsx
{/* Container with negative margin matching the card padding */}
<div className="-mx-[22px] mt-3" style={{ height: 68 }}>
  <NetWorthSparkline data={sparkline12m} filled={true} color="var(--chart-1)" height={68} />
</div>
{/* Start/end labels rendered by parent, outside the -mx container */}
<div className="flex justify-between mt-1 px-px text-[10px] text-muted-foreground font-mono">
  <span>{cachedFormatCurrencyEUR(sparkline12m[0].totalNetWorth, true)}</span>
  <span>{cachedFormatCurrencyEUR(sparkline12m[sparkline12m.length - 1].totalNetWorth, true)}</span>
</div>
```

**Rules:**
- The `-mx-[N]` value must match the card's padding exactly (e.g. `-mx-[22px]` for `p-[22px]`). The SVG uses `preserveAspectRatio="none"` and `width="100%"` to fill the container.
- When `filled=true`, the `NetWorthSparkline` component expects the parent to render the start/end labels externally — it does not render them internally to avoid misalignment with the bleed.
- Use `color="var(--chart-1)"` so the sparkline respects theme. Never hard-code a hex.
- Gradient fill: opacity `0.22` at top, `0` at bottom. This is intentionally subtle — the area shape conveys trend, not emphasis.

### Animated SVG Donut (Inline Data Viz)

A two-color SVG donut rendered directly inside a card (no Recharts), with a `motion.circle` for the animated segment. Used when a pie metaphor must integrate tightly with text values in a flex layout.

**Anatomy:**
- Full background ring: static `<circle>` in color A (e.g. illiquid / base category).
- Animated segment: `<motion.circle>` in color B (e.g. liquid / primary category), animating `strokeDasharray` from `0 circ` to `liquidDash circ-liquidDash`.
- Center label: `absolute inset-0 flex flex-col items-center justify-center` with the percentage in `font-mono font-bold` at `fontSize={17}` (matching the center of the 116px ring).
- SVG rotated `-90deg` so the segment starts at the top (12 o'clock position).

**Geometry:**
- `size = 116`, `strokeW = 12`, `r = (size - strokeW) / 2`
- `circ = 2 * Math.PI * r` — do not hard-code; always derive from `r`.

**Animation:** `duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15` — expo-out feel with a brief delay after the hero number starts.

**Colors:** Always from `useChartColors()`. The first time `chartColors` is read, it may be `[]` (post-hydration); default to CSS vars (`var(--chart-1)`, `var(--chart-2)`) as fallbacks.

**Rules:**
- Use this pattern when the donut is integral to the card layout and must flex-align with text. Use Recharts `PieChart` only for standalone chart sections.
- `strokeLinecap="butt"` — not `"round"`, which would add visual overlap at 0% and 100% endpoints.
- Center text font size should scale with `size`: `fontSize = Math.round(size * 0.147)` (approx).

### Savings / Metric Ring Chart

An SVG ring chart for a single percentage metric (e.g. savings rate). Structurally similar to the animated donut but single-color on a muted track ring.

**Color thresholds (savings rate):**
- `≥ 20%`: green — `oklch(0.696 0.17 142.5)`
- `10–19%`: amber — `var(--chart-3)`
- `< 10%` or negative: red/coral — `oklch(0.645 0.246 16.439)`

**Single-mount animation pattern:** The ring animates once when the component mounts — never on parent re-renders. Achieved via `useAnimation` + `useEffect` with an empty dependency array (`[]`):

```tsx
const controls = useAnimation();
useEffect(() => {
  const timer = setTimeout(() => {
    controls.start({
      strokeDasharray: `${dash} ${circ - dash}`,
      transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
    });
  }, 400);
  return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // intentionally empty — animate once on mount only
```

**Rules:**
- The `[]` dependency on the animation effect is intentional — the ring is a "snapshot display" of the current rate, not a live-updating gauge. If the ring must react to data changes, use explicit `key` prop rotation on the parent to force re-mount.
- For a deficit (rate < 0): render the track ring only, show the negative label in red, suppress the filled segment entirely.

### Collapsible with Framer Motion Height

The pattern for smooth expand/collapse of a section that has variable or unknown height. Combines Radix `Collapsible` (for ARIA state and keyboard accessibility) with Framer Motion (for the height animation that Radix alone cannot provide smoothly).

**Structure:**
```tsx
<Collapsible open={open} onOpenChange={setOpen}>
  <CollapsibleTrigger asChild>
    <div className="flex items-center justify-between cursor-pointer select-none px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Section Title
      </p>
      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
    </div>
  </CollapsibleTrigger>
  <AnimatePresence initial={false}>
    {open && (
      <motion.div
        key="content-key"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{ overflow: 'hidden' }}
      >
        {/* content */}
      </motion.div>
    )}
  </AnimatePresence>
</Collapsible>
```

**Rules:**
- `AnimatePresence initial={false}` — prevents the exit animation from playing on the first render (the section starts closed; no exit needed before it was ever opened).
- `overflow: 'hidden'` on the `motion.div` (inline style, not className) — prevents content from visually overflowing during the height-0 phase.
- `height: 'auto'` as the animate target works correctly with Framer Motion; no `maxHeight` hack needed.
- The `ChevronDown rotate-180` transform should use `transition-transform duration-200` (CSS) not a Framer Motion variant — it's a decorative indicator, not a structural animation.
- Collapsibles default to **closed** for secondary/optional content. Auto-open only when there is unsaved state or a first-use condition that justifies it.

### Muted Sub-tile

A tinted grid item for compact KPI grids. Two variants exist for different contexts.

#### Variant A — KPI Chip (prominent, borderless)

Used in persistent full-width sections where the metrics are the primary content. Background is semi-transparent so it reads as a zone without visual heaviness. (The cashflow KPI row that introduced it retired with the Tracciamento redesign on 2026-08-22 — inside a tile the KPIs are the bare 22px trio of the Cashflow tile, no chip; the variant remains for the pages not yet propagated.)

```tsx
<div className="bg-muted/40 rounded-xl p-3.5">
  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
    Label
  </p>
  <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">
    Value
  </p>
  <p className="text-[12px] font-mono mt-1.5 text-muted-foreground">
    Secondary / delta line
  </p>
</div>
```

Grid: `grid grid-cols-2 desktop:grid-cols-4 gap-3`. Value scale: Sub-hero (`text-[22px]`). Delta annotation uses the **Delta Annotation** typographic level (sign-aware color).

#### Variant B — Parameter Tile (dense, bordered)

Used inside collapsible sections where slight extra separation aids readability of many parameters side by side.

```tsx
<div className="bg-muted rounded-xl p-3.5 border border-border">
  <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
    Label
  </p>
  <p className="text-[16px] font-bold font-mono tabular-nums">Value</p>
</div>
```

**Shared rules:**
- Background is `bg-muted/40` (Variant A) or `bg-muted` (Variant B) — never `bg-card` (card-within-card violation).
- Radius is `rounded-xl` (14px), one step below the container's `rounded-2xl`.
- Variant A (KPI chip): use for persistent, always-visible metrics. No border — the background tint alone provides definition.
- Variant B (parameter tile): use inside collapsible parameter panels only. The border adds precision in high-density config grids.

### Thin Category Bar

A minimal inline progress bar for category breakdowns inside a KPI card. Shows proportional weight at a glance without mounting a full chart component.

**Structure:**
```tsx
<div className="space-y-3">
  {categories.map(cat => (
    <div key={cat.name} className="space-y-1">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 min-w-0">
          {/* Dot indicator — circle, always rounded-full */}
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-[13px] text-foreground truncate">{cat.name}</span>
        </div>
        <span className="text-[13px] font-mono tabular-nums text-foreground ml-3 flex-shrink-0">
          {formattedValue}
        </span>
      </div>
      {/* Bar track */}
      <div className="h-[3px] bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, background: color }} />
      </div>
    </div>
  ))}
</div>
```

**Rules:**
- Bar height is exactly `3px` — an accent shape, not the primary data carrier. Category name and value carry the data; the bar adds scannable shape.
- Color from `useChartColors()` via the parent — never hardcoded hex. Expense categories use `chartColors[0]`; income categories use `chartColors[1]`.
- Row dot indicator uses `rounded-full` (circle). Contrast this with the chart legend swatch below, which uses `rounded-[2px]` (square) — circles mean "inline indicator," squares mean "color key."
- Use `truncate` on the category name with `min-w-0` on the flex parent to prevent overflow on long names.
- Only render the entire block when data is available (`categories.length > 0`) — no placeholder bars with dummy widths.
- Two-column layout inside a card: expenses left, income right via `grid desktop:grid-cols-2 gap-x-8 gap-y-4`. On mobile they stack.

### Card Sticky Footer

A technique for pinning secondary metric content to the bottom of a variable-height Card. Used when optional data (TER, costs) should align to the card baseline regardless of how much primary content is above it.

**Implementation:**
```tsx
<Card className="rounded-2xl overflow-hidden h-full">
  <CardContent className="p-[22px] flex flex-col h-full">
    {/* Primary content — fills available space naturally */}
    <p className="eyebrow">...</p>
    <div className="value">...</div>
    {/* Sticky footer — pushed to the bottom via mt-auto */}
    {hasOptionalData && (
      <div className="mt-auto pt-4 border-t border-border">
        {/* secondary metrics */}
      </div>
    )}
  </CardContent>
</Card>
```

**Rules:**
- Requires `flex flex-col h-full` on `CardContent` and `h-full` on `Card`. Without both, `mt-auto` collapses.
- The containing grid row must also define a height (`h-full` propagates from the row in `desktop:grid-cols-[2fr_1fr]`). On mobile where the grid stacks, each card determines its own height naturally.
- Use only for **optional/conditional** secondary content. Footer content that always renders should be placed at a fixed spacing from the primary block, not anchored via `mt-auto`.
- `border-t border-border` provides visual separation; `pt-4` provides breathing room. `mt-auto` creates the push — no explicit `flex-1` spacer element needed.
- On desktop, pair with the companion card's `h-full` so the sticky footer visually aligns with the companion card's bottom edge.

### CompositionList and CompositionBar (Ranked Comparison and Composition)

Two related primitives replace pie/donut charts everywhere the question is a magnitude
comparison or a full breakdown, not a simple part-of-whole read:

- **`CompositionList`** (`components/ui/composition-list.tsx`): a `divide-y` list of rows —
  label + bar + mono value + `%` — for "which items are biggest, by how much" with 6+ items
  (category breakdowns, per-payer rankings). Bar width is `value / maxValue` (the largest item
  fills the track), NOT `percentage` — width encodes rank, the trailing `%` encodes share.
  Using `percentage` as width leaves every bar looking short whenever no single item
  dominates the total, recreating the empty-card problem this primitive exists to solve.
- **`CompositionBar`** (`components/ui/composition-bar.tsx`): a single stacked bar (all
  segments summing to ~100%) plus an optional inline legend — "what does the whole composition
  look like" in one glance, for a handful of segments (asset classes, allocation categories).
  `AllocationCompositionBar` is a thin wrapper supplying asset-class-specific segment
  derivation over this primitive.

**Rule — when a pie/donut is still correct:** only for a genuine part-of-whole question with
≤5 slices AND some information a flat row wouldn't carry (e.g. an active-slice highlight
synced to a list selection, or a hand-rolled SVG donut integral to a hero card layout — see
Animated SVG Donut below). Everywhere else — 6+ items, no extra per-slice interaction — use
`CompositionList` or `CompositionBar` (on a redesigned page the tile form of the same idea is **Ranked Rows with Residual**: Analisi's composition lists moved into tiles as clickable `RankedRows` on 2026-08-25, and `CompositionList` remains on Previdenza). This extends the existing Liquidità rule below: a donut
was replaced by flat rows there for the same reason (chrome reduction, more information with
less visual noise); pie charts as drill-down or ranking UI carry that same anti-pattern at a
larger scale (Analisi's 5 pies, Overview's 2 compact pies, Dividendi's per-payer pie all showed
this — see the 2026-07-13 pie-chart redesign). As of that redesign, **the app has zero
Recharts `<Pie>` usages left** — the one remaining candidate, Obiettivi's goal-allocation
donut, turned out to be dead code (`GoalAllocationPieChart.tsx`, 0 importers — the donut had
already been dropped from `GoalBasedInvestingTab` in an earlier session in favor of the goal
list, and the file was removed rather than polished once this was discovered).

### Chart Legend Swatch

The color swatch used in composition bar / chart legend rows. At 8×8px, shape matters: a fully round circle reads as a "dot indicator" (inline traffic-light semantics); a slightly rounded square reads as a "color key."

**Structure (LegendRow):**
```tsx
<div className="flex items-center gap-2">
  {/* Square swatch — rounded-[2px], NOT rounded-full */}
  <div
    className="w-2 h-2 rounded-[2px] flex-shrink-0"
    style={{ background: item.color || chartColors[index] }}
  />
  <span className="flex-1 text-[11.5px] text-foreground font-medium truncate">{item.name}</span>
  <span className="text-[11.5px] text-muted-foreground font-mono tabular-nums">
    {item.percentage.toFixed(1)}%
  </span>
</div>
```

**Rules:**
- `rounded-[2px]` for legend swatches (color keys). `rounded-full` for inline dot indicators (category bars, status bullets).
- Filter legend rows to `percentage >= 5` — slices below 5% don't warrant a label at the available width.
- Value shown is `percentage` (not raw currency) — the chart slice already communicates proportion; the legend reinforces it numerically.
- Container: `flex flex-col gap-[7px]` with `min-w-0` to handle truncation of long asset names.

### Deferred Chart Mount (Performance Pattern)

**Scope note (2026-08-22).** The Panoramica no longer needs this: its composition is a `CompositionBar` (div segments) and its sparkline a hand-written SVG, neither heavy enough to compete with the count-up. The pattern remains correct for pages that mount Recharts after a hero count-up.

When heavy SVG charts (Recharts, custom SVG) would compete with a count-up animation on the same page, defer their mount until the animation completes.

**Implementation:**
1. The hero count-up component (`OverviewAnimatedCurrency`) accepts an `onSettled` callback that fires exactly once when `animated === value` (after the rAF loop ends).
2. The page sets a `heroSettled` boolean when `onSettled` fires.
3. The chart section watches `heroSettled` and schedules its own `chartRenderReady` state via `requestIdleCallback` (with `setTimeout(0)` fallback):

```tsx
useEffect(() => {
  if (!heroSettled || chartRenderReady) return;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => setChartRenderReady(true), { timeout: 800 });
  } else {
    setTimeout(() => setChartRenderReady(true), 0);
  }
}, [heroSettled, chartRenderReady]);
```

4. Until `chartRenderReady`, the chart section renders a loading placeholder (`<Loader2 animate-spin>`).
5. On mobile or with `prefers-reduced-motion`, skip the delay entirely (`chartRenderReady` starts `true`).

**Count-up isolation:** The count-up `useCountUp` hook lives in a leaf `OverviewAnimatedCurrency` component — **not** in the page component. Each rAF tick only re-renders the tiny leaf span, not the entire page tree. This is non-negotiable: a count-up inside a page component will re-render every card on every frame.

**Revealed-charts tracking:** Use a `Set<string>` (`revealedCharts`) to track which chart IDs have already completed their entrance animation. Pass `animateOnMount={!revealedCharts.has(id)}` to prevent Recharts from replaying entrance animations when tabs switch or data refreshes.

## 6. Do's and Don'ts

### Do:

- **Do** open every redesigned page with a verdict sentence before any number (The Verdict-First Rule). The question changes per page — "come va il mese?" on the Panoramica, "quanto rende?" on Rendimenti — the shape does not: headline with a tone-coloured full stop, then the facts with mono figures in the prose.
- **Do** give every tile a reading line — the answer in words, 13px, above the figures — and keep each tile to one question (The One-Tile-One-Question Rule). If two tiles would show the same rows, one of them is the wrong tile.
- **Do** close a ranked list with its residual ("Altre categorie · 912 € · 21%") whenever the rows are a share of a stated total. A list that does not add up reads as missing data.
- **Do** put a projection next to its reference and name it as a projection ("Al ritmo attuale ~6.161 €" beside "A luglio 4.109 €"). Extrapolate spending only — a salary lands once, so a linear projection of income is nonsense.
- **Do** give a hand-written chart a hover reading through `components/ui/chart-hover.tsx`, under `(pointer: fine)` only (The Hover Reading Rule) — the figures it shows must already exist for touch and screen readers in the reading line, the `<title>`s and the `aria-label`.
- **Do** stretch an edge-to-edge chart with the SVG positioned `absolute inset-0` inside a `relative flex-1 min-h-[…]` box (`preserveAspectRatio="none"`). An in-flow `<svg>` with `height: 100%` in an auto-height parent takes its height from its own viewBox ratio — hundreds of pixels — and explodes the grid row.
- **Do** let `PageHeader` default to its compact variant on a redesigned page: eyebrow · title · description on one line, actions right, no separator, the verdict as the real headline. Declare `variant="legacy"` only on a page not yet propagated. The mobile sticky navbar is unchanged.
- **Do** use one eyebrow for the frame and the content (The One-Eyebrow Rule): `TILE_EYEBROW_CLASS` names a tile's question, the compact header's section and a navigation group alike.
- **Do** load a redesigned page with `TileGridSkeleton` and its own `cells` — one skeleton component for every page, the verdict lines plus the grid, nothing else.
- **Do** give an explicit width to controls with no intrinsic one (`PeriodSelector` is `flex-1` buttons) when they sit in a flex row, or the labels collapse into one word.
- **Do** derive every visual choice from function — form follows function. Before adding any property (a color, a shadow, a radius, a motion, an extra pixel of size), name the job it does. If the only answer is "it looks nice," remove it. Form is the consequence of function, never its costume.
- **Do** use Geist Mono with `font-feature-settings: "tnum" 1` for every monetary value, percentage, and structured date. Column alignment is a trust signal.
- **Do** paint the active route with `--sidebar-accent` and nothing else. The navigation chrome of the default theme has no hue: the assistant is a route, not a violet banner.
- **Do** use the Float shadow exclusively for elements that leave document flow (modals, the mobile nav pill, dropdown menus). Never apply it to in-flow cards.
- **Do** respect `prefers-reduced-motion`. Framer Motion's `useReducedMotion()` is integrated across all animated components and must be preserved on new additions.
- **Do** use `desktop:` (1440px) as the primary responsive breakpoint for layout switches. Never use `lg:` (1024px) for wide-screen layouts — iPad Mini in landscape is 1024px and receives the mobile treatment by design.
- **Do** use `oklch()` for all custom color definitions. This project is OKLCH-native; hex values in CSS are approximations of the canonical color.
- **Do** let the five named themes handle personality. Resist adding theme-like color to the default palette.
- **Do** use the view-transition circle reveal (`0.45s cubic-bezier(0.4, 0, 0.2, 1)`) for dark/light mode toggling. The origin coordinates are set inline from the click position.
- **Do** use `requestIdleCallback` (with `setTimeout(0)` fallback) to schedule heavy SVG mount after a count-up animation settles. The `heroSettled + chartRenderReady` pattern prevents frame budget competition between animations and chart render.
- **Do** isolate count-up animations in leaf components (`OverviewAnimatedCurrency`), not in the page component. Each rAF tick re-renders only the leaf, keeping the rest of the tree stable.
- **Do** use `useAnimation + useEffect([])` (empty deps) for "animate once on mount" ring charts. This prevents the ring from restarting whenever a parent component re-renders due to unrelated state changes.
- **Do** use `-mx-[N]px` negative margin (matching the card padding) to create edge-to-edge charts inside a card — `preserveAspectRatio="none"` on the SVG fills the broken-out container correctly.
- **Do** use the 12-column Tile Grid for a redesigned page (dominant tile `desktop:col-span-5 desktop:row-span-2`). `desktop:grid-cols-[2fr_1fr]` is the legacy hero+companion layout of the pages not yet propagated.
- **Do** use `border-t border-border/40 pt-4` for section separators within a page scroll flow. The 40% opacity is lighter than structural borders — it suggests chapter, not division.
- **Do** use `bg-muted/40 rounded-xl p-3.5` (no border) for KPI chip grids inside persistent, always-visible sections. Reserve the full-opacity `bg-muted` with `border border-border` for parameter tiles in collapsible zones.
- **Do** use `mt-auto` inside `flex flex-col h-full` CardContent to pin optional secondary content to the card bottom. The pattern requires `h-full` on both Card and CardContent; without both, `mt-auto` has no space to push against.
- **Do** use `rounded-[2px]` for chart legend color swatches (color keys). Use `rounded-full` for inline dot indicators (row bullets, status dots). The distinction is semantic: square = color key, circle = inline marker.
- **Do** lay out a row of same-purpose, different-length chips as a grid (`grid grid-cols-1 gap-2 tablet:grid-cols-2`), not `flex-wrap`, so every chip shares the same column width without any JS measurement — see **The Equal-Column Chip Rule**. Full-width chip rows only: inside a tile the chips are grouped (**The Grouped Chip Rule**), as on the Panoramica and Patrimonio since 2026-08-22.
- **Do** duplicate responsive blocks with `desktop:hidden` / `hidden desktop:grid` when the same data must be positioned differently across breakpoints (e.g. TER + cost metrics in the hero card footer on desktop, as standalone cards below the hero on mobile). Redundant DOM is preferable to a convoluted single implementation that degrades at both sizes.
- **Do** draw today on a budget's track (**Budget Track**): a used share means nothing until it is read against the calendar's share of the same window, and the reading line says the gap in points.
- **Do** use inverted sign semantics (parameterized `positiveGood: boolean`) for expense delta annotations. A positive Spese delta means spending increased — the color should be `text-destructive`, opposite to the income logic. Never hardcode positive-as-green (raw `text-green-*`) in components that handle both income and expense metrics; use the `text-positive` / `text-destructive` tokens so the sign colors follow the theme.

### Don't:

- **Don't** let a generated sentence blame or credit something the data does not show (The Narrative Honesty Rule). A falling month with a positive market effect is "nonostante il mercato", never "il mercato ha pesato"; a missing input drops its clause rather than printing a placeholder.
- **Don't** repeat a tile's rows in another tile. The Cashflow tile lost its top-3 categories the moment "Spese per categoria" existed.
- **Don't** list a projected overrun beside a crossed threshold, nor colour a budget under its limit with the positive token (The Risk-vs-Fact Rule, the Sign-Color Token Rule): a risk is a projection, a fact is spending, and «under budget» is not a gain.
- **Don't** colour a whole verdict headline by tone. The full stop carries the tone; the figures carry their signs; the words stay `text-foreground`.
- **Don't** format a percentage with `toFixed` in user-facing copy — the dot decimal is not Italian (The Comma Rule).
- **Don't** give the chrome a second label size. A 12px group label next to 10px tile eyebrows reads as two systems; the frame borrows the content's eyebrow (The One-Eyebrow Rule).
- **Don't** ship a touch target under 44px in the icon rail or the phone drawer — a 28px options button is a desktop affordance that landed on a phone.
- **Don't** pin a page to "no scroll". Density is the goal; a third row below the fold is fine, a tile squeezed until its numbers wrap is not.
- **Don't** shape an element for appearance alone. A larger number, a heavier shadow, a brighter accent, or an extra animation that exists "to look good" violates form-follows-function. If a property carries no function, it is decoration — cut it. And never fake what isn't there: no false depth, no invented material, no shadow hierarchy a surface hasn't earned (the honesty corollary).
- **Don't** add brand color to the default theme's surface chrome (backgrounds, cards, buttons). Zero-chroma is the rule: color belongs to data, not decoration.
- **Don't** model density after a Bloomberg terminal. Dense presentation serves the user; illegibility or emotional coldness does not.
- **Don't** use consumer fintech color patterns — colorful fills, playful gradients, bright accents on every interactive element. This tool handles serious long-term wealth management.
- **Don't** apply Material Design component conventions. Generic patterns that serve any app serve this one poorly.
- **Don't** use gradient text (`background-clip: text` with a gradient fill). Use weight or size for emphasis.
- **Don't** use side-stripe borders (colored `border-left` greater than 1px as a card accent). Rewrite with full borders, background tints, or leading icons instead.
- **Don't** use glassmorphism (`backdrop-filter: blur`) decoratively. A blurred surface must be structurally justified.
- **Don't** use proportional figures for financial numbers in tabular contexts. `font-variant-numeric: tabular-nums` or `font-feature-settings: "tnum" 1` is required wherever numbers appear in column-aligned positions.
- **Don't** add shadows larger than Lift to in-document cards. Float shadow creates false depth hierarchy when applied to surfaces that haven't left document flow.
- **Don't** nest cards inside cards (box-within-box). If a list of items lives inside a Card container, the rows are flat — no individual card per item.
- **Don't** use progress bars to communicate allocation or weight unless the visual fill carries information the number alone cannot convey. A dominant `font-mono` value + label is almost always clearer.
- **Don't** give equal visual weight to multiple values when one is the primary takeaway. Apply the Dominant Value Block: one number commands, the rest are context.
- **Don't** use `lg:` (1024px) as a layout breakpoint for wide-screen changes. iPad Mini in landscape is 1024px and receives the mobile treatment by design. Use `desktop:` (1440px) for all layout switches.
- **Don't** design the desktop version first and then adapt it for mobile. Mobile layout is the base; desktop adds columns, tables, and sidebar — it does not simplify a desktop original.
- **Don't** use `bg-card` for sub-items nested inside a Card. Sub-tiles inside a card must use `bg-muted` — the card background repeated creates a card-within-card violation even when the inner element has no explicit `<Card>` wrapper.
- **Don't** place count-up animation logic (`useCountUp`, `rAF` loops) in a page-level component. Every frame tick re-renders the entire tree. Animation state belongs in a dedicated leaf component.
- **Don't** render a ring or donut chart with `strokeLinecap="round"` when the segment can be near 0% or near 100% — the round caps visually overlap the track ring and distort the reading. Use `strokeLinecap="butt"` for data-accurate arcs.
- **Don't** use `rounded-full` for chart legend swatches (CompositionList/CompositionBar rows). At 8×8px, a circle reads as a traffic-light dot (status indicator), not as a color key. `rounded-[2px]` reads as a color sample. The distinction is visually meaningful.
- **Don't** reach for a pie/donut chart to compare magnitudes across 6+ items. Pie angles are hard to compare; aligned bar lengths aren't. Use `CompositionList` (ranked rows) for "which items are biggest" or `CompositionBar` (stacked bar) for "what does the whole composition look like" — reserve pie/donut for genuine part-of-whole reads with ≤5 slices and information a flat row can't carry (see CompositionList and CompositionBar above).
- **Don't** use an animated SVG donut or ring chart when flat `divide-y` rows carry the same information more clearly. Chrome reduction is the primary principle — the animated donut in the Liquid card was replaced by a flat 3-row breakdown precisely because the breakdown communicates more (three separate values, individual percentages) with less visual noise.
- **Don't** use placeholder bars (e.g. dummy `width: 0` category bars) when no data is available. Omit the block entirely — absence communicates "no data" more cleanly than empty chrome.
