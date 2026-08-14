/**
 * Conditional anomaly block for AnalisiTab.
 *
 * Renders only when anomalie.length > 0. Each chip is clickable and
 * navigates to the pie chart drill-down for that category.
 *
 * DESIGN: filled warning banner via the theme-aware --warning/--warning-foreground/
 * --warning-border tokens (same set as the low-balance banner in dashboard/layout.tsx)
 * — NOT raw amber-* Tailwind classes, which stay literal amber regardless of theme.
 *
 * ALGORITHM: anomalies are spending categories whose current-month total
 * exceeds the 6-month rolling average by >25% AND >€50 in absolute terms.
 * The parent (AnalisiTab) computes anomalieData and passes it here.
 */
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/services/chartService';
import type { SpendingAnomaly } from '@/lib/utils/cashflowComposition';

interface AnomalieBlockProps {
  anomalie: SpendingAnomaly[];
  /**
   * The month the anomalies were computed for (e.g. "Agosto 2026"). Declared in the
   * caption because in "Anno Corrente" without a month filter the anomalies run on
   * the CURRENT calendar month while the KPIs above cover the whole year — a window
   * mismatch the copy must state, not hide behind "mese selezionato".
   */
  monthLabel: string | null;
  /**
   * Receives the whole anomaly, not just a name: the caller drills into a specific
   * category document, and two same-named categories of different types produce two
   * distinct chips that must lead to two distinct places.
   */
  onCategoryClick: (anomaly: SpendingAnomaly) => void;
}

export function AnomalieBlock({ anomalie, monthLabel, onCategoryClick }: AnomalieBlockProps) {
  if (anomalie.length === 0) return null;

  return (
    <div className="rounded-xl border border-warning-border bg-warning px-4 py-3 space-y-3">
      {/* Header + legenda formato */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0" />
          <p className="text-xs font-semibold uppercase tracking-widest text-warning-foreground">
            Da controllare
          </p>
        </div>
        <p className="text-xs text-warning-foreground/70 pl-6">
          {monthLabel ?? 'Mese in analisi'}: spesa superiore alla media dei 6 mesi precedenti · (media → mese)
        </p>
      </div>

      {/* Chips — wrap on all viewports */}
      <div className="flex flex-wrap gap-2">
        {anomalie.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onCategoryClick(a)}
            className="inline-flex items-center gap-1.5 rounded-full border border-warning-border bg-warning-foreground/10 px-3 py-1.5 text-sm font-medium text-warning-foreground hover:bg-warning-foreground/15 transition-colors"
          >
            <span className="font-semibold">{a.categoryLabel}</span>
            <span className="font-mono">
              +{a.deltaPercent.toFixed(0)}%
            </span>
            <span className="text-xs text-warning-foreground/80 font-mono">
              ({formatCurrency(a.referenceAverage)} → {formatCurrency(a.currentTotal)})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
