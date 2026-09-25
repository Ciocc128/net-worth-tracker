/**
 * Analisi at 390px — the width DESIGN.md designs against first.
 *
 * Three things only a mobile viewport can prove: the tiles stack in the declared reading order
 * with nothing scrolling sideways, the Flusso draws no Sankey (a bar of the spending by type and
 * the categories as rows since 2026-09-25 — the reduced Sankey did not read at 390), and the
 * row-to-Scheda flow works under touch at the narrow layout.
 */

import { test, expect } from '@playwright/test';

const CURRENT_YEAR = new Date().getFullYear();

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard/analisi');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 30_000 });
});

test('stacks the tiles in the declared order with no horizontal overflow', async ({ page }) => {
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main section[aria-label]'))
      .map((section) => ({ name: section.getAttribute('aria-label')!, top: section.getBoundingClientRect().top }))
      .filter((section) => ['Periodo', 'Fuori scala', 'Spese per categoria', 'Entrate per categoria', 'Spese maggiori', 'Flusso'].includes(section.name))
      .sort((a, b) => a.top - b.top)
      .map((section) => section.name),
  );
  expect(order).toEqual(['Periodo', 'Fuori scala', 'Spese per categoria', 'Entrate per categoria', 'Spese maggiori', 'Flusso']);

  // `main` is the horizontal scroll container (AGENTS.md): measure it and every element in it.
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const limit = main.getBoundingClientRect().left + main.clientWidth + 1;
    const culprits = Array.from(main.querySelectorAll('*')).filter((el) => el.getBoundingClientRect().right > limit).length;
    return { scroll: main.scrollWidth - main.clientWidth, culprits };
  });
  expect(overflow).toEqual({ scroll: 0, culprits: 0 });
});

test('draws the Flusso by type as a bar of the spending and rows, never a Sankey, on the reading\'s own shares', async ({ page }) => {
  const flusso = page.getByRole('region', { name: 'Flusso', exact: true });
  const legend = flusso.getByRole('list', { name: 'Quote del flusso' });
  // Positive anchor first: the legend is there, so the absence of the chart below means something.
  await expect(legend).toBeVisible();
  await expect(flusso.getByRole('img', { name: /^Flusso del periodo/ })).toHaveCount(0);

  // The fixture's year: fixed 380 €, variable 400 €, income 2000 €. The bar is the SPENDING, so
  // its legend prints the reading's own «variabili 51%, fisse 49%» — never 20/19 of the income.
  await expect(legend.getByRole('listitem')).toHaveText([/^Variabili\s*51%$/, /^Fisse\s*49%$/]);
  const reading = await flusso.locator('p').first().innerText();
  expect(reading).toMatch(/variabili 51%, fisse 49%/i);

  // Savings stay out of the bar: a closing block with the amount.
  await expect(flusso.getByRole('region', { name: 'Risparmio' }).getByText(/^1220[\s ]*€ avanzati nel periodo\.$/)).toBeVisible();

  // A row opens the Scheda, like every other entry point.
  await flusso.getByRole('region', { name: 'Spese Variabili' }).getByRole('button', { name: /^Alimentari, / }).click();
  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`).locator('..').getByText(/^400[\s ]*€$/)).toBeVisible();
});

test('opens the Scheda from a category row under touch', async ({ page }) => {
  await page.getByRole('region', { name: 'Spese per categoria' }).getByRole('button', { name: /^Casa, / }).click();

  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`).locator('..').getByText(/^380[\s ]*€$/)).toBeVisible();
  // The per-year table renders as a flat list readable at 390px.
  await expect(page.getByText('Per anno', { exact: true })).toBeVisible();
});
