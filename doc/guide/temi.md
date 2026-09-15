# Temi colore (Color Theme System)

> **When to open this guide** — whoever touches `app/globals.css` (the fourteen theme blocks: `:root` + `.dark` and the six named themes, each as `[data-theme="name"]` + `.dark[data-theme="name"]`), `contexts/ColorThemeContext.tsx`, `lib/hooks/useChartColors.ts`, `lib/hooks/useActionColors.ts`, `lib/utils/costCenterColors.ts`, `lib/constants/colors.ts`, `components/layout/ThemePicker.tsx` or the `COLOR_THEME_SWATCHES` in `app/dashboard/settings/page.tsx`. The palette itself is in `DESIGN.md` → §2 (Colors: The Zero-Chroma Foundation). `AGENTS.md` keeps the stub with the essentials plus the repo-wide token rules (`AGENTS.md § Layout and Color Tokens`, `AGENTS.md § Recharts`); here is the full rule.

## Color Theme System
- **Parallel theming**: next-themes owns `.dark`, the custom system owns `data-theme` — fully independent. CSS:
  `[data-theme="name"]` for light, `.dark[data-theme="name"]` for dark; `ColorThemeContext` lives inside `AuthProvider`.
  **The theme is an external store** (2026-09-06): `useSyncExternalStore` over localStorage with `'default'` as the
  server snapshot; the `data-theme` attribute is a pure effect on the value, `writeStoredTheme` applies it before the
  re-render, and the Firestore sync depends on `uid` alone (rewriting an equal value is a no-op in every sink).
- **`useChartColors` timing**: `useEffect + useState + requestAnimationFrame`, NOT `useMemo` — `getComputedStyle` during
  render runs before next-themes has updated the DOM and yields stale colours on a theme switch.
- **oklch luminance filter**: L > 0.82 in light or L < 0.30 in dark falls back to the static palette, so a theme with
  chart colours at extreme luminance always falls back — fix it at the CSS level. Below ~0.015 chroma everything looks
  identically gray, so `--card`/`--background`/`--muted` need chroma ≥ 0.020.
- **The token you AUTHOR is not the token the browser RETURNS.** Turbopack's CSS transform transpiles `oklch()` for the
  build's browser targets, and `getComputedStyle(document.documentElement).getPropertyValue('--chart-6')` came back as a
  `lab(…)` string under `npm run dev:e2e` (measured 2026-08-30). Two consequences. A Playwright assertion on a resolved
  token must compare CHANNELS or DISTINCTNESS — never match `/^oklch\(/`, a regex on the authored syntax that fails on a
  correct value and can only ever pass by accident. And `parseOklchL` returns `null` for anything not literally
  `oklch(`, so the luminance fallback above is **inert** wherever the served string is transpiled: the colour passes
  through unfiltered. Read the served string before trusting either.
- **Action/semantic colors that must follow the theme: clamp lightness, do not index-fallback.** `useActionColors` clamps
  only the oklch L channel, preserving hue and chroma; `useChartColors`' same-index fallback would lose the theme hue and
  can collapse two states onto one colour. Resolve **once per section** and pass the colour down.
- **Sign tokens must be verified per theme**: `--positive` is declared twice and no theme overrides it, so one value fixes
  all fourteen combinations, while `--destructive` is declared **fourteen times** (cyberpunk's is orange) and must be
  measured per theme. Never assume a token change lands globally without counting its declarations.
- **A user-chosen identity colour is a SLOT, not a hex** (`'chart-1'..'chart-8'`, resolved by `resolveCostCenterColor`).
  Three rules: **migrate without a backfill** (`LEGACY_HEX_SLOTS` maps each old hex to the slot at the same position);
  **derive the no-colour fallback from the document id** (FNV-1a), never from the row's rank, which repaints half the
  list on every period switch; **indices 0-7 are theme-aware** (`--chart-1..8` exist in every block since
  2026-08-30), 8-9 still pad from the static `CHART_COLORS`.
- **The default theme's light slots hold the dark hue bands** (2026-09-13): `:root --chart-1..5` were re-pitched from
  the shadcn preset (three oranges and two teals — Liquidità measured ΔE00 10.1 from Immobili on the real account's
  Composizione bar, and the hero's rising curve wore the hue of `--destructive`) onto blue · green · amber · violet ·
  coral with L and C set for white. **The floor is a test**, `__tests__/chartPaletteDistinctness.test.ts`: it reads
  `globals.css` itself, ΔE00 ≥ 14 between any two slots of a mode, every slot inside the `useChartColors` luminance
  guard, each slot ≤ 30° of hue from its twin in the other mode. Default theme only: the five named themes are not
  measured (retro-arcade declares two identical slots, elegant-luxury three reds — CLAUDE.md → Known Issues). A slot
  change re-derives `PRINT_CHART_HEX` (`__tests__/printTokens.test.ts` says the new hex); `PRINT_RANK_HEX` moved to
  slot 7 the same day because slot 3 became crypto's amber.
- **`--chart-6/7/8` carry a meaning across every theme** (2026-08-30): 6 = Materie Prime (gold/olive), 7 = Trend
  Following (teal/cyan), 8 = Carry (rose/magenta) — the hue band is held per theme across light AND dark so a slot does
  not change identity when the mode flips, and only L and C are re-pitched to the block's surface. Before this the tail
  padded from `CHART_COLORS`, where the static teal at index 6 measured **ΔE00 0.87** from the default theme's
  `--chart-2`: Trend Following and Obbligazioni were not similar, they were the same colour.
- **`ASSET_CLASS_CSS_VAR` no longer exists.** `getAssetClassCssVar` DERIVES the token from `ASSET_CLASS_CHART_INDEX`
  (`--chart-${slot + 1}`), because the hand-written map was a second source that disagreed with the first: crypto's chip
  was `--chart-4` while its chart slot was 2, so one class wore two hues on one screen. `cash` keeps
  `--muted-foreground` on purpose — liquidity is the absence of a position, not a series.
- **Adding a theme**: CSS blocks `[data-theme="name"]` + `.dark[data-theme="name"]`, the `ColorTheme` union, an entry in
  `COLOR_THEME_SWATCHES` (module level in `settings/page.tsx`), the swatch grid columns, `tsc`. The swatch previews carry
  each theme's own literal oklch values ON PURPOSE — they preview a palette that is NOT active, which no CSS token can
  express — and the accessible name is the POSITION («Colore 3 di 7: Midnight Bloom»), never the hue.
- **Porting a theme from a registry is a conversion, not a paste** (Lime Frost, 2026-09-12, from 21st.dev — the source
  tokens come from `GET https://21st.dev/api/trpc/themes.getBySlug?input={"json":{"slug":"<slug>"}}`, the page itself is
  client-rendered). Convert hex → oklch, add what the registry does not know (`--chart-6/7/8` in their hue bands,
  `--warning*`), drop fonts/shadows/letter-spacing, then **measure** every sign token and chart slot against the block's
  own `--card` and re-pitch L/C with the hue held: Lime Frost's light red-500 was 3.76:1 and its lime/green-500/slate-400
  chart slots 2.04-2.56:1. The deviations are listed in the comment above the CSS block.
- **A light primary is also a TEXT colour — measure it as one.** `--primary` backs 48 `text-primary` uses (links,
  checks, the sidebar's account label) and thin `border-primary` rings, so a registry's electric accent that works as a
  button fill can vanish as text: Lime Frost's lime (L 0.887) measured 1.34:1 on white. The owner's call after the tour
  (2026-09-12): keep the electric lime in DARK only (13.36:1) and darken it in LIGHT to L 0.52 (5.25:1 on `--card`,
  4.69:1 on `--background`), which flips `--primary-foreground` to white. **Darkening a light `--background` moves
  every text token that sits on it**: lifting the tiles (card/background 1.03 → 1.12:1) took `--muted-foreground` and
  `--destructive` down with it, because the verdict's prose and sign values sit on the ground, not on a card.
- **Lime Frost light is a ROLE palette, not a re-pitched source** (owner's retouch, 2026-09-13/14, Agentation
  annotations on the mirror account). The drivers: green owns the ground and the action (flat ground L 0.955 hue 133,
  lime `--action` fill with a slate label, deep green `--primary` only as text/marks); cold owns data and selection
  (net worth `--hero-series` ice 228, spending `--flow-out` ice 232, income `--flow-in` 138, lavender 295 for secondary
  series, white `--segment-active`); the sign colours judge, a type never takes them (a spend, a sale, cash, a bear
  scenario). The full vocabulary, the ten rules and the page-by-page audit live in the «Carta del tema Lime Frost»
  artifact; the token families are indexed in the comment that opens the role tokens in `globals.css`.
- **Role tokens default to what the component painted before** (`--flow-in: var(--chart-2)`, `--hero-series:
  var(--chart-1)`, `--scenario-*`, `--trade-*`, `--toggle-on`, `--outline-surface`…), so only a theme that names one
  changes. **A light block that writes a role token as a literal must take it back in its dark block**: `.dark` and
  `[data-theme]` share specificity and the later rule wins, which is how the light hero blue once reached Lime Frost
  dark. `--category-icon(-bg)` is the exception — undeclared in `:root` so `var(…, saved hue)` falls back; the dark
  block resets it with `initial`.
- **The served CSS is `#hex` / `lab()`, never `oklch()`** (Lightning CSS down-levels it), and `getComputedStyle` hands
  that form back. Any JS that parses a theme colour must handle all three: `lib/utils/colorLightness.ts` does, for the
  action colours; the underwater chart now passes `var(--drawdown)` instead of wrapping a read value in `oklch(…)`
  (which painted it black in every theme). **`useChartColors` reads L through `colorLightness`** since 2026-09-15, so
  its too-light / too-dark fallback to `CHART_COLORS` now fires on the served forms too (before, it never did): a theme
  whose served chart slot is above L 0.82 in light, or below 0.30 in dark, now paints the static slot instead.
  **`colorToHex`** turns any served form into `#rrggbb` for Nivo, through `lib/hooks/useCssColorTokens.ts`.
- **The 50/30/20 roles** (`--role-need · --role-want · --role-saving · --role-unclassified · --role-deficit`, Analisi's
  Flusso): aliases in `:root` (`--flow-out`, `--chart-4`, `--flow-in`, `--muted-foreground`, `--destructive`), the
  approved triad in Lime Frost light — need = `--flow-out` ice 232, want lavender 295, saving green-teal 175 (ΔE_ok
  0.084 from `--flow-in`; 165 read as the income green), unclassified `--chart-5`, deficit the sign red — each ≥ 3:1
  on the white tile, and taken back to the aliases in Lime Frost dark. Chosen from a swatch preview on the owner's
  figures (2026-09-15).
- **Charts slots mean asset classes.** A series that is not a class (net worth, income, spending, a scenario) takes its
  role token, never a `--chart-N`; in Lime Frost light `--chart-5` (Liquidità) is a neutral ice grey. Still on slots:
  the Analisi Sankey (hard-coded hex, planned with the 50/30/20 split) and a few FIRE Dettaglio lines.

