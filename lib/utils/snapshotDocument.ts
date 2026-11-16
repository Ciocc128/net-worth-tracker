/**
 * The ONE builder of a monthly snapshot document, and its readers — doc/snapshot-integri/README.md
 * § 5.1–5.2 (RI1–RI4), § 5.6 (RI14), § 5.8.
 *
 * Five writers used to assemble the document each in its own way (the cron and «Crea snapshot», the
 * manual dialog, the note of Storico, the test-data generator): two shapes, a `createdAt` rewritten
 * at every write, nothing saying who wrote what. Every writer now builds through
 * `buildSnapshotDocument`, which stamps who wrote it (`writtenBy`, `writtenByUid`), keeps the first
 * write's `createdAt` and stamps `updatedAt`.
 *
 * Pure and SDK-free on purpose: the two server routes (Admin SDK) and the client-side generator
 * (client SDK) import it. A stored timestamp is read by duck typing (`toDate()`), never by
 * `instanceof Timestamp`.
 */

import type {
  MonthlySnapshot,
  SnapshotPriceRecord,
  SnapshotPreviousVersion,
  SnapshotWriter,
} from '@/types/assets';
import { preserveUserAuthoredSnapshotFields } from '@/lib/utils/snapshotUserFields';
import { MONTH_NAMES } from '@/lib/constants/months';
import { formatSignedPercentIt } from '@/lib/utils/formatters';
import { hasMarketPrice } from '@/lib/utils/assetPricing';

const ITALY_TIMEZONE = 'Europe/Rome';

/** A price older than this before the capture instant is a warning (RI14), and older than this is no baseline (RI12). */
export const SNAPSHOT_PRICE_STALE_DAYS = 7;
/** The jump that flags a price (RI12, D-SN5): written anyway, recorded. */
export const SNAPSHOT_PRICE_JUMP_PCT = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The figures a writer measured or declared. `fireNetWorth` and `pension` only when measured. */
export interface SnapshotFigures {
  userId: string;
  year: number;
  month: number;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  byAssetClass: Record<string, number>;
  byAsset: MonthlySnapshot['byAsset'];
  fireNetWorth?: number;
  pension?: MonthlySnapshot['pension'];
}

export interface BuildSnapshotInput {
  figures: SnapshotFigures;
  writtenBy: SnapshotWriter;
  /** The token's uid; absent for the cron. */
  writtenByUid?: string;
  now: Date;
  /** The price record of an automatic write; the manual writer has none (declared, not priced). */
  prices?: SnapshotPriceRecord;
  /** The document stored today, as read (`data()`), or undefined. */
  existing?: Record<string, unknown>;
  /** A replacement by hand points at the version it just archived (RI9); otherwise the existing pointer rides. */
  previous?: SnapshotPreviousVersion;
  /** Test data only. */
  isDummy?: boolean;
}

/**
 * What is written. `createdAt` is the existing document's own value (a stored Timestamp, carried
 * as is) or `now`; every other date is a `Date`, which both SDKs store as a Timestamp.
 */
export type SnapshotDocument = Omit<MonthlySnapshot, 'createdAt'> & { createdAt: unknown };

/** «Percentages are never taken from a request»: derived from the classes and the total (F02, RS7). */
export function buildAllocationPercentages(
  byAssetClass: Record<string, number>,
  totalNetWorth: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const assetClass of Object.keys(byAssetClass)) {
    result[assetClass] = totalNetWorth > 0 ? (byAssetClass[assetClass] / totalNetWorth) * 100 : 0;
  }
  return result;
}

/**
 * True when a stored document carries figures. A legacy note-only document (`{ note, userId }`,
 * written by the old note writer on a month without a snapshot) is not «a snapshot»: a write
 * completes it, it does not replace it.
 */
export function snapshotHasFigures(data: Record<string, unknown> | undefined): boolean {
  return !!data && typeof data.totalNetWorth === 'number' && Number.isFinite(data.totalNetWorth);
}

/** Drop every `undefined`, deep in plain objects and arrays: Firestore refuses it. */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (inner !== undefined) out[key] = withoutUndefined(inner);
    }
    return out as T;
  }
  return value;
}

/**
 * RI1 — the whole document, for every writer.
 *
 * - `createdAt` = the existing document's when it has figures, else `now` (RI3); `updatedAt` = `now`.
 * - `assetAllocation` derived from `byAssetClass` and the total, never received.
 * - The user-authored fields (`note`) and the `previous` pointer of the existing document ride across.
 * - No key is `undefined`.
 */
export function buildSnapshotDocument(input: BuildSnapshotInput): SnapshotDocument {
  const { figures, writtenBy, writtenByUid, now, prices, existing, previous, isDummy } = input;
  const hasExisting = snapshotHasFigures(existing);
  const createdAt = hasExisting && existing?.createdAt ? existing.createdAt : now;
  const carriedPrevious = previous ?? (hasExisting ? (existing?.previous as SnapshotPreviousVersion | undefined) : undefined);

  const document: SnapshotDocument = {
    userId: figures.userId,
    year: figures.year,
    month: figures.month,
    ...(isDummy ? { isDummy: true } : {}),
    totalNetWorth: figures.totalNetWorth,
    liquidNetWorth: figures.liquidNetWorth,
    illiquidNetWorth: figures.illiquidNetWorth,
    ...(figures.fireNetWorth !== undefined ? { fireNetWorth: figures.fireNetWorth } : {}),
    byAssetClass: figures.byAssetClass,
    byAsset: figures.byAsset,
    ...(figures.pension !== undefined ? { pension: figures.pension } : {}),
    assetAllocation: buildAllocationPercentages(figures.byAssetClass, figures.totalNetWorth),
    createdAt,
    updatedAt: now,
    writtenBy,
    ...(writtenByUid ? { writtenByUid } : {}),
    ...(prices ? { prices } : {}),
    ...(carriedPrevious ? { previous: carriedPrevious } : {}),
  };

  return withoutUndefined(preserveUserAuthoredSnapshotFields(document, existing));
}

// ─── Reading ──────────────────────────────────────────────────────────────────

/** A stored instant as a Date: a Date, a Timestamp (`toDate()`), an ISO string; else null. */
export function readInstant(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (raw && typeof (raw as { toDate?: unknown }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * A stored document as the app reads it: `createdAt` a Date (today's fallback `new Date()` for a
 * document without one, as every reader did), `updatedAt` a Date or absent. The other fields as stored.
 */
export function snapshotFromData(data: Record<string, unknown>): MonthlySnapshot {
  const updatedAt = readInstant(data.updatedAt);
  const { updatedAt: _ignored, ...rest } = data;
  void _ignored;
  return {
    ...rest,
    createdAt: readInstant(data.createdAt) ?? new Date(),
    ...(updatedAt ? { updatedAt } : {}),
  } as MonthlySnapshot;
}

/**
 * RI4 — THE capture instant of a snapshot: the last write of its figures (`updatedAt`), else
 * `createdAt` (a document written before 2026-11). After RI3 `createdAt` of the running month is
 * its FIRST evening: reading it directly would stop the month on day 1.
 */
export function snapshotCapturedAt(snapshot: Pick<MonthlySnapshot, 'createdAt'> & { updatedAt?: unknown }): Date | null {
  return readInstant(snapshot.updatedAt) ?? readInstant(snapshot.createdAt);
}

// ─── Words (§ 5.8) ────────────────────────────────────────────────────────────

const dayMonthFormat = new Intl.DateTimeFormat('it-IT', { timeZone: ITALY_TIMEZONE, day: 'numeric', month: 'long' });
const dayMonthYearFormat = new Intl.DateTimeFormat('it-IT', { timeZone: ITALY_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('it-IT', { timeZone: ITALY_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const italyYearFormat = new Intl.DateTimeFormat('en-US', { timeZone: ITALY_TIMEZONE, year: 'numeric' });

/** «31 ottobre», with the year when it is not `contextYear`'s. Italian day. */
export function formatSnapshotDay(instant: Date, contextYear?: number): string {
  const year = Number(italyYearFormat.format(instant));
  return contextYear === undefined || year === contextYear ? dayMonthFormat.format(instant) : dayMonthYearFormat.format(instant);
}

/** «19:02», Italian time. */
export function formatSnapshotTime(instant: Date): string {
  return timeFormat.format(instant);
}

/** «ottobre 2026». */
export function formatSnapshotMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1].toLowerCase()} ${year}`;
}

function writerPhrase(writtenBy: SnapshotWriter): string {
  switch (writtenBy) {
    case 'cron': return "dall'aggiornamento automatico";
    case 'button': return 'con «Crea snapshot»';
    case 'manual': return 'a mano';
    case 'dummy': return 'dal generatore di dati di prova';
  }
}

/** «scritto dall'aggiornamento automatico il 31 ottobre alle 19:02» — lower case, no full stop. */
function describeWrite(writtenBy: SnapshotWriter, instant: Date | null, contextYear: number): string {
  const verb = writtenBy === 'manual' ? 'inserito' : 'scritto';
  const when = instant ? ` il ${formatSnapshotDay(instant, contextYear)} alle ${formatSnapshotTime(instant)}` : '';
  return `${verb} ${writerPhrase(writtenBy)}${when}`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Storico › Valore per strumento, the footer: «Scritto dall'aggiornamento automatico il 31 ottobre
 * alle 19:02.» · «Scritto con «Crea snapshot» il 31 ottobre alle 23:20.» · «Inserito a mano il 3
 * novembre alle 10:15.» A document written before 2026-11 has no `writtenBy`: null, no footer.
 */
export function describeSnapshotAuthorship(snapshot: MonthlySnapshot): string | null {
  if (!snapshot.writtenBy) return null;
  return `${capitalize(describeWrite(snapshot.writtenBy, snapshotCapturedAt(snapshot), snapshot.year))}.`;
}

/**
 * The manual dialog, when the chosen month already has a snapshot (§ 5.8): «Ottobre 2026 ha già uno
 * snapshot, scritto dall'aggiornamento automatico il 31 ottobre alle 19:02. Se lo sostituisci,
 * quella versione resta recuperabile da qui.»
 */
export function describeExistingSnapshot(
  year: number,
  month: number,
  existing: { writtenBy?: SnapshotWriter; updatedAt?: unknown; createdAt?: unknown }
): string {
  const head = `${capitalize(formatSnapshotMonth(year, month))} ha già uno snapshot`;
  const who = existing.writtenBy
    ? `, ${describeWrite(existing.writtenBy, readInstant(existing.updatedAt) ?? readInstant(existing.createdAt), year)}`
    : '';
  return `${head}${who}. Se lo sostituisci, quella versione resta recuperabile da qui.`;
}

/** «Versione precedente: 31 ottobre, 19:02.» — the version's own last write, else when it was archived. */
export function describePreviousVersion(previous: SnapshotPreviousVersion, contextYear: number): string {
  const instant = readInstant(previous.updatedAt) ?? readInstant(previous.archivedAt);
  if (!instant) return 'Versione precedente disponibile.';
  return `Versione precedente: ${formatSnapshotDay(instant, contextYear)}, ${formatSnapshotTime(instant)}.`;
}

// ─── Prices (RI14) ────────────────────────────────────────────────────────────

export interface SnapshotPricesReading {
  /** RI14: the one predicate the toast and Storico read. */
  warning: boolean;
  /** Panoramica, after «Crea snapshot»: the whole toast text, or null when there is nothing to say. */
  toast: string | null;
  /** Storico, the month's reading: one sentence to append, or null. */
  reading: string | null;
}

const NO_WARNING: SnapshotPricesReading = { warning: false, toast: null, reading: null };

function listTickers(tickers: string[]): string {
  if (tickers.length <= 3) return tickers.join(', ');
  return `${tickers.slice(0, 3).join(', ')} e altri ${tickers.length - 3}`;
}

const formatJump = (changePct: number) => formatSignedPercentIt(changePct, 0);

/**
 * RI14 — what a month's price record says, and whether it is a warning.
 *
 * Warning ⇔ `partial` or `failed`, or an anomaly, or the oldest market price more than seven days
 * before the capture instant. `prices` absent (a manual snapshot, a document before 2026-11) is no
 * warning and says nothing: absent is not `fresh`, and it is not «failed» either.
 *
 * @param prices - The record, or undefined
 * @param capturedAt - `snapshotCapturedAt(snapshot)`
 * @param head - The toast's first words: «Snapshot creato» or «Snapshot aggiornato»
 */
export function describeSnapshotPrices(
  prices: SnapshotPriceRecord | undefined,
  capturedAt: Date | null,
  head = 'Snapshot aggiornato'
): SnapshotPricesReading {
  if (!prices) return NO_WARNING;

  const toastParts: string[] = [];
  const readingParts: string[] = [];
  const failedTickers = prices.failed.map((row) => row.ticker);

  if (prices.status === 'failed') {
    toastParts.push(`${head} con i prezzi già salvati: l'aggiornamento non è riuscito.`);
    readingParts.push("Quel giorno l'aggiornamento dei prezzi non è riuscito: il mese usa quelli già salvati.");
  } else if (prices.status === 'partial' && failedTickers.length > 0) {
    const n = failedTickers.length;
    const list = listTickers(failedTickers);
    toastParts.push(
      n === 1
        ? `1 prezzo non aggiornato: ${list}: vale l'ultimo noto.`
        : `${n} prezzi non aggiornati: ${list}: valgono gli ultimi noti.`
    );
    readingParts.push(
      n === 1
        ? `Quel giorno 1 prezzo non si è aggiornato (${list}): il mese usa l'ultimo noto.`
        : `Quel giorno ${n} prezzi non si sono aggiornati (${list}): il mese usa gli ultimi noti.`
    );
  }

  if (prices.anomalies.length === 1) {
    const [jump] = prices.anomalies;
    toastParts.push(`Il prezzo di ${jump.ticker} è cambiato del ${formatJump(jump.changePct)} dall'ultimo: controllalo in Patrimonio.`);
    readingParts.push(`Il prezzo di ${jump.ticker} era cambiato del ${formatJump(jump.changePct)} dall'aggiornamento precedente.`);
  } else if (prices.anomalies.length > 1) {
    const list = listTickers(prices.anomalies.map((row) => row.ticker));
    toastParts.push(`I prezzi di ${list} sono cambiati di oltre il ${SNAPSHOT_PRICE_JUMP_PCT}% dall'ultimo: controllali in Patrimonio.`);
    readingParts.push(`I prezzi di ${list} erano cambiati di oltre il ${SNAPSHOT_PRICE_JUMP_PCT}% dall'aggiornamento precedente.`);
  }

  const oldestAt = prices.oldest ? readInstant(prices.oldest.at) : null;
  if (prices.oldest && oldestAt && capturedAt && capturedAt.getTime() - oldestAt.getTime() > SNAPSHOT_PRICE_STALE_DAYS * DAY_MS) {
    const day = formatSnapshotDay(oldestAt, Number(italyYearFormat.format(capturedAt)));
    toastParts.push(`Il prezzo più vecchio, quello di ${prices.oldest.ticker}, è del ${day}.`);
    readingParts.push(`Il prezzo più vecchio, quello di ${prices.oldest.ticker}, era del ${day}.`);
  }

  if (toastParts.length === 0) return NO_WARNING;
  const toast = prices.status === 'failed' ? toastParts.join(' ') : `${head}. ${toastParts.join(' ')}`;
  return { warning: true, toast, reading: readingParts.join(' ') };
}

// ─── The automatic writer's price record (RI13) ───────────────────────────────

/** What the price updater reported, as far as the record needs it (`PriceUpdateResult`). */
export interface PriceRefreshOutcome {
  failures: SnapshotPriceRecord['failed'];
  anomalies: SnapshotPriceRecord['anomalies'];
}

interface PricedAsset {
  id: string;
  ticker: string;
  type: string;
  subCategory?: string;
  quantity: number;
  autoUpdatePrice?: boolean;
  lastPriceUpdate?: unknown;
}

/**
 * RI13 — the record an automatic write keeps. Only assets with `quantity > 0` count.
 *
 * - `failed`: the updater threw (`outcome` null) — nothing is known, the status says it.
 * - `none`: no held asset is due an automatic price.
 * - `partial`: a held asset failed; `fresh`: every one refreshed.
 * - `oldest`: the held market-priced asset (auto-update or not) with the earliest `lastPriceUpdate`.
 */
export function buildSnapshotPriceRecord(assets: PricedAsset[], outcome: PriceRefreshOutcome | null): SnapshotPriceRecord {
  const held = assets.filter((asset) => asset.quantity > 0);
  const heldIds = new Set(held.map((asset) => asset.id));

  let oldest: SnapshotPriceRecord['oldest'] = null;
  let oldestMs = Infinity;
  for (const asset of held) {
    if (!hasMarketPrice(asset.type, asset.subCategory)) continue;
    const at = readInstant(asset.lastPriceUpdate);
    if (at && at.getTime() < oldestMs) {
      oldestMs = at.getTime();
      oldest = { assetId: asset.id, ticker: asset.ticker, at: at.toISOString() };
    }
  }

  if (outcome === null) return { status: 'failed', failed: [], anomalies: [], oldest };

  const failed = outcome.failures.filter((row) => heldIds.has(row.assetId));
  const anomalies = outcome.anomalies.filter((row) => heldIds.has(row.assetId));
  const due = held.some((asset) => hasMarketPrice(asset.type, asset.subCategory) && asset.autoUpdatePrice !== false);
  const status: SnapshotPriceRecord['status'] = failed.length > 0 ? 'partial' : due ? 'fresh' : 'none';
  return { status, failed, anomalies, oldest };
}
