import { Timestamp } from 'firebase/firestore';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

// Target timezone for Italian investors
export const ITALY_TIMEZONE = 'Europe/Rome';

/**
 * Convert Firestore Timestamp or Date to Date object
 * Handles edge cases and provides type safety
 */
export function toDate(date: Date | Timestamp | string | undefined | null): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (typeof date === 'string') return new Date(date);
  if (typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
    return date.toDate();
  }
  console.warn('Unable to convert date:', date);
  return new Date();
}

/**
 * Get date converted to Italy timezone (Europe/Rome)
 * Ensures consistent month/year extraction across client and server
 */
export function getItalyDate(date: Date | Timestamp | string | undefined | null = new Date()): Date {
  const dateObj = toDate(date);
  return toZonedTime(dateObj, ITALY_TIMEZONE);
}

/**
 * Extract month (1-12) from date in Italy timezone
 * Use this instead of date.getMonth() to ensure consistent behavior
 */
export function getItalyMonth(date: Date | Timestamp | string | undefined | null = new Date()): number {
  const italyDate = getItalyDate(date);
  return italyDate.getMonth() + 1; // Returns 1-12
}

/**
 * Extract year from date in Italy timezone
 * Use this instead of date.getFullYear() to ensure consistent behavior
 */
export function getItalyYear(date: Date | Timestamp | string | undefined | null = new Date()): number {
  const italyDate = getItalyDate(date);
  return italyDate.getFullYear();
}

/**
 * Extract both month and year from date in Italy timezone
 * Efficient helper for cases where both values are needed
 */
export function getItalyMonthYear(date: Date | Timestamp | string | undefined | null = new Date()): { month: number; year: number } {
  const italyDate = getItalyDate(date);
  return {
    month: italyDate.getMonth() + 1,
    year: italyDate.getFullYear()
  };
}

/**
 * Format Date or Timestamp to Italian locale (DD/MM/YYYY)
 */
export function formatItalianDate(date: Date | Timestamp | string): string {
  const dateObj = toDate(date);
  return new Intl.DateTimeFormat('it-IT').format(dateObj);
}

/**
 * Returns the UTC instants for the start and end of a calendar day in Italy time.
 *
 * Why: server-side jobs (e.g. the daily dividend cron) run on UTC infrastructure,
 * where `new Date().setHours(0,0,0,0)` yields UTC midnight, not Italian midnight.
 * Payment dates entered by Italian users are conceptually "Italian days", so a
 * UTC window misclassifies a coupon dated "10/06 in Italy" (stored as
 * 2026-06-09T22:00:00Z in summer) — it falls outside the UTC 10/06 window.
 * Building the window from the Italian wall-clock day fixes that boundary.
 *
 * @param date - Any instant within the target day (defaults to now)
 * @returns { start, end } as UTC Date objects spanning the Italian day inclusively
 */
export function getItalyDayBoundsUtc(date: Date = new Date()): { start: Date; end: Date } {
  // Read the Italian wall-clock calendar day for the given instant
  const italyNow = toZonedTime(date, ITALY_TIMEZONE);
  const year = italyNow.getFullYear();
  const month = String(italyNow.getMonth() + 1).padStart(2, '0');
  const day = String(italyNow.getDate()).padStart(2, '0');

  // Interpret these wall-clock strings as Italian local time, convert back to UTC
  const start = fromZonedTime(`${year}-${month}-${day}T00:00:00.000`, ITALY_TIMEZONE);
  const end = fromZonedTime(`${year}-${month}-${day}T23:59:59.999`, ITALY_TIMEZONE);
  return { start, end };
}

/**
 * Compare two dates (ignoring time)
 * Returns true if date1 >= date2
 */
export function isDateOnOrAfter(date1: Date | Timestamp, date2: Date | Timestamp): boolean {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return d1 >= d2;
}
