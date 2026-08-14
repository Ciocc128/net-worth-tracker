/**
 * Analisi at 390px — the width DESIGN.md designs against first.
 *
 * Two things only a mobile viewport can prove: the Sankey's truncation is DECLARED
 * (the chart drops small slices for legibility — silent truncation was a recorded
 * defect), and the drill-to-dossier flow works under touch at the narrow layout.
 */

import { test, expect } from '@playwright/test';

const CURRENT_YEAR = new Date().getFullYear();

function euro(amount: string): RegExp {
  return new RegExp(`^${amount.replace(/[.]/g, '\\.')}[\\s\\u00a0]*€$`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/analisi');
  // `.first()`: the amount repeats in the income composition row (see analisi.spec.ts).
  await expect(page.getByText(euro('2000,00')).first()).toBeVisible({ timeout: 30_000 });
});

test('declares the mobile Sankey truncation instead of dropping slices silently', async ({
  page,
}) => {
  await expect(page.getByText(/mostra solo le voci principali/)).toBeVisible();
});

test('drills to the dossier from the composition under touch', async ({ page }) => {
  await page.getByRole('listitem', { name: /^Casa, /, exact: false }).click();

  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(
    page.getByText(`Totale · ${CURRENT_YEAR}`).locator('..').getByText(euro('380,00'))
  ).toBeVisible();
  // The per-year table renders as a flat list readable at 390px.
  await expect(page.getByText('Per anno', { exact: true })).toBeVisible();
});
