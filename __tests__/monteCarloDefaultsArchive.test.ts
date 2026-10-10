import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MONTE_CARLO_CLASS_DEFAULTS, defaultCorrelations } from '@/lib/constants/monteCarloMarketDefaults';
import {
  compareDefaults,
  computeClass,
  computeCorrelations,
  parseAnnualCsv,
  sha256Of,
  verifyManifest,
  type ArchiveManifest,
} from '@/lib/utils/monteCarloDefaultsArchive';

const dir = path.join(process.cwd(), 'data', 'montecarlo');
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as ArchiveManifest;
const table = parseAnnualCsv(readFileSync(path.join(dir, 'annual_series.csv'), 'utf8'));
const rawRoot = process.env.MONTECARLO_RAW_ROOT ?? manifest.rawRoot;

describe('Monte Carlo defaults archive (dossier § 14.13, RQ10)', () => {
  it('AQ42: every manifest file present on this machine has its fingerprint; the archived annual file always does', () => {
    const check = verifyManifest(manifest, (entry) => {
      const file = entry.inRepo ? path.join(process.cwd(), entry.file) : path.join(rawRoot, entry.file);
      return existsSync(file) ? readFileSync(file) : null;
    });
    expect(check.changed).toEqual([]);
    expect(check.absent).not.toContain('data/montecarlo/annual_series.csv');
  });

  it('AQ42: a changed file fails with its name', () => {
    const tiny: ArchiveManifest = {
      ...manifest,
      files: [
        { file: 'a.csv', sha256: sha256Of('uno'), source: 'x', url: null, asOf: '-', note: '', inRepo: true },
        { file: 'b.csv', sha256: sha256Of('due'), source: 'x', url: null, asOf: '-', note: '', inRepo: true },
        { file: 'c.csv', sha256: sha256Of('tre'), source: 'x', url: null, asOf: '-', note: '', inRepo: false },
      ],
    };
    const contents: Record<string, string> = { 'a.csv': 'uno', 'b.csv': 'due modificato' };
    const check = verifyManifest(tiny, (entry) => (entry.file in contents ? Buffer.from(contents[entry.file]) : null));
    expect(check.changed).toEqual(['b.csv']);
    expect(check.absent).toEqual(['c.csv']);
    expect(check.checked).toEqual(['a.csv', 'b.csv']);
  });

  it('AQ43: real CAGR, volatility and uncertainty of the historical classes within 0,005 of the defaults', () => {
    for (const cls of ['equity', 'gold', 'commodity'] as const) {
      const computed = computeClass(table, cls);
      const stored = MONTE_CARLO_CLASS_DEFAULTS[cls];
      expect(Math.abs(computed.cagr - (stored.cagr as number))).toBeLessThanOrEqual(0.005);
      expect(Math.abs(computed.volatility - stored.volatility)).toBeLessThanOrEqual(0.005);
      expect(Math.abs(computed.uncertainty - stored.uncertainty)).toBeLessThanOrEqual(0.005);
    }
    expect(computeClass(table, 'equity').years).toBe(54);
    expect(computeClass(table, 'gold').years).toBe(45);
    expect(computeClass(table, 'commodity').years).toBe(46);
  });

  it('AQ43: the correlations, after the V-D4 rule, equal the defaults in all 16 hedge combinations', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const hedged = { equity: !!(mask & 1), gold: !!(mask & 2), trendFollowing: !!(mask & 4), carry: !!(mask & 8) };
      const computed = computeCorrelations(table, hedged);
      const stored = defaultCorrelations(hedged);
      computed.forEach((value, slot) => expect(value).toBeCloseTo(stored[slot], 9));
    }
  });

  it('reports no mismatch on the committed defaults', () => {
    expect(compareDefaults(table, manifest)).toEqual([]);
  });

  it('AQ44: a default changed by hand fails and names the class and the field', () => {
    const edited = { ...MONTE_CARLO_CLASS_DEFAULTS, gold: { ...MONTE_CARLO_CLASS_DEFAULTS.gold, volatility: 16.5 } };
    const mismatches = compareDefaults(table, manifest, edited);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ cls: 'gold', field: 'volatility', actual: 16.5 });

    const premium = { ...MONTE_CARLO_CLASS_DEFAULTS, carry: { ...MONTE_CARLO_CLASS_DEFAULTS.carry, premium: 3.5 } };
    expect(compareDefaults(table, manifest, premium).map((m) => `${m.cls}.${m.field}`)).toEqual(['carry.premium']);

    const correlations = compareDefaults(table, manifest, MONTE_CARLO_CLASS_DEFAULTS, (hedged) => {
      const base = defaultCorrelations(hedged);
      base[0] = 0.25;
      return base;
    });
    expect(correlations.length).toBeGreaterThan(0);
    expect(correlations[0].cls).toBe('correlations');
  });
});
