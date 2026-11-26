/**
 * The Essenziale view at 390 (doc/essenziale/README.md acceptance 4): the «Altro» sheet reads the view's groups — a
 * group left with no entry goes with its label (Investimenti: Patrimonio is in the pill) — and a hidden page opens
 * with its line, whose button brings the entry back into the sheet. The pill itself does not change.
 */
import { expect, test, type Page } from '@playwright/test';
import { pageReady, readView, resetToEssenziale } from './essenzialeFixture';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
  await resetToEssenziale();
});

async function openAltro(page: Page) {
  await page.getByRole('button', { name: /Altro/ }).filter({ visible: true }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Menu secondario' });
  await expect(sheet).toBeVisible();
  return sheet.getByRole('navigation', { name: 'Navigazione secondaria' });
}

test('the Altro sheet holds the view\'s groups; a hidden page opens with its line and comes back into the sheet', async ({ page }) => {
  await page.goto('/dashboard');
  await pageReady(page, 'Panoramica');
  let sheet = await openAltro(page);
  await expect(sheet.getByRole('link', { name: 'Analisi spese' })).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Storico' })).toBeVisible();
  for (const name of ['Allocazione', 'Rendimenti', 'FIRE e Simulazioni', 'Previdenza']) {
    await expect(sheet.getByRole('link', { name })).toHaveCount(0);
  }
  await expect(sheet.getByText('Investimenti', { exact: true })).toHaveCount(0);
  await expect(sheet.getByText('Futuro', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/dashboard/pension');
  await pageReady(page, 'Previdenza');
  const notice = page.locator('[data-hidden-area="previdenza"]');
  await expect(notice).toContainText('Previdenza non è nel tuo menu.');
  await notice.getByRole('button', { name: 'Mostrala nel menu' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(async () => (await readView()).overrides).toEqual({ previdenza: true });

  // From another page, so the entry is the view's and not the open page's.
  await page.goto('/dashboard');
  await pageReady(page, 'Panoramica');
  sheet = await openAltro(page);
  await expect(sheet.getByRole('link', { name: 'Previdenza' })).toBeVisible();
  await expect(sheet.getByText('Futuro', { exact: true })).toBeVisible();
});
