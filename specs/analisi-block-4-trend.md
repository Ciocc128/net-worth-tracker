# Block 4 — Trend: Savings Rate + Category Trends Grid

**Prerequisito**: Block 1, 2, 3 completati.  
**Obiettivo**: Sostituire la sezione "Trend" esistente in AnalisiTab (collapsible generico con grafici mensili e annuali) con due sezioni più specifiche e informative: (1) "Andamento Risparmio" — savings rate trend a 24 mesi con reference line; (2) "Trend per Categoria" — griglia di sparkline per categoria con espansione inline.

---

## Cosa cambia rispetto alla sezione trend esistente

**Rimuovere** il blocco `<Collapsible>` esistente "Trend" (aperto/chiuso con `trendOpen` state) che contiene i grafici mensili e annuali generici.

**Aggiungere in sostituzione** due sezioni distinte, sempre visibili (non collassate di default):
1. `<SavingsRateTrendSection>` — savings rate mensile 24 mesi
2. `<CategoryTrendsGrid>` — sparkline per categoria

**Stato da rimuovere da AnalisiTab** (non più necessario):
- `const [trendOpen, setTrendOpen] = useState(false)`
- `const [showMonthlyTrendPercentage, setShowMonthlyTrendPercentage]`
- `const [showYearlyTrendPercentage, setShowYearlyTrendPercentage]`
- `const [showFullMonthlyHistory, setShowFullMonthlyHistory]`

---

## Sezione 1: `components/cashflow/SavingsRateTrendSection.tsx`

### Props

```tsx
interface SavingsRateTrendSectionProps {
  allExpenses: Expense[];
  historyStartYear: number;
  monthsToShow?: number; // default 24
}
```

### Comportamento

- Calcola il savings rate per ognuno degli ultimi `monthsToShow` mesi (default 24)
- Per ogni mese: `savingsRate = ((totalIncome - Math.abs(totalExpenses)) / totalIncome) * 100`
- Mese senza entrate: `savingsRate = null` (punto non renderizzato nel grafico)
- Mesi nel futuro: esclusi
- La sezione è **sempre renderizzata** — mostra placeholder se < 3 mesi di dati

### Struttura JSX

```tsx
/**
 * Monthly savings rate trend chart (24 months).
 *
 * Shows how savings rate evolves over time.
 * Reference line at 20% (good savings target for Italian households).
 * ReferenceArea splits chart into "above target" (green tint) and "below" (red tint).
 *
 * If a month has no income, that data point is null and rendered as a gap in the line.
 * Always rendered — shows "Dati insufficienti" when fewer than 3 data points available.
 */
export function SavingsRateTrendSection({
  allExpenses, historyStartYear, monthsToShow = 24
}: SavingsRateTrendSectionProps) {
  const chartColors = useChartColors();

  const trendData = useMemo(() => { /* see below */ }, [...]);
  const hasEnoughData = trendData.filter(d => d.rate !== null).length >= 3;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Andamento Risparmio
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tasso di risparmio mensile — ultimi {monthsToShow} mesi
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {!hasEnoughData ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Registra almeno 3 mesi di entrate per vedere il trend
          </div>
        ) : (
          <SavingsRateLineChart data={trendData} colors={chartColors} />
        )}
      </CardContent>
    </Card>
  );
}
```

### Calcolo dati (useMemo)

```tsx
const trendData = useMemo(() => {
  const today = new Date();
  const italyToday = new Date(today.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const currentMonth = italyToday.getMonth() + 1; // 1-12
  const currentYear = italyToday.getFullYear();

  const result: Array<{ label: string; rate: number | null; month: number; year: number }> = [];

  // Walk back monthsToShow months from current
  let m = currentMonth;
  let y = currentYear;

  for (let i = 0; i < monthsToShow; i++) {
    const month = m;
    const year = y;

    // Skip months before historyStartYear
    if (year >= historyStartYear) {
      const monthExpenses = allExpenses.filter(e => {
        const d = toDate(e.date);
        return getItalyYear(d) === year && getItalyMonth(d) === month;
      });

      const income = monthExpenses
        .filter(e => e.type === 'income')
        .reduce((s, e) => s + e.amount, 0);

      const expenses = monthExpenses
        .filter(e => e.type !== 'income')
        .reduce((s, e) => s + Math.abs(e.amount), 0);

      const rate = income > 0
        ? ((income - expenses) / income) * 100
        : null; // No income data = gap in chart

      result.unshift({
        label: `${MONTH_NAMES[month - 1].slice(0, 3)} ${year.toString().slice(2)}`,
        rate,
        month,
        year,
      });
    }

    // Move to previous month
    m--;
    if (m < 1) { m = 12; y--; }
  }

  return result;
}, [allExpenses, historyStartYear, monthsToShow]);
```

### Sub-componente SavingsRateLineChart (module level)

```tsx
const SAVINGS_TARGET = 20; // Reference line at 20%

/**
 * LineChart for savings rate with reference line and area split at 20%.
 *
 * ReferenceArea fills the chart below 20% with a subtle red tint
 * and above 20% with a subtle green tint to give immediate visual context.
 *
 * connectNulls={false} creates visible gaps for months without income.
 */
function SavingsRateLineChart({
  data, colors
}: {
  data: Array<{ label: string; rate: number | null }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="savings-above" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity={0.04} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />

        <Tooltip
          formatter={(value: number | null) =>
            value !== null ? [`${value.toFixed(1)}%`, 'Tasso di risparmio'] : ['—', '']
          }
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
            fontSize: 12,
            borderRadius: 8,
          }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
        />

        {/* Reference area — red tint below target */}
        <ReferenceArea y1={-100} y2={SAVINGS_TARGET}
          fill="rgba(239,68,68,0.06)" fillOpacity={1} />

        {/* Reference line at target */}
        <ReferenceLine
          y={SAVINGS_TARGET}
          stroke="rgb(16 185 129)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: `${SAVINGS_TARGET}% obiettivo`,
            position: 'insideTopRight',
            fontSize: 10,
            fill: 'rgb(16 185 129)',
          }}
        />

        <Line
          type="monotone"
          dataKey="rate"
          stroke={colors[0] ?? '#6366f1'}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0 }}
          connectNulls={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Import necessari per ReferenceArea, ReferenceLine**: già disponibili in recharts (usati in AnalisiTab esistente).

---

## Sezione 2: `components/cashflow/CategoryTrendsGrid.tsx`

### Props

```tsx
interface CategoryTrendsGridProps {
  allExpenses: Expense[];
  historyStartYear: number;
  monthsToShow?: number; // default 12
}
```

### Comportamento

- Mostra una griglia di card per ogni categoria di spesa (non income) con almeno 3 mesi di dati negli ultimi `monthsToShow` mesi
- Ogni card: nome categoria + sparkline 12 mesi + totale del periodo
- Ordinata per spesa totale decrescente (categorie più costose prima)
- Click su una card → espande inline un full bar chart via Radix `<Collapsible>`
- Solo una card espansa alla volta (clicking un'altra chiude la precedente)
- Grid: `grid-cols-1 sm:grid-cols-2 desktop:grid-cols-3`

### Struttura JSX

```tsx
/**
 * Grid of expense categories with sparkline trends.
 *
 * Each category card shows the last 12 months of spending as a sparkline.
 * Click to expand a full bar chart inline (Collapsible pattern per AGENTS.md).
 *
 * Only categories with data in ≥3 of the last 12 months are shown.
 * Ordered by total spend descending.
 */
export function CategoryTrendsGrid({
  allExpenses, historyStartYear, monthsToShow = 12
}: CategoryTrendsGridProps) {
  const chartColors = useChartColors();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const categoryData = useMemo(() => { /* see below */ }, [...]);

  if (categoryData.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Trend per Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            Registra almeno 3 mesi di spese per vedere il trend per categoria
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Trend per Categoria
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ultimi {monthsToShow} mesi · clicca per espandere
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-3 gap-3">
          {categoryData.map((cat, index) => (
            <CategoryTrendCard
              key={cat.name}
              category={cat}
              colorIndex={index}
              colors={chartColors}
              isExpanded={expandedCategory === cat.name}
              onToggle={() => setExpandedCategory(
                expandedCategory === cat.name ? null : cat.name
              )}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Calcolo categoryData (useMemo)

```tsx
interface CategoryTrendData {
  name: string;
  total: number;        // total in last monthsToShow months
  monthlyData: Array<{ label: string; amount: number }>;  // 12 data points
  monthsWithData: number;
}

const categoryData = useMemo((): CategoryTrendData[] => {
  const today = new Date();
  const italyToday = new Date(today.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const currentMonth = italyToday.getMonth() + 1;
  const currentYear = italyToday.getFullYear();

  // Build the last monthsToShow months array
  const months: Array<{ year: number; month: number; label: string }> = [];
  let m = currentMonth, y = currentYear;
  for (let i = 0; i < monthsToShow; i++) {
    months.unshift({
      year: y, month: m,
      label: `${MONTH_NAMES[m - 1].slice(0, 3)} ${y.toString().slice(2)}`,
    });
    m--; if (m < 1) { m = 12; y--; }
  }

  // Collect all non-income expenses in the window
  const windowExpenses = allExpenses.filter(e => {
    if (e.type === 'income') return false;
    const d = toDate(e.date);
    const ey = getItalyYear(d);
    const em = getItalyMonth(d);
    return months.some(mo => mo.year === ey && mo.month === em);
  });

  // Group by category
  const categories = new Set(windowExpenses.map(e => e.categoryName));

  const result: CategoryTrendData[] = [];

  categories.forEach(catName => {
    const catExpenses = windowExpenses.filter(e => e.categoryName === catName);

    const monthlyData = months.map(mo => ({
      label: mo.label,
      amount: catExpenses
        .filter(e => {
          const d = toDate(e.date);
          return getItalyYear(d) === mo.year && getItalyMonth(d) === mo.month;
        })
        .reduce((s, e) => s + Math.abs(e.amount), 0),
    }));

    const monthsWithData = monthlyData.filter(d => d.amount > 0).length;
    if (monthsWithData < 3) return; // Skip categories with sparse data

    const total = monthlyData.reduce((s, d) => s + d.amount, 0);
    result.push({ name: catName, total, monthlyData, monthsWithData });
  });

  return result.sort((a, b) => b.total - a.total);
}, [allExpenses, historyStartYear, monthsToShow]);
```

### Sub-componente CategoryTrendCard (module level)

```tsx
/**
 * Individual category trend card with collapsed sparkline and expanded bar chart.
 *
 * Uses Radix Collapsible per AGENTS.md recommendation:
 * "prefer Radix Collapsible for large/variable-height content over
 * AnimatePresence + height:'auto'"
 *
 * Chevron rotation via data-state (CollapsibleTrigger asChild pattern).
 */
function CategoryTrendCard({
  category, colorIndex, colors, isExpanded, onToggle
}: {
  category: CategoryTrendData;
  colorIndex: number;
  colors: string[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const color = colors[colorIndex % colors.length] ?? '#6366f1';

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        {/* Use plain div (not Button) to avoid nested button AGENTS.md gotcha */}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
          className="group rounded-xl border border-border bg-card p-3 cursor-pointer hover:bg-muted/30 transition-colors"
          aria-expanded={isExpanded}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate text-foreground">
                {category.name}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {formatCurrency(category.total)} / {category.monthlyData.length}m
              </p>
            </div>
            <ChevronDown className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ml-2',
              isExpanded && 'rotate-180'
            )} />
          </div>

          {/* Sparkline — hidden when expanded (full chart replaces it) */}
          {!isExpanded && (
            <SparklineChart data={category.monthlyData} color={color} />
          )}
        </div>
      </CollapsibleTrigger>

      {/* Expanded full bar chart */}
      <CollapsibleContent>
        <div className="rounded-xl border border-border bg-card px-3 pb-3 mt-0 -mt-1 rounded-t-none border-t-0">
          <FullCategoryBarChart data={category.monthlyData} color={color} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

### SparklineChart (module level)

```tsx
/**
 * Minimal sparkline — no axes, no labels, just the trend shape.
 * Fixed height 48px. Bypasses ResponsiveContainer (fixed parent width).
 */
function SparklineChart({
  data, color
}: {
  data: Array<{ label: string; amount: number }>;
  color: string;
}) {
  return (
    <AreaChart
      width={180}  // Fixed width — avoids ResponsiveContainer -1 warning (AGENTS.md)
      height={48}
      data={data}
      margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
    >
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="amount"
        stroke={color}
        strokeWidth={1.5}
        fill={`url(#spark-${color.replace('#', '')})`}
        dot={false}
        isAnimationActive={false}  // Sparklines: no animation (performance)
      />
    </AreaChart>
  );
}
```

**Nota critcica**: `SparklineChart` usa larghezza fissa (`width={180}`) e bypassa `ResponsiveContainer` per evitare il warning `-1` su grafici con dimensioni note (AGENTS.md: "Real fix for fixed-size containers: bypass ResponsiveContainer entirely"). Il contenitore padre (la card) ha larghezza variabile ma il sparkline è un'icona visiva, non un grafico interattivo — non serve responsive.

**Problema**: se la card è più larga di 180px su desktop, il sparkline non riempirà la card. Per evitarlo, avvolgere in un `div` con `overflow-hidden` e usare `width="100%"` + `height={48}` con `ResponsiveContainer`. **Usare questa alternativa**:

```tsx
function SparklineChart({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="amount" stroke={color} strokeWidth={1.5}
          fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`}
          dot={false} isAnimationActive={false} />
        <YAxis hide domain={['auto', 'auto']} />  {/* Fix: evita la flat line (AGENTS.md) */}
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

**Nota critcica 2**: aggiungere `<YAxis hide domain={['auto', 'auto']} />` è OBBLIGATORIO per il sparkline — senza di esso un range piccolo (es: €500→€600) appare come linea piatta (AGENTS.md: "Recharts Sparkline — flat line on large absolute numbers").

### FullCategoryBarChart (module level)

```tsx
/**
 * Full bar chart for expanded category view.
 * Shows monthly spend for the last 12 months with axis and tooltip.
 */
function FullCategoryBarChart({
  data, color
}: {
  data: Array<{ label: string; amount: number }>;
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Spese']}
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
            fontSize: 11,
            borderRadius: 8,
          }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
          cursor={{ fill: 'rgba(128,128,128,0.1)' }}
        />
        <Bar dataKey="amount" fill={color}
          animationDuration={400} animationEasing="ease-out"
          radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

---

## Modifiche a `components/cashflow/AnalisiTab.tsx`

### A. Rimuovere stati trend non più necessari

```tsx
// RIMUOVERE questi 4 stati:
const [trendOpen, setTrendOpen] = useState(false);
const [showMonthlyTrendPercentage, setShowMonthlyTrendPercentage] = useState(false);
const [showYearlyTrendPercentage, setShowYearlyTrendPercentage] = useState(false);
const [showFullMonthlyHistory, setShowFullMonthlyHistory] = useState(false);
```

### B. Rimuovere il blocco Collapsible trend esistente dal JSX

Trovare e **rimuovere** il blocco `<Collapsible open={trendOpen} onOpenChange={setTrendOpen}>` che contiene i grafici di trend esistenti (solitamente verso la fine del return, dopo la sezione Pie).

### C. Aggiungere nuovi import

```tsx
import { SavingsRateTrendSection } from '@/components/cashflow/SavingsRateTrendSection';
import { CategoryTrendsGrid } from '@/components/cashflow/CategoryTrendsGrid';
```

### D. Inserire le nuove sezioni nel JSX

**Dopo** la sezione `<ConfrontoAnnualeSection>` (Block 3), **in fondo alla pagina**:

```tsx
{/* ── Andamento Risparmio ─── */}
{/* Always rendered — shows placeholder when insufficient data */}
<SavingsRateTrendSection
  allExpenses={allExpenses}
  historyStartYear={historyStartYear}
  monthsToShow={24}
/>

{/* ── Trend per Categoria ─── */}
{/* Always rendered — shows placeholder when insufficient data */}
<CategoryTrendsGrid
  allExpenses={allExpenses}
  historyStartYear={historyStartYear}
  monthsToShow={12}
/>
```

### E. Verificare imports non più necessari

Dopo aver rimosso il vecchio blocco trend, verificare se questi import sono ancora usati in AnalisiTab. Se non lo sono, rimuoverli:
- `ChevronDown` (controllare — potrebbe essere usato altrove nel file)
- Import di Recharts non più usati nel trend section rimosso

---

## Import necessari in SavingsRateTrendSection.tsx

```tsx
'use client';

import { useMemo } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
```

## Import necessari in CategoryTrendsGrid.tsx

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cn } from '@/lib/utils';
```

---

## Edge cases

### SavingsRateTrendSection

| Caso | Comportamento |
|------|--------------|
| Mese senza entrate | `rate = null` → gap nella line chart (`connectNulls={false}`) |
| Meno di 3 mesi di dati | Placeholder "Registra almeno 3 mesi di entrate..." |
| Savings rate negativo (deficit) | Linea scende sotto lo 0 — ReferenceArea rossa copre quel range |
| Savings rate > 100% | Possibile con entrate straordinarie — nessun cap, mostra il valore reale |

### CategoryTrendsGrid

| Caso | Comportamento |
|------|--------------|
| Categoria con < 3 mesi di dati | Esclusa dalla griglia |
| Nessuna categoria con 3+ mesi | Placeholder "Registra almeno 3 mesi..." |
| Categoria con nome lungo | Troncato con `truncate` CSS (card a larghezza fissa) |
| Card espansa → click su altra card | Prima card si chiude, nuova si apre (onToggle logic) |
| Solo 1 categoria disponibile | Griglia con 1 card — ok, nessun caso speciale |
| linearGradient id collision | ID generato da `color.replace(/[^a-z0-9]/gi, '')` — univoco per colore |

---

## Verifiche post-implementazione

1. `npx tsc --noEmit` — nessun errore
2. `SavingsRateTrendSection`: grafico mostra i mesi corretti, reference line a 20% visibile
3. Mesi senza entrate: gap nel grafico (non linea a 0)
4. `CategoryTrendsGrid`: sparklines non flat (YAxis hidden con domain auto)
5. Click su card: espande il full bar chart inline, nessun modal
6. Click su seconda card: prima si chiude, seconda si apre
7. Tooltip in entrambi i componenti usa CSS vars (no hardcoded colors)
8. Il vecchio `<Collapsible>` trend è rimosso — nessun riferimento a `trendOpen` in AnalisiTab
9. Performance: nessun re-render anomalo su apertura/chiusura category card (componenti a module level, non inline)

---

## Prompt di implementazione (Block 4)

```
Implementa il Block 4 della pagina Analisi seguendo la specifica in `specs/analisi-block-4-trend.md`.

Prima di iniziare:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente del progetto)
- Leggi COMMENTS.md e applicala mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e applicala
- Leggi `specs/analisi-block-4-trend.md` (questa spec)

I Block 1, 2 e 3 sono già stati implementati. Parti da quello stato.

Scope esatto di questo blocco:
1. Crea `components/cashflow/SavingsRateTrendSection.tsx` — savings rate line chart 24m con reference line 20%, sub-componente SavingsRateLineChart a module level
2. Crea `components/cashflow/CategoryTrendsGrid.tsx` — griglia sparkline per categoria, 3 sub-componenti a module level: CategoryTrendCard, SparklineChart, FullCategoryBarChart
3. Modifica `components/cashflow/AnalisiTab.tsx`:
   (a) rimuovi i 4 useState del vecchio trend section (trendOpen, showMonthlyTrendPercentage, showYearlyTrendPercentage, showFullMonthlyHistory)
   (b) rimuovi il vecchio blocco <Collapsible> trend dal JSX
   (c) importa SavingsRateTrendSection e CategoryTrendsGrid
   (d) inserisci le due nuove sezioni in fondo al return, dopo ConfrontoAnnualeSection
   (e) verifica e rimuovi import recharts non più usati

Attenzione critica:
- SparklineChart DEVE avere <YAxis hide domain={['auto', 'auto']} /> altrimenti le sparkline appaiono piatte (AGENTS.md: "Recharts Sparkline — flat line on large absolute numbers")
- Tutti i sub-componenti DEVONO essere a module level, NON definiti dentro altri componenti (AGENTS.md: "React Compiler: components must be at module level")
- Tooltip DEVONO usare CSS vars var(--card), var(--border), var(--card-foreground) — mai hex hardcoded

Al termine esegui `npx tsc --noEmit` e riporta l'output.
```
