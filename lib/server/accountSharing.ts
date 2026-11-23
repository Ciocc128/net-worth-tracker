import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import {
  ACCOUNT_ACCESS_COLLECTION,
  AccountAccess,
  AccountInvite,
  AccountMember,
} from '@/types/account';

/**
 * The sharing of an account as the two routes answer it (doc/sicurezza/S2-utenti-ammessi.md
 * RU12–RU16): `account/members` (the owner's side) and `account/invites` (the invited person's).
 * Dates travel as ISO strings; nothing here ever resolves an email to a uid.
 */

export interface MemberResponse {
  uid: string;
  email: string;
  displayName: string | null;
  addedAt: string;
}

export interface InviteResponse {
  email: string;
  invitedAt: string;
}

/** An invitation addressed to the caller (RU14 `received`). */
export interface ReceivedInviteResponse {
  ownerUid: string;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  invitedAt: string;
}

/** A stored date (Firestore Timestamp, or a Date from a plain write) as ISO; now when missing. */
export function toIso(value: unknown): string {
  const date =
    value && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : value;
  return date instanceof Date ? date.toISOString() : new Date().toISOString();
}

export function toMemberResponse(member: AccountMember): MemberResponse {
  return {
    uid: member.uid,
    email: member.email,
    displayName: member.displayName ?? null,
    addedAt: toIso(member.addedAt),
  };
}

export function toInviteResponse(invite: AccountInvite): InviteResponse {
  return { email: invite.email, invitedAt: toIso(invite.invitedAt) };
}

/** The one spelling of an email the invitations store and compare: trimmed, lowercased. */
export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** A light shape check: something@something.something, no spaces. */
export function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function accountAccessRef(ownerUid: string) {
  return adminDb.collection(ACCOUNT_ACCESS_COLLECTION).doc(ownerUid);
}

/**
 * The document without the invitation for `email`: both arrays of RU12 lose it together, so
 * `inviteEmails` (what the query reads) and `invites` (what the tile shows) never disagree.
 */
export function withoutInvite(access: AccountAccess, email: string): Pick<AccountAccess, 'inviteEmails' | 'invites'> {
  return {
    inviteEmails: (access.inviteEmails ?? []).filter((candidate) => candidate !== email),
    invites: (access.invites ?? []).filter((invite) => normalizeEmail(invite.email) !== email),
  };
}
