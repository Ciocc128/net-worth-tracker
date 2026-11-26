/**
 * FIRE in three tabs (RU10, doc/riordino-ui/ondata-3.md § 5.1 and acceptance 1–7) — desktop, 1440.
 *
 * What only a browser can say: the bar and its order, an old `?tab=` landing on its new place, the pill of Approfondimenti
 * as the tab's axis (URL and session), Parametri as a closed row between the verdict and the results, the header's capital
 * line, and «Casa nel patrimonio FIRE» as a field of «Il mio piano».
 */

import { test, expect, type Page } from '@playwright/test';
import { openFireView } from './fireNav';

async function gotoFire(page: Page, query = ''): Promise<void> {
  await page.goto(`/dashboard/fire-simulations${query}`);
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 });
}

test('the page is «FIRE» and its tabs are Quando · E se… · Approfondimenti (and Traguardi until RU11), Quando first', async ({ page }) => {
  await gotoFire(page);
  const tabs = page.locator('main [role="tab"], [role="tablist"] [role="tab"]').filter({ visible: true });
  await expect(tabs.first()).toBeVisible();
  const names = await tabs.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''));
  expect(names.slice(0, 4)).toEqual(['Quando', 'E se…', 'Approfondimenti', 'Traguardi']);
  await expect(page.getByRole('tab', { name: 'Quando', exact: true }).first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Verdetto sul FIRE' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'FIRE', exact: true }).first()).toBeVisible();
});

test('the header says the capital over the net worth and what is left out', async ({ page }) => {
  await gotoFire(page);
  await expect(page.getByText(/^Capitale [\d.]+[\s ]€ su [\d.]+[\s ]€ di patrimonio/).first()).toBeVisible({ timeout: 30_000 });
});

test('an old ?tab= lands on its new place', async ({ page }) => {
  await gotoFire(page, '?tab=coast');
  await expect(page.getByRole('region', { name: 'Verdetto sul Coast FIRE' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: 'Coast FIRE', exact: true })).toHaveAttribute('aria-checked', 'true');

  await gotoFire(page, '?tab=montecarlo');
  await expect(page.getByRole('region', { name: 'Verdetto su Dopo il FIRE' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('radio', { name: 'Dopo il FIRE', exact: true })).toHaveAttribute('aria-checked', 'true');

  await gotoFire(page, '?tab=whatif');
  await expect(page.getByRole('region', { name: 'Verdetto sul What If' })).toBeVisible({ timeout: 30_000 });
});

test('the pill of Approfondimenti is a radiogroup: the view is in the URL and the session remembers it', async ({ page }) => {
  await gotoFire(page, '?tab=approfondimenti');
  const group = page.getByRole('radiogroup', { name: 'Vista di Approfondimenti' });
  await expect(group).toBeVisible();
  // Nothing asked and nothing remembered: Coast.
  await expect(group.getByRole('radio', { name: 'Coast FIRE', exact: true })).toHaveAttribute('aria-checked', 'true');

  await openFireView(page, 'Proiezione');
  await expect(page).toHaveURL(/tab=approfondimenti&vista=proiezione/);
  await expect(page.getByRole('region', { name: 'Verdetto sulla proiezione' })).toBeVisible({ timeout: 60_000 });

  // Back on Approfondimenti without a view: the last one of the session, not Coast.
  await gotoFire(page, '?tab=approfondimenti');
  await expect(page.getByRole('radiogroup', { name: 'Vista di Approfondimenti' }).getByRole('radio', { name: 'Proiezione', exact: true })).toHaveAttribute('aria-checked', 'true');
});

for (const [view, rowId, verdictName] of [
  ['Dopo il FIRE', 'mc-parametri', 'Verdetto su Dopo il FIRE'],
  ['Proiezione', 'proj-parametri', 'Verdetto sulla proiezione'],
] as const) {
  test(`${view}: Parametri is a closed row between the verdict and the results, and opens on «Prova»`, async ({ page }) => {
    await gotoFire(page, '?tab=approfondimenti');
    await openFireView(page, view);
    const verdict = page.getByRole('region', { name: verdictName });
    await expect(verdict).toBeVisible({ timeout: 60_000 });
    const trigger = page.locator(`#${rowId}-trigger`);
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Under the verdict and above the first result tile.
    const verdictBox = (await verdict.boundingBox())!;
    const rowBox = (await page.locator(`#${rowId}`).boundingBox())!;
    expect(rowBox.y).toBeGreaterThan(verdictBox.y);
    const results = page.locator(`section[id]:visible`).filter({ hasNot: page.locator(`#${rowId}`) });
    const firstResult = results.filter({ has: page.locator('h3') }).first();
    if (await firstResult.count()) {
      const box = (await firstResult.boundingBox())!;
      if (box.y !== rowBox.y) expect(rowBox.y).toBeLessThanOrEqual(box.y);
    }

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: /^Prova$/ })).toBeVisible();
  });
}

test('«Casa nel patrimonio FIRE» is a field of «Il mio piano»: saved with the plan, gone from Impostazioni', async ({ page }) => {
  await gotoFire(page);
  const planTrigger = page.getByRole('button', { name: /^Il mio piano/ });
  if ((await planTrigger.getAttribute('data-state')) === 'closed') await planTrigger.click();
  const home = page.getByRole('switch', { name: 'Conta la casa di abitazione nel patrimonio FIRE' });
  await expect(home).toBeVisible();
  await expect(page.getByText('Agisce su: Quando.')).toBeVisible();
  const initial = (await home.getAttribute('aria-checked')) === 'true';

  await home.click();
  await expect(home).toHaveAttribute('aria-checked', String(!initial));
  await expect(planTrigger).toContainText('Anteprima non salvata');
  await page.getByRole('button', { name: 'Salva il piano' }).click();
  await expect(page.getByText('Piano FIRE salvato')).toBeVisible({ timeout: 10_000 });

  await page.reload();
  const trigger2 = page.getByRole('button', { name: /^Il mio piano/ });
  await expect(trigger2).toBeVisible({ timeout: 30_000 });
  if ((await trigger2.getAttribute('data-state')) === 'closed') await trigger2.click();
  await expect(page.getByRole('switch', { name: 'Conta la casa di abitazione nel patrimonio FIRE' })).toHaveAttribute('aria-checked', String(!initial));

  // Impostazioni › Investimenti no longer carries it, and points here.
  await page.goto('/dashboard/settings?tab=investimenti');
  await expect(page.getByText('Piano FIRE (età, spesa, SWR, fondo, casa, flussi, pensioni)')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Casa nel patrimonio FIRE')).toHaveCount(0);

  // Restore the fixture.
  await page.goto('/dashboard/fire-simulations');
  const trigger3 = page.getByRole('button', { name: /^Il mio piano/ });
  await expect(trigger3).toBeVisible({ timeout: 30_000 });
  if ((await trigger3.getAttribute('data-state')) === 'closed') await trigger3.click();
  await page.getByRole('switch', { name: 'Conta la casa di abitazione nel patrimonio FIRE' }).click();
  await page.getByRole('button', { name: 'Salva il piano' }).click();
  await expect(page.getByText('Piano FIRE salvato')).toBeVisible({ timeout: 10_000 });
});
