import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const {
  scrapeDividendsByIsinMock,
  createDividendMock,
  isDuplicateDividendMock,
  createExpenseFromDividendMock,
  getDividendByIdMock,
  updateDividendMock,
  deleteDividendMock,
  getTransactionsMock,
} = vi.hoisted(() => ({
  scrapeDividendsByIsinMock: vi.fn(),
  createDividendMock: vi.fn(),
  isDuplicateDividendMock: vi.fn(),
  createExpenseFromDividendMock: vi.fn(),
  getDividendByIdMock: vi.fn(),
  updateDividendMock: vi.fn(),
  deleteDividendMock: vi.fn(),
  getTransactionsMock: vi.fn(),
}));

// Per-collection doc/query mocks — filled per-test in adminDb mock
const collectionMocks: Record<string, unknown> = {};

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (collectionMocks[name]) return collectionMocks[name];
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

vi.mock('@/lib/services/borsaItalianaScraperService', () => ({
  scrapeDividendsByIsin: scrapeDividendsByIsinMock,
}));

vi.mock('@/lib/services/dividendService', () => ({
  createDividend: createDividendMock,
  isDuplicateDividend: isDuplicateDividendMock,
  getDividendById: getDividendByIdMock,
  updateDividend: updateDividendMock,
  deleteDividend: deleteDividendMock,
}));

vi.mock('@/lib/server/assetAdminRepository', () => ({
  getAssetTransactionsForAssetAdmin: getTransactionsMock,
}));

vi.mock('@/lib/services/dividendIncomeService', () => ({
  createExpenseFromDividend: createExpenseFromDividendMock,
}));

// The entitlement rule reads the real Italian-day helpers; only the eligibility check is stubbed.
vi.mock('@/lib/utils/dateHelpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/dateHelpers')>()),
  isDateOnOrAfter: vi.fn(() => true),
}));

vi.mock('@/lib/utils/couponUtils', () => ({
  getFollowingCouponDate: vi.fn(),
  // Phase 3 now resolves the coupon via the shared pure layer; mock its output.
  resolveCoupon: vi.fn(() => ({
    perShare: 2.5,
    fixedAnnualRate: 5,
    inflationPeriodRate: null,
    isProvisional: false,
  })),
  buildCouponNote: vi.fn(() => 'Cedola annuale — tasso annuo 5%'),
}));

import {
  runDividendScraping,
  runExpenseCreation,
  runNextCouponScheduling,
} from '@/lib/server/dividendProcessor';
import { Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getFollowingCouponDate } from '@/lib/utils/couponUtils';

// Helper: create a minimal Firestore-like QueryDocumentSnapshot
function makeUserDoc(id: string) {
  return { id } as unknown as QueryDocumentSnapshot;
}

function makeQuerySnapshot(docs: unknown[]) {
  return { docs, empty: docs.length === 0, size: docs.length };
}

function makeAssetDoc(data: Record<string, unknown>) {
  return {
    exists: true,
    id: data.id,
    data: () => ({ createdAt: { toDate: () => new Date('2020-01-01') }, ...data }),
  };
}

function makeDocRef(docData: unknown) {
  return { get: vi.fn().mockResolvedValue(docData) };
}

function makeCollection(queryResult: unknown) {
  const chain = {
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    get: vi.fn().mockResolvedValue(queryResult),
  };
  return chain;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1: runDividendScraping
// ────────────────────────────────────────────────────────────────────────────
describe('runDividendScraping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionsMock.mockResolvedValue([]); // no ledger: the asset quantity
  });

  it('skips assets without ISIN', async () => {
    const assetWithoutIsin = {
      id: 'a1',
      ticker: 'NONAME',
      isin: '',
      assetClass: 'equity',
      quantity: 10,
      type: 'stock',
    };

    collectionMocks['assets'] = makeCollection(
      makeQuerySnapshot([makeAssetDoc(assetWithoutIsin)])
    );

    const result = await runDividendScraping([makeUserDoc('u1')], new Date());

    expect(scrapeDividendsByIsinMock).not.toHaveBeenCalled();
    expect(result.assetsScraped).toBe(0);
    expect(result.newDividends).toBe(0);
  });

  it('skips duplicate dividends', async () => {
    const asset = {
      id: 'a1',
      ticker: 'ENI',
      isin: 'IT0003132476',
      assetClass: 'equity',
      quantity: 100,
      type: 'stock',
      averageCost: 12,
    };

    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc(asset)]));

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 10);
    const exDate = new Date();

    scrapeDividendsByIsinMock.mockResolvedValue([
      { exDate, paymentDate: new Date(), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'dividend' },
    ]);
    isDuplicateDividendMock.mockResolvedValue(true); // already exists

    const result = await runDividendScraping([makeUserDoc('u1')], sixtyDaysAgo);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.newDividends).toBe(0);
    expect(result.assetsScraped).toBe(1); // asset was scraped, just no new entry
  });

  it('creates dividend entry for non-duplicate', async () => {
    const asset = {
      id: 'a1',
      ticker: 'ENI',
      isin: 'IT0003132476',
      assetClass: 'equity',
      quantity: 100,
      type: 'stock',
      averageCost: 12,
    };

    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc(asset)]));

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 10);
    const exDate = new Date();

    scrapeDividendsByIsinMock.mockResolvedValue([
      { exDate, paymentDate: new Date(), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'dividend' },
    ]);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('div-1');

    const result = await runDividendScraping([makeUserDoc('u1')], sixtyDaysAgo);

    expect(createDividendMock).toHaveBeenCalledOnce();
    expect(result.newDividends).toBe(1);
  });
});

describe('runDividendScraping — the quantity entitled at the ex-date (D1, D6)', () => {
  beforeEach(() => vi.clearAllMocks());

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(12, 0, 0, 0);
    return d;
  };
  const buy = (date: Date, quantity: number, id: string) => ({
    id,
    userId: 'u1',
    assetId: 'a1',
    type: 'buy',
    date,
    quantity,
    pricePerUnit: 10,
    priceEur: 10,
    createdAt: date,
    updatedAt: date,
  });
  const sell = (date: Date, quantity: number, id: string) => ({ ...buy(date, quantity, id), type: 'sell' });

  function setUp(asset: Record<string, unknown>) {
    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc(asset)]));
    scrapeDividendsByIsinMock.mockResolvedValue([
      { exDate: daysAgo(5), paymentDate: daysAgo(3), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'ordinary' },
    ]);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('div-1');
  }
  const base = { id: 'a1', ticker: 'ENI', isin: 'IT0003132476', assetClass: 'equity', type: 'stock', averageCost: 12 };

  it('DQ1: a purchase after the ex-date does not enlarge the dividend', async () => {
    setUp({ ...base, quantity: 200, taxRate: 26 });
    getTransactionsMock.mockResolvedValue([buy(daysAgo(900), 100, 't1'), buy(daysAgo(2), 100, 't2')]);

    const result = await runDividendScraping([makeUserDoc('u1')], daysAgo(30));

    expect(result.newDividends).toBe(1);
    const data = createDividendMock.mock.calls[0][1];
    expect(data.quantity).toBe(100);
    expect(data.grossAmount).toBeCloseTo(50, 10);
    expect(data.taxAmount).toBeCloseTo(13, 10);
    expect(data.netAmount).toBeCloseTo(37, 10);
  });

  it('DQ4: sold before the ex-date = no record', async () => {
    setUp({ ...base, quantity: 0 });
    getTransactionsMock.mockResolvedValue([buy(daysAgo(900), 100, 't1'), sell(daysAgo(8), 100, 't2')]);

    const result = await runDividendScraping([makeUserDoc('u1')], daysAgo(30));

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.newDividends).toBe(0);
  });

  it('TX3/TX4: the instrument rate rules, a written 0 included', async () => {
    setUp({ ...base, quantity: 100, taxRate: 12.5 });
    getTransactionsMock.mockResolvedValue([]);
    await runDividendScraping([makeUserDoc('u1')], daysAgo(30));
    expect(createDividendMock.mock.calls[0][1].taxAmount).toBeCloseTo(6.25, 10);

    vi.clearAllMocks();
    setUp({ ...base, quantity: 100, taxRate: 0 });
    getTransactionsMock.mockResolvedValue([]);
    await runDividendScraping([makeUserDoc('u1')], daysAgo(30));
    expect(createDividendMock.mock.calls[0][1].taxAmount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: runExpenseCreation
// ────────────────────────────────────────────────────────────────────────────
describe('runExpenseCreation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionsMock.mockResolvedValue([]);
    collectionMocks['assets'] = { doc: vi.fn(() => makeDocRef({ exists: false })) };
  });

  // Fixed Italian-day window so eligibility checks are deterministic.
  const todayStart = Timestamp.fromDate(new Date('2026-06-10T00:00:00.000Z'));
  const todayEnd = Timestamp.fromDate(new Date('2026-06-10T23:59:59.999Z'));
  const lookbackStart = Timestamp.fromDate(new Date('2025-06-05T00:00:00.000Z'));

  const dueTodayInstant = () => new Date('2026-06-10T08:00:00.000Z');
  const pastInstant = () => new Date('2026-06-08T08:00:00.000Z');

  function configureUserCategory() {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ dividendIncomeCategoryId: 'cat-1' }) })),
    };
    collectionMocks['expenseCategories'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ name: 'Dividendi', subCategories: [] }) })),
    };
  }

  function makeDividendDoc(overrides: Record<string, unknown>) {
    return {
      id: overrides.id ?? 'div-1',
      data: () => ({
        assetTicker: 'ENI',
        assetName: 'Eni',
        assetId: 'a1',
        isin: 'IT0003',
        currency: 'EUR',
        dividendType: 'dividend',
        grossAmount: 50,
        taxAmount: 13,
        netAmount: 37,
        dividendPerShare: 0.5,
        quantity: 100,
        exDate: { toDate: dueTodayInstant },
        paymentDate: { toDate: dueTodayInstant },
        createdAt: { toDate: dueTodayInstant },
        updatedAt: { toDate: dueTodayInstant },
        ...overrides,
      }),
    };
  }

  it('skips dividends that already have an expenseId (idempotency)', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeDividendDoc({ expenseId: 'existing-expense' })])
    );

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it('skips users without dividendIncomeCategoryId configured', async () => {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({}) })), // no category
    };

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it('creates expense for a dividend due today', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([makeDividendDoc({})]));
    createExpenseFromDividendMock.mockResolvedValue('new-expense-id');

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).toHaveBeenCalledOnce();
    expect(result.processedCount).toBe(1);
    expect(result.processedDividends[0].expenseId).toBe('new-expense-id');
  });

  it('catches up an auto-generated coupon whose payment date already passed', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([
        makeDividendDoc({
          dividendType: 'coupon',
          isAutoGenerated: true,
          paymentDate: { toDate: pastInstant },
          exDate: { toDate: pastInstant },
        }),
      ])
    );
    createExpenseFromDividendMock.mockResolvedValue('catchup-expense-id');

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).toHaveBeenCalledOnce();
    expect(result.processedCount).toBe(1);
  });

  describe('the payment-day re-check against the ledger (RQ9, CQ7)', () => {
    const ledgerBuy = (iso: string, quantity: number, id: string) => ({
      id,
      userId: 'u1',
      assetId: 'a1',
      type: 'buy',
      date: new Date(iso),
      quantity,
      pricePerUnit: 1,
      priceEur: 1,
      createdAt: new Date(iso),
      updatedAt: new Date(iso),
    });
    const sellAll = (iso: string, quantity: number) => ({ ...ledgerBuy(iso, quantity, 'sx'), type: 'sell' });

    function staleCoupon(extra: Record<string, unknown> = {}) {
      return makeDividendDoc({
        dividendType: 'coupon',
        isAutoGenerated: true,
        dividendPerShare: 0.01,
        quantity: 5000,
        grossAmount: 50,
        taxAmount: 6.25,
        netAmount: 43.75,
        ...extra,
      });
    }
    function bondAsset() {
      collectionMocks['assets'] = {
        doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ quantity: 10000, taxRate: 12.5 }) })),
      };
    }

    it('CQ7: a stale coupon is updated to the entitled quantity and pays that', async () => {
      configureUserCategory();
      bondAsset();
      collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([staleCoupon()]));
      getTransactionsMock.mockResolvedValue([
        ledgerBuy('2025-01-10T10:00:00Z', 5000, 't1'),
        ledgerBuy('2026-04-10T10:00:00Z', 5000, 't2'),
      ]);
      getDividendByIdMock.mockResolvedValue({
        quantity: 10000,
        grossAmount: 100,
        taxAmount: 12.5,
        netAmount: 87.5,
      });
      createExpenseFromDividendMock.mockResolvedValue('exp-1');

      const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

      expect(updateDividendMock).toHaveBeenCalledOnce();
      const updates = updateDividendMock.mock.calls[0][1];
      expect(updates.quantity).toBe(10000);
      expect(updates.grossAmount).toBeCloseTo(100, 10);
      expect(updates.netAmount).toBeCloseTo(87.5, 10);
      const paid = createExpenseFromDividendMock.mock.calls[0][0];
      expect(paid.netAmount).toBe(87.5);
      expect(result.processedCount).toBe(1);
    });

    it('CQ3: sold before the payment — the record goes and no row is written', async () => {
      configureUserCategory();
      bondAsset();
      collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([staleCoupon()]));
      getTransactionsMock.mockResolvedValue([
        ledgerBuy('2025-01-10T10:00:00Z', 5000, 't1'),
        sellAll('2026-04-10T10:00:00Z', 5000),
      ]);

      const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

      expect(deleteDividendMock).toHaveBeenCalledOnce();
      expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
      expect(result.processedCount).toBe(0);
    });

    it('CQ5: a hand-corrected record is paid as it is', async () => {
      configureUserCategory();
      bondAsset();
      collectionMocks['dividends'] = makeCollection(
        makeQuerySnapshot([staleCoupon({ manuallyEdited: true, grossAmount: 60 })])
      );
      getTransactionsMock.mockResolvedValue([ledgerBuy('2025-01-10T10:00:00Z', 5000, 't1')]);
      createExpenseFromDividendMock.mockResolvedValue('exp-1');

      await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

      expect(updateDividendMock).not.toHaveBeenCalled();
      expect(deleteDividendMock).not.toHaveBeenCalled();
      expect(createExpenseFromDividendMock.mock.calls[0][0].grossAmount).toBe(60);
    });
  });

  it('does not back-date a past equity dividend without an expense', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([
        makeDividendDoc({
          dividendType: 'dividend',
          isAutoGenerated: false,
          paymentDate: { toDate: pastInstant },
          exDate: { toDate: pastInstant },
        }),
      ])
    );

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: runNextCouponScheduling
// ────────────────────────────────────────────────────────────────────────────
describe('runNextCouponScheduling', () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStart = Timestamp.fromDate(new Date('2026-06-10T00:00:00.000Z'));
  const todayEnd = Timestamp.fromDate(new Date('2026-06-10T23:59:59.999Z'));
  const lookbackStart = Timestamp.fromDate(new Date('2025-06-05T00:00:00.000Z'));
  // A date safely after todayEnd, used as the next upcoming coupon.
  const futureDate = new Date('2026-12-10T00:00:00.000Z');

  function makeCouponDoc(paymentToDate: () => Date) {
    return {
      id: 'coup-1',
      data: () => ({
        assetId: 'asset-1',
        assetTicker: 'BTP',
        assetName: 'BTP 2032',
        currency: 'EUR',
        dividendType: 'coupon',
        isAutoGenerated: true,
        paymentDate: { toDate: paymentToDate },
      }),
    };
  }

  function makeBondAsset(maturity: Date) {
    const assetDocData = {
      exists: true,
      data: () => ({
        quantity: 1000,
        isin: 'IT0001',
        taxRate: 12.5,
        bondDetails: {
          couponRate: 5,
          couponFrequency: 'annual',
          nominalValue: 1,
          maturityDate: { toDate: () => maturity },
          issueDate: { toDate: () => new Date('2010-01-01') },
        },
      }),
    };
    collectionMocks['assets'] = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue(assetDocData) })) };
  }

  it('skips scheduling when bond has matured (getFollowingCouponDate returns null)', async () => {
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-10T00:00:00.000Z'))])
    );
    makeBondAsset(new Date('2020-01-01')); // already matured
    vi.mocked(getFollowingCouponDate).mockReturnValue(null);

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips when the upcoming coupon already exists (idempotency)', async () => {
    // The next coupon is in the future and already stored → chain healed, nothing to do.
    vi.mocked(getFollowingCouponDate).mockReturnValue(futureDate);
    isDuplicateDividendMock.mockResolvedValue(true);
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-10T00:00:00.000Z'))])
    );
    makeBondAsset(new Date('2032-03-10'));

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.scheduled).toBe(0);
  });

  it('schedules the next coupon for a coupon paid today', async () => {
    vi.mocked(getFollowingCouponDate).mockReturnValue(futureDate);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('next-coupon-id');
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-10T08:00:00.000Z'))])
    );
    makeBondAsset(new Date('2032-03-10'));

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).toHaveBeenCalledOnce();
    expect(result.scheduled).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('heals the chain from a coupon whose payment date already passed', async () => {
    // A coupon dated a few days ago was never advanced; its successor (future)
    // is missing and must be created so the bond has an upcoming coupon again.
    vi.mocked(getFollowingCouponDate).mockReturnValue(futureDate);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('healed-coupon-id');
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-07T00:00:00.000Z'))])
    );
    makeBondAsset(new Date('2032-03-10'));

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).toHaveBeenCalledOnce();
    expect(result.scheduled).toBe(1);
  });
});
