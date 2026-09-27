/**
 * Allocazione a 390px — i bersagli delle due tessere del fork (Accumulo, Composizione ideale).
 *
 * PERCHÉ ESISTE: fino al 2026-09-25 i pulsanti dell'Accumulo erano `h-8` (32px) in fondo alla
 * tessera e `h-7` (28px) sulle righe della rata anche sul telefono, sotto il minimo di 44
 * (AGENTS.md → Accessibility). Ora sono `h-11 desktop:h-8` attraverso `TILE_ACTION_CLASS` e
 * `ROW_ACTION_CLASS` (`AccumuloTile.tsx`).
 *
 * Copre SOLO lo stato «nessun piano» (il pulsante «Crea piano»), che è quello dell'account base:
 * le righe di una rata richiedono un piano attivo, che nessun fixture semina. Quelle sono state
 * misurate sul mirror il 2026-09-25 (sonda usa e getta), non qui.
 *
 * REGRESSION GUARD: visto rosso rimettendo `h-8` al posto di `TILE_ACTION_CLASS` sul pulsante.
 */
import { test, expect } from '@playwright/test';

test('«Crea piano» dell’Accumulo è un bersaglio di almeno 44px sul telefono', async ({ page }) => {
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });

  const accumulo = page.locator('section[aria-label="Accumulo"]');
  const create = accumulo.getByRole('button', { name: 'Crea piano' });
  await expect(create).toBeVisible({ timeout: 30_000 });

  const box = await create.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

/**
 * «Composizione ideale» › «Con vendite mirate» at 390px (fork, 2026-09-27). Six columns measured
 * 393px inside a 356px dialog body during the collaudo, so the body scrolled sideways and «Tasse»
 * sat past the edge; in that mode «Differenza» now yields on a phone (`TARGETED_DIFF_CLASS`).
 * The block turns an ideal allocation on for the base account and removes it afterwards (same
 * hooks as `allocation.spec.ts`).
 *
 * REGRESSION GUARD: seen red with «Differenza» shown on the phone again.
 */
test.describe('Composizione ideale › Con vendite mirate a 390px', () => {
  const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
  const SETTINGS_URL = `${FIRESTORE}/assetAllocationTargets/test-user-1?updateMask.fieldPaths=idealAllocation`;
  const HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

  test.beforeAll(async () => {
    const idealAllocation = {
      mapValue: {
        fields: {
          enabled: { booleanValue: true },
          classPriority: { stringValue: 'essential' },
          leveragePriority: { stringValue: 'off' },
          factorObjectives: { arrayValue: {} },
          geography: { nullValue: null },
          instrumentLimits: { arrayValue: {} },
          groupLimits: { arrayValue: {} },
        },
      },
    };
    const res = await fetch(SETTINGS_URL, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ fields: { idealAllocation } }) });
    expect(res.ok).toBe(true);
  });

  test.afterAll(async () => {
    await fetch(SETTINGS_URL, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ fields: {} }) });
  });

  test('la tabella con la colonna «Tasse» sta nel dialog, senza scorrere di lato', async ({ page }) => {
    await page.goto('/dashboard/allocation', { waitUntil: 'load' });
    await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
    await page.locator('section[aria-label="Composizione ideale"]').getByRole('button', { name: 'Calcola' }).click();
    const dialog = page.getByRole('dialog', { name: 'Composizione ideale' });
    await dialog.getByRole('radio', { name: 'Con vendite mirate' }).click();
    await dialog.getByLabel('Tasse massime (€)').fill('100000');
    await dialog.getByRole('button', { name: 'Calcola' }).click();
    await expect(dialog.getByText(/^Vendi .* di tasse/)).toBeVisible({ timeout: 60_000 });

    const fit = await dialog.evaluate((d) => {
      const table = d.querySelector('table')!.getBoundingClientRect();
      const body = d.querySelector('table')!.closest('.overflow-y-auto') as HTMLElement;
      return { tableRight: table.right, bodyRight: body.getBoundingClientRect().right, bodyScroll: body.scrollWidth - body.clientWidth };
    });
    expect(fit.tableRight, 'the table ends inside the dialog body').toBeLessThanOrEqual(fit.bodyRight);
    expect(fit.bodyScroll, 'the dialog body does not scroll sideways').toBeLessThanOrEqual(0);
    await expect(dialog.getByRole('columnheader', { name: 'Tasse' })).toBeVisible();
  });
});
