/**
 * The Essenziale view's fixture account (doc/essenziale/README.md acceptance 4–6) — its OWN account,
 * `essenziale@example.com` / `test1234` (uid `test-user-essenziale`).
 *
 * Run via `npm run e2e:seed:essenziale` (emulators only): the npm script first seeds the base portfolio for this uid
 * (`scripts/seedEmulator.ts` with `SEED_UID`/`SEED_EMAIL`: same instruments, snapshots and rows, ids prefixed), then
 * this file writes the view. Playwright's global setup runs both before every suite.
 *
 * WHY A SEPARATE ACCOUNT: the view is the viewer's (`userPreferences/{uid}`). Putting the base account in Essenziale
 * would take Allocazione, Rendimenti, FIRE and Dividendi out of every other spec's menu; the census and every other
 * fixture stay in Completa (`allowUser` writes no view, D-ES3).
 *
 * The document is REPLACED, not merged: a run left «Personalizzata» or «Completa» by a spec starts Essenziale again.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:essenziale`.');
  process.exit(1);
}

export const ESSENZIALE_UID = 'test-user-essenziale';

if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-net-worth' });
const db = getFirestore();

await db.collection('userPreferences').doc(ESSENZIALE_UID).set({ viewPreset: 'essenziale' });
console.info('  ✓ userPreferences: viewPreset essenziale');
process.exit(0);
