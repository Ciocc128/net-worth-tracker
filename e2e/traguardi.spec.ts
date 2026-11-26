/**
 * Traguardi as a page of its own (RU11, doc/riordino-ui/ondata-3.md § 5.2, acceptance 8–9) — desktop, 1440, on the base
 * account, where «Traguardi di investimento» is OFF.
 *
 * What only a browser can say: with the switch off the menu has no «Traguardi» entry and the page opened by a link shows
 * its empty state with the way to Impostazioni › Funzioni; the old `?tab=goals` of FIRE lands on the page and Back returns
 * to where the reader was (a `replace`, not a `push`). The entry WITH the switch on is held by Vitest (`viewAreas.test.ts`)
 * and looked at on the census account in the Mac round.
 */

import { test, expect } from '@playwright/test';

test('the page opened by a link with the switch off says so and points at Impostazioni › Funzioni', async ({ page }) => {
  await page.goto('/dashboard/traguardi');
  await expect(page.getByRole('heading', { level: 1, name: 'Traguardi' })).toBeVisible({ timeout: 30_000 });
  const verdict = page.getByRole('region', { name: 'Verdetto sui traguardi' });
  await expect(verdict.getByRole('heading', { level: 2, name: 'I traguardi non sono attivi' })).toBeVisible({ timeout: 30_000 });
  const link = page.getByRole('link', { name: 'Abilita nelle Impostazioni' });
  await expect(link).toHaveAttribute('href', '/dashboard/settings?tab=funzioni');
});

test('with the switch off the menu has no «Traguardi» entry', async ({ page }) => {
  await page.goto('/dashboard/fire-simulations');
  await expect(page.getByRole('region', { name: 'Verdetto sul FIRE' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'FIRE', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Traguardi', exact: true })).toHaveCount(0);
});

test('?tab=goals of FIRE lands on the Traguardi page and Back returns to the page before', async ({ page }) => {
  await page.goto('/dashboard/history');
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/dashboard/fire-simulations?tab=goals');
  await page.waitForURL('**/dashboard/traguardi');
  await expect(page.getByRole('heading', { level: 1, name: 'Traguardi' })).toBeVisible({ timeout: 30_000 });
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/history/);
});
