import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getApiAuthErrorResponse, verifyFirebaseToken } from '@/lib/server/apiAuth';
import { isRegistrationAllowed } from '@/lib/server/registrationPolicy';
import { ALLOWED_USERS_COLLECTION, type AllowedUser } from '@/types/account';
import {
  FIRST_ADMISSION_VIEW_PRESET,
  USER_PREFERENCES_COLLECTION,
  shouldWriteInitialViewPreset,
} from '@/lib/constants/viewAreas';

/**
 * POST /api/auth/activate — how a user enters `allowed-users` at registration
 * (doc/sicurezza/S2-utenti-ammessi.md RU2, D-SI11).
 *
 * The one private route that verifies the ID token WITHOUT asking for the list: the caller is,
 * by definition, not admitted yet. It takes no body — the email it judges is the TOKEN's, so a
 * caller cannot name someone else's whitelisted address.
 *
 * - 200 `{ allowed: true }`: already admitted (nothing written), or admitted now
 *   (`source: 'registration'`). The first admission also starts the viewer in the Essenziale view
 *   (`userPreferences/{uid}.viewPreset`, doc/essenziale/README.md § 5.2, D-ES3) unless they already chose one.
 * - 403 `{ allowed: false, code: 'registration/not-allowed' }`: the token has no email, or the
 *   registration policy refuses it; nothing is written.
 * - 401: no token, or an invalid one.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseToken(request);
    const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(decodedToken.uid);

    if ((await ref.get()).exists) {
      return NextResponse.json({ allowed: true });
    }

    const email = typeof decodedToken.email === 'string' ? decodedToken.email.trim().toLowerCase() : '';
    if (!email || !isRegistrationAllowed(email)) {
      console.warn(`[ACTIVATION_REFUSED] uid ${decodedToken.uid} at ${new Date().toISOString()}`);
      return NextResponse.json(
        {
          allowed: false,
          // The client says it in its own words (lib/utils/authNarrative.ts), as for check-registration.
          code: 'registration/not-allowed',
          message: 'Le registrazioni sono attualmente chiuse o la tua email non è autorizzata.',
        },
        { status: 403 }
      );
    }

    const document: AllowedUser = {
      uid: decodedToken.uid,
      email,
      grantedAt: new Date(),
      source: 'registration',
    };
    await ref.set(document);
    // D-ES3: a new account starts in Essenziale — written here, in the branch that admits, never in «già ammesso».
    const preferencesRef = adminDb.collection(USER_PREFERENCES_COLLECTION).doc(decodedToken.uid);
    const preferences = await preferencesRef.get();
    if (shouldWriteInitialViewPreset(preferences.exists ? preferences.data() : undefined)) {
      await preferencesRef.set({ viewPreset: FIRST_ADMISSION_VIEW_PRESET }, { merge: true });
    }
    return NextResponse.json({ allowed: true });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[ACTIVATION_ERROR]', error);
    return NextResponse.json(
      { error: 'Si è verificato un errore durante l’attivazione. Riprova più tardi.' },
      { status: 500 }
    );
  }
}
