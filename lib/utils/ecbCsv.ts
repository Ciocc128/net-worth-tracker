/**
 * Pure parser of the ECB Data API CSV (`format=csvdata`): the last observation of a series (RQ9, Q3).
 * Kept apart from the network call so it is tested on the CSVs the research archived.
 */

export interface EcbObservation {
  /** `TIME_PERIOD` as the ECB writes it: `2026-10-08` (daily) or `2026-Q3` (quarterly). */
  period: string;
  value: number;
}

/** One CSV line into its fields; a field may be quoted and carry commas (`TITLE_COMPL` does). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * The observation with the latest `TIME_PERIOD` of a csvdata body (ISO dates and `YYYY-Qn` both sort as text).
 * Null when the header lacks the two columns or no row carries a finite value.
 */
export function parseEcbLastObservation(csv: string): EcbObservation | null {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  const header = splitCsvLine(lines[0]);
  const periodIndex = header.indexOf('TIME_PERIOD');
  const valueIndex = header.indexOf('OBS_VALUE');
  if (periodIndex < 0 || valueIndex < 0) return null;

  let last: EcbObservation | null = null;
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const period = fields[periodIndex];
    const raw = fields[valueIndex];
    if (!period || raw === undefined || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (!last || period > last.period) last = { period, value };
  }
  return last;
}
