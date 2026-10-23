'use client';

import { useSyncExternalStore } from 'react';
import { morphProgressOf, type RowMorph } from '@/lib/hooks/useRowMorph';
import { easeOutQuart } from '@/lib/utils/rowMorph';

interface MorphFigureProps {
  morph: RowMorph;
  slot: string;
  /** The figure's name in the row's `figures` («amount», «percentage»). */
  name: string;
  /** The landed figure: what the row says once the count is over, and what is always READ. */
  value: number;
  format: (value: number) => string;
}

/**
 * One counting figure of a ranked row (`useRowMorph`): the leaf a frame of the count re-renders,
 * alone. While it moves the painted text is `aria-hidden` and the landed one `sr-only` — the frame is
 * not a measurement (DESIGN.md → The View-Transforms Rule).
 */
export function MorphFigure({ morph, slot, name, value, format }: MorphFigureProps) {
  const { store, generation } = morph;
  const progress = useSyncExternalStore(
    store.subscribe,
    () => morphProgressOf(store, generation),
    () => 1,
  );
  const origin = morph.from?.get(slot)?.[name];
  const frame = origin === undefined || progress >= 1 ? value : origin + (value - origin) * easeOutQuart(progress);
  const landed = format(value);
  const shown = format(frame);
  if (shown === landed) return <>{landed}</>;
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{landed}</span>
    </>
  );
}
