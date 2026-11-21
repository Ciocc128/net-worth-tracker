/**
 * Read-only: the closed (paid) app-generated dividends and coupons whose quantity does not match
 * the trade ledger (doc/dividendi-quantita RQ12–RQ13, D-DV4). Nothing is written.
 *
 *   npm run dividends:check -- <email>           # PRODUCTION, with the service account of .env.local
 *   npm run dividends:check:emulator -- <email>  # the emulators
 *
 * Fix a listed payment from its dialog in Cashflow › Dividendi: the difference moves to the row
 * and the account, and the record is marked as corrected by hand.
 */
import { findQuantityMismatches } from '../lib/utils/dividendEntitlement';
import type { Asset } from '../types/assets';
import type { AssetTransaction } from '../types/assetTransactions';
import type { Dividend } from '../types/dividend';

const email = process.argv[2];
if (!email) {
  console.error('usage: npm run dividends:check -- <email>');
  process.exit(1);
}

async function adminApp() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.info(`→ EMULATORS (${process.env.FIRESTORE_EMULATOR_HOST})`);
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-net-worth' });
  }
  const nextEnvModule = (await import('@next/env')) as { default?: { loadEnvConfig(dir: string): unknown }; loadEnvConfig?(dir: string): unknown };
  (nextEnvModule.default ?? nextEnvModule).loadEnvConfig!(process.cwd());
  const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
  if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error('FIREBASE_ADMIN_* missing from .env.local');
  }
  console.info(`→ PRODUCTION (${FIREBASE_ADMIN_PROJECT_ID}), read only`);
  return initializeApp({
    credential: cert({ projectId: FIREBASE_ADMIN_PROJECT_ID, clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }),
  });
}

const toDate = (value: unknown): Date =>
  value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate(): Date }).toDate()
    : new Date(value as string | number | Date);

async function main() {
  const app = await adminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const db = getFirestore(app);
  const uid = (await getAuth(app).getUserByEmail(email)).uid;

  const [assetsSnap, txSnap, divSnap] = await Promise.all([
    db.collection('assets').where('userId', '==', uid).get(),
    db.collection('assetTransactions').where('userId', '==', uid).get(),
    db.collection('dividends').where('userId', '==', uid).get(),
  ]);

  const now = new Date();
  const transactions = txSnap.docs.map((doc) => {
    const data = doc.data();
    return { ...data, id: doc.id, date: toDate(data.date), createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) } as AssetTransaction;
  });
  const dividends = divSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      exDate: toDate(data.exDate),
      paymentDate: toDate(data.paymentDate),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as Dividend;
  });

  let total = 0;
  for (const assetDoc of assetsSnap.docs) {
    const asset = { id: assetDoc.id, ...assetDoc.data() } as Asset & { id: string };
    const assetDividends = dividends.filter((d) => d.assetId === asset.id);
    if (assetDividends.length === 0) continue;
    const assetTransactions = transactions.filter((t) => t.assetId === asset.id);
    const mismatches = findQuantityMismatches(assetDividends, assetTransactions, asset, now);
    if (mismatches.length === 0) continue;
    total += mismatches.length;
    console.info(`\n${asset.ticker} — ${asset.name}`);
    for (const m of mismatches) {
      const gain = assetDividends.find((d) => d.id === m.dividendId);
      const diff = gain ? (gain.dividendPerShare * (m.entitledQuantity - m.recordedQuantity)).toFixed(2) : '?';
      console.info(
        `  ${m.dividendType.padEnd(12)} ex ${m.exDate.toISOString().slice(0, 10)} pay ${m.paymentDate.toISOString().slice(0, 10)}  ` +
          `recorded ${m.recordedQuantity}  entitled ${m.entitledQuantity}  gross difference ${diff} ${gain?.currency ?? ''}`
      );
    }
  }
  console.info(total === 0 ? '\nNo mismatch: every closed payment matches the ledger.' : `\n${total} payment(s) to review.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
