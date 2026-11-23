# Totali mensili delle spese (e la Hall of Fame che li legge)

> Dossier delle card Todoist «Utenti · Totali mensili delle spese salvati (spec)» e «Utenti · Hall of Fame
> incrementale nel cron serale» (epic-utenti, p3). Fonte: Library `capacita/README.md` §§ 2, 6 e 9 e
> `capacita/modello-tre-persone.py` (studio del 22/11/2026). Stato: **Fase A implementata** il
> 23/11/2026 (PR #230, D-TM13–D-TM18 in § 9), **Fase B implementata** lo stesso giorno (D-TM19–D-TM21; § 6.5 riscritto
> sul codice); decisioni D-TM1–D-TM12 confermate da Giorgio
> il 23/11/2026. Scritta il 23/11/2026 sul main `bf22453`, leggendo il codice.
>
> Un solo dossier per le due card: la Hall of Fame, con i totali, non ha più bisogno di una logica
> incrementale sua (D-TM8). Le due cose si implementano in due fasi (§ 10).

## 1. Obiettivo

Oggi quattro letture rileggono **tutte** le righe di `expenses` di un utente, e crescono con gli anni di
storia: il cron serale per la Hall of Fame (ogni notte, per ogni utente), Storico, FIRE e Rendimenti a cache
scaduta (a ogni visita); Analisi le rilegge tutte anche lei. Con tre persone su Spark il limite di 50.000
letture al giorno arriva in circa 4,5 anni (studio § 9).

L'obiettivo è che **nessuna lettura ricorrente cresca con il numero di righe di spesa**: i mesi chiusi si
leggono da un documento di totali per anno, e le righe si leggono solo per il mese in corso e per le viste
che mostrano movimenti singoli. **Le cifre mostrate non cambiano** (D-TM1): ogni lettore, sui totali, dà
gli stessi numeri che dà oggi sulle righe, e un test lo verifica per ciascuno.

Effetto atteso (studio § 9, modello tarato sulla console): tre persone su Spark oltre 30 anni, invece di 4,5.

## 2. Perimetro

**Incluso**
- La collezione `expense-totals` (un documento per utente e anno), il costruttore puro e chi la scrive (§ 4).
- La **ricostruzione** di un mese: notturna per il mese in corso, subito dopo una scrittura su un mese chiuso,
  e la **verifica notturna** che trova i mesi andati fuori allineamento (§ 5).
- La **migrazione** degli utenti esistenti, senza ordine obbligato tra deploy e script (§ 7).
- **Fase A** (§ 10): Hall of Fame (cron, ricalcolo manuale, snapshot dalla Panoramica), Storico, FIRE
  (Calcolatore e le altre schede che leggono il flusso annuale), Rendimenti (calcolo a cache scaduta, PDF).
- **Fase B**: Analisi.
- Le regole di Firestore, l'indice nuovo, il registro del backup, il seed degli e2e.

**Escluso**
- Tracciamento, Budget, Divisione, la Panoramica, le email: leggono già una **finestra** che non cresce con la
  storia (`lib/utils/expenseWindows.ts`). Restano come sono.
- Centri di Costo e «Collega spese…»: leggono tutto, ma per scelta dichiarata (un centro è a vita) e solo
  quando si apre la scheda. Si possono portare su una query per `costCenterId` in un secondo momento (§ 12).
- L'export PDF (`pdfDataService.ts` legge tutto): raro e a richiesta. Passa ai totali dove legge gli stessi
  dati della Hall of Fame e di Rendimenti; il resto resta com'è.
- Le correzioni 3 e 4 dello studio (cache di Rendimenti prima degli input, Tracciamento senza riletture):
  card «Utenti · Tracciamento e Rendimenti senza riletture inutili».
- Il cambio di piano (Blaze) e il cron in parallelo: fuori da questa card.

## 3. Casi d'uso

| # | Chi, quando | Oggi | Con i totali |
|---|---|---|---|
| CU1 | Il cron, ogni sera, per ogni utente | Hall of Fame: tutti gli snapshot e **tutte** le spese (S + E) | Ricostruisce il mese in corso dalle sue righe, verifica gli altri con una query di aggregazione per anno, poi la Hall of Fame legge snapshot e totali (S + Y) |
| CU2 | Giorgio salva una spesa del mese in corso dal Tracciamento | Nessun effetto sui totali | Nessun effetto: il mese in corso si legge sempre dalle righe (D-TM4) |
| CU3 | Giorgio corregge una spesa di marzo 2024 | Le pagine la vedono alla prossima lettura | Lo scrittore chiede la ricostruzione di marzo 2024 (§ 5.2); le pagine la vedono appena la ricostruzione finisce |
| CU4 | Giorgio rinomina o sposta una categoria (riscrive righe di molti mesi) | Idem | Lo scrittore chiede la ricostruzione di tutti i mesi toccati, in una chiamata |
| CU5 | Uno scrittore dimentica di chiedere la ricostruzione (un bug, uno script, l'Admin a mano) | — | La verifica notturna trova il mese diverso dalle righe e lo ricostruisce: al più un giorno di ritardo (§ 5.3) |
| CU6 | Giorgio apre Storico | Legge tutte le spese (E) | Legge i totali (Y documenti) e le righe del mese in corso |
| CU7 | Giorgio apre FIRE › Calcolatore | Due finestre di righe: gli ultimi due anni e la storia dal primo snapshot | Totali più le righe del mese in corso |
| CU8 | Rendimenti, cache scaduta | Tutte le spese dal primo snapshot | Totali, le righe della categoria dividendi, le righe del mese in corso |
| CU9 | Giorgio apre Analisi su «Anno corrente» (fase B) | Tutte le spese | Le righe dell'anno scelto, quelle del solo mese di confronto quando il confronto è «agli stessi giorni», i totali per il resto |
| CU10 | Il primo deploy, prima che lo script giri | — | Un anno senza documento di totali si legge dalle righe, come oggi (§ 7) |
| CU11 | Un amico appena entrato, nessuna spesa | — | Nessun documento; le pagine si comportano come oggi con zero righe |

## 4. Il modello

### 4.1 Il documento

`expense-totals/{userId}_{YYYY}` — un documento per utente e anno dell'**Italia**. Scritto solo dal server
(Admin SDK), letto dal client (regole § 8).

```ts
interface ExpenseTotalsYear {
  userId: string;
  year: number;
  schemaVersion: 1;               // un campo nuovo nelle celle → versione nuova → ricostruzione completa
  months: Partial<Record<MonthKey, ExpenseTotalsMonth>>;  // '01'…'12', tutti e dodici (D-TM15)
}

interface ExpenseTotalsMonth {
  builtAt: Timestamp;             // quando è stato ricostruito dalle righe
  rowCount: number;               // tutte le righe del mese, di ogni tipo (per la verifica, § 5.3)
  amountSum: number;              // somma con segno di tutte le righe (per la verifica)
  cells: ExpenseTotalsCell[];     // una per combinazione delle dimensioni sotto
}

interface ExpenseTotalsCell {
  type: ExpenseType | 'unclassified';   // riga senza `type` (legacy, import) → 'unclassified'
  categoryId: string;                   // '' se la riga non ne ha
  categoryName: string;                 // quello della riga più recente della cella (updatedAt, poi date)
  subCategoryId: string | null;
  subCategoryName: string | null;
  tradeFee: boolean;                    // la riga ha `feeOfTradeId` (Rendimenti, C_rows)
  negative: boolean;                    // amount < 0 (D-TM13: le spese si sommano con Math.abs riga per riga)
  sum: number;                          // somma con segno di `amount`, in euro, come le righe
  count: number;                        // quante righe
}
```

**Il mese** è quello italiano della data della riga (`getItalyMonthYear`), come in Hall of Fame, Storico e
FIRE.

**Le dimensioni** sono quelle che servono ai lettori delle due fasi: tipo, categoria, sottocategoria
(Composizione, Flusso, ruoli 50/30/20 che si risolvono dalla categoria, Lavoro e investimenti, entrate per
fonte), il flag commissione di un'operazione (Rendimenti) e il **segno** dell'importo (D-TM13). Non ci sono `excludeFromBudget`,
`costCenterId`, `personalMemberId`, `linkedCashAssetId`: i loro lettori leggono una finestra di righe o le
righe stesse. Un lettore nuovo che filtra per un campo nuovo aggiunge una dimensione e alza
`schemaVersion` (§ 5.4).

**Il peso**: con 80 righe al mese le celle distinte di un mese sono 30–60, circa 120 byte l'una: 4–8 KB al mese,
50–100 KB l'anno. Il limite di Firestore è 1 MiB per documento, quindi c'è margine di dieci volte anche per
un utente intenso. Un documento per utente (tutti gli anni) arriverebbe a 1 MiB in una decina d'anni (D-TM2).

### 4.2 Le righe aggregate

I lettori **non cambiano formula**. Un modulo puro, `lib/utils/expenseTotals.ts`, trasforma i totali in
**righe aggregate**: una `Expense` per cella, con

- `id = 'agg:{year}-{month}:{indice cella}'`, `amount = cell.sum`, `type` (`undefined` per `'unclassified'`),
  `categoryId`, `categoryName`, `subCategoryId`, `subCategoryName`, `feeOfTradeId = 'agg'` se `tradeFee`;
- `date` = il **15 del mese alle 12:00 ora italiana**: cade nello stesso mese in ogni calendario (italiano,
  del browser, UTC), che è tutto ciò che le funzioni di Fase A guardano;
- `aggregateCount = cell.count` (campo nuovo, facoltativo, solo su queste righe).

Poi `planExpenseFlows` sceglie i mesi e `mergeExpenseFlows` (dentro `loadExpenseFlows`) restituisce, per ogni mese, **o** le righe aggregate
**o** le righe vere, mai entrambe (D-TM3). Le funzioni pure di Hall of Fame, Storico, FIRE e Rendimenti
ricevono questa lista al posto di quella di oggi.

Questo funziona perché in Fase A ogni lettore **somma** `amount` per mese, tipo e categoria. Le funzioni che
**contano** le righe, guardano il **giorno** o il **testo** di una riga (Spese maggiori, calendario, ricerca,
confronto agli stessi giorni, «N movimenti») non ricevono mai righe aggregate per i mesi che mostrano: in
Fase B leggono le righe vere del loro periodo (§ 6.5). Dove una funzione conta righe su più mesi usa
`rowCountOf(e) = e.aggregateCount ?? 1`.

### 4.3 Quali mesi si leggono dalle righe

Un mese `m` si legge **dalle righe** se vale almeno una di queste:

1. `m` è il mese in corso (italiano). I mesi **futuri** si leggono dai totali come i chiusi (D-TM14): le
   scritture ne chiedono la ricostruzione come per un mese chiuso;
2. `m` non è nei totali ma le righe esistono (anno senza documento, CU10, o `schemaVersion` vecchia);
3. il `builtAt` di `m` è **precedente alla fine di `m`** (ora italiana). Succede il primo del mese, prima del
   cron: il mese appena chiuso è stato ricostruito l'ultima volta la sera prima, e le righe salvate dopo le
   19:00 dell'ultimo giorno non ci sono.

Altrimenti si legge dai totali. La regola 3 rende i totali corretti per costruzione anche nella notte a cavallo
del mese, senza dipendere dall'orario del cron. Il costo è al più un mese di righe in più, un giorno al mese.

Le funzioni che oggi **escludono le righe dopo oggi** (Storico: «una riga dopo oggi è in calendario»)
continuano a farlo: il mese in corso arriva dalle righe vere, e le righe aggregate dei mesi futuri hanno la
data del 15 di un mese futuro, quindi sono escluse dalla stessa condizione.

## 5. Chi scrive i totali

### 5.1 Il costruttore

Una funzione pura, `buildMonthTotals(rows): ExpenseTotalsMonth` (senza `builtAt`), e un servizio Admin
`rebuildExpenseTotals(userId, months[])` in `lib/server/expenseTotals.ts` che, per ogni mese:

1. legge le righe del mese (`userId ==`, `date` tra inizio e fine del mese italiano: l'indice
   `userId, date` esiste già);
2. scrive `months.{MM}` del documento dell'anno con `update` e `builtAt = now`; un mese senza righe resta
   con `rowCount: 0` e nessuna cella (D-TM15: «costruito e vuoto» è diverso da «mai costruito»). Un anno
   senza documento, o con `schemaVersion` vecchia, si scrive **intero** (dodici mesi) dalle righe dell'anno.

Mesi contigui dello stesso anno vanno in una sola lettura e una sola scrittura. Costo: Em letture e una
scrittura per mese ricostruito.

### 5.2 Dopo una scrittura

**Il mese in corso non chiede niente** (D-TM4): si legge dalle righe, ed è il cron a ricostruirlo ogni sera.
Ogni scrittore che tocca righe di un **altro** mese, chiuso o futuro (D-TM14), chiama, dopo il commit,

```ts
markExpenseMonthsChanged(ownerId, dates: Date[] | 'all', reason)
```

che toglie il mese in corso, deduplica e manda i mesi a `POST /api/expense-totals/rebuild` (stessa autorizzazione di
`/api/dashboard/overview/invalidate`: `ownerId` deve essere un account su cui il chiamante può agire, riga
nuova in `__tests__/routeAuthorization.table.ts`). Gli scrittori server chiamano direttamente
`rebuildExpenseTotals`. La chiamata **non è critica**: un errore si registra e non annulla la scrittura,
come l'invalidazione della Panoramica; la verifica notturna ripara (CU5). Lo scrittore client **attende** la
chiamata, così l'invalidazione di `queryKeys.expenses.all(ownerId)` nel suo `onSuccess` (sotto cui sta la
chiave dei lettori, D-TM16) rilegge il documento già ricostruito. Oltre 120 mesi la chiamata manda `'all'`.

Per una modifica servono **entrambe** le date: quella vecchia e quella nuova della riga (una spesa spostata da
marzo ad aprile cambia due mesi). `'all'` ricostruisce ogni mese con righe: lo usano le riscritture di massa
(rinomina, spostamento o cancellazione di una categoria, di una sottocategoria, di un centro di costo; annullo
di un import; cancellazione di uno strumento con il suo registro).

**Gli scrittori** (dal codice, 23/11/2026; ognuno oggi chiama già `invalidateDashboardOverviewSummary` e la
chiamata nuova va accanto a quella):

| File | Funzioni | Date |
|---|---|---|
| `lib/services/expenseService.ts` | `createExpense`, `createExpenseSettledOnDate`, `saveExpenseFee`, `writeExpenseRows` (ricorrenze, rate), `updateExpense`, `deleteExpense`, `deleteExpenseRows`, `deleteInstallmentExpenses`, `deleteRecurringExpenses` | quelle delle righe scritte o cancellate, vecchie e nuove |
| `lib/services/expenseService.ts` | `updateExpensesCategoryName`, `reassignExpensesCategory`, `clearExpensesCategoryAssignment`, `reassignExpensesSubCategory`, `moveExpensesToCategory`, `moveExpensesFromSubCategory`, il cambio di tipo di una categoria e le due funzioni alle righe 1549 e 1594 | quelle delle righe lette prima del batch (le funzioni le hanno già) |
| `lib/services/expenseCategoryService.ts` | `updateCategory` (nome, tipo), `deleteCategory` | tramite le funzioni sopra |
| `lib/services/costCenterService.ts` | `assignExpensesToCostCenter`, `renameCostCenterInExpenses`, `deleteCostCenter` | non cambiano le celle (nessuna dimensione di centro): **nessuna chiamata**. Se un giorno il centro entra nelle celle, `'all'` |
| `lib/services/expenseImportService.ts` | `commitImportPlan`, `deleteExpensesByImportBatch` | `'all'` (un import storico tocca molti mesi) |
| `lib/services/dividendIncomeService.ts` (server) | `createExpenseFromDividend`, `updateExpenseFromDividend`, `deleteExpenseForDividend` | la data di pagamento |
| `lib/services/dividendService.ts` (server) | cancellazione delle cedole e dei premi futuri | le date di pagamento delle righe cancellate (mesi futuri, D-TM14) |
| `lib/server/assetTransactionUseCase.ts` | la riga commissione di un'operazione (crea, modifica, cancella) | la data dell'operazione, vecchia e nuova |
| `lib/server/assetDeletion.ts` | cancellazione di uno strumento con il registro (F14) | **nessuna**: cancella operazioni, contributi e dividendi futuri, mai righe di spesa (verificato 23/11) |
| `lib/services/pensionContributionService.ts` | il trasferimento di un versamento volontario | passa da `createExpense` / `deleteExpense`, che chiamano |
| `lib/services/debtRepaymentService.ts`, `lib/server/cashSettlement.ts`, `lib/services/loanMigration.ts` | aggiornano `balancePending`, `debtPrincipalRepaid`, `debtInterestPaid`, `debtAssetId` | **nessuna**: non sono dimensioni delle celle |
| `lib/services/dummyDataService.ts`, `dummySnapshotGenerator.ts` | dati di prova | `'all'` alla fine |
| `scripts/*` che scrivono spese (seed degli e2e, `mirror:seed`, `backup:restore`) | | ricostruzione completa alla fine (§ 7.3) |

Un test (`__tests__/expenseTotalsWriters.test.ts`) cerca in `app`, `lib`, `scripts`, `components` ogni file
che nomina la collezione (`collection(…'expenses')`, `= 'expenses';`, una lista costante di collezioni come
quella di `mirror:seed`) e fallisce se il file non è dichiarato «calls» (e allora deve contenere la chiamata)
o «no-call» con il motivo: uno scrittore nuovo deve decidere se chiama o no. Ogni aggiornamento di righe
esistente scrive anche `updatedAt` (verificato 23/11), quindi il passo 2 della verifica li vede tutti.

### 5.3 La verifica notturna

Nel cron serale, per ogni utente ammesso, **dopo** lo snapshot e **prima** della Hall of Fame (§ 6.1):

1. **Mese in corso**: `rebuildExpenseTotals(userId, [mese in corso])`. Em letture.
2. **Righe modificate**: `expenses where userId == u and updatedAt > lastVerifiedAt` (indice nuovo
   `userId, updatedAt`). Si ricostruiscono i mesi chiusi di quelle righe. Costa le righe cambiate, di solito
   poche. Prende le modifiche che non cambiano conteggio né somma (una spesa spostata di categoria).
3. **Conteggio e somma per anno**: per ogni anno con un documento, **una** query di aggregazione
   `count()` + `sum('amount')` sull'intervallo dell'anno. Firestore la conta 1 lettura ogni 1.000 voci di
   indice: un anno da 960 righe è 1 lettura. Se il risultato è diverso da Σ `rowCount` / Σ `amountSum` dei
   mesi (tolleranza 0,005 € sulla somma), la stessa query **per mese** su quell'anno (12 letture) trova i mesi
   diversi, che si ricostruiscono. Prende le righe aggiunte o cancellate da chi non ha chiamato (CU5) e le
   cancellazioni, che il punto 2 non vede.
4. **Anni mancanti**: un anno con righe e senza documento (dai limiti `getExpenseDateBounds`, 2 letture) si
   costruisce per intero (migrazione pigra, § 7.1).
5. `lastVerifiedAt = inizio del giro` in `expense-totals-meta/{userId}` (un documento piccolo, server).

Un errore in questi passi si registra e il cron passa comunque alla Hall of Fame, che legge i mesi secondo
§ 4.3: il mese in corso e quelli non ricostruiti dopo la loro chiusura dalle righe, gli altri dai totali così
come sono. La verifica della notte dopo ripara il resto.

### 5.4 Ricostruzione completa

`rebuildAllExpenseTotals(userId)`: legge tutte le righe una volta (E letture), riscrive tutti gli anni. La usano
la migrazione (§ 7), il cambio di `schemaVersion` (la verifica trova un documento con versione vecchia e lo
ricostruisce: gli anni passano dalle righe nel frattempo, regola 2) e il pulsante «Aggiorna i record» della
Hall of Fame (`POST /api/hall-of-fame/recalculate`), che diventa anche il modo manuale di rimettere in ordine i
totali.

## 6. Chi legge i totali

### 6.1 Hall of Fame

`updateHallOfFame` (server) legge **gli snapshot e i documenti di totali**, mai le righe: costruisce la lista
con `loadExpenseFlows` (i mesi da righe secondo § 4.3). Nel cron riceve dalla verifica i documenti e i limiti
già letti e si fida del mese in corso appena ricostruito (`trustRunningMonth`, D-TM17), quindi legge solo gli
snapshot e la passa a `calculateMonthlyRecords` /
`calculateYearlyRecords` **invariate**. Oggi entrambe filtrano per mese italiano e sommano con
`calculateTotalIncome` / `calculateTotalExpenses`: sulle righe aggregate danno gli stessi numeri.

Lo scrittore client (`lib/services/hallOfFameService.ts`, chiamato dalla Panoramica dopo uno snapshot,
`app/dashboard/page.tsx:362`) **chiama la route** `POST /api/hall-of-fame/recalculate` invece di rileggere
tutto dal browser (D-TM7). «Aggiorna i record» della pagina manda anche `rebuildTotals: true`: la route
ricostruisce tutti i totali prima dei record (§ 5.4).

Costo notturno per utente: S snapshot + Y documenti, più il resto della verifica (§ 5.3). Al quinto anno
circa 155 letture, contro 4.860 di oggi (§ 11).

### 6.2 Storico

`app/dashboard/history/page.tsx`: `useExpenses` → `useExpenseFlows(ownerId)`, un hook nuovo con **una**
query (`queryKeys.expenses.flows`, D-TM16) che chiama `loadExpenseFlows` sul client: i limiti (due letture),
i documenti di totali del proprietario (una query `userId ==`) e le righe dei mesi di § 4.3, e restituisce la
lista unita. `buildYearlyGrowthDrivers`,
`buildMonthlyGrowthDrivers`, `summarizeLaborMetrics`, `prepareMonthlyLaborMetricsData` restano come sono.

Da controllare nell'impl: `summarizeLaborMetrics` somma le righe con `type !== 'income'`, transfer compresi.
Con le righe aggregate il risultato è identico (le celle transfer ci sono); il comportamento in sé è fuori da
questa card.

### 6.3 FIRE

`components/fire-simulations/FireCalculatorTab.tsx` e `lib/hooks/useAnnualCashflow.ts`: le due finestre
`fireWindows(now, firstSnapshot)` (`recent`, `older`) diventano liste di `useExpenseFlows`: la finestra
`recent` (gennaio dell'anno scorso → dicembre, la chiave che condividono Calcolatore, `useAnnualCashflow` e
la pagina) per le cifre dell'anno, e **una** lista dal primo mese della storia a dicembre per il Dettaglio
(con `to` filtrato in memoria: la chiave non cambia).
`computeAnnualCashflowData` (anno scorso e anno in corso per tipo, entrate per categoria) e `buildFIREData`
(secchi mensili per tipo dal primo snapshot) sommano per mese, tipo e categoria: invariati. Il mese in
corso arriva dalle righe, quindi «da inizio anno a oggi» (`selectExpensesBetween(…, currentYearStart, now)`)
resta esatto.

`fireWindows` resta per chi legge ancora le righe di una finestra; i lettori che passano ai totali escono dal
test di invarianza delle finestre ed entrano in quello dei totali (§ 13).

### 6.4 Rendimenti

`lib/services/performanceService.ts`: le tre letture `getExpensesByDateRange(userId, start, end)` diventano
`readPerformanceExpenses(userId, start, end, dividendCategoryId)` (`readExpenseFlows` con la categoria
dividendi dalle righe vere, filtrata su `[start, end]`):

- totali per i mesi chiusi dell'intervallo, **senza** le celle della categoria dividendi;
- le **righe vere** della categoria dividendi (`userId ==`, `categoryId == dividendCategoryId`, poche: una per
  pagamento), perché `buildReturnFlowAdjustments` le confronta con il registro per `id` e guarda
  `linkedCashAssetId`;
- le righe vere dei mesi di § 4.3, che servono anche al taglio del mese in corso al giorno dello snapshot
  (`resolveFlowCutoff`, B3).

`getCashFlowsFromExpenses` raggruppa per mese con `getFullYear()`/`getMonth()` del calendario locale: nel
browser in Italia è il mese italiano, sul server (PDF, Vercel in UTC) una riga salvata a mezzanotte del primo
del mese cade nel mese prima. Con le righe aggregate al 15 del mese il gruppo è giusto in ogni calendario;
per le righe vere il raggruppamento passa a `getItalyMonthYear` (D-TM6). Nel browser in Italia nessuna cifra
cambia; nel PDF il raggruppamento dei movimenti a cavallo di mezzanotte diventa quello della pagina.

`CACHE_MATH_VERSION` non cambia: i numeri sono gli stessi.

### 6.5 Analisi (Fase B)

Implementata il 23/11/2026. La tabella è quella del passaggio tile per tile sul codice, che corregge la versione della
spec in due punti: il modo Storico (D-TM19) e il periodo mostrato durante una lettura (D-TM20).

**Cosa legge** (`resolveAnalisiReads`, `useAnalisiExpenses`; `lib/utils/analisiExpenses.ts`). È la scheda a leggere,
perché il periodo è suo:

- **un anno** («Da inizio anno», «Anno corrente», «Anno», con o senza mese): le **righe vere dell'anno**
  (`analisiYearWindow`), il **mese dell'anno prima** quando il mese in corso si confronta «agli stessi giorni»
  (`analisiMonthWindow`), e ogni altro mese da `useExpenseFlows` (la lista di Storico, stessa chiave in cache).
  `composeAnalisiExpenses` sostituisce nella lista dei totali i mesi letti dalle righe; un mese non è mai entrambi;
- **Storico**: tutte le righe, come prima (D-TM19).

| Cosa | Legge oggi | Riceve con i totali | Perché le cifre non cambiano |
|---|---|---|---|
| Periodo (trio, barre), verdetto, Spese maggiori, Composizione, Flusso, ruoli, calendario, «in calendario», sottocategorie e movimenti della Scheda | `periodExpenses` | righe vere: il periodo sta dentro l'anno letto | stesse righe |
| Barre dell'anno prima nel Periodo (`buildMonthlySpending`) | `baseExpenses` | righe aggregate dell'anno prima | somme per mese; «l'anno prima ha righe» resta vero (una cella per mese con righe) |
| Ritmo e categorie che cambiano (`computeTotalsPacing`, `buildCategoryComparison`), Confronto annuale | `allExpenses` | anno scelto dalle righe, anno di confronto dalle righe aggregate; con `scope.throughDay` il mese di confronto dalle righe vere (anche per un altro anno scelto nel Confronto, che lo legge da sé) | somme per mese, tipo e categoria; il taglio al giorno solo su righe vere |
| Fuori scala (`detectSpendingAnomalies`, `nearestToAnomaly`) | `allExpenses` | il mese (sempre nell'anno scelto, `resolveSingleMonth`) dalle righe, i sei prima anche aggregati | somme per categoria e mese; `magnitude` riga per riga = cella per segno (D-TM13) |
| Scheda: ritmo, righe per anno, serie a 24 mesi, delta per sottocategoria | `allExpenses` | anni chiusi aggregati, mese in corso vero | il ritmo divide vissuto e calendario per **mese** (`isLived` sull'indice del mese), mai per giorno |
| Dettaglio › Andamento del risparmio | `allExpenses` | l'anno scelto (solo quello: `scopeYear`) | righe vere |
| Anni del selettore, ricerca, etichette di un fuoco da URL | `baseExpenses` | lista composta | un mese con righe ha almeno una cella; i nomi della cella sono quelli della riga più recente (§ 4.1) |
| Modo **Storico**: ogni tile, Andamento storico, Confronto pluriennale | tutte le righe | tutte le righe (D-TM19) | stesse righe |

Le funzioni che contano righe (`transactionCount`, «N spese», le occorrenze di `rankTopExpenses`) ricevono solo righe
vere: nessuna passa a `rowCountOf`. Il test `__tests__/analisiExpensesInvariance.test.ts` esegue ogni costruttore della
tabella sulle due liste, su sette periodi, due «oggi» (metà marzo; il primo di aprile prima del cron), due soglie della
storia, sotto `TZ=Europe/Rome` e `TZ=UTC` (CA5 di Fase B).

**Un ordine trovato dal test** (D-TM21): i delta per sottocategoria della Scheda (`buildEntitySubCategoryDeltas`) a pari
delta restavano nell'ordine in cui arrivavano le righe. Ora a pari delta l'ordine è per chiave: le cifre sono le stesse,
cambia solo l'ordine di due righe uguali.

## 7. Migrazione

### 7.1 Senza ordine obbligato

Un anno senza documento si legge **dalle righe** (regola 2 di § 4.3): il deploy del codice nuovo prima dello
script non cambia nessuna cifra, costa solo quello che costa oggi. Il cron costruisce gli anni mancanti la
prima notte (§ 5.3, passo 4).

### 7.2 Lo script

`npm run expense-totals:build -- [--uid <uid> | --email <email> | --all] [--dry-run]` (Admin, dal Mac,
stesso schema di `backup:export`: in produzione chiede di digitare l'id del progetto). Fa
`rebuildAllExpenseTotals` per ogni utente e stampa, per anno, righe lette, mesi scritti e il confronto
conteggio/somma con la query di aggregazione. Con `--dry-run` calcola e confronta senza scrivere.

Costo una volta: E letture per utente (sull'account di Giorgio circa 2.000 a fine 2026) e Y scritture.

### 7.3 Seed, emulatori, mirror, backup

- I seed degli e2e (`seedEmulator.ts`, `seed*E2E.mts`) chiamano `rebuildAllExpenseTotals` alla fine, così
  le spec girano sul percorso dei totali come la produzione.
- `mirror:seed` e `backup:restore` (negli emulatori) idem. `mirror:remove` e il futuro `account:remove`
  cancellano anche `expense-totals` e `expense-totals-meta`.
- Il registro del backup (`scripts/lib/backup/registry.ts`) ha due righe nuove con `cache: true` (si
  ricalcolano dalle righe, D-BK7): `backupRegistry.test.ts` resta verde.

## 8. Regole, indici, chiavi

- `firestore.rules`: `match /expense-totals/{docId}` con `allow read: if canAccess(resource.data.userId)` (il
  client legge con una query `userId ==`, che le regole accettano) e `match /expense-totals-meta/{userId}`
  con `allow read: if canAccess(userId)`; `allow write: if false` su entrambe. Test nella suite delle regole
  (`npm run test:rules`): lettura propria sì, di un altro account no, scrittura dal client mai. **Da
  pubblicare a mano.**
- `firestore.indexes.json`: `expenses (userId ASC, updatedAt ASC)` per la verifica (l'indice `userId, amount` previsto
  per le Spese maggiori del modo Storico **non serve**, D-TM19). **Da pubblicare a mano**
  (`firebase deploy --only firestore:indexes`).
- `lib/query/queryKeys.ts`: `expenses.flows(ownerId, fromIso, realRowsCategoryId)`, **sotto** `expenses.all`
  (D-TM16): ogni scrittura di spese la invalida già, dopo la ricostruzione che ha atteso. La cache
  persistita (24 ore) la include come le altre chiavi del proprietario.
- Account condiviso: i totali sono del **proprietario** (`ownerId`), come la Hall of Fame.

## 9. Decisioni

Confermate da Giorgio il 23/11/2026, tutte e dodici.

| ID | Decisione proposta | Alternative scartate | Motivo |
|---|---|---|---|
| D-TM1 | **Le cifre non cambiano**: ogni lettore dà sui totali gli stessi numeri che dà oggi sulle righe, entro 0,005 € | Approfittarne per correggere differenze trovate (transfer in `summarizeLaborMetrics`) | Una correzione di capacità che cambia cifre è indistinguibile da un bug. Le stranezze trovate vanno in card a parte |
| D-TM2 | Un documento per **utente e anno** | Uno per mese (12 volte le letture); uno per utente (arriva a 1 MiB in circa dieci anni) | Y letture per tutta la storia, documento sotto i 100 KB |
| D-TM3 | I totali arrivano alle funzioni pure come **righe aggregate** (una per cella), mese per mese al posto delle righe vere | Riscrivere ogni lettore su una struttura di totali | Le formule di Hall of Fame, Storico, FIRE e Rendimenti non si toccano, e l'invarianza si prova con un test per lettore |
| D-TM4 | **Il mese in corso si legge sempre dalle righe**; lo ricostruisce il cron ogni sera. Le scritture chiedono la ricostruzione solo per i mesi chiusi | Ricostruire a ogni salvataggio | Quasi tutti i salvataggi sono del mese in corso: zero letture in più per il Tracciamento. Il mese in corso serve comunque a giorno (taglio di Rendimenti, «in calendario») |
| D-TM5 | **Scrive solo il server**, ricostruendo un mese dalle sue righe; il client chiede la ricostruzione con una route | Incrementi (`FieldValue.increment`) nello stesso batch di ogni scrittura, anche dal client | Gli incrementi chiedono di toccare una trentina di scritture, di leggere la riga vecchia a ogni modifica e di aprire il documento alla scrittura del client; uno scrittore dimenticato lascerebbe una deriva **permanente**. La ricostruzione si ripara da sola |
| D-TM6 | Il mese è quello **italiano** ovunque, anche in Rendimenti | Tenere il mese locale di `getCashFlowsFromExpenses` | Le righe aggregate hanno un mese solo. Nel browser in Italia nessuna cifra cambia; il PDF (server in UTC) smette di spostare al mese prima le righe salvate a mezzanotte |
| D-TM7 | La Hall of Fame **legge i totali** (snapshot + Y documenti); lo scrittore client dopo uno snapshot dalla Panoramica chiama la route del server | Hall of Fame incrementale autonoma: i record di ogni mese salvati nel suo documento, la notte solo il mese in corso | Con i totali la Hall of Fame costa S + Y: al decimo anno circa 130 letture a notte per utente (0,8% del limite per tre persone). L'incrementale autonomo toglierebbe ancora S, ma con una seconda copia dei dati per mese da tenere allineata (snapshot sostituiti, ripristinati, spese corrette). Non vale la complessità |
| D-TM8 | **Un dossier, due fasi**: A = totali + Hall of Fame + Storico + FIRE + Rendimenti; B = Analisi | La Hall of Fame incrementale prima, da sola; Analisi nella stessa impl | La Hall of Fame senza totali richiederebbe la sua logica incrementale (D-TM7). Analisi è il lettore con più costruttori legati al giorno e al testo: separata, la Fase A arriva prima e con meno rischio |
| D-TM9 | **Verifica notturna** con aggregazione `count` + `sum` per anno e la query delle righe modificate | Ricostruzione completa periodica (E letture a settimana); nessuna verifica | Ripara uno scrittore dimenticato in un giorno con circa Y + poche letture |
| D-TM10 | Le somme restano **in euro come numero**, come le righe | Centesimi interi | Arrotondare riga per riga cambierebbe le cifre delle righe con frazioni di centesimo (dividendi convertiti dal cambio). La differenza di ordine di somma è sotto 1e-9 € |
| D-TM11 | **Migrazione pigra** (anno mancante = righe) più lo script dal Mac | Migrazione obbligatoria prima del deploy | Nessun ordine da rispettare e nessuna cifra diversa in mezzo |
| D-TM12 | Centri di Costo, PDF (per la parte non di Rendimenti) e Budget **fuori** | Tutto in questa card | Leggono a richiesta o una finestra; si portano dopo, se il grafico della console lo chiede |

Prese nell'impl (23/11/2026), le prime quattro confermate da Giorgio nel thread prima del codice:

| ID | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| D-TM13 | Le celle si dividono anche per **segno** (`negative`) | Una cella per tipo, categoria, sottocategoria e commissione | `calculateTotalExpenses` somma `Math.abs` riga per riga: un rimborso (+) e una spesa (−) della stessa categoria danno 2 righe e una cella sola darebbe un'altra cifra. Provato: senza il segno il test di invarianza sbaglia di 757 € |
| D-TM14 | Anche i **mesi futuri** vivono nei totali; le scritture chiedono la ricostruzione di ogni mese tranne quello in corso | Leggere dalle righe ogni mese dopo l'attuale (D-TM4 come scritto) | Le rate in calendario fino al 2030 sono righe che ogni lettore oggi riceve; leggerle tutte a ogni visita annulla il guadagno sugli anni futuri. Corregge D-TM4 |
| D-TM15 | Il documento di un anno ha **tutti i dodici mesi**, i vuoti con `rowCount: 0` | Un mese senza righe assente dalla mappa | «Costruito e vuoto» si distingue da «mai costruito» (regola 2 di § 4.3): un mese vuoto non va riletto dalle righe |
| D-TM16 | **Un** caricatore, `loadExpenseFlows`, con due sorgenti (client e Admin); la chiave sotto `['expenses', ownerId, 'flows', …]` | Un prefisso nuovo `expenseTotals` | Ogni scrittura invalida già `expenses.all`: niente invalidazioni nuove da ricordare, e la stessa funzione serve pagina e cron |
| D-TM17 | Nel cron la Hall of Fame riceve dalla verifica anni, limiti e orologio, e si fida del mese in corso (`trustRunningMonth`) | Rileggere tutto dopo la verifica | Tiene il giro di un utente sotto le 160 letture (CA8: 113 documenti + 6 aggregazioni) |
| D-TM18 | La route `POST /api/expense-totals/rebuild` accetta `months: 'all'` con un limite di 10 all'ora per account | Solo mesi espliciti | Le riscritture di massa (import, dati di prova) e «Aggiorna i record» ricostruiscono tutto con E letture, una volta |

Prese nell'impl di Fase B (23/11/2026):

| ID | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| D-TM19 | Il modo **Storico** di Analisi legge **tutte le righe**, come prima; i tre modi su un anno leggono l'anno dalle righe e il resto dai totali. **Proposta, in attesa della conferma di Giorgio** | La query delle 50 spese più grandi (indice `userId, amount`) prevista dalla spec; le serie come dimensione delle celle (`schemaVersion` 2) | Spese maggiori conta una **serie** (`recurringParentId`, `installmentParentId`) come una voce che vale tutte le sue righe («Affitto 36 volte»): le 50 righe più grandi non la vedono e il tile cambierebbe (D-TM1). Le serie nelle celle sono esatte ma riscrivono tutti i totali e il caso di una serie con una riga sola chiede comunque la riga. Il modo Storico costa le letture di prima; il modo di default prende tutto il guadagno |
| D-TM20 | Durante la lettura di un anno nuovo la pagina **resta sul periodo che mostra**; i controlli e l'URL cambiano subito | Lo scheletro a ogni cambio d'anno (come le finestre di Tracciamento); il periodo nuovo sulla lista vecchia | Sulla lista vecchia l'anno nuovo è solo totali: una riga aggregata finirebbe tra le Spese maggiori e sul 15 del calendario. Lo scheletro a ogni cambio toglierebbe le animazioni di AN2 (la pagina trasforma). Un anno già letto si apre subito dalla cache |
| D-TM21 | A pari delta i delta per sottocategoria della Scheda si ordinano per chiave | L'ordine di arrivo delle righe | Senza, l'ordine di due righe uguali dipende da come arrivano le righe (vere o aggregate). Nessuna cifra cambia |

## 10. Fasi

**Fase A** (una impl, stima 3–4 giorni di thread):
1. `lib/utils/expenseTotals.ts` (costruttore, righe aggregate, `planExpenseFlows`, `mergeExpenseFlows`, `loadExpenseFlows`) e i
   suoi test (CA1–CA3).
2. `lib/server/expenseTotals.ts` (ricostruzione, verifica), la route `rebuild`, `markExpenseMonthsChanged`
   in tutti gli scrittori di § 5.2, il test degli scrittori.
3. Il cron (§ 5.3) e `updateHallOfFame` sui totali; la Panoramica chiama la route.
4. `useExpenseFlows` e i tre lettori: Storico, FIRE, Rendimenti (e la parte di PDF che li condivide).
5. Regole, indice, chiavi, registro del backup, seed; lo script `expense-totals:build`.
6. Le guide: `doc/guide/cashflow.md` § Expenses by window (chi legge i totali), `hall-of-fame.md`,
   `storico.md`, `fire.md`, `rendimenti.md`; CLAUDE.md una riga.

**Fase B** (implementata il 23/11/2026): Analisi secondo § 6.5; l'indice `userId, amount` non serve (D-TM19).

Dopo ciascuna: lo script sulla produzione dal Mac (con l'OK di Giorgio), poi il grafico «Letture» della console
per una settimana.

## 11. Effetto su letture e scritture

Utente tipico dello studio: 80 righe al mese, 25 strumenti; S = snapshot (12 l'anno), E = righe
(960 l'anno), Y = anni, Em = righe di un mese (80). Solo la parte che riguarda le spese, per lettura.

| Lettura | Oggi, 1 · 5 · 10 anni | Con i totali, 1 · 5 · 10 anni |
|---|---|---|
| Cron, Hall of Fame (ogni notte) | S + E: 972 · 4.860 · 9.720 | S + Y + 2 limiti + meta + Em + righe modificate, più Y aggregazioni (1 lettura ciascuna sotto le 1.000 voci): circa 100 · 155 · 225. Sulla storia di CA8 (5 anni + 1, 60 snapshot, 3 righe modificate): 113 documenti + 6 aggregazioni |
| Storico (per visita) | E: 960 · 4.800 · 9.600 | Y + Em: circa 81 · 85 · 90 |
| FIRE › Calcolatore (per visita) | due finestre, di fatto E: 960 · 4.800 · 9.600 | Y + Em: circa 81 · 85 · 90 |
| Rendimenti, cache scaduta | E dal primo snapshot | Y + righe dividendi (circa 12 l'anno) + Em: circa 93 · 145 · 210 |
| Analisi, un anno (Fase B) | E | righe dell'anno (al più 960) + Y + 2 limiti + Em + a volte un mese: circa 1.100, costante; i totali sono già in cache dopo Storico |
| Analisi, modo Storico (Fase B) | E | E, come prima (D-TM19) |

Il primo del mese, fino al cron, ogni lettore legge un mese di righe in più (regola 3 di § 4.3).

**Scritture in più**: una per mese ricostruito. Ogni notte 1–2 per utente (mese in corso, meta). Dopo una
correzione di un mese chiuso, una (più Em letture). Una riscrittura di massa (rinomina di categoria) riscrive
Y documenti e legge E righe, una volta: è il costo di oggi di una sola visita a Storico.

**Spazio**: 50–100 KB per anno e utente. Dieci anni di tre utenti sono circa 3 MB su 1 GiB.

Con le tre persone dello studio (§ 9), Fase A più Fase B è la riga «Solo Totali mensili + Hall of Fame»: oltre
30 anni nel caso realistico, circa 34 nel peggiore.

## 12. Punti aperti

- ~~**Emulatore e `sum()`**~~: chiuso il 23/11. L'emulatore di `firebase-tools` supporta `count()` + `sum()`
  (provato: tre righe, `{count: 3, sum: 1850}`); i test di § 5.3 girano comunque sul fake Admin, che ora
  conta anche le aggregazioni.
- ~~**Uno scrittore che non aggiorna `updatedAt`**~~: chiuso il 23/11, ogni aggiornamento di righe lo scrive.
- **La route che fallisce** (offline, scrittura messa in coda dalla cache di Firestore): il mese chiuso resta
  vecchio sulle pagine fino alla notte. Rarissimo; dichiarato nei punti ciechi delle guide.
- **Centri di Costo** su una query per `costCenterId` invece di tutte le righe: card a parte se serve.
- La card 3 dello studio (cache di Rendimenti prima degli input) potrà usare `builtAt` dei totali nella chiave.

## 13. Criteri di accettazione

Cifre inventate e tonde (WORKFLOW.md regola 7), valori di riferimento calcolati a mano.

**Il mese di prova, marzo 2025** (date a mezzogiorno italiano salvo dove detto):

| Riga | Tipo | Categoria / sottocategoria | Importo |
|---|---|---|---|
| r1 | income | Stipendio | +2.500,00 |
| r2 | variable | Spesa / Supermercato | −120,40 |
| r3 | variable | Spesa / Supermercato | −79,60 |
| r4 | fixed | Casa / Affitto | −800,00 |
| r5 | transfer | Trasferimenti | +300,00 |
| r6 | variable | Commissioni, `feeOfTradeId` | −2,50 |
| r7 | income | Dividendi (categoria dividendi), salvata il **1° marzo alle 00:00** ora italiana | +50,00 |

- **CA1 — costruttore.** `buildMonthTotals` su r1–r7 dà `rowCount = 7`, `amountSum = 2.500 − 120,40 − 79,60 −
  800 + 300 − 2,50 + 50 = 1.847,50`, e le celle: income/Stipendio 2.500,00 (1); variable/Spesa/Supermercato
  −200,00 (2); fixed/Casa/Affitto −800,00 (1); transfer 300,00 (1); variable/Commissioni `tradeFee` −2,50 (1);
  income/Dividendi 50,00 (1).
- **CA2 — Hall of Fame.** Con snapshot a febbraio 100.000 e marzo 101.000: il record di marzo è `netWorthDiff =
  1.000`, `totalIncome = 2.500 + 50 = 2.550,00` (r1 + r7), `totalExpenses = 120,40 + 79,60 + 800 + 2,50 =
  1.002,50` (r2 + r3 + r4 + r6: fisse, variabili e debiti; r5 è un transfer e non conta), risparmio
  2.550 − 1.002,50 = **1.547,50**. Uguale con le righe vere e con le righe aggregate.
- **CA3 — Storico.** Il risparmio del mese (somma delle righe non transfer fino a oggi) è 2.550 − 1.002,50 =
  **1.547,50** sia dalle righe sia dai totali.
- **CA4 — Rendimenti.** Con la categoria dividendi impostata e r7 non nominata dal registro: `income = 2.500`,
  `dividendIncome = 50`, `expenses = 1.002,50`, `netCashFlow = 1.497,50`, correzione C_rows `+2,50`, e r7
  conta `−50` come rendimento misurato se il conto è nella base. **r7 cade a marzo anche con `TZ=UTC`** (oggi,
  sul server, cadrebbe a febbraio: D-TM6).
- **CA5 — invarianza per lettore.** Su una storia inventata di 5 anni (80 righe al mese, ricorrenze, una rata
  in calendario fino al 2030, righe senza `type`, transfer, commissioni), ogni lettore di Fase A
  (`calculateMonthlyRecords`, `calculateYearlyRecords`, `buildYearlyGrowthDrivers`, `buildMonthlyGrowthDrivers`,
  `summarizeLaborMetrics`, `computeAnnualCashflowData`, `buildFIREData`, `getCashFlowsFromExpenses` +
  `buildReturnFlowAdjustments`) dà lo stesso risultato sulle righe vere e sulla lista di `loadExpenseFlows`,
  con «oggi» a metà marzo e il primo di aprile prima del cron (regola 3). Sotto `TZ=Europe/Rome` e `TZ=UTC`.
  In Fase B lo stesso per ogni riga della tabella di § 6.5 (`__tests__/analisiExpensesInvariance.test.ts`, verde in
  entrambi i fusi il 23/11/2026).
- **CA6 — scrittura su un mese chiuso.** r3 spostata dal 15 marzo al 15 aprile 2025: dopo la ricostruzione
  marzo ha `rowCount = 6`, `amountSum = 1.927,10`, Supermercato −120,40 (1); aprile ha Supermercato −79,60 (1).
- **CA7 — riparazione.** Una riga di marzo cancellata con l'Admin senza chiamare la ricostruzione: la verifica
  notturna trova l'anno diverso (conteggio 6 contro 7), poi il mese, e lo ricostruisce; il giro dopo non
  ricostruisce niente.
- **CA8 — letture del cron.** Sul fake Admin che conta i documenti letti, con la storia di CA5 (5 anni, 4.800
  righe, 60 snapshot) e 3 righe modificate dal giro prima: il giro di un utente legge **al più 160 documenti**
  per totali e Hall of Fame (oggi 4.860).
- **CA9 — migrazione pigra.** Senza nessun documento di totali ogni lettore dà le cifre di oggi (CA5 con i
  totali vuoti), e dopo `expense-totals:build --dry-run` il confronto per anno è 0 differenze.
- **CA10 — regole.** `test:rules`: il proprietario e un membro leggono, un altro account no, nessun client
  scrive.
- **CA11 — e2e.** `e2e/history*.spec.ts`, `e2e/fire*.spec.ts`, `e2e/hall-of-fame.*.spec.ts`,
  `e2e/rendimenti*.spec.ts` verdi sui seed con i totali; una spec nuova corregge una spesa di un mese chiuso e
  vede la cifra di Storico cambiare senza ricaricare dopo il ritorno della ricostruzione.

## 14. File

Nuovi: `lib/utils/expenseTotals.ts`, `lib/server/expenseTotals.ts`, `lib/server/expenseTotalsRebuildAll.ts`,
`lib/services/expenseTotalsClient.ts`, `app/api/expense-totals/rebuild/route.ts`,
`lib/hooks/useExpenseFlows.ts`, `scripts/buildExpenseTotals.mts`, `scripts/lib/rebuildExpenseTotals.ts`,
`types/expenseTotals.ts`; test
`__tests__/{expenseTotals,expenseTotalsServer,expenseTotalsWriters,expenseTotalsInvariance}.test.ts`.
Toccati: gli scrittori di § 5.2, `lib/services/hallOfFameService{,.server}.ts`, `app/dashboard/page.tsx`,
`app/api/cron/monthly-snapshot/route.ts`, `app/dashboard/history/page.tsx`,
`components/fire-simulations/FireCalculatorTab.tsx`, `lib/hooks/useAnnualCashflow.ts`,
`lib/services/performanceService.ts`, `lib/services/pdfDataService.ts`, `firestore.rules`,
`firestore.indexes.json`, `lib/query/queryKeys.ts`, `scripts/lib/backup/registry.ts`, i seed.
Fase B: nuovi `lib/utils/analisiExpenses.ts`, `lib/hooks/useAnalisiExpenses.ts`,
`__tests__/analisiExpensesInvariance.test.ts`, `__tests__/helpers/expenseHistoryFixture.ts` (la storia inventata, comune
alle due fasi); toccati `components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/ConfrontoDisclosure.tsx`,
`app/dashboard/analisi/page.tsx`, `lib/utils/expenseWindows.ts` (`analisiYearWindow`, `analisiMonthWindow`),
`lib/hooks/useExpenses.ts` (`enabled`), `lib/utils/expenseEntityStats.ts` (D-TM21).
