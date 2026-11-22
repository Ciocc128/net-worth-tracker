# Rifiniture di UI e movimento (dossier)

> Card Todoist «F15 FEAT rifiniture di UI e movimento (16 punti) e seguito desktop N5–N17», label `epic-review-fable`.
> Fonti (Library del progetto): `review-ui-movimento/review-ui-movimento.md` (16 punti, 10/11/2026, main `ec6d115`) e
> `review-ui-desktop.md` (N1–N17, 11/11/2026). Pagine con gli schizzi animati «oggi / proposta» dei 16 punti:
> https://claude.ai/artifact/UouSCkdUWoMjV2SS3c4Nip (copia `review-ui-movimento/rifiniture-ui-movimento.html`) e
> https://claude.ai/artifact/RUddPCN1hWqBNy4tSTYx43.
> Specifica scritta il 2026-11-21 **riletta contro `main` a `4750763`** (dopo riordino RU0–RU6, il fascicolo, #209);
> **nessun codice in questo commit**.
>
> **Stato delle decisioni**: D-UM7 presa il 14/11/2026 (sulla card). Il 22/11/2026 il proprietario ha confermato **tutte le
> altre D-UM tranne due**: D-UM10 (il «+» tiene la molla e il rimbalzo, resta com'è) e D-UM6 (i colori del Flusso restano
> «per ora» come sono), e ha deciso P2 (via la cascata da Panoramica e Patrimonio). D-UM12–D-UM14 sono state confermate il 22/11/2026 dopo gli schizzi
> (https://claude.ai/artifact/8e6ukzF67erGyjHUokAtsW), con due correzioni: **«vendi» resta viola** (è il viola di tutto Lime Frost; solo Bear
> passa all'ardesia) e **la Composizione di Storico (N11) prende i toni nuovi ma tiene le curve morbide**, non a scalini. Le decisioni già prese altrove (D-AS1–31, D-AN1–15, D-FA1–13, D-RU*, D-FD*) non sono riproposte.

> **UM1 implementata il 2026-11-22** (P1, P2, P3, P5, P9; P10 non si fa): `landFirstValue` su `OverviewAnimatedCurrency`, `RendimentoTile`,
> `EvoluzioneTile` e guardia `__tests__/countUpLandFirst.test.ts`; «Altro» senza stagger (`drawerContainer`/`drawerItem` tolti); Sparkline a 2 px
> `non-scaling-stroke`; via la cascata da Panoramica e Patrimonio (`tileGridEntrance` rimosso); uscite di dialog/alert-dialog 200/130, popover e
> menu 150/100, foglio 500/300, curve ease-out-quart dentro e `ease-in` fuori. Misure sul Mac ancora da fare (vedi la PR).

> **UM4 implementata il 2026-11-22** (#218, più l'anello di focus unico in una PR successiva): punti 8, 11, 12, 14, 15, 16; **P13 aspetta il
> census a 390 sul Mac** prima di toccare i selettori. Regole nuove in DESIGN.md: The Press-Is-A-Step-Of-Colour Rule, The Resting-Bin Rule.

> **UM2 implementata il 2026-11-22** (punto 4, D-UM4 variante (a)): provata su iPhone vero dietro `?fascia=a` (PR #219) e scelta da Giorgio lo
> stesso giorno; il video dell'«oggi» (c) mostrava la fascia schiarirsi fino al fondo a ogni tocco. Nella scena morbida `<main>` e gli antenati
> della fascia restano opachi e sfumano i sottoalberi senza fascia più ciò che sta sulla fascia (`app/globals.css` → Soft scene); l'entrata la
> fa il foglio di stile sotto `data-page-entering` (`template.tsx`), non più la dissolvenza del template. (b) non è servita. Interruttore tolto.

> **UM3 implementata il 2026-11-22** (punto 7, N12 solo Bear, audit N14): `splitEuroCents` + `SettledFigure smallCents` disegnano i centesimi del trio
> (Tracciamento e Analisi › Periodo) al 60% del corpo, stessa linea di base, il testo letto non cambia; `--scenario-bear` di Lime Frost passa dalla lavanda
> all'ardesia (chiaro `oklch(0.52 0.035 257)`, scuro `oklch(0.78 0.03 257)`), «vendi» resta viola, Graphite era già ardesia. **Audit N14 e regola: § 5.3a
> (la regola aspetta la scelta di Giorgio, P4).** Misure sul Mac ancora da fare (vedi la PR). Nota: in it-IT `Intl` raggruppa dalle cinque cifre,
> quindi 1234,56 € si stampa «1234,56 €» (non «1.234,56 €»): il valore di riferimento del criterio 4 vale per 12345,67 € → «12.345» + «,67 €».

> **UM5b in corso (2026-11-22)**: fatti N9 (un conto non ripete il nome e ha la Quantità «–», `describeRowIdentity`), N16 (in Dividendi vuoto la testata non ripete i due pulsanti, resta quello del tile), N17 (lo sfondo della fascia a tutta larghezza, il suo contenuto su `max-w-[1920px]`; da misurare a 2560) e N6 su Versamenti e Target per classe (`max-w-[720px]` centrato, scelta di Giorgio del 22/11/2026; Movimenti si misura sul Mac e si tocca solo oltre 720 px). N10 (una serie, anche a rate, è UNA voce di Spese maggiori col totale del periodo, `rankTopExpenses`), N11 (riempimento delle aree al 45%, bordo 1,5 px, solo opacità) e N13 (la regola «per ruolo» in DESIGN.md → The Selector-By-Role Rule, scelta (b); l’audit non ha trovato codice da cambiare) fatti.

> **UM5a implementata il 2026-11-22** (N5, N7, N8; la PR è in bozza): in Accumulo «Registra» è pieno solo sulla prima riga da fare (le in ritardo prima) e
> «Applica» e «Ricalcola» sono secondari; la frase del Piano oltre tre operazioni dice il conteggio, i totali (da 4 a 9) e l'ordine maggiore
> (`describeLargePlan`; da 10 solo conteggio e maggiore, scelta di Giorgio del 22/11/2026, dove il dossier non distingueva 4–9 da ≥10);
> N7: sotto le liste con meno di tre righe, Analisi › Spese/Entrate per categoria mostra «Nello stesso periodo, 2025: …» e Rendimenti › Contributi una
> riga «Dividendi» (rendimento, non un contributo) quando sono diversi da zero. Patrimonio › Movimenti del mese e Analisi › Fuori scala avevano già il
> dato di riferimento di D-AS10; Benchmark «lettura fallita» resta com'è (un guasto, non un'assenza). Misure sul Mac ancora da fare (vedi la PR).

## 1. In breve

- Dei 16 punti del 10/11, **13 sono ancora veri su `main`**, 1 è già risolto in parte (15: Strumenti l'ha chiuso RU6, restano
  Pagamenti e gli altri cestini), 2 vanno rimisurati (8, 13). Dei 13 punti N5–N17 della review desktop, N1–N4 stanno in F13
  (fatti: RU4–RU6, N4 in RU0), N15 va con R1 (RU1, fatto), restano **N5–N14, N16, N17**.
- Il punto 1 è un **difetto contro una regola già scritta**: DESIGN.md → The Net Worth Counter dice «Numbers land — they count
  from a prior value, never from zero», e il codice conta da zero in cinque pagine. Il rimedio esiste già (`landFirstValue`,
  usato da `SettledFigure`).
- Cinque fasi, una PR ciascuna, in coda per area di codice (§ 7): **UM1** ingressi e uscite (1, 2, 3, 5, 9; il 10 non si fa), **UM2** la
  fascia sul telefono (4, Opus), **UM3** colori e cifre (7, N12, N14; il 6 sospeso), **UM4** testi, righe e selettori (8, 11–16), **UM5**
  il seguito desktop (N5–N11, N13, N16, N17, in due PR).
- Fuori perimetro: nessuna animazione nuova oltre a quelle dei 16 punti; niente di ciò che la review «lascia com'è».

## 2. Stato di partenza (verificato nel codice di `main`)

| # | Punto | Esito sul codice | Dove (oggi) |
|---|---|---|---|
| 1 | Cifra da 0,00 € | **vero**: `OverviewAnimatedCurrency` passa `fromPrevious` ma non `landFirstValue`; `RendimentoTile.HeroValue` uguale; `EvoluzioneTile` (cifra dello scrub) idem | `components/dashboard/OverviewAnimatedCurrency.tsx:74`, `components/performance/tiles/RendimentoTile.tsx:67`; chiamanti: `PatrimonioTile` (Panoramica e Patrimonio), `FondoOggiTile` (Previdenza) |
| 2 | «Altro» in fila | **vero**: foglio 500 ms (`sheet.tsx`), `drawerContainer` stagger 50 ms + delay 50 ms, 11 righe | `lib/utils/motionVariants.ts` (`drawerContainer`, `drawerItem`), `SecondaryMenuDrawer.tsx:181–221` |
| 3 | Tratto della curva | **vero**: `<path strokeWidth={1.5}>` su un SVG `preserveAspectRatio="none"`, la riga di hover ha già `vectorEffect` | `components/dashboard/NetWorthSparkline.tsx:143` |
| 4 | Fascia che sbiadisce | **vero sul telefono**: la scena morbida porta `#page-main` a opacità 0 in 140 ms (`html[data-page-leaving]`), e la fascia (`.top-band`) sta dentro `PageHeader` dentro `#page-main`. **Dal fascicolo (`band:`) non vale**: lì la fascia sta sopra `<main>` e non si muove (D-FD*) | `app/globals.css:459`, `lib/hooks/useSceneNavigation.ts`, `app/dashboard/template.tsx`, `components/layout/PageHeader.tsx` |
| 5 | Cascata di Patrimonio | **vero**: ~10 `cardItem` con `staggerContainer` (80 ms) in `assets/page.tsx` | `app/dashboard/assets/page.tsx:672–891` |
| 6 | Colori del Flusso | **vero**: `COLORS`, `TYPE_COLORS` e i due nodi in esadecimale Tailwind, `enableLinkGradient: true` a 1280/1440 | `lib/utils/cashflowSankey.ts:67–88`, `components/cashflow/CashflowSankeyChart.tsx:124,133` |
| 7 | Cifre coi centesimi | **vero** (il trio mostra `cachedFormatCurrencyEUR` pieno; D-AS31 euro interi vale solo per la striscia/tile compatti) | `components/cashflow/tiles/CashflowKpiTrio.tsx:11,94–110` |
| 8 | Riscontro al tocco | da rimisurare: `Button` non ha `active:`; sotto `components/ui` solo sidebar, period-picker, tile, ranked-rows, page-rest, verdict-strip, page-verdict lo hanno | `components/ui/button.tsx` |
| 9 | Uscite | **vero**: `dialog.tsx` `duration-200` per entrata e uscita, `sheet.tsx` 500 ms dentro e 300 ms fuori (la review diceva 500/500: oggi la chiusura è già 300), popover/menu a default di libreria | `components/ui/{dialog,sheet,popover,dropdown-menu,responsive-modal}.tsx` |
| 10 | Il «+» | **vero**: molla 520/30 con `scale 0.5→1`, `FAB_MOTION`; il bottone sta in `BottomNavigation` (visibile solo con la pillola) | `components/layout/BottomNavigation.tsx:32–70` |
| 11 | «(+2,5%)» orfano | **vero** per costruzione: il chip mette crescita e percentuale in due nodi senza `whitespace-nowrap` | `components/history/tiles/EvoluzioneTile.tsx:270–295` |
| 12 | Riga che ripete la categoria | **vero** nel feed compatto: titolo = nota oppure categoria, sottotitolo = categoria · sottocategoria; senza nota e senza sottocategoria i due dicono lo stesso. (La riga citata dalla review, `TransactionFeed.tsx:172`, è il modale di dettaglio e non ripete.) | `components/cashflow/CompactExpenseRow.tsx:55–59`; lo stesso difetto in Storico (N9) |
| 13 | Selettori a 390 | **da rimisurare** (census a 390: periodo di Analisi su due righe; sesta icona della barra FIRE) | `AnalisiPeriodControls.tsx`, barra FIRE |
| 14 | «Dettaglio» di Dividendi | **vero**: scheda col bordo (`rounded-xl border px-4 py-3`), altrove riga piatta | `components/dividends/DividendiDettaglio.tsx:69` |
| 15 | Cestini | **in parte fatto**: Strumenti è chiuso da RU6 (§ 5.9 del dossier riordino: grigio a riposo, rosso al passaggio). **Restano**: Pagamenti (`DividendTable.tsx:303` rosso a riposo) e ogni altro cestino a riposo | `components/dividends/DividendTable.tsx`, `AssetRow` (telefono: bottone «Elimina» contorno rosso, scelto da D-CA*, non toccare) |
| 16 | Pulizia | **vero**: `hover:bg-muted/{30,40,50,60}` = 4 trasparenze (27+10+7+4 usi); due anelli di focus (`ring-2 ring-ring` e `ring-[3px] ring-ring/50`); `multi-select.tsx` ha `wiggle`, `scaleIn`, `slideInDown`, `flipIn` | vari |

Già coperti altrove e fuori da questo dossier: N1 (RU4), N2 (RU5), N3 (RU6), N4 (RU0), N15 (RU1), la fascia desktop (fascicolo).

## 3. Obiettivo e perimetro

**Obiettivo.** Togliere dal movimento e dalla superficie i difetti che la review ha misurato, senza aggiungere decorazione:
ogni gesto o è un segnale che dice cosa è cambiato, o non c'è.

**Incluso.** I punti 1–16 (con 15 ridotto a ciò che resta), N5–N14, N16, N17. Test di guardia per ciò che si può
verificare con un assert; misure di census/budget dichiarate per ogni PR.

**Escluso.** Qualunque nuova animazione non elencata; vetro, blur, parallax, sollevamento al passaggio del mouse
(D-AN5); cambi di struttura delle pagine (è il riordino); la fascia desktop; Assistente, email, PDF (non guardati dalle
review); i punti «Cosa lascerei com'è» di entrambe le review.

## 4. Casi d'uso

1. Apro Panoramica, Patrimonio, Storico, Previdenza, Rendimenti: la cifra principale c'è già intera; se il dato fresco
   differisce, scivola dalla cifra vista (D-AN* § 5.7); se non c'è nulla da mostrare, lo scheletro.
2. Apro «Altro» sul telefono: il foglio sale con le voci al loro posto, e le leggo subito.
3. Cambio pagina sul telefono con la fascia colorata: la fascia resta, cambia il resto.
4. Tocco un pulsante o una riga che si apre: un gradino di colore dice che il tocco è arrivato.
5. Leggo Tracciamento a 390 e Analisi › Periodo a 1440: tre cifre, ciascuna col suo respiro.
6. Guardo il Flusso in Graphite o Lime Frost: i colori sono del tema, nessun viola dei dati.
7. Chiudo un modale: esce prima di come è entrato.

## 5. Specifiche per fase

Ogni proposta di interfaccia ha il suo «oggi / proposta» (WORKFLOW.md § 1 regola 8): per i punti 1–16 sono nella pagina
della review; **per N5–N14 non c'è uno schizzo** e va fatto prima della conferma di D-UM12–D-UM14 (punto aperto P1).

### 5.1 UM1 — Ingressi e uscite (punti 1, 2, 3, 5, 9, 10; Sonnet 5.5)

- **P1 · Cifra intera, mai da zero.** `OverviewAnimatedCurrency` e `HeroValue` di Rendimenti passano `landFirstValue: true`
  (nessun'altra riga di `useCountUp` cambia: `SettledFigure` lo ha già). Il primo valore compare intero; i successivi
  scivolano da quello a video in 600 ms (`FRESH_GLIDE_MS`, invariato). `onSettled` di `OverviewAnimatedCurrency` scatta quindi al
  primo render con un valore: lo conferma un test (oggi aspettava la fine del conteggio per montare i grafici,
  `requestIdleCallback` resta). Previdenza (`FondoOggiTile`) e Storico (cifra dello scrub: `fromPrevious` senza prima cifra a
  video) seguono. Un test fissa la regola di DESIGN.md: **nessun `useCountUp` con `fromPrevious` senza `landFirstValue` o
  `seed`** (guardia come `chartMotionGuard`). Valore di riferimento: da `null` a 2500 → 2500 al primo frame; da 2500 a 2600 →
  2550 a metà di 600 ms con ease-out-quart a `1 − (1 − 0,5)^4 = 0,9375` → `2500 + 100·0,9375 = 2593,75` (calcolato a mano).
- **P2 · «Altro».** `drawerContainer`/`drawerItem` tolti dal foglio: le voci sono nel foglio, che sale in 300 ms con la molla
  dell'app (`--ease-spring`); resta lo stagger solo se ≤ 4 voci (nessuna oggi). `motionVariants.ts` perde le due costanti se
  nessun altro le usa (test di import).
- **P3 · Tratto.** `vectorEffect="non-scaling-stroke"` e `strokeWidth={2}` sul path (la riga di hover l'ha già).
- **P5 · Patrimonio e Panoramica.** Via la cascata da **entrambe** (decisione del 22/11/2026, chiude P2): i `cardItem` perdono lo
  `staggerContainer` e le pagine entrano con la sola entrata di `template.tsx` (la Panoramica lo fa a colonne, RU2: la regola «una
  volta per sessione» di § 6.2 del dossier riordino cade e UM1 la corregge); la cifra non conta più (P1).
- **P9 · Uscite.** Una sola coppia di durate nei primitivi: modale/dialog 200 dentro, 130 fuori; popover e menu 150 dentro,
  100 fuori; foglio laterale/basso 500 dentro e 300 fuori (già così: invariato). Le curve: `ease-out-quart`
  dentro, `ease-in` fuori. `ResponsiveModal` tiene la regola del suo commento (non cambiare la durata mentre il modale vive:
  **la durata di uscita si fissa con la classe `data-[state=closed]:duration-[130ms]`, non con uno stato**). Prova obbligata:
  `e2e/modal.origin.spec.ts` (intermittente in run completa, CLAUDE.md § Known Issues; si legge due volte).
- **P10 · Il «+» — NON si fa (D-UM10 respinta il 22/11/2026): la molla con rimbalzo resta.** Proposta originale, per memoria: `FAB_MOTION`: opacità e `y: 12 → 0`, 220 ms, curva ease-out-quart (non più molla né `scale 0.5`);
  il segno non ruota; il bottone si monta solo dove la pillola si vede (`isAddExpenseFabShown` più la query `PILL_VISIBLE_QUERY`),
  così a 1440 non anima nascosto.
- **Chiusura**: `useCountUp` guard test, Vitest; E2E `motion.reduced`, `modal.origin`; `perf:census` desktop e `--mobile` sugli
  scenari toccati; `perf:budget`/`mobile:budget`: nessuna cifra nuova sul primo schermo.

### 5.2 UM2 — La fascia sul telefono (punto 4; Opus 5.5)

Oggi la scena morbida (`html[data-page-leaving] #page-main`) dissolve il contenitore che contiene anche la fascia.
Proposta: la fascia resta piena e **sfumano solo ciò che sta sopra e sotto**: titolo, azioni e foglio. Tecnica: l'attributo
colpisce `#page-main > *` meno `.top-band`, oppure la fascia esce dallo scroller (costo e rischio con `useSceneNavigation`,
`PageHeader` che cambia classe allo scorrimento dei primi 24 px). Tre varianti da provare, con sketch (P3): (a) selettore CSS
sul solo contenuto, (b) fascia spostata fuori da `#page-main`, (c) nulla (come oggi). **Solo la prova su un iPhone vero
decide** (Safari tratta `opacity` su un antenato sticky in modo diverso da Chromium: è il motivo di Opus per questa fase).
Vale solo sotto `band:`/sulla pillola; dal fascicolo non c'è nulla da fare (la fascia non si muove).

### 5.3 UM3 — Colori e cifre (punti 6, 7; N12, N14; Sonnet 5.5)

- **P6 · Flusso — SOSPESO (D-UM6, 22/11/2026, «per ora lasciamo così»): colori e nastri restano; non si implementa.** Proposta originale: `COLORS`, `TYPE_COLORS`, `BUDGET_NODE_COLOR`, `SAVINGS_NODE_COLOR` diventano ruoli del tema letti da
  `useChartColors` (nove slot, già «distinti» per `chartPaletteDistinctness.test.ts`): fisso/variabile/debito/entrate/
  trasferimento prendono slot dichiarati in `doc/guide/temi.md`, mai viola (DESIGN.md → No-Violet-Data); i nastri passano da
  sfumati a colore pieno al ~35% (`enableLinkGradient: false`, `linkOpacity`). Il Flusso a 50/30/20 (`spendingRoles`) segue. Il
  commento «intenzionalmente indipendenti dal tema» sopra `COLORS` va cancellato e sostituito.
- **P7 · Centesimi (decisione presa, proposta A).** Nel trio di Tracciamento (390) e in Analisi › Periodo (1440) i
  centesimi restano, più piccoli (`text-[0.6em]` come cifra dei decimali, `tabular-nums`, stessa linea di base); l'euro intero
  non cambia. `formatExactEuro` produce due parti (intero · centesimi) e il leaf le disegna; l'`aria-label` legge la cifra
  intera con i centesimi. Valore di riferimento: 1234,56 € → «1.234» + «,56 €» con il secondo pezzo piccolo.
- **N12 · Bear.** «vendi» **resta com'è** (viola, il colore di ruolo di Lime Frost; decisione 22/11/2026); solo lo scenario Bear passa
  all'ardesia (il grigio-blu del tema, non il viola; in Graphite lo è già, quindi il cambio è solo Lime Frost). Grep del viola in `components`/`lib` oggi: `costCenterColors.ts`, `dividendTypes.ts`, `benchmarks.ts`,
  `colors.ts`, `CategoryManagementDialog.tsx` sono scelte dei dati dell'utente o palette selezionabili e **non** si toccano;
  la fase tocca solo i punti dove il viola è un ruolo (vendite, scenario Bear).
- **N14 · Maiuscole e decimali.** Solo un audit scritto (quali pulsanti, schede e voci di Impostazioni sono in maiuscolo o
  hanno decimali diversi) e una regola in AGENTS.md; la correzione dove il costo è minimo. Punto aperto P4.
- Chiusura: contrasto dei ruoli in due temi chiari e due scuri (`chartPaletteDistinctness`, Playwright su Analisi), census.

### 5.3a UM3 — Audit N14 (maiuscole e decimali, 2026-11-22)

Cercato su `components`, `app`, `lib/constants` (i PDF e le email hanno i loro token e restano fuori).

**Maiuscole.** La regola c'è già (DESIGN.md → The Sentence-Case-Label Rule: nessuna etichetta in maiuscolo o spaziata). Su `main` restano **due** `uppercase`:
`AssistantThreadList.tsx:120` (il badge della modalità del thread) e `AssetDeleteDialog.tsx:68` (il titolo di sezione del dialog, `uppercase tracking-wide`:
contro la regola, difetto). Le schede e le voci di Impostazioni sono tutte in maiuscola iniziale singola (Allocazione, Preferenze, Spese, Dividendi, Simulazioni,
Condivisione, Aspetto), come le schede FIRE; i nomi propri a più parole maiuscole (Lime Frost, Coast FIRE, What If, Portfolio Tracker, Stati Uniti,
Bloomberg Aggregate Bond) sono nomi, non difetti. Unico titolo con la seconda parola maiuscola senza essere un nome: «Dati Patrimonio» in
`CreateDummySnapshotModal.tsx` (modale di prova, non in produzione).

**Decimali.** In Impostazioni: la percentuale dei tile usa `pctLabel` (0 decimali se intera, 1 altrimenti), il tile Monte Carlo mostra 2 decimali per volatilità e
correlazioni (`formatTwo`, `fmt2`), 1 per la media e 1–2 per lo spread della leva; il segnaposto del tasso privo di rischio (`AllocazioneTab.tsx:210`)
usava il **punto** (`toFixed(2)`: «3.25» in una UI italiana, difetto). Le altre differenze (1 contro 2 decimali) seguono la grandezza del dato (una media
contro una correlazione) e non sono difetti.

**Corretti qui (costo minimo):** il segnaposto con la virgola e «Dati patrimonio». **Non toccati:** il badge dell'assistente (sigla) e i decimali dei tile Monte Carlo.
**Regola (confermata da Giorgio il 22/11/2026, ora in AGENTS.md § Italian Localization; il titolo di `AssetDeleteDialog` è in frase, il badge dell'assistente resta una sigla):** «Un'etichetta, un pulsante, una scheda è in maiuscola iniziale singola; il maiuscolo pieno è solo
una sigla (ETF, PAC, EUR); un numero decimale usa la virgola e i decimali di una percentuale seguono il dato (0 se intero, 1 altrimenti; 2 per un
parametro di mercato)».

### 5.4 UM4 — Testi, righe e selettori (punti 8, 11–16; Sonnet 5.5)

- **P8 · Riscontro al tocco.** Uno stato `active:` di solo colore, 100 ms, su `Button` (tutte le varianti) e sulle righe che
  si aprono (`TileRowShell`, `RankedRows`): `active:bg-…` un gradino sotto l'hover. Niente `scale`, niente onde. È l'unico punto
  con rischio di slop: la regola è scritta in DESIGN.md come «un gradino di colore, mai di forma».
- **P11 · Storico a 390.** Il chip tiene insieme `(+2,5%)` con la cifra (`whitespace-nowrap` sul gruppo) e «ultimi 12 mesi»
  non si spezza (`caption` con `whitespace-nowrap`; a 390 il chip va a capo intero, mai a metà).
- **P12 · Riga senza nota.** In `CompactExpenseRow` (e nel feed di Movimenti, ex `TransactionFeed`) il sottotitolo diventa
  sottocategoria, altrimenti il conto, altrimenti niente; **la categoria non è mai in entrambe le righe**. N9 (Storico ›
  Valore per strumento: conti col nome due volte) è la stessa regola: seconda riga «conto» o vuota; Quantità con il trattino.
  Test: `rowSubtitle(expense)` pura in `lib/utils`.
- **P13 · Selettori a 390.** Rimisurare al census; se confermato, il periodo di Analisi su una riga (il campo del mese e le
  frecce, le pillole in scorrimento) e la barra FIRE con la sesta icona raggiungibile (scorrimento con indizio, o cinque + «⋯»).
- **P14 · «Dettaglio» in Dividendi.** Riga piatta come altrove (`DettaglioDisclosure`, l'altro disclosure dell'app).
- **P15 · Cestini rimasti.** Pagamenti (`DividendTable`): grigio a riposo, rosso al passaggio e al fuoco, armato com'è.
  Stesso primitivo di RU6 (`group`, `group-hover:text-destructive`); se serve un terzo posto, si estrae `RestingBin`.
- **P16 · Pulizia.** Un solo passaggio del mouse sulle righe (`hover:bg-muted/40`), un solo anello di focus
  (`focus-visible:ring-2 ring-ring ring-offset-2`) anche su `Button`, `Input` e `Select`, che avevano l'alone morbido
  `ring-[3px] ring-ring/50` (deciso il 22/11/2026 sullo schizzo https://claude.ai/artifact/9w9XkckYs4PGZLtTcpQEgq: sulla
  fascia l'alone al 50% non si vedeva); tolte da `multi-select.tsx` le animazioni mai usate (`wiggle`, `flipIn`, `slideInDown`,
  `scaleIn`). Un test elenca i `hover:bg-muted/*` ammessi. *Tolte il 22/11/2026* (troppo vaghe per un riferimento nel codice):
  «didascalie del tile Cashflow a due righe» e «durate scritte a mano → token».

### 5.5 UM5 — Il seguito desktop (N5–N11, N13, N16, N17; Sonnet 5.5, due PR)

Riletto contro i dossier già su main: RU3 ha già toccato `ExpenseTrackingTab` e Movimenti, quindi **N6 si rilegge sul codice
di `acdb254`** (la lista di Movimenti scorre dentro il tile, a ~960 px) prima di toccarlo.

**UM5a — Allocazione e Patrimonio**: **N5** Accumulo: contorno sulle righe «Registra», pieno solo sulla prima da fare nel mese
(`isFirstDue`), «Ricalcola» e «Applica» come secondari; **N8** la frase del Piano, oltre tre ordini, dice i totali e l'ordine
maggiore, non l'elenco (`describePlanSentence`, tre casi: ≤ 3, 4–9, ≥ 10); **N7** estendere D-AS10 ai tile con meno di tre
righe (Patrimonio, Analisi, Budget, Rendimenti): `empty reading + dato di riferimento`, lo stato vuoto e «nulla registrato»
restano distinti (DESIGN → The Absence-Has-Three-Names Rule).
**UM5b — Cashflow, Storico, Analisi**: **N6** feed e Versamenti a larghezza massima (`max-w-[720px]`), centrati nel tile; il
passaggio a «Tabella» da desktop come vista iniziale resta alternativa; **N9** vedi P12; **N10** in Analisi, «Spese maggiori»
una ricorrenza per riga (raggruppa per `recurrenceId`/serie, mostra il numero); **N11** la Composizione di Storico: **toni nuovi più bassi, curve morbide come oggi** (niente aree a
scalini: decisione 22/11/2026; non tocca D-AS7); **N13** un solo selettore (la pillola segmentata `SegmentedPill`) al posto delle tre
forme in Panoramica, Storico, Allocazione, Rendimenti; **N16** Dividendi vuoto: un solo pulsante per azione;
**N17** a 2560 il menu e il contenuto: `PageContainer` ha `max-w-[1920px] mx-auto`; la fascia (`ShellBand`) si centra sullo
stesso asse (se il fascicolo non l'ha già fatto: da misurare a 2560).

## 6. Interfaccia

- **Accessibilità.** Ogni movimento è in `motion-safe:` o sotto `MotionConfig`/`useChartMotion` (D-AN4, D-AN9); `P8` è solo
  colore; il «+» e il foglio hanno la versione `FAB_MOTION_REDUCED`. Nessun target sotto 44 px sul tocco (P8, P10, P13).
- **Movimento.** Durate e curve di `doc/animazioni/README.md` § 6, più: modale 200/130, menu 150/100, «+» 220, foglio 300 in
  chiusura. Una sola tecnica per forma (D-AN9).
- **Composizione mobile.** `mobile:census`/`mobile:budget`: nessuna riga nuova; UM3 (P7) e UM4 (P11, P13) toccano il primo
  schermo di Tracciamento e Storico: ogni PR dichiara le voci e le chiude una sola rimisura finale sul Mac (non toccare i file
  dei budget da questo dossier).

## 7. Piano e ordine

| Fase | Punti | Modello | Prima di | Chiude con |
| --- | --- | --- | --- | --- |
| **UM1** | 1, 2, 3, 5, 9, 10 | Sonnet 5.5 | nessuna | guardia di `useCountUp`, `tsc`, lint, Vitest; E2E `motion.reduced`, `modal.origin`, Panoramica/Patrimonio; `perf:census` |
| **UM2** | 4 | **Opus 5.5** | UM1 (stessi file della scena) | prova su iPhone vero; E2E di `mobile` della navigazione; census del telefono |
| **UM3** | 7, N12 (solo Bear), N14 | Sonnet 5.5 | indipendente | `chartPaletteDistinctness`, E2E Analisi, contrasto nei quattro temi, census |
| **UM4** | 8, 11–16 | Sonnet 5.5 | UM1 (`button.tsx`, durate) | E2E dei selettori a 390, `mobile:census` |
| **UM5a / UM5b** | N5, N7, N8 / N6, N9–N11, N13, N16, N17 | Sonnet 5.5 | UM4; UM5b dopo RU3 (già su main) | E2E delle pagine toccate sul Mac, census desktop |

Ordine: **UM1 → UM3 → UM4 → UM2 → UM5a → UM5b**. UM1 e UM3 non toccano gli stessi file e possono andare in parallelo se
Giorgio lo chiede; UM2 sta per ultima del telefono perché richiede l'iPhone. Nessun thread su `app/globals.css` e
`BottomNavigation.tsx` in parallelo con il fascicolo (R2 di RU2 è in main).

## 8. Decisioni (da confermare)

- **D-UM1 — La cifra non conta mai da zero.** Primo valore intero (`landFirstValue`), poi scivola. *Scartato*: tenere il
  conteggio alla prima visita della sessione (la review lo chiama il gesto più riconoscibile delle dashboard fatte in serie e
  mostra cifre false mentre il dato ancora non c'è). *Motivo*: DESIGN.md → The Net Worth Counter lo prescrive già.
- **D-UM2 — «Altro» senza stagger.** *Scartato*: stagger ridotto a 20 ms (il costo resta, il guadagno è nullo con 11 righe).
- **D-UM3 — Tratto della curva `non-scaling-stroke` a 2 px.** *Scartato*: ricalcolare il path alla larghezza reale (costo e
  nessun vantaggio).
- **D-UM4 — La fascia del telefono non sfuma, il resto sì (UM2). Presa il 22/11/2026 con la variante (a), selettore CSS sul solo contenuto, dopo la prova su iPhone.** *Scartato*:
  lasciare la dissolvenza (è la fascia che «si accende» a ogni navigazione, l'opposto di una fascia).
- **D-UM5 — Patrimonio e Panoramica entrano come le altre pagine (via la cascata da entrambe, 22/11/2026).** *Scartato*: la cascata ovunque (D-AN5).
- **D-UM6 — SOSPESA (22/11/2026, «per ora lasciamo così»).** Proposta: colori del Flusso del tema, nastri pieni al 35%.** *Scartato*: tenere i colori fissi di Tailwind come
  «semantici» (nei temi scuri e in Graphite non reggono il floor di distinzione).
- **D-UM7 — Centesimi più piccoli.** **Presa da Giorgio il 14/11/2026.** *Scartato*: euro interi come D-AS31 (cambia il
  valore mostrato nel trio, che deve restare esatto).
- **D-UM8 — Riscontro al tocco: un gradino di colore su `Button` e righe, 100 ms.** *Scartato*: rimpicciolire al tocco (slop).
- **D-UM9 — Uscite: modale 200/130, menu 150/100, foglio 300.** *Scartato*: tutti a 200 (le uscite lunghe fanno apparire
  l'app lenta, e `modal.origin.spec.ts` campiona proprio la chiusura).
- **D-UM10 — RESPINTA (22/11/2026): il «+» tiene la molla e il rimbalzo.** Proposta: il «+» a 220 ms, senza rotazione né rimbalzo, montato solo con la pillola.** *Scartato*: tenere la molla
  (il rimbalzo del 6% è l'unico della shell).
- **D-UM11 — Le righe non ripetono mai la categoria; seconda riga = sottocategoria, poi conto, poi niente.** *Scartato*:
  nascondere il titolo quando coincide (cambia l'altezza delle righe).
- **D-UM12 — N5: contorno sulle righe, pieno solo sulla prima da fare.** *Scartato*: un solo «Registra tutto» (scrive più
  operazioni in un gesto: il PAC propone e mai scrive da solo).
- **D-UM13 — N6: larghezza massima del feed.** *Scartato*: «Tabella» come vista iniziale su desktop (nasconde la lista).
- **D-UM14 — N12/N14: Bear in ardesia, «vendi» resta viola (22/11/2026); N14 solo audit più regola.** *Scartato*: unificare le maiuscole con
  un cambio globale (tocca ogni etichetta e i test che le cercano).

## 9. Punti aperti

- **P1.** CHIUSO il 22/11/2026: schizzi fatti e decisioni confermate (vedi testata). Originale: gli schizzi «oggi / proposta» di N5–N14 non esistono (la review desktop non li ha): servono prima della conferma
  di D-UM12–D-UM14 (WORKFLOW.md § 1 regola 8). Proposto: una pagina pubblicata sola per UM5.
- **P2.** CHIUSO il 22/11/2026: via la cascata da Panoramica e Patrimonio.
- **P3.** CHIUSO il 22/11/2026: (a) provata su iPhone vero in produzione dietro `?fascia=a` (l'anteprima non ha l'account) e scelta; (c) era il video dell'«oggi».
- **P4.** CHIUSO il 22/11/2026 (regola in AGENTS.md). Originale: N14: quali maiuscole e decimali sono «difetto» e quali scelta — l'audit lo dice, la regola la sceglie Giorgio.
- **P5.** Misure da riprendere sul Mac: 8, 13, N17 (a 2560), il census dei selettori a 390.

## 10. Criteri di accettazione

Valori di riferimento calcolati a mano, con cifre inventate e rotonde (WORKFLOW.md § 1 regola 7):

1. `useCountUp(2500, { fromPrevious: true, landFirstValue: true })` al primo render restituisce 2500, mai 0; con il target che
   passa a 2600 il valore a metà dei 600 ms è `2500 + 100 · (1 − 0,5⁴) = 2593,75`. Un test fallisce se un `fromPrevious`
   non ha `landFirstValue` né `seed`.
2. Il path di `NetWorthSparkline` ha `vector-effect: non-scaling-stroke` e larghezza calcolata 2 px a 390 e a 1440.
3. Il Flusso non contiene esadecimali Tailwind (`#3b82f6`, `#8b5cf6`, `#f59e0b`, `#10b981`) in `cashflowSankey.ts`;
   `chartPaletteDistinctness` verde per i sedici blocchi.
4. 1234,56 € nel trio si legge «1.234,56 €» (aria) e si disegna in due pezzi, il secondo al 60% del corpo.
5. `rowSubtitle` di una spesa «Alimentari» senza nota né sottocategoria né conto è vuoto; con sottocategoria «Spesa»: «Spesa».
6. Una chiusura di modale dura 130 ms ±20 (campionata da `modal.origin`), un'apertura 200 ms ±20.
7. Dopo UM2, su iPhone vero il colore della fascia non scende sotto opacità 1 durante una navigazione (video di 5 secondi).
8. Nessuna `perf:budget` oltre il ceiling; `mobile:budget` invariato salvo dichiarazioni di UM3/UM4 nella PR.
