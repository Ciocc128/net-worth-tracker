/**
 * Firestore values ⇄ JSON, without losing a type (doc/backup/README.md § 5, D-T3).
 *
 * JSON knows strings, numbers, booleans, null, arrays and objects; a Firestore document also holds
 * Timestamps, references, GeoPoints, bytes and the non-finite numbers. Each of those travels as a
 * TAGGED object `{ "__type": "<kind>", … }`. A plain map that happens to own a `__type` key is
 * wrapped in `{ "__type": "map", "value": … }`, so decoding never mistakes data for a tag.
 *
 * The Firestore classes are injected (`FirestoreKinds`): the module stays pure and the test runs
 * on the real `firebase-admin/firestore` classes without a server. An object of an unknown class
 * (a VectorValue, a FieldValue sentinel) throws: a backup that drops a field in silence is worse
 * than one that refuses.
 *
 * Known approximation: Firestore tells an integer from a double, JavaScript does not. A double
 * stored as `2.0` comes back as the integer `2` — same value, same reading in the app.
 */

export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
}
export interface GeoPointLike {
  latitude: number;
  longitude: number;
}
export interface DocumentReferenceLike {
  path: string;
}

export interface FirestoreKinds {
  // `Function & prototype`, not a constructor type: DocumentReference's constructor is private.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  Timestamp: Function & { prototype: TimestampLike };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  GeoPoint: Function & { prototype: GeoPointLike };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  DocumentReference: Function & { prototype: DocumentReferenceLike };
  makeTimestamp(seconds: number, nanoseconds: number): unknown;
  makeGeoPoint(latitude: number, longitude: number): unknown;
  makeReference(path: string): unknown;
}

export type EncodedValue =
  | null
  | boolean
  | number
  | string
  | EncodedValue[]
  | { [key: string]: EncodedValue };

const TAG = '__type';

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function encodeValue(value: unknown, kinds: FirestoreKinds): EncodedValue {
  if (value === null) return null;
  // Firestore never stores `undefined` (the app strips it); encoded as absent by the caller's map.
  if (value === undefined) throw new Error('undefined is not a Firestore value');
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return Object.is(value, -0) ? { [TAG]: 'number', value: '-0' } : value;
    return { [TAG]: 'number', value: String(value) }; // NaN, Infinity, -Infinity
  }
  if (Array.isArray(value)) return value.map((v) => encodeValue(v, kinds));
  if (typeof value === 'object') {
    if (value instanceof kinds.Timestamp) {
      const ts = value as TimestampLike;
      return { [TAG]: 'timestamp', seconds: ts.seconds, nanoseconds: ts.nanoseconds };
    }
    if (value instanceof Date) {
      // The Admin SDK reads dates as Timestamps; a Date only reaches here from code that built one.
      const ms = value.getTime();
      return { [TAG]: 'timestamp', seconds: Math.floor(ms / 1000), nanoseconds: (((ms % 1000) + 1000) % 1000) * 1e6 };
    }
    if (value instanceof kinds.GeoPoint) {
      const gp = value as GeoPointLike;
      return { [TAG]: 'geopoint', latitude: gp.latitude, longitude: gp.longitude };
    }
    if (value instanceof kinds.DocumentReference) {
      return { [TAG]: 'reference', path: (value as DocumentReferenceLike).path };
    }
    if (value instanceof Uint8Array) {
      return { [TAG]: 'bytes', base64: Buffer.from(value).toString('base64') };
    }
    if (!isPlainObject(value)) {
      const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
      throw new Error(`unsupported Firestore value of class ${name}`);
    }
    const out: { [key: string]: EncodedValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = encodeValue(v, kinds);
    }
    return Object.prototype.hasOwnProperty.call(out, TAG) ? { [TAG]: 'map', value: out } : out;
  }
  throw new Error(`unsupported value of type ${typeof value}`);
}

export function decodeValue(value: EncodedValue, kinds: FirestoreKinds): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => decodeValue(v, kinds));
  const tag = value[TAG];
  if (tag === undefined) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v, kinds);
    return out;
  }
  switch (tag) {
    case 'timestamp':
      return kinds.makeTimestamp(value.seconds as number, value.nanoseconds as number);
    case 'geopoint':
      return kinds.makeGeoPoint(value.latitude as number, value.longitude as number);
    case 'reference':
      return kinds.makeReference(value.path as string);
    case 'bytes':
      return new Uint8Array(Buffer.from(value.base64 as string, 'base64'));
    case 'number':
      return value.value === '-0' ? -0 : Number(value.value as string);
    case 'map': {
      // The wrapper exists only because the map owns `__type`: decode its fields one by one,
      // never as a tag again.
      const inner = value.value as { [key: string]: EncodedValue };
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inner)) out[k] = decodeValue(v, kinds);
      return out;
    }
    default:
      throw new Error(`unknown tagged value: ${String(tag)}`);
  }
}

export function encodeDocument(data: Record<string, unknown>, kinds: FirestoreKinds): Record<string, EncodedValue> {
  const encoded = encodeValue(data, kinds);
  // A top-level map owning `__type` comes back wrapped; keep the wrapper (decodeDocument undoes it).
  return encoded as Record<string, EncodedValue>;
}

export function decodeDocument(data: Record<string, EncodedValue>, kinds: FirestoreKinds): Record<string, unknown> {
  return decodeValue(data, kinds) as Record<string, unknown>;
}
