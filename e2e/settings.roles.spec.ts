/**
 * Impostazioni › Spese › Ruoli 50/30/20 — the opt-in switch and the category dialog's role picker,
 * at 1440px on the base account (`test@example.com`).
 *
 * Unlike settings.spec.ts these tests WRITE: the switch is saved and a category's role is set and
 * cleared, each outcome read back from the emulator (never from the look of the page). Everything
 * they touch is restored in `afterAll`: the settings document exactly as it was (a page «Salva»
 * rewrites the whole document, normalising the seed's sub-targets, which settings.spec.ts reads),
 * and no role on «Alimentari» (`seed-cat-food`).
 *
 * What only a browser can prove here: the switch lives in Spese and its dirty state belongs to that
 * tab; the dialog shows the picker only with the switch on; «Da classificare» DELETES the stored
 * field (deleteField — a plain update would keep the old role); a dialog opened with the switch off
 * neither shows nor rewrites a stored role.
 */

import { test, expect, type Page } from '@playwright/test';

const DOCUMENTS = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const SETTINGS_DOC = `${DOCUMENTS}/assetAllocationTargets/test-user-1`;
const FOOD_DOC = `${DOCUMENTS}/expenseCategories/seed-cat-food`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

type Fields = Record<string, { booleanValue?: boolean; stringValue?: string }>;

async function readFields(url: string): Promise<Fields> {
  const res = await fetch(url, { headers: OWNER });
  return ((await res.json()) as { fields: Fields }).fields;
}

/** PATCH one field; `undefined` deletes it (a field in the mask but not in the body). */
async function patchField(url: string, field: string, value: Fields[string] | undefined): Promise<void> {
  const res = await fetch(`${url}?updateMask.fieldPaths=${field}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: value ? { [field]: value } : {} }),
  });
  expect(res.ok).toBe(true);
}

const setFlag = (enabled: boolean) => patchField(SETTINGS_DOC, 'spendingRolesEnabled', { booleanValue: enabled });
const setFoodRole = (role: string | undefined) => patchField(FOOD_DOC, 'spendingRole', role ? { stringValue: role } : undefined);

async function openSpese(page: Page) {
  await page.goto('/dashboard/settings?tab=spese', { waitUntil: 'load' });
  await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
  await expect(rolesTile(page)).toBeVisible({ timeout: 30_000 });
}

const rolesTile = (page: Page) => page.getByRole('region', { name: 'Ruoli 50/30/20' });
const unsavedBar = (page: Page) => page.getByRole('region', { name: 'Modifiche non salvate' });
const dialog = (page: Page) => page.getByRole('dialog');

async function editFood(page: Page) {
  await page.getByRole('button', { name: 'Modifica Alimentari' }).click();
  await expect(dialog(page)).toBeVisible();
}

async function saveDialog(page: Page) {
  await dialog(page).getByRole('button', { name: 'Salva Modifiche' }).click();
  await expect(dialog(page)).toHaveCount(0);
}

let savedSettings: Fields;

test.beforeAll(async () => {
  savedSettings = await readFields(SETTINGS_DOC);
  await setFlag(false);
  await setFoodRole(undefined);
});

test.afterAll(async () => {
  // No update mask: the whole document is replaced by the one read before the first test.
  const res = await fetch(SETTINGS_DOC, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: savedSettings }) });
  expect(res.ok).toBe(true);
  await setFoodRole(undefined);
});

test('the switch lives in Spese, off by default; switched on and saved, it writes the flag', async ({ page }) => {
  await openSpese(page);
  const tile = rolesTile(page);
  await expect(tile).toContainText('Spenti: il flusso di Analisi si legge solo per tipo di spesa.');
  const toggle = tile.getByRole('switch', { name: 'Necessità, desideri, risparmi' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.click();
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Spese');
  await unsavedBar(page).getByRole('button', { name: 'Salva' }).click();
  await expect(unsavedBar(page)).toHaveCount(0);

  await expect.poll(async () => (await readFields(SETTINGS_DOC)).spendingRolesEnabled?.booleanValue).toBe(true);
  // Two spending categories in the seed (Alimentari, Casa), none classified.
  await expect(tile).toContainText('Attivi: 0 categorie di spesa su 2 hanno un ruolo; 2 finiscono in «Da classificare».');
});

test('the dialog sets a role, and «Da classificare» deletes the stored field', async ({ page }) => {
  await setFlag(true);
  await openSpese(page);

  await editFood(page);
  await dialog(page).getByRole('combobox', { name: 'Ruolo 50/30/20' }).click();
  await page.getByRole('option', { name: /^Necessità/ }).click();
  await saveDialog(page);
  await expect.poll(async () => (await readFields(FOOD_DOC)).spendingRole?.stringValue).toBe('need');
  await expect(rolesTile(page)).toContainText('Attivi: 1 categoria di spesa su 2 ha un ruolo; 1 finisce in «Da classificare».');

  await editFood(page);
  await dialog(page).getByRole('combobox', { name: 'Ruolo 50/30/20' }).click();
  await page.getByRole('option', { name: /^Da classificare/ }).click();
  await saveDialog(page);
  await expect.poll(async () => 'spendingRole' in (await readFields(FOOD_DOC))).toBe(false);
});

test('with the switch off the dialog neither shows nor rewrites a stored role', async ({ page }) => {
  await setFlag(false);
  await setFoodRole('want');
  await openSpese(page);

  await editFood(page);
  await expect(dialog(page).getByRole('combobox', { name: 'Ruolo 50/30/20' })).toHaveCount(0);
  await saveDialog(page);

  // The role the dialog never showed is still there.
  await expect.poll(async () => (await readFields(FOOD_DOC)).spendingRole?.stringValue).toBe('want');
});
