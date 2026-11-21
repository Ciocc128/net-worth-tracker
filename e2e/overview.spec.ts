/**
 * The Panoramica at 1440 after the phone composition (2026-10-11): the page of before,
 * plus three declared additions — the year's euro in brackets after its percentage, the calendar
 * as a caption under the figures that contain it, a zero printed without a sign — and the
 * `order-*` utilities gone. No row trigger in the grid, the strip and «Il resto della pagina» not
 * shown, no «Il perché», the chips and the «Mercato:» digest in THE tile, the sentence whole in
 * ONE `<p>`. The overview response is patched on the wire (`e2e/overviewFixture.ts`), nothing is
 * written.
 *
 * Seen red on 2026-10-11 with `useCompactLayout` answering `true` at every width (seven triggers
 * in the grid, the strip visible, the sentence in a `div`) and with the caption gated on
 * `sections.compact` (no «già in calendario» at 1440).
 */

import { test, expect } from '@playwright/test';
import { openOverview, patchOverview } from './overviewFixture';

test('is the page of every width at 1440: no rows, no strip, the chips and the digest, one paragraph with the calendar under the figures', async ({ page }) => {
  await patchOverview(page);
  await openOverview(page);

  await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0); // no ownership in this payload: no Intestatari row
  await expect(page.getByRole('list', { name: 'Le cifre del verdetto' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Il perché/ })).toHaveCount(0);

  const verdict = page.getByRole('region', { name: 'Verdetto del mese' });
  const paragraphs = verdict.locator('p');
  await expect(paragraphs).toHaveCount(1);
  await expect(paragraphs).toContainText(/Il patrimonio vale 190\.000,00\s?€: \+3000\s?€ \(\+1,60%\) su \p{Ll}+, \+15,00% da inizio anno \(\+25\.000\s?€\)\./u);
  await expect(paragraphs).toContainText(/dal mercato/);

  // THE tile keeps every block at 1440.
  const theTile = page.getByRole('region', { name: 'Patrimonio' });
  await expect(theTile.getByText('questo mese')).toBeVisible();
  await expect(theTile.getByText('da inizio anno')).toBeVisible();
  await expect(theTile.getByText('Mercato:')).toBeVisible();

  // The calendar under the figures that contain it, at this width too (The Scheduled-Is-Not-Spent Rule).
  const cashflow = page.getByRole('region', { name: /^Cashflow/ });
  await expect(cashflow).toContainText(/di cui 350\s?€ già in calendario, entro il \d{2}/);
  const expenses = page.getByRole('region', { name: 'Spese per categoria' });
  await expect(expenses).toContainText(/di cui 350\s?€ già in calendario/);
  await expect(page.getByRole('region', { name: 'Entrate per categoria' })).not.toContainText('già in calendario');

  // No `order-*` left in the grid.
  expect(
    await page.evaluate(() =>
      [...document.querySelector('main')!.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
    ),
  ).toEqual([]);
});

test('prints a zero variation without a sign, at 1440 too', async ({ page }) => {
  await patchOverview(page, { variations: { monthly: { value: -0.004, percentage: 0 }, yearly: { value: 0, percentage: 0 } } });
  await openOverview(page);
  const paragraph = page.getByRole('region', { name: 'Verdetto del mese' }).locator('p');
  await expect(paragraph).toContainText(/: 0\s?€ \(0,00%\) su \p{Ll}+, 0,00% da inizio anno \(0\s?€\)\./u);
  await expect(paragraph).not.toContainText(/[+−-]0,00/);
});

test('lays the page on two columns at 1440: «Quanto ho» on the left, «Come va il mese» on the right with the incomes above the expenses, Intestatari a closed row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await patchOverview(page, {
    ownership: {
      rows: [
        { key: 'common', kind: 'common', memberId: null, label: 'In comune', value: 190000, sharePct: 100, assetCount: 3 },
      ],
      total: 190000,
      assetCount: 3,
      hasOwners: true,
      reassign: [],
    },
  });
  await openOverview(page);

  const left = page.getByRole('heading', { level: 3, name: 'Quanto ho' });
  const right = page.getByRole('heading', { level: 3, name: 'Come va il mese' });
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();

  const box = async (name: string | RegExp) => {
    const rect = await page.getByRole('region', { name }).boundingBox();
    expect(rect, String(name)).not.toBeNull();
    return rect!;
  };
  const rightLabel = (await right.boundingBox())!;
  const patrimonio = await box('Patrimonio');
  const cashflow = await box(/^Cashflow/);
  const incomes = await box('Entrate per categoria');
  const expenses = await box('Spese per categoria');
  const composition = await box(/^Composizione/);

  // Left column: THE tile and Composizione; right column: Cashflow, incomes, then expenses.
  expect(patrimonio.x).toBeLessThan(rightLabel.x);
  expect(composition.x).toBeLessThan(rightLabel.x);
  for (const tile of [cashflow, incomes, expenses]) expect(Math.abs(tile.x - rightLabel.x)).toBeLessThan(2);
  expect(cashflow.y).toBeLessThan(incomes.y);
  expect(incomes.y).toBeLessThan(expenses.y);
  // The expenses' eyebrow starts inside the first screen (934 px before the reorder).
  expect(expenses.y).toBeLessThan(900);

  // Intestatari: a closed row at 1440 too, open on a click.
  const trigger = page.locator('#panoramica-intestatari-trigger');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('list', { name: 'Patrimonio per intestatario' })).toBeVisible();
});
