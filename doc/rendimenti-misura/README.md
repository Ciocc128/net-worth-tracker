# La misura dei rendimenti (dossier)

> Card Todoist «F08 FIX Rendimenti: dividendi, flussi futuri, tasse e commissioni (B1, B3, B2, poi B4, B9)», label
> `epic-review-fable`. Fonte: l'audit dei calcoli dell'11 novembre 2026 (Library `audit-calcoli/audit-calcoli-parte-1.md`,
> script `audit-calcoli/script/rendimenti.test.ts`). Solo specifica: nessun file dell'app è cambiato. La specifica
> viaggia con la PR dell'implementazione (branch `claude/project-thread-uwvwn7`).
>
> **Stato delle decisioni**: D-RM1–D-RM7 **prese dal proprietario il 2026-11-14** («Approvo tutto», le
> raccomandazioni della § 8).

## 1. In breve

Rendimenti risponde a «quanto rende il portafoglio?» togliendo dal guadagno il capitale che entra ed esce. L'audit ha
trovato cinque punti in cui quel capitale è contato male:

| | Difetto | Effetto oggi |
| --- | --- | --- |
| **B1** | Con la base a sottoinsieme un dividendo, una cedola o un interesse accreditato su un conto è letto come versamento | Il rendimento perde tutto ciò che il portafoglio distribuisce |
| **B2** | Tasse e commissioni pesano in modo opposto nelle due modalità di flusso | Lo stesso mese dà −1,73% o −0,07% secondo la base |
| **B3** | Nel mese in corso entrano nel flusso le righe con data futura | Uno stipendio in calendario il 27 abbassa il rendimento del 10 |
| **B4** | Tra due snapshot non consecutivi il TWR toglie solo il flusso dell'ultimo mese | I versamenti dei mesi senza snapshot diventano rendimento |
| **B9** | Il flusso è contato tutto a fine mese | Un versamento grande su un capitale piccolo dà valori assurdi |

La specifica dà **una sola definizione** di rendimento (lordo d'imposta, netto di commissioni: D-RM1), valida nelle
due modalità, e una sola formula del periodo fra due snapshot, letta da TWR, volatilità, mappa mensile e drawdown.
Due passi: prima B1, B3 e B2 (i flussi), poi B4 e B9 (la formula).

## 2. Stato di partenza

Riletto sul codice di `main` (`ec6d115`). Lo script dell'audit, rieseguito il 2026-11-14 in `Europe/Rome`, dà
ancora i valori «ottenuto» della § 7.

- **Due modalità di flusso** (`lib/utils/cashFlowMap.ts:68`, `externalFlowOf`): il flusso di un mese è
  `(portfolioFlow ?? netCashFlow) + pensionFlow`.
  - *Dal cashflow*: `netCashFlow` = entrate − spese del mese, senza i trasferimenti e senza le entrate della
    categoria dei dividendi (`getCashFlowsFromExpenses`, `lib/services/performanceService.ts:786`). Vale quando la
    base è tutto il patrimonio, e nei mesi senza dettaglio per strumento.
  - *Misurato*: `portfolioFlow` (`lib/utils/portfolioFlows.ts`), quando la base è un sottoinsieme (un prestito, la
    casa esclusa, un fondo pensione fuori, «Liquidità fuori dalla base») e i due snapshot del mese hanno `byAsset`.
    Registro operazioni per gli strumenti coperti, variazione di quantità per gli altri; un conto dentro la base
    conta il suo saldo.
- **B1**: nel ramo misurato l'aumento di saldo di un conto è un versamento (`portfolioFlows.ts:178`), anche quando
  è un dividendo. Con la liquidità fuori dalla base il dividendo esce senza lasciare traccia. La guida dichiara il
  limite solo per gli interessi.
- **B2**: nel ramo cashflow la commissione di un'operazione è una riga di spesa dal 21 ottobre
  (`lib/utils/tradeFeeExpense.ts`, `Expense.feeOfTradeId`), quindi un «prelievo» che la formula neutralizza; la
  tassa trattenuta alla vendita (`AssetTransaction.withheldTaxEur`) abbassa il conto senza alcuna riga, quindi pesa.
  Nel ramo misurato è il contrario: il registro conta le commissioni negli acquisti e nelle vendite
  (`portfolioFlows.ts:119`), e la tassa è un calo di saldo letto come prelievo.
- **B3**: `getCashFlowsFromExpenses` filtra `date <= endDate` (`performanceService.ts:795`), dove `endDate` è la
  fine del mese dell'ultimo snapshot. Lo snapshot del mese in corso si riscrive ogni sera: le righe in calendario
  per i giorni seguenti sono già nel flusso ma non ancora nei saldi.
- **B4**: quattro punti leggono solo il flusso del mese dello snapshot corrente:
  `calculateTimeWeightedReturn` (`performanceService.ts:196`), `calculateVolatility` (`:434`),
  `prepareMonthlyReturnsHeatmap` (`:1759`), `buildTwrIndex` (`lib/utils/drawdownSeries.ts:80`); lo stesso fanno
  `preparePerformanceChartData` (`:1707`) e `attributePeriodReturn` (`lib/utils/performanceAttribution.ts:191`).
  ROI, CAGR e IRR sommano l'intera serie e sono giusti.
- **B9**: la formula del mese `(V_fine − flusso) / V_inizio − 1` è ricopiata nei quattro punti sopra. Mette il
  flusso a fine mese; l'IRR lo mette a inizio mese (`performanceService.ts:332`).
- **La cache** (`performance-cache/{userId}`): `CACHE_MATH_VERSION = 'v8-fork'` (`performanceService.ts:68`);
  `buildCacheKey` impronta snapshot, base, flussi pensione e flussi misurati, tasso e categoria dei dividendi.

## 3. Obiettivo e perimetro

**Obiettivo**: ogni cifra di Rendimenti (TWR, ROI, CAGR, IRR, volatilità, Sharpe, Sortino, mappa mensile, drawdown,
Contributi, Attribuzione) nasce dalla stessa definizione e dalla stessa serie di flussi, nelle due modalità.

**Incluso**
- Passo 1: B1, B3, B2 — quali movimenti sono flussi (§ 5.1–5.4).
- Passo 2: B4, B9 — la formula del periodo fra due snapshot (§ 5.5–5.7).
- Tutte le superfici che leggono il servizio: la pagina (periodi precalcolati, periodo personalizzato, finestre
  mobili), il PDF (`pdfDataService.preparePerformanceData`), le email periodiche
  (`monthlyEmailService` chiama `calculatePerformanceForPeriod`).
- I testi «Come si calcola» della pagina che descrivono la formula (§ 5.8).
- `CACHE_MATH_VERSION` → `'v9-fork'`.

**Escluso**
- B5 (email in UTC), B6–B8 (stima della tassa, commissioni nel realizzato): card «Fable minori · Calcoli».
- Il Driver di Storico, dove dividendi e cedole stanno nel risparmio (audit parte 3): resta com'è; le due pagine
  continuano a rispondere a due domande diverse (punto aperto § 9).
- La vista netta d'imposta: esiste già nella stima della tassa e nel FIRE (D-RM1).
- ROI e CAGR: le formule non cambiano, cambiano solo i flussi che ricevono.
- I rendimenti da dividendo (YOC, rendimento corrente), i benchmark, il tasso privo di rischio.
- Nessun tile nuovo, nessuna impostazione nuova, nessuna migrazione di dati.

## 4. Casi d'uso

1. **Cedola su un conto dentro la base.** Ho la casa esclusa e un BTP; la cedola arriva sul conto del broker. Il
   mese mostra la cedola come rendimento, non come versamento, e «Capitale entrato nella base» non la conta.
2. **Liquidità fuori dalla base.** Con l'interruttore acceso il dividendo finisce su un conto che la base non vede:
   il mese lo conta come rendimento uscito dalla base, non lo perde.
3. **Vendita tassata.** Vendo con 5 € di commissione e 260 € di tassa trattenuta: il rendimento del mese perde i
   5 €, non i 260 €, qualunque sia la base.
4. **Mese in corso.** Il 10 del mese lo stipendio del 27 è in calendario: rendimento e «Contributi netti» non lo
   vedono finché non è passato.
5. **Storia con un buco.** Snapshot a dicembre e a marzo, niente in mezzo: il rendimento del periodo conta i
   versamenti di gennaio e febbraio, e TWR, ROI e IRR dicono la stessa cosa.
6. **Account nuovo.** Parto con 100 € e verso 6.000 €: il mese ha un rendimento sensato, non −1.100%.

## 5. Regole di calcolo

Notazione: `V0`, `V1` = valore della base ai due snapshot che delimitano un periodo; `F` = flusso esterno del
periodo, positivo se entra nella base. Il guadagno è sempre `G = V1 − V0 − F`.

### 5.1 La definizione (D-RM1)

**Il rendimento è lordo d'imposta e netto delle commissioni di negoziazione, in tutte e due le modalità.**

- Un'imposta trattenuta è **un prelievo**: esce dalla base come un flusso e non riduce il guadagno.
- Una commissione di negoziazione è **un costo**: non è un flusso e riduce il guadagno.
- Una distribuzione (dividendo, cedola, premio finale, interesse) pagata da uno strumento dentro la base è
  **rendimento**: non è mai capitale che entra.

Fuori dalla definizione, e invariati: il bollo e le altre imposte pagate con una riga di spesa restano prelievi (il
rendimento è lordo anche di quelle); i costi interni agli strumenti (TER) sono già nei prezzi; la commissione di un
trasferimento bancario (`feeOfTransferId`) resta una spesa qualunque.

### 5.2 Il flusso di un mese

`externalFlowOf` resta l'unica somma, con due correzioni, una per ramo:

```
mese misurato      F = portfolioFlow − D_lordo                         + pensionFlow
mese dal cashflow  F = netCashFlow + C_righe − T_vendite − T_distrib   + pensionFlow
```

| Termine | Cosa è | Da dove |
| --- | --- | --- |
| `D_lordo` | Distribuzioni lorde del mese il cui pagatore è dentro la base (§ 5.3) | Registro dividendi; righe di entrata nella categoria dei dividendi |
| `C_righe` | Righe di spesa del mese con `feeOfTradeId`, in valore assoluto | Spese |
| `T_vendite` | `withheldTaxEur` delle vendite del mese | Registro operazioni |
| `T_distrib` | Imposta trattenuta sulle distribuzioni del mese (`taxAmountEur ?? taxAmount`) | Registro dividendi |

Perché bastano:
- *Cashflow, commissioni*: la riga di commissione è dentro `netCashFlow` come spesa; `+C_righe` la toglie dai
  prelievi, e il calo del conto resta nel guadagno. Un'operazione senza riga (prima del 21 ottobre, o senza
  categoria) non ha nulla da correggere: pesa già.
- *Cashflow, tasse*: la tassa abbassa il patrimonio senza una riga; `−T_vendite` e `−T_distrib` la contano come
  prelievo.
- *Misurato, commissioni e tassa di vendita*: già giusti oggi. Il registro conta `quantità × prezzo + commissioni`
  in entrata e `quantità × prezzo − commissioni` in uscita; con il conto dentro la base il saldo scende di
  commissioni e tassa, e la differenza lascia la tassa come flusso (−260 € nel caso T6) e la commissione nel
  guadagno. Con la liquidità fuori dalla base la tassa non tocca la base.
- *Misurato, distribuzioni*: con il conto dentro la base il saldo sale del netto, letto come versamento;
  `−D_lordo` lo annulla e lascia `−imposta` come prelievo. Con il conto fuori dalla base (o senza conto) nulla è
  stato misurato; `−D_lordo` conta la distribuzione come rendimento uscito.

`netCashFlow` non cambia significato: resta il risparmio del Cashflow, la cifra «Contributi netti» del tile
Contributi. Le correzioni viaggiano su campi propri di `CashFlowData` (§ 6).

### 5.3 Le distribuzioni: chi è il pagatore (B1, D-RM2, D-RM3)

Una distribuzione del mese è:
- un record del **registro dividendi** con `paymentDate` nel mese e non oltre il limite della § 5.4 (ricevuto, mai
  annunciato); importo lordo `grossAmountEur ?? grossAmount`, imposta `taxAmountEur ?? taxAmount`;
- una **riga di entrata nella categoria dei dividendi** (`dividendIncomeCategoryId`) che nessun record del registro
  nomina (`Dividend.expenseId`): è il caso degli interessi di un conto e delle righe scritte a mano; lordo =
  l'importo della riga, imposta = 0.

Il pagatore è dentro la base quando:
1. per un record del registro, il suo `assetId` non è fra gli esclusi;
2. per una riga senza record, il suo conto (`linkedCashAssetId`) non è fra gli esclusi: l'interesse è del conto;
3. per una riga senza record e senza conto, sempre (è ciò che il ramo cashflow fa già).

Una distribuzione con il pagatore **fuori** dalla base non entra in `D_lordo`: se arriva su un conto dentro la base
è denaro esterno, e il saldo la conta come tale.

Nei mesi dal cashflow tutte le righe della categoria restano fuori da `netCashFlow`, come oggi; `T_distrib` somma
l'imposta dei record del registro del mese.

Per far contare gli interessi di un conto basta registrarli come entrata nella categoria dei dividendi (o in una
sua sottocategoria). Un interesse registrato in un'altra categoria, o non registrato, resta un versamento: limite
dichiarato, come oggi.

### 5.4 Il mese in corso (B3, D-RM4)

Quando lo snapshot che chiude il periodo è quello del **mese in corso**, le righe di spesa e di entrata contano nel
flusso fino al suo **giorno di cattura**:

```
mese in corso   limite = fine del giorno italiano di snapshot.createdAt
mese chiuso     limite = fine del mese (come oggi)
```

- Il mese è «in corso» quando oggi cade nel mese dello snapshot.
- `createdAt` è l'istante dell'ultima scrittura (`app/api/portfolio/snapshot/route.ts`: `Timestamp.now()` a ogni
  riscrittura). Assente → il giorno di oggi.
- Un mese chiuso conta sempre il mese intero, anche se il suo snapshot è stato scritto prima dell'ultimo giorno:
  una riga degli ultimi giorni muove il saldo nel mese dopo, e contarla nel suo mese fa sì che i due mesi si
  compensino.
- Il limite vale per `getCashFlowsFromExpenses` e per le distribuzioni; non per i flussi misurati e per quelli dei
  fondi pensione, che nascono già dagli snapshot.
- Vale per tutte le letture della serie: metriche del periodo, «Contributi netti», IRR, finestre mobili, mappa
  mensile.

Limite dichiarato: una riga datata il giorno di cattura e salvata dopo la scrittura dello snapshot è nel flusso ma
non nei saldi fino alla sera dopo.

### 5.5 Il periodo fra due snapshot (B4, D-RM5)

Un **sotto-periodo** va da uno snapshot al successivo della serie, consecutivi o no. Il suo flusso è la somma dei
flussi di **tutti i mesi dopo il primo snapshot fino al mese del secondo, compreso**. Una sola funzione lo calcola
(`lib/utils/cashFlowMap.ts`), e la leggono TWR, volatilità, mappa mensile, indice del drawdown, grafico
«Capitale e mercato» e Attribuzione.

Con un buco di `k` mesi:
- **TWR e indice del drawdown**: un solo fattore per il sotto-periodo.
- **Mappa mensile**: il rendimento del sotto-periodo sta nella cella del mese che lo chiude; i mesi senza snapshot
  restano vuoti.
- **Volatilità** (e Sharpe, Sortino): una sola osservazione, il rendimento mensile equivalente
  `(1 + r)^(1/k) − 1`. Il minimo di tre osservazioni resta.
- **Annualizzazione**: invariata, sui mesi trascorsi.

Nessuno snapshot è inventato o interpolato.

### 5.6 La formula del sotto-periodo (B9, D-RM6)

```
r = (V1 − V0 − F) / (V0 + W)        W = (F − F_ingresso) / 2
```

Dietz modificato con il flusso a **metà periodo**. `F_ingresso` è l'ingresso dei fondi pensione nella base
(`PensionBoundaryFlow.kind === 'entry'`): entra al valore di fine mese, non ha lavorato nel mese e pesa 0, così il
mese d'ingresso resta neutro come oggi. La formula di oggi è il caso `W = 0`.

Una sola funzione pura produce `r`; i quattro punti che oggi ricopiano la formula la chiamano.

Guardie, in ordine:
1. `V0 ≤ 0` → sotto-periodo non misurabile (come oggi): saltato da TWR, volatilità e indice, cella vuota.
2. `V0 + W ≤ 0` → non misurabile, come sopra.
3. `1 + r ≤ 0` (perso più del capitale pesato) → la cella mostra `r`; il TWR, lo Sharpe e il Sortino di ogni
   periodo che lo contiene sono `null` («non misurabile»); l'indice del drawdown si ferma a 0 (−100%). Mai un
   prodotto negativo elevato a potenza.

**IRR**: stessi istanti. Il flusso di un mese sta a metà mese (`t + 0,5` mesi dall'inizio del periodo), l'ingresso
dei fondi a fine mese (`t + 1`).

Effetto sulle cifre esistenti: ogni rendimento mensile è moltiplicato per `V0 / (V0 + W)`. Con un flusso pari al
2% del capitale un mese a +2,00% diventa +1,98%.

### 5.7 Cosa non cambia

- ROI = `G / V0` del periodo; CAGR = `(V1 / (V0 + F))^(1/anni) − 1`. Ricevono i flussi corretti della § 5.2.
- La finestra di misura, la regola del primo snapshot, `numberOfMonths`, la soglia dei 12 mesi per annualizzare.
- La base (`resolvePerformanceBase`) e le sue esclusioni; i flussi dei fondi pensione.
- I mesi non misurabili del ramo misurato ricadono sul cashflow, con le correzioni del ramo cashflow.

### 5.8 Testi sulla pagina

Cambiano solo le frasi che descrivono la formula, in `PerformanceDettaglio` («Come si calcola»):
- oggi «Ogni mese vale (patrimonio fine mese − cashflow del mese) / patrimonio inizio mese − 1 …» →
  il guadagno del mese diviso per il capitale di inizio mese più metà dei flussi;
- una frase nuova: «Il rendimento è lordo d'imposta e netto delle commissioni di negoziazione: una tassa trattenuta
  è un prelievo, una commissione è un costo.»

Il testo esatto si approva con il piano dell'implementazione (WORKFLOW.md regola 8: schizzo «oggi / proposta»).
Nessun'altra parola della pagina cambia.

## 6. Dove vive (indicazioni per l'implementazione)

I nomi sono indicativi; le regole della § 5 no.

- **`types/performance.ts`** — `CashFlowData` porta le due correzioni su campi propri (per esempio
  `cashflowAdjustment` = `C_righe − T_vendite − T_distrib`, `measuredAdjustment` = `−D_lordo`) e la parte
  d'ingresso del flusso pensione. `externalFlowOf` li somma secondo la § 5.2.
- **Un modulo puro nuovo** (per esempio `lib/utils/returnFlows.ts`) calcola i quattro termini per mese da spese,
  registro dividendi, registro operazioni, esclusi e limite della § 5.4. Lo chiamano
  `calculatePerformanceForPeriod` e `calculateRollingPeriods`, dove le spese sono già in mano.
- **`lib/utils/cashFlowMap.ts`** — il flusso di un sotto-periodo (§ 5.5) e la formula (§ 5.6).
- **`PerformanceInputs`** e `resolvePerformanceBase` ricevono il registro dividendi (la pagina lo legge già per
  l'Attribuzione); PDF ed email lo passano come gli altri ingressi.
- **`buildCacheKey`** impronta anche le tasse delle vendite e le distribuzioni del registro, per mese. Le sole
  spese restano sotto la scadenza di sei ore, come oggi.
- **`CACHE_MATH_VERSION = 'v9-fork'`**. `PERSIST_CACHE_VERSION` sale se cambia la forma di `PerformanceData`.
- **Attribuzione**: `sumDividendsByAsset` passa al lordo (`grossAmountEur ?? grossAmount`), così le righe sommano
  al guadagno della pagina e l'imposta non finisce in «Non attribuito».
- **Documenti**: `doc/guide/rendimenti.md` (la base, la finestra, i punti ciechi: via il limite sugli interessi e
  l'«artefatto del secchio mensile» dove non vale più), `AGENTS.md` (stub), `CLAUDE.md` (una riga «Latest»),
  `README.md` se descrive la formula. I commenti di testa di `portfolioFlows.ts`, `cashFlowMap.ts` e
  `performanceBase.ts` dichiarano i limiti che cadono.
- **Test** (D-T3): i casi della § 7 in un file Vitest nuovo, con i valori a mano; cifre tonde e inventate
  (WORKFLOW.md regola 7). Le suite di Rendimenti elencate in `doc/guide/rendimenti.md` § Files, sotto
  `Europe/Rome` e sotto `TZ=UTC`.

## 7. Criteri di accettazione

I casi sono quelli dello script dell'audit. «Oggi» è l'uscita del codice di `main` il 2026-11-14; «Atteso» è il
valore calcolato a mano con le regole della § 5. Percentuali a tre decimali salvo dove serve di più.

### Passo 1 — i flussi (formula del mese invariata)

**T5 — dividendo su un conto dentro la base** (B1). ETF 100 × 100 €, conto 1.000 €, casa esclusa; a ottobre un
dividendo di 100 € sul conto, riga nella categoria dei dividendi. `V0` = 11.000 €, `V1` = 11.100 €.

| | Oggi | Atteso |
| --- | --- | --- |
| Flusso del mese | +100 € | 0 € |
| ROI | 0,000% | +0,909% (100 / 11.000) |
| Stessa storia senza la casa (cashflow) | +0,909% | +0,909% |

**T5b — liquidità fuori dalla base** (B1). Stessi dati, senza casa, interruttore acceso. `V0` = `V1` = 10.000 €.

| | Oggi | Atteso |
| --- | --- | --- |
| Flusso del mese | 0 € | −100 € |
| ROI | 0,000% | +1,000% (100 / 10.000) |

**T5c — dividendo con imposta** (D-RM2). Come T5, ma il registro dividendi ha il record: lordo 100 €, imposta 26 €,
netto 74 € accreditato. `V1` = 11.074 €.

| | Atteso (sottoinsieme) | Atteso (cashflow) |
| --- | --- | --- |
| Flusso del mese | −26 € | −26 € |
| Guadagno | 100 € | 100 € |
| ROI | +0,909% | +0,909% |

**T5d — pagatore fuori dalla base** (D-RM3). Come T5, ma il record del registro nomina la casa esclusa (un affitto
registrato come distribuzione). Atteso: flusso +100 €, ROI 0,000%.

**T6 — commissione e tassa di vendita** (B2). 15.000 € iniziali (ETF 100 × 100 €, conto 5.000 €). Settembre:
acquisto di 10 quote a 100 € con 5 € di commissione. Ottobre: vendita di 50 quote a 100 € con 5 € di commissione e
260 € di tassa trattenuta. Nessun movimento di prezzo. Valori: 15.000 → 14.995 → 14.730 €.

| | Oggi, tutto il patrimonio | Oggi, sottoinsieme | Atteso, entrambe |
| --- | --- | --- | --- |
| Flusso di settembre | −5 € | 0 € | 0 € |
| Flusso di ottobre | −5 € | −260 € | −260 € |
| Guadagno | −260 € | −10 € | **−10 €** |
| ROI | −1,733% | −0,067% | **−0,067%** |

**T4 — riga futura nel mese in corso** (B3). Oggi è il 10 novembre 2026. Ottobre 10.000 €, novembre 10.000 €
(snapshot scritto il 10), stipendio di 2.000 € datato 27 novembre.

| | Oggi | Atteso |
| --- | --- | --- |
| ROI | −20,000% | 0,000% |
| TWR annualizzato | −93,128% | 0,000% |
| «Contributi netti» | +2.000 € | 0 € |

Controllo opposto: la stessa riga datata 5 novembre con lo snapshot a 12.000 € dà flusso +2.000 € e ROI 0,000%.

### Passo 2 — la formula

**T3 — mesi senza snapshot** (B4). Snapshot a dicembre (10.000 €) e a marzo (13.000 €); versamenti di 1.000 € a
gennaio, febbraio e marzo.

| | Oggi | Atteso |
| --- | --- | --- |
| ROI | 0,000% | 0,000% |
| IRR | 0,000% | 0,000% |
| TWR del periodo | +20,000% (annualizzato +107,360%) | 0,000% |
| Cella di marzo nella mappa | +20,000% | 0,000% |

**T8 — volatilità su un buco** (D-RM5). Dicembre 10.000 €, marzo 10.612,08 €, nessun flusso. Cella di marzo:
+6,121%. Osservazione per la volatilità: +2,000% (`1,061208^(1/3) − 1`), una sola.

**T1 — riferimento senza buchi** (D-RM6). Snapshot 10.000 → 10.300 → 10.100 → 10.800 €; flussi +200, −100, +500 €.

| | Oggi (flusso a fine mese) | Atteso (metà mese) |
| --- | --- | --- |
| Mese 1 | +1,000000% | +0,990099% (100 / 10.100) |
| Mese 2 | −0,970874% | −0,975610% (−100 / 10.250) |
| Mese 3 | +1,980198% | +1,932367% (200 / 10.350) |
| Concatenato | +2,000000% | +1,937290% |
| TWR annualizzato (3 mesi) | +8,243216% | +7,977269% |
| Volatilità annualizzata | — | 5,139691% |

**T2 — IRR** (D-RM6). 10.000 € iniziali, 1.200 € versati a luglio, 12.000 € dopo 12 mesi.
Oggi 7,554955% (flusso a inizio luglio, `t` = 6); atteso **7,590771%** (`t` = 6,5).

**T2b — un mese, TWR e IRR concordi** (D-RM6). 10.000 €, versamento 1.000 €, fine mese 11.110 €.
Oggi: TWR del mese 1,100%, IRR mensile 1,000%. Atteso: TWR 1,047619% (110 / 10.500), IRR mensile 1,047749%.

**T7 — versamento grande su capitale piccolo** (B9). 100 € → versamento 6.000 € → 5.000 €, poi 5.100 € senza
flussi.

| | Oggi | Atteso |
| --- | --- | --- |
| Mese 1 | −1.100,00% | −35,4839% (−1.100 / 3.100) |
| Mese 2 | +2,0000% | +2,0000% |
| TWR del periodo | — | −34,1935% |
| TWR annualizzato (2 mesi) | +112.616.141,93% | −91,8790% |

**T7b — guardia 3**. 100 € → versamento 6.000 € → 2.000 €. `r` = −132,258% (−4.100 / 3.100): la cella mostra il
valore, il TWR del periodo è `null`.

**T7c — guardia 2**. 100 € → prelievo 300 € → fine mese 0 €. `V0 + W` = −50 €: sotto-periodo non misurabile, cella
vuota.

**T9 — ingresso del fondo pensione** (D-RM6). Base 10.000 €, nessun movimento di prezzo, nel mese il fondo entra con
5.000 €: `V1` = 15.000 €, `F` = `F_ingresso` = 5.000 €, `W` = 0. Atteso: `r` = 0,000%, come oggi.

### Invarianti

- Un account senza distribuzioni, senza commissioni, senza tasse trattenute, senza righe future e senza buchi cambia
  solo per la § 5.6.
- Con il solo passo 1 un account come sopra non cambia di un decimale.
- Mappa mensile, indice del drawdown, TWR e volatilità leggono lo stesso `r`: concatenando le celle della mappa si
  ottiene il TWR del periodo (T1).
- Attribuzione: righe + «Non attribuito» = guadagno della pagina, sugli stessi flussi (T5c: riga dell'ETF 100 €,
  «Non attribuito» 0 €).
- Stessi valori sotto `Europe/Rome` e `TZ=UTC` per i casi senza righe datate il giorno 1 (B5 è fuori perimetro).
- `tsc` pulito; le suite di Rendimenti verdi; `performance-cache` riscritta alla prima visita (`v9-fork`).

## 8. Decisioni

### D-RM1 — Lordo d'imposta, netto di commissioni · **presa** (proprietario, 2026-11-14)

Il rendimento è uno solo, lordo d'imposta e netto delle commissioni di negoziazione, nelle due modalità.
Riferimento T6: 15.000 €, 10 € di commissioni e 260 € di tassa → pesano i 10 €, non i 260 €.

- *Scartata: netto d'imposta.* La vista dopo le tasse esiste già nella stima della tassa e nel FIRE; le posizioni
  aperte sono valutate al lordo della tassa latente, e una vendita scaricherebbe in un mese la tassa di anni.
- *Scartata: lasciare le due modalità come sono.* Lo stesso mese dà due rendimenti secondo la base.

### D-RM2 — Dividendi e cedole al lordo · **presa** (proprietario, 2026-11-14)

L'imposta trattenuta su una distribuzione è un prelievo come quella di una vendita: il rendimento conta il lordo
del registro dividendi (§ 5.2, § 5.3, T5c). L'Attribuzione passa al lordo.

- *Alternativa B: al netto accreditato.* Più semplice (nessun termine `T_distrib`, Attribuzione invariata), ma la
  definizione diventa «lordo della tassa sulle plusvalenze, netto di quella sulle cedole», e il confronto con i
  benchmark, che non pagano imposte, perde ogni anno la ritenuta.
- Scelta la prima: D-RM1 vale senza eccezioni.

### D-RM3 — Il pagatore decide; gli interessi nella categoria dei dividendi · **presa** (proprietario, 2026-11-14)

Una distribuzione è rendimento della base quando il suo pagatore è dentro la base (§ 5.3). Un'entrata nella
categoria dei dividendi senza record nel registro è l'interesse del suo conto.

- *Alternativa B: solo il registro dividendi.* Gli interessi non conterebbero mai, e le due modalità darebbero
  risposte diverse per la stessa riga.
- *Alternativa C: un'impostazione nuova «categorie di rendimento».* Un'impostazione in più per un caso che la
  categoria esistente copre; si può aggiungere dopo senza cambiare la regola.
- Scelta la prima.

### D-RM4 — Nel mese in corso il flusso si ferma al giorno di cattura dello snapshot · **presa** (proprietario, 2026-11-14)

§ 5.4. I mesi chiusi restano interi.

- *Alternativa B: fermarsi a oggi.* Sbaglia quando lo snapshot è di un giorno precedente (cron fermo, o prima
  delle 19).
- *Alternativa C: escludere solo le righe `balancePending`.* Non copre le righe senza conto collegato.
- Scelta la prima.

### D-RM5 — Un buco è un solo sotto-periodo · **presa** (proprietario, 2026-11-14)

§ 5.5: flussi sommati, rendimento nella cella del mese che chiude, una osservazione mensile equivalente per la
volatilità.

- *Alternativa B: interpolare gli snapshot mancanti.* Inventa valutazioni che nessuno ha misurato.
- *Alternativa C: escludere il buco dalla volatilità.* È un filtro silenzioso dentro una sola metrica, vietato
  dalla guida.
- Scelta la prima.

### D-RM6 — Flusso a metà mese (Dietz modificato) · **presa** (proprietario, 2026-11-14)

§ 5.6, con le tre guardie e l'IRR sugli stessi istanti. **Sposta di poco ogni cifra già pubblicata** (T1: TWR
annualizzato da 8,243% a 7,977%).

- *Alternativa B: ogni flusso alla sua data dove è nota* (righe del cashflow, operazioni del registro), metà mese
  altrove. Più esatta per uno stipendio del 27, ma nel ramo misurato un acquisto interno è la somma di due
  movimenti che devono annullarsi con lo stesso peso; pesi diversi per fonte la rompono. Più codice, più difficile
  da verificare a mano.
- *Alternativa C: formula di oggi più una guardia* (mese non misurabile quando il flusso supera una soglia del
  capitale). Tocca meno cifre, ma i primi mesi di un account spariscono e la soglia è arbitraria.
- Scelta la prima: una formula, verificabile a mano, lo standard per valutazioni mensili.

### D-RM7 — Due passi e una PR ciascuno · **presa** (proprietario, 2026-11-14)

Passo 1: B1, B3, B2 (§ 5.1–5.4). Passo 2: B4, B9 (§ 5.5–5.6). Il passo 1 non sposta le cifre di un account senza
i casi che corregge; il passo 2 le sposta tutte. `CACHE_MATH_VERSION` sale a ogni passo che arriva su `main`
(`v9-fork`, poi `v10-fork`).

## 9. Punti aperti

- **La cella di un buco nella mappa mensile** mostra un rendimento di più mesi senza dirlo. Proposta: la riga di
  lettura sotto la griglia dice «in N mesi». È un testo sullo schermo: schizzo «oggi / proposta» con
  l'implementazione del passo 2.
- **Storico › Driver** tiene dividendi e cedole nel risparmio. Dopo questa specifica Rendimenti e Storico restano
  due risposte diverse; allinearle è un lavoro a parte.
- **Gli interessi in un'altra categoria**: se serve, l'impostazione dell'alternativa C di D-RM3.
- **Lo snapshot di un mese chiuso scritto prima dell'ultimo giorno** (cron fermo): le righe degli ultimi giorni
  sono nel flusso del loro mese e nel saldo del mese dopo; i due mesi si compensano. Raro; resta il limite del
  «secchio mensile».
