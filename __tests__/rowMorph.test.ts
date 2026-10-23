import { describe, expect, it } from 'vitest';
import { assignRowSlots, blendRowFigures, easeOutQuart, sameRowFigures } from '@/lib/utils/rowMorph';

const slots = (assignment: { slot: string }[]) => assignment.map((entry) => entry.slot);

describe('assignRowSlots', () => {
  it('gives a first list one slot per key, named after it', () => {
    expect(assignRowSlots([], ['a', 'b'])).toEqual([
      { key: 'a', slot: 'a' },
      { key: 'b', slot: 'b' },
    ]);
  });

  it('keeps the slot of a key that stays, wherever it moves', () => {
    const first = assignRowSlots([], ['casa', 'auto', 'cibo']);
    const next = assignRowSlots(first, ['cibo', 'casa', 'auto']);
    expect(next).toEqual([
      { key: 'cibo', slot: 'cibo' },
      { key: 'casa', slot: 'casa' },
      { key: 'auto', slot: 'auto' },
    ]);
  });

  it('turns row N into row N when the whole list changes (Settori → Paesi)', () => {
    const settori = assignRowSlots([], ['tech', 'finanza', 'salute']);
    const paesi = assignRowSlots(settori, ['usa', 'giappone', 'regno-unito']);
    expect(slots(paesi)).toEqual(['tech', 'finanza', 'salute']);
    expect(paesi.map((entry) => entry.key)).toEqual(['usa', 'giappone', 'regno-unito']);
  });

  it('lets a new key take a freed slot, and gives what is left over a slot of its own', () => {
    const first = assignRowSlots([], ['a', 'b']);
    const next = assignRowSlots(first, ['b', 'x', 'y']);
    expect(next).toEqual([
      { key: 'b', slot: 'b' },
      { key: 'x', slot: 'a' },
      { key: 'y', slot: 'y' },
    ]);
  });

  it('never gives two rows the same slot when a key comes back after its slot moved on', () => {
    const first = assignRowSlots([], ['a', 'b']);
    const second = assignRowSlots(first, ['x', 'b']); // x takes slot «a»
    const third = assignRowSlots(second, ['x', 'b', 'a']); // «a» is back while slot «a» holds x
    const thirdSlots = slots(third);
    expect(new Set(thirdSlots).size).toBe(3);
    expect(thirdSlots[0]).toBe('a');
    expect(thirdSlots[2]).toBe('a#2');
  });

  it('reuses no slot when reuse is off (a long list, reduced motion)', () => {
    const first = assignRowSlots([], ['a', 'b']);
    expect(assignRowSlots(first, ['b', 'x'], false)).toEqual([
      { key: 'b', slot: 'b' },
      { key: 'x', slot: 'x' },
    ]);
  });
});

describe('blendRowFigures', () => {
  const from = new Map([['s', { amount: 1840, percentage: 10 }]]);
  const to = new Map([
    ['s', { amount: 21960, percentage: 30 }],
    ['n', { amount: 50, percentage: 1 }],
  ]);

  it('starts on the figures on screen and lands on the new ones', () => {
    expect(blendRowFigures(from, to, 0).get('s')).toEqual({ amount: 1840, percentage: 10 });
    expect(blendRowFigures(from, to, 1).get('s')).toEqual({ amount: 21960, percentage: 30 });
  });

  it('passes strictly between the two in the middle, on ease-out-quart', () => {
    const middle = blendRowFigures(from, to, 0.5).get('s')!;
    expect(middle.amount).toBeGreaterThan(1840);
    expect(middle.amount).toBeLessThan(21960);
    expect(middle.amount).toBeCloseTo(1840 + (21960 - 1840) * easeOutQuart(0.5));
  });

  it('prints a slot that was not on screen at its landed figures at once', () => {
    expect(blendRowFigures(from, to, 0.2).get('n')).toEqual({ amount: 50, percentage: 1 });
  });
});

describe('sameRowFigures', () => {
  it('is true for the same figures under new references, false when one moves', () => {
    expect(sameRowFigures(new Map([['a', { v: 1 }]]), new Map([['a', { v: 1 }]]))).toBe(true);
    expect(sameRowFigures(new Map([['a', { v: 1 }]]), new Map([['a', { v: 2 }]]))).toBe(false);
    expect(sameRowFigures(new Map([['a', { v: 1 }]]), new Map([['b', { v: 1 }]]))).toBe(false);
  });
});
