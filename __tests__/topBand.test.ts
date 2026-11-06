import { describe, it, expect } from 'vitest';
import {
  TOP_BAND_ATTRIBUTE,
  TOP_BAND_INIT_SCRIPT,
  TOP_BAND_OPTIONS,
  TOP_BAND_STORAGE_KEY,
  TOP_BAND_SWATCHES,
  parseTopBandChoices,
  resolveTopBand,
} from '@/lib/constants/topBand';

describe('resolveTopBand', () => {
  it('paints the default of a theme with nothing stored', () => {
    expect(resolveTopBand('lime-frost', {})).toBe('lime');
    expect(resolveTopBand('graphite', undefined)).toBe('blu');
  });

  it('paints the stored option of the active theme only', () => {
    const choices = { 'lime-frost': 'ardesia', graphite: 'inchiostro' } as const;
    expect(resolveTopBand('lime-frost', choices)).toBe('ardesia');
    expect(resolveTopBand('graphite', choices)).toBe('inchiostro');
  });

  it('has no band for a theme without one', () => {
    expect(resolveTopBand('solar-dusk', { 'lime-frost': 'ardesia' })).toBeNull();
    expect(resolveTopBand('default', {})).toBeNull();
  });
});

describe('parseTopBandChoices', () => {
  it('keeps only options the theme offers', () => {
    expect(parseTopBandChoices('{"lime-frost":"verde","graphite":"verde"}')).toEqual({ graphite: 'verde' });
  });

  it('reads garbage as no choice', () => {
    expect(parseTopBandChoices('not json')).toEqual({});
    expect(parseTopBandChoices(null)).toEqual({});
    expect(parseTopBandChoices(['lime'])).toEqual({});
  });
});

describe('the options', () => {
  it('three colours and «Nessuna» per theme, each with a preview', () => {
    for (const [theme, options] of Object.entries(TOP_BAND_OPTIONS)) {
      expect(options).toHaveLength(4);
      expect(options[options.length - 1]).toBe('nessuna');
      for (const option of options) expect(TOP_BAND_SWATCHES[theme as keyof typeof TOP_BAND_SWATCHES][option]).toBeDefined();
    }
  });
});

describe('TOP_BAND_INIT_SCRIPT', () => {
  function run(theme: string | null, stored: string | null, throws = false) {
    const attributes: Record<string, string> = {};
    if (theme) attributes['data-theme'] = theme;
    const documentElement = {
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
    };
    const localStorage = {
      getItem: (key: string) => {
        if (throws) throw new Error('blocked');
        return key === TOP_BAND_STORAGE_KEY ? stored : null;
      },
    };
    new Function('document', 'localStorage', TOP_BAND_INIT_SCRIPT)({ documentElement }, localStorage);
    return attributes[TOP_BAND_ATTRIBUTE];
  }

  it('writes the stored band of the theme on <html>', () => {
    expect(run('graphite', '{"graphite":"inchiostro"}')).toBe('inchiostro');
  });

  it('leaves the attribute off with nothing valid stored, another theme or a throwing storage', () => {
    expect(run('graphite', null)).toBeUndefined();
    expect(run('graphite', '{"graphite":"lime"}')).toBeUndefined();
    expect(run('solar-dusk', '{"graphite":"blu"}')).toBeUndefined();
    expect(run('graphite', '{"graphite":"blu"}', true)).toBeUndefined();
  });
});
