# SESSION NOTES — 2026-08-29/31 — Audit dei Rendimenti, ricostruzione storica, fix D1

**Esito**: i quattro difetti dell'audit sono chiusi. 23 mesi di storia (da ottobre 2024) ricostruiti
e scritti in produzione, registro operazioni completato con le vendite, e il calcolo dei rendimenti
corretto nel codice — dove i flussi ora seguono la base invece di venire sempre dal Cashflow.
Da 35,1% annualizzato (raddoppiato) a **16,16%** misurato.

La descrizione della modifica al codice, pensata per una PR upstream, sta in
**`docs/performance-flows-pr.md`**. Questo file è il diario: come ci siamo arrivati e cosa resta.

> Gli script e i dump usati per la ricostruzione vivono in `scratchpad/rendimenti-audit/`, che da
> oggi è in `.gitignore`: contiene dati finanziari reali (spese, saldi, patrimonio) e non deve
> finire su un repository pubblico.

---

## ⬜ PUNTI APERTI — leggi qui alla ripresa

**1. Rimettere `performanceIncludesExcludedAssets` a `false`** (Impostazioni → Preferenze).
È l'unica cosa che separa il lavoro fatto dal vederlo a schermo: il codice è corretto e deployato,
ma finché il flag è ON la base include la liquidità e i flussi restano quelli del Cashflow. Era
stato acceso il 29/08 come tappabuchi per D1; con D1 chiuso è attivamente sbagliato.
Con il flag su `false` la pagina deve leggere: Storico **+29,50%** (ann. **+16,16%**), 1 anno
**+22,58%**, YTD 2026 **+11,01%**. Se non combaciano, il posto da cui ripartire è `portfolioFlows.ts`.

**2. Hall of Fame: «Aggiorna i record».** I 15 mesi nuovi (ott 2024 → dic 2025) non entrano nelle
classifiche finché non si ricalcola. Altrimenti ci pensa il cron notturno, ma solo dopo uno snapshot
riuscito.

**3. Riconciliare i due numeri che non tornano.** Sullo stesso perimetro, feb–ago 2026: la misura per
strumento dà **+10,29%**, la ricostruzione del 29/08 dava **~16,9%**. Metodi diversi — la prima
neutralizza ogni acquisto per strumento, la seconda a livello di portafoglio — e la differenza non è
mai stata spiegata. Finché non tornano, nessuno dei due è definitivo.

**4. Riconciliazione registro ↔ Δquantità** (follow-up della PR, già scritto in
`docs/performance-flows-pr.md`). Per un asset coperto dal registro, un'operazione che dimentichi di
registrare sparisce dal flusso e gonfia il rendimento, senza che niente lo segnali. Le due fonti
sono calcolabili entrambe per ogni mese: basta confrontarle e segnalare le divergenze oltre soglia.

### Non aperti, ma da ricordare
- Il **vecchio portafoglio liquidato ad aprile 2025** (XTRAC AI, FF-GD, SHR CHINA, VNT-US EQ,
  FR TR EU, su MedioBanca) non ha nessuna vendita registrata in nessun registro: è modellato come
  uscito ai prezzi di marzo, quindi aprile 2025 legge 0,00% e quel mese non è recuperabile.
- Il **L&G (IE00BFXR6159)**, comprato e rivenduto in una settimana ad agosto 2026, è escluso
  dall'import su richiesta: si perde solo la minusvalenza di 18,07 €.
- Lo **`scratchpad/`** non è su git e vive solo sulla macchina di Giorgio.

---

## 2026-08-29 (mattina) — diagnosi completa, due fix pronti, due in attesa di dati

### Da dove siamo partiti
Giorgio dubitava dei numeri della pagina **Rendimenti**. Fonte di confronto: un foglio Google
(`Portafoglio` → tab `Yearly Return`) dove traccia l'XIRR a mano dal 2025. Screenshot e dati in
`scratchpad/rendimenti-audit/`.

**Domanda della sessione**: errore nel codice, o porting sbagliato del registro operazioni?
**Risposta**: entrambi, e sono separabili. Il difetto dominante è di **codice** (perimetro), i
difetti minori sono di **dati** (porting).

### La ricostruzione è affidabile
Ho scaricato i dati di produzione in sola lettura (`scratchpad/rendimenti-audit/dump.mts`,
uid dell'account, letto da `.env.local`) e ho riprodotto la pipeline dell'app fuori dall'app.
I numeri della schermata escono identici, quindi ogni conclusione qui sotto è misurata, non dedotta:

| | schermata | ricostruzione |
|---|---|---|
| ROI periodo (YTD, feb–ago 2026) | 19,28% | 19,28% |
| CAGR | 35,02% | 35,02% |
| IRR | 35,08% | 35,12% |
| TWR annualizzato | 35,1% | 35,13% |
| «rendimento di mercato» | 17.391 € | 17.391,36 € |

Ricalcolando **lo stesso perimetro** correttamente: TWR ≈ 16,9%, IRR ≈ 17,5%, ROI 12,2%,
guadagno di mercato 7.933 €. Il foglio dà 21,73% su gen–ago e su un perimetro più stretto (solo
Fineco). **L'app raddoppiava il rendimento reale.**

---

## I difetti trovati

### D1 — [CODICE, dominante] Base e flussi misurano perimetri diversi
Tutti gli 11 conti liquidi (più l'ETF monetario `XEON.DE`) hanno `allocationRole: 'excluded'`.
`resolvePerformanceExclusions` (`lib/utils/performanceBase.ts`) legge `allocationRole === 'excluded'`
come «fuori dalla base dei Rendimenti» → **la base misurata era il solo capitale investito**.

Ma i flussi che dovrebbero neutralizzarla vengono da `getCashFlowsFromExpenses`
(`lib/services/performanceService.ts:906`), che calcola `entrate − uscite` del Cashflow e **salta i
trasferimenti**. Lo spostamento di denaro da un conto liquido a un ETF non esiste, per costruzione.

Numeri: feb–ago 2026 sono stati comprati **35.208 €** di strumenti mentre la classe `cash` scendeva
da 48.300 € a 18.475 €. Quei 35.208 € entrano nella base e vengono letti come **rendimento**.
I flussi neutralizzati erano 659 €. Febbraio: l'app leggeva **+13,14%**, il reale era **+2,87%**.

`allocationRole: 'excluded'` risponde a «cosa non ribilancio»; viene riusato per «cosa non misuro».
Sono due domande diverse. Il `KNOWN LIMITATION` in testa a `performanceBase.ts` descrive già il
fenomeno per i versamenti volontari al fondo pensione, ma lo tratta come un piccolo residuo: con la
liquidità esclusa è il termine dominante.

**Stato: MITIGATO** — Giorgio ha attivato `performanceIncludesExcludedAssets: true` (verificato in
produzione il 2026-08-29). La base torna a essere il patrimonio e i flussi tornano coerenti:
**TWR 19,84%, ROI 11,16%**. Il difetto di codice resta aperto per chiunque altro.

> Nota d'ordine, contro-intuitiva: **i fix ai dati vanno fatti DOPO questa decisione, non prima.**
> Ricostruendo solo il `byAsset` di gen–giu senza toccare il perimetro, la base di gennaio sarebbe
> scesa a 65.115 € e il ROI sarebbe schizzato a **+65%**. I due difetti si compensavano a metà.

### D2 — [DATI] `byAssetClass` di luglio 2026 corrotto
Somma **155.628 €** contro un `totalNetWorth` di 126.655 €. Equity +17.704, bonds +9.518, e il fondo
pensione messo in una classe `pension` propria invece che spalmato per `composition`. `byAsset`
invece torna al centesimo. Non tocca i Rendimenti (che leggono `totalNetWorth`), ma falsa
Storico → Composizione e la storia di Allocazione.

**Stato: ✅ APPLICATO il 2026-08-30** (`scratchpad/rendimenti-audit/fix-snapshots.mts --apply`).
Ricalcolo da `byAsset` con la regola del writer. Luglio ora somma 126.655,32 = patrimonio; la classe
fantasma `pension` è sparita, `realestate` +92,13. Verificato con `check-state.mts`.

### D3 — [DATI] Fondo pensione assente da apr/mag/giu 2026
I versamenti partono dal 30/04/2026, ma il fondo è nato come asset il 28/08 e quegli snapshot
(creati a mano il 24/07) non lo contengono. Contributi cumulati: apr 725,54 · mag 1.088,31 ·
giu 1.451,09 €. Giorgio ha chiesto di aggiungerlo.

**Stato: ✅ APPLICATO il 2026-08-30** (stesso script). Contributi **cumulati**, quindi tutto il
rendimento del fondo resta attribuito a luglio (che vale 1.842,69 contro 1.813,86 di contributi).
Se hai gli estratti mensili del fondo, portali e sostituisco i valori.

### D4 — [DATI] assetId orfano nel `byAsset` di luglio — **✅ CHIUSO il 2026-08-30**
Lo snapshot di luglio referenzia l'`assetId` di un «Fondo Pensione Intesa» (1.842,69 €), un
asset cancellato. L'attuale è un altro id, «Fondo Pensione ISP» (stesso fondo, confermato
da Giorgio; composizione 70/25/5 invariata). Le esclusioni si costruiscono dagli asset *attuali*,
quindi a luglio il fondo resta dentro la base e ad agosto ne esce.

**Perché NON l'ho corretto**: correggerlo da solo **peggiora la pagina di 3,4 punti**. Misurato:

| scenario | TWR | ROI |
|---|---|---|
| stato attuale (solo flag attivo) | 19,83% | 11,16% |
| + pensione su apr–giu, orfano non corretto | **19,84%** | **11,16%** |
| + orfano corretto, pensione non aggiunta | 23,22% | 13,00% |
| entrambi | 23,24% | 13,00% |
| **ideale (pensione esatta ogni mese)** | **19,84%** | **11,16%** |

La causa: appena l'orfano è risolto, il fondo diventa visibile nelle esclusioni di luglio, quindi
`resolveBackfillValue` calcola `E₀ = 1.842,69` e lo sottrae **come costante** a tutti i mesi
gen–giu, che non hanno `byAsset`. Ma il fondo a gennaio valeva 0. Il commento di
`performanceBase.ts` sostiene che una costante «non introduce nessun rendimento spurio»: vero dentro
il blocco pre-breakdown, **falso attraverso il giunto** e falso per ROI/CAGR/IRR, che confrontano
inizio e fine e non sono concatenati.

→ Va fatto **insieme** alla ricostruzione del `byAsset` di gen–giu (Punto 2 sotto), che elimina del
tutto il backfill. Da soli si danneggiano a vicenda.

**Chiuso il 2026-08-30**, nell'ordine giusto: prima l'import di 23 mesi con `byAsset` ovunque
(quindi nessun mese su cui il backfill possa scattare), poi `fix-orphan.mts --apply` che riscrive
l'`assetId` di luglio da quello cancellato a quello attuale. Senza, il fondo entrava
nella base a luglio e ne usciva ad agosto: uno scalino da 1.842,69 €.

### D5 — [NON È UN DIFETTO] Date sul confine del mese
Ritirato. 388 righe su 496 vengono dall'import CSV e stanno a **mezzogiorno** locale, inattaccabili.
Le 54 a mezzanotte locale (elencate in `scratchpad/rendimenti-audit/righe-mezzanotte.csv`) cadono
tutte il 1° del mese o il giorno dello stipendio: plausibile. Resta solo una domanda da porre a
Giorgio: il rimborso da 1.097,27 € era del 1° febbraio o del 31 gennaio? L'app lo conta a febbraio.

---

## Cosa è già stato fatto

- ✅ **D1 mitigato**: `performanceIncludesExcludedAssets: true` attivo in produzione (verificato).
- ✅ Dump read-only dei dati di produzione in `scratchpad/rendimenti-audit/` (snapshot, asset,
  spese, categorie, registro operazioni, contributi pensione, impostazioni).
- ✅ **D2 + D3 applicati il 2026-08-30**, backup dello stato precedente in
  `backup-snapshots.pre-apply.json`. Stato verificato dopo la scrittura (`check-state.mts`):

  ```
  2026-04 | NW 121986.31 | illiq  725.54 | somma classi 121986.31 | pension  725.54 | byAsset 0
  2026-05 | NW 125550.19 | illiq 1088.31 | somma classi 125550.19 | pension 1088.31 | byAsset 0
  2026-06 | NW 127947.50 | illiq 1451.09 | somma classi 127947.50 | pension 1451.09 | byAsset 0
  2026-07 | NW 126655.32 | illiq 1842.69 | somma classi 126655.32 | pension 1842.69 | byAsset 25
  ```

- ⚠️ **Il classifier dell'auto mode blocca ogni `--apply` su Firestore di produzione**: i comandi di
  scrittura vanno lanciati da Giorgio con il prefisso `!`, e **dalla radice del repo** (lo script
  scrive il backup con un percorso relativo).

## Cosa fare alla ripresa (2026-08-30)

### ✅ Passo 0 — FATTO
`fix-snapshots.mts --apply`, 4 documenti (2026-04, 05, 06, 07 di `monthly-snapshots`).
La cache dei Rendimenti si invalida da sola (`buildCacheKey` hasha ogni `totalNetWorth`); in caso,
il bottone «Aggiorna».

### Punto 2 — `byAsset` di gen–giu 2026 — **NON è bloccato dai dati** (rivisto il 2026-08-30)
Il **totale** della liquidità mese per mese è già negli snapshot (48.299,98 · 51.429,85 · 44.765,80 ·
39.501,77 · 35.083,61 · 31.966,42). L'unica cosa che manca in `cassa-mensile.csv` è la
**ripartizione fra i 12 conti** — e per i Rendimenti è indifferente: la base legge `totalNetWorth` e
sottrae per `assetId` solo gli asset esclusi (il fondo pensione).

Quindi il piano B (spalmare il totale pro-quota sulla ripartizione di luglio) **non è un ripiego**:
sblocca subito la ricostruzione del `byAsset` di gen–giu e la correzione **contestuale di D4**. Il
solo costo è l'attribuzione per conto in Storico → Composizione su sei mesi; su Patrimonio non
cambia niente (i conti liquidi non hanno colonna Δ per design). Se i saldi veri arrivano dopo, è una
ri-esecuzione dello stesso script.

Tutto il resto è derivabile:
- **quantità**: il registro ha 53 operazioni, **tutte `buy`, nessuna vendita** → la riproduzione a
  ritroso è esatta. Le due eccezioni sono `XEON.DE` (2,4685 quote) e `BRK-B` (0,05), che non hanno
  operazioni: erano già in portafoglio prima del registro, e vanno tenute costanti.
- **prezzi**: Yahoo li copre **tutti**. Vedi la correzione qui sotto.

> **Correzione alla sessione del 29/08**: «Yahoo non copre `NTSG-ETFP.MI` e `SGLN.MI`» era sbagliato,
> ed era un problema di **stringa del ticker**, non di copertura. La serie storica c'è sotto
> **`NTSG.MI`** (EUR) e combacia al centesimo con i prezzi già memorizzati: luglio 2026 → 29,230
> contro il 29,23 dello snapshot. `SGLN.MI` risponde ma è rada (scambi sottili su Milano); fallback
> `SGLN.L` in GBp con FX. Il ticker salvato `NTSG-ETFP.MI` funziona per la **quotazione live**
> (l'asset si è aggiornato il 28/08): è solo `chart()` che vuole `NTSG.MI`.

### Punto 5 — snapshot 2025: servono **sette numeri**, non un export (rivisto il 2026-08-30)
Non esiste nessuno snapshot prima di gennaio 2026, mentre il registro arriva all'11/06/2025 e il
foglio ad aprile 2025. Finché è così, «1 anno», «3 anni» e «Storico» misurano tutti gli stessi sette
mesi.

Nel 2025 il portafoglio conteneva **solo tre strumenti**: `EIMI.MI` dall'11/06, `NTSG.MI` dal 04/08,
`DBMFE.PA` dal 05/11 — più `BRK-B` e `XEON.DE` fermi da prima del registro. Quantità derivabili dal
registro, prezzi ora tutti disponibili su Yahoo.

**Non derivabile resta solo la liquidità**: le spese partono da gennaio 2026 (una riga sola a
dicembre 2025), quindi non si può camminare a ritroso sulla cassa. Serve:

> **patrimonio totale a fine mese, giugno → dicembre 2025** (o, equivalentemente, la sola liquidità:
> l'altro si ricava per differenza). Fonte: il tab `Historical NW Helper` / `2025 Dashboard`.

### Poi — il fix di codice (D1), da discutere
Due strade:
1. **I flussi vengono dal registro operazioni** (acquisti − vendite = denaro che attraversa il
   confine della base) quando la base esclude la liquidità. È il numero che la pagina già calcola e
   mostra accanto, nella tessera Contributi.
2. **Disaccoppiare i due `excluded`**: `allocationRole` smette di decidere la base dei Rendimenti,
   che prende un campo proprio.

Fix minori, indipendenti:
- `resolveBackfillValue`: per i mesi senza `byAsset` usare `byAssetClass.cash` invece di una
  costante (stima molto migliore, già nei dati).
- Far ricadere l'esclusione su ticker/nome quando l'`assetId` è orfano.

---

## 2026-08-30 (sera) — il workbook risolve i punti 2 e 5 insieme

Giorgio ha portato `scratchpad/Portafoglio Fogli Google.xlsx`. Contiene molto piu' del previsto:
**valore per strumento e per conto, mese per mese, da ottobre 2024 ad agosto 2026, piu' le righe
prezzo** — quindi le quantita' si ricavano per divisione. Nessuna fonte esterna serve piu': Yahoo,
il registro operazioni e il template `cassa-mensile.csv` diventano tutti superflui.

*(Nota: `cassa-mensile.csv` e' rimasto vuoto — l'editing non e' stato salvato. Non serve piu'.)*

### I tre bug di formula del foglio
Le righe aggregate (`Simple`, e quindi `Historical NW Helper`) **non** sono affidabili. Le formule:

| riga | formula | difetto |
|---|---|---|
| `Stocks` | `SUMIF(B3:B13,"=D",D3:D12)*D56` | le posizioni in USD sono **moltiplicate** per EURUSD invece che divise |
| `Cash` | `SUMIF($B$19:$B$23,…)` | il range si ferma alla riga 23: **Satispay, Contante e Buoni Pasto non entrano mai** |
| `Extras` | `SUMIF(…,"=E",…)*D55` | un importo gia' in euro viene moltiplicato per EURCHF |

Impatto misurato: equity 2025-01/02/03 sovrastimata di 266 / 274 / 514 €; cassa sottostimata da 2 a
450 € in sette mesi del 2025. **Gli snapshot 2026-01..03 dell'app coincidono al centesimo con questi
aggregati**, cioe' l'app ha ereditato i bug — ma solo dove mordono, e nel 2026 non ci sono righe in
valuta prima di luglio, quindi quei tre mesi restano corretti.

La ricostruzione parte dalle **righe grezze**, non dagli aggregati, e converte le valute nel verso
giusto.

### Cosa produce
`build-history.py` -> `reconstructed-snapshots.json`; `write-history.mts` scrive (dry-run default).

- **15 snapshot NUOVI**, 2024-10 -> 2025-12. Prima non esisteva nulla prima di gennaio 2026.
- **6 snapshot AGGIORNATI**, 2026-01 -> 2026-06: si aggiunge il `byAsset` che non avevano,
  `totalNetWorth` **intatto**. Questo chiude anche **D4**: con un breakdown in ogni mese il
  backfill costante di `resolveBackfillValue` non scatta mai piu'.

Validazione: in tutti e 21 i mesi la somma delle classi eguaglia il patrimonio. Sui mesi 2026 la
ricostruzione riproduce il totale dell'app **a zero residuo in quattro mesi su sei**; maggio e
giugno hanno un residuo di 1.011,97 e 1.118,31 € (foglio e app divergono davvero), distribuito
**pro-quota sui conti liquidi** — non sappiamo dove sia, e caricarlo su un conto solo sarebbe
un'affermazione che i dati non reggono.

### Due scelte di merito, da rivedere se non convincono
1. **NTSG splittato 60/40 sempre.** Il foglio lo splitta da settembre 2025 in poi e non prima; l'app
   ha `composition: [equity 60, bonds 40]` sull'asset e la applica in look-through. Ho seguito la
   regola dell'app. Effetto: 2025-08 sposta 2.193,30 € da equity a bonds.
2. **Aprile 2025 e' un mese di sola cassa.** Le righe grezze mostrano tutti gli strumenti a zero e
   31.036 € su Fineco (liquidazione, reinvestita a maggio in MWEQ+SWDA). L'`Historical NW Helper`
   invece forza 30.080,72 € in «Stocks» con una formula a mano (`=I9-G9-H9`). Ho seguito le righe
   grezze.

### ⚠️ La decisione aperta: cosa fanno i Rendimenti col 2025
Il cashflow dell'app parte da **gennaio 2026** (una riga sola a dicembre 2025). `getCashFlowsFromExpenses`
legge solo `expenses`, quindi per ogni mese del 2025 il flusso netto e' **zero** e tutta la crescita
del patrimonio diventa **rendimento**. Misurato sulla storia ricostruita:

| | TWR cumulato | annualizzato |
|---|---|---|
| senza cashflow 2025 | **+280,0%** | **+107,1%** |
| col cashflow del foglio 2025 | +285,8% | +108,8% |

I due scenari quasi coincidono perche' il foglio dichiara un risparmio netto 2025 di **−537 €**: la
crescita da 33.849 a 110.348 € **non viene da versamenti esterni**, viene dal bankroll del betting,
che vive nella classe `cash`. Aggiungere il cashflow del 2025 non risolve niente.

Non e' un errore aritmetico — e' D1 di nuovo: la base include un capitale la cui P&L non e' un
rendimento di mercato. Va deciso **prima** di importare, perche' dopo l'import «Storico», «3 anni» e
«1 anno» leggeranno quei numeri.

### La base: una sola misura, non due (deciso il 2026-08-30)

**Come coesistono oggi le due letture**: non coesistono a schermo. `PerformanceBase` ha
`'portfolio' | 'netWorth'` nel tipo, ma **nessun chiamante usa `'netWorth'`** — la base e' sempre
`portfolio`. Il controllo vero sono i due switch in Impostazioni (`performanceIncludesPensionFunds`,
`performanceIncludesExcludedAssets`) che decidono *cosa resta dentro*. Attivando il secondo il
29/08, la base e' passata da «solo strumenti» a «tutto il patrimonio». Una impostazione, due
posizioni, un numero alla volta.

**Giorgio (2026-08-30)**: «il rendimento del betting non mi interessa, e' fermo da marzo 2026 e lo
sto svuotando e reinvestendo». I dati confermano: bankroll 34.694 € a febbraio -> 6.321 € ad agosto.

Quindi **niente toggle**: base «solo strumenti», flussi dalle variazioni di quantita'. I prelievi dal
betting diventano *versamenti* al portafoglio e vengono neutralizzati correttamente. Il +107% non
compare da nessuna parte e l'import del 2025 torna sicuro.

Sfumatura utile: la scelta della base pesa **moltissimo sulla storia** e **quasi nulla in avanti**.
Il +107% nasce dal bankroll che cresceva nel 2024-2025; da marzo 2026 si svuota, e quando sara' a
zero le due basi coincidono.

⚠️ **Numero non ancora riconciliato**: la misura per strumento da' feb-ago 2026 = **+10,29%**, la
ricostruzione del 29/08 sullo stesso perimetro dava **~16,9%**. Metodi diversi (la prima neutralizza
ogni acquisto per strumento, la seconda a livello di portafoglio) e la differenza non e' stata
spiegata. Nessuno dei due e' da considerare definitivo finche' non tornano.

### Ordine di lavoro
1. ✅ **Import completo applicato il 2026-08-30** (`write-history.mts --apply`): 15 snapshot creati
   (2024-10 -> 2025-12), 6 aggiornati (2026-01 -> 2026-06). Backup in `backup-history.json`.
   Giorgio ha scelto di importare tutto in una volta: «l'applicazione la consulto solo io e ora non
   la sto usando», quindi la finestra in cui i Rendimenti leggono numeri gonfi non e' un problema.
2. ✅ **D4 chiuso** (`fix-orphan.mts --apply`).
3. ✅ **D1 chiuso nel codice il 2026-08-30** — `tsc` pulito, **3034 test verdi**:
   - nuovo `lib/utils/portfolioFlows.ts` (+ 11 test): `buildPortfolioCashFlows` legge i flussi dalle
     **variazioni di quantita'** di `byAsset`, `Σ (q1 - q0) x p1`. Non dal registro operazioni: 53
     operazioni tutte `buy`, nessuna delle vendite del 2025 e' registrata (a novembre il registro
     legge +24.218 EUR dove il flusso vero e' +5.707).
   - `performanceService.ts`: la sorgente segue **`includeExcludedAssets`**, non `exclusions.length`
     (un fondo pensione e' escluso quasi sempre, ma cio' che conta e' dove sta la LIQUIDITA').
     Nuovo campo `PerformanceMetrics.flowSource`. `CACHE_MATH_VERSION` v5 -> **v6**.
   - `page.tsx`: stessa condizione per il periodo CUSTOM, o CUSTOM e YTD userebbero serie diverse.
   - `ContributiTile` + `describeContributions`: con `flowSource: 'portfolio'` la tessera mostra la
     serie MISURATA (acquisti/vendite dalle Δquantita') invece del registro, e «Contributi netti»
     torna a essere il solo risparmio del Cashflow. Stampare il registro mentre si misura con
     un'altra serie significava mostrare un numero che nessuna formula aveva usato.
   - **Bonus, difetto latente trovato importando**: cinque divisioni guardavano `=== 0` ma non il
     negativo (`calculateROI`, TWR, IRR, volatilita', rendimenti mensili, piu' `buildTwrIndex`).
     Con aprile 2025 (mese interamente liquidato) la base puo' andare sotto zero, e un denominatore
     negativo non fallisce: ribalta il segno e azzera la catena del TWR. Ora sono tutte `<= 0`.
4. ⬜ Rimettere `performanceIncludesExcludedAssets` a **false** (da Impostazioni) (oggi e' ON solo come mitigazione di
   D1: con i flussi giusti diventa attivamente sbagliato).
5. ⬜ Riconciliare i due numeri che non tornano (+10,29% per strumento vs ~16,9% del 29/08).
6. ⬜ Hall of Fame: «Aggiorna i record» per far entrare i 15 mesi nuovi nelle classifiche.
7. ✅ **Aprile 2025 + i conti storici — APPLICATO il 2026-08-30.** I due conti creati
   (`create-historical-accounts.mts --apply`), i 21 snapshot riscritti (`write-history.mts --apply`),
   backup in `backup-history.json`. `diff-vs-prod.mts`: tutti e 21 i mesi identici alla
   ricostruzione.

   **Aprile 2025 non era un mese di sola cassa.** Il foglio lo vede cosi' per via della DATA VALUTA:
   il registro Fineco (`Titoli FinecoBank.xlsx`) dice che il 30/04/2025 sono state comprate 3.199
   quote MWEQ a 4,689 e 161 SWDA a 93,57 — **30.064,88 EUR**, al centesimo il costo che Giorgio
   aveva messo a mano nella riga di aprile dell'`Historical NW Helper`; regolate il 05/05. Non e'
   una liquidazione: e' il mese in cui NASCE il portafoglio nuovo (Giorgio, 2026-08-30). Valorizzato
   ai prezzi d'acquisto, con la stessa cifra tolta da Fineco (31.036 -> 971,12, che si allaccia ai
   1.070,74 di maggio). Il patrimonio totale non cambia.

   Effetto sulla misura, piu' grande di quanto sembri: prima maggio ripartiva da zero e il suo
   **+4,62%** andava perso. TWR storico **+23,74% -> +29,50%** (annualizzato 12,32% -> **15,14%**),
   e **nessun mese ha piu' una base non positiva** — la guardia `<= 0` torna a essere una difesa di
   riserva invece che una toppa.

   *Limite dichiarato*: la vendita del vecchio portafoglio (XTRAC AI, FF-GD, SHR CHINA, VNT-US EQ,
   FR TR EU) non e' in nessun registro — erano su MedioBanca, e il file Fineco parte dal 30/04/2025.
   Modellati come usciti ai prezzi di marzo, quindi aprile legge 0,00% e cio' che hanno fatto in
   quel mese non e' recuperabile.

   **I conti storici — opzione 1, scelta da Giorgio.** Una voce di `byAsset` e' autosufficiente
   (Storico legge nome e quantita' da li'), quindi un `assetId` senza documento in `assets` compare
   gia' SOLO in Storico e mai in Patrimonio. L'unica cosa che non funziona e' l'esclusione, che si
   costruisce dagli asset attuali. Percio': due conti reali a quantita' 0, `allocationRole:
   'excluded'`, **con gli stessi id gia' scritti in produzione** (nessuna rimappatura del gia'
   scritto): `hist-mediobanca` «MedioBanca» e `hist-others` «Altri conti (storico)», in cui
   confluiscono Satispay, «Altri conti» e Debiti/Crediti. In Patrimonio due righe a 0 EUR marcate
   «Azzerato», come Hype e Splital gia' oggi. «Altri conti (storico)» e' NEGATIVO in alcuni mesi
   (-2.969 EUR a dicembre 2025): sono partite in uscita, ed e' voluto.

   Scartata l'alternativa `isHistorical` sull'`Asset`: e' la strada generale, ma il flag andrebbe
   onorato in ~6 elenchi (Patrimonio, Allocazione, e i selettori conto in ExpenseDialog /
   TransactionDialog / DividendDialog / PensionContributionDialog), e ogni punto dimenticato e' un
   posto dove un conto chiuso riappare. Da fare quando un conto vero verra' chiuso davvero.

   Scartata anche l'idea di togliere `byAsset` da quei mesi: riaprirebbe D4, perche' il backfill
   costante prenderebbe il primo mese con breakdown (aprile 2026, 725,54 EUR di fondo pensione) e lo
   sottrarrebbe a tutto il 2024-2025.

   Dove arriva la misura (base = solo strumenti, flussi = Delta-quantita', tutti i conti esclusi):

   | finestra | rendimento | annualizzato |
   |---|---|---|
   | Storico (ott 2024 -> ago 2026) | +29,50% | **+15,14%** |
   | 1 anno (ago 2025 -> ago 2026) | +18,41% | +18,41% |
   | YTD 2026 | +11,07% | +17,06% |

   Contro il **+35,1%** che la pagina mostrava a inizio audit e il **+107%** che avrebbe mostrato
   importando la storia senza il fix D1.

   **Questi numeri NON sono ancora a schermo**: si accendono solo rimettendo il flag a false (punto 4).

8. ✅ **Registro Fineco importato il 2026-08-30** (`fineco-parse.py` -> `import-fineco.mts --apply`).
   Il diff era piccolo e pulito: l'app aveva gia' i 53 acquisti degli asset ancora posseduti e
   **nulla che il file non avesse**. Mancavano le 9 operazioni dei due strumenti dismessi (4 acquisti
   + 5 vendite di MWEQ e SWDA). Ora **62 operazioni, 5 vendite**, entrambe le sequenze chiuse a zero.
   - **L&G (IE00BFXR6159) escluso su richiesta**: comprato e rivenduto in una settimana ad agosto
     2026, un acquisto per errore. Togliendo entrambe le righe le quantita' restano coerenti; si
     perde solo la minusvalenza di 18,07 EUR.
   - **Nessun asset creato** per MWEQ/SWDA: `aggregateRealizedByYear` e `computeInvestedCapital`
     leggono solo `AssetTransaction[]`, quindi le plusvalenze compaiono senza righe nuove in
     Patrimonio. **Plusvalenze realizzate 2025: +4.169,67 EUR** (MWEQ +1.260,50, SWDA +2.909,16),
     informazione che prima non esisteva.

9. ✅ **I flussi ora preferiscono il registro, per asset** (`portfolioFlows.ts` riscritto, 19 test).
   Misurato prima di decidere:

   | sorgente | storico (ott 24 -> ago 26) | dove il registro copre (mag 25 ->) |
   |---|---|---|
   | Delta-quantita' | +15,14%/anno | +22,00%/anno |
   | solo registro | **-100%** | +23,81%/anno |
   | **ibrido per asset** | **+16,16%/anno** | +23,47%/anno |

   Il registro da solo e' catastrofico: ad aprile 2025 registra l'acquisto del portafoglio nuovo
   (+30.065) e non la vendita del vecchio, che stava su MedioBanca e in nessun registro. Ma dove
   copre e' piu' preciso, perche' e' datato all'OPERAZIONE mentre lo snapshot e' datato alla
   rilevazione (722 quote NTSG comprate il 20/08/2025: registro ad agosto, snapshot a settembre).
   La regola per asset prende il meglio dei due e aprile torna esatto (+9.742,55, rendimento 0,00%).

   **Serve al futuro, non al passato**: oggi 15 asset su 21 sono coperti dal registro; continuando a
   tracciare le operazioni la misura e' interamente basata su quello. `buildCacheKey` ha ora anche
   una firma del registro (conteggio + operazione piu' recente), altrimenti registrare una vendita
   non invaliderebbe la cache.

   ⚠️ **Rischio da presidiare**: per un asset coperto, un'operazione NON registrata sparisce e le
   Delta-quantita' non la salvano. La guardia naturale e' una riconciliazione fra le due fonti che
   segnali le divergenze oltre soglia — non c'e' ancora.

---

## Riferimenti
- Dump e script: `scratchpad/rendimenti-audit/` (`dump.mts`, `dump2.mts`, `fix-snapshots.mts`,
  `verify-flag.mts`, `probe.mts`, `probe-ntsg.mts`, `probe-ntsg2.mts`, `check-state.mts`,
  `build-history.py`, `write-history.mts`)
- Sorgente della storia: `scratchpad/Portafoglio Fogli Google.xlsx` (fogli `2024`, `2025`, `2026`,
  `Historical NW Helper`) -> `sheet-raw.json` -> `reconstructed-snapshots.json`
- `check-state.mts` = read-only, stampa lo stato dei `monthly-snapshots` (usalo prima e dopo ogni fix)
- Opzionale: `cassa-mensile.csv` (solo per l'attribuzione per conto) · da controllare:
  `righe-mezzanotte.csv`
- Screenshot della sessione: `Screenshot 2026-08-29 alle 10.0*.png`

## Igiene
`.env.local` contiene una service account key Firebase completa in un blocco commentato. È in
`.gitignore` e non è mai finita su git. Se quel file è stato condiviso o incollato altrove, ruotare
la chiave.

---

## 2026-08-31 — irrobustimento per una PR upstream

Giorgio: «questo progetto è un fork di una repo a cui voglio fare una PR, vorrei che la soluzione
non sia tailored per il mio caso ma un miglioramento per chi già usa l'app». Rileggendo il diff con
gli occhi di un utente upstream sono emerse **due regressioni** che sono state corrette.

1. **La condizione era troppo larga.** Era legata a `!includeExcludedAssets`, che è il default:
   scattava anche per chi non esclude nulla, dove `exclusions` è vuoto, la base è già tutto il
   patrimonio e il Cashflow è la fonte *giusta*. Ora è `exclusions.length > 0`.
   *Correzione a un ragionamento precedente*: avevo cambiato quella condizione sostenendo che con la
   liquidità dentro la base un acquisto sarebbe stato contato due volte. Falso — il flusso è la somma
   su TUTTI gli asset in base, quindi l'ETF fa +X e il conto −X e si annullano da soli.

2. **Senza `byAsset`, flussi a zero.** `buildPortfolioCashFlows` filtrava i mesi con breakdown; per
   uno storico di snapshot inseriti a mano restituiva `[]` — e un array vuoto è *truthy*, quindi
   `flowSource` diventava `'portfolio'` con flussi nulli e ogni versamento letto come rendimento.
   Era la stessa dinamica del +280%, servita a un utente che oggi ha numeri corretti. Ora il modulo
   emette una voce per ogni coppia **misurabile** (zeri compresi, per distinguerli dai mesi assenti)
   e il service ricade sul Cashflow **mese per mese** dove la misura non è possibile.

Più due limiti dichiarati e presidiati:

3. **Asset opachi al flusso.** Un `pensionFund` tiene il valore in `quantity` con prezzo 1, quindi la
   quantità cresce sia per i versamenti sia per il mercato: con `includePensionFunds: true` le
   Δquantità avrebbero cancellato il rendimento del fondo. Ora sono esclusi da quel ramo (i loro
   versamenti restano non neutralizzati = la limitazione odierna, non una regressione). Un conto
   corrente **non** è opaco, e un test fissa la differenza.
4. **`flowSource` ha tre valori** (`portfolio` / `cashflow` / `mixed`), calcolati contando i mesi
   misurati e quelli in ripiego, così la tessera Contributi può dire «in parte» invece di mentire.

Più: il `catch` sulla lettura del registro **logga** invece di degradare in silenzio, ed è
documentato che quella lettura sta prima del controllo di cache (una query indicizzata in più per
caricamento, il prezzo di non servire numeri stantii dopo un'operazione).

**Profilo di rischio finale**: nessun cambiamento per chi non esclude nulla o non ha `byAsset`;
strettamente più corretto per chi esclude qualcosa e ha gli snapshot per misurarlo.

### Follow-up aperto per la PR
**Riconciliazione fra registro e Δquantità.** Per un asset coperto dal registro, un'operazione non
registrata sparisce dal flusso e gonfia il rendimento, senza che niente lo segnali. Le due fonti
sono calcolabili entrambe per ogni mese: basta confrontarle e segnalare le divergenze oltre soglia.
Da aprire come issue, non parte di questa PR.

### Cosa resta da fare
Vedi **PUNTI APERTI** in testa al file: è l'unica lista, per non averne due che divergono.
