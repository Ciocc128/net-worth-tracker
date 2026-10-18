/**
 * Allocazione › Accumulo composta per un tablet (2026-10-18; doc/guide/accumulo.md § Composizione mobile):
 * un file, due progetti — `tablet` (768×1024) e `tablet-landscape` (1024×768) — che si ramifica sulla
 * larghezza, sull'account base con il fixture di `e2e/accumuloFixture.ts` (un modello e UN piano attivo,
 * la terza rata aperta). Tre righe chiuse: il modello, Classi del piano, i criteri; in orizzontale tutte e
 * tre nell'indice accanto al verdetto e a Questo mese. Solo geometria: le parole sono dei file phone e di
 * Vitest (`__tests__/tabletComposition.test.ts` tiene dove va ogni riga a 768 e l'aritmetica dello stage).
 *
 * LA tessera (Questo mese) è alta: non si asserisce che la prima riga chiusa stia sopra la piega (si
 * misura con `npm run mobile:census`, che registra la riga sotto la pill con un `raisedBy`).
 */

import { test, expect, type Page } from '@playwright/test';
import { removeAccumuloFixture, seedAccumuloFixture } from './accumuloFixture';
import {
  expectGridAcrossMain,
  expectLandscapeStage,
  expectNoHalfCells,
  expectNoOverflow,
  expectOpenedRow,
  foldOf,
  gridTracks,
  isLandscape,
  openRow,
  rectOf,
} from './tabletLayout';

const LEAD_ID = 'acc-mese';
/** The three rows, in DOM order. */
const ROW_IDS = ['acc-modello', 'acc-classi', 'acc-criteri'] as const;

test.use({ contextOptions: { reducedMotion: 'reduce' } });
test.beforeAll(seedAccumuloFixture);
test.afterAll(removeAccumuloFixture);

const lead = (page: Page) => page.locator(`#${LEAD_ID}`);
/** The composed grid: the parent of THE tile's cell (in landscape it is `contents`, so not measured there). */
const gridOfLead = (page: Page) => lead(page).locator('xpath=..');

async function open(page: Page): Promise<void> {
  await page.goto('/dashboard/allocation?tab=accumulo');
  await expect(page.getByRole('region', { name: 'Verdetto sul piano di accumulo' })).toBeVisible({ timeout: 60_000 });
  await expect(lead(page)).toBeVisible();
}

test.describe('Allocazione › Accumulo, composta per un tablet', () => {
  test('due colonne a 768 con Questo mese su entrambe; lo stage in orizzontale a 1024', async ({ page }) => {
    await open(page);
    const fold = await foldOf(page);
    if (isLandscape(page)) {
      await expectLandscapeStage(page, page.locator('#page-main'), ROW_IDS);
    } else {
      const grid = gridOfLead(page);
      expect((await gridTracks(grid)).columns).toBe(2);
      const [gridRect, theTile] = await Promise.all([rectOf(grid), rectOf(lead(page))]);
      expect(Math.abs(theTile.width - gridRect.width), 'THE tile across the grid').toBeLessThanOrEqual(1);
      // Three closed rows: the model beside Classi del piano, the criteria alone on the whole row.
      await expectNoHalfCells(page, grid, ROW_IDS);
    }
    expect((await rectOf(lead(page))).y, 'THE tile starts above the fold').toBeLessThan(fold);
  });

  test('una riga aperta resta al suo posto nell\'indice a 1024 e occupa la griglia a 768, le righe dopo sotto di lei', async ({ page }) => {
    await open(page);
    const where = await openRow(page, ROW_IDS[1]);
    await expectOpenedRow(page, gridOfLead(page), ROW_IDS[1], where, ROW_IDS[0], ROW_IDS.slice(2));
    if (isLandscape(page)) await expectLandscapeStage(page, page.locator('#page-main'), ROW_IDS);
    else await expectNoHalfCells(page, gridOfLead(page), ROW_IDS);
  });

  test('ogni riga aperta: nulla oltre main', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of ROW_IDS) await expect(page.locator(`#${id}-trigger`)).toHaveAttribute('aria-expanded', 'true');
    await expectNoOverflow(page);
  });

  test('a 1440 la griglia è quella di una pagina aperta lì: dodici tracce, nessuna riga, le due colonne di prima', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const grid = gridOfLead(page);
    await expect.poll(async () => (await gridTracks(grid)).columns).toBe(12);
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
    await expectGridAcrossMain(page, grid);
    const [mese, modello, classi] = await Promise.all(
      ['Questo mese', 'Portafoglio modello', 'Classi del piano'].map((name) => rectOf(page.locator(`section[aria-label="${name}"]`))),
    );
    expect(modello.y, 'il modello sotto Questo mese').toBeGreaterThanOrEqual(mese.bottom - 1);
    expect(classi.x, 'Classi del piano nella colonna destra').toBeGreaterThan(mese.right - 1);
    expect(Math.abs(classi.y - mese.y), 'Classi del piano alla quota di Questo mese').toBeLessThanOrEqual(1);
  });
});
