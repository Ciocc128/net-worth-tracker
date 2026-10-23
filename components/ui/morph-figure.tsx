'use client';

import { useEffect, useRef } from 'react';
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

function frameOf(origin: number | undefined, value: number, progress: number): number {
  return origin === undefined || progress >= 1 ? value : origin + (value - origin) * easeOutQuart(progress);
}

/**
 * One counting figure of a ranked row (`useRowMorph`). A frame of the count writes this span's text
 * node and nothing else: no React render, no commit (measured 2026-10-23: a render per frame, even
 * of these leaves alone, kept ~40 commits per Esposizione switch, `perf:census` › `view`). React
 * renders the figure on the switch and when the count lands. While it moves the painted text is
 * `aria-hidden` and the landed one `sr-only` — the frame is not a measurement (DESIGN.md → The
 * View-Transforms Rule).
 */
export function MorphFigure({ morph, slot, name, value, format }: MorphFigureProps) {
  const { store, generation } = morph;
  const origin = morph.from?.get(slot)?.[name];
  const painted = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (origin === undefined) return;
    const paint = () => {
      const text = painted.current?.firstChild;
      if (text) text.nodeValue = format(frameOf(origin, value, morphProgressOf(store, generation)));
    };
    paint();
    return store.subscribe(paint);
  }, [origin, value, format, store, generation]);

  const landed = format(value);
  if (origin === undefined) return <>{landed}</>;
  return (
    <>
      <span ref={painted} aria-hidden="true">{format(origin)}</span>
      <span className="sr-only">{landed}</span>
    </>
  );
}
