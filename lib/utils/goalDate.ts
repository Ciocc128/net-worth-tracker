/**
 * The calendar month of a goal's deadline — a pure module so the FIRE flows can read it without the Firestore-coupled summary.
 */

/** A calendar month: the grain of a deadline and of a projected arrival. `month` is 1-12. */
export interface GoalDate {
  year: number;
  month: number;
}

/** The year and the month of an ISO date string, read as typed — never through a timezone. */
export function goalDateFromIso(iso: string): GoalDate | null {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}
