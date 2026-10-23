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

/** What a ranked list renders from: the node of each row and the figures of this frame. */
export interface RowMorph {
  /** The node (React key) of each row, by the row's key. */
  slotOf: (key: string) => string;
  /** The figures to print in this frame, by slot — the landed ones once the count is over. */
  figuresOf: (slot: string, landed: RowFigures) => RowFigures;
  /** A slot whose label changed in the last switch: its name fades in (`row-label-in`). */
  relabelled: ReadonlySet<string>;
  /** A slot that was not on screen before the last switch: the row fades in (`row-enter`). */
  entered: ReadonlySet<string>;
  /** False beyond `ROW_MORPH_MAX_ROWS` or under reduced motion: no re-rank, no count, no fades. */
  animate: boolean;
}

interface MorphState {
  rows: readonly MorphRow[];
  assignment: SlottedKey[];
  labels: Map<string, string>;
  target: Map<string, RowFigures>;
  shown: Map<string, RowFigures>;
  /** Where the running count started; null once it has landed. */
  from: Map<string, RowFigures> | null;
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
  const target = new Map(assignment.map((entry, i) => [entry.slot, rows[i].figures]));
  return {
    rows,
    assignment,
    labels: new Map(assignment.map((entry, i) => [entry.slot, rows[i].label])),
    target,
    shown: target,
    from: null,
    relabelled: new Set(),
    entered: new Set(),
    animate: rows.length <= ROW_MORPH_MAX_ROWS,
  };
}

/** The next list settled against what is on screen now (pure: the decision of the render that brings it). */
function settle(previous: MorphState, rows: readonly MorphRow[]): MorphState {
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
  // The count starts from what is on screen NOW (a frame of a running count included), and only
  // the slots that were there count: a row that enters prints its figures at once.
  const from = animate && !sameRowFigures(previous.shown, target) ? previous.shown : null;
  return { rows, assignment, labels, target, shown: from ?? target, from, relabelled, entered, animate };
}

/**
 * The rows of a ranked list as nodes that persist across a switch of view, period or level
 * (`lib/utils/rowMorph.ts`), and their figures counting from the ones on screen with ONE
 * `requestAnimationFrame` per list (D-AN10) — never a `useCountUp` per row. The first list lands:
 * the tile's entrance is the page's. The printed figure of a frame is never a measurement: the
 * primitive keeps the landed figures in the row's accessible name.
 */
export function useRowMorph(rows: readonly MorphRow[]): RowMorph {
  const [state, setState] = useState<MorphState>(() => firstState(rows));

  if (!sameRows(state.rows, rows)) {
    setState(settle(state, rows));
  }

  const { from, target } = state;

  useEffect(() => {
    if (from === null) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / ROW_COUNT_MS, 1);
      setState((previous) => {
        // A newer list has replaced this count: its cleanup cancelled the frame, but a tick
        // queued before it could still land — leave the new state alone.
        if (previous.target !== target) return previous;
        if (progress >= 1) return { ...previous, shown: target, from: null };
        return { ...previous, shown: blendRowFigures(from, target, progress) };
      });
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, target]);

  const slotByKey = new Map(state.assignment.map((entry) => [entry.key, entry.slot]));
  return {
    slotOf: (key) => slotByKey.get(key) ?? key,
    figuresOf: (slot, landed) => (state.from === null ? landed : (state.shown.get(slot) ?? landed)),
    relabelled: state.animate ? state.relabelled : NO_SLOTS,
    entered: state.animate ? state.entered : NO_SLOTS,
    animate: state.animate,
  };
}
