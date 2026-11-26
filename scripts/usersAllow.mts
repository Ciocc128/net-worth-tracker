/**
 * The owner's script for the list of admitted users (doc/sicurezza/S2-utenti-ammessi.md RU6).
 *
 *   npm run users:allow -- <email>            # admit the Auth user with that email (source: 'script');
 *                                             # a user not admitted before starts in the Essenziale view
 *   npm run users:allow -- <email> --completa # the same, starting in the Completa view
 *   npm run users:allow -- --remove <email>   # take them off the list
 *   npm run users:allow -- --list             # uid, email, date, source of every admitted user
 *
 * Against PRODUCTION by default (a write asks for the project id typed, F11 S1; `--list` only reads), with the service account of `.env.local` (FIREBASE_ADMIN_*), like
 * `mirror:seed`. With `FIRESTORE_EMULATOR_HOST` set (`npm run users:allow:emulator -- …`) it talks
 * to the emulators instead, and says so before doing anything.
 *
 * The migration of F04 (RU8): run it for the owner BEFORE the deploy and before publishing the rules.
 */
import { allowUser, disallowUser } from './lib/allowUser';
import { ALLOWED_USERS_COLLECTION } from '../types/account';
import { USER_PREFERENCES_COLLECTION, shouldWriteInitialViewPreset } from '../lib/constants/viewAreas';
import { confirmProductionWrite } from './lib/confirmProduction';

const args = process.argv.slice(2);
const USAGE = 'usage: npm run users:allow -- <email> [--completa] | --remove <email> | --list';

async function adminApp() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.info(`→ EMULATORS (${process.env.FIRESTORE_EMULATOR_HOST})`);
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-net-worth' });
  }
  // `@next/env` is CJS: under a dynamic import its API may sit on `default` or on the namespace itself.
  const nextEnvModule = (await import('@next/env')) as { default?: { loadEnvConfig(dir: string): unknown }; loadEnvConfig?(dir: string): unknown };
  (nextEnvModule.default ?? nextEnvModule).loadEnvConfig!(process.cwd());
  const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
  if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error('FIREBASE_ADMIN_* missing from .env.local');
  }
  console.info(`→ PRODUCTION (${FIREBASE_ADMIN_PROJECT_ID})`);
  return initializeApp({
    credential: cert({ projectId: FIREBASE_ADMIN_PROJECT_ID, clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }),
  });
}

async function main() {
  const [first, second] = args;
  if (!first) throw new Error(USAGE);

  const app = await adminApp();
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const db = getFirestore(app);

  if (first === '--list') {
    const snap = await db.collection(ALLOWED_USERS_COLLECTION).get();
    if (snap.empty) console.info('(nessun utente ammesso)');
    for (const doc of snap.docs) {
      const data = doc.data();
      const granted = data.grantedAt instanceof Timestamp ? data.grantedAt.toDate().toISOString() : String(data.grantedAt ?? '');
      console.info(`${doc.id}\t${data.email ?? ''}\t${granted}\t${data.source ?? ''}`);
    }
    return;
  }

  const remove = first === '--remove';
  const completa = args.includes('--completa');
  const email = (remove ? second : first)?.trim().toLowerCase();
  if (!email || email.startsWith('--')) throw new Error(USAGE);

  const user = await getAuth(app).getUserByEmail(email);
  // F11 S1: a write to production asks for the project id typed; the emulators do not.
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    await confirmProductionWrite(process.env.FIREBASE_ADMIN_PROJECT_ID ?? '', remove ? `users:allow --remove ${email}` : `users:allow ${email}`);
  }
  if (remove) {
    await disallowUser(db, user.uid);
    console.info(`✓ tolto dalla lista: ${email} (${user.uid})`);
  } else {
    const wasAllowed = (await db.collection(ALLOWED_USERS_COLLECTION).doc(user.uid).get()).exists;
    await allowUser(db, user.uid, email, 'script');
    console.info(`✓ ammesso: ${email} (${user.uid})`);
    // D-ES3 (doc/essenziale/README.md § 5.2): the FIRST admission starts the viewer in Essenziale (`--completa`: in
    // Completa); a user already admitted, or one who already chose a view, keeps theirs. `allowUser` alone (the seeds)
    // writes no view, so the fixtures stay in Completa.
    if (!wasAllowed) {
      const preferencesRef = db.collection(USER_PREFERENCES_COLLECTION).doc(user.uid);
      const preferences = await preferencesRef.get();
      if (shouldWriteInitialViewPreset(preferences.exists ? preferences.data() : undefined)) {
        const viewPreset = completa ? 'completa' : 'essenziale';
        await preferencesRef.set({ viewPreset }, { merge: true });
        console.info(`✓ vista iniziale: ${viewPreset === 'essenziale' ? 'Essenziale' : 'Completa'}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
