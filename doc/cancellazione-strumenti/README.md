# Cancellare uno strumento: la conferma dice dove è usato e fa scegliere

> Card Todoist «F14 FIX cancellare uno strumento: la conferma dice dove è usato e fa scegliere (D4, M6, L1)», label
> `epic-review-fable`. Fonti (Library): `review-sicurezza/parte-4-secret-perdita-dati.md` (D4),
> `review-modello-dati/parte-1-tipi-e-documenti.md` (M6), `review-modello-dati/parte-2-logica-duplicata.md` (L1, con la sonda
> `review-modello-dati/script/orfani-probe.cjs`). Pagine: https://claude.ai/artifact/2hwcn9rwBnE2iJyKtqxprx ·
> https://claude.ai/artifact/WU1QvVw5iUgYRojErZgJva. Specifica scritta il 2026-11-21 leggendo il codice di `main` (`8d520ce`);
> **nessun codice in questo commit**.
>
> **Stato delle decisioni**: la scelta di fondo di D4 è **presa** dal proprietario il 2026-11-14 («si sceglie nella conferma»
> tra «tieni la storia» e «cancella tutto», con il numero di operazioni che restano). Tutte le altre, D-CA1…D-CA12 (§ 8), sono
> **proposte di questa specifica, da far confermare**.

## 1. Obiettivo

Cancellare uno strumento (o un conto) oggi è un gesto a due clic che cancella il documento e i dividendi futuri e non dice
niente d'altro. Le cose che lo citano restano a puntare a un id che non esiste più, e ognuna reagisce a modo suo. Dopo questa
modifica la conferma **dice dove lo strumento è usato, ferma la cancellazione quando lasciarlo orfano rovinerebbe un piano,
pulisce da sé ciò che si può pulire senza cambiare il senso di ciò che resta, e fa scegliere una cosa sola: che fine fa il
registro delle operazioni**.

| | Difetto | Dove | Effetto |
| --- | --- | --- | --- |
| **D4** | Le operazioni del registro restano | `app/api/assets/[assetId]/route.ts` (DELETE), `lib/server/assetTransactionUseCase.ts:685` | Chi legge il registro per `assetId` senza passare dall'asset (`summarizeMonthTrades` in `patrimonioSummary.ts:146`, `summarizePeriodSales` in `periodSales.ts:93`, i flussi di Rendimenti) continua a sommare buy e sell di uno strumento che non c'è più |
| **M6** | Almeno dodici campi puntano all'id cancellato | § 4.1 | Piano PAC, pesi e gruppi del modello, limiti dei Criteri, quote dei traguardi, `financedAssetId`, `dividendCashAssetId`, conti predefiniti, `linkedCashAssetId`/`transferCashAssetId`/`debtAssetId`, previdenza, mutuo dei Flussi nel tempo |
| **L1** | Provato sugli emulatori: nessuna pagina va in errore, ma dicono cose false | `orfani-probe.cjs`, § 2.1 | «Registra» sull'ETF cancellato, id grezzo nel modello, acquisti contati, motivo sbagliato in FIRE, quota dei traguardi tolta in silenzio |

## 2. Perimetro

**Incluso**
- Una sola procedura di cancellazione, lato server, per ogni asset (strumento, conto, immobile, prestito, fondo pensione): il
  rapporto «dove è usato» (`GET`), la cancellazione con la scelta sul registro (`DELETE`), la pulizia dei riferimenti.
- La finestra di conferma `AssetDeleteDialog`, aperta da tutte le porte che oggi cancellano: la riga di Strumenti, la riga
  mobile `AssetRow`, il dettaglio di un conto (`CashAccountDialog`).
- Le parole oneste nei lettori che oggi mostrano un id grezzo o il motivo sbagliato (§ 4.7).
- Un test per ogni riferimento (D-T3, WORKFLOW.md regola 9): il rapporto lo vede, la cancellazione lo tratta come dice la
  tabella di § 4.2.

**Escluso**
- **D5** (cancellazione di una spesa in due passi non atomici): è un altro difetto, di un'altra cancellazione.
- Una pagina o uno strumento di «orfani già presenti» (§ 9 PA-1).
- «Archiviare» uno strumento invece di cancellarlo (§ 8, scarto D-CA3).
- Il toast di «Asset eliminato» e il resto della riga (animazione di chiusura `useArmedDelete`) restano come sono.
- La cancellazione di uno strumento da altri percorsi (il passaggio a `pensionFund` che usa
  `deleteAllAssetTransactionsForAsset` resta com'è: § 4.4).

### 2.1 Cosa è provato e cosa no

Provato (sonda del 2026-11-11, conto census, emulatori): cancellare il documento di un ETF, di una casa e del conto sorgente
del PAC lascia sette pagine senza errori ma con le frasi false elencate in § 1. **Non provato** (da fare nella prima task, § 6):
la cancellazione dal pulsante dell'app, il passo «Registra» fino in fondo, cosa fanno le righe di cashflow con
`balancePending` verso un conto che non c'è (il codice dice che `updateCashAssetBalancesAtomic` lo salta con un `console.warn`,
`assetService.ts:487`), come legge il Previdenza i versamenti di un fondo cancellato.

## 3. Casi d'uso

| | Chi | Cosa | Esito atteso |
| --- | --- | --- | --- |
| CU1 | Chi ha digitato male un ETF e non ha mai registrato operazioni | Elimina la riga | La finestra dice «Non è usato altrove» e il pulsante cancella. Nessuna scelta |
| CU2 | Chi ha venduto tutto (quantità 0, 3 operazioni) | Elimina lo strumento a posizione chiusa | «Tieni la storia» già scelto; l'altra voce dice «Cancella le 3 operazioni» |
| CU3 | Chi vuole togliere uno strumento con quote ancora in mano | Elimina | Nessuna voce già scelta; la finestra dice che le quote escono dal patrimonio senza una vendita e propone «Registra prima la vendita» |
| CU4 | Chi ha un PAC attivo che compra lo strumento | Elimina | La cancellazione è ferma: «Il piano compra questo strumento: rivedilo prima» con il rimando ad Accumulo |
| CU5 | Chi ha lo strumento nel portafoglio modello | Elimina | Ferma: «Il portafoglio modello gli dà il 30%: toglilo prima dal modello» |
| CU6 | Chi ha il limite del 60% nei Criteri e una quota in un traguardo | Elimina | Il rapporto elenca le due righe sotto «Le tolgo io»; il pulsante le toglie insieme allo strumento |
| CU7 | Chi cancella un conto usato come predefinito e come conto dei dividendi | Elimina dal dettaglio del conto | Le due scelte tornano «nessun conto»; i movimenti collegati restano nel cashflow, come oggi |
| CU8 | Chi cancella una casa con un mutuo collegato | Elimina | Ferma: «Il mutuo Casa la finanzia: eliminalo prima» |
| CU9 | Chi cancella un fondo pensione con versamenti | Elimina | La finestra dice che i versamenti restano come registro fiscale (D-CA8) |
| CU10 | Il demo | Prova a eliminare | Il pulsante è disabilitato come oggi |

## 4. Regole

### 4.1 L'inventario dei riferimenti (letto dal codice, `main` `8d520ce`)

Dove un asset può essere citato. «Docu» = collezione/documento; il campo è quello dei tipi.

| # | Collezione · campo | Che cos'è | Tipo |
| --- | --- | --- | --- |
| R1 | `assetTransactions.assetId` | Operazioni del registro dello strumento (anche la riga `isBaseline`) | storia |
| R2 | `assetTransactions.linkedCashAssetId` | Conto su cui un'operazione di UN ALTRO strumento regola il denaro | storia |
| R3 | `dividends.assetId` | Dividendi e cedole; i futuri (`exDate` > oggi) li cancella già la route | storia / futuro |
| R4 | `accumulationPlans` (bozza e attivo): `positions[].memberAssetIds`, `positions[].buyAssetId`, `disposals[].assetId`, `liquidity.sourceCashAssetIds`, `installments[].lines[].assetId` | Il piano di accumulo | piano |
| R5 | `accumulationPlans` (concluso e annullato): gli stessi campi | Storia del piano | storia |
| R6 | `modelPortfolios/{uid}.weights[].assetId`, `.memberAssetIds` | Il portafoglio modello, Σ pesi = 100 | piano |
| R7 | `assetAllocationTargets/{uid}.idealAllocation.instrumentLimits[].assetId` | Limite minimo/massimo per strumento nei Criteri | dichiarazione |
| R8 | `….idealAllocation.groupLimits[].assetIds` | Gruppo di strumenti equivalenti con un limite | dichiarazione |
| R9 | `goalBasedInvesting/{uid}.assignments[].assetId` | Quota di un traguardo (percentuale o quote) | dichiarazione |
| R10 | `assetAllocationTargets/{uid}`: `defaultDebitCashAssetId`, `defaultCreditCashAssetId`, `dividendCashAssetId` | Conti preselezionati e conto dei dividendi | puntatore |
| R11 | `assets.dividendCashAssetId` (di un altro strumento) | Conto che quello strumento accredita | puntatore |
| R12 | `assets.financedAssetId` (di un prestito) | L'immobile che il prestito finanzia | legame |
| R13 | `assetAllocationTargets/{uid}.fireDatedFlows[].source.propertyId` | Il mutuo dei Flussi nel tempo (`lib/utils/fireMortgages.ts`) | dichiarazione |
| R14 | `expenses.linkedCashAssetId`, `.transferCashAssetId`, `.debtAssetId` | Righe di cashflow che spostano un conto o rimborsano un prestito | storia |
| R15 | `pensionContributions.assetId`, `.sourceCashAssetId` | Versamenti al fondo pensione (ricavo fiscale) | storia |
| R16 | `monthly-snapshots.byAsset` | Le foto mensili | storia, mai toccate |

Il rapporto «dove è usato» è una funzione pura, `buildAssetUsage(input)` (`lib/utils/assetUsage.ts`, senza SDK), su documenti
già letti; la lettura è del server (`lib/server/assetUsageReader.ts`, solo Admin SDK, una query per collezione con `userId`
più il campo: due uguaglianze, nessun indice composto).

### 4.2 Che cosa succede a ciascun riferimento (D-CA3)

Tre esiti, e solo tre. Il criterio di assegnazione è scritto una volta (D-CA3) e vale anche per un riferimento nuovo che
upstream o il fork aggiungano.

| Esito | Quando | Cosa fa l'app |
| --- | --- | --- |
| **Ti ferma** | Togliere il riferimento cambierebbe ciò che l'utente ha pianificato, o lascerebbe un dato che non torna (Σ pesi ≠ 100, un piano che non può comprare) | La cancellazione non parte. Il rapporto elenca il blocco e dice dove sistemarlo, con il rimando |
| **Lo tolgo io** | Il riferimento è una dichiarazione o un puntatore che resta vero senza lo strumento | Lo toglie nella stessa cancellazione, lo dice prima in elenco |
| **Resta** | È storia, o è dichiarazione inerte che i lettori sanno leggere | Non lo tocca; il rapporto lo conta |

| # | Esito | Nota |
| --- | --- | --- |
| R1 | **si sceglie** (§ 4.3) | D4 |
| R2 | resta | È l'operazione di un altro strumento: la sua storia non cambia |
| R3 | futuri: la route li cancella già (`exDate` > oggi, solo i dell'account). Passati: restano | Invariato; il rapporto dà i due numeri |
| R4 | **ti ferma**, per qualunque riferimento: strumento che compra, membro di un gruppo, vendita da fare, conto sorgente | D-CA4. «Rivedi il piano» sa già sostituire e separare (AL2) |
| R5 | resta | Le righe portano il nome salvato; nessun lettore le ricalcola |
| R6 | **ti ferma** | D-CA5 |
| R7, R8 | **lo tolgo io**: il limite per strumento sparisce; dal gruppo esce il membro, e un gruppo che resta senza membri sparisce | Con M1 davanti: scrittura del solo campo (§ 4.5) |
| R9 | **lo tolgo io**: le quote del traguardo | Oggi sono già saltate in silenzio da `goalMath.ts:90`; da ora lo dice |
| R10, R11 | **lo tolgo io**: il puntatore torna «nessun conto» (la regola di `resolveDividendAccount` ricade sul predefinito o su nessuno) | |
| R12 | **ti ferma**, se lo strumento è un immobile con prestiti collegati | D-CA6. Se è il prestito a essere cancellato, nessun blocco |
| R13 | resta, elencato; il lettore dice il motivo vero (§ 4.7) | D-CA6 |
| R14 | resta; per un conto la frase di oggi («restano nel cashflow senza conto») | I lettori sono già tolleranti: `assetService.ts:487` salta il conto assente |
| R15 | resta | D-CA8. Sonda richiesta (§ 9 PA-2) |
| R16 | resta sempre | Una foto è una foto |

### 4.3 La scelta sul registro (D4, D-CA2)

Compare solo se `assetTransactions` ha almeno una riga per lo strumento (la riga `isBaseline` conta). Due voci esclusive:

- **Tieni la storia**: le N operazioni restano nel registro. Sono ancora sommate da chi legge il registro per `assetId`
  (§ 1, D4); la finestra lo dice con il numero e con l'effetto: «restano nelle somme di Rendimenti e nei movimenti del mese».
- **Cancella le N operazioni**: il registro dello strumento viene svuotato in un solo passo, con la stessa funzione del
  passaggio a fondo pensione (`deleteAllAssetTransactionsForAsset`, che già ricalcola i dividendi aperti). Non si può annullare.

Quale voce è già scelta (D-CA2):
- quantità 0 e almeno un'operazione (tutto venduto): **Tieni la storia**. È il caso in cui la storia è giusta: «non lo possiedo
  più» non è «non è mai esistito» (così già dice la route);
- quantità > 0: **nessuna voce scelta**, il pulsante resta spento finché non si sceglie. La finestra avverte che le quote
  escono dal patrimonio senza una vendita, che questo non compare come realizzato, e offre «Registra prima la vendita»
  (apre `TransactionDialog` sullo strumento) — è l'unico caso in cui «Tieni la storia» lascia un acquisto senza la sua vendita
  nelle somme.

La finestra dice anche, in una riga, quanti dividendi passati restano e quanti futuri vengono cancellati.

### 4.4 La procedura sul server (D-CA9)

Due richieste, un'unica fonte della verità:

1. `GET /api/assets/[assetId]/usage?userId=` → `AssetUsage`: `{ ledger: { count, quantity, firstDate, lastDate }, dividends:
   { future, past }, blockers: UsageLine[], cleanups: UsageLine[], kept: UsageLine[] }`. Una `UsageLine` è `{ code, area,
   count?, sentence, href? }`: `code` è il numero della tabella (R4…), la frase è già in italiano (parole in
   `lib/utils/assetUsageNarrative.ts`, pura e testata come ogni modale, `dialogNarrative.ts`).
2. `DELETE /api/assets/[assetId]` con corpo `{ userId, ledger: 'keep' | 'delete' }` (`ledger` obbligatorio se il rapporto dice
   `ledger.count > 0`, altrimenti 400). Il server **rilegge il rapporto** e non si fida del client: con un blocco risponde 409
   `asset/in-use` con le righe; senza, esegue.

Ordine di esecuzione, pensato per poter ripartire (idempotente) se si interrompe a metà:
1. pulizie R7–R11 e R9 (tutte scritture di un campo solo, § 4.5);
2. se `ledger === 'delete'`: cancellazione del registro dello strumento, a lotti da 400 (oggi un lotto solo: oltre 500 righe
   fallirebbe), poi `syncDividendsAfterTrade`;
3. dividendi futuri (come oggi);
4. **per ultimo** il documento dell'asset, con `invalidateDashboardOverviewSummaryServer(userId, 'asset_deleted')`.

Se qualcosa si ferma prima del passo 4 lo strumento esiste ancora e la stessa richiesta, rifatta, conclude (le pulizie non
trovano più nulla da togliere). Il rapporto di ritorno dice che cosa è stato fatto davvero.

`useDeleteAsset` (`lib/hooks/useAssets.ts:58`) invalida, oltre agli asset: il registro, i dividendi, i piani di accumulo, il
modello, le impostazioni di allocazione, i traguardi e la Panoramica. L'elenco è un test (`__tests__/useDeleteAsset.test.ts`).

### 4.5 Scrivere solo ciò che cambia (lezione di M1)

Le pulizie non rileggono e riscrivono il documento intero. `assetAllocationTargets` si aggiorna con un `update` sui soli campi
`idealAllocation.instrumentLimits`, `idealAllocation.groupLimits`, i tre puntatori R10 (con `FieldValue.delete()` per
toglierli); `goalBasedInvesting` (rigirata intera «per design», `goalData.ts`) con una transazione che rilegge, filtra
`assignments` e scrive il solo `assignments`. Il test D-T3 è quello di M1 (`firePlanSave.staleCache.test.ts`): altre
impostazioni salvate altrove nel frattempo non spariscono.

### 4.6 La finestra (D-CA1) — schizzo «oggi / proposta» in § 10

`AssetDeleteDialog`, un `ResponsiveModal` (`sm`, a foglio su telefono, DESIGN → The Modal-Is-A-Tile Rule). Ordine delle parti,
ognuna presente solo se serve:
1. **Lettura** (una frase, generata): «Elimini Fondo ETF Mondo (3 operazioni, 0 quote). Ecco dove è usato.»
2. **Ti ferma** (se c'è): righe con il rimando; il pulsante di conferma è assente e c'è «Chiudi».
3. **Il registro** (se ci sono operazioni): le due voci di § 4.3.
4. **Lo tolgo io**: un elenco, una riga per riferimento («Limite 60% nei Criteri del modello», «30% del traguardo Casa»).
5. **Resta**: una riga di conteggi («12 movimenti del cashflow, 4 dividendi passati, 2 versamenti»).
6. **Azione**: «Elimina» (destructive), «Annulla». Il pulsante è un clic solo: la finestra è già la conferma (come
   `SeriesDeleteDialog`, che sostituì il doppio passaggio); l'arm a due clic della riga e del dettaglio del conto lascia il
   posto alla finestra (D-CA1).
Mentre il rapporto si legge: scheletro di due righe; se la lettura fallisce, `ErrorNotice` e nessuna azione (mai cancellare
alla cieca).

### 4.7 I lettori dicono il vero (L1)

Anche senza la finestra gli orfani esistono già (cancellazioni passate, § 9 PA-1) e possono nascere da un'altra porta
(Firebase console). Quattro frasi da correggere, senza ricalcolare nulla:
- Modello: l'id grezzo (`accumuloSummary.ts:275`, `?? weight.assetId`) diventa «Strumento eliminato».
- Accumulo › Questo mese: una riga di un piano il cui strumento non c'è non offre «Registra»; dice «Strumento eliminato:
  rivedi il piano».
- FIRE › Base di calcolo: il flusso collegato a un immobile che non c'è dice «l'immobile non esiste più» invece di «nessuna rata
  collegata al mutuo» (`lib/utils/fireMortgages.ts`).
- Criteri: un gruppo con un membro che non c'è lo segnala.

## 5. Coerenza con le altre specifiche

- **F07 «snapshot integri»**: le foto restano (R16); nessun nuovo scrittore di snapshot.
- **F10 / F09**: il registro di un asset cancellato con «Cancella» chiama `syncDividendsAfterTrade` (F09), come già fa la
  conversione a fondo pensione; nessuna cifra di Rendimenti cambia per gli strumenti che restano.
- **F11 «regole»**: nessuna regola nuova: tutte le scritture passano dall'Admin SDK (la route lo faceva già).
- **F16 R8 (Allocazione)** e **«Fable minori · Pesi per strumento» (M4)**: il modello comanda (M4). Quando i gruppi
  diventeranno un dato unico (M4), R7/R8/R4/R6 si ridurranno a un puntatore; il rapporto (`buildAssetUsage`) è la sola
  funzione da aggiornare.
- **Sicurezza (F02)**: la nuova route `GET /api/assets/[assetId]/usage` è una riga di `__tests__/routeAuthorization.table.ts`
  (RA1–RA5) e legge solo con lo `userId` dell'account che il chiamante può accedere.
- **Budget di prestazioni**: la finestra si carica con `next/dynamic` all'apertura; nessun peso sulle rotte condivise. Le
  misure (`perf:build`, `perf:budget`) si fanno sul Mac (WORKFLOW.md regola 10).

## 6. Implementazione (per il thread impl)

1. **Sonda, prima di scrivere codice** (staccata dalle task, sugli emulatori): rilanciare `orfani-probe.cjs` dopo aver
   cancellato dal pulsante, e provare i tre punti di § 2.1. Il risultato entra in § 9 prima del resto.
2. **T1 — il rapporto**: `assetUsage.ts` (pura) + `assetUsageNarrative.ts` + `assetUsageReader.ts` + route `GET`. Test: un caso per
   riferimento di § 4.1 (R1–R16) con la tabella di § 4.2.
3. **T2 — la cancellazione**: DELETE con `ledger`, le pulizie, i lotti da 400, l'ordine di § 4.4; test di idempotenza (si
   interrompe dopo il passo 2 e si ripete) e del blocco 409.
4. **T3 — la finestra**: `AssetDeleteDialog` e le tre porte; `useDeleteAsset`; e2e sugli emulatori (cloud, D-T2).
5. **T4 — i lettori**: le quattro frasi di § 4.7 con i loro test.
T1+T2 vanno insieme in una PR (stesso file di route); T3 nella stessa PR o subito dopo; T4 può andare per conto suo. Sonnet 5.5
basta. Nessun controllo del Mac tranne `perf:budget` e il giudizio visivo della finestra (1280/1440 e 390).

## 7. Criteri di accettazione (valori a mano, cifre inventate e tonde)

Fixture: strumento `ETF-A` con operazioni buy 10 × 50, buy 5 × 60, sell 15 × 70 (quantità 0, tre righe); dividendi: 1 passato,
2 futuri; piano `P1` attivo con `ETF-A` che compra; modello con `ETF-A` al 30%; limite per strumento 60% su `ETF-A`; gruppo
`G1 = [ETF-A, ETF-B]` con limite 80%; traguardo `Casa` con quota 30% di `ETF-A`; `defaultDebitCashAssetId = CONTO-X`.

| | Dato | Atteso |
| --- | --- | --- |
| AU1 | rapporto di `ETF-A` | `ledger.count = 3`, `quantity = 0`; dividendi `{ future: 2, past: 1 }`; blockers: R4 (P1), R6 (30%); cleanups: R7, R8, R9 |
| AU2 | `DELETE` con `ledger: 'keep'` su `ETF-A` | 409 `asset/in-use` con le righe R4 e R6; **nessun documento è cambiato** (confronto prima/dopo di tutte le collezioni) |
| AU3 | P1 annullato e `ETF-A` tolto dal modello, poi `DELETE` con `ledger: 'keep'` | asset assente; `assetTransactions` per `ETF-A`: 3 righe; dividendi futuri: 0, passato: 1; limite R7 assente; `G1.assetIds = [ETF-B]`; quota di `Casa` assente |
| AU4 | come AU3 ma `ledger: 'delete'` | `assetTransactions` per `ETF-A`: 0 righe; `syncDividendsAfterTrade` chiamata una volta |
| AU5 | `DELETE` senza `ledger` su un asset con 3 righe | 400; nulla scritto |
| AU6 | `DELETE` su un asset con 0 righe, senza `ledger` | 200 |
| AU7 | il gruppo `G2 = [ETF-A]` (un solo membro) | dopo la cancellazione `G2` non esiste più |
| AU8 | `CONTO-X` cancellato dal suo dettaglio | `defaultDebitCashAssetId` assente (campo cancellato, non `null`); le righe di cashflow che lo citano sono invariate; il rapporto le conta come «restano» |
| AU9 | immobile `CASA` con il prestito `MUTUO` (`financedAssetId = CASA`) | `DELETE CASA` → 409 R12; `DELETE MUTUO` → 200 e `CASA` resta |
| AU10 | `fireDatedFlows` con un flusso `source.propertyId = CASA` e `CASA` cancellata (dopo aver tolto il mutuo) | il flusso c'è ancora; il lettore dice «l'immobile non esiste più» |
| AU11 | l'interruzione dopo il passo 2 e la ripetizione | nessun errore, stato finale identico ad AU4 |
| AU12 | un altro campo di `assetAllocationTargets` salvato tra la lettura del rapporto e la cancellazione | resta (M1) |
| AU13 | un `userId` altrui con un asset dello stesso id | 403/404; l'asset altrui intatto (positivo: il proprio funziona) |
| AU14 | 520 operazioni sul registro | cancellate in due lotti (400 + 120), nessun errore |
| AU15 | finestra, 1440 e 390 | per CU1–CU9 la parte giusta è presente e le altre assenti; con un blocco il pulsante «Elimina» non c'è; Escape chiude |
| AU16 | `useDeleteAsset` | invalida le dieci chiavi di § 4.4 |

## 8. Decisioni

### Presa dal proprietario il 2026-11-14

- **D-CA2 (base)**: nella conferma si sceglie tra «tieni la storia» e «cancella tutto», con il numero di operazioni che restano.
  La regola su quale voce è già scelta (§ 4.3) è una proposta di questa specifica, da confermare.

### Proposte da confermare

**D-CA1 — La finestra si apre sempre.** Un solo modo di cancellare (anche con niente da dire: «Non è usato altrove» e un
pulsante), al posto dell'arm a due clic.
Scartate: *a)* due clic come oggi quando il rapporto è vuoto, finestra solo altrimenti (costringe a leggere il rapporto al
primo clic, con un'attesa che il gesto di oggi non ha, e fa due forme da provare); *b)* leggere il rapporto in anticipo al
passaggio del mouse (non esiste su telefono). Motivo: una forma sola, il costo è un clic in più su un gesto raro.

**D-CA2b — Preselezione del registro.** Quantità 0 → «Tieni la storia» già scelto; quantità > 0 → nessuna voce, pulsante spento.
Scartata: «Tieni la storia» sempre già scelto (il caso pericoloso — un acquisto senza vendita nelle somme di Rendimenti —
passerebbe con un clic).

**D-CA3 — Tre esiti e un criterio.** Ti ferma / lo tolgo io / resta, con il criterio di § 4.2.
Scartate: *a)* «archiviare» invece di cancellare (un campo `archived` che ogni lettore dovrebbe conoscere: 18 file per il
perimetro, L3); *b)* tutto ferma (impraticabile: un limite dei Criteri non deve impedire di cancellare); *c)* tutto si toglie
(un piano e un modello che cambiano da soli).

**D-CA4 — Un piano di accumulo aperto ferma per qualunque riferimento.** Anche un membro di gruppo che non compra e un conto
sorgente tra tre. Scartata: toglierli da soli (le somme del piano, la rata e le righe già eseguite cambierebbero senza che
l'utente rivede il piano; «Rivedi il piano» già sa separare e sostituire).

**D-CA5 — Un peso nel modello ferma.** Scartata: toglierlo e riscalare gli altri a 100 (cambia ogni peso: il modello comanda sul
PAC, D-AL3/M4, e non deve cambiare da solo). Si può rimettere in discussione se Giorgio preferisce la comodità.

**D-CA6 — Un immobile con prestiti collegati ferma; il flusso FIRE collegato resta inerte e il lettore dice il motivo vero.**
Scartate: sganciare il prestito (cambierebbe la classe del prestito: «il prestito segue ciò che finanzia», D-R11-2);
cancellare il flusso (è un dato di «Il mio piano», non della cancellazione).

**D-CA7 — Lo tolgo io: R7, R8, R9, R10, R11** (limiti, gruppi, traguardi, puntatori), tutti elencati prima.

**D-CA8 — I versamenti di un fondo pensione restano.** Sono il registro fiscale per la deduzione (730). Da verificare con la
sonda di PA-2 che il Previdenza non li somma per asset cancellato in modo fuorviante; se sì, la scelta di D4 si estende ai
versamenti (stessa finestra, stessa regola di preselezione).

**D-CA9 — Rapporto + cancellazione sul server, rilettura alla cancellazione, ordine idempotente con l'asset per ultimo.**
Scartata: la conferma legge dai dati già in cache del client (il registro e le righe di cashflow non ci sono tutti, e due
lettori della stessa regola divergono).

**D-CA10 — Il conto cancellato lascia le righe di cashflow collegate com'è** (la frase di oggi, e `updateCashAssetBalancesAtomic`
lo tollera). Scartata: sganciarle (riscrittura di molte righe della storia).

**D-CA11 — Le quattro frasi dei lettori (§ 4.7) sono nello scope**, perché gli orfani esistono già. Nessuno strumento di
bonifica (PA-1).

**D-CA12 — D5 resta fuori.**

## 9. Punti aperti

- **PA-1** — Orfani già presenti sull'account reale (cancellazioni precedenti). Proposta: nessuna bonifica automatica; la sonda
  `orfani-probe.cjs` in sola lettura sul mirror (con l'ok di Giorgio) dice quanti sono. Se sono molti, una card a parte.
- **PA-2** — Sonda su: versamenti di un fondo cancellato in Previdenza (D-CA8), `balancePending` verso un conto che non c'è,
  `debtAssetId` di un prestito cancellato (`debtRepaymentService.ts:52`: cosa fa il rimborso di una riga di spesa che cita un
  prestito che non c'è). L'esito può spostare una riga di § 4.2 da «resta» a «ferma».
- **PA-3** — Se lo strumento è citato in un piano **concluso**, il nome salvato nel piano basta (R5)? Verificare che nessuna
  schermata di Piani conclusi richiami l'asset per id.
- **PA-4** — Il Consulente di upstream (spento, `allocationAdvice/{uid}`) è una quinta fonte di riferimenti se si accende: è
  una riga da aggiungere a `buildAssetUsage` quando succede.

## 10. Schizzo «oggi / proposta» (WORKFLOW.md regola 8)

Pagina con i quattro stati (blocco, libero, quote in mano, oggi): https://claude.ai/artifact/8TA5ceeHgiB2QoN7UCWtkf. Le parole:

**Oggi** — clic sul cestino: il pulsante diventa «Conferma»; secondo clic: toast «Asset eliminato». Nessuna parola su operazioni,
piani, modello.

**Proposta** — la finestra «Elimina Fondo ETF Mondo?», con le parti di § 4.6.
