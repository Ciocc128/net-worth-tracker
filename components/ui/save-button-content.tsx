import type { ReactNode } from 'react';
import { AnimatedCheckIcon } from '@/components/ui/AnimatedCheckIcon';

/** The button's face for 1200 ms after a successful save (AN3 I): green, the tick draws itself. */
export const SAVED_BUTTON_CLASS = 'bg-positive text-background hover:bg-positive';

interface SaveButtonContentProps {
  saving: boolean;
  saved: boolean;
  idle: string;
  icon?: ReactNode;
}

/**
 * The inside of a «Salva» button: «Salvataggio…» while the write runs, `AnimatedCheckIcon` + «Salvato» right
 * after it (pair it with `SAVED_BUTTON_CLASS`), else the idle label. No `aria-live`: the toast is the one
 * announcement.
 */
export function SaveButtonContent({ saving, saved, idle, icon }: SaveButtonContentProps) {
  if (saving) return <>{icon}Salvataggio…</>;
  if (saved) {
    return (
      <>
        <AnimatedCheckIcon className="size-4" />
        Salvato
      </>
    );
  }
  return (
    <>
      {icon}
      {idle}
    </>
  );
}
