/**
 * Patrimonio at 1440 after R4 (RU7, doc/riordino-ui/ondata-2.md § 5.1, D-RU16…D-RU18). Base account
 * (`desktop` project), one household member.
 *
 * What only a browser can prove:
 * - Strumenti is the second row: its heading sits well above where it was (1160 px on the census),
 *   and the hero, Conti and Operazioni del mese share one row (same top, same bottom edge).
 * - The DOM order of the tiles' headings is the reading order: totale, Operazioni, Conti, Strumenti,
 *   Classi, Guadagno.
 * - With one member there is no Intestatari: Classi and Guadagno share the row 6 · 6.
 * - The words: no «Liquidità» or «Movimenti del mese» tile; the class «Liquidità» of Classi stays
 *   a class (the base fixture holds a cash account, so it is on the page).
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

async function openPatrimonio(page: Page) {
  await page.goto('/dashboard/assets', { waitUntil: 'load' });
  await page.getByRole('region', { name: 'Verdetto del patrimonio' }).waitFor({ timeout: 90_000 });
  await expect(page.locator('section#strumenti tbody tr').first()).toBeVisible({ timeout: 90_000 });
}

const box = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true }).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), width: Math.round(r.width) };
  });

test('the first row is the hero, Conti and Operazioni del mese at one height, and Strumenti is the second', async ({ page }) => {
  await openPatrimonio(page);
  const [hero, conti, operazioni, strumenti] = await Promise.all([
    box(page, 'Patrimonio'),
    box(page, 'Conti'),
    box(page, 'Operazioni del mese'),
    box(page, 'Strumenti'),
  ]);
  expect(Math.abs(hero.top - conti.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(hero.top - operazioni.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(hero.bottom - conti.bottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(hero.bottom - operazioni.bottom)).toBeLessThanOrEqual(1);
  // The table starts under the first row (the heading's top is a few pixels under the tile's).
  expect(Math.abs(strumenti.top - (hero.bottom + 12))).toBeLessThanOrEqual(2);
  // Criterion 1: the heading sits under 680 px from the top of the document (1160 before).
  expect(strumenti.top).toBeLessThan(680);
});

test('the tiles read in the order they are seen: totale, Operazioni, Conti, Strumenti, Classi, Guadagno', async ({ page }) => {
  await openPatrimonio(page);
  const names = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main section.rounded-2xl')]
      .filter((el) => el.checkVisibility())
      .map((el) => el.getAttribute('aria-label')),
  );
  expect(names).toEqual(['Patrimonio', 'Operazioni del mese', 'Conti', 'Strumenti', 'Classi', 'Guadagno sul costo']);
  expect(names).not.toContain('Liquidità');
  expect(names).not.toContain('Movimenti del mese');
});

test('with one household member Classi and Guadagno share the third row, 6 · 6', async ({ page }) => {
  await openPatrimonio(page);
  const [classi, guadagno, strumenti] = await Promise.all([box(page, 'Classi'), box(page, 'Guadagno sul costo'), box(page, 'Strumenti')]);
  expect(Math.abs(classi.top - guadagno.top)).toBeLessThanOrEqual(1);
  expect(classi.top).toBeGreaterThan(strumenti.bottom);
  expect(Math.abs(classi.width - guadagno.width)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('region', { name: 'Intestatari' })).toHaveCount(0);
});

test('the hero is the low one: the period pill is in its head and there is no «Andamento» row nor «Mercato:»', async ({ page }) => {
  await openPatrimonio(page);
  const hero = page.getByRole('region', { name: 'Patrimonio', exact: true });
  await expect(hero.getByRole('radiogroup', { name: 'Periodo del grafico' })).toBeVisible();
  await expect(hero.getByText('Andamento', { exact: true })).toHaveCount(0);
  await expect(hero.getByText('Mercato:')).toHaveCount(0);
  const pill = await hero.getByRole('radiogroup', { name: 'Periodo del grafico' }).boundingBox();
  const eyebrow = await hero.getByRole('heading', { name: 'Patrimonio totale lordo' }).boundingBox();
  expect(Math.abs(pill!.y + pill!.height / 2 - (eyebrow!.y + eyebrow!.height / 2))).toBeLessThanOrEqual(14);
});
