/**
 * Authentication Context for Net Worth Tracker
 *
 * Manages user authentication state using Firebase Auth + Firestore dual-storage pattern.
 *
 * Architecture:
 * - displayName is stored in BOTH Firebase Auth profile AND Firestore document
 *   - Google OAuth users: displayName set in Firebase Auth profile automatically
 *   - Email/password users: displayName stored in Firestore only
 *   - The gate opens on what Auth knows (`setLoading(false)` in the `onAuthStateChanged`
 *     callback, nothing awaited, since 2026-09-28); the Firestore fallback lands afterwards and is
 *     copied into the Auth profile once, so the next sign-in needs no read (`resolveDisplayName`)
 *
 * - User creation is a two-step process:
 *   1. Create Firebase Auth user (email/password or Google OAuth)
 *   2. Create Firestore document with user data (email, displayName, createdAt)
 *   3. Set default asset allocation (60% equity, 40% bonds)
 *
 * - Registration validation (doc/sicurezza/S2-utenti-ammessi.md RU2):
 *   - email/password: /api/auth/check-registration BEFORE the Auth user exists (no orphan on a
 *     refused email), then /api/auth/activate right after it, BEFORE any Firestore write
 *   - Google: /api/auth/activate after signInWithPopup (Firebase cannot ask first)
 *   - The activation writes allowed-users/{uid} on the server; without it the rules deny every
 *     read and write, so a refused user cannot leave an orphan document: only the Auth user is
 *     deleted (else signed out)
 */
'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithPopup,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, type DocumentReference } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { User } from '@/types/assets';
import { getDefaultTargets, setSettings } from '@/lib/services/assetAllocationService';
import { waitForAuthTokenRefresh, retryFirestoreOperation } from '@/lib/utils/authHelpers';
import { resolveDisplayName, type UserDocumentName } from '@/lib/utils/authProfile';
import { isDemoUid } from '@/lib/utils/demoAccount';

/**
 * Authentication context interface
 *
 * Provides authentication state and methods for sign in, sign up, and sign out.
 */
interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Builds an Error that carries a machine-readable `code`, the way Firebase's own errors do.
 *
 * Why it matters: the pages translate a code into an Italian sentence through
 * `describeAuthError` (lib/utils/authNarrative.ts). A plain `new Error(message)` would
 * leave them nothing to map, so the reader would get either the provider's English string
 * or a cause-free fallback.
 */
function withCode(message: string, code: string): Error & { code: string } {
  const failure = new Error(message) as Error & { code: string };
  failure.code = code;
  return failure;
}

/**
 * The displayName fallback for email/password users, run AFTER the gate has opened.
 *
 * Google users carry the name in the Auth profile; email/password users only in `users/{uid}`.
 * This read used to be awaited before `setLoading(false)` — a Firestore round trip in front of
 * every page, sidebar included, until 2026-09-28. Now it lands when it arrives (the Panoramica's greeting
 * gains the name a frame later; its `useMemo` already depends on `user?.displayName`), and the
 * Auth profile learns it once, so from the next sign-in there is nothing to read. It never
 * throws: a name that cannot be read is not a failed sign-in.
 */
async function completeDisplayName(
  firebaseUser: FirebaseUser,
  setUser: Dispatch<SetStateAction<User | null>>,
): Promise<void> {
  let userDocument: UserDocumentName | null = null;
  try {
    const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
    userDocument = userSnap.exists() ? (userSnap.data() as UserDocumentName) : null;
  } catch (error) {
    console.error('Error fetching user displayName from Firestore:', error);
    return;
  }

  const { displayName, shouldBackfillAuthProfile } = resolveDisplayName(
    { displayName: firebaseUser.displayName },
    userDocument,
  );
  if (!displayName) return;

  // Only while the same user is still signed in: a sign-out that raced this read must not
  // bring the name back onto a null user.
  setUser((current) =>
    current && current.uid === firebaseUser.uid ? { ...current, displayName } : current,
  );

  // The demo account is read-only by contract («nessuna modifica viene salvata»): its Auth
  // profile stays as it is, and the fallback simply runs again next time.
  if (!shouldBackfillAuthProfile || isDemoUid(firebaseUser.uid)) return;
  try {
    await updateProfile(firebaseUser, { displayName });
  } catch (error) {
    // Best effort: the name is already on screen, and the fallback covers the next sign-in.
    console.warn('Could not copy displayName into the Auth profile:', error);
  }
}

/**
 * The registration in flight, if any. Between the Auth user's creation and the activation the
 * user is signed in but not admitted yet: the not-admitted check (RU7, `ActiveAccountProvider`)
 * waits for this promise instead of signing out someone who is registering.
 */
let pendingRegistration: Promise<unknown> | null = null;

/** Resolves when no registration is in flight (never rejects). */
export function waitForPendingRegistration(): Promise<void> {
  const current = pendingRegistration;
  return current ? current.then(() => undefined, () => undefined) : Promise.resolve();
}

function trackRegistration<T>(work: Promise<T>): Promise<T> {
  pendingRegistration = work;
  const clear = () => {
    if (pendingRegistration === work) pendingRegistration = null;
  };
  work.then(clear, clear);
  return work;
}

/**
 * Ask the server to admit the user just created (`POST /api/auth/activate`, RU2). On a refusal
 * the Auth user is deleted (else signed out) and the refusal is thrown with its code.
 */
async function activateNewUser(firebaseUser: FirebaseUser): Promise<void> {
  let response: Response;
  try {
    const idToken = await firebaseUser.getIdToken();
    response = await fetch('/api/auth/activate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch {
    await discardRefusedUser(firebaseUser);
    throw withCode('Unable to verify registration permissions.', 'auth/network-request-failed');
  }

  if (!response.ok) {
    // Why delete? Firebase Auth succeeded but the server refused: without the cleanup the
    // email stays taken by a user who can do nothing, and a later allowed retry fails.
    await discardRefusedUser(firebaseUser);
    const body = await response.json().catch(() => ({}));
    throw withCode(
      body.message || 'Registrations are currently closed.',
      typeof body.code === 'string' ? body.code : 'registration/not-allowed',
    );
  }
}

async function discardRefusedUser(firebaseUser: FirebaseUser): Promise<void> {
  try {
    await firebaseUser.delete();
  } catch (deleteError) {
    console.error('[CLEANUP_ERROR]', deleteError);
    // Prevents a stuck state where the user sees authenticated UI but has no permissions.
    await firebaseSignOut(auth);
  }
}

/**
 * The registration half of `signInWithGoogle`, for a new Google user (or one with no `users/{uid}`
 * document): activate on the server, clean up on a refusal, create the document and the default
 * allocation.
 * Module-level because it throws inside a try: keeps `AuthProvider` compilable by the React Compiler.
 */
async function registerGoogleUser(googleUser: FirebaseUser, userRef: DocumentReference): Promise<void> {
  try {
    await activateNewUser(googleUser);

    // Registration is allowed - wait for token refresh first
    console.log('[AuthContext] Google OAuth: Waiting for authentication token refresh...');
    await waitForAuthTokenRefresh(googleUser);

    // Create Firestore document
    await setDoc(userRef, {
      email: googleUser.email,
      displayName: googleUser.displayName || '',
      createdAt: new Date(),
    });

    // Set default asset allocation (60% equity, 40% bonds)
    // Wrapped in retry logic as additional safety net for permission synchronization
    await retryFirestoreOperation(async () => {
      await setSettings(googleUser.uid, {
        targets: getDefaultTargets(),
      });
    });
  } catch (error: unknown) {
    // Re-throw AS IS: wrapping in a fresh Error would drop the `code` the page needs
    // to say the failure in words (see withCode above).
    throw error instanceof Error
      ? error
      : new Error('Unable to verify registration permissions.');
  }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

/**
 * Hook to access authentication context
 *
 * Must be used within an AuthProvider component.
 * Throws error if used outside of AuthProvider to catch setup mistakes early.
 *
 * @returns AuthContextType with user state and auth methods
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const reveal = () => {
        // Unblock on what Auth already knows — nothing is awaited in front of the shell. React
        // batches the two calls into ONE commit, so the sidebar's profile and the page arrive
        // together (the benchmark's auth marker counts on it, scripts/perfBenchmark.mjs).
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        });
        setLoading(false);

        if (!firebaseUser.displayName) {
          void completeDisplayName(firebaseUser, setUser);
        }
      };

      // A registration in flight (S2 RU2): the user exists in Auth but the server has not admitted
      // it yet, so every read would be denied. The pages see the user only once the activation has
      // answered — and not at all when it refused and deleted the user.
      if (pendingRegistration) {
        void waitForPendingRegistration().then(() => {
          if (auth.currentUser?.uid === firebaseUser.uid) reveal();
        });
        return;
      }
      reveal();
    });

    return () => unsubscribe();
  }, []);

  /**
   * Sign in existing user with email and password
   */
  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  /**
   * Register new user with email and password
   *
   * 1. Check registration permissions (server-side whitelist)
   * 2. Create Firebase Auth user and activate it on the server (allowed-users/{uid})
   * 3. Create Firestore user document
   * 4. Set default asset allocation
   */
  const signUp = async (email: string, password: string, displayName?: string) => {
    // Step 1: Check registration permissions (server-side whitelist)
    // Why check before creating user? Prevents orphan Auth users if registration denied.
    let response: Response;
    try {
      response = await fetch('/api/auth/check-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // The request never reached the route: report it in the provider's own vocabulary
      // so describeAuthError() can say "nessuna connessione" rather than falling back to
      // a cause-free sentence.
      throw withCode('Unable to verify registration permissions.', 'auth/network-request-failed');
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw withCode(
        body.message || 'Registrations are currently closed.',
        typeof body.code === 'string' ? body.code : 'registration/not-allowed',
      );
    }

    // Step 2: Create Firebase Auth user, then have the SERVER admit it (RU2) before any
    // Firestore write: without allowed-users/{uid} the rules deny them all.
    const { user: firebaseUser } = await trackRegistration(
      createUserWithEmailAndPassword(auth, email, password).then(async (credential) => {
        await activateNewUser(credential.user);
        return credential;
      }),
    );

    // Step 3: Wait for Auth token refresh to ensure Firestore permissions are synchronized
    // This prevents PERMISSION_DENIED errors when creating user documents
    console.log('[AuthContext] Waiting for authentication token refresh...');
    await waitForAuthTokenRefresh(firebaseUser);

    // Step 4: Update Firebase Auth profile with displayName if provided
    if (displayName) {
      await updateProfile(firebaseUser, {
        displayName: displayName,
      });
    }

    // Step 5: Create Firestore user document with metadata
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      email: firebaseUser.email,
      displayName: displayName || '',
      createdAt: new Date(),
    });

    // Step 6: Set default asset allocation (60% equity, 40% bonds)
    // Wrapped in retry logic as additional safety net for permission synchronization
    await retryFirestoreOperation(async () => {
      await setSettings(firebaseUser.uid, {
        targets: getDefaultTargets(),
      });
    });
  };

  /**
   * Sign in or register with Google OAuth
   *
   * 1. Trigger Google OAuth popup (Firebase limitation: cannot validate before this)
   * 2. A new Auth user is a registration: activate on the server (RU2); refused → the Auth user
   *    is deleted, so the person can retry once allowed
   * 3. A returning user goes on as before; one who is not admitted is signed out by RU7
   *
   * Why the activation happens AFTER OAuth?
   * Firebase signInWithPopup creates Auth user immediately - we can't prevent this.
   */
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await trackRegistration(
      (async () => {
        const result = await signInWithPopup(auth, provider);
        const userRef = doc(db, 'users', result.user.uid);

        // A brand-new Auth user is a registration: the server decides (RU2).
        if (getAdditionalUserInfo(result)?.isNewUser) {
          await registerGoogleUser(result.user, userRef);
          return;
        }

        // A returning user. Not admitted → the read is denied and the not-admitted check (RU7)
        // signs them out with the reason; never delete an account that already existed.
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch {
          return;
        }
        // Admitted, but the profile was never written (an interrupted registration): finish it.
        if (!userSnap.exists() && result.user.email) {
          await registerGoogleUser(result.user, userRef);
        }
      })(),
    );
  };

  /**
   * Sign out current user
   */
  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
