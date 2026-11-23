# Riordino della UI, ondata 2 (dossier)

> Card Todoist «F16 FEAT riordino UI ondate 2–3» (label `epic-review-fable`), parte «Ondata 2». Fonti: review «Riordino della UI
> e modalità basic» (Fable, 2026-11-12; Library `riordino-ui/parte-3-proposta-riordino.md` § R4, R8, R10, pagina
> https://claude.ai/artifact/1YV1mnG77bMMUHXcSwED3S), review «Prestazioni reali» proposta 6 (Library `prestazioni-reali.html`),
> card «Fable minori · Pesi per strumento… (M4, L2, L3, L5)» e card «Comporre Impostazioni sul telefono…». L'ondata 1 è
> `doc/riordino-ui/README.md` (P1–P3 in DESIGN.md, D-RU1…D-RU14). **R8 ha un dossier suo**: `doc/allocazione-strategia/README.md`
> (D-ST1…D-ST9); qui ci sono R4, R10, il piano comune e P6.
>
> **Stato: specifica scritta il 2026-11-23 su main `7e930b1`; decisioni D-RU15…D-RU24 PROPOSTE, da confermare con Giorgio (§ 8).**
> I render «oggi» sono l'app vera sugli emulatori (account `census@example.com`, 1440×900, tema Lime Frost); i render
> «proposta» di R4 e di Bilanciamento/Accumulo sono la stessa pagina con le celle vere spostate da uno script, quelli di
> Strategia e di Impostazioni sono composti dai tile veri ritagliati. Pagina «oggi / proposta» (WORKFLOW.md regola 8):
> vedi § 1.

## 1. In breve

L'ondata 2 sposta tre cose, senza toccare dati salvati:

- **R4 Patrimonio**: la tabella Strumenti sale alla seconda riga (a 1440×900 la sua testata passa da 1160 a circa 640 px sul
  census), il tile del totale diventa basso (curva a 80 px), «Liquidità» si chiama «Conti», «Movimenti del mese» si chiama
  «Operazioni del mese».
- **R8 Allocazione** (dossier suo): una terza scheda **Strategia** con i target per classe (l'editor lascia Impostazioni),
  il portafoglio modello e i criteri; una striscia «Target → Modello → Piano → Rata» sotto le schede; Accumulo resta
  l'esecuzione del mese.
- **R10 Impostazioni**: da sette schede a cinque, **Account · Funzioni · Cashflow · Investimenti · Avanzate**, raggruppate per
  «di chi è la regolazione»; i tile di sola lettura lasciano il posto a una riga «Si regola altrove».

E una regola di prestazioni (P6): le schede che non si aprono per prime diventano chunk caricati all'apertura, nella stessa PR
che le ritaglia.

Pagina «oggi / proposta»: https://claude.ai/artifact/PX7cHRp5vwvo6nVCnaQegD (§ 1.1).

### 1.1 Dove sono i render

Pagina pubblicata con il thread «Specificare l'ondata 2 del riordino» (2026-11-23). I file sorgente dei render sono nella
Library `riordino-ui/ondata-2/` (png). Lo script che sposta le celle è un usa-e-getta del thread, non nel repo.

## 2. Stato di partenza (letto nel codice, main `7e930b1`, e misurato sul census a 1440×900)

- **Patrimonio** (`app/dashboard/assets/page.tsx`, ~950 righe). Griglia a 12 colonne; DOM: Patrimonio totale lordo
  (`PatrimonioTile`, lo stesso della Panoramica e della landing; 5 colonne, due righe, curva `min-h-[180px]` da `desktop:`)
  · Movimenti del mese (4, `col-start-9 row-start-1`) · Liquidità (3, `col-start-6 row-start-1`) · Classi 3 · Guadagno sul
  costo 4 · Intestatari 12 (solo con due membri) · Mutuo/Prestito 12 per prestito · Strumenti 12. Misure (eyebrow, px dal
  bordo superiore del documento): totale 281, Liquidità e Movimenti 281, Classi e Guadagno 528, Intestatari 940,
  **Strumenti 1160**. Sotto `desktop:` THE tile è il totale e le righe chiuse sono in ordine DOM (`PATRIMONIO_SECTION_IDS`;
  390: Movimenti 834 · Liquidità 900 · Classi 966 · Guadagno 1032 · Intestatari 1098 · Strumenti 1164).
- **Impostazioni** (`app/dashboard/settings/page.tsx` + `components/settings/tabs/*Tab.tsx`, una bozza unica
  `settingsDraftReducer` con una fetta per scheda, `lib/utils/settingsDraft.ts`). Sette schede e i loro tile:

  | Scheda (`?tab=`) | Tile (eyebrow) | Sola lettura |
  |---|---|---|
  | Allocazione (`allocazione`, default) | Allocazione target · Auto-calcolo Azioni / Obbligazioni (età letta da FIRE, risk-free, interruttore della formula) · Target per classe · Criteri del modello (`IdealAllocationSummary`) | Allocazione target, Criteri del modello |
  | Preferenze (`generale`) | Calcolo dei rendimenti · Costi (bollo) · FIRE e traguardi (casa nel FIRE, Traguardi di investimento, Allocazione derivata dai traguardi) · Cashflow (reddito da lavoro, anno di inizio, Centri di Costo, Divisione) · Famiglia · Email periodiche · Parametri del piano · Assistente | Parametri del piano, Assistente |
  | Spese (`spese`) | Conti di default · Commissioni bancarie · Ruoli 50/30/20 · Import CSV · Categorie | — |
  | Dividendi (`dividendi`) | Entrate da dividendi · BTP Italia | BTP Italia |
  | Simulazioni (`simulazioni`) | Ipotesi di mercato · Correlazioni · Scaglioni IRPEF · Dove si usano | Dove si usano |
  | Condivisione (`condivisione`) | Condivisione account · Come funziona | Come funziona |
  | Aspetto (`aspetto`) | Modalità · Tema colori (si salvano da soli) | — |

  Sette tile di sola lettura. Altezza a 1440: Preferenze ~1830 px, Spese ~1515, Simulazioni ~2700. Nessuna composizione mobile
  per scelta (`doc/guide/impostazioni.md` § Composizione mobile); in `perf/mobile-budget.json` la voce `impostazioni` è
  `target: false`, e la PR #202 ne ha alzate 9 (card «Comporre Impostazioni sul telefono»).
- **Link verso Impostazioni** con una scheda: `?tab=dividendi` (ingranaggio di Dividendi, D-RU7), `?tab=spese` (ingranaggio di
  Tracciamento, `ExpenseDialog`), `?tab=generale` (`AvvisiTile` del Budget), `?tab=simulazioni` (Parametri di Dopo il FIRE e
  Proiezione, `fireAssumptionsNarrative`), `?tab=allocazione` (`fireAssumptionsNarrative`, `weightOptimizerNarrative`); senza
  scheda da Allocazione («Modifica target», `PerClasseTile`), Rendimenti, Storico, Previdenza, `AssetDialog`, il menu.
- **Interruttori di funzione oggi**: Centri di Costo e Divisione (tile Cashflow), Traguardi di investimento (tile FIRE e
  traguardi), Ruoli 50/30/20 (Spese), Imposta di bollo (Costi). **Non esistono** un interruttore del Budget né dell'Assistente
  (l'Assistente dipende dal flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`): R10 di Fable li elencava, qui non si inventano (F17).
- **Prestazioni** (`perf/budget.json`, JS iniziale gzip): `/dashboard/allocation` 849 KB, `/dashboard/settings` 812 KB,
  `/dashboard/assets` 679 KB. Cashflow e FIRE caricano già le schede secondarie con `lazyComponent` + `usePreloadWhenIdle`
  (`components/ui/lazy-component.tsx`); Allocazione e Impostazioni no.

## 3. Obiettivo e perimetro

**Obiettivo**: in Patrimonio la tabella si vede senza scorrere mezza pagina; in Allocazione la catena delle decisioni è una
mappa visibile e i target si cambiano dove si guardano (P2); Impostazioni contiene solo ciò che è dell'account o di più
pagine, in cinque gruppi con un criterio solo.

**Incluso**
- R4 (§ 5.1), R10 (§ 5.2), P6 su Allocazione e Impostazioni (§ 5.3), la parte Impostazioni e il pavimento di Accumulo della
  card «Comporre Impostazioni sul telefono» (§ 5.4).
- R8 nel suo dossier, con la riga «Portafoglio X su Y di patrimonio» rimandata dall'ondata 1 (D-RU3 → D-ST7).

**Escluso**
- Ondata 3: R9 FIRE in tre schede (dopo F12), R7 calendario 12×31, Traguardi e Hall of Fame nel menu; la riga «Portafoglio X su
  Y» in FIRE va con R9.
- Il lavoro sui dati di M4/L2/L3/L5 (gruppi come dato unico, una definizione di liquidità, `selectPortfolio`): resta nella sua
  card; R8 dice solo dove sta il controllo (D-ST6).
- La modalità Essenziale (F17): lascia spazio in testa a Impostazioni › Funzioni (§ 5.2).
- Lo Zainetto fiscale: arriva dopo, in Allocazione (D-ST9).
- Il pavimento del Calcolatore FIRE a 768 (card «Comporre Impostazioni sul telefono», punto 2): resta lì, è area di R9.
- Email e PDF: nessun testo cambia, salvo dove `describe*` condivisi cambiano parola (R4, «Conti»: le email non lo usano).

## 4. Casi d'uso

1. **Apro Patrimonio a 1440.** Vedo il totale con le due variazioni e una curva bassa, i conti, le operazioni del mese, e
   sotto la tabella Strumenti con le prime righe già nella prima schermata.
2. **Apro Patrimonio sul telefono.** Come oggi, salvo i nomi «Conti» e «Operazioni del mese» e Strumenti che è la terza riga
   chiusa invece dell'ultima.
3. **Cerco dove si attiva la Divisione delle spese.** Impostazioni › Funzioni: un interruttore per pezzo dell'app.
4. **Cambio le categorie di spesa.** L'ingranaggio «Categorie» di Tracciamento apre Impostazioni › Cashflow, Categorie per prime.
5. **Cerco la SWR del piano FIRE in Impostazioni.** In fondo a Investimenti la riga «Si regola altrove» dice «Piano FIRE: FIRE ›
   Il mio piano» con il link; nessun tile di valori copiati.
6. **Ho un vecchio link `?tab=allocazione`.** Arrivo in Allocazione › Strategia.

## 5. Regole

### 5.1 R4 · Patrimonio (task RU7)

**Griglia da `desktop:`** (12 colonne):

| Riga | Celle |
|---|---|
| 1 | Patrimonio totale lordo **5** (variante bassa) · Conti **3** · Operazioni del mese **4** |
| 2 | Strumenti **12** |
| 3 | Classi **4** · Guadagno sul costo **4** · Intestatari **4**; senza Intestatari: Classi **6** · Guadagno **6** |
| 4… | Mutuo/Prestito **12**, uno per prestito, come oggi |

- **DOM** (D-RU16): totale · Operazioni · Conti · **Strumenti** · Classi · Guadagno · Intestatari · Mutuo. Strumenti si sposta
  nel DOM subito dopo Conti, così l'ordine di lettura è quello che si vede a ogni larghezza (The First-Screen Rule) e sul
  telefono la riga Strumenti è la terza chiusa. Le celle restano posizionate con `desktop:col-start-*`/`row-start-*`, mai
  `order` (P3). `resolvePatrimonioSections` segue lo stesso ordine (le chiavi `mobile-sections:assets` non cambiano: una
  memoria salvata resta valida, cambia solo l'ordine).
- **Variante bassa del totale** (D-RU17): `PatrimonioTile` riceve `variant?: 'default' | 'compact'`; `compact` vale **solo da
  `desktop:`** e solo in Patrimonio (Panoramica e landing non la passano). In `compact`: il selettore di periodo sale nella
  riga dell'eyebrow (a destra, `aside`), la sua riga «Andamento» sparisce; la curva ha altezza fissa 80 px (`desktop:h-20`,
  non più `flex-1 min-h-[180px]`); il riassunto «Mercato: …» non c'è (il verdetto nomina già lo strumento che ha pesato,
  `topInstrumentMovers`); la riga del conteggio («6 strumenti e 1 conto», link a `#strumenti`) resta. Sotto `desktop:` il
  tile è identico a oggi (curva 120 px, THE tile della composizione).
- **Altezza della riga 1** = quella del totale (~330 px sul census). Conti e Operazioni si allungano fino a lì e, se hanno più
  righe, la loro lista scorre dentro (`scrollBody` come `MovimentiTile` di Cashflow, D-RU6: `desktop:flex desktop:h-full
  desktop:flex-col` sul tile, `desktop:min-h-0 desktop:flex-1 desktop:overflow-y-auto` sul corpo) con la riga di piede ferma.
  Nessuna nuova paginazione.
- **Parole** (D-RU18): eyebrow «Liquidità» → **«Conti»** (tile, cella della striscia mobile `selectPatrimonioStrip`, riga
  chiusa, `ROW_EYEBROWS`), con la lettura invariata («Il 2,6% del patrimonio è su Conto Corrente.»); «Movimenti del mese» →
  **«Operazioni del mese»** (tile, `ROW_EYEBROWS.movimenti`, `ErrorNotice` del registro). Id di sezione, chiavi e nomi dei
  componenti invariati (come in RU1). La classe «Liquidità» di Classi e di Allocazione resta «Liquidità»: è una classe, non
  l'elenco dei conti.
- **Intestatari a 4 colonne**: `IntestatariTile` riceve `dense` (solo in Patrimonio, da `desktop:`): una persona per riga,
  nome · quota · euro, invece della disposizione a tutta larghezza di oggi; la Panoramica non lo passa.
- **Sotto `desktop:`** nulla cambia oltre a parole e ordine delle righe chiuse. A 768 e in orizzontale la composizione tablet
  legge l'ordine dal DOM (`useTabletComposition`), quindi segue da sola.

**Misura sul census, render «proposta» 1440×900**: eyebrow di Strumenti a 638 px (oggi 1160); il tile comincia a ~607 e
mostra le prime tre righe. Il «~480 px» della review non si raggiunge senza tagliare il verdetto (130 px); il criterio è
< 680 (§ 10).

### 5.2 R10 · Impostazioni in cinque schede (task RU9)

**Il criterio**: una scheda per «di chi è la regolazione». Account = la persona e la casa; Funzioni = quali pezzi dell'app
esistono; Cashflow = le regole dei movimenti; Investimenti = le regole di calcolo del patrimonio; Avanzate = le ipotesi delle
simulazioni. Ciò che regola un oggetto di una pagina sta su quella pagina (P2) e qui c'è solo il rimando.

| Scheda (`?tab=`) | Tile, in quest'ordine | Da dove |
|---|---|---|
| **Account** (`account`, si apre per prima) | Modalità 6 · Tema colori 6 (si salvano da soli, come oggi) · Famiglia 12 · Condivisione account 12 (con «Come funziona» come nota di metodo in fondo) · Email periodiche 12 | Aspetto, Preferenze, Condivisione |
| **Funzioni** (`funzioni`) | *(spazio riservato in testa alla scelta Essenziale · Completa, F17)* · un tile «Funzioni» 12 con un interruttore per riga: **Traguardi di investimento**, **Centri di Costo**, **Divisione delle spese**, **Ruoli 50/30/20** — ognuno con la riga d'aiuto che dice cosa compare quando è acceso | Preferenze (FIRE e traguardi, Cashflow), Spese |
| **Cashflow** (`cashflow`) | Categorie 12 (per prime) · Conti di default 6 · Commissioni bancarie 6 · Reddito e storico 6 (reddito da lavoro + anno di inizio, ex tile «Cashflow» senza i due interruttori) · Dividendi 6 (ex «Entrate da dividendi», con «BTP Italia» come nota di metodo) · Import CSV 12 | Spese, Preferenze, Dividendi |
| **Investimenti** (`investimenti`) | Calcolo dei rendimenti 6 (+ la riga **Risk-free rate**, spostata dall'Auto-calcolo) · Costi 6 (bollo, come oggi) · Patrimonio nel FIRE 6 (l'interruttore «Casa nel patrimonio FIRE», da solo) | Preferenze, Allocazione |
| **Avanzate** (`avanzate`) | Ipotesi di mercato 12 · Correlazioni 12 · Scaglioni IRPEF 12; «Dove si usano» diventa la riga d'introduzione della scheda | Simulazioni |

- **Escono da Impostazioni**: Allocazione target, Auto-calcolo, Target per classe e il riassunto dei Criteri vanno in Allocazione
  › Strategia (R8, D-ST4/D-ST5), nella task RU8, **prima** di questa; «Allocazione derivata dai traguardi» diventa la fonte
  «Dai traguardi» di Strategia (D-ST4). **Spariscono** i tile di sola lettura «Parametri del piano» e «Assistente»: il loro
  contenuto è di FIRE › Il mio piano e dell'Assistente (D-RU20).
- **«Si regola altrove»**: in fondo a ogni scheda che ne ha, una riga (non un tile) con i rimandi, ognuno «cosa · dove» con il
  link: Account → «Preferenze dell'Assistente (stile, memoria, contesto web): Assistente»; Cashflow → «Tetto e avvisi del
  budget: Cashflow › Budget»; Investimenti → «Target per classe e criteri del modello: Allocazione › Strategia», «Piano FIRE
  (età, spesa, SWR, fondo, flussi, pensioni): FIRE › Il mio piano»; Avanzate → «Le ipotesi si leggono in FIRE › Dopo il FIRE e
  Proiezione». Funzioni non ne ha.
- **Funzioni non contiene il bollo** (D-RU19): un interruttore di Funzioni accende o spegne una pagina, una scheda o un
  controllo; il bollo cambia un calcolo e resta in Investimenti › Costi con la sua aliquota. Budget e Assistente non hanno un
  interruttore e non ne ricevono uno qui (lo decide F17).
- **La bozza** (`lib/utils/settingsDraft.ts`): le fette seguono le schede nuove — `account`, `funzioni`, `cashflow`,
  `investimenti`, `avanzate` (+ `declarations`, che perde `planParams`, `assistantPrefs`, `idealAllocation`). Tabella dei
  campi in § 5.2.1. **Il salvataggio non scrive più `targets`**: `composeSettingsDocument` produce un documento SENZA la
  chiave `targets`, quindi `setSettings` prende il ramo merge (che già gestisce i campi cancellabili con `deleteField()`);
  così un «Salva» di Impostazioni con la pagina aperta da prima non può riportare indietro i target salvati in Strategia (il
  difetto M1 della review modello dati). La rilettura prima di «Salva» resta. «Ripristina default» lascia la testata di
  Impostazioni (va in Strategia, D-ST5).
- **Il pallino per scheda**, la barra in fondo e «Annulla modifiche» restano come sono, sulle schede nuove.
- **Alias** (D-RU21): `isSettingsTabId` accetta i vecchi id e li traduce — `generale` → `account`, `spese` → `cashflow`,
  `dividendi` → `cashflow` (con il fuoco sul tile Dividendi, `#dividendi`), `simulazioni` → `avanzate`, `condivisione` →
  `account`, `aspetto` → `account`; **`allocazione` → `router.replace('/dashboard/allocation?tab=strategia')`**. I link nel
  codice (§ 2) si aggiornano all'id nuovo; l'alias serve ai segnalibri.
- **Testata**: sottotitolo «Account, funzioni e regole di calcolo» (oggi «Target, preferenze e flussi»); un solo bottone pieno
  («Salva»).
- **DESIGN.md → The Declaration-Tile Rule**, primo corollario: «A field another surface OWNS is named in the tab's «Si regola
  altrove» line, with its link — never copied into a read-only tile» (D-RU20). Gli altri corollari restano.
- **Sotto `desktop:`**: nessuna composizione (resta la scelta della guida); ogni scheda in una colonna, due da `tablet:`. Il
  `PageTabBar` a cinque schede sta nella pillola senza scorrere a 390 (oggi sette scorrono).

#### 5.2.1 Campi per fetta

| Fetta | Campi (dal documento delle impostazioni) |
|---|---|
| `account` | `familyMembers`, `monthlyEmailEnabled`, `quarterlyEmailEnabled`, `semiAnnualEmailEnabled`, `yearlyEmailEnabled`, `weeklyBudgetEmailEnabled`, `monthlyEmailRecipients` (tema e modalità non sono nella bozza: si salvano da soli) |
| `funzioni` | `goalBasedInvestingEnabled`, `costCentersEnabled`, `expenseSplitEnabled`, `spendingRolesEnabled` |
| `cashflow` | `defaultDebitCashAssetId`, `defaultCreditCashAssetId`, `transferFeeCategoryId`, `transferFeeSubCategoryId`, `laborIncomeCategoryIds`, `cashflowHistoryStartYear`, `dividendIncomeCategoryId`, `dividendIncomeSubCategoryId`, `dividendCashAssetId` |
| `investimenti` | `performanceIncludesPensionFunds`, `performanceIncludesExcludedAssets`, `performanceExcludesCash`, `pensionReturnStartMonth`, `riskFreeRate`, `stampDutyEnabled`, `stampDutyRate`, `checkingAccountSubCategory`, `includePrimaryResidenceInFIRE` |
| `avanzate` | la fetta `simulazioni` di oggi, intera (`market`, `marketOrigin`, `marketMigration`, `marketLegacyInflation`, `taxBrackets`, `correlationCorrections`) |
| *(Strategia)* | `targets`, `autoCalculate`, `goalDrivenAllocationEnabled`, `cashUseFixedAmount`, `cashFixedAmount` — escono dalla bozza di Impostazioni |

Spegnere «Traguardi di investimento» in Funzioni spegne anche `goalDrivenAllocationEnabled` (oggi lo fa il tile FIRE e
traguardi): siccome il secondo campo non è più nella bozza di Impostazioni, il salvataggio lo scrive a `false` solo quando il
primo passa da acceso a spento (una riga in `composeSettingsDocument`, con il suo test).

### 5.3 P6 · Schede caricate all'apertura (in RU8 e RU9)

- **Allocazione** (RU8): Bilanciamento resta nel JS della pagina; `AccumuloTab` e la nuova `StrategiaTab` diventano
  `lazyComponent(() => import(...))` a livello di modulo, precaricati con `usePreloadWhenIdle` quando la pagina ha letto i
  suoi dati, come in `app/dashboard/cashflow/page.tsx`. Il `?tab=accumulo` o `?tab=strategia` all'apertura monta il fallback
  (`TileGridSkeleton` con le celle della scheda) finché il chunk arriva.
- **Impostazioni** (RU9): Account resta nel JS della pagina; Funzioni, Cashflow, Investimenti, Avanzate diventano chunk
  (`lazyComponent`), precaricati in idle. La bozza resta nella pagina (le viste sono controllate): un chunk che arriva tardi
  non perde nulla.
- **Il tetto scende** nella stessa PR (`perf/budget.json`, `doc/guide/velocita.md` § Il ratchet): misura prima/dopo su
  `perf:build` sul Mac; il nuovo tetto è la misura arrotondata su, con `raisedBy` che dice «abbassato».

### 5.4 La card «Comporre Impostazioni sul telefono»

- **Impostazioni (9 voci)**: R10 accorcia ogni scheda (la più lunga diventa Avanzate, che oggi è Simulazioni, l'unica che
  resta com'è). Non si compone (D-RU22): ogni tile è un modulo che si è venuti a cambiare, una riga chiusa nasconderebbe il
  controllo. RU9 rimisura con `mobile:census` e riscrive le 9 voci al misurato, sotto il tetto di prima dove la scheda si è
  accorciata; la voce resta `target: false`.
- **Pavimento `allocazione-accumulo` @768** (`tilesAboveFold` 1 contro 3): RU8 toglie da Accumulo Portafoglio modello e Criteri
  (vanno in Strategia), il pavimento si rimisura lì e deve tornare a ≥ 3 (criterio in `doc/allocazione-strategia/README.md`).
- **Pavimento `fire-calcolatore` @768** e la cifra in più di `accumulo` @390: restano nella card (FIRE è dell'ondata 3; la cifra
  si rimisura con RU8).
- La card si aggiorna a fine RU9 con ciò che resta.

## 6. Interfaccia

### 6.1 Accessibilità
- Patrimonio: l'ordine DOM è quello visivo (D-RU16); la lista scorrevole di Conti e Operazioni è un `region` con nome solo se
  scorre davvero (`aria-label` «Conti, elenco scorrevole»), come Movimenti di Cashflow.
- Impostazioni: «Si regola altrove» è un `<p>` con link veri; ogni link dice la destinazione per esteso («Apri FIRE › Il mio
  piano»). Gli alias di `?tab=` non spostano il fuoco; `allocazione` fa `replace`, non `push` (il tasto indietro non torna a un
  redirect).

### 6.2 Movimento
Nessun movimento nuovo. Il selettore di periodo nella riga dell'eyebrow del totale usa la stessa pillola (`layoutId`
invariato).

### 6.3 Composizione mobile
- Patrimonio: stesso census salvo l'ordine delle righe chiuse (Strumenti terza) e le parole; `mobile:budget` si rimisura.
- Impostazioni: `target: false`, rimisura in RU9 (§ 5.4).
- Allocazione: vedi il dossier di R8.

## 7. Piano

Tre task, una PR ciascuna. **Modello**: Sonnet 5.5 basta per RU7 e RU9; RU8 su Opus 5.5 (sposta un editor con la sua
validazione e il suo salvataggio fra due pagine). Ogni PR corre `npx tsc --noEmit`, `npx eslint app components lib types e2e
scripts __tests__`, `TZ=Europe/Rome npx vitest run` sui file toccati e gli `e2e/*.spec.ts` delle pagine toccate sugli
emulatori (nel cloud si può); sul Mac `perf:build` + `perf:budget` (WORKFLOW.md regola 10), `mobile:census` + `mobile:budget`
e il giudizio visivo.

| Task | Contenuto | Tocca | Dipende da |
|------|-----------|-------|------------|
| **RU7** | R4 Patrimonio (§ 5.1) | `app/dashboard/assets/page.tsx`, `PatrimonioTile` (`variant`), `LiquiditaTile`, `components/assets/tiles/MovimentiTile.tsx`, `IntestatariTile` (`dense`), `patrimonioSummary.ts` (etichetta della striscia, ordine delle sezioni), spec `mobile-composition.patrimonio*`, `patrimonio.tablet`, `assets.*` | — (può partire subito) |
| **RU8** | R8 Allocazione › Strategia + striscia + Impostazioni senza la scheda Allocazione + P6 di Allocazione (`doc/allocazione-strategia/README.md`) | allocation page, `components/allocation/*`, nuovo `StrategiaTab`, `components/settings/allocation/*` (spostati), `settingsDraft.ts` (fetta `allocazione` tolta), spec `allocation*`, `settings*` | — |
| **RU9** | R10 Impostazioni in cinque schede + «Si regola altrove» + alias + P6 di Impostazioni + rimisura (§ 5.2–5.4) | settings page, `components/settings/tabs/*`, `settingsDraft.ts`, `settingsNarrative.ts`, i link di § 2, DESIGN.md (Declaration-Tile), `doc/guide/impostazioni.md`, spec `settings*` e quelle che aprono `?tab=` | RU8 |

**Conflitti** con altro lavoro: RU7 tocca `StrumentiTile` solo per l'ancora (nessun cambio alla tabella, RU6 è in main);
RU8 tocca i file della card M4 (`modelPortfolio.ts`, `accumulationPlan*`) solo per spostarli di scheda, non per cambiarne la
logica: la card M4 va **dopo** RU8. Lo Zainetto fiscale dopo RU8. F17 Essenziale dopo RU9.

## 8. Decisioni

**Proposte il 2026-11-23, da confermare con Giorgio.** Le decisioni di R8 sono D-ST1…D-ST9 nel suo dossier.

| ID | Stato | Decisione | Alternative scartate e motivo |
|----|-------|-----------|-------------------------------|
| D-RU15 | Proposta | Tre task: RU7 Patrimonio (subito, indipendente), RU8 Strategia con la scheda Allocazione tolta da Impostazioni nella stessa PR, RU9 Impostazioni a cinque schede dopo RU8. | R8 e R10 in una PR sola («insieme» della review): due pagine, due bozze e due giri di misura in un diff; il vincolo vero è che i target cambino casa in un colpo solo, e RU8 lo rispetta. RU9 prima di RU8: le cinque schede nascerebbero con una sesta «Allocazione» da togliere subito dopo. |
| D-RU16 | Proposta | Patrimonio: Strumenti in seconda riga a tutta larghezza, **spostato anche nel DOM** dopo Conti; riga 3 Classi · Guadagno · Intestatari (4 · 4 · 4, senza Intestatari 6 · 6). | Solo con `row-start` (DOM invariato, come D-RU5): a 1440 il lettore di schermo incontrerebbe la tabella per ultima mentre l'occhio la vede seconda. Strumenti sopra il totale: la pagina perderebbe la risposta «quanto ho». I «480 px» della review: servirebbe tagliare il verdetto. |
| D-RU17 | Proposta | Totale basso solo da `desktop:` e solo in Patrimonio: periodo nell'eyebrow, curva 80 px, niente «Mercato:»; Conti e Operazioni alti quanto il totale con la lista che scorre dentro. | Una variante anche in Panoramica: lì la curva grande è la risposta (P1, la casa del totale nel tempo). Togliere la curva: il totale perde il «come ci sono arrivato» in un colpo d'occhio. Conti e Operazioni ad altezza naturale: con dieci conti la riga 1 crescerebbe e la tabella tornerebbe giù. |
| D-RU18 | Proposta | «Liquidità» → «Conti» (tile, cella, riga), «Movimenti del mese» → «Operazioni del mese»; id e chiavi invariati. | Tenere «Movimenti»: è il nome delle voci di Cashflow, e il tile elenca operazioni del Registro. «Conti e prestiti»: lungo; un prestito personale nel tile è un caso raro e la lettura lo dice già. |
| D-RU19 | Proposta | Impostazioni in cinque schede come § 5.2; in Funzioni solo gli interruttori che accendono un pezzo dell'app (Traguardi, Centri di Costo, Divisione, Ruoli 50/30/20); il bollo resta in Investimenti › Costi; nessun interruttore nuovo per Budget e Assistente. | Il bollo in Funzioni (review): separerebbe l'interruttore dalla sua aliquota, o metterebbe un'aliquota fra gli interruttori. Inventare gli interruttori di Budget e Assistente: è il lavoro di F17 (aree Essenziale/Completa). |
| D-RU20 | Proposta | Spariscono i tile di sola lettura (Parametri del piano, Assistente, Allocazione target, Criteri, Dove si usano diventa introduzione, BTP Italia e Come funziona note di metodo); in fondo alle schede una riga «Si regola altrove»; DESIGN.md → The Declaration-Tile Rule cambia il primo corollario. | Tenerli: copie di valori che vivono altrove, cioè la metà della lunghezza di Preferenze, e la diagnosi del tester («cerco la SWR e la trovo in due posti»). Tile «Si regola altrove» con i valori: torna la copia. |
| D-RU21 | Proposta | Account si apre per primo; i vecchi `?tab=` sono alias; `allocazione` porta ad Allocazione › Strategia con `replace`. | Tenere Allocazione come prima scheda: non c'è più. Rompere i vecchi link: segnalibri e link nel codice di FIRE e dell'ottimizzatore porterebbero alla scheda di default. |
| D-RU22 | Proposta | La card «Comporre Impostazioni sul telefono»: R10 ne assorbe la parte Impostazioni come rimisura (niente composizione), RU8 il pavimento di Accumulo @768; il Calcolatore resta nella card. | Comporre Impostazioni: una riga chiusa nasconde il controllo che si è venuti a cambiare (la guida lo esclude). Lasciare tutta la card fuori: le 9 voci si rimisurerebbero due volte. |
| D-RU23 | Proposta | P6 nelle PR che ritagliano: in RU8 Accumulo e Strategia come chunk, in RU9 tutte le schede di Impostazioni tranne Account; il tetto di `perf/budget.json` si abbassa nella stessa PR. | Prima del riordino: si taglierebbe lungo confini che cambiano (review prestazioni). Dopo, in una PR a sé: Allocazione cresce con Strategia nel frattempo. |
| D-RU24 | Proposta | Il risk-free rate va in Investimenti › Calcolo dei rendimenti (lo leggono Sharpe, Sortino, l'email e la formula dei target); Strategia lo mostra con il link. «Casa nel patrimonio FIRE» resta in Investimenti, candidata a FIRE › Il mio piano con R9. | Risk-free in Strategia: è di più pagine, quindi Impostazioni (P2). Casa nel FIRE subito in «Il mio piano»: tocca FIRE, che è dell'ondata 3. |

## 9. Punti aperti

- **Misure sul Mac**: le altezze di § 5.1 sono del census nel cloud (Chromium del container, tema Lime Frost); il criterio di
  § 10 si verifica sul Mac nella PR.
- **«Casa nel patrimonio FIRE»** in FIRE › Il mio piano: da decidere con R9.

## 10. Criteri di accettazione

Valori inventati e tondi (WORKFLOW.md regola 7); le misure in px sono del census.

**R4 · Patrimonio**
1. A 1440×900 (census): l'eyebrow di Strumenti ha `top` < 680 (oggi 1160) e almeno due righe della tabella sono sopra 900;
   il totale, Conti e Operazioni hanno lo stesso `top` e lo stesso bordo inferiore (±1 px).
2. A 1280×800 col mouse lo stesso ordine; a 1440 e 1280 nessuna regola di `max-desktop:` del totale si applica.
3. Con 10 conti (fixture inventata: 10 conti da 1000 €) la riga 1 non cresce: la lista di Conti scorre, il piede «Aggiungi
   conto» resta visibile.
4. Senza Intestatari (un membro) Classi e Guadagno sono 6 · 6; con due membri 4 · 4 · 4.
5. L'ordine DOM delle sezioni è: totale, Operazioni, Conti, Strumenti, Classi, Guadagno, Intestatari, Mutuo (spec: lettura degli
   `h3` in ordine).
6. Nessuna occorrenza visibile di «Liquidità» come eyebrow o cella in Patrimonio; «Operazioni del mese» al posto di «Movimenti
   del mese». La classe «Liquidità» in Classi resta.
7. Sotto `desktop:` (390, 768, 1024×768): THE tile identico a oggi (curva 120 px, riga «Andamento», «Mercato:»), righe chiuse
   nell'ordine del criterio 5; `mobile:budget` verde con le voci di `patrimonio` rimisurate.
8. Panoramica e landing: `PatrimonioTile` senza `variant` è identico (spec della Panoramica verdi senza modifiche).

**R10 · Impostazioni**
9. Cinque schede nell'ordine Account · Funzioni · Cashflow · Investimenti · Avanzate; senza `?tab=` si apre Account.
10. `?tab=spese` apre Cashflow, `?tab=dividendi` apre Cashflow con il fuoco sul tile Dividendi, `?tab=simulazioni` Avanzate,
    `?tab=generale`/`condivisione`/`aspetto` Account, `?tab=allocazione` porta a `/dashboard/allocation?tab=strategia` e il
    tasto indietro torna alla pagina di prima.
11. `compose ∘ slice ≡ document` su `FULL_PAGE_SETTINGS` **senza** `targets`, `autoCalculate`, `goalDrivenAllocationEnabled`,
    `cashUseFixedAmount`, `cashFixedAmount` (`__tests__/settingsDraft.test.ts`); `WRITTEN_KEYS` aggiornato.
12. Caso M1: documento con `targets` Azioni 60; la pagina Impostazioni aperta da prima; Strategia salva Azioni 70; Impostazioni
    salva un'email → il documento ha ancora Azioni 70 (test su `setSettings` vero, come `script/settings-stale-save.test.ts`
    della review).
13. Funzioni: spegnere «Traguardi di investimento» con `goalDrivenAllocationEnabled = true` salvato scrive entrambi a `false`;
    accenderlo non tocca `goalDrivenAllocationEnabled`.
14. Ogni pallino resta sulla scheda che edita il campo: cambiare il risk-free accende il pallino di Investimenti, non altri.
15. Nessun tile «Parametri del piano», «Assistente», «Allocazione target», «Criteri del modello», «Dove si usano», «BTP Italia»,
    «Come funziona»; le righe «Si regola altrove» di § 5.2 con i link che aprono la destinazione.
16. A 390 i cinque pulsanti della barra delle schede stanno senza scorrere orizzontalmente.
17. `npm run test:e2e` delle spec `settings*` verdi con gli id nuovi; `e2e/cashflow.transfer-fee.spec.ts` ripristina il
    documento come prima.

**P6**
18. `/dashboard/allocation` e `/dashboard/settings`: JS iniziale gzip sotto il tetto di oggi (849 e 812 KB) misurato sul Mac; il
    tetto in `perf/budget.json` scende alla misura arrotondata su.
19. Aprire Accumulo, Strategia o una scheda di Impostazioni dopo il precaricamento non mostra lo scheletro (il chunk è già
    caricato); con `?tab=` diretto lo scheletro c'è finché il chunk arriva, poi il contenuto senza salti.
