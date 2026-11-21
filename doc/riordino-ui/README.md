# Riordino della UI, ondata 1 (dossier)

> Card Todoist «F13 FEAT riordino UI ondata 1 + grafici FIRE (N1) e tabella Strumenti (N3)» (label `epic-review-fable`).
> Fonti: review «Riordino della UI e modalità basic» (Fable, 2026-11-12; Library `riordino-ui/`, pagina
> https://claude.ai/artifact/1YV1mnG77bMMUHXcSwED3S) e review «UI desktop con i dati veri» (Library `review-ui-desktop.md`,
> pagina https://claude.ai/artifact/RUddPCN1hWqBNy4tSTYx43). Gli schizzi «oggi / proposta» (WORKFLOW.md regola 8) di R1–R10 sono
> nella prima pagina. I render reali «oggi / proposta» di questa ondata (app sugli emulatori, dati del census) sono nella pagina
> https://claude.ai/artifact/M6bf52DueZx6WaL4JYv4PB. **Stato: specifica scritta il 2026-11-19, rivista il 2026-11-20 contro la
> review di Fable, il codice e i render (§ 1.1); le decisioni D-RU1…D-RU12 sono PRESE il 2026-11-20, riallineate al fascicolo (`doc/fascia-desktop/README.md`)** (§ 8). Già prese da Giorgio il 2026-11-14: N2 tono neutro, N4 «1280 è servito come desktop», la fascia sul desktop non è di
> questo dossier.
>
> **Stato al 2026-11-21 (main `456db1b`)**: in main RU0 (N4, PR #194), RU1 (P1–P3, parole, `navGroups`, PR #195), il fascicolo
> (PR #196, poi la seconda versione #197–#199, `doc/fascia-desktop/README.md`) e RU2 (Panoramica a due colonne, PR #200).
> Restano RU3 (R5 + R6), RU4 (N1), RU5 (N2) e RU6 (N3). § 5.7 (N1) e § 5.9 (N3) sono riletti contro main il 2026-11-21
> (§ 1.2): D-RU13 e D-RU14 aggiornano la specifica al fascicolo.

## 1. In breve

L'ondata 1 non toglie e non aggiunge tile: cambia **parole, posti e ordine**. Cinque cose dalla review del riordino (tre regole in
DESIGN.md, parole, menu, Panoramica a due colonne, Tracciamento con Movimenti accanto alle categorie, Budget con la matita
sul tile) e tre dalla review desktop (N1 grafici FIRE, N2 tono del verdetto, N3 tabella Strumenti), più N4 (1280 come
desktop) che tocca ogni pagina e per questo va in una PR a sé, per prima (D-RU1). Ogni punto è una task piccola e
separata (§ 7); nessuna legge o scrive dati nuovi.

### 1.1 Revisione del 2026-11-20

Riletta contro la review di Fable e contro l'app in esecuzione. Cosa è cambiato rispetto alla prima stesura, e perché:

- **R3**: Asset principali non scende sotto 4 colonne (a 3 i nomi diventano una lettera); Composizione e Sintesi a 3, Traguardo
  a 4. Tabella delle classi per ogni variante (§ 5.4). Intestatari chiusa a desktop con un `collapse` locale (§ 5.4).
- **R5**: classi esatte per mese, altri periodi e Tabella; la barra degli strumenti di Movimenti resta ferma e scorre solo la
  lista (`scrollBody`). Movimenti comincia a ~960 px, non a 760 come stimato: il criterio è `top` < 1000.
- **R6**: il modale lavora su una bozza con Annulla · Salva (oggi il tetto si salva da solo mentre si scrive); uno stato senza
  tetto con «Imposta il tetto» (oggi la cella è vuota); l'ingranaggio come lo voleva Fable: «Categorie» su Tracciamento, le
  impostazioni dei dividendi su Dividendi, niente altrove (la prima stesura lo lasciava su tre schede puntato alla scheda
  sbagliata); il tile Avvisi rimanda all'email settimanale come chiedeva Fable.
- **N1**: il tetto contiene sempre la banda 25–75 e il massimo della mediana **su tutto l'orizzonte** (la prima stesura usava
  l'ultimo anno, che in Dopo il FIRE taglierebbe la curva); tacche date a mano (il prototipo senza mostrava «650k» e «1,3 Mln»).
- **N3**: `formatPrice` nuova invece di cambiare `formatCurrency`; quattro posti fissi per le azioni; Nome a 200 px sotto 1440
  perché con N4 a 1280 la tabella scorre di 41 px.
- **N4**: lo spike è fatto e il meccanismo 1 funziona, con tre condizioni scritte in § 5.10 (una media query con `or`,
  `tablet-landscape` che esclude il desktop, riavvio del server di sviluppo).
- **R1**: aggiunto «N asset in portafoglio» del tile Patrimonio della Panoramica.
- **Scarti da Fable che restano**: il verdetto della Panoramica a desktop non si taglia (D-RU11); «Carica altri» invece di
  «Mostra tutti» (D-RU6); Traguardi e Hall of Fame non cambiano posto nel menu (D-RU4, come nell'ordine delle ondate di Fable).

### 1.2 Rilettura di N1 e N3 del 2026-11-21 (main `456db1b`)

N1 e N3 sono le due task della review desktop che possono partire subito (indipendenti da RU3 e fra loro). Riletti contro il
codice di main dopo RU0–RU2 e il fascicolo:

- **N1** (§ 5.7): i cinque grafici sono ancora quelli e con le stesse serie; l'asse Y è ancora automatico (larghezze 70, 80/100,
  70/100, 64, 80 px). Una sola lacuna: `MonteCarloFanChart` ha, oltre alla serie `reference` (numero FIRE anno per anno), una
  `referenceLine` a valore fisso (la soglia scritta a mano in Proiezione), che la tabella non nominava: entra in `core` (D-RU13).
- **N3** (§ 5.9): `StrumentiTile` e `AssetRow` sono come li descrive § 2 (4 decimali fissi, sei pulsanti, cestino rosso).
  Cambia la larghezza: da `band:` la Sidebar non c'è più (la fascia sta sopra `<main>`), quindi a 1280 col mouse il contenuto
  non è più 1024 px ma circa 1180 px utili nel tile, contro i 1023 che la tabella chiede con la proposta. La regola «Nome a
  200 px sotto 1440» non serve più e taglierebbe nomi senza motivo: cade, e resta come rimedio solo se la misura la smentisce (D-RU14).

## 2. Stato di partenza (letto nel codice, main `39de591`)

- **Panoramica** (`app/dashboard/page.tsx`): griglia a 12 colonne, un solo ordine nel DOM = ordine di lettura a ogni larghezza
  (The First-Screen Rule): Patrimonio totale (5, due righe) · Sintesi 3 · Cashflow 4 · Composizione 3 · Costi (2, solo con TER
  o bollo) · Obiettivo (2, solo con traguardi; 4 se è solo) · Spese per categoria 4 · Entrate per categoria 4 · Asset principali 4
  (12 senza spese) · Intestatari 12 (solo con due membri). Le righe sotto `desktop:` sono `OVERVIEW_SECTIONS`.
- **Tracciamento** (`components/cashflow/ExpenseTrackingTab.tsx` r. 1303–1420): Cashflow del periodo 5 (due righe) · Spese 4 ·
  Entrate 3 · Andamento del mese 7 (solo con un mese) · Risparmio nel tempo 7 (12 con Andamento) · Movimenti 12, in fondo.
  Movimenti ha due viste a desktop, Feed e Tabella (`desktopListView`, ricordata); il Feed pagina con «Carica altri 20» e
  «N di M voci» (`TransactionFeed`); la Tabella (`components/expenses/ExpenseTable.tsx`) ha colonne con larghezze fisse (Data 110, Tipo 120, Importo 120, Azioni 100…).
- **Budget** (`components/cashflow/BudgetTab.tsx`): il tetto e gli avvisi si cambiano in «Impostazioni», una disclosure in fondo
  (`BudgetImpostazioni`, due tile: «Tetto complessivo mensile» e «Avvisi soglia», salvataggio a bozza `budget.*`, aperta solo se
  non c'è un tetto); sotto `desktop:` un pulsante a sliders scorre fin lì. In testata di Cashflow l'ingranaggio
  «Impostazioni Spese» compare su **tutte** le schede e porta sempre a `/dashboard/settings?tab=spese`.
- **Menu** (`lib/constants/navigation.ts`): `primaryNav` (Panoramica · Patrimonio · Cashflow), `analysisNav` (Analisi ·
  Rendimenti · Storico · Hall of Fame), `planningNav` (Allocazione · FIRE e Simulazioni · Previdenza), `assistantNavItem`;
  letti da `Sidebar`, `SecondaryMenuDrawer`, `TabletRail`, `BottomNavigation` (pillola: primaryNav + «Altro») e
  `app/dashboard/pension/page.tsx`. Impostazioni è nel menu utente della Sidebar e del drawer, e visibile nella `TabletRail`.
- **Parole**: il titolo della pagina Patrimonio è «Strumenti e conti» (3 punti in `app/dashboard/assets/page.tsx`); il suo
  verdetto dice «portafoglio» (7 frasi in `lib/utils/patrimonioNarrative.ts`, `ariaLabel` «Verdetto del portafoglio»); il tile
  `RendimentoTile` di Patrimonio si chiama «Rendimento»; il tile `PianoTile` di Bilanciamento «Piano»; la voce di menu «Analisi».
  «Traguardo» è, nel Calcolatore e in Coast, il tile del numero FIRE (`TraguardoTile`, `CoastTraguardoTile`, ~60 occorrenze nei
  componenti e in 5 file di `lib/utils`), mentre gli obiettivi di spesa si chiamano «Traguardi» (i due nomi si scontrano: è la diagnosi).
- **Grafici FIRE**: sei grafici hanno l'asse Y automatico: `FIREProjectionChart` (Calcolatore › Scenari), `FireFanChart`
  (Calcolatore › Ventaglio), `CoastFireProjectionChart`, `MonteCarloFanChart` (Dopo il FIRE e Proiezione),
  `WhatIfProjectionChart`. Solo la deplezione fissa il minimo (`domain [0, 'auto']`). Le etichette sono
  `formatCurrencyCompact` («1,5 Mln €»: lo spazio tra numero e «Mln» è normale, quello prima di «€» è non separabile) in una
  `YAxis` di larghezza fissa (64, 70, 80 o 100 px): con meno spazio del testo Recharts va a capo.
- **Verdetti** con la stessa regola scritta: `lib/utils/cashflowNarrative.ts` giudica ciò che È ACCADUTO (`settleTotals`; dal
  2026-09-14, perché uno stipendio datato il 15 faceva «andare bene» il 14) e dà `negative` con tasso < 0; `overviewNarrative.ts`
  dà `warning` con «cresce, ma le spese superano le entrate» quando il tasso vissuto è < 0 o le spese superano le entrate in euro.
- **Strumenti** (`components/assets/StrumentiTile.tsx`): nove colonne con le colonne prezzo (Nome · Classe · Quantità · Prezzo ·
  PMC · TER · Valore · Peso · G/P) più l'azione sticky; Prezzo e PMC a 4 decimali fissi (`formatCurrency(x, cur, 4)`: «25,0000 €»);
  fino a sei pulsanti icona per riga (Calcola plusvalenze, Registra operazione, Movimenti, Fondo pensione, Modifica, Elimina con
  armatura in riga); il cestino è rosso a riposo. `AssetRow` (telefono) usa gli stessi 4 decimali.
- **Larghezza**: `--breakpoint-desktop: 1440px` (`app/globals.css`), 1296 classi `desktop:` e 119 `max-desktop:` in 234 file,
  più le query a mano: `COMPACT_QUERY` (`lib/hooks/useCompactLayout.ts`), `PILL_VISIBLE_QUERY`, `components/ui/sidebar.tsx`
  (`max-width: 1439px`), `VersamentiTile` (`DESKTOP_QUERY`), `FlussoTile` (`SANKEY_DRAWN_QUERY`), la variante
  `tablet-landscape` (1000–1439 in orizzontale). A 1280 con il mouse si vede la composizione da tablet orizzontale.

## 3. Obiettivo e perimetro

**Obiettivo**: far trovare le cose dove si cerca (P1), le regolazioni dove si guarda l'oggetto (P2), il lavoro frequente in
alto (P3), con le stesse parole per le stesse cose; e togliere i quattro difetti desktop che danneggiano le stesse pagine.

**Incluso**
- P1–P3 scritte in DESIGN.md prima di spostare qualcosa (RU1).
- R1 parole (§ 5.2); R2 menu per oggetto, solo ordine e nomi (§ 5.3).
- R3 Panoramica a due colonne (§ 5.4); R5 Tracciamento (§ 5.5); R6 Budget (§ 5.6).
- N1 asse dei grafici FIRE (§ 5.7); N2 tono neutro (§ 5.8); N3 tabella Strumenti (§ 5.9); N4 1280 come desktop (§ 5.10).

**Escluso**
- R4 Patrimonio, R8 Allocazione, R10 Impostazioni (ondata 2); R9 FIRE in tre schede, R7 calendario, Traguardi e Hall of Fame
  nel menu (ondata 3): il menu dell'ondata 1 non li sposta (D-RU4).
- La riga fissa «Portafoglio X su Y di patrimonio» in testa ad Allocazione e FIRE (va con la striscia di R8, ondata 2: D-RU3).
- Il taglio del verdetto a desktop dietro «Dettagli» (punto aperto § 9).
- La fascia in alto sul desktop (la tratta Giorgio in una sua sessione).
- La modalità Essenziale (card F17, dopo le ondate).
- Email e PDF: i loro testi non cambiano; `describe*` condivisi si toccano solo dove § 5 lo dice, e i test dei consumatori restano verdi.

## 4. Casi d'uso

1. **Apro la Panoramica a 1440.** A sinistra «Quanto ho»: patrimonio, composizione, asset principali, sintesi, traguardo; a
   destra «Come va il mese»: cashflow, spese e entrate per categoria. Le categorie di spesa sono nella prima schermata.
2. **Cerco una spesa.** In Tracciamento (feed) leggo le voci a sinistra e, a destra, le categorie in cui pesano; con «Tabella»
   le voci tornano a tutta larghezza e le categorie scendono sotto.
3. **Cambio il tetto del budget.** Tocco la matita sul tile «Tetto del mese»: si apre un pannello con tetto e avvisi; non scorro
   più fino a una riga in fondo.
4. **A metà mese, stipendio il 27.** Il verdetto dice che finora ho speso più di quanto è entrato, **senza rosso né ambra**,
   perché le entrate in calendario coprono la differenza.
5. **Guardo la Proiezione.** Il grafico mostra la mediana e il numero FIRE a metà altezza; il 90° percentile esce dal bordo con
   la nota «esce dal grafico: a fine orizzonte arriva a 9,0 Mln €».
6. **Apro Patrimonio a 1440.** La tabella Strumenti si legge intera, l'ultima colonna è visibile e i prezzi non portano zeri inutili.
7. **Apro l'app su un portatile a 1280 con il mouse.** Vedo il desktop (sidebar, griglia a 12 colonne), non la composizione da tablet.

## 5. Regole

### 5.1 Tre regole da scrivere in DESIGN.md (P1–P3, task RU1)

Testi in `DESIGN.md` § 2 *Named Rules* (accanto alle altre), nella stessa PR delle parole e prima di ogni spostamento. Il
testo della review, qui sono i titoli:
- **The Home-Page Rule (P1).** Ogni informazione ha una pagina che è casa sua; altrove solo come riassunto: al massimo la metà
  delle righe, nessun controllo, il rimando a casa.
- **The Adjust-Where-You-Look Rule (P2).** Ciò che regola un oggetto di una pagina si cambia su quella pagina, con una matita sul
  tile che lo mostra (un `ResponsiveModal`, The Modal-Is-A-Tile Rule); in Impostazioni solo ciò che riguarda l'account o più
  pagine; un ingranaggio in pagina apre le regolazioni di quella pagina e nient'altro.
- **The Frequent-First Rule (P3).** Verdetto, poi il lavoro più frequente, poi il contesto, poi l'approfondimento chiuso; i tile
  dello stesso tema stanno vicini. Si applica con `desktop:col-start-*`/`row-start-*`, mai con `order` (The First-Screen Rule:
  il DOM è l'ordine di lettura a ogni larghezza).

Un'unica riga in AGENTS.md § 3 (stub) e una in CLAUDE.md. Nessun test.

### 5.2 R1 · Le parole (task RU1)

Solo testo visibile; identificatori, id di sezione, campi salvati, chiavi di cache e nomi dei componenti **non** cambiano
(come per «Traguardi» e «Criteri del modello» in AL5).

| Oggi | Dopo | Dove |
|---|---|---|
| Titolo «Strumenti e conti» | «Patrimonio» (come il menu, N15) | `app/dashboard/assets/page.tsx` (3 punti) |
| «Il portafoglio vale / cresce / è in calo / è al massimo storico», «Il tuo portafoglio a …»; `ariaLabel` «Verdetto del portafoglio» | «Il patrimonio …» / «Verdetto del patrimonio» | `lib/utils/patrimonioNarrative.ts` (7 frasi), `assets/page.tsx` |
| Tile «Rendimento» di Patrimonio | «Guadagno sul costo» (la riga «G/P non realizzato» resta) | `components/assets/tiles/RendimentoTile.tsx` (eyebrow e `aria-label`); **non** il tile «Rendimento» di Previdenza |
| Tile «Piano» di Bilanciamento e le frasi che lo nominano («questo Piano non lo conta», AL17) | «Ordini» | `components/allocation/tiles/PianoTile.tsx`, `lib/utils/allocazioneNarrative.ts`; «piano di accumulo» resta |
| «Traguardo» nel Calcolatore e in Coast (il tile del numero FIRE) | «Verso il FIRE» | `TraguardoTile`, `CoastTraguardoTile`, `FireCalculatorTab`, `CoastFireTab`, `fireNarrative`, `coastFireView`, `fireSummary`, `overviewNarrative` (1 occ.); «Traguardi» (gli obiettivi di spesa) resta |
| Voce di menu «Analisi» | «Analisi spese» | `lib/constants/navigation.ts` |
| «N asset in portafoglio» sotto il tile Patrimonio della Panoramica (conta anche casa e conti) | «N asset nel patrimonio» | `components/dashboard/overview/PatrimonioTile.tsx` (r. ~259 e il commento della prop) |
| Riga «Impostazioni» del Budget | sparisce | vedi § 5.6 |

Regola di lavoro: prima si cerca ogni occorrenza visibile con `grep -rn`, poi si decide se nomina la cosa vecchia o quella
nuova (un «portafoglio» che in Allocazione o FIRE significa «gli investimenti» **resta**: è il significato nuovo di R1 e non va
toccato; così «Non fa parte del portafoglio investito» in `AssetDialog`).
Prove da aggiornare: `__tests__/patrimonioNarrative.test.ts` e gli altri `*Narrative.test.ts` che citano le frasi,
`e2e/mobile-composition.patrimonio{,.mobile}.spec.ts`, `e2e/bundle.lazy.spec.ts`, `e2e/mobile-composition.performance.degraded.mobile.spec.ts`
(regione «Rendimento»), `e2e/allocation{,.mobile}.spec.ts` (regione «Piano»), le spec `fire*`/`coast*` (6 file con «Traguardo»),
`__tests__/{fireNarrative,coastFireView,coastStages,goalsNarrative,overviewNarrative}.test.ts`.

### 5.3 R2 · Il menu, solo ordine e nomi (task RU1)

```
OGGI                                 ONDATA 1
Panoramica                           Panoramica
Patrimonio · Cashflow                ENTRATE E SPESE   Cashflow · Analisi spese
ANALISI   Analisi · Rendimenti ·     INVESTIMENTI      Patrimonio · Allocazione · Rendimenti
          Storico · Hall of Fame     FUTURO            FIRE e Simulazioni · Previdenza
PIANIFICAZIONE  Allocazione ·        STORIA            Storico · Hall of Fame
          FIRE e Simulazioni ·       Assistente AI
          Previdenza                 Impostazioni (in fondo, visibile)
Assistente AI
```

- I gruppi sono per oggetto. Traguardi (rotta nuova) e Hall of Fame come scheda di Storico restano all'ondata 3: qui
  «Hall of Fame» sta ancora da sola sotto STORIA.
- **Una sola fonte**: `lib/constants/navigation.ts` espone `navGroups` (etichetta + voci); `Sidebar`, `SecondaryMenuDrawer`,
  `TabletRail` la leggono, e `secondaryHrefs` si ricava da lì. `primaryNav` resta per la pillola del telefono
  (Panoramica · Patrimonio · Cashflow · Altro), che non cambia; «Altro» mostra gli stessi gruppi. `pension/page.tsx` usa
  `planningNav` solo per una rotta: leggere dalla fonte nuova.
- «Impostazioni» a desktop sta nel menu dell'account, aperto dall'icona persona nella fascia (`doc/fascia-desktop/README.md`,
  D-FD8); sul tablet, dove il fascicolo sostituisce la `TabletRail`, allo stesso modo (D-RU4).
- Il titolo della pagina Analisi resta quello che è oggi se non coincide: si allinea al menu («Analisi spese», N15).
- **Indipendente dalla forma del menu.** R2 decide solo gruppi, ordine e nomi in `navGroups`; nessuna classe di layout della
  Sidebar cambia qui. Il 2026-11-20 Giorgio ha scelto per il desktop un menu orizzontale a linguette, una per gruppo di R2, con le
  schede interne in variante U3 (thread «Progettare la fascia colorata su desktop», `doc/fascia-desktop/README.md` sul branch
  `claude/project-thread-u0v4nr`): una linguetta per gruppo di `navGroups` così com'è, Panoramica e Assistente voci sciolte;
  U3 cambia solo l'aspetto della barra delle schede, non ordine né nomi (R5 vale). Le larghezze di R3 e R5 sono misurate con
  la Sidebar da 256 px: senza, le colonne si allargano e le classi restano valide; R3 si misura dopo il fascicolo (§ 7).
- Prove: `__tests__/mobileSurfaces.test.ts`, `__tests__/perfRoutes.test.ts` (leggono gli array), `e2e/hall-of-fame.hof.spec.ts`,
  `e2e/motion.layout.spec.ts` (link per nome), `shell.boot*.spec.ts`, la spec tablet (rail).

### 5.4 R3 · Panoramica a due colonne (task RU2)

**Il DOM non cambia** (ordine: Patrimonio, Sintesi, Cashflow, Composizione, Costi, Obiettivo, Spese, Entrate, Asset,
Intestatari): sotto `desktop:` la Panoramica resta com'è e `mobile:census`/`mobile:budget` vedono lo stesso ordine delle righe.
A `desktop:` ogni cella dichiara colonna e riga con `desktop:col-start-*`/`desktop:row-start-*` (mai `order-*`). La griglia ha
una riga 1 per le due etichette di colonna; i tile partono dalla riga 2. Render della proposta: pagina «oggi / proposta» § R3.

Tabella delle classi, caso pieno (spese lette, Costi assente, Traguardo presente, che è il caso del census):

| Cella (`app/dashboard/page.tsx`) | Oggi | Dopo |
|---|---|---|
| etichetta «Quanto ho» (nuova, `h3`) | — | `hidden desktop:block desktop:col-span-7 desktop:col-start-1 desktop:row-start-1` |
| etichetta «Come va il mese» (nuova, `h3`) | — | `hidden desktop:block desktop:col-span-5 desktop:col-start-8 desktop:row-start-1` |
| Patrimonio totale | `col-span-5 row-span-2` | `col-span-7 row-span-2 col-start-1 row-start-2` |
| Cashflow del mese | `col-span-4` | `col-span-5 col-start-8 row-start-2` |
| Entrate per categoria | `col-span-4` | `col-span-5 col-start-8 row-start-3` |
| Composizione | `col-span-3` | `col-span-3 col-start-1 row-start-4` |
| Asset principali | `col-span-4` (12 senza spese) | `col-span-4 col-start-4 row-start-4` |
| Spese per categoria | `col-span-4` | `col-span-5 col-start-8 row-start-4 row-span-2` |
| Sintesi patrimoniale | `col-span-3` | `col-span-3 col-start-1 row-start-5` |
| Traguardo (`ObiettivoTile`) | `col-span-2` o `4` | `col-span-4 col-start-4 row-start-5` |
| Intestatari | `col-span-12` | `col-span-12 col-start-1 row-start-6`, riga chiusa (sotto) |

Tutte le classi della colonna «Dopo» hanno il prefisso `desktop:`. Varianti:
- **Con Costi** (`costsVisible`) **e Traguardo**: Sintesi `col-span-3 col-start-1`, Costi `col-span-2 col-start-4`, Traguardo
  `col-span-2 col-start-6`, tutti `row-start-5`. **Solo Costi**: Costi `col-span-4 col-start-4`. **Nessuno dei due**: Sintesi
  `col-span-7 col-start-1`.
- **Senza spese** (`expenseStats` assente): la colonna destra è il solo Cashflow (`row-start-2 row-span-2`); Composizione,
  Asset, Sintesi restano dove sono.
- **Asset principali non scende mai sotto 4 colonne**: a 3 i nomi si riducono a una lettera (render del 2026-11-20; lo dice
  già il commento sopra la cella). È la correzione rispetto allo schizzo di Fable (Composizione 4 · Asset 3).
- **Entrate sopra, Spese sotto** nella colonna destra (Giorgio, 2026-11-20): le spese hanno molte più categorie delle entrate, così
  il tile lungo (`row-span-2`) è quello delle Spese. Le righe della tabella sono nell'ordine delle righe della griglia; il DOM
  resta Spese, Entrate. Stesso ordine in Tracciamento (§ 5.5).
- Il `div` vuoto che oggi chiude la seconda riga (`!costsVisible && !hasGoals`) sparisce.
- Le etichette usano `TILE_EYEBROW_CLASS` (stessa dimensione degli occhielli) e sono `h3`, nessuna regione nuova.

**Intestatari riga chiusa anche a desktop.** `TileRowShell` (`components/ui/tile.tsx`) non dipende dalla larghezza: a
`desktop:` la cella passa a `IntestatariTile` un `collapse` costruito da uno stato locale (`open` falso all'apertura, `mounted`
vero dopo la prima apertura, `failed` falso, id `OVERVIEW_SECTION_IDS.intestatari`), mentre sotto `desktop:` resta
`sections.collapse(…)`: `collapse={sections.collapse(id) ?? desktopIntestatari}`. Non si ricorda fra visite. La risposta
chiusa è `asides[OVERVIEW_SECTION_IDS.intestatari]` come oggi.

- Il verdetto non cambia in questa ondata (D-RU11).
- Prove: `e2e/overview.spec.ts` (+ `overviewFixture.ts`): a 1440×900 l'occhiello «Spese per categoria» ha `top` < 900 (oggi
  934, proposta 808: le Entrate stanno sopra, a 606); le due etichette sono visibili a 1440 e nascoste a 1024; Intestatari è chiusa e si apre al clic.
  `overview.tablet.spec.ts`, `panoramica.snapshot.spec.ts`; `doc/guide/panoramica.md` (grafico delle posizioni).

### 5.5 R5 · Cashflow › Tracciamento (task RU3)

Render: pagina «oggi / proposta» § R5. DOM e ordine delle righe sotto `desktop:` come oggi (Spese, Entrate, Andamento,
Risparmio, Movimenti). In `components/cashflow/ExpenseTrackingTab.tsx` una costante `const feedBeside = desktopListView === 'feed';`
e le classi (`desktop:` davanti a ognuna):

| Cella | Mese (Andamento c'è) | Altri periodi (niente Andamento) | Vista «Tabella» |
|---|---|---|---|
| Cashflow del periodo | `col-span-5 row-span-2 col-start-1 row-start-1` | uguale | uguale |
| Andamento del mese | `col-span-7 col-start-6 row-start-1` | — | uguale ai primi due |
| Risparmio nel tempo | `col-span-7 col-start-6 row-start-2` | `col-span-7 col-start-6 row-start-1 row-span-2` | uguale ai primi due |
| Movimenti | `col-span-7 col-start-1 row-start-3 row-span-2 relative min-h-[480px]` | uguale | `col-span-12 col-start-1 row-start-3` |
| Entrate per categoria | `col-span-5 col-start-8 row-start-3` | uguale | `col-span-5 col-start-1 row-start-4` |
| Spese per categoria | `col-span-5 col-start-8 row-start-4` | uguale | `col-span-7 col-start-6 row-start-4` |

- **Altezza**: decidono le due categorie. Dentro la cella di Movimenti un `div` `desktop:absolute desktop:inset-0` (solo con
  `feedBeside`) contiene il tile, così la lista non allunga la riga; la cella ha `min-h-[480px]`.
- **Cosa scorre**: `MovimentiTile` riceve una prop nuova `scrollBody?: boolean`. Con `true` la `section` è `flex flex-col h-full`,
  occhiello, lettura e barra degli strumenti restano ferme, e il `div` dei figli diventa `min-h-0 flex-1 overflow-y-auto`
  (barra di scorrimento della piattaforma). Senza la prop il tile è quello di oggi (telefono e Tabella).
- La paginazione resta quella del feed («Carica altri 20», «N di M voci» nell'aside): niente «Mostra tutti» (D-RU6).
- Misura nel render a 1440×900, mese di novembre del census: Movimenti comincia a ~960 px (oggi 1298) e la pagina è più corta
  di 540 px. Non entra nella prima schermata: il tile Cashflow si allunga quanto Andamento + Risparmio.
- Ordine delle schede: Tracciamento · Budget · Divisione · Centri di Costo · Dividendi (opzionali dove sono accese).
  `CASHFLOW_TABS_BASE` diventa Tracciamento · Budget, poi le opzionali, poi Dividendi; URL, `VALID_CASHFLOW_TABS` e
  `mountedTabs` non cambiano.
- Prove: `e2e/cashflow.tracciamento.spec.ts` (+ una nuova a 1440: il box di Movimenti ha `right` ≤ `left` di «Spese per
  categoria» e `top` < 1000; con «Tabella» la sua larghezza è quella della griglia; la lista scorre dentro, la barra degli
  strumenti no), `cashflow.tablet.spec.ts`, `e2e/mobile-composition.cashflow.mobile.spec.ts` (invariata).

### 5.6 R6 · Cashflow › Budget e l'ingranaggio di Cashflow (task RU3)

Render: pagina «oggi / proposta» § R6.

**La matita.** `TettoTile` riceve una prop `asideAction?: ReactNode`, disegnata dopo il testo dell'aside nella stessa riga
(`inline-flex items-center gap-2`). `BudgetTab` le passa un `Button` `variant="ghost"` icona `Pencil` 16 px, `h-8 w-8` da
`desktop:` e `h-11 w-11` sotto (`-my-1.5` per non alzare la riga), `aria-label="Modifica tetto e avvisi del budget"`,
`title="Tetto e avvisi"`: la stessa matita delle righe dei budget annuali.

**Il modale.** `ResponsiveModal` `eyebrow="Budget"`, `title="Tetto e avvisi"`, `width="lg"`, `returnFocusTo` = la matita.
Dentro i due blocchi di oggi, «Tetto complessivo mensile» e «Avvisi soglia», come due sezioni affiancate da `desktop:` (una
colonna sotto), **non** come due `Tile` dentro il modale. Il modale lavora su una **bozza locale** (tetto, avvisi attivi,
soglie) inizializzata all'apertura dai valori di `useBudgetConfig`:
- piè: «Annulla» chiude e scarta; «Salva» (disabilitato se la bozza non è valida per `validateBudgetAllocation` o è uguale ai
  valori salvati) chiama `setOverall`, `setAlertsEnabled`, `setAlertThresholds` e chiude. Il salvataggio vero resta quello
  automatico di `useBudgetConfig`; il «Salvato» che oggi sta nell'aside di Per categoria non cambia.
- `CEILING_SETTING_FOOTER` (`lib/utils/budgetNarrative.ts` r. ~616) perde «Si salva da solo.»: nel modale si salva con «Salva».
- `BudgetImpostazioni` diventa il corpo del modale: via il `Collapsible`, via lo stato `open`. Il nome del file resta.

**Senza tetto** (`overallMonthlyAmount == null`): al posto della cella vuota (oggi un `div aria-hidden`) un tile piccolo
«Tetto del mese» con la lettura «Nessun tetto mensile.» e un pulsante `outline` «Imposta il tetto» che apre lo stesso modale.
Mai aperto da solo al caricamento.

**Cosa sparisce**: la disclosure in fondo e `SETTINGS_ID`; sotto `desktop:` il pulsante a sliders accanto a «Aggiungi budget»
(il telefono raggiunge il modale dalla matita del tetto: il tile del tetto è THE tile, aperto); l'ingranaggio di testata su Budget.

**Avvisi** (`lib/utils/budgetNarrative.ts`, funzione del piè del tile Avvisi, r. ~435): le frasi restano, con due ritocchi:
«Riattivali nelle impostazioni per…» diventa «Riattivali dalla matita del tetto per…»; dopo la frase si aggiunge un link
`TILE_FOOTER_ACTION_CLASS` «Email settimanale del budget» → `/dashboard/settings?tab=generale` (Impostazioni › Preferenze, dove
sta l'interruttore). È il rimando che Fable chiedeva.

**L'ingranaggio di testata** (`app/dashboard/cashflow/page.tsx`, oggi `aria-label="Impostazioni Spese"` su ogni scheda):

| Scheda attiva | Dopo |
|---|---|
| Tracciamento | ingranaggio, `aria-label`/`title` «Categorie», → `/dashboard/settings?tab=spese` |
| Dividendi | ingranaggio, «Impostazioni dei dividendi», → `/dashboard/settings?tab=dividendi` (la scheda esiste) |
| Budget, Divisione, Centri di Costo | nessun ingranaggio |

Divisione e Centri hanno solo l'interruttore in Impostazioni › Preferenze: chi li usa non ha bisogno di una porta da ogni visita
(P2: un ingranaggio apre le regolazioni di quella pagina e nient'altro). È la scelta di Fable; il dossier del 2026-11-19 li teneva.

- Prove: `e2e/cashflow.budget.spec.ts`, `cashflow.budget.mobile.spec.ts` (oggi cerca «Impostazioni del budget» e il pulsante a
  sliders: va riscritta sulla matita), `__tests__/budgetNarrative*`.

### 5.7 N1 · L'asse dei grafici FIRE (task RU4)

Render del prototipo: pagina «oggi / proposta» § N1 (Ventaglio da 26 a 6 Mln, Scenari da 20 a 8 Mln, Dopo il FIRE da 6 a 2,5 Mln, Proiezione
da 8 a 5 Mln).

Funzione pura in `lib/utils/fireChartAxis.ts` (+ `__tests__/fireChartAxis.test.ts`):

```ts
export interface FireAxis {
  top: number;          // massimo dell'asse
  ticks: number[];      // 0, step, 2·step, …, top
  step: number;
  cut: boolean;         // true = qualche serie `outer` esce dal grafico
  outerMax: number;     // massimo di `outer` (per la nota), 0 se non c'è
}
/** null solo quando non c'è nulla da disegnare (C ≤ 0). */
export function resolveFireAxis(core: readonly (readonly (number | null | undefined)[])[],
                                outer: readonly (readonly (number | null | undefined)[])[]): FireAxis | null
```

- `core` = le serie che si vedono sempre intere: la Base o la mediana, la linea del numero FIRE, e dove c'è una banda il suo
  bordo alto 25–75 (`p75`). `outer` = le serie che possono uscire: Bull, `p90`, i percorsi campione del Ventaglio.
- `C` = il **massimo su tutto l'orizzonte** di `core` (non il valore dell'ultimo anno: in Dopo il FIRE il capitale scende e il
  massimo è all'inizio), ignorando `null`, `NaN` e negativi. `O` = il massimo di `outer` (0 se `outer` è vuoto). Se `C ≤ 0` → `null`.
- `axisFor(x)`: `step = niceStep(1,1 × x / 5)`, con `niceStep(y)` il più piccolo `m × 10^k ≥ y` per `m ∈ {1, 2, 2,5, 5}`;
  `top = ceil(1,1 × x / step) × step`; `ticks = [0, step, …, top]` (da 5 a 6 tacche).
- **Taglio**: se `O > 1,5 × axisFor(C).top` → asse `axisFor(C)`, `cut = true`. Altrimenti asse `axisFor(max(C, O))`, `cut = false`
  (tutto sta nel grafico, ma con le stesse tacche tonde).
- Il grafico usa **sempre** `domain={[0, top]}` e `ticks={ticks}` (mai l'asse automatico di Recharts: produce «650k», «1,3 Mln»).
  `allowDataOverflow` solo con `cut`. Con deplezione il minimo è 0 come oggi. Con `null` il grafico resta com'è oggi.
- **Solo con `cut`**, sotto il grafico e prima della legenda, una riga `text-[11px] text-muted-foreground`: Ventaglio e Proiezione «Il 90° percentile
  esce dal grafico: a fine orizzonte arriva a {formatCurrencyCompact(p90 dell'ultimo anno)}.»; Ventaglio con percorsi oltre
  `top` aggiunge «e alcuni percorsi»; Scenari e Coast «Lo scenario Bull esce dal grafico: nel {anno} arriva a {…}.»; Dopo il
  FIRE come Ventaglio. L'`aria-label` del grafico riceve la stessa frase. Il tooltip mostra sempre i valori veri.

**Etichette dell'asse**, in tutti e cinque i grafici: un formatter unico `formatAxisEuro(value, step)` in
`lib/utils/fireChartAxis.ts`. Sotto il milione come `formatCurrencyCompact` («750k €»); dal milione «Mln» con i decimali che
il passo richiede: passo ≥ 1 Mln → 0 decimali («2 Mln €»), passo 0,5 Mln → 1 («1,5 Mln €»), passo 0,25 Mln → 2 («1,25 Mln €»);
virgola italiana; **spazio non separabile** (`\u00A0`) fra cifra e unità e prima di «€». `YAxis width={76}` in tutti e cinque.
Recharts va a capo solo sugli spazi normali: con `\u00A0` un'etichetta resta su una riga.

| Grafico | `core` | `outer` |
|---|---|---|
| `FireFanChart` (Calcolatore › Ventaglio) | `p50`, `p75`, `fireTarget` | `p90`, i `s{n}` |
| `FIREProjectionChart` (Calcolatore › Scenari) | `baseNetWorth`, `baseFireNumber` | `bullNetWorth` |
| `CoastFireProjectionChart` | `basePortfolioValue`, `paceValue`, `fireNumberTarget` | `bullPortfolioValue` |
| `MonteCarloFanChart` (Dopo il FIRE, Proiezione) | `p50`, `p75`, `reference`, `referenceLine.value` (D-RU13) | `p90` |
| `WhatIfProjectionChart` | — (nessuna serie esterna: solo le etichette) | — |

Bear non è mai `outer` né `core`: sta sotto la Base.

### 5.8 N2 · Tono neutro quando il calendario copre (task RU5)

Regola di prodotto, già decisa il 2026-11-14. Si applica **solo** al caso in cui il vissuto è in rosso ma il mese chiude in attivo:
- **Tracciamento** (`buildCashflowVerdict`, ramo con calendario): se `settled.savingsRate < 0` (o `null` con spese) **e**
  `totals.net ≥ 0` (il totale del periodo, calendario compreso, è quello che mostra il tile Risparmio) → `tone: 'neutral'`.
- **Panoramica** (`resolveHeadline`, ramo `savingsRate < 0 || overspendInEuro`): se `cashflow.savings + scheduledIncome −
  scheduledExpenses ≥ 0` → `tone: 'neutral'`.
- Le **parole non cambiano** (restano «hai speso più di quanto è entrato» e «le spese superano le entrate»): le frasi sotto già
  dicono «in calendario altri …». Resta la regola del 2026-09-14: il verdetto giudica ciò che è accaduto, il calendario non lo
  rende «bene»; non diventa mai `positive`.
- Con il calendario che **non** copre (`net < 0`) il tono resta come oggi.
Valori di riferimento in § 10.

### 5.9 N3 · La tabella Strumenti (task RU6)

Render: pagina «oggi / proposta» § N3 (tabella e menu aperto).

- **Prezzi**: una funzione nuova `formatPrice(value, currency)` in `lib/utils/formatters.ts` (`minimumFractionDigits: 2`,
  `maximumFractionDigits: 4`), **non** un cambio di `formatCurrency`, che ha altri chiamanti a 4 decimali fissi (registro
  operazioni, calcolatore plusvalenze, dividendi: restano come sono). Usata da `StrumentiTile` (Prezzo, PMC in EUR, PMC nella
  valuta) e da `AssetRow` (le stesse tre). 55000 → «55.000,00 €»; 138,1579 → «138,1579 €»; 25,1 → «25,10 €».
- **Azioni di riga, quattro posti fissi** nella colonna sticky, da sinistra: (1) Registra operazione, (2) Modifica, (3) «⋯»,
  (4) Elimina. Un'azione che la riga non ha lascia il suo posto vuoto (un `span` `h-8 w-8` `aria-hidden`), così le icone restano
  in colonna: il render del prototipo mostra la matita che scivola nelle righe senza «⋯».
  - (1) solo dove oggi c'è (`showLedgerActions`).
  - (3) `DropdownMenu` (`components/ui/dropdown-menu.tsx`), trigger `Button ghost h-8 w-8` icona `MoreHorizontal`,
    `aria-label="Altre azioni su {nome}"`, `align="end"`. Voci, ognuna con la sua icona di oggi: «Calcola plusvalenze»
    (`withCost`), «Movimenti» (`showLedgerActions`), «Apri in Previdenza» (`type === 'pensionFund'`, `DropdownMenuItem asChild`
    con `Link`). Senza voci, niente «⋯» (posto vuoto).
  - (4) il cestino a riposo `text-muted-foreground`; rosso (`text-destructive`) al passaggio e al fuoco (`group` sul pulsante,
    `group-hover:` / `group-focus-visible:` sull'icona); armato come oggi («Conferma», `variant="destructive"`).
- **Colonna Nome**: resta `max-w-[260px]` a ogni larghezza (D-RU14). La misura del 2026-11-20 (1023 px chiesti su 982
  disponibili a 1280) era con la Sidebar da 256 px; con il fascicolo la Sidebar non c'è da `band:` e lo spazio utile del tile
  a 1280 è circa 1180 px (stima: 1280 meno i margini di `#page-main` e del tile). La task misura il criterio 12 a 1280×800 col
  mouse sui dati del census; **solo se** `scrollWidth > clientWidth`, il Nome scende a `max-w-[200px]` sotto 1440 come nella
  versione del 2026-11-20.
- `AssetRow` (telefono) non cambia, salvo `formatPrice`.
- Obiettivo misurabile, colonne prezzo accese, census: a 1440×900 e a 1280×800 con il mouse, `scrollWidth ≤ clientWidth` del
  contenitore `.overflow-x-auto` della tabella; con «Andamento» uguale.

### 5.10 N4 · 1280 servito come desktop (task RU0, PR a sé, per prima)

**Che cosa**: a 1280–1439 con puntatore fine la pagina è composta come a 1440 (sidebar piena, griglia a 12 colonne, nessuna riga
chiusa). Un tablet in orizzontale (1000–1439 senza puntatore fine) **non cambia in RU0**. Sopra 1440 nulla cambia.

**Tablet e fascicolo** (Giorgio, 2026-11-20, D-FD9 respinta): la fila di linguette vale anche per il tablet, che perde la
`TabletRail` quando arriva il fascicolo. Questo è un cambio di **navigazione** e lo porta il task del fascicolo
(`doc/fascia-desktop/README.md`), non RU0: la *composizione* del tablet (colonne a 768, palco in orizzontale, righe chiuse)
resta quella di oggi, e N4 non sposta la soglia per il tocco. Il tablet in verticale (768) tiene fascia e pillola come il
telefono (D-FD13): le linguette valgono solo a `desktop:` e `tablet-landscape:`.

**Come (verificato con uno spike il 2026-11-20, render nella pagina «oggi / proposta» § N4)**. In `app/globals.css`:

```css
/* al posto di --breakpoint-desktop: 1440px nel @theme */
@custom-variant desktop (@media (width >= 1440px) or ((width >= 1280px) and (pointer: fine)));
@custom-variant max-desktop (@media not ((width >= 1440px) or ((width >= 1280px) and (pointer: fine))));
@custom-variant tablet-landscape (@media (orientation: landscape) and (width >= 1000px) and (width < 1440px) and (not ((width >= 1280px) and (pointer: fine))));
```

- **Una sola media query con `or`**, mai la lista con la virgola: con la virgola Tailwind v4 spezza la variante in due regole e
  la seconda perde `@media` (CSS non valido, provato).
- Le due varianti vanno dichiarate **dopo** `tablet-landscape` e dopo ogni altra variante di larghezza: Tailwind ordina le
  varianti personalizzate per ordine di dichiarazione, e `desktop:` deve vincere su `tablet:` e su `tablet-landscape:` (nello
  spike `tablet:col-span-2 desktop:col-span-12` esce nell'ordine giusto; `max-desktop:@[880px]:contents` si compone).
- `tablet-landscape` **deve** escludere il desktop: senza, a 1280 con il mouse valgono insieme le regole della rotaia e quelle
  del desktop.
- La regola a mano `@media (width < 1440px)` (overscroll della fascia, r. ~1647) diventa `@media not (…stessa condizione…)`.
- Supporto: `or` e `not (…)` nelle media query sono Media Queries 4, come la sintassi a intervalli che l'app usa già.
- **Il server di sviluppo non ricompila il CSS quando cambia una `@custom-variant`**: va fermato e cancellata la cartella
  `.next*` (nello spike il CSS è rimasto quello vecchio finché non l'ho fatto).

**Le query in JS** diventano una costante sola in `lib/hooks/useCompactLayout.ts`:
`DESKTOP_QUERY = '(width >= 1440px) or ((width >= 1280px) and (pointer: fine))'` e `COMPACT_QUERY = 'not all and (' + DESKTOP_QUERY + ')'`.
Le leggono: `components/ui/sidebar.tsx` (`useMediaQuery('(max-width: 1439px)')` → `COMPACT_QUERY`), `VersamentiTile`
(`DESKTOP_QUERY` locale → import), `FlussoTile` (`SANKEY_DRAWN_QUERY`: la parte `(min-width: 1440px)` diventa la condizione
desktop), `lib/constants/navigation.ts` (`PILL_VISIBLE_QUERY` aggiunge `and (not (pointer: fine))`). Commenti che citano 1439/1440
come soglia (sidebar, PageTabBar, fire-simulations page) si aggiornano.
Un test `__tests__/desktopQuery.test.ts` legge `app/globals.css` e vuole la stessa condizione di `DESKTOP_QUERY` nelle varianti.

**Misure** a 1280×800 con il mouse e con il tocco (`hasTouch`): ogni pagina; `mobile:census`/`mobile:budget` a 390, 768 e
1024×768 identici. Con la sidebar piena (256 px) il contenuto ha 1024 px; con le linguette del fascicolo 1280 px (il
  meccanismo non cambia, `doc/fascia-desktop/README.md`). Finché c'è la Sidebar: Strumenti è il caso stretto (§ 5.9); Costi a 2 colonne
in Panoramica (~150 px) va guardato a occhio.

## 6. Interfaccia

### 6.1 Accessibilità
- Matita del Budget e «⋯» di riga: 44 px sotto `desktop:`, 32 da `desktop:`; nomi accessibili («Modifica tetto e avvisi del budget», «Altre azioni su {nome}»).
- Le etichette di colonna della Panoramica sono `h3` come ogni eyebrow di tile (il tile è la sezione); nessuna regione nuova.
- La nota di N1 è testo, non solo un colore; il grafico mantiene il suo `aria-label` e ne ha una frase in più quando una serie esce.
- Il fuoco del modale di Budget torna alla matita (`returnFocusTo`: è il punto cieco noto di `ResponsiveModal`).

### 6.2 Movimento
Nessun movimento nuovo. Le colonne della Panoramica non si animano al cambio di larghezza (la cascata a stagger una volta per
sessione resta); la lista scorrevole di Movimenti non anima l'altezza.

### 6.3 Composizione mobile
Sotto `desktop:` **nulla cambia** per R3, R5, R6 (stesso DOM, stesse righe): `mobile:census`/`mobile:budget` devono risultare
identici salvo (a) la matita del Budget al posto dello scroll, (b) le parole di R1 che compaiono nelle risposte delle righe.
N4 sposta la soglia solo con il puntatore fine.

## 7. Piano

Sette task, una PR ciascuna, in quest'ordine. **Sonnet 5.5 basta per tutte**: le classi, le funzioni e i casi di prova sono
scritti qui; il prototipo che ha prodotto i render è in `/mnt/project-files/riordino-ui/prototipo-ondata-1.patch` (riferimento,
non da applicare: è precedente ad alcune correzioni di questa revisione) e la pagina «oggi / proposta» è
https://claude.ai/artifact/M6bf52DueZx6WaL4JYv4PB. Ogni PR corre `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run` sui file toccati e, per le pagine toccate, i loro `e2e/*.spec.ts` sugli emulatori; sul Mac
`mobile:census` + `mobile:budget` + `perf:budget` (lezione: misure e voci di budget nella stessa PR).

| Task | Contenuto | Tocca | Dipende da |
|------|-----------|-------|------------|
| **RU0** | N4: 1280 col mouse servito come desktop (§ 5.10, CSS già verificato dallo spike) | `app/globals.css` (tre `@custom-variant` + la `@media (width < 1440px)` a r. ~1647), `lib/hooks/useCompactLayout.ts` (`DESKTOP_QUERY`, `COMPACT_QUERY`), `components/ui/sidebar.tsx`, `VersamentiTile`, `FlussoTile`, la pillola, `__tests__/desktopQuery.test.ts` | — (per prima) |
| **RU1** | P1–P3 in DESIGN.md, R1 parole, R2 menu | `navigation.ts`, `Sidebar`, `SecondaryMenuDrawer`, `TabletRail`, narrative di Patrimonio/FIRE/Allocazione, titoli | — |
| **RU2** | R3 Panoramica a due colonne (+ Intestatari chiusa) | `app/dashboard/page.tsx`, `IntestatariTile` | RU1 (parole), RU0 |
| **RU3** | R5 Tracciamento (Movimenti accanto, `scrollBody`) + schede in ordine + R6 Budget (matita, modale con Annulla/Salva, «Imposta il tetto») + ingranaggio per scheda | `ExpenseTrackingTab`, `MovimentiTile`, `BudgetTab`, `BudgetImpostazioni`, `TettoTile`, `budgetNarrative.ts`, `cashflow/page.tsx` | RU1, RU0 |
| **RU4** | N1 `resolveFireAxis` + `formatAxisEuro` | `lib/utils/fireChartAxis.ts` (nuovo), `FireFanChart`, `FIREProjectionChart`, `CoastFireProjectionChart`, `MonteCarloFanChart`, `WhatIfProjectionChart` | — |
| **RU5** | N2 tono neutro | `cashflowNarrative.ts`, `overviewNarrative.ts` | — |
| **RU6** | N3 tabella Strumenti (`formatPrice`, quattro posti, menu «⋯») | `StrumentiTile`, `AssetRow`, `lib/utils/formatters.ts` | — |

**Con il menu a linguette** (`doc/fascia-desktop/README.md`, D-FD10, presa) l'ordine è RU0 → RU1 → fascicolo → RU2 →
RU3, così R3 e R5 si misurano una volta sola senza Sidebar.

**Stato al 2026-11-21**: RU0 #194, RU1 #195, fascicolo #196–#199, RU2 #200 in main. Restano RU3, RU4, RU5, RU6. RU4 e RU6
sono le prossime (nessun file in comune con RU3 né fra loro); RU5 può andare con loro.

RU4, RU5 e RU6 sono indipendenti dal resto e fra loro: possono partire in parallelo a RU1–RU3. Dopo l'ondata, **una sola**
rimisura di `mobile:budget` (prestazioni, proposta 7): ogni PR dichiara la voce toccata, la rimisura finale le chiude.

**Conflitti con altro lavoro** (aree che toccano gli stessi file; per «Non avviare due thread sulla stessa area»):
- F14 (cancellazione di asset, D4/M6/L1): `StrumentiTile`, `AssetDialog` → dopo RU6.
- F15 (movimento + desktop N5–N17): `ExpenseTrackingTab`, `TransactionFeed`, Movimenti → dopo RU3.
- F16 (ondate 2–3), F17 (Essenziale): dopo l'ondata 1.
- Indipendenti (backend, dati, sicurezza, CI, FIRE Q2/H1/H2/E1 se non toccano i grafici di § 5.7, rendimenti, dividendi): possono
  girare ora.

## 8. Decisioni

Prese da Giorgio il 2026-11-20 («Ok vai parti»), nella versione riallineata al fascicolo (`doc/fascia-desktop/README.md`).

| ID | Stato | Decisione | Alternative scartate e motivo |
|----|-------|-----------|-------------------------------|
| D-RU1 | **Presa** | N4 in una PR a sé, **per prima** (RU0), con il meccanismo verificato dallo spike: `desktop` = `(width >= 1440px) or ((width >= 1280px) and (pointer: fine))`, `max-desktop` la sua negazione, `tablet-landscape` escluso a 1280 col mouse (§ 5.10). | Dentro l'ondata: ogni misura su due larghezze insieme, una regressione non si attribuisce. Per ultima: RU2 e RU3 si misurerebbero due volte. Lista di media separata da virgole: Tailwind la spezza e la seconda parte perde `@media` (visto nello spike). |
| D-RU2 | **Presa** | P1–P3 come tre *Named Rules* di DESIGN.md nella prima PR di parole (RU1), prima di spostare qualcosa. | Dopo lo spostamento: il riordino si disfa al prossimo tile aggiunto. Una regola sola: P1/P2/P3 si citano per nome. |
| D-RU3 | **Presa** | R1 completa tranne la riga fissa «Portafoglio X su Y» di Allocazione e FIRE, che va con la striscia di R8 (ondata 2); identificatori e dati salvati invariati. | La riga ora: serve il portafoglio e il patrimonio in un solo hook di Allocazione, oggi non c'è. Parole nuove anche negli id: rompe cache e specifiche. |
| D-RU4 | **Presa** | Menu per oggetto con Traguardi e Hall of Fame ancora dove sono (rotta e scheda in ondata 3); «Impostazioni» visibile a desktop nel menu dell'account della fascia (D-FD8, presa). | Tutto il menu di R2 subito: serve una rotta nuova e una scheda di Storico, due task. Impostazioni solo nel menu utente: due porte per le regolazioni (P2) ma nascosta. |
| D-RU5 | **Presa** | Panoramica: due colonne con `col-start`/`row-start` (tabella di § 5.4), **DOM invariato**, etichette solo a desktop, a destra Entrate sopra e Spese sotto (le Spese, con più righe, prendono le due righe in basso), Composizione 3 colonne e Asset principali 4 (mai sotto 4), Intestatari riga chiusa anche a desktop. | Due contenitori di colonna nel DOM: cambia l'ordine delle righe sul telefono (The First-Screen Rule vieta lo swap con `order`). Composizione e Asset a 3 + 4 invertiti o a 3 + 3: nel prototipo i nomi di Asset principali si riducevano a una lettera. Etichette anche sul telefono: ripetono il verdetto. |
| D-RU6 | **Presa** | Tracciamento: Movimenti 7 colonne col Feed (12 con la Tabella), altezza dello stack delle categorie, «Carica altri» com'è. | «Mostra tutti» della review: introduce una seconda paginazione; il resto dell'app ha una sola. Movimenti sempre a 7: la Tabella ha colonne fisse e non ci sta. |
| D-RU7 | **Presa** | Budget: matita sul tile del tetto → `ResponsiveModal` «Tetto e avvisi» su una bozza locale con Annulla/Salva (non l'autosalvataggio); senza tetto un tile «Imposta il tetto»; l'ingranaggio di testata solo dove ha una scheda giusta: Tracciamento «Categorie» (`?tab=spese`), Dividendi «Impostazioni dei dividendi» (`?tab=dividendi`), nessuno su Budget, Divisione, Centri. | Autosalvataggio dentro il modale: chiudere con Esc salverebbe a metà un tetto digitato. Matita che apre in linea: il tile del tetto è la risposta della pagina, non deve crescere. Ingranaggio verso `?tab=spese` su Divisione e Centri: porta alla scheda sbagliata (P2). |
| D-RU8 | **Presa** | N1: `resolveFireAxis` (§ 5.7): asse sul massimo di `core` su tutto l'orizzonte (mediana/Base, `p75`, numero FIRE), taglio quando `outer` supera 1,5 × il tetto, tacche tonde esplicite sempre, nota solo con il taglio, etichette su una riga con `\u00A0`; What If solo le etichette. | Tetto sulla mediana dell'ultimo anno (versione del 2026-11-19): in decumulo la mediana finale è la più bassa e il grafico taglia la banda 25–75. Asse automatico quando non si taglia: Recharts sceglie «650k», «1,3 Mln». Scala logaritmica: i confronti tra scenari non si leggono. |
| D-RU9 | **Presa** | N2: solo il tono diventa neutro quando il totale con il calendario è ≥ 0; parole invariate; mai `positive`. | Cambiare anche il titolo («in attesa dello stipendio»): inventa una promessa. Tono positivo: ripropone il difetto del 2026-09-14. |
| D-RU10 | **Presa** | N3: `formatPrice` nuovo (2–4 decimali, solo Prezzo e PMC); quattro posti fissi per riga Registra · Modifica · «⋯» · Elimina (un posto vuoto dove un'azione manca); menu «⋯» con Calcola plusvalenze, Movimenti, Apri in Previdenza; cestino grigio a riposo; nome a `max-w-[200px]` sotto 1440. | Cambiare `formatCurrency`: tocca ogni cifra dell'app. Posti non fissi: nel prototipo la matita cambiava colonna da riga a riga. Eliminare dentro il menu: perde l'armatura in riga. Tutto nel menu: Registra a due tocchi. |
| D-RU11 | **Presa** | Il taglio del verdetto a desktop dietro «Dettagli» non è in questa ondata (§ 9). | Includerlo: `leadLength` è pensato per il telefono (a 0 il titolo da solo), a desktop servirebbe un secondo punto di taglio e una disclosure nuova. |
| D-RU12 | **Presa** | Sette task, una PR ciascuna (§ 7), RU4–RU6 in parallelo al resto. | Una PR sola: ingestibile da rivedere e da misurare sul Mac. |
| D-RU13 | Proposta (2026-11-21) | N1: in `MonteCarloFanChart` la soglia a valore fisso (`referenceLine.value`, la cifra scritta a mano in Proiezione) è `core` come la serie `reference`: si vede sempre intera. | Lasciarla fuori: una soglia sopra la mediana uscirebbe dal grafico, ed è la cifra che la persona ha scritto per confrontarla. Renderla `outer`: la nota direbbe «la soglia esce», ma la soglia è la domanda, non un estremo. |
| D-RU14 | Proposta (2026-11-21) | N3: il Nome resta a 260 px a ogni larghezza; il `max-w-[200px]` sotto 1440 di D-RU10 si applica solo se la misura a 1280×800 col mouse, con il fascicolo, trova ancora la tabella che scorre. | Tenere 200 px comunque: nasceva dalla Sidebar da 256 px, che da `band:` non c'è più; taglierebbe nomi che ora stanno. Togliere anche il rimedio: se la stima di ~1180 px è sbagliata la tabella torna a scorrere. |

## 9. Punti aperti

- **Il verdetto della Panoramica a desktop**: «prima frase con al più quattro cifre, il resto dietro Dettagli» (R3). Prima va
  decisa una regola di taglio per desktop (oggi `leadLength` vale solo sotto `desktop:`).
- **Menu desktop a linguette**: fatto, in main (PR #196–#199, seconda versione D-FD14–D-FD22). Il tablet in verticale a 768
  tiene fascia e pillola (D-FD13). I render di R5 (RU3) si rifanno senza Sidebar.
- **Dividendi in Rendimenti** (R2, punto aperto della review): non in questa ondata.
- **N5–N17** della review desktop: card F15, non qui; N15 (titolo = nome del menu) è inclusa solo per Patrimonio e Analisi spese.
- **Misura finale del budget mobile**: i valori nuovi vanno scritti in `perf/mobile-budget.json` con la PR; il Mac non è in questo thread.

## 10. Criteri di accettazione

Valori inventati e tondi (WORKFLOW.md regola 7).

**N1 · `resolveFireAxis`** (`__tests__/fireChartAxis.test.ts` + controllo nel browser)
1. `core` max 1.800.000, `outer` max 9.000.000 → `axisFor(1,8 Mln)`: passo `niceStep(396.000)` = 500.000, `top` = 2.000.000;
   9.000.000 > 3.000.000 → `cut = true`, `ticks` = [0, 500k, 1 Mln, 1,5 Mln, 2 Mln]; nota «… arriva a 9 Mln €».
2. `core` 1.200.000, `outer` 2.000.000 → `axisFor(1,2 Mln).top` = 1.500.000; 2.000.000 ≤ 2.250.000 → `cut = false`,
   asse `axisFor(2 Mln)`: passo 500.000, `top` = 2.500.000; nessuna nota.
3. Decumulo (Dopo il FIRE): `p50` da 1.000.000 a 200.000, `p75` massimo 1.300.000 al primo anno, `p90` finale 6.000.000 →
   `C` = 1.300.000 (non il `p50` finale), `top` = 1.500.000, `cut = true`; la banda 25–75 è intera.
4. `core` vuoto, tutto `null` o tutto ≤ 0 → `null`; nessuna divisione per zero.
   Proiezione con soglia scritta 3.000.000 e `p50` massimo 1.800.000 (D-RU13): `C` = 3.000.000, passo `niceStep(660.000)` =
   1.000.000, `top` = 4.000.000; la soglia è dentro il grafico.
5. `formatAxisEuro(1.500.000, 500.000)` = «1,5\u00A0Mln\u00A0€»; `(2.000.000, 500.000)` = «2\u00A0Mln\u00A0€»;
   `(1.250.000, 250.000)` = «1,25\u00A0Mln\u00A0€»; `(750.000, 250.000)` = «750k\u00A0€».
6. Su ogni grafico di Calcolatore (Ventaglio, Scenari), Coast, What If, Dopo il FIRE e Proiezione nessuna etichetta dell'asse ha
   più di un `tspan`, la prima non è tagliata (`getBBox().x ≥ 0`), e il tooltip su un punto oltre `top` mostra il valore vero.

**N2 · tono**
7. Tracciamento, 15 del mese, entrate vissute 0, spese vissute 1.500, entrate in calendario 2.800, spese in calendario 400:
   totale = +900 → tono **neutral**, titolo invariato («… hai speso senza entrate»), sentenza del calendario invariata.
8. Stesso caso con entrate in calendario 1.000 → totale = −900 → tono **negative** (come oggi).
9. Panoramica, stessi numeri → tono **neutral**; con 1.000 → **warning**; con tasso vissuto ≥ 0 nulla cambia.
10. Una vendita tassata (`taxIsTheStory`) non è toccata dalla regola.

**N3 · Strumenti**
11. `formatPrice`: 25 → «25,00 €»; 25,12 → «25,12 €»; 25,1234 → «25,1234 €»; 25,10 → «25,10 €»; 25,123456 → «25,1235 €»
    (Prezzo e PMC, tabella e `AssetRow`). `formatCurrency` e i suoi test non cambiano.
12. A 1440×900 e a 1280×800 (mouse, con il fascicolo), colonne prezzo accese: `scrollWidth ≤ clientWidth` del contenitore della tabella, l'ultima
    colonna visibile; un nome lungo si tronca con «…» e il `title` lo dice intero.
13. In ogni riga le quattro azioni hanno la stessa `x` di colonna in colonna (una riga senza «⋯» ha il posto vuoto).
14. Il cestino è `muted-foreground` a riposo, `destructive` al passaggio, al fuoco e armato; «⋯» apre Calcola plusvalenze e
    Movimenti (e Apri in Previdenza dove c'è); Tab entra nel menu, Esc lo chiude con il fuoco sul «⋯».

**R3 · Panoramica**
15. A 1440×900 e 1280×800: nella colonna destra «Entrate per categoria» sta sopra «Spese per categoria» e l'eyebrow delle Spese ha `top` < 900 (oggi 934); le due etichette di colonna ci sono a
    desktop e non sotto `desktop:`; Asset principali non tronca un nome a una lettera; Intestatari chiusa si apre in linea.
16. Sotto `desktop:` (390, 768, 1024×768) l'ordine delle righe e `mobile:census` sono identici a oggi.

**R5 · Tracciamento**
17. A 1440 con il Feed: Movimenti sta a sinistra delle due categorie, Entrate sopra e Spese sotto, il suo `top` è < 1000 (oggi 1298), l'altezza ≥ 480,
    il corpo scorre e la barra degli strumenti resta ferma; con «Tabella» occupa tutta la larghezza; sotto `desktop:` com'è oggi.
18. Le schede di Cashflow sono nell'ordine Tracciamento · Budget · Divisione · Centri di Costo · Dividendi (con le opzionali
    accese); un URL con `?tab=dividends` apre ancora Dividendi.

**R6 · Budget**
19. La matita apre «Tetto e avvisi»; Annulla e Esc non scrivono nulla; Salva scrive tetto e avvisi una volta, il tile mostra il
    nuovo tetto, il fuoco torna alla matita.
20. Senza tetto c'è il tile «Imposta il tetto» che apre lo stesso modale; la riga «Impostazioni» in fondo e il pulsante a
    sliders sul telefono non ci sono più; il piè di Avvisi rimanda alla matita e all'«Email settimanale del budget».
21. Ingranaggio di testata: Tracciamento «Categorie» → `?tab=spese`; Dividendi «Impostazioni dei dividendi» → `?tab=dividendi`;
    nessuno su Budget, Divisione, Centri di Costo.

**R1 / R2**
22. Nessuna occorrenza visibile di «Strumenti e conti», «Il portafoglio vale», «Verdetto del portafoglio», «asset in portafoglio»
    nella Panoramica; la regione «Piano» di Bilanciamento è «Ordini»; il tile di Patrimonio è «Guadagno sul costo»; il Calcolatore
    dice «Verso il FIRE» e Traguardi resta in FIRE.
23. Il menu a 1440 ha i gruppi di § 5.3 e Impostazioni in fondo; sul telefono la pillola è invariata e «Altro» mostra gli stessi
    gruppi; `aria-current` e lo stato attivo di «Altro» funzionano per ogni rotta (`secondaryHrefs`).

**N4**
24. A 1280×800 con il mouse la pagina è composta come a 1440 (sidebar piena, o la fila di linguette dopo il fascicolo; griglia a 12 colonne, nessuna riga chiusa); a
    1280×800 con tocco (`hasTouch`) resta la composizione da tablet (con la `TabletRail` fino al fascicolo, poi le linguette); a 1440, 1024×768 e 390 nulla cambia (`mobile:census` e
    `mobile:budget` identici).
25. A 1280×800 col mouse nessuna regola `tablet-landscape:` si applica (niente `TabletRail`, niente palco).
26. `__tests__/desktopQuery.test.ts` tiene allineati il CSS di `@custom-variant desktop` e `DESKTOP_QUERY`.