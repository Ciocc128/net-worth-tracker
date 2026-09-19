# ATE — Piano di accumulo (PAC) dalla liquidità

> **Per chi implementa (agente).** Questo documento è la specifica tecnica vincolante della feature
> "Accumulo". Le decisioni funzionali sono **chiuse**: non riaprirle, non proporre alternative, non
> aggiungere funzionalità non scritte qui. Dove questo documento e il codice sembrano in contrasto,
> fermati e chiedi al proprietario (regola 5 di WORKFLOW.md), non improvvisare.
>
> Base di codice analizzata: commit `f6c834d` (15/09/2026). Se `main` è avanzato, verifica che i
> simboli citati esistano ancora con la stessa firma prima di usarli.
>
> Lingua: conversazione in italiano; codice, identificatori e commenti in inglese; testo UI in
> italiano (AGENTS.md).

---

## 0. Letture obbligatorie prima di scrivere codice

Leggi, nell'ordine, e rispetta:

1. `WORKFLOW.md` §1 (regole di sessione): nessun commit senza OK esplicito, un branch e **un solo
   commit** per sessione, domande con lo strumento interattivo.
2. `AGENTS.md` §3 stub di: *Allocazione*, *Dialog*, *Registro operazioni*, *Settings — the FIVE
   places* (qui non si toccano le Impostazioni, ma serve per non romperle).
3. `doc/guide/allocazione.md` per intero: in particolare *Allocation — the two plans and the leverage
   engine*, la regola sui target EFFETTIVI (mai i target grezzi di Impostazioni) e la regola
   `PlanView`.
4. `doc/guide/dialog.md` (Two-Step Create Dialogs, Dialog Form Reset, status line).
5. `doc/guide/registro-operazioni.md` (ledger, guardia 409 di `commitTradeMutation`).
6. `DESIGN.md`: The Tile Rule, Tile Grid, In-tile Bars, The Comma Rule, The One-Eyebrow Rule, Modal
   widths, Budget Track.

---

## 1. Decisioni funzionali vincolanti (dall'AFU, revisione 18/09/2026)

| # | Decisione |
| --- | --- |
| D1 | Feature autonoma: tile **Accumulo** nella pagina Allocazione, separato dal tile Piano. Non entra in `PlanMode`, `PlanView`, `buildPlanView`, né nel verdetto della pagina (`summarizeNextMoney`), né modifica la banda. |
| D2 | Target del piano **per strumento**, indipendente dai target di Impostazioni, inserito a mano (in futuro anche importato dall'ottimizzatore: vedi `doc/weight-optimizer-ate.md`). |
| D3 | La liquidità è sempre `excluded`: B = (valore delle posizioni del piano) + L. |
| D4 | L = max(0, Σ conti sorgente − riserva) + Σ ricavi stimati vendite fuori piano + E × N. E = entrata mensile ricorrente stimata (≥ 0). Riserva = importo fisso in €. La riserva non si tocca mai. |
| D5 | Strumenti in portafoglio lasciati fuori dal piano: venduti al **mese 1**; il ricavo entra in L ed è ripartito sulle N rate. Posizioni del piano sovrappesate: **mai vendute**. |
| D6 | Gruppi proxy: più asset, un solo peso; un solo membro designato (`buyAssetId`) riceve gli acquisti; gli altri membri non ricevono acquisti e non si vendono. |
| D7 | Nuovo strumento = asset reale con quantità 0, creato dall'`AssetDialog` in una nuova modalità "vuota". |
| D8 | Calendario **S1** (quota costante per posizione) salvato all'attivazione; ogni mese si propone una ricalibrazione **S3** che l'utente accetta o ignora. |
| D9 | Solo **quote intere**, arrotondate per difetto; il resto passa alla rata successiva della stessa posizione. Nessuna quota frazionata. |
| D10 | Tracciamento: il sistema propone gli abbinamenti con il ledger, l'utente conferma, corregge o segna a mano. |
| D11 | Traiettoria delle classi mese per mese contro i target **effettivi** della pagina e la banda attiva della pagina. Per i mesi chiusi si salva **la misura** (nozionale € per classe + base di mercato + data), lo scostamento si ricalcola a ogni lettura contro i target correnti. |
| D12 | Al massimo un piano in `draft` o `active` per account. |

Fuori perimetro (non implementare): vendite di posizioni del piano, commissioni, invio ordini al
broker, previsioni di prezzo, fiscalità, modifiche ai motori Versa/Ribilancia/Preleva, spec
Playwright.

---

## 2. Correzioni rispetto alla specifica precedente (valgono queste)

1. **La banda non è in Impostazioni.** È stato di pagina: `const [band, setBand] = useState<RebalanceBand>(DEFAULT_REBALANCE_BAND)` in `app/dashboard/allocation/page.tsx`. Il tile Accumulo la riceve come prop.
2. **I target da usare sono quelli effettivi della pagina** (`targets` in `page.tsx`, che include i target derivati dagli Obiettivi), non `settings.targets`.
3. **`compareAllocations` vive in `lib/services/assetAllocationService.ts`**, che importa Firebase. Il modulo puro del PAC **non la importa**: la riceve per iniezione (parametro `compare`). La pagina passa la funzione reale.
4. **`expandAssetExposure` importa `calculateAssetValue` da un service Firebase.** Il modulo puro del PAC calcola l'esposizione per euro direttamente da `composition` e `leverageRatio` (§5.2), senza importare `assetExposureUtils`.
5. **`calculateAssetValue` si inietta** (`valueOf`), come fa `buildHoldings`. Il prezzo unitario in EUR si legge con `unitPriceEur` da `lib/utils/costBasisEur.ts` (modulo puro, importabile).

---

## 3. Mappa dei file

### Nuovi

| File | Contenuto |
| --- | --- |
| `types/accumulationPlan.ts` | tipi §4 |
| `lib/utils/accumulationPlanUtils.ts` | motore puro §5 |
| `lib/utils/accumulationPlanSchema.ts` | schema zod e validazione §6 |
| `lib/utils/accumulationPlanMatching.ts` | abbinamento ledger §9 |
| `lib/utils/accumulationNarrative.ts` | tutte le parole del tile e dei dialog §10.5 |
| `lib/services/accumulationPlanService.ts` | CRUD Firestore client SDK §7 |
| `lib/hooks/useAccumulationPlan.ts` | React Query §7.4 |
| `components/allocation/tiles/AccumuloTile.tsx` | tile §10.2 |
| `components/allocation/AccumulationPlanDialog.tsx` | editor a 3 passi §10.3 |
| `components/allocation/AccumulationCalendarDialog.tsx` | modale Calendario §10.4 |
| `components/allocation/AccumulationRecalibrateDialog.tsx` | modale Ricalibra §10.4 |
| `components/allocation/ClassDriftChart.tsx` | grafico SVG scostamenti §10.6 |
| `doc/guide/accumulo.md` | guida d'area §12 |
| `__tests__/accumulationPlanUtils.test.ts` | §11 |
| `__tests__/accumulationPlanSchema.test.ts` | §11 |
| `__tests__/accumulationPlanMatching.test.ts` | §11 |
| `__tests__/accumulationClassTrajectory.test.ts` | §11 |
| `__tests__/accumulationNarrative.test.ts` | §11 |

### Modificati

| File | Modifica |
| --- | --- |
| `firestore.rules` | regola `accumulationPlans` §7.3 |
| `lib/query/queryKeys.ts` | chiave `accumulationPlans` §7.4 |
| `components/assets/AssetDialog.tsx` | prop `createEmpty`, `onCreated` §8 |
| `app/dashboard/allocation/page.tsx` | monta il tile §10.1 |
| `AGENTS.md` §3 | stub "Allocazione — Accumulo" che rimanda a `doc/guide/accumulo.md` |
| `CLAUDE.md` | riga in Key Features e Key Files |
| `DESIGN.md` § Tile Grid | griglia di Allocazione aggiornata |
| `doc/guide/allocazione.md` | una riga: il tile Accumulo esiste e vive in `accumulo.md` |

Non toccare: `leverageAwareAllocationUtils.ts`, `allocazioneSummary.ts`, `allocazioneNarrative.ts`
(salvo import di label già esportate), `PianoTile.tsx`, `BilanciamentoTile.tsx`, `assetAllocationService.ts`.

---

## 4. Tipi — `types/accumulationPlan.ts`

Copia esattamente (i commenti in inglese fanno parte della specifica):

```ts
import type { AssetClass } from './assets';

export type AccumulationPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type InstallmentLineStatus = 'planned' | 'executed' | 'skipped';

/** 'YYYY-MM' in Italy time. */
export type MonthKey = string;

/** One target weight: a single instrument, or a proxy group sharing one weight. */
export interface PlanPosition {
  id: string;               // stable inside the plan (crypto.randomUUID())
  label: string;            // defaults to the buy asset's name
  targetPercentage: number; // % of the plan base B; Σ over positions === 100 (±0.01)
  memberAssetIds: string[]; // length 1 = single instrument, ≥ 2 = proxy group
  buyAssetId: string;       // ∈ memberAssetIds; the ONLY member that receives buys
}

/** A held tradable instrument left out of the plan: sold in month 1, proceeds into L. */
export interface PlanDisposal {
  assetId: string;
  estimatedProceedsEur: number; // market value when the plan is activated
  status: InstallmentLineStatus;
  transactionIds?: string[];    // ledger `sell` ids linked on confirmation
  executedAmountEur?: number;
}

export interface PlanLiquidity {
  sourceCashAssetIds: string[]; // assets with assetClass === 'cash' (any allocationRole)
  reserveEur: number;           // ≥ 0, never touched
  monthlyInflowEur: number;     // E ≥ 0, recurring every month
}

export interface InstallmentLine {
  positionId: string;
  assetId: string;              // always the position's buyAssetId
  plannedQuantity: number;      // integer ≥ 0
  priceEurAtPlan: number;       // unit price in EUR used for the plan
  plannedAmountEur: number;     // plannedQuantity × priceEurAtPlan (NOT the raw share)
  status: InstallmentLineStatus;
  transactionIds?: string[];
  executedQuantity?: number;
  executedAmountEur?: number;   // Σ quantity × priceEur of linked buys, fees excluded
}

/** What Allocazione measured when an installment was closed (D11). */
export interface ClassMeasurement {
  measuredAt: Date;
  classNotionalEur: Partial<Record<AssetClass, number>>; // notional € per class (tradable + frozen base)
  marketBaseEur: number;                                  // AllocationResult.marketValue
}

export interface Installment {
  index: number;                // 1..N
  month: MonthKey;
  lines: InstallmentLine[];
  carryInEur: Record<string, number>; // positionId → carry entering this month (planning trace)
  confirmedAt?: Date;           // set when every line is executed or skipped
  measurement?: ClassMeasurement;
}

export interface PlanBaseline {
  capturedAt: Date;
  positionValuesEur: Record<string, number>; // positionId → market value at activation
  sourceCashEur: number;
  pricesEur: Record<string, number>;         // assetId → unit EUR price at activation
  measurement: ClassMeasurement;             // month 0 of the trajectory
}

export interface AccumulationPlan {
  id: string;
  userId: string;               // ownerId (shared-account convention)
  name: string;
  status: AccumulationPlanStatus;
  startMonth: MonthKey;
  months: number;               // N, integer 1..60
  liquidity: PlanLiquidity;
  positions: PlanPosition[];
  disposals: PlanDisposal[];
  baseline?: PlanBaseline;      // present from 'active'
  installments: Installment[];  // empty in 'draft', the S1 calendar from 'active'
  residualEur?: number;         // planned leftover after the last month (< one share)
  createdAt: Date;
  updatedAt: Date;
  activatedAt?: Date;
  closedAt?: Date;
}

/** Draft input edited by the dialog (no system fields). */
export type AccumulationPlanDraft = Pick<
  AccumulationPlan,
  'name' | 'startMonth' | 'months' | 'liquidity' | 'positions' | 'disposals'
>;
```

Le date in Firestore sono `Timestamp`; il service converte con `toDate` di `lib/utils/dateHelpers.ts`
in lettura e scrive `Date` (il client SDK le serializza). Ogni scrittura passa da `removeUndefinedDeep`
(`lib/utils/firestoreData.ts`).

---

## 5. Motore puro — `lib/utils/accumulationPlanUtils.ts`

### 5.0 Regole del modulo

- Import consentiti: tipi da `@/types/*`, `splitTowardTarget` e `resolveAllocationRole` da
  `./allocationUtils`, `unitPriceEur` da `./costBasisEur`, `getItalyMonthYear` da `./dateHelpers`.
  **Vietato** importare da `@/lib/services/*`, `@/lib/firebase/*`, `./assetExposureUtils`,
  `./leverageAwareAllocationUtils`.
- Nessun `Date.now()` dentro le funzioni: la data corrente arriva come parametro `today: Date`.
- Arrotondamenti monetari: mai arrotondare durante il calcolo; si arrotonda solo in UI.
- Dipendenze iniettate:

```ts
export interface PlanDeps {
  valueOf: (asset: Asset) => number;    // calculateAssetValue
  priceOf: (asset: Asset) => number;    // unitPriceEur
}
```

### 5.1 Helper di mese

```ts
export function toMonthKey(date: Date): MonthKey;          // getItalyMonthYear → 'YYYY-MM'
export function addMonths(month: MonthKey, n: number): MonthKey; // n may be 0; handles year rollover
export function monthIndexOf(plan: Pick<AccumulationPlan, 'startMonth' | 'months'>, month: MonthKey): number;
// 1..N inside the plan, 0 before startMonth, N+1 after the last month
```

### 5.2 Esposizione per euro (senza service)

```ts
/** Notional € per €1 of market value, per asset class — mirrors expandAssetExposure's rule. */
export function exposurePerEuro(asset: Asset): Partial<Record<AssetClass, number>>;
```

- `leverage = asset.leverageRatio ?? 1`.
- Senza `composition` (o vuota): `{ [asset.assetClass]: leverage }`.
- Con `composition`: per ogni componente `acc[c.assetClass] += (c.percentage / 100) * leverage`.
- Test di coerenza obbligatorio: per un asset con valore > 0, `exposurePerEuro(a)[c] * valueOf(a)`
  deve coincidere con la somma dei `notionalValue` di `expandAssetExposure(a)` per classe c
  (il test può importare `expandAssetExposure` mockando Firebase come `__tests__/compareAllocations.test.ts`).

### 5.3 `resolvePositionStates`

```ts
export interface PositionState {
  positionId: string;
  label: string;
  targetPercentage: number;
  currentValueEur: number;   // Σ valueOf(member) over memberAssetIds
  buyAssetId: string;
  buyPriceEur: number;       // priceOf(buy asset)
  unpriced: boolean;         // buyPriceEur <= 0 or buy asset missing
}

export function resolvePositionStates(
  positions: PlanPosition[],
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): PositionState[];
```

Un membro mancante in `assetsById` vale 0 e non lancia eccezioni; se manca il `buyAssetId`,
`unpriced: true`.

### 5.4 `computeUsableLiquidity`

```ts
export interface UsableLiquidity {
  sourceCashEur: number;        // Σ valueOf(source cash assets)
  availableNowEur: number;      // max(0, sourceCashEur − reserveEur)
  disposalProceedsEur: number;  // Σ estimatedProceedsEur of disposals not yet executed/skipped
  inflowTotalEur: number;       // monthlyInflowEur × monthsRemaining
  L0: number;                   // availableNowEur + disposalProceedsEur
  L: number;                    // L0 + inflowTotalEur
  belowReserve: boolean;        // sourceCashEur < reserveEur
}

export function computeUsableLiquidity(
  liquidity: PlanLiquidity,
  assetsById: Map<string, Asset>,
  disposals: PlanDisposal[],
  monthsRemaining: number,
  deps: PlanDeps
): UsableLiquidity;
```

### 5.5 `computeTotalPurchases` (Passo 1)

```ts
export function computeTotalPurchases(states: PositionState[], L: number): Record<string, number>;
```

- `items = states.filter(s => !s.unpriced).map(s => ({ key: s.positionId, currentValue: s.currentValueEur, targetPercentage: s.targetPercentage }))`.
- `B = Σ currentValueEur (tutte le posizioni, anche unpriced) + L`.
- Ritorna `splitTowardTarget(items, L, B)`; le posizioni `unpriced` hanno 0.
- Nota: se esistono posizioni `unpriced`, Σ risultato resta L (le priced assorbono tutto): è voluto,
  la UI lo segnala (§10.5).

### 5.6 `scheduleInstallments` (S1, D8, D9)

```ts
export interface ScheduleResult {
  installments: Installment[];
  residualEur: number;
}

export function scheduleInstallments(
  totals: Record<string, number>,   // positionId → € (from computeTotalPurchases)
  states: PositionState[],
  months: number,
  startMonth: MonthKey
): ScheduleResult;
```

Algoritmo (deterministico, nessuna variante):

```
carry[p] = 0 for every position
for m in 1..N:
  lines = []
  for s in states (in the order given):
    if s.unpriced: continue
    budget = totals[s.positionId] / N + carry[s.positionId]
    q = floor(budget / s.buyPriceEur + 1e-9)
    spend = q * s.buyPriceEur
    carryIn = carry[s.positionId]
    carry[s.positionId] = budget - spend
    if q > 0: lines.push({ positionId, assetId: s.buyAssetId, plannedQuantity: q,
                           priceEurAtPlan: s.buyPriceEur, plannedAmountEur: spend, status: 'planned' })
  if m == N:  // closing sweep
    pool = Σ carry
    remainingDeficit[p] = totals[p] - Σ plannedAmountEur of p over all months
    loop:
      candidates = priced positions with remainingDeficit > 0 and buyPriceEur <= pool
      if none: break
      pick the one with the largest remainingDeficit (tie: lowest buyPriceEur, then positionId)
      add 1 share to its line in month N (create the line if absent)
      pool -= price; remainingDeficit[p] -= price
    residualEur = pool
  installments.push({ index: m, month: addMonths(startMonth, m - 1), lines, carryInEur })
```

Invarianti (tutte testate, §11): quantità intere ≥ 0; spesa cumulata al mese m ≤ m × (Σ totals / N)
+ 1e-6 (tranne il mese N, dove il limite è Σ totals); spesa totale + residualEur = Σ totals (±1e-6);
nessuna riga su un asset diverso da `buyAssetId`.

### 5.7 `recalibrateInstallment` (S3)

```ts
export interface RecalibrationLine {
  positionId: string;
  assetId: string;
  plannedQuantity: number;     // from the saved calendar (0 if no line)
  suggestedQuantity: number;
  priceEur: number;            // current priceOf(buy asset)
  suggestedAmountEur: number;
}

export interface RecalibrationResult {
  index: number;
  lines: RecalibrationLine[];
  plannedTotalEur: number;
  suggestedTotalEur: number;
  liquidity: UsableLiquidity;  // computed with monthsRemaining = N − index + 1 (the open installment counts)
}

export function recalibrateInstallment(
  plan: AccumulationPlan,
  index: number,               // the open installment
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): RecalibrationResult;
```

- `liq = computeUsableLiquidity(plan.liquidity, assetsById, plan.disposals, N − index + 1, deps)`
  (corretto 2026-09-19 — vedi la nota sotto: questa specifica scriveva `N − index`, il codice ha
  sempre usato `N − index + 1`); qui `sourceCashEur` è il valore **reale** di oggi dei conti.
- `states = resolvePositionStates(plan.positions, assetsById, deps)` con valori reali.
- `totals = computeTotalPurchases(states, liq.L)`.
- Per ogni posizione: `budget = totals[p] / (N − index + 1)`; `suggestedQuantity = floor(budget / price + 1e-9)`.
- Vincolo di cassa: se `Σ suggestedAmount > liq.availableNowEur + disposalProceedsEur non ancora
  incassati` allora riduci proporzionalmente (scala i budget per il rapporto e ricalcola i floor).
  Questo realizza "entrate non arrivate → rata ridotta, riserva intatta".
- La funzione **non** modifica il piano; `applyRecalibration` del service scrive le righe accettate.

**Nota (PR #4, rilievo 4, decisione del proprietario 2026-09-19)**: questa specifica scriveva
`monthsRemaining = N − index`, ma `recalibrateInstallment` ha sempre diviso per `N − index + 1`
(coerente da riga 317 a riga 331 del codice) — la rata APERTA (`index`) conta tra i mesi restanti,
perché si sta ricalibrando ORA, con quella rata ancora da eseguire. Il proprietario ha scelto di
allineare questa specifica al codice piuttosto che il contrario: il comportamento a runtime non
cambia.

### 5.8 `projectPlanOutcome`

```ts
export interface PositionOutcome {
  positionId: string;
  label: string;
  targetPercentage: number;
  finalValueEur: number;
  finalWeightPct: number;      // finalValueEur / Σ finalValueEur × 100
  driftPp: number;             // finalWeightPct − targetPercentage
}

export interface PlanOutcome {
  positions: PositionOutcome[];
  maxAbsDriftPp: number;
  maxDriftPositionId: string | null;
  residualEur: number;
  implicitClassPct: Partial<Record<AssetClass, number>>; // notional / final market total × 100
  leverageRatio: number;                                  // Σ notional / Σ market
}

export function projectPlanOutcome(
  states: PositionState[],
  installments: Installment[],
  residualEur: number,
  assetsById: Map<string, Asset>,
  positions: PlanPosition[],
  deps: PlanDeps
): PlanOutcome;
```

Valore finale di una posizione = `currentValueEur + Σ plannedAmountEur` delle sue righe (prezzi
costanti). Esposizione implicita: per ogni membro, `valoreFinaleMembro × exposurePerEuro(membro)`
(il valore finale del `buyAssetId` include gli acquisti).

### 5.9 `projectClassTrajectory` (D11)

```ts
export type AllocationCompare = (assets: Asset[], targets: AssetAllocationTarget | null) => AllocationResult;

export interface ClassTrajectoryPoint {
  index: number;                 // 0..N
  month: MonthKey | 'baseline';
  source: 'measured' | 'projected';
  measuredAt?: Date;
  byClass: Partial<Record<AssetClass, {
    currentPct: number;          // notional % on the market base, as Allocazione shows it
    targetPct: number;           // EFFECTIVE target % (from AllocationResult.byAssetClass)
    driftPp: number;             // currentPct − targetPct
    outOfBand: boolean;          // |driftPp| > bandForTarget(band, targetPct)
  }>>;
}

export function projectClassTrajectory(input: {
  plan: AccumulationPlan;                       // active or draft preview
  allAssets: Asset[];                           // the page's full asset list
  installments: Installment[];                  // plan.installments, or the draft preview schedule
  targets: AssetAllocationTarget;               // the page's EFFECTIVE targets
  band: RebalanceBand;                          // the page's current band
  compare: AllocationCompare;                   // compareAllocations, injected
  currentIndex: number;                         // 0 for a draft; the open installment for active
}): ClassTrajectoryPoint[];
```

Algoritmo (revisione 2026-09-19, dopo il collaudo della PR #4 — i due punti seguenti erano un
rilievo bloccante, chiuso in questa stessa sessione):

- **Punti misurati** (`index < currentIndex` con `measurement`, più `baseline.measurement` per
  l'indice 0 di un piano attivo): da `measurement.classNotionalEur` e `marketBaseEur` si ricava
  `currentPct = notional / marketBase × 100`. Il target effettivo per classe si ricalcola con
  `resolveTargetPct(assetClass, targets, marketBaseEur)` **usando la base di mercato DI QUEL
  PUNTO** — mai una base risolta una volta sola all'inizio della funzione: `compareAllocations`
  scala il target di OGNI classe (non solo cash) quando il target cash è a importo fisso
  (`assetAllocationService.ts`, `toLegacyAllocationResult`, righe ~838-864 — il target grezzo di
  ogni classe non-cash è moltiplicato per `(marketBase − fixedAmount) / marketBase`), quindi un
  punto con una base di mercato diversa da quella con cui il target fu risolto la prima volta
  legge un target sbagliato. `resolveTargetPct` legge la % grezza direttamente da `targets`, mai
  da un `compare()` precedente, e applica la stessa formula: per `cash` con `useFixedAmount`,
  `fixedAmount / marketBaseEur × 100`; per ogni altra classe, la % grezza scalata per
  `(marketBaseEur − fixedAmount) / marketBaseEur` (1 se cash non è a importo fisso).
  `driftPp = currentPct − targetPct`.
- **Punto corrente e punti proiettati** (`index ≥ currentIndex`): `buildProjectedAssets` clona gli
  asset (`{ ...asset }`), aggiunge per ogni riga non eseguita dei mesi fino a index la
  `plannedQuantity` alla `quantity` del `buyAssetId` (le righe già eseguite sono già nelle
  quantità reali), e dal mese 1 in poi azzera la `quantity` degli asset delle vendite non
  eseguite. **La cassa del piano si muove di conseguenza**, invece di restare ferma mentre il lato
  acquisti fa crescere la base di mercato dal nulla: `cassa(m) = cassa₀ − Σ acquisti pianificati
  (righe non eseguite) fino a m + E × m + Σ ricavi delle vendite non eseguite (dal mese 1)`,
  ripartita pro quota sui saldi LIVE di `plan.liquidity.sourceCashAssetIds` (mai sui ruoli
  `allocationRole` dell'utente, che restano intoccati: un conto sorgente `excluded` viene comunque
  scartato dalla base di mercato di `compare()`, quindi spostarne il saldo proiettato è un no-op
  per la traiettoria — verificato). Poi chiama `compare(clones, targets)` e legge
  `byAssetClass[c].targetPercentage` DIRETTAMENTE dal risultato di QUESTA chiamata (mai da un
  target risolto altrove): il punto proiettato e la sua base di mercato nascono dalla stessa
  chiamata a `compare()`, quindi non possono più disallinearsi.
- `outOfBand` usa `bandForTarget(band, targetPct)` di `./allocationUtils` (già esportata). Nessuna
  modifica a `allocationUtils.ts`.
- Invariante testata: con `currentIndex = 0` il punto 0 coincide con `compare(allAssets, targets)`.
- **Tre decisioni sul modello di cassa** (owner, PR #4, rilievo 2 — non riaprire):
  1. I ruoli `allocationRole` dell'utente non si toccano mai; la proiezione muove solo il saldo,
     mai la classificazione tradable/excluded/frozen di un conto.
  2. L'entrata mensile stimata `E` entra nella proiezione mese per mese (`E × m`), non tutta in
     blocco all'ultimo mese.
  3. Il prelievo (o il deposito) quando i conti sorgente sono più di uno è **pro quota sui saldi
     LIVE** di quel punto, mai un ordine fisso o un unico conto "principale".

### 5.10 `buildClassMeasurement`

```ts
export function buildClassMeasurement(result: AllocationResult, measuredAt: Date): ClassMeasurement;
// classNotionalEur[c] = result.byAssetClass[c].currentValue ; marketBaseEur = result.marketValue
```

Usata dal service all'attivazione (baseline) e alla chiusura di ogni rata.

### 5.11 `buildDraftPreview`

Comodità per l'anteprima dell'editor, compone 5.3–5.9 senza scrivere nulla:

```ts
export function buildDraftPreview(input: {
  draft: AccumulationPlanDraft;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  compare: AllocationCompare;
  deps: PlanDeps;
}): {
  liquidity: UsableLiquidity;
  totals: Record<string, number>;
  schedule: ScheduleResult;
  outcome: PlanOutcome;
  trajectory: ClassTrajectoryPoint[];
  unpricedPositionIds: string[];
};
```

Per il draft, `estimatedProceedsEur` delle vendite si calcola al volo con `valueOf`.

---

## 6. Validazione — `lib/utils/accumulationPlanSchema.ts`

`zod` (già dipendenza). Esporta `accumulationPlanDraftSchema` e
`validateDraftAgainstAssets(draft, assetsById): DraftIssue[]` con `DraftIssue = { code, message, assetId?, positionId? }`.
Codici e regole:

| code | Regola |
| --- | --- |
| `weights_sum` | \|Σ targetPercentage − 100\| > 0.01 |
| `weight_negative` | un peso < 0 |
| `duplicate_asset` | un asset compare in due posizioni, o in una posizione e in una vendita |
| `buy_not_member` | `buyAssetId ∉ memberAssetIds` |
| `position_not_tradable` | un membro o una vendita non ha `resolveAllocationRole === 'tradable'` |
| `source_not_cash` | un conto sorgente non ha `assetClass === 'cash'` |
| `unassigned_tradable` | un asset **non cash** e tradable con valore > 0 non è né in una posizione né in una vendita |
| `months_range` | `months` non intero o fuori 1..60 |
| `negative_amount` | `reserveEur` o `monthlyInflowEur` < 0 |
| `no_positions` | nessuna posizione |

`message` in italiano, prodotto da `accumulationNarrative.ts` (non scrivere stringhe nello schema).

**Due correzioni (PR #4 review, rilievi 6-7, chiuse 2026-09-19)**:
- `unassigned_tradable` esenta sempre un asset con `assetClass === 'cash'`: `resolveAllocationRole`
  legge `tradable` per un conto corrente per default, e senza l'esenzione il validatore lo
  **pretendeva** classificato benché `AccumulationPlanDialog.tsx` (seeder del passo 2 e
  `candidateAssets`) non lo offra mai come riga — lo stesso `assetClass !== 'cash'` vale sui tre
  lati (seeder, candidati, validatore).
- Il predicato di valore è **lo stesso su tutti e tre i lati**: `calculateAssetValue(asset) > 0`
  nel seeder/candidati (import Firebase, ok in un componente), `quantity * unitPriceEur(asset) > 0`
  nello schema (questo modulo resta Firebase-free — vedi §5.0). Prima usava `asset.quantity <= 0`,
  un predicato DIVERSO da quello degli altri due lati: un asset con quantità tracciata ma prezzo
  mai recuperato (Known Issue FX su istanza fredda) era preteso dal validatore e non offerto da
  nessuna riga — vicolo cieco, «Avanti» permanentemente disabilitato.

---

## 7. Persistenza

### 7.1 Collezione

`accumulationPlans/{planId}`; campo `userId` = ownerId. Documento unico con tutto il piano.

### 7.2 Service — `lib/services/accumulationPlanService.ts`

Modello: `lib/services/pensionContributionService.ts` (client SDK, `db` da `@/lib/firebase/config`,
query per sola uguaglianza su `userId`, ordinamento in memoria). Funzioni:

| Funzione | Comportamento |
| --- | --- |
| `getAccumulationPlans(ownerId)` | tutti i piani, ordinati per `createdAt` desc |
| `createDraftPlan(ownerId, draft)` | valida lo schema; rifiuta con `userFacingError` se esiste già un piano `draft`/`active`; scrive `status: 'draft'`, `installments: []` |
| `updateDraftPlan(planId, draft)` | solo se `status === 'draft'` (verifica in `runTransaction`) |
| `activatePlan(planId, input)` | `input = { allAssets, targets, compare, deps, today }`; in `runTransaction`: rilegge il piano, verifica `draft`, calcola `estimatedProceedsEur`, stati, liquidità (monthsRemaining = N), totali, calendario, `baseline` (con `buildClassMeasurement(compare(allAssets, targets), today)`), scrive `status: 'active'`, `activatedAt` |
| `setInstallmentLine(planId, index, positionId, patch)` | patch = `{ status, transactionIds?, executedQuantity?, executedAmountEur? }`; se dopo la patch tutte le righe della rata sono `executed`/`skipped`, imposta `confirmedAt` e `measurement` (serve `measurementInput` = `{ allAssets, targets, compare, today }` passato dal chiamante) |
| `setDisposal(planId, assetId, patch)` | analoga per le vendite |
| `applyRecalibration(planId, index, lines)` | sostituisce le righe `planned` della rata con le suggerite (le righe già `executed` restano) |
| `closePlan(planId, status)` | `'completed' \| 'cancelled'`, scrive `closedAt` |
| `deleteDraftPlan(planId)` | solo `draft` |

Tutte le scritture: `updatedAt = new Date()`, `removeUndefinedDeep`. Gli errori per l'utente si lanciano
con `userFacingError(message)` di `lib/utils/dialogNarrative.ts` (AGENTS.md, stub Dialog).

### 7.3 Regola Firestore

In `firestore.rules`, subito dopo il blocco `pensionContributions`, un blocco identico nella forma:

```
    // Collezione accumulationPlans - piani di accumulo (PAC) del tile Accumulo
    // Scritta dal client SDK: un documento per piano, nessun replay multi-doc.
    match /accumulationPlans/{planId} {
      allow read: if canAccess(resource.data.userId);
      allow create: if canAccess(request.resource.data.userId);
      allow update: if canAccess(resource.data.userId) &&
                       (!('userId' in request.resource.data) ||
                        request.resource.data.userId == resource.data.userId);
      allow delete: if canAccess(resource.data.userId);
    }
```

Nessun indice in `firestore.indexes.json`. **Il deploy delle regole non avviene con Vercel**: scrivilo
esplicitamente nel riepilogo finale della sessione.

### 7.4 Query key e hook

In `lib/query/queryKeys.ts`:

```ts
  accumulationPlans: {
    all: (userId: string) => ['accumulation-plans', userId] as const,
  },
```

`lib/hooks/useAccumulationPlan.ts`: `useAccumulationPlans(ownerId)` (useQuery, `enabled: !!ownerId`),
più una mutation per ogni funzione del service che invalida solo `queryKeys.accumulationPlans.all(ownerId)`.
Selettore di comodo: `selectOpenPlan(plans)` = il piano `draft` o `active`, se c'è.

---

## 8. `AssetDialog` — creazione vuota (D7)

File: `components/assets/AssetDialog.tsx`. Oggi la creazione di un asset "ledger" (`ledgerCreateFlow`)
rifiuta quantità ≤ 0 e registra subito il primo `buy`.

Aggiungi a `AssetDialogProps`:

```ts
  /** Create the asset at quantity 0 with no opening trade (Accumulo → Nuovo asset). */
  createEmpty?: boolean;
  /** Called with the new asset id after a successful create. */
  onCreated?: (assetId: string) => void;
```

Comportamento con `createEmpty === true`:

- Passo 2: nascondi quantità, data d'apertura, prezzo d'acquisto, conto di addebito; mostra al loro
  posto il blocco `bg-muted`: "Nessuna quantità né acquisto d'apertura: l'asset nasce a 0 quote e la
  posizione si apre col primo acquisto registrato nel Registro operazioni."
- Submit: `createAsset(ownerId, { ...formData, quantity: 0 })` **senza** chiamare il flusso del primo
  trade; nessun `averageCost` iniziale. Poi `onCreated?.(newId)`, invalidazione di
  `queryKeys.assets.all(ownerId)` come negli altri rami, chiusura.
- Primario: "Crea e aggiungi al piano".
- Nessuna differenza quando `createEmpty` è assente: tutti i flussi esistenti restano identici.
- Il prezzo corrente si recupera al passo 1 come oggi; se manca, il PAC lo segnala (`unpriced`).

Verifica manuale da riportare al proprietario: dopo la creazione vuota, il primo `buy` dal Registro
deve passare (la guardia 409 di `commitTradeMutation` scatta solo con quantità tracciata ≠ 0).

---

## 9. Abbinamento ledger — `lib/utils/accumulationPlanMatching.ts` (D10)

```ts
export type MatchConfidence = 'high' | 'medium';

export interface LineMatch {
  kind: 'installment' | 'disposal';
  index?: number;              // installment index
  positionId?: string;
  assetId: string;
  transactionIds: string[];
  quantity: number;            // Σ quantity
  amountEur: number;           // Σ quantity × priceEur
  confidence: MatchConfidence;
}

export type LineUiState = 'todo' | 'toConfirm' | 'executed' | 'late' | 'skipped' | 'lostLink';

export function matchPlanExecutions(
  plan: AccumulationPlan,
  transactions: AssetTransaction[],   // from useAssetTransactions(ownerId)
  today: Date,
  transactionsLoading?: boolean       // default false — see rule 5's caveat below
): {
  matches: LineMatch[];
  lineStates: Record<string, LineUiState>; // key `${index}:${positionId}` or `disposal:${assetId}`
};
```

Regole:

1. Candidati rata: `type === 'buy'`, `!isBaseline`, stesso `assetId` della riga, `toMonthKey(date)`
   uguale al mese della rata. `high` se `linkedCashAssetId ∈ sourceCashAssetIds`, `medium` se assente.
   Un `linkedCashAssetId` presente ma diverso dai conti sorgente **non** è candidato.
2. Candidati vendita: `type === 'sell'`, stesso `assetId`, `date ≥ activatedAt`.
3. Un id già presente in `transactionIds` di qualunque riga del piano non è più candidato.
4. Più candidati per la stessa riga si sommano in un solo `LineMatch`.
5. Stati: `executed` se `status === 'executed'` **e** (`transactionsLoading` **oppure** tutti i
   `transactionIds` esistono); `lostLink` se `executed`, `!transactionsLoading` e almeno un id
   inesistente; `skipped` se `skipped`; `toConfirm` se `planned` con match; `late` se `planned`,
   senza match, e mese < mese corrente; altrimenti `todo`. **Correzione (PR #4 review, rilievo 5,
   chiusa 2026-09-19)**: finché `useAssetTransactions` è in volo, `transactions` arriva `[]` —
   indistinguibile da un ledger genuinamente vuoto — e OGNI riga `executed` con `transactionIds`
   leggeva `lostLink` per un frame, con il bottone «Rivedi» a caso. Il chiamante (`AccumuloTile.tsx`)
   passa `transactionsQuery.isLoading`.

---

## 10. UI

### 10.1 Montaggio nella pagina

In `app/dashboard/allocation/page.tsx`, dentro la griglia, **dopo** la cella di `PianoTile` e **prima**
di quella di `PerClasseTile`:

```tsx
<div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
  <AccumuloTile
    ownerId={ownerId}
    allAssets={allAssets}
    targets={targets}
    band={band}
    onAssetsChanged={() => void loadData()}
  />
</div>
```

Rinumera `order-*` delle celle successive (+1). Il tile legge piani e transazioni con i suoi hook;
la pagina non carica nulla in più. `targets` può essere `null` finché la pagina carica: in quel caso
il tile mostra lo stato di caricamento.

### 10.2 `AccumuloTile`

Usa `Tile` di `components/ui/tile.tsx` (`eyebrow`, `aside`, `reading`, `children`). Stati con
`resolveSurfaceState` (`lib/utils/statesNarrative.ts`).

| Stato | Condizione | Contenuto |
| --- | --- | --- |
| loading | query in corso | skeleton come gli altri tile |
| failed | query in errore | lettura `describeAccumulationReadFailure()` + "Riprova" |
| none | nessun piano aperto | una riga di lettura + primario "Crea piano" |
| draft | piano `draft` | lettura bozza, 4 riquadri (Liquidità oggi, Vendite fuori piano, Entrate stimate, Posizioni), azioni Elimina bozza · Modifica · Attiva piano |
| active | piano `active` | vedi sotto |
| done | `active`, mese corrente > ultimo mese e tutte le righe chiuse | lettura conclusiva, 3 riquadri (Eseguite, Liquidità residua, Scostamento medio), azioni Calendario · Chiudi piano |

Contenuto `active`:

1. Lettura `describeAccumulationActive(...)`.
2. Avviso (superficie warning, come negli altri tile) se `belowReserve` o se la ricalibrazione riduce
   la rata: `describeReserveWarning(...)`.
3. Barra dei mesi: N segmenti alti 3px (riusa lo stile della Budget Track se esiste un componente;
   altrimenti `div` flex con gap 3px): chiuso = `bg-foreground`, corrente = `bg-muted-foreground/60`,
   futuro = `bg-muted`, mese con righe `late` = `bg-destructive`. Sotto: "ott 2026 · 2 di 12 rate chiuse · set 2027".
4. Righe della rata corrente: strumento (nome + ticker), quote (mono), importo (mono, Comma Rule),
   chip di stato, azioni. Per le righe `late` dei mesi precedenti mostrale sopra quelle del mese.
   Azioni per stato: toConfirm → Conferma · Ignora; executed → Scollega; late → Segna eseguita a mano · Salta;
   lostLink → Rivedi (apre il Calendario sulla rata).
5. Striscia classi (D11): per ogni classe con target, "Azioni · target 102% — +3,4 pp → +1,3 pp",
   in colore warning se fuori banda oggi, e "rientra in banda a giugno" se applicabile.
   Dati da `projectClassTrajectory` (punto corrente e punto N).
6. Footer: "A fine piano: scostamento massimo +0,8 pp su CL2 · liquidità residua 214 €" + azioni
   Ricalibra rata · Calendario · Interrompi (Interrompi usa `useArmedDelete`, doppio clic, niente timer).

Azioni di scrittura disabilitate con `useDemoMode()`.

"Conferma" chiama `setInstallmentLine` con `status: 'executed'` e i dati del match; "Segna eseguita a
mano" apre un piccolo form (quantità, importo €) e scrive senza `transactionIds`. Dopo ogni conferma
la rata può chiudersi: passa `measurementInput` al service.

### 10.3 `AccumulationPlanDialog` (editor)

`ResponsiveModal` con `width="xl"`, eyebrow "Piano di accumulo · Passo N di 3", titolo e lettura
per passo, footer con Indietro/Avanti/Salva bozza/Attiva. Ogni "Avanti" salva la bozza
(`createDraftPlan` al primo salvataggio, poi `updateDraftPlan`). Reset del form secondo Dialog Form Reset.

**Passo 1 — Liquidità.** Titolo "Da dove arriva la liquidità".
- Conti sorgente: checkbox per ogni asset con `assetClass === 'cash'` (qualunque ruolo), con valore.
- Campi: Riserva da non toccare (€), Entrata mensile stimata (€), Durata (mesi, 1..60), Prima rata
  (select dei prossimi 12 mesi a partire dal mese corrente, default il mese successivo).
- Riquadro a destra (mobile: sotto): L grande in mono, con le righe Conti sorgente, − Riserva,
  + Vendite fuori piano (dal passo 2), + Entrate stimate (E × N), Rata mensile (L₀/N + E).

**Passo 2 — Target.** Titolo "Dove deve arrivare il portafoglio".
- Una riga per ogni asset `tradable` con valore > 0, **mai un conto `cash`** (PR #4 review, rilievo
  6, chiuso 2026-09-19: `resolveAllocationRole` legge `tradable` per un conto corrente per
  default, quindi senza l'esclusione un conto sorgente del passo 1 finiva anche fra le righe del
  passo 2 a peso 0% — e, se scelto come sorgente, il suo valore entrava due volte in B: una in
  `currentValueEur`, una in L), più gli asset creati a 0 quote in questa sessione.
  Colonne: strumento, peso oggi (% sul totale delle righe), interruttore "Nel piano / Da vendere",
  campo target %.
- "Raggruppa come proxy": selezione multipla di righe → una posizione; chiede lo strumento d'acquisto
  (radio tra i membri); le righe membro si indentano, il target sta sulla riga del gruppo. "Separa"
  scioglie il gruppo.
- "+ Nuovo asset": apre `AssetDialog` con `createEmpty` e `onCreated` → aggiunge una posizione.
- Totale in fondo: se ≠ 100 il totale è in `text-destructive`, la status line dice
  "Mancano 3,00 punti per arrivare al 100%" (o "Hai 2,00 punti in più") e Avanti è disabilitato.
- Tutti gli errori di `validateDraftAgainstAssets` si mostrano come status line (uno alla volta, il primo).
- Nota footer: "Peso di mercato, non esposizione: la leva si vede al passo 3".

**Passo 3 — Anteprima.** Titolo "Anteprima del piano". Dati da `buildDraftPreview`.
- Calendario in quote intere: tabella mesi × posizioni (scroll orizzontale nel proprio contenitore),
  colonna Totale €. Mesi intermedi comprimibili se N > 8 (mostra i primi 5, "…", l'ultimo).
- Pesi a fine piano: barra 3px per posizione con marcatore del target, finale %, target %, scarto pp.
- Esposizione implicita per classe (barra segmentata con colori `ASSET_CLASS_CHART_INDEX`) e leva.
- Classi mese per mese: `ClassDriftChart` + tabella ai mesi 0, 1, 3, 6, 9, N (pp colorati warning se
  fuori banda).
- Avviso se L < Σ deficit, se ci sono posizioni `unpriced`, o se una posizione è sopra target.
- Primari: Salva bozza · Attiva piano. "Attiva" chiama `activatePlan` e chiude.

### 10.4 Modali secondari

- `AccumulationCalendarDialog` (`width="lg"`): `ClassDriftChart` con linea piena per i punti
  `measured` e tratteggiata per i `projected`, linea verticale "oggi"; sotto una riga per rata:
  mese, totale €, pp per classe dopo la rata (grigi se previsti), chip di stato; toccando una rata si
  espandono le sue righe con le azioni di §10.2 punto 4. Per i mesi misurati mostra "misurato il 10/01".
- `AccumulationRecalibrateDialog` (`width="md"`): tabella strumento · pianificata (quote · €) ·
  suggerita · Δ quote; totale "3868,10 € → 3849,10 €"; Ignora · Applica (`applyRecalibration`).

### 10.5 Narrativa — `lib/utils/accumulationNarrative.ts`

Nessuna stringa nei componenti. Formattazione con `formatCurrency`/`formatPercentageIt` di
`lib/utils/formatters.ts` (Comma Rule: importi a 4 cifre non raggruppati, "1853,60 €"). Funzioni
minime e testo di riferimento (adatta la punteggiatura, non il contenuto):

| Funzione | Esempio |
| --- | --- |
| `describeAccumulationNone(sourceCashEur)` | "Nessun piano di accumulo. Nei conti di liquidità ci sono 38.500 €: un piano li ripartisce in rate mensili verso i pesi che scegli, senza vendere ciò che tieni." |
| `describeAccumulationDraft(preview)` | "Bozza: 47.050 € in 12 rate da ottobre 2026, 3920,83 € al mese. Non è ancora attivo: nessuna rata viene proposta finché non lo attivi." |
| `describeAccumulationActive(...)` | "Dicembre: 3868,10 € in 5 acquisti, 1 già eseguito e 2 da confermare. Sei in linea col calendario: +0,3 pp dal previsto sul peso più lontano." |
| `describeReserveWarning(...)` | "Liquidità nei conti sorgente 18.900 € contro 10.000 € di riserva: la riserva non si tocca, quindi la rata di gennaio è ridotta a 2100,00 €." |
| `describeAccumulationDone(...)` | "Piano concluso: 12 rate su 12, 46.836 € investiti su 47.050 €. Il peso più lontano dal target è CL2, a +0,6 pp." |
| `describeClassStripItem(...)` | "+3,4 pp → +1,3 pp", nota "rientra in banda a giugno" |
| `describeAccumulationReadFailure()` | "Non riesco a leggere il piano di accumulo. Gli altri numeri della pagina non dipendono da questo." |
| `describeDraftIssue(issue)` | un messaggio per ogni `code` di §6 |
| `describeWeightsTotal(sum)` | "Mancano 3,00 punti per arrivare al 100%" / "Hai 2,00 punti in più" |
| `describeRecalibration(result)` | "NTSG è salito più del previsto: la rata sposta 2 quote verso VWCE. Il totale cambia di −19,00 €." |

Mesi in italiano minuscolo abbreviato nelle etichette ("ott 2026"), per esteso nelle letture
("dicembre"). Segno meno tipografico "−".

### 10.6 `ClassDriftChart`

SVG scritto a mano (niente librerie), `role="img"` con `aria-label` descrittivo. Props:
`points: ClassTrajectoryPoint[]`, `band: RebalanceBand`, `height?: number`. Asse x mesi 0..N, asse y
pp; fascia ombreggiata ±banda attorno a 0 (per `rule525` usa la banda del target più piccolo tra le
classi mostrate e scrivilo nell'etichetta); una polilinea per classe con il colore
`ASSET_CLASS_CHART_INDEX` → token `--chart-N`; tratto pieno per `measured`, `stroke-dasharray` per
`projected`; etichetta finale "Azioni +1,3". Colori solo via CSS variables del tema.

---

## 11. Test (Vitest, cartella `__tests__/`)

Fixture comuni in testa al file: asset VWCE (azioni, 132,40 €), SWDA (azioni, proxy), NTSG
(composizione 60 azioni / 40 obbligazioni, `leverageRatio` 1.5, 42,10 €), CL2 (azioni, leva 2,
520 €), AVWS (18,20 €), CRRY (carry, 145,00 €), EIMI (0 quote, 38,90 €), XDEM (da vendere), due conti
cash. Usa `valueOf = a => a.quantity * unitPriceEur(a)` e `priceOf = unitPriceEur`.

`accumulationPlanUtils.test.ts`:
- `exposurePerEuro`: single, composite, leva; coerenza con `expandAssetExposure` (mock Firebase).
- `computeUsableLiquidity`: riserva maggiore della cassa → `availableNowEur = 0`, `belowReserve`;
  vendite eseguite escluse; E × monthsRemaining.
- `computeTotalPurchases`: Σ = L; L < Σ deficit (proporzionale); posizione sopra target riceve 0 nella
  fase deficit; gruppo proxy valutato come somma; `unpriced` riceve 0; L = 0 → tutto 0.
- `scheduleInstallments`: quote intere; riporto che sblocca CRRY (145 €) in mesi alterni con quota
  mensile 110 €; prezzo superiore al totale della posizione → nessuna riga e l'importo finisce nel
  sweep o nel residuo; chiusura del mese N; spesa cumulata ≤ limite a ogni mese; spesa + residuo = Σ;
  N = 1.
- `recalibrateInstallment`: dopo una rata eseguita con quantità diversa; entrata non arrivata → rata
  ridotta e riserva intatta.
- `projectPlanOutcome`: pesi finali, max drift, leva implicita con NTSG e CL2.

`accumulationClassTrajectory.test.ts` (mock di `@/lib/firebase/config` e `firebase/firestore` come in
`compareAllocations.test.ts`, poi `compare = compareAllocations` reale):
- punto 0 = `compareAllocations(allAssets, targets)` per ogni classe;
- vendita al mese 1 esce dalla classe; righe eseguite non contate due volte;
- target cash `useFixedAmount` non altera le altre classi;
- punti misurati: stesso risultato se i target non cambiano, drift diverso se cambiano (D11);
- `outOfBand` con banda fissa 2 e con `rule525`.

`accumulationPlanSchema.test.ts`: un test per ogni `code` di §6.

`accumulationPlanMatching.test.ts`: high/medium; conto collegato estraneo ignorato; due `buy` nello
stesso mese sommati; id già collegato escluso; `lostLink`; `late`; confine di mese in ora italiana
(un `buy` alle 23:30 del 31 in UTC+1 appartiene al mese italiano corretto).

`accumulationNarrative.test.ts`: una lettura per ogni stato del tile; Comma Rule sugli importi;
`describeWeightsTotal` sopra e sotto 100.

---

## 12. Documentazione

- `doc/guide/accumulo.md`: "Quando aprire questa guida", modello dati, le 12 decisioni D1–D12 in
  forma di regole, le correzioni di §2 (perché `compare` è iniettato, perché la banda arriva dalla
  pagina), il deploy delle regole Firestore, i limiti noti (asset a 0 quote visibili in Patrimonio;
  `frozen` fuori dalla base del piano).
- `AGENTS.md` §3: stub di 3–4 righe "Allocazione — Accumulo → `doc/guide/accumulo.md`".
- `CLAUDE.md`: una riga in Key Features, i nuovi file in Key Files.
- `DESIGN.md` § Tile Grid: "Allocazione: Bilanciamento 5 · Piano 7 / Accumulo 12 / Per classe 6 ·
  Esposizione 6 / Previdenza 12".

---

## 13. Piano delle sessioni (un branch e un commit per sessione)

Ogni sessione parte dal branch della precedente (regola 2 di WORKFLOW.md: verifica il branch attivo).
Alla fine di ogni sessione: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`npm test` tutti verdi; riepilogo del diff in italiano; **chiedi l'OK prima del commit**.

| Sessione | Branch | Contenuto | Criterio di fine |
| --- | --- | --- | --- |
| S1 | `feat/pac-engine` | §4, §5, §6, test di §11 tranne matching e narrativa | test verdi, nessun import vietato (§5.0) |
| S2 | `feat/pac-persistence` | §7 (service, regole, query key, hook) | `tsc` verde; regola scritta; nota sul deploy |
| S3 | `feat/pac-empty-asset` | §8 | flussi esistenti invariati (rileggi il diff di `AssetDialog`), nuovo ramo testato a mano su anteprima |
| S4 | `feat/pac-ui` | §10 + `accumulationNarrative` e i suoi test | build Next verde (`npm run build` se le variabili lo consentono), tile visibile su anteprima Vercel |
| S5 | `feat/pac-tracking-docs` | §9 + test, stati di conferma nel tile, §12 | test verdi, guide scritte |

Dopo S5 una sola PR verso `main` (o una per sessione, se il proprietario preferisce: chiedilo con lo
strumento interattivo all'inizio di S1).

### Verifica guidata su anteprima Vercel (dopo S4 e dopo S5)

Il collaudo guidato di WORKFLOW.md §2 va adattato: dalla sessione cloud non c'è Firebase. Prepara un
elenco di fasi, **una per messaggio**, con l'esito atteso scritto **prima**, che il proprietario esegue
sull'anteprima dal telefono: crea bozza → passo 2 con totale ≠ 100 (Avanti bloccato) → nuovo asset a
0 quote → anteprima → attiva → registra un `buy` dal Registro → il tile lo propone → conferma →
traiettoria aggiornata. Prima della prima fase ricorda al proprietario di deployare la regola
Firestore di §7.3 (console Firebase → Firestore → Regole → incolla → Pubblica).
