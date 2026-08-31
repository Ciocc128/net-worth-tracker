# Rendimenti: segnalare quando il registro operazioni e gli snapshot non concordano

> Follow-up di *«Rendimenti: i flussi seguono la base»* (`docs/performance-flows-pr.md`), dove è
> annotato come punto aperto. Questa è la guardia che rende difendibile la regola «registro prima».

## Contesto

`lib/utils/portfolioFlows.ts` sceglie la sorgente del flusso **per asset**: il registro operazioni
da dove quell'asset ha il suo primo movimento registrato, le Δquantità di `byAsset` prima o dove il
registro non lo conosce. Il registro vince perché è datato all'*operazione*, mentre uno snapshot è
datato alla *rilevazione*.

Il prezzo di quella scelta è dichiarato nel modulo:

> **Registro: un'operazione non registrata sparisce.** Per un asset marcato come coperto le
> Δquantità non intervengono più, quindi una vendita dimenticata sottostima il flusso e gonfia il
> rendimento. È il prezzo di preferire il registro, e la guardia naturale sarebbe una
> riconciliazione fra le due fonti — non c'è ancora.

Il meccanismo è in `computeMonthlyPortfolioFlow` (`portfolioFlows.ts:170`): per un asset coperto la
funzione legge il flusso del registro per la chiave `assetId|YYYY-MM`, con `?? 0` se quel mese non ha
operazioni, e poi fa `continue`. Il ramo Δquantità **non interviene mai più** su quell'asset, quindi
non c'è nessuna rete sotto — ed è deliberato: «nessuna operazione = nessun flusso» è
un'informazione, non un buco da riempire.

### Precisazione sul verso (il commento sopra dice solo metà)

Le due dimenticanze non sbagliano nello stesso verso:

| dimenticanza | flusso registrato | effetto sul TWR |
|---|---|---|
| **acquisto** non registrato | 0 invece di +X | `(endNW − cashFlow)/startNW` con `cashFlow` sottostimato → **rendimento gonfiato** |
| **vendita** non registrata | 0 invece di −X | `endNW` è già sceso ma niente lo neutralizza → **rendimento sgonfiato** |

Un utente che smette di registrare vede quindi i numeri **derivare in una direzione qualsiasi**, e
il silenzio è la parte peggiore: nessuna delle due si manifesta come un errore.

Misura su un account reale, a titolo di ordine di grandezza: una sola dismissione da **463 €** non
vista dal ramo registro, su una base che nel periodo va da ~65.000 a ~108.000 €, sposta il TWR
annualizzato di **−1,33 pp** su una finestra di 7 mesi (+18,24% contro +16,91%). Una singola
posizione minore, meno dell'1% del portafoglio, e più di un punto di rendimento.

## La proposta

Calcolare entrambe le fonti — cosa che `getAllPerformanceData` **già fa**, legge registro e
snapshot nello stesso `Promise.all` — confrontarle, e segnalare le divergenze. Nessuna query in più.

## Il risultato che cambia il disegno: **in euro non funziona**

Prima di scrivere il codice ho fatto girare la riconciliazione a mano su 23 mesi di un account
reale, con 62 operazioni su 15 asset coperti. In euro, con soglia 50 €:

- **9 divergenze**, la più grande **18.388 € in un solo mese**;
- **nessuna di esse è un difetto**. Sono tutte lo sfasamento di un mese fra data d'operazione e data
  di rilevazione — un acquisto sta nel registro del mese N e nello snapshot del mese N+1 — e si
  annullano da sole nel mese successivo;
- e anche **nel cumulato** in euro resta un residuo che non significa niente: sull'asset più
  movimentato **−957 €** su ~42.600 € di flusso (2,2%), gli altri sotto i 100 €. È solo la
  convenzione di prezzo — le Δquantità valorizzano al prezzo di **fine mese**, il registro al prezzo
  **dell'operazione**.

Una guardia in euro produrrebbe quindi un allarme grande quanto un'operazione vera, ogni volta che
l'utente compra a fine mese. **Il rumore è più grande del segnale che deve trovare.**

## In quantità è esatto

Stesso account, stessa finestra: la quantità che il registro implica e quella che gli snapshot
dichiarano coincidono a **0.0000 su tutti e 15 gli asset coperti**. Zero divergenze, zero falsi
allarmi. Le quantità non hanno una convenzione di prezzo da cui divergere.

*(Nota di onestà: su quell'account nessuna operazione mancava davvero, quindi il test dimostra
l'assenza di falsi positivi, non la capacità di trovare un vero positivo. Quest'ultima va coperta
con un test unitario che rimuove un'operazione da una serie e verifica che la guardia scatti.)*

## Disegno proposto

**1. Confrontare la posizione RIGIOCATA, non una somma di differenze.**
`adjustment` è un **reset assoluto** (`state.quantity = t.quantity`, `assetTransactionUtils.ts:256`), non un
delta: sommare le quantità con segno dà il numero sbagliato appena un utente registra una rettifica
o uno split. Va riusato `replayTransactions` / `replayTransactionsWithEffects`
(`lib/utils/assetTransactionUtils.ts`), che è già la definizione unica di «quanto ne possiedo
secondo il registro» — la stessa con cui il documento dell'asset viene ricostruito.

> Questo è il punto in cui è più facile sbagliare: la riconciliazione fatta a mano per questa issue
> sommava le differenze, ed è tornata esatta **solo perché** su quell'account non esiste nessun
> `adjustment` (57 `buy`, 5 `sell`, 0 `adjustment`). Con una rettifica in mezzo avrebbe mentito.

**2. Confrontare il cumulato a oggi, non il singolo mese.**
Mese per mese si riaccenderebbero tutti e 9 i falsi allarmi dello sfasamento di confine. Sul
cumulato quello sfasamento si chiude da solo.

**3. Segnalare solo ciò che PERSISTE.**
Una divergenza che sparisce entro il mese successivo è un confine, non un difetto. Va segnalata solo
quando sopravvive al mese dopo.

**4. Tolleranza relativa, non assoluta.**
Le quote frazionarie esistono. Una soglia sensata è una frazione della posizione (dell'ordine dello
0,5%) con un epsilon assoluto per i decimali del floating point, non un numero fisso di quote.

**5. Dire che cosa può essere, non solo che c'è.**
La guardia non distingue un'operazione dimenticata da un **evento societario** — split, fusione,
conferimento in natura, dividendo in quote muovono la quantità senza una riga di registro. Sono
esattamente gli stessi eventi già dichiarati come limite del ramo Δquantità. Il messaggio deve
nominare entrambe le cause, o la prima segnalazione dopo uno split verrà letta come un bug.

**6. Dove.**
Calcolo in una funzione pura, testata, accanto a `portfolioFlows.ts` (o dentro, se si preferisce
tenere insieme «quali flussi» e «sono affidabili»); chiamata da `getAllPerformanceData`, che ha già
tutti gli ingredienti in mano. Superficie naturale: la tessera **Contributi**, che già dichiara la
sorgente dei flussi con `PerformanceMetrics.flowSource` (`portfolio` / `cashflow` / `mixed`) — una
divergenza è la stessa domanda («questi numeri da dove vengono, e mi posso fidare?»), oppure il
**Dettaglio** se si vuole tenere la tessera pulita.

## Cosa questa issue NON fa

Non corregge i flussi: **segnala**. La correzione non è automatizzabile, perché solo l'utente sa se
manca un'operazione o se c'è stato uno split — e indovinare al posto suo riporterebbe il problema al
punto di partenza, ma senza il silenzio a fargli da alibi.
