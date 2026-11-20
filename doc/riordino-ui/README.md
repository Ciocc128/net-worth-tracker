# Riordino della UI, ondata 1 (dossier)

> Card Todoist «F13 FEAT riordino UI ondata 1 + grafici FIRE (N1) e tabella Strumenti (N3)» (label `epic-review-fable`).
> Fonti: review «Riordino della UI e modalità basic» (Fable, 2026-11-12; Library `riordino-ui/`, pagina
> https://claude.ai/artifact/1YV1mnG77bMMUHXcSwED3S) e review «UI desktop con i dati veri» (Library `review-ui-desktop.md`,
> pagina https://claude.ai/artifact/RUddPCN1hWqBNy4tSTYx43). Gli schizzi «oggi / proposta» (WORKFLOW.md regola 8) di R1–R10 sono
> nella prima pagina. **Stato: specifica scritta il 2026-11-20; le decisioni D-RU1…D-RU12 sono PROPOSTE, da confermare**
> (§ 8). Già prese da Giorgio il 2026-11-14: N2 tono neutro, N4 «1280 è servito come desktop», la fascia sul desktop non è di
> questo dossier.

## 1. In breve

L'ondata 1 non toglie e non aggiunge tile: cambia **parole, posti e ordine**. Cinque cose dalla review del riordino (tre regole in
DESIGN.md, parole, menu, Panoramica a due colonne, Tracciamento con Movimenti accanto alle categorie, Budget con la matita
sul tile) e tre dalla review desktop (N1 grafici FIRE, N2 tono del verdetto, N3 tabella Strumenti), più N4 (1280 come
desktop) che tocca ogni pagina e per questo va in una PR a sé, per prima (D-RU1). Ogni punto è una task piccola e
separata (§ 7); nessuna legge o scrive dati nuovi.

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
- «Impostazioni» è una voce in fondo alla Sidebar (la `TabletRail` ce l'ha già), oltre che nel menu utente (D-RU4).
- Il titolo della pagina Analisi resta quello che è oggi se non coincide: si allinea al menu («Analisi spese», N15).
- Prove: `__tests__/mobileSurfaces.test.ts`, `__tests__/perfRoutes.test.ts` (leggono gli array), `e2e/hall-of-fame.hof.spec.ts`,
  `e2e/motion.layout.spec.ts` (link per nome), `shell.boot*.spec.ts`, la spec tablet (rail).

### 5.4 R3 · Panoramica a due colonne (task RU2)

**Il DOM non cambia** (ordine: Patrimonio, Sintesi, Cashflow, Composizione, Costi, Obiettivo, Spese, Entrate, Asset,
Intestatari): sotto `desktop:` la Panoramica resta com'è e `mobile:census`/`mobile:budget` vedono lo stesso ordine delle righe.
A `desktop:` ogni cella ha `desktop:col-start-*` e `desktop:row-start-*` (l'esempio è il Movimenti di Patrimonio); il pezzo di
JSX che oggi tiene chiusa la seconda riga con un `div` vuoto sparisce.

```
QUANTO HO (colonne 1–7)                          COME VA IL MESE (colonne 8–12)
r1–r2  [Patrimonio totale 7 × 2 righe       ]    r1 [Cashflow del mese 5 ]
                                                 r2 [Spese per categoria 5]
r3     [Composizione 4][Asset principali 3]      r3–r4 [Entrate per categoria 5 × 2 righe]
r4     [Sintesi 3][Costi 2][Traguardo 2]*
(riga chiusa a desktop) Intestatari
```
\* Costi e Traguardo sono condizionali come oggi (`costsVisible`, `hasGoals`): con uno solo Sintesi 4 + quello 3; con nessuno
Sintesi 7. Senza `expenseStats` la colonna di destra è il solo Cashflow e Composizione/Asset passano a 4+3 come in sinistra.
Le altezze si **misurano sul render**: se una riga sbilancia, si regolano gli span di riga, mai il DOM.

- Due etichette di colonna («Quanto ho», «Come va il mese»), `TILE_EYEBROW_CLASS`, solo da `desktop:` (sotto la pagina è la
  composizione mobile, invariata).
- **Intestatari** diventa una riga chiusa anche a desktop (una disclosure come «Impostazioni» del Budget: `Collapsible`, chiusa; la
  sua risposta chiusa è `describeOverviewClosedAnswers`). Sotto `desktop:` era già una riga.
- Il verdetto non cambia in questa ondata (§ 9).
- Prove: `e2e/overview.spec.ts` (+ `overviewFixture.ts`; un'asserzione sulla posizione: l'eyebrow «Spese per categoria» sta
  nella prima schermata a 1440×900, oggi a 934 px), `overview.tablet.spec.ts`, `panoramica.snapshot.spec.ts`;
  `doc/guide/panoramica.md` (grafico delle posizioni).

### 5.5 R5 · Cashflow › Tracciamento (task RU3)

```
MESE                                         ANNO / DA INIZIO ANNO / STORICO
r1–r2 [Cashflow 5 × 2][Andamento del mese 7] r1–r2 [Cashflow 5 × 2][Risparmio nel tempo 7 × 2]
      [              ][Risparmio nel tempo 7]
r3–r4 [Movimenti 7 (feed)][Spese per cat. 5]  r3–r4 [Movimenti 7 (feed)][Spese per cat. 5]
      [                  ][Entrate per cat. 5]      [                  ][Entrate per cat. 5]
Con la vista «Tabella»: Movimenti 12 colonne, le categorie scendono sotto (Spese 7 · Entrate 5).
```

- DOM e ordine delle righe sotto `desktop:` come oggi (Spese, Entrate, Andamento, Risparmio, Movimenti): `col-start`/`row-start`.
- **Altezza**: Movimenti prende l'altezza dello stack Spese + Entrate (le due categorie decidono la riga; la lista scorre
  dentro, con la barra di scorrimento della piattaforma). La lista conserva la paginazione che c'è («Carica altri 20», «N di M
  voci»): non si introduce «Mostra tutti» (D-RU6). Altezza minima 480 px.
- Movimenti a 7 colonne è un **Feed**; la Tabella ha colonne a larghezza fissa e non ci sta: `desktopListView === 'table'` →
  12 colonne (come oggi).
- Ordine delle schede (`CASHFLOW_TABS_BASE` e le opzionali): Tracciamento · Budget · Divisione · Centri di Costo · Dividendi;
  l'URL, `VALID_CASHFLOW_TABS` e i `mountedTabs` non cambiano.
- L'ingranaggio di testata diventa «Categorie» e resta su Tracciamento (§ 5.6).
- Prove: `e2e/cashflow.tracciamento.spec.ts` (+ una nuova: Movimenti a sinistra delle categorie a 1440, a destra con
  «Tabella»), `cashflow.tablet.spec.ts`, `e2e/mobile-composition.cashflow.mobile.spec.ts` (invariata: ordine DOM).

### 5.6 R6 · Cashflow › Budget (task RU3)

- Il tile «Tetto del mese» riceve nell'`aside` una matita «Tetto e avvisi» (44 px sotto `desktop:`, 32 da `desktop:`) che apre
  un `ResponsiveModal` con **gli stessi due blocchi di oggi** («Tetto complessivo mensile» e «Avvisi soglia», stesso salvataggio
  a bozza `budget.*`, stesso stato «Salvato»); `BudgetImpostazioni` diventa il contenuto del modale, senza il `Collapsible`.
  Senza tetto (`overallMonthlyAmount == null`) il tile mostra la matita come azione primaria «Imposta il tetto» e il modale si
  apre da solo solo se l'utente lo ha chiesto (mai all'apertura della pagina).
- Spariscono: la disclosure in fondo, `SETTINGS_ID`, lo scroll dal pulsante a sliders del telefono (sotto `desktop:` il
  pulsante accanto a «Aggiungi budget» diventa la matita del tile) e l'ingranaggio di testata su Budget.
- Il tile «Avvisi» di Budget rimanda al modale («Cambia soglie»); l'interruttore dell'email settimanale resta dov'è.
- L'ingranaggio in testata su Tracciamento si chiama «Categorie» (`aria-label`, `title`) e porta alle categorie in
  Impostazioni › Spese; sulle altre tre schede (Dividendi, Divisione, Centri) resta com'è finché la scheda non ha il suo
  punto (§ 9).
- Prove: `e2e/cashflow.budget.spec.ts`, `cashflow.budget.mobile.spec.ts` (cerca «Impostazioni del budget»), `__tests__/budgetNarrative`.

### 5.7 N1 · L'asse dei grafici FIRE (task RU4)

Una funzione pura `resolveFireAxisCap` in `lib/utils/fireChartAxis.ts` (+ `__tests__/fireChartAxis.test.ts`):
- `R` = il più grande tra il valore della **Base (o della mediana)** all'ultimo anno tracciato e il massimo della linea del numero
  FIRE tracciata (se c'è); `T` = il massimo di tutte le serie e bande tracciate (Bull, 90° percentile).
- Se `T ≤ 2 × R` l'asse resta automatico (nessun cambio rispetto a oggi).
- Altrimenti il tetto è `C = niceCeil(1,25 × R)`, con `niceCeil(x)` il più piccolo `m × 10^k ≥ x` per `m ∈ {1, 2, 2,5, 5}`;
  `domain [min, C]` con `allowDataOverflow`, e la serie che esce ha una nota sotto il grafico: «Il 90° percentile esce dal
  grafico: a fine orizzonte arriva a 9,0 Mln €.» (Bull per i grafici a scenari). Il tooltip continua a mostrare i valori veri.
- Con deplezione il minimo resta 0 (lo fissa già il grafico).
- **Etichette**: una riga, mai tagliata. Larghezza della `YAxis` calcolata sull'etichetta più lunga (`formatCurrencyCompact` con
  spazi non separabili anche tra numero e «Mln»); un test E2E conta i `tspan` di ogni etichetta e vuole 1.
- Applicata ai cinque grafici di § 2 (What If compreso, perché usa lo stesso asse: D-RU8).

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

### 5.9 N3 · La tabella Strumenti a 1440 (task RU6)

- **Prezzi**: `formatCurrency(x, cur, 4)` diventa «la precisione che serve»: almeno 2 decimali, al più 4
  (`minimumFractionDigits: 2`, `maximumFractionDigits: 4`): 25 → «25,00 €»; 25,12 → «25,12 €»; 25,1234 → «25,1234 €». Prezzo e PMC
  nella tabella, e le stesse celle in `AssetRow` (telefono) dalla stessa funzione.
- **Azioni di riga**: visibili Registra operazione, Modifica ed Elimina (con l'armatura in riga di oggi); Calcola plusvalenze,
  Movimenti e il collegamento a Previdenza stanno in un menu «⋯» (`dropdown-menu`, voce con testo e tasto freccia, nome
  accessibile «Altre azioni su {nome}»; 44 px sotto `desktop:`; la riga mobile, `AssetRow`, non cambia).
- **Cestino grigio a riposo** (`text-muted-foreground`), rosso (`text-destructive`) al passaggio, al fuoco e armato.
- **Colonna sticky**: la larghezza dell'azione scende da ~6 pulsanti a 4.
- Obiettivo misurabile: a 1440, con le colonne prezzo accese e tre righe d'esempio, `scrollWidth ≤ clientWidth` del contenitore
  della tabella e l'ultima colonna interamente visibile; con «Andamento» resta com'è (non scorre già oggi).

### 5.10 N4 · 1280 servito come desktop (task RU0, PR a sé, per prima)

**Che cosa**: a 1280–1439 con puntatore fine (`pointer: fine`) la pagina è composta come a 1440: sidebar piena, griglia a 12
colonne, nessuna riga chiusa. Un tablet in orizzontale (1000–1439 senza puntatore fine) **non cambia**: resta la composizione da
tablet con i bersagli da 44 px. Sopra 1440 nulla cambia (un tablet da 1440+ è già desktop: punto cieco noto).

**Perché a sé**: tocca 1296 + 119 classi in 234 file attraverso un'unica definizione, e ogni pagina e `mobile:budget`. Se entra
nell'ondata, ogni altra misura di RU2–RU6 si fa su due larghezze contemporaneamente.

**Come (da verificare con uno spike prima di scrivere il resto)**: tre meccanismi, in ordine di rischio crescente.
1. *`@custom-variant desktop`* con una lista di query: `@media (width >= 1440px), ((width >= 1280px) and (pointer: fine))`, e
   `max-desktop` come `@media not (...)` equivalente. Una sola riga per variante; **da verificare**: l'ordine in cui Tailwind v4
   emette le varianti personalizzate rispetto a `tablet:` (un `tablet:col-span-2 desktop:col-span-12` deve restare in
   quest'ordine nel CSS), il comportamento dentro `@container` (`max-desktop:@[880px]:contents`) e il supporto di `not (… or …)` nei
   browser da servire.
2. *Variabile di tema a 1280* con una regola di rientro per il tocco: `--breakpoint-desktop: 1280px` e, sotto 1440 con
   `(pointer: coarse)`, la composizione da tablet via la variante `tablet-landscape`. Meno magia, ma ogni classe `desktop:` del
   tocco va riscritta.
3. *Rinunciare* e scrivere che sotto 1440 è tablet (la review lo ammette: «decidere o lasciare e scriverlo»).

Le query a mano si portano a **una costante** (`DESKTOP_QUERY` in `lib/hooks/useCompactLayout.ts`: `COMPACT_QUERY` ne è la
negazione): `PILL_VISIBLE_QUERY`, `components/ui/sidebar.tsx`, `VersamentiTile`, `FlussoTile`, `TabletRail`, `tablet-landscape`.
Un test (`__tests__/desktopQuery.test.ts`) tiene allineate CSS e costante, come `__tests__/vercelConfig.test.ts` fa per il resto.
Misure a 1280×800 con il mouse: tutte le pagine (`mobile:census` ha già lo scenario ampio), la sidebar (16rem) lascia 1024 px;
nessun tile da 2–3 colonne deve tagliare il contenuto (Costi a 2 colonne è il caso peggiore: ~160 px).

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

Sette task, una PR ciascuna, in quest'ordine (Sonnet 5.5 salvo diversa indicazione sulla card; RU0 e RU2 meritano Opus per
la parte di layout). Ogni PR corre `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run` sui file toccati e, per le pagine toccate, i loro `e2e/*.spec.ts` sugli emulatori; sul Mac
`mobile:census` + `mobile:budget` + `perf:budget` (lezione: misure e voci di budget nella stessa PR).

| Task | Contenuto | Tocca | Dipende da |
|------|-----------|-------|------------|
| **RU0** | N4: 1280 desktop (spike, poi `desktop` unico) | `app/globals.css`, `lib/hooks/useCompactLayout.ts`, sidebar, `navigation.ts`, ogni pagina | — (per prima) |
| **RU1** | P1–P3 in DESIGN.md, R1 parole, R2 menu | `navigation.ts`, `Sidebar`, `SecondaryMenuDrawer`, `TabletRail`, narrative di Patrimonio/FIRE/Allocazione, titoli | — |
| **RU2** | R3 Panoramica a due colonne (+ Intestatari chiusa) | `app/dashboard/page.tsx`, `IntestatariTile` | RU1 (parole), RU0 |
| **RU3** | R5 Tracciamento + schede in ordine + R6 Budget | `ExpenseTrackingTab`, `BudgetTab`, `BudgetImpostazioni`, `TettoTile`, `cashflow/page.tsx` | RU1, RU0 |
| **RU4** | N1 asse FIRE e etichette | sei grafici, `lib/utils/fireChartAxis.ts` | — |
| **RU5** | N2 tono neutro | `cashflowNarrative.ts`, `overviewNarrative.ts` | — |
| **RU6** | N3 tabella Strumenti | `StrumentiTile`, `AssetRow`, `formatters` | — |

RU4, RU5 e RU6 sono indipendenti dal resto e fra loro: possono partire in parallelo a RU1–RU3. Dopo l'ondata, **una sola**
rimisura di `mobile:budget` (prestazioni, proposta 7): ogni PR dichiara la voce toccata, la rimisura finale le chiude.

**Conflitti con altro lavoro** (aree che toccano gli stessi file; per «Non avviare due thread sulla stessa area»):
- F14 (cancellazione di asset, D4/M6/L1): `StrumentiTile`, `AssetDialog` → dopo RU6.
- F15 (movimento + desktop N5–N17): `ExpenseTrackingTab`, `TransactionFeed`, Movimenti → dopo RU3.
- F16 (ondate 2–3), F17 (Essenziale): dopo l'ondata 1.
- Indipendenti (backend, dati, sicurezza, CI, FIRE Q2/H1/H2/E1 se non toccano i grafici di § 5.7, rendimenti, dividendi): possono
  girare ora.

## 8. Decisioni

Proposte di questa specifica; la colonna «Stato» passa a **Presa** solo dopo la conferma di Giorgio nel thread.

| ID | Stato | Decisione | Alternative scartate e motivo |
|----|-------|-----------|-------------------------------|
| D-RU1 | Proposta | N4 in una PR a sé, **per prima** (RU0), con meccanismo scelto da uno spike (§ 5.10). | Dentro l'ondata: ogni misura su due larghezze insieme, una regressione non si attribuisce. Per ultima: RU2 e RU3 si misurerebbero due volte. |
| D-RU2 | Proposta | P1–P3 come tre *Named Rules* di DESIGN.md nella prima PR di parole (RU1), prima di spostare qualcosa. | Dopo lo spostamento: il riordino si disfa al prossimo tile aggiunto. Una regola sola: P1/P2/P3 si citano per nome. |
| D-RU3 | Proposta | R1 completa tranne la riga fissa «Portafoglio X su Y» di Allocazione e FIRE, che va con la striscia di R8 (ondata 2); identificatori e dati salvati invariati. | La riga ora: serve il portafoglio e il patrimonio in un solo hook di Allocazione, oggi non c'è. Parole nuove anche negli id: rompe cache e specifiche. |
| D-RU4 | Proposta | Menu per oggetto con Traguardi e Hall of Fame ancora dove sono (rotta e scheda in ondata 3); «Impostazioni» visibile in fondo alla Sidebar. | Tutto il menu di R2 subito: serve una rotta nuova e una scheda di Storico, due task. Impostazioni solo nel menu utente: due porte per le regolazioni (P2) ma nascosta. |
| D-RU5 | Proposta | Panoramica: due colonne con `col-start`/`row-start`, **DOM invariato**, etichette solo a desktop, Intestatari riga chiusa. | Due contenitori di colonna nel DOM: cambia l'ordine delle righe sul telefono (The First-Screen Rule vieta lo swap con `order`). Etichette anche sul telefono: ripete il verdetto e la riga «Il resto della pagina». |
| D-RU6 | Proposta | Tracciamento: Movimenti 7 colonne col Feed (12 con la Tabella), altezza dello stack delle categorie, «Carica altri» com'è. | «Mostra tutti» della review: introduce una seconda paginazione; il resto dell'app ha una sola. Movimenti sempre a 7: la Tabella ha colonne fisse e non ci sta. |
| D-RU7 | Proposta | Budget: matita sul tile → `ResponsiveModal` con i due blocchi di oggi; l'ingranaggio solo su Tracciamento («Categorie»), le altre tre schede come oggi. | Matita che apre in linea (accordion nel tile): il tile del tetto è la risposta della pagina, non deve crescere. Togliere l'ingranaggio anche da Dividendi/Divisione/Centri: perdono l'unica porta verso Impostazioni finché non hanno il loro punto. |
| D-RU8 | Proposta | N1: tetto `niceCeil(1,25 × max(Base/mediana, numero FIRE))` quando `T > 2 × R`, nota sotto il grafico, etichette su una riga; anche What If. | Tetto fisso al numero FIRE: nasconde il caso in cui la mediana lo supera. Scala logaritmica: i confronti tra scenari non si leggono. Escludere What If: stesso difetto, stesso asse. |
| D-RU9 | Proposta | N2: solo il tono diventa neutro quando il totale con il calendario è ≥ 0; parole invariate; mai `positive`. | Cambiare anche il titolo («in attesa dello stipendio»): inventa una promessa. Tono positivo: ripropone il difetto del 2026-09-14. |
| D-RU10 | Proposta | N3: prezzi 2–4 decimali; visibili Registra operazione, Modifica, Elimina; menu «⋯» per Plusvalenze, Movimenti, Previdenza; cestino grigio a riposo. | Eliminare dentro il menu: perde l'armatura in riga («Conferma»). Tutte le azioni in un menu: la più frequente (Registra) a due tocchi. |
| D-RU11 | Proposta | Il taglio del verdetto a desktop dietro «Dettagli» non è in questa ondata (§ 9). | Includerlo: `leadLength` è pensato per il telefono (a 0 il titolo da solo), a desktop servirebbe un secondo punto di taglio e una disclosure nuova. |
| D-RU12 | Proposta | Sette task, una PR ciascuna (§ 7), RU4–RU6 in parallelo al resto. | Una PR sola: ingestibile da rivedere e da misurare sul Mac. |

## 9. Punti aperti

- **Il verdetto della Panoramica a desktop**: «prima frase con al più quattro cifre, il resto dietro Dettagli» (R3). Prima va
  decisa una regola di taglio per desktop (oggi `leadLength` vale solo sotto `desktop:`).
- **Ingranaggio su Dividendi, Divisione, Centri di Costo**: portano tutti a `settings?tab=spese`, che per loro è la scheda
  sbagliata. Ognuna avrà la sua matita per P2 quando la sua pagina entra in un'ondata.
- **Dividendi in Rendimenti** (R2, punto aperto della review): non in questa ondata.
- **N5–N17** della review desktop: card F15, non qui; N15 (titolo = nome del menu) è inclusa solo per Patrimonio e Analisi spese.
- **Misura finale del budget mobile**: i valori nuovi vanno scritti in `perf/mobile-budget.json` con la PR; il Mac non è in questo thread.

## 10. Criteri di accettazione

Valori inventati e tondi (WORKFLOW.md regola 7).

**N1 · `resolveFireAxisCap`**
1. `R` = Base finale 1.800.000, numero FIRE massimo 1.000.000 → `R` = 1.800.000; `T` (Bull finale) = 9.000.000 > 3.600.000 →
   tetto = `niceCeil(2.250.000)` = **2.500.000**; la Base occupa il 72% dell'altezza; nota «Bull esce dal grafico: a fine orizzonte arriva a 9,0 Mln €».
2. `R` = 1.200.000, `T` = 2.000.000 ≤ 2.400.000 → asse automatico, nessuna nota.
3. `R` = 1.000.000, `T` = 2.100.000 > 2.000.000 → tetto = `niceCeil(1.250.000)` = **2.000.000**.
4. `R` = 0 o serie vuote → asse automatico (nessun tetto, nessuna divisione per zero).
5. Su ogni grafico delle schede Calcolatore, Coast, Dopo il FIRE e Proiezione, nessuna etichetta dell'asse ha più di un `tspan`; la
   prima etichetta non è tagliata (`getBBox().x ≥ 0`).

**N2 · tono**
6. Tracciamento, 15 del mese, entrate vissute 0, spese vissute 1.500, entrate in calendario 2.800, spese in calendario 400:
   totale = +900 → tono **neutral**, titolo invariato («… hai speso senza entrate»), sentenza del calendario invariata.
7. Stesso caso con entrate in calendario 1.000 → totale = −900 → tono **negative** (come oggi).
8. Panoramica, stessi numeri → tono **neutral**; con 1.000 → **warning**; con tasso vissuto ≥ 0 nulla cambia.
9. Una vendita tassata (`taxIsTheStory`) non è toccata dalla regola.

**N3 · Strumenti**
10. 25 → «25,00 €»; 25,12 → «25,12 €»; 25,1234 → «25,1234 €»; 25,10 → «25,10 €» (Prezzo e PMC, tabella e `AssetRow`).
11. A 1440×900, colonne prezzo accese: `scrollWidth ≤ clientWidth`, l'ultima colonna visibile; con «Andamento» uguale a oggi.
12. Il cestino è `muted-foreground` a riposo e `destructive` armato; «⋯» apre Calcola plusvalenze e Movimenti; Tab entra nel menu e Esc lo chiude con il fuoco sul «⋯».

**R3 / R5 / R6**
13. Panoramica a 1440×900 e 1280×800: l'eyebrow «Spese per categoria» è sopra la piega; le due etichette di colonna ci sono a desktop e non sotto `desktop:`; Intestatari chiusa si apre in linea.
14. Tracciamento a 1440 con il Feed: il box di Movimenti sta a sinistra di «Spese per categoria» e comincia sotto i 800 px; con «Tabella» occupa tutta la larghezza.
15. Le schede di Cashflow sono nell'ordine Tracciamento · Budget · Divisione · Centri di Costo · Dividendi (con le opzionali accese); un URL con `?tab=dividends` apre ancora Dividendi.
16. Budget: la matita apre il modale; cambiare il tetto salva (stesso stato «Salvato»), il fuoco torna alla matita; la riga «Impostazioni» e l'ingranaggio su Budget non ci sono più; l'ingranaggio di Tracciamento dice «Categorie».

**R1 / R2**
17. Nessuna occorrenza visibile di «Strumenti e conti», «Il portafoglio vale», «Verdetto del portafoglio»; la regione «Piano» di Bilanciamento è «Ordini»; il tile di Patrimonio è «Guadagno sul costo»; il Calcolatore dice «Verso il FIRE» e Traguardi resta in FIRE.
18. Il menu a 1440 ha i gruppi di § 5.3 e Impostazioni in fondo; sul telefono la pillola è invariata e «Altro» mostra gli stessi gruppi; `aria-current` e lo stato attivo di «Altro» funzionano per ogni rotta (`secondaryHrefs`).

**N4**
19. A 1280×800 con il mouse la pagina è composta come a 1440 (sidebar piena, griglia a 12 colonne, nessuna riga chiusa); a 1280×800 con tocco (`hasTouch`) resta la composizione da tablet; a 1440, 1024×768 e 390 nulla cambia (`mobile:census` e `mobile:budget` identici).
20. Un test tiene allineate CSS e `DESKTOP_QUERY`.
