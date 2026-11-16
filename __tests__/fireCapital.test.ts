/**
 * The capital of the FIRE tabs (`lib/utils/fireCapital.ts`): RK1–RK3, RK6, RE1–RE5.
 * doc/fire-ipotesi/README.md § 11.8 (K), § 14.8 (E), § 23.9 (Q-1…Q-10, task FC-Q2): every expected
 * value is worked out by hand in the comment beside it, on the common example of § 11.8.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveFireCapital, resolveFireCapitalDetail, type FireCapitalOptions } from '@/lib/utils/fireCapital';
import type { Asset, AssetAllocationTarget, AssetClass } from '@/types/assets';

// allocationUtils reaches the Firebase client through its service imports; the module under test is pure.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

const asset = (id: string, assetClass: AssetClass, value: number, extra: Partial<Asset> = {}): Asset =>
  ({ id, name: id, type: 'etf', assetClass, currentPrice: value, quantity: 1, ...extra }) as Asset;
const cash = (id: string, value: number, extra: Partial<Asset> = {}): Asset => asset(id, 'cash', value, { type: 'cash', ...extra });
const valueOf = (a: Asset) => a.currentPrice * a.quantity;
const near = (actual: number | null | undefined, expected: number, tolerance = 0.01) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance);
};

const targets7030 = { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 }, cash: { targetPercentage: 0 } } as unknown as AssetAllocationTarget;
const targetsCash = (pct: number) => ({ equity: { targetPercentage: 100 - pct }, cash: { targetPercentage: pct } }) as unknown as AssetAllocationTarget;
const targetsFixedCash = (amount: number) =>
  ({ equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 }, cash: { targetPercentage: 0, useFixedAmount: true, fixedAmount: amount } }) as unknown as AssetAllocationTarget;

// § 11.8: ETF azionario 280.000 (costo 200.000), obbligazionario 120.000 (costo 110.000), conto incluso 15.000,
// deposito escluso 45.000, crypto 10.000, casa esclusa 250.000. Target 70/30/0 → N 400.000, C 15.000, C_in 0,
// P 400.000, X 15.000, E 45.000, L 60.000.
const example = (overrides: Asset[] = [], extra: Asset[] = []): Asset[] => {
  const base = [
    asset('azioni', 'equity', 280_000, { averageCost: 200_000 }),
    asset('obbl', 'bonds', 120_000, { averageCost: 110_000 }),
    cash('conto', 15_000),
    cash('deposito', 45_000, { allocationRole: 'excluded' }),
    asset('btc', 'crypto', 10_000),
    asset('casa', 'realestate', 250_000, { type: 'realestate', allocationRole: 'excluded' }),
  ];
  return [...base.map((a) => overrides.find((o) => o.id === a.id) ?? a), ...extra];
};
const detail = (options: FireCapitalOptions, assets: Asset[] = example()) => resolveFireCapitalDetail(assets, valueOf, { targets: targets7030, ...options });
const byId = (assets: Asset[], id: string) => assets.find((a) => a.id === id)!;

describe('fireCapital — K (§ 11.8)', () => {
  it('K2: N, C, C_in, P, X, E, L', () => {
    const { capital, weightsInput } = detail({});
    near(capital.portfolio, 400_000); // P = N + C_in = 400.000 + 0
    near(weightsInput.cashIn, 0); // t = 0 → C_in = 0
    near(capital.cashToInvest.overTarget, 15_000); // X = C − C_in
    near(capital.cashToInvest.excludedAccounts, 45_000); // E
    near(capital.cashToInvest.total, 60_000); // L = X + E
  });

  it('K3: the legacy share q = 0 / 50 / 100 → capital 400.000 / 430.000 / 460.000', () => {
    near(detail({ cashToInvestPct: 0 }).capital.total, 400_000);
    near(detail({ cashToInvestPct: 50 }).capital.total, 430_000);
    near(detail({ cashToInvestPct: 100 }).capital.total, 460_000);
  });

  it('K5: target Liquidità 10%, conto incluso 60.000, niente esclusi — C_in = 10/90 · 400.000', () => {
    const assets = example([cash('conto', 60_000)]).filter((a) => a.id !== 'deposito');
    const { capital, weightsInput } = detail({ targets: targetsCash(10) }, [...assets]);
    near(weightsInput.cashIn, 44_444.44);
    near(capital.portfolio, 444_444.44);
    near(capital.cashToInvest.overTarget, 15_555.56);
  });

  it('K6: Liquidità a importo fisso 20.000, conto 60.000 — C_in 20.000, P 420.000, X 40.000; q = 100: capitale 460.000, w_cash 4,3478%', () => {
    const assets = example([cash('conto', 60_000)]).filter((a) => a.id !== 'deposito');
    const { capital, weightsInput } = detail({ targets: targetsFixedCash(20_000) }, assets);
    near(weightsInput.cashIn, 20_000);
    near(capital.portfolio, 420_000);
    near(capital.cashToInvest.overTarget, 40_000);
    const full = detail({ targets: targetsFixedCash(20_000), cashToInvestPct: 100 }, assets);
    near(full.capital.total, 460_000);
    near(full.weightsInput.capital, 460_000);
    near((full.weightsInput.cashIn / full.weightsInput.capital) * 100, 4.3478, 0.0001); // 20.000 / 460.000
  });

  it('K7: a credit card excluded at −2.000 lowers E to 43.000 and L to 58.000', () => {
    const { capital } = detail({}, example([], [cash('carta', -2_000, { allocationRole: 'excluded' })]));
    near(capital.cashToInvest.excludedAccounts, 43_000);
    near(capital.cashToInvest.total, 58_000);
  });

  it('K8: q = 50 — cost basis 340.000, gain share 90.000 / 430.000', () => {
    const { taxProfile } = detail({ cashToInvestPct: 50 }).capital;
    near(taxProfile!.basisToday, 340_000); // 200.000 + 110.000 + 30.000 of cash at its own value
    near(taxProfile!.gainShare * 100, (90_000 / 430_000) * 100, 0.0001); // 20,93%
  });

  it('K9: q = 50 — the liquid part is 430.000 (ETFs and accounts are liquid)', () => {
    const { capital } = detail({ cashToInvestPct: 50 });
    near(capital.liquid, 430_000);
    near(capital.illiquid, 0);
  });

  it('K10: no targets, q = 0 — capital 415.000, weights 67,47/28,92/3,61 before normalise', () => {
    const { capital, weightsInput } = detail({ targets: null, cashToInvestPct: 0 });
    near(capital.total, 415_000); // the included account is in, the deposit out
    near(weightsInput.cashIn, 15_000);
    const pct = (cls: string) => (weightsInput.legs.filter((leg) => leg.cls === cls).reduce((s, leg) => s + leg.notional, 0) / weightsInput.capital) * 100;
    near(pct('equity'), 67.4699, 0.0001);
    near(pct('bonds'), 28.9157, 0.0001);
    near(pct('cash'), 3.6145, 0.0001);
  });
});

describe('fireCapital — E (§ 14.8): the emergency fund in euro', () => {
  it('E1: F = 30.000 — U 30.000, capital 430.000, outside 30.000', () => {
    const { capital } = detail({ emergencyFund: 30_000 });
    near(capital.cashToInvest.used, 30_000);
    near(capital.total, 430_000);
    near(capital.outside.cash, 30_000);
    expect(capital.outside.cashIsFund).toBe(true);
  });

  it('E2: F = 0 — everything outside the portfolio enters', () => {
    const { capital } = detail({ emergencyFund: 0 });
    near(capital.cashToInvest.used, 60_000);
    near(capital.total, 460_000);
    near(capital.outside.cash, 0);
  });

  it('E3: no fund and no legacy share — nothing enters, all of L stays out', () => {
    const { capital } = detail({});
    expect(capital.cashToInvest.fund).toBeNull();
    near(capital.cashToInvest.used, 0);
    near(capital.total, 400_000);
    near(capital.outside.cash, 60_000);
    expect(capital.outside.cashIsFund).toBe(false);
  });

  it('E4: F = 30.000 with the deposit at 49.000 (L = 64.000) — U 34.000, capital 434.000, outside 30.000', () => {
    const { capital } = detail({ emergencyFund: 30_000 }, example([cash('deposito', 49_000, { allocationRole: 'excluded' })]));
    near(capital.cashToInvest.used, 34_000);
    near(capital.total, 434_000);
    near(capital.outside.cash, 30_000);
  });

  it('E5: F = 80.000 — U 0, capital 400.000, shortfall 20.000, outside 60.000', () => {
    const { capital } = detail({ emergencyFund: 80_000 });
    near(capital.cashToInvest.used, 0);
    near(capital.total, 400_000);
    near(capital.cashToInvest.fundShortfall, 20_000);
    near(capital.outside.cash, 60_000);
  });

  it('E6: F = 30.000 — cost basis 340.000, gain share 20,93%, liquid 430.000 (as K8, K9)', () => {
    const { capital } = detail({ emergencyFund: 30_000 });
    near(capital.taxProfile!.basisToday, 340_000);
    near(capital.taxProfile!.gainShare * 100, (90_000 / 430_000) * 100, 0.0001);
    near(capital.liquid, 430_000);
  });

  it('E7: K7 with F = 30.000 — U 28.000, capital 428.000', () => {
    const { capital } = detail({ emergencyFund: 30_000 }, example([], [cash('carta', -2_000, { allocationRole: 'excluded' })]));
    near(capital.cashToInvest.used, 28_000);
    near(capital.total, 428_000);
  });

  it('E8: K5 with F = 10.000 — U 5.555,56, capital 450.000, C_in untouched; the account enters for 50.000 / 60.000', () => {
    const assets = example([cash('conto', 60_000)]).filter((a) => a.id !== 'deposito');
    const result = detail({ targets: targetsCash(10), emergencyFund: 10_000 }, assets);
    near(result.capital.cashToInvest.used, 5_555.56);
    near(result.capital.total, 450_000);
    near(result.weightsInput.cashIn, 44_444.44);
    // C_in 44.444,44 + U 5.555,56 = 50.000 of the 60.000 on the account.
    near(result.legShare(byId(assets, 'conto'), 0), 50_000 / 60_000, 1e-9);
  });

  it('E9: K6 with F = 10.000 — U 30.000, capital 450.000, w_cash 4,4444%', () => {
    const assets = example([cash('conto', 60_000)]).filter((a) => a.id !== 'deposito');
    const { capital, weightsInput } = detail({ targets: targetsFixedCash(20_000), emergencyFund: 10_000 }, assets);
    near(capital.cashToInvest.overTarget, 40_000);
    near(capital.cashToInvest.used, 30_000);
    near(capital.total, 450_000);
    near((weightsInput.cashIn / weightsInput.capital) * 100, 4.4444, 0.0001);
  });

  it('E11: the legacy share 50 / 0 / 100 derives F = 30.000 / 60.000 / 0', () => {
    const cases: Array<[number, number, number]> = [[50, 30_000, 430_000], [0, 60_000, 400_000], [100, 0, 460_000]];
    for (const [pct, fund, total] of cases) {
      const { capital } = detail({ cashToInvestPct: pct });
      near(capital.cashToInvest.fund, fund);
      expect(capital.cashToInvest.fundFromPct).toBe(pct);
      near(capital.total, total);
    }
  });

  it('E12: with a fund and a legacy share both saved, the fund wins', () => {
    const { capital } = detail({ emergencyFund: 25_000, cashToInvestPct: 50 });
    near(capital.total, 435_000);
    expect(capital.cashToInvest.fundFromPct).toBeNull();
  });
});

describe('fireCapital — Q (§ 23.9, FC-Q2)', () => {
  it('Q-1: a composite 60/40 instrument counts each leg at its share of the value', () => {
    const fund = asset('misto', 'equity', 100_000, { composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }] });
    const result = resolveFireCapitalDetail([fund], valueOf, {});
    near(result.capital.portfolio, 100_000);
    near(result.legShare(fund, 0), 1, 1e-9);
    near(result.legShare(fund, 1), 1, 1e-9);
    const legs = result.weightsInput.legs.map((leg) => [leg.cls, leg.market]);
    expect(legs).toHaveLength(2);
    near(legs.find(([cls]) => cls === 'equity')![1] as number, 60_000);
    near(legs.find(([cls]) => cls === 'bonds')![1] as number, 40_000);
  });

  const composite8020 = () => asset('misto', 'equity', 100_000, { composition: [{ assetClass: 'equity', percentage: 80 }, { assetClass: 'cash', percentage: 20 }] });

  it('Q-2: a composite 80/20 with Liquidità at target 0 and F = 0 — its cash leg is all excess and all enters', () => {
    const fund = composite8020();
    const result = resolveFireCapitalDetail([fund], valueOf, { targets: targetsCash(0), emergencyFund: 0 });
    near(result.weightsInput.cashIn, 0); // C_in
    near(result.capital.cashToInvest.overTarget, 20_000); // X = C = 20.000
    near(result.capital.cashToInvest.total, 20_000); // L
    near(result.capital.cashToInvest.used, 20_000); // U
    near(result.capital.total, 100_000);
    near(result.legShare(fund, 1), 1, 1e-9);
    near(result.legShare(fund, 0), 1, 1e-9);
  });

  it('Q-3: as Q-2 with F = 15.000 — U 5.000, capital 85.000, the cash leg enters for a quarter', () => {
    const fund = composite8020();
    const result = resolveFireCapitalDetail([fund], valueOf, { targets: targetsCash(0), emergencyFund: 15_000 });
    near(result.capital.cashToInvest.used, 5_000);
    near(result.capital.total, 85_000);
    near(result.legShare(fund, 1), 0.25, 1e-9);
    near(result.capital.outside.cash, 15_000);
  });

  it('Q-4: the common example with F = 30.000 — the included account and the deposit each enter for half', () => {
    const assets = example();
    const result = detail({ emergencyFund: 30_000 }, assets);
    near(result.legShare(byId(assets, 'conto'), 0), 0.5, 1e-9); // C_in 0 + factor 0,5 · X/C 1
    near(result.legShare(byId(assets, 'deposito'), 0), 0.5, 1e-9); // factor 30.000 / 60.000
    near(result.capital.outside.cash, 30_000);
  });

  it('Q-5: target Liquidità 100% keeps all the included cash in the portfolio', () => {
    const withEtf = resolveFireCapitalDetail([asset('etf', 'equity', 400_000), cash('conto', 60_000)], valueOf, { targets: targetsCash(100) });
    near(withEtf.weightsInput.cashIn, 60_000);
    near(withEtf.capital.cashToInvest.overTarget, 0);
    // With no instrument outside Liquidità (N = 0) the `t / (100 − t) · N` branch would be 0/0: the 100% guard holds it.
    const cashOnly = resolveFireCapitalDetail([cash('conto', 60_000)], valueOf, { targets: targetsCash(100) });
    near(cashOnly.weightsInput.cashIn, 60_000);
    near(cashOnly.capital.portfolio, 60_000);
    near(cashOnly.capital.cashToInvest.overTarget, 0);
  });

  it('Q-6: no included cash account (C = 0) and target Liquidità 10% — C_in 0, X 0, P = N', () => {
    const assets = [asset('azioni', 'equity', 280_000), asset('obbl', 'bonds', 120_000)];
    const { capital, weightsInput } = resolveFireCapitalDetail(assets, valueOf, { targets: targetsCash(10) });
    near(weightsInput.cashIn, 0);
    near(capital.cashToInvest.overTarget, 0);
    near(capital.portfolio, 400_000);
  });

  it('Q-7: the fund shortfall — F = L → 0, F = 80.000 → 20.000, no fund → 0, a fund below L → 0', () => {
    near(detail({ emergencyFund: 60_000 }).capital.cashToInvest.fundShortfall, 0);
    near(detail({ emergencyFund: 30_000 }).capital.cashToInvest.fundShortfall, 0);
    near(detail({ emergencyFund: 80_000 }).capital.cashToInvest.fundShortfall, 20_000);
    expect(detail({}).capital.cashToInvest.fundShortfall).toBe(0);
  });

  it('Q-8: with no fund (U = 0) the excluded deposit stays out of the tax profile — basis 310.000 on 400.000', () => {
    const { taxProfile } = detail({}).capital;
    near(taxProfile!.basisToday, 310_000);
    near(taxProfile!.coveredValue, 400_000);
    near(taxProfile!.gainShare * 100, (90_000 / 400_000) * 100, 0.0001);
  });

  it('Q-9: an instrument in the locked fund counts in the net worth, not in the capital nor outside', () => {
    const plain = detail({ emergencyFund: 30_000 });
    const locked = detail({ emergencyFund: 30_000, lockedAssetIds: new Set(['fondo']) }, example([], [asset('fondo', 'equity', 40_000)]));
    near(locked.capital.netWorth, plain.capital.netWorth + 40_000);
    near(locked.capital.total, plain.capital.total);
    near(locked.capital.portfolio, plain.capital.portfolio);
    expect(locked.capital.outside).toEqual(plain.capital.outside);
  });

  it('Q-10: real estate and crypto are declared outside and leave the capital unchanged', () => {
    const { capital } = detail({ emergencyFund: 30_000 });
    near(capital.outside.realestate, 250_000);
    near(capital.outside.crypto, 10_000);
    near(capital.total, 430_000);
    // 280.000 + 120.000 + 15.000 + 45.000 + 10.000 + 250.000
    near(capital.netWorth, 720_000);
    const without = detail({ emergencyFund: 30_000 }, example().filter((a) => a.id !== 'btc' && a.id !== 'casa'));
    near(without.capital.total, capital.total);
  });

  it('resolveFireCapital returns the capital of the detail', () => {
    expect(resolveFireCapital(example(), valueOf, { targets: targets7030, emergencyFund: 30_000 })).toEqual(detail({ emergencyFund: 30_000 }).capital);
  });
});
