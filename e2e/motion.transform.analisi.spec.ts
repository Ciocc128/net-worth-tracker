/**
 * The page transforms instead of being replaced (AN2, doc/animazioni/README.md § 5.5–5.6, § 10
 * criteria 6–7) — on the Analisi fixture (`scripts/seedAnalisiE2E.mts`), whose history is read whole,
 * so a period switch is in memory and the tiles stay mounted.
 *
 * 1. A period switch: the trio's «Spese» passes through at least one figure strictly between the
 *    one it showed and the one it lands on, and the landed figure is the one the screen reader
 *    reads from the start (the frame is `aria-hidden`, the landed text `sr-only`).
 * 2. The Scheda's drill: a subcategory enters with a POSITIVE `translateX` (from the right), the
 *    way back up with a NEGATIVE one (from the left).
 * 3. With «riduci movimento» the same switch lands at once: no frame is ever printed.
 *
 * The samples are taken IN the page, one per animation frame, so the assertions do not depend on
 * how fast Playwright polls. Written 2026-10-23 in the cloud container without the emulators: run
 * it on the Mac (`npm run test:e2e -- e2e/motion.transform.analisi.spec.ts`) before the merge.
 */

import { test, expect, type Page } from '@playwright/test';

const number = (text: string) => Number(text.replace(/[^\d,-]/g, '').replace(',', '.'));

async function gotoAnalisi(page: Page, query = ''): Promise<void> {
  await page.goto(`/dashboard/analisi${query}`);
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 30_000 });
}

/** Every text the «Spese» figure shows over ~900 ms after `act`, frame by frame: what is painted and what is read. */
async function sampleExpenses(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const samples: { painted: string; read: string }[] = [];
    (window as unknown as { __samples: typeof samples }).__samples = samples;
    const start = performance.now();
    const tick = () => {
      const figure = document.querySelector('section[aria-label="Periodo"] [data-figure="trio:expenses"]');
      if (figure) {
        const painted = figure.querySelector('[aria-hidden="true"]')?.textContent ?? figure.textContent ?? '';
        const read = figure.querySelector('.sr-only')?.textContent ?? figure.textContent ?? '';
        samples.push({ painted, read });
      }
      if (performance.now() - start < 1_200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await act();
  await page.waitForTimeout(1_300);
  return page.evaluate(() => (window as unknown as { __samples: { painted: string; read: string }[] }).__samples);
}

test('a period switch glides the trio from the figure it showed to the new one', async ({ page }) => {
  await gotoAnalisi(page);
  const pill = page.getByRole('radiogroup', { name: 'Periodo di analisi' });
  const samples = await sampleExpenses(page, () => pill.getByRole('radio', { name: 'Storico', exact: true }).click());

  const from = number(samples[0].painted);
  const to = number(samples[samples.length - 1].painted);
  expect(to).not.toBe(from);
  const between = samples.map((sample) => number(sample.painted)).filter((value) => value > Math.min(from, to) && value < Math.max(from, to));
  expect(between.length).toBeGreaterThan(0);
  // The frame is never what is read: from the first moving frame on, the read text is the landed one.
  for (const sample of samples.filter((s) => number(s.painted) !== from)) expect(number(sample.read)).toBe(to);
});

test('the Scheda slides down from the right and back up from the left', async ({ page }) => {
  await gotoAnalisi(page);
  await page.getByRole('region', { name: 'Spese per categoria' }).getByRole('button', { name: /^Casa, / }).click();
  const scheda = page.getByRole('region', { name: /^Scheda di / });
  await expect(scheda).toBeVisible();

  /** The `translateX` of the level at `depth` on the first frame it is painted. */
  const firstOffset = (depth: number) =>
    page.evaluate(
      (wanted) =>
        new Promise<number>((resolve, reject) => {
          const start = performance.now();
          const tick = () => {
            const level = document.querySelector(`[data-drill-depth="${wanted}"]`);
            if (level) return resolve(new DOMMatrixReadOnly(getComputedStyle(level).transform).m41);
            if (performance.now() - start > 2_000) return reject(new Error(`no level at depth ${wanted}`));
            requestAnimationFrame(tick);
          };
          tick();
        }),
      depth,
    );

  const down = firstOffset(2);
  await scheda.getByRole('button', { name: /^Condominio, / }).click();
  expect(await down).toBeGreaterThan(0);
  await expect(page.getByText('Totale netto (1 voce)').filter({ visible: true })).toBeVisible();

  const up = firstOffset(1);
  await page.getByLabel('Posizione nel drill-down').getByRole('button', { name: 'Casa', exact: true }).click();
  expect(await up).toBeLessThan(0);
});

test.describe('with «riduci movimento»', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a period switch lands at once', async ({ page }) => {
    await gotoAnalisi(page);
    const pill = page.getByRole('radiogroup', { name: 'Periodo di analisi' });
    const samples = await sampleExpenses(page, () => pill.getByRole('radio', { name: 'Storico', exact: true }).click());
    const values = new Set(samples.map((sample) => number(sample.painted)));
    expect(values.size).toBeLessThanOrEqual(2);
  });
});
