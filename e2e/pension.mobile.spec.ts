/**
 * Previdenza at 390px — the width DESIGN.md designs against first.
 *
 * The desktop spec proves the two-column switch happens; this one proves the base layout it starts
 * from is intact, which is the half a desktop-only check would silently let rot.
 */

import { test, expect } from '@playwright/test';

/** `Intl` puts a non-breaking space before the €; anchoring avoids a partial match too. */
const FUND_VALUE = /^29\.800,00[\s ]*€$/;

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/pension');
  await expect(page.getByText(FUND_VALUE)).toBeVisible({ timeout: 30_000 });
});

test('stacks the hero above the return card and steps the type down to 44px', async ({ page }) => {
  const heroValue = page.getByText(FUND_VALUE);
  const returnCard = page.getByRole('heading', { name: 'Rendimento del fondo' }).locator('..');

  const heroBox = (await heroValue.boundingBox())!;
  const returnBox = (await returnCard.boundingBox())!;

  // Stacked, not side by side.
  expect(returnBox.y).toBeGreaterThan(heroBox.y);
  expect(Math.abs(returnBox.x - heroBox.x)).toBeLessThan(40);

  const fontSize = await heroValue.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBe(44);
});

test('never lets the page scroll sideways', async ({ page }) => {
  // A single overflowing row is the classic 390px regression — and the one most easily missed on a
  // desktop-sized browser window.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
