# Riordino della UI, ondata 3 (dossier)

> Card Todoist «F16 FEAT riordino UI ondate 2–3» (label `epic-review-fable`), parte «Ondata 3». Fonti: review «Riordino della UI
> e modalità basic» (Fable, 2026-11-12; Library `riordino-ui/parte-3-proposta-riordino.md` § R2, R7, R9, `parte-2-diagnosi.md`
> § G7, T5, pagina https://claude.ai/artifact/1YV1mnG77bMMUHXcSwED3S), review «Prestazioni reali» proposta 6 (P6). Le ondate
> prima: `doc/riordino-ui/README.md` (ondata 1, D-RU1…D-RU14) e `doc/riordino-ui/ondata-2.md` (D-RU15…D-RU24), più
> `doc/allocazione-strategia/README.md` (D-ST*). Vincoli da rispettare: `doc/essenziale/README.md` (F17, D-ES1…D-ES19, prese) e
> RU9 (`ondata-2.md` § 5.2, non ancora in main). Il calendario delle spese ha il suo dossier: `doc/calendario-spese/README.md`
> (D-CS1…D-CS8), che questa ondata rivede in un punto (D-CS1).
>
> **Stato: specifica scritta il 2026-11-25 su main `c47998c`; decisioni D-RU25…D-RU35 PRESE da Giorgio il 2026-11-25 («ok per tutto») (§ 8).**
> **RU10 (2026-11-26): implementata** (§ 11). Schizzi «oggi / proposta» (WORKFLOW.md regola 8): https://claude.ai/artifact/QasTFvrzao8ZLSuYGjkH3r (§ 1.1).

## 1. In breve

L'ondata 3 chiude la review del riordino. Tre cose, nessun dato salvato cambia forma:

- **R9 · FIRE**: la pagina si chiama «FIRE»; da sei schede a tre, **Quando · E se… · Approfondimenti** (Coast FIRE, Dopo il FIRE
  e Proiezione dentro Approfondimenti, scelti con una pillola nell'asse del verdetto); i Parametri delle due simulazioni diventano
  una riga chiusa sopra i risultati; la testata dice «Capitale X su Y di patrimonio»; «Casa nel patrimonio FIRE» entra in «Il mio
  piano».
- **R2 completo · Traguardi** diventa una pagina sua (`/dashboard/traguardi`) nel gruppo Futuro: FIRE · Traguardi · Previdenza.
  **Hall of Fame** resta una pagina del gruppo Storia (proposta: non diventa una scheda di Storico, § 5.3).
- **R7 · Analisi spese**: le categorie salgono alla prima riga, «cosa è cambiato» (Fuori scala, Spese maggiori) alla seconda; il
  Calendario delle spese dell'anno diventa **12 mesi × 31 giorni** (rivede D-CS1); col mese scelto e sul telefono resta com'è.

E P6 su FIRE: solo «Quando» nel JS iniziale della pagina (oggi anche la Proiezione).

### 1.1 Dove sono gli schizzi

Pagina «oggi / proposta»: https://claude.ai/artifact/QasTFvrzao8ZLSuYGjkH3r (sorgente in Library `riordino-ui/ondata-3/schizzi.html`). Sono schizzi a blocchi con cifre
inventate, non render dell'app: le decisioni di questa ondata sono di struttura (schede, rotte, ordine, griglia). I render veri
sul census si fanno nelle PR, prima della richiesta di review, come in RU7.

## 2. Stato di partenza (letto nel codice, main `c47998c`)

- **FIRE** (`app/dashboard/fire-simulations/page.tsx`, 173 righe). Titolo «FIRE e Simulazioni», voce di menu uguale. Sei schede in
  `TABS` e in `FIRE_TAB_VALUES` (`lib/utils/firePlan.ts`): `fire` Calcolatore FIRE (`shortLabel` Calcolatore) · `coast` Coast FIRE ·
  `whatif` What If · `montecarlo` Dopo il FIRE · `proiezione` Proiezione · `goals` Traguardi. «Il mio piano» (`FirePlanBlock`) fra
  testata e barra delle schede, una bozza sola (`useFirePlanDraft`, `FirePlanContext`) letta da tutte le schede con
  `useFireSettings()`; fuori dal provider `useFireSettings()` legge le impostazioni salvate (nessun errore). La pagina legge
  `?tab=` e `?piano=aperto|<campo>`. Nel JS iniziale: Calcolatore e Proiezione; Coast, What If, Dopo il FIRE e Traguardi sono
  `lazyComponent` precaricati in idle. JS iniziale 878,4 KB gz (tetto in `perf/budget.json`, F12).
  - Dopo il FIRE e Proiezione: verdetto · risultati · **Parametri 12** sotto (con «Prova», ~600 px a 1440); senza corsa Parametri è
    l'unico tile; con F12 la corsa automatica all'apertura passa dal deposito.
  - Sotto `desktop:` ogni scheda è composta con la sua memoria `mobile-sections:fire-simulations:<tab>`; «Il mio piano» ha la sua
    (`…:piano`), una per le sei schede.
  - Link in ingresso: `?piano=aperto` (Impostazioni › Preferenze e Simulazioni), `?piano=eta` (Strategia), `?piano=<campo>`
    (`FireAssumptionsRow`), `/dashboard/fire-simulations` (`assetUsage` R13). Nessun link nel codice a `?tab=goals` o ad altre
    schede; le spec E2E aprono la pagina e cliccano la scheda per nome (`fire*`, `coast*`, `motion.*`, `bundle.lazy`).
  - Census mobile: sei voci `fire-*` in `perf/mobile-budget.json` con `tab` = etichetta della scheda.
- **Traguardi** (`GoalBasedInvestingTab`): con `goalBasedInvestingEnabled` spento mostra lo stato vuoto con l'invito ad
  accenderlo; la scheda c'è sempre. Legge il piano (`useWhatIfBaseline`) per l'effetto di un traguardo sull'anno FIRE (O1) e le
  ipotesi (`useFireAssumptions`). La Panoramica ha il tile «Traguardo/Traguardi» (`ObiettivoTile`), senza link alla scheda.
  Centri di Costo e Divisione invece **non** hanno la scheda quando sono spenti (`app/dashboard/cashflow/page.tsx`).
- **Menu** (`lib/constants/navigation.ts`, `navGroups`): Panoramica · Entrate e spese (Cashflow, Analisi spese) · Investimenti
  (Patrimonio, Allocazione, Rendimenti) · Futuro (FIRE e Simulazioni, Previdenza) · Storia (Storico, Hall of Fame); poi
  Assistente e Impostazioni. Da `band:` ogni gruppo è un nome della fascia e le sue pagine sono linguette sul bordo
  (`lib/utils/folderNav.ts`, D-FD14): Storico e Hall of Fame sono **già** due linguette di «Storia».
- **Storico** (`app/dashboard/history/page.tsx`) non ha schede. **Hall of Fame** (`app/dashboard/hall-of-fame/page.tsx`, 635 righe)
  è una pagina con verdetto, un documento `hall-of-fame/{uid}`, la sua composizione mobile (pagina d'esempio della guida).
- **Analisi spese** (`components/cashflow/AnalisiTab.tsx`): DOM e griglia da `desktop:` = Periodo 5 (due righe) · Fuori scala 3
  (solo con un mese) · Spese maggiori 4 (7 senza mese) · Spese per categoria 4 · Entrate per categoria 3 · Calendario 12 · Scheda 12
  · Flusso 12. Calendario (`CalendarioTile`, `lib/utils/spendingCalendar.ts`): anno = 53 settimane in colonna × 7 giorni in riga,
  mese = calendario del mese; in `history` non c'è (D-CS1). Sotto `desktop:` la riga chiusa `analisi-calendario` mostra un mese
  alla volta (D-CS8).
- **Essenziale (F17, decisioni prese, implementazione dopo RU9)**: aree `fire` (porte: voce di menu, schede Calcolatore e What
  If) e `simulazioni` (schede Coast FIRE, Dopo il FIRE, Proiezione; Impostazioni › Avanzate). D-ES9: finché l'ondata 3 non dà
  una voce ai Traguardi, con FIRE spenta la voce FIRE si chiama «Traguardi». D-ES11: Storico e Hall of Fame restano accese.
  § 5.1 del dossier: «l'ondata 3 cambia solo righe» della tabella delle aree.

## 3. Obiettivo e perimetro

**Obiettivo**: FIRE dice per prima la risposta («quando») e tiene il metodo dietro una porta sola; i Traguardi si trovano senza
sapere che stanno sotto FIRE; in Analisi spese la domanda della pagina («dove vanno i soldi») è la prima riga e il calendario
si legge per mese, come il resto della pagina.

**Incluso**
- R9 (§ 5.1), con la riga «Capitale X su Y» (rimandata da D-RU3/D-ST7) e «Casa nel patrimonio FIRE» in «Il mio piano» (punto
  aperto di `ondata-2.md` § 9, D-RU24).
- Traguardi come pagina (§ 5.2); Hall of Fame nel menu (§ 5.3).
- R7: ordine di Analisi e calendario 12 × 31 (§ 5.4), con la revisione di D-CS1 scritta anche in `doc/calendario-spese/README.md`.
- P6 su FIRE (§ 5.5) e il pavimento `fire-calcolatore` @768 della card «Comporre Impostazioni sul telefono» (§ 5.6).

**Escluso**
- Dividendi in Rendimenti (punto aperto di R2): resta una scheda di Cashflow.
- I tile da esperti chiusi a 1440 (D-ES17, card sua).
- Il taglio del verdetto a desktop (D-RU11).
- Ogni cambio di calcolo FIRE: le cifre di ogni scheda restano quelle di oggi, float per float.
- Il dato unico dei gruppi (card M4/L2/L3/L5).

## 4. Casi d'uso

1. **Apro FIRE.** Vedo «Il mio piano», poi tre schede; si apre «Quando» (il Calcolatore di oggi) con il suo verdetto.
2. **Voglio sapere se reggo dopo il FIRE.** Scheda «Approfondimenti», nella pillola dell'asse scelgo «Dopo il FIRE»: verdetto,
   probabilità, scenari; i parametri sono una riga chiusa sopra i risultati che apro solo se voglio cambiarli.
3. **Torno su FIRE il giorno dopo.** La pagina riapre «Quando»; dentro Approfondimenti ritrovo l'ultima vista scelta nella
   sessione.
4. **Cerco la casa al mare.** Menu › Futuro › Traguardi. La pagina ha il suo verdetto e le sue tre aree; un traguardo «Alla
   scadenza lo spendo» dice ancora di quanto sposta l'anno FIRE.
5. **Non uso i traguardi.** Con «Traguardi di investimento» spento la voce non c'è (come Centri di Costo); un vecchio link apre la
   pagina con lo stato vuoto e il link a Impostazioni.
6. **Ho un segnalibro `?tab=montecarlo`.** Arrivo in Approfondimenti › Dopo il FIRE. `?tab=goals` porta a `/dashboard/traguardi`.
7. **Apro Analisi spese su «Anno corrente».** In prima riga Periodo, Spese per categoria, Entrate per categoria; il calendario è
   una riga per mese, una colonna per giorno: l'affitto del 5 è una colonna scura, agosto una riga piena.

## 5. Regole

### 5.1 R9 · FIRE (task RU10)

**Nome**: titolo della pagina e voce di menu **«FIRE»** (N15: titolo = nome del menu). `ariaLabel` delle schede «Sezioni di FIRE».
Rotta, chiavi di cache, `mobile-sections:fire-simulations:*` e `FirePlanContext` invariati.

**Schede** (`TABS`, `FIRE_TAB_VALUES`):

| Scheda (`?tab=`) | Etichetta | Contenuto | Area Essenziale |
|---|---|---|---|
| `quando` (si apre per prima) | **Quando** | `FireCalculatorTab` com'è | `fire` |
| `ese` | **E se…** | `WhatIfAnalysisTab` com'è | `fire` |
| `approfondimenti` | **Approfondimenti** | una pillola «Coast FIRE · Dopo il FIRE · Proiezione» e sotto la vista scelta: `CoastFireTab`, `MonteCarloTab`, `ProjectionTab` | `simulazioni` |

- **La pillola di Approfondimenti** è l'**asse** della scheda (`SegmentedPill`, come il periodo di Analisi), non una terza barra
  di navigazione: da `desktop:` sta a destra del verdetto della vista (lo slot `axis` di `PageVerdict`), sotto `desktop:` sopra il
  verdetto, a tutta larghezza, tre segmenti con le parole intere (a 390: «Coast · Dopo il FIRE · Proiezione», `shortLabel` Coast).
  Ogni vista ha il suo verdetto, la sua striscia, il suo «Il resto della pagina» (le composizioni di oggi, invariate).
- **URL**: `?tab=approfondimenti&vista=coast|dopo|proiezione`; senza `vista` la prima della sessione (`sessionStorage`
  `fire.approfondimenti.vista`, try/catch), poi `coast`. Cambiare vista fa `router.replace` (il tasto indietro non scorre le viste).
- **Alias** (`resolveFireTab(tab, vista)`, puro, testato): `fire` → `quando`; `whatif` → `ese`; `coast` → `approfondimenti` +
  `coast`; `montecarlo` → `approfondimenti` + `dopo`; `proiezione` → `approfondimenti` + `proiezione`; `goals` →
  `router.replace('/dashboard/traguardi')` (§ 5.2). Gli id vecchi restano accettati per i segnalibri e per «Vai a Coast» del
  Calcolatore (`onOpenCoast` apre `approfondimenti` + `coast`).
- **Parametri come riga chiusa** (Dopo il FIRE, Proiezione): da `desktop:` il tile Parametri lascia il fondo e diventa una riga
  chiusa **sotto il verdetto e sopra i risultati**, con la forma di «Il mio piano» (`TileRowShell`, eyebrow «Parametri», aside in
  parole: «come il piano» / «modificati, premi Prova»; mai una cifra). Aperta, il tile di oggi, intero, con «Prova». La riga è
  chiusa all'apertura e si ricorda per dispositivo (`mobile-sections:fire-simulations:<vista>`, la chiave che la riga ha già sotto
  `desktop:`: una memoria sola per le due larghezze). **Senza una corsa da mostrare** (piano incompleto) Parametri resta l'unico
  tile, aperto, come oggi. Lo stato Stale-Run (form diverso dalla corsa mostrata) apre la riga da sola e l'aside lo dice.
- **Un solo bottone pieno per scheda**: «Prova» resta `default` dentro Parametri; con la riga chiusa nessun bottone pieno è
  visibile (il piano ha «Salva il piano» solo quando è aperto, come oggi).
- **Testata**: `PageHeader` riceve la descrizione **«Capitale 16.000 € su 300.000 € di patrimonio · fuori: Casa, Fondo
  pensione»** (D-RU30), su tutte le schede. Il capitale è `assumptions.capital.total` (K1/EF1: portafoglio più la liquidità fuori
  oltre il fondo di emergenza, cioè la cifra «Capitale» del popover delle ipotesi, non il portafoglio di Allocazione); il
  patrimonio è quello di Patrimonio; «fuori» nomina i primi due asset non contati per valore (casa, fondo pensione bloccato,
  crypto), «e altri N». Una funzione pura `describeFireHeader` in `fireAssumptionsNarrative.ts`, accanto a `describeCapitalRow`
  (stesso input), sul modello di `describeAllocazioneHeader`. Senza capitale (piano non letto): nessuna descrizione.
- **«Casa nel patrimonio FIRE»** (D-RU31): l'interruttore `includePrimaryResidenceInFIRE` entra in «Il mio piano», nella sezione del
  capitale accanto al fondo di emergenza, con la riga «Agisce su: tutte le schede» (`FIRE_PLAN_AFFECTS`); entra nella bozza del
  piano e si salva con «Salva il piano». Esce da Impostazioni › Investimenti › «Patrimonio nel FIRE» (che RU9 crea con quel solo
  campo): il tile sparisce e la riga «Si regola altrove» di Investimenti già rimanda a «Piano FIRE: FIRE › Il mio piano»
  (aggiungere «casa» all'elenco tra parentesi). La fetta `investimenti` di `settingsDraft.ts` perde il campo; la rilettura prima
  di «Salva» di Impostazioni garantisce che un salvataggio da Impostazioni non lo riporti indietro (stesso schema di M1).
- **Ipotesi e link**: `describeReturnsChip` e gli altri chip che oggi rimandano a `?tab=simulazioni`/`?tab=generale` seguono gli
  id di RU9 (`avanzate`, `investimenti`) se RU9 è già in main; altrimenti li aggiorna RU9 (è nella sua lista di link).
- **Il mio piano**: «Agisce su: …» (`FIRE_PLAN_AFFECTS`) usa i nomi nuovi: «Quando, E se…, Coast FIRE» ecc. (le viste di
  Approfondimenti per nome, perché il campo agisce su una vista e non su tutte e tre).
- **Sotto `desktop:`**: la pillola delle schede ha tre voci con le parole intere (oggi sei, con `shortLabel`). Le composizioni
  delle viste non cambiano; il census le misura con la vista scelta (§ 6.3).

### 5.2 Traguardi come pagina (task RU11)

- **Rotta nuova** `app/dashboard/traguardi/page.tsx`: titolo «Traguardi», `GoalBasedInvestingTab` montato com'è dentro
  `PageContainer` (non lazy: è il contenuto della pagina). **Nessun «Il mio piano»** sulla pagina: i Traguardi leggono il piano
  salvato (`useFireSettings()` senza provider → impostazioni salvate) e la riga d'ambito del verdetto (`FireVerdictScope view="goals"`)
  porta già i link «Il mio piano» verso `/dashboard/fire-simulations?piano=…`.
- **Menu**: `navGroups` › Futuro = **FIRE · Traguardi · Previdenza** (icona `Target`). La voce c'è **solo con
  `goalBasedInvestingEnabled` acceso** (come le schede Centri di Costo e Divisione): `navGroups` resta la lista completa e i
  lettori del menu (Sidebar, foglio «Altro», fascia/`folderNav`, `secondaryHrefs`) la filtrano con una funzione pura
  `visibleNavGroups(groups, { goalsEnabled })` in `navUtils.ts`. F17 la assorbe in `resolveNavGroups(areas, account)` (stessa firma
  per la parte dell'account, D-ES9 cade).
- **La pagina con l'interruttore spento** (link vecchio, segnalibro): lo stato vuoto di oggi, con il link a Impostazioni ›
  Funzioni (`?tab=funzioni`, o `?tab=generale` se RU9 non è in main). Nessun redirect.
- **Mobile**: la composizione della scheda Traguardi di oggi, con la sua chiave che cambia rotta: `useMobileSections({ route:
  'traguardi', … })` (la memoria vecchia `…:fire-simulations:goals` si perde una volta: righe chiuse riaperte, nessun dato). Il
  census: voce `fire-obiettivi` → `traguardi` (`path: /dashboard/traguardi`, senza `tab`).
- **Panoramica**: il tile Traguardo/Traguardi riceve un piè «Apri Traguardi» verso la pagina (oggi non porta da nessuna parte; P1:
  il riassunto rimanda a casa).
- **Essenziale**: nella tabella delle aree Traguardi non è un'area (resta dell'account); con FIRE spenta la voce FIRE sparisce e
  quella Traguardi resta. D-ES9 è superata (§ 7, dipendenze).

### 5.3 Hall of Fame (nessuna task, o task RU11 se cambia nome)

- **D-RU33: resta una pagina, nel gruppo Storia accanto a Storico.** La review voleva togliere una voce di primo
  livello per una pagina aperta poche volte l'anno; con la fascia (D-FD14) Hall of Fame **non è più di primo livello**: è la
  seconda linguetta del gruppo Storia, cioè proprio la «scheda di Storico» della review, senza una barra di schede in più dentro
  la pagina. Sul telefono resta una riga del foglio «Altro» sotto Storia.
- Fusa come scheda di Storico (proposta di Fable) produrrebbe a 1440 il gruppo Storia con **una** linguetta e, sotto, una barra
  di schede «Andamento · Record»: due file di schede per due pagine. Costo in più: schede in Storico, chiavi mobili che cambiano,
  P6 su Storico, la pagina d'esempio della guida mobile da riscrivere.
- Nome: resta «Hall of Fame» (alternativa in D-RU33: «Record», come nella review).

### 5.4 R7 · Analisi spese (task RU12)

**Ordine da `desktop:`** (12 colonne):

| Riga | Celle con un mese | Celle senza mese (anno, ytd, storico) |
|---|---|---|
| 1–2 | Periodo **5** (due righe) · Spese per categoria **4** · Entrate per categoria **3** | uguale |
| 2 | · Fuori scala **3** · Spese maggiori **4** | · Spese maggiori **7** |
| 3 | Calendario **12** | Calendario **12** (non in `history`) |
| 4… | Scheda **12**, Flusso **12** come oggi | uguale |

- **DOM** (D-RU34): Periodo · Spese · Entrate · Fuori scala · Spese maggiori · Calendario · Scheda · Flusso. Le categorie si
  spostano nel DOM (non con `order`, P3), così sul telefono le righe chiuse seguono: Spese, Entrate, Fuori scala, Spese
  maggiori, Calendario, Scheda, Flusso. `ANALISI_SECTIONS` segue lo stesso ordine (id invariati, una memoria salvata resta valida).
  La composizione tablet legge il DOM (`useTabletComposition`).
- **Il calendario dell'anno** (D-RU35, rivede D-CS1): per `ytd`, `current`, `year`:
  - **una riga per mese** (gennaio in alto), **una colonna per giorno del mese** (1…31); le celle dei giorni che il mese non ha
    (30–31 febbraio, 31 aprile…) non ci sono (spazio vuoto, non interattive); in `ytd` le righe vanno da gennaio al mese di oggi.
  - Etichette: il mese a sinistra di ogni riga («gen», «feb», …); sopra le colonne i numeri 1, 5, 10, 15, 20, 25, 31 (gli altri
    senza testo).
  - **Sabato e domenica**: un segno leggero sotto la cella (un trattino di 2 px in `--muted-foreground` al 40%), mai un colore di
    fondo: il fondo resta della spesa (D-CS3/D-CS4 invariate: quattro gradini di `--flow-out`, giorno senza spesa `--muted`,
    giorni futuri con il tratteggio, oggi con l'anello).
  - Celle quadrate, larghezza = (larghezza del tile − etichette) / 31 con 3 px di spazio: a 1440 nel tile da 12 circa 34 px, a
    1280 col mouse circa 30 px; altezza uguale alla larghezza, tetto 28 px (dodici righe ≈ 370 px). Nessun numero dentro la cella
    (il nome accessibile e il popover lo dicono).
  - **Tastiera** (`useRovingFocus`, una fermata di Tab): ←→ giorno nello stesso mese, ↑↓ stesso giorno nel mese prima/dopo (se il
    mese non ha quel giorno, l'ultimo giorno del mese); Home/Fine primo/ultimo giorno del mese; Invio o spazio apre il popover.
  - `buildSpendingCalendar` non cambia (dà già i giorni del periodo con `weekday`); cambia solo la disposizione: una funzione pura
    nuova `layoutYearByMonth(calendar)` → `{ month, cells: (Day | null)[31] }[]`, testata.
  - Lettura, legenda, popover, pillola «Tutte · Solo variabili», risposta chiusa del tablet: invariati. La frase sul giorno della
    settimana più caro resta: è ciò che la griglia per mese non mostra più a colpo d'occhio.
- **Col mese scelto** il calendario del mese di oggi (7 colonne); **sotto `desktop:`** la riga chiusa con un mese alla volta (D-CS8);
  **a 768** la regola di D-CS8 («griglia dell'anno se le celle stanno a 10 px») vale con la griglia nuova: 31 colonne a 10 px
  chiedono ~420 px, quindi a 768 in una colonna intera la griglia per mese entra, in mezza colonna no (mese).
- `doc/calendario-spese/README.md`: D-CS1 riscritta come «rivista da D-RU35», § 5.2 e § 6.2 aggiornati nella PR.

### 5.5 P6 su FIRE (in RU10)

- Nel JS iniziale della pagina resta solo **Quando** (con «Il mio piano»). `ProjectionTab` diventa `lazyComponent` come le altre
  viste; E se…, Coast, Dopo il FIRE, Proiezione precaricati in idle quando le letture del Calcolatore sono arrivate, come oggi.
  `GoalBasedInvestingTab` esce dalla pagina (va a `/dashboard/traguardi`, RU11): se RU11 arriva dopo RU10, resta lazy lì.
- `?tab=approfondimenti` all'apertura: il fallback è lo scheletro della vista (`tabSkeletons.ts`), la pillola è già disegnata.
- Il tetto di `/dashboard/fire-simulations` in `perf/budget.json` scende nella stessa PR (misura sul Mac, `raisedBy` «abbassato»);
  `/dashboard/traguardi` entra in `perf/budget.json` e `perf/routes.json` con la sua misura.

### 5.6 Il pavimento del Calcolatore @768 (card «Comporre Impostazioni sul telefono», punto 2)

Si rimisura in RU10 con `mobile:census` (la scheda si chiama «Quando», la barra ha tre voci invece di sei, più corta di una
riga a 768): se `tilesAboveFold` torna al pavimento la voce si stringe; se no, resta un punto della card, che a fine RU10 si
aggiorna con ciò che resta.

## 6. Interfaccia

### 6.1 Accessibilità
- La pillola di Approfondimenti è un `radiogroup` con nome «Vista di Approfondimenti»; cambiarla non sposta il fuoco e annuncia il
  nuovo verdetto con la regione `aria-live` che il verdetto ha già.
- La riga Parametri è un `button` con `aria-expanded` e `aria-controls` come «Il mio piano».
- Calendario: nome di ogni cella invariato («{g} {mese}: {T}»); la griglia ha `role="grid"` con una riga per mese
  (`role="row"`, nome «{mese}»).
- Gli alias di `?tab=` e il redirect a Traguardi usano `replace`.

### 6.2 Movimento
- Cambio di vista in Approfondimenti: lo stesso passaggio delle schede (`StepSlide`/scena della pagina di oggi, nessun movimento
  nuovo). Il calendario: `transition-colors` di D-CS invariato.

### 6.3 Composizione mobile e census
- FIRE: le voci `fire-calcolatore` (tab «Quando»), `fire-what-if` («E se…»), `fire-coast`, `fire-monte-carlo`, `fire-proiezione`
  (tab «Approfondimenti» + vista: il census impara a scegliere la vista, `scripts/mobileCensus.mjs` accetta `vista`) si
  rimisurano in RU10; `fire-obiettivi` diventa `traguardi` in RU11.
- Analisi: l'ordine delle righe chiuse cambia (§ 5.4): `mobile:budget` di `analisi` si rimisura in RU12.

## 7. Piano

Tre task, una PR ciascuna. **Modello**: RU10 su Opus 5.5 (schede, alias, Parametri spostati in due viste, «Il mio piano» e la
bozza di Impostazioni); RU11 e RU12 su Sonnet 5.5. Ogni PR: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts
__tests__`, `TZ=Europe/Rome npx vitest run` sui file toccati, gli `e2e/*.spec.ts` toccati sugli emulatori (cloud); sul Mac
`perf:build` + `perf:budget`, `mobile:census` + `mobile:budget`, giudizio visivo.

| Task | Contenuto | Tocca | Dipende da |
|------|-----------|-------|------------|
| **RU10** | R9 FIRE (§ 5.1), P6 (§ 5.5), pavimento @768 (§ 5.6) | `app/dashboard/fire-simulations/page.tsx`, `firePlan.ts` (tab, alias, `FIRE_PLAN_AFFECTS`), nuovo `ApprofondimentiTab`, `MonteCarloTab`/`ProjectionTab` (Parametri come riga), `FirePlanBlock` (casa), `fireAssumptionsNarrative.ts` (`describeFireHeader`), `navigation.ts` (nome), `settingsDraft.ts` (campo casa), `doc/guide/fire*.md`, spec `fire*`, `coast*`, `motion.*`, `bundle.lazy`, census | RU9 (per «casa» e i link di Impostazioni); dopo ES1 è più semplice (§ sotto) |
| **RU11** | Traguardi come pagina (§ 5.2) (+ nome di Hall of Fame se D-RU33 sceglie «Record») | nuova rotta, `navigation.ts`, `navUtils.ts`, `folderNav.ts`, `SecondaryMenuDrawer`, `ObiettivoTile`, `doc/guide/fire-obiettivi.md`, `perf/*.json`, spec `fire*` dei Traguardi, census | RU10 (la scheda esce dalla pagina FIRE) |
| **RU12** | R7 Analisi (§ 5.4) | `AnalisiTab.tsx`, `analisiSummary.ts`, `CalendarioTile.tsx`, `spendingCalendar.ts` (`layoutYearByMonth`), `doc/calendario-spese/README.md`, `doc/guide/cashflow-analisi.md`, spec `analisi*` | — (può partire subito) |

**Ordine con Essenziale e RU9.** RU9 viene prima di RU10 (RU10 sposta un campo dalla scheda Investimenti che RU9 crea e usa gli
id nuovi di Impostazioni). F17 (ES1, ES2) viene dopo RU9 per D-ES19. Ordine (D-RU25): **RU12 subito**, poi RU9 → ES1 → ES2 →
RU10 → RU11. ES1 nasce con la tabella delle aree sulle sei schede di oggi e con l'eccezione D-ES9; RU10 e RU11 cambiano solo righe
di quella tabella (Calcolatore + What If → `quando` + `ese`; Coast + Dopo il FIRE + Proiezione → `approfondimenti`; Traguardi voce
sua, D-ES9 tolta) e `resolveNavGroups` riceve la regola di § 5.2. Alternativa: RU10–RU11 prima di ES1, se l'amico entra più tardi
(ES1 allora nasce già sulle schede nuove e senza D-ES9).

**Conflitti**: RU10 tocca `settingsDraft.ts` (un campo) dopo RU9; RU11 tocca `navigation.ts`, che ES1 tocca (`resolveNavGroups`):
chi arriva secondo ripassa l'altro. RU12 non tocca file di altre task aperte.

## 8. Decisioni

**Prese da Giorgio il 2026-11-25** («ok per tutto»); le alternative sono quelle degli schizzi. D-RU33: nome «Hall of Fame» invariato.

| ID | Stato | Decisione | Alternative scartate e motivo |
|----|-------|-----------|-------------------------------|
| D-RU25 | **Presa** (2026-11-25) | Tre task: RU12 Analisi subito; RU10 FIRE e RU11 Traguardi dopo RU9 ed ES1/ES2, in quest'ordine. | RU10 prima di RU9: «casa» si sposterebbe da una scheda di Impostazioni che RU9 sta per ridisegnare. RU10 prima di ES1: possibile (vedi § 7), ma rimanda l'ingresso dell'amico. Una PR sola: FIRE, menu e Analisi in un diff, tre giri di misura. |
| D-RU26 | **Presa** (2026-11-25) | FIRE in tre schede **Quando · E se… · Approfondimenti**; Coast, Dopo il FIRE, Proiezione scelti con una pillola nell'**asse** del verdetto di Approfondimenti (`?vista=`), ricordata nella sessione. | Cinque schede piatte (Quando · E se… · Coast · Dopo il FIRE · Proiezione, tolti i Traguardi): meno lavoro, ma restano cinque pari e il metodo pesa quanto la risposta (G7). Pillola come seconda barra di schede: con la fascia sarebbero quattro livelli di navigazione (gruppo, pagina, scheda, sotto-scheda). Approfondimenti come una pagina sola con le tre viste impilate: tre simulazioni montate insieme, peso e calcolo triplicati. |
| D-RU27 | **Presa** (2026-11-25) | Pagina e voce di menu «FIRE»; id delle schede nuovi (`quando`, `ese`, `approfondimenti`) con alias per i vecchi; `goals` → `/dashboard/traguardi`. | Tenere «FIRE e Simulazioni»: somma un acronimo e un metodo (G7) e le Simulazioni ora sono una scheda. Tenere gli id vecchi come valori: `fire` per «Quando» e `coast` per una vista confondono chi legge il codice. |
| D-RU28 | **Presa** (2026-11-25) | Parametri di Dopo il FIRE e Proiezione: riga chiusa sopra i risultati, aperta da sola quando il form non è quello della corsa mostrata; senza corsa resta l'unico tile aperto. | Lasciarli in fondo: 600 px sotto i risultati, e chi li cambia non vede il bottone. Aperti in testa: spingono i risultati sotto la piega. Toglierli e spostare tutto in «Il mio piano»: sono prove, non il piano (`ParametriTile`: «la corsa non si salva»). |
| D-RU29 | **Presa** (2026-11-25) | Traguardi pagina sua `/dashboard/traguardi` in Futuro (FIRE · Traguardi · Previdenza), voce visibile solo con «Traguardi di investimento» acceso; nessun «Il mio piano» sulla pagina, i link della riga d'ambito portano a FIRE. | Voce sempre visibile: un utente senza traguardi vede una pagina vuota nel menu (Centri di Costo e Divisione non lo fanno). «Il mio piano» anche qui: due porte per lo stesso piano, e Traguardi lo legge senza cambiarlo. Traguardi resta in FIRE: chi ha FIRE spenta in Essenziale non li troverebbe (D-ES9 resterebbe un ripiego). |
| D-RU30 | **Presa** (2026-11-25) | Testata di FIRE «Capitale X su Y di patrimonio · fuori: …» con il capitale delle ipotesi (K1/EF1). | «Portafoglio X su Y» come Allocazione: in FIRE il capitale non è il portafoglio (aggiunge la liquidità oltre il fondo), e due cifre diverse con lo stesso nome sono il difetto di R1. Nessuna testata: la cifra resta dentro il popover delle ipotesi, due clic. |
| D-RU31 | **Presa** (2026-11-25) | «Casa nel patrimonio FIRE» entra in «Il mio piano» (sezione capitale) ed esce da Impostazioni › Investimenti. | Lasciarla in Investimenti (D-RU24 provvisoria): la legge solo FIRE, quindi per P2 sta sulla pagina. In Patrimonio, nel dialogo della casa: è una scelta del piano, non dello strumento. |
| D-RU32 | **Presa** (2026-11-25) | P6: solo «Quando» nel JS iniziale di FIRE; la Proiezione diventa un chunk; il tetto scende nella stessa PR. | Lasciare la Proiezione nel JS iniziale: era lì come seconda scheda per frequenza; dentro Approfondimenti non si apre mai per prima. |
| D-RU33 | **Presa** (2026-11-25) | Hall of Fame resta una pagina, seconda linguetta di Storia; nome invariato. | Scheda «Record» di Storico (review): con la fascia diventano due file di schede per due pagine, e chiavi mobili da rifare. Rinominarla «Record» senza fonderla: più chiaro per chi non conosce l'inglese, ma cambia una parola che c'è da mesi (scelta di gusto: dimmi tu). |
| D-RU34 | **Presa** (2026-11-25) | Analisi: categorie in prima riga e **spostate nel DOM** (Spese, Entrate prima di Fuori scala e Spese maggiori), anche sul telefono. | Solo con `row-start`/`col-start` (DOM invariato): a 1440 il lettore di schermo legge per prima la seconda riga; sul telefono le righe chiuse resterebbero in un ordine diverso da quello visto a 1440. |
| D-RU35 | **Presa** (2026-11-25) | Calendario dell'anno 12 mesi × 31 giorni, sabato e domenica con un trattino sotto la cella, frase sul giorno della settimana invariata; col mese e sul telefono com'è (rivede D-CS1). | Tenere le 53 settimane: le spese legate al giorno del mese (affitto, rate, stipendio) restano diagonali. Weekend colorato in fondo: si confonde con i gradini di spesa. Numero del giorno in ogni cella: 372 numeri a 30 px, rumore. |

## 9. Punti aperti

- **Ordine rispetto a ES1** (D-RU25, presa): ES1/ES2 prima di RU10–RU11; se l'amico entrasse più tardi si può invertire (§ 7).
- **Render sul census**: le PR li fanno prima della review (Approfondimenti a 1440 e 390, Parametri chiusi, calendario 12 × 31 con
  i dati di `seedAnalisiE2E`).
- **«E se…» a 390**: tre parole intere nella pillola stanno (stima ~300 px su 358); se la misura le smentisce, `shortLabel`
  «Approf.».

## 10. Criteri di accettazione

Valori inventati e tondi (WORKFLOW.md regola 7).

**R9 · FIRE**
1. Tre schede nell'ordine Quando · E se… · Approfondimenti; senza `?tab=` si apre Quando; titolo e voce di menu «FIRE».
2. `resolveFireTab` (Vitest): `fire`→`quando`; `whatif`→`ese`; `coast`/`montecarlo`/`proiezione` → `approfondimenti` con vista
   `coast`/`dopo`/`proiezione`; `goals` → redirect; valore ignoto → `quando`; `approfondimenti` senza vista → vista della sessione,
   altrimenti `coast`.
3. Le cifre di ogni vista sono identiche a oggi (le spec `fire*`/`coast*` esistenti, aggiornate solo nella navigazione, restano
   verdi sugli stessi valori).
4. Dopo il FIRE con una corsa: la riga Parametri sta fra verdetto e risultati, chiusa; aprendola si vede «Prova». Cambiando un campo
   e richiudendo, l'aside dice «modificati, premi Prova». Senza corsa (piano incompleto) Parametri è aperto e unico.
5. Testata: capitale 116.000 € (portafoglio 100.000 € + liquidità fuori 26.000 € − fondo 10.000 €), patrimonio 400.000 €, fuori
   Casa 250.000 € e Fondo pensione 34.000 € → «Capitale 116.000 € su 400.000 € di patrimonio · fuori: Casa, Fondo pensione»
   (`describeFireHeader`, Vitest); con tre esclusi «… e un altro».
6. «Casa nel patrimonio FIRE» in Il mio piano: acceso e salvato, il Calcolatore conta la casa come oggi con
   `includePrimaryResidenceInFIRE = true`; nessun campo casa in Impostazioni; un «Salva» di Impostazioni aperta da prima non lo
   riporta indietro (test su `setSettings` vero, come il criterio 12 di `ondata-2.md`).
7. JS iniziale di `/dashboard/fire-simulations` sotto il tetto di oggi (878,4 KB) misurato sul Mac; aprire Approfondimenti dopo il
   precaricamento non mostra lo scheletro.

**Traguardi**
8. Con «Traguardi di investimento» acceso: voce «Traguardi» in Futuro fra FIRE e Previdenza (Sidebar, foglio «Altro», fascia);
   spento: nessuna voce, la pagina aperta da link mostra lo stato vuoto con il link a Impostazioni.
9. `/dashboard/fire-simulations?tab=goals` porta a `/dashboard/traguardi` e il tasto indietro torna alla pagina di prima.
10. Un traguardo da 30.000 € «Alla scadenza lo spendo» nel 2030 sposta l'anno FIRE come oggi (stessa frase della Traiettoria).
11. Il tile Traguardi della Panoramica ha «Apri Traguardi».

**Hall of Fame**
12. Nessun cambiamento (D-RU33).

**R7 · Analisi**
13. A 1440 con «Anno corrente»: Spese per categoria e Entrate per categoria hanno lo stesso `top` del Periodo; Spese maggiori sta
    sotto, a destra del Periodo. Ordine degli `h3` nel DOM: Periodo, Spese per categoria, Entrate per categoria, (Fuori scala),
    Spese maggiori, Calendario, …
14. `layoutYearByMonth` (Vitest) sul 2025: 12 righe; febbraio ha 28 celle e 3 `null`; aprile 30 e 1 `null`; in `ytd` al 15 marzo
    3 righe. Una spesa di 900 € il 5 di ogni mese cade sempre nella colonna 5.
15. Tastiera: dal 31 gennaio ↓ va al 28 febbraio; dal 10 marzo → va all'11 marzo; ↑ dal 10 gennaio non esce dalla griglia.
16. Sabato e domenica hanno il trattino, gli altri giorni no; il fondo della cella dipende solo dalla spesa.
17. Col mese scelto il calendario del mese è identico a oggi; a 390 la riga chiusa e ‹ › sono identiche a oggi; `mobile:budget`
    di `analisi` verde con l'ordine nuovo delle righe chiuse.

## 11. RU10 — come è andata (2026-11-26)

Fatto come da § 5.1, § 5.5 e § 5.6, con queste scelte di esecuzione (guida: `doc/guide/fire.md` § RU10):

- **Traguardi resta una quarta scheda finché RU11 non è in main** (Giorgio, 2026-11-26): senza, tra le due PR i Traguardi non avrebbero avuto una porta. Gli id `goals`, la voce D-ES9 di Essenziale e la riga `fire-obiettivi` del census restano come sono; RU11 li toglie. `resolveFireTab('goals')` oggi ritorna la scheda, non il redirect del criterio 2.
- **Parametri a 1440 senza `order-*`**: la cella usa `desktop:row-start-1` (la regola «nessun `order-*`» è nel codice e in `fire.mobile.spec.ts`); il DOM e le righe del telefono non cambiano, a 1440 il bottone della riga viene dopo i risultati nell'ordine del Tab. Spostare la cella nel DOM cambierebbe l'ordine delle righe del telefono: tema per un giro di giudizio, non deciso qui.
- **La pillola la disegna `ApprofondimentiTab`, non il verdetto** di ogni vista: una sola istanza a ogni larghezza (sopra il verdetto sul telefono, a destra da `desktop:`), presente anche mentre la vista carica e senza perdere il fuoco al cambio. Lo slot `axis` di `PageVerdict` non è usato.
- **«Casa nel patrimonio FIRE»**: «Agisce su: Quando» e non «tutte le schede», perché oggi solo il patrimonio del Calcolatore la legge (`FireCalculatorTab`, PDF, Panoramica); `?piano=casa` apre il campo.
- **Lo stato stale apre la riga da sé a ogni larghezza** (anche sul telefono, dove oggi mostrava solo l'aside): `useStaleOpenCollapse`.
- **Alias in `VIEW_ROUTES`** anche per `coast`/`montecarlo`/`proiezione`, così la riga «non è nel tuo menu» di un vecchio segnalibro nomina ancora `simulazioni`.
- **Da fare sul Mac** (WORKFLOW § 3): `perf:build` + `perf:budget` (il tetto di `/dashboard/fire-simulations`, 878,4 KB, scende; `raisedBy` «abbassato»), `mobile:census` + `mobile:budget` per le cinque voci `fire-*` (con `vista`) e il pavimento `fire-calcolatore` @768 (§ 5.6), il giudizio visivo a 1440 e 390 (pillola a destra del verdetto, riga Parametri chiusa, testata, «Casa» in Il mio piano, «E se…» a 390 — se non sta, `shortLabel` «Approf.»).
