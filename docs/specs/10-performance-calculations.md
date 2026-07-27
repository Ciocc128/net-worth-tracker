# Correzioni ai Calcoli della Pagina Rendimenti — Spec (a fasi)

> Status: **SPEC — pronta per implementazione** (2026-07-27). Riferimento fedele: `lib/services/performanceService.ts`, `lib/utils/{performanceBase,drawdownSeries,performanceSummary,benchmarkPeriodReturn}.ts`, `app/dashboard/performance/page.tsx`.
>
> Audit completo del 2026-07-27: 12 finding (A1–A12). Le fasi sono implementabili e verificabili **separatamente**, in ordine di priorità. Ogni fase è un branch/PR a sé.

## Obiettivo

L'audit dei calcoli di Rendimenti ha trovato errori sistematici che distorcono TWR, ROI, CAGR, IRR, rolling e cache — in particolare sul periodo **Storico** (sempre senza baseline) e sui periodi con storico più corto della finestra. Questa spec li corregge in 5 fasi prioritarie, preservando gli invarianti già conquistati (heatmap/Underwater riconciliano; le due call site usano le stesse esclusioni di base).

## Glossario minimo

- **Baseline**: snapshot del mese *precedente* l'inizio del periodo, usato come punto di partenza (il suo mese non produce rendimento). `getSnapshotsForPeriod` prova a includerlo per YTD/1Y/3Y/5Y/CUSTOM.
- **CF**: cash flow mensile netto (risparmi/versamenti) da `getCashFlowsFromExpenses`.
- **Invariante di riconciliazione**: Heatmap, Underwater e Max Drawdown concatenano gli **stessi** rendimenti mensili (`buildTwrIndex`).

## Diagnosi — i 12 finding

### A1 — `hasBaseline` è indovinato dal tipo di periodo, non dai dati (radice di famiglia)

`performanceService.ts:890`:
```ts
const hasBaseline = ['YTD','1Y','3Y','5Y','CUSTOM'].includes(timePeriod) && sortedSnapshots.length >= 3;
```
Assume che per quei periodi il primo snapshot sia sempre pre-periodo. Falso in due casi reali:
- **YTD senza snapshot di dicembre**: il primo elemento è gennaio (dentro il periodo) ma viene trattato da baseline → il rendimento di gennaio sparisce da TWR/heatmap, `startDate` slitta a febbraio.
- **1Y/3Y/5Y con storico più corto della finestra**: il primo mese reale viene scartato come baseline → un mese di rendimento perso, `numberOfMonths` sbagliato di 1.

### A2 — Senza baseline, il CF del primo mese è contato due volte

`performanceService.ts:891-907`: quando `hasBaseline === false` (sempre per **Storico**), `startNW` è il valore di **fine** del primo mese ma i CF sono raccolti **dal 1°** di quel mese → il risparmio del primo mese è dentro `startNW` **e** viene ri-sottratto in `calculateROI` (:89) e `calculateCAGR` (:113). ROI e CAGR di Storico sistematicamente sottostimati.

### A3 — TWR: off-by-one nell'annualizzazione senza baseline

`performanceService.ts:157-193` + `:947-951`: il loop produce `n−1` rendimenti da `n` snapshot. Senza baseline vengono annualizzati su `numberOfMonths` mesi invece che su `numberOfMonths − 1` → TWR di Storico sottostimato (~2,5% relativo su 40 mesi; grave su finestre corte). Nel ramo `else` (:183-188) `calculateMonthsDifference` **inclusiva** introduce lo stesso bias.

### A4 — Rolling 12M/36M: tre incoerenze (righe 1305-1339)

1. `periodEndDate = new Date(y, m-1, 1)` (giorno 1, 00:00) + filtro `date <= endDate` in `getCashFlowsFromExpenses` (:756) → **tutte le spese/entrate dell'ultimo mese della finestra buttate** (il periodo principale usa fine mese 23:59:59 — due convenzioni nello stesso file).
2. `calculateTimeWeightedReturn(windowSnapshots, cashFlows)` senza `periodMonths` (:1328) → TWR annualizzato su `windowMonths+1`, mentre il CAGR della stessa riga usa `windowMonths` → CAGR Rolling e Sharpe Rolling su basi temporali diverse.
3. CF del primo mese della finestra incluso con `startSnapshot` già di fine mese → doppio conteggio come A2, dentro il CAGR rolling.

### A5 — IRR: timeline ancorata male + shift di un mese (righe 225-234)

- Ancora = `cashFlows[0].date` (primo mese **con movimenti**, non inizio periodo): se i primi mesi non hanno movimenti, tutti i flussi risultano anticipati rispetto a `-startNW` (t=0) e `endNW` (t=`numberOfMonths`).
- `calculateMonthsDifference` è inclusiva (+1): tutti i flussi shiftati di +1 mese.
- Entrambi sottostimano l'IRR quando si versa. Il solver Newton-Raphson (derivata corretta) non è bracketed: dopo 100 iterazioni ritorna `null` → card "—" senza spiegazione.

### A6 — Filtro ±50% solo in Volatilità (righe 325-330)

`if (Math.abs(monthlyReturn) < 50) push(...)` — heatmap (:1439) e `buildTwrIndex` (`drawdownSeries.ts:88`) non filtrano nulla → Sharpe e Max Drawdown raccontano storie diverse sullo stesso mese; un vero crollo >50% verrebbe mascherato proprio dalla metrica di rischio; magic number senza costante nominata. Inoltre `monthlyReturns.length < 2` (:333) permette stdev su 2 osservazioni.

### A7 — Annualizzazione senza guard-rail su periodi corti

`calculateTimeWeightedReturn` annualizza sempre (:192-193): +4% su 2 mesi → hero "+26% annualizzato". Il delta vs benchmark regge (benchmark annualizzato uguale, `benchmarkPeriodReturn.ts:62`); il numero assoluto no.

### A8 — ROI e CAGR: due definizioni diverse di correzione per i flussi

ROI (:89) toglie i CF dal guadagno; CAGR (:113) li aggiunge al denominatore. `CAGR ≠ (1+ROI)^(1/anni)−1`, ma le card sono affiancate come coppia coerente. La tooltip del ROI non descrive la formula.

### A9 — Cache key incompleta (righe 1141-1155)

`${snapshots.length}-${last.year}-${last.month}-${round(last.totalNetWorth)}-${baseSignature}` non include:
- **`riskFreeRate`** (:1193) → cambiare il tasso in Impostazioni lascia Sharpe/verdetto stantii fino a 6h;
- **`dividendIncomeCategoryId`** (:1194) → cambia la classificazione dividendi→netCashFlow→tutto;
- la firma copre solo l'**ultimo** snapshot → correggere uno snapshot storico non invalida nulla.
Bonus: `settings?.riskFreeRate || 2.5` mangia un legittimo 0 → serve `??`.

### A10 — Condizione di baseline divergente tra service e pagina

- service `:890`: lista periodi **+ `length >= 3`**;
- `page.tsx:633` (chart) e `:645` (underwater): stessa lista **senza** il check di lunghezza.
Con esattamente 2 snapshot le due parti leggono serie diverse (hero/drawdownStatus vs metriche). Inoltre `page.tsx:620-625` ricava `periodSnapshots` con un round-trip fragile su `getSnapshotsForPeriod` (per CUSTOM ri-sottrae un mese a una startDate già avanzata dal service — torna corretto per caso).

### A11 — "Evoluzione Patrimonio": la serie "Investimenti" non è ciò che dichiara

`performanceService.ts:1371-1389`: `returns: totalNetWorth − cumulativeContributions` dove i contributi partono da 0 a inizio periodo ma il NW include tutto il capitale preesistente → l'area "Investimenti" ≈ capitale iniziale + rendimenti, in contraddizione con la nota metodologica (`page.tsx:1539`) e la CardDescription (:1251).

### A12 — Minori

- `computeDrawdownStatus` (`performanceSummary.ts:211-217`): distanza dal picco **del periodo selezionato**, presentata come distanza dal picco senza qualificazione.
- `computeDrawdownSeries` (`drawdownSeries.ts:103`): `peak` inizializzato includendo la baseline → se la baseline è il massimo, l'Underwater parte sotto zero mentre la heatmap non mostra quel mese.
- `RealizedGainsSection.tsx:34-37`: `catch {}` silenzioso → il totale "Plusvalenze Realizzate" (dato fiscale) può essere incompleto senza segnale in UI.
- `computeReturnConsistency` con 1 solo mese → 0%/100% secchi.
- Invariante implicito "un CF per mese" replicato in 4 mappe keyed `YYYY-MM` (:149-153, :305-309, :1374-1377, `drawdownSeries.ts:52-59`).
- Commento errato in `buildIndexedSeries` (`benchmarkPeriodReturn.ts:50-54`): il primo punto non è re-indicizzato a 100.

## Decisioni fissate (do NOT relitigate)

1. **Spec completa a fasi** (decisione utente 2026-07-27): tutti i finding, in 5 fasi separate; ogni fase è un branch/PR con i suoi test.
2. **`hasBaseline` diventa data-driven** e vive in **un helper condiviso** in `lib/utils/performanceBase.ts` (stesso pattern di `resolvePerformanceBaseOptions`), consumato sia dal service sia dalla pagina. Definizione: il primo snapshot è baseline **se e solo se** il suo mese è strettamente precedente al primo mese nominale del periodo richiesto.
3. **Le esclusioni di base restano come sono** (`resolvePerformanceExclusions` — verificate coerenti tra i due call site): questa spec non tocca la base configurabile né il backfill E₀.
4. **Gli invarianti da preservare** (regressioni vietate): Underwater e Heatmap riconciliano (scarto < 1e-9); il delta vs benchmark usa la stessa annualizzazione su entrambi i lati; i numeri con baseline presente e storico lungo NON cambiano (le fasi correggono solo i rami senza baseline / rolling / IRR / cache).
5. **A7 si risolve con trasparenza, non cambiando formula**: sotto una soglia di 6 mesi l'hero mostra il rendimento **di periodo** (non annualizzato) con etichetta esplicita; da 6 mesi in su resta l'annualizzato. Nessun cambio a Sharpe (che resta annualizzato, documentato in tooltip).
6. **A8 si risolve documentando, non unificando**: le due formule restano (sono metriche diverse), ma le tooltip dichiarano entrambe le definizioni. Nessun refactor delle formule in questa spec.
7. **A11**: la serie "Investimenti" diventa `(totalNetWorth − NW iniziale del periodo) − cumulativeContributions` (= crescita del periodo attribuibile al mercato), e la nota metodologica si aggiorna di conseguenza.
8. Il filtro ±50% (A6) diventa una **costante nominata** con commento Teacher, e viene **rimosso dal calcolo** della volatilità solo se i test sui dati sintetici confermano che i falsi spike sono già neutralizzati dai CF; altrimenti resta ma applicato **uniformemente** (stessa serie filtrata per heatmap/underwater/volatilità). → chi implementa la Fase 5 decide col test, documentando la scelta.

## Fasi di implementazione

| Fase | Scope | Finding | Gate |
|---|---|---|---|
| 1 | Baseline data-driven + doppio conteggio CF + off-by-one TWR | A1, A2, A3, A10 | `performanceService` + nuovo `performanceBaseline` test verdi; invariante riconciliazione |
| 2 | Cache key completa + `??` | A9 | test cache key; cambio riskFreeRate invalida |
| 3 | Rolling 12M/36M | A4 | test rolling su dati sintetici |
| 4 | IRR | A5 | test IRR con casi noti a mano |
| 5 | Coerenza/minori | A6, A7, A8, A11, A12 | suite complete + verifica visiva |

### Fase 1 (correctness-critical)

- Nuovo helper in `lib/utils/performanceBase.ts`:
  ```ts
  /** True when the first snapshot precedes the nominal period start (i.e. it is a baseline month). */
  export function resolveHasBaseline(
    snapshots: Pick<MonthlySnapshot, 'year' | 'month'>[],
    nominalPeriodStart: { year: number; month: number }
  ): boolean
  ```
  Il service calcola l'inizio nominale del periodo (già noto a `getSnapshotsForPeriod`) e lo passa; la pagina (`page.tsx:633/645`) usa **lo stesso helper** con gli stessi input (esporre l'inizio nominale nel payload `metrics` se serve).
- `performanceService.ts:890-907`: sostituire l'euristica; quando non c'è baseline, i CF partono dal **mese successivo** al primo snapshot (elimina A2) e l'annualizzazione TWR usa `numberOfMonths − 1` sotto-periodi (elimina A3; passare sempre `periodMonths` esplicito a `calculateTimeWeightedReturn` e correggere il ramo `else` inclusivo).
- `page.tsx:620-650`: eliminare il round-trip fragile su `getSnapshotsForPeriod` per CUSTOM (usare direttamente il set/le date che il service espone).
- Test nuovi (`__tests__/performanceBaseline.test.ts` + estensioni a `performanceService.test.ts`): YTD con e senza snapshot dicembre; 3Y con 14 mesi di storico; ALL; CUSTOM; verifica che con baseline presente i numeri NON cambino rispetto a prima del fix (snapshot dei valori attesi correnti nei casi sani).

### Fase 2

- `buildCacheKey` (:1141-1155): aggiungere `riskFreeRate`, `dividendIncomeCategoryId` e una firma dell'intera serie (es. hash/somma di `round(totalNetWorth)` di tutti gli snapshot, non solo l'ultimo). `|| 2.5` → `?? 2.5` (:1193). Aggiornare il commento (mente: dice che la firma copre gli update, copre solo l'ultimo).
- DEVELOPMENT_GUIDELINES → Caching: dichiarare nel commento cosa invalida la cache e cosa succede se si serve stale.

### Fase 3

- `:1305-1339`: `periodEndDate` a fine mese 23:59:59 (stessa convenzione del periodo principale — estrarre una helper `endOfMonthBound(year, month)` in `dateHelpers.ts` se non esiste già); `periodMonths: windowMonths` esplicito al TWR; CF della finestra dal mese successivo allo `startSnapshot`.
- Test: finestra sintetica con spesa nell'ultimo mese → deve entrare; TWR e CAGR rolling con gli stessi mesi.

### Fase 4

- `:225-234`: ancora della timeline = inizio periodo (t=0 = `startDate` del calcolo, dove sta `-startNW`); differenza mesi **non** inclusiva per i flussi; ultimo flusso `endNW` a t=`numberOfMonths`. Valutare bisection fallback se Newton non converge (altrimenti `null` resta, ma la card spiega "non calcolabile su questo periodo").
- Test: casi a soluzione nota (es. un solo versamento a metà periodo, IRR verificato a mano/foglio di calcolo).

### Fase 5

- A6: costante nominata + uniformità (decisione 8) + `monthlyReturns.length < 2` → richiedere ≥ 3 osservazioni per volatilità/Sharpe (sotto: mostrare "—" con tooltip).
- A7: etichetta hero "Rendimento del periodo" sotto i 6 mesi (decisione 5) — toccare `performanceSummary.ts`/`PerformanceHero`.
- A8: tooltip ROI con formula; nota che CAGR usa denominatore corretto per i flussi.
- A11: serie "Investimenti" = crescita di periodo − contributi (decisione 7) + nota metodologica.
- A12: qualificare la copy del drawdown ("dal massimo del periodo"); `computeDrawdownSeries` non usa la baseline come peak iniziale (partire dal primo mese di rendimento); `RealizedGainsSection` — sostituire `catch {}` con un contatore di asset falliti mostrato in UI ("N asset esclusi dal totale"); correggere il commento di `buildIndexedSeries`.

## Impatti sul resto dell'app

- **I numeri cambieranno** per: Storico (TWR/ROI/CAGR su, di poco), YTD di utenti senza snapshot dicembre, rolling, IRR. Da dichiarare nel commit/CLAUDE.md: non è una regressione, è la correzione (analogo al precedente del Max Drawdown fantasma).
- `performance-cache` va invalidata di fatto dalla nuova cache key (Fase 2) — le fasi 1/3/4 cambiano i numeri ma la vecchia chiave potrebbe servirli stantii fino a 6h: accettato, o bump esplicito di versione nella chiave (`v2-...`) in Fase 1 per tagliare la testa al toro (raccomandato).
- Le email periodiche e l'Assistente leggono metriche derivate dalla stessa pipeline: nessun cambio di interfaccia, solo valori più corretti.
- `pensionReturn.ts` e `benchmarkPeriodReturn.ts` non cambiano (il TWR del fondo pensione ha la sua finestra; il benchmark è già coerente col delta).

## Test (trasversale)

- Ogni fase: `npx tsc --noEmit` + `npx vitest run __tests__/{performanceService,performanceBase,drawdownSeries,performanceSummary}.test.ts` (+ nuove suite) + `npm run build`.
- Invariante di riconciliazione (heatmap vs underwater) come test automatico se non già presente.
- Verifica manuale su dati reali dopo Fase 1: confrontare TWR/MaxDD Storico prima/dopo e spiegare la differenza attesa (un mese di rendimento in più, CF primo mese non doppio).

## Prompt di implementazione

> *Fasi 1-2: Opus 5, effort alto* (engine correctness-critical, convenzione repo: Opus per i motori di calcolo). *Fasi 3-5: Sonnet 5, effort alto.* Una fase per sessione; mai due fasi nello stesso branch.

```text
Implementa la FASE <N> della spec "Correzioni ai Calcoli della Pagina Rendimenti".

Leggi PRIMA di scrivere codice:
- docs/specs/10-performance-calculations.md (INTEGRALE — Decisioni fissate e Invarianti non si rilitigano; implementa SOLO la fase indicata)
- AGENTS.md → sezioni Performance Base & Drawdown, History and Snapshot Baselines (TWR neutralization), gotcha delle tre whitelist Settings (se la fase tocca settings)
- CLAUDE.md (Current Status: fix Max Drawdown fantasma 2026-07-27b — non regredirlo), COMMENTS.md (APPLICALA), DEVELOPMENT_GUIDELINES.md (APPLICALA)

Scope ESATTO: i file elencati nella sezione "Fase <N>" della spec. Nessun altro.
Invarianti da preservare (test PRIMA di chiudere): Underwater e Heatmap riconciliano (<1e-9); con baseline presente e storico lungo i numeri NON cambiano (fasi 1,3,4); delta vs benchmark coerente.

Gate: npx tsc --noEmit + npx vitest run (performanceService, performanceBase, drawdownSeries, performanceSummary + suite nuove) + npm run build.
Al termine FERMATI: aggiorna SESSION_NOTES.md, riassumi COSA hai fatto, QUALI numeri cambiano e perché, COME verificarlo a mano sui dati reali, ATTENDI conferma prima della fase successiva.
Branch: fix/performance-calculations-phase-<N>. Conventional Commits.
```
