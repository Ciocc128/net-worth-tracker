/**
 * Savings rate trend section — monthly line chart over the last N months.
 *
 * Shows how the savings rate evolves over time with a 20% target reference line.
 * ReferenceArea fills below 20% with a red tint to highlight deficit zones.
 *
 * Always rendered — shows "Dati insufficienti" placeholder when fewer than
 * 3 months have income data (< 3 non-null data points).
 *
 * Savings rate formula: ((totalIncome - totalExpenses) / totalIncome) * 100
 * Months without income → null → rendered as a gap in the line (connectNulls=false).
 */
'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Expense } from '@/types/expenses';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';

// 20% is the commonly cited minimum savings target for Italian households.
// Above this line = "on track"; below = "needs attention" (red zone).
const SAVINGS_TARGET = 20;

// ── SavingsRateLineChart ──────────────────────────────────────────────────────
// Module-level component required by React Compiler (never define inside render).

/**
 * LineChart for savings rate with target reference line and red zone below 20%.
 *
 * connectNulls={false} creates visible gaps for months without income —
 * this correctly represents "no data" rather than "zero savings".
 *
 * YAxis domain={['auto', 'auto']} scales to the actual data range to prevent
 * the flat-line problem (AGENTS.md: "Recharts Sparkline — flat line on large
 * absolute numbers").
 */
function SavingsRateLineChart({
  data,
  colors,
}: {
  data: Array<{ label: string; rate: number | null }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />

        {/* CSS vars for tooltip — never hardcoded hex (AGENTS.md: "Recharts tooltip") */}
        <Tooltip
          formatter={(value) =>
            value != null ? [`${Number(value).toFixed(1)}%`, 'Tasso di risparmio'] : ['—', '']
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

        {/* Red tint below target — signals "needs improvement" zone */}
        <ReferenceArea y1={-100} y2={SAVINGS_TARGET} fill="rgba(239,68,68,0.06)" fillOpacity={1} />

        {/* Dashed green reference line at 20% target */}
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
          // Gap at months with null income rather than connecting to zero
          connectNulls={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Range toggle ──────────────────────────────────────────────────────────────
// 'all' shows the entire history (default) so the long-term savings trend isn't
// truncated; 12m/24m give a focused recent window. Reuses the Framer layoutId +
// spring(400/35) pill pattern shared across the Analisi tab.

type TrendRange = '12m' | '24m' | 'all';

const RANGE_OPTIONS: ReadonlyArray<readonly [TrendRange, string]> = [
  ['12m', '12m'],
  ['24m', '24m'],
  ['all', 'Tutto'],
] as const;

function RangePillToggle({
  value,
  onChange,
}: {
  value: TrendRange;
  onChange: (value: TrendRange) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Finestra temporale"
      className="inline-flex items-center gap-1 rounded-full bg-muted p-1"
    >
      {RANGE_OPTIONS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'relative px-3 py-1 text-xs font-medium rounded-full transition-colors',
            value !== key && 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value === key && (
            <motion.span
              layoutId="savings-range-pill"
              className="absolute inset-0 rounded-full bg-background shadow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          )}
          <span className="relative z-10">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── SavingsRateTrendSection ───────────────────────────────────────────────────

interface SavingsRateTrendSectionProps {
  allExpenses: Expense[];
  historyStartYear: number;
}

/**
 * Renders the "Andamento Risparmio" card with a savings rate trend.
 *
 * A 12m/24m/Tutto range toggle (default Tutto) controls the window; 'Tutto'
 * spans the full history from historyStartYear to the current month.
 *
 * The section is always present in the DOM — it shows a placeholder message
 * when fewer than 3 months of income data are available.
 */
export function SavingsRateTrendSection({
  allExpenses,
  historyStartYear,
}: SavingsRateTrendSectionProps) {
  const chartColors = useChartColors();
  const [range, setRange] = useState<TrendRange>('all');

  const trendData = useMemo(() => {
    const today = new Date();
    // Convert to Italy timezone to get the correct current month
    const italyToday = new Date(today.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const currentMonth = italyToday.getMonth() + 1; // 1-12
    const currentYear = italyToday.getFullYear();

    // 'all' walks back far enough to reach January of historyStartYear; the loop
    // already skips months before that floor, so no empty leading buckets appear.
    const effectiveMonthsToShow =
      range === '12m'
        ? 12
        : range === '24m'
        ? 24
        : (currentYear - historyStartYear) * 12 + currentMonth;

    const result: Array<{ label: string; rate: number | null; month: number; year: number }> = [];

    let m = currentMonth;
    let y = currentYear;

    for (let i = 0; i < effectiveMonthsToShow; i++) {
      const month = m;
      const year = y;

      // Respect historyStartYear — skip months before user's data window
      if (year >= historyStartYear) {
        const monthExpenses = allExpenses.filter(e => {
          const d = toDate(e.date);
          return getItalyYear(d) === year && getItalyMonth(d) === month;
        });

        const income = monthExpenses
          .filter(e => e.type === 'income')
          .reduce((s, e) => s + e.amount, 0);

        const expenses = monthExpenses
          .filter(e => e.type !== 'income' && e.type !== 'transfer')
          .reduce((s, e) => s + Math.abs(e.amount), 0);

        // No income in this month → null (gap in chart, not zero)
        const rate = income > 0 ? ((income - expenses) / income) * 100 : null;

        result.unshift({
          label: `${MONTH_NAMES[month - 1].slice(0, 3)} ${year.toString().slice(2)}`,
          rate,
          month,
          year,
        });
      }

      // Walk backward one month
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }

    return result;
  }, [allExpenses, historyStartYear, range]);

  // Need at least 3 months with actual income data to show a meaningful trend
  const hasEnoughData = trendData.filter(d => d.rate !== null).length >= 3;

  const rangeSubtitle =
    range === '12m'
      ? 'ultimi 12 mesi'
      : range === '24m'
      ? 'ultimi 24 mesi'
      : 'intero storico';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Andamento Risparmio
          </CardTitle>
          <RangePillToggle value={range} onChange={setRange} />
        </div>
        <p className="text-xs text-muted-foreground">
          Tasso di risparmio mensile — {rangeSubtitle}
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
