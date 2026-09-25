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
