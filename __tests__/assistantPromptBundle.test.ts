/**
 * Tests for the numeric data block the assistant prompt builders emit.
 *
 * `formatBundleForPrompt` is module-private, so everything here goes through
 * `buildMonthAnalysisPrompt(...).userContent` — the path a real request takes.
 * Exporting the formatter purely to test it would widen the module's surface for
 * no gain: the assertions read just as well against the real entry point.
 */

import { describe, expect, it } from 'vitest';
import { buildMonthAnalysisPrompt } from '@/lib/server/assistant/prompts';
import { AssistantMonthContextBundle, AssistantPreferences } from '@/types/assistant';

const PREFERENCES: AssistantPreferences = {
  responseStyle: 'balanced',
  includeMacroContext: false,
  memoryEnabled: false,
  includeDummySnapshots: false,
};

function makeBundle(overrides: Partial<AssistantMonthContextBundle> = {}): AssistantMonthContextBundle {
  return {
    selector: { year: 2025, month: 3 },
    currentSnapshot: null,
    previousSnapshot: null,
    cashflow: {
      totalIncome: 3000,
      totalDividends: 0,
      totalExpenses: -1000,
      netCashFlow: 2000,
      transactionCount: 12,
      expenseTransactionCount: 9,
    },
    netWorth: { start: null, end: null, delta: null, deltaPct: null },
    allocationChanges: [],
    expensesByCategory: [],
    incomeByCategory: [],
    expensesByType: [],
    topIndividualExpenses: [],
    bySubCategoryAllocation: {},
    targetAllocation: null,
    expenseCategories: [],
    dataQuality: {
      hasSnapshot: true,
      hasPreviousBaseline: false,
      hasCashflowData: true,
      isPartialMonth: false,
      notes: [],
    },
    ...overrides,
  };
}

const CASA = {
  categoryName: 'Casa',
  total: -800,
  transactionCount: 4,
  subCategories: [
    { subCategoryName: 'Elettricità', total: -500, transactionCount: 3 },
    { subCategoryName: 'Bonifica', total: -300, transactionCount: 1 },
  ],
};

/**
 * Renders the data block, collapsing the non-breaking space Intl.NumberFormat puts
 * before "€" into a plain one. Without this every currency assertion would have to
 * embed an invisible U+00A0 to match, which is unreadable and easy to get wrong.
 */
function render(bundle: AssistantMonthContextBundle): string {
  return buildMonthAnalysisPrompt(bundle, '', PREFERENCES).userContent.replace(/ /g, ' ');
}

describe('assistant prompt data block', () => {
  describe('expense category and subcategory section', () => {
    it('should render every category with its subcategories indented beneath it', () => {
      // Arrange
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('--- SPESE PER CATEGORIA E SOTTOCATEGORIA (elenco completo del periodo) ---');
      expect(content).toContain('  › Elettricità:');
      expect(content).toContain('  › Bonifica:');
    });

    it('should state the share of total spending each category represents', () => {
      // Arrange — Casa is 800 of 1000 total spending
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('80,0% delle uscite');
    });

    it('should not prefix a share with a plus sign', () => {
      // Arrange — pct() would render "+80.00%", which reads as growth, not a proportion
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).not.toContain('+80');
    });

    it('should omit the section entirely when the period has no spending', () => {
      // Act
      const content = render(makeBundle());

      // Assert
      expect(content).not.toContain('SPESE PER CATEGORIA E SOTTOCATEGORIA');
    });

    it('should use the singular form for a one-transaction row', () => {
      // Arrange
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('(1 transazione)');
      expect(content).not.toContain('(1 transazioni)');
    });
  });

  describe('subcategory safety valve', () => {
    // 200 subcategory rows across 4 categories — past the 150-row rendering cap.
    const oversized = Array.from({ length: 4 }, (_, categoryIndex) => ({
      categoryName: `Categoria ${categoryIndex}`,
      total: -5000,
      transactionCount: 50,
      subCategories: Array.from({ length: 50 }, (_, subIndex) => ({
        subCategoryName: `Voce ${categoryIndex}-${subIndex}`,
        total: -100,
        transactionCount: 1,
      })),
    }));

    it('should declare the omission rather than truncating silently', () => {
      // Act
      const content = render(makeBundle({ expensesByCategory: oversized }));

      // Assert — a silent cap is what made the assistant answer "N/D" in the first place
      expect(content).toContain('50 sottocategorie minori omesse per brevità');
      expect(content).toContain('le categorie sopra sono comunque complete');
    });

    it('should still list every category when subcategory rows are capped', () => {
      // Act
      const content = render(makeBundle({ expensesByCategory: oversized }));

      // Assert
      for (const category of oversized) {
        expect(content).toContain(`${category.categoryName}:`);
      }
    });

    it('should not mention any omission when the data fits', () => {
      // Act
      const content = render(makeBundle({ expensesByCategory: [CASA] }));

      // Assert
      expect(content).not.toContain('omesse per brevità');
    });
  });

  describe('other cashflow sections', () => {
    it('should render spending by type with each share of the total', () => {
      // Arrange
      const bundle = makeBundle({
        expensesByType: [
          { type: 'fixed', label: 'Spese Fisse', total: -750 },
          { type: 'variable', label: 'Spese Variabili', total: -250 },
        ],
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('--- SPESE PER TIPO ---');
      expect(content).toContain('Spese Fisse: -750 € (75,0%)');
    });

    it('should render income by category and say dividends are reported elsewhere', () => {
      // Arrange
      const bundle = makeBundle({
        incomeByCategory: [{ categoryName: 'Stipendio', total: 3000, transactionCount: 1 }],
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('--- ENTRATE PER CATEGORIA (esclusi i dividendi, riportati sopra) ---');
      // No thousands separator at four digits: it-IT groups from five up.
      expect(content).toContain('Stipendio: 3000 € (1 transazione)');
    });

    it('should date each individual expense and name its subcategory', () => {
      // Arrange
      const bundle = makeBundle({
        topIndividualExpenses: [
          {
            categoryName: 'Casa',
            subCategoryName: 'Bonifica',
            amount: -300,
            notes: 'Bonifica cisterna',
            date: '2025-03-12',
          },
        ],
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('2025-03-12 · Casa › Bonifica – Bonifica cisterna: -300 €');
    });

    it('should separate the spending transaction count from the overall one', () => {
      // Act
      const content = render(makeBundle());

      // Assert
      expect(content).toContain('Numero transazioni: 12 (di cui 9 di spesa');
    });
  });

  describe('system block stability', () => {
    it('should stay byte-identical across bundles, carrying no per-request data', () => {
      // Arrange
      const lean = makeBundle();
      const rich = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const first = buildMonthAnalysisPrompt(lean, 'Come è andato il mese?', PREFERENCES).system;
      const second = buildMonthAnalysisPrompt(rich, 'Dettagliami le sottocategorie di Casa', {
        ...PREFERENCES,
        responseStyle: 'deep',
      }).system;

      // Assert — the system block is sent as a cacheable prefix; interpolating request
      // data into it would silently break the prefix match.
      expect(first).toBe(second);
    });
  });
});
