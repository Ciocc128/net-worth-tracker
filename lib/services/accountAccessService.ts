import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  ACCOUNT_ACCESS_COLLECTION,
  ALLOWED_USERS_COLLECTION,
  AccountAccess,
  AccessibleAccount,
} from '@/types/account';

/**
 * Client-SDK discovery of shared accounts.
 *
 * Returns the accounts that have granted `viewerId` delegated access — i.e. the
 * accounts (other than the viewer's own) whose data the viewer may act on. The
 * Firestore rule for `account-access` permits a member to read any grant doc
 * that lists them in `memberUids`, so the `array-contains` query is authorized.
 *
 * The viewer's OWN account is not included here — the caller adds it — because a
 * user has no `account-access` doc until they grant access to someone else.
 */
export async function getSharedAccounts(
  viewerId: string
): Promise<AccessibleAccount[]> {
  const grantsQuery = query(
    collection(db, ACCOUNT_ACCESS_COLLECTION),
    where('memberUids', 'array-contains', viewerId)
  );
  const snapshot = await getDocs(grantsQuery);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as AccountAccess;
    return {
      ownerId: data.ownerUid,
      email: data.ownerEmail ?? null,
      displayName: data.ownerDisplayName ?? null,
      isOwn: false,
    };
  });
}

/**
 * Whether the server admitted `viewerId` (doc/sicurezza/S2-utenti-ammessi.md RU7): `true` or
 * `false` only from a read that ANSWERED. A failed read (offline, a timeout, the rules not yet
 * published) throws, and the caller must not take it as a refusal.
 */
export async function isViewerAdmitted(viewerId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, ALLOWED_USERS_COLLECTION, viewerId));
  return snap.exists();
}
