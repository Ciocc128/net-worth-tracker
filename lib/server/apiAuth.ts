import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { ACCOUNT_ACCESS_COLLECTION, ALLOWED_USERS_COLLECTION } from '@/types/account';

class ApiAuthError extends Error {
  status: number;
  /** A stable code the client maps to its own sentence (`lib/utils/authNarrative.ts`). */
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
    this.code = code;
  }
}

/** The 403 of a valid token whose user the server never admitted (S2 RU4). */
export const ACCOUNT_NOT_ALLOWED_CODE = 'account/not-allowed';

/**
 * How long a POSITIVE answer of `allowed-users/{uid}` is remembered in this function instance
 * (D-SI13). A negative one never is: an activation takes effect at the next request, a removal
 * within this window.
 */
export const ALLOWED_USER_MEMORY_MS = 60_000;

// uid → the instant (ms) the admission was read. One Map per instance, like `rateLimit.ts`.
const admittedAt = new Map<string, number>();

/** Tests only: forget every remembered admission. */
export function resetAllowedUserMemory(): void {
  admittedAt.clear();
}

/**
 * Verify the Firebase ID token WITHOUT asking for the list of admitted users.
 *
 * Only `POST /api/auth/activate` calls it directly: it is the one private route that must accept
 * a user who is not admitted yet (S2 RU2). Every other route goes through `requireFirebaseAuth`.
 */
export async function verifyFirebaseToken(
  request: NextRequest
): Promise<DecodedIdToken> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiAuthError(401, 'Missing Authorization bearer token');
  }

  const idToken = authorization.slice('Bearer '.length).trim();

  if (!idToken) {
    throw new ApiAuthError(401, 'Missing Firebase ID token');
  }

  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    console.error('[apiAuth] Failed to verify Firebase ID token:', error);
    throw new ApiAuthError(401, 'Invalid or expired Firebase ID token');
  }
}

/**
 * Enforce that the server admitted `uid` (`allowed-users/{uid}` exists, S2 RU4).
 *
 * @throws ApiAuthError(403, code `account/not-allowed`) when the document is missing
 */
export async function assertAllowedUser(uid: string): Promise<void> {
  const remembered = admittedAt.get(uid);
  if (remembered !== undefined && Date.now() - remembered < ALLOWED_USER_MEMORY_MS) {
    return;
  }

  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(uid).get();
  if (!snap.exists) {
    admittedAt.delete(uid);
    throw new ApiAuthError(403, 'Account non abilitato', ACCOUNT_NOT_ALLOWED_CODE);
  }
  admittedAt.set(uid, Date.now());
}

/**
 * Verify the Firebase ID token attached to a private API request AND that the server admitted
 * its user (doc/sicurezza/S2-utenti-ammessi.md RU4).
 *
 * Why this exists:
 * - App Router route handlers use the Admin SDK, which bypasses Firestore rules
 * - Any route that trusts client-provided userId/resource IDs must authenticate first
 * - Centralizing this avoids slightly different auth checks across handlers
 * - Being a Firebase Auth user is not enough: only an `allowed-users/{uid}` document is
 */
export async function requireFirebaseAuth(
  request: NextRequest
): Promise<DecodedIdToken> {
  const decodedToken = await verifyFirebaseToken(request);
  await assertAllowedUser(decodedToken.uid);
  return decodedToken;
}

/**
 * Enforce that the authenticated user may act on `ownerUserId`'s account —
 * either because they ARE the owner, or because the owner granted them
 * delegated access (shared account).
 *
 * This is the delegation-aware auth check for any route whose data is scoped
 * to a data-owner rather than the caller. Membership is read from
 * `account-access/{ownerUserId}.memberUids`.
 *
 * Performance: the self case (caller === owner) returns immediately WITHOUT a
 * Firestore read, so the common path costs nothing; the read happens only when
 * a delegate is acting on someone else's account.
 *
 * @throws ApiAuthError(400) if ownerUserId is missing
 * @throws ApiAuthError(403) if the caller is neither the owner nor a member
 */
export async function assertCanAccessAccount(
  decodedToken: DecodedIdToken,
  ownerUserId: string | null | undefined
): Promise<void> {
  if (!ownerUserId) {
    throw new ApiAuthError(400, 'User ID is required');
  }

  // Owner acting on their own account: no membership lookup needed.
  if (decodedToken.uid === ownerUserId) {
    return;
  }

  const accessSnap = await adminDb
    .collection(ACCOUNT_ACCESS_COLLECTION)
    .doc(ownerUserId)
    .get();

  const memberUids: unknown = accessSnap.exists
    ? accessSnap.data()?.memberUids
    : undefined;

  const isMember =
    Array.isArray(memberUids) && memberUids.includes(decodedToken.uid);

  if (!isMember) {
    throw new ApiAuthError(
      403,
      'Authenticated user does not have access to requested account'
    );
  }
}

/**
 * Constant-time comparison for the shared cron secret.
 *
 * Hashing both sides first makes timingSafeEqual usable with inputs of
 * different lengths (it throws on length mismatch) without leaking length.
 * Returns false when the env secret is not configured: a missing secret
 * must never mean "open access".
 */
export function verifyCronSecret(provided: string | null | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) {
    return false;
  }
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function getApiAuthErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ApiAuthError) {
    return NextResponse.json(
      error.code ? { error: error.message, code: error.code } : { error: error.message },
      { status: error.status }
    );
  }

  return null;
}
