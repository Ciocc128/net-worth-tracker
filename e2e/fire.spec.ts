/**
 * Calcolatore FIRE — desktop regressions that only a real browser can catch.
 *
 * Runs on the BASE account (test-user-1), whose FIRE figures depend on the run month (the
 * cashflow fallback annualizes the current year), so these tests assert STRUCTURE and FORMAT,
 * never exact amounts: the hero renders a well-formed euro amount, the Scenari|Ventaglio pill
 * actually swaps the chart (via the charts' aria-labels), and the Impostazioni collapsible
 * really opens and closes (measured by height — a collapsed region can still be "visible" to
 * Playwright, AGENTS → Browser-Driven E2E).
 *
 * The arithmetic (accumulation engine, percentiles, coherence with the deterministic
 * projection) lives in __tests__/monteCarloService.test.ts — not here.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * A fully formatted euro amount as Intl prints it: comma decimals and a (non-breaking) space
 * before €, with the integer part either dot-grouped ("29.800,00") or — Italian CLDR gives
 * `minimumGroupingDigits = 2` — plain up to four digits ("3270,20"). Anchored so "1821,01"
 * can never pass as "821,01". The first run of this spec failed EXACTLY on the ungrouped
 * four-digit case, which is the trap AGENTS → Italian Localization warns about.
 */
const EURO_AMOUNT = /^(\d{1,3}(\.\d{3})+|\d{1,4}),\d{2}[\s ]*€$/;

async function gotoFire(page: Page): Promise<void> {
  await page.goto('/dashboard/fire-simulations');
  // The companion hero card is the last thing to settle; waiting on its eyebrow makes every
  // later assertion stable. Text matched on textContent, so the CSS uppercase is irrelevant.
  await expect(page.getByText('Reddito passivo sostenibile', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test('hero renders: a projected-year verdict and a well-formed euro amount', async ({ page }) => {
  await gotoFire(page);

  // Dominant card: the answer to "Quando?" is a calendar year, "Oggi" (reached) or "50+"
  // (beyond the horizon) — never "—", which would mean the projection silently died.
  const dominantCard = page.getByText('Traguardo FIRE', { exact: true }).locator('../..');
  const heroValue = dominantCard.locator('p.font-mono').first();
  await expect(heroValue).toHaveText(/^(\d{4}|Oggi|50\+)$/);

  // Companion card: the annual passive income is a real formatted amount. The count-up
  // animates through valid formats, so the final state also matches.
  const companionCard = page
    .getByText('Reddito passivo sostenibile', { exact: true })
    .locator('..');
  const annualAllowance = companionCard.locator('p.font-mono').first();
  await expect(annualAllowance).toHaveText(EURO_AMOUNT);

  // The basis line declares the assumptions instead of leaving them implicit.
  await expect(page.getByText(/^Base di calcolo: SWR /)).toBeVisible();
});

test('the Scenari | Ventaglio pill swaps the projection chart', async ({ page }) => {
  await gotoFire(page);

  const scenariChart = page.locator('[role="img"][aria-label*="proiezione scenari"]');
  const fanChart = page.locator('[role="img"][aria-label*="Ventaglio Monte Carlo"]');

  // Default view: deterministic scenarios, no fan mounted.
  await expect(scenariChart).toBeVisible({ timeout: 15_000 });
  await expect(fanChart).toHaveCount(0);

  // Switch to Ventaglio: the fan replaces the scenario chart (same section, one chart at a time).
  await page.getByRole('tab', { name: 'Ventaglio' }).click();
  await expect(fanChart).toBeVisible({ timeout: 15_000 });
  await expect(scenariChart).toHaveCount(0);

  // The fan's verdict row states the cumulative FIRE probability.
  await expect(page.getByText(/Probabilità di FIRE entro il/)).toBeVisible();

  // And back.
  await page.getByRole('tab', { name: 'Scenari' }).click();
  await expect(scenariChart).toBeVisible({ timeout: 15_000 });
  await expect(fanChart).toHaveCount(0);
});

test('the Impostazioni collapsible opens and closes, measured by height', async ({ page }) => {
  await gotoFire(page);

  // Radix stamps data-state + aria-controls on the trigger. The initial state depends on the
  // account (config-first opens it when no SWR is saved), so the test drives a full cycle
  // from whatever state it finds.
  const trigger = page.locator('[aria-controls]').filter({ hasText: 'Impostazioni FIRE' }).first();
  await expect(trigger).toBeVisible();
  const contentId = await trigger.getAttribute('aria-controls');
  expect(contentId).toBeTruthy();
  const content = page.locator(`[id="${contentId}"]`);

  const measuredHeight = async (): Promise<number> => {
    if ((await content.count()) === 0) return 0;
    return content.evaluate((el) => el.getBoundingClientRect().height);
  };

  // Normalize to open.
  if ((await trigger.getAttribute('data-state')) === 'closed') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('data-state', 'open');
  await expect.poll(measuredHeight).toBeGreaterThan(100);
  // Open panel really contains the SWR input.
  await expect(page.getByLabel('Safe Withdrawal Rate (%)')).toBeVisible();

  // Close: the content collapses to (near) zero height or unmounts entirely.
  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'closed');
  await expect.poll(measuredHeight).toBeLessThan(1);

  // Re-open: the cycle is symmetric.
  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'open');
  await expect.poll(measuredHeight).toBeGreaterThan(100);
});
