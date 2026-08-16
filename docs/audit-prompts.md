# Impeccable Audit Prompts

Prompt ottimizzati per `/impeccable audit` — compliance check mirato dopo l'implementazione
dei P0/P1 emersi da una critique, o come verifica standalone su assi specifici.

**Quando usarli:**
- Dopo aver implementato un redesign (craft + polish già fatti nello stesso passaggio) →
  gate di compliance: verifica che i cambiamenti non abbiano introdotto regressioni
- Come check standalone periodico su un asse specifico (es. token compliance dopo
  aver aggiunto un nuovo componente)

**Differenza da critique:**
Audit = compliance pass/fail su assi precisi. Critique = valutazione olistica con score.
Audit è più veloce, non produce score, non sostituisce la critique di verifica finale —
che usa la chiusura convergente (score + finding P0/P1/P2) e può terminare il ciclo
dichiarando la pagina "a regime" (score ≥ 36/40 e zero P0/P1).

**Assi di compliance per questo progetto** (fonte canonica: `DESIGN.md` — leggila sempre):
- **Form Follows Function** — ogni proprietà visiva (size, weight, color, radius, motion) deriva
  da una funzione; niente decorazione, niente false depth/material (onestà), chrome che deferisce al dato
- **Token / Zero-Chroma** — nessun `bg-gray-*`, `text-gray-*`, `dark:bg-*`, hex hardcoded; usa CSS vars
  (OKLCH-native); chrome achromatica, il colore lo possiede il dato (Data Owns Color)
- **Chart colors** — tutte le serie Recharts via `useChartColors()`; tooltip via CSS vars
  (`var(--card)` bg, `var(--card-foreground)` label); nessun hex o `fill="currentColor"` diretto
- **Gerarchia Trade Republic** — hero block con la scala corretta: page hero
  `text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em]`, section hero `text-[36px]`,
  sub-hero `text-[22px]` (**mai** `text-4xl`/`text-2xl` per un hero); un numero dominante per sezione,
  `divide-y` flat rows, nessun card-in-card, nessun side-stripe border
- **Mono Mandate** — ogni numero (€, %, ratio, data strutturata) in Geist Mono con `tabular-nums`
- **Breakpoint** — `md:` → `desktop:` (≥ 1440px); `sm:` solo dove corretto;
  `max-desktop:portrait:pb-20` su pagine con bottom nav; `landscape:` per casi specifici
- **Motion** — `useReducedMotion()` o `MotionConfig reducedMotion="user"` attivo;
  spring configs consistenti (`stiffness: 400, damping: 35`); `layoutId` unici per pagina
- **ARIA** — `role="tablist/tab"` su pill selectors, `role="progressbar"` su barre,
  `aria-label` su bottoni icon-only, `aria-expanded` su collapsible
- **Skeleton** — ogni sezione async ha uno skeleton strutturalmente isomorfo al layout reale

**Prima di dichiarare un finding un falso positivo:** verifica che non sia il design system a non
dichiarare un valore reale — la fonte dei font-size è il frontmatter di `DESIGN.md`
(`typography` + `typography.scale`), non il sidecar `.impeccable/design.json`. Sopprimere con un
`ignoreValues` in `.impeccable/config.json` è l'ultima risorsa, non la prima, e ogni voce lì porta
una `reason` scritta per chi la rileggerà tra sei mesi.

**Sequenze corrette (vedi `docs/critique-prompts.md` per le due modalità di critique):**
```
Verifica (default):     critique → fix dei soli finding → audit (gate compliance) →
                        critique di verifica → stop a score ≥ 36/40 e zero P0/P1 ("a regime")
Ripensamento (opt-in):  critique → shape combinato (blocco A + blocco B) → implementa tutto
                        (craft + polish) → audit (gate compliance) → critique di verifica
                        (chiusura di verifica, NON un altro ripensamento)
```

---

## App Shell e Navigazione

### Dashboard Layout + Shell

```
/impeccable audit lo shell della dashboard

File: app/dashboard/layout.tsx,
      app/dashboard/template.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: `<main>` usa `bg-background` e `desktop:p-6` — verifica che non siano
  scivolati `bg-gray-*` hardcoded o breakpoint `md:` invece di `desktop:`
- Demo banner: token compliance (`--warning-*` vars), nessun colore hardcoded
- Landscape mobile header (SidebarTrigger bar): altezza, padding, token
- `PageContainer`: tutte le pagine lo usano come wrapper — max-w-[1600px], mx-auto,
  `space-y-4 desktop:space-y-6`, `max-desktop:portrait:pb-20` presente
- `PageHeader`: mobile sticky bar (h-14, backdrop-blur-sm, bg-background/95) non
  sovrappone il contenuto; desktop full header con border-b corretto
- Page transitions in template.tsx: `useReducedMotion()` rispettato, nessun layout thrash
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Sidebar Desktop

```
/impeccable audit la sidebar desktop

File: components/layout/Sidebar.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded — usa `--sidebar-*` CSS vars su tutti e 6 i temi
- Voce attiva: colore e contrasto corretto su tutti i temi (inclusi cyberpunk, retro-arcade)
- Gerarchia visiva: sezioni, separatori, icone — font weight e size coerenti con il resto
- Breakpoint: visibile solo su `desktop:` (≥ 1440px), nascosta correttamente su portrait
- ARIA: `SidebarContent` con `role="navigation"` + `aria-label`, voce attiva con
  `aria-current="page"` su `<Link>` dentro `SidebarMenuButton`
- Modalità collassata (`collapsible="icon"`): toggle visibile solo su desktop
  (`hidden desktop:flex`); logo+nome nascosti (`group-data-[state=collapsed]:hidden`);
  `AssistenteBanner` sostituito dall'icona Bot viola (`group-data-[state=collapsed]:flex`);
  `SidebarMenuButton size="lg"` nel footer collassa automaticamente a sola avatar
- Switcher account condiviso (`useActiveAccount`): l'account attivo deve essere leggibile a
  colpo d'occhio quando è diverso dal viewer (label via `getAccountLabel`) — un utente non
  deve poter modificare i dati di un altro credendo di essere sul proprio; verifica che il
  controllo resti utilizzabile anche in modalità collassata
- Voce "Previdenza" presente nel gruppo Pianificazione (`planningNav`)
- Dark mode: contrasto voce attiva e hover su sfondo `--sidebar-background`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Bottom Navigation Mobile

```
/impeccable audit la bottom navigation mobile

File: components/layout/BottomNavigation.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: usa `--sidebar-*` CSS vars per il theme sync — verifica su tutti e 6 i temi
  (default, solar-dusk, elegant-luxury, midnight-bloom, cyberpunk, retro-arcade)
- Voce attiva: colore/icona leggibile su tutti i temi in dark e light mode
- Safe area: `bottom: calc(env(safe-area-inset-bottom, 0px) + 12px)` corretto
- Touch targets: ogni voce ≥ 44×44px
- Visibilità: container esterno `max-desktop:portrait:flex` — nascosta in landscape e desktop
- ARIA: `motion.nav` con `aria-label="Navigazione principale"`, `aria-current="page"`
  sulle voci attive (sia Link primari che button "Altro"), `aria-haspopup="dialog"` e
  `aria-expanded` sul button "Altro"
- Motion: `useReducedMotion()` applicato — `pillTransition` è `{ duration: 0 }` se
  ridotta, spring 400/35 altrimenti; verifica che si applichi a `motion.nav layout`
  e agli `motion.div layoutId="bottom-nav-active-pill"`
- FAB cashflow: pulsante `+` appare/scompare solo su rotta `/dashboard/cashflow` via
  `AnimatePresence mode="popLayout"`; sposta la pill via `motion.nav layout`; invia
  `cashflow:add-expense` custom event (non naviga); animazione scale 0.6→1 spring 400/28
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Secondary Menu Drawer

```
/impeccable audit il secondary menu drawer

File: components/layout/SecondaryMenuDrawer.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded nel drawer e nell'overlay
- Gerarchia: voci coerenti con sidebar desktop (stesso font size, weight, icone)
- Motion: open/close animation rispetta `useReducedMotion()`; spring config (400/35)
- ARIA: `role="dialog"`, `aria-modal="true"`, focus trap, close on Escape
- Touch targets: ogni voce ≥ 44px height
- Breakpoint: visibile solo dove previsto (portrait mobile/tablet)
- Switcher account condiviso: in portrait la Sidebar è irraggiungibile, quindi QUESTO è
  l'unico switcher esistente sul telefono — verifica che sia presente, raggiungibile senza
  scroll infinito e che dichiari l'account attivo, non solo la lista di quelli disponibili
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Pagine Auth e Landing

### Landing Page

```
/impeccable audit la landing page

File: app/page.tsx
Componenti: components/dashboard/NetWorthSparkline.tsx,
            components/dashboard/SavingsRingChart.tsx,
            components/layout/ThemePicker.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded su hero preview, proof strip, CTA — CSS vars ovunque
- Zero-Chroma sulla pagina pubblica: headline e icone feature NON accentate con
  `text-primary`/`bg-primary/10` (in tema default `--primary ≈ --foreground`, quindi
  l'accento è invisibile lì e colora solo sui 5 temi personalità). Icone feature
  `text-muted-foreground`; l'unico colore in pagina è il dato (sparkline + chip positiva)
- Onestà: le preview Panoramica/Cashflow restano etichettate "Dati dimostrativi"
- Mono Mandate: i numeri delle preview in Geist Mono + tabular-nums, come nell'app vera
- Chart colors: `NetWorthSparkline` e `SavingsRingChart` via CSS vars, non hex
- ThemePicker: è lo stesso componente di login/register e la scelta persiste al login
- Breakpoint: layout responsive da 375px a desktop (≥ 1440px)
- CTA "Prova la Demo": visibile solo se `NEXT_PUBLIC_DEMO_EMAIL` è definito
- Motion: entry animations rispettano `useReducedMotion()`
- ARIA: heading hierarchy (h1 → h2 → h3), bottoni con label descrittivi
- Dark mode: contrasto su tutti gli elementi del hero e della proof strip
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Login + Register

```
/impeccable audit le pagine Login e Register

File: app/login/page.tsx,
      app/register/page.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded nei form, nei field focus ring, nei bottoni
- ARIA: `<label>` associati agli input via `htmlFor`, error messages con `aria-describedby`,
  bottone submit con feedback inline (Loader2 animate-spin durante pending)
- Password toggle: keyboard-reachable (focusabile, `aria-label` "Mostra/Nascondi password")
- Motion: entry animations rispettano `useReducedMotion()`
- Responsive: layout corretto da 375px; input non escono dal viewport su mobile
- Dark mode: contrasto field border e placeholder su sfondo card
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Panoramica

```
/impeccable audit la pagina Panoramica

File: app/dashboard/page.tsx
Componenti: components/dashboard/* (incl. PeriodSelector, SavingsRingChart),
            components/ui/composition-list.tsx, components/ui/composition-bar.tsx
Pure layer: lib/utils/dashboardOverviewUtils.ts, lib/utils/sparklinePeriod.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun `bg-gray-*`/`dark:bg-*`/hex hardcoded in hero card, Sintesi Patrimoniale,
  KPI chip grid (`bg-muted/40`), category bars, TER/Costo cards (mobile), charts section
- Colori segno: chip di variazione via `signChipClass` e testo via `signTextClass`
  (`lib/utils/metricColors.ts`) — mai `text-green-*`/`text-red-*` inline, che divergono da
  `--destructive` sui temi non default
- TER / Costo Annuale / Tasse Stimate usano `text-warning-foreground`, non amber raw
  (questa scelta SUPERA la vecchia guida `--chart-3` per questa pagina)
- Chip di variazione (mensile/YTD/ATH): contenitore `grid grid-cols-1 tablet:grid-cols-2`,
  NON `flex flex-wrap` — le colonne devono avere larghezza uguale; icone `aria-hidden`.
  Lo stesso blocco esiste su Patrimonio: se diverge, è una regressione
- Chart colors: `NetWorthSparkline` usa `color="var(--chart-1)"` (non hex); tutti i
  chart di composizione via `useChartColors()`; category bar colors da `chartColors[0/1]`
- Nessun pie/donut residuo: la composizione usa `CompositionList`/`CompositionBar`
- Gerarchia: hero `text-[44px] desktop:text-[54px] font-bold font-mono` con step-down a
  `text-[32px] desktop:text-[40px]` oltre i 13 caratteri; card companion `text-[36px]`;
  KPI chip `text-[22px]`; delta annotation `text-[12px] font-mono`
- Muted sub-tile: KPI chips usano `bg-muted/40` (no border) — non `bg-muted border-border`
  (quello è per parameter tiles nei collapsible)
- PeriodSelector sparkline: `role="tablist"` con roving tabindex; periodi 3M/6M/YTD/1A/3A/All
  (nessun 1M). Nota: ogni periodo termina sul valore LIVE, quindi "6M" rende N+1 punti —
  è il comportamento atteso, non un off-by-one da segnalare
- Breakpoint: `md:` → `desktop:`; TER/Costo responsive duplication (`desktop:hidden` su
  mobile row, `hidden desktop:grid` nel hero footer)
- Skeleton: `OverviewAnimatedCurrency` isolato in leaf, `OverviewChartsSection` memoized;
  skeleton inline strutturalmente isomorfo al layout reale (hero 2fr+1fr)
- Motion: `requestIdleCallback` per chart mount; `useCountUp` `once: true`; `heroSettled`
  → `chartRenderReady` handoff; card-tab `layoutId="chart-tab"` unico nella pagina
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Patrimonio

```
/impeccable audit la pagina Patrimonio

File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetManagementTab.tsx,
            components/assets/AssetCard.tsx,
            components/assets/AssetSparkline.tsx,
            components/assets/AssetDialog.tsx,
            components/assets/TransactionDialog.tsx,
            components/assets/AssetMovementsDialog.tsx,
            components/assets/TaxCalculatorModal.tsx,
            components/dashboard/OverviewAnimatedCurrency.tsx,
            components/dashboard/NetWorthSparkline.tsx

La pagina è una singola scroll — nessun tab. Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero card e card companion (condivise con Panoramica) — nessun hardcoded;
  CashAccountsSection card grid — nessun `bg-gray-*`; badge classe asset,
  valori G/P (`color-mix()` non `text-emerald-*`) — nessun hardcoded
- Chip di variazione: identiche a Panoramica — contenitore `grid grid-cols-1
  tablet:grid-cols-2` (non `flex-wrap`), chip ATH presente, classi di segno da
  `signChipClass` (`lib/utils/metricColors.ts`), mai ternari inline. Le due hero leggono lo
  stesso payload `useDashboardOverview`: ogni divergenza è una regressione
- Gerarchia: hero `text-[44px]/[54px]`; card companion `text-[36px]`; flat 3-row
  breakdown con `w-[42px] text-right` per i %; G/P non realizzato come riga border-t
- Chart colors: `NetWorthSparkline` usa `var(--chart-1)`; `AssetSparkline` via
  `useChartColors()`
- CashAccountsSection: `bg-muted/40` (KPI chip variant, no border) — nessun `bg-card`
  (sarebbe card-in-card); grid `grid-cols-2 desktop:grid-cols-4`
- AssetManagementTab: tabella ordinabile solo `desktop:`; sotto `desktop:` niente tabella —
  grid di `AssetCard` raggruppate per classe (stesso componente della card mobile, reso
  inline in AssetManagementTab, non un componente `AssetMobileSummary` separato); delete
  2-click con `aria-label` e disarmo visibile; skeleton isomorfo
- Tint riga/card a prezzo manuale: unica regola condivisa `requiresManualPricing`
  (`lib/utils/assetPricing.ts`) usata sia dalla `TableRow` sia dalla `AssetCard` — nessuna
  copia locale della lista dei tipi; `color-mix(in oklch, var(--chart-3) 6%, transparent)`,
  mai amber-50/amber-950 hardcoded
- Label strumento: sempre via `getAssetDisplayTicker` — mai `displayTicker ?? ticker` inline;
  i `pensionFund` non mostrano mai un ticker
- Registro operazioni: azioni di riga gated su `useAssetLedgerMeta` (mai bottoni inerti);
  TransactionDialog con `DialogDescription` e segmented Compra/Vendi/Rettifica in
  `role="tablist"`; AssetMovementsDialog è una superficie di lettura e non deve imitare un form
- ARIA: AssetDialog con `DialogDescription`; type picker Step 1 con `role="radio"`
- Breakpoint: `md:` → `desktop:`; `max-desktop:portrait:pb-20`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Previdenza

```
/impeccable audit la pagina Previdenza

File: app/dashboard/pension/page.tsx
Componenti: components/pension/PensionOverview.tsx,
            components/pension/PensionHeaderAction.tsx,
            components/pension/PensionContributionDialog.tsx
Pure layer: lib/utils/pensionDeduction.ts, lib/utils/pensionContributions.ts,
            lib/utils/pensionFamilyMembers.ts, lib/utils/pensionReturn.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun hardcoded su hero, card di rendimento, card di recap fiscale, blocco plafond;
  il segno di TWR / guadagno di mercato / ritorno personale via `getMetricValueColor` e
  `signTextClass`, mai `text-green-*`/`text-red-*` raw
- Gerarchia: valore totale del fondo come page hero `text-[44px] desktop:text-[54px]`;
  TWR, versato dell'anno e risparmio IRPEF come section hero `text-[36px]` (nessun gradino
  fuori scala tipo 28px); righe flat `divide-y`, nessuna card-in-card (le card per membro
  famiglia sono pari-livello nella griglia, non annidate nel blocco fiscale)
- Un numero dominante per card: il RISPARMIO IRPEF deve dominare la sua card — se torna a essere
  una riga come le altre, la pagina ha perso la sua risposta
- Layout desktop: riga hero `desktop:grid-cols-[2fr_1fr]`, capitolo fiscale `desktop:grid-cols-2`,
  separatori di capitolo `border-t border-border/40 pt-4`. Una pagina a colonna singola a 1440px
  è una regressione, non una scelta
- Mono Mandate: importi, RAL, percentuali IRPEF e plafond **e le date** (storico versamenti,
  finestra del rendimento) in Geist Mono + tabular-nums
- Onestà: un fondo senza membro famiglia collegato mostra un prompt, MAI un numero — verifica che
  il prompt sia visivamente un'azione, non un errore. Idem per i due stati in cui il rendimento
  sostituisce la percentuale con una spiegazione (`isCoverageSuspicious`, `hasNoMovement`): in
  quei casi il blocco di scomposizione va OMESSO, non riempito di zeri. **Il predicato è UNO**:
  `isPensionReturnMeasurable` (`lib/utils/pensionReturn.ts`), consumato sia dalla card di riepilogo
  sia dalla guardia del collapsible. Finché erano due espressioni separate sono divergite, e la
  scomposizione stampava «Guadagno di mercato» in grassetto sotto l'avviso che diceva che quella
  differenza NON è guadagno di mercato — un numero e la sua smentita a quaranta pixel di distanza.
  Verifica il predicato, non ri-derivarlo
- Errori: le quattro query defaultano tutte a `[]`, quindi un fetch fallito è indistinguibile da un
  insieme vuoto. Ogni blocco che dipende da una query in errore va SOSTITUITO da `PensionErrorNotice`
  (`role="alert"`), mai renderizzato a zero: asset/settings sono bloccanti, versamenti e snapshot
  degradano per capitolo
- Riga hero mai monca: la griglia `[2fr_1fr]` ha SEMPRE due occupanti — il rendimento, l'errore che
  lo ha impedito, oppure `PensionReturnPendingCard` che spiega perché non è ancora calcolabile. Con
  un solo figlio a 1440px resta un terzo di riga bianco senza che niente spieghi il vuoto: è lo
  stato di ogni fondo appena creato, finché il cron serale non scrive la prima fotografia
- Copy al plurale: con più di un asset `pensionFund` le frasi che hanno il fondo come SOGGETTO si
  accordano (`fundNoun`) — capitolo, titolo della card di rendimento, spiegazioni. «Valore attuale»
  e «Versato totale» restano invariati: sono grandezze aggregate, non il fondo
- Asse anno: `SegmentedPill` con `role="tablist"` + `aria-label`, reso solo con più di un anno
  disponibile; governa versato per natura, recap fiscale e storico — mai il valore del fondo né
  il rendimento (non sono grandezze annuali)
- Storico versamenti: delete 2-click con disarmo automatico a 3s, `aria-label` che nomina natura
  e data, stato armato annunciato via `aria-live`. NIENTE `title` sul bottone armato: l'attributo
  viene aggiunto mentre il puntatore è già fermo sull'elemento, quindi il tooltip non compare mai
- Heading: un solo `h1` (dal `PageHeader`), `h2` per i capitoli, `h3` per i titoli di card —
  non `<p>` con la classe eyebrow. **E i due livelli devono distinguersi anche visivamente**:
  capitolo al livello Title (`CHAPTER_TITLE_CLASS`, 15px/600 foreground), card all'eyebrow da 10px.
  Con la stessa classe su entrambi la struttura esiste solo nell'albero dei heading — semantica
  corretta e gerarchia assente, che è la forma più difficile da vedere di questo difetto
- Azione primaria: nello slot `actions` di `PageHeader`, non in una riga propria sopra l'hero
- Collapsible: Radix `Collapsible` + Framer Motion height con `useReducedMotion`, chiuso di default
- ARIA: PensionContributionDialog con `DialogDescription`; messaggi di validazione in italiano
  anche sul TYPE CHECK dei campi numerici (un campo vuoto con `valueAsNumber` produce `NaN`, e
  senza messaggio esplicito zod emette il suo default inglese)
- Skeleton: la vista è async e lo skeleton deve aspettare TUTTE E QUATTRO le query
  (assets + settings + contributions + snapshots), non solo le due che decidono l'empty state.
  L'invariante non è «niente empty state» ma **«nessuno zero che non è stato letto»**: ognuna
  defaulta a `[]`, e senza i suoi dati «Versato totale», «Versato nel {Y}» e il risparmio IRPEF
  valgono 0,00 € — cioè l'unica risposta che la pagina produce, affermata prima di averla letta.
  Skeleton isomorfo al layout, titoli di capitolo inclusi. Usa `isLoading` e non `isPending`: su
  una query disabilitata `isPending` resta true e lo skeleton non cederebbe mai
- Fuso orario: i default del dialog (data odierna, anno fiscale) passano da `getItalyDateIso` /
  `getItalyYear`, non da `toISOString()` né da `getFullYear()` del browser — dalle 22:00 italiane
  l'UTC è già il giorno dopo e il form proporrebbe ieri
- Breakpoint: `md:` → `desktop:`; `max-desktop:portrait:pb-20`
- Demo mode: ogni mutazione gated su `useDemoMode()` (`disabled={isDemo}`)
- Altro: pattern anomali o violazioni non elencate sopra

Nota: la suite Playwright copre già meccanicamente parte di questi assi — `npm run test:e2e`
(emulatori attivi) prima di aprire un finding lì. TRE spec, non due:
- `e2e/pension.spec.ts` — layout 2:1 a 1440px, scala 54/36px, asse anno, collapsible, azione nel
  PageHeader, e la guardia sul caricamento (empty state, «Versato totale» a zero, colonna del
  rendimento vuota).
- `e2e/pension.mobile.spec.ts` — stack a 390px, scala 44px, nessuno scroll orizzontale.
- `e2e/pension.degraded.spec.ts` — i tre stati in cui il rendimento NON è una misura
  (`suspicious` / `idle` / `fresh`), su un account isolato con scenari riseminabili a mano:
  `npm run e2e:seed -- suspicious|idle|fresh`.

Due limiti dichiarati, per non fidarsi più di quanto la suite meriti:
- la CORSA fra le quattro query non è riproducibile in locale (Firestore multiplexa tutti i target
  su un solo webchannel, quindi atterrano nello stesso batch di React): quell'invariante è garantita
  dal gate nel codice, non dai test;
- lo stato d'ERRORE non è automatizzabile (il Web SDK tratta la rete assente come offline e ritenta
  invece di rifiutare, quindi la query resta in loading): va verificato a mano.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Cashflow

### Tab "Dividendi"

```
/impeccable audit il tab "Dividendi" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/dividends/DividendTrackingTab.tsx,
            components/dividends/DividendStats.tsx,
            components/dividends/DividendCalendar.tsx,
            components/dividends/DividendTable.tsx,
            components/dividends/DividendRecordDetailsDialog.tsx,
            components/dividends/DividendDialog.tsx,
            components/dividends/InflationRateDialog.tsx,
            components/dividends/ProvisionalCouponBanner.tsx
Pure layer (logica, non visivo): lib/utils/dividendAnalytics.ts, lib/utils/couponUtils.ts,
            lib/constants/dividendTypes.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero net-income, KPI chip grid (`bg-muted/40`), strip income-reliability, leaderboard
  payer divide-y + share-bar, calendario (day active/hover, today highlight) — nessun hardcoded;
  colori segno via `getMetricValueColor` (token, non emerald/red); badge tipo dividendo via CSS var
- Chart colors: sparkline trailing-12m dell'hero + grafici nel Collapsible (e DividendStats) via
  `useChartColors()`; tooltip via CSS vars — nessun hex diretto
- Gerarchia: hero net-income con scala corretta (`text-[44px] desktop:text-[54px] font-bold font-mono`)
  + chip di variazione; leaderboard payer flat divide-y (no card-in-card); Mono Mandate su tutti i valori
- Periodo: asse `DividendPeriod` (Mese/Anno/12 mesi/Storico) derivato in-memory — verifica che lo
  switch NON rifaccia il fetch; `DividendStats` ricevono i bound di data del periodo selezionato
- Progressive disclosure: Table/Calendario via `SegmentedControl`; filtri asset/tipo + day-focus sotto
  "Filtra"; grafici e analisi avanzata dietro `Collapsible` — stati di default coerenti
- Onestà sui dati provvisori: `ProvisionalCouponBanner` deve rendere evidente che la cedola
  indicizzata all'inflazione è STIMATA finché il tasso FOI non è annunciato — non deve
  presentarsi come un importo certo; l'InflationRateDialog è l'azione che risolve lo stato
- Total Return per Asset (DividendStats): le posizioni chiuse hanno il badge "Chiusa" e gli
  asset senza ledger ricadono sul confronto prezzo-vs-PMC — verifica che le due provenienze
  non siano rese come se avessero la stessa precisione
- Breakpoint: calendario non overflow su 375px; DividendTable scroll orizzontale su mobile;
  leaderboard e strip reliability non debordano
- ARIA: SegmentedControl + asse periodo `role="tablist"`/`role="tab"`; calendario con `aria-label`
  sui giorni e `aria-selected` sul giorno attivo; Collapsible con `aria-expanded`;
  DividendRecordDetailsDialog con `role="dialog"`, `aria-modal`, focus trap
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Tab "Tracciamento"

```
/impeccable audit il tab "Tracciamento" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/ExpenseTrackingTab.tsx,
            components/cashflow/CashflowTrackingMobile.tsx,
            components/cashflow/TransactionFeed.tsx,
            components/cashflow/cashflow-kpi/CashflowHero.tsx,
            components/cashflow/CategoryBreakdownList.tsx,
            components/cashflow/MobileFiltersDrawer.tsx,
            components/expenses/ExpenseDialog.tsx
Pure layer: lib/utils/trackingSummary.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: CashflowHero, badge tipo spesa (Variabile/Fissa/Debito/Entrata/Trasferimento),
  importi negativi — via `text-destructive`/`signTextClass` non hardcoded
- Gerarchia: UN solo numero dominante nel tab — il Risparmio Netto dell'hero
  (`text-[44px] desktop:text-[54px]`); il resto scende di scala. La lista top-5 spese e il
  TransactionFeed sono righe flat `divide-y`, mai card annidate
- Onestà: i `transfer` non devono comparire come entrata o spesa in nessun totale dell'hero
- TransactionFeed: il toggle Feed/Tabella è un `SegmentedPill` (`role="tablist"` con roving
  tabindex), non un pill hand-rolled; day-grouping con header sticky coerente
- Delete 2-click con 3s auto-disarm — stato "Conferma?" visivamente distinto ma via token,
  non via `bg-red-*` hardcoded
- ExpenseDialog: singolo step + Collapsible "Impostazioni avanzate" (`aria-expanded`),
  reso in `ResponsiveModal` (Drawer ≤768px / Dialog sopra); focus ring via CSS var
- Portrait: CashflowTrackingMobile e il layout desktop devono restare la stessa IA con resa
  diversa — segnala ogni informazione presente solo su uno dei due
- Breakpoint: load-more non overflow, filtri pill su 375px non wrappano oltre 2 righe;
  `max-desktop:portrait:pb-20`
- ARIA: ExpenseDialog `DialogDescription` presente; MobileFiltersDrawer focus-trap corretto
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Tab "Budget"

```
/impeccable audit il tab "Budget" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx,
            components/cashflow/budget/BudgetList.tsx,
            components/cashflow/budget/BudgetItemDialog.tsx,
            components/cashflow/budget/BudgetSettingsCard.tsx,
            components/cashflow/budget/BudgetForecastCard.tsx,
            components/cashflow/budget/BudgetInsightsCard.tsx,
            components/cashflow/budget/BudgetAlertsBanner.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: progress bars (BudgetList) — nessun `bg-blue-*` hardcoded; over-budget →
  `bg-destructive` o `color-mix()` non hex; under-budget → colore da token;
  BudgetAlertsBanner alert soglie (50/75/90/100%) — colori via token non hardcoded;
  BudgetForecastCard e BudgetInsightsCard — nessun `bg-gray-*`
- Gerarchia: importi in `font-mono tabular-nums`; label categoria plain; nessun card-in-card;
  BudgetSettingsCard overall ceiling + status indicator auto-save via token
- ResponsiveModal: BudgetItemDialog usa `ResponsiveModal` (Dialog desktop ↔ Drawer mobile ≤768px)
- ARIA: progress bar con `role="progressbar"`, `aria-valuenow`, `aria-valuemin/max`;
  BudgetAlertsBanner ha `aria-live` per aggiornamenti soglia
- Breakpoint: lista Mensili/Annuali non overflow su 375px; BudgetForecastCard chart
  altezza corretta su mobile
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Tab "Centri di Costo"

```
/impeccable audit il tab "Centri di Costo" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/CostCentersTab.tsx,
            components/cashflow/CostCenterDetail.tsx,
            components/cashflow/CostCenterDialog.tsx,
            components/cashflow/CostCenterErrorNotice.tsx,
            components/cashflow/costCenterStyles.ts
Pure layer: lib/utils/costCenterUtils.ts, lib/utils/costCenterColors.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token e colore d'identità: NESSUN hex, nemmeno nella palette del picker. Il colore di un
  centro è uno slot (`COST_CENTER_COLOR_KEYS`) risolto a runtime da `resolveCostCenterColor()`
  su `useChartColors()`, così eredita i sei temi E la guardia di luminanza dell'hook; gli hex
  legacy sono mappati sullo slot di pari posizione senza backfill. Verifica che rail di riga,
  share-bar, pallino del Detail, stroke del confronto e swatch del dialog passino TUTTI da lì,
  e che nessun percorso reintroduca un `?? '#hex'` o un fallback dipendente dal rank
- Chart colors: grafico mensile stacked-by-categoria + overlay confronto cross-centro via
  `useChartColors()`; tooltip via CSS vars; `<Legend>` con `color: var(--muted-foreground)`;
  il grafico impilato colora per CATEGORIA sempre — non deve tornare a cambiare sorgente
  colore quando il periodo contiene una sola categoria
- Mono Mandate esteso agli assi: tutti e quattro gli assi Recharts passano `CHART_TICK_STYLE`
  (`fontFamily: var(--font-geist-mono)`) — le tick label sono numeri e DESIGN.md le nomina
  esplicitamente. Verifica anche che non resti nessun `tabular-nums` senza `font-mono`
  (la trappola era una `%` in sans nella stessa riga flex di un euro in mono)
- Gerarchia: hero Panoramica `text-[44px] desktop:text-[54px]`, hero Detail `text-[36px]`
  (è un section hero: nomina un centro dentro un tab, sotto un PageHeader che dice già
  "Cashflow"); nessun valore fuori ramp — 40px e 32px sono guardie di overflow, 48px non
  esiste. Titoli di capitolo via `CHAPTER_TITLE_CLASS`, eyebrow via `EYEBROW_CLASS` (con
  `font-semibold`), entrambi da `costCenterStyles.ts` e non ridefiniti inline.
  Nessun ritorno al vecchio box-grid 2×4 di KPI, e nessun ritorno a `<Card>` per tetto e
  proiezione: su questa superficie i contenitori sono piatti e `rounded-2xl`
- Periodo: asse `CostCenterPeriod` (Mese / Anno / 12 mesi / Sempre) derivato in-memory —
  verifica che lo switch non rifaccia il fetch, e che l'asse sia RENDERIZZATO IN ENTRAMBE le
  viste con lo stato posseduto dalla Panoramica (un Detail che riceve il periodo come sola
  prop è la regressione da cui si è partiti)
- Finestre dichiarate: tetto, proiezione e grafico NON seguono l'asse e ognuno deve nominare
  la propria finestra nell'eyebrow; tetto e proiezione stanno dietro il separatore di capitolo
- Lifecycle: deve derivare da `resolveLastActivityDate()` sulle spese NON filtrate. Se torna a
  leggere `computeCenterStats().lastActivityDate`, ogni centro senza spesa nel periodo si
  ridichiara "inattivo" e contraddice il conteggio nell'hero
- Stati: `isError` letto in entrambe le query e instradato a `CostCenterErrorNotice` PRIMA del
  controllo empty-state; skeleton con `aria-busy` (non `aria-hidden`) e `motion-reduce:animate-none`
- Breakdown per sotto-categoria (`buildSubCategoryComposition`): i toggle di esclusione sono
  di sola sessione e il "Totale al netto" è dichiaratamente una lente di analisi — verifica
  che non sia reso con lo stesso peso del totale reale, che non alteri hero/budget/grafico, e
  che l'hint che lo spiega non venga sostituito dal risultato del proprio primo uso
- Lista: la barra codifica il rango e la `%` in sub-line la quota — se la `%` sparisce, la
  prima riga sempre piena si rilegge come se fosse il totale dell'hero. Gli archiviati usano
  un `maxSpend` proprio, non quello degli attivi
- ARIA: l'asse periodo è `SegmentedPill` (roving tabindex, Arrow/Home/End) e NON
  `SegmentedControl` — tornare indietro perde le frecce in silenzio pur restando
  `role="tablist"`/`role="tab"`. Il budget meter vuole `role="progressbar"` + `aria-valuenow`
  **+ `aria-label` + `aria-valuetext`**, con `aria-valuenow` **clampato a `aria-valuemax`**
  (oltre il tetto il rapporto grezzo supera 100 e la posizione annunciata diventa priva di
  senso; la cifra vera la porta `aria-valuetext`). Il check "progressbar con aria-valuenow" è
  già stato superato una volta da un meter che annunciava «78, progress bar», un numero senza
  soggetto: è il promemoria che un asse soddisfatto non è un difetto assente.
  Delete/rename con `aria-label` che nomina la conseguenza (quante spese si scollegano) e live
  region `sr-only` per armamento E disarmo — svuotare la region non annuncia nulla.
  **Nessun `aria-label` su una riga che espone numeri**: sostituisce l'intero contenuto
  accessibile, e i numeri sono la ragione per cui la riga esiste (vale per le righe della lista
  e per i toggle sottocategoria, dove per giunta annunciava l'azione OPPOSTA ad `aria-pressed`).
  `<dl>` con veri `<dt>/<dd>`; focus-visible su ogni `<button>` nudo (righe sottocategoria e
  swatch colore); `CostCenterDialog` con `DialogDescription`
- Conferma a 2 click: **nessun timer** (un limite di tempo più corto del proprio annuncio viola
  WCAG 2.2.1), e il rilascio non deve dipendere dal focus — Safari non dà focus a un `<button>`
  al tap, quindi un `onBlur` da solo lascia l'armamento caldo a tempo indeterminato. Servono
  `pointerdown` fuori + Escape + blur insieme, e il disarmo **prima** di delegare la mutazione:
  su fallimento il componente resta montato e il click successivo eliminerebbe senza conferma
- Grafici: il ruolo va **sul chart, non su un wrapper**. Recharts 3.x ha `accessibilityLayer`
  a `true` di default e mette `tabIndex=0` + `role="application"` sul proprio `<svg>`, quindi un
  `role="img"` su un div esterno lascia un nodo tabbabile dentro un sottoalbero appena
  dichiarato presentazionale. Se si sceglie `role="img"`, l'`aria-label` deve nominare ciò che
  la `<Legend>` nascosta mappava (i nomi dei centri), e `accessibilityLayer={false}` toglie il
  nodo focusabile
- Dati e cache: `initialData` su una query **azzera il fetch** con lo `staleTime` globale di 5
  minuti di questo progetto (semina la cache marcandola appena scaricata, e con
  `refetchOnWindowFocus: false` non si aggiorna mai né raggiunge il proprio ramo d'errore). Per
  seminare una vista dai dati che il padre ha già si usa `placeholderData`. Verifica anche che
  ogni query legga con `ownerId` e non con `user.uid`: la chiave e le mutazioni usano l'owner,
  e su account condiviso i due differiscono
- Motion: la stagger d'ingresso delle righe è guardata da `useReducedMotion()`
- Breakpoint (base 390px): il nome del centro va a capo invece di essere schiacciato dai badge;
  la riga azioni del Detail ha `flex-wrap`; composizione categoria, tabella transazioni e
  overlay confronto non vanno in overflow. Target 44px: gli swatch colore sono un'area 44×44
  attorno a un pallino da 32, il trigger degli archiviati usa `py-3` (con `py-2.5` misura 40)
- Content model: dentro un `<button>` sta solo phrasing content — niente `<div>`, `<p>` o il
  `Badge` condiviso, che rende un `<div>`. La lista ha `role="list"` + `role="listitem"`, e un
  `role="list"` senza figli `listitem` è peggio di nessuna semantica
- Fusi orari nei test: le fixture di questo progetto stanno a mezzogiorno con offset esplicito,
  dodici ore lontane dal bordo DST, quindi **non possono** far emergere un off-by-one di
  `dayOfYear` (che va calcolato in UTC, non per differenza di millisecondi fra date costruite
  nel frame locale). Le date vere arrivano da `<input type="date">` a mezzanotte LOCALE: una
  fixture così deve esistere. Esegui la suite anche con `TZ=Europe/Rome`, non solo di default
- Altro: pattern anomali o violazioni non elencate sopra

Nota: audit 2026-08-13 = 11/20 (A11y 2 · Perf 2 · Theming 3 · Responsive 2 · Integrity 2), su una
critique che aveva chiuso a 20/40 il giorno prima. I due punteggi non sono confrontabili: la
critique guarda gerarchia e onestà, l'audit contrasto, target, token e correttezza — assi che su
questa superficie non erano mai stati misurati. Chiusi nello stesso giorno tutti i P1 locali; NON
ri-aprirli come nuovi. Restano deliberatamente aperti, e non vanno segnalati come scoperte:
- **I token di contrasto sono stati CHIUSI** il 2026-08-13 in un branch dedicato: `--positive`
  chiaro portato a `oklch(0.482 …)`, sette valori di `--destructive` corretti tema per tema (il
  default era già conforme), `--chart-3`-come-testo sostituito da `--warning-foreground`. Il testo
  semplice passa ora 4,5:1 in tutte e 24 le combinazioni. **Resta sotto solo il pattern chip**
  (`bg-positive/10 text-positive`, 3,34–4,40:1 in 15 casi su 24): è strutturale — una tinta della
  stessa tinta del testo abbassa il contrasto per costruzione — e non va segnalato come scoperta.
- **Gli slot colore 6-8** non theme-aware (`useChartColors` risolve dal tema solo `--chart-1..5`).
- **Target da 32px** di `SegmentedPill` e dei Button shadcn: primitive condivise, passata a sé.
- **Il chip Δ sparisce** quando il predecessore troncato è a zero, e il 28 febbraio confronta un
  mese completo con un gennaio troncato al 28. Sono decisioni di prodotto, non bug.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Analisi

```
/impeccable audit la pagina Analisi

File: app/dashboard/analisi/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/EntityDossier.tsx,
            components/cashflow/EntitySearch.tsx,
            components/cashflow/CashflowSankeyChart.tsx,
            components/cashflow/AnomalieBlock.tsx,
            components/cashflow/ConfrontoAnnualeSection.tsx,
            components/cashflow/SavingsRateTrendSection.tsx,
            components/cashflow/AndamentoStoricoSection.tsx
Pure layer (logica, non visivo): lib/utils/{cashflowTimeSeries,comparisonDeltas,
            expenseEntityStats,entitySearch}.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun hardcoded nel Sankey (nodi, link, tooltip — le palette hex del MODULO
  cashflowSankey sono sanzionate: mai useChartColors dentro Nivo), nei KPI hero blocks,
  nel TopExpensesBlock e nell'EntityDossier (importi/delta — sign token
  `text-positive`/`text-destructive` con positiveGood invertito per le spese?)
- Chart colors: trend charts (AndamentoStoricoSection, EntityDossier ComposedChart,
  ConfrontoAnnuale MensileBarChart) via `useChartColors()`; tooltip con TUTTI e tre gli
  style props (contentStyle/labelStyle/itemStyle) via CSS vars — nessun hex diretto;
  tick assi con font mono (CHART_TICK_STYLE via prop `tick`)
- EntityDossier: i blocchi pluriennali (tabella Per anno, media 12m, trend 24m) IGNORANO
  l'asse periodo per design e ogni blocco dichiara il proprio orizzonte in caption
  (observedMonths quando <12, YTD "stessi mesi", "storico dal {floor}") — un blocco senza
  caption di finestra è un finding; il dossier non deve mai apparire vuoto
- URL focus: `?focusType&focusCat&focusSub` additivi al contratto periodo
  (`?period&year&month` INVARIATO); parse con degrade (mai crash su valori malformati);
  il focus sopravvive al cambio periodo (design, non bug)
- ConfrontoAnnuale: pacing KPI e sottotitolo dallo STESSO modulo (comparisonDeltas,
  baselineLabel mai ricostruito in UI); delta ranking con badge Nuova/Cessata sull'unione
  A∪B; caption di onestà quando comparisonYear === historyStartYear
- AndamentoStoricoSection (solo `periodMode === 'history'`): YAxis del ComposedChart usa
  `domain={[(min)=>Math.min(0,min),'auto']}` (la linea Risparmio negativo non viene tagliata);
  asse temporale parte da `cashflowHistoryStartYear` (floor) e non degenera a 1 bucket
- LineChart per categoria: mostra SOLO le prime 6 categorie per totale — le restanti sono
  scartate di proposito (niente serie "Altro" residua, che sommando molte categorie sovrastava
  ogni singola linea). NON re-introdurre un raggruppamento "Altro": è una scelta deliberata, non
  un dato mancante. Tooltip righe ordinate per valore decrescente (`itemSorter`) per rispecchiare
  l'impilamento verticale delle linee
- Sankey: troncamento mobile DICHIARATO in caption (mai silenzioso); click su nodi
  categoria/sottocategoria → onEntityClick (nessun drill interno di categoria, nessuna
  lista transazioni nel componente); l'unico drill interno è quello di tipo
- Breakpoint: pill 3-state (Anno Corrente/Anno/Storico) centrata su mobile/tablet, riga su
  `desktop:`; EntitySearch full-width su mobile; selettore non overflow su 375px;
  tabella Per anno e delta ranking come flat list leggibili a 390px
- Motion: `key={periodLabel}` su TopExpensesBlock per reset `showAll`; pill animation (400/35);
  layoutId unici per pagina (`analisi-period-pill`, `andamento-granularity-pill`,
  `andamento-category-pill`, `confronto-view-pill`) — nessuna collisione
- ARIA: pill selector `role="tablist"`, breadcrumb accessibile; righe delta e righe
  entità cliccabili con aria-label parlante; Select "vs" con aria-label
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Allocazione

```
/impeccable audit la pagina Allocazione

File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*
Pure layer: lib/utils/allocationUtils.ts, lib/utils/leverageAwareAllocationUtils.ts,
            lib/utils/assetExposureUtils.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: `ActionChip` (COMPRA/VENDI/OK) e `TargetTick` — colori azione via `useActionColors`
  (legge `--chart-*` con clamp lightness oklch), non hardcoded; `AllocationHero` verdetto,
  `RebalancePanel`/`ContributionPanel`/`WithdrawalPanel` (righe via `PlanRow` condiviso) —
  nessun `bg-gray-*`/hex su badge e righe; `RebalanceBandControl` segmented (±2/±5/5·25/custom) — token
- `ActionPlanner`: segmented a 3 stati Ribilancia/Versa/Preleva — verifica che il terzo stato
  (Preleva → `WithdrawalPanel`) sia raggiungibile e stilisticamente coerente con gli altri due;
  `ActionPlanner` possiede la Card, i pannelli sono bodyless (nessun `Card`/`Collapsible` proprio)
- Ruoli di allocazione: `AssetDialog` espone il 3-way select `AllocationRole` (tradable/frozen/
  excluded) — verifica select coerente con gli altri form field; `AllocationHero`/
  `AllocationCompositionBar` mostrano caption cliccabili separate per la quota "frozen"
  (dentro il totale) e la quota "esclusa" (fuori dal totale) — non un'unica cifra
  "non ribilanciabili"; nota sotto il target editor in Impostazioni sui ruoli
- Chart colors: eventuali grafici in ExposureSection via `useChartColors()`; i colori azione
  passano da `useActionColors` (ACTION_CHART_NUMBER COMPRA 3 / VENDI 5 / OK 2)
- Leva: `AllocationCompositionBar` usa `displayPct` (non la percentuale nozionale grezza), così
  la barra non mente quando la somma delle esposizioni supera il 100%; `InstrumentTradeList`
  rende le mosse a livello di strumento con la stessa vocabulary di `PlanRow`, non una tabella
  a sé; il campo `leverageRatio` in AssetDialog è visibile solo per gli ETF
- `BalanceScoreGauge`: il punteggio è band-INDIPENDENTE (distanza assoluta dal target) mentre
  i chip COMPRA/VENDI/OK dipendono dalla banda — verifica che la UI non suggerisca il contrario
- `PensionAllocationCards`: il fondo pensione resta `frozen` e non deve mai comparire come
  mossa in un piano, pur restando nelle percentuali
- ARIA: `AllocationBreakdown` accordion con `aria-expanded` + contenuto `inert` da chiuso
  (incl. il gruppo "Esclusi dall'allocazione"); `RebalanceBandControl` `role="radiogroup"`/
  segmented; `ActionChip` con `aria-label` descrittivo; segmented Ribilancia/Versa/Preleva
  con `role="tablist"`/`role="tab"`
- Breakpoint: AllocationBreakdown accordion (grid-template-rows) e ExposureSection drill-down
  (azienda/settore/ETF) non overflow su mobile; l'albero class → sub-categoria → strumento
  di `PlanRow` (Versa/Preleva) non degrada su mobile
- Skeleton: `AllocationPageSkeleton` isomorfo al layout reale (hero → plan → breakdown → exposure)
- Altro: pattern anomali o violazioni non elencate sopra — incl. eventuali target orfani non
  catturati da `findOrphanedTargets`/`stripOrphanedSubTargets`

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha — vedi "Allocation: AllocationRole" + "Allocation: the two action plans")
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Rendimenti

```
/impeccable audit la pagina Rendimenti

File: app/dashboard/performance/page.tsx
Componenti: components/performance/* (PerformanceHero, HeroMetricBlock, MetricSection,
            MetricCard, PerformanceTooltip, RealizedGainsSection, UnderwaterDrawdownChart,
            MonthlyReturnsHeatmap, BenchmarkComparisonSection/Chart)
Pure layer: lib/utils/performanceSummary.ts, lib/utils/benchmarkPeriodReturn.ts,
            lib/utils/performanceBase.ts, lib/utils/drawdownSeries.ts,
            lib/utils/cashFlowMap.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: `PerformanceHero`, `HeroMetricBlock` wrapper, `MetricCard` divider — nessun
  hardcoded; `UnderwaterDrawdownChart` usa `--destructive` CSS var (non `#ef4444`)
- Gerarchia: UN solo numero dominante (il TWR dell'hero, `text-[44px] desktop:text-[54px]`);
  i vital signs e la strip di return-consistency scendono di scala; i MetricSection sono righe
  `divide-y`, mai card-in-card
- Amber Watch: `PerformanceHero` (tono "fragile") e l'avviso "N asset esclusi dal totale" di
  `RealizedGainsSection` tengono di proposito l'amber raw (`text-amber-600 dark:text-amber-400`)
  — NON segnalarli come violazione né convertirli a `text-warning-foreground`, che è pensato
  per stare su un fill `bg-warning` e non su sfondo card (Panoramica e Rendimenti divergono
  consapevolmente, vedi AGENTS.md)
- Collapsible "Mostra tutte le metriche": `aria-expanded` presente, contenuto non
  focusabile da chiuso; è il pattern `data-[state=open]:animate-in`, non la variante Framer
- `RealizedGainsSection` e la riga "Capitale investito": entrambe gated su
  `useAssetLedgerMeta` — verifica che senza ledger non restino sezioni vuote o zeri finti.
  ATTENZIONE ai due omonimi: la CARD "Capitale investito" viene dal registro operazioni
  (acquisti − vendite), mentre l'area del grafico Evoluzione si chiama "Capitale immesso"
  (patrimonio iniziale + versamenti da Cashflow) — sono grandezze diverse e i nomi NON vanno
  uniformati
- `PerformanceTooltip` (grafico Evoluzione): le righe di scomposizione sotto il separatore
  usano i token di segno (`text-positive`/`text-destructive`), non colori raw
- Numeri assenti: con periodi troppo corti volatilità/Sharpe valgono `null` e la strip di
  consistenza non riporta la percentuale — verifica che rendano "—" o omettano il dato, mai
  uno zero o un "100%" finti
- Chart colors: rolling charts, growth-of-100 benchmark chart, drawdown chart, heatmap
  tutti via `useChartColors()`; tooltip via CSS vars
- ARIA: `?` button in MetricCard con `aria-label`; period selector `role="tablist"`;
  CUSTOM period chip con `aria-pressed`
- Breakpoint: tabella benchmark — scroll orizzontale corretto su mobile;
  period selector non overflow su 375px
- Motion: `layoutId="performance-mobile-tab"` unico sulla pagina; spring (400/35)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Storico

```
/impeccable audit la pagina Storico

File: app/dashboard/history/page.tsx
Componenti: components/history/*,
            components/dashboard/LaborMetricsChart.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: sezione Lavoro & Investimenti flat rows — nessun hardcoded;
  sezione Driver (3 card: Savings vs Investment, Lavoro & Investimenti, YoY) — nessun `bg-gray-*`
- Chart colors: tutti i chart (Evoluzione, Composizione, Raddoppi, Labor, YoY bar) via
  `useChartColors()`; tooltip via CSS vars; mobile inline legend usa stessi colori.
  La Composizione per tipo include una banda "Previdenza" — verifica che abbia un colore
  della scala `--chart-*` come le altre e non un valore fuori palette
- Valore per Strumento (`MonthlyAssetBreakdownSection`, sotto `components/history/*`): tabella
  per-strumento del mese + sum del sottoinsieme selezionato + trend cross-mese; il `TrendTooltip`
  custom (effetto prezzo vs quantità) usa CSS vars per bg/label e `useChartColors()` per la serie —
  nessun hex; Mono Mandate sui valori; checkbox subset senza overflow a 375px
- ARIA: segmented pill `role="tablist"` su view toggles (Evoluzione, Composizione, Raddoppi)
- Breakpoint: mobile inline legend non overflow; chart height adattivo
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Hall of Fame

```
/impeccable audit la pagina Hall of Fame

File: app/dashboard/hall-of-fame/page.tsx
Componenti: components/hall-of-fame/*,
            lib/constants/hallOfFame.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero block, SpotlightCard divide-y rows, period/category pill — nessun hardcoded
- Gerarchia: hero valore con la scala corretta (`text-[44px] desktop:text-[54px] font-bold font-mono`) presente
- ARIA: mobile three-section nav pill `role="tablist"`; collapsible "Vedi tutti"
  `aria-expanded`; tabelle con `<th scope="col">`
- Breakpoint: tabelle full-height desktop (nessun `max-h` con doppio scroll);
  top-5 + collapsible mobile corretto su 375px
- Motion: `layoutId="hof-mobile-nav"` unico; spring (400/35)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## FIRE e Simulazioni

### Tab "FIRE Calculator"

```
/impeccable audit il tab "FIRE Calculator" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/FireCalculatorTab.tsx,
            components/fire-simulations/FIREProjectionSection.tsx,
            components/fire-simulations/FIREProjectionChart.tsx,
            components/fire-simulations/FireCalculatorSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: sensitivity matrix — `color-mix()` non hex; flat metric rows — nessun hardcoded;
  "di cui illiquidi" in amber → `color-mix(in oklch, var(--warning) ...)` non `text-amber-*`
- Chart colors: `FIREProjectionChart` e scenario chart via `useChartColors()[4,0,1]`;
  tooltip via CSS vars
- ARIA: Settings `<Collapsible>` con `aria-expanded`; "Annulla" button con `aria-label`;
  il toggle del capitale bloccato nel fondo pensione (`respectPensionLockInFire`) è uno
  `Switch` con label esplicita — l'effetto sul FIRE Number deve essere visibile, non silente
- Motion: collapsible auto-open su `hasUnsavedChanges` via `useEffect` — non su ogni render
- Skeleton: `FireCalculatorSkeleton` isomorfo (hero → Settings → rows → projection)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Tab "Coast FIRE"

```
/impeccable audit il tab "Coast FIRE" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/CoastFireTab.tsx,
            components/fire-simulations/CoastFireProjectionChart.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: scenari Bear/Base/Bull — `color-mix()` non `emerald/sky/amber` hardcoded;
  progress bar animata — fill via CSS var; pension state colors — `color-mix()` corretto
- Chart colors: `CoastFireProjectionChart` via `useChartColors()[4,0,1,2]`;
  target line `isAnimationActive={false}`; CartesianGrid via token
- ARIA: progress bar con `role="progressbar"`, `aria-valuenow/min/max`
- Breakpoint: pension UI 2-col su mobile (`grid-cols-2 items-start`); breakdown table
  non overflow; touch target trash icon ≥ 44px
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Tab "What If"

```
/impeccable audit il tab "What If" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/WhatIfAnalysisTab.tsx,
            components/fire-simulations/WhatIfSensitivitySection.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero before→after custom block — colori "meno anni = meglio" via token,
  non sign-based hardcoded; sensitivity matrix — `color-mix()` non hex; event selector
  + scenario input cards — nessun `bg-gray-*`; empty-state Coast (manca `userAge`) via token
- Chart colors: eventuali chart before/after e celle sensitivity matrix via
  `useChartColors()` / `color-mix()` — nessun hex diretto
- Gerarchia: hero usa il blocco before→after custom (NON `HeroMetricBlock` — il suo
  coloring sign-based confligge con "meno anni = meglio"); impatto su FIRE e Coast in
  flat divide-y rows, nessun card-in-card
- Form-follows-function: ogni elemento dell'output (colore, freccia, delta) deve mappare
  una funzione — "meno anni al FIRE = meglio"; nessuna decorazione sign-based ereditata
- Motion: re-run baseline vs adjusted — nessuna animazione che riparte a ogni keystroke
  degli input scenario (ephemeral state); `layoutId` unico se presente una pill
- ARIA: event type selector con role appropriato; sensitivity matrix con `scope` su
  header/righe; empty-state Coast con messaggio descrittivo quando manca `userAge`
- Breakpoint: scenario inputs + sensitivity matrix non overflow su 375px;
  `max-desktop:portrait:pb-20`
- Selettore voci di entrata (evento "perdita di lavoro", `IncomeSourceSelector` inline in
  WhatIfAnalysisTab): albero categoria→sottocategoria con checkbox tri-state — ARIA `aria-checked`
  che riflette lo stato `indeterminate` sulla riga categoria; ogni riga-label tappabile con touch
  target ≥ 44px; "Tutte/Nessuna" raggiungibili da tastiera; nessun overflow a 375px
- Box esplicativo della scomposizione (dati usati + formule `min/max` → mancati risparmi vs spese
  dal portafoglio): Mono Mandate sui valori e sulle formule (`font-mono tabular-nums`); layout 2
  colonne da `desktop:` (1440px) con divisore 1px, colonna singola sotto; le formule non debordano
  a 320–375px; sub-tile `bg-muted/30` (no card-in-card)
- Skeleton: `WhatIfAnalysisSkeleton` isomorfo al layout reale
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

### Tab "Monte Carlo"

```
/impeccable audit il tab "Monte Carlo" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/MonteCarloTab.tsx,
            components/monte-carlo/*,
            components/fire-simulations/MonteCarloSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: scenario card borders/bg via `color-mix()` — nessun hex; appendice collapsible
  wrapper — nessun `bg-gray-*`
- Chart colors: `SimulationChart` percentile lines via `useChartColors()` iniettati
  via Recharts `cloneElement`; tooltip via CSS vars
- ARIA: mode toggle `role="tablist"`; appendice `aria-expanded`; hero "--" pre-run
  ha `aria-label` che descrive lo stato "non ancora calcolato"
- Motion: `layoutId="montecarlo-mode-pill"` unico; spring (400/35)
- Skeleton: `MonteCarloSkeleton` isomorfo (hero → params compact → no 2-col grid)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

### Tab "Obiettivi"

```
/impeccable audit il tab "Obiettivi" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/GoalBasedInvestingTab.tsx,
            components/goals/*,
            components/fire-simulations/GoalsSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: chip verdetto (In linea/In ritardo/Raggiunto) e priorità via `goalVerdictMeta`
  (`text-positive`/`text-destructive`/`--chart-3`), NON raw `text-red-600`/`bg-amber-50`;
  colore identità del goal (color picker) resta grezzo SOLO su pallino/barra/linea proiezione
  (scelta utente legittima); `AllocationComparisonBar` via `useChartColors()` per le 6 classi
- Chart colors: `GoalProjectionChart` (glide-path) usa il colore identità del goal per area/linea,
  `var(--border)`/`var(--muted-foreground)` per griglia/reference, tooltip via CSS vars — nessun hex
- Gerarchia: hero `GoalsHero` con verdetto (no vanity metric "Progresso Medio"); lista ordinata
  per urgenza; asset assegnati flat divide-y (NON la vecchia tabella annidata); Mono Mandate sui valori
- KPI responsive: lista flat divide-y sotto desktop / chip grid al desktop (responsive duplication) —
  valore allineato a destra senza wrap su 375px; "Non assegnato" espandibile sugli asset liberi
- ARIA: barra avanzamento `role="progressbar"`, `aria-expanded` su expand row e su "Non assegnato",
  delete 2-click `aria-label` con stato "Conferma eliminazione"
- `AssetAssignmentDialog`: `trueAvail` (no `excludeGoalId`) per "Nessuna quota libera" — lo 0% mostra
  il messaggio corretto
- Pure layer: la matematica di traiettoria sta in `lib/utils/goalTrajectory.ts` (testata), NON inline
  nei componenti; i componenti solo fetch/memo/render
- Breakpoint: hero + lista + planner + timeline non overflow su 375px; GoalFormDialog color picker
  touch-friendly (≥ 32px per swatch); campo `monthlyContribution` presente nel form
- Skeleton: `GoalsSkeleton` isomorfo al layout (hero verdetto → KPI → lista)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Assistente AI

```
/impeccable audit la pagina Assistente AI

File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: scheda period-reactive (`renderPeriodScheda` / `AssistantPatrimonioTodayCard`) — card
  primarie `rounded-2xl bg-card`, valore dominante 36px del ramp, nessun hardcoded; valori Δ →
  `text-positive`/`text-destructive` (token, non emerald/red); user bubble `bg-muted/40`
  (token ✓); `AssistantMemorySummaryCard` "Raggiunto" → `text-positive`; suggestion card
  (`AssistantSuggestionsBanner`) border/bg via `chartColors[0]` + `color-mix()` (non hardcoded)
- Chart colors: non applicabile (no Recharts in questa pagina)
- ARIA: `AssistantPeriodSelector` su `SegmentedPill` (tablist + roving tabindex + frecce;
  `disabled` → `aria-disabled`, non `disabled` nativo); sheet Conversazioni/Memoria
  (`AssistantSheets`) `role="dialog"`/`aria-modal` + `SheetDescription` sr-only; header icone
  (`AssistantHeader`) con `aria-label` che include il conteggio; guida `aria-expanded`;
  delete 2-click 3s auto-disarm con `aria-label`; SSE `status:'searching'` badge con `aria-live`
- Breakpoint: hero `grid gap-4 desktop:grid-cols-[2fr_1fr]` con `min-w-0` sulla left column;
  companion `desktop:self-start desktop:sticky desktop:top-6` (solo desktop), mobile scheda
  nell'empty-state + `AssistantContextPill` nell'header conversazione; azione primaria icon-only
  sotto 1440px con `aria-label`
- Motion: `layoutId="assistant-period-pill"` unico nella pagina; crossfade della domanda/label
  periodo + sheet open/close + `AnimatePresence` rispettano `useReducedMotion()`; spring (400/35)
- Skeleton: `AssistantPageSkeleton` isomorfo al layout reale (header + azioni → pill →
  hero card → composer → companion: scheda + memoria)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Impostazioni

```
/impeccable audit la pagina Impostazioni

File: app/dashboard/settings/page.tsx
Componenti: components/settings/AccountSharingSection.tsx,
            components/settings/ExpenseImportSection.tsx,
            components/expenses/CategoryManagementDialog.tsx,
            components/layout/ThemePicker.tsx
Pure layer: lib/utils/expenseImport.ts

La pagina ha 6 tab (SETTINGS_TABS): Allocazione, Preferenze, Spese, Dividendi,
Condivisione, Aspetto. Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: tutti i form elements (Switch, Select, Input, Slider) — focus ring via CSS var,
  nessun `ring-blue-*`; sezione "Aspetto" theme selector grid — border active via token
- ARIA: Switch con `role="switch"`, `aria-checked`; Select con `aria-label`;
  Input con `<label>` associato; sezioni con heading hierarchy corretta (h2 → h3)
- Tab "Spese" / `ExpenseImportSection`: l'anteprima è OBBLIGATORIA prima di qualsiasi
  scrittura — verifica che il bottone di commit sia disabilitato finché non esiste un piano;
  righe scartate mostrate col motivo (non un conteggio muto); Mono Mandate sui totali e sul
  range date; l'undo per batch è raggiungibile e ha un `aria-label` esplicito;
  l'input file ha una label associata e uno stato di errore leggibile; demo-gated
- Tab "Condivisione" / `AccountSharingSection`: gli stati (invito, membro attivo, rimozione)
  usano token semantici; la rimozione è distruttiva → conferma esplicita, non 1 click
- Card "Famiglia" (tab Preferenze): righe membro flat `divide-y`, RAL in Geist Mono +
  tabular-nums, nessuna card-in-card
- Tab "Allocazione": la validazione "somma ≥100 con leva" comunica il perché, non solo
  un errore rosso
- Breakpoint: Tab → Radix Select su mobile (`desktop:hidden`/`hidden desktop:grid`);
  sub-category card headers `flex-col gap-2 desktop:flex-row` (titolo lungo + controlli);
  `max-desktop:portrait:pb-20` per bottom nav clearance
- Token selector (Aspetto): theme grid `grid-cols-2 sm:grid-cols-3 desktop:grid-cols-6` —
  swatches touch-friendly (≥ 44px); active theme border via token non hardcoded
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Cross-cutting: Sistema di Shell e Layout Condivisi

```
/impeccable audit il sistema di shell e layout condivisi dell'app

Componenti: components/layout/PageContainer.tsx,
            components/layout/PageHeader.tsx,
            components/layout/PageTabBar.tsx,
            components/layout/PageTabs.tsx,
            components/layout/ThemePicker.tsx,
            lib/constants/navigation.ts

Questi file sono il guscio "interno" condiviso da tutte le pagine del dashboard
(9 pagine usano PageContainer/PageHeader; Cashflow, FIRE e Settings usano il pattern
multi-tab). L'audit verifica la meccanica del guscio, non il contenuto delle pagine.

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-pagina):
- PageContainer: `max-w-[1600px] mx-auto`, `space-y-4 desktop:space-y-6`,
  `max-desktop:portrait:pb-20` presente su tutte le pagine con bottom nav
- PageHeader: mobile sticky bar (h-14, backdrop-blur-sm, bg-background/95) non sovrappone
  il contenuto; desktop full header con border-b; nessun colore hardcoded
- Multi-tab shell (PageTabBar/PageTabs): desktop (≥1440px) → underline tab bar animata;
  mobile → Radix Select o segmented pill (`desktop:hidden` / `hidden desktop:block`);
  stato del tab attivo e deep-link coerenti tra Cashflow/FIRE/Settings
- ThemePicker: 6 temi, swatch touch-friendly (≥44px), tema attivo via token non hardcoded
- navigation.ts: single source per primaryNav/analysisNav/planningNav/secondaryHrefs —
  nessuna voce nav duplicata inline nelle pagine
- Motion: `layoutId` del tab indicator unico per pagina; spring 400/35; `useReducedMotion()`
- ARIA: PageTabBar `role="tablist"`/`role="tab"` + `aria-selected`; Select mobile con `aria-label`
- Form-follows-function: il guscio è chrome che deferisce al contenuto — ogni elemento
  svolge una funzione di struttura/navigazione, nessuna decorazione che competa col dato
- Altro: inconsistenze cross-pagina o pattern di shell non previsti dagli assi sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Cross-cutting: Sistema dei Dialog

```
/impeccable audit il sistema dei dialog dell'app

Componenti: components/assets/AssetDialog.tsx,
            components/assets/TransactionDialog.tsx,
            components/assets/AssetMovementsDialog.tsx,
            components/assets/TaxCalculatorModal.tsx,
            components/expenses/ExpenseDialog.tsx,
            components/goals/GoalFormDialog.tsx,
            components/goals/AssetAssignmentDialog.tsx,
            components/dividends/DividendDialog.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/dividends/InflationRateDialog.tsx,
            components/pension/PensionContributionDialog.tsx,
            components/cashflow/CostCenterDialog.tsx,
            components/expenses/CategoryManagementDialog.tsx,
            components/layout/LogoutDialog.tsx,
            components/ui/responsive-modal.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-dialog):
- ResponsiveModal: l'astrazione `components/ui/responsive-modal.tsx` monta Dialog su desktop
  ↔ vaul Drawer su mobile (≤768px) — stesso breakpoint e comportamento per tutti i dialog
  che la usano (ExpenseDialog, CategoryManagementDialog)
- Struttura: tutti i dialog hanno `DialogTitle` + `DialogDescription` (accessibilità Radix)
- Token: header, footer, overlay backdrop — stessa vocabulary di token su tutti i dialog
- Footer pattern: bottone primario a destra, ghost/outline a sinistra — coerente?
- Size breakpoint: tutti usano lo stesso `max-w-*` su mobile vs desktop?
- 2-step flow (AssetDialog, ExpenseDialog): `AnimatePresence mode="wait"` presente,
  spring config (400/35), step indicator coerente tra i due dialog
- Loading state: `<Loader2 animate-spin>` su tutti i submit pending, non icone statiche
- Touch targets: close button e footer buttons ≥ 44px
- Dialog recenti mai valutati insieme agli altri — verificarli contro gli stessi assi:
  TransactionDialog (segmented Compra/Vendi/Rettifica in `role="tablist"`, anteprima
  plusvalenza in Geist Mono, sentinella `__none__` per "nessun regolamento" resa come
  opzione leggibile e non come stringa tecnica), AssetMovementsDialog (superficie di
  LETTURA: righe flat `divide-y`, non deve imitare un form né avere un footer da submit),
  PensionContributionDialog, InflationRateDialog, TaxCalculatorModal
- Altro: inconsistenze cross-dialog o pattern non previsti dagli assi sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Cross-cutting: Sistema degli Skeleton

```
/impeccable audit il sistema degli skeleton dell'app

Componenti: components/fire-simulations/FireCalculatorSkeleton.tsx,
            components/fire-simulations/MonteCarloSkeleton.tsx,
            components/fire-simulations/GoalsSkeleton.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx,
            components/allocation/AllocationPageSkeleton.tsx,
            components/assistant/AssistantPageSkeleton.tsx
            (+ skeleton inline in altri tab)

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-skeleton):
- Isomorfismo strutturale: ogni skeleton rispecchia il layout reale? Stessa altezza
  dei blocchi hero, stessa struttura delle righe flat
- Token: tutti i blocchi skeleton usano `bg-muted animate-pulse` — nessun `bg-gray-*`
- Hero block: tutti gli skeleton con hero hanno un blocco `h-12`/`h-14` in testa che
  corrisponde alla scala del page hero reale (`text-[44px] desktop:text-[54px]`)
- Coerenza: stessa `rounded-*`, stesso gap tra blocchi in tutti gli skeleton
- Altro: skeleton mancanti, disallineamenti strutturali o inconsistenze non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Cross-cutting: Token Compliance Globale (tutti e 6 i temi)

```
/impeccable audit la token compliance globale su tutti i temi

File: app/globals.css
Componenti: tutti (scan selettivo sui file modificati di recente)

Questo audit verifica il sistema di token CSS in sé, non le singole pagine.

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- `globals.css`: ogni tema (`data-theme="solar-dusk"` ecc.) definisce tutte le variabili
  necessarie — nessuna variabile mancante che causa fallback visivo inatteso
- Dark mode chroma: su temi dark, `--chart-1..5` hanno chroma ≥ 0.020 in oklch —
  altrimenti `useChartColors()` applica il fallback ma potrebbe mostrare colori spenti
- `color-mix()` usage: chiamate `color-mix(in oklch, var(--X) Y%, transparent)` —
  verifica che `--X` esista in tutti i 6 temi (light + dark)
- Nessun tema usa `!important` o override di classi Tailwind built-in che potrebbero
  creare conflitti con future versioni di Tailwind v4
- Altro: anomalie nel sistema di token non coperte dagli assi sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Email Periodiche

> **Medium diverso.** L'audit standard verifica token / chart colors / breakpoint `desktop:` /
> ARIA `tablist` / Framer Motion — assi che NON esistono in un'email HTML. Qui gli assi sono
> propri del medium (vedi sotto). Verifica solo il piano **visivo/resa**; il piano **funzionale**
> (correttezza confronti, baseline, boundary periodi) è `/code-review` + Vitest, non audit impeccable.

```
/impeccable audit l'email periodica (riepilogo mensile / trimestrale / semestrale / annuale)

PRE-STEP — renderizza l'HTML prima di auditare (vedi critique): genera l'output di
`buildEmailHtml` (manual test-send o file `.html`) e aprilo in light/dark, desktop/mobile.

File: lib/server/monthlyEmailService.ts
      (buildEmailHtml, simpleMarkdownToHtml, buildComparisonSectionHtml, comparisonCell)
      lib/server/weeklyBudgetEmailService.ts (email budget settimanale, fase 6 del cron)
Contesto logico (non visivo): lib/server/emailPeriodComparison.ts,
      app/api/cron/monthly-snapshot/route.ts,
      app/api/user/monthly-email/send/route.ts (render di test)

Assi da verificare (minimum — propri del medium email, NON gli assi del dashboard):
- Inline-CSS only: tutto lo styling è inline o in `<style>` whitelisted — gli hex hardcoded
  qui sono CORRETTI (i client non supportano CSS vars/token); NON segnalarli come violazione.
- Table-layout: struttura a `<table>`/`<td>`, larghezza max 600px centrata — non flex/grid.
- Mono sui numeri: patrimonio, %, € usano stack `'Geist Mono', ui-monospace, monospace`;
  tabella Confronti con allineamento tabellare (numeri a destra, colonne che leggono come colonne).
- Gerarchia: UN numero dominante (patrimonio netto) con eyebrow label; nessun numero secondario
  di pari peso; chrome achromatica con colore riservato ai delta sign-aware.
- Delta sign-semantics: verde positivo / rosso negativo, INVERTITO sulle Uscite (un +% di spesa
  è rosso); `comparisonCell` rispetta `higherIsBetter` per metrica.
- Markdown→HTML: simpleMarkdownToHtml rende le 5 sezioni del commento AI (heading, ol/ul,
  grassetti) senza `<br>` orfani, senza `<p>` vuoti, spacing coerente.
- Fallback: celle "N/D" pulite su baseline mancante; `previousEqualsYoy` (yearly) → colonna singola.
- Email budget settimanale: è INVIATA ogni domenica ma le cifre sono month-to-date (budget
  mensili + complessivo) e year-to-date (budget annuali), con proiezioni di fine periodo.
  Ogni orizzonte deve essere dichiarato esplicitamente nella caption accanto al numero —
  una proiezione mensile non deve poter essere letta come "fine anno" (errore già occorso
  lato prompt AI). Verifica che la resa visiva non riapra l'ambiguità.
- Dark mode: presenza/assenza di `<meta name="color-scheme">` + `@media (prefers-color-scheme: dark)`
  (oggi assenti → light-only su `#ffffff` fisso; segnala come gap, non come pass/fail bloccante).
- Mobile: tabella Confronti non deborda a 320–375px; body ≥ 14px; singola colonna leggibile.
- Compat client: nessuna proprietà CSS non supportata da Gmail web/app, Apple Mail, Outlook.
- Accessibilità: `lang="it"`, header tabella semantici, contrasto AA del grigio su sfondo.
- Altro: pattern anomali o violazioni non elencate sopra.

Contesto:
- Leggi DESIGN.md (Mono Mandate, Zero-Chroma, Form Follows Function)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)
```

---

## Ordine consigliato di esecuzione

Dalla maggiore probabilità di regressione alla minore:

**Dopo un redesign implementato (gate di compliance post craft + polish):**
1. Audit della pagina/tab appena modificata — assi token + chart colors + breakpoint
2. Cross-cutting dialog audit — se il redesign ha toccato dialog

**Come check standalone periodico:**
3. App Shell e Navigazione — ogni volta che si tocca layout.tsx o i componenti di nav
4. Cross-cutting Skeleton audit — dopo ogni redesign che cambia la struttura di una pagina
5. Token compliance globale — dopo l'aggiunta di nuovi componenti o temi
6. Landing + Auth — raramente cambiano, una volta ogni ciclo di redesign maggiore

**Mai auditate (nessuna baseline, priorità alta al primo giro):**
7. Impostazioni → tab Spese (import CSV) e tab Condivisione — sezioni recenti
8. Allocazione → superfici della leva (AllocationCompositionBar, InstrumentTradeList)
9. Patrimonio → registro operazioni (TransactionDialog, AssetMovementsDialog)

Previdenza esce da questa lista: auditata 2026-08-02 (15/20, 3 P1 chiusi), baseline nella sua
sezione. È ora l'unica pagina con una suite E2E dedicata, quindi il suo audit successivo parte
da lì e non dagli assi meccanici.
