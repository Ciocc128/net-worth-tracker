import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import {
  accountAccessRef,
  isEmailShaped,
  normalizeEmail,
  toInviteResponse,
  toIso,
  toMemberResponse,
  withoutInvite,
  type ReceivedInviteResponse,
} from '@/lib/server/accountSharing';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import {
  ACCOUNT_ACCESS_COLLECTION,
  AccountAccess,
  AccountInvite,
} from '@/types/account';

/**
 * Account sharing (delegated access), the owner's side — doc/sicurezza/S2-utenti-ammessi.md
 * RU12–RU16 (A2, F04 S2b).
 *
 * The account being managed is ALWAYS the authenticated caller's own account
 * (`decodedToken.uid`) — there is no client-supplied owner id, so a delegate can
 * never grant themselves or others access to an account they merely view. Grants
 * live in `account-access/{ownerUid}`, written only by the Admin SDK.
 *
 * Since S2b sharing is an INVITATION: the owner names an email, the invited person accepts it
 * with their own token (`/api/account/invites`). This route never resolves an email to a uid
 * and answers an invitation the same way whether the email is registered or not (review P2a,
 * P2b): it no longer tells an admitted user which emails have an account.
 */

/** The caller's own account-access document, or null when they never shared it. */
async function loadAccountAccess(ownerUid: string): Promise<AccountAccess | null> {
  const snap = await accountAccessRef(ownerUid).get();
  return snap.exists ? (snap.data() as AccountAccess) : null;
}

/** RU14 `received`: the invitations addressed to `email`, from any owner. */
async function loadReceivedInvites(email: string): Promise<ReceivedInviteResponse[]> {
  if (!email) return [];
  const snapshot = await adminDb
    .collection(ACCOUNT_ACCESS_COLLECTION)
    .where('inviteEmails', 'array-contains', email)
    .get();
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as AccountAccess;
    const invite = (data.invites ?? []).find((candidate) => normalizeEmail(candidate.email) === email);
    return {
      ownerUid: data.ownerUid ?? docSnap.id,
      ownerEmail: data.ownerEmail ?? null,
      ownerDisplayName: data.ownerDisplayName ?? null,
      invitedAt: toIso(invite?.invitedAt),
    };
  });
}

/**
 * GET /api/account/members
 *
 * Response: { members, invites, received } — the caller's members, the caller's pending
 * invitations, and the invitations addressed to the caller's own email (RU14).
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const [access, received] = await Promise.all([
      loadAccountAccess(decodedToken.uid),
      loadReceivedInvites(normalizeEmail(decodedToken.email)),
    ]);
    return NextResponse.json({
      members: (access?.members ?? []).map(toMemberResponse),
      invites: (access?.invites ?? []).map(toInviteResponse),
      received,
    });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[account/members] GET failed:', error);
    return NextResponse.json(
      { error: 'Impossibile caricare i membri' },
      { status: 500 }
    );
  }
}

type InviteOutcome =
  | { status: 'self' }
  | { status: 'member' }
  | { status: 'invited'; invite: AccountInvite };

/**
 * POST /api/account/members
 *
 * Invite a person to the caller's account, by email (RU13).
 *
 * Request body: { email: string }
 * Errors:
 *   400 - missing/invalid email, or the caller's own email
 *   409 - that email is already a member
 * Response: { invite: { email, invitedAt } } — the same for a registered and an unregistered
 * email; an email already invited answers its existing invitation, unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const ownerUid = decodedToken.uid;

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);

    if (!email || !isEmailShaped(email)) {
      return NextResponse.json(
        { error: "Serve un'email valida" },
        { status: 400 }
      );
    }

    const ref = accountAccessRef(ownerUid);
    const outcome = await adminDb.runTransaction<InviteOutcome>(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as AccountAccess) : null;

      if (email === normalizeEmail(decodedToken.email)) return { status: 'self' };
      if ((existing?.members ?? []).some((member) => normalizeEmail(member.email) === email)) {
        return { status: 'member' };
      }
      const pending = (existing?.invites ?? []).find((invite) => normalizeEmail(invite.email) === email);
      if (pending) return { status: 'invited', invite: pending };

      const invite: AccountInvite = { email, invitedAt: new Date() };
      // The owner's name and email are stored so the invited person — who cannot read the
      // owner's private `users/{ownerUid}` — can tell who is inviting them (RU14 `received`).
      const updated: AccountAccess = {
        ownerUid,
        ownerEmail: decodedToken.email ?? existing?.ownerEmail ?? null,
        ownerDisplayName:
          (decodedToken.name as string | undefined) ?? existing?.ownerDisplayName ?? null,
        memberUids: existing?.memberUids ?? [],
        members: existing?.members ?? [],
        inviteEmails: [...(existing?.inviteEmails ?? []), email],
        invites: [...(existing?.invites ?? []), invite],
      };
      tx.set(ref, removeUndefinedDeep(updated));
      return { status: 'invited', invite };
    });

    if (outcome.status === 'self') {
      return NextResponse.json(
        { error: 'Non puoi invitare te stesso' },
        { status: 400 }
      );
    }
    if (outcome.status === 'member') {
      return NextResponse.json(
        { error: 'Questa persona ha già accesso al tuo account' },
        { status: 409 }
      );
    }
    return NextResponse.json({ invite: toInviteResponse(outcome.invite) });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[account/members] POST failed:', error);
    return NextResponse.json(
      { error: "Impossibile creare l'invito" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/account/members?memberUid=... | ?inviteEmail=...
 *
 * Revoke a member's access, or withdraw a pending invitation (RU16). Always on the caller's
 * own document.
 *
 * Response: { success: true }
 */
export async function DELETE(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const ownerUid = decodedToken.uid;
    const memberUid = request.nextUrl.searchParams.get('memberUid');
    const inviteEmail = normalizeEmail(request.nextUrl.searchParams.get('inviteEmail'));

    if (!memberUid && !inviteEmail) {
      return NextResponse.json(
        { error: 'memberUid o inviteEmail è obbligatorio' },
        { status: 400 }
      );
    }

    const ref = accountAccessRef(ownerUid);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const existing = snap.data() as AccountAccess;
      const patch: Partial<AccountAccess> = memberUid
        ? {
            memberUids: (existing.memberUids ?? []).filter((uid) => uid !== memberUid),
            members: (existing.members ?? []).filter((member) => member.uid !== memberUid),
          }
        : withoutInvite(existing, inviteEmail);
      tx.update(ref, patch);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[account/members] DELETE failed:', error);
    return NextResponse.json(
      { error: "Impossibile revocare l'accesso" },
      { status: 500 }
    );
  }
}
