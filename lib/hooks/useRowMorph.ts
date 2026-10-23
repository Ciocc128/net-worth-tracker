'use client';

import { useEffect, useState } from 'react';
import {
  assignRowSlots,
  blendRowFigures,
  ROW_COUNT_MS,
  ROW_MORPH_MAX_ROWS,
  sameRowFigures,
  type RowFigures,
  type SlottedKey,
} from '@/lib/utils/rowMorph';

export interface MorphRow {
  key: string;
  label: string;
  figures: RowFigures;
}

/**
 * The count's progress, outside React state: ONE `requestAnimationFrame` per list writes it, and
 * only the figure leaves (`MorphFigure`) subscribe — a frame re-renders the printed numbers, never
 * the list, its `motion.li` or the bars (measured 2026-10-23: a state per frame re-rendered ~1040
 * components per view switch on the Esposizione, `perf:census` › `view`).
 */
export interface MorphFrameStore {
  generation: number;
  progress: number;
  listeners: Set<() => void>;
  subscribe: (listener: () => void) => () => void;
  /** Starts the count of `generation` from 0. */
  begin: (generation: number) => void;
  /** Writes a frame and tells the leaves. */
  advance: (progress: number) => void;
}

function createFrameStore(): MorphFrameStore {
  const store: MorphFrameStore = {
    generation: 0,
    progress: 1,
    listeners: new Set(),
    subscribe: (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    begin: (generation) => {
      store.generation = generation;
      store.progress = 0;
    },
    advance: (progress) => {
      store.progress = progress;
      for (const listener of store.listeners) listener();
    },
  };
  return store;
}

/** What a ranked list renders from: the node of each row, and what its figure leaves read. */
export interface RowMorph {
  /** The node (React key) of each row, by the row's key. */
  slotOf: (key: string) => string;
  /** A slot whose label changed in the last switch: its name fades in (`row-label-in`). */
  relabelled: ReadonlySet<string>;
  /** A slot that was not on screen before the last switch: the row fades in (`row-enter`). */
  entered: ReadonlySet<string>;
  /** False beyond `ROW_MORPH_MAX_ROWS` or under reduced motion: no re-rank, no count, no fades. */
  animate: boolean;
  /** For `MorphFigure`: where the running count started, by slot (null once nothing counts). */
  from: ReadonlyMap<string, RowFigures> | null;
  store: MorphFrameStore;
  generation: number;
}

interface MorphState {
  rows: readonly MorphRow[];
  assignment: SlottedKey[];
  labels: Map<string, string>;
  target: Map<string, RowFigures>;
  /** Where the count of `generation` started; null when the list landed without one. */
  from: Map<string, RowFigures> | null;
  generation: number;
  relabelled: Set<string>;
  entered: Set<string>;
  animate: boolean;
}

const NO_SLOTS: ReadonlySet<string> = new Set();

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sameRows(a: readonly MorphRow[], b: readonly MorphRow[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key || a[i].label !== b[i].label) return false;
    const fa = a[i].figures;
    const fb = b[i].figures;
    for (const name of Object.keys(fa)) if (fa[name] !== fb[name]) return false;
  }
  return true;
}

function firstState(rows: readonly MorphRow[]): MorphState {
  const assignment = assignRowSlots([], rows.map((row) => row.key));
  return {
    rows,
    assignment,
    labels: new Map(assignment.map((entry, i) => [entry.slot, rows[i].label])),
    target: new Map(assignment.map((entry, i) => [entry.slot, rows[i].figures])),
    from: null,
    generation: 0,
    relabelled: new Set(),
    entered: new Set(),
    animate: rows.length <= ROW_MORPH_MAX_ROWS,
  };
}

/** The progress of `generation` as the leaves read it: 0 until its frame loop has started. */
function progressOf(store: MorphFrameStore, generation: number): number {
  return store.generation === generation ? store.progress : 0;
}

/**
 * The next list settled against what is on screen now (the decision of the render that brings
 * it). `onScreen` is the frame the leaves painted last — a running count is interrupted from there.
 */
function settle(previous: MorphState, rows: readonly MorphRow[], onScreen: Map<string, RowFigures>): MorphState {
  const animate = rows.length <= ROW_MORPH_MAX_ROWS && previous.rows.length <= ROW_MORPH_MAX_ROWS && !prefersReducedMotion();
  const assignment = assignRowSlots(previous.assignment, rows.map((row) => row.key), animate);
  const target = new Map(assignment.map((entry, i) => [entry.slot, rows[i].figures]));
  const labels = new Map(assignment.map((entry, i) => [entry.slot, rows[i].label]));
  const relabelled = new Set<string>();
  const entered = new Set<string>();
  if (animate) {
    for (const [slot, label] of labels) {
      const before = previous.labels.get(slot);
      if (before === undefined) entered.add(slot);
      else if (before !== label) relabelled.add(slot);
    }
  }
  // Only the slots that were on screen count: a row that enters prints its figures at once.
  const from = animate && !sameRowFigures(onScreen, target) ? onScreen : null;
  return { rows, assignment, labels, target, from, generation: previous.generation + 1, relabelled, entered, animate };
}

/**
 * The rows of a ranked list as nodes that persist across a switch of view, period or level
 * (`lib/utils/rowMorph.ts`), and their figures counting from the ones on screen with ONE
 * `requestAnimationFrame` per list (D-AN10) — never a `useCountUp` per row. The list re-renders
 * on the switch alone; each frame reaches only the `MorphFigure` leaves. The first list lands: the
 * tile's entrance is the page's.
 */
export function useRowMorph(rows: readonly MorphRow[]): RowMorph {
  const [state, setState] = useState<MorphState>(() => firstState(rows));
  const [store] = useState(createFrameStore);

  if (!sameRows(state.rows, rows)) {
    const onScreen = state.from ? blendRowFigures(state.from, state.target, progressOf(store, state.generation)) : state.target;
    setState(settle(state, rows, onScreen));
  }

  const { from, generation } = state;

  useEffect(() => {
    if (from === null) return;
    store.begin(generation);
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / ROW_COUNT_MS, 1);
      store.advance(progress);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, generation, store]);

  const slotByKey = new Map(state.assignment.map((entry) => [entry.key, entry.slot]));
  return {
    slotOf: (key) => slotByKey.get(key) ?? key,
    relabelled: state.animate ? state.relabelled : NO_SLOTS,
    entered: state.animate ? state.entered : NO_SLOTS,
    animate: state.animate,
    from,
    store,
    generation,
  };
}

export { progressOf as morphProgressOf };
