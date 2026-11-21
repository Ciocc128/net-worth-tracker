/**
 * Strumenti at 1440 — the row actions in four fixed places and the unit prices at 2–4 decimals
 * (RU6, doc/riordino-ui/README.md § 5.9, D-RU10). Base account (`desktop` project).
 *
 * What only a browser can prove:
 * - Every row's action cell is four 32px places wide, so Modifica and Elimina sit in the same
 *   column from row to row (the prototype's pencil slid into another column on rows without «⋯»).
 *   Read as the x of the Elimina button: the same on every row.
 * - Elimina is grey at rest and red under the pointer.
 * - «⋯» opens a menu with the row's extra actions and no trash in it.
 * - The Prezzo cell never prints more than four decimals nor fewer than two.
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  await expect(page.locator('section#strumenti tbody tr').first()).toBeVisible({ timeout: 90_000 });
}

test('the row actions keep four fixed places and Elimina is grey until hovered', async ({ page }) => {
  await openPatrimonio(page);
  const rows = page.locator('section#strumenti tbody tr').filter({ has: page.getByRole('button', { name: /^Modifica / }) });
  const count = await rows.count();
  expect(count).toBeGreaterThan(1);

  const xs = { edit: new Set<number>(), more: new Set<number>(), del: new Set<number>() };
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const edit = await row.getByRole('button', { name: /^Modifica / }).boundingBox();
    const del = await row.getByRole('button', { name: /^Elimina / }).boundingBox();
    xs.edit.add(Math.round(edit!.x));
    xs.del.add(Math.round(del!.x));
    // The place between them is the «⋯» button or an empty 32px span: Elimina is always 2 places right of Modifica.
    expect(Math.round(del!.x - edit!.x)).toBe(Math.round(2 * (edit!.width + 2)));
    const more = row.getByRole('button', { name: /^Altre azioni su / });
    if (await more.count()) xs.more.add(Math.round((await more.boundingBox())!.x));
  }
  expect(xs.edit.size).toBe(1);
  expect(xs.del.size).toBe(1);
  expect(xs.more.size).toBeLessThanOrEqual(1);

  const trash = rows.first().getByRole('button', { name: /^Elimina / }).locator('svg');
  const rest = await trash.evaluate((el) => getComputedStyle(el).color);
  await rows.first().getByRole('button', { name: /^Elimina / }).hover();
  const hovered = await trash.evaluate((el) => getComputedStyle(el).color);
  expect(hovered).not.toBe(rest);
});

test('«⋯» holds the extra actions and never the delete', async ({ page }) => {
  await openPatrimonio(page);
  const more = page.locator('section#strumenti tbody').getByRole('button', { name: /^Altre azioni su / }).first();
  await expect(more).toBeVisible();
  await more.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Elimina/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('the Prezzo column prints between two and four decimals', async ({ page }) => {
  await openPatrimonio(page);
  const col = await page.locator('section#strumenti thead th').allInnerTexts();
  const idx = col.findIndex((t) => t.trim() === 'Prezzo');
  expect(idx).toBeGreaterThanOrEqual(0);
  const cells = await page.locator('section#strumenti tbody tr td:nth-child(' + (idx + 1) + ')').allInnerTexts();
  const priced = cells.map((t) => t.trim()).filter((t) => /\d/.test(t));
  expect(priced.length).toBeGreaterThan(0);
  for (const text of priced) expect(text).toMatch(/,\d{2,4}\D*$/);
});
