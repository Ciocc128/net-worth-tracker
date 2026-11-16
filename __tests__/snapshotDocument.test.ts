/**
 * lib/utils/snapshotDocument.ts — the one builder and its readers (doc/snapshot-integri/README.md
 * § 6, SD1–SD5; CA2 c). Figures invented and round; decoys «Fenicottero», «Ornitorinco».
 */

import { describe, expect, it } from 'vitest';
import {
  buildSnapshotDocument,
  buildSnapshotPriceRecord,
  describeExistingSnapshot,
  describePreviousVersion,
  describeSnapshotAuthorship,
  describeSnapshotPrices,
  snapshotCapturedAt,
  snapshotFromData,
  type SnapshotFigures,
} from '@/lib/utils/snapshotDocument';
import type { MonthlySnapshot, SnapshotPriceRecord } from '@/types/assets';

const T = new Date('2026-11-14T11:00:00.000Z'); // 12:00 in Rome
const T0 = new Date('2026-11-01T18:00:00.000Z');

const figures: SnapshotFigures = {
  userId: 'owner-1',
  year: 2026,
  month: 11,
  totalNetWorth: 10000,
  liquidNetWorth: 7000,
  illiquidNetWorth: 3000,
  byAssetClass: { equity: 6000, bonds: 4000 },
  byAsset: [],
  fireNetWorth: 9000,
  pension: { totalValue: 0, byAssetClass: {} },
};

const hasUndefined = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) ? value.some(hasUndefined) : !!value && typeof value === 'object' && !(value instanceof Date) && Object.values(value).some(hasUndefined));

describe('SD1–SD3 — the builder', () => {
  it('SD1: no existing document, the cron: createdAt = updatedAt = now, no uid, no undefined', () => {
    const doc = buildSnapshotDocument({ figures, writtenBy: 'cron', now: T });
    expect(doc.createdAt).toBe(T);
    expect(doc.updatedAt).toBe(T);
    expect(doc.writtenBy).toBe('cron');
    expect(doc).not.toHaveProperty('writtenByUid');
    expect(hasUndefined(doc)).toBe(false);
  });

  it('SD2: an existing document keeps createdAt, the note and the pointer; the button stamps its uid', () => {
    const previous = { versionId: 'v-1', archivedAt: '2026-11-03T09:15:00.000Z', writtenBy: 'cron' as const };
    const existing = { ...figures, createdAt: T0, note: 'Ornitorinco', previous };
    const doc = buildSnapshotDocument({ figures, writtenBy: 'button', writtenByUid: 'u1', now: T, existing });
    expect(doc.createdAt).toBe(T0);
    expect(doc.updatedAt).toBe(T);
    expect(doc.note).toBe('Ornitorinco');
    expect(doc.previous).toEqual(previous);
    expect(doc.writtenByUid).toBe('u1');
  });

  it('SD3 / CA2 c: a manual write derives 60% and 40%, and has no pension, FIRE or price record', () => {
    const { fireNetWorth: _f, pension: _p, ...declared } = figures;
    void _f; void _p;
    const doc = buildSnapshotDocument({ figures: declared, writtenBy: 'manual', writtenByUid: 'u1', now: T });
    expect(doc.assetAllocation).toEqual({ equity: 60, bonds: 40 });
    expect(doc).not.toHaveProperty('pension');
    expect(doc).not.toHaveProperty('fireNetWorth');
    expect(doc).not.toHaveProperty('prices');
  });

  it('a legacy note-only document is completed: its note kept, createdAt is now', () => {
    const doc = buildSnapshotDocument({ figures, writtenBy: 'cron', now: T, existing: { userId: 'owner-1', note: 'Fenicottero' } });
    expect(doc.note).toBe('Fenicottero');
    expect(doc.createdAt).toBe(T);
  });

  it('a real write over test data drops isDummy; the generator sets it', () => {
    expect(buildSnapshotDocument({ figures, writtenBy: 'cron', now: T, existing: { ...figures, isDummy: true, createdAt: T0 } })).not.toHaveProperty('isDummy');
    expect(buildSnapshotDocument({ figures, writtenBy: 'dummy', now: T, isDummy: true }).isDummy).toBe(true);
  });
});

describe('SD4 — the capture instant', () => {
  it('updatedAt when present, else createdAt; a Timestamp read by toDate()', () => {
    expect(snapshotCapturedAt({ createdAt: T0, updatedAt: T })).toEqual(T);
    expect(snapshotCapturedAt({ createdAt: T0 })).toEqual(T0);
    expect(snapshotCapturedAt({ createdAt: { toDate: () => T0 } as unknown as Date })).toEqual(T0);
  });

  it('snapshotFromData converts both stamps', () => {
    const read = snapshotFromData({ userId: 'u', createdAt: { toDate: () => T0 }, updatedAt: { toDate: () => T } });
    expect(read.createdAt).toEqual(T0);
    expect(read.updatedAt).toEqual(T);
    expect(snapshotFromData({ userId: 'u', createdAt: { toDate: () => T0 } })).not.toHaveProperty('updatedAt');
  });
});

const record = (patch: Partial<SnapshotPriceRecord>): SnapshotPriceRecord => ({ status: 'fresh', failed: [], anomalies: [], oldest: null, ...patch });
const days = (n: number) => new Date(T.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('SD5 — the price warning (RI14)', () => {
  it.each([
    ['fresh', record({}), false],
    ['partial', record({ status: 'partial', failed: [{ assetId: 'a', ticker: 'VWCE', reason: 'quote' }] }), true],
    ['failed', record({ status: 'failed' }), true],
    ['one anomaly', record({ anomalies: [{ assetId: 'a', ticker: 'SWDA', previousPrice: 50, price: 5000, changePct: 9900 }] }), true],
    ['oldest 8 days before', record({ oldest: { assetId: 'x', ticker: 'XYZ', at: days(8) } }), true],
    ['oldest 7 days before', record({ oldest: { assetId: 'x', ticker: 'XYZ', at: days(7) } }), false],
    ['prices absent', undefined, false],
  ])('%s → warning %s', (_label, prices, warning) => {
    expect(describeSnapshotPrices(prices, T).warning).toBe(warning);
  });

  it('the sentences of § 5.8', () => {
    const two = record({ status: 'partial', failed: [{ assetId: 'a', ticker: 'VWCE', reason: 'quote' }, { assetId: 'b', ticker: 'BTP-30', reason: 'fx' }] });
    expect(describeSnapshotPrices(two, T)).toEqual({
      warning: true,
      toast: 'Snapshot aggiornato. 2 prezzi non aggiornati: VWCE, BTP-30: valgono gli ultimi noti.',
      reading: 'Quel giorno 2 prezzi non si sono aggiornati (VWCE, BTP-30): il mese usa gli ultimi noti.',
    });

    const one = record({ status: 'partial', failed: [{ assetId: 'a', ticker: 'VWCE', reason: 'quote' }] });
    expect(describeSnapshotPrices(one, T, 'Snapshot creato').toast).toBe("Snapshot creato. 1 prezzo non aggiornato: VWCE: vale l'ultimo noto.");

    const five = record({ status: 'partial', failed: ['A', 'B', 'C', 'D', 'E'].map((ticker) => ({ assetId: ticker, ticker, reason: 'quote' as const })) });
    expect(describeSnapshotPrices(five, T).toast).toBe('Snapshot aggiornato. 5 prezzi non aggiornati: A, B, C e altri 2: valgono gli ultimi noti.');

    expect(describeSnapshotPrices(record({ status: 'failed' }), T)).toEqual({
      warning: true,
      toast: "Snapshot aggiornato con i prezzi già salvati: l'aggiornamento non è riuscito.",
      reading: "Quel giorno l'aggiornamento dei prezzi non è riuscito: il mese usa quelli già salvati.",
    });

    const jump = record({ anomalies: [{ assetId: 'a', ticker: 'SWDA', previousPrice: 50, price: 5000, changePct: 9900 }] });
    expect(describeSnapshotPrices(jump, T).toast).toBe("Snapshot aggiornato. Il prezzo di SWDA è cambiato del +9900% dall'ultimo: controllalo in Patrimonio.");
    expect(describeSnapshotPrices(jump, T).reading).toBe("Il prezzo di SWDA era cambiato del +9900% dall'aggiornamento precedente.");

    const old = record({ oldest: { assetId: 'x', ticker: 'XYZ', at: '2026-10-12T10:00:00.000Z' } });
    expect(describeSnapshotPrices(old, T).reading).toBe('Il prezzo più vecchio, quello di XYZ, era del 12 ottobre.');
  });
});

describe('the authorship words (§ 5.8)', () => {
  const cronOctober = { year: 2026, month: 10, writtenBy: 'cron', createdAt: new Date('2026-10-01T17:00:00Z'), updatedAt: new Date('2026-10-31T18:02:00Z') } as MonthlySnapshot;

  it('the footer, per writer; none without writtenBy', () => {
    expect(describeSnapshotAuthorship(cronOctober)).toBe("Scritto dall'aggiornamento automatico il 31 ottobre alle 19:02.");
    expect(describeSnapshotAuthorship({ ...cronOctober, writtenBy: 'button', updatedAt: new Date('2026-10-31T22:20:00Z') })).toBe('Scritto con «Crea snapshot» il 31 ottobre alle 23:20.');
    expect(describeSnapshotAuthorship({ ...cronOctober, writtenBy: 'manual', updatedAt: new Date('2026-11-03T09:15:00Z') })).toBe('Inserito a mano il 3 novembre alle 10:15.');
    expect(describeSnapshotAuthorship({ ...cronOctober, writtenBy: undefined })).toBeNull();
  });

  it('the year appears only when the write is in another year than the month', () => {
    expect(describeSnapshotAuthorship({ ...cronOctober, year: 2020, writtenBy: 'manual', updatedAt: new Date('2026-11-03T09:15:00Z') })).toBe('Inserito a mano il 3 novembre 2026 alle 10:15.');
  });

  it('the manual dialog names the existing writer, and the previous version', () => {
    expect(describeExistingSnapshot(2026, 10, cronOctober)).toBe(
      "Ottobre 2026 ha già uno snapshot, scritto dall'aggiornamento automatico il 31 ottobre alle 19:02. Se lo sostituisci, quella versione resta recuperabile da qui."
    );
    expect(describeExistingSnapshot(2026, 10, {})).toBe('Ottobre 2026 ha già uno snapshot. Se lo sostituisci, quella versione resta recuperabile da qui.');
    expect(describePreviousVersion({ versionId: 'v', archivedAt: '2026-11-03T09:15:00Z', updatedAt: '2026-10-31T18:02:00Z' }, 2026)).toBe('Versione precedente: 31 ottobre, 19:02.');
  });
});

describe('RI13 — the record of an automatic write', () => {
  const held = (id: string, extra: Record<string, unknown> = {}) => ({ id, ticker: id.toUpperCase(), type: 'etf', quantity: 10, lastPriceUpdate: new Date('2026-11-14T10:00:00Z'), ...extra });

  it('fresh, partial, failed, none; only held assets count; the oldest market price', () => {
    const assets = [held('feni'), held('orni', { lastPriceUpdate: new Date('2026-10-12T10:00:00Z'), autoUpdatePrice: false }), held('sold', { quantity: 0, lastPriceUpdate: new Date('2020-01-01') }), { id: 'cash', ticker: 'CASH', type: 'cash', quantity: 1000 }];
    expect(buildSnapshotPriceRecord(assets, { failures: [], anomalies: [] })).toEqual({
      status: 'fresh', failed: [], anomalies: [], oldest: { assetId: 'orni', ticker: 'ORNI', at: '2026-10-12T10:00:00.000Z' },
    });
    expect(buildSnapshotPriceRecord(assets, { failures: [{ assetId: 'feni', ticker: 'FENI', reason: 'quote' }, { assetId: 'sold', ticker: 'SOLD', reason: 'quote' }], anomalies: [] }).failed).toEqual([{ assetId: 'feni', ticker: 'FENI', reason: 'quote' }]);
    expect(buildSnapshotPriceRecord(assets, null).status).toBe('failed');
    expect(buildSnapshotPriceRecord([{ id: 'cash', ticker: 'CASH', type: 'cash', quantity: 1000 }], { failures: [], anomalies: [] })).toEqual({ status: 'none', failed: [], anomalies: [], oldest: null });
  });
});
