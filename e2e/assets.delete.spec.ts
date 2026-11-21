/**
 * Patrimonio · Elimina uno strumento — the dialog says where the asset is used and makes the one
 * choice that is the user's (doc/cancellazione-strumenti/README.md § 4.6, AU15). Desktop 1440.
 *
 * What only a browser can prove: the single click on «Elimina» of the row opens a dialog instead of
 * arming a button; a sold-out instrument comes with «Tieni la storia» already chosen; an
 * instrument the model portfolio weighs has NO «Elimina» button, only «Chiudi»; choosing
 * «Cancella le operazioni» empties the ledger. Every outcome is asserted on Firestore (Admin
 * SDK), never on the look of the page. The server rules live in
 * __tests__/assetDeleteUsage.route.test.ts.
 *
 * The test plants its own instruments (decoy names absent from the seed) and removes what it and
 * the app created in `finally` — data-only, never a re-seed.
 */

import { test, expect } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const SOLD = 'e2e-delete-ornitorinco';
const MODELED = 'e2e-delete-fenicottero';

test.setTimeout(240_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

const asset = (name: string, quantity: number) => {
  const now = new Date();
  return {
    userId: UID, ticker: name.slice(0, 4).toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity, averageCost: 100, averageCostEur: 100, currentPrice: 100, isLiquid: true, autoUpdatePrice: false,
    taxRate: 26, allocationRole: 'tradable', createdAt: now, updatedAt: now, lastPriceUpdate: now,
  };
};

async function plant(db: FirebaseFirestore.Firestore) {
  const now = new Date();
  await db.collection('assets').doc(SOLD).set(asset('Ornitorinco ETF', 0));
  await db.collection('assets').doc(MODELED).set(asset('Fenicottero ETF', 10));
  const trades = [
    ['buy', new Date(2026, 0, 2), 10], ['sell', new Date(2026, 1, 2), 10],
  ] as const;
  for (const [index, [type, date, quantity]] of trades.entries()) {
    await db.collection('assetTransactions').doc(`${SOLD}-${index}`).set({
      userId: UID, assetId: SOLD, type, date, quantity, pricePerUnit: 100, priceEur: 100, createdAt: now, updatedAt: now,
    });
  }
  await db.collection('modelPortfolios').doc(UID).set({
    userId: UID, origin: 'manual', updatedAt: now,
    weights: [{ assetId: MODELED, targetPercentage: 100 }],
  });
}

async function remove(db: FirebaseFirestore.Firestore) {
  const trades = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', SOLD).get();
  for (const trade of trades.docs) await trade.ref.delete();
  await db.collection('assets').doc(SOLD).delete();
  await db.collection('assets').doc(MODELED).delete();
  await db.collection('modelPortfolios').doc(UID).delete();
}

test('the delete dialog stops on the model, and a sold-out instrument deletes with its ledger chosen', async ({ page }) => {
  const db = await admin();
  await remove(db);
  await plant(db);
  try {
    await page.goto('/dashboard/assets', { waitUntil: 'load' });
    const modeledRow = page.getByRole('row').filter({ hasText: 'Fenicottero' });
    await expect(modeledRow).toBeVisible({ timeout: 90_000 });

    // A weight in the model stops the deletion: the dialog names it, and has no «Elimina».
    await modeledRow.getByRole('button', { name: /^Elimina / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Ti ferma')).toBeVisible();
    await expect(dialog.getByText(/Il portafoglio modello gli dà il 100%/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Elimina', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Chiudi' }).first().click();
    await expect(dialog).toHaveCount(0);
    expect((await db.collection('assets').doc(MODELED).get()).exists).toBe(true);

    // Sold out, two ledger rows: «Tieni la storia» is already chosen; here we choose to delete them.
    const soldRow = page.getByRole('row').filter({ hasText: 'Ornitorinco' });
    await soldRow.getByRole('button', { name: /^Elimina / }).click();
    await expect(dialog.getByText(/Elimini Ornitorinco ETF \(2 operazioni\)/)).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Tieni la storia/ })).toBeChecked();
    await dialog.getByRole('radio', { name: /Cancella 2 operazioni/ }).click();
    await dialog.getByRole('button', { name: 'Elimina', exact: true }).click();

    // The open dialog hides the page from the accessibility tree: wait for it before looking at rows.
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('row').filter({ hasText: 'Ornitorinco' })).toHaveCount(0, { timeout: 30_000 });
    expect((await db.collection('assets').doc(SOLD).get()).exists).toBe(false);
    const left = await db.collection('assetTransactions').where('userId', '==', UID).where('assetId', '==', SOLD).get();
    expect(left.size).toBe(0);
  } finally {
    await remove(db);
  }
});
