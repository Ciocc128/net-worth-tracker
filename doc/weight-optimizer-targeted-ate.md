# ATE — Ottimizzatore, terza modalità «Con vendite mirate»

> **Per chi implementa (agente).** Specifica tecnica vincolante. Le decisioni funzionali sono chiuse
> (§1): non riaprirle, non aggiungere funzionalità. In caso di contrasto col codice, fermati e chiedi
> con lo strumento interattivo (WORKFLOW.md regola 5).
>
> **Prerequisito:** l'ottimizzatore di `doc/weight-optimizer-ate.md` (O1–O9) e lo strumento a sé
> `IdealCompositionDialog` (doc/guide/ottimizzatore.md). Base analizzata: commit `a9c6ca6`.
>
> Lingua: conversazione in italiano; codice, identificatori e commenti in inglese; UI in italiano.

---

## 0. Letture obbligatorie

1. `WORKFLOW.md` §1.
2. `doc/weight-optimizer-ate.md` per intero, in particolare §5.5 (limiti), §6.3–6.5 (solver,
   euristica 2%, arrotondamento), §6.7 (conflitti), §9.4 (snapshot).
3. `doc/guide/ottimizzatore.md` (i due punti d'ingresso, i limiti noti).
4. `lib/utils/costBasisEur.ts` (il costo fiscale per quota: UNA regola) e `lib/utils/withdrawalTax.ts`
   (`DEFAULT_CAPITAL_GAINS_RATE`, la stessa quota di plusvalenza × aliquota).
5. `DESIGN.md`: The Comma Rule, The Modal-Is-A-Tile Rule.

---

## 1. Decisioni funzionali vincolanti

Prese dal proprietario il 2026-09-27, dopo un caso reale: portafoglio da circa 111.000 €, 15.000 € da
versare, la posizione più grande (NTSG, +6.694 € di plusvalenza) da non vendere, qualche posizione
piccola da poter vendere pagando poche tasse. «Ideale» vende tutto ciò che è in eccesso (circa 876 € di
tasse), «Raggiungibile col PAC» non vende nulla: serviva il mezzo.

| # | Decisione |
| --- | --- |
| T1 | Una terza modalità, **«Con vendite mirate»**, tra Ideale e Raggiungibile col PAC. Ordine nel selettore: Ideale · Con vendite mirate · Raggiungibile col PAC. |
| T2 | Il vincolo sulle vendite si esprime in due modi, insieme: un **tetto di tasse in euro** («al massimo 500 € di tasse») e un interruttore **«Non vendere»** per strumento. |
| T3 | Il motore sceglie cosa vendere per avvicinarsi agli obiettivi restando sotto il tetto: vende prima ciò che costa meno di fisco per punto di obiettivo guadagnato. |
| T4 | Solo nello strumento a sé **Composizione ideale** (`IdealCompositionDialog`). Il PAC (`OptimizerPanel`) non la offre: il PAC non vende. |
| T5 | Il risultato mostra, oltre ai pesi, le **tasse stimate per riga** (sulle righe in vendita) e un **totale** («Vendi X €, paghi circa Y € di tasse»). |
| T6 | I casi limite coincidono con le altre due modalità: tetto abbastanza alto → gli stessi pesi di Ideale; tetto 0 e nessuna posizione in perdita → gli stessi pesi di Raggiungibile. |

Fuori perimetro: minusvalenze e zainetto fiscale (una vendita in perdita costa 0 € di tasse, nient'altro),
tetto sul venduto in euro, tasse come priorità, persistenza degli interruttori «Non vendere» in
Impostazioni, commissioni del broker, il PAC.

---

## 2. Mappa dei file

### Modificati

| File | Cosa |
| --- | --- |
| `lib/utils/weightOptimizer.ts` | `OptimizerMode` + `'targeted'`; `OptimizerCandidate.taxPerEuroSold`; `OptimizerInput.sale`; limiti (§4); solver a variabili separate + bisezione (§5); arrotondamento (§6); euristica 2% (§7); tasse nel risultato (§8). |
| `lib/utils/weightOptimizerNarrative.ts` | Etichetta e descrizione della modalità, le stringhe della colonna e del totale (§9.3). |
| `components/allocation/IdealCompositionDialog.tsx` | Terza opzione, campo tetto, colonna «Non vendere» e colonna «Tasse», riga del totale (§9). |
| `components/allocation/OptimizerPanel.tsx` | Nessuna modifica di comportamento: le sue `MODE_OPTIONS` restano due (T4). Verifica che compili col tipo allargato. |
| `types/accumulationPlan.ts` | Snapshot: `taxCapEur?` e `lockedKeys?` (§10). |
| `doc/guide/ottimizzatore.md` | La terza modalità, la formulazione, i limiti noti. |
| `CLAUDE.md` | Riga «Solo fork» dell'Ottimizzatore, Current Status. |

### Nuovi

| File | Cosa |
| --- | --- |
| `__tests__/weightOptimizerTargeted.test.ts` | §11.1. |

Nessuna route, nessun dato persistito nuovo oltre ai due campi opzionali dello snapshot.

---

## 3. Tassa per euro venduto

Per ogni candidato, calcolata in `buildOptimizerCandidates` dal buy asset (nello strumento a sé il
candidato è sempre un solo strumento):

```
basis   = costBasisPerUnitEur(asset)          // costo fiscale, commissioni incluse
price   = unitPriceEur(asset)
rate    = asset.taxRate ?? DEFAULT_CAPITAL_GAINS_RATE   // 26, o 12,5 sui titoli di Stato
taxPerEuroSold = basis === undefined || price <= 0
  ? null
  : (rate / 100) × max(0, 1 − basis / price)
```

- Una posizione in perdita ha `taxPerEuroSold = 0`: venderla non costa tasse (T3 la vende per prima
  se serve agli obiettivi).
- **`null` = costo fiscale sconosciuto** (strumento estero senza `averageCostEur`): in modalità
  `targeted` il candidato è **non vendibile** (§4). La tassa non stimabile non si presume mai zero.
- Le altre due modalità ignorano il campo.

Verifica sul caso reale (PMC dall'app): EIMI 0,0802 €/€, NTSG 0,0353, CL2 0,0345, DEGC 0,0300,
EXUS 0,0135, XDEM 0,0100, ALLW 0,0045, AVWS 0 (in perdita).

---

## 4. Limiti per candidato in modalità `targeted`

Si aggiunge una riga alla tabella di `weight-optimizer-ate.md` §5.5:

| Caso | lowerPct | upperPct |
| --- | --- | --- |
| modalità `targeted`, candidato in `lockedKeys` o con `taxPerEuroSold === null` | `max(lower, currentValueEur / baseEur × 100)` | invariato |
| modalità `targeted`, altrimenti | come `ideal` | invariato |

I limiti di Impostazioni (`instrumentLimits`) e il `frozen` di `buildStandaloneCandidates` restano
come sono. `lockedKeys` arriva nell'input (§5.1); `resolveCandidateBounds` riceve il set.

Riferimento della regolarizzazione (`computeWRef`): in `targeted` come in `reachable`, cioè il peso
corrente su `baseEur`, normalizzato.

---

## 5. Il motore

### 5.1 Input

```ts
export type OptimizerMode = 'reachable' | 'ideal' | 'targeted';

export interface OptimizerCandidate {
  // …campi esistenti…
  taxPerEuroSold: number | null; // §3
}

export interface OptimizerInput {
  // …campi esistenti…
  /** Solo con mode 'targeted'; ignorato altrimenti. */
  sale?: { taxCapEur: number; lockedKeys: string[] };
}
```

`runOptimizer` e `buildOptimizerCandidates` inoltrano `sale`. `mode === 'targeted'` senza `sale` =
tetto 0, nessun blocco.

### 5.2 Formulazione

> **Decisione del proprietario, 2026-09-27 (revisione del solver, prima dell'implementazione).** La
> formulazione qui sotto resta il riferimento matematico, ma il **solver** implementato non è la discesa
> proiettata sulle 2n variabili: è un **active set esatto** (`lib/utils/activeSetQP.ts`) su `J(w) + μ·tassa(w)`,
> con `μ` in J per euro di tassa e la regula falsi di Illinois al posto della bisezione; dove il tetto non
> lega, o è 0, girano le pipeline di Ideale e di Raggiungibile così come sono. Misure sul fixture di A.2
> (mediana di 3, caso peggiore su 21 scenari): prototipo 525 ms; questo §5 alla lettera (warm start, 1 €)
> 373 ms; con `μ` in euro 18 ms; con Illinois 14 ms; active set **0,2 ms**, esatto. Dettagli, degenerazione
> trovata e controllo incrociato: `doc/guide/ottimizzatore.md` § «Con vendite mirate» — il tetto di tasse.
> Seconda decisione dello stesso giorno, fuori da T1–T6: se i limiti di Impostazioni obbligano a vendere, la
> tassa minima inevitabile diventa il tetto (`OptimizerSaleReport.minTaxEur`) e la riga del totale lo dice.

Con `cur_i = currentValueEur_i / B` e `c_i = taxPerEuroSold_i` (0 dove `null`, tanto il candidato è
bloccato), il problema è:

```
min  J(w)                                   // la stessa di §3 della ATE: righe × λ + ε·‖w − wRef‖²
s.t. Σ w_i = 1,  lo_i ≤ w_i ≤ hi_i
     B · Σ c_i · max(0, cur_i − w_i) ≤ taxCapEur
```

Il vincolo fiscale è convesso ma accoppia i candidati e non è un box: la proiezione esistente non lo
gestisce. Si risolve così:

**Variabili separate.** `w_i = cur_i + b_i − s_i` con `b_i ≥ 0` (acquisto) e `s_i ≥ 0` (vendita).
Con `z = [b; −s]` (2n componenti) i vincoli diventano **un solo budget-box**:

```
Σ z = 1 − Σ cur_i
b_i ∈ [max(0, lo_i − cur_i),  max(0, hi_i − cur_i)]
−s_i ∈ [−max(0, cur_i − lo_i),  −max(0, cur_i − hi_i)]
```

quindi `projectOntoBudgetBox(z, zlo, zhi, 1 − Σcur)` si riusa senza toccarla. `projectOntoBudgetBox`
accetta già un `budget` qualsiasi; `solveQP` va generalizzato a ricevere il `budget` (oggi fisso a 1)
senza cambiare il comportamento delle altre modalità.

**Lagrangiano sul tetto.** Per un moltiplicatore `μ ≥ 0` si minimizza

```
J_μ(z) = J(cur + b − s) + μ · Σ c_i s_i
∇_b J_μ = ∇_w J          ∇_(−s) J_μ = ∇_w J − μ · c
```

che è liscia e convessa: lo stesso `solveQP` a discesa proiettata. La tassa `tax(μ)` della soluzione
è non crescente in `μ`:

```
w = solve(μ = 0)
if tax(w) ≤ taxCapEur: done                   // il tetto non serve: pesi di Ideale (con i blocchi)
μ_hi = 1; while tax(solve(μ_hi)) > taxCapEur: μ_hi *= 4   (al massimo 30 volte)
bisezione su [0, μ_hi] finché μ_hi − μ_lo ≤ 1e-6 · μ_hi oppure tax(solve(μ_hi)) ≥ taxCapEur − 1 €
risultato = solve(μ_hi)                        // sempre ammissibile
```

Ogni `solve` parte dalla soluzione del `μ` precedente (warm start). Misurato sul prototipo (12
candidati, senza warm start): 0,8–1,2 s per calcolo, contro i 3 ms di Ideale. Con il warm start e la
tolleranza di 1 € l'obiettivo è **sotto i 300 ms**; se non ci si arriva, il calcolo va in un
`useDeferredValue` e il dialog mostra `OPTIMIZER_LOADING_PROFILES`-style «Calcolo in corso» invece di
bloccare l'input.

Con `taxCapEur = 0` il vincolo è `Σ c_i s_i = 0`: si vende solo ciò che è in perdita (`c_i = 0`), T6.

### 5.3 Casi limite (T6) — verificati sul prototipo con i dati reali

| Tetto | Esito |
| --- | --- |
| ≥ tassa dell'Ideale (876 € nel caso reale) | pesi identici a Ideale, `μ = 0` |
| 0 € | pesi identici a Raggiungibile col PAC (a parte l'arrotondamento, §6) |
| 494 €, NTSG ed EXUS bloccati | il «piano B»: vende EIMI, DEGC, ALLW |
| 494 €, solo NTSG bloccato | vende EXUS, DEGC, ALLW e 4.100 € di EIMI su 5.400 (EXUS costa 1,3 cent per euro, EIMI 8) |

---

## 6. Arrotondamento

L'arrotondamento a 0,5 punti di §6.5 della ATE **non si applica così com'è**: un peso tenuto (39,08%)
non sta sulla griglia, e arrotondarlo a 39,0 inventa una vendita (sul prototipo: −100 € di NTSG e
−259 € di EXUS a tetto 0, tassa arrotondata 7 € oltre il tetto di 0). In `targeted`:

- un candidato con `|w_i − cur_i| < 1e-6` (**tenuto**) resta a `cur_i` esatto, fuori griglia;
- un candidato **in vendita** (`w_i < cur_i`) si arrotonda **verso `cur_i`** (in su): vende meno,
  quindi la tassa arrotondata non supera mai quella calcolata;
- i candidati **in acquisto** si arrotondano coi resti maggiori sul residuo `100 − Σ(tenuti) −
  Σ(venduti arrotondati)`, senza scendere sotto `cur_i` (un acquisto arrotondato non diventa una
  vendita).

`proposedPct` dei tenuti è quindi un numero con decimali; il dialog lo stampa a una cifra come oggi.
**Invariante testato:** `tax(arrotondato) ≤ taxCapEur` sempre.

---

## 7. Euristica del 2%

§6.4 della ATE, con una condizione in più in `targeted`: azzerare un peso sotto il 2% è una vendita, e
si fa solo se la tassa totale resta sotto il tetto **e** il candidato non è bloccato. Altrimenti il
peso resta (sul prototipo: EIMI all'1% a tetto 494 € con NTSG bloccato, perché venderlo tutto
costerebbe 100 € oltre il tetto). Un candidato che l'euristica azzera ma che è in acquisto da zero
(nessuna posizione) si azzera come oggi.

---

## 8. Risultato

```ts
export interface OptimizerResult {
  // …campi esistenti…
  /** Solo in 'targeted'. */
  sale?: {
    taxCapEur: number;
    soldEur: number;          // Σ max(0, cur − w) · B sui pesi arrotondati
    taxEur: number;           // Σ c_i · venduto_i, sui pesi arrotondati, ≤ taxCapEur
    idealTaxEur: number;      // tax(solve(μ = 0)): quanto costerebbe l'Ideale coi blocchi
    capBinding: boolean;      // μ > 0
    perCandidate: Array<{ key: string; soldEur: number; taxEur: number }>;
  };
}
```

I conflitti (§6.7 della ATE) si calcolano a `μ` fisso (quello trovato), senza rifare la bisezione per
ogni obiettivo tolto: il «senza l'obiettivo X» resta indicativo e la sua tassa può differire dal
tetto. Lo si dichiara nella guida, non nella UI.

---

## 9. UI — `IdealCompositionDialog`

1. **Selettore**: `MODE_OPTIONS` = Ideale · Con vendite mirate · Raggiungibile col PAC. La modalità
   mirata, come Raggiungibile, richiede un importo? **No**: si può ribilanciare con 0 € da versare;
   resta attiva anche senza importo.
2. **Campo tetto**, visibile solo in `targeted`, sotto il selettore: «Tasse massime (€)», numerico,
   vuoto = 0. Stesso componente `Input` dell'importo.
3. **Colonna «Non vendere»**, solo in `targeted`, prima colonna della tabella: una casella per riga
   (`Checkbox` con la `Label` sul nome dello strumento, tutta la riga cliccabile per il target da 44px
   su touch). Stato del dialog, non persistito. Righe `frozen` e con `taxPerEuroSold === null`: casella
   spuntata e disabilitata, con `title` che dice perché («Costo fiscale sconosciuto» / «Bloccato in
   Impostazioni»).
   **La tabella serve prima del calcolo**: in `targeted` le righe (nome + peso attuale + casella) si
   mostrano appena i candidati sono noti, il calcolo riempie le altre colonne.
4. **Colonna «Tasse»**, solo in `targeted`, dopo «Differenza»: sulle righe in vendita la tassa
   stimata (`formatCurrency`, The Comma Rule), `—` sulle altre, `0 €` su una vendita in perdita.
5. **Riga del totale**, sotto la tabella, prima del rapporto (`weightOptimizerNarrative.ts`):
   - tetto attivo: «Vendi 8.213 €, paghi circa 494 € di tasse (tetto 500 €).»
   - tetto non raggiunto: «Vendi 23.078 €, paghi circa 876 € di tasse: è l'Ideale, il tetto di 1.000 €
     non serve.»
   - nessuna vendita: «Nessuna vendita: i pesi sono quelli raggiungibili col PAC.»
6. **Descrizione della modalità** (`describeOptimizerMode('targeted')`): «Con vendite mirate vende
   solo ciò che conviene di più, finché le tasse restano sotto il tetto; gli strumenti spuntati non si
   vendono.»
7. **«Crea un PAC con questi pesi»**: invariato; lo snapshot porta `mode: 'targeted'` (§10). Il PAC
   non vende: la guida lo ricorda, la UI no (le vendite le fa l'utente al broker).

Stringhe nuove in `weightOptimizerNarrative.ts`, con `OPTIMIZER_MODE_LABELS.targeted = 'Con vendite
mirate'`.

---

## 10. Snapshot

In `types/accumulationPlan.ts`, dentro `optimizerSnapshot`:

```ts
taxCapEur?: number;    // solo mode 'targeted'
lockedKeys?: string[]; // solo mode 'targeted'
```

`describeOptimizerSnapshot` usa `OPTIMIZER_MODE_LABELS[snapshot.mode]`, che col Record allargato copre
già la terza etichetta. `removeUndefinedDeep` prima della scrittura, come oggi.

---

## 11. Test

### 11.1 Vitest — `__tests__/weightOptimizerTargeted.test.ts`

Fixture: i 12 candidati del caso reale (valori, esposizioni e plusvalenze in questa ATE, §3 e §5.3;
un fixture sintetico a 3–4 candidati per i casi di base).

1. Tetto molto alto → `weights` identici a `mode: 'ideal'` con gli stessi blocchi; `capBinding` false.
2. Tetto 0, nessuna perdita → pesi entro 0,5 punti da `mode: 'reachable'`; `taxEur === 0`.
3. Tetto 0 con una posizione in perdita sovrappesata → la vende (tassa 0).
4. `taxEur ≤ taxCapEur` dopo l'arrotondamento, su una griglia di tetti (0, 50, 100, …, 1.000).
5. `tax(μ)` non crescente al crescere del tetto; il gap pesato `J` non crescente al crescere del tetto.
6. Candidato in `lockedKeys` → `proposedPct ≥ currentPct` (tenuto esatto se non comprato).
7. `taxPerEuroSold: null` → trattato come bloccato.
8. Tenuto fuori griglia: `proposedPct` = peso corrente esatto; somma = 100 ± 1e-9.
9. Euristica 2% non viola il tetto (il caso EIMI all'1%).
10. Determinismo: due esecuzioni → stesso output bit per bit.
11. Le altre modalità invariate: gli snapshot dei test esistenti di `weightOptimizer.test.ts` passano
    senza modifiche.
12. Tempo: il fixture reale sotto 300 ms (asserzione lasca, 1 s, per non renderla fragile in CI).

`taxPerEuroSold` (§3): perdita → 0, aliquota 12,5, estero senza `averageCostEur` → `null`.

### 11.2 Playwright — `e2e/allocation.spec.ts`

Un caso in più sul dialog Composizione ideale (fixture di `seedEmulator.ts`, già con PMC): scegli «Con
vendite mirate», tetto 0 → la colonna Tasse è tutta `—` o `0 €`, il totale dice «Nessuna vendita» o
tasse 0; spunta «Non vendere» su una riga venduta a tetto alto → quella riga non è più in vendita.

---

## 12. Documentazione

- `doc/guide/ottimizzatore.md`: § Cosa fa (tre modalità, solo nello strumento a sé), § La formulazione
  (variabili separate, bisezione, arrotondamento dei tenuti), § Limiti noti (conflitti a `μ` fisso;
  minusvalenze fuori perimetro; costo fiscale sconosciuto = non vendibile; le commissioni non contano).
- `CLAUDE.md`: la riga «Solo fork» dell'Ottimizzatore e Current Status.

---

## 13. Piano delle sessioni

Una sessione, un commit (WORKFLOW.md §1): motore + test (§3–8, §11.1), poi UI + e2e (§9, §11.2),
poi documentazione. Collaudo guidato (WORKFLOW.md §2) sugli emulatori col fixture del caso reale
seminato da uno script usa e getta.

---

## Appendice A — Il prototipo (2026-09-27), rivisto

> Rieseguito il 2026-09-27 seguendo le istruzioni qui sotto: la tabella A.3 si riproduce identica, ma i
> tempi su quella macchina erano 320–525 ms (non 0,8–1,2 s). Dove andava il tempo e le alternative misurate:
> nota in testa al §5.2.

Scritto in una sessione di analisi per validare §5, **non** codice di produzione: una funzione
aggiunta in fondo a una copia di `lib/utils/weightOptimizer.ts` (usa le sue funzioni private
`buildObjectiveRows`, `buildObjective`, `buildGradient`, `evaluateRowRaw`) più un driver col fixture
reale. Misure: 0,8–1,2 s per calcolo con tetto attivo, 3 ms quando il tetto non serve. Difetti noti,
che la specifica già corregge: arrotondamento che inventa vendite (§6), nessuna euristica del 2% (§7),
nessun warm start, `eta` iniziale 1e-4, fino a 20.000 iterazioni per `solve` × circa 45 `solve` per la
bisezione. Le tasse per euro di SGLN, DBMF, UEQC, CRRY sono segnaposto (0,03): il PMC non era noto.

Per rieseguirlo: copiare `lib/utils/weightOptimizer.ts` in una cartella usa e getta, riscrivere gli
import `@/` e `./` in percorsi assoluti, accodare A.1, salvare A.2 accanto come `drv.ts`, e dalla
radice del repo `npx tsx <cartella>/drv.ts "NTSG" "100,300,494,583"` (primo argomento: le chiavi
bloccate separate da virgola; secondo: i tetti).

### A.1 La funzione

```ts
// ---- PROTOTYPE: targeted mode (split variables + bisection on mu) ----
export function prototypeTargeted(input: OptimizerInput, taxPerEuro: number[], capEur: number) {
  const { candidates, baseEur: B, targets, settings, referenceAreas, targetLeverageRatio } = input;
  const n = candidates.length;
  const warnings: OptimizerWarning[] = [];
  const cur = candidates.map((c) => c.currentValueEur / B);
  const lo = candidates.map((c) => c.lowerPct / 100);
  const hi = candidates.map((c) => c.upperPct / 100);
  const rows = buildObjectiveRows(candidates, targets, settings, targetLeverageRatio, referenceAreas, B, warnings);
  const J = buildObjective(rows, cur, n);
  const G = buildGradient(rows, cur, n);
  const zlo = [...cur.map((c, i) => Math.max(0, lo[i] - c)), ...cur.map((c, i) => -Math.max(0, c - lo[i]))];
  const zhi = [...cur.map((c, i) => Math.max(0, hi[i] - c)), ...cur.map((c, i) => -Math.max(0, c - hi[i]))];
  const budget = 1 - cur.reduce((s, v) => s + v, 0);
  const toW = (z: number[]) => cur.map((c, i) => c + z[i] + z[n + i]);
  const taxOf = (w: number[]) => cur.reduce((s, c, i) => s + taxPerEuro[i] * Math.max(0, c - w[i]) * B, 0);
  const solve = (mu: number) => {
    const obj = (z: number[]) => { const w = toW(z); let t = 0; for (let i = 0; i < n; i++) t += -z[n + i] * taxPerEuro[i]; return J(w) + mu * t; };
    const grad = (z: number[]) => { const g = G(toW(z)); return [...g, ...g.map((gi, i) => gi - mu * taxPerEuro[i])]; };
    // reuse solveQP with budget != 1: scale trick — solveQP projects onto sum=1, so pass shifted problem
    const zref = new Array(2 * n).fill(0);
    let z = projectOntoBudgetBox(zref, zlo, zhi, budget); let fz = obj(z); let eta = 1e-4;
    for (let it = 0; it < 20000; it++) {
      const g = grad(z); let step = eta * 1.5; let ok = false;
      for (let t = 0; t < 40; t++) { const c = projectOntoBudgetBox(z.map((v, i) => v - step * g[i]), zlo, zhi, budget); const fc = obj(c); if (fc <= fz - 1e-12 * Math.max(1, Math.abs(fz))) { const d = Math.abs(fz - fc); z = c; fz = fc; eta = step; ok = true; if (d < 1e-13 * Math.max(1, Math.abs(fz))) it = 1e9; break; } step /= 2; }
      if (!ok) break;
    }
    return toW(z);
  };
  let w = solve(0);
  let mu = 0;
  if (taxOf(w) > capEur) {
    let mLo = 0, mHi = 1;
    while (taxOf(solve(mHi)) > capEur && mHi < 1e9) mHi *= 4;
    for (let k = 0; k < 40; k++) { const m = (mLo + mHi) / 2; if (taxOf(solve(m)) > capEur) mLo = m; else mHi = m; }
    mu = mHi; w = solve(mHi);
  }
  // rounding: sold positions ceil toward current, others largest remainder
  const units = w.map((x, i) => (x < cur[i] - 1e-9 ? Math.min(Math.ceil(200 * x - 1e-9), Math.floor(200 * cur[i] + 1e-9)) : Math.floor(200 * x + 1e-9)));
  let rem = 200 - units.reduce((s, v) => s + v, 0);
  const order = w.map((_, i) => i).filter((i) => !(w[i] < cur[i] - 1e-9)).sort((a, b) => (200 * w[b] - units[b]) - (200 * w[a] - units[a]));
  while (rem > 0) { for (const i of order) { if (rem <= 0) break; units[i]++; rem--; } }
  while (rem < 0) { for (const i of order.slice().reverse()) { if (rem >= 0) break; if (units[i] > 0) { units[i]--; rem++; } } }
  const xr = units.map((u) => u / 200);
  const rep = rows.map((r) => `${r.id} ${r.targetValue.toFixed(2)} -> ${(r.unit === 'x' ? r.targetValue + evaluateRowRaw(r, xr) / 100 : r.targetValue + evaluateRowRaw(r, xr)).toFixed(2)}`);
  return { w, xr, mu, taxRaw: taxOf(w), taxRounded: taxOf(xr), rep };
}
```

### A.2 Il driver col fixture reale

Valori al 2026-09-27 (base = portafoglio allocabile + 15.000 € = 126.128 €), priorità: classi
essenziale, leva alta, secondo livello dell'azionario alta, geografia media con riferimento
`wt-global-efficient-core`. Con `mode: 'ideal'` e `'reachable'` questo fixture riproduce **al mezzo
punto** i pesi che l'app mostrava nel dialog.

```ts
import { prototypeTargeted } from './wo';
const T = 126128;
const devOf = (us: number, em = 0) => [us, 1 - us - em, em];
// label, value, gainEur(null=unknown), exp, factor, areas
const rows: any[] = [
  ['CL2', 5356.24, 710.39, { equity: 2 }, { equity: { Market: 2 } }, [2, 0, 0]],
  ['AVWS', 2758.25, -11.55, { equity: 1 }, { equity: { 'Small Cap Value': 1 } }, devOf(0.6924)],
  ['DEGC', 1880.34, 216.62, { equity: 1 }, { equity: { Market: 1 } }, devOf(0.7145)],
  ['EIMI', 5405.70, 1667.49, { equity: 1 }, { equity: { Market: 1 } }, [0, 0, 1]],
  ['NTSG', 49289.63, 6694.25, { equity: 0.9, bonds: 0.6 }, { equity: { Market: 0.9 } }, devOf(0.6932).map((v) => v * 0.9)],
  ['ALLW', 927.37, 15.88, { equity: 1 }, { equity: { Market: 1 } }, devOf(0.6166, 0.1003)],
  ['EXUS', 6565.74, 340.54, { equity: 1 }, { equity: { Market: 1 } }, [0, 1, 0]],
  ['XDEM', 4747.14, 181.90, { equity: 1 }, { equity: { Momentum: 1 } }, devOf(0.5633)],
  ['SGLN', 8601.14, null, { commodity: 1 }, {}, null],
  ['DBMF', 18172.10, null, { trendFollowing: 1 }, {}, null],
  ['UEQC', 3547.86, null, { carry: 1 }, {}, null],
  ['CRRY', 3875.61, null, { carry: 1 }, {}, null],
];
const targets: any = {
  equity: { targetPercentage: 70, subCategoryConfig: { enabled: true }, subTargets: { Market: 70, 'Small Cap Value': 15, Momentum: 15 } },
  bonds: { targetPercentage: 20 }, commodity: { targetPercentage: 10 }, trendFollowing: { targetPercentage: 20 }, carry: { targetPercentage: 10 },
};
const locked = new Set((process.argv[2] ?? '').split(',').filter(Boolean));
const caps = (process.argv[3] ?? '0,100,200,300,494,583,1000,100000').split(',').map(Number);
const cands = rows.map(([k, v, g, e, f, a]) => ({ key: k, assetIds: [k], buyAssetId: k, label: k, currentValueEur: v, exposurePerEuro: e, factorPerEuro: f,
  areaPerEuro: a ? { us: a[0], developedExUs: a[1], emerging: a[2] } : null, areaEstimatedPerEuro: 0, fixedValueEur: 0,
  lowerPct: locked.has(k) ? (v / T) * 100 : 0, upperPct: 100 }));
const tax = rows.map(([, v, g]) => (g === null ? 0.03 : Math.max(0, g) / v * 0.26));
const input: any = { candidates: cands, baseEur: T, targets,
  settings: { enabled: true, classPriority: 'essential', leveragePriority: 'high', factorObjectives: [{ assetClass: 'equity', priority: 'high' }],
    geography: { enabled: true, referenceIndexId: 'x', priority: 'medium' }, instrumentLimits: [], groupLimits: [] },
  referenceAreas: { us: 0.6932, developedExUs: 0.3068, emerging: 0 }, referenceEstimatedShare: 0, mode: 'ideal', targetLeverageRatio: 1.3 };
for (const cap of caps) {
  const t0 = Date.now(); const r = prototypeTargeted(input, tax, cap);
  const sold = rows.map((row, i) => [row[0], r.xr[i] * T - row[1]] as [string, number]).filter(([, d]) => d < -50).map(([k, d]) => `${k} ${Math.round(d)}`).join(', ');
  console.log(`cap ${cap}: tassi ${r.taxRounded.toFixed(0)} (raw ${r.taxRaw.toFixed(0)}) mu ${r.mu.toFixed(3)} ${Date.now() - t0}ms | vende: ${sold}`);
  console.log('   pesi', rows.map((row, i) => `${row[0]} ${(r.xr[i] * 100).toFixed(1)}`).join(' '));
  console.log('   ', r.rep.map((s) => s.replace(/^(class|factor:equity|geo):/, '')).join(' | '));
}
```

### A.3 Output di riferimento

| Blocchi | Tetto | Tasse (arrot.) | Vende |
| --- | --- | --- | --- |
| nessuno | 0 | 7 (bug §6) | NTSG −100, EXUS −259 (arrotondamento) |
| nessuno | 494 | 449 | DEGC, ALLW, EXUS, NTSG −7.667, EIMI −361 |
| nessuno | ≥ 881 | 876 | = Ideale |
| NTSG | 494 | 485 | DEGC, ALLW, EXUS, EIMI −4.144 |
| NTSG | 583 | 586 | = piano A (DEGC, EIMI, ALLW, EXUS) |
| NTSG, EXUS | ≥ 494 | 501 (raw 494; bug §6) | = piano B (DEGC, EIMI, ALLW) + NTSG −100, EXUS −259 d'arrotondamento |
