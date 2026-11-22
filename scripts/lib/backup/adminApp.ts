/**
 * The Admin app of a backup script: the EMULATORS when `FIRESTORE_EMULATOR_HOST` is set, otherwise
 * PRODUCTION with the service account of `.env.local` (FIREBASE_ADMIN_*), like `users:allow`.
 * It says which one before anything is read or written.
 */
import type { App } from 'firebase-admin/app';

export interface BackupTarget {
  app: App;
  projectId: string;
  source: 'production' | 'emulator';
}

export async function backupAdminApp(): Promise<BackupTarget> {
  const { initializeApp, cert } = await import('firebase-admin/app');
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || 'demo-net-worth';
    console.info(`→ EMULATORI (${process.env.FIRESTORE_EMULATOR_HOST}, ${projectId})`);
    return { app: initializeApp({ projectId }), projectId, source: 'emulator' };
  }
  // `@next/env` is CJS: under a dynamic import its API may sit on `default` or on the namespace itself.
  const nextEnvModule = (await import('@next/env')) as { default?: { loadEnvConfig(dir: string): unknown }; loadEnvConfig?(dir: string): unknown };
  (nextEnvModule.default ?? nextEnvModule).loadEnvConfig!(process.cwd());
  const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
  if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error('FIREBASE_ADMIN_* missing from .env.local');
  }
  console.info(`→ PRODUZIONE (${FIREBASE_ADMIN_PROJECT_ID})`);
  const app = initializeApp({
    credential: cert({ projectId: FIREBASE_ADMIN_PROJECT_ID, clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }),
  });
  return { app, projectId: FIREBASE_ADMIN_PROJECT_ID, source: 'production' };
}
