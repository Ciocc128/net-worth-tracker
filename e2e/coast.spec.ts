/**
 * Coast FIRE — desktop regressions that only a real browser can catch.
 *
 * Runs on the BASE account with the Coast fixture (`scripts/seedCoastFireE2E.mts`): age 35,
 * target 60, custom expenses, two state pensions after the target and the pension fund unlocking
 * at 57 — inside the chart's horizon, so the unlock step is on screen.
 *
 * The fixture fixes the expenses but NOT the clock: each pension's deflation is computed from an
 * absolute start date, so the cents move between runs. These tests therefore assert STRUCTURE and
 * FORMAT (AGENTS → *Browser-Driven E2E*); the arithmetic lives in `__tests__/fireService.test.ts`
 * and the view derivations in `__tests__/coastFireView.test.ts`.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * A fully formatted euro amount as Intl prints it: comma decimals and a (non-breaking) space
 * before €, with the integer part either dot-grouped ("29.800,00") or — Italian CLDR gives
 * `minimumGroupingDigits = 2` — plain up to four digits ("2932,80").
 */
const EURO_AMOUNT = /^(\d{1,3}(\.\d{3})+|\d{1,4}),\d{2}[\s ]*€$/;

async function gotoCoast(page: Page): Promise<void> {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await page.getByRole('tab', { name: 'Coast FIRE' }).click();
  // The hero eyebrow is the first thing the tab paints once the three queries settle.
  await expect(page.getByText('Posso smettere di versare?', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test('the hero answers the question with a verdict and a formatted amount', async ({ page }) => {
  await gotoCoast(page);

  const dominantCard = page.getByText('Posso smettere di versare?', { exact: true }).locator('../..');

  // The dominant value is an amount — the shortfall, or the surplus once Coast is reached.
  // "—" would mean the projection silently died.
  const heroValue = dominantCard.locator('p.font-mono').first();
  await expect(heroValue).toHaveText(EURO_AMOUNT);

  // One explicit verdict, in words, in either of its two live phrasings.
  await expect(
    dominantCard.getByText(/^(Non ancora: continua a versare\.|Sì, puoi smettere di versare\.)$/)
  ).toBeVisible();

  // The comparison the verdict makes is on screen as two rows, not left implicit.
  await expect(dominantCard.getByText('Patrimonio FIRE attuale', { exact: true })).toBeVisible();
  await expect(dominantCard.getByText('Coast FIRE Number', { exact: true })).toBeVisible();

  // The companion answers "cosa succede se smetti oggi" with a real amount.
  const companionCard = page.getByText('Se smetti oggi', { exact: true }).locator('..');
  await expect(companionCard.locator('p.font-mono').first()).toHaveText(EURO_AMOUNT);

  // The basis line declares the assumptions instead of leaving them implicit.
  await expect(page.getByText(/^Base di calcolo: 35 anni → target 60 /)).toBeVisible();
});

test('the inflow timeline lists both state pensions and the fund unlock, in calendar order', async ({
  page,
}) => {
  await gotoCoast(page);

  const timeline = page.getByRole('list', { name: 'Afflussi già considerati' });
  await expect(timeline).toBeVisible();

  const items = timeline.getByRole('listitem');
  await expect(items).toHaveCount(3);

  // Every event the backward walk discounts is named — the fund unlock included.
  await expect(timeline.getByText('Sblocco fondo pensione', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Pensione estera', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Pensione INPS', { exact: true })).toBeVisible();

  // Years read left to right in ascending order, and each row carries its own amount.
  const years = await items.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.querySelector('span.font-mono')?.textContent?.trim()))
  );
  expect(years).toHaveLength(3);
  expect(years.every((year) => Number.isFinite(year) && year > 2020)).toBe(true);
  expect([...years].sort((a, b) => a - b)).toEqual(years);

  const amounts = await items.evaluateAll((nodes) =>
    nodes.map((node) => node.querySelector('p.font-mono')?.textContent?.trim() ?? '')
  );
  amounts.forEach((amount) => {
    // The amount is followed by its caption inside the same <p>, so match a prefix.
    expect(amount).toMatch(/^(\d{1,3}(\.\d{3})+|\d{1,4}),\d{2}[\s ]*€/);
  });

  // The fixture's fund unlock (2048) precedes both pensions (2052, 2058).
  const unlockYear = years[0];
  expect(unlockYear).toBeLessThan(years[1]);
});

test('the Impostazioni collapsible opens and closes, measured by height', async ({ page }) => {
  await gotoCoast(page);

  // Radix stamps data-state + aria-controls on the trigger. A collapsed CSS region can still be
  // "visible" to Playwright, so the collapse is asserted by measuring the content height.
  const trigger = page
    .locator('[aria-controls]')
    .filter({ hasText: 'Impostazioni Coast FIRE' })
    .first();
  await expect(trigger).toBeVisible();
  const contentId = await trigger.getAttribute('aria-controls');
  expect(contentId).toBeTruthy();
  const content = page.locator(`[id="${contentId}"]`);

  const measuredHeight = async (): Promise<number> => {
    if ((await content.count()) === 0) return 0;
    return content.evaluate((el) => el.getBoundingClientRect().height);
  };

  // Normalize to open: the seeded fixture has an age saved, so it starts collapsed.
  if ((await trigger.getAttribute('data-state')) === 'closed') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('data-state', 'open');
  await expect.poll(measuredHeight).toBeGreaterThan(100);
  await expect(page.getByLabel('Età target Coast FIRE')).toBeVisible();

  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'closed');
  await expect.poll(measuredHeight).toBeLessThan(1);

  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'open');
  await expect.poll(measuredHeight).toBeGreaterThan(100);
});

test('the projection tooltip names the pension-fund step at the unlock year', async ({ page }) => {
  await gotoCoast(page);

  const chart = page.locator('[role="img"][aria-label*="proiezione Coast FIRE"]');
  await expect(chart).toBeVisible({ timeout: 15_000 });

  // boundingBox is viewport-relative: without the scroll every mouse.move lands outside the
  // window, which reads exactly like "the tooltip never opened".
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();

  const unlockYear = Number(
    await page
      .getByRole('list', { name: 'Afflussi già considerati' })
      .getByRole('listitem')
      .first()
      .locator('span.font-mono')
      .textContent()
  );

  // Sweep the plot area until the hovered year is the unlock year, then read the note.
  const tooltip = page.locator('.recharts-tooltip-wrapper').first();
  let noteFound = false;
  for (let step = 0; step <= 40 && !noteFound; step += 1) {
    await page.mouse.move(box!.x + (box!.width * step) / 40, box!.y + box!.height / 2);
    const text = (await tooltip.textContent()) ?? '';
    if (text.includes(`Anno ${unlockYear}`)) {
      expect(text).toContain('Sblocco del fondo pensione');
      noteFound = true;
    }
  }
  expect(noteFound).toBe(true);
});
