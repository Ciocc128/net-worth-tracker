# AFU — Futures e conto di margine

> **Analisi funzionale.** Cosa deve fare la feature, dal punto di vista dell'utente e del dominio.
> L'analisi tecnica è `doc/ate-futures-margin.md` (da scrivere: attende i dati reali dell'account —
> P2). Questo documento chiude 31 decisioni; l'ATE non ne riapre nessuna.
>
> **Numerazione locale.** Le decisioni **D1–D31** e i punti **P1–P9** di questo documento valgono
> *dentro questo documento*. Una decisione presa altrove si cita sempre col suo registro e la sua
> data — per esempio «D27 (registro 2026-07-28)» — perché quel D27 esiste e non è il D27 di qui.
>
> **Sessione di pianificazione, 2026-09-21.** Nessun codice applicativo scritto.

---

## 1. Obiettivo e perimetro

### 1.1 Il problema

L'app modella una posizione come **quantità × prezzo unitario**. Un future rompe quell'identità in
due punti: la sua **esposizione** (il nozionale) e il suo **valore patrimoniale** (il margine più il
P&L) sono grandezze diverse, di ordini di grandezza diversi, che si muovono in modo indipendente.
Trattato come una posizione normale, un future sbaglia — in silenzio — Allocazione, Equilibrio, PAC,
ottimizzatore, metriche di rendimento e patrimonio netto.

La leva nell'app esiste già, ma come **moltiplicatore del valore di mercato** (`Asset.leverageRatio`,
offerto per il solo `type: 'etf'`). Per un future quel rapporto ha denominatore prossimo a zero ed è
instabile per costruzione: cresce quando rilasci margine, senza che l'esposizione sia cambiata.

### 1.2 Cosa deve fare la feature

Rappresentare **qualunque future, su qualunque sottostante, presso qualunque broker, in qualunque
valuta**, in modo che:

1. l'esposizione per asset class e la leva contino il **nozionale**;
2. il patrimonio netto conti il **margine più il P&L**, mai il nozionale;
3. la posizione dica **quanto sta rendendo**, in Patrimonio, senza inserimenti ricorrenti;
4. il rischio di margine sia una misura, non un'intuizione: cuscinetto, calo sopportabile prima
   della chiamata, soglie di policy, scenari di stress;
5. PAC e ottimizzatore sappiano pianificare in **contratti interi**, spendendo margine e non nozionale;
6. il registro operazioni sappia aprire, aumentare, ridurre, chiudere e **rollare**, con il realizzo
   fiscale attaccato all'evento che lo genera.

### 1.3 Non-obiettivi

La feature **non** è cucita sull'oro, su Directa né sul portafoglio del proprietario. Il caso
d'uso reale (§7) è il collaudo, non la specifica.

---

## 2. Glossario

| Termine | Definizione operativa |
| --- | --- |
| **Contratto** | L'unità negoziabile. Porta sottostante, moltiplicatore, valuta, tick, mesi listati. |
| **Moltiplicatore** | Unità di sottostante per contratto. CME 1-Ounce Gold (1OZ) = 1 oncia. |
| **Nozionale** | `contratti × moltiplicatore × prezzo × cambio`. È **esposizione**, non capitale. |
| **Margine iniziale** | Il capitale che il broker immobilizza all'apertura. Importo per contratto. |
| **Margine di mantenimento** | La soglia sotto cui scatta la chiamata. Importo per contratto. |
| **Margin account** | Il conto in valuta su cui vivono margine, P&L regolato e commissioni. |
| **Mark-to-market** | Il regolamento giornaliero del P&L in cassa, in valuta del contratto. |
| **Cuscinetto** | `cassa disponibile / nozionale`. Quanto respiro hai. |
| **Calo sopportabile** | Di quanto può scendere il sottostante prima della chiamata (§5.5). |
| **Roll** | Chiusura della scadenza vicina e apertura della successiva. **È un realizzo fiscale.** |
| **PMC d'ingresso** | Prezzo medio dei contratti aperti. Per un future è una grandezza vera; il *costo* no. |
| **Redditi diversi** | Future, ETC, azioni, obbligazioni: plus e minus si compensano. |
| **Redditi di capitale** | ETF armonizzati, fondi: le plus **non** si compensano con le minus. |

---

## 3. Casi d'uso

**U1 — Apro la prima posizione.** Creo lo strumento scegliendo un contratto dal catalogo; l'anagrafica
si compila e la correggo dove serve. Registro l'apertura con prezzo, contratti e commissioni. Collego
il margin account. Da quel momento Allocazione conta il nozionale, il patrimonio conta il saldo.

**U2 — Accumulo un contratto al mese.** Il PAC pianifica rate da N contratti: ogni rata costa il
margine iniziale più le commissioni, e pesa verso il target col nozionale.

**U3 — Sostituisco uno strumento con un future, a esposizione costante.** Il PAC dismette lo
strumento uscente **a rate** invece che in blocco, e ogni tranche finanzia un contratto.

**U4 — Guardo se sto rischiando troppo.** La pagina dice cuscinetto, calo sopportabile prima della
chiamata, e cosa succederebbe a −10/−20/−30%.

**U5 — Rilascio il margine in eccesso.** Scendo alla soglia di policy e trasferisco la differenza
all'altro broker: un trasferimento fra conti, a somma zero, mai un contributo.

**U6 — Rollo la scadenza.** Un evento solo, che porta entrambe le gambe, le commissioni e il realizzo.

**U7 — Leggo quanto ha reso.** Due numeri dichiarati: come si è mosso il sottostante, e cosa ha reso
il capitale impiegato.

**U8 — Stimo l'imposta.** La stima su chiusure e roll compensa con le minus dello **stesso**
intermediario, e dichiara quando non può.

---

## 4. Modello di dominio

### 4.1 Lo strumento (D1–D4)

Un future è un `Asset` di tipo **`future`** (D1). Porta:

- `quantity` = **numero di contratti** (intero);
- `assetClass` + `composition` come qualunque altro strumento (D4) — l'oro sta in `commodity`, un
  future su indice starebbe in `equity`, un multi-gamba userebbe `composition`;
- un riferimento al **contratto** del catalogo (D3) e gli eventuali override: moltiplicatore, valuta,
  tick, mesi listati, margine iniziale, margine di mantenimento (D11);
- la **scadenza corrente** come campo (D2): l'asset è la **serie**, non la scadenza;
- il riferimento al **margin account** che lo copre;
- l'**intermediario** (D29).

Un asset per serie (D2) tiene continui `byAsset`, `portfolioFlows`, l'attribuzione di Storico e
YOC attraverso i roll. In cambio, **il realizzo del roll deve essere un fatto esplicito** nel
registro: non lo si può più dedurre dal fatto che l'asset è andato a zero.

### 4.2 Il conto di margine (D5, D6)

È un `Asset` di tipo `cash` **marcato come conto di margine**, con l'elenco dei future che copre —
uno a molti, come nella realtà. Riusa il saldo-in-`quantity`, i trasferimenti a somma zero
(`reconcileTransferCreate`) e la storia negli snapshot. Sta nella base di Allocazione ed è **immune
a «Liquidità fuori dalla base»** (D6): fosse fuori, il P&L dei future — cioè il rendimento da
misurare — uscirebbe dalla porta di servizio.

### 4.3 Le tre nature della cassa (D27)

| | Natura | Scala col portafoglio? | Denominatore | Numeratore |
| --- | --- | --- | --- | --- |
| Fondo emergenza | N mesi di spesa, **importo assoluto** | No | **No** (`allocationRole: 'excluded'`) | No |
| Margine | % del nozionale, da policy | Sì | **Sì** | **No** (D26) |
| Liquidità operativa | residuo | — | Sì | Sì, 1:1 |

Il fondo emergenza non è portafoglio e non è una percentuale: N mesi restano N mesi a 100k come a
500k. Il meccanismo esiste già (`allocationRole: 'excluded'`), e non richiede di mantenere nessun
target. L'alternativa `useFixedAmount` lo lascerebbe nel denominatore diluendo tutte le percentuali,
e ha già il trabocchetto noto con `deriveTargetLeverageRatio` (che salta la classe `cash` quando
l'importo fisso è acceso).

---

## 5. Regole di calcolo

Tutte le formule producono EUR. Il cambio è una **variabile viva** in ogni formula, mai una costante
(A2): congelarlo è la scorciatoia che un'implementazione distratta prende per prima.

### 5.1 Nozionale (D19)

```
notionalEur(future) = contratti × moltiplicatore × prezzoSottostante × fx(valutaContratto → EUR)
```

Per un future con `composition`, il nozionale si ripartisce per gamba come già fa un ETF composito.

`expandAssetExposure` resta **l'unico punto** dove mercato e nozionale si separano, ma risolve il
nozionale **per tipo**:

```
notionalValue(asset) =
    asset.type === 'future'        →  notionalEur(asset)                  // dalla formula sopra
    asset è un margin account      →  0                                   // D26
    altrimenti                     →  marketValue × (leverageRatio ?? 1)  // invariato
```

Conseguenza obbligata: `exposurePerEuro` (PAC, ottimizzatore) e `buildInstrumentExposures` (i tre
piani) **smettono di ragionare «per euro»**. Su un future quel rapporto ha denominatore zero ed è
instabile. Ricevono nozionale ed euro di mercato come **grandezze assolute**; il rapporto si calcola
solo a livello di portafoglio.

### 5.2 Valore patrimoniale (D7)

```
calculateAssetValue(future)      = 0
valore patrimoniale della posizione = saldo(margin account)
```

Col reset giornaliero il P&L è già cassa entro sera: **il saldo è il valore**. Il saldo si aggiorna
a mano, con data (D9), perché nessuna API è raggiungibile (P5).

> **Trappola numero uno.** Il P&L aperto di §5.3 **è già dentro il saldo**. È una *lettura*, mai un
> addendo del patrimonio. D7 lo rende automatico, ma un'implementazione distratta somma i due e
> conta due volte lo stesso euro.

### 5.3 P&L della posizione (D16, D28)

```
pnlApertoEur      = (prezzoCorrente − pmcIngresso) × contratti × moltiplicatore × fx(oggi)
pnlRealizzatoEur  = Σ eventi di chiusura e roll:
                      (prezzoUscita − pmcAlMomento) × contrattiChiusi × moltiplicatore × fx(evento)
                      − commissioni dell'evento
pnlPosizioneEur   = pnlRealizzatoEur + pnlApertoEur
```

Il cambio è quello **dell'evento** per il realizzato e quello **di oggi** per l'aperto: sono due
momenti diversi e usarne uno solo introduce un errore di cambio nel P&L.

Zero inserimenti ricorrenti: il PMC viene dal registro, il prezzo da Yahoo, il cambio da Frankfurter.
**Limite dichiarato**: è il P&L *teorico*. Uno scarto col saldo reale (una commissione non registrata,
un cambio diverso da quello di Frankfurter) non viene rilevato — vedi P8.

I due rendimenti che la pagina mostra (D28):

```
rendimentoSottostante = pnlPosizioneEur / nozionaleMedioDelPeriodo
rendimentoCapitale    = pnlPosizioneEur / margineMedioImpegnatoNelPeriodo
```

Con 19.200 € di nozionale su 6.720 € di margine, un +10% sul sottostante è un **+28,6%** sul capitale.
Due verità diverse: la prima giudica il sottostante, la seconda confronta la posizione con l'ETC che
sostituisce. Le etichette devono essere inequivocabili o si leggono a rovescio.

### 5.4 Leva (D26)

```
notionalTotale = Σ notionalValue(asset)   su tradable + frozen        // margine → 0
baseMercato    = Σ marketValue(asset)     su tradable + frozen        // margine → saldo
leva           = notionalTotale / baseMercato
```

Il margine è **capitale** (denominatore) ma **non è un'esposizione a sé** (numeratore): la sua
esposizione è già il nozionale del future. Contarlo due volte farebbe comparire lo stesso capitale
in due ruoli.

Questo preserva l'identità algebrica su cui poggia `computeBalanceScore`:

```
Σ(current − target)  =  gap di leva          quando ogni euro del denominatore ha un target
misallocationPct     = (Σ|d| − |Σd|) / 2
```

**Lettura della transizione (non è un artefatto).** Rilasciare 4.700 € dal margin account verso
l'altro broker *alza* la leva misurata da 1,381× a 1,420×: quei 4.700 € smettono di garantire
un'esposizione già contata e diventano esposizione di cassa, 1:1. È vero e va letto così — hai la
stessa esposizione all'oro **più** 4.700 € liberi, sullo stesso capitale. A regime, reinvestiti in
Azioni/Trend/Carry, la leva torna a 1,381×.

### 5.5 Cuscinetto e rischio di margine (D11, D22, D30)

```
cassaDisponibile  = saldo(margin account) − riservaDichiarata
nozionaleCoperto  = Σ notionalEur(future) coperti da quel conto
cuscinetto        = cassaDisponibile / nozionaleCoperto
mantenimentoPct   = (margineMantenimentoPerContratto × contratti) / nozionaleCoperto
caloSopportabile  = cuscinetto − mantenimentoPct
```

> **Perché la sottrazione è esatta e non un'approssimazione.** Il margine di mantenimento è un
> **importo in euro per contratto** (D11), non una percentuale del nozionale: quando il prezzo
> scende, il requisito **non** si riduce. La chiamata scatta quando
> `cassa − x·N < M`, cioè `x > c − m` — la formula sopra. Se il mantenimento fosse una percentuale
> del nozionale corrente, la formula esatta sarebbe `(c − m) / (1 − m)` e darebbe 56% dove questa
> dà 51%. La distinzione va tenuta: gli exchange rivedono i margini periodicamente, quindi la
> formula è esatta **fra due revisioni**.

**Policy a soglie (D22)** — percentuali del nozionale, con fasce nominate:

```
cuscinetto ≥ sogliaNormale      →  «normale»
sogliaAttenzione ≤ c < normale  →  «attenzione»    (quanto versare per tornare normale)
c < sogliaAttenzione            →  «critico»
```

La soglia è **tua**, non del broker: il broker chiama al mantenimento. La UI lo deve dire.

**Stress test (D30)** — il numero principale è il calo che porta alla chiamata; accanto, tre scenari
fissi. Niente cursore: deve funzionare identico in pagina, in email e nel PDF.

```
per s in {−10%, −20%, −30%}:
    cassaDopo     = cassaDisponibile + s × nozionaleCoperto
    nozionaleDopo = nozionaleCoperto × (1 + s)
    cuscinettoDopo = cassaDopo / nozionaleDopo
    daVersare     = max(0, sogliaNormale × nozionaleDopo − cassaDopo)
```

### 5.6 PAC (D23, D24)

Tre concetti che oggi coincidono e vanno separati: `scheduleInstallments` fa
`q = floor(budget / buyPriceEur)` assumendo **prezzo = costo = peso**.

```
costoPerUnità(future)    = margineIniziale + commissionePerContratto
nozionalePerUnità(future) = moltiplicatore × prezzo × fx
q = floor(budgetDisponibile / costoPerUnità)      // NON budget / prezzo
```

Senza la separazione, un contratto da 3.840 € di nozionale consumerebbe 3.840 € di liquidità che
non spendi, e il piano risulterebbe impossibile da finanziare.

**Dismissione graduale (D23)** — modalità **opzionale**: `PlanDisposal` guadagna un piano d'uscita
(mese + quota) invece dell'unico evento al mese 1. Il default resta D5 del PAC (vendita in blocco al
mese 1): i piani esistenti non cambiano comportamento.

### 5.7 Ottimizzatore (D25)

Il future entra nel QP come gli altri candidati, col nozionale al posto di `esposizione × valore`.
Il peso proposto viene poi tradotto in contratti interi:

```
contratti = round(w_future × B / nozionalePerContratto)
residuo   = w_future × B − contratti × nozionalePerContratto   → redistribuito sugli altri candidati
```

**Limite dichiarato**: un contratto è ~3,1% del NAV nel caso reale, contro i 0,5 pp della griglia
attuale (`roundToHalfPoints`). La soluzione arrotondata può allontanarsi visibilmente dall'ottimo, e
**il rapporto deve dirlo**. Va inoltre verificata l'interazione con l'euristica «pesi sotto il 2%
azzerati»: un future può legittimamente pesare meno del 2% e non deve sparire.

### 5.8 Metriche di rendimento (D14, D28)

I movimenti fra due conti entrambi **dentro** la base non attraversano nessun confine: con
`portfolioFlows` il trasferimento **non è un contributo**, senza codice nuovo. Un versamento che
arriva dal fondo emergenza (che è `excluded`, D27) attraversa il confine **ed è** un contributo,
correttamente. Il meccanismo esistente risponde giusto a entrambi i casi.

Il regolamento giornaliero non è tracciato (conseguenza di D7 + D16): è già dentro il saldo. La
granularità ricostruibile è **mensile**, quella dello snapshot.

### 5.9 Fiscalità (D29)

```
classificazione(strumento) ∈ { redditoDiverso, redditoCapitale }
    future, ETC, azioni, obbligazioni  →  redditoDiverso    (plus e minus si compensano)
    ETF armonizzati, fondi             →  redditoCapitale   (plus NON compensabili con minus)

stockMinus[intermediario][annoDiFormazione]  →  utilizzabile fino ad annoDiFormazione + 4

impostaStimata(evento) =
    max(0, plusvalenza − minusCompensabili(intermediario, annoEvento)) × aliquota
```

Le minus **restano sul dossier del singolo intermediario**: una minus su Directa non compensa una
plus su Fineco. Ogni roll è un realizzo, quindi un portafoglio con roll bimestrali genera
compensazioni continue: senza questo, la stima sovrastima sistematicamente.

Quando l'aliquota manca, la stima è **«non stimata»**, mai zero — regola già in vigore per le
vendite (`summarizePeriodSales`).

---

## 6. Impatti sulle feature esistenti

Ordinati per gravità. Sono i punti dove la feature rompe o costringe a cambiare.

| # | Impatto | Dove |
| --- | --- | --- |
| **I1** | La leva è un moltiplicatore del valore di mercato; un future non ha valore di mercato. Risolto da D19 + D26, ma il refactoring non è locale. | `assetExposureUtils.ts`, `accumulationPlanUtils.ts`, `leverageAwareAllocationUtils.ts`, `weightOptimizer.ts` |
| **I2** | Il QP dei piani ragiona in «euro di mercato scambiati», che per un future non esistono. La variabile è **contratti interi**. | `leverageAwareAllocationUtils.ts` |
| **I3** | Il ledger non sa rappresentare il mark-to-market né il roll. Risolto da D12/D13 con un motore dedicato. | `assetTransactionUtils.ts`, `assetTransactionUseCase.ts` |
| **I4** | Il margine è cassa, e la cassa è opzionalmente fuori dalla base. Risolto da D6. | `performanceBase.ts` |
| **I5** | **Bug preesistente, da correggere comunque**: un conto `cash` in valuta estera oggi vale 1:1, perché `hasMarketPrice('cash') === false` e il price updater non lo tocca mai. | `assetPricing.ts`, `priceUpdater.ts`, `costBasisEur.ts` |
| **I6** | `byAsset` porta `{quantity, price, totalValue}` e `portfolioFlows` legge Δquantità × prezzo come flusso: su un future sarebbe un flusso fantasma di un nozionale. Serve il trattamento **opaque** (il meccanismo esiste già per fondi pensione e immobili) più i campi di D18. | `portfolioFlows.ts`, `types/assets.ts` |
| **I7** | Il PAC vende gli strumenti fuori piano in blocco al mese 1 (D5 del PAC). Risolto da D23, in modo additivo. | `accumulationPlanUtils.ts`, `AccumulationPlanDialog.tsx` |
| **I8** | Niente intermediario, niente stock di minus, niente distinzione redditi diversi/capitale. Risolto da D29. | `periodSales.ts`, `assetTransactionUtils.ts`, `types/assets.ts` |
| **I9** | `computeBalanceScore` e il verdetto di Equilibrio cambiano significato: la leva diventa la cifra principale. Risolto da D21 senza riscritture, grazie a D26. | `allocationUtils.ts`, `app/dashboard/allocation/page.tsx` |
| **I10** | Il rischio di margine non ha casa: nessuna superficie risponde a «quanto posso scendere». È l'unica area interamente nuova, e quindi la meno rischiosa. | nuovo |
| **I11** | Attriti minori: `TYPE_TO_CLASS` è esaustivo (tsc lo prende), `LEDGER_ASSET_TYPES` **no** (checklist manuale); `requiresManualPricing`, `suggestIsLiquid`, lo zod di `validation.ts`, i chip del `TransactionDialog`, lo slot in `ASSET_CLASS_CHART_INDEX`. `NON_LOOKTHROUGH_ASSET_CLASSES` già classifica oro/trend/carry come non-look-through: lì il future entra pulito. | vari |

### Trappola trasversale

`computeCashDelta` addebita oggi `quantity × priceEur + fees` su ogni `buy` con
`linkedCashAssetId`. Su un future sarebbe **il nozionale**: aprire un contratto addebiterebbe
3.840 € al conto di margine. Per un future il ledger muove la cassa **solo per commissioni e
realizzo**, mai per il nozionale — e comunque il saldo autoritativo resta quello inserito (D9).

---

## 7. Caso di verifica numerico

Il portafoglio del proprietario, come test di accettazione delle formule. **Non è la specifica**:
è il collaudo.

**Dati congelati (A2)**: oro 4.383 USD/oz, EUR/USD 1,141 → **3.841,4 €** per contratto 1OZ
(arrotondato a 3.840 € nelle cifre attese). NAV di portafoglio 122.800 €. Mantenimento 8%.

### 7.1 Stato di regime atteso

| Classe | Target | Nozionale |
| --- | ---: | ---: |
| Azioni | 70,0% | 85.960 € |
| Bond | 24,5% | 30.086 € |
| Trend | 17,5% | 21.490 € |
| Carry | 10,5% | 12.894 € |
| Oro (nozionale, 5 contratti) | 15,6% | 19.200 € |
| **Σ nozionale** | **138,1%** | **169.630 €** |
| Margine (denominatore, numeratore 0) | 5,5% | 6.720 € |
| **Leva** | | **1,381×** |

### 7.2 Le due fasi, e i due invarianti distinti

**Fase 1, mesi 1-3 — sostituzione a esposizione costante.** Ogni mese: vendita di ~3.840 € di ETC,
acquisto di 1 contratto, ricavo sul margin account.

> **Invariante A**: `Δ esposizione oro ≈ 0` in ogni mese. Vendita e acquisto si compensano.

Dopo il mese 3: 11.420 € sul margin account, 3 contratti, 11.520 € di nozionale,
**cuscinetto 99,1%**.

**Fase 1, mesi 4-5 — la leva in azione.** I contratti 4 e 5 **non richiedono cassa nuova**: sono
coperti dagli 11.420 € già presenti.

> **Invariante B**: `Δ esposizione oro = +3.840 €/mese`, `Δ cassa ≈ 0` (solo commissioni).

Dopo il mese 5: 19.200 € di nozionale, **cuscinetto 59,5%**, **calo sopportabile 51,5 pp**.

**Fase 2 — rilascio.** Cuscinetto di regime 35% → `0,35 × 19.200 = 6.720 €`. Rilascio
`11.420 − 6.720 = 4.700 €` verso l'altro broker, poi reinvestiti nei gap di Trend, Azioni e Carry.

### 7.3 Asserzioni

| # | Grandezza | Formula | Atteso |
| --- | --- | --- | ---: |
| V1 | Target 5 contratti / NAV | 19.200 / 122.800 | 15,6% |
| V2 | Cuscinetto a 3 contratti | 11.420 / 11.520 | 99,1% |
| V3 | Cuscinetto a 5 contratti | 11.420 / 19.200 | 59,5% |
| V4 | Calo sopportabile | 59,5 − 8,0 | 51,5 pp |
| V5 | Cuscinetto di regime | 0,35 × 19.200 | 6.720 € |
| V6 | Rilascio | 11.420 − 6.720 | 4.700 € |
| V7 | Margine / NAV | 6.720 / 122.800 | 5,5% |
| V8 | Leva a regime | 169.630 / 122.800 | 1,381× |
| V9 | **Il nozionale NON è patrimonio** | patrimonio della posizione | = saldo, mai 19.200 € |
| V10 | **Il P&L non è contato due volte** | patrimonio | saldo, non saldo + P&L aperto |
| V11 | Invariante A (mesi 1-3) | Δ esposizione oro | ≈ 0 |
| V12 | Invariante B (mesi 4-5) | Δ esposizione oro / Δ cassa | +3.840 € / ≈ 0 |
| V13 | Trasferimento fra conti in base | contributo in Rendimenti | 0 |
| V14 | Leva in transizione (4.700 in volo) | (169.630 + 4.700) / 122.800 | 1,420× |

V9, V10 e V13 sono le asserzioni che catturano gli errori strutturali; le altre catturano gli errori
aritmetici.

---

## 8. Registro decisioni

| # | Decisione | Area |
| --- | --- | --- |
| D1 | Nuovo `AssetType: 'future'`. `TYPE_TO_CLASS` è esaustivo e tsc lo prende; `LEDGER_ASSET_TYPES` no. | 1 |
| D2 | Un asset per **serie**; la scadenza è un campo, il roll è un evento. Continuità di `byAsset`, `portfolioFlows`, Storico, YOC. | 1 |
| D3 | Catalogo contratti curato (`lib/constants/futuresContracts.ts`, sul modello di `instrumentProfiles.ts`) + override per asset. | 1 |
| D4 | Il sottostante usa `assetClass` + `composition` come ogni altro strumento; cambia solo l'origine del nozionale. | 1 |
| D5 | Il margin account è un asset `cash` dedicato, marcato, legato ai future che copre (uno a molti). | 2 |
| D6 | Il margine sta nella base di Allocazione ed è immune a «Liquidità fuori dalla base». | 2 |
| D7 | Il patrimonio della posizione è tutto sul margin account; il future vale 0. | 3 |
| D8 | Prezzo del sottostante e cambio automatici (Yahoo + Frankfurter), come ogni strumento in valuta. | 3 |
| D9 | Il saldo del margine si aggiorna a mano, con data, e l'app dice quanto è vecchio. | 3 |
| D10 | Le commissioni viaggiano nel ledger, sul campo `fees` esistente. | 4 |
| D11 | Margine iniziale e di mantenimento dal catalogo, **importi per contratto**, sovrascrivibili sull'asset. I margini del broker sono più alti di quelli d'exchange: l'override è la norma. | 6 |
| D12 | Nuovi tipi di evento + `replayFuturesTransactions` dedicato: `quantity` = contratti, PMC = prezzo medio d'ingresso, `costBasisEur` = 0. | 4 |
| D13 | Il roll è **un** evento, con entrambe le gambe, le commissioni e il realizzo. | 4 |
| D14 | Versamenti e prelievi fra broker sono trasferimenti fra conti, col meccanismo esistente. | 4 |
| D15 | **Requisito**: la posizione deve dire quanto sta rendendo, in Patrimonio. | 3 |
| D16 | Il P&L è **derivato**, mai inserito: realizzato dal ledger, aperto da PMC contro prezzo vivo. | 3 |
| D17 | La posizione si legge come riga della tabella Strumenti, con colonne proprie (contratti · nozionale · P&L aperto · P&L realizzato · margine). La riga **non somma al patrimonio**, e lo dice sulla riga. | 3 |
| D18 | Lo snapshot mensile congela contratti, nozionale, P&L aperto, realizzato-a-oggi, saldo margine. **Assente ≠ zero** sugli snapshot precedenti. | 11 |
| D19 | `expandAssetExposure` resta l'unico punto di separazione mercato/nozionale, ma lo risolve **per tipo**. I consumatori passano a grandezze assolute. | 5 |
| D20 | Il margine è escluso dal confronto col target di liquidità: mai «VENDI» su denaro vincolato. | 5 |
| D21 | La leva si mostra nell'eroe di Allocazione: corrente contro target. | 5 |
| D22 | Policy del cuscinetto in % del nozionale, fasce nominate. La soglia è dell'utente, non del broker. | 6 |
| D23 | Dismissione graduale come **modalità opzionale** del PAC; il default (vendita al mese 1) resta. | 7 |
| D24 | Nel PAC la rata di un future costa il **margine**; il peso verso il target conta il **nozionale**. | 7 |
| D25 | L'ottimizzatore tratta il future come candidato a granularità discreta, arrotondato a contratti interi, col residuo redistribuito. | 8 |
| D26 | Leva = Σ nozionale / base di mercato, col margine **nel denominatore e fuori dal numeratore**. | 5 |
| D27 | Tre nature di cassa: emergenza fuori da tutto (importo assoluto), margine al solo denominatore, operativa normale 1:1. | 5 |
| D28 | Due rendimenti dichiarati per posizione: del sottostante e sul capitale impiegato. | 9 |
| D29 | Classificazione fiscale per strumento (redditi diversi / di capitale) + stock di minus per intermediario con anno di scadenza. | 10 |
| D30 | Stress test: il calo fino alla chiamata come numero principale, più −10/−20/−30%. Nessun cursore. | 6 |
| D31 | Fuori scope v1 (§10). | 12 |

---

## 9. Punti aperti e assunzioni

### Punti aperti

| # | Punto | Stato |
| --- | --- | --- |
| P1 | La lente «per accessibilità» / D27 (registro 2026-07-28) | **Chiuso**: decisione presa e mai approfondita, non implementata. Si ragiona sul codice di oggi. |
| P2 | Dati reali dell'account (SGLN, target attuali, uso dell'importo fisso) | **Aperto**: rinviato alla sessione dal PC personale. **Blocca l'ATE**, non l'AFU. |
| P3 | Cambio nel caso di test | **Chiuso** → A2. |
| P4 | Provenienza del cash per i contratti 4 e 5 | **Chiuso**: nessun cash nuovo, è la leva. Genera l'invariante B (§7.2). |
| P5 | API Directa | **Chiuso come vincolo**: socket TCP su `127.0.0.1` esposti dalla piattaforma Darwin locale; nessun endpoint cloud, nessun token remoto. Vercel non può raggiungerli. |
| P6 | Il ticker continuo (`GC=F`) non è il contratto 1OZ | **Limite dichiarato**: base e scadenza divergono. Nozionale accurato, non identico all'estratto. |
| P7 | Override manuale del prezzo di regolamento ufficiale | **Rinviato oltre la v1.** |
| P8 | Riconciliazione del P&L teorico col saldo reale | **Rinviato oltre la v1.** Il pattern esiste già («Non attribuito» in Rendimenti). |
| P9 | Definizione della leva | **Chiuso** → D26. |

### Assunzioni

- **A0** — Questo documento è derivato dal codice e dai doc del repo, non dai dati di produzione:
  in sessione remota non esistono credenziali Firebase, quindi `mirror:seed` non è eseguibile.
- **A1** — *(ritirata: era la lettura della lente per accessibilità, chiusa da P1.)*
- **A2** — Nel caso di accettazione EUR/USD è congelato a 1,141 e l'oncia a 4.383 USD. **Nelle
  formule il cambio resta una variabile viva**, mai una costante.

---

## 10. Fuori scope v1 (D31)

- **Opzioni e posizioni short.** Le greche e il valore temporale, e una matematica del margine
  diversa: meritano una progettazione propria.
- **Spread fra scadenze e strategie multi-gamba.** Una posizione = un contratto su una scadenza. Un
  calendar spread ha un margine netto che non si ricava dalle gambe.
- **Import automatico da broker.** Conseguenza di P5, non una mancanza: va scritto come confine.
- **Avvisi attivi (email o push) al superamento delle soglie.** La policy calcola e mostra; non
  scrive. Un avviso richiede il cron e una logica di de-duplica.
- **P7** (override del settlement) e **P8** (riconciliazione col saldo).
