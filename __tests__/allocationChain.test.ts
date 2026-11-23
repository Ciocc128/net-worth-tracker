/**
 * The chain of the weights (lib/utils/allocationChain.ts) — the strip under Allocazione's tabs
 * (RU8, doc/allocazione-strategia/README.md § 5.2 and § 10, criteria 1–5).
 *
 * PERCHÉ ESISTE: the strip says, on three tabs, the state of four documents the page already read;
 * every word is born here so the component only draws. An unread document must never read as an
 * empty one («non letto», never «da creare»), and the cell the tab is about is tinted.
 *
 * Figures are invented and round (WORKFLOW.md rule 7).
 */
import { describe, expect, it } from 'vitest';
import { buildAllocationChain, buildInstallmentCell, buildModelCell, buildPlanCell, buildTargetsCell } from '@/lib/utils/allocationChain';
import type { AssetAllocationTarget } from '@/types/assets';
import type { AccumulationPlan, InstallmentLine } from '@/types/accumulationPlan';

const target = (targetPercentage: number) => ({ targetPercentage, subCategoryConfig: { enabled: false, categories: [] } });
const flat = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

const SIXTY_THIRTY_TEN: AssetAllocationTarget = { equity: target(60), bonds: target(30), commodity: target(10), cash: target(0) };

const line = (positionId: string, status: InstallmentLine['status'], plannedAmountEur: number): InstallmentLine => ({
  positionId,
  assetId: positionId,
  plannedQuantity: 1,
  priceEurAtPlan: plannedAmountEur,
  plannedAmountEur,
  status,
});

/** An active plan of 12 months from 2026-09 (so its last month is 2027-08), month 3 open. */
function plan(lines: InstallmentLine[], status: AccumulationPlan['status'] = 'active'): AccumulationPlan {
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Piano',
    status,
    startMonth: '2026-09',
    months: 12,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 600 },
    positions: [],
    disposals: [],
    installments: status === 'draft' ? [] : [{ index: 3, month: '2026-11', lines, carryInEur: {} }],
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  };
}

describe('cell 1 · Target per classe (criterion 1)', () => {
  it('names the classes above zero, heaviest first, and the source', () => {
    expect(buildTargetsCell({ targets: SIXTY_THIRTY_TEN, source: 'manual', saved: true })).toMatchObject({ figure: '60 · 30 · 10', compactFigure: '60·30·10', detail: 'a mano' });
  });

  it('says the leverage of a total above 100', () => {
    // 70 + 30 + 10 = 110 → leva 1,10×.
    const cell = buildTargetsCell({ targets: { ...SIXTY_THIRTY_TEN, equity: target(70) }, source: 'manual', saved: true });
    expect(cell).toMatchObject({ figure: '70 · 30 · 10', detail: 'a mano · leva 1,10×', tone: 'default' });
  });

  it('counts beyond four classes', () => {
    const five = { equity: target(40), bonds: target(20), commodity: target(15), crypto: target(15), carry: target(10) };
    expect(buildTargetsCell({ targets: five, source: 'formula', saved: true })).toMatchObject({ figure: '5 classi', detail: 'formula per età' });
  });

  it('flags a total that does not reach 100, and the defaults never saved', () => {
    // 60 + 20 + 10 = 90.
    expect(buildTargetsCell({ targets: { ...SIXTY_THIRTY_TEN, bonds: target(20) }, source: 'manual', saved: true })).toMatchObject({ detail: 'da completare', tone: 'warning' });
    expect(buildTargetsCell({ targets: SIXTY_THIRTY_TEN, source: 'manual', saved: false }).detail).toBe('predefiniti');
  });

  it('leaves the cash fixed in euro out of the percentages', () => {
    const withFixedCash = { ...SIXTY_THIRTY_TEN, cash: { ...target(20), useFixedAmount: true, fixedAmount: 5000 } };
    expect(buildTargetsCell({ targets: withFixedCash, source: 'manual', saved: true }).figure).toBe('60 · 30 · 10');
  });
});

describe('cell 2 · Portafoglio modello (criterion 2)', () => {
  it('counts a group as one row, and says how and when it was written', () => {
    const model = {
      weights: [
        { assetId: 'a', targetPercentage: 50 },
        { assetId: 'b', memberAssetIds: ['b', 'c'], targetPercentage: 30 },
        { assetId: 'd', targetPercentage: 20 },
      ],
      origin: 'manual' as const,
      updatedAt: new Date('2026-11-23T10:00:00Z'),
    };
    expect(buildModelCell({ model, failed: false })).toMatchObject({ figure: '3 strumenti', compactFigure: '3 strum.', detail: 'scritto a mano il 23/11' });
    expect(buildModelCell({ model: { ...model, origin: 'optimizer' }, failed: false }).detail).toBe('calcolato il 23/11');
  });

  it('says «da creare» without a model and «non letto» when the read failed', () => {
    expect(buildModelCell({ model: null, failed: false }).figure).toBe('da creare');
    expect(buildModelCell({ model: null, failed: true }).figure).toBe('non letto');
  });
});

describe('cell 3 · Piano di accumulo (criterion 3)', () => {
  it('says the month of the plan and its end', () => {
    expect(buildPlanCell({ plan: plan([]), currentIndex: 3, failed: false, modelDifferenceCount: 0 })).toMatchObject({
      figure: 'rata 3 di 12',
      compactFigure: '3/12',
      detail: 'fino ad ago 2027',
    });
  });

  it('says how far the plan is from the model', () => {
    expect(buildPlanCell({ plan: plan([]), currentIndex: 3, failed: false, modelDifferenceCount: 2 }).detail).toBe('differisce dal modello su 2');
  });

  it('says «nessun piano», «bozza», and «non letto» on a failed read', () => {
    expect(buildPlanCell({ plan: undefined, currentIndex: 0, failed: false, modelDifferenceCount: null }).figure).toBe('nessun piano');
    expect(buildPlanCell({ plan: plan([], 'draft'), currentIndex: 0, failed: false, modelDifferenceCount: null }).figure).toBe('bozza');
    expect(buildPlanCell({ plan: undefined, currentIndex: 0, failed: true, modelDifferenceCount: null }).figure).toBe('non letto');
  });
});

describe('cell 4 · Rata del mese (criterion 4)', () => {
  it('says the month’s installment and how many purchases are recorded', () => {
    // 3 purchases of 200 € = 600 €, one executed.
    const lines = [line('a', 'executed', 200), line('b', 'planned', 200), line('c', 'planned', 200)];
    const cell = buildInstallmentCell({ plan: plan(lines), currentIndex: 3, failed: false, modelDifferenceCount: 0 });
    expect(cell.title).toBe('Rata di novembre');
    expect(flat(cell.figure)).toBe('600 €');
    expect(cell.detail).toBe('1 di 3 acquisti registrati');
  });

  it('says «registrata» once every line is closed', () => {
    const lines = [line('a', 'executed', 200), line('b', 'skipped', 200)];
    expect(buildInstallmentCell({ plan: plan(lines), currentIndex: 3, failed: false, modelDifferenceCount: 0 }).detail).toBe('registrata');
  });

  it('says «—» and «nessuna rata» without a plan', () => {
    expect(buildInstallmentCell({ plan: undefined, currentIndex: 0, failed: false, modelDifferenceCount: null })).toMatchObject({ figure: '—', detail: 'nessuna rata' });
  });
});

describe('buildAllocationChain (criterion 5)', () => {
  const input = {
    targets: { targets: SIXTY_THIRTY_TEN, source: 'manual' as const, saved: true },
    model: { model: null, failed: false },
    plan: { plan: undefined, currentIndex: 0, failed: false, modelDifferenceCount: null },
  };

  it('tints the cells the tab is about', () => {
    const tinted = (activeTab: 'bilanciamento' | 'accumulo' | 'strategia') =>
      buildAllocationChain({ ...input, activeTab }).filter((cell) => cell.current).map((cell) => cell.step);
    expect(tinted('bilanciamento')).toEqual([1]);
    expect(tinted('strategia')).toEqual([1, 2]);
    expect(tinted('accumulo')).toEqual([3, 4]);
  });

  it('marks as the current page only a link that lands on the open tab', () => {
    const onBilanciamento = buildAllocationChain({ ...input, activeTab: 'bilanciamento' });
    expect(onBilanciamento.some((cell) => cell.linksHere)).toBe(false);
    const onStrategia = buildAllocationChain({ ...input, activeTab: 'strategia' });
    expect(onStrategia.filter((cell) => cell.linksHere).map((cell) => cell.step)).toEqual([1, 2]);
  });

  it('gives every link a name that says the whole step', () => {
    const [first, second, third] = buildAllocationChain({ ...input, activeTab: 'bilanciamento' });
    expect(first.ariaLabel).toBe('Passo 1, target per classe: 60, 30, 10, a mano. Apri Strategia');
    expect(first.href).toBe('/dashboard/allocation?tab=strategia#target');
    expect(second.href).toBe('/dashboard/allocation?tab=strategia#portafoglio-modello');
    expect(third.ariaLabel).toBe('Passo 3, piano di accumulo: nessun piano, si crea in Accumulo. Apri Accumulo');
  });
});
