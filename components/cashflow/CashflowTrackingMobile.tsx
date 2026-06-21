'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CashflowHero } from '@/components/cashflow/cashflow-kpi/CashflowHero';
import { CashflowCategoryDrawer } from '@/components/cashflow/cashflow-kpi/CashflowCategoryDrawer';
import { cn } from '@/lib/utils';
import { type Period, periodLabel } from '@/lib/utils/period';
import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { MultiSelectGroup } from '@/components/ui/multi-select';
import { MobileFiltersDrawer } from '@/components/cashflow/MobileFiltersDrawer';
import { type CategoryBreakdownItem } from '@/components/cashflow/CategoryBreakdownList';
import { TransactionFeed } from '@/components/cashflow/TransactionFeed';

// ─── Local option types (structural match with MobileFiltersDrawer internals) ──

interface SubCategoryOption {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
}

interface AccountOption {
  id: string;
  name: string;
}

type MobileSortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'category-asc';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CashflowTrackingMobileProps {
  // ── Filters (passed through to MobileFiltersDrawer) ──────────────────────────
  period: Period;
  onPeriodChange: (period: Period) => void;
  availableYears: number[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
  categoryMultiSelectOptions: MultiSelectGroup[];
  multiSelectValue: string[];
  onCategoryChange: (values: string[]) => void;
  soloSelectedCategory: ExpenseCategory | null;
  subCategoryOptions: SubCategoryOption[];
  selectedSubCategoryId: string;
  onSubCategoryChange: (v: string) => void;
  accountOptions: AccountOption[];
  selectedAccountId: string;
  onAccountChange: (v: string) => void;
  activeFilterCount: number;
  onReset: () => void;

  // ── Hero KPIs ─────────────────────────────────────────────────────────────────
  income: number;
  expenses: number;
  net: number;
  /** Month-over-month income delta (percentage). */
  incomeDelta?: number | null;
  /** Month-over-month expenses delta (percentage). */
  expensesDelta?: number | null;
  expenseCategories: CategoryBreakdownItem[];
  incomeCategories: CategoryBreakdownItem[];
  categories: ExpenseCategory[];
  transfers?: number;

  // ── Transaction list ──────────────────────────────────────────────────────────
  /** Full sorted list (not yet sliced). TransactionFeed handles slicing internally. */
  transactions: Expense[];
  /** Total count before slicing, used for load-more display. */
  totalCount: number;
  showCount: number;
  onLoadMore: () => void;
  mobileSortKey: MobileSortKey;
  onSortChange: (key: MobileSortKey) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  isDemo: boolean;
  hasActiveFilters: boolean;
  onAddExpense: () => void;
  /** Map of categoryId → { icon?, color? } for row icon badges. */
  categoryMetaMap: Map<string, { icon?: string; color?: string }>;

  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CashflowTrackingMobile({
  // Filters
  period,
  onPeriodChange,
  availableYears,
  searchQuery,
  onSearchChange,
  categoryMultiSelectOptions,
  multiSelectValue,
  onCategoryChange,
  soloSelectedCategory,
  subCategoryOptions,
  selectedSubCategoryId,
  onSubCategoryChange,
  accountOptions,
  selectedAccountId,
  onAccountChange,
  activeFilterCount,
  onReset,
  // KPIs
  income,
  expenses,
  net,
  incomeDelta,
  expensesDelta,
  expenseCategories,
  incomeCategories,
  categories,
  transfers,
  // Transactions
  transactions,
  totalCount,
  showCount,
  onLoadMore,
  mobileSortKey,
  onSortChange,
  onEdit,
  onDelete,
  isDemo,
  hasActiveFilters,
  onAddExpense,
  categoryMetaMap,
  className,
}: Readonly<CashflowTrackingMobileProps>) {
  // "Tutte le categorie" opens the full income/expense breakdown (Analisi lives a page away).
  const [catDrawerOpen, setCatDrawerOpen] = useState(false);

  // Rows group by day only when sorting by date; amount/category sorts stay flat.
  const grouped = mobileSortKey === 'date-desc' || mobileSortKey === 'date-asc';

  return (
    <div className={cn('space-y-3 pt-3', className)}>
      {/* ── 1. Page title + count + add button ───────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-foreground text-lg font-semibold tracking-tight">Le tue spese</h2>
          <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
            {totalCount} risultati
          </p>
        </div>
        {/* Hidden in portrait, where the bottom-nav FAB already provides "add".
            In landscape the bottom nav (and its FAB) is hidden, so this button shows. */}
        <Button
          size="sm"
          onClick={onAddExpense}
          disabled={isDemo}
          aria-label={isDemo ? 'Aggiungi — non disponibile in modalità demo' : 'Aggiungi voce'}
          title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          className="max-desktop:portrait:hidden h-9 flex-shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Aggiungi
        </Button>
      </div>

      {/* ── 2. Filter bar: [periodo] [filtri] [sort] ───────────────────────── */}
      <MobileFiltersDrawer
        period={period}
        onPeriodChange={onPeriodChange}
        availableYears={availableYears}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        categoryMultiSelectOptions={categoryMultiSelectOptions}
        multiSelectValue={multiSelectValue}
        onCategoryChange={onCategoryChange}
        soloSelectedCategory={soloSelectedCategory}
        subCategoryOptions={subCategoryOptions}
        selectedSubCategoryId={selectedSubCategoryId}
        onSubCategoryChange={onSubCategoryChange}
        accountOptions={accountOptions}
        selectedAccountId={selectedAccountId}
        onAccountChange={onAccountChange}
        activeFilterCount={activeFilterCount}
        onReset={onReset}
        mobileSortKey={mobileSortKey}
        onSortChange={(v) => onSortChange(v as MobileSortKey)}
        sortOptions={[
          { value: 'date-desc', label: 'Più recente', shortLabel: 'Recente' },
          { value: 'date-asc', label: 'Meno recente', shortLabel: 'Meno rec.' },
          { value: 'amount-desc', label: 'Importo maggiore', shortLabel: '€ decr.' },
          { value: 'amount-asc', label: 'Importo minore', shortLabel: '€ cresc.' },
          { value: 'category-asc', label: 'Categoria A→Z', shortLabel: 'Cat. A→Z' },
        ]}
      />

      {/* ── 3. Hero: dominant Risparmio Netto + health verdict + top spese ──── */}
      <div className="@container">
        <CashflowHero
          monthLabel={periodLabel(period).toUpperCase()}
          income={income}
          expenses={expenses}
          net={net}
          incomeDelta={incomeDelta}
          expensesDelta={expensesDelta}
          expenseCategories={expenseCategories}
          categories={categories}
          transfers={transfers}
          onShowAllCategories={() => setCatDrawerOpen(true)}
        />
      </div>

      {/* ── 4. Transaction feed (shared with desktop) ──────────────────────── */}
      <TransactionFeed
        transactions={transactions}
        totalCount={totalCount}
        showCount={showCount}
        onLoadMore={onLoadMore}
        grouped={grouped}
        onEdit={onEdit}
        onDelete={onDelete}
        isDemo={isDemo}
        hasActiveFilters={hasActiveFilters}
        categoryMetaMap={categoryMetaMap}
        emptyHint="Usa il pulsante Aggiungi per inserire la prima voce."
      />

      {/* ── Full category breakdown drawer (opened from the hero "Tutte le categorie") ── */}
      <CashflowCategoryDrawer
        open={catDrawerOpen}
        onOpenChange={setCatDrawerOpen}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        categories={categories}
      />
    </div>
  );
}
