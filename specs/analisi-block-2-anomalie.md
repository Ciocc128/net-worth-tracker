# Block 2 — Anomaly Detection: Blocco "Da controllare"

**Prerequisito**: Block 1 completato e funzionante (`app/dashboard/analisi/page.tsx` esiste).  
**Obiettivo**: Aggiungere il blocco "Da controllare" in `AnalisiTab` — rileva categorie di spesa con comportamento anomalo rispetto alla media recente e le presenta come chip azionabili.

---

## Comportamento atteso

Il blocco appare **solo** quando ci sono anomalie rilevate. Non mostra "nessuna anomalia" — scompare silenziosamente.

Le anomalie sono sempre calcolate al livello del **singolo mese**. Il mese di riferimento è determinato così:

| `periodMode` | `selectedMonth` | Mese anomalia |
|---|---|---|
| `'current'` | `null` | Mese corrente Italy (`getItalyMonth()`) nell'anno corrente |
| `'year'` | `number` | Il mese selezionato |
| `'year'` | `null` | Nessuna anomalia (anno intero, non confrontabile) |
| `'history'` | `null` | Nessuna anomalia (storico, non confrontabile) |

---

## Algoritmo di rilevamento anomalie

```
Per ogni categoria di spesa (type !== 'income') nel mese di riferimento:

1. currentTotal = somma |amount| delle spese di quella categoria nel mese anomalia

2. referencePeriod = i 6 mesi immediatamente PRECEDENTI al mese anomalia
   (es: anomalia = Maggio 2025 → reference = Nov 2024 – Apr 2025)

3. Per ogni mese del referencePeriod: calcola la spesa totale di quella categoria
   monthlyTotals[i] = somma |amount| per categoria in quel mese (0 se nessuna spesa)

4. monthsWithData = conteggio mesi in referencePeriod dove monthlyTotals[i] > 0

5. Se monthsWithData < 3 → SKIP (dati insufficienti — categoria troppo nuova o irregolare)

6. referenceAverage = media(monthlyTotals) — SU TUTTI i 6 mesi, NON solo quelli con dati
   (usare tutti i mesi penalizza categorie che si spende non ogni mese, ma è più conservativo)

7. Se referenceAverage === 0 → SKIP (divisione per zero — categoria mai spesa prima)

8. deltaPercent = ((currentTotal - referenceAverage) / referenceAverage) * 100

9. absoluteDelta = currentTotal - referenceAverage

10. È anomalia se: deltaPercent > 25 AND absoluteDelta > 50

11. Ordinare per deltaPercent decrescente
```

**Nota sul segno**: le anomalie sono solo AUMENTI (deltaPercent > 0). Riduzioni significative (spesa molto più bassa del solito) NON vengono segnalate in v1 — sono buone notizie, non richiedono attenzione.

---

## Nuovo componente: `components/cashflow/AnomalieBlock.tsx`

Il componente è a **module level** (non definito inline in AnalisiTab — AGENTS.md: "React Compiler: components must be at module level").

### Props interface

```tsx
interface AnomaliaItem {
  category: string;       // es: "Ristoranti"
  currentTotal: number;   // spesa nel mese anomalia
  referenceAverage: number; // media mensile nei 6 mesi precedenti
  deltaPercent: number;   // es: 47.3
  absoluteDelta: number;  // es: 62.10
}

interface AnomalieBlockProps {
  anomalie: AnomaliaItem[];
  onCategoryClick: (category: string) => void;
}
```

### Struttura JSX

```tsx
/**
 * Conditional anomaly block for AnalisiTab.
 *
 * Renders only when anomalie.length > 0. Each chip is clickable and
 * navigates to the pie chart drill-down for that category.
 *
 * DESIGN: amber tint background, flat divide-y list on mobile,
 * horizontal chip row on desktop.
 */
export function AnomalieBlock({ anomalie, onCategoryClick }: AnomalieBlockProps) {
  if (anomalie.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-950/20 px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
          Da controllare
        </p>
      </div>

      {/* Chips — horizontal scroll on mobile, wrap on desktop */}
      <div className="flex flex-wrap gap-2">
        {anomalie.map((a) => (
          <button
            key={a.category}
            type="button"
            onClick={() => onCategoryClick(a.category)}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 dark:border-amber-700/40 bg-amber-100/60 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-200/60 dark:hover:bg-amber-800/40 transition-colors"
          >
            <span className="font-semibold">{a.category}</span>
            <span className="text-amber-700 dark:text-amber-300 font-mono">
              +{a.deltaPercent.toFixed(0)}%
            </span>
            <span className="text-xs text-amber-600/80 dark:text-amber-400/80 font-mono">
              ({formatCurrency(a.referenceAverage)} → {formatCurrency(a.currentTotal)})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Import necessari**: `AlertTriangle` da `lucide-react`, `formatCurrency` da `@/lib/services/chartService`.

---

## Modifiche a `components/cashflow/AnalisiTab.tsx`

### A. Nuovi import

```tsx
import { AnomalieBlock } from '@/components/cashflow/AnomalieBlock';
```

### B. Calcolo anomalie (useMemo, prima degli early return)

Aggiungere questo `useMemo` nel blocco dei computed data, **dopo** `periodFilteredExpenses` e **prima** dello skeleton early return:

```tsx
/**
 * Compute spending anomalies for the current month context.
 *
 * Anomalies are only meaningful at a monthly granularity.
 * For annual or historical views, returns empty array.
 *
 * Algorithm: for each expense category in the anomaly month,
 * compare current month total vs rolling 6-month average.
 * Flag if delta > 25% AND absolute delta > €50.
 * Skip categories with fewer than 3 months of history.
 */
const anomalieData = useMemo<AnomaliaItem[]>(() => {
  // Determine the anomaly month
  let anomalyMonth: number | null = null;
  let anomalyYear: number | null = null;

  if (periodMode === 'current') {
    anomalyMonth = getItalyMonth();
    anomalyYear = getItalyYear();
  } else if (periodMode === 'year' && selectedMonth !== null && selectedYear !== null) {
    anomalyMonth = selectedMonth;
    anomalyYear = selectedYear;
  } else {
    return []; // Annual or historical view — no anomaly detection
  }

  // Collect expenses for the anomaly month
  const anomalyExpenses = allExpenses.filter(e => {
    const d = toDate(e.date);
    return (
      e.type !== 'income' &&
      getItalyYear(d) === anomalyYear &&
      getItalyMonth(d) === anomalyMonth
    );
  });

  // Build category totals for the anomaly month
  const currentTotals = new Map<string, number>();
  anomalyExpenses.forEach(e => {
    currentTotals.set(e.categoryName, (currentTotals.get(e.categoryName) ?? 0) + Math.abs(e.amount));
  });

  if (currentTotals.size === 0) return [];

  // Build 6-month reference window (months immediately before anomaly month)
  // Each entry: { year, month } in descending order
  const referenceMonths: Array<{ year: number; month: number }> = [];
  let refYear = anomalyYear!;
  let refMonth = anomalyMonth! - 1;
  for (let i = 0; i < 6; i++) {
    if (refMonth < 1) { refMonth = 12; refYear--; }
    referenceMonths.push({ year: refYear, month: refMonth });
    refMonth--;
  }

  // For each category, compute monthly totals in the reference window
  const results: AnomaliaItem[] = [];

  currentTotals.forEach((currentTotal, category) => {
    const monthlyTotals = referenceMonths.map(({ year, month }) => {
      const monthExpenses = allExpenses.filter(e => {
        const d = toDate(e.date);
        return (
          e.type !== 'income' &&
          e.categoryName === category &&
          getItalyYear(d) === year &&
          getItalyMonth(d) === month
        );
      });
      return monthExpenses.reduce((s, e) => s + Math.abs(e.amount), 0);
    });

    const monthsWithData = monthlyTotals.filter(t => t > 0).length;
    if (monthsWithData < 3) return; // Insufficient history

    const referenceAverage = monthlyTotals.reduce((s, t) => s + t, 0) / 6;
    if (referenceAverage === 0) return; // Never spent before — avoid division by zero

    const deltaPercent = ((currentTotal - referenceAverage) / referenceAverage) * 100;
    const absoluteDelta = currentTotal - referenceAverage;

    if (deltaPercent > 25 && absoluteDelta > 50) {
      results.push({ category, currentTotal, referenceAverage, deltaPercent, absoluteDelta });
    }
  });

  return results.sort((a, b) => b.deltaPercent - a.deltaPercent);
}, [allExpenses, periodMode, selectedMonth, selectedYear]);
```

**Nota importante**: questo `useMemo` usa `allExpenses` (NON `periodFilteredExpenses`) perché ha bisogno dell'intera storia per calcolare la reference window. Il filtraggio per mese anomalia avviene internamente.

**Nota sui tipi**: `AnomaliaItem` deve essere importato o ridichiarato in `AnalisiTab.tsx`. Poiché è definito in `AnomalieBlock.tsx`, esportarlo con `export interface AnomaliaItem { ... }` e importarlo in AnalisiTab.

### C. Callback per navigare al drill-down dalla chip

Aggiungere una callback che, quando l'utente clicca su una chip anomalia per categoria X, pre-seleziona quella categoria nel Pie drill-down e scrolla alla sezione distribuzione.

```tsx
// Ref for the distribution section (Pie/Sankey area)
const distributionRef = useRef<HTMLDivElement>(null);

/**
 * Navigate from anomaly chip to the pie chart drill-down for that category.
 * Scrolls to the distribution section and pre-selects the category.
 * Uses 'instant' (not 'smooth') per AGENTS.md scrollIntoView convention.
 */
const handleAnomaliaClick = useCallback((categoryName: string) => {
  // Find the color for this category from pie data
  const categoryColor = getExpensesByCategory(periodFilteredExpenses)
    .find(d => d.name === categoryName)?.color ?? COLORS[0];

  // Pre-select the category in the drill-down state machine
  setDrillDown({
    level: 'subcategory',
    chartType: 'expenses',
    selectedCategory: categoryName,
    selectedCategoryColor: categoryColor,
    selectedSubCategory: null,
  });

  // Scroll to distribution section
  setTimeout(() => {
    distributionRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, 50);
}, [periodFilteredExpenses, getExpensesByCategory, COLORS]);
```

**Nota**: `useCallback` richiede `import { useCallback } from 'react'`.

### D. Posizionamento nel JSX

Il blocco `<AnomalieBlock>` va inserito **dopo il hero KPI trio** e **prima della sezione Spese Maggiori**:

```tsx
{/* ── Hero KPI trio ─── */}
<div className="grid grid-cols-3 gap-px ...">
  ...
</div>

{/* ── Anomalie (condizionale) ─── */}
{/* Only rendered when anomalie detected — no "all clear" empty state */}
<AnomalieBlock
  anomalie={anomalieData}
  onCategoryClick={handleAnomaliaClick}
/>

{/* ── Spese Maggiori ─── */}
<TopExpensesBlock key={periodLabel} expenses={topExpenses} />
```

### E. Aggiungere `distributionRef` al div della sezione distribuzione

```tsx
{/* ── Distribution section (Sankey + Pie) ─── */}
<div ref={distributionRef} className="...">
  ...
</div>
```

---

## Edge cases da gestire

| Caso | Comportamento |
|------|--------------|
| Categoria nuova (monthsWithData < 3) | Skippata silenziosamente |
| referenceAverage === 0 | Skippata — non mostrare "+∞%" |
| Periodo = anno intero o storico | `anomalieData = []` → blocco non renderizzato |
| Mese corrente senza spese | `currentTotals.size === 0` → return [] early |
| Tutte le anomalie sotto soglia | `results = []` → blocco non renderizzato |
| allExpenses vuoto | `currentTotals.size === 0` → return [] early |

---

## Verifiche post-implementazione

1. `npx tsc --noEmit` — nessun errore
2. Selezionare un mese con dati storici: il blocco appare o è assente (non mostra placeholder)
3. Cliccare una chip: il drill-down si apre alla categoria giusta + scroll funziona
4. Con `periodMode === 'year'` e nessun mese selezionato: blocco non appare
5. Con `periodMode === 'history'`: blocco non appare
6. Console: nessun warning React (hooks prima degli early return, no component in render)

---

## Prompt di implementazione (Block 2)

```
Implementa il Block 2 della pagina Analisi seguendo la specifica in `specs/analisi-block-2-anomalie.md`.

Prima di iniziare:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente del progetto)
- Leggi COMMENTS.md e applicala mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e applicala
- Leggi `specs/analisi-block-2-anomalie.md` (questa spec)

Il Block 1 è già stato implementato. Parti da quello stato.

Scope esatto di questo blocco:
1. Crea `components/cashflow/AnomalieBlock.tsx` — nuovo componente a module level con `export interface AnomaliaItem` e `export function AnomalieBlock`
2. Modifica `components/cashflow/AnalisiTab.tsx` — 4 interventi:
   (a) importa AnomalieBlock e AnomaliaItem
   (b) aggiungi useMemo `anomalieData` (dopo periodFilteredExpenses, prima dello skeleton early return)
   (c) aggiungi useCallback `handleAnomaliaClick` + ref `distributionRef`
   (d) inserisci <AnomalieBlock> nel JSX tra KPI hero e TopExpensesBlock, aggiungi ref alla sezione distribuzione

Non implementare YoY, trend, savings rate (Block 3 e 4).

Al termine esegui `npx tsc --noEmit` e riporta l'output.
```
