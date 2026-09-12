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

