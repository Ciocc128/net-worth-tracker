/**
 * F03 (D1, D-T3) — the backup serializer gives back what Firestore gave it, type by type
 * (doc/backup/README.md § 5). Runs on the REAL `firebase-admin/firestore` classes; no server is
 * contacted (a reference is a path, `db.doc()` does not read).
 *
 * The expected encodings are written by hand from the format:
 *   - Timestamp(1_700_000_000, 500_000_000) → { __type: 'timestamp', seconds: 1700000000, nanoseconds: 500000000 }
 *   - Date(2025-03-01T12:00:00.250Z): 1740830400250 ms → seconds 1740830400, nanoseconds 250 × 1e6 = 250000000
 *   - Date(1969-12-31T23:59:59.500Z): −500 ms → seconds floor(−0,5) = −1, nanoseconds ((−500 mod 1000) + 1000) mod 1000 × 1e6 = 500000000
 */
import { describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { DocumentReference, GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { adminFirestoreKinds } from '@/scripts/lib/backup/firestoreKinds';
import { decodeDocument, decodeValue, encodeDocument, encodeValue } from '@/scripts/lib/backup/serializer';

const app = initializeApp({ projectId: 'demo-backup-serializer' }, 'backup-serializer');
const db = getFirestore(app);
const kinds = adminFirestoreKinds(db);

/** Through JSON text, as the file does. */
function roundTrip(data: Record<string, unknown>): Record<string, unknown> {
  return decodeDocument(JSON.parse(JSON.stringify(encodeDocument(data, kinds))), kinds);
}

describe('encodeValue', () => {
  it('tags a Timestamp with seconds and nanoseconds', () => {
    expect(encodeValue(new Timestamp(1_700_000_000, 500_000_000), kinds)).toEqual({ __type: 'timestamp', seconds: 1700000000, nanoseconds: 500000000 });
  });

  it('turns a Date into the Timestamp it would be stored as', () => {
    expect(encodeValue(new Date('2025-03-01T12:00:00.250Z'), kinds)).toEqual({ __type: 'timestamp', seconds: 1740830400, nanoseconds: 250000000 });
    expect(encodeValue(new Date('1969-12-31T23:59:59.500Z'), kinds)).toEqual({ __type: 'timestamp', seconds: -1, nanoseconds: 500000000 });
  });

  it('tags a GeoPoint, a reference and bytes', () => {
    expect(encodeValue(new GeoPoint(45.5, 9.25), kinds)).toEqual({ __type: 'geopoint', latitude: 45.5, longitude: 9.25 });
    expect(encodeValue(db.doc('assets/a1'), kinds)).toEqual({ __type: 'reference', path: 'assets/a1' });
    // bytes 1, 2, 3 → base64 "AQID"
    expect(encodeValue(new Uint8Array([1, 2, 3]), kinds)).toEqual({ __type: 'bytes', base64: 'AQID' });
  });

  it('tags the numbers JSON cannot hold, and keeps the others plain', () => {
    expect(encodeValue(Number.NaN, kinds)).toEqual({ __type: 'number', value: 'NaN' });
    expect(encodeValue(Number.POSITIVE_INFINITY, kinds)).toEqual({ __type: 'number', value: 'Infinity' });
    expect(encodeValue(-0, kinds)).toEqual({ __type: 'number', value: '-0' });
    expect(encodeValue(2500, kinds)).toBe(2500);
    expect(encodeValue(0.1, kinds)).toBe(0.1);
  });

  it('wraps a real map that owns a __type key, so it is never read as a tag', () => {
    expect(encodeValue({ __type: 'timestamp', seconds: 1 }, kinds)).toEqual({ __type: 'map', value: { __type: 'timestamp', seconds: 1 } });
  });

  it('drops undefined fields as Firestore does, and refuses an unknown class', () => {
    expect(encodeValue({ a: 1, b: undefined }, kinds)).toEqual({ a: 1 });
    class Vector { constructor(readonly v: number[]) {} }
    expect(() => encodeValue({ x: new Vector([1]) }, kinds)).toThrow(/class Vector/);
  });
});

describe('round trip through JSON', () => {
  it('gives back every Firestore type, nested in maps and arrays', () => {
    const data = {
      name: 'Conto',
      quantity: 50,
      price: 1120.5,
      active: true,
      note: null,
      createdAt: new Timestamp(1_700_000_000, 123_456_789),
      history: [{ at: new Timestamp(1_600_000_000, 0), value: 2500 }, [new Timestamp(1, 2)]],
      place: new GeoPoint(-33.5, 151.25),
      parent: db.doc('monthly-snapshots/u1-2025-3/versions/v1'),
      raw: new Uint8Array([0, 255, 128]),
      odd: { __type: 'reference', path: 'not/a-ref' },
      weird: [Number.NaN, Number.NEGATIVE_INFINITY, -0],
      empty: {},
    };
    const back = roundTrip(data);

    expect(back.createdAt).toBeInstanceOf(Timestamp);
    expect((back.createdAt as Timestamp).isEqual(data.createdAt)).toBe(true);
    const history = back.history as [{ at: Timestamp; value: number }, [Timestamp]];
    expect(history[0].at.isEqual(new Timestamp(1_600_000_000, 0))).toBe(true);
    expect(history[0].value).toBe(2500);
    expect(history[1][0].isEqual(new Timestamp(1, 2))).toBe(true);
    expect(back.place).toBeInstanceOf(GeoPoint);
    expect((back.place as GeoPoint).isEqual(data.place)).toBe(true);
    expect(back.parent).toBeInstanceOf(DocumentReference);
    expect((back.parent as DocumentReference).path).toBe('monthly-snapshots/u1-2025-3/versions/v1');
    expect(Array.from(back.raw as Uint8Array)).toEqual([0, 255, 128]);
    expect(back.odd).toEqual({ __type: 'reference', path: 'not/a-ref' });
    const weird = back.weird as number[];
    expect(Number.isNaN(weird[0])).toBe(true);
    expect(weird[1]).toBe(Number.NEGATIVE_INFINITY);
    expect(Object.is(weird[2], -0)).toBe(true);
    expect({ name: back.name, quantity: back.quantity, price: back.price, active: back.active, note: back.note, empty: back.empty })
      .toEqual({ name: 'Conto', quantity: 50, price: 1120.5, active: true, note: null, empty: {} });
  });

  it('encodes the decoded value to the same JSON (stable for the restore check)', () => {
    const encoded = encodeDocument({ t: new Timestamp(5, 6), m: { __type: 'x' }, list: [1, 'a', null] }, kinds);
    const again = encodeDocument(decodeDocument(JSON.parse(JSON.stringify(encoded)), kinds), kinds);
    expect(again).toEqual(encoded);
  });

  it('refuses an unknown tag instead of guessing', () => {
    expect(() => decodeValue({ __type: 'vector', value: [1] }, kinds)).toThrow(/unknown tagged value/);
  });
});
