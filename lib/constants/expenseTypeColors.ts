import type { ExpenseType } from '@/types/expenses';

/**
 * The ONE colour vocabulary of an expense type, read by the feed's dots, the table's badges and
 * the hero's legend (Rule of Three: until 2026-09-14 three files each kept their own map, and the
 * table's said `income → --chart-1`, `fixed → --chart-2` while the legend 400px above said
 * `Entrate → --chart-2`, `Spese → --chart-1` — the same green meant «Entrate» in one place and
 * «Spese Fisse» in the other, measured on the mirror).
 *
 * Two registers, deliberately:
 *   - a ROW's type takes the income FLOW token for income (`--flow-in`, the same colour as the income
 *     bars — a type marker, not a verdict: the sign colours are for judgements only, fork owner's
 *     rule of 2026-09-15) and a chart slot for each kind of outflow — `fixed` on the slot the flow
 *     series paints spending with by default, so a dot and a bar mean the same thing;
 *   - the flow SERIES (income vs spending bars) take chart slots, because a series is drawn against
 *     a plot area, not read as text (AGENTS.md → Layout and Color Tokens). Income's series colour
 *     is the `--flow-in` role token (default Jade, `--chart-2`; spending `--flow-out`, default
 *     `--chart-1` — a theme may re-pitch the pair) and NOT the sign token: a bar is a series, not a
 *     verdict on a figure.
 *
 * CHECKLIST: a new `ExpenseType` needs a dot, a badge and — if it is a flow — a series colour.
 */
export const EXPENSE_TYPE_DOT_CLASS: Record<ExpenseType, string> = {
  income: 'bg-[var(--flow-in)]',
  fixed: 'bg-[var(--chart-1)]',
  variable: 'bg-[var(--chart-4)]',
  debt: 'bg-[var(--chart-3)]',
  transfer: 'bg-[var(--chart-5)]',
};

/**
 * The table's type badge: 12% fill, 35% border, the colour itself as text. The chart-slot text
 * is the declared exception to «a chart slot is not a text colour» (AGENTS.md); income takes the
 * flow token like the dot, so a badge and a dot never disagree on what a row is.
 */
export const EXPENSE_TYPE_BADGE_CLASS: Record<ExpenseType, string> = {
  income: 'bg-[color-mix(in_oklch,var(--flow-in)_12%,transparent)] border-[color-mix(in_oklch,var(--flow-in)_35%,transparent)] text-[var(--flow-in)]',
  fixed: 'bg-[color-mix(in_oklch,var(--chart-1)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-1)_35%,transparent)] text-[var(--chart-1)]',
  variable: 'bg-[color-mix(in_oklch,var(--chart-4)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-4)_35%,transparent)] text-[var(--chart-4)]',
  debt: 'bg-[color-mix(in_oklch,var(--chart-3)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-3)_35%,transparent)] text-[var(--chart-3)]',
  transfer: 'bg-[color-mix(in_oklch,var(--chart-5)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-5)_35%,transparent)] text-[var(--chart-5)]',
};

/** The two series of the income-vs-spending bars, and the legend that names them. */
export const CASHFLOW_SERIES_COLOR = {
  income: 'var(--flow-in)',
  expenses: 'var(--flow-out)',
} as const;
