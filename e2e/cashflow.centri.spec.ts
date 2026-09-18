/**
 * Cashflow › Centri di Costo at 1440 — the page's first spec, born from the 2026-09-18 critique.
 *
 * 1. Opening a center is a NAVIGATION: the id lands in the URL, the focus on the back link; a
 *    reload keeps the detail; the browser's Back returns to the LIST (it used to leave
 *    Cashflow for the Panoramica) and hands the focus back to the row that opened it.
 * 2. A center has no pace: a ceiling still holding on what is booked, which the rows already
 *    in the calendar carry past, is the RISK — «supererà», «con le spese già in calendario» —
 *    and no sentence of the page says «ritmo».
 * 3. A NEW center never opens on a colour an active one wears, and a worn swatch says whose
 *    it is (until then every center was born `chart-1`: two cars, one blue).
 * 4. The dialog refuses in its reading line, in Italian, with the submit enabled; nothing is
 *    written (asserted on the emulator, never on the screen alone); closed, it hands the focus
 *    back to the control that opened it.
 * 5. Arming the delete prints the consequence under the button and moves nothing below it;
 *    Escape disarms and deletes nothing.
 *
 * Runs on its OWN account (`centri` project — scripts/seedCostCentersE2E.mts): Fenicottero
 * (chart-1, 800 € booked in January, a 300 € instalment on December 31st, annual ceiling 1000)
 * and Ornitorinco (chart-2, dormant). The names are decoy words.
 */

import { test, expect, type Page } from '@playwright/test';

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const LIST_URL = /\/dashboard\/cashflow\?tab=cost-centers$/;
const DETAIL_URL = /\/dashboard\/cashflow\?tab=cost-centers&center=e2e-cc-fenicottero$/;

/** On December 31st the instalment is booked: the ceiling is crossed for real, not at risk. */
const isLastDayOfYear = new Date().getMonth() === 11 && new Date().getDate() === 31;

/** The centers of the fixture account, read from the emulator (not from the page). */
async function savedCenterNames(): Promise<string[]> {
  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'costCenters' }],
        where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: 'test-user-centri' } } },
      },
    }),
  });
  const rows = (await res.json()) as Array<{ document?: { fields: { name: { stringValue: string } } } }>;
  return rows.flatMap((row) => (row.document ? [row.document.fields.name.stringValue] : [])).sort();
}

async function openList(page: Page) {
  await page.goto('/dashboard/cashflow?tab=cost-centers');
  await expect(page.getByRole('region', { name: 'Verdetto sui centri di costo' })).toBeVisible({ timeout: 60_000 });
}

const centri = (page: Page) => page.getByRole('region', { name: 'Centri', exact: true });

test.describe('Centri di Costo — desktop', () => {
  test.setTimeout(120_000);

  test('opening a center is a navigation: URL, focus, reload, Back', async ({ page }) => {
    await openList(page);
    const row = centri(page).getByRole('button', { name: /^Apri Fenicottero/ });
    await row.click();

    await expect(page).toHaveURL(DETAIL_URL);
    await expect(page.getByRole('region', { name: 'Verdetto su Fenicottero' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Centri di costo', exact: true })).toBeFocused();

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('region', { name: 'Verdetto su Fenicottero' })).toBeVisible({ timeout: 60_000 });

    // The reload is a fresh document: open the list and the detail again so Back has an entry to return to.
    await openList(page);
    await centri(page).getByRole('button', { name: /^Apri Fenicottero/ }).click();
    await expect(page).toHaveURL(DETAIL_URL);
    await page.goBack();
    await expect(page).toHaveURL(LIST_URL);
    await expect(page.getByRole('region', { name: 'Verdetto sui centri di costo' })).toBeVisible();
    await expect(centri(page).getByRole('button', { name: /^Apri Fenicottero/ })).toBeFocused();
  });

  test('a ceiling the calendar will cross is a risk, and nothing on the page speaks of a pace', async ({ page }) => {
    test.skip(isLastDayOfYear, 'On December 31st the instalment is booked and the ceiling is crossed for real.');
    const year = new Date().getFullYear();
    await openList(page);
    const listVerdict = page.getByRole('region', { name: 'Verdetto sui centri di costo' });
    await expect(listVerdict.getByRole('heading')).toHaveText(`Fenicottero supererà il tetto del ${year}.`);
    await expect(listVerdict).toContainText('con le spese già in calendario');

    await centri(page).getByRole('button', { name: /^Apri Fenicottero/ }).click();
    const verdict = page.getByRole('region', { name: 'Verdetto su Fenicottero' });
    await expect(verdict.getByRole('heading')).toHaveText(`Fenicottero supererà il tetto del ${year}.`);
    await expect(verdict).toContainText('Lo superi con le spese già in calendario');

    // «Quest'anno» prints what is BOOKED; the calendar is the caption's, with the gap past the ceiling.
    const costo = page.getByRole('region', { name: 'Costo di Fenicottero' });
    await expect(costo).toContainText(/con il calendario chiude a 1100[\s  ]*€, 100[\s  ]*€ oltre/);
    // Scoped to the ACTIVE panel: every Cashflow tab stays mounted (`forceMount`) and hidden, and
    // Tracciamento's «Al ritmo attuale» is right where it is — a month of groceries has a pace.
    await expect(page.locator('[role="tabpanel"][data-state="active"]')).not.toContainText(/ritmo/i);
  });

  test('a new center opens on a free colour, and a worn swatch says whose it is', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'Nuovo centro', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Nuovo centro di costo' })).toBeVisible();

    await expect(dialog.getByRole('button', { name: 'Colore 1 di 8, in uso da Fenicottero', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByRole('button', { name: 'Colore 2 di 8, in uso da Ornitorinco', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByRole('button', { name: 'Colore 3 di 8 (selezionato)', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Choosing a worn colour is allowed, and says what it costs.
    await dialog.getByRole('button', { name: /^Colore 1 di 8/ }).click();
    await expect(dialog).toContainText('È già il colore di Fenicottero: nei grafici i due centri non si distinguono.');
  });

  test('the dialog refuses in its reading line and writes nothing', async ({ page }) => {
    const before = await savedCenterNames();
    expect(before).toEqual(['Fenicottero', 'Ornitorinco']);

    await openList(page);
    await page.getByRole('button', { name: 'Nuovo centro', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog');
    const submit = dialog.getByRole('button', { name: 'Crea', exact: true });
    await expect(submit).toBeEnabled();
    // The reading of a NEW center teaches where an expense gets linked.
    await expect(dialog.getByRole('status')).toContainText('campo «Centro di Costo», sotto «Impostazioni avanzate»');

    await submit.click();
    await expect(dialog.getByRole('status')).toHaveText('Manca un campo: Nome.');
    await expect(dialog.getByLabel('Nome *', { exact: true })).toBeFocused();

    // Typing answers the refusal: the reading goes back to what the form is for.
    await dialog.getByLabel('Nome *', { exact: true }).fill('F');
    await expect(dialog.getByRole('status')).not.toContainText('Manca');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // The focus returns to the control that opened the window (it used to fall to `body`).
    await expect(page.getByRole('button', { name: 'Nuovo centro', exact: true }).filter({ visible: true }).first()).toBeFocused();
    expect(await savedCenterNames()).toEqual(before);
  });

  test('arming the delete prints the consequence under the button, moves nothing, and Escape deletes nothing', async ({ page }) => {
    await openList(page);
    await centri(page).getByRole('button', { name: /^Apri Fenicottero/ }).click();
    const costo = page.getByRole('region', { name: 'Costo di Fenicottero' });
    await expect(costo).toBeVisible();
    const topBefore = await costo.evaluate((el) => el.getBoundingClientRect().top);

    await page.getByRole('button', { name: 'Elimina centro di costo', exact: true }).click();
    const armed = page.getByRole('button', { name: /^Conferma eliminazione/ });
    await expect(armed).toHaveAttribute('aria-pressed', 'true');
    await expect(armed).toHaveText('Conferma');
    await expect(page.locator('[role="tabpanel"][data-state="active"]')).toContainText('2 spese restano in Cashflow e perdono solo il collegamento.');
    expect(await costo.evaluate((el) => el.getBoundingClientRect().top)).toBe(topBefore);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Elimina centro di costo', exact: true })).toBeVisible();
    expect(await savedCenterNames()).toEqual(['Fenicottero', 'Ornitorinco']);
  });
});
