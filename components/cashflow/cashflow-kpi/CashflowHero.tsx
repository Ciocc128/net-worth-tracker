'use client';

/**
 * CashflowHero — the single dominant answer for the Cashflow "Tracciamento" tab.
 *
 * Replaces the old four co-equal KPIs (Entrate / Spese / Risparmio / Rapporto) with a
 * Trade-Republic hierarchy: the period's **Risparmio Netto** is the one number that owns
 * the most space, the health verdict (from `summarizeCashflowHealth`) folds the old
 * ratio-chip + savings-subtext pair into one chip, and Entrate / Spese drop to a flat
 * secondary strip. "Dove sono andati i soldi" (top spese) is demoted to support with a
 * link to the full Analisi page — the per-category deep dive lives there, not here.
 *
 * Container-query responsive: it renders both full-width on mobile and inside the narrow
 * 360px desktop sidebar, so the dominant value scales to the component's own box (`@`),
 * never the viewport.
 */

import Link from 'next/link';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CategoryBreakdownList,
  type CategoryBreakdownItem,
} from '@/components/cashflow/CategoryBreakdownList';
import { summarizeCashflowHealth, type CashflowHealthTone } from '@/lib/utils/trackingSummary';
import type { ExpenseCategory } from '@/types/expenses';

// How many spese categories the hero surfaces inline before deferring to Analisi.
const HERO_TOP_CATEGORIES = 5;

// ─── Sign-color helpers (currency → token, matching DESIGN.md Sign-Color Token Rule) ──

/** Net savings: positive token when ahead, destructive when behind, muted at zero. */
function netColorClass(value: number): string {
  if (value === 0) return 'text-muted-foreground';
  return value > 0 ? 'text-positive' : 'text-destructive';
}

// Verdict tone → chip classes. `even` keeps amber (not a sign token) to match the legacy
// "In pareggio" reading; everything else maps onto the theme sign tokens.
const TONE_CHIP_CLASS: Record<CashflowHealthTone, string> = {
  excellent: 'text-positive bg-positive/10',
  good: 'text-positive bg-positive/10',
  even: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  deficit: 'text-destructive bg-destructive/10',
  neutral: 'text-muted-foreground bg-muted',
};

// ─── Delta chip ─────────────────────────────────────────────────────────────────

function deltaArrow(delta: number): string {
  if (delta > 0) return '↑';
  if (delta < 0) return '↓';
  return '→';
}

interface DeltaTextProps {
  delta: number | null | undefined;
  /** When true a negative delta is good (e.g. expenses going down). */
  invert?: boolean;
}

/** Small "vs mese prec." annotation under a secondary value. */
function DeltaText({ delta, invert = false }: Readonly<DeltaTextProps>) {
  if (delta === null || delta === undefined) {
    return <span className="text-muted-foreground/50 text-[11px] leading-none">vs mese prec.</span>;
  }
  const isGood = invert ? delta < 0 : delta > 0;
  const colorClass =
    delta === 0 ? 'text-muted-foreground' : isGood ? 'text-positive' : 'text-destructive';
  return (
    <span className={cn('text-[11px] leading-none font-medium', colorClass)}>
      {deltaArrow(delta)} {Math.abs(delta).toFixed(1)}% vs prec.
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CashflowHeroProps {
  /** Period label shown in the eyebrow (e.g. "MAGGIO 2026"). */
  monthLabel: string;
  /** Gross income for the period (positive magnitude). */
  income: number;
  /** Gross spending for the period (positive magnitude). */
  expenses: number;
  /** Net savings: income − expenses. Can be negative. */
  net: number;
  /** Month-over-month income delta (percentage). Null when no comparison is available. */
  incomeDelta?: number | null;
  /** Month-over-month expenses delta (percentage). Null when no comparison is available. */
  expensesDelta?: number | null;
  /** Top expense categories for the period, sorted desc. Hero shows the first few. */
  expenseCategories: CategoryBreakdownItem[];
  /** Full category list — used by CategoryBreakdownList for label + icon lookup. */
  categories: ExpenseCategory[];
  /** Optional internal-transfers total, shown as a separate muted row. */
  transfers?: number;
  /**
   * When provided, renders a "Tutte le categorie" affordance (used on mobile to open the
   * full income/expense drawer). Desktop omits it and relies on the Analisi link.
   */
  onShowAllCategories?: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CashflowHero({
  monthLabel,
  income,
  expenses,
  net,
  incomeDelta,
  expensesDelta,
  expenseCategories,
  categories,
  transfers,
  onShowAllCategories,
  className,
}: Readonly<CashflowHeroProps>) {
  const verdict = summarizeCashflowHealth(income, expenses);
  const topCategories = expenseCategories.slice(0, HERO_TOP_CATEGORIES);

  return (
    <Card className={cn('py-0', className)}>
      {/* `@container` so the dominant value scales to the card's own width, both full-width
          on mobile and inside the narrow 360px desktop sidebar. */}
      <CardContent className="@container p-5">
        {/* Eyebrow */}
        <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
          Cashflow · {monthLabel}
        </p>

        {/* ── Dominant answer: Risparmio Netto + health verdict ── */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              Risparmio Netto
            </p>
            <p
              className={cn(
                'mt-1 font-mono text-[40px] leading-none font-bold tabular-nums @[330px]:text-[44px]',
                netColorClass(net),
              )}
            >
              {net > 0 ? '+' : ''}
              {cachedFormatCurrencyEUR(net)}
            </p>
          </div>

          {/* One verdict chip — replaces the old ratio chip + savings-rate subtext pair. */}
          <div
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-[10px] px-3 py-2',
              TONE_CHIP_CLASS[verdict.tone],
            )}
          >
            <span className="text-[13px] font-semibold">{verdict.headline}</span>
            <span className="text-[11px] leading-none opacity-80">{verdict.detail}</span>
          </div>
        </div>

        {/* ── Secondary strip: Entrate / Spese ── */}
        <div className="border-border mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          <div className="bg-card flex flex-col gap-1 p-4">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              Entrate
            </p>
            <p
              className={cn(
                'font-mono text-[18px] leading-none font-semibold tabular-nums @[300px]:text-[20px]',
                income === 0 ? 'text-muted-foreground' : 'text-positive',
              )}
            >
              {cachedFormatCurrencyEUR(income)}
            </p>
            <DeltaText delta={incomeDelta} />
          </div>
          <div className="bg-card flex flex-col gap-1 p-4">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              Spese
            </p>
            <p
              className={cn(
                'font-mono text-[18px] leading-none font-semibold tabular-nums @[300px]:text-[20px]',
                expenses === 0 ? 'text-muted-foreground' : 'text-destructive',
              )}
            >
              {cachedFormatCurrencyEUR(expenses)}
            </p>
            <DeltaText delta={expensesDelta} invert />
          </div>
        </div>

        {/* Transfers — net-zero for every metric, shown only so the user can reconcile. */}
        {transfers !== undefined && transfers > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase">
              <ArrowLeftRight className="h-3 w-3" />
              Trasferimenti
            </span>
            <span className="text-muted-foreground text-[13px] font-medium tabular-nums">
              {cachedFormatCurrencyEUR(transfers)}
            </span>
          </div>
        )}

        {/* ── Support: top spese categories + deep-dive link to Analisi ── */}
        <div className="border-border mt-4 border-t pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.06em] uppercase">
              Dove sono andati i soldi
            </p>
            {onShowAllCategories && (
              <button
                type="button"
                onClick={onShowAllCategories}
                className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
              >
                Tutte le categorie
              </button>
            )}
          </div>

          <CategoryBreakdownList items={topCategories} categories={categories} />

          <Link
            href="/dashboard/analisi"
            className="text-muted-foreground hover:text-foreground mt-4 inline-flex items-center gap-1 text-[12px] font-medium transition-colors"
          >
            Vedi analisi completa
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
