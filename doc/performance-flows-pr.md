# Rendimenti: i flussi seguono la base

> **Aperta il 2026-08-31 come [PR #319](https://github.com/GiuseppeDM98/net-worth-tracker/pull/319)**
> su `develop` di upstream, dal branch `pr/rendimenti-flussi-seguono-base` (`upstream/develop` +
> il solo commit `45fa86e`). Verificata su quella base prima di aprirla: cherry-pick pulito,
> `tsc` pulito, **145 file / 3253 test verdi** sotto `TZ=Europe/Rome`.
>
> Il corpo inviato a GitHub differisce da questo file in due punti, di proposito: il rimando a
> `docs/ledger-reconciliation-issue.md` è sostituito dal suo riassunto (quel file esiste solo in
> questo fork), e il conteggio dei test è quello misurato sulla base upstream, non sul fork.
>
> Il follow-up annunciato nel corpo è poi diventato la
> [issue #320](https://github.com/GiuseppeDM98/net-worth-tracker/issues/320).
>
> **Aggiornamento del 2026-08-31 (sera)**: la head della #319 è ora `f1708c2` — al commit dei flussi
> si è aggiunto quello delle finestre rolling — e il corpo su GitHub ha una sezione in più, «Anche le
> finestre rolling (secondo commit)», più i due numeri corretti: cache `v7`, **145 file / 3256 test**.
> La PR è passata da draft a **ready for review**; `MERGEABLE` verificato. La sezione dichiara
> esplicitamente la rimozione di `rolling36M`, con l'offerta di rimetterlo se il manutentore lo
> preferisce.

## Il problema

`lib/utils/performanceBase.ts` permette all'utente di **escludere capitale** dalla base dei
Rendimenti — di default i fondi pensione e gli asset con `allocationRole: 'excluded'`, tipicamente
la casa in cui vive o i conti liquidi. La base misurata diventa così un sottoinsieme del patrimonio.

`getCashFlowsFromExpenses` (`lib/services/performanceService.ts`) produce i flussi che neutralizzano
il rendimento, e **salta i trasferimenti per costruzione**:

```ts
// Transfers are net-zero for portfolio metrics — skip before touching the map
if (expense.type === 'transfer') return;
```

È vero sul patrimonio totale. **Non è vero su una base ridotta**: se la liquidità sta fuori dalla
base, comprare uno strumento con i soldi di un conto è denaro che *entra* nel capitale misurato, e
quel trasferimento è esattamente ciò che la funzione non può vedere.

I due moduli misurano perimetri diversi. Il risultato è che ogni acquisto viene letto come
rendimento.

Il difetto era già noto e sottostimato — dal commento in testa a `performanceBase.ts`:

> `KNOWN LIMITATION: un versamento VOLONTARIO è un trasferimento dal portafoglio (cassa) verso il
> fondo escluso, quindi sulla base portfolio appare come un piccolo deflusso non neutralizzato.`

Non è un piccolo residuo quando è la liquidità a stare fuori: diventa il termine dominante.

## L'evidenza

Su un account reale con gli 11 conti liquidi marcati `excluded`, febbraio → agosto 2026:

| | valore |
|---|---|
| strumenti acquistati nel periodo | **35.208 €** |
| flussi effettivamente neutralizzati | **659 €** |
| TWR annualizzato mostrato | **35,1%** |
| TWR annualizzato corretto | **~17%** |

Febbraio 2026 da solo: la pagina leggeva **+13,14%**, il reale era **+2,87%**. La pipeline è stata
riprodotta fuori dall'app e i numeri della schermata escono identici, quindi la diagnosi è misurata,
non dedotta.

## La regola

**I flussi seguono la base.**

- La base è tutto il patrimonio (`exclusions` vuoto) → i flussi restano quelli del Cashflow. Solo il
  denaro che arriva dall'esterno cambia il capitale misurato: è esattamente la domanda che il
  Cashflow risponde. **Nessun cambiamento di comportamento.**
- La base è un sottoinsieme → i flussi si misurano su ciò che attraversa il confine, con il nuovo
  modulo `lib/utils/portfolioFlows.ts`.

Dentro il nuovo modulo, la fonte si sceglie **per asset**:

1. **Registro operazioni**, da dove quell'asset ha il suo primo movimento registrato. È la fonte
   migliore perché è datata all'*operazione*, mentre uno snapshot è datato alla *rilevazione*.
2. **Δquantità di `byAsset`** (`Σ (q₁ − q₀) × p₁`) prima di quella data, o per gli asset che nel
   registro non compaiono mai.

Nessuna delle due, da sola, regge:

- il **registro da solo** conosce solo ciò che è stato registrato. Su un account reale registrava
  l'acquisto di un portafoglio nuovo (30.065 €) senza la vendita del vecchio, avvenuta presso un
  altro intermediario: quel mese, da solo, valeva **−100%**;
- le **Δquantità da sole** sbagliano il mese al confine: 722 quote comprate il 20/08 stanno nel
  registro ad agosto e nello snapshot di fine mese a settembre.

Insieme, per asset, coprono entrambi i buchi.

La conseguenza che conta è sul futuro: **un utente che registra le sue operazioni ha ogni asset
coperto**, quindi la misura è interamente basata sul registro e le Δquantità non intervengono mai.
La rete serve allo storico, non lo zavorra.

## Chi vede un cambiamento

| profilo | prima | dopo |
|---|---|---|
| nessun asset escluso | Cashflow | **identico** |
| snapshot senza `byAsset` (inseriti a mano) | Cashflow | **identico** (fallback per mese) |
| esclude qualcosa, ha il `byAsset` | acquisti letti come rendimento | flussi misurati |
| esclude qualcosa, tiene il registro | come sopra | flussi dal registro, datati all'operazione |

Il fallback è **per mese**, non per periodo: un flusso di portafoglio è misurabile solo dove esiste
il `byAsset` di due mesi consecutivi, e dove non c'è si ricade sul Cashflow. Un mese *misurato* che
vale zero e un mese *non misurabile* sono fatti diversi e restano distinti — confonderli azzererebbe
i flussi di chi non ha breakdown, ed è la regressione che questa forma evita.

`PerformanceMetrics.flowSource` (`'portfolio' | 'cashflow' | 'mixed'`) dice quale fonte ha prodotto i
numeri, e la tessera Contributi lo riporta invece di stampare un capitale investito che nessuna
formula ha usato.

### Anche le finestre rolling (2026-08-31)

La prima versione di questo fix era arrivata ai cinque periodi fissi e non a `calculateRollingPeriods`,
che restava sul Cashflow: **capitale della base, flussi del patrimonio**. Le due tessere rolling del
«Dettaglio» leggevano quindi come versamento nel portafoglio ogni euro risparmiato fuori dal
portafoglio, e divergevano dai numeri di periodo mostrati sopra, nella stessa pagina.

La regola sta ora in una funzione sola — `resolveBaseAwareCashFlows` in `performanceService.ts` —
condivisa da ogni finestra di misura, periodi fissi e rolling. Nessuna delle due metà della base
(quale capitale, quali flussi) può più essere applicata senza l'altra.

Nella stessa passata: un CAGR rolling non misurabile è `null` invece di `0` (era `cagr || 0`, che
schiacciava anche uno zero legittimo), e `rolling36M` — calcolato, serializzato e cachato senza che
nessuna superficie lo leggesse — è stato rimosso.

## Limiti dichiarati

- **Δquantità: prezzo di fine mese, non di operazione.** Un acquisto a metà mese è valorizzato alla
  chiusura: giusto in quantità, approssimato in euro. È la convenzione «flusso a fine periodo», la
  stessa che il resto della pipeline già assume. Non riguarda il ramo registro.
- **Δquantità: non ogni variazione di quantità è un'operazione.** Split, fusioni, conferimenti in
  natura e dividendi reinvestiti in quote muovono le quantità senza denaro.
- **Registro: un'operazione non registrata sparisce.** Per un asset coperto le Δquantità non
  intervengono più. Vedi il follow-up.
- **Asset opachi al flusso.** Un fondo pensione tiene il valore in `quantity` con prezzo 1
  (`assertFundValueLivesInQuantity`), quindi la sua quantità cresce sia per i versamenti sia per il
  mercato. Su questi le Δquantità non si applicano — altrimenti il rendimento del fondo sparirebbe —
  e i loro versamenti restano non neutralizzati, cioè la limitazione odierna. Un conto corrente
  **non** è opaco: lì la quantità è il saldo.
- **Gli interessi di un conto corrente** dentro la base vengono letti come contributo, non come
  rendimento.

## Correzione indipendente: basi non positive

Cinque divisioni controllavano `=== 0` ma non il negativo (`calculateROI`, TWR, IRR, volatilità,
rendimenti mensili) più `buildTwrIndex` in `drawdownSeries.ts`. Un capitale iniziale negativo — debito
netto, o un mese interamente liquidato — non faceva fallire il calcolo: **ribaltava il segno in
silenzio**, e nella catena del TWR un mese così vale −100% e azzera tutto il periodo. Ora sono tutte
`<= 0`, cioè «nessun rendimento percentuale da misurare».

Non ha nulla a che vedere con il resto della PR e può essere estratta in un commit a sé.

## Cache

`CACHE_MATH_VERSION` sale a `v6`: ogni numero in cache è stato calcolato con la matematica
precedente. `buildCacheKey` include ora anche una firma del registro (conteggio + operazione più
recente) — senza, registrare una vendita non invaliderebbe la cache e la pagina resterebbe sui
valori vecchi fino alla scadenza delle 6 ore.

Il registro viene letto prima del controllo di cache, quindi è **una query indicizzata in più per
caricamento**, che si sovrappone a quella che la pagina fa già con React Query. È il prezzo di non
servire numeri stantii dopo un'operazione. Una lettura fallita non degrada in silenzio: logga e
ricade sulle sole Δquantità.

## Test

`__tests__/portfolioFlows.test.ts`, 22 casi: variazione di prezzo che non è un flusso, acquisto,
vendita, posizione chiusa, asset fuori base, mesi misurabili e non, registro preferito per asset,
commissioni, `adjustment`, asset opachi, conto corrente non opaco, mese misurato a zero.
Più le regressioni sulla base non positiva in `performanceService.test.ts` e `drawdownSeries.test.ts`.

Suite completa: **3045 test verdi**, `tsc --noEmit` pulito.

## Follow-up (non in questa PR)

**Riconciliazione fra registro e Δquantità.** È la guardia che rende difendibile il «registro
prima»: per un asset coperto, un'operazione che l'utente dimentica di registrare sparisce dal flusso
e gonfia il rendimento, senza che niente lo segnali. Le due fonti sono calcolabili entrambe per ogni
mese; basta confrontarle e segnalare le divergenze oltre una soglia — nella tessera Contributi o
nel Dettaglio.

Testo pronto in **`docs/ledger-reconciliation-issue.md`**, con un risultato che cambia il disegno:
la riconciliazione va fatta **in quantità sul cumulato**, non in euro mese per mese. Provata su 23
mesi di un account reale, in euro produce 9 falsi allarmi — fino a 18.388 € su un mese solo —
generati unicamente dallo sfasamento fra data d'operazione e data di rilevazione; in quantità torna
esatta a 0.0000 su tutti e 15 gli asset coperti.
