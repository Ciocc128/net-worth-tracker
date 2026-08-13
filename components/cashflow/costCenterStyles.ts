/**
 * Typographic levels shared by the two Centri di Costo views.
 *
 * They live here rather than in either component because a chapter title that means one size on
 * the Panoramica and another on the Detail is not a hierarchy, it is a coincidence — and the two
 * files had drifted exactly that way (text-lg on one, text-xl on the other, text-sm font-semibold
 * for the sections beneath both, none of which are steps on the DESIGN.md ramp).
 *
 * CHAPTER_TITLE_CLASS is deliberately a level of its own rather than a second eyebrow: with the
 * same 10px eyebrow on both containment levels the structure exists only in the heading tree,
 * where nobody but a screen reader can see it. Same reasoning, same values as PensionOverview.
 */

/** Small all-caps label naming the number below it. Never competes with the number. */
export const EYEBROW_CLASS =
  'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

/** Chapter heading — the level between the eyebrow and a page hero. */
export const CHAPTER_TITLE_CLASS =
  'text-[15px] font-semibold tracking-[-0.01em] text-foreground';

/**
 * Recharts renders axis ticks and legends in the ambient sans by default. The Mono Mandate names
 * chart axis labels explicitly, so every axis on this surface passes this instead.
 */
export const CHART_TICK_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-geist-mono)',
  fill: 'var(--muted-foreground)',
} as const;
