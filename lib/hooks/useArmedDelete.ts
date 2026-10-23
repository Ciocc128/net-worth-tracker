'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { closeRow, reopenRow } from '@/lib/utils/rowTransition';

/**
 * How many confirms are armed right now, across the whole tree.
 *
 * A modal reads it in `onEscapeKeyDown` to decide whether Escape means «disarm» or «close»
 * (see `ResponsiveModal`). It cannot be done from inside this hook: Radix's dismiss layer
 * registers its own document listener when the dialog MOUNTS, so it always runs before one
 * added later at arm time — capture phase included — and `stopPropagation` never reaches it.
 * Radix's own `onEscapeKeyDown` + `preventDefault` is the supported way to refuse a dismissal,
 * and that lives on the modal, not on the button.
 */
let armedConfirmCount = 0;

const REOPEN_AFTER_SETTLE_MS = 800;
const REOPEN_WITHOUT_PROMISE_MS = 5000;

/** True while any two-click confirm is armed: Escape then means «disarm», not «close». */
export function hasArmedConfirm(): boolean {
  return armedConfirmCount > 0;
}

/**
 * Two-click delete without a timer (AGENTS.md → Accessibility): the first click arms, the
 * second deletes; a pointerdown anywhere else, Escape or blur disarms. Disarm happens before
 * delegating, because on success the row unmounts and nothing else would reset it. The
 * button's ref is an argument, never part of the returned object — a ref inside the return
 * value trips `react-hooks/refs` on every read of that object during render.
 *
 * AN3 G (doc/animazioni/README.md § 5.9): the confirm also CLOSES the row — the nearest `[data-row]`
 * around the button fades and collapses in 220 ms while the write starts — and reopens it if the row is
 * still there once the write has settled (a handler that returns its promise: 800 ms after it settles, for
 * a refetch that is about to remove the row; a handler that returns nothing: after 5 s). The marker is put
 * on the DOM, not in state: the close costs no render, and a row that unmounts takes it along.
 */
export function useArmedDelete(ref: RefObject<HTMLButtonElement | null>, onDelete: () => void | Promise<unknown>) {
  const [armed, setArmed] = useState(false);
  const reopenTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (reopenTimer.current !== null) window.clearTimeout(reopenTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!armed) return;
    armedConfirmCount += 1;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setArmed(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      armedConfirmCount = Math.max(0, armedConfirmCount - 1);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [armed, ref]);

  const onClick = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    const row = ref.current?.closest<HTMLElement>('[data-row]') ?? null;
    if (row) closeRow(row);
    const reopen = (afterMs: number) => {
      if (reopenTimer.current !== null) window.clearTimeout(reopenTimer.current);
      reopenTimer.current = window.setTimeout(() => {
        if (row?.isConnected) reopenRow(row);
      }, afterMs);
    };
    const result = onDelete();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      void (result as Promise<unknown>).then(() => reopen(REOPEN_AFTER_SETTLE_MS), () => reopen(0));
    } else {
      reopen(REOPEN_WITHOUT_PROMISE_MS);
    }
  };

  return { armed, onClick, onBlur: () => setArmed(false) };
}
