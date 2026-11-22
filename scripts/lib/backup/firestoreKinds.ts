/**
 * The real `firebase-admin/firestore` classes for the serializer, bound to one Firestore (the
 * references are rebuilt on the database being written).
 */
import { DocumentReference, GeoPoint, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { FirestoreKinds } from './serializer';

export function adminFirestoreKinds(db: Firestore): FirestoreKinds {
  return {
    Timestamp,
    GeoPoint,
    DocumentReference,
    makeTimestamp: (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds),
    makeGeoPoint: (latitude, longitude) => new GeoPoint(latitude, longitude),
    makeReference: (path) => db.doc(path),
  };
}
