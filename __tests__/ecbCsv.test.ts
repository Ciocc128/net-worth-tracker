import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEcbLastObservation, splitCsvLine } from '@/lib/utils/ecbCsv';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'ecb', name), 'utf8');

describe('parseEcbLastObservation (AQ30)', () => {
  it('reads the €STR of 08/10/2026 from the archived CSV', () => {
    expect(parseEcbLastObservation(fixture('ecb_estr_2026-10-10.csv'))).toEqual({ period: '2026-10-08', value: 2.439 });
  });

  it('reads the AAA 10-year spot of 08/10/2026', () => {
    const last = parseEcbLastObservation(fixture('ecb_yc_G_N_A_10y_2026-10-10.csv'));
    expect(last?.period).toBe('2026-10-08');
    expect(last?.value).toBeCloseTo(3.51918971, 8);
  });

  it('reads the SPF of the 3rd quarter 2026', () => {
    const last = parseEcbLastObservation(fixture('ecb_spf_lt_2026-10-10.csv'));
    expect(last?.period).toBe('2026-Q3');
    expect(last?.value).toBeCloseTo(2.0368652, 6);
  });

  it('takes the latest period whatever the row order', () => {
    const csv = 'KEY,TIME_PERIOD,OBS_VALUE\nA,2026-10-08,2.4\nA,2026-10-07,2.3\n';
    expect(parseEcbLastObservation(csv)).toEqual({ period: '2026-10-08', value: 2.4 });
  });

  it('skips rows without a finite value and returns null when none is left', () => {
    expect(parseEcbLastObservation('KEY,TIME_PERIOD,OBS_VALUE\nA,2026-10-08,\nA,2026-10-07,NaN\n')).toBeNull();
    expect(parseEcbLastObservation('KEY,TIME_PERIOD,OBS_VALUE\nA,2026-10-08,\nA,2026-10-07,2.3\n')).toEqual({ period: '2026-10-07', value: 2.3 });
  });

  it('returns null on a body without the two columns, an HTML error page or an empty body', () => {
    expect(parseEcbLastObservation('KEY,FOO\nA,1\n')).toBeNull();
    expect(parseEcbLastObservation('<html>Service unavailable</html>')).toBeNull();
    expect(parseEcbLastObservation('')).toBeNull();
  });
});

describe('splitCsvLine', () => {
  it('keeps commas and doubled quotes inside a quoted field', () => {
    expect(splitCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
  });
});
