'use client';

/**
 * A wizard step that says which way the reader went (AN3 H, doc/animazioni/README.md § 5.10): going on, the
 * old step leaves toward −24 px (160 ms ease-in) and the new one enters from +24 px (240 ms ease-out-quart);
 * going back, the other way round. The body's height follows in 260 ms on `--ease-spring`, measured in px
 * with a `ResizeObserver` and put on a CSS transition — never Framer's `layout` on the body, which distorts
 * the content. The height only transitions across a step change, so a row added inside a step does not lag,
 * and the box is clipped only while that transition runs (a focus ring is not cut the rest of the time).
 *
 * `index` is the step's position (a bigger one is «avanti»). Focus is the dialog's: the slide moves
 * nothing. Reduced motion: no transform, no durations, no height transition.
 */

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const DISTANCE = 24;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
const HEIGHT_MS = 260;

/** −1 going back, +1 going on. */
type Direction = -1 | 1;

const variants: Variants = {
  enter: (direction: Direction) => ({ opacity: 0, x: direction * DISTANCE }),
  center: { opacity: 1, x: 0, transition: { duration: 0.24, ease: EASE_OUT_QUART } },
  exit: (direction: Direction) => ({ opacity: 0, x: -direction * DISTANCE, transition: { duration: 0.16, ease: 'easeIn' } }),
};

const INSTANT: Variants = {
  enter: { opacity: 1, x: 0 },
  center: { opacity: 1, x: 0, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

interface StepSlideProps {
  stepKey: string;
  index: number;
  children: ReactNode;
}

export function StepSlide({ stepKey, index, children }: StepSlideProps) {
  const reducedMotion = useReducedMotion();
  const [current, setCurrent] = useState<{ key: string; index: number; direction: Direction }>({ key: stepKey, index, direction: 1 });
  const [height, setHeight] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);

  if (current.key !== stepKey) {
    setCurrent({ key: stepKey, index, direction: index >= current.index ? 1 : -1 });
    if (!reducedMotion) setAnimating(true);
  }

  useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The clip and the transition end a little after the height has settled: the enter (240) follows the exit (160).
  useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => setAnimating(false), 160 + 240 + 60);
    return () => window.clearTimeout(timer);
  }, [animating, current.key]);

  return (
    <div
      style={{
        height: animating && height !== null ? height : undefined,
        overflow: animating ? 'hidden' : undefined,
        transition: animating ? `height ${HEIGHT_MS}ms var(--ease-spring)` : undefined,
      }}
    >
      <div ref={innerRef}>
        <AnimatePresence mode="wait" initial={false} custom={current.direction}>
          <motion.div
            key={stepKey}
            custom={current.direction}
            variants={reducedMotion ? INSTANT : variants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
