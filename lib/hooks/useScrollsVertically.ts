'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Whether a box scrolls vertically RIGHT NOW (its content is taller than the box), measured on mount
 * and on every resize of the box or of its content. A region that scrolls must be reachable by
 * keyboard and named, but only while it does — a list that fits is not a landmark (RU7, D-RU16:
 * Conti and Operazioni del mese scroll inside their cell only when the row's height cuts them).
 * `watch` re-measures when the content changes without the box resizing (a row added or removed).
 */
export function useScrollsVertically<T extends HTMLElement>(watch: unknown) {
  const ref = useRef<T | null>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [watch]);

  return [ref, scrolls] as const;
}
