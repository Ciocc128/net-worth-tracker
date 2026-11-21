'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';

/**
 * The two slots of the shell's band (`ShellBand`, doc/fascia-desktop/README.md D-FD15) and the portals `PageHeader`
 * renders into them. Apart from the band on purpose: `PageHeader` is on the landing too, and this module carries no
 * motion, no menu and no auth, so the landing's bundle does not take the band's.
 */
type Slots = { fact: HTMLElement | null; actions: HTMLElement | null };
type SlotName = keyof Slots;
export const ShellBandContext = createContext<{ slots: Slots; setSlot: (name: SlotName, el: HTMLElement | null) => void } | null>(null);

/** Holds the band's two slots for the page under it. Wraps the band and `<main>` in the dashboard layout. */
export function ShellBandProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<Slots>({ fact: null, actions: null });
  // Stable, and a no-op when the node is the one already held: the band's ref callbacks call it on every commit.
  const setSlot = useCallback(
    (name: SlotName, el: HTMLElement | null) => setSlots((prev) => (prev[name] === el ? prev : { ...prev, [name]: el })),
    [],
  );
  const value = useMemo(() => ({ slots, setSlot }), [slots, setSlot]);
  return <ShellBandContext.Provider value={value}>{children}</ShellBandContext.Provider>;
}

/**
 * Renders the page's fact and actions into the band (null outside the shell, e.g. the landing). Each page's content
 * is keyed by its path, so it fades in with the page (`.shell-band-in`) instead of popping.
 */
export function ShellBandPortals({ fact, actions }: { fact: React.ReactNode; actions: React.ReactNode }) {
  const context = useContext(ShellBandContext);
  const pathname = usePathname() ?? '';
  if (!context) return null;
  const { slots } = context;
  return (
    <>
      {slots.fact && createPortal(<span key={pathname} className="shell-band-in block truncate">{fact}</span>, slots.fact)}
      {slots.actions && actions && createPortal(<div key={pathname} className="shell-band-in flex items-center gap-2">{actions}</div>, slots.actions)}
    </>
  );
}

/** Whether a page is inside the shell's band (the hook a page's header asks before portaling). */
export function useInShellBand(): boolean {
  return useContext(ShellBandContext) !== null;
}

