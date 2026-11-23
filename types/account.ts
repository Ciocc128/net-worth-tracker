/**
 * Shared-account (delegated access) domain types.
 *
 * A user (the "owner") can grant another registered user (a "member") full
 * read/write access to the owner's financial data, without sharing credentials.
 * Access is stored in the `account-access/{ownerUid}` collection: one document
 * per owner, keyed by the owner's uid so both Firestore Rules and the Admin SDK
 * can resolve it deterministically.
 *
 * Terminology used throughout the codebase:
 * - viewer: the logged-in Firebase Auth user (always their own identity)
 * - owner:  whose data is currently being viewed/edited (`ownerId`)
 */

/** Firestore collection holding delegated-access grants (doc id = owner uid). */
export const ACCOUNT_ACCESS_COLLECTION = 'account-access';

/**
 * The users the SERVER admitted (doc/sicurezza/S2-utenti-ammessi.md RU1, F04): one document per
 * uid, written only with the Admin SDK. Its existence is the whole rule — the Firestore rules
 * (`isAllowedUser()`), `requireFirebaseAuth` and the two crons ask for it.
 */
export const ALLOWED_USERS_COLLECTION = 'allowed-users';

/** How a user entered `allowed-users`: the activation route, `npm run users:allow`, a seed. */
export type AllowedUserSource = 'registration' | 'script' | 'seed';

/** The `allowed-users/{uid}` document; the fields are for the owner reading the console. */
export interface AllowedUser {
  uid: string;
  email: string;
  grantedAt: Date;
  source: AllowedUserSource;
}

/**
 * A member granted access to an owner's account. `email`/`displayName` are
 * denormalized copies (from the member's Auth profile at grant time) kept only
 * for display in the owner's sharing settings — `uid` is the source of truth.
 */
export interface AccountMember {
  uid: string;
  email: string;
  displayName: string | null;
  addedAt: Date;
}

/**
 * A pending invitation to the owner's account (doc/sicurezza/S2-utenti-ammessi.md RU12, D-SI17):
 * the email it is addressed to (lowercased) and when it was made. It never names a uid — the
 * person enters `memberUids` only by accepting it with their own token (RU15).
 */
export interface AccountInvite {
  email: string;
  invitedAt: Date;
}

/**
 * The `account-access/{ownerUid}` document. `memberUids` is the flat array the
 * Firestore Rules and the `array-contains` membership query read; `members`
 * carries the display metadata for the same uids.
 *
 * `ownerEmail`/`ownerDisplayName` are denormalized copies of the owner's profile
 * so a member — who cannot read the owner's private `users/{ownerUid}` doc — can
 * still label the shared account in the switcher.
 */
export interface AccountAccess {
  ownerUid: string;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  memberUids: string[];
  members: AccountMember[];
  /** RU12: the invited emails as a flat array, the one the `array-contains` query of RU14 reads. */
  inviteEmails?: string[];
  /** RU12: the same invitations with their date, for the owner's tile. */
  invites?: AccountInvite[];
}

/**
 * An account the current viewer may act on: always their own account plus any
 * account that has granted them membership. Drives the account switcher.
 */
export interface AccessibleAccount {
  ownerId: string;
  email: string | null;
  displayName: string | null;
  isOwn: boolean;
}
