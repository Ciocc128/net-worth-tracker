/**
 * Solo-fork features — desktop regressions that only a real browser can catch.
 *
 * Four features exist in this fork and NOT in upstream: Esposizione a cinque viste, ETF a leva,
 * l'alias del ticker (`displayTicker`) e l'import CSV delle spese. Nessuna spec di upstream le
 * protegge, quindi un merge le può rompere in silenzio — l'unica verifica che esistesse finora era
 * il punto 5 del giro guidato dell'ultimo merge (SESSION_NOTES.md, 2026-09-07). Questo file le rende
 * un test permanente.
 *
 * Runs on the shared `test-user-1` fixture (`scripts/seedEmulator.ts`), like most of the suite.
 * Two of the four blocks mutate that account (leva/alias on `seed-vwce`, an expense-import batch)
 * and restore it in `test.afterAll`/`finally` so later specs in the run see the same state they
 * always have — no dedicated fixture needed, since neither mutation touches any figure another
 * spec asserts (leverage/alias are metadata-only; the import commits to categories that already
 * exist and is undone through the wizard's own "Annulla import", never a raw Firestore delete).
 *
 * Esposizione is tested against a MOCKED `/api/portfolio/exposure` response (`page.route`), not
 * against Yahoo Finance: the real endpoint depends on a live network call and a 24h server cache,
 * which would make this suite flaky and non-deterministic. What is under test here is that the
 * tile renders what the API returns — the computation itself (`exposureEngine.ts`) has its own
 * Vitest suite.
 */

import { test, expect, type Page } from '@playwright/test';
import type { PortfolioExposureData, PortfolioExposureResponse } from '../types/exposure';

// ─── Esposizione a cinque viste ─────────────────────────────────────────────

/** One view's worth of mock data: one entry, one source, fully covered. */
function mockView(key: string, label: string, amount: number, sourceTicker: string, sourceName: string): PortfolioExposureData['holdings'] {
  return {
    entries: [
      {
        key,
        label,
        exposureEur: amount,
        exposurePct: 1,
        sources: [{ assetName: sourceName, ticker: sourceTicker, contributionEur: amount, weight: 0.5, baseValueEur: amount * 2 }],
      },
    ],
    coverage: {
      baseEur: amount,
      read: { amountEur: amount, instruments: [sourceName] },
      notApplicable: { amountEur: 0, instruments: [] },
      unread: { amountEur: 0, instruments: [] },
    },
  };
}

const MOCK_EXPOSURE: PortfolioExposureData = {
  holdings: mockView('MOCKCO', 'Mock Company SA', 1000, 'MOCKCO', 'Mock ETF Holdings'),
  sectors: mockView('mock-tech', 'Tecnologia Fittizia', 800, 'MOCKCO', 'Mock ETF Holdings'),
  geography: mockView('mock-country', 'Paese Immaginario', 600, 'MOCKCO', 'Mock ETF Holdings'),
  currency: mockView('MCK', 'Valuta Fittizia', 500, 'MOCKCO', 'Mock ETF Holdings'),
  issuers: mockView('mock-issuer', 'Emittente Fittizio', 900, 'MOCKCO', 'Mock ETF Holdings'),
  allocatableMarketValueEur: 1000,
  quotationCurrencies: ['EUR'],
  allocatableAssets: 1,
  totalAssets: 1,
  computedAt: new Date().toISOString(),
  cacheKey: 'e2e-mock',
  oldestProfileAsOf: null,
};

const MOCK_RESPONSE: PortfolioExposureResponse = { exposure: MOCK_EXPOSURE, cached: false };

test.describe('Esposizione a cinque viste (solo fork)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/portfolio/exposure**', (route) => route.fulfill({ json: MOCK_RESPONSE }));
  });

  test('switches all five views and opens a drill-down', async ({ page }) => {
    await page.goto('/dashboard/allocation');
    const tile = page.getByRole('region', { name: 'Esposizione del portafoglio' });
    await expect(tile).toBeVisible({ timeout: 30_000 });

    // Default view: Titoli (holdings).
    await expect(tile.getByText('Mock Company SA', { exact: true })).toBeVisible();

    const toggle = tile.getByRole('group', { name: "Vista dell'esposizione" });
    const views: Array<[string, string]> = [
      ['Settori', 'Tecnologia Fittizia'],
      ['Paesi', 'Paese Immaginario'],
      ['Valute', 'Valuta Fittizia'],
      ['Emittenti', 'Emittente Fittizio'],
    ];
    for (const [button, label] of views) {
      await toggle.getByRole('button', { name: button, exact: true }).click();
      // The tile's own reading sentence also names the top entry ("il primo settore è …"), so the
      // row's label span needs `exact: true` to stay a single match.
      await expect(tile.getByText(label, { exact: true })).toBeVisible();
    }

    // Back to Titoli, then open the drill-down: the row's single source must appear.
    await toggle.getByRole('button', { name: 'Titoli', exact: true }).click();
    await expect(tile.getByText('Mock Company SA', { exact: true })).toBeVisible();
    await tile.getByRole('button', { name: /Mock Company SA/ }).click();
    await expect(tile.getByText('Mock ETF Holdings', { exact: true })).toBeVisible();
  });

  test('surfaces the API error state instead of a blank tile', async ({ page }) => {
    await page.unroute('**/api/portfolio/exposure**');
    await page.route('**/api/portfolio/exposure**', (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.goto('/dashboard/allocation');
    const tile = page.getByRole('region', { name: 'Esposizione del portafoglio' });
    await expect(tile.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    await expect(tile.getByText('Errore nel caricamento')).toBeVisible();
  });
});

// ─── ETF a leva + alias del ticker (metadata-only edit on the ledger asset) ─

/** Opens the edit dialog for the base seed's VWCE ETF from the Strumenti table (desktop only —
 *  the same row is duplicated, hidden, in the mobile card list; scoping to `table tr` avoids it). */
async function openVwceEditDialog(page: Page) {
  const row = page.locator('table tr', { hasText: 'Vanguard FTSE All-World' });
  await row.getByRole('button', { name: 'Modifica asset' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vanguard FTSE All-World' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('ETF a leva + alias del ticker (solo fork)', () => {
  test.afterAll(async ({ browser }) => {
    // Defensive reset in case the test below failed after writing but before its own cleanup:
    // clear both fields back to the base seed's plain state so later spec files see it unchanged.
    const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
    try {
      // No baseURL on a page created outside the test fixtures — full URL, matching the config's port.
      await page.goto('http://localhost:3100/dashboard/assets');
      const dialog = await openVwceEditDialog(page);
      const leva = dialog.getByLabel('Leva', { exact: true });
      const alias = dialog.getByLabel('Alias visualizzato');
      if ((await leva.inputValue()) !== '' || (await alias.inputValue()) !== '') {
        await leva.fill('');
        await alias.fill('');
        await dialog.getByRole('button', { name: 'Salva modifiche' }).click();
        await expect(dialog).toBeHidden();
      } else {
        await dialog.getByRole('button', { name: 'Annulla' }).click();
      }
    } finally {
      await page.close();
    }
  });

  test('sets a leverage ratio and a display alias, and both round-trip', async ({ page }) => {
    await page.goto('/dashboard/assets');

    let dialog = await openVwceEditDialog(page);
    await dialog.getByLabel('Leva', { exact: true }).fill('2');
    await dialog.getByLabel('Alias visualizzato').fill('ALL-WORLD');
    await dialog.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(dialog).toBeHidden();

    // The Strumenti table renders the alias in place of the raw ticker (getAssetDisplayTicker).
    const row = page.locator('table tr', { hasText: 'Vanguard FTSE All-World' });
    await expect(row.getByText('ALL-WORLD', { exact: true })).toBeVisible();
    await expect(row.getByText('VWCE.DE', { exact: true })).not.toBeVisible();

    // Reload — a form is only really verified after a refetch, not just after its own submit.
    await page.reload({ waitUntil: 'load' });
    dialog = await openVwceEditDialog(page);
    await expect(dialog.getByLabel('Leva', { exact: true })).toHaveValue('2');
    await expect(dialog.getByLabel('Alias visualizzato')).toHaveValue('ALL-WORLD');

    // Clear both back out (the "setting and clearing" pair from AGENTS.md's Settings gotcha):
    // an empty leva must read as "nessuna leva" (1x, no field persisted) and the ticker must
    // fall back to the raw VWCE.DE once the alias is gone.
    await dialog.getByLabel('Leva', { exact: true }).fill('');
    await dialog.getByLabel('Alias visualizzato').fill('');
    await dialog.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(dialog).toBeHidden();

    await expect(row.getByText('VWCE.DE', { exact: true })).toBeVisible();

    await page.reload({ waitUntil: 'load' });
    dialog = await openVwceEditDialog(page);
    await expect(dialog.getByLabel('Leva', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('Alias visualizzato')).toHaveValue('');
    await dialog.getByRole('button', { name: 'Annulla' }).click();
  });
});

// ─── Import CSV delle spese ──────────────────────────────────────────────────

/** Both rows attach to categories the base seed already has (`Alimentari` variable, `Stipendio`
 *  income) — "Da creare" must read 0, so committing and undoing never leaves a category behind. */
const IMPORT_CSV = [
  'data;importo;tipo;categoria;sottocategoria;note;valuta',
  '2020-01-15;12,34;variable;Alimentari;;e2e-fork-features import marker;EUR',
  '2020-01-16;500,00;income;Stipendio;;e2e-fork-features import marker;EUR',
].join('\r\n');

test.describe('Import CSV delle spese (solo fork)', () => {
  test('previews, commits and undoes a batch without touching categories', async ({ page }) => {
    await page.goto('/dashboard/settings?tab=spese');

    const tile = page.getByRole('region', { name: 'Import CSV' });
    await expect(tile).toBeVisible({ timeout: 30_000 });

    await tile.getByLabel('Carica file CSV storico spese').setInputFiles({
      name: 'e2e-fork-features.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(IMPORT_CSV, 'utf-8'),
    });

    // Preview: 2 valid rows, 0 categories to create (both names already exist in the base seed).
    await expect(tile.getByText('Da importare', { exact: true })).toBeVisible();
    const createButton = tile.getByRole('button', { name: 'Importa 2 voci' });
    await expect(createButton).toBeVisible();
    await expect(tile.getByText('Categorie che verranno create')).not.toBeVisible();

    await createButton.click();
    await expect(tile.getByText('Importate 2 transazioni.')).toBeVisible({ timeout: 15_000 });

    // Self-cleaning: the wizard's own undo, never a raw Firestore delete (AGENTS.md → remove a
    // fixture BY THE APP). The confirmation is a toast (outside the tile's own DOM), and its
    // reported count proves exactly the two rows just written came back.
    await tile.getByRole('button', { name: 'Annulla import' }).click();
    await expect(page.getByText('Import annullato: 2 transazioni rimosse.')).toBeVisible({ timeout: 15_000 });
  });
});
