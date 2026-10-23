/**
 * Rows that leave and arrive (AN3 G, doc/animazioni/README.md § 5.9). Pure helpers, no React: the hooks
 * (`useArmedDelete`, `useAddedRows`) call them, the CSS lives in globals.css → «Rows that leave and arrive».
 */

/** The most rows one render may add and still be a reader's own add (a period switch or a refetch is not). */
export const MAX_ADDED_ROWS = 2;

/**
 * The ids a list GAINED since the previous render, or an empty set when the change is not an add: the
 * list was empty before (the first read), it lost a row, or more than `MAX_ADDED_ROWS` rows arrived (another
 * period, another account, a refetch). Only a pure addition is a row the reader just created.
 */
export function findAddedIds(previous: readonly string[], next: readonly string[]): Set<string> {
  if (previous.length === 0) return new Set();
  const before = new Set(previous);
  const after = new Set(next);
  for (const id of before) if (!after.has(id)) return new Set();
  const added = next.filter((id) => !before.has(id));
  return added.length > 0 && added.length <= MAX_ADDED_ROWS ? new Set(added) : new Set();
}

/** Puts the row in its «in uscita» state: it measures itself so a block row collapses from its real height. */
export function closeRow(row: HTMLElement): void {
  row.style.setProperty('--row-height', `${row.offsetHeight}px`);
  row.dataset.rowExiting = '';
}

/** The write failed (or the row is still there once it settled): the row comes back. */
export function reopenRow(row: HTMLElement): void {
  delete row.dataset.rowExiting;
  row.style.removeProperty('--row-height');
}
