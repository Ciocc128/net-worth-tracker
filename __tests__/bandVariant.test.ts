import { describe, expect, it } from 'vitest';
import { resolveBandVariant } from '@/lib/utils/bandVariant';

// UM2 trial switch: a fresh tab is always today's app («c»); `?fascia=a` turns the trial on for the tab.
describe('resolveBandVariant', () => {
  it('is today\'s behaviour with nothing asked and nothing stored', () => {
    expect(resolveBandVariant('', null)).toBe('c');
  });
  it('turns the trial on from the address', () => {
    expect(resolveBandVariant('?fascia=a', null)).toBe('a');
  });
  it('keeps the trial on for the tab once asked', () => {
    expect(resolveBandVariant('?tab=accumulo', 'a')).toBe('a');
  });
  it('turns it off from the address even when stored', () => {
    expect(resolveBandVariant('?fascia=c', 'a')).toBe('c');
  });
  it('ignores an unknown value', () => {
    expect(resolveBandVariant('?fascia=b', null)).toBe('c');
    expect(resolveBandVariant('?fascia=x', 'a')).toBe('a');
  });
});
