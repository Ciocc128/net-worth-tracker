/**
 * Periodic email summary service (monthly, quarterly, yearly)
 *
 * Responsibilities:
 *   - Detect end-of-period dates in Italy timezone
 *   - Query Admin SDK for snapshot, expense, and dividend data
 *   - Build self-contained HTML emails summarizing the period
 *   - Send emails via Resend
 *
 * This module is server-only: it imports firebase-admin and the Resend SDK.
 * Never import it from client components.
 */

import { generateText, isSurfaceConfigured } from '@/lib/server/llm';
import { outputBudget, type OutputBudget } from '@/lib/server/llm/budget';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import {
  escapeHtml,
  emailShell,
  emailVerdict,
  emailTile,
  emailHero,
  emailKeyFigures,
  emailRankedRows,
  emailComparisonTable,
  emailAlertRows,
  emailProse,
  type EmailKeyFigure,
  type EmailRankedRow,
} from '@/lib/server/emailHtml';
import {
  buildPeriodEmailVerdict,
  describeNetWorthTile,
  describeDriverFooter,
  describeHallOfFameStanding,
  describeCompositionTile,
  describeClassMovesTile,
  describeCashflowTile,
  describeExpenseCategoriesTile,
  describeIncomeCategoriesTile,
  describeExpenseTypes,
  describeSpendingRolesFooter,
  describeTopExpensesTile,
  describeDividendsTile,
  describeYearOverYearTile,
  describeBudgetAlertsTile,
  periodTitle as periodTitleOf,
  periodKindLabel,
  periodScopeLabel,
  periodEndLabel,
  periodBaselineHeading,
  yearEarlierHeading,
  type EmailPeriod,
  type PeriodEmailVerdictInput,
} from '@/lib/utils/emailNarrative';
import { printChartHexForAssetClass, PRINT_COLORS } from '@/lib/constants/printTokens';
import { cachedFormatCurrencyEUR, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import { getItalyDate } from '@/lib/utils/dateHelpers';
import { AssetAllocationSettings } from '@/types/assets';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { getDefaultAssistantPreferences } from '@/lib/server/assistant/webSearchPolicy';
import { getAssistantMemoryDocument } from '@/lib/server/assistant/store';
import {
  formatMemoryForPrompt,
  formatBundleForPrompt,
  buildResponseStyleInstruction,
  EMAIL_SYSTEM_CORE,
  buildEmailPeriodicFormatContract,
  EMAIL_PERIODIC_WORD_LIMITS,
  type AssistantPromptParts,
} from '@/lib/server/assistant/prompts';
import {
  buildAssistantPeriodRangeContext,
  type AssistantPeriodRange,
} from '@/lib/services/assistantMonthContextService';
import type {
  AssistantMemoryItem,
  AssistantMonthContextBundle,
  AssistantPreferences,
} from '@/types/assistant';
import { buildPeriodComparison, MAX_CATEGORY_DELTAS } from '@/lib/server/emailPeriodComparison';
import type { PeriodComparison, MetricDelta, ComparisonSet } from '@/lib/server/emailPeriodComparison';
import { evaluateBudgetAlerts } from '@/lib/utils/budgetUtils';
import { DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';
import type { BudgetAlert, BudgetItem } from '@/types/budget';
import { type Expense, type ExpenseCategory, type ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { summarizeEmailSpendingRoles, summarizeSpendingRoles, type EmailSpendingRoles } from '@/lib/utils/spendingRoles';
import { buildWikiSystemBlock, formatMacroForPrompt, type EmailWikiContext } from '@/lib/utils/emailWiki';
import { loadEmailWiki } from '@/lib/server/wiki/wikiReader';
import { summarizeExpenseSplit, type ExpenseSplitSummary } from '@/lib/utils/expenseSplitSummary';
import { summarizePeriodSales, type PeriodSalesSummary } from '@/lib/utils/periodSales';
import { getAssetTransactionsAdmin, getPensionContributionsAdmin, getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { getGoalDataAdmin } from '@/lib/server/goalData';
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { GrowthDrivers } from '@/lib/utils/growthDrivers';
import { buildDriverLedger } from '@/lib/utils/storicoNarrative';
import { describeBalanceFooter, describeClasses, formatLeverage } from '@/lib/utils/allocazioneNarrative';
import {
  EMAIL_REBALANCE_BAND,
  MAX_TRADE_INSTRUMENTS,
  measureEmailDrivers,
  resolveEmailPeriodReturn,
  type EmailClassMove,
  summarizeEmailAllocation,
  summarizeTradesByInstrument,
  type EmailAllocationSummary,
  type EmailDrivers,
  type EmailInstrumentTrades,
  type EmailPeriodReturn,
} from '@/lib/utils/emailPortfolio';
import { resolveEffectiveTargets } from '@/lib/utils/allocationComparison';
import { resolvePensionReturnStart } from '@/lib/utils/pensionReturn';
import { resolvePerformanceBase } from '@/lib/utils/performanceBase';
import { describeMeasurementBase } from '@/lib/utils/performanceNarrative';
import { calculatePerformanceForPeriod } from '@/lib/services/performanceService';
import {
  describeCommonIncome,
  describeMemberBalance,
  describeMemberCalendar,
  describeSplitBasis,
} from '@/lib/utils/expenseSplitNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import type { Narrative } from '@/lib/utils/narrative';
import { getUserSnapshotsAdmin } from '@/lib/server/assetAdminRepository';
import {
  calculateMonthlyRecords,
  calculateYearlyRecords,
  rankPeriodByNetWorthGrowth,
  type PeriodGrowthRank,
} from '@/lib/utils/hallOfFameRecords';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailPeriodType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export interface MonthlyEmailData {
  periodType: EmailPeriodType;
  year: number;
  month: number;   // for monthly: 1-12; for quarterly: last month of quarter; for semiannual: 6 or 12; for yearly: 12
  quarter?: number; // 1-4, only set for quarterly
  semester?: number; // 1 (Jan-Jun) or 2 (Jul-Dec), only set for semiannual
  currentNetWorth: number;
  previousNetWorth: number;
  netWorthDelta: number;
  netWorthDeltaPct: number;
  liquidNetWorth: number;
  byAssetClass: Record<string, number>;
  previousByAssetClass: Record<string, number>;
  totalIncome: number;
  totalExpenses: number; // always positive (raw amounts are negative)
  // Category identity travels as `key` (categoryId, name-fallback for legacy rows):
  // two same-named categories are two distinct entries, and cross-period lookups in
  // the comparison builder match by key, never by the display name.
  topExpenseCategories: Array<{ key: string; name: string; amount: number }>; // all expense categories sorted desc
  allIncomeCategories: Array<{ key: string; name: string; amount: number }>; // all income categories sorted desc
  topIndividualExpenses: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>; // top transactions (5, or 10 for yearly)
  topIndividualIncome: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>; // top income transactions (used only in the yearly report)
  expensesByType: Array<{ type: ExpenseType; label: string; amount: number }>; // Fisse/Variabili/Debiti, sorted desc
  // The same outflows by 50/30/20 role, only with `spendingRolesEnabled` (owner's call, 2026-10-05):
  // when present it REPLACES the type split in the expense tile's footer and in the prompt.
  // null = roles off or unreadable; undefined on data built before the field existed.
  expensesByRole?: EmailSpendingRoles | null;
  dividendTotal: number; // gross EUR
  dividendCount: number;
  // Hall of Fame standing of this period's net-worth change — only for monthly/yearly
  // (the Hall of Fame tracks months and years); undefined when not computable.
  hallOfFameRank?: PeriodGrowthRank & { scope: 'month' | 'year' };
  // AI-generated markdown comment; undefined when generation failed or AI key is absent
  aiComment?: string;
  // Threshold alerts for the period's expense budgets — monthly emails only,
  // empty/undefined when the user has no budgets or alerts are disabled.
  budgetAlerts?: BudgetAlert[];
  // How the household's shared spending divides over this window. Undefined when the feature is
  // off or the household is not configured — the section then simply does not exist, rather
  // than rendering an empty box. Built from the SAME pure modules as Cashflow › Divisione, so
  // the email and the page can never print two different splits.
  expenseSplit?: ExpenseSplitSummary;
  // The period's sells from the trade ledger, with the estimated tax withheld on them, so the
  // verdict can name a taxed sale instead of calling it a market loss (lib/utils/periodSales.ts).
  // null = nothing sold; undefined on data built before the field existed.
  periodSales?: PeriodSalesSummary | null;
  // The portfolio measured with the pages' own rules (F1b, lib/utils/emailPortfolio.ts). Each is
  // null when it cannot be measured and undefined on data built before the fields existed; the
  // tile and the prompt block that read it are then absent, never estimated another way.
  /** Storico's Driver over the window (`isMarketMeasured` false = the market is the residual). */
  drivers?: GrowthDrivers | null;
  /** «Andamento per classe»: market and flows per band; null when not measured per instrument. */
  classMoves?: EmailDrivers['classMoves'];
  /** Allocazione on the period-end snapshot, today's roles, the 5/25 band. */
  allocation?: EmailAllocationSummary | null;
  /** The window's BUY/SELL, per instrument. */
  trades?: EmailInstrumentTrades[];
  /** Rendimenti's TWR on its base, as the hero states it. */
  periodReturn?: EmailPeriodReturn | null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when the Italy-local date of `now` is the last calendar day of its month.
 * Exported for testing.
 */
export function isLastDayOfMonthItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  const lastDay = new Date(
    italyDate.getFullYear(),
    italyDate.getMonth() + 1,
    0
  ).getDate();
  return italyDate.getDate() === lastDay;
}

/**
 * Returns true when the Italy-local date of `now` is the last day of a calendar quarter.
 * Quarter-end months: March (3), June (6), September (9), December (12).
 * Exported for testing.
 */
export function isLastDayOfQuarterItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  const month = italyDate.getMonth() + 1;
  if (![3, 6, 9, 12].includes(month)) return false;
  const lastDay = new Date(italyDate.getFullYear(), italyDate.getMonth() + 1, 0).getDate();
  return italyDate.getDate() === lastDay;
}

/**
 * Returns true when the Italy-local date of `now` is December 31.
 * Exported for testing.
 */
export function isLastDayOfYearItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  return italyDate.getMonth() === 11 && italyDate.getDate() === 31;
}

/**
 * Returns the quarter number (1-4) for a given month (1-12).
 * Exported for testing.
 */
export function monthToQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Returns the first month of the quarter that ends at `endMonth`.
 * e.g. 3→1, 6→4, 9→7, 12→10.
 * Exported for testing.
 */
export function getQuarterStartMonth(endMonth: number): number {
  return endMonth - 2;
}

/**
 * Returns the end-of-quarter {year, month} for the quarter immediately preceding
 * the given quarter-end month. Handles year wrap: Q1 → Q4 of the previous year.
 * Exported for testing.
 */
export function getPreviousQuarterEnd(
  year: number,
  month: number
): { year: number; month: number } {
  // month is always a quarter-end month (3, 6, 9, 12)
  if (month === 3) return { year: year - 1, month: 12 };
  return { year, month: month - 3 };
}

/**
 * Returns {year, month} of the most recently completed quarter end strictly before `now`.
 * e.g. April 19 2026 → { year: 2026, month: 3 }
 *      January 5 2026 → { year: 2025, month: 12 }
 * Exported for testing.
 */
export function getMostRecentCompletedQuarterEnd(now: Date): { year: number; month: number } {
  const italyDate = getItalyDate(now);
  const year = italyDate.getFullYear();
  // Quarter-end months in reverse order
  const quarterEndMonths = [12, 9, 6, 3];
  for (const qMonth of quarterEndMonths) {
    const lastDayOfQ = new Date(year, qMonth, 0).getDate();
    const qEnd = new Date(year, qMonth - 1, lastDayOfQ);
    if (italyDate > qEnd) {
      return { year, month: qMonth };
    }
  }
  // Before March 31 of the current year → Q4 of the previous year
  return { year: year - 1, month: 12 };
}

/**
 * Returns {year, month: 12} of the most recently completed year (Dec 31 must be in the past).
 * e.g. April 19 2026 → { year: 2025, month: 12 }
 * Exported for testing.
 */
export function getMostRecentCompletedYearEnd(now: Date): { year: number; month: number } {
  const italyDate = getItalyDate(now);
  // Dec 31 of the current year is still "this year", so always use year - 1
  return { year: italyDate.getFullYear() - 1, month: 12 };
}

/**
 * Returns true when the Italy-local date of `now` is the last day of a calendar half-year.
 * Half-year-end months: June (6) and December (12).
 * Exported for testing.
 */
export function isLastDayOfHalfYearItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  const month = italyDate.getMonth() + 1;
  if (![6, 12].includes(month)) return false;
  const lastDay = new Date(italyDate.getFullYear(), italyDate.getMonth() + 1, 0).getDate();
  return italyDate.getDate() === lastDay;
}

/**
 * Returns the semester number (1 = Jan-Jun, 2 = Jul-Dec) for a half-year-end month (6 or 12).
 * Exported for testing.
 */
export function monthToSemester(endMonth: number): number {
  return endMonth === 6 ? 1 : 2;
}

/**
 * Returns the first month of the half-year that ends at `endMonth`.
 * 6 → 1 (H1 starts in January), 12 → 7 (H2 starts in July).
 * Exported for testing.
 */
export function getSemesterStartMonth(endMonth: number): number {
  return endMonth === 6 ? 1 : 7;
}

/**
 * Returns the end-of-half-year {year, month} immediately preceding the given half-year end.
 * H1 (June) → H2 of the previous year (Dec); H2 (Dec) → H1 of the same year (June).
 * Exported for testing.
 */
export function getPreviousHalfEnd(
  year: number,
  endMonth: number
): { year: number; month: number } {
  // endMonth is always a half-year-end month (6 or 12)
  if (endMonth === 6) return { year: year - 1, month: 12 };
  return { year, month: 6 };
}

/**
 * Returns {year, month} of the most recently completed half-year end strictly before `now`.
 * e.g. July 1 2026 → { year: 2026, month: 6 }
 *      February 2 2026 → { year: 2025, month: 12 }
 * Exported for testing.
 */
export function getMostRecentCompletedHalfYearEnd(now: Date): { year: number; month: number } {
  const italyDate = getItalyDate(now);
  const year = italyDate.getFullYear();
  // June 30 of the current year (if already past) → H1 this year; otherwise H2 of the previous year
  const juneEnd = new Date(year, 5, 30);
  if (italyDate > juneEnd) {
    return { year, month: 6 };
  }
  return { year: year - 1, month: 12 };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** The app's one EUR formatter, in its whole-euro form. */
function formatEur(amount: number): string {
  return cachedFormatCurrencyEUR(amount, true);
}

function signedPct(pct: number): string {
  return `${pct >= 0 ? '+' : '−'}${formatPercentageIt(Math.abs(pct), 1)}`;
}

/** EUR amount with an explicit leading "+" for non-negative values (formatEur already prefixes "-"). */
function signedEur(amount: number): string {
  return `${amount >= 0 ? '+' : '−'}${formatEur(Math.abs(amount))}`;
}

/** Renders a metric delta as "+1.234 € (+3,2%)", or "N/D" when the comparison is unavailable. */
function formatDelta(delta: MetricDelta | null): string {
  if (!delta) return 'N/D';
  const pct = delta.pctChange !== null ? ` (${signedPct(delta.pctChange)})` : '';
  return `${signedEur(delta.absChange)}${pct}`;
}

// ─── Period labels ────────────────────────────────────────────────────────────
//
// Every label the reader sees now comes from `lib/utils/emailNarrative.ts` — the same pure
// module that writes the verdict. The local `ASSET_CLASS_LABELS` that used to live here went
// with them: it had drifted from the app's own map ("Crypto" against "Criptovalute", "Materie
// prime" against "Materie Prime"), so the email named two classes differently from every
// screen that shows them.

/**
 * The email's period as the narrative layer sees it. `MonthlyEmailData` carries the same four
 * fields under different names, and this is the ONE place the two shapes meet.
 */
function emailPeriodOf(data: MonthlyEmailData): EmailPeriod {
  return {
    kind: data.periodType,
    year: data.year,
    month: data.month,
    quarter: data.quarter,
    semester: data.semester,
  };
}

/** "Agosto 2026", "Q3 2026" — the subject line and the header's scope. */
function periodTitle(data: MonthlyEmailData): string {
  return periodTitleOf(emailPeriodOf(data));
}

/**
 * First month of the window a period ending at `endMonth` covers.
 * Monthly windows are one month long; the others open at the start of their quarter,
 * semester or year.
 */
export function getPeriodWindowStartMonth(periodType: EmailPeriodType, endMonth: number): number {
  if (periodType === 'quarterly') return getQuarterStartMonth(endMonth);
  if (periodType === 'semiannual') return getSemesterStartMonth(endMonth);
  if (periodType === 'yearly') return 1;
  return endMonth;
}

/**
 * The context-bundle window for an email period: the very months the email's own figures
 * cover, under the name the email prints in its header.
 *
 * Keeping the two in lockstep is the point. The bundle's baseline is the snapshot of the
 * month before the window opens, which for every period type is the same snapshot the
 * email calls `previousNetWorth` — so the AI comment and the email table can never
 * disagree about Δ patrimonio.
 */
export function resolveEmailPeriodRange(data: MonthlyEmailData): AssistantPeriodRange {
  return {
    year: data.year,
    startMonth: getPeriodWindowStartMonth(data.periodType, data.month),
    endMonth: data.month,
    label: periodTitle(data),
  };
}

// ─── AI comment generation ────────────────────────────────────────────────────

/**
 * Converts Claude's markdown output to email-safe HTML.
 *
 * Handles the subset Claude produces in structured analysis responses:
 * bold, any-level headings, bullet lists, horizontal rules, and paragraph breaks.
 * --- separators are removed (section headings already provide visual separation).
 * Avoids adding a `marked` dependency — the output format is predictable and narrow.
 */
function simpleMarkdownToHtml(text: string): string {
  // Ordered list items use a placeholder so they can be collapsed and wrapped independently
  // from unordered items before the final <br/> conversion runs.
  const OLI_OPEN = '§OLI§';
  const OLI_CLOSE = '§/OLI§';

  return (
    text
      // Strip <details>/<summary> blocks — AI occasionally wraps content in collapsible HTML
      // which email clients render as interactive elements, breaking the static email layout
      .replace(/<summary[^>]*>[\s\S]*?<\/summary>/gi, '')
      .replace(/<\/?details[^>]*>/gi, '')
      // Remove horizontal rules (--- or ***) — headings already separate sections
      .replace(/^[-*]{3,}\s*$/gm, '')
      // Bold (must run before single-asterisk italic to avoid conflict)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic — single asterisk emphasis (e.g. *Limite del dato*)
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      // Any-level headings (# ## ###) → compact bold paragraph
      .replace(
        /^#{1,3}\s+(.+)$/gm,
        `<p style="margin:16px 0 2px;font-size:13px;font-weight:600;color:${PRINT_COLORS.foreground};">$1</p>`
      )
      // Ordered list items (1. 2. 3.) — must run before bullet items to avoid conflicts
      .replace(/^\d+\. (.+)$/gm, `${OLI_OPEN}$1${OLI_CLOSE}`)
      // Collapse blank lines between consecutive ordered items so they group into one <ol>
      .replace(new RegExp(`(${OLI_CLOSE})\\n\\n(${OLI_OPEN})`, 'g'), `$1\n$2`)
      // Wrap consecutive ordered item runs in <ol>, expand placeholders into <li>
      .replace(
        new RegExp(`(${OLI_OPEN}[\\s\\S]*?${OLI_CLOSE}\\n?)+`, 'g'),
        (match) =>
          `<ol style="margin:4px 0 4px 16px;padding:0;list-style:decimal;">${match
            .replace(new RegExp(OLI_OPEN, 'g'), '<li style="margin:5px 0;padding-left:0;">')
            .replace(new RegExp(OLI_CLOSE, 'g'), '</li>')}</ol>`
      )
      // Unordered bullet items
      .replace(/^- (.+)$/gm, '<li style="margin:1px 0;padding-left:0;">$1</li>')
      // Collapse blank lines between consecutive unordered items so they merge into one <ul>
      // (AI often emits blank lines between bullets, which would otherwise create separate <ul>s)
      .replace(/(<\/li>)\n\n(<li)/g, '$1\n$2')
      // Wrap consecutive <li> runs in a <ul>
      .replace(
        /(<li[^>]*>[\s\S]*?<\/li>\n?)+/g,
        '<ul style="margin:4px 0 4px 16px;padding:0;list-style:disc;">$&</ul>'
      )
      // Collapse 3+ newlines to 2 (avoid giant gaps left by removed ---)
      .replace(/\n{3,}/g, '\n\n')
      // Double newline → two line breaks (paragraph-like spacing without block-level margins)
      .replace(/\n\n/g, '<br/><br/>')
      // Single remaining newlines → line break
      .replace(/\n/g, '<br/>')
      // Tighten spacing around headings: heading <p> tags already carry their own margin,
      // so extra <br/> before/after them would double up the visual gap
      .replace(/(<br\/>)+(<p style="margin:\d+px)/g, '$2')
      .replace(/<\/p>(<br\/>)+/g, '</p>')
      // Reduce double <br/> around list blocks to single — lists already have their own margin,
      // so 2 × line-height gap is excessive before/after list groups
      .replace(/<\/(ul|ol)>(<br\/>){2}/g, '</$1><br/>')
      .replace(/(<br\/>){2}(<(ul|ol))/g, '<br/>$2')
  );
}

/**
 * Renders one comparison axis (NW / entrate / uscite / risparmio) as prompt lines.
 * Used inside the email AI prompt so Claude interprets the same deterministic deltas
 * that the email table displays.
 */
function formatComparisonForPrompt(title: string, set: ComparisonSet): string {
  // «da X a Y» beside each change: the change alone let the model invent the baseline (F6).
  const fromTo = (delta: MetricDelta | null, format: (value: number) => string) =>
    delta ? `${formatDelta(delta)}, da ${format(delta.previous)} a ${format(delta.previous + delta.absChange)}` : 'N/D';
  return [
    `--- ${title} (${set.baselineLabel}) ---`,
    `Patrimonio netto: ${fromTo(set.netWorth, formatEur)}`,
    `Entrate: ${fromTo(set.income, formatEur)}`,
    `Uscite: ${fromTo(set.expenses, formatEur)}`,
    `Risparmio netto: ${fromTo(set.savings, signedEur)}`,
  ].join('\n');
}

/**
 * Where the period's change came from — Storico's Driver, as the ledger the Patrimonio tile prints
 * (the rows add up to the growth, to the euro). Precomputed, never left to the model. Until F1b
 * this block was `Δ − risparmio` under the name «effetto mercato»: it charged the market with
 * every pension contribution and every untracked movement (agosto 2026 on the real account:
 * +507 € where the Driver measures −1.063 €). The block says which market it is: measured per
 * instrument, or — without `byAsset` — the remainder of what the ledger names.
 */
function formatDriversForPrompt(emailData: MonthlyEmailData): string[] {
  const lines = ['--- DA COSA VIENE LA VARIAZIONE DEL PATRIMONIO (calcolato, come il Driver dello Storico) ---'];
  const drivers = emailData.previousNetWorth > 0 ? emailData.drivers : null;
  if (!drivers) {
    lines.push('Non calcolabile: manca lo snapshot patrimoniale di inizio o di fine periodo. Non stimarla.', '');
    return lines;
  }
  for (const row of buildDriverLedger(drivers)) lines.push(`${row.label}: ${signedEur(row.value)}`);
  lines.push(
    drivers.isMarketMeasured
      ? 'Il mercato è MISURATO strumento per strumento (variazione di prezzo delle quote detenute e delle operazioni del periodo, dal prezzo di carico al valore di fine periodo): non è un residuo. «Risparmio» sono entrate meno uscite registrate nel cashflow; «versamenti al fondo pensione» sono TFR e contributi registrati in Previdenza, che non passano dal cashflow; «altre variazioni» sono saldi inseriti a mano in giorni diversi dai movimenti, rettifiche, la differenza tra tassa stimata e trattenuta, e la crescita di un fondo pensione prima del mese da cui se ne misura il rendimento.'
      : 'Il mercato NON è misurato strumento per strumento (gli snapshot del periodo non hanno il dettaglio): è la crescita meno risparmio, versamenti al fondo pensione e più le tasse stimate, quindi assorbe anche i movimenti non tracciati. Presentalo come stima, non come rendimento.',
    'Le righe sono già calcolate e sommano alla crescita: usale così come sono, non ricalcolarle.',
    '',
  );
  return lines;
}

/** Rendimenti's TWR over the window, on its named base — the figure the PDF prints too (#324). */
function formatPeriodReturnForPrompt(emailData: MonthlyEmailData): string[] {
  const periodReturn = emailData.periodReturn;
  if (!periodReturn) return [];
  return [
    '--- RENDIMENTO DEL PERIODO (TWR, come la pagina Rendimenti) ---',
    `${signedPct(periodReturn.value)} ${periodReturn.label}. ${periodReturn.baseLabel}`,
    'Il TWR neutralizza versamenti e prelievi: misura quanto ha reso il capitale, non quanto è cresciuto il patrimonio.',
    '',
  ];
}

/**
 * The whole net worth by class at the period's end — the Composizione tile. Kept apart from the
 * allocation below, which is measured on another base: naming both bases is what stops the model
 * from reading a 44% share of the net worth against a 70% target of the portfolio.
 */
function formatCompositionForPrompt(emailData: MonthlyEmailData): string[] {
  const entries = Object.entries(emailData.byAssetClass).filter(([, value]) => value > 0).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return [];
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return [
    '--- COMPOSIZIONE DEL PATRIMONIO A FINE PERIODO (patrimonio intero, tutte le classi) ---',
    ...entries.map(([assetClass, value]) => `${ASSET_CLASS_LABELS[assetClass] ?? assetClass}: ${formatEur(value)} (${formatPercentageIt((value / total) * 100, 1)} del patrimonio)`),
    'Queste percentuali NON si confrontano con i target: i target valgono sul portafoglio allocato, nel blocco successivo.',
    '',
  ];
}

/** Allocazione at the period's end, as the page measures it: base, targets, 5/25, sleeves. */
function formatAllocationForPrompt(emailData: MonthlyEmailData): string[] {
  const allocation = emailData.allocation;
  const header = '--- ALLOCAZIONE vs TARGET (come la pagina Allocazione) ---';
  if (!allocation) {
    return [header, 'Non calcolabile per questo periodo (lo snapshot di fine periodo non ha il dettaglio per strumento, o non c\'è nulla di allocato). Non stimare scostamenti dai target.', ''];
  }
  const lines = [
    header,
    `Base: il portafoglio allocato, ${formatEur(allocation.marketValue)} a fine periodo (asset negoziabili e non negoziabili; gli esclusi, come la casa, sono fuori). Valori di fine periodo con i ruoli di oggi.`,
    `Origine dei target: ${allocation.fromGoals ? 'derivati dagli obiettivi di investimento' : 'Impostazioni → Allocazione'}, già riespressi sulla base (target effettivi). Una classe è fuori target secondo la regola 5/25: scarto oltre 5 punti o oltre il 25% del suo target.`,
  ];
  if (allocation.hasLeveragedExposure) {
    lines.push(`Leva: ${formatLeverage(allocation.leverageRatio)}; le percentuali sono esposizioni nozionali sul capitale investito e possono sommare più di 100.`);
  }
  for (const gap of allocation.classes) {
    lines.push(
      `${gap.label}: attuale ${formatPercentageIt(gap.currentPercentage, 1)} | target ${formatPercentageIt(gap.targetPercentage, 1)} | scarto ${gap.differencePp >= 0 ? '+' : '−'}${formatNumberIt(Math.abs(gap.differencePp), 1)} p.p. (${signedEur(gap.differenceValue)}) | ${gap.action === 'OK' ? 'in linea' : 'fuori target'}`
    );
    for (const sleeve of allocation.subCategories.filter((row) => row.assetClass === gap.assetClass)) {
      const target =
        sleeve.targetPercentage === null
          ? 'nessun target (sottocategoria non assegnata)'
          : `target ${formatPercentageIt(sleeve.targetPercentage, 1)} della classe | scarto ${(sleeve.differencePp ?? 0) >= 0 ? '+' : '−'}${formatNumberIt(Math.abs(sleeve.differencePp ?? 0), 1)} p.p.`;
      lines.push(`  › ${sleeve.subCategory}: ${formatPercentageIt(sleeve.currentPercentage, 1)} della classe (${formatEur(sleeve.currentValue)}) | ${target}`);
    }
  }
  const footer = describeBalanceFooter({ frozen: allocation.frozen, excluded: allocation.excluded, netWorth: emailData.currentNetWorth });
  if (footer) lines.push(narrativeToText(footer));
  if (allocation.unmatched.length > 0) {
    lines.push(`Fuori dal calcolo: ${allocation.unmatched.map((row) => `${row.name} (${formatEur(row.totalValue)})`).join(', ')}, strumenti dello snapshot non più presenti.`);
  }
  lines.push('I compositi sono divisi tra le classi secondo la loro composizione.', '');
  return lines;
}

/**
 * The class moves with market and flows apart — the Panoramica's rule (`computeTopMovers`) on the
 * Driver's per-instrument market. Until F1b this was «VARIAZIONI ALLOCAZIONE», a snapshot
 * difference that read a month of PAC instalments as equity growth.
 */
function formatClassMovesForPrompt(emailData: MonthlyEmailData): string[] {
  const header = '--- ANDAMENTO PER CLASSE (mercato separato da acquisti, vendite e versamenti) ---';
  const moves = emailData.classMoves;
  if (!moves) {
    return [header, 'Non misurato strumento per strumento in questo periodo: non attribuire a una classe una variazione di mercato, e non leggere una differenza di valore come rendimento.', ''];
  }
  const lines = [header];
  for (const row of moves.rows) {
    const parts = [`mercato ${Math.round(row.market) === 0 ? formatEur(0) : signedEur(row.market)}`];
    if (Math.abs(row.traded) >= 1) parts.push(`acquisti e vendite ${signedEur(row.traded)}`);
    if (Math.abs(row.paidIn) >= 1) parts.push(`versamenti al fondo pensione ${signedEur(row.paidIn)}`);
    if (Math.abs(row.other) >= 1) parts.push(`altri movimenti ${signedEur(row.other)}`);
    lines.push(`${row.label}: variazione ${signedEur(row.valueChange)} = ${parts.join(' + ')}`);
  }
  lines.push(
    '«Acquisti e vendite» è denaro spostato dall\'utente, non rendimento; «altri movimenti» sono depositi e prelievi sui conti, rate di mutuo, rettifiche. I fondi pensione sono la riga Previdenza: prima del mese da cui Previdenza misura il rendimento del fondo, tutta la sua crescita è «altri movimenti», perché non si separa dai versamenti.',
    '',
  );
  return lines;
}

/** A quantity of quotes the it-IT way, no trailing zeros: «68», «2,4685». */
const formatQuantity = (quantity: number) => quantity.toLocaleString('it-IT', { maximumFractionDigits: 4 });

/** The period's BUY/SELL, per instrument, with the cap stated like MAX_CATEGORY_DELTAS. */
function formatTradesForPrompt(emailData: MonthlyEmailData): string[] {
  const trades = emailData.trades;
  if (!trades) return [];
  const lines = [`--- OPERAZIONI DEL PERIODO (registro operazioni, per strumento; i primi ${MAX_TRADE_INSTRUMENTS} per importo) ---`];
  if (trades.length === 0) {
    lines.push('Nessun acquisto né vendita registrati nel periodo.', '');
    return lines;
  }
  for (const entry of trades.slice(0, MAX_TRADE_INSTRUMENTS)) {
    const parts: string[] = [];
    if (entry.buys > 0) {
      parts.push(`${entry.buys} ${entry.buys === 1 ? 'acquisto' : 'acquisti'} per ${formatQuantity(entry.boughtQuantity)} quote, ${formatEur(entry.invested)} investiti (commissioni incluse)`);
    }
    if (entry.sells > 0) {
      const tax = entry.estimatedTax === null ? 'tassa non stimabile' : `tassa stimata ${formatEur(entry.estimatedTax)}`;
      parts.push(`${entry.sells} ${entry.sells === 1 ? 'vendita' : 'vendite'} per ${formatQuantity(entry.soldQuantity)} quote, ${formatEur(entry.proceeds)} incassati al netto delle commissioni (${tax})`);
    }
    const kind = describeTradeLegs(entry);
    lines.push(`- ${entry.name}${kind ? ` (${kind})` : ''}: ${parts.join('; ')}`);
  }
  const omitted = trades.slice(MAX_TRADE_INSTRUMENTS);
  if (omitted.length > 0) {
    const total = omitted.reduce((sum, entry) => sum + entry.invested + entry.proceeds, 0);
    lines.push(`Oltre i primi ${MAX_TRADE_INSTRUMENTS} restano ${omitted.length === 1 ? '1 strumento' : `${omitted.length} strumenti`} per ${formatEur(total)} di operazioni complessive.`);
  }
  // The totals the model would otherwise add up itself — and did, wrong (3.688 € for 4.609 €, F6).
  const buys = trades.reduce((sum, entry) => sum + entry.buys, 0);
  const sells = trades.reduce((sum, entry) => sum + entry.sells, 0);
  const totals: string[] = [];
  if (buys > 0) totals.push(`${formatEur(trades.reduce((sum, entry) => sum + entry.invested, 0))} investiti in ${buys} ${buys === 1 ? 'acquisto' : 'acquisti'}`);
  if (sells > 0) totals.push(`${formatEur(trades.reduce((sum, entry) => sum + entry.proceeds, 0))} incassati da ${sells} ${sells === 1 ? 'vendita' : 'vendite'}`);
  lines.push(`Totale del periodo: ${totals.join('; ')}. Per classe, gli stessi importi sono le righe «acquisti e vendite» di ANDAMENTO PER CLASSE.`);
  lines.push(
    "La classe tra parentesi è quella dello strumento (per un composito, le sue gambe): non dedurla dal nome o dal ticker. Gli acquisti pagati dai conti spiegano il calo della liquidità: non sono spese, non sono rendimento e non riducono il risparmio né il patrimonio.",
    ''
  );
  return lines;
}

/** «Azioni › Momentum», «Azioni › Market, leva 2×», «Azioni 60% · Obbligazioni 40%»; '' when the asset is gone. */
function describeTradeLegs(entry: EmailInstrumentTrades): string {
  const className = (leg: { assetClass: string; subCategory?: string }) =>
    `${ASSET_CLASS_LABELS[leg.assetClass] ?? leg.assetClass}${leg.subCategory ? ` › ${leg.subCategory}` : ''}`;
  const legs =
    entry.legs.length === 1
      ? className(entry.legs[0])
      : entry.legs.map((leg) => `${className(leg)} ${formatNumberIt(leg.percentage, 0)}%`).join(' · ');
  if (!legs) return '';
  return entry.leverageRatio > 1 ? `${legs}, leva ${formatNumberIt(entry.leverageRatio, 0)}×` : legs;
}

/**
 * Per-category expense deltas, with the cap stated in the text the model reads.
 *
 * The selection is the largest categories BY SPEND in the period (that is the order
 * `buildPeriodComparison` slices), not by size of the variation — the header says so,
 * because a header that misdescribes the ordering is the same defect as an undeclared cap.
 */
function formatCategoryDeltasForPrompt(
  emailData: MonthlyEmailData,
  comparison: PeriodComparison
): string[] {
  const lines = [
    `--- VARIAZIONE SPESE PER CATEGORIA (le prime ${MAX_CATEGORY_DELTAS} categorie per spesa del periodo) ---`,
  ];

  if (comparison.categoryDeltas.length === 0) {
    lines.push('Nessuna spesa categorizzata nel periodo.');
    lines.push('');
    return lines;
  }

  // A zero baseline is a measured zero, not a missing one: «nessuna spesa», never «N/D».
  const categoryDelta = (delta: MetricDelta | null, period: string) =>
    delta && delta.previous === 0 ? `${formatDelta(delta)}, nessuna spesa ${period}` : formatDelta(delta);
  for (const category of comparison.categoryDeltas) {
    lines.push(
      `- ${category.name}: ${formatEur(category.current)} (vs periodo prec.: ${categoryDelta(
        category.vsPrevious,
        'nel periodo prec.'
      )}; vs anno prec.: ${categoryDelta(category.vsYoy, "nell'anno prec.")})`
    );
  }

  const omittedCategories = emailData.topExpenseCategories.slice(comparison.categoryDeltas.length);
  if (omittedCategories.length > 0) {
    const omittedTotal = omittedCategories.reduce((sum, category) => sum + category.amount, 0);
    const omittedNoun =
      omittedCategories.length === 1 ? '1 categoria' : `${omittedCategories.length} categorie`;
    lines.push(
      `Le categorie oltre le prime ${MAX_CATEGORY_DELTAS} sono omesse da questo confronto: ${omittedNoun} per ${formatEur(omittedTotal)} complessivi. Il loro dettaglio è comunque nel blocco SPESE PER CATEGORIA E SOTTOCATEGORIA, che è completo.`
    );
  }

  if (comparison.droppedCategories.length > 0) {
    lines.push(
      `Scese a zero (spesa nel periodo prec., nessuna in questo): ${comparison.droppedCategories
        .map((category) => `${category.name} (${formatEur(category.previous)} nel periodo prec.)`)
        .join(', ')}.`
    );
  }

  lines.push('');
  return lines;
}

/** Hall of Fame standing — deterministic, so the comment can cite it without inventing. */
function formatHallOfFameForPrompt(emailData: MonthlyEmailData): string[] {
  const rank = emailData.hallOfFameRank;
  if (!rank) return [];

  // The verdict's own sentence (`describeHallOfFameStanding`), then what it is NOT: the model read
  // «18° … su 18» as eighteen growing months in a row (F1b, 2026-09-28).
  return [
    '--- HALL OF FAME ---',
    narrativeToText(describeHallOfFameStanding({ position: rank.rank, total: rank.total, scope: rank.scope, trend: rank.trend })),
    ...describeHallOfFameBand(rank.rank, rank.total, rank.trend),
    'È un piazzamento in classifica tra tutti i periodi registrati, non una serie di periodi consecutivi.',
    '',
  ];
}

/**
 * Where the standing falls, in words: «18° su 19» read as «continuità notevole» (F6, 2026-10-06)
 * because a bare position does not say that 18 of 19 is near the bottom. Thirds of the ranking;
 * nothing under three periods, where first and last already say it.
 */
export function describeHallOfFameBand(position: number, total: number, trend: 'growth' | 'decline'): string[] {
  if (total < 3) return [];
  const third = position / total;
  const growth = trend === 'growth';
  const band =
    third <= 1 / 3
      ? growth ? 'tra le crescite più forti' : 'tra i cali più marcati'
      : third > 2 / 3
        ? growth ? 'tra le crescite più deboli' : 'tra i cali più lievi'
        : growth ? 'a metà classifica tra le crescite' : 'a metà classifica tra i cali';
  return [`In altre parole: ${band}.`];
}

/**
 * The month's budget alerts, the same rows the email already renders.
 *
 * Monthly only, because the alerts themselves are (`buildBudgetAlertsForMonth` runs for
 * that period alone): gating on the period type rather than on the array keeps a future
 * caller from quietly attaching month alerts to a quarterly email.
 */
function formatBudgetAlertsForPrompt(emailData: MonthlyEmailData): string[] {
  if (emailData.periodType !== 'monthly') return [];
  const alerts = emailData.budgetAlerts;
  if (!alerts || alerts.length === 0) return [];

  const lines = ['--- AVVISI BUDGET DEL MESE ---'];
  for (const alert of alerts) {
    const state = alert.level === 'exceeded' ? 'budget superato' : `soglia ${alert.threshold}% superata`;
    const forecast =
      alert.forecastedOverrun && alert.level !== 'exceeded' ? ' · sforamento previsto a fine mese' : '';
    lines.push(
      `- ${alert.label}: ${formatEur(alert.spent)} su ${formatEur(alert.budgetAmount)} (${Math.round(alert.usedRatio * 100)}%) — ${state}${forecast}`
    );
  }
  lines.push('');
  return lines;
}

/**
 * The household split, for the model.
 *
 * The window is NAMED in the header, as every figure in this prompt must be: the split is
 * measured over the email's own period, not over the month, and a model handed a bare
 * percentage next to a quarterly total will describe it as a monthly one.
 *
 * It also states what the residual is made of. «Restano 754 €» is a subtraction with two
 * subtrahends, and a model that does not know which ones will explain it wrong.
 */
function formatExpenseSplitForPrompt(emailData: MonthlyEmailData, label: string): string[] {
  const summary = emailData.expenseSplit;
  if (!summary || summary.basis.kind !== 'computed') return [];

  // The pool the shares divide is NET of the income left «in comune» (2026-09-27): a model told
  // the gross alone would add the shares up to the wrong total.
  const { common } = summary;
  const poolLine =
    common.income > 0
      ? `Spese in comune del periodo: ${formatEur(common.total)}, meno ${formatEur(common.income)} di entrate in comune: ` +
        (common.toSplit > 0
          ? `${formatEur(common.toSplit)} da dividere.`
          : `niente da dividere${common.surplus > 0 ? `, avanzano ${formatEur(common.surplus)}` : ''}.`)
      : `Spese in comune del periodo: ${formatEur(common.total)}.`;
  const lines = [
    `--- DIVISIONE DELLE SPESE IN COMUNE (${label}) ---`,
    `${poolLine} Le quote sono proporzionali alle entrate intestate a ciascuno nello stesso periodo.`,
    'Per ogni persona: «resta» = entrate − quota di spese in comune − spese personali.',
  ];
  for (const balance of summary.members) {
    if (balance.remaining === null || balance.share === null || balance.commonShare === null) continue;
    lines.push(
      `- ${balance.member.name}: entrate ${formatEur(balance.income)}, quota in comune ${formatEur(balance.commonShare)} ` +
        `(${Math.round(balance.share * 100)}%), spese personali ${formatEur(balance.personalSpending)}, resta ${formatEur(balance.remaining)}.`
    );
  }
  if (summary.unassigned.rowCount > 0) {
    lines.push(
      `Fuori dalla divisione: ${formatEur(summary.unassigned.total)} su ${summary.unassigned.rowCount} voci intestate a una persona non più configurata.`
    );
  }
  if (summary.unassigned.incomeRowCount > 0) {
    lines.push(
      `Fuori dalla divisione: ${formatEur(summary.unassigned.income)} di entrate su ${summary.unassigned.incomeRowCount} voci intestate a una persona non più configurata.`
    );
  }
  lines.push('');
  return lines;
}

/**
 * The period's numbers as the email's model reads them: the assistant's numeric block over the
 * email's window (allocation omitted), then the sections measured with the pages' rules (F1b),
 * the comparisons, the category deltas, the Hall of Fame, the budget alerts and the split.
 *
 * One function for two readers: the prompt below, and the vault's `dati/<AAAA-MM>.md`
 * (lib/server/wiki/vaultExport.ts, doc/ai-open-models-wiki.md § 6.1) — so a question asked on
 * the vault and the email's comment can never start from two different readings of a month.
 */
export function buildEmailDataSections(
  emailData: MonthlyEmailData,
  comparison: PeriodComparison,
  bundle: AssistantMonthContextBundle
): string[] {
  const label = periodTitle(emailData);
  return [
    formatBundleForPrompt(bundle, label, { omitAllocation: true, spendingRoles: emailData.expensesByRole ?? undefined }),
    ...formatDriversForPrompt(emailData),
    ...formatPeriodReturnForPrompt(emailData),
    ...formatCompositionForPrompt(emailData),
    ...formatAllocationForPrompt(emailData),
    ...formatClassMovesForPrompt(emailData),
    ...formatTradesForPrompt(emailData),
    // The dividend registry is a different source from the cashflow rows above (which only
    // see dividends the user also booked as income): naming the source is what keeps the
    // two figures from reading as a contradiction.
    `--- DIVIDENDI DEL PERIODO (registro dividendi) ---`,
    `Incassati: ${formatEur(emailData.dividendTotal)} lordi in ${emailData.dividendCount} pagament${emailData.dividendCount === 1 ? 'o' : 'i'}.`,
    '',
    formatComparisonForPrompt('CONFRONTO COL PERIODO PRECEDENTE', comparison.vsPrevious),
    '',
    ...(comparison.previousEqualsYoy
      ? []
      : [formatComparisonForPrompt("CONFRONTO CON LO STESSO PERIODO DELL'ANNO PRECEDENTE", comparison.vsYoy), '']),
    ...formatCategoryDeltasForPrompt(emailData, comparison),
    ...formatHallOfFameForPrompt(emailData),
    ...formatBudgetAlertsForPrompt(emailData),
    ...formatExpenseSplitForPrompt(emailData, label),
  ];
}

/** Composition and Allocazione at the period's end: the vault's `dati/portafoglio.md` reads them. */
export function buildEmailPortfolioSections(emailData: MonthlyEmailData): string[] {
  return [...formatCompositionForPrompt(emailData), ...formatAllocationForPrompt(emailData)];
}

/**
 * Builds the prompt for the email AI comment.
 *
 * The body IS the assistant's own numeric block (`formatBundleForPrompt`) over a bundle
 * built on the email's window: the two surfaces then read the same exhaustive data, every
 * future bundle field reaches the emails for free, and the "questo blocco è ESAUSTIVO"
 * guardrails in EMAIL_SYSTEM_CORE stop promising blocks the email never sent — minus the
 * bundle's allocation blocks (`omitAllocation`), which measure on the whole net worth. Appended
 * to it are the sections only the email has, measured with the pages' rules (F1b): Storico's
 * Driver, Rendimenti's TWR, the composition, Allocazione's comparison, the class moves and the
 * trades; then the deterministic comparisons, the per-category deltas, the Hall of Fame
 * standing, the month's budget alerts and the household split.
 *
 * The largest single expenses are deliberately NOT re-listed: the bundle already carries
 * them, with their date, in `--- SPESE SINGOLE PIU' GRANDI ---`.
 *
 * The Wiki (F5, doc/ai-open-models-wiki.md § 5.4), when it applies: its rules and the Principles
 * digest close the system block, the window's macro pages close the user message — AFTER the
 * period's data, which stays the first thing read and the only source of the portfolio's figures.
 * NOT in `buildEmailDataSections`: the vault's `dati/` is the data alone.
 *
 * Exported for the prompt tests, and for the guided verification that reads the generated
 * userContent without sending anything.
 *
 * @returns { system, userContent }. `system` (role, domain, guardrails, period format
 *          contract) is byte-identical for every user and every run of a given period
 *          type — plus, for the vault's owner, the Wiki's rules and digest, which change only
 *          when the digest does; `userContent` carries everything per-request.
 */
export function buildEmailAiPrompt(
  emailData: MonthlyEmailData,
  comparison: PeriodComparison,
  bundle: AssistantMonthContextBundle,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[],
  wiki: EmailWikiContext | null = null
): AssistantPromptParts {
  const label = periodTitle(emailData);

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente; usa solo il contesto esplicito di questo messaggio.';

  const userContent = [
    buildResponseStyleInstruction(preferences.responseStyle),
    memoryBlock,
    '',
    `Stai redigendo il commento di riepilogo per: ${label}.`,
    'Di seguito i dati del periodo, estratti in modo affidabile dal sistema. Le variazioni sono già calcolate: non ricalcolarle e non inventare numeri.',
    '',
    ...buildEmailDataSections(emailData, comparison, bundle),
    ...(wiki ? formatMacroForPrompt(wiki) : []),
  ].join('\n');

  const wikiSystem = buildWikiSystemBlock(wiki);
  return {
    system: [EMAIL_SYSTEM_CORE, buildEmailPeriodicFormatContract(emailData.periodType), ...(wikiSystem ? [wikiSystem] : [])].join('\n\n'),
    userContent,
  };
}

/**
 * The reasoning's own ceiling per period (`outputBudget` adds the text's room from the contract's
 * word limit). It scales with the period like the word limit does. Until 2026-09-28 one
 * `max_tokens` (6000/8000/8000/10000) covered both, and a long reasoning truncated the text: a
 * paid answer thrown away and an email without its comment.
 */
const EMAIL_AI_REASONING_TOKENS: Record<EmailPeriodType, number> = {
  // F6b (2026-10-06): DeepSeek V4.1 Flash with its reasoning IGNORES this ceiling (6.784 tokens of
  // reasoning on a quarter capped at 6.000, 95% of max_tokens), so the figure that protects the
  // text is the total it feeds into. Sized to `EMAIL_AI_TIMEOUT_MS` at ~100 tokens a second, the
  // rate measured in F6b; the money is not the limit (a full yearly ≈ 0,02 $), the wall clock is.
  monthly: 6000,
  quarterly: 10000,
  semiannual: 10000,
  yearly: 11000,
};

/**
 * The periodic comment's own timeout, above the adapter's 120 s: a reasoning model on a year of
 * data runs past two minutes. The four period emails of December 31 run side by side in the cron
 * (app/api/cron/monthly-snapshot/route.ts), so the function's 300 s hold the slowest, not the sum.
 */
export const EMAIL_AI_TIMEOUT_MS = 150_000;

/** Reasoning ceiling + room for the period's word limit, twice over (lib/server/llm/budget.ts). */
export function emailAiOutputBudget(periodType: EmailPeriodType): OutputBudget {
  return outputBudget({ wordLimit: EMAIL_PERIODIC_WORD_LIMITS[periodType], reasoningTokens: EMAIL_AI_REASONING_TOKENS[periodType] });
}

/**
 * Generates the AI comment for the period via a dedicated, email-specific prompt, through the
 * provider layer (`lib/server/llm`, surface `EMAIL_PERIODIC` — an open model on OpenRouter).
 *
 * The comment interprets the same exhaustive bundle the in-app assistant reads, plus the
 * deterministic email-only sections (Driver, return, allocation, class moves, trades,
 * comparisons, category deltas, budget alerts, Hall of Fame). There is no web search since 2026-09-28: the layer has no tools.
 * The macro context and the Principles come from the vault (F5, doc/ai-open-models-wiki.md § 5.4),
 * for the vault's owner only (`loadEmailWiki`); a vault that does not answer costs the block, never
 * the comment. `includeMacroContext` (the assistant's web-search switch) plays no part here.
 *
 * No prompt caching: a cron run sending a handful of emails never fills a cache's TTL. The
 * `system` block is still built to be byte-identical per period type, so turning it on would
 * be a small change if traffic ever justified it.
 *
 * Every failure (missing key, bundle build, provider error, a truncated answer) ends in null
 * and a log line: the email is always sent, with or without the comment.
 *
 * Exported for the guided verification, which generates one real comment on the mirror
 * without sending the email.
 *
 * @returns The AI-generated markdown text, or null on failure.
 */
export async function generateEmailAiComment(
  userId: string,
  emailData: MonthlyEmailData,
  comparison: PeriodComparison
): Promise<string | null> {
  // No key, no call: skip before the bundle, whose Firestore reads would be wasted.
  if (!isSurfaceConfigured('EMAIL_PERIODIC')) return null;
  try {
    // Load user's assistant preferences and active memory items for personalisation.
    // Falls back to defaults + empty memory on any Firestore failure.
    let preferences = getDefaultAssistantPreferences();
    let memoryItems: AssistantMemoryItem[] = [];

    try {
      const memoryDoc = await getAssistantMemoryDocument(userId);
      preferences = memoryDoc.preferences;
      memoryItems = memoryDoc.items.filter((i) => i.status === 'active');
    } catch {
      // Memory load is non-critical — proceed with defaults
    }

    // The same context pipeline the assistant uses, over the email's own window; the vault's pages
    // for that window beside it (never throws: an unreadable page is an absent page).
    const range = resolveEmailPeriodRange(emailData);
    const [bundle, wiki] = await Promise.all([
      buildAssistantPeriodRangeContext(userId, range, preferences.includeDummySnapshots),
      loadEmailWiki(userId, {
        periodType: emailData.periodType,
        year: range.year,
        startMonth: range.startMonth,
        endMonth: range.endMonth,
      }).catch(() => null),
    ]);
    if (wiki) {
      // What reached the prompt, never its text: the months with and without a page, the digest.
      console.log(
        `[emailWiki] ${JSON.stringify({ months: wiki.months.map((m) => m.month), missing: wiki.missingMonths, principles: wiki.principles !== null, depth: wiki.depth })}`
      );
    }

    const { system, userContent } = buildEmailAiPrompt(
      emailData,
      comparison,
      bundle,
      preferences,
      memoryItems,
      wiki
    );

    const result = await generateText('EMAIL_PERIODIC', {
      system,
      user: userContent,
      ...emailAiOutputBudget(emailData.periodType),
      timeoutMs: EMAIL_AI_TIMEOUT_MS,
    });
    return result?.text ?? null;
  } catch (error) {
    // AI failure must never block email sending
    console.error(`[emailAiComment] Generation failed for user ${userId}:`, error);
    return null;
  }
}

// ─── Admin settings reader ────────────────────────────────────────────────────

/**
 * Read raw settings from Firestore Admin SDK.
 * Used inside cron handlers where the client SDK is unavailable.
 */
export async function getSettingsAdmin(
  userId: string
): Promise<AssetAllocationSettings | null> {
  const doc = await adminDb.collection('assetAllocationTargets').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    monthlyEmailEnabled: data.monthlyEmailEnabled,
    quarterlyEmailEnabled: data.quarterlyEmailEnabled,
    semiAnnualEmailEnabled: data.semiAnnualEmailEnabled,
    yearlyEmailEnabled: data.yearlyEmailEnabled,
    weeklyBudgetEmailEnabled: data.weeklyBudgetEmailEnabled,
    monthlyEmailRecipients: data.monthlyEmailRecipients,
    // Read by the Divisione section below. This mapper is an INDEPENDENT re-listing of the
    // settings document (getSettings on the client is the other one): a field missing here is
    // simply absent server-side, with no type error to catch it.
    expenseSplitEnabled: data.expenseSplitEnabled,
    familyMembers: data.familyMembers ?? [],
    // The expense tile's footer and the prompt split the outflows by 50/30/20 role when on.
    spendingRolesEnabled: data.spendingRolesEnabled,
    laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
    targets: data.targets,
    // The portfolio section (F1b): the Allocazione page's effective targets, Storico's pension
    // start month and Rendimenti's base — the SAME fields the three pages read.
    goalBasedInvestingEnabled: data.goalBasedInvestingEnabled,
    goalDrivenAllocationEnabled: data.goalDrivenAllocationEnabled,
    pensionReturnStartMonth: data.pensionReturnStartMonth,
    performanceIncludesPensionFunds: data.performanceIncludesPensionFunds,
    performanceIncludesExcludedAssets: data.performanceIncludesExcludedAssets,
    performanceExcludesCash: data.performanceExcludesCash,
    riskFreeRate: data.riskFreeRate,
    dividendIncomeCategoryId: data.dividendIncomeCategoryId,
  } as AssetAllocationSettings;
}

// ─── Expense / dividend aggregation (pure helpers) ───────────────────────────

export interface CashflowAggregation {
  // Category lists carry `key` (categoryId, name-fallback) — see MonthlyEmailData.
  totalIncome: number;
  totalExpenses: number;
  topExpenseCategories: Array<{ key: string; name: string; amount: number }>;
  allIncomeCategories: Array<{ key: string; name: string; amount: number }>;
  topIndividualExpenses: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>;
  topIndividualIncome: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>;
  expensesByType: Array<{ type: ExpenseType; label: string; amount: number }>;
}

// The three real spending types, in the order shown in the email (structural first).
const EMAIL_EXPENSE_TYPE_ORDER: ExpenseType[] = ['fixed', 'variable', 'debt'];

/**
 * Aggregates a set of expense docs into income/expense totals and per-category /
 * per-type breakdowns plus the largest individual transactions.
 *
 * Classification is by expense TYPE (not by the sign of amount), mirroring the in-app
 * getMonthlyExpenseSummary/isCountableExpense so the email agrees with the Cashflow page:
 * type === 'transfer' is skipped (net-zero), type === 'income' is income, everything else
 * is expense via Math.abs (so a positive-amount refund still counts as spending).
 * Exported for reuse by the period-comparison builder.
 *
 * @param docs              The period's expense documents.
 * @param topIndividualLimit How many largest transactions to keep per side (default 5;
 *                           the yearly report passes 10). The Top-N income list is only
 *                           rendered for yearly emails but is always computed here.
 */
export function aggregateExpenses(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  topIndividualLimit = 5
): CashflowAggregation {
  let totalIncome = 0;
  let totalExpenses = 0;
  const expenseCategoryTotals: Record<string, { name: string; amount: number }> = {};
  const incomeCategoryTotals: Record<string, { name: string; amount: number }> = {};
  const expenseTypeTotals: Record<string, number> = {};
  const individualExpenses: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }> =
    [];
  const individualIncome: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }> =
    [];

  for (const doc of docs) {
    const data = doc.data() as {
      amount: number;
      type?: ExpenseType;
      categoryName?: string;
      categoryId?: string;
      subCategoryName?: string;
      notes?: string;
    };
    const { amount } = data;

    const key = data.categoryId?.trim() || data.categoryName?.trim() || 'Altro';
    const categoryName = data.categoryName?.trim() || 'Altro';
    // Notes carry the human description; fall back to the category name.
    const description = data.notes?.trim() || categoryName;

    // Classify by TYPE, not by the sign of amount — this mirrors the in-app
    // getMonthlyExpenseSummary / isCountableExpense so email and Cashflow agree.
    // A refund (expense-type row with a POSITIVE amount) must count as expense,
    // otherwise the email under-reports "Uscite totali" (it was being routed to income).
    if (data.type === 'transfer') {
      // Transfers are internal movements — net-zero, not real income/expense.
      continue;
    } else if (data.type === 'income') {
      totalIncome += amount;
      if (!incomeCategoryTotals[key]) {
        incomeCategoryTotals[key] = { name: categoryName, amount: 0 };
      }
      incomeCategoryTotals[key].amount += amount;
      individualIncome.push({
        description,
        categoryName,
        subCategoryName: data.subCategoryName,
        amount,
      });
    } else {
      const absAmount = Math.abs(amount);
      totalExpenses += absAmount;

      if (!expenseCategoryTotals[key]) {
        expenseCategoryTotals[key] = { name: categoryName, amount: 0 };
      }
      expenseCategoryTotals[key].amount += absAmount;

      // Per-type totals — only the three real spending types contribute.
      if (data.type && EMAIL_EXPENSE_TYPE_ORDER.includes(data.type)) {
        expenseTypeTotals[data.type] = (expenseTypeTotals[data.type] ?? 0) + absAmount;
      }

      // Individual transaction — subCategoryName carried through so the AI cause
      // analysis has finer granularity.
      individualExpenses.push({
        description,
        categoryName,
        subCategoryName: data.subCategoryName,
        amount: absAmount,
      });
    }
  }

  // All categories sorted desc — no cap; callers display the full list.
  // The id-based key travels with each entry so downstream cross-period lookups
  // (emailPeriodComparison) never fall back to the collision-prone display name.
  const topExpenseCategories = Object.entries(expenseCategoryTotals)
    .map(([key, totals]) => ({ key, ...totals }))
    .sort((a, b) => b.amount - a.amount);

  const allIncomeCategories = Object.entries(incomeCategoryTotals)
    .map(([key, totals]) => ({ key, ...totals }))
    .sort((a, b) => b.amount - a.amount);

  const topIndividualExpenses = individualExpenses
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topIndividualLimit);

  const topIndividualIncome = individualIncome
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topIndividualLimit);

  // Keep canonical type order, dropping types with no spend in the period.
  const expensesByType = EMAIL_EXPENSE_TYPE_ORDER.filter((type) => (expenseTypeTotals[type] ?? 0) > 0).map(
    (type) => ({ type, label: EXPENSE_TYPE_LABELS[type], amount: expenseTypeTotals[type] })
  );

  return {
    totalIncome,
    totalExpenses,
    topExpenseCategories,
    allIncomeCategories,
    topIndividualExpenses,
    topIndividualIncome,
    expensesByType,
  };
}

interface DividendAggregation {
  dividendTotal: number;
  dividendCount: number;
}

function aggregateDividends(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): DividendAggregation {
  let dividendTotal = 0;
  let dividendCount = 0;
  for (const doc of docs) {
    const data = doc.data();
    // Prefer EUR-converted gross amount when available
    const amount = (data.grossAmountEur ?? data.grossAmount ?? 0) as number;
    dividendTotal += amount;
    dividendCount++;
  }
  return { dividendTotal, dividendCount };
}

/**
 * Evaluates the user's expense budget alerts for a completed month.
 *
 * Reads the budget config via the Admin SDK and reuses the same pure evaluator
 * as the in-app banner (evaluateBudgetAlerts), so the email and the UI never
 * disagree. Returns an empty array when alerts are disabled or no budgets exist.
 *
 * `now` is pinned to the period-end day so the forecast collapses to actuals for
 * the completed month (daysElapsed === daysInMonth → no extrapolation).
 */
async function buildBudgetAlertsForMonth(
  userId: string,
  year: number,
  month: number,
  expenseDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<BudgetAlert[]> {
  const budgetSnap = await adminDb.collection('budgets').doc(userId).get();
  if (!budgetSnap.exists) return [];
  const data = budgetSnap.data() ?? {};

  if (data.alertsEnabled === false) return [];

  // Monthly email evaluates only monthly budgets: annual budgets are year-to-date
  // and the query window here is a single month.
  const items = ((data.items ?? []) as Array<BudgetItem & { monthlyAmount?: number }>)
    .map((item) => ({
      ...item,
      kind: item.kind ?? (item.scope === 'type' && item.expenseType === 'income' ? 'income' : 'expense'),
      period: item.period ?? 'monthly',
      amount: item.amount ?? item.monthlyAmount ?? 0,
    }))
    .filter((item) => item.kind === 'expense' && item.period === 'monthly');
  if (items.length === 0 && !data.overallMonthlyAmount) return [];

  const expenses: Expense[] = expenseDocs.map((doc) => {
    const e = doc.data();
    return {
      ...(e as Expense),
      date: e.date?.toDate ? e.date.toDate() : e.date,
    };
  });

  const thresholds = (data.alertThresholds as number[] | undefined) ?? DEFAULT_ALERT_THRESHOLDS;
  const periodNow = new Date(year, month - 1, new Date(year, month, 0).getDate(), 12);
  return evaluateBudgetAlerts(items, data.overallMonthlyAmount, expenses, thresholds, periodNow);
}

/**
 * Computes the Hall of Fame standing of a period's net-worth change, matching the
 * in-app ranking definition (same pure layer). Only monthly and yearly periods are
 * ranked — the Hall of Fame tracks months and years, not quarters/semesters.
 *
 * Reads all of the user's real snapshots once; ranking needs only net-worth deltas,
 * so expenses are not fetched here (passed empty to the record builders). Returns
 * undefined on any failure or when the period has no baseline — the mention is then
 * simply omitted and the email is unaffected.
 */
async function computeHallOfFameRank(
  userId: string,
  periodType: EmailPeriodType,
  year: number,
  month: number
): Promise<(PeriodGrowthRank & { scope: 'month' | 'year' }) | undefined> {
  if (periodType !== 'monthly' && periodType !== 'yearly') return undefined;

  try {
    const snapshots = (await getUserSnapshotsAdmin(userId)).filter((s) => !s.isDummy);

    if (periodType === 'yearly') {
      const records = calculateYearlyRecords(snapshots, []);
      const rank = rankPeriodByNetWorthGrowth(records, { year });
      return rank ? { ...rank, scope: 'year' } : undefined;
    }

    const records = calculateMonthlyRecords(snapshots, []);
    const rank = rankPeriodByNetWorthGrowth(records, { year, month });
    return rank ? { ...rank, scope: 'month' } : undefined;
  } catch (error) {
    console.error(`[hallOfFameRank] Computation failed for user ${userId}:`, error);
    return undefined;
  }
}

// ─── Core data builder ────────────────────────────────────────────────────────

/**
 * Fetches all data required for an email summary covering the given {year, month} period.
 *
 * - Monthly: compares against the previous month; expense window = that month.
 * - Quarterly: compares against the previous quarter end; expense window = full quarter.
 * - Yearly: compares against the previous December; expense window = full year.
 *
 * Returns null when no snapshot exists for the current period end.
 */
export async function buildPeriodEmailData(
  userId: string,
  year: number,
  month: number,
  periodType: EmailPeriodType = 'monthly'
): Promise<MonthlyEmailData | null> {
  // Determine previous-period snapshot coordinates
  let prevYear: number;
  let prevMonth: number;

  if (periodType === 'quarterly') {
    const prev = getPreviousQuarterEnd(year, month);
    prevYear = prev.year;
    prevMonth = prev.month;
  } else if (periodType === 'semiannual') {
    const prev = getPreviousHalfEnd(year, month);
    prevYear = prev.year;
    prevMonth = prev.month;
  } else if (periodType === 'yearly') {
    prevYear = year - 1;
    prevMonth = 12;
  } else {
    // monthly
    prevMonth = month === 1 ? 12 : month - 1;
    prevYear = month === 1 ? year - 1 : year;
  }

  const windowStartMonth = getPeriodWindowStartMonth(periodType, month);
  const windowStart = new Date(year, windowStartMonth - 1, 1);
  // Last day of the period end month
  const windowEnd = new Date(year, month, 0, 23, 59, 59);

  const [currentSnap, prevSnap, expensesSnap, dividendsSnap] = await Promise.all([
    // isDummy filter omitted from query — handled in code to stay within 3 Firestore conditions
    adminDb
      .collection('monthly-snapshots')
      .where('userId', '==', userId)
      .where('year', '==', year)
      .where('month', '==', month)
      .limit(1)
      .get(),

    adminDb
      .collection('monthly-snapshots')
      .where('userId', '==', userId)
      .where('year', '==', prevYear)
      .where('month', '==', prevMonth)
      .limit(1)
      .get(),

    adminDb
      .collection('expenses')
      .where('userId', '==', userId)
      .where('date', '>=', Timestamp.fromDate(windowStart))
      .where('date', '<=', Timestamp.fromDate(windowEnd))
      .get(),

    adminDb
      .collection('dividends')
      .where('userId', '==', userId)
      .where('paymentDate', '>=', Timestamp.fromDate(windowStart))
      .where('paymentDate', '<=', Timestamp.fromDate(windowEnd))
      .get(),
  ]);

  const realCurrentDocs = currentSnap.docs.filter((d) => !d.data().isDummy);
  const realPrevDocs = prevSnap.docs.filter((d) => !d.data().isDummy);

  if (realCurrentDocs.length === 0) return null;

  const current = realCurrentDocs[0].data();
  const previous = realPrevDocs.length > 0 ? realPrevDocs[0].data() : null;

  const currentNetWorth: number = current.totalNetWorth ?? 0;
  const previousNetWorth: number = previous?.totalNetWorth ?? 0;
  const netWorthDelta = currentNetWorth - previousNetWorth;
  const netWorthDeltaPct =
    previousNetWorth !== 0 ? (netWorthDelta / Math.abs(previousNetWorth)) * 100 : 0;

  const byAssetClass: Record<string, number> = current.byAssetClass ?? {};
  const previousByAssetClass: Record<string, number> = previous?.byAssetClass ?? {};

  // The yearly report surfaces the Top 10 transactions; shorter periods keep 5.
  const topIndividualLimit = periodType === 'yearly' ? 10 : 5;
  const {
    totalIncome,
    totalExpenses,
    topExpenseCategories,
    allIncomeCategories,
    topIndividualExpenses,
    topIndividualIncome,
    expensesByType,
  } = aggregateExpenses(expensesSnap.docs, topIndividualLimit);
  const { dividendTotal, dividendCount } = aggregateDividends(dividendsSnap.docs);

  // Budget alerts are month-centric — only attach them to monthly emails.
  const budgetAlerts =
    periodType === 'monthly'
      ? await buildBudgetAlertsForMonth(userId, year, month, expensesSnap.docs)
      : undefined;

  // Hall of Fame standing (monthly/yearly only) — never blocks the email on failure.
  const hallOfFameRank = await computeHallOfFameRank(userId, periodType, year, month);

  const expenseSplit = await buildExpenseSplitForPeriod(userId, expensesSnap.docs, new Date());
  const expensesByRole = await buildExpensesByRoleForPeriod(userId, expensesSnap.docs, totalExpenses);
  const portfolio = await buildEmailPortfolio({
    userId,
    year,
    month,
    prevYear,
    prevMonth,
    windowStartMonth,
    windowStart,
    windowEnd,
    expenseDocs: expensesSnap.docs,
  });

  return {
    periodType,
    year,
    month,
    quarter: periodType === 'quarterly' ? monthToQuarter(month) : undefined,
    semester: periodType === 'semiannual' ? monthToSemester(month) : undefined,
    currentNetWorth,
    previousNetWorth,
    netWorthDelta,
    netWorthDeltaPct,
    liquidNetWorth: current.liquidNetWorth ?? 0,
    byAssetClass,
    previousByAssetClass,
    totalIncome,
    totalExpenses,
    topExpenseCategories,
    allIncomeCategories,
    topIndividualExpenses,
    topIndividualIncome,
    expensesByType,
    expensesByRole,
    dividendTotal,
    dividendCount,
    hallOfFameRank,
    budgetAlerts,
    expenseSplit,
    ...portfolio,
  };
}

type EmailPortfolioSection = Pick<MonthlyEmailData, 'periodSales' | 'drivers' | 'classMoves' | 'allocation' | 'trades' | 'periodReturn'>;

/**
 * The portfolio half of the email, measured with the pages' own functions (F1b,
 * lib/utils/emailPortfolio.ts): Storico's Driver over the window, the Allocazione comparison on
 * the period-end snapshot, the ledger's trades and Rendimenti's TWR on its base. Every part is
 * independent and never blocks the email — a failed read costs its tile and its prompt block, and
 * the verdict drops the clause (a failed ledger read leaves the sales clause out, as before).
 */
async function buildEmailPortfolio(input: {
  userId: string;
  year: number;
  month: number;
  prevYear: number;
  prevMonth: number;
  windowStartMonth: number;
  windowStart: Date;
  windowEnd: Date;
  expenseDocs: FirebaseFirestore.QueryDocumentSnapshot[];
}): Promise<EmailPortfolioSection> {
  const { userId, year, month, prevYear, prevMonth, windowStart, windowEnd } = input;
  let assets: Asset[];
  let transactions: AssetTransaction[];
  try {
    [assets, transactions] = await Promise.all([getUserAssetsAdmin(userId), getAssetTransactionsAdmin(userId)]);
  } catch (error) {
    console.error(`[emailPortfolio] Assets or ledger read failed for user ${userId}:`, error);
    return { periodSales: null, drivers: null, classMoves: null, allocation: null, trades: [], periodReturn: null };
  }

  const periodSales = summarizePeriodSales(assets, transactions, { start: windowStart, end: windowEnd });
  const trades = summarizeTradesByInstrument({
    assets,
    trades: transactions,
    months: { from: { year, month: input.windowStartMonth }, to: { year, month } },
    sales: periodSales,
  });

  const [snapshotsRead, contributionsRead, settingsRead, goalsRead] = await Promise.allSettled([
    getUserSnapshotsAdmin(userId),
    getPensionContributionsAdmin(userId),
    getSettingsAdmin(userId),
    getGoalDataAdmin(userId),
  ]);
  const settings = settingsRead.status === 'fulfilled' ? settingsRead.value : null;
  if (snapshotsRead.status === 'rejected' || contributionsRead.status === 'rejected') {
    console.error(`[emailPortfolio] Snapshots or pension read failed for user ${userId}`);
    return { periodSales, drivers: null, classMoves: null, allocation: null, trades, periodReturn: null };
  }
  const snapshots = snapshotsRead.value;
  const contributions = contributionsRead.value;
  const expenses = input.expenseDocs.map((doc) => {
    const data = doc.data();
    return { ...data, id: doc.id, date: data.date?.toDate?.() ?? new Date() } as Expense;
  });

  // Storico's Driver over the window: the email's own two snapshots and every real one between.
  const index = (y: number, m: number) => y * 12 + m;
  const chain = snapshots.filter((s) => !s.isDummy && index(s.year, s.month) >= index(prevYear, prevMonth) && index(s.year, s.month) <= index(year, month));
  let measured: EmailDrivers | null = null;
  try {
    measured = measureEmailDrivers(chain, {
      expenses,
      transactions,
      assets,
      pension: { contributions, startMonth: resolvePensionReturnStart(contributions, settings?.pensionReturnStartMonth) },
      today: new Date(),
    });
  } catch (error) {
    console.error(`[emailPortfolio] Driver failed for user ${userId}:`, error);
  }

  // Allocazione on the period-end snapshot, with the page's effective targets.
  let allocation: EmailAllocationSummary | null = null;
  const current = chain.find((s) => s.year === year && s.month === month);
  if (current) {
    try {
      const { targets, fromGoals } = resolveEffectiveTargets({
        settings,
        goalData: goalsRead.status === 'fulfilled' ? goalsRead.value : null,
        assets,
      });
      allocation = summarizeEmailAllocation({ assets, snapshot: current, targets, fromGoals });
    } catch (error) {
      console.error(`[emailPortfolio] Allocation failed for user ${userId}:`, error);
    }
  }

  // Rendimenti's TWR on its own base, over the email's window (the PDF's precedent, #324).
  let periodReturn: EmailPeriodReturn | null = null;
  try {
    const base = resolvePerformanceBase({ snapshots, assets, contributions, settings, trades: transactions });
    const metrics = await calculatePerformanceForPeriod(
      userId,
      base.snapshots,
      'CUSTOM',
      settings?.riskFreeRate ?? 2.5,
      windowStart,
      windowEnd,
      expenses,
      settings?.dividendIncomeCategoryId,
      base.pensionFlows,
      base.portfolioFlows,
    );
    periodReturn = resolveEmailPeriodReturn(metrics, describeMeasurementBase(base));
  } catch (error) {
    console.error(`[emailPortfolio] Period return failed for user ${userId}:`, error);
  }

  return {
    periodSales,
    drivers: measured?.drivers ?? null,
    classMoves: measured?.classMoves ?? null,
    allocation,
    trades,
    periodReturn,
  };
}

/**
 * The household split over the email's own window, or undefined when there is nothing to say.
 *
 * It re-uses `summarizeExpenseSplit` rather than aggregating again: the email's figures and the
 * ones on Cashflow › Divisione have to be the same figures, and the only way to guarantee that
 * is for them to come out of the same function. `now` is the real clock, so a period already
 * closed has no scheduled part and a running one declares it exactly as the page does.
 *
 * Returns undefined — never an empty summary — when the feature is off or the household has
 * fewer than two people: the section is then absent instead of rendering a box with no answer.
 */
/**
 * The window's outflows by 50/30/20 role, or null when the roles are off (`spendingRolesEnabled`)
 * or a read fails — the tile and the prompt then keep the type split, as before. The role of a row
 * is resolved from TODAY's categories, as Analisi's Flusso does.
 */
async function buildExpensesByRoleForPeriod(
  userId: string,
  expenseDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  totalExpenses: number
): Promise<EmailSpendingRoles | null> {
  try {
    const settings = await getSettingsAdmin(userId);
    if (!settings?.spendingRolesEnabled) return null;
    const categoriesSnap = await adminDb.collection('expenseCategories').where('userId', '==', userId).get();
    const categories = categoriesSnap.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, subCategories: data.subCategories ?? [] } as ExpenseCategory;
    });
    const expenses = expenseDocs.map((doc) => ({ ...doc.data(), id: doc.id }) as Expense);
    return summarizeEmailSpendingRoles(summarizeSpendingRoles(expenses, categories), totalExpenses);
  } catch (error) {
    console.error('Failed to build the spending by role', { userId, error });
    return null;
  }
}

async function buildExpenseSplitForPeriod(
  userId: string,
  expenseDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  now: Date
): Promise<ExpenseSplitSummary | undefined> {
  try {
    const settings = await getSettingsAdmin(userId);
    const members = settings?.familyMembers ?? [];
    if (!settings?.expenseSplitEnabled || members.length < 2) return undefined;

    const expenses = expenseDocs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date: data.date?.toDate?.() ?? new Date(),
      } as Expense;
    });

    return summarizeExpenseSplit({ expenses, members, now });
  } catch (error) {
    // Never block an email on this section, like every other optional block here.
    console.error('Failed to build the expense split section', { userId, error });
    return undefined;
  }
}

/** Backward-compatible wrapper — builds monthly email data. */
export async function buildMonthlyEmailData(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyEmailData | null> {
  return buildPeriodEmailData(userId, year, month, 'monthly');
}

// ─── Email HTML generator ─────────────────────────────────────────────────────
//
// The message is a verdict over tiles, the same shape every redesigned page takes: one
// rule-generated sentence that answers "how did the period go?" before any number, then one
// tile per question. The words all come from `lib/utils/emailNarrative.ts` and the chrome from
// `lib/server/emailHtml.ts`; nothing below writes copy or a colour of its own.

/** How many ranked rows a category tile prints before closing on a residual. */
const RANKED_ROWS_SHOWN = 6;

/**
 * The Driver as Storico's ledger (`buildDriverLedger`): whole euros that add up to the growth on
 * the last row. A flow is uncoloured, the market and the total take their sign, the tax is a loss
 * — `DriverLedgerKind`, the page's own rule.
 */
function driverLedgerRows(drivers: GrowthDrivers): EmailRankedRow[] {
  return buildDriverLedger(drivers).map((row) => {
    const amountSign: EmailRankedRow['amountSign'] =
      row.kind === 'loss' ? 'negative' : row.kind === 'flow' ? undefined : row.value >= 0 ? 'positive' : 'negative';
    return { label: row.label, amount: signedEur(row.value), ...(amountSign ? { amountSign } : {}) };
  });
}

/**
 * One row per class of the allocated base: its share, the target beside it, and the drift in
 * points — coloured only when the 5/25 band calls it off target (a drift inside the band is not
 * a loss). The share bar carries the class colour, like Composizione.
 */
function allocationRows(allocation: EmailAllocationSummary): EmailRankedRow[] {
  const largest = Math.max(0, ...allocation.classes.map((gap) => gap.currentPercentage));
  return allocation.classes.map((gap) => {
    const offTarget = gap.action !== 'OK';
    return {
      label: gap.label,
      caption: `target ${formatPercentageIt(gap.targetPercentage, 1)} · ${offTarget ? 'fuori dalla regola 5/25' : 'in linea'}`,
      amount: formatPercentageIt(gap.currentPercentage, 1),
      trailing: `${gap.differencePp >= 0 ? '+' : '−'}${formatNumberIt(Math.abs(gap.differencePp), 1)} pp`,
      ...(offTarget ? { trailingSign: 'negative' as const } : {}),
      fill: largest > 0 ? gap.currentPercentage / largest : 0,
      fillHex: printChartHexForAssetClass(gap.assetClass),
    };
  });
}

/**
 * «Andamento per classe»: the amount is the band's MARKET (coloured by sign); what else moved it
 * — the money traded, the pension contributions, the rest — rides in the caption, uncoloured,
 * because a purchase is not a gain.
 */
function classMoveRows(rows: EmailClassMove[]): EmailRankedRow[] {
  return rows.map((row) => {
    const parts = [
      Math.abs(row.traded) >= 1 ? `acquisti e vendite ${signedEur(row.traded)}` : null,
      Math.abs(row.paidIn) >= 1 ? `versamenti ${signedEur(row.paidIn)}` : null,
      Math.abs(row.other) >= 1 ? `altri movimenti ${signedEur(row.other)}` : null,
    ].filter(Boolean);
    // A market that prints as zero carries neither sign nor colour (Storico's `isPrintedZero` rule):
    // «+0 €» in green on the cash row read as a gain (seen in the F1b render, 2026-09-28).
    const zero = Math.round(row.market) === 0;
    return {
      label: row.label,
      caption: `variazione ${signedEur(row.valueChange)}${parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}`,
      amount: zero ? formatEur(0) : signedEur(row.market),
      ...(zero ? {} : { amountSign: row.market > 0 ? ('positive' as const) : ('negative' as const) }),
    };
  });
}

/** The Hall of Fame standing, in the shape the verdict expects. */
function verdictRank(data: MonthlyEmailData): PeriodEmailVerdictInput['rank'] {
  const rank = data.hallOfFameRank;
  if (!rank) return null;
  return { position: rank.rank, total: rank.total, scope: rank.scope, trend: rank.trend };
}

/** Ranked rows for a category list: the head, then everything else as one residual row. */
function rankedCategoryRows(
  entries: Array<{ name: string; amount: number }>,
  total: number,
): EmailRankedRow[] {
  const positive = entries.filter((entry) => entry.amount > 0).sort((a, b) => b.amount - a.amount);
  if (positive.length === 0) return [];

  const largest = positive[0].amount;
  const shown = positive.slice(0, RANKED_ROWS_SHOWN);
  const rest = positive.slice(RANKED_ROWS_SHOWN);

  const share = (amount: number) => (total > 0 ? formatPercentageIt((amount / total) * 100, 1) : '—');

  const rows: EmailRankedRow[] = shown.map((entry) => ({
    label: entry.name,
    amount: formatEur(entry.amount),
    trailing: share(entry.amount),
    fill: largest > 0 ? entry.amount / largest : 0,
  }));

  // The residual closes the list so the shares visibly sum to 100% — a head-of-list whose
  // percentages stop at 81% reads as missing data rather than as a selection.
  if (rest.length > 0) {
    const restTotal = rest.reduce((sum, entry) => sum + entry.amount, 0);
    rows.push({
      label: `Altre ${rest.length} categorie`,
      amount: formatEur(restTotal),
      trailing: share(restTotal),
      residual: true,
    });
  }
  return rows;
}

/** The Composizione tile's rows — the one list where colour is an identity, not a rank. */
function assetClassRows(byAssetClass: Record<string, number>): { rows: EmailRankedRow[]; total: number } {
  const entries = Object.entries(byAssetClass)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const largest = entries[0]?.[1] ?? 0;

  return {
    total,
    rows: entries.map(([assetClass, value]) => ({
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      amount: formatEur(value),
      trailing: total > 0 ? formatPercentageIt((value / total) * 100, 1) : '—',
      fill: largest > 0 ? value / largest : 0,
      fillHex: printChartHexForAssetClass(assetClass),
    })),
  };
}

/** Individual transactions: the category on the row, the note under it when it adds anything. */
function transactionRows(
  entries: Array<{ description: string; categoryName: string; subCategoryName?: string }>,
  amounts: number[],
  sign?: 'positive',
): EmailRankedRow[] {
  return entries.map((entry, index) => {
    // The note earns its place only when it says something the labels do not already say.
    const redundant = entry.description === entry.categoryName || entry.description === entry.subCategoryName;
    const caption = [entry.subCategoryName, redundant ? null : entry.description].filter(Boolean).join(' · ');
    return {
      label: entry.categoryName,
      caption: caption || undefined,
      amount: sign === 'positive' ? signedEur(amounts[index]) : formatEur(amounts[index]),
    };
  });
}

/**
 * «Rispetto a un anno fa» — the tile that carries the SECOND baseline.
 *
 * It exists only when the year-earlier window differs from the previous period. On a yearly
 * email the two coincide (`previousEqualsYoy`), and every figure in it would repeat what the
 * Patrimonio and Cashflow tiles already print: The One-Tile-One-Question Rule. The old
 * «Confronti» table printed both columns unconditionally, so a yearly email said everything
 * twice and a monthly one restated its own headline delta.
 */
function buildYearOverYearTile(data: MonthlyEmailData, comparison: PeriodComparison | undefined): string {
  if (!comparison || comparison.previousEqualsYoy) return '';
  const period = emailPeriodOf(data);
  const { vsYoy } = comparison;

  const reading = describeYearOverYearTile({
    period,
    netWorth: vsYoy.netWorth,
    income: vsYoy.income,
    expenses: vsYoy.expenses,
  });
  if (!reading) return '';

  const row = (label: string, delta: MetricDelta | null, baseline: number | null, higherIsBetter: boolean) => ({
    label,
    baseline: baseline === null ? 'N/D' : formatEur(baseline),
    change: delta === null ? 'N/D' : formatDelta(delta),
    favourable: delta === null ? null : higherIsBetter ? delta.absChange >= 0 : delta.absChange <= 0,
  });

  // The baseline column is reconstructed from the current figure and the change, because that
  // is the only pair the comparison set carries — and it is exact, not an approximation.
  const baselineOf = (current: number, delta: MetricDelta | null) =>
    delta === null ? null : current - delta.absChange;

  const savings = data.totalIncome - data.totalExpenses;
  const rows = [
    row('Patrimonio netto', vsYoy.netWorth, baselineOf(data.currentNetWorth, vsYoy.netWorth), true),
    row('Entrate', vsYoy.income, baselineOf(data.totalIncome, vsYoy.income), true),
    row('Uscite', vsYoy.expenses, baselineOf(data.totalExpenses, vsYoy.expenses), false),
    row('Risparmio netto', vsYoy.savings, baselineOf(savings, vsYoy.savings), true),
  ];

  return emailTile({
    eyebrow: 'Rispetto a un anno fa',
    scope: `vs ${yearEarlierHeading(period)}`,
    reading,
    body: emailComparisonTable(['Metrica', yearEarlierHeading(period), 'Variazione'], rows),
    footer:
      'Il patrimonio confronta due snapshot di fine periodo; entrate, uscite e risparmio confrontano due periodi interi.',
  });
}

/** Budget alerts — monthly emails only, and absent when nothing crossed a threshold. */
function buildBudgetTile(data: MonthlyEmailData): string {
  const alerts = data.budgetAlerts;
  if (!alerts || alerts.length === 0) return '';

  // `MonthlyEmailData` carries the alerts, not the roster: how many budgets did NOT raise one
  // is unknown here, so the reading simply omits that clause instead of inventing a total.
  const reading = describeBudgetAlertsTile(alerts.map((alert) => ({ label: alert.label, level: alert.level })));

  const rows = alerts.map((alert) => {
    const forecast = alert.forecastedOverrun && alert.level !== 'exceeded' ? ' · sforamento previsto a fine mese' : '';
    return {
      label: alert.label,
      caption: `${formatEur(alert.spent)} / ${formatEur(alert.budgetAmount)} · ${formatPercentageIt(alert.usedRatio * 100, 0)}${forecast}`,
      level: alert.level,
    };
  });

  return emailTile({
    eyebrow: 'Budget',
    scope: `${alerts.length} fuori linea`,
    reading,
    body: emailAlertRows(rows),
  });
}

/**
 * «Spese in comune» — the household split, one row per person.
 *
 * The words come from `expenseSplitNarrative.ts`, the same sentences the Divisione tab prints.
 * Absent whenever the split could not be computed: an email is a one-way message, so a section
 * saying «the shares are unavailable» would be a notification the reader cannot act on from
 * where they are reading it. The page is where that explanation belongs.
 */
export function buildExpenseSplitTile(data: MonthlyEmailData): string {
  const summary = data.expenseSplit;
  if (!summary || summary.basis.kind !== 'computed') return '';

  // The BOOKED residual, exactly as the page prints it: an email that led with the period's
  // figure would call somebody short over a bill still in their account, and its own caption —
  // which comes from the same function the page reads — would say otherwise two lines below.
  // Where the calendar takes them rides in the caption, never as a second amount.
  const rows: EmailRankedRow[] = summary.members
    .filter((balance) => balance.remainingBooked !== null)
    .map((balance) => {
      const calendar = describeMemberCalendar(balance);
      const caption = [describeMemberBalance(balance), calendar]
        .filter((narrative): narrative is Narrative => narrative !== null)
        .map(narrativeToText)
        .join(' ');
      return {
        label: balance.member.name,
        caption,
        amount: signedEur(balance.remainingBooked as number),
        // On the SIGN of the booked figure, like the tile on the page. `trailingSign` alone never
        // painted anything here: it colours the optional third column, which this list has no use
        // for, so a person who came up short printed the same ink as one who did not (seen in a
        // render, 2026-09-22).
        amountSign: ((balance.remainingBooked as number) >= 0 ? 'positive' : 'negative') as 'positive' | 'negative',
      };
    });
  if (rows.length === 0) return '';

  // The page shows what the common income took off the pool as two rows under its hero; the
  // email has no hero, so the reading carries it — absent when nothing was left in comune.
  const commonIncome = describeCommonIncome(summary);
  return emailTile({
    eyebrow: 'Spese in comune',
    scope: periodScopeLabel(emailPeriodOf(data)),
    reading: [...describeSplitBasis(summary.basis), ...(commonIncome ? [{ text: ' ' }, ...commonIncome] : [])],
    body: emailRankedRows(rows),
  });
}

/**
 * Renders one periodic email — monthly, quarterly, semiannual or yearly.
 *
 * There is ONE template for the four: they differ in their labels (which the narrative layer
 * resolves from the period) and in which tiles exist at all — Budget and the Hall of Fame
 * standing are monthly, the income Top 10 is yearly, and «Rispetto a un anno fa» disappears on
 * a yearly email because there the two baselines coincide.
 */
export function generateEmailHtml(data: MonthlyEmailData, comparisonData?: PeriodComparison): string {
  const period = emailPeriodOf(data);
  const title = periodTitle(data);
  const savings = data.totalIncome - data.totalExpenses;
  const drivers = data.previousNetWorth > 0 ? (data.drivers ?? null) : null;

  const verdict = buildPeriodEmailVerdict({
    period,
    currentNetWorth: data.currentNetWorth,
    previousNetWorth: data.previousNetWorth,
    netWorthDelta: data.netWorthDelta,
    netWorthDeltaPct: data.netWorthDeltaPct,
    totalIncome: data.totalIncome,
    totalExpenses: data.totalExpenses,
    drivers,
    periodReturn: data.periodReturn ?? null,
    offTarget: data.allocation?.offTarget ?? [],
    sales: data.periodSales ?? null,
    rank: verdictRank(data),
  });

  const tiles: string[] = [
    emailVerdict({
      eyebrow: `Net Worth Tracker · ${periodKindLabel(period.kind)}`,
      scope: title,
      verdict,
    }),
  ];

  // The AI comment is prose and sits SECOND: it can be absent (generation is non-blocking),
  // and an email whose first words can vanish has no opening at all.
  if (data.aiComment) {
    tiles.push(
      emailTile({
        eyebrow: 'Commento AI',
        scope: title,
        body: emailProse(simpleMarkdownToHtml(data.aiComment)),
        footer: 'Generato da Assistente AI — verifica sempre le informazioni prima di agire.',
        muted: true,
      }),
    );
  }

  // ── Patrimonio ──
  const netWorthFigures: EmailKeyFigure[] = [{ label: 'Liquido', value: formatEur(data.liquidNetWorth) }];
  if (data.previousNetWorth > 0) {
    netWorthFigures.push({
      label: periodBaselineHeading(period),
      value: formatEur(data.previousNetWorth),
      muted: true,
    });
  }
  // The Driver's ledger under the hero (Storico's rows, adding up to the growth); Rendimenti's
  // return in the footer with its base. Not a third key figure: three nowrap figures in one row
  // pushed the email to 434px on a 390 phone (seen in the F1b render, 2026-09-28).
  const netWorthFooter: Narrative = [
    ...(drivers ? describeDriverFooter(drivers) : []),
    ...(data.periodReturn
      ? [
          { text: `${drivers ? ' ' : ''}Rendimento del portafoglio ${data.periodReturn.label}: ` },
          { text: signedPct(data.periodReturn.value), mono: true, sign: data.periodReturn.value >= 0 ? ('positive' as const) : ('negative' as const) },
          { text: ` (TWR). ${data.periodReturn.baseLabel}` },
        ]
      : []),
  ];
  tiles.push(
    emailTile({
      eyebrow: 'Patrimonio',
      scope: `al ${periodEndLabel(period)}`,
      reading: describeNetWorthTile({
        period,
        previousNetWorth: data.previousNetWorth,
        netWorthDelta: data.netWorthDelta,
        netWorthDeltaPct: data.netWorthDeltaPct,
      }),
      body:
        emailHero(formatEur(data.currentNetWorth)) +
        emailKeyFigures(netWorthFigures) +
        (drivers ? emailRankedRows(driverLedgerRows(drivers)) : ''),
      footer: netWorthFooter.length > 0 ? netWorthFooter : undefined,
    }),
  );

  // ── Composizione ──
  const composition = assetClassRows(data.byAssetClass);
  if (composition.rows.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Composizione',
        scope: `${composition.rows.length} class${composition.rows.length === 1 ? 'e' : 'i'}`,
        reading: describeCompositionTile(
          Object.entries(data.byAssetClass).map(([assetClass, value]) => ({ assetClass, value })),
        ),
        body: emailRankedRows(composition.rows),
      }),
    );
  }

  // ── Allocazione ── the allocated base (tradable + frozen) at the period's end, today's roles,
  // the page's effective targets, the 5/25 band. Composizione above stays on the whole net worth.
  const allocation = data.allocation;
  if (allocation && allocation.classes.length > 0) {
    // The leverage rides in the footer: in the scope it pushed a 390px phone 1px sideways (the head
    // row does not wrap; seen in the F1b render, 2026-09-28).
    const leverage = allocation.hasLeveragedExposure ? ` Leva ${formatLeverage(allocation.leverageRatio)}: le quote sono esposizioni sul capitale investito.` : '';
    const footer: Narrative = [
      ...(describeBalanceFooter({ frozen: allocation.frozen, excluded: allocation.excluded, netWorth: data.currentNetWorth }) ?? []),
      { text: `${allocation.frozen.count + allocation.excluded.count > 0 ? ' ' : ''}Valori di fine periodo, ruoli di oggi; target ${allocation.fromGoals ? 'derivati dagli obiettivi' : 'di Impostazioni'}, banda 5/25.${leverage}` },
      ...(allocation.unmatched.length > 0
        ? [{ text: ` Fuori dal calcolo ${allocation.unmatched.length === 1 ? 'uno strumento non più presente' : `${allocation.unmatched.length} strumenti non più presenti`} (${formatEur(allocation.unmatched.reduce((sum, row) => sum + row.totalValue, 0))}).` }]
        : []),
    ];
    tiles.push(
      emailTile({
        eyebrow: 'Allocazione',
        scope: `${formatEur(allocation.marketValue)} allocati`,
        reading: describeClasses(allocation.classes, EMAIL_REBALANCE_BAND) ?? undefined,
        body: emailRankedRows(allocationRows(allocation)),
        footer,
      }),
    );
  }

  // ── Andamento per classe ── market and flows apart; absent when the period is not measured
  // per instrument (a class difference cannot tell a purchase from a price).
  const moves = data.classMoves?.rows ?? [];
  if (moves.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Andamento per classe',
        scope: periodScopeLabel(period),
        reading: describeClassMovesTile(moves) ?? undefined,
        body: emailRankedRows(classMoveRows(moves)),
        footer: [{ text: 'L’importo è il mercato, misurato strumento per strumento; la variazione comprende acquisti, vendite e versamenti. I compositi sono divisi per classe, i fondi pensione stanno in Previdenza.' }],
      }),
    );
  }

  // ── Cashflow ──
  tiles.push(
    emailTile({
      eyebrow: 'Cashflow',
      scope: periodScopeLabel(period),
      reading: describeCashflowTile({ totalIncome: data.totalIncome, totalExpenses: data.totalExpenses }),
      body: emailKeyFigures([
        { label: 'Entrate', value: formatEur(data.totalIncome), sign: 'positive' },
        { label: 'Uscite', value: `−${formatEur(data.totalExpenses)}`, sign: 'negative' },
        { label: 'Risparmio netto', value: formatEur(savings), sign: savings >= 0 ? 'positive' : 'negative' },
      ]),
      footer: 'Risparmio netto = entrate − uscite, sull’intero periodo.',
    }),
  );

  // ── Spese per categoria ──
  const expenseRows = rankedCategoryRows(data.topExpenseCategories, data.totalExpenses);
  if (expenseRows.length > 0) {
    // Legacy and imported rows can carry no expense type, and `aggregateExpenses` counts them
    // in totalExpenses while leaving them out of expensesByType — so the typed rows stopped
    // short of 100% with nothing explaining the gap. The residual keeps its own name.
    // With the 50/30/20 roles on, the roles replace the types (their own residual is already in
    // «Da classificare», lib/utils/spendingRoles.ts).
    const typedTotal = data.expensesByType.reduce((sum, entry) => sum + entry.amount, 0);
    const unclassified = data.totalExpenses - typedTotal;
    const types = [...data.expensesByType.map((entry) => ({ label: entry.label, amount: entry.amount }))];
    if (unclassified > 0.005) types.push({ label: 'Non classificate', amount: unclassified });
    // The roles read on INCOME (Risparmi included), the types on the outflows: the footer says which.
    const roles = data.expensesByRole && data.expensesByRole.rows.length > 0 ? data.expensesByRole : null;

    tiles.push(
      emailTile({
        eyebrow: 'Spese per categoria',
        scope: `${data.topExpenseCategories.length} categorie`,
        reading: describeExpenseCategoriesTile(data.topExpenseCategories, RANKED_ROWS_SHOWN),
        body: emailRankedRows(expenseRows),
        footer: roles ? describeSpendingRolesFooter(roles) : describeExpenseTypes(types),
      }),
    );
  }

  // ── Entrate per categoria ──
  const incomeRows = rankedCategoryRows(data.allIncomeCategories, data.totalIncome);
  if (incomeRows.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Entrate per categoria',
        scope: `${data.allIncomeCategories.length} categorie`,
        reading: describeIncomeCategoriesTile(data.allIncomeCategories, RANKED_ROWS_SHOWN),
        body: emailRankedRows(incomeRows),
      }),
    );
  }

  // ── Spese maggiori ──
  if (data.topIndividualExpenses.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Spese maggiori',
        scope: `${data.topIndividualExpenses.length} voci`,
        reading: describeTopExpensesTile(data.topIndividualExpenses, data.totalExpenses),
        body: emailRankedRows(
          transactionRows(
            data.topIndividualExpenses,
            data.topIndividualExpenses.map((expense) => expense.amount),
          ),
        ),
      }),
    );
  }

  // ── Entrate maggiori — yearly only ──
  if (data.periodType === 'yearly' && data.topIndividualIncome.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Entrate maggiori',
        scope: `${data.topIndividualIncome.length} voci`,
        body: emailRankedRows(
          transactionRows(
            data.topIndividualIncome,
            data.topIndividualIncome.map((income) => income.amount),
            'positive',
          ),
        ),
      }),
    );
  }

  // ── Dividendi ──
  const dividendReading = describeDividendsTile(data.dividendTotal, data.dividendCount);
  if (dividendReading) {
    tiles.push(
      emailTile({
        eyebrow: 'Dividendi e cedole',
        scope: periodScopeLabel(period),
        reading: dividendReading,
        body: emailHero(cachedFormatCurrencyEUR(data.dividendTotal)),
      }),
    );
  }

  tiles.push(buildYearOverYearTile(data, comparisonData));
  tiles.push(buildBudgetTile(data));
  tiles.push(buildExpenseSplitTile(data));

  return emailShell({
    title: `Riepilogo ${title}`,
    // The inbox preview is the verdict: the reader knows how the period went before opening.
    preheader: verdict.headline,
    body: tiles.filter(Boolean).join('\n'),
    footer: `Generato automaticamente da Net Worth Tracker · ${escapeHtml(title)}`,
  });
}

// ─── Sender ───────────────────────────────────────────────────────────────────

/**
 * Send a periodic summary email to all configured recipients.
 * Throws if RESEND_API_KEY is not set or if Resend returns an error.
 */
export async function sendMonthlyEmail(
  recipients: string[],
  data: MonthlyEmailData,
  comparison?: PeriodComparison
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const title = periodTitle(data);
  const subjectPrefix =
    data.periodType === 'quarterly'
      ? 'Riepilogo Trimestrale'
      : data.periodType === 'semiannual'
      ? 'Riepilogo Semestrale'
      : data.periodType === 'yearly'
      ? 'Riepilogo Annuale'
      : 'Riepilogo';

  const subject = `${subjectPrefix} ${title} — Net Worth Tracker`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com',
    to: recipients,
    subject,
    html: generateEmailHtml(data, comparison),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

// ─── Convenience builders ─────────────────────────────────────────────────────

/**
 * Build and send for any period type.
 * Returns false when no snapshot exists for the period (email skipped).
 * Generates an AI comment and injects it into the email when possible;
 * AI failure is non-blocking — the email is sent without the comment.
 */
export async function buildAndSendForPeriod(
  userId: string,
  recipients: string[],
  periodType: EmailPeriodType,
  year: number,
  month: number
): Promise<boolean> {
  const emailData = await buildPeriodEmailData(userId, year, month, periodType);
  if (!emailData) return false;

  // Deterministic comparison dataset (vs previous period + YoY) — feeds both the email
  // table and the AI commentary. Failure must not block the email: fall back to no comparison.
  let comparison: PeriodComparison | undefined;
  try {
    comparison = await buildPeriodComparison(userId, emailData);
  } catch (error) {
    console.error(`[email] Comparison build failed for user ${userId}:`, error);
  }

  // Attempt to generate the AI comment — failure is silently swallowed inside generateEmailAiComment.
  // The comparison is required for the comparison-driven prompt; skip the comment if it's missing.
  if (comparison) {
    const aiComment = await generateEmailAiComment(userId, emailData, comparison);
    if (aiComment) {
      emailData.aiComment = aiComment;
    }
  }

  await sendMonthlyEmail(recipients, emailData, comparison);
  return true;
}

/** Build and send quarterly/yearly convenience aliases used by the cron handler. */
export async function buildAndSendQuarterly(
  userId: string,
  recipients: string[],
  year: number,
  quarter: number
): Promise<boolean> {
  const lastMonth = quarter * 3;
  return buildAndSendForPeriod(userId, recipients, 'quarterly', year, lastMonth);
}

export async function buildAndSendSemiAnnual(
  userId: string,
  recipients: string[],
  year: number,
  half: number
): Promise<boolean> {
  // half 1 → June (end month 6); half 2 → December (end month 12)
  const lastMonth = half === 1 ? 6 : 12;
  return buildAndSendForPeriod(userId, recipients, 'semiannual', year, lastMonth);
}

export async function buildAndSendYearly(
  userId: string,
  recipients: string[],
  year: number
): Promise<boolean> {
  return buildAndSendForPeriod(userId, recipients, 'yearly', year, 12);
}
