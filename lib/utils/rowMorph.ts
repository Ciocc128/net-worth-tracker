/**
 * How a ranked list becomes its next state without being replaced (AN2, doc/animazioni/README.md
 * § 5.4–5.6; DESIGN.md → The Period-Transforms Rule and The View-Transforms Rule).
 *
 * A row of the new list keeps the DOM node of the row with the SAME key, so a category that is in
 * both months slides to its new place and its bar to its new width. A row whose key is new takes
 * over the node of a row that left — first freed, first taken, in list order — so switching the
 * Esposizione from Settori to Paesi turns row 1 into row 1: the name changes, the bar slides, the
 * figures count (the sketch the owner approved, 2026-10-23). Only what is left over enters or
 * exits. The node's identity is the SLOT; the row's key stays the row's (clicks, `activeKey`).
 *
 * Pure: the primitives (`RankedRows`, `CompositionList`) hold the slots from the last render and
 * call `assignRowSlots` on the render that brings a new list (adjust-state-during-render).
 */

/** At most this many rows re-rank and count (D-AN10): beyond it a list lands where it goes. */
export const ROW_MORPH_MAX_ROWS = 10;

/** How long the figures of a row take to count to the new ones — the period's glide (§ 6). */
export const ROW_COUNT_MS = 620;

export interface SlottedKey {
  key: string;
  slot: string;
}

/**
 * The slot of every key of `nextKeys`, in order. `previous` is the last render's assignment.
 * `reuse` false (a list over `ROW_MORPH_MAX_ROWS`, reduced motion) keeps same-key slots and gives
 * every other key a slot of its own: nothing morphs into something else.
 */
export function assignRowSlots(previous: readonly SlottedKey[], nextKeys: readonly string[], reuse = true): SlottedKey[] {
  const slotByKey = new Map(previous.map((entry) => [entry.key, entry.slot]));
  const nextKeySet = new Set(nextKeys);
  const freed = reuse ? previous.filter((entry) => !nextKeySet.has(entry.key)).map((entry) => entry.slot) : [];
  const taken = new Set<string>();
  for (const key of nextKeys) {
    const slot = slotByKey.get(key);
    if (slot !== undefined) taken.add(slot);
  }
  const used = new Set(previous.map((entry) => entry.slot));
  let freedIndex = 0;
  return nextKeys.map((key) => {
    const kept = slotByKey.get(key);
    if (kept !== undefined) return { key, slot: kept };
    if (freedIndex < freed.length) return { key, slot: freed[freedIndex++] };
    // A slot of its own: the key itself, unless a node of the previous list still carries that
    // name for another row (a key that left and came back while its old slot moved on).
    let slot = key;
    for (let n = 2; used.has(slot) || taken.has(slot); n++) slot = `${key}#${n}`;
    taken.add(slot);
    return { key, slot };
  });
}

/** The figures of a row that count: whatever the primitive prints as a number. */
export type RowFigures = Readonly<Record<string, number>>;

/** ease-out-quart, the curve of every count in the app (`useCountUp`). */
export function easeOutQuart(progress: number): number {
  return 1 - Math.pow(1 - progress, 4);
}

/**
 * One frame of the count: every slot of `to` at `progress` (0–1, eased here) from its figures in
 * `from`. A slot that was not on screen (`from` lacks it) prints its landed figures at once.
 */
export function blendRowFigures(
  from: ReadonlyMap<string, RowFigures>,
  to: ReadonlyMap<string, RowFigures>,
  progress: number,
): Map<string, RowFigures> {
  const eased = easeOutQuart(Math.min(Math.max(progress, 0), 1));
  const frame = new Map<string, RowFigures>();
  for (const [slot, target] of to) {
    const start = from.get(slot);
    if (!start || eased >= 1) {
      frame.set(slot, target);
      continue;
    }
    const blended: Record<string, number> = {};
    for (const [name, value] of Object.entries(target)) {
      const origin = start[name];
      blended[name] = typeof origin === 'number' ? origin + (value - origin) * eased : value;
    }
    frame.set(slot, blended);
  }
  return frame;
}

/** True when two sets of figures print the same — a refetch of the same list starts no count. */
export function sameRowFigures(a: ReadonlyMap<string, RowFigures>, b: ReadonlyMap<string, RowFigures>): boolean {
  if (a.size !== b.size) return false;
  for (const [slot, figures] of a) {
    const other = b.get(slot);
    if (!other) return false;
    const names = Object.keys(figures);
    if (names.length !== Object.keys(other).length) return false;
    for (const name of names) if (figures[name] !== other[name]) return false;
  }
  return true;
}
