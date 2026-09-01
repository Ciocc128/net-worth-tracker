/**
 * Coherence tests for `lib/constants/instrumentProfiles.ts` (the plan's Verifica §2):
 *  - every `INDEX_PROFILES[*].countries`/`.currencies` that carries weights sums to 1 ± 0.005;
 *  - every `indexId`/`legIndexIds` an instrument entry references actually exists;
 *  - a curated fact (a currency override, a Yahoo alias) always carries `asOf` + `sourceUrl`;
 *  - every allocable instrument measured in the portfolio (2026-09-01, see the plan) has a
 *    curated entry, or is a direct stock (handled generically — no curated fact needed).
 *
 * This is the STATIC regression guard on today's table. The LIVE guard against a genuinely NEW
 * future purchase is structural, not this test: `profileResolver.ts` returns `undefined` for any
 * ticker absent from `INSTRUMENT_PROFILES`, and the engine already buckets that as `nonLetta` —
 * never silently zero — reinforced by `npm run exposure:refresh`, which diffs this table against
 * the real Firestore portfolio and prints exactly which ticker is new.
 */
import { describe, it, expect } from 'vitest';
import { INSTRUMENT_PROFILES, INDEX_PROFILES } from '@/lib/constants/instrumentProfiles';

const WEIGHT_SUM_TOLERANCE = 0.005;

function sumWeights(entries: Array<{ weight: number }> | undefined): number {
  return (entries ?? []).reduce((sum, e) => sum + e.weight, 0);
}

function expectSumsToOne(entries: Array<{ weight: number }> | undefined) {
  if (!entries || entries.length === 0) return; // a declared gap — exempt, see this file's header
  const sum = sumWeights(entries);
  expect(sum).toBeGreaterThanOrEqual(1 - WEIGHT_SUM_TOLERANCE);
  expect(sum).toBeLessThanOrEqual(1 + WEIGHT_SUM_TOLERANCE);
}

describe('INDEX_PROFILES — internal coherence', () => {
  for (const [indexId, profile] of Object.entries(INDEX_PROFILES)) {
    it(`${indexId}: countries sum to 1 ± 0.005 when populated`, () => {
      expectSumsToOne(profile.countries);
    });

    it(`${indexId}: currencies sum to 1 ± 0.005 when populated`, () => {
      expectSumsToOne(profile.currencies);
    });

    it(`${indexId}: carries asOf + sourceUrl whenever it has actual weights`, () => {
      const hasData = (profile.countries?.length ?? 0) > 0 || (profile.currencies?.length ?? 0) > 0;
      if (!hasData) return;
      expect(profile.asOf, `${indexId} has weights but no asOf`).toBeTruthy();
      expect(profile.sourceUrl, `${indexId} has weights but no sourceUrl`).toBeTruthy();
    });
  }
});

describe('INSTRUMENT_PROFILES — internal coherence', () => {
  for (const [ticker, entry] of Object.entries(INSTRUMENT_PROFILES)) {
    it(`${ticker}: every referenced indexId exists in INDEX_PROFILES`, () => {
      if (entry.indexId) {
        expect(INDEX_PROFILES[entry.indexId], `${ticker} references unknown indexId ${entry.indexId}`).toBeDefined();
      }
      if (entry.legIndexIds) {
        for (const indexId of Object.values(entry.legIndexIds)) {
          expect(INDEX_PROFILES[indexId as string], `${ticker} references unknown indexId ${indexId}`).toBeDefined();
        }
      }
    });

    it(`${ticker}: a currency override sums to 1 ± 0.005`, () => {
      expectSumsToOne(entry.currencies);
    });

    it(`${ticker}: a curated fact (currency override or Yahoo alias) carries asOf + sourceUrl`, () => {
      // kind-only entries and bare indexId placeholders are exempt — they codify a RULE or point
      // at a declared gap, not a dated fact; see instrumentProfiles.ts's header.
      if (entry.currencies || entry.yahooExposureTicker) {
        expect(entry.asOf, `${ticker} has a dated fact but no asOf`).toBeTruthy();
        expect(entry.sourceUrl, `${ticker} has a dated fact but no sourceUrl`).toBeTruthy();
      }
    });
  }
});

// The portfolio measured 2026-09-01 (see precious-greeting-lake.md): 14 allocable instruments, 12
// ETFs/commodities + 2 direct stocks. Re-run `npm run exposure:report` after a trade to re-measure.
const KNOWN_ALLOCABLE_FUND_TICKERS = [
  'NTSG-ETFP.MI',
  'CL2.MI',
  'SGLN.MI',
  'DBMFE.PA',
  'CRRY.MI',
  'UEQC.DE',
  'EXUS.MI',
  'EIMI.MI',
  'XDEM.MI',
  'DEGC.DE',
  'AVWS.DE',
  'ALLW.MI',
];

describe('INSTRUMENT_PROFILES — completeness against the measured portfolio (2026-09-01)', () => {
  it('every known allocable ETF/commodity ticker has a curated entry', () => {
    for (const ticker of KNOWN_ALLOCABLE_FUND_TICKERS) {
      expect(INSTRUMENT_PROFILES[ticker], `${ticker} has no curated entry`).toBeDefined();
    }
  });

  it('BSP and BRK-B (direct stocks) deliberately have NO curated entry — resolved generically', () => {
    expect(INSTRUMENT_PROFILES['BSP']).toBeUndefined();
    expect(INSTRUMENT_PROFILES['BRK-B']).toBeUndefined();
  });

  it('the three non-look-through kinds never carry an indexId (there is nothing to look through)', () => {
    for (const ticker of ['SGLN.MI', 'DBMFE.PA', 'CRRY.MI', 'UEQC.DE']) {
      expect(INSTRUMENT_PROFILES[ticker]?.indexId, `${ticker} is a kind instrument with an indexId`).toBeUndefined();
    }
  });
});
