# Composizione mobile delle superfici del fork — specifiche M1–M5

> Specifiche del passo M1–M5 del dossier `doc/contributi-upstream/README.md` (§ 5, § 6), scritte il 18/10/2026 leggendo
> il codice di `main` dopo la PR #124. Il dossier dice COSA si toglie sotto `desktop:` (§ 6.2, D-CU7–D-CU12); qui c'è COME,
> superficie per superficie, con i file, gli id, le parole e le prove. Le decisioni D-CU1–D-CU12 non si riaprono: dove il
> codice obbliga a precisarle, la precisazione è una decisione nuova (§ 8, D-CU13–D-CU20, **proposte, da confermare**).
> Le regole sono quelle di DESIGN.md (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row e
> Binding-Clause Rules); i primitivi e la pagina campione sono quelli di Hall of Fame (`doc/guide/hall-of-fame.md`
> § Composizione mobile). Nessuna riga di codice cambia con questo documento.

## 1. In breve

- **Tre PR di implementazione**, in fila (D-CU20): **A** = M1 + M5 (Allocazione › Accumulo, più il fixture del censimento con
  un piano e un modello), **B** = M3 (la testa della pagina FIRE: «Il mio piano» e «Ipotesi usate» sui sei tab),
  **C** = M2 + M4 (Proiezione composta; Età obiettivo, Sensibilità e Spesa sostenibile come righe chiuse). B e C toccano
  gli stessi file dei tab FIRE: mai in parallelo.
- **Cosa c'è già** (letto nel codice, quindi non si rifà): il Calendario del PAC è già una lista per mese che si espande
  (`AccumulationCalendarDialog.tsx`); l'anteprima del piano (`PlanDraftSidePanel`) sotto `desktop:` sta già sotto la
  tabella del passo; «Il mio piano» chiuso è già una riga di 44px senza cifre (`FirePlanBlock.tsx:149`); l'Esposizione è già
  una riga chiusa di Bilanciamento che legge i profili solo all'apertura (`doc/guide/allocazione.md` § Composizione mobile);
  le correlazioni di Impostazioni › Simulazioni sono già sei liste per classe, non una matrice
  (`MonteCarloCorrelationsTile.tsx`). M5 quindi non ha codice (D-CU18).
- **Il guadagno più grande è M3**: sul Calcolatore a 390 il fixture misura oggi 13 cifre fuori dal verdetto (obiettivo ≤ 5);
  circa cinque sono della riga «Ipotesi usate» sopra il verdetto (capitale, rendimento Base e reale, costi, spesa), che
  sta su tutti e sei i tab.
- **Due superfici nuove nel censimento** (D-CU19): `allocazione-accumulo` e `fire-proiezione`. Oggi `perf/mobile-budget.json`
  non le misura, e il fixture `census@example.com` non ha né un piano né un modello.
- **A 1440 nulla cambia** su nessuna superficie: ogni regola di questo documento vale sotto `desktop:`.

## 2. Le regole comuni a M1–M4

Le stesse di ogni pagina di upstream composta (`doc/guide/fire.md` § Composizione mobile è il modello più vicino):

- **Un controller per tab**: `useMobileSections({ route, tab, sections })` (`lib/hooks/useMobileSections.ts`), memoria
  `mobile-sections:<route>:<tab>` per dispositivo e browser, mai per account; nessun `defaultOpen` (tutte chiuse alla prima
  visita, «Il perché» compreso).
- **Il tile aperto** è il primo nel DOM, fuori dal controller, mai una riga; il suo grafico a 120px sotto `desktop:`
  (`max-desktop:min-h-[120px]`).
- **Le righe** sono i tile stessi con `collapse` e `asideWhenClosed`, nell'ordine del DOM, senza `order-*`; i wrapper a pila
  del desktop diventano `contents` sotto `desktop:` (come le due colonne dello Storico, `doc/guide/storico.md`), così ogni
  tile è un elemento della griglia composta.
- **Gli id** in una costante `<AREA>_SECTION_IDS` nel `*Summary.ts` della superficie, **le parole** (`<AREA>_CLOSED_ASIDES`)
  nel suo `*Narrative.ts`: in parole, mai una cifra né un conteggio di cifre.
- **La striscia** da un selettore puro `select<Area>Strip(...)` nel `*Summary.ts`, che LEGGE i riassunti già calcolati
  (mai un ricalcolo) e stampa esattamente la cifra che il verdetto o il tile stampano; l'identità sta in un test Vitest.
- **Il taglio**: il verdetto si taglia al primo punto (`cutAtFirstSentence(sentence, restLabel)`, `leadLength`), con
  `leadLength: 0` solo se la prima frase ristampa due o più celle (The Binding-Clause Rule).
- **768 e lo stage in orizzontale** dai costrutti di `lib/utils/tabletComposition.ts` (`useTabletComposition`,
  `useTabletStage`, `STAGE_CLASS`, `leadCellClass`, `PLAIN_GRID_CLASS`): a 768 due colonne, il tile aperto su entrambe, «Il
  resto» su una riga sua, le righe a due a due; in orizzontale (box ≥ 880px) a sinistra verdetto e tile aperto, a destra
  l'indice di 360px.
- **Le risposte delle righe chiuse** (solo nello stage in orizzontale) da una funzione pura `describe<Area>ClosedAnswers`
  nel `*Narrative.ts`, attraverso `RowAnswers`: una frase breve con al massimo UNA cifra che striscia, tile aperto e prima
  frase non stampano; `null` dove la riga non ha nulla da aggiungere.
- **Le assenze**: caricamento e lettura fallita restano dell'intero tab come oggi (`resolveSurfaceState`), senza righe né
  striscia; nessun `SectionSpec` porta `failed` salvo dove è detto.
- **La guida dell'area** riceve la sua `§ Composizione mobile` (fatto, non piano), e la nota «Fork (T5)» in testa a
  `doc/guide/fire.md` § Composizione mobile perde le superfici che entrano nella composizione; CLAUDE.md non cambia salvo la
  riga di stato.

## 3. M1 — Allocazione › Accumulo (PR A)

File: `components/allocation/AccumuloTab.tsx`, `components/allocation/tiles/{QuestoMese,ClassiDelPiano,PortafoglioModello,Obiettivi,PianiConclusi,AccumuloVuoto}Tile.tsx`,
`lib/utils/accumuloSummary.ts`, `lib/utils/accumulationNarrative.ts`, `lib/utils/weightOptimizerNarrative.ts` (solo le
parole), `app/dashboard/allocation/page.tsx` (nessun cambio atteso: il tab ha già il suo pannello).

### 3.1 Oggi

`AccumuloTab` disegna il verdetto (`buildAccumuloVerdict`) senza striscia né taglio, poi una griglia a 12 colonne con due
pile indipendenti: a sinistra Questo mese (se c'è un piano) e Portafoglio modello, a destra Classi del piano (piano attivo
non concluso) e Criteri del modello (`OBJECTIVES_TILE_EYEBROW`); poi Piani conclusi su tutta la riga. Senza piano,
AccumuloVuoto su tutta la riga in testa. Sotto `desktop:` una colonna, in quell'ordine.

### 3.2 La composizione

| Stato | Tile aperto | Striscia | Righe chiuse, ordine del DOM |
|---|---|---|---|
| Piano attivo | Questo mese | Rata di {mese} · Investito · {Classe} sopra/sotto | Portafoglio modello · Classi del piano · Criteri del modello · Piani conclusi (se ci sono) |
| Piano attivo concluso, bozza | Questo mese («Piano concluso», «Piano in bozza») | nessuna | Portafoglio modello · Criteri del modello · Piani conclusi |
| Nessun piano | AccumuloVuoto | nessuna | Portafoglio modello · Criteri del modello · Piani conclusi |

- **L'ordine delle righe è quello del DOM** (D-CU15): Portafoglio modello viene prima di Classi del piano perché sta nella
  pila di sinistra; il § 6.2 del dossier metteva Classi prima, ma solo un riordino CSS o una griglia riposizionata a 1440
  lo darebbe, e la prima è vietata, la seconda rischia i buchi che le due pile evitano.
- **Gli id e le parole** (`ACCUMULO_SECTION_IDS` in `accumuloSummary.ts`, `ACCUMULO_CLOSED_ASIDES` in
  `accumulationNarrative.ts`): `acc-modello` «pesi per strumento» · `acc-classi` «scostamento mese per mese» ·
  `acc-criteri` «cosa chiedi al modello» · `acc-conclusi` «piani chiusi e interrotti». Senza modello salvato la riga
  Portafoglio modello resta, con l'aside «nessun modello salvato».
- **La striscia** (`selectAccumuloStrip({ verdictInput, trajectory, currentIndex })`, D-CU16), solo nello stato attivo:
  - «Rata di {mese}» → `installmentTotalEur` (`currency`, la cifra del titolo del verdetto) → apre il tile aperto;
  - «Investito» → `investedEur` (`currency`, la cifra della frase «investiti finora …») → apre `acc-classi` se c'è la
    traiettoria, altrimenti il tile aperto;
  - «{Classe} sopra|sotto» → il `|pp|` della classe più lontana dal target al mese corrente, letto da
    `trajectory[clampedIndex]` (lo stesso punto che il cursore di Classi del piano mostra all'apertura) in `pp` con un
    decimale, tono `neutral` → apre `acc-classi`; `null` «tutte in soglia» con ogni classe nella banda, assente senza
    traiettoria.
  - Nessuna cifra è sollevata (`liftedFigures` nessuno): Questo mese non stampa né la rata intera come blocco a sé né
    l'investito.
- **Il taglio**: il titolo resta intero; la prima frase è «Rata 3 di 12, investiti finora X su Y.» (ristampa una sola
  cella, «Investito»: niente `leadLength: 0`); il rientro nella banda (`describeBandReentry`) diventa una frase sua dopo
  il punto e va dietro «Il perché · il rientro nella banda». Bozza, concluso, nessun piano: una frase, nessun taglio.
- **Il grafico che cede**: `ClassDriftChart` in Classi del piano a 120px sotto `desktop:` (oggi `height={180}`): l'altezza
  passa da prop a classe (`max-desktop:min-h-[120px]`), come i grafici FIRE. Il tile aperto (Questo mese) non ha grafico:
  se a 390 la prima riga chiusa resta sotto la pill, si dichiara `false` con `raisedBy` «Questo mese non ha una curva da
  cedere» (come Bilanciamento).
- **«Registra» e «Rivedi il piano»** restano nel tile aperto, a 44px (D-CU7). Il modale del piano non si compone: è un
  modale, non una pagina; `PlanDraftSidePanel` resta sotto la tabella come oggi (D-CU18).
- **Risposte nello stage**: Portafoglio modello «differisce su N strumenti» / «allineato al piano» (da
  `comparePlanToModel`, nessuna cifra in €) o `null` senza modello; Classi del piano «rientro a {mese}» o `null`; Criteri
  «{n} criteri» o `null`; Piani conclusi «ultimo a {mese}» (`null` se il nome supera 22 caratteri).
- **768**: Questo mese su due colonne, «Il resto» su una riga, Portafoglio modello accanto a Classi del piano, Criteri
  accanto a Piani conclusi (senza piani conclusi Criteri, solo, prende la riga).
- **Lo stato fallito**: la lettura fallita dei piani resta l'`ErrorNotice` dell'intero tab; quella del modello
  (`modelQuery.isError`, oggi `readFailed` dentro il tile) diventa una riga `failed`: si apre a ogni visita, l'eyebrow
  rosso se chiusa, il nodo live di `PageRest`.
- **La memoria**: `mobile-sections:allocation:accumulo`, distinta da quella di Bilanciamento (`mobile-sections:allocation`).

### 3.3 Prove di M1

- Vitest: `__tests__/accumuloSummary.test.ts` (la striscia: identità con verdetto e traiettoria, `null` «tutte in soglia»,
  nessuna cella fuori dallo stato attivo; le righe per stato), `__tests__/accumulationNarrative.test.ts` (il taglio, gli
  aside senza cifre, le risposte), `__tests__/tabletComposition.test.ts` (le classi del tab dalle costanti).
- E2E sul Mac: `e2e/accumulo.mobile.spec.ts` (390: tile aperto Questo mese, tre celle, la cella «{Classe}» apre Classi del
  piano con il fuoco sul trigger, pannelli chiusi vuoti e `inert`, memoria dopo un reload, nessun `order-*`, nessun
  overflow) e `e2e/accumulo.tablet.spec.ts` (768 e 1024×768), su un fixture E2E con un piano attivo e un modello (nuovo
  `scripts/seedAccumuloE2E.mts` o un'estensione di `seedEmulator.ts`: lo sceglie l'impl); `e2e/allocation.spec.ts` a 1440
  invariato più un caso Accumulo «nessun `-trigger`, striscia nascosta».

## 4. M2 — FIRE › Proiezione (PR C)

File: `components/fire-simulations/ProjectionTab.tsx`, `components/projection/tiles/*` (Tappe, Ventaglio, Scenari,
Parametri), `lib/utils/projectionSummary.ts`, `lib/utils/projectionNarrative.ts`, `doc/guide/fire-proiezione.md`.

### 4.1 Oggi

`FireAssumptionsRow` e `PageVerdict` (`buildProjectionVerdict`, senza striscia né taglio), poi una griglia: Tappe (12),
Ventaglio (8) | Scenari (4), Parametri (12), ProjectionDettaglio. Sotto `desktop:` una colonna in quell'ordine, ogni tile
aperto; il Ventaglio con `height="100%"`.

### 4.2 La composizione

- **Il tile aperto**: Tappe (D-CU12), primo nel DOM, mai una riga; non ha curva.
- **Le righe** (`PROJECTION_SECTION_IDS` in `projectionSummary.ts`, `PROJECTION_CLOSED_ASIDES` in `projectionNarrative.ts`):
  `proj-ventaglio` «scenario base, euro di oggi» · `proj-scenari` «orso, base e toro» · `proj-parametri` «capitale,
  pesi e orizzonte». Il Ventaglio, quando è aperto, a 120px sotto `desktop:`.
- **Senza corsa** (non calcolabile): Parametri è l'unico tile, su `PLAIN_GRID_CLASS` con `leadCellClass(false)`, nessuna
  riga, nessun `PageRest` (come Monte Carlo senza corsa). L'attesa della prima corsa automatica resta il
  `TileGridSkeleton` del tab.
- **La striscia** (`selectProjectionStrip(summary)`):
  - «Mediana tra {N} anni» → `scenarios.base.atHorizon.p50` (`currency`, la cifra del titolo) → apre `proj-ventaglio`;
    `null` «esaurito» quando il titolo dice «il portafoglio è esaurito in mediana»;
  - «Soglia» → `scenarios.base.atHorizon.probabilityAtLeast` (`percent`, con i decimali che il verdetto stampa) → apre
    `proj-scenari`; `null` «nessuna soglia» senza soglia.
  - Nessuna cifra sollevata: Tappe non ripete né la mediana né la probabilità come blocchi.
- **Il taglio**: la prima frase è «Tra 30 anni (nel 2056) il portafoglio vale X di oggi in mediana; più di Y in nove
  simulazioni su dieci, più di Z in una su dieci.» (ristampa una cella, la mediana); la soglia e la leva sono frasi dopo il
  punto, dietro «Il perché · la soglia», «la leva» o «la soglia e la leva» (`projectionRestLabel`).
- **Risposte nello stage**: Ventaglio «parte da {€ compatto}» (il capitale di partenza, che il primo schermo non stampa);
  Scenari «Orso {€ compatto}» (la mediana orso); Parametri `null` (un modulo, un inventario).
- **768**: Tappe su due colonne, «Il resto» su una riga, Ventaglio accanto a Scenari, Parametri sulla riga intera.
- **La memoria**: `mobile-sections:fire-simulations:proiezione`.
- **Le ipotesi**: la riga «Ipotesi usate» segue M3 come gli altri tab.

### 4.3 Prove di M2

Vitest `__tests__/projectionSummary.test.ts` e `__tests__/projectionNarrative.test.ts` (striscia, `null`, taglio,
risposte); E2E sul Mac: un caso Proiezione in `e2e/fire.mobile.spec.ts` (tile aperto, due celle, la cella Soglia apre
Scenari, il Ventaglio non monta finché la riga è chiusa) e la superficie `fire-proiezione` nel censimento.

## 5. M3 — la testa della pagina FIRE: «Il mio piano» e «Ipotesi usate» (PR B)

File: `components/fire-simulations/plan/FirePlanBlock.tsx`, `components/fire-simulations/FireAssumptionsRow.tsx`, i sei tab
che lo usano (`FireCalculatorTab`, `CoastFireTab`, `WhatIfAnalysisTab`, `MonteCarloTab`, `ProjectionTab`,
`GoalBasedInvestingTab`), `lib/utils/fireAssumptionsNarrative.ts`, `doc/guide/fire.md`.

### 5.1 «Il mio piano» (D-CU8, D-CU13)

- **Oggi è già quasi la riga chiusa del dossier**: un `Collapsible` fuori dai pannelli, chiuso alto 44px con l'eyebrow, lo
  stato («salvato nel profilo» o il punto ambra «Anteprima non salvata») e il chevron, senza cifre; aperto, quattro tile e
  «Salva il piano». Si apre da solo una volta per visita quando il piano non è scritto (RP5).
- **Sotto `desktop:` diventa la riga chiusa del sistema** (`TileRowShell`: 52px, `<h3>` con il bottone, `aria-expanded`,
  `aria-controls`, pannello vuoto e `inert` finché non si apre, apertura su CSS `ease-spring`), con una memoria sua,
  `mobile-sections:fire-simulations:piano`, comune ai sei tab. A 1440 resta il `Collapsible` di oggi.
- **L'aside resta in parole** (D-CU13): «salvato nel profilo» oppure «anteprima non salvata» in ambra. Il § 6.2 del
  dossier proponeva una risposta con le cifre del piano («44 anni → 55, 30.000 € l'anno, SWR 3,5%»): tre cifre sopra il
  verdetto di ogni tab, contro The Closed-Row Rule (un aside non porta cifre) e RP2 (le cifre del piano stanno nella riga
  delle ipotesi), e da sole consumerebbero tre delle cinque cifre del primo schermo.
- **RP5 resta a ogni larghezza**: con il piano non scritto la riga si apre da sola una volta per visita; i tab non hanno
  ancora un numero da dire, e la cosa da fare è scrivere il piano.
- I link `?piano=aperto|<campo>` e i bottoni «Il mio piano» dei chip aprono la riga e mettono il fuoco sul campo, come oggi.

### 5.2 «Ipotesi usate» (D-CU9, D-CU14)

- **Oggi**: due righe sopra il verdetto di ogni tab — capitale con la scomposizione, poi quattro chip (Rendimento Base ·
  reale, Costi, Spesa, Flussi) ciascuno con un popover (`describeCapitalRow`, `describeFireChips`).
- **Sotto `desktop:`** la riga non si disegna sopra il verdetto; diventa una riga di scope del `PageVerdict`, sotto la
  striscia: «Ipotesi: Base {r}% reale, costi {c}%» più un bottone «Dettagli» (44px) che apre UN popover con il capitale e
  la sua scomposizione e le quattro voci dei chip, ciascuna con i suoi link (`describeFireScopeLine(assumptions)` in
  `fireAssumptionsNarrative.ts`, le stesse parole e cifre dei chip). Due cifre invece di cinque, e dentro il verdetto
  (lo scope conta come verdetto nel censimento: `doc/guide/prima-schermata.md`).
- **Con il blocco pensione**: la riga del vincolo (`FireLockScope`) e quella delle ipotesi stanno insieme nello `scope`,
  il vincolo prima.
- **Traguardi** (`view="goals"`): la riga dice «Ipotesi: Base {r}% reale» e il popover dice che i traguardi non leggono i
  flussi, come il chip di oggi.
- **A 1440** `FireAssumptionsRow` resta dov'è, intera.

### 5.3 Prove di M3

Vitest `__tests__/fireAssumptionsNarrative.test.ts` (la riga: stesse cifre dei chip, la variante goals);
`e2e/fire.mobile.spec.ts`: a 390 nessun `fire-assumptions-row` sopra il verdetto, la riga di scope sotto la striscia,
«Dettagli» apre il popover con le quattro voci, la riga «Il mio piano» chiusa a 52px con la memoria fra due tab;
`e2e/fire.spec.ts` a 1440 invariato. Il censimento: le cinque superfici FIRE esistenti devono scendere di
`figuresOutsideVerdict` (le voci si stringono con `--tighten`, mai a mano).

## 6. M4 — Età obiettivo, Sensibilità, Spesa sostenibile come righe (PR C)

### 6.1 Calcolatore (D-CU10)

- `EtaObiettivoTile` e `SensibilitaTile` escono dalla griglia piana dopo lo stage ed entrano nell'indice dopo Scenari,
  come righe: `fire-eta` «cosa serve per smettere» · `fire-sensibilita` «anni al FIRE per spesa e risparmio» (in
  `FIRE_SECTION_IDS` e `FIRE_CLOSED_ASIDES`). Senza spese, Età obiettivo resta la riga con «non ancora calcolabile».
- **A 1440** le due tessere restano a tutta riga sotto la griglia del Calcolatore: nel DOM sono già dopo Scenari, quindi
  basta una cella `desktop:col-span-12` nella griglia composta.
- Il campo «spese di riferimento» della Sensibilità resta stato della pagina, come l'importo del Piano di Allocazione.
- **Risposte nello stage**: Età obiettivo «servono +{€ compatto} l'anno» o «basta il risparmio di oggi»; Sensibilità
  `null` (una tabella).
- **768**: Base accanto a Reddito, Scenari solo; Età obiettivo sola, Sensibilità sola (la tabella vuole la riga intera).
- Nessuna cella nuova nella striscia del Calcolatore.

### 6.2 Dopo il FIRE (D-CU10, D-CU17)

- `SpesaSostenibileTile` diventa la riga `mc-spesa` «euro di oggi, l'anno» (`SPESA_ASIDE` è già in parole), **ultima**
  nell'ordine: Scenari a confronto · Parametri · Spesa sostenibile (D-CU17). Nel DOM sta già dopo lo stage, e a 1440 resta
  la tessera a tutta riga di oggi.
- **La cella** «Spesa al 90%» (`selectMonteCarloStrip` riceve `sustainable`) → `rows[p = 0,9].base.withdrawal`
  (`currency`, la cifra che il verdetto stampa da `sustainableVerdictInput`) → apre `mc-spesa`; `null` «nessun prelievo regge» quando
  `withdrawal` è `null` o `0` (i due rami in cui il verdetto non stampa la cifra). La striscia passa da due a tre celle.
- **Risposta nello stage**: «al 95% {€ compatto}» (la riga 95% della tabella, che il primo schermo non stampa) o `null`.

### 6.3 Prove di M4

Vitest `__tests__/fireNarrative.test.ts` e `__tests__/monteCarloSummary.test.ts` (le righe nuove, la terza cella,
l'identità con il verdetto); `e2e/fire.mobile.spec.ts`: le cinque righe del Calcolatore in ordine, la cella «Spesa al
90%» apre la riga con il fuoco; `e2e/fire.spec.ts` a 1440 invariato.

## 7. M5 — Esposizione e Impostazioni › Simulazioni (nessun codice)

- **Esposizione**: è già una riga chiusa di Bilanciamento con la lettura all'apertura e la riga fallita
  (`doc/guide/allocazione.md` § Composizione mobile). Il commutatore delle cinque viste (`AsideToggle`) va a capo su due
  righe a 390 invece di scorrere: si tiene così (D-CU18), perché una pillola che scorre nasconde due viste dietro un gesto.
  La prova è un caso in `e2e/allocation.mobile.spec.ts`: riga aperta a 390, cinque viste visibili, nessun overflow.
- **Impostazioni › Simulazioni**: Impostazioni non è composta; le correlazioni sono già sei liste per classe, aperte
  quelle delle classi in portafoglio. Nessuna modifica; la riga del § 6.2 del dossier si chiude come «già soddisfatta».

## 8. Il censimento (D-CU19)

- **Due superfici nuove** in `perf/mobile-budget.json`: `allocazione-accumulo` (`/dashboard/allocation?tab=accumulo`, tab
  «Accumulo») e `fire-proiezione` (`/dashboard/fire-simulations`, tab «Proiezione»), `target: true`.
  `__tests__/mobileSurfaces.test.ts` le accetta già (le rotte restano quelle della shell).
- **Il fixture** `census@example.com` (`scripts/seedCensusE2E.mts`) riceve un modello (`modelPortfolios/{uid}`) e un piano
  attivo di 12 rate iniziato due mesi prima della corsa, con la rata corrente aperta e nessuna riga registrata: uno stato
  che vale dal 5 al penultimo giorno (la regola del fixture, `doc/guide/prima-schermata.md`). Cifre inventate e tonde
  (WORKFLOW.md § 1 regola 7). `accumulationPlans` e `modelPortfolios` entrano in `USER_COLLECTIONS`/`PER_USER_DOCS` del
  seed, così la risemina li cancella.
- **Le prime voci** delle due superfici nascono dal misurato, con `raisedBy` che dice «prima misura» dove la prima riga
  chiusa resta sotto la pill; le voci delle superfici FIRE esistenti si stringono con `--tighten` dopo M3, sulla macchina
  dell'ultimo `--tighten` (chiedere a Giorgio).
- Tutte le misure si fanno **sul Mac di Giorgio**, mai nel cloud: emulatori, `perf:build`, `mobile:census`,
  `mobile:budget`, le spec `.mobile` e `.tablet`.

## 9. Criteri di accettazione

Quelli del dossier (§ 9, «Di ogni M»), più:
- a 390 `figuresOutsideVerdict` ≤ 5 su `allocazione-accumulo` e `fire-proiezione`; dopo M3, sul Calcolatore, almeno 4 cifre in
  meno di oggi (13 → ≤ 9) e su Coast, What If, Dopo il FIRE e Traguardi lo stesso verso;
- `mobile:budget` verde su 21 superfici × 3 viewport (63 voci);
- a 1440 nessuna differenza: `e2e/allocation.spec.ts`, `e2e/fire.spec.ts`, `e2e/fire.degraded.spec.ts` verdi senza modifiche
  ai loro casi esistenti;
- `tsc`, eslint (`npx eslint app components lib types e2e scripts __tests__`) e Vitest verdi sotto `TZ=Europe/Rome` e `TZ=UTC`.

## 10. Decisioni proposte (da confermare)

| ID | Proposta | Alternative scartate e motivo |
|---|---|---|
| **D-CU13** | «Il mio piano» sotto `desktop:` è una riga chiusa con l'aside in parole («salvato nel profilo» / «anteprima non salvata»); RP5 resta | *Le cifre del piano nella riga* (§ 6.2): un aside non porta cifre, RP2 le mette nelle ipotesi, e costano tre cifre su cinque del primo schermo |
| **D-CU14** | «Ipotesi usate» sotto `desktop:` è la riga di scope «Ipotesi: Base r% reale, costi c%» con «Dettagli», un popover che tiene capitale e quattro voci | *Quattro chip sotto la striscia*: cinque cifre e due righe, il problema di oggi spostato di poco. *Solo il bottone senza cifre*: il rendimento cambia il senso di ogni cifra (The Binding-Clause Rule) |
| **D-CU15** | Accumulo: le righe nell'ordine del DOM, Portafoglio modello · Classi del piano · Criteri · Piani conclusi | *Classi del piano prima* (§ 6.2): vuole un riordino CSS (vietato) o una griglia riposizionata a 1440, con il rischio dei buchi che le due pile evitano |
| **D-CU16** | Striscia di Accumulo: Rata di {mese} · Investito · {Classe} sopra/sotto | *«Rate fatte k di N»* (D-CU11): «3 di 12» non è un formato della striscia, servirebbe un formato nuovo nel primitivo di upstream; il conteggio resta nella prima frase |
| **D-CU17** | Dopo il FIRE: Spesa sostenibile ultima riga, dopo Scenari e Parametri | *Prima riga* (§ 6.2): a 1440 la tessera sta dopo lo stage, e spostarla nel DOM cambierebbe il desktop; la cella «Spesa al 90%» la apre comunque |
| **D-CU18** | Nessun codice per M5 e per l'anteprima del modale: il commutatore dell'Esposizione va a capo, le correlazioni sono già liste, `PlanDraftSidePanel` sta già sotto la tabella | *Pillola che scorre*: nasconde due viste dietro un gesto. *Anteprima come riga chiusa nel modale*: un modale non si compone |
| **D-CU19** | Due superfici nuove nel censimento (`allocazione-accumulo`, `fire-proiezione`) e il fixture con un piano attivo e un modello | *Misurare solo sul mirror*: il mirror non è deterministico e non fa budget |
| **D-CU20** | Tre PR impl in fila: A (M1 + M5 + fixture), B (M3), C (M2 + M4); A per prima perché U1 (Accumulo verso upstream) la aspetta | *Una PR per M*: cinque PR, tre delle quali sugli stessi file FIRE. *Una PR sola*: troppo grande per un collaudo sul Mac in una sessione |
