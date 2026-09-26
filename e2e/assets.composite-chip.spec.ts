/**
 * Patrimonio › Strumenti — the class chip of a COMPOSITE instrument, desktop 1440 and phone 390.
 *
 * What only a browser can prove: the row stays ONE row under its prevailing class, while its chip
 * splits into proportional segments («Azioni · Obbl.» with the 60/40 stops in its gradient) and says
 * the shares to a screen reader; a leg under 5% gets no segment (a 97/3 fund reads «Azioni», plain
 * width); the group header keeps the plain chip; on a phone the chip fits the row without pushing
 * the page sideways. The label and share rules live in __tests__/assetDisplayClass.test.ts.
 *
 * The base seed has no composite instrument, so the test plants two (decoy names absent from the
 * seed) with the Admin SDK and removes them in `finally` — data-only, never a re-seed
 * (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)).
 */

import { test, expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';
const PELLICANO = { id: 'e2e-composite-pellicano', name: 'Fondo Pellicano Bilanciato', ticker: 'PELLICANO' };
const CAPIBARA = { id: 'e2e-composite-capibara', name: 'ETF Capibara Quasi Puro', ticker: 'CAPIBARA' };

test.setTimeout(180_000);

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return getFirestore(app);
}

async function plant(db: FirebaseFirestore.Firestore) {
  const now = new Date();
  const fixtures = [
    { ...PELLICANO, composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }] },
    { ...CAPIBARA, composition: [{ assetClass: 'equity', percentage: 97 }, { assetClass: 'cash', percentage: 3 }] },
  ];
  for (const f of fixtures) {
    await db.collection('assets').doc(f.id).set({
      userId: UID, ticker: f.ticker, name: f.name, type: 'etf', assetClass: 'equity', subCategory: 'All-World',
      currency: 'EUR', quantity: 10, averageCost: 100, averageCostEur: 100, currentPrice: 100, isLiquid: true,
      autoUpdatePrice: false, allocationRole: 'tradable', composition: f.composition, createdAt: now, updatedAt: now,
    });
    await db.collection('assetTransactions').doc(`${f.id}-baseline`).set({
      userId: UID, assetId: f.id, type: 'buy', date: new Date(2026, 0, 2), quantity: 10,
      pricePerUnit: 100, priceEur: 100, isBaseline: true, createdAt: now, updatedAt: now,
    });
  }
}

async function remove(db: FirebaseFirestore.Firestore) {
  for (const { id } of [PELLICANO, CAPIBARA]) {
    await db.collection('assetTransactions').doc(`${id}-baseline`).delete();
    await db.collection('assets').doc(id).delete();
  }
}

async function openPatrimonio(page: Page, width: number) {
  await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  // Both the desktop table and the phone rows are in the DOM, one hidden by CSS: wait for the visible one.
  await expect(page.getByText(PELLICANO.name).filter({ visible: true }).first()).toBeVisible({ timeout: 90_000 });
}

test('a composite instrument keeps one row and splits its class chip — desktop 1440', async ({ page }) => {
  const db = await admin();
  await remove(db);
  await plant(db);
  try {
    await openPatrimonio(page, 1440);

    const pellicanoRow = page.getByRole('row').filter({ hasText: PELLICANO.name });
    await expect(pellicanoRow).toHaveCount(1);
    const chip = pellicanoRow.locator('[data-composite-chip]');
    await expect(chip).toHaveText(/Azioni · Obbl\./);
    // The shares are sr-only TEXT, so they are part of the chip's content and of the row's name.
    await expect(chip.locator('.sr-only')).toHaveText('Azioni 60%, Obbligazioni 40%');
    const style = (await chip.getAttribute('style')) ?? '';
    expect(style).toContain('0% 60%');
    expect(style).toContain('60% 100%');
    expect((await chip.boundingBox())!.width).toBeGreaterThanOrEqual(112);

    // 97/3: the 3% has no segment and no word — the chip reads like a plain «Azioni» at plain width.
    const capibaraChip = page.getByRole('row').filter({ hasText: CAPIBARA.name }).locator('[data-composite-chip]');
    await expect(capibaraChip.locator('[data-chip-label]')).toHaveText('Azioni');
    await expect(capibaraChip.locator('.sr-only')).toHaveText('Azioni 97%, Liquidità 3%');
    expect((await capibaraChip.boundingBox())!.width).toBeLessThan(112);

    // The group header names the group: its chip stays plain.
    const groupHeader = page.getByRole('button', { name: /^Azioni\b.*strument/ }).first();
    await expect(groupHeader.locator('[data-composite-chip]')).toHaveCount(0);
  } finally {
    await remove(db);
  }
});

test('the composite chip fits a phone row without pushing the page sideways — 390', async ({ page }) => {
  const db = await admin();
  await remove(db);
  await plant(db);
  try {
    await openPatrimonio(page, 390);

    // The row's own toggle (the row also carries «Elimina …», whose name names the instrument too).
    const rowButton = page.locator(`button[aria-controls="asset-row-${PELLICANO.id}"]`);
    await expect(rowButton).toContainText('Azioni 60%, Obbligazioni 40%');
    const chip = rowButton.locator('[data-composite-chip]');
    await expect(chip).toBeVisible();

    const chipBox = (await chip.boundingBox())!;
    const rowBox = (await rowButton.boundingBox())!;
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await remove(db);
  }
});
