'use client';

/**
 * A figure that TRANSFORMS when its period, view or data changes (AN2, doc/animazioni/README.md
 * § 5.6–5.7; DESIGN.md → The Period-Transforms Rule): it lands on its first value and glides from
 * the one it showed to every next one, 620 ms ease-out-quart. A leaf, so a frame of the glide
 * re-renders this span and nothing around it (DESIGN.md → count-up isolation).
 *
 * The frame is not a measurement: while it runs the printed text is hidden from the screen reader
 * and the landed figure is read instead; a caller that colours by sign colours by the LANDED value.
 *
 * `FigureMemory` lets a figure glide across an UNMOUNT: Tracciamento's tiles wait as a skeleton
 * while a new period is read (the rows of the wrong months never sit under the new period,
 * lib/hooks/useExpenses.ts), and when they come back each figure counts from the one its slot
 * showed before — `memoryKey` names the slot. Without a provider (or a key) the figure lands.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useCountUp } from '@/lib/utils/useCountUp';

/** The glide of a figure that changes window (§ 6: «Cifre che contano», 620 ms). */
export const FIGURE_GLIDE_MS = 620;

const FigureMemoryContext = createContext<Map<string, number> | null>(null);

/** Remembers the last figure each slot landed on, for the figures mounted inside it. */
export function FigureMemory({ children }: { children: ReactNode }) {
  // One map for the provider's life: written after a figure lands, read when one mounts again.
  const [memory] = useState(() => new Map<string, number>());
  return <FigureMemoryContext.Provider value={memory}>{children}</FigureMemoryContext.Provider>;
}

/**
 * The value to print in this frame. Called unconditionally, before any early return (AGENTS.md
 * § Motion); null stays null.
 */
export function useSettledFigure(value: number | null, memoryKey?: string, duration = FIGURE_GLIDE_MS): number | null {
  const memory = useContext(FigureMemoryContext);
  // Read once, when the figure mounts: later values glide from the one on screen.
  const [seed] = useState(() => (memory && memoryKey ? (memory.get(memoryKey) ?? null) : null));
  const animated = useCountUp(value, { fromPrevious: true, landFirstValue: true, duration, startDelay: 0, seed });

  useEffect(() => {
    if (memory && memoryKey && value !== null) memory.set(memoryKey, value);
  }, [memory, memoryKey, value]);

  return value === null ? null : (animated ?? value);
}

interface SettledFigureProps {
  value: number;
  /** How a number prints: the frame and the landed figure go through the same formatter. */
  format: (value: number) => string;
  /** The slot in the page's `FigureMemory`, when the figure can be unmounted and come back. */
  memoryKey?: string;
  className?: string;
}

/** A printed figure that glides; see the module comment. */
export function SettledFigure({ value, format, memoryKey, className }: SettledFigureProps) {
  const frame = useSettledFigure(value, memoryKey) ?? value;
  const landed = format(value);
  const shown = format(frame);
  // `data-figure` names the slot for a probe (e2e/motion.transform.analisi.spec.ts).
  if (shown === landed) return <span className={className} data-figure={memoryKey}>{landed}</span>;
  return (
    <span className={className} data-figure={memoryKey}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{landed}</span>
    </span>
  );
}
