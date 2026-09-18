# ATE — Pesi degli strumenti da un'allocazione ideale (ottimizzatore)

> **Per chi implementa (agente).** Specifica tecnica vincolante. Le decisioni funzionali sono chiuse
> (§1): non riaprirle, non aggiungere funzionalità. In caso di contrasto col codice, fermati e chiedi
> con lo strumento interattivo (WORKFLOW.md regola 5).
>
> **Prerequisito:** la feature PAC di `doc/pac-ate.md` deve essere implementata almeno fino alla sua
> sessione S4 (editor del piano esistente). Base analizzata: commit `f6c834d`.
>
> Lingua: conversazione in italiano; codice, identificatori e commenti in inglese; UI in italiano.

---

## 0. Letture obbligatorie

1. `WORKFLOW.md` §1.
2. `doc/pac-ate.md` (questa feature si innesta nel suo editor e riusa `exposurePerEuro`).
3. `doc/guide/impostazioni.md` per intero, in particolare **Settings — the FIVE places**.
4. `doc/guide/allocazione.md`: motore a leva, target effettivi, sezione Esposizione (profili, regola
   notional vs market, base = portafoglio allocabile).
5. `lib/utils/leverageAwareAllocationUtils.ts` (solver da cui si estrae la proiezione) e
   `lib/constants/instrumentProfiles.ts` (header e tabelle).
6. `DESIGN.md`: The Tile Rule, The Declaration-Tile Rule, Modal widths, The Comma Rule.

---

## 1. Decisioni funzionali vincolanti

| # | Decisione |
| --- | --- |
| O1 | Il motore propone i pesi di mercato degli strumenti candidati; i pesi riempiono il passo Target del PAC e restano modificabili a mano. |
| O2 | Gli obiettivi vivono in **Impostazioni, tab Allocazione** ("Allocazione ideale"). Classi e sottocategorie (fattori) si leggono dai target esistenti, non si duplicano. |
| O3 | Geografia a **tre macro-aree**: Stati Uniti, Sviluppati ex USA, Emergenti. Ambito: gamba azionaria. |
| O4 | "Altri paesi": attribuzione automatica non stringente (§5.3): regionale → ovvia; altrimenti ripartizione curata se presente, altrimenti stima proporzionale al riferimento, marcata come stimata. |
| O5 | Riferimento geografico: un indice dei profili curati (es. FTSE All-World). Niente ripartizioni scritte a mano nella v1. |
| O6 | Priorità a quattro livelli fissi: Essenziale, Alta, Media, Bassa. |
| O7 | Due modalità, entrambe disponibili: **Raggiungibile col PAC** (default) e **Ideale**. |
| O8 | Pesi arrotondati a **0,5 punti**, somma esattamente 100; pesi sotto **2%** azzerati (euristica a due passaggi). |
| O9 | Perimetro v1: **solo il PAC**. Nessuna integrazione in Versa, Ribilancia, Preleva. |

Fuori perimetro: rendimenti attesi e rischio, ricerca di ETF, costi, obiettivi per singolo paese o per
valuta, fiscalità, scrittura dei target di classe/sottocategoria.

---

## 2. Mappa dei file

### Nuovi

| File | Contenuto |
| --- | --- |
| `lib/constants/geoAreas.ts` | aree e classificazione paesi §5.2 |
| `lib/utils/boxProjection.ts` | `projectOntoBudgetBox`, `clamp`, `dot` estratti dal motore a leva §4 |
| `lib/utils/weightOptimizer.ts` | motore puro §5–§6 |
| `lib/utils/weightOptimizerNarrative.ts` | parole del pannello e del rapporto §9.3 |
| `app/api/portfolio/instrument-profiles/route.ts` | profili per i candidati §8 |
| `lib/hooks/useInstrumentProfiles.ts` | hook React Query §8.3 |
| `components/allocation/OptimizerPanel.tsx` | pannello "Ottimizzato" nell'editor PAC §9.2 |
| `components/settings/IdealAllocationTile.tsx` | tile in Impostazioni §7.3 |
| `__tests__/boxProjection.test.ts` | §10 |
| `__tests__/geoAreas.test.ts` | §10 |
| `__tests__/weightOptimizer.test.ts` | §10 |
| `__tests__/weightOptimizerNarrative.test.ts` | §10 |
| `doc/guide/ottimizzatore.md` | guida d'area §11 |

### Modificati

| File | Modifica |
| --- | --- |
| `lib/utils/leverageAwareAllocationUtils.ts` | importa `projectOntoBudgetBox`, `clamp`, `dot` da `./boxProjection`; **nessun altro cambiamento** |
| `types/exposure.ts` | campo opzionale `otherAreaSplit` in `ExposureLegProfile` §5.3 |
| `lib/constants/instrumentProfiles.ts` | campo opzionale `otherAreaSplit` in `CuratedIndexProfile` |
| `lib/server/exposure/profileResolver.ts` | propaga `otherAreaSplit`; opzione `includeZeroQuantity` §8.1 |
| `types/assets.ts` | `idealAllocation` in `AssetAllocationSettings` §7.1 |
| `lib/services/assetAllocationService.ts` | lettura e **due** catene di scrittura di `idealAllocation` §7.2 |
| `app/dashboard/settings/page.tsx` | stato, load, save, dirty snapshot, montaggio tile §7.3 |
| `lib/utils/settingsNarrative.ts` | `describeIdealAllocation` §7.3 |
| `__tests__/settingsRoundTrip.test.ts` | `STORED_SETTINGS` con `idealAllocation` |
| `types/accumulationPlan.ts` | `optimizerSnapshot` §9.4 |
| `lib/services/accumulationPlanService.ts` | salva lo snapshot con la bozza |
| `components/allocation/AccumulationPlanDialog.tsx` | selettore Manuale / Ottimizzato nel passo 2 §9.1 |
| `AGENTS.md` §3, `CLAUDE.md`, `doc/guide/impostazioni.md`, `doc/guide/accumulo.md` | documentazione §11 |

---

## 3. Formulazione (riassunto da implementare)

- Incognite: `w_i ∈ [lo_i, hi_i]`, `Σ w_i = 1`, pesi di mercato sulla base B.
- Ogni obiettivo morbido k è una riga lineare `r_k(w) = a_k · w − b_k` espressa in **punti
  percentuali**, oppure una cerniera `max(0, a_k · w − b_k)` per i tetti di gruppo.
- Funzione obiettivo:

```
J(w) = Σ_k λ(priority_k) · r_k(w)²  +  ε · Σ_i (100 · (w_i − wRef_i))²
λ: essential 1000, high 100, medium 10, low 1        ε = 0.01
```

- Vincoli rigidi solo nella proiezione: somma = 1 e box `[lo_i, hi_i]`.
- Problema convesso: ottimo globale; `ε > 0` lo rende unico.

---

## 4. Estrazione della proiezione — `lib/utils/boxProjection.ts`

Sposta **senza modificarle** da `leverageAwareAllocationUtils.ts` le funzioni private `dot`, `clamp`,
`projectOntoBudgetBox`, esportale da `boxProjection.ts` e importale nel motore a leva. Criterio: il
diff di `leverageAwareAllocationUtils.ts` contiene solo la rimozione delle tre funzioni e l'import;
`__tests__/leverageAwareAllocationUtils.test.ts` resta verde senza modifiche.

`boxProjection.ts` non importa nulla. Aggiungi `__tests__/boxProjection.test.ts`: somma rispettata,
box rispettati, budget fuori da `[Σlo, Σhi]` riportato al bordo, idempotenza su un punto già ammissibile.

---

## 5. Dati d'ingresso del motore

### 5.1 Tipi — in `lib/utils/weightOptimizer.ts`

```ts
import type { Asset, AssetClass, AssetAllocationTarget } from '@/types/assets';
import type { InstrumentProfile } from '@/types/exposure';
import type { GeoArea } from '@/lib/constants/geoAreas';
import type { IdealAllocationSettings, ObjectivePriority } from '@/types/assets';

export type OptimizerMode = 'reachable' | 'ideal';

export interface OptimizerCandidate {
  key: string;                    // positionId when coming from the PAC, else assetId
  assetIds: string[];             // members (proxy group) — the first is NOT special
  buyAssetId: string;
  label: string;
  currentValueEur: number;        // Σ member values
  exposurePerEuro: Partial<Record<AssetClass, number>>;              // of the BUY asset
  factorPerEuro: Partial<Record<AssetClass, Record<string, number>>>; // class → subCategory → notional per €
  areaPerEuro: Record<GeoArea, number> | null;  // equity-leg notional per € by area; null = no geography
  areaEstimatedPerEuro: number;   // part of areaPerEuro that comes from an ESTIMATED "Altri paesi"
  fixedValueEur: number;          // Σ value of non-buy members (proxy) — held, never bought, never sold
  lowerPct: number;               // 0..100, resolved bounds (§5.5)
  upperPct: number;
}

export interface OptimizerInput {
  candidates: OptimizerCandidate[];
  baseEur: number;                // B
  targets: AssetAllocationTarget; // the page's EFFECTIVE targets
  settings: IdealAllocationSettings;
  referenceAreas: Record<GeoArea, number> | null; // from the reference index (§5.4), sums to 1
  referenceEstimatedShare: number;                // part of referenceAreas that is estimated
  mode: OptimizerMode;
}
```

Nota sui gruppi proxy: la variabile di ottimizzazione è il peso dell'**intera posizione**; i membri
non designati contribuiscono con un valore fisso. Nel calcolo delle esposizioni la posizione ha
esposizione `(fixedValueEur × esposizione dei membri fissi + acquisti × esposizione del buy asset)`.
Per mantenere la linearità, **la v1 assume che tutti i membri di un gruppo abbiano la stessa
esposizione per euro del buy asset** (è il caso d'uso: A è proxy di B). Se i vettori differiscono di
più di 0,05 in qualunque classe o area, `buildOptimizerCandidates` aggiunge un avviso
`proxy_mismatch` al rapporto e procede con quelli del buy asset.

### 5.2 Aree geografiche — `lib/constants/geoAreas.ts`

```ts
export type GeoArea = 'us' | 'developedExUs' | 'emerging';
export const GEO_AREAS: readonly GeoArea[] = ['us', 'developedExUs', 'emerging'];
export const GEO_AREA_LABELS: Record<GeoArea, string> = {
  us: 'Stati Uniti', developedExUs: 'Sviluppati ex USA', emerging: 'Emergenti',
};
/** MSCI Emerging Markets classification (review yearly, after MSCI's June market classification). */
export const EMERGING_MARKET_CODES: ReadonlySet<string> = new Set([
  'BR','CL','CN','CO','CZ','EG','GR','HU','IN','ID','KR','KW','MY','MX','PE','PH','PL','QA','SA','ZA','TW','TH','TR','AE',
]);
export function countryToArea(code: string): GeoArea | null; // 'US' → us; EM set → emerging; 'OTHER' → null; else developedExUs
```

Commento obbligatorio nel file: si usa **una sola** classificazione (MSCI) sia per gli strumenti sia per
l'indice di riferimento; FTSE classifica la Corea tra gli sviluppati, quindi con FTSE All-World come
riferimento circa 2,4 punti di Corea passano da Sviluppati a Emergenti. È voluto: coerenza prima della
fedeltà a un provider.

### 5.3 Attribuzione di "Altri paesi" (O4)

Aggiungi il campo opzionale, identico nei due tipi:

```ts
/** Share of this profile's 'OTHER' slice per area, from a factsheet. Sums to 1 ± 0.005. */
otherAreaSplit?: Partial<Record<GeoArea, number>>;
```

in `CuratedIndexProfile` (`lib/constants/instrumentProfiles.ts`) e in `ExposureLegProfile`
(`types/exposure.ts`). In `profileResolver.ts`, dove le `countries` della gamba vengono prese da
`indexProfile.countries`, copia anche `indexProfile.otherAreaSplit` nella `legProfile`. Nessun dato
curato nuovo è richiesto in questa feature: il campo resta vuoto finché qualcuno lo compila da un
factsheet (aggiungi la voce alla checklist nell'header di `instrumentProfiles.ts`).

Funzione pura in `weightOptimizer.ts`:

```ts
export function areasFromCountries(
  countries: Array<{ key: string; weight: number }>,
  otherAreaSplit: Partial<Record<GeoArea, number>> | undefined,
  referenceCountries: Array<{ key: string; weight: number }> | null
): { areas: Record<GeoArea, number>; estimatedShare: number };
```

Regole, in ordine:

1. Somma i paesi espliciti per area con `countryToArea`.
2. Sia `other` il peso della voce `OTHER` (0 se assente). Se `other === 0` → fine, `estimatedShare = 0`.
3. **Regionale**: se tutti i paesi espliciti cadono in una sola area, `other` va a quell'area, non stimato.
4. **Curato**: se `otherAreaSplit` è presente, ripartisci `other` secondo lo split, non stimato.
5. **Stima**: altrimenti prendi i paesi del riferimento **esclusi** quelli già elencati esplicitamente
   in questo profilo ed esclusa la voce `OTHER` del riferimento; aggregali per area, normalizza, e
   ripartisci `other` in proporzione. `estimatedShare = other`.
6. **Ripiego**: se il passo 5 non ha dati (riferimento assente o vuoto dopo l'esclusione), assegna
   `other` a `developedExUs`, `estimatedShare = other`.
7. Normalizza il risultato a somma 1 (i profili sommano 1 ± 0,005).

Il riferimento stesso passa dalla stessa funzione con `referenceCountries = null`: la sua voce `OTHER`
va per regola 3 o 4, altrimenti in proporzione ai **propri** paesi espliciti non USA per area
(stima), e la quota stimata diventa `referenceEstimatedShare`.

### 5.4 Costruzione dei candidati

```ts
export function buildOptimizerCandidates(input: {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  assetsById: Map<string, Asset>;
  profilesByTicker: Map<string, InstrumentProfile>;
  referenceCountries: Array<{ key: string; weight: number }> | null;
  settings: IdealAllocationSettings;
  mode: OptimizerMode;
  baseEur: number;
  valueOf: (a: Asset) => number;
}): { candidates: OptimizerCandidate[]; warnings: OptimizerWarning[] };
```

- `exposurePerEuro`: riusa `exposurePerEuro` di `lib/utils/accumulationPlanUtils.ts` sul buy asset.
- `factorPerEuro`: stessa regola, ma per chiave di sottocategoria: senza `composition`
  `factor[asset.assetClass][asset.subCategory ?? NO_SUBCATEGORY_LABEL] = leverage`; con `composition`
  `factor[c.assetClass][c.subCategory ?? NO_SUBCATEGORY_LABEL] += c.percentage/100 × leverage`.
- `areaPerEuro`: `equityPerEuro = exposurePerEuro.equity ?? 0`; se il profilo del buy asset ha
  `legs.equity.countries`, `areaPerEuro[a] = equityPerEuro × areas[a]` con `areas` da
  `areasFromCountries(...)` e `areaEstimatedPerEuro = equityPerEuro × estimatedShare`; se non ha
  countries ma `equityPerEuro > 0` → `areaPerEuro = null` e avviso `geo_uncovered`; se
  `equityPerEuro = 0` → `areaPerEuro = null` senza avviso.
- Limiti (§5.5), `fixedValueEur`, `currentValueEur` con `valueOf`.

### 5.5 Limiti per candidato

Tutti in punti percentuali di B:

| Caso | lowerPct | upperPct |
| --- | --- | --- |
| base | 0 | 100 |
| limite per strumento in Impostazioni (sul buy asset) | `max(lower, minPct)` | `min(upper, maxPct)` |
| modalità `reachable` | `max(lower, currentValueEur / baseEur × 100)` | invariato |
| modalità `ideal`, gruppo proxy | `max(lower, fixedValueEur / baseEur × 100)` | invariato |

Se dopo i limiti `lowerPct > upperPct` → `upperPct = lowerPct` e avviso `bound_conflict`.
Se `Σ lowerPct > 100` → **nessun calcolo**: `optimizeWeights` ritorna `status: 'infeasible_bounds'`
(l'unico caso rigido impossibile, §6.6).

---

## 6. Il motore — `optimizeWeights`

```ts
export type OptimizerWarning =
  | { code: 'geo_uncovered'; key: string }
  | { code: 'geo_estimated'; key: string; estimatedPct: number }
  | { code: 'reference_estimated'; estimatedPct: number }
  | { code: 'factor_unmapped'; assetClass: AssetClass; subCategory: string }
  | { code: 'proxy_mismatch'; key: string }
  | { code: 'bound_conflict'; key: string }
  | { code: 'not_converged' }
  | { code: 'stale_profile'; key: string; asOf: string };

export interface ObjectiveReport {
  id: string;                     // e.g. 'class:equity', 'factor:equity:Momentum', 'geo:us', 'leverage', 'group:<id>'
  kind: 'class' | 'factor' | 'geo' | 'leverage' | 'group';
  label: string;                  // Italian, from the narrative module
  priority: ObjectivePriority;
  targetValue: number;            // pp or ×, as displayed
  achievedValue: number;
  gapPp: number;                  // signed, in pp (leverage: 1 pp = 0.01×)
  coveragePct?: number;           // geo only: share of scope exposure with data
}

export interface ConflictReport {
  removedObjectiveId: string;
  improvements: Array<{ objectiveId: string; fromGapPp: number; toGapPp: number }>;
}

export interface OptimizerResult {
  status: 'ok' | 'infeasible_bounds' | 'no_candidates';
  weights: Array<{ key: string; label: string; currentPct: number; proposedPct: number }>;
  objectives: ObjectiveReport[];
  conflicts: ConflictReport[];    // at most 3, largest improvement first
  warnings: OptimizerWarning[];
  iterations: number;
  converged: boolean;
}

export function optimizeWeights(input: OptimizerInput): OptimizerResult;
```

### 6.1 Righe degli obiettivi

Siano `x_i = w_i` (frazione di B), `E_i[c] = exposurePerEuro[c]`, `F_i[c][s] = factorPerEuro[c][s]`,
`G_i[a] = areaPerEuro[a]`, `lev_i = Σ_c E_i[c]`. Target di classe effettivo in frazione:
`t_c = targets[c].targetPercentage / 100` (per `cash` con `useFixedAmount`: `fixedAmount / baseEur`).
Classi con `t_c = 0` e nessuna esposizione tra i candidati vengono ignorate.

| Obiettivo | Attivo se | Riga (in pp) | Priorità |
| --- | --- | --- | --- |
| Classe c | `settings.classPriority` (sempre) e `t_c > 0` o esposizione > 0 | `100 · (Σ_i E_i[c] x_i − t_c)` | `classPriority` |
| Leva | `settings.leveragePriority !== 'off'` | `100 · (Σ_i lev_i x_i − L*)`, `L* = deriveTargetLeverageRatio(targets)` passato nell'input come numero | `leveragePriority` |
| Fattore (c, s) | `settings.factorObjectives` contiene c e `targets[c].subCategoryConfig?.enabled` e `subTargets` non vuoti | `100 · (Σ_i (F_i[c][s] − r_s E_i[c]) x_i) / t_c`, con `r_s` = peso della sottocategoria / Σ pesi | priorità dell'obiettivo |
| Area a | `settings.geography?.enabled` e `referenceAreas` | `100 · (Σ_{i coperti} (G_i[a] − ρ_a E_i[equity]) x_i) / t_equity`, `ρ_a = referenceAreas[a]` | `geography.priority` |
| Tetto di gruppo g | per ogni `groupLimits` | cerniera `100 · max(0, Σ_{i∈g} x_i − cap_g)` | priorità del gruppo |

Aggiungi `targetLeverageRatio: number` a `OptimizerInput` (la pagina lo ha già: `deriveTargetLeverageRatio(targets)`).

Divisione per `t_c` e `t_equity`: rende la riga "pp della classe" quando la classe è vicina al target;
se `t_c = 0` salta l'obiettivo di fattore/area per quella classe. Una sottocategoria presente negli
asset ma assente nei `subTargets` contribuisce con `r_s = 0` e genera l'avviso `factor_unmapped`.

### 6.2 Riferimento della regolarizzazione

`wRef_i = currentValueEur_i / Σ currentValueEur` (se Σ = 0, pesi uniformi). In modalità `reachable` la
somma usa B come denominatore e si normalizza a 1.

### 6.3 Solver

Stessa famiglia del motore a leva, con backtracking:

```
x = projectOntoBudgetBox(wRef, lo, hi, 1)
fx = J(x); eta = 1
for iter in 0..MAX_ITER-1 (MAX_ITER = 3000):
  g = ∇J(x)                      // analytic: Σ 2 λ_k r_k a_k (hinge: only when active) + 2 ε 100² (x − wRef)
  if ‖g‖ < 1e-10: converged; break
  step = eta * 1.5
  for tries in 0..39:
    cand = projectOntoBudgetBox(x − step * g, lo, hi, 1)
    if J(cand) <= fx − 1e-12 · max(1, |fx|): accept; eta = step; break
    step /= 2
  if no accept: converged; break
  if |fx_prev − fx| < 1e-12 · max(1, |fx|) for 25 consecutive iters: converged; break
```

Se si esce per `MAX_ITER` → `converged: false` e avviso `not_converged`. Tutto in `number[]`, niente
allocazioni per iterazione oltre ai vettori necessari (n ≤ 40).

### 6.4 Peso minimo 2% (O8)

```
repeat up to 5 passes:
  solve
  small = { i : x_i < 0.02 and lo_i == 0 and x_i > 0 }
  if small is empty: break
  for i in small: hi_i = 0
```

Se azzerare rende `Σ hi < 1` (impossibile coprire il 100%), annulla l'ultimo passaggio e tieni il
risultato precedente.

### 6.5 Arrotondamento a 0,5 (O8)

Metodo dei resti maggiori sulla griglia 0,5:

```
units_i = floor(200 · x_i + 1e-9)            // in half-points
remaining = 200 − Σ units_i
sort i by (200 · x_i − units_i) desc, tie: larger x_i, then key
give +1 unit to the first `remaining` candidates whose (units_i + 1) / 200 ≤ hi_i + 1e-9
proposedPct_i = units_i / 2
```

Il rapporto (§6.7) si calcola sui pesi **arrotondati**. Un peso arrotondato può scendere sotto
`lowerPct` di al massimo 0,5: è accettato (in modalità reachable significa solo nessun acquisto).

### 6.6 Esiti speciali

- `no_candidates`: nessun candidato → pesi vuoti.
- `infeasible_bounds`: `Σ lowerPct > 100` → pesi vuoti, un avviso nel rapporto con la somma.
- Obiettivo senza leve disponibili (es. leva senza strumenti a leva): nessun errore, compare col suo
  gap nel rapporto.

### 6.7 Rapporto e conflitti

- `objectives`: per ogni riga attiva, target, raggiunto, gap in pp sui pesi arrotondati; per la
  geografia `coveragePct = Σ_{coperti} E_i[equity] x_i / Σ_i E_i[equity] x_i × 100`.
- `conflicts`: per ogni obiettivo morbido con `|gap| > 0,25 pp`, risolvi di nuovo **senza** quello
  (stessi limiti, stessa regolarizzazione, senza arrotondamento) e misura quanto migliorano gli altri
  obiettivi con `|gap| > 0,25`. Tieni solo i miglioramenti ≥ 0,25 pp. Ordina per somma dei
  miglioramenti pesata con λ; massimo 3 voci.
- Determinismo: stesso input → stesso output bit per bit (nessun ordinamento instabile, nessun random).

---

## 7. Impostazioni (O2)

### 7.1 Tipo — `types/assets.ts`

```ts
export type ObjectivePriority = 'essential' | 'high' | 'medium' | 'low';

export interface IdealAllocationSettings {
  enabled: boolean;
  classPriority: ObjectivePriority;                          // default 'essential'
  leveragePriority: ObjectivePriority | 'off';               // default 'high'
  factorObjectives: Array<{ assetClass: AssetClass; priority: ObjectivePriority }>;
  geography: { enabled: boolean; referenceIndexId: string; priority: ObjectivePriority } | null;
  instrumentLimits: Array<{ assetId: string; minPct?: number; maxPct?: number }>;
  groupLimits: Array<{ id: string; label: string; assetIds: string[]; maxPct: number; priority: ObjectivePriority }>;
}
```

e in `AssetAllocationSettings`: `idealAllocation?: IdealAllocationSettings;`.
Default applicativo (non salvato): `enabled: false`, `classPriority: 'essential'`,
`leveragePriority: 'high'`, `factorObjectives: []`, `geography: null`, liste vuote. Esporta
`DEFAULT_IDEAL_ALLOCATION` da `lib/utils/weightOptimizer.ts`.

### 7.2 Le cinque sedi

Segui `doc/guide/impostazioni.md` → *Settings — the FIVE places* alla lettera:

1. Tipo (§7.1).
2. `getSettings`: `idealAllocation: data.idealAllocation` nella mappatura di lettura.
3. `setSettings`, ramo `targets` (`setDoc` senza merge): includi `idealAllocation` nel documento; se
   assente, `delete docData.idealAllocation`.
4. `setSettings`, ramo merge: `if ('idealAllocation' in settings)` scrivi il valore, oppure
   `deleteField()` se `undefined`.
5. `app/dashboard/settings/page.tsx`: stato, caricamento, salvataggio in `handleSave`, **snapshot
   dirty** della tab Allocazione.

Più: `STORED_SETTINGS` in `__tests__/settingsRoundTrip.test.ts` con un `idealAllocation` completo.
Nessuna lettura server (sesta/settima sede non servono): dichiaralo nella guida.

### 7.3 Il tile "Allocazione ideale"

`components/settings/IdealAllocationTile.tsx`, montato nella `TabsContent value="allocazione"` dopo i
tile dei target esistenti, nella stessa griglia. Un `Tile` con eyebrow "Allocazione ideale", lettura
da `describeIdealAllocation(settings)` in `lib/utils/settingsNarrative.ts`, controlli sotto. Salva col
"Salva" della pagina (nessun salvataggio proprio).

| Controllo | Dettaglio |
| --- | --- |
| Attiva | interruttore `enabled`; spento → gli altri controlli sono nascosti e la lettura dice che il PAC resta solo manuale |
| Classi | select priorità (Essenziale default); testo: "Target delle classi qui sopra" |
| Leva | select Off/priorità; mostra la leva target calcolata (`deriveTargetLeverageRatio`) |
| Fattori | una riga per ogni classe con sottocategorie abilitate: checkbox + priorità; le percentuali restano quelle delle sottocategorie (link visivo, non modificabili qui) |
| Geografia | interruttore; select dell'indice di riferimento tra gli `INDEX_PROFILES` con `countries` (label + `asOf`); anteprima delle tre aree in %; priorità (Media default); nota "ambito: azioni" |
| Limiti per strumento | lista: asset tradable, min %, max % (vuoti = nessun limite); aggiungi/rimuovi |
| Limiti di gruppo | lista: etichetta, asset (multi-select), tetto %, priorità; aggiungi/rimuovi |

Lettura, esempi: "Il PAC può proporre i pesi da 4 obiettivi: classi (essenziale), leva 1,23× (alta),
fattori dell'azionario (alta), geografia come FTSE All-World (media)." / "Spenta: nel PAC i pesi si
inseriscono solo a mano."

Validazione nel form: `minPct ≤ maxPct`, valori 0..100, un asset al massimo in un limite per
strumento; errori nella status line della pagina come gli altri tile.

---

## 8. Profili sul client

### 8.1 `resolveInstrumentProfiles` con quantità 0

In `lib/server/exposure/profileResolver.ts` cambia la firma in:

```ts
export async function resolveInstrumentProfiles(
  assets: Asset[],
  options: { includeZeroQuantity?: boolean } = {}
): Promise<Map<string, InstrumentProfile>>
```

Il filtro `a.quantity <= 0` si applica solo se `!options.includeZeroQuantity`. I chiamanti esistenti
non cambiano (default = comportamento attuale).

### 8.2 Route — `app/api/portfolio/instrument-profiles/route.ts`

`GET ?userId=<ownerId>&assetIds=<id1,id2,...>` (massimo 40 id).

1. `requireFirebaseAuth(request)`; `assertCanAccessAccount(decodedToken, ownerId)` (modello:
   `app/api/asset-transactions/route.ts`).
2. `getUserAssetsAdmin(ownerId)`, filtra per id richiesti e ruolo `tradable`/`frozen`.
3. `resolveInstrumentProfiles(selected, { includeZeroQuantity: true })`.
4. Risposta `{ profiles: Record<ticker, InstrumentProfile>, computedAt: string }`. Nessuna cache
   Firestore propria: il resolver ha già la cache di 30 giorni per strumento.
5. Errori con lo stesso helper della route di esposizione.

### 8.3 Hook

`lib/hooks/useInstrumentProfiles.ts`: `useInstrumentProfiles(ownerId, assetIds)` con
`authenticatedFetch`, `queryKey: ['instrument-profiles', ownerId, ...[...assetIds].sort()]`,
`staleTime` 1 ora, `enabled` solo con ownerId e almeno un id. Aggiungi la chiave in
`lib/query/queryKeys.ts` come `instrumentProfiles.byAssets(ownerId, ids)`.

---

## 9. Integrazione nel PAC

### 9.1 Selettore nel passo 2

In `AccumulationPlanDialog.tsx`, passo 2, sopra la tabella: segmented control **Manuale |
Ottimizzato** (Manuale di default). Ottimizzato sostituisce la tabella con `OptimizerPanel`; tornando
su Manuale la tabella riappare con i valori correnti della bozza.

### 9.2 `OptimizerPanel`

Props: `draft`, `allAssets`, `targets`, `targetLeverageRatio`, `idealAllocation`, `liquidityL`
(la L del passo 1), `onApply(weightsByPositionKey)`.

1. Se `!idealAllocation?.enabled`: lettura "Nessuna allocazione ideale impostata: definiscila in
   Impostazioni → Allocazione." con link; niente altro.
2. Riepilogo obiettivi attivi (righe dichiarative, non modificabili qui) + link "Modifica in Impostazioni".
3. Toggle modalità: **Raggiungibile col PAC** (default) / **Ideale**, con una riga che spiega la
   differenza ("Raggiungibile non scende sotto ciò che possiedi, perché il PAC non vende").
4. Candidati = posizioni della bozza (le righe "Da vendere" sono escluse); B = Σ valori delle
   posizioni + `liquidityL`.
5. Pulsante **Calcola**: carica i profili (`useInstrumentProfiles` sugli asset di tutte le posizioni),
   costruisce i candidati, chiama `optimizeWeights`. Il calcolo è sincrono e rapido; mostra comunque
   lo stato di caricamento dei profili.
6. Risultato: tabella strumento · peso oggi · proposto (mono, 0,5); sotto il rapporto: per obiettivo
   "Azioni 102,0% → 101,6% (−0,4 pp)"; i conflitti in frasi ("Togliendo la leva, gli Stati Uniti
   scenderebbero da 66,1% a 62,0%"); gli avvisi (copertura geografica, quote stimate, non convergenza,
   limiti in conflitto).
7. **Usa questi pesi**: `onApply` scrive `targetPercentage` di ogni posizione con il peso proposto e
   torna su Manuale. Se la modalità era Ideale e un peso proposto è sotto il peso attuale, mostra
   prima una conferma: "In modalità Ideale alcuni pesi sono sotto ciò che possiedi: il PAC non vende,
   quindi quelle posizioni riceveranno zero acquisti."

### 9.3 Narrativa — `lib/utils/weightOptimizerNarrative.ts`

Tutte le stringhe del pannello e del rapporto: etichette degli obiettivi ("Classe Azioni",
"Momentum nell'azionario", "Stati Uniti nell'azionario", "Leva", "Gruppo Leva"), formattazione dei gap
(segno "−" tipografico, pp con una decimale, leva con due decimali e "×"), frasi dei conflitti, un
testo per ogni `OptimizerWarning.code`, descrizione delle modalità.

### 9.4 Snapshot nel piano

In `types/accumulationPlan.ts` aggiungi a `AccumulationPlan` e `AccumulationPlanDraft`:

```ts
optimizerSnapshot?: {
  computedAt: Date;
  mode: OptimizerMode;
  settingsUsed: IdealAllocationSettings;
  weights: Array<{ key: string; proposedPct: number }>;
  objectives: ObjectiveReport[];
};
```

Scritto con "Usa questi pesi" e salvato con la bozza. Se l'utente poi modifica un peso a mano, lo
snapshot resta (documenta da dove si è partiti). Mostralo nel passo 3 come una riga: "Pesi proposti
dall'ottimizzatore il 18/09 (Raggiungibile), poi modificati a mano" quando i pesi differiscono.

---

## 10. Test

`geoAreas.test.ts`: US, un EM (KR, TW, CN), uno sviluppato (JP), `OTHER` → null.

`weightOptimizer.test.ts` (nessun mock Firebase necessario):

- `areasFromCountries`: regionale (world-ex-usa con OTHER 37%), curato (`otherAreaSplit`), stimato
  (momentum con OTHER 16,9% contro riferimento FTSE All-World), ripiego, normalizzazione.
- Invarianti di `optimizeWeights` su input casuali deterministici (seed fisso, 50 casi): somma 100,
  multipli di 0,5, limiti rispettati entro 0,5, nessun peso tra 0 e 2 (esclusi) salvo limiti inferiori,
  determinismo (due chiamate identiche).
- Solo classi, candidati "puri" (un candidato per classe): i pesi coincidono con i target.
- Fattori: tre candidati azionari etichettati Mercato/Momentum/SCV + target 70/15/15 → pesi azionari
  in proporzione 70/15/15 (±0,5).
- **Scenario leva + geografia** (fixture ispirata al portafoglio reale, profili nei fixture):
  ALLW (FTSE All-World), EXUS (world ex USA), EIMI, XDEM, AVWS, NTSG (60/40, leva 1,5, equity US),
  CL2 (leva 2, US), SGLN (oro), CRRY (carry); target di classe con Σ = 123 (leva 1,23).
  Asserzioni qualitative: (a) con la geografia attiva, la quota US dell'azionario è più vicina al
  riferimento che senza; (b) il peso di CL2 con geografia ≤ peso senza geografia; (c) la somma
  EXUS + EIMI con geografia ≥ senza; (d) la leva raggiunta è entro 0,05× dal target quando la priorità
  della leva è Alta e la geografia Media.
- Modalità reachable: nessun peso sotto `currentValue / B` di oltre 0,5.
- Gruppo proxy: un solo candidato, `fixedValueEur` rispettato in ideal.
- Tetto di gruppo: attivo solo quando superato (cerniera).
- `infeasible_bounds` e `no_candidates`.
- Conflitti: nello scenario leva + geografia il rapporto contiene un conflitto che coinvolge `leverage`
  e `geo:us`.
- `not_converged` forzabile con `MAX_ITER` iniettabile (esporta una costante sovrascrivibile solo nei test
  tramite un parametro opzionale `solverOptions`).

`weightOptimizerNarrative.test.ts`: etichette, gap, avvisi, frase di conflitto.

`settingsRoundTrip.test.ts`: `idealAllocation` sopravvive a scrittura e lettura in entrambi i rami.

`leverageAwareAllocationUtils.test.ts`: invariato e verde dopo l'estrazione.

---

## 11. Documentazione

- `doc/guide/ottimizzatore.md`: formulazione, pesi λ, regole di "Altri paesi", classificazione MSCI e
  nota sulla Corea, perché la proiezione è condivisa col motore a leva, limiti noti (gruppi proxy con
  esposizioni diverse, tetti di gruppo morbidi, euristica del 2%).
- `doc/guide/impostazioni.md`: la nuova voce nelle cinque sedi (esempio lavorato come
  `performanceExcludesCash`).
- `doc/guide/accumulo.md`: il selettore Manuale/Ottimizzato e lo snapshot.
- `AGENTS.md` §3 stub; `CLAUDE.md` Key Features/Key Files.

---

## 12. Piano delle sessioni

Ogni sessione parte dal branch della precedente; in chiusura `npx tsc --noEmit`, eslint, `npm test`
verdi, riepilogo del diff in italiano, **OK del proprietario prima del commit**.

| Sessione | Branch | Contenuto | Criterio di fine |
| --- | --- | --- | --- |
| O1 | `feat/opt-engine` | §4, §5, §6, test di §10 (tranne round-trip e narrativa) | test verdi; diff del motore a leva limitato all'estrazione |
| O2 | `feat/opt-settings` | §7 (tipo, cinque sedi, tile, narrativa impostazioni, round-trip) | round-trip verde; salvataggio verificato su anteprima con refresh completo |
| O3 | `feat/opt-profiles` | §5.3 (campi `otherAreaSplit` e propagazione), §8 | route risponde su anteprima per un asset a 0 quote |
| O4 | `feat/opt-pac` | §9 + narrativa e test, §11 | "Usa questi pesi" riempie il passo 2 su anteprima |

Verifica su anteprima (dopo O4), una fase per messaggio con l'esito atteso scritto prima: attiva
l'allocazione ideale in Impostazioni → salva → refresh → apri una bozza PAC → Ottimizzato →
Raggiungibile → Calcola → leggi rapporto e conflitti → Usa questi pesi → Manuale con i pesi compilati →
Ideale → conferma sui pesi sotto il posseduto.
