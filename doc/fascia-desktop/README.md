# Il fascicolo (desktop) — dossier

Fork only. Thread «Progettare la fascia colorata su desktop», 2026-11-20 (spec, Opus). The owner's own idea: on
desktop the sidebar becomes a row of folder tabs, as in a personal file («fascicolo personale»); the open folder's
tab takes the band's colour, and a band in that colour runs from it across the whole width, carrying what the
phone's band carries (doc/fascia/README.md, PR #176/#177). None of the proposals of Fable's desktop review
(`review-ui-desktop.md` in the Library) is taken.

Sketch page on the real app (census data, 1440 × 900, CSS and HTML injected into the page, both rounds, four
themes): <https://claude.ai/artifact/HLaZTQQxj7nk8ukh3ZtbpS>. Files, the injection script (`inject.js`,
`window.__V = { count: 'B', inner: 'U3' }`) and the runner in the project's `fascia-desktop/`.

> **State**: D-FD1…D-FD13 taken by the owner on 2026-11-20 (two rounds of sketches, then one by one; D-FD9
> changed by the owner: the tablet in landscape too). Ready for the implementation thread.

## Obiettivo

Give the desktop the phone's identity: the theme's band at the top of every page with the page's title, its fact
and its actions, and a navigation that says where the reader is without reading — the open folder is the only
coloured one.

## Perimetro

- **Incluso**: the dashboard shell at `desktop:` (today ≥ 1440; after RU0 also 1280–1439 with a fine pointer,
  doc/riordino-ui § 5.10) and on the tablet in landscape (`tablet-landscape:`, D-FD9): the folder-tab row replaces
  `AppSidebar` and `TabletRail`; the band replaces the desktop row of
  `PageHeader`; the page's `PageTabBar` at `desktop:` takes the U3 look. Lime Frost and Graphite in colour, every
  other theme in neutral (D-FD7).
- **Escluso**: the phone and the tablet in portrait change nothing (the phone's band, the bottom pill, «Altro»);
  the composition of the tablet's page in landscape (stage, closed rows) is unchanged, only its navigation; the landing; the groups' content and order, which are the riordino's
  (R2, task RU1, `navGroups`); Traguardi as its own route and Hall of Fame as a tab of Storico (riordino, wave 3).

## Casi d'uso

1. The reader opens Cashflow at 1440: at the top a row of five folder tabs (Panoramica · Entrate e spese ·
   Investimenti · Futuro · Storia) and the Assistente at the right; «Entrate e spese» is the only coloured tab and
   the band runs from it across the screen. In the band: «Cashflow» in full ink, «Analisi spese» attenuated, the
   date under them, «Nuova Spesa», the gear and the person on the right.
2. Under the band the page's tabs (Tracciamento · Dividendi · Budget · Centri di Costo · Divisione) sit on a rule in
   the band's colour; the open one thickens it.
3. The reader clicks «Analisi spese» in the band: the page changes, the folder does not.
4. The reader clicks the «Investimenti» folder: the group opens on its page (D-FD11).
5. The reader clicks the person: the account menu (name, email, Impostazioni, theme, Esci) opens under it (D-FD8).

## Regole

### The folder row (`D-FD2`)

- One tab per group of `navGroups` (riordino § 5.3), in its order, plus the Assistente at the right end with its
  name; the app's name («Portfolio Tracker») at the left. No group labels, no separators: each group IS a tab.
- Each tab: icon 15px + group name, 13.5px, `padding 0 11px`, `border-radius: 11px 11px 0 0`, no bottom border.
  The icon is the first page's icon of the group (`navGroups`).
- **Closed tabs**: height 36px, fill `color-mix(in oklab, var(--top-band) 20%, var(--background))`, border 1px
  `color-mix(in oklab, var(--top-band) 35%, var(--background))`, text `--foreground` at 72%.
- **Open tab**: height 42px (it rises 6px above the others), fill `--top-band`, text `--top-band-foreground`
  semibold, joined to the band with two 12px inverted corners (radial gradients at its feet, as the phone's ears).
- The row sits on the page's ground, 10px from the top; tabs 3px apart.

### The band (`D-FD3`, `D-FD4`)

- Full width under the row, `--top-band` / `--top-band-foreground`, with the same re-pointed tokens as the phone's
  `.top-band` (outline buttons, `--muted-foreground` at 88%, the main action filled in the band's ink, D-FA13).
  Padding 16px 28px 18px.
- **Left**: the group's pages as one line of 24px semibold titles, 14px apart: the open page in full ink, the
  others at 72% of the ink, each a link. A group of one page (Panoramica) shows its title only. Under them, 13.5px
  at 88%, the page's fact (The Quiet-Header Rule: the date, the prices' time, the span).
- **Right**: the page's actions as today on desktop (words kept: «Nuova Spesa», «Aggiorna prezzi»), then the
  person (36px, outline in the band's ink) for the account menu (D-FD8). Not the phone's 44px squares
  (`[data-band-actions]` stays a phone rule).
- **Bottom**: the sheet's rounded 24px corners, as on the phone, flattening over the first 24px of scroll
  (`--band-progress`, `useTopBandProgress` reads `#page-main`).
- The `border-image` outset of the phone's band (iOS rubber-band) does not apply here: it would paint over the
  folder row.

### The page's tabs, U3 (`D-FD5`)

- `PageTabBar`'s desktop bar keeps its place (top of the page, under the band), its buttons, `layoutId` motion and
  ARIA; only its look changes at `desktop:`:
  - the row's bottom border becomes 2px `--top-band` (in place of `border-b border-border`);
  - the open tab: text `--foreground` semibold, under it a 5px bar in `--top-band` with 5px rounded top corners
    sitting on the rule (the moving underline that `PageTabBar` already animates);
  - closed tabs: `--muted-foreground`; 14px, icon 15px, height 40px; 22px below the row before the verdict.
- U3 changes the look only: order and names of each page's tabs are the riordino's (R5 puts Cashflow's as
  Tracciamento · Budget · Divisione · Centri di Costo · Dividendi).
- In Lime Frost light the lime rule on the green-white ground is a low-contrast line (decoration; the open tab is
  carried by the weight and by the bar's 5px): accepted by the owner on the sketch.

## Decisioni

| ID | Stato | Decisione | Alternative scartate | Motivo |
| --- | --- | --- | --- | --- |
| D-FD1 | Presa (owner, 2026-11-20) | **On desktop the sidebar becomes a row of folder tabs; the open one takes the band's colour and the band runs from it across the width** | Fable's desktop proposals (review UI desktop); the sidebar with a coloured header | the owner's idea: one identity with the phone, the place read from the colour |
| D-FD2 | Presa (owner, 2026-11-20, round 1) | **One tab per GROUP** of the riordino (Panoramica · Entrate e spese · Investimenti · Futuro · Storia) + Assistente at the right | A: one tab per page (10 + Assistente; at 1280 only with the icon on the open tab); C: six frequent pages + «Altro ▾» | the owner prefers the groups; A grows badly in width (a new page = a shorter name), C hides pages behind a menu |
| D-FD3 | Presa (owner, 2026-11-20) | **The band is full width and carries the title, the page's fact and the actions, as on the phone** | a band that stops under the title; a thin rule | the owner: «può prendere data e pulsanti come sul telefono» |
| D-FD4 | Presa (owner, 2026-11-20, variant B as sketched) | **The group's pages are the band's title line: the open one in full ink, the others attenuated, each a link** | a second row of tabs in the band; a dropdown on the folder | one line both names the page and moves inside the group |
| D-FD5 | Presa (owner, 2026-11-20, round 2: «mi piace u3») | **The page's tabs stay under the band (as T1), on a rule in the band's colour that the open tab thickens (U3)** | T1 as today (two tab styles stacked); T2 sheets on the band's edge (the same tab shape twice); T3 pill in the band (fights the main action); U1 a tab-shaped underline only; U2 a tinted tab on a coloured edge | the owner: neither two unrelated styles nor the same tab twice; the rule continues the folder's edge |
| D-FD6 | Presa (owner, 2026-11-20) | **The band never changes height while scrolling; only its 24px corners flatten** (as D-FA2). Header: ~137px (row 52 + band 85) against ~112 today with the tabs | a band that shrinks to one line after 24px of scroll | one rule with the phone, nothing moves under the reader's cursor; to revisit after the Mac look at 1280 × 800 |
| D-FD7 | Presa (owner, 2026-11-20) | **Every theme gets the folder row; only Lime Frost and Graphite colour it.** In the other twelve and with «Nessuna» `--top-band` is the ground (today's default): the open tab and the band are the ground, the closed tabs a neutral tint; the shape alone says where you are | the sidebar kept in the other themes (two shells to maintain and test) | one shell, one test matrix; the twelve upstream themes look like a plain tab bar |
| D-FD8 | Presa (owner, 2026-11-20) | **The person in the band opens the account menu that today closes the sidebar** (name, email, Impostazioni, ThemePicker, Esci with `LogoutDialog`), Impostazioni first. On the phone it stays a link to Impostazioni (D-FA3). This is how Impostazioni stays visible on desktop (riordino D-RU4 wants it at the foot of the Sidebar, which goes) | a gear plus a separate avatar; Impostazioni as a seventh folder | the sidebar's menu needs a home; one person, one menu |
| D-FD9 | Presa (owner, 2026-11-20: «no, anche tablet») | **The folder row lives at `desktop:` AND on the tablet in landscape (`tablet-landscape:`), where it replaces `TabletRail`**; the tablet in portrait keeps the phone's band and pill (D-FD13). On touch (the tablet) the folders are 44px high closed and 50px open, so every target is ≥ 44px | the folders at `desktop:` only, the rail kept on the tablet (Claude's proposal) | the owner wants the same navigation on the tablet; five folders + Assistente fit at 1024 (sketch at 1024 × 768 on the page) |
| D-FD10 | Presa (owner, 2026-11-20) | **Implement after RU0 and RU1 of the riordino, before RU2 (R3, Panoramica on two columns)**: the row reads `navGroups` (RU1) and R3's columns get measured once, without the sidebar | with wave 1 in one PR (one regression unreadable); after the whole wave (R3 measured twice) | R3's grid classes stay valid, but its render and budget entries were taken with the 256px sidebar |
| D-FD11 | Presa (owner, 2026-11-20) | **A folder opens on the page of the group the reader last opened in this tab session** (`sessionStorage`), the group's first page otherwise | always the first page | a folder remembers its sheet; Investimenti → Allocazione → Panoramica → Investimenti lands on Allocazione |
| D-FD12 | Presa (owner, 2026-11-20) | **Amend DESIGN.md**: The Top-Band Rule extends to `desktop:` (the band and the open folder), The Neutral-Frame Rule's sidebar clause becomes the folder row's | a new named rule | same exception, wider |
| D-FD13 | Presa (owner, 2026-11-20, decision card) | **The tablet in portrait (768 × 1024) keeps the phone's band and the bottom pill**: no folder row below `tablet-landscape:` | folders with icons only on the closed ones; folders with short names (Oggi, Spese…) | held like a big phone, the pill is under the thumb; at 768 five named folders and the Assistente do not fit (sketch on the page, § C) |

## Punti aperti

- **The view transitions**: `PageHeader` carries `viewTransitionName: 'page-header'` and the page scene morphs it
  (`lib/utils/viewTransition.ts`); the folder row is shell, outside the page: it must not take part in the scene.
- **Keyboard and ARIA**: the folder row is a `nav` («Navigazione principale») of links, not a tablist (each folder
  is a route); the open folder `aria-current="page"` when the open page is the group's first, else the band's
  title link carries it. The skip link («Vai al contenuto principale») stays the first stop.
- **The Assistente's tab** with its name (as the sketch of round 2) or icon only: to look at on the Mac at 1280.

## Impatto sul codice (per il thread impl)

- `app/dashboard/layout.tsx`: `AppSidebar` hidden at `desktop:`, `TabletRail` removed (its role goes to the row at `tablet-landscape:`), a new `components/layout/FolderNav.tsx` (the row)
  above `<main>`; `SidebarProvider` stays for the phone in landscape (Sheet).
- `components/layout/PageHeader.tsx`: the desktop row becomes the band (`.top-band` at `desktop:`, without the
  `border-image`), with the group's pages from `navGroups`; the person opens the account menu taken out of
  `Sidebar.tsx` (a shared `AccountMenu`).
- `components/layout/PageTabBar.tsx`: the desktop bar's classes (U3), the moving underline's height and radius.
- `app/globals.css`: the folder tokens (closed fill 20%, border 35%), the U3 rule; the `@media (width < 1440px)`
  overscroll rule follows RU0's `not (…)` form.
- `lib/constants/navigation.ts`: reads `navGroups` (RU1, the ONE source the Sidebar, the drawer and the rail read), plus a group's icon; Panoramica and the Assistente stay loose items, Impostazioni goes to the account menu.
- Riordino N4 (§ 5.10): at 1280 with a mouse the page becomes desktop, with the folder row instead of «sidebar piena» (1280 px of content instead of 1024).
- Tests: `e2e/motion.layout.spec.ts`, `e2e/freshness.spec.ts`, the auth setups that click the sidebar
  (`e2e/auth*.setup.ts`), `e2e/tabletLayout.ts`, `shell.boot*.spec.ts`; `perf:budget` (the shell's first paint);
  a Vitest on the folder's last page (`sessionStorage`) and on the group of a path.
- Mac (WORKFLOW § 3): `test:e2e` desktop and tablet, `perf:budget`, the look at 1280 × 800 and 1440 × 900 in the
  four fork themes.

## Criteri di accettazione

- At 1440 and (after RU0) 1280 with a mouse, on every dashboard page: no sidebar; five folders + Assistente in
  one row, the open one 42px high in `--top-band`, the others 36px; the band full width with the group's pages,
  the fact and the actions.
- The band's text and the attenuated titles ≥ 4.5:1 on every band option of the four fork blocks (extend
  `__tests__/topBandTheme.test.ts` to 72% of the ink).
- Pages with tabs (Cashflow, Allocazione, FIRE, Rendimenti, Impostazioni…): the 2px rule in `--top-band`, the
  open tab's 5px bar on it.
- On the phone and the tablet in portrait: `mobile:census` / `mobile:budget` unchanged. On the tablet in landscape the
  first screen changes (the rail goes, the row and the band come): new baselines in `perf/mobile-budget.json`,
  measured on the Mac in the implementation PR.
- On the tablet in landscape every folder ≥ 44 × 44 px (`e2e/tabletLayout.ts`).
- The twelve upstream themes: the row in neutral, no colour (D-FD7).
