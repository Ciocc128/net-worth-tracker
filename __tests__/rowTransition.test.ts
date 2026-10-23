import { describe, expect, it } from 'vitest';
import { findAddedIds, closeRow, reopenRow, MAX_ADDED_ROWS } from '@/lib/utils/rowTransition';

describe('findAddedIds', () => {
  it('names a row added to a list that kept all its rows', () => {
    expect([...findAddedIds(['a', 'b'], ['a', 'x', 'b'])]).toEqual(['x']);
  });

  it('is empty on the first read (the list was empty)', () => {
    expect(findAddedIds([], ['a', 'b']).size).toBe(0);
  });

  it('is empty when a row left, even if another arrived', () => {
    expect(findAddedIds(['a', 'b'], ['a', 'x']).size).toBe(0);
  });

  it('is empty when more than the limit arrived at once (another period, a refetch)', () => {
    const next = ['a', ...Array.from({ length: MAX_ADDED_ROWS + 1 }, (_, i) => `n${i}`)];
    expect(findAddedIds(['a'], next).size).toBe(0);
  });

  it('is empty when nothing changed', () => {
    expect(findAddedIds(['a'], ['a']).size).toBe(0);
  });
});

describe('closeRow / reopenRow', () => {
  it('marks the row as leaving with its measured height and takes both back', () => {
    const row = { dataset: {} as Record<string, string>, offsetHeight: 48, style: { props: {} as Record<string, string>, setProperty(k: string, v: string) { this.props[k] = v; }, removeProperty(k: string) { delete this.props[k]; } } };
    closeRow(row as unknown as HTMLElement);
    expect(row.dataset.rowExiting).toBe('');
    expect(row.style.props['--row-height']).toBe('48px');
    reopenRow(row as unknown as HTMLElement);
    expect(row.dataset.rowExiting).toBeUndefined();
    expect(row.style.props['--row-height']).toBeUndefined();
  });
});
