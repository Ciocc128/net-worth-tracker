'use client';

/**
 * A drill level that says which way the reader went (AN2, doc/animazioni/README.md § 5.5): going
 * deeper the old level leaves to the left and the new one enters from the right, coming back up
 * the opposite way — 160 ms out (ease-in), 220 ms in (ease-out-quart), 30 px. A level at the SAME
 * depth (another category opened from the page) only cross-fades: there is no direction to tell.
 *
 * `levelKey` names the level (a new key is a new level), `depth` its distance from the root. The
 * direction is read on the render that brings the new key (adjust-state-during-render) and handed
 * to the leaving node through `custom`, so the two halves always agree. Focus is the page's: the
 * slide moves nothing. Reduced motion: the root `MotionConfig` drops the transform and the
 * durations go to zero here, so the level swaps at once.
 */

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useState, type ReactNode } from 'react';

const DISTANCE = 30;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

/** −1 coming back up, 0 at the same depth, +1 going down. */
type Direction = -1 | 0 | 1;

const variants: Variants = {
  enter: (direction: Direction) => ({ opacity: 0, x: direction * DISTANCE }),
  center: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE_OUT_QUART } },
  exit: (direction: Direction) => ({ opacity: 0, x: -direction * DISTANCE, transition: { duration: 0.16, ease: 'easeIn' } }),
};

const INSTANT: Variants = {
  enter: { opacity: 1, x: 0 },
  center: { opacity: 1, x: 0, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

interface DrillSlideProps {
  levelKey: string;
  depth: number;
  children: ReactNode;
  className?: string;
}

export function DrillSlide({ levelKey, depth, children, className }: DrillSlideProps) {
  const reducedMotion = useReducedMotion();
  const [level, setLevel] = useState<{ key: string; depth: number; direction: Direction }>({ key: levelKey, depth, direction: 0 });
  if (level.key !== levelKey) {
    setLevel({ key: levelKey, depth, direction: depth > level.depth ? 1 : depth < level.depth ? -1 : 0 });
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={level.direction}>
      <motion.div
        key={levelKey}
        custom={level.direction}
        variants={reducedMotion ? INSTANT : variants}
        initial="enter"
        animate="center"
        exit="exit"
        className={className}
        data-drill-depth={depth}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
