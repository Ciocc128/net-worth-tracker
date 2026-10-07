/**
 * A4 «aderenza al render» — the pure pieces: the model written by hand starts from what is held
 * (PO1), the empty-state preview with the suggested inflow (RV4), the model tile's sentences and the
 * Questo mese aside / match note / reserve footer.
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import { seedModelFromToday } from '@/lib/utils/modelPortfolio';
import { describeModelOrigin, describeModelSalesHint, MODEL_TARGETED_HINT } from '@/lib/utils/weightOptimizerNarrative';
import {
  describeAccumuloPreview,
  describeAccumulationOutcomeFooter,
  describeClosedPlansAside,
  describeMatchNote,
  describeMonthReading,
  describeMonthTileAside,
  describePriceChangeNotice,
} from '@/lib/utils/accumulationNarrative';
import { narrativeToText } from '@/lib/utils/narrative';

const flat = (text: string) => text.replace(/[  ]/g, ' ');

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
  return { id, name: id, ticker: id, type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 100, ...overrides } as Asset;
}
const valueOf = (a: Asset) => a.quantity * (a.currentPrice ?? 0);

describe('seedModelFromToday (M2)', () => {
  it('weights the held tradable instruments by value, Σ = 100, leaving out accounts, frozen and empty ones', () => {
    const weights = seedModelFromToday(
      [
        asset('A', { quantity: 3 }),
        asset('B', { quantity: 1 }),
        asset('EMPTY', { quantity: 0 }),
        asset('FROZEN', { allocationRole: 'frozen' } as Partial<Asset>),
        asset('CONTO', { type: 'cash', assetClass: 'cash' }),
      ],
      valueOf,
    );
    expect(weights).toEqual([
      { assetId: 'A', targetPercentage: 75 },
      { assetId: 'B', targetPercentage: 25 },
    ]);
  });

  it('is empty when nothing tradable is held', () => {
    expect(seedModelFromToday([asset('CONTO', { type: 'cash', assetClass: 'cash' })], valueOf)).toEqual([]);
  });
});

describe('describeAccumuloPreview (M3)', () => {
  const base = { months: 12, reserveEur: 10000, monthlyEur: 3208, weightsFrom: 'today' as const };
  it('says the suggested inflow when there is one', () => {
    expect(flat(narrativeToText(describeAccumuloPreview({ ...base, inflowEur: 1000 })))).toContain('e 1000 € al mese di entrate.');
  });
  it('keeps «senza entrate mensili» at zero', () => {
    expect(narrativeToText(describeAccumuloPreview({ ...base, inflowEur: 0 }))).toContain('senza entrate mensili');
  });
});

describe('model tile sentences (M4)', () => {
  it('names who stays above the model, then points at «Ricalcola»', () => {
    expect(describeModelSalesHint(['NTSG', 'CL2', 'XDEM'])).toBe(`Senza vendere, NTSG, CL2 e XDEM restano sopra il modello. ${MODEL_TARGETED_HINT}`);
    expect(describeModelSalesHint(['XDEM'])).toContain('XDEM resta sopra il modello.');
  });
  it('is the fixed hint when nobody is above the model', () => {
    expect(describeModelSalesHint([])).toBe(MODEL_TARGETED_HINT);
  });
  it('names the mode and the manual change of a model that started from a calculation', () => {
    const snapshot = { computedAt: new Date('2026-10-02T12:00:00'), mode: 'reachable' as const };
    const updatedAt = new Date('2026-10-05T12:00:00');
    expect(describeModelOrigin('optimizer', updatedAt, snapshot)).toBe("Proposto dall'ottimizzatore il 02/10/2026 (Raggiungibile col PAC).");
    expect(describeModelOrigin('manual', updatedAt, snapshot)).toBe("Proposto dall'ottimizzatore il 02/10/2026 (Raggiungibile col PAC), poi cambiato a mano.");
    expect(describeModelOrigin('manual', updatedAt)).toBe('Scritto a mano il 05/10/2026.');
  });
});

describe('Questo mese (M5, M6)', () => {
  it('the header aside names the month and the installment', () => {
    expect(describeMonthTileAside('2026-10', 3, 12)).toBe('ottobre 2026 · rata 3 di 12');
  });
  it('the match note says what the Registro holds', () => {
    expect(flat(describeMatchNote(24, 3134))).toMatch(/^Trovato nel Registro: 24 quote, 3\.?134,00 €$|^Trovato nel Registro: 24 quote, 3134 €$/);
  });
  it('the footer names the reserve only while it is intact', () => {
    const input = { maxDrift: null, residualEur: 0 };
    expect(flat(narrativeToText(describeAccumulationOutcomeFooter({ ...input, reserve: { eur: 10000, intact: true } })))).toContain('riserva di 10.000 € intatta');
    expect(narrativeToText(describeAccumulationOutcomeFooter({ ...input, reserve: { eur: 10000, intact: false } }))).not.toContain('intatta');
  });
  it('closed plans count', () => {
    expect(describeClosedPlansAside(1)).toBe('1 piano');
    expect(describeClosedPlansAside(2)).toBe('2 piani');
  });
});

describe('Questo mese reading and price notice', () => {
  it('reads the open purchases in words, singular and plural, and nothing when none is open', () => {
    expect(flat(narrativeToText(describeMonthReading(4, 3134) ?? []))).toBe(
      "Quattro acquisti per 3134 €. Registrali da qui: l'operazione va nel Registro e la riga si chiude da sola.",
    );
    expect(flat(narrativeToText(describeMonthReading(1, 500) ?? []))).toContain('Un acquisto per 500 €. Registralo da qui');
    expect(describeMonthReading(0, 0)).toBeNull();
  });

  it('says what the prices changed in the rata, like the render', () => {
    const text = flat(
      narrativeToText(
        describePriceChangeNotice({
          lines: [
            { label: 'VWCE', plannedQuantity: 10, suggestedQuantity: 9 },
            { label: 'AVWS', plannedQuantity: 0, suggestedQuantity: 2 },
          ],
          plannedTotalEur: 1000,
          suggestedTotalEur: 904.8,
        }),
      ),
    );
    expect(text).toMatch(/^I prezzi sono cambiati dall'attivazione: con quelli di oggi la rata compra 9 VWCE invece di 10 e 2 AVWS in più \(.*95,20 €\)\.$/);
  });
});
