# Block 3 — YoY: Sezione "Confronto Annuale"

**Prerequisito**: Block 1 e Block 2 completati.  
**Obiettivo**: Aggiungere la sezione "Confronto Annuale" in `AnalisiTab` — un bar chart che confronta spese e entrate dell'anno selezionato con l'anno precedente, con toggle tra vista mensile e per categoria.

---

## Comportamento per period mode

| `periodMode` | `selectedMonth` | Comportamento sezione |
|---|---|---|
| `'current'` | `null` | YTD: mesi Jan → mese corrente, confronto vs stesso periodo anno prec. |
| `'year'` | `null` | Anno completo selezionato vs anno precedente |
| `'year'` | `number` | Singolo mese selezionato vs stesso mese anno precedente (bar singola) |
| `'history'` | `null` | Multi-year line chart: totali annuali per tutti gli anni disponibili |

**Quando nascondere la sezione**: mai — anche con un solo anno di dati mostrare il placeholder "Dati insufficienti per il confronto" (AGENTS.md: rolling charts always rendered).

---

## Due modalità di visualizzazione (toggle)

### Modalità A — "Mensile"
- X-axis: mesi (Jan, Feb, ..., Dic)
- Y-axis: importo €
- Due barre affiancate per mese: anno corrente (chartColors[0]) e anno precedente (chartColors[1])
- Solo spese (non income) — la domanda "dove va il mio denaro" è sulle uscite
- Mesi nel futuro (anno corrente): barre assenti o grayed out

### Modalità B — "Per Categoria"
- X-axis: categorie di spesa
- Y-axis: importo €
- Due barre affiancate per categoria: anno corrente vs anno precedente
- Ordinato per spesa più alta (anno corrente decrescente)
- Max 8 categorie visibili (le restanti collassate in "Altro")

### Modalità C — "Storico" (solo per periodMode === 'history')
- X-axis: anni
- Y-axis: importo €
- Single bar per anno (totale annuale spese)
- LineChart con Area sopra i bar per visibilità trend (o solo Line)
- Non ha toggle Mensile/Per Categoria

---

## Nuovo componente: `components/cashflow/ConfrontoAnnualeSection.tsx`

### Props interface

```tsx
interface ConfrontoAnnualeSectionProps {
  allExpenses: Expense[];
  selectedYear: number | null;         // null solo in periodMode === 'history'
  selectedMonth: number | null;
  periodMode: PeriodMode;              // 'current' | 'year' | 'history'
  historyStartYear: number;
}
```

### Struttura del componente

```tsx
/**
 * Year-over-year comparison section for AnalisiTab.
 *
 * Three display variants depending on periodMode:
 * - current/year: side-by-side bar chart (monthly or per-category toggle)
 * - history: multi-year annual totals line chart
 *
 * Always rendered — shows "Dati insufficienti" placeholder when
 * comparison data doesn't exist (single year of history).
 *
 * Colors: chartColors[0] = current year, chartColors[1] = previous year.
 * Never hardcoded hex — always useChartColors() per AGENTS.md.
 */
export function ConfrontoAnnualeSection({
  allExpenses, selectedYear, selectedMonth, periodMode, historyStartYear
}: ConfrontoAnnualeSectionProps) {
  const chartColors = useChartColors();
  const [viewMode, setViewMode] = useState<'mensile' | 'categoria'>('mensile');

  // ... computed data ...

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Confronto Annuale
          </CardTitle>

          {/* Toggle visibile solo in modalità current/year */}
          {periodMode !== 'history' && (
            <div role="tablist" aria-label="Vista confronto" className="inline-flex items-center gap-1 rounded-full bg-muted p-1">
              {(['mensile', 'categoria'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    'relative px-3 py-1 text-xs font-medium rounded-full transition-colors capitalize',
                    viewMode !== mode && 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {viewMode === mode && (
                    <motion.span
                      layoutId="confronto-view-pill"
                      className="absolute inset-0 rounded-full bg-background shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10 capitalize">
                    {mode === 'mensile' ? 'Mensile' : 'Per Categoria'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subtitle: "2025 vs 2024" o "Gen 2025 vs Gen 2024" */}
        {comparisonSubtitle && (
          <p className="text-xs text-muted-foreground">{comparisonSubtitle}</p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* STATO: dati insufficienti */}
        {!hasComparisonData && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Dati insufficienti per il confronto
          </div>
        )}

        {/* MODALITÀ: history → multi-year */}
        {periodMode === 'history' && hasComparisonData && (
          <HistoryLineChart data={multiYearData} colors={chartColors} />
        )}

        {/* MODALITÀ: current/year → side-by-side bars */}
        {periodMode !== 'history' && hasComparisonData && viewMode === 'mensile' && (
          <MensileBarChart
            data={mensileData}
            currentYear={currentYearLabel}
            prevYear={prevYearLabel}
            colors={chartColors}
          />
        )}
        {periodMode !== 'history' && hasComparisonData && viewMode === 'categoria' && (
          <CategoriaBarChart
            data={categoriaData}
            currentYear={currentYearLabel}
            prevYear={prevYearLabel}
            colors={chartColors}
          />
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Logica dei dati (tutti useMemo interni al componente)

### A. Determinare currentYear e prevYear

```tsx
const currentYearLabel = useMemo(() => {
  if (periodMode === 'current') return getItalyYear();
  if (periodMode === 'year' && selectedYear !== null) return selectedYear;
  return null;
}, [periodMode, selectedYear]);

const prevYearLabel = useMemo(() => {
  return currentYearLabel !== null ? currentYearLabel - 1 : null;
}, [currentYearLabel]);
```

### B. hasComparisonData

```tsx
const hasComparisonData = useMemo(() => {
  if (periodMode === 'history') {
    // Need at least 2 distinct years of data
    const years = new Set(allExpenses.map(e => getItalyYear(toDate(e.date))));
    return years.size >= 2;
  }
  // For current/year: need data in prevYear
  if (prevYearLabel === null) return false;
  return allExpenses.some(e => getItalyYear(toDate(e.date)) === prevYearLabel);
}, [allExpenses, periodMode, prevYearLabel]);
```

### C. mensileData — per il BarChart mensile

```tsx
/**
 * For each month 1-12 (or 1-currentMonth for 'current' mode):
 * compute total expenses for currentYear and prevYear.
 *
 * Future months in 'current' mode have currentValue = 0 (bars omitted).
 * All values are absolute (Math.abs) since expenses are stored negative.
 */
const mensileData = useMemo(() => {
  if (periodMode === 'history' || currentYearLabel === null || prevYearLabel === null) return [];

  const maxMonth = periodMode === 'current' ? getItalyMonth() : 12;
  // For single-month selection: show only that month
  const monthsToShow = selectedMonth !== null
    ? [selectedMonth]
    : Array.from({ length: maxMonth }, (_, i) => i + 1);

  return monthsToShow.map(month => {
    const monthName = MONTH_NAMES[month - 1].slice(0, 3); // "Gen", "Feb", etc.

    const currentValue = allExpenses
      .filter(e =>
        e.type !== 'income' &&
        getItalyYear(toDate(e.date)) === currentYearLabel &&
        getItalyMonth(toDate(e.date)) === month
      )
      .reduce((s, e) => s + Math.abs(e.amount), 0);

    const prevValue = allExpenses
      .filter(e =>
        e.type !== 'income' &&
        getItalyYear(toDate(e.date)) === prevYearLabel &&
        getItalyMonth(toDate(e.date)) === month
      )
      .reduce((s, e) => s + Math.abs(e.amount), 0);

    return { month: monthName, current: currentValue, prev: prevValue };
  });
}, [allExpenses, currentYearLabel, prevYearLabel, periodMode, selectedMonth]);
```

### D. categoriaData — per il BarChart per categoria

```tsx
/**
 * Group expenses by category for currentYear and prevYear.
 * Include all categories present in either year.
 * Sort by current year total descending.
 * Cap at 8 categories — remaining grouped as "Altro".
 */
const categoriaData = useMemo(() => {
  if (periodMode === 'history' || currentYearLabel === null || prevYearLabel === null) return [];

  const filterByYear = (year: number) => {
    return allExpenses.filter(e => {
      const d = toDate(e.date);
      if (e.type === 'income') return false;
      if (getItalyYear(d) !== year) return false;
      if (periodMode === 'current') {
        // YTD: same months in both years
        return getItalyMonth(d) <= getItalyMonth();
      }
      if (selectedMonth !== null) return getItalyMonth(d) === selectedMonth;
      return true;
    });
  };

  const currentExp = filterByYear(currentYearLabel);
  const prevExp = filterByYear(prevYearLabel);

  // Build category map
  const categories = new Set([
    ...currentExp.map(e => e.categoryName),
    ...prevExp.map(e => e.categoryName),
  ]);

  const data = Array.from(categories).map(cat => ({
    category: cat.length > 12 ? cat.slice(0, 11) + '…' : cat,
    current: currentExp.filter(e => e.categoryName === cat).reduce((s, e) => s + Math.abs(e.amount), 0),
    prev: prevExp.filter(e => e.categoryName === cat).reduce((s, e) => s + Math.abs(e.amount), 0),
  })).sort((a, b) => b.current - a.current);

  // Cap at 8, group rest as "Altro"
  if (data.length <= 8) return data;
  const top8 = data.slice(0, 8);
  const rest = data.slice(8);
  top8.push({
    category: 'Altro',
    current: rest.reduce((s, d) => s + d.current, 0),
    prev: rest.reduce((s, d) => s + d.prev, 0),
  });
  return top8;
}, [allExpenses, currentYearLabel, prevYearLabel, periodMode, selectedMonth]);
```

### E. multiYearData — per il LineChart storico

```tsx
/**
 * Annual totals for each year from historyStartYear to current year.
 */
const multiYearData = useMemo(() => {
  if (periodMode !== 'history') return [];

  const years = new Set(allExpenses.map(e => getItalyYear(toDate(e.date))));
  return Array.from(years)
    .filter(y => y >= historyStartYear)
    .sort((a, b) => a - b)
    .map(year => ({
      year: year.toString(),
      spese: allExpenses
        .filter(e => e.type !== 'income' && getItalyYear(toDate(e.date)) === year)
        .reduce((s, e) => s + Math.abs(e.amount), 0),
    }));
}, [allExpenses, periodMode, historyStartYear]);
```

---

## Sub-componenti interni (module level in ConfrontoAnnualeSection.tsx)

### MensileBarChart

```tsx
/**
 * Side-by-side monthly bar chart for YoY comparison.
 * Colors: colors[0] = current year, colors[1] = previous year.
 */
function MensileBarChart({
  data, currentYear, prevYear, colors
}: {
  data: Array<{ month: string; current: number; prev: number }>;
  currentYear: number;
  prevYear: number;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        barCategoryGap="20%" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), '']}
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
            fontSize: 12,
            borderRadius: 8,
          }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
          cursor={{ fill: 'rgba(128,128,128,0.1)' }}
        />
        <Legend
          formatter={(value) => value === 'current' ? currentYear.toString() : prevYear.toString()}
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        />
        <Bar dataKey="current" fill={colors[0] ?? '#6366f1'}
          animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
        <Bar dataKey="prev" fill={colors[1] ?? '#8b5cf6'}
          animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### CategoriaBarChart

Stessa struttura di `MensileBarChart` ma con `dataKey="category"` sull'asse X e `layout="vertical"` per leggibilità su mobile:

```tsx
/**
 * Horizontal grouped bar chart for category comparison.
 * layout="vertical" gives more room to category labels on mobile.
 */
function CategoriaBarChart(...) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical"
        margin={{ top: 4, right: 4, left: 60, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="category"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} width={56} />
        <Tooltip ... /> {/* same as MensileBarChart */}
        <Legend ... />
        <Bar dataKey="current" fill={colors[0] ?? '#6366f1'}
          animationDuration={600} animationEasing="ease-out" radius={[0, 3, 3, 0]} />
        <Bar dataKey="prev" fill={colors[1] ?? '#8b5cf6'}
          animationDuration={600} animationEasing="ease-out" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### HistoryLineChart

```tsx
/**
 * Multi-year annual totals bar chart for historical mode.
 * Single bar per year — no comparison needed.
 */
function HistoryLineChart({
  data, colors
}: {
  data: Array<{ year: string; spese: number }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Spese']}
          contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)',
            color: 'var(--card-foreground)', fontSize: 12, borderRadius: 8 }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
          cursor={{ fill: 'rgba(128,128,128,0.1)' }}
        />
        <Bar dataKey="spese" fill={colors[0] ?? '#6366f1'}
          animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

---

## Stringa subtitle

```tsx
const comparisonSubtitle = useMemo(() => {
  if (periodMode === 'history') return null;
  if (currentYearLabel === null || prevYearLabel === null) return null;
  if (selectedMonth !== null) {
    return `${MONTH_NAMES[selectedMonth - 1]} ${currentYearLabel} vs ${MONTH_NAMES[selectedMonth - 1]} ${prevYearLabel}`;
  }
  if (periodMode === 'current') {
    return `${currentYearLabel} YTD vs ${prevYearLabel} (stessi mesi)`;
  }
  return `${currentYearLabel} vs ${prevYearLabel}`;
}, [periodMode, currentYearLabel, prevYearLabel, selectedMonth]);
```

---

## Modifiche a `components/cashflow/AnalisiTab.tsx`

### Import

```tsx
import { ConfrontoAnnualeSection } from '@/components/cashflow/ConfrontoAnnualeSection';
```

### Posizionamento nel JSX

La sezione va inserita **dopo il blocco distribuzione (Sankey + Pie)** e **prima del trend section esistente**:

```tsx
{/* ── Distribuzione (Sankey + Pie) ─── */}
<div ref={distributionRef}>
  ...
</div>

{/* ── Confronto Annuale ─── */}
{/* Always rendered — shows placeholder when comparison data unavailable */}
<ConfrontoAnnualeSection
  allExpenses={allExpenses}
  selectedYear={selectedYear}
  selectedMonth={selectedMonth}
  periodMode={periodMode}
  historyStartYear={historyStartYear}
/>

{/* ── Trend section (collapsible, esistente) ─── */}
<Collapsible open={trendOpen} onOpenChange={setTrendOpen}>
  ...
</Collapsible>
```

---

## Import necessari in ConfrontoAnnualeSection.tsx

```tsx
'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cn } from '@/lib/utils';
```

**Nota**: `PeriodMode` deve essere esportata da `AnalisiTab.tsx`:
```tsx
// In AnalisiTab.tsx: aggiungere export
export type PeriodMode = 'current' | 'year' | 'history';
```

Poi in ConfrontoAnnualeSection.tsx:
```tsx
import { type PeriodMode } from '@/components/cashflow/AnalisiTab';
```

---

## Edge cases

| Caso | Comportamento |
|------|--------------|
| Un solo anno di dati | `hasComparisonData = false` → placeholder "Dati insufficienti" |
| Anno selezionato = primo anno disponibile | `prevYearLabel` non ha dati → `hasComparisonData = false` |
| Categoria con nome lungo (>12 char) | Troncata a 11 char + "…" nel grafico categoria |
| Più di 8 categorie | Ultime N collassate in "Altro" |
| Mese corrente parziale (es: solo 15 giorni) | Barre mostrate normalmente — utente sa che è parziale |
| `periodMode === 'history'` + 1 anno | `years.size < 2` → placeholder |

---

## Verifiche post-implementazione

1. `npx tsc --noEmit` — nessun errore
2. In modalità "Anno Corrente": grafico mensile mostra mesi Jan→mese corrente con barre YoY
3. Toggle Mensile/Per Categoria: animazione Framer Motion spring corretta
4. In modalità "Storico": grafico multi-anno (nessun toggle)
5. Se ho solo 1 anno di dati: placeholder "Dati insufficienti" visibile (non sezione vuota)
6. Tooltip usa CSS vars (no hardcoded colori)
7. Nessun warn Recharts `-1` width/height

---

## Prompt di implementazione (Block 3)

```
Implementa il Block 3 della pagina Analisi seguendo la specifica in `specs/analisi-block-3-confronto-annuale.md`.

Prima di iniziare:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente del progetto)
- Leggi COMMENTS.md e applicala mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e applicala
- Leggi `specs/analisi-block-3-confronto-annuale.md` (questa spec)

I Block 1 e 2 sono già stati implementati. Parti da quello stato.

Scope esatto di questo blocco:
1. Crea `components/cashflow/ConfrontoAnnualeSection.tsx` — nuovo componente con 3 sub-componenti interni a module level (MensileBarChart, CategoriaBarChart, HistoryLineChart)
2. Modifica `components/cashflow/AnalisiTab.tsx`:
   (a) esporta `PeriodMode` type (era solo dichiarato, ora serve in ConfrontoAnnualeSection)
   (b) importa ConfrontoAnnualeSection
   (c) inserisci <ConfrontoAnnualeSection> nel JSX dopo la sezione distribuzione e prima del trend collapsible

Non implementare savings rate trend o category trends grid (Block 4).

Al termine esegui `npx tsc --noEmit` e riporta l'output.
```
