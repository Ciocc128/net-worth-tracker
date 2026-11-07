# La fascia in alto (mobile) — dossier

Fork only, Lime Frost and Graphite. Thread «Integrare la fascia colorata nella home mobile», 2026-11-06.
Reference: the Nubank home the owner shared (a full colour band behind the header, the content as a sheet
with rounded corners over it). Research page with the four first variants on the real app:
<https://claude.ai/artifact/HBBMV36KEWyJEcrNHEsUGj>; the colour options of the implementation:
<https://claude.ai/artifact/FiUgMhPUfzqpsXadUkicnM> (files in the project's `fascia-panoramica/`).

## Obiettivo

Give the phone a top bar with depth and a theme's own colour: a band in which the page's title, date and
actions sit, the page under it starting as a sheet with rounded corners, and a quick way to Impostazioni.

## Perimetro

- **Incluso**: the mobile `PageHeader` (below `desktop:`, never the tablet in landscape) on every dashboard page
  and on the landing; Lime Frost and Graphite, light and dark; a shortcut to Impostazioni on every dashboard page
  but Impostazioni.
- **Escluso**: the twelve upstream themes in the picker (no Fascia tile), the desktop header (one line, unchanged), the other twelve themes (`--top-band` defaults to the
  page's ground and ink: nothing changes), the iPhone status bar / `theme-color` (still the page's ground), the
  Patrimonio tile overlapping the band (research variant A, superseded by D-FA2).

## Casi d'uso

1. A reader opens any page on the phone: the bar is the band, the page starts under it with 24px rounded corners.
2. The reader scrolls: over the first 24px the corners flatten to a straight edge; the content slides under a
   plain rectangle. Nothing changes height, so nothing moves but the corners.
3. The reader taps the person icon in the band: Impostazioni.

## Regole

- **The band**: `--top-band` / `--top-band-foreground`, set in the four fork blocks of `app/globals.css`; the
  shared default is `var(--background)` / `var(--foreground)`.
- **On the band** (`.top-band`, fork themes only) `--background`, `--foreground`, `--border`, `--input`,
  `--accent` and `--muted-foreground` are re-pointed to the band, so the outline buttons and the date read on it:
  the secondary line is the ink at 88% (`color-mix(in oklab, ink 88%, transparent)`), the outlines at 30%, a
  hover at 14%.
- **The sheet's corners** are two band-coloured ears just under the bar (`::before`/`::after`, a radial gradient),
  radius `24px × (1 − --band-progress)`; `--band-progress` = `scrollTop / 24` clamped to [0, 1], written on the
  header's style by `useTopBandProgress` on each animation frame of `#page-main`'s scroll (no React state).
- **The bar reaches the top**: `-mt-4 pt-5` covers `<main>`'s 16px padding; the sticky wrapper is unchanged.
- **Above the bar, the band** (2026-11-07, the owner's iPhone): when iOS rubber-bands the page down at the top,
  the gap above the bar showed the ground between Safari's lime status bar and the band. The band paints its
  colour 100vh above itself with no layout (`border-image: linear-gradient(var(--top-band) 0 0) fill 0 / 0 /
  100vh 0 0 0`), clipped by `<main>` the rest of the time.
- **The document does not bounce** (2026-11-07, the owner's video): right after a tab change `<main>` has nothing
  to scroll yet, iOS hands the drag to the document, and its bounce moved the whole shell down over the ground.
  Below `desktop:`, in the band themes, `html` and `body` take `overscroll-behavior-y: none`; `<main>` keeps its
  own bounce (covered by the outset above). Safari's pull-to-refresh goes with it in those themes.
- **The shortcut** is a person (`CircleUserRound`), not a gear: Cashflow already has its own gear
  («Impostazioni Spese») in the same bar. Not on Impostazioni, not on the Assistente (D-FA11).

### I pulsanti della barra

- **One shape** (D-FA10): below `desktop:` every button in the bar (`PageHeader` → `[data-band-actions]`) is a
  44px square with a 20px icon and no word, in every theme, whatever its page wrote for it (`app/globals.css` →
  The band's buttons, outside any layer so it beats the page's utilities).
- **Two kinds**: the page's main action keeps the action fill (Patrimonio +, Previdenza +, Assistente +,
  «Salva»); every other one (a ghost, an outline, the shortcut) is an outline in the bar's ink, transparent,
  border at 30% of the ink.
- **A word only where it answers**: «Salva» (`data-band-label`), whose «Salvato» is the save's confirmation.
  The words of the others are back from `desktop:` and in the tablet's landscape row
  (`hidden desktop:inline tablet-landscape:inline`), never in the band at 768.

| Pagina | Nella barra (390) |
| --- | --- |
| Panoramica | Crea snapshot · Impostazioni |
| Patrimonio | Aggiorna prezzi · **Aggiungi asset** · Impostazioni |
| Cashflow (ogni scheda) | Impostazioni Spese · Impostazioni |
| Analisi | Vai a categoria · Impostazioni |
| Rendimenti | Analizza con AI · Aggiorna · Impostazioni |
| Storico | **Aggiungi uno snapshot passato** · Impostazioni |
| Hall of Fame, Allocazione, FIRE | Impostazioni |
| Previdenza | Aggiorna valore · **Registra versamento** · Impostazioni |
| Assistente | Conversazioni · Memoria · Preferenze · **Nuova conversazione** |
| Impostazioni | Ripristina default (Allocazione) · **Salva** |

## Decisioni

| ID | Decisione | Alternative scartate | Motivo |
| --- | --- | --- | --- |
| D-FA1 | **The band is the phone's top bar on every page** (owner, 2026-11-06) | band on the Panoramica only, behind title and verdict with the Patrimonio tile biting it (research A) | the owner wants the band as the app's bar, with each page's buttons and a way to Impostazioni |
| D-FA2 | **The page under it is a sheet with 24px rounded corners that flatten over the first 24px of scroll** | corners that stay; a bar whose height shrinks | the owner's image: rounded and wrapping at rest, a rectangle the content stands out against while scrolling; no height change, so no jump |
| D-FA3 | **Shortcut to Impostazioni in the band, a person icon** | a gear | Cashflow's own gear sits in the same bar |
| D-FA4 | **Lime Frost: the lime of `--action` in both modes** (light `oklch(0.88 0.15 128.5)` with slate ink, 12.9:1; dark `oklch(0.8871 0.2122 128.5)` with its ink, 15.1:1) | light: deep green (labels 4.4:1), slate, ice blue | the owner: the dark is neon-punk on purpose, and lime in both modes is the theme |
| D-FA5 | **Graphite light: the theme's blue** (`oklch(0.52 0.15 255)`, the Aspetto swatch and `--hero-series`; white ink 5.6:1, line 4.7:1) | ink, slate | the owner: «il blu usato nell'icona del tema» |
| D-FA6 | **Graphite dark: the same blue at night depth** `oklch(0.34 0.10 255)` (11.3:1) (owner, 2026-11-06) | the light blue as is (a saturated block on near-black, the neon Lime Frost owns); the bright dark-mode blue with dark ink; plain graphite (1.15:1 on the ground) | Graphite is sober: same hue, lower light, as its other dark tokens |

| D-FA7 | **The reader picks the band in a popover that opens on the theme's card in Impostazioni › Aspetto › Tema colori when the theme is picked (or tapped again; owner, 2026-11-06), from three colours of the theme plus «Nessuna»**: Lime Frost lime (default) · blu ghiaccio · ardesia; Graphite blu (default) · verde · inchiostro . Each a pair the theme already has (light/dark: lime `--action`; ghiaccio `--ghost-hover-foreground`/`--hero-series` dark; ardesia `--secondary`; Graphite verde `--positive` / its night depth; inchiostro `--action` / `--secondary` dark) | Lime Frost verde (refused by the owner); free colour picking | the owner wants to choose; the theme's own colours keep one meaning per colour |
| D-FA8 | **The choice is saved on the account like the colour theme, one per theme** (`userPreferences.topBand`, localStorage `top-band`, `data-band` on `<html>` before the first paint by `TOP_BAND_INIT_SCRIPT`) | per device; one choice for every theme | a theme switch finds its own band again; no flash |
| D-FA9 | **Lime Frost and Graphite lead the theme list** in Aspetto (owner, 2026-11-06) | upstream's order | the fork's two themes are the ones in use |
| D-FA10 | **Every button in the bar has ONE shape: 44px square, 20px icon, no word; the main action filled, the rest outlined in the bar's ink** (owner: «rendi coerente graficamente tutti i pulsanti», 2026-11-06) | each page's own sizes (32, 36, 40, 42, 44px), ghosts beside outlines, «Registra versamento» in words | the bar read as a different toolbar on each page; the words cut Previdenza's title to «Previd…» |
| D-FA11 | **No Impostazioni shortcut on the Assistente** | five buttons in the bar | its four own buttons (with its own preferences) left the conversation's title a few letters |
| D-FA12 | **In the bar a «+» is always filled** (owner's question, 2026-11-07: «perché alcuni + sono lime e altri blu?») | Storico's «+» outlined as a secondary action | on the lime band the filled «+» are the theme ink (night blue) while an outlined one shows the band's lime: one sign, one look |
| D-FA13 | **The filled «+» (and «Salva») on the band is the band's ink with the band's colour as its glyph, on every band** (owner, 2026-11-07; page https://claude.ai/artifact/8S8CF5yXJ61aYdmmmU2fgf) | the theme's action colour (lime on ghiaccio/ardesia, black/grey in Graphite), the ink only where the band IS the action colour | one rule on every band, at the band text's own contrast; the lime no longer appears in the bar on ghiaccio and ardesia |

On every band a main button («+», «Salva») takes the band's ink with the band as its label (D-FA13); the outline buttons on the band are transparent with a 30% ink border.

Amends DESIGN.md → The Neutral-Frame Rule and The Quiet-Header Rule for this bar only (DESIGN.md → The Top-Band Rule).

## Punti aperti

- The iPhone status bar: `ThemeColorSync` keeps the page's ground; painting it with the band needs
  `e2e/shellBoot.ts` → `expectBrowserChromeFollowsTheme` rewritten for 390.
- Mac checks: `test:e2e` (header specs at 390 and 768), `mobile:census` / `mobile:budget` (no height change expected).

## Criteri di accettazione

- `__tests__/topBandTheme.test.ts`: the four blocks name a band and its ink; ink and 88% line ≥ 4.5:1 on it;
  the shared default keeps every other theme as before.
- At 390 in the four fork blocks: rounded corners at rest, half at 12px of scroll, none at 24px; the bar's height
  constant; the shortcut on every dashboard page but Impostazioni and the Assistente, none on the landing.
- At 390, on every page of the table above: each button in the bar 44×44, its icon 20px, the main action filled
  and the rest outlined (measured 2026-11-06 in Lime Frost light/lime and Graphite dark/blu).
