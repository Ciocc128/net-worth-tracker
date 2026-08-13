/**
 * Token-driven presentation metadata for goal verdicts and priorities (A5).
 *
 * Replaces the old raw `text-red-600 / bg-amber-50 / text-emerald-400` classes that
 * diverged from the theme's `--destructive` / `--positive` / `--chart-*` on the 6 custom
 * themes. Everything here routes through semantic tokens so it holds across themes and modes.
 */

import { GoalVerdict } from '@/lib/utils/goalTrajectory';
import { GoalPriority } from '@/types/goals';

export interface VerdictMeta {
  label: string;
  /** Tailwind classes for a chip (text + tinted bg), all token-based. */
  chipClass: string;
}

export const VERDICT_META: Record<GoalVerdict, VerdictMeta> = {
  reached: { label: 'Raggiunto', chipClass: 'text-positive bg-positive/10' },
  onTrack: { label: 'In linea', chipClass: 'text-positive bg-positive/10' },
  offTrack: { label: 'In ritardo', chipClass: 'text-destructive bg-destructive/10' },
  noDeadline: { label: 'Senza scadenza', chipClass: 'text-muted-foreground bg-muted' },
  noTarget: { label: 'Aperto', chipClass: 'text-muted-foreground bg-muted' },
};

interface PriorityMeta {
  label: string;
  /** Inline style + classes — amber uses --chart-3 (no semantic token for "medium"). */
  chipClass: string;
}

export const PRIORITY_META: Record<GoalPriority, PriorityMeta> = {
  alta: { label: 'Alta', chipClass: 'text-destructive bg-destructive/10' },
  // The semantic amber PAIR, not a chart slot tinted with itself: --warning is the surface
  // and --warning-foreground its text arm, and they are designed to clear 4.5:1 together
  // (6.72 light / 9.94 dark). A chart slot tinted at 10% behind its own hue does not.
  media: { label: 'Media', chipClass: 'text-warning-foreground bg-warning' },
  bassa: { label: 'Bassa', chipClass: 'text-positive bg-positive/10' },
};

/** "tra 14 mesi" / "tra 1 anno e 2 mesi" / "scaduto" — compact deadline phrasing. */
export function formatMonthsToDeadline(months: number | null): string | null {
  if (months == null) return null;
  if (months <= 0) return 'scaduto';
  if (months < 12) return `tra ${months} ${months === 1 ? 'mese' : 'mesi'}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const yPart = `${years} ${years === 1 ? 'anno' : 'anni'}`;
  if (rem === 0) return `tra ${yPart}`;
  return `tra ${yPart} e ${rem} ${rem === 1 ? 'mese' : 'mesi'}`;
}

/** "giu 2029" style short month+year for projected/target dates. */
export function formatShortMonthYear(date: Date): string {
  return date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
}
