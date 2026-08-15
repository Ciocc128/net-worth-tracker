# SPEC-1 — P&L per singola operazione nel Registro movimenti

**Stato**: pronta per implementazione · **Dipendenze**: nessuna · **Pagine toccate**: Patrimonio (AssetMovementsDialog)

## Obiettivo

Nel dialog "Registro operazioni" di un asset, arricchire il P&L della singola operazione:
oggi ogni riga di **vendita** mostra già `P&L ±xx €`; vanno aggiunti **la percentuale** e il
**PMC al momento della vendita**, e il calcolo va spostato dal componente al motore del ledger
(oggi è un helper O(n²) non testato dentro il componente).

## Stato attuale (verificato)

- `components/assets/AssetMovementsDialog.tsx:54-73` — `computeRealizedByTransactionId(sortedAsc)`:
  replay di ogni prefisso `slice(0, i+1)` e delta dei cumulati → **O(n²)**, `try/catch` che maschera
  errori di replay, nessun test. Il risultato è usato alla riga `:301-305` (`P&L {formatSignedEur(realizedEur)}`, solo sell).
- `lib/utils/assetTransactionUtils.ts:198-227` — dentro `case 'sell'` di `replayTransactions` i valori
  per-vendita esistono già come locali e vengono buttati via:
  `averageCostEur` (PMC EUR all'istante della vendita, `:207`), `proceeds` (`:208`),
  `soldCostBasis` (`:209`), `realized` (`:210`).
- `LedgerPositionState` (`:109-119`) espone solo aggregati (`realizedPnlEur`, `realizedByYear`).
- Altri due consumatori dello stesso trucco delta-dei-cumulati:
  `components/assets/TransactionDialog.tsx:237-266` (`realizedPreview`) e
  `components/performance/RealizedGainsSection.tsx:30-62` (`aggregateRealizedByYear` — il commento in
  testa `:8-10` dice che sta lì solo per un vincolo di scope della Fase D, non più attivo).
- Helper di formattazione già presenti nel dialog: `formatSignedEur` / `formatSignedPct` / `signToneClass` (`:439-454`).

## Implementazione

### 1. Motore (`lib/utils/assetTransactionUtils.ts`)

Aggiungere una variante a passata singola che emette gli effetti per transazione, e ridurre
`replayTransactions` a un wrapper (UNA sola fold nel file — regola AGENTS: "ALL trade money-math lives here"):

```ts
export interface LedgerTransactionEffect {
  transactionId: string;
  /** Solo sell. Netto commissioni. */
  realizedPnlEur?: number;
  /** Solo sell: quantity × averageCostEur all'istante della vendita. Denominatore della %. */
  soldCostBasisEur?: number;
  /** Solo sell: PMC EUR all'istante della vendita (costBasisEur / quantity pre-vendita). */
  averageCostEurAtTrade?: number;
}

export function replayTransactionsWithEffects(
  transactions: AssetTransaction[]
): { state: LedgerPositionState; effects: LedgerTransactionEffect[] };
```

- `replayTransactions(txs)` diventa `replayTransactionsWithEffects(txs).state` — nessun cambiamento
  di semantica, i test esistenti devono restare verdi invariati.
- Gli effetti si popolano SOLO nel `case 'sell'`: buy, baseline e adjustment producono un effect
  senza campi valorizzati (o nessun effect — scegliere una delle due e documentarla nel JSDoc;
  preferita: un effect per ogni transazione con i campi opzionali vuoti, così il chiamante indicizza per id senza buchi).
- **Spostare `aggregateRealizedByYear` nel motore** (da `RealizedGainsSection.tsx:30-62`), con lo
  stesso contratto (`{ byYear, skippedAssets }`, raggruppamento per `assetId` PRIMA del fold —
  AGENTS: il realized è PMC-dipendente per posizione). `RealizedGainsSection` la importa dal motore.

### 2. UI (`components/assets/AssetMovementsDialog.tsx`)

- Eliminare `computeRealizedByTransactionId`; il memo `realizedById` diventa una mappa
  `Record<transactionId, LedgerTransactionEffect>` costruita da `replayTransactionsWithEffects(sortedAsc).effects`
  (dentro `try/catch` come oggi il memo `vitals`).
- Riga di **vendita** — meta line (`:298-306`), che già usa `flex-wrap`:
  - dopo `P&L {formatSignedEur(realized)}` aggiungere la percentuale:
    `formatSignedPct(realized / soldCostBasisEur * 100)`;
  - aggiungere in muted `PMC {formatCurrency(averageCostEurAtTrade)}` (etichetta breve, valuta EUR).
- Righe di **acquisto, rettifica e baseline: NESSUN P&L** (decisione presa: niente delta "vs prezzo
  attuale" sui buy — sarebbe una finzione in regime PMC; una rettifica con "0,00" leggerebbe come break-even).
- Non toccare il blocco vitals a 3 colonne (già stretto su mobile — non aggiungere una quarta cella).
- (Facoltativo, solo se il diff resta piccolo) `TransactionDialog.realizedPreview` può migrare agli
  effects; altrimenti lasciarlo e segnalarlo in SESSION_NOTES come follow-up.

### 3. Guard e gotcha (violarli = bug)

- **% = EUR su EUR**: `realizedPnlEur / soldCostBasisEur`. Mai mischiare col PMC nativo
  (`averageCost` esclude le fee e non si muove mai su una vendita, `:218`). La riga mostra già
  entrambe le basi: la riga `×` è nativa, il "Totale" è EUR.
- **Denominatore ~0**: la chiusura posizione clampa `quantity`/`costBasisEur` a 0 con
  `EPSILON = 1e-9` (`:27`, `:222-225`) — se `soldCostBasisEur <= EPSILON` omettere la %, non mostrare `∞`.
- La baseline deve restare prima nell'ordinamento o `replayTransactions` lancia `BASELINE_NOT_FIRST` —
  gli effects si calcolano sempre su `sortTransactionsForReplay`.
- Il `try/catch` del vecchio helper mascherava replay invalidi: mantenerlo attorno al memo, ma il
  fallimento deve azzerare la mappa effects, non lasciare valori parziali.

### 4. Test (`__tests__/assetTransactionUtils.test.ts` + eventuale file nuovo)

- Invariante: `Σ effects[].realizedPnlEur === state.realizedPnlEur` su una storia mista.
- Vendita parziale: effect con `realized ≈ 198` per `4·(150−100) − 2` di fee (fixture esistente `:107`).
- Vendita totale: `soldCostBasisEur` coerente col clamp EPSILON; % definita; secondo sell su riacquisto.
- Adjustment e baseline: nessun campo valorizzato.
- `aggregateRealizedByYear` spostata: portare/scrivere i test (oggi NON ne ha), incluso `skippedAssets`
  con una storia invalida e il bucketing `getItalyYear` a cavallo di Capodanno (fixture `:236-248`).
- Suite d'area da rilanciare: `assetTransactionUtils`, `assetTransactionsRoutes`, `assetTransactionWriteTx`,
  poi `npx tsc --noEmit` e `TZ=Europe/Rome npx vitest run`.

## Fuori scope

- Dividendi nel P&L per riga (vivono su Rendimenti/Dividendi).
- Qualunque modifica a scritture/API del ledger.
- P&L per-riga su Rendimenti.

---

## Prompt per l'implementazione

> Implementa la specifica `docs/specs/SPEC-1-pl-per-operazione.md`: P&L percentuale e PMC alla
> vendita sulle righe del Registro operazioni di Patrimonio, con refactor del calcolo per-transazione
> nel motore `assetTransactionUtils.ts` (`replayTransactionsWithEffects`, passata singola, wrapper
> `replayTransactions` invariato) e spostamento di `aggregateRealizedByYear` nel motore con test.
> Segui la specifica alla lettera, incluse le sezioni "Guard e gotcha" e "Test". Al termine proponi
> il collaudo guidato secondo WORKFLOW.md.
>
> Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
> - Leggi AGENTS.md (pattern, convenzioni, gotcha)
> - Leggi CLAUDE.md (stato corrente, known issues)
> - Leggi WORKFLOW.md
> - Leggi COMMENTS.md e APPLICALA mentre scrivi codice
> - Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
>
> Crea SESSION_NOTES.md per tracciare il lavoro.

**Modello consigliato**: Sonnet 5, effort **high**. Task ben perimetrato con test esistenti che
fanno da rete; la matematica delicata è già scritta nel motore, va solo esposta senza cambiarla.
