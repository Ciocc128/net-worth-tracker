/**
 * Admit a user: write `allowed-users/{uid}` (doc/sicurezza/S2-utenti-ammessi.md RU1, RU6).
 *
 * ONE helper for `npm run users:allow` and every seed that creates an Auth user: since F04 the
 * Firestore rules, `requireFirebaseAuth` and the crons ask for this document, so a seed that
 * forgets it gives an account that can read nothing (the first E2E spec says so).
 *
 * It takes the Admin Firestore of the caller (production or the emulators — the caller decides),
 * and never imports the app's `lib/firebase/admin`.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { ALLOWED_USERS_COLLECTION, type AllowedUserSource } from '../../types/account';

export async function allowUser(db: Firestore, uid: string, email: string, source: AllowedUserSource): Promise<void> {
  await db.collection(ALLOWED_USERS_COLLECTION).doc(uid).set({
    uid,
    email: email.trim().toLowerCase(),
    grantedAt: new Date(),
    source,
  });
}

/** Take a user off the list: Firestore refuses them at once, the API within 60 seconds (RU4). */
export async function disallowUser(db: Firestore, uid: string): Promise<void> {
  await db.collection(ALLOWED_USERS_COLLECTION).doc(uid).delete();
}
