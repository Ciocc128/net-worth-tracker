/**
 * cashFlowMap — l'indicizzazione per mese dei cash flow, unica per tutta la pipeline di Rendimenti.
 *
 * Il punto di questa suite non è la mappa in sé (tre righe), ma i due modi in cui le quattro copie
 * precedenti potevano perdere denaro in silenzio: due flussi nello stesso mese, e le due format
 * string separate per costruire e per interrogare la chiave.
 */
import { describe, it, expect } from 'vitest';
import { buildCashFlowMap, monthKey, monthKeyOf } from '@/lib/utils/cashFlowMap';
import type { CashFlowData } from '@/types/performance';

function cashFlow(year: number, month: number, netCashFlow: number, day = 1): CashFlowData {
  return {
    date: new Date(year, month - 1, day),
    income: netCashFlow > 0 ? netCashFlow : 0,
    expenses: netCashFlow < 0 ? Math.abs(netCashFlow) : 0,
    dividendIncome: 0,
    netCashFlow,
  };
}

describe('monthKey', () => {
  it('pads the month so keys sort and compare as strings', () => {
    expect(monthKey(2026, 1)).toBe('2026-01');
    expect(monthKey(2026, 12)).toBe('2026-12');
  });

  it('agrees with the key derived from a date', () => {
    // È l'invariante che conta: chi costruisce la mappa parte da una Date, chi la interroga dai
    // campi year/month di uno snapshot. Se le due formattazioni divergessero, la ricerca
    // fallirebbe restituendo 0 — indistinguibile da "nessun movimento questo mese".
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe(monthKey(2026, 1));
    expect(monthKeyOf(new Date(2026, 11, 31))).toBe(monthKey(2026, 12));
  });
});

describe('buildCashFlowMap', () => {
  it('indexes one flow per month', () => {
    const map = buildCashFlowMap([cashFlow(2026, 1, 1000), cashFlow(2026, 2, -500)]);

    expect(map.get('2026-01')).toBe(1000);
    expect(map.get('2026-02')).toBe(-500);
    expect(map.get('2026-03')).toBeUndefined();
  });

  it('sums flows that fall in the same month instead of keeping the last', () => {
    // Le quattro copie facevano map.set: il secondo movimento cancellava il primo senza segnalarlo.
    // Oggi non può succedere (getCashFlowsFromExpenses aggrega a monte), ma se l'assunzione a monte
    // venisse meno l'errore sarebbe silenzioso e distribuito su TWR, volatilità, drawdown e grafico.
    const map = buildCashFlowMap([
      cashFlow(2026, 1, 1000, 5),
      cashFlow(2026, 1, 250, 20),
      cashFlow(2026, 1, -400, 28),
    ]);

    expect(map.get('2026-01')).toBe(850);
  });

  it('is empty for an empty input', () => {
    expect(buildCashFlowMap([]).size).toBe(0);
  });

  it('keeps months of different years apart', () => {
    const map = buildCashFlowMap([cashFlow(2025, 1, 100), cashFlow(2026, 1, 200)]);

    expect(map.get('2025-01')).toBe(100);
    expect(map.get('2026-01')).toBe(200);
  });
});
