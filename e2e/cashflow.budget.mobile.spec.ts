/**
 * Cashflow › Budget on a phone — the touch targets the 2026-09-14 critique measured under 44px:
 * the settings' ceiling input, the four threshold chips and the switch's row, and the dialog's
 * radios, select and amount input. Every one is at least 44px tall on touch now; with a mouse
 * from `desktop:` they keep the dense sizes (AGENTS.md → Accessibility). Base account, `mobile`
 * project (390×844, touch).
 */

import { test, expect, type Locator } from '@playwright/test';

async function heightOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  return box ? Math.round(box.height) : 0;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/cashflow?tab=budget');
  await expect(page.getByRole('region', { name: 'Verdetto sul budget' })).toBeVisible({ timeout: 30_000 });
});

test('the settings and the dialog controls are 44px targets on touch', async ({ page }) => {
  // The base account has no ceiling: «Imposta il tetto» opens «Tetto e avvisi» (the pencil does once there is one).
  await page.getByRole('button', { name: 'Imposta il tetto', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Tetto e avvisi' });
  await expect(settings).toBeVisible();
  const ceiling = settings.getByRole('region', { name: 'Tetto complessivo mensile' });
  expect(await heightOf(ceiling.getByLabel('Tetto (€)'))).toBeGreaterThanOrEqual(44);

  const alerts = settings.getByRole('region', { name: 'Avvisi soglia' });
  for (const chip of await alerts.getByRole('group', { name: 'Soglie di avviso' }).getByRole('button').all()) {
    expect(await heightOf(chip)).toBeGreaterThanOrEqual(44);
  }
  // The switch itself is 20px; its label is the 44px target that toggles it.
  expect(await heightOf(alerts.getByText('Avvisi attivi'))).toBeGreaterThanOrEqual(44);

  // «Annulla» closes and discards; then the add dialog, as a drawer.
  await settings.getByRole('button', { name: 'Annulla' }).click();
  await expect(settings).toBeHidden();
  await page.getByRole('button', { name: 'Aggiungi budget', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const radio of await dialog.getByRole('radio').all()) expect(await heightOf(radio)).toBeGreaterThanOrEqual(44);
  expect(await heightOf(dialog.locator('#budget-category'))).toBeGreaterThanOrEqual(44);
  expect(await heightOf(dialog.locator('#budget-amount'))).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
