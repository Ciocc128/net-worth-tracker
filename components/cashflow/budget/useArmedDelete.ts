'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Two-click delete without a timer (AGENTS.md → Accessibility): the first click arms, the
 * second deletes; a pointerdown anywhere else, Escape or blur disarms. Disarm happens before
 * delegating, because on success the row unmounts and nothing else would reset it. The
 * button's ref is an argument, never part of the returned object — a ref inside the return
 * value trips `react-hooks/refs` on every read of that object during render.
 */
export function useArmedDelete(ref: RefObject<HTMLButtonElement | null>, onDelete: () => void) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setArmed(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
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
    onDelete();
  };

  return { armed, onClick, onBlur: () => setArmed(false) };
}
