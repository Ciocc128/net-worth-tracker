/**
 * The Essenziale view at 1440 (doc/essenziale/README.md acceptance 4–6) on its own fixture account, which the seed
 * puts in Essenziale (`userPreferences/test-user-essenziale.viewPreset`). Every test starts from Essenziale again.
 *
 * What only a browser can prove: the band draws the view's groups, a page of an area that is off opens with its line
 * and «Mostrala nel menu» brings it back without a reload, the account menu's «Completa» restores the menu, a reload
 * in Essenziale never shows a hidden entry (the pre-hydration CSS), and each door (P1–P4, P8) goes with its area.
 * The arithmetic of the areas is `__tests__/viewAreas.test.ts`.
 */
import { expect, test } from '@playwright/test';
import { openAccountMenu } from './account';
import { bandGroups, bandPages, pageReady, readView, resetToEssenziale, visibleTabs } from './essenzialeFixture';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
  await resetToEssenziale();
});

test('the band holds Panoramica, Entrate e spese, Investimenti, Storia; Cashflow has two tabs', async ({ page }) => {
  await page.goto('/dashboard/cashflow');
  await pageReady(page, 'Cashflow');
  await expect(bandGroups(page)).toHaveText(['Panoramica', 'Entrate e spese', 'Investimenti', 'Storia']);
  await expect(visibleTabs(page)).toHaveText(['Tracciamento', 'Budget']);

  // Investimenti holds Patrimonio alone; the Altro-sheet rule (an empty group goes) is the mobile spec's.
  await page.goto('/dashboard/assets');
  await pageReady(page, 'Patrimonio');
  await expect(bandPages(page)).toHaveText(['Patrimonio']);
});

test('a hidden page opens with its line; «Mostrala nel menu» puts it back in the band and the view is Personalizzata', async ({ page }) => {
  await page.goto('/dashboard/allocation');
  await pageReady(page, 'Allocazione');
  const notice = page.locator('[data-hidden-area="allocazione"]');
  await expect(notice).toContainText('Allocazione non è nel tuo menu.');
  // The open page stays in its group while the reader is on it.
  await expect(bandPages(page)).toHaveText(['Patrimonio', 'Allocazione']);

  await notice.getByRole('button', { name: 'Mostrala nel menu' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(async () => (await readView()).overrides).toEqual({ allocazione: true });

  // Without a reload: from Patrimonio the group now lists Allocazione (and not Rendimenti, still off).
  await bandPages(page).filter({ hasText: 'Patrimonio' }).click();
  await pageReady(page, 'Patrimonio');
  await expect(bandPages(page)).toHaveText(['Patrimonio', 'Allocazione']);

  await page.goto('/dashboard/settings?tab=funzioni');
  await pageReady(page, 'Impostazioni');
  await expect(page.locator('[data-view-personalized]')).toHaveText('Personalizzata');
  await expect(page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { checked: true })).toHaveCount(0);
});

test('a hidden tab asked for by ?tab= opens, with the line under the header', async ({ page }) => {
  await page.goto('/dashboard/cashflow?tab=dividends');
  await pageReady(page, 'Cashflow');
  await expect(page.locator('[data-hidden-area="dividendi"]')).toContainText('Dividendi non è nel tuo menu.');
  await expect(visibleTabs(page)).toHaveText(['Tracciamento', 'Budget', 'Dividendi']);
  // Back on Tracciamento the line goes and the tab leaves the bar.
  await visibleTabs(page).filter({ hasText: 'Tracciamento' }).click();
  await expect(page.locator('[data-hidden-area]')).toHaveCount(0);
  await expect(visibleTabs(page)).toHaveText(['Tracciamento', 'Budget']);
});

test('account menu › Completa restores the twelve entries; a reload in Essenziale never shows a hidden group', async ({ page }) => {
  await page.goto('/dashboard');
  await pageReady(page, 'Panoramica');
  await expect(bandGroups(page)).toHaveText(['Panoramica', 'Entrate e spese', 'Investimenti', 'Storia']);

  let menu = await openAccountMenu(page);
  await menu.getByRole('radio', { name: 'Completa' }).click();
  await page.keyboard.press('Escape');
  await expect(bandGroups(page)).toHaveText(['Panoramica', 'Entrate e spese', 'Investimenti', 'Futuro', 'Storia']);
  await expect.poll(async () => (await readView()).viewPreset).toBe('completa');

  menu = await openAccountMenu(page);
  await menu.getByRole('radio', { name: 'Essenziale' }).click();
  await page.keyboard.press('Escape');
  await expect(bandGroups(page)).toHaveText(['Panoramica', 'Entrate e spese', 'Investimenti', 'Storia']);
  await expect.poll(async () => (await readView()).viewPreset).toBe('essenziale');

  // From the storage the script in <head> hides the group before the first paint: sample every frame of the load.
  await page.addInitScript(() => {
    const w = window as unknown as { __sawFuturo: boolean };
    w.__sawFuturo = false;
    const sample = () => {
      for (const link of Array.from(document.querySelectorAll('[data-nav="folders"] a'))) {
        if (link.textContent?.trim() === 'Futuro' && getComputedStyle(link).display !== 'none') w.__sawFuturo = true;
      }
      if (performance.now() < 8000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.reload();
  await pageReady(page, 'Panoramica');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __sawFuturo: boolean }).__sawFuturo)).toBe(false);
});

test('the doors go with their area (P1–P4, P8) and come back in Completa', async ({ page }) => {
  // [path, page title, a tile that is there in both views (the page has drawn), the door's link selector]
  const checks: [string, string, string, string][] = [
    ['/dashboard', 'Panoramica', 'Composizione', 'a[href="/dashboard/allocation"]'], // P1 «Il piano in Allocazione.»
    ['/dashboard/assets', 'Patrimonio', 'Classi', 'a[href="/dashboard/allocation"]'], // P2 «Target e ribilanciamento in Allocazione.»
    ['/dashboard/assets', 'Patrimonio', 'Guadagno sul costo', 'a[href="/dashboard/performance"]'], // P4 «TWR e benchmark in Rendimenti.»
    ['/dashboard/history', 'Storico', 'Composizione', 'a[href="/dashboard/allocation"]'], // P3 «Vai all'Allocazione»
    // P8: the «Si regola altrove» pointers. The help sentences that name Strategia inside a tile («il risk-free vale
    // per … la formula per età di Allocazione › Strategia») explain a field and stay (D-ES13).
    ['/dashboard/settings?tab=investimenti', 'Impostazioni', 'Costi', 'a[aria-label="Apri Allocazione › Strategia"]'],
    ['/dashboard/settings?tab=investimenti', 'Impostazioni', 'Costi', 'a[aria-label="Apri FIRE › Il mio piano"]'],
  ];
  const open = async (path: string, title: string, tile: string) => {
    await page.goto(path);
    await pageReady(page, title);
    await expect(page.locator('main').getByText(tile, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  };
  const choose = async (preset: 'Completa' | 'Essenziale') => {
    await page.goto('/dashboard');
    await pageReady(page, 'Panoramica');
    const menu = await openAccountMenu(page);
    await menu.getByRole('radio', { name: preset }).click();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await readView()).viewPreset).toBe(preset.toLowerCase());
  };

  // Positive control first: in Completa every door is there, so the absence below is the view's, not the data's.
  await choose('Completa');
  for (const [path, title, tile, door] of checks) {
    await open(path, title, tile);
    await expect(page.locator(`main ${door}`).first(), `${path} → ${door} in Completa`).toBeVisible();
  }

  await choose('Essenziale');
  for (const [path, title, tile, door] of checks) {
    await open(path, title, tile);
    await expect(page.locator(`main ${door}`), `${path} → ${door} in Essenziale`).toHaveCount(0);
  }
});

test('«Verso il FIRE» is in Panoramica with FIRE off and a plan written; «Mostra FIRE nel menu» brings FIRE back and takes it away', async ({ page }) => {
  await page.goto('/dashboard');
  await pageReady(page, 'Panoramica');
  const tile = page.getByRole('region', { name: 'Verso il FIRE' });
  await expect(tile).toBeVisible({ timeout: 60_000 });
  // The figures are the Calculator's: the hero is a whole percent, the line says «{capitale} di {numero FIRE}» and a year.
  await expect(tile).toContainText(/\d+%/);
  await expect(tile).toContainText(/ di .*€/);
  await expect(tile).toContainText(/FIRE (previsto nel \d{4}|già raggiunto|oltre l.orizzonte)/);

  await tile.getByRole('button', { name: 'Mostra FIRE nel menu' }).click();
  await expect(tile).toHaveCount(0);
  await expect(bandGroups(page)).toHaveText(['Panoramica', 'Entrate e spese', 'Investimenti', 'Futuro', 'Storia']);
  await expect.poll(async () => (await readView()).overrides).toEqual({ fire: true });
});

test('in Completa «Verso il FIRE» is not in Panoramica', async ({ page }) => {
  await page.goto('/dashboard');
  await pageReady(page, 'Panoramica');
  const menu = await openAccountMenu(page);
  await menu.getByRole('radio', { name: 'Completa' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readView()).viewPreset).toBe('completa');
  await expect(page.getByRole('region', { name: 'Verso il FIRE' })).toHaveCount(0);
});
