# Animazioni e transizioni (dossier)

> Analisi del 23/10/2026, chiesta dal proprietario: «analizzi dove si possono inserire delle animazioni, transizioni per
> migliorare la UX». Dopo il primo giro ha chiesto anche i cambi di vista **dentro** le schede, non solo quelli tra le
> schede principali, e uno sketch animato per ogni proposta. Le ha approvate tutte lo stesso giorno («mi convincono
> tutti, partiamo per priorità come hai definito»).
> Questo dossier non cambia codice. Le decisioni D-AN1–D-AN6 (§ 8) sono del proprietario; D-AN7–D-AN11 sono proposte
> tecniche del dossier, da confermare con la PR.

Base: `Ciocc128/net-worth-tracker:main` a `751aa5c` (dopo #136–#141: la pillola in vetro, la scena morbida sul telefono).
**Sketch animati, oggi e proposta fianco a fianco**: https://claude.ai/artifact/E6D9vGBvtirMnXXotbecen (copia in
`/mnt/project-files/animazioni/animazioni-a-confronto.html` del progetto).

## 1. In breve

- L'app ha già due scene «d'autore» (DESIGN.md → The Page Scene, The Period-Transforms Rule), le righe chiuse del
  telefono sulla molla (The Closed-Row Rule) e le pillole delle schede su `layoutId`. Il resto cambia **di colpo**.
- Undici proposte, A–K, in tre priorità. Tre buchi veri (P1), sei cambi di vista o di valore senza transizione (P2),
  quattro conferme di azione (P3).
- Il buco più serio è di accessibilità: **14 grafici su 20 animano anche con «riduci movimento»** attivo, perché il
  `MotionConfig` di Framer non tocca Recharts.
- Tre fasi di implementazione, una PR ciascuna: **AN1** (A+B+C, Sonnet), **AN2** (J+D+E+K, Opus), **AN3** (F+G+H+I,
  Sonnet).

## 2. Stato di partenza

| Cosa | Dove | Come |
| --- | --- | --- |
| Scena di pagina | `lib/utils/viewTransition.ts`, `useSceneNavigation`, `app/dashboard/template.tsx`, `globals.css` | view transition; sul telefono con la pillola in vetro, scena morbida (fade di `<main>`) |
| Il periodo trasforma | Rendimenti, Storico (`useCountUp({ fromPrevious })`, `useMorphingSeries`, heatmap) | 620 ms ease-out-quart, 420 ms per le serie |
| Righe chiuse | `components/ui/tile.tsx` (`TileRowShell`) | `grid-rows 0fr→1fr`, 300 ms `ease-spring` |
| Pillole delle schede | `PageTabBar`, `SegmentedPill` | `layoutId`, molla 400/35 |
| Cambio scheda | solo Cashflow (`tabPanelSwitch`, 200 ms) | `motion.div` attorno a ogni pannello `forceMount` |
| Riordino in classifica | solo Rendimenti › Attribuzione | `motion.li layout="position"` |
| Barre di composizione | `components/ui/composition-list.tsx` | `motion.span` sulla larghezza |
| Modali, popover, toast | `ResponsiveModal`, `popover.tsx`, `sonner.tsx` | origine dal controllo; fade+zoom; icone animate |
| Barra «Salva» di Impostazioni | `app/dashboard/settings/page.tsx` | `animate-in fade-in slide-in-from-bottom-2` |
| Cascata della Panoramica | `app/dashboard/page.tsx` | una volta per sessione |

Regole che valgono per tutto il dossier: AGENTS.md § Motion (un solo `MotionConfig reducedMotion="user"`, niente
`layout` su wrapper di pagina, `layout`/`layoutId` solo dove l'elemento è visibile, `useCountUp` prima di ogni return
anticipato e con `landFirstValue` se `fromPrevious`), DESIGN.md → The Page Scene (nessun elemento condiviso oltre ai tre
nominati), The Closed-Row Rule, The Period-Transforms Rule (il frame della glide non è una misura: hover, `aria-label` e
cifre stampate leggono il dato arrivato).

## 3. Obiettivo e perimetro

**Obiettivo.** Ogni cambio che il lettore provoca o subisce (scheda, vista, livello, periodo, dato fresco, riga
aggiunta o tolta, salvataggio) si **vede accadere** e dice da dove viene il nuovo stato, senza decorare e senza costare
sul telefono. Con «riduci movimento» non si muove nulla.

**Incluso.** Le undici proposte A–K (§ 5), la pulizia delle varianti morte in `lib/utils/motionVariants.ts`
(`slideDown`, `simulationShellSettle`, `simulationStagger`, `goalLinkSettle`: nessun import).

**Escluso** (D-AN5): swipe tra le schede sul telefono; un tile che si trasforma in un tile di un'altra pagina; cascata
d'ingresso su ogni pagina; vetro, blur, parallax, sollevamento dei tile al passaggio del mouse; il selettore del tema
Lime Frost (lavoro di un altro thread); email e PDF (fuori dal DOM).

## 4. Casi d'uso

| # | Il lettore… | Oggi | Dopo |
| --- | --- | --- | --- |
| CU1 | ha «riduci movimento» nel telefono e apre Cashflow o FIRE | i grafici crescono 0,6–1,5 s | i grafici compaiono disegnati |
| CU2 | passa da Calcolatore a Coast, o da Bilanciamento ad Accumulo | il pannello cambia di colpo | il pannello entra sfumando |
| CU3 | tocca «Il perché» o apre «Dettaglio» | il testo compare di colpo | si apre sulla molla |
| CU4 | cambia vista dell'Esposizione (Settori → Paesi) | tutto cambia di colpo | i nomi sfumano, le barre scorrono, le cifre contano |
| CU5 | scende da «Tutte le spese» a «Casa» in Analisi e risale | il livello cambia sul posto | scendere entra da destra, risalire da sinistra |
| CU6 | passa da Mese ad Anno in Tracciamento | le cifre si sostituiscono | le cifre scivolano dal valore di prima |
| CU7 | apre la Panoramica con la cache e il dato fresco arriva | l'eroe salta | l'eroe scivola dal valore in cache |
| CU8 | apre una pagina senza cache | lo scheletro lascia il posto in un frame | il contenuto entra sfumando |
| CU9 | elimina una spesa, ne aggiunge una | la riga sparisce, la nuova compare senza segno | la riga si chiude, la nuova si apre evidenziata |
| CU10 | va avanti nel piano di accumulo | il passo cambia e il modale salta d'altezza | il passo scorre, l'altezza segue |
| CU11 | salva il piano FIRE | conferma solo il toast | il bottone dice «Salvato» per un secondo |

## 5. Specifiche per proposta

Durate e curve vengono tutte da § 6. In ogni proposta «riduci movimento» = stato finale subito, nessuna animazione.

### 5.1 A — I grafici rispettano «riduci movimento» (P1, AN1)

- **Dove.** I 14 file che disegnano serie Recharts senza leggere la preferenza: `cashflow/{AndamentoStoricoCharts,
  ConfrontoAnnualeCharts,SavingsRateLineChart,EntityTrendChart}.tsx`, `fire-simulations/{FIREProjectionChart,FireFanChart,
  FireDettaglio,CoastFireProjectionChart}.tsx`, `fire-simulations/whatif/WhatIfProjectionChart.tsx`,
  `monte-carlo/{MonteCarloFanChart,ScenarioOverlayChart}.tsx`, `goals/GoalProjectionChart.tsx`,
  `performance/RollingLineChart.tsx`, `dashboard/LaborMetricsChart.tsx`. I sei che la leggono già (Storico ×4,
  drawdown, `AssetSparkline` che non anima) passano alla stessa regola.
- **Come.** UN hook, `lib/hooks/useChartMotion.ts`, che restituisce `{ isAnimationActive, animationDuration,
  animationEasing }` da `useReducedMotion()`; ogni `<Area>`, `<Bar>`, `<Line>` lo riceve con lo spread. Niente wrapper
  nella porta `components/ui/charts/recharts.ts`: la porta resta un elenco di riesportazioni (il suo commento spiega
  perché, `perf:budget` › `libraryCopies`).
- **Durata unica** per l'ingresso di una serie (D-AN7): 600 ms ease-out; oggi convivono 600, 800, 900 e il 1500 di
  default di Recharts. Le serie che si trasformano al cambio di periodo (`useMorphingSeries`) restano come sono.
- **Guardia.** Un Vitest che legge i file sotto `components/` e fallisce, nominando file e riga, su un `<Area`, `<Bar` o
  `<Line` di Recharts senza `useChartMotion` né `isAnimationActive={false}` (sul modello di
  `__tests__/vercelConfig.test.ts`).

### 5.2 B — Cambio scheda uguale ovunque (P1, AN1)

- **Dove.** `components/layout/PageTabs.tsx` e le pagine che lo usano: FIRE (sei schede, `TabsContent` che smonta le
  inattive), Allocazione (Bilanciamento · Accumulo), Impostazioni (sette), Cashflow (cinque, `forceMount`).
- **Come.** Una regola CSS sola in `app/globals.css`: il pannello attivo di un `PageTabs` entra con opacità 0→1 e
  `translateY(6px)`→0, 200 ms ease-out-quart, dentro `motion-safe`. Il root di `PageTabs` porta un attributo
  (`data-tab-switched`) che si accende al **primo cambio** fatto dal lettore (D-AN8): l'ingresso della pagina resta della
  scena o del fade di `template.tsx`, mai due fade sommati. Un pannello `forceMount` che torna visibile riparte
  l'animazione da sé (da `hidden` a visibile).
- **Pulizia.** Cashflow perde i suoi cinque `motion.div` con `tabPanelSwitch`; la variante resta solo se un altro file la
  usa.
- **Non cambia.** La pillola su `layoutId`.

### 5.3 C — «Il perché» e «Dettaglio» si aprono morbidi (P1, AN1)

- **«Il perché»** (`components/ui/page-verdict.tsx`, solo sotto `desktop:`): il blocco del resto del verdetto passa da
  `max-desktop:hidden` alla tecnica delle righe chiuse (`grid-rows 0fr↔1fr`, figlio `overflow-hidden min-h-0`, 300 ms
  `ease-spring`). A 1440 il testo resta inline nel paragrafo e sempre visibile: niente `inert` e niente griglia lì.
- **«Dettaglio»** in dieci pagine (`components/{allocation/Allocazione,dividends/Dividendi,fire-simulations/Fire,
  goals/Goals,hall-of-fame/HallOfFame,history/Storico,monte-carlo/MonteCarlo,pension/Pension,performance/Performance,
  projection/Projection}Dettaglio.tsx`), anche su desktop: `CollapsibleContent` di Radix con
  `data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up` (tw-animate-css, sull'altezza
  `--radix-collapsible-content-height`), 300 ms `ease-spring`, `overflow-hidden`. La classe è UNA costante esportata da
  `components/ui/collapsible.tsx` (`DISCLOSURE_MOTION_CLASS`), applicata nei dieci file; il primitivo condiviso non
  cambia per gli altri usi.
- **Chevron**: già sulla molla, invariato.

### 5.4 J — Cambio di vista dentro un tile (P2, AN2)

- **Dove.** I controlli di vista nell'aside dei tile e le pillole interne: `AsideToggle` (Esposizione a cinque viste,
  Piano Ribilancia · Versa · Preleva, Storico › Composizione e Raddoppi, Proiezione › Tappe e Parametri, Traguardo,
  Andamento storico, Confronto annuale, Tasso di risparmio, Monte Carlo › pesi) e `SegmentedPill` (Dividendi,
  Previdenza, Monte Carlo › Al FIRE · Oggi), più i toggle di Strumenti (Andamento, Raggruppa per classe).
- **Come.**
  - Le righe di una classifica hanno una chiave stabile per elemento. Una riga che resta tra le due viste mantiene il nodo:
    la sua barra scorre alla nuova larghezza in CSS (`motion-safe:transition-[width]`, 400 ms `ease-spring`) e, se cambia
    posto, scorre al nuovo posto con `layout="position"` sulla molla 400/35, il modello di Rendimenti › Attribuzione.
    Solo in liste di al massimo 10 righe (D-AN10); oltre, la riga atterra al suo posto.
  - Una riga nuova entra sfumando (160 ms), una che esce sfuma (100 ms) e lascia il posto.
  - Le cifre delle righe contano dal valore di prima con UN `requestAnimationFrame` per tile, mai un `useCountUp` per
    riga (D-AN10). L'eroe del tile usa `useCountUp({ fromPrevious, landFirstValue })`.
  - Primitivi da toccare: `components/ui/ranked-rows.tsx` (oggi non anima nulla), `components/dashboard/overview/
    RankedRows.tsx`, `components/ui/composition-list.tsx` (già anima la barra: va allineato a 400 ms `ease-spring`).
- **Prima del codice**, l'impl misura `perf:census` (desktop e `--mobile`) su Allocazione e Rendimenti come base e
  ripete dopo. Un aumento va spiegato nella PR.
- **Regola da scrivere** in DESIGN.md: la vista trasforma come il periodo (estensione di The Period-Transforms Rule a un
  cambio di vista nello stesso tile).

### 5.5 K — Scendere e risalire nel drill di Analisi (P2, AN2)

- **Dove.** `components/cashflow/analisi/tiles/SchedaTile.tsx` e le righe di `FlussoTile.tsx`, con `DrillBreadcrumb`.
  Il Sankey ha già la sua dissolvenza (`fadeVariants`, `chartReveal`) e resta così.
- **Come.** Il livello è un nodo con chiave di livello; `AnimatePresence mode="wait"`: il vecchio esce verso la direzione
  opposta (−30 px, opacità 0, 160 ms ease-in), il nuovo entra dalla direzione del movimento (+30 px → 0, 220 ms
  ease-out-quart). La direzione si legge dalla profondità: più profondo = da destra, meno profondo = da sinistra.
- **Focus.** Dopo il cambio il focus resta dove la pagina lo mette oggi; la transizione non lo sposta.

### 5.6 D — Il cambio di periodo trasforma anche altrove (P2, AN2)

- **Dove.** Cashflow › Tracciamento, Analisi, Dividendi: l'eroe di ogni tile e le celle della striscia (`verdict-strip`).
- **Come.** Come in Rendimenti: nessuna `key` di periodo sulla griglia, `useCountUp({ fromPrevious, landFirstValue,
  duration: 620 })` sulle cifre principali, le barre dei tile con le regole di J. Le righe dei tile non contano se
  superano 10 (D-AN10). I grafici Recharts non si rismontano al cambio di periodo.
- **Regola.** DESIGN.md → The Period-Transforms Rule elenca le pagine nuove.

### 5.7 E — Dal dato in cache al dato fresco (P2, AN2)

- **Dove.** L'eroe della Panoramica (`OverviewAnimatedCurrency`, `overview/PatrimonioTile.tsx`) e quello di Patrimonio.
- **Come.** Quando il valore cambia dopo il montaggio e il precedente veniva dalla cache persistita (la pagina era in
  «Aggiornato alle…, sto rileggendo»), la cifra scivola in 600 ms ease-out-quart; la riga di freschezza sfuma (200 ms).
  Un cambio dopo una modifica del lettore segue la stessa regola. Il conteggio da zero al primo caricamento resta com'è.
- **Il frame non è una misura**: `aria-label` e tooltip leggono il valore arrivato.

### 5.8 F — Dallo scheletro al contenuto (P3, AN3)

- **Dove.** Le pagine che mostrano `TileGridSkeleton` prima dei dati.
- **Come.** Il contenuto entra con opacità 0→1 in 180 ms solo se lo scheletro è stato davvero dipinto in questa visita;
  con i dati dalla cache persistita non c'è scheletro e quindi niente fade. Mai `translate` (la scena di pagina ha già
  mosso il contenuto). La Panoramica tiene la sua cascata e non riceve questo fade.

### 5.9 G — Righe che escono ed entrano (P3, AN3)

- **Dove.** Le liste con eliminazione armata nella riga (`useArmedDelete`): `expenses/ExpenseTable.tsx`,
  `assets/{StrumentiTile,AssetRow,AssetMovementsDialog,CashAccountDialog}.tsx`, `pension/tiles/VersamentiTile.tsx`,
  `goals/tiles/TraiettoriaTile.tsx`, `settings/tabs/SpeseTab.tsx`.
- **Come.** Alla conferma la riga entra in stato «in uscita» e si chiude (`grid-rows 1fr→0fr` + opacità, 220 ms
  ease-out-quart) mentre la scrittura parte; se la scrittura fallisce la riga si riapre e l'errore resta quello di oggi.
  Una riga appena creata (l'id torna dalla mutazione) si apre (220 ms) e resta evidenziata `bg-muted` per 1200 ms, poi
  sfuma; il timer vive nel suo `useEffect` (AGENTS.md § Motion, auto-dismiss). Si anima solo la riga toccata, mai la
  lista, e nessun `layout` su liste lunghe.

### 5.10 H — Passi del piano di accumulo (P3, AN3)

- **Dove.** `components/allocation/AccumulationPlanDialog.tsx` (nuovo piano e «Rivedi il piano»).
- **Come.** Il corpo del passo esce verso −24 px (160 ms ease-in) ed entra da +24 px (240 ms ease-out-quart) andando
  avanti, al contrario tornando indietro. L'altezza del corpo segue in 260 ms `ease-spring`, misurata in px (niente
  `layout` di Framer sul corpo: distorce il contenuto). Sul telefono (drawer) vale lo stesso dentro il pannello.
- **Focus.** Il focus va al titolo del passo, come oggi.

### 5.11 I — «Salva» conferma sul bottone (P3, AN3)

- **Dove.** «Salva» della barra di Impostazioni, «Salva il piano» (`fire-simulations/plan/FirePlanBlock.tsx`), «Salva gli
  obiettivi» (`allocation/ObiettiviDialog.tsx`).
- **Come.** Dopo il successo il bottone mostra `AnimatedCheckIcon` + «Salvato» su `bg-positive` per 1200 ms, poi torna
  allo stato che ha oggi dopo un salvataggio. Il toast resta ed è l'annuncio per lo
  screen reader: il bottone non ha `aria-live` (un solo annuncio).

## 6. Regole comuni

| Movimento | Durata | Curva |
| --- | --- | --- |
| Ingresso di una serie di grafico (A) | 600 ms | ease-out |
| Pannello di scheda (B) | 200 ms | ease-out-quart |
| Apertura e chiusura (C) | 300 ms | `ease-spring` (400/35) |
| Barre e riordino (J, D) | 400 ms | `ease-spring` |
| Nomi che cambiano (J) | 100 ms fuori, 160 ms dentro | ease-out |
| Cifre che contano (D, J) | 620 ms | ease-out-quart |
| Dato fresco (E) | 600 ms | ease-out-quart |
| Drill (K) | 160 ms fuori, 220 ms dentro | ease-in / ease-out-quart |
| Scheletro → contenuto (F) | 180 ms | ease-out |
| Riga che esce o entra (G) | 220 ms; evidenza 1200 ms | ease-out-quart |
| Passo del modale (H) | 160 + 240 ms; altezza 260 ms | ease-in / ease-out-quart / `ease-spring` |
| Conferma sul bottone (I) | 1200 ms | molla per l'icona |

- **Una tecnica per forma** (D-AN9): CSS dove basta (schede, aperture, barre, evidenze); Framer solo per uscite
  (`AnimatePresence`) e riordini (`layout="position"`). Niente `LazyMotion`.
- **Riduci movimento**: CSS dentro `motion-safe:`; Framer tramite il `MotionConfig` della radice; Recharts tramite
  `useChartMotion` (A). Nessuna animazione nuova fuori da queste tre strade.
- **Il frame non è una misura**: hover, `aria-label` e cifre stampate leggono il dato arrivato.
- **Costo**: ogni PR riporta `perf:census` desktop e `--mobile` sugli scenari toccati, prima e dopo; `perf:budget` e
  `mobile:budget` verdi e invariati (nessuna cifra nuova sul primo schermo).

## 7. Piano e ordine

| Fase | Proposte | Modello | Chiude con |
| --- | --- | --- | --- |
| **AN1** | A, B, C + pulizia di `motionVariants.ts` | Sonnet 5.5 | Vitest (guardia di A), `tsc`, lint; E2E `e2e/motion.reduced.spec.ts` (nuova): con `reducedMotion: 'reduce'` nessuna `document.getAnimations()` attiva dopo un cambio scheda, un'apertura di «Dettaglio» e il disegno di un grafico; Playwright delle pagine toccate sul Mac |
| **AN2** | J, D, E, K | Opus 5.5 | `perf:census` desktop e `--mobile` prima/dopo su Allocazione, Rendimenti, Cashflow, Analisi, Panoramica; `mobile:budget`; Playwright sul Mac; DESIGN.md (regola della vista) |
| **AN3** | F, G, H, I | Sonnet 5.5 | Vitest degli stati «in uscita» e «salvato»; Playwright delle liste toccate e del modale PAC sul Mac |

Una fase alla volta, ciascuna nel suo thread e nella sua PR in bozza. Ogni fase aggiorna la guida delle pagine che
tocca (`doc/guide/<tema>.md`), `doc/guide/shell.md` § Motion se cambia le schede, e AGENTS.md § Motion se nasce una
regola trasversale.

## 8. Decisioni

Prese dal proprietario il 23/10/2026:

- **D-AN1 — Tutte le proposte A–K, in ordine di priorità.** Scartato: sceglierne solo alcune. Motivo: «mi convincono
  tutti».
- **D-AN2 — Un thread per fase (AN1, AN2, AN3), non uno per animazione né uno per tutte.** Scartati: undici PR sugli
  stessi file condivisi, da mettere comunque in coda; una PR unica, con le misure tutte insieme e il resto bloccato da una
  sola parte che non convince.
- **D-AN3 — AN1 e AN3 su Sonnet 5.5, AN2 su Opus 5.5** (da scrivere sulla card). Scartato: Sonnet ovunque. Motivo: AN2
  tocca primitivi condivisi da molte pagine e `useCountUp`, che ha trappole documentate, con il costo sul telefono da
  tenere sotto il census.
- **D-AN4 — «Riduci movimento» vale anche per i grafici.** Scartato: lasciare Recharts com'è. Motivo: DESIGN.md → Do's
  («respect `prefers-reduced-motion`») vale per ogni superficie.
- **D-AN5 — Fuori perimetro**: swipe tra le schede (si scontra con lo scroll orizzontale e con la barra in basso), tile
  che si trasformano tra pagine (The Page Scene lo vieta), cascata ovunque (decorazione, costa nel census), vetro, blur,
  parallax, sollevamento al passaggio del mouse (DESIGN.md).
- **D-AN6 — Ogni proposta di interfaccia ha uno sketch «oggi / proposta».** Regola di lavoro, scritta in WORKFLOW.md
  § 1 regola 8.

Proposte tecniche del dossier, da confermare con la PR:

- **D-AN7 — Le durate e le curve di § 6**, prese da quelle già in uso (molla 400/35, ease-out-quart, 620 ms del periodo).
  Scartato: durate scelte proposta per proposta.
- **D-AN8 — Il pannello di scheda entra solo dopo il primo cambio del lettore.** Scartato: sempre, anche al montaggio.
  Motivo: si sommerebbe alla scena di pagina o al fade di `template.tsx` (t², il motivo per cui il template si ritira
  durante la scena).
- **D-AN9 — Una tecnica per forma: CSS dove basta, Framer solo per uscite e riordini.** Scartato: Framer ovunque.
  Motivo: costo di render e misure (AGENTS.md § Motion, census di `nav`).
- **D-AN10 — Riordino e conteggio delle righe solo fino a 10 righe, con un solo `requestAnimationFrame` per tile.**
  Scartato: un `useCountUp` per riga. Motivo: ogni conteggio ridisegna a ogni frame.
- **D-AN11 — `useChartMotion` come hook con lo spread, non wrapper nella porta di Recharts.** Scartato: wrapper
  `Area`/`Bar`/`Line` nella porta. Motivo: la porta esiste per tenere UN chunk di recharts e il suo commento avverte che
  la forma dei suoi export conta; un hook non tocca il grafo dei moduli.

Prese con la PR di AN2 (23/10/2026):

- **D-AN12 — Tracciamento: lo scheletro resta, le cifre scivolano all'arrivo.** Un periodo mai letto è una lettura nuova
  e la griglia aspetta come scheletro (lib/hooks/useExpenses.ts: mai righe di mesi sbagliati sotto il periodo nuovo);
  quando i tile tornano, trio, eroe e celle della striscia scivolano dalle cifre del periodo di prima (`FigureMemory` della
  scheda). Scelta del proprietario sulla card del thread. Scartato: tenere i tile vecchi attenuati durante l'attesa
  (cambia una regola scritta e mostra un periodo che non è più quello scelto).
- **D-AN13 — La riga nuova prende il nodo di una riga uscita.** Una riga con la stessa chiave tiene il suo nodo; una riga
  con una chiave nuova eredita il nodo di una uscita, nell'ordine della lista (`lib/utils/rowMorph.ts`), così Settori →
  Paesi fa quello che mostrava lo sketch (nomi che sfumano, barre che scorrono, cifre che contano) anche senza chiavi in
  comune. Scartato: solo chiave per chiave (§ 5.4 alla lettera), che tra due viste senza chiavi comuni avrebbe sfumato via
  tutte le righe e sfumato dentro le nuove, senza barre che scorrono.
- **D-AN14 — K vale per la Scheda.** Sul telefono il Flusso non ha un drill (una riga apre la Scheda) e sul desktop il
  Sankey tiene la sua dissolvenza: `DrillSlide` è sul corpo della Scheda (categoria ↔ sottocategoria); due livelli alla
  stessa profondità solo sfumano.
- **D-AN15 — J sui primitivi.** La trasformazione vive in `RankedRows` e `CompositionList` e la ereditano tutti i tile che
  li usano; i controlli di vista che cambiano un grafico Recharts (Andamento storico, Confronto annuale, Tasso di
  risparmio) o una tabella (Tappe) restano come sono: Recharts anima già con `useChartMotion`, una tabella non è una
  classifica.

## 9. Punti aperti

- **J su Strumenti**: la tabella ha più di 10 righe nel caso reale; con D-AN10 «Raggruppa per classe» atterra senza
  riordino animato. Da rivedere sul Mac con i dati veri se il risultato sembra brusco.
- **H sul telefono**: il drawer di `ResponsiveModal` ha già il suo trascinamento; va verificato che l'animazione
  dell'altezza non lo disturbi.
- **E con le modifiche del lettore**: se la glide dopo un salvataggio sembra «lenta», si può limitare al solo arrivo
  dalla cache.

## 10. Criteri di accettazione

1. Con `prefers-reduced-motion: reduce` (Playwright `reducedMotion: 'reduce'`), dopo il disegno di un grafico in
   Cashflow › Tracciamento, un cambio scheda in FIRE e l'apertura di «Dettaglio» in Storico,
   `document.getAnimations().filter(a => a.playState === 'running').length === 0`.
2. La guardia Vitest di A fallisce su un `<Bar dataKey="x" />` senza `useChartMotion` e passa sul repo.
3. Al **primo** montaggio di FIRE nessun pannello di scheda anima; al primo cambio di scheda il pannello nuovo ha
   un'animazione di 200 ms (`getAnimations()[0].effect.getTiming().duration === 200`).
4. «Dettaglio» si apre e si chiude in 300 ms; a 1440 «Il perché» non esiste come bottone e il testo resta visibile
   inline.
5. Esposizione, Settori → Paesi: le righe con la stessa chiave mantengono il nodo DOM (stesso elemento prima e dopo), la
   larghezza della barra passa per almeno un valore intermedio, il testo finale è quello della vista nuova entro 700 ms.
6. Tracciamento, Mese → Anno su una fixture con spese di 1840 € nel mese e 21960 € nell'anno (cifre inventate, WORKFLOW.md § 1 regola 7): a metà della glide
   l'eroe mostra un valore strettamente compreso tra 1840 e 21960; a fine glide `21960 €`; l'`aria-label` dice `21960 €` da
   subito.
7. Analisi, drill su una categoria: il livello nuovo entra con `translateX` positivo, il ritorno con `translateX`
   negativo.
8. Spesa eliminata: la riga resta nel DOM per la durata dell'uscita (≈ 220 ms) e poi sparisce; con la scrittura fallita
   (emulatore spento o regola negata) la riga torna aperta.
9. `perf:census` desktop e `--mobile` sugli scenari della fase: nessun aumento di render per interazione oltre quanto la
   PR spiega; `perf:budget` e `mobile:budget` verdi senza ritocchi.
