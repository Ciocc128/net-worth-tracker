/**
 * Analisi at 390px — the width DESIGN.md designs against first.
 *
 * Three things only a mobile viewport can prove: the tiles stack in the declared reading order
 * with nothing scrolling sideways, the Sankey's truncation is DECLARED (the chart drops small
 * slices for legibility — silent truncation was a recorded defect), and the row-to-Scheda flow
 * works under touch at the narrow layout.
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

test('declares the mobile Sankey truncation instead of dropping slices silently', async ({ page }) => {
  await expect(page.getByText(/mostra solo le voci principali/)).toBeVisible();
});

test('opens the Scheda from a category row under touch', async ({ page }) => {
  await page.getByRole('region', { name: 'Spese per categoria' }).getByRole('button', { name: /^Casa, / }).click();

  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page.getByText(`Totale · ${CURRENT_YEAR}`).locator('..').getByText(/^380[\s ]*€$/)).toBeVisible();
  // The per-year table renders as a flat list readable at 390px.
  await expect(page.getByText('Per anno', { exact: true })).toBeVisible();
});

// ── 50/30/20 roles on a phone ───────────────────────────────────────────────────────────────────
//
// Same fixture as analisi.spec.ts's roles block (roles on the categories, the account flag off by
// default): turned on through the emulator for these tests only.

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';

async function setSpendingRolesEnabled(enabled: boolean): Promise<void> {
  const res = await fetch(`${FIRESTORE}/assetAllocationTargets/test-user-analisi?updateMask.fieldPaths=spendingRolesEnabled`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { spendingRolesEnabled: { booleanValue: enabled } } }),
  });
  expect(res.ok).toBe(true);
}

test.describe('Flusso by 50/30/20 role at 390', () => {
  test.beforeAll(async () => setSpendingRolesEnabled(true));
  test.afterAll(async () => setSpendingRolesEnabled(false));

  test('draws the 50/30/20 bar and each role\'s categories as rows, no Sankey', async ({ page }) => {
    const flusso = page.getByRole('region', { name: 'Flusso', exact: true });
    await flusso.scrollIntoViewIfNeeded();
    await expect(flusso.getByRole('button', { name: 'Per ruolo' })).toHaveAttribute('aria-pressed', 'true');

    // The legend carries the figures, on the reading's own base (the 2000 that came in).
    const legend = flusso.getByRole('list', { name: 'Quote del flusso' });
    await expect(legend.getByRole('listitem')).toHaveText([/^Necessità\s*15%$/, /^Desideri\s*4%$/, /^Da classificare\s*20%$/, /^Risparmi\s*61%$/]);
    await expect(flusso).toContainText('tacche a 50 e 80');
    await expect(flusso.getByRole('img')).toHaveCount(0);
    await expect(flusso.getByText(/mostra solo le voci principali/)).toHaveCount(0);

    // Casa sits under both roles its rows resolve to; the surplus is named under Risparmi.
    await expect(flusso.getByRole('region', { name: 'Necessità' }).getByRole('button', { name: /^Casa, / })).toBeVisible();
    await expect(flusso.getByRole('region', { name: 'Desideri' }).getByRole('button', { name: /^Casa, / })).toBeVisible();
    await expect(flusso.getByRole('region', { name: 'Da classificare' }).getByRole('button', { name: /^Alimentari, / })).toBeVisible();
    await expect(flusso.getByRole('region', { name: 'Risparmi' })).toContainText(/1220[\s ]*€ avanzati nel periodo\./);

    // A 390px page never scrolls sideways, rows included.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a role\'s row opens the Scheda under touch', async ({ page }) => {
    const flusso = page.getByRole('region', { name: 'Flusso', exact: true });
    await flusso.getByRole('region', { name: 'Da classificare' }).getByRole('button', { name: /^Alimentari, / }).click();
    await expect(page.getByRole('region', { name: /^Scheda di / })).toContainText('Alimentari');
  });

  test('«Per tipo» keeps today\'s reduced phone Sankey', async ({ page }) => {
    const flusso = page.getByRole('region', { name: 'Flusso', exact: true });
    await flusso.getByRole('button', { name: 'Per tipo' }).click();
    await expect(flusso.getByRole('img')).toBeVisible();
    await expect(flusso.getByText(/mostra solo le voci principali/)).toBeVisible();
    await expect(flusso.getByRole('list', { name: 'Quote del flusso' })).toHaveCount(0);
  });
});
