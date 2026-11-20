# Il fascicolo (desktop) — dossier

Fork only. Thread «Progettare la fascia colorata su desktop», 2026-11-20 (spec, Opus). The owner's own idea: on
desktop the sidebar becomes a row of folder tabs, as in a personal file («fascicolo personale»); the open folder's
tab takes the band's colour, and a band in that colour runs from it across the whole width, carrying what the
phone's band carries (doc/fascia/README.md, PR #176/#177). None of the proposals of Fable's desktop review
(`review-ui-desktop.md` in the Library) is taken.

Sketch page on the real app (census data, 1440 × 900, CSS and HTML injected into the page, both rounds, four
themes): <https://claude.ai/artifact/HLaZTQQxj7nk8ukh3ZtbpS>. Files, the injection script (`inject.js`,
`window.__V = { count: 'B', inner: 'U3' }`) and the runner in the project's `fascia-desktop/`.

> **State**: round 1 implemented (PR #196, 2026-11-20). **Round 2 decided** (2026-11-20, Opus review of #196 on the owner's
> notes: D-FD14…D-FD19, § Seconda versione below): the folder row goes, the band starts at the top edge with the groups on
> its first floor and the group's pages as tabs cut into its bottom edge (C). Waiting for the owner's go before the code.
> Round 3 (same evening, D-FD20–D-FD22): the groups are plain centred names with a bar under the open one, and the
> three levels move (group, page, inner tab). Where round 2 and the sections above disagree, round 2 wins (D-FD1's row, D-FD2's shape, D-FD4, D-FD6's sticky part, D-FD9's heights).

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
| D-FD14 | Presa (owner, 2026-11-20, round 2 decision card: «C · Linguette sul bordo») | **The band starts at the top edge of the window and runs the full width. Its first floor holds the groups as pill buttons (the open one a pill in the page's ground colour), the Assistente and the person at the right; the group's pages are tabs cut into the band's bottom edge, the open one in the page's ground colour and joined to the sheet under it, the others pill buttons on the band. The page's fact sits beside the tabs, its actions at the right of the tab row.** Replaces the folder row of D-FD1, the folder shape of D-FD2 (the five groups stay) and D-FD4's attenuated titles | A two floors (groups as pills, pages as a segmented control; Claude's recommendation); B one group button opening a panel with every group and page, the page title with ⌄ | the owner: the fascicolo idea kept where it means something (the page is the sheet, its tab rises from the folder); every target has a button's shape (round-2 note «non sembrano cliccabili») |
| D-FD15 | Presa (owner, 2026-11-20, round 2, accepted with the card) | **The band belongs to the shell, not to the page**: rendered by the dashboard layout outside `<main>`, the page hands it its title, fact and actions; it never moves in the page scene and never vanishes while the next page loads; only its words cross-fade | the band inside the page's header (round 1: snapshotted and moved by the scene, gone while the page loads) | the owner's note on the transition («deve essere omogenea») |
| D-FD16 | Presa (owner, 2026-11-20, round 2) | **One band from 960 CSS px with a fine pointer, from 1000 on touch in landscape; same heights and the same fixed place at every width** (the band never scrolls away; on touch only the targets grow to 44px). Below 1000 the closed groups show their icon only; the wordmark shortens | the round-1 split (`desktop:` sticky with 36/42px folders, `tablet-landscape:` static with 44/50px; at 150% zoom the phone's hamburger) | the owner's note on zoom: on a 1440 screen 125% is 1152 CSS px and 150% is 960 |
| D-FD17 | Presa (owner, 2026-11-20, round 2) | **The page's composition is not touched by this work**: at 1000–1279 with a mouse (zoom 125%) the page keeps the tablet's stage and closed rows under the new band | the desktop composition down to 960 with a mouse | the note was about the bar; the composition is a step of its own if the owner asks |
| D-FD18 | Presa (owner, 2026-11-20, round 2) | **No scrollbar on the page's scroll box from the band's widths up, in every theme** (`scrollbar-width: none` on `#page-main`; wheel, trackpad and keys scroll as before) | the native bar beside the band | the owner: «non voglio la barra laterale che scorre» |
| D-FD19 | Presa (owner, 2026-11-20, round 2) | **«Analisi spese» everywhere**: the band reads every page's name from `navGroups`, and Analisi's page title becomes «Analisi spese» | the page's own title in the band | the owner: «deve chiamarsi sempre analisi spese» |
| D-FD20 | Presa (owner, 2026-11-20, round 3: «ok va bene con la prima consigliata») | **The groups are plain names (15px, no icon) centred in the band's first floor, the open one in full ink and semibold with a 3px ink bar under it; the wordmark at the left, the Assistente and the person at the right. The page tabs on the bottom edge and the page's own tabs (U3) stay left-aligned**, on the content's left edge | the pill of D-FD14 (round 2: «non mi piace il selettore a pillola»); dot, thin underline, separators, icon over name, glass capsule, title menu, the tab hanging from the top (round 2 sketches); page tabs centred, everything centred (round 3 sketches 2–3) | the centre reads as the app's menu; the open tab is the sheet's joint and the sheet reads from the left, so the eye runs one edge (page tab → inner tab → verdict); the bar is a border, so it survives forced colours (Chrome's modern-web guidance), a background pill does not |
| D-FD21 | Presa (owner, 2026-11-20: «implementa anche delle animazioni e delle transizioni … tra gruppi, tra schede e tra sottoschede») | **Motion at the three levels, the band never moving**: (1) group → the 3px bar slides to the new name (spring 400/35, the `PageTabBar` one) at the click, the new group's page tabs slide in from the side of travel (12px, 220 ms, ease-out-quart) while the old ones fade; (2) page → the open tab (the sheet's joint) slides to the clicked tab with the same spring, labels cross-fade their weight; (3) inner tab → the U3 bar's slide and the panel's 200 ms fade that exist (AN1). The page under the band leaves in 140 ms and arrives in 320 ms (the soft scene); the fact and the actions fade in with the page. Reduced motion: no slide, no fade | a View Transition morph of the band (round 1: the snapshot moved and vanished) | the owner's note; the band is live DOM (D-FD15), so its indicators can move at the click instead of after the route lands |
| D-FD22 | Proposta (Claude, follows D-FD15/D-FD21; to confirm on the PR) | **From the band's widths up a navigation is the soft scene, not a View Transition**: the browser's snapshot freezes the band until the next page lands, and its old and new roots stacked washed it out (diagnosis 4); below the band's widths nothing changes (the phone already uses the soft scene where the pill shows; a phone in landscape keeps the View Transition) | keep the View Transition and hide the root's old snapshot | a frozen band cannot slide its bar at the click |

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

## Come è stato realizzato (impl, 2026-11-20)

- `components/layout/{FolderNav,AccountMenu}.tsx`, `lib/utils/folderNav.ts` (+ `__tests__/folderNav.test.ts`), the band in `PageHeader`
  (`BandTitles`, `BandAccount`), U3 in `PageTabBar`, `--folder-*` and `.folder-tab-open`/`.top-band-wide` in `app/globals.css`.
  `AppSidebar` is only the phone-landscape Sheet now; `TabletRail` is deleted.
- **Deviations from the text above, to confirm**: (1) the attenuated titles (72%) are held at the **3:1 of large text**, not 4.5:1: white at
  72% on Graphite's blue and on the Verde and Ghiaccio options measures 3.7–4.1; 4.5 would take 85% and blur the open title (the closed
  folders' words clear 4.5:1). (2) The band is **static on a tablet in landscape**, sticky at `desktop:` and on the phone: the landscape stage
  measures its fold from the page's top (`stageCustomProperties`) and its sticky column sits at 16px, under a sticky band it would hide. (3) The
  account menu shows name and email at its top (`identity`), because no footer carries them any more; specs read them through `e2e/account.ts`.
  (4) The wordmark «Portfolio Tracker» sits at the left of the row as a link to Panoramica.
- Seen in the cloud (Chromium, census seed): 1440 light and dark, 1280, 1024 × 768 with touch, scroll with the band stuck.
  Not seen: the twelve neutral themes (the tokens default to ground and ink), the Mac round (`test:e2e`, `perf:budget`, 1280 × 800).

## Seconda versione (round 2, 2026-11-20)

Opus review of #196 on the owner's notes (thread «Ripensare il fascicolo su desktop»). Sketch page on the real app, with
today beside each proposal in the four fork themes, 1280 and 1440, zoom 80% and 125%, and the transition recorded:
<https://claude.ai/artifact/TYYZw98avn3FGHNLNwAMtZ>; the injection script (`alt.js`, `window.__ALT = 'C'`) and the
runner in the project's `fascia-desktop/r2/`.

### Diagnosi (round 1, measured on the census fixture, production build)

1. **«Analisi spese» → «Analisi Cashflow»**: `BandTitles` printed the open page's own `title`
   (`components/cashflow/AnalisiTab.tsx`, «Analisi Cashflow») and `navGroups`' names for the others. The only mismatch.
2. **Zoom**: the shell is picked by the CSS width. On a 1440 × 900 screen: 80–110% `desktop:`; 125% (1152 px)
   `tablet-landscape:` — band static, folders 44/50px, the stage composition, «Nuova Spesa» out of the band; 150% (960 px)
   the phone in landscape, hamburger bar and phone band.
3. **The scrollbar**: `#page-main` scrolls, the band is sticky inside it, so the bar runs beside the band.
4. **The transition**: the band was the page's `page-header`, a named region of the scene: the browser snapshots it and
   moves the snapshot; the folder row (in `root`, whose old and new snapshots are stacked with `animation: none`) washes
   out; while the next page is still loading there is no header at all, so the band disappears and comes back.
5. **Not clickable**: the other pages were 24px titles at 72% of the ink, read as a subtitle.

### Regole (C)

- **First floor** (inside the band, 60px; D-FD20 replaces the pills of D-FD14): the wordmark at the left (a link to
  Panoramica), the five groups of `navGroups` as plain names centred in the band (15px, 60px high targets, 14px
  side padding), the Assistente as a name at the right, then the person (account menu, D-FD8). A closed group: ink at
  78%, full ink on hover. The open group: full ink, semibold, a 3px ink bar with rounded ends under the name, 9px
  above the floor's bottom. A group opens on its last-read page (D-FD11 stays). Below 1000 px the names stay (they fit
  at 960); the wordmark shortens.
- **Tab row** (the band's bottom edge, 50px): the group's pages, every group including the one-page ones (Panoramica
  shows one tab). The open page: 48px high, radius 14px on top, the page's ground and ink, 18px semibold, joined to
  the sheet by two 14px inverted corners; it is the page's `h1` (or carries it). The others: 42px pills on the band,
  16px, ink at 82%, 6px above the edge, hover tint. Right of the tabs the page's fact (13.5px, 88%, one line,
  ellipsis); at the right end of the row the page's actions, then nothing else (the gear and «Nuova Spesa» as today).
- **The sheet**: the band has no rounded ears at its bottom in C (the open tab is the joint); the page's tabs
  (`PageTabBar`, U3, D-FD5) stay under the band in the sheet.
- **One place, one height** (D-FD15, D-FD16): the band is a shell element above `<main>`, never scrolls, never
  changes height; the scene names only its words (title, fact) for the cross-fade, never its box.
- **Neutral themes** (D-FD7 stays): with «Nessuna» and in the twelve upstream themes the band is the ground; the
  open group and the open tab take a 6% ink tint so the shape still says where you are.
- **Keyboard/ARIA**: the first floor is `nav` «Navigazione principale», the tab row `nav` «Pagine del gruppo», both
  links (each a route), `aria-current="page"` on the open tab, `aria-current="true"` on the open group.

### Impatto sul codice (round 2)

- `components/layout/FolderNav.tsx` → the band's first floor (rename to `ShellBand`/`BandNav`), mounted in
  `app/dashboard/layout.tsx` above `<main>`; the band's page part (title, fact, actions) reaches it through a context
  or a portal from `PageHeader` (`PageHeaderSkeleton` keeps the band's silhouette while the page waits).
- `components/layout/PageHeader.tsx`: `BandTitles` → the tab row reading names from `navGroups` (D-FD19); `AnalisiTab`
  title «Analisi spese».
- `app/globals.css`: the band's variants move from `desktop:`/`tablet-landscape:` to one query for the band
  (`(width >= 960px) and (pointer: fine)` or landscape `(width >= 1000px)`), the scene stops naming the band's box,
  the root snapshots stop stacking (`::view-transition-old(root)` hidden), `#page-main` without scrollbar (D-FD18).
- Tests: `__tests__/folderNav.test.ts` (names from `navGroups`, a group's tabs), e2e that read the folders
  (`e2e/tabletLayout.ts`, `e2e/account.ts`, the auth setups, `motion.layout`, `freshness`); a probe of the transition
  (the band's box does not move across a navigation); the zoom widths 960, 1152, 1440 in a spec.
- Mac (rounds 1 and 2 together): `test:e2e` desktop and tablet, `perf:budget`, `mobile:budget` new tablet baselines,
  the look at 1280 × 800 and 1440 × 900 and at zoom 125%.
