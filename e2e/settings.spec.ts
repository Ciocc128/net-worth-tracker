/**
 * Impostazioni — quello che solo un layout vero può dire, a 1440px.
 *
 * PERCHÉ ESISTE: fino al 2026-09-22 Impostazioni non aveva nessuna spec (doc/guide/impostazioni.md →
 * Per-page blind spots), e la critique di quel giorno ha trovato cinque difetti che né Vitest né
 * `tsc` possono vedere:
 *  1. una lettura fallita degli accessi condivisi diventava «Nessun accesso condiviso»;
 *  2. le modifiche non salvate non dicevano QUALE dei sei tab le teneva, e non si potevano annullare;
 *  3. l'Auto-calcolo in Allocazione restava spento finché non si compilava un campo di un ALTRO tab;
 *  4. «Salva» con un gruppo di sottocategorie che non somma 100 rispondeva con un toast e lasciava lì;
 *  5. cinque `aria-controls` puntavano a pannelli mai montati.
 *
 * NESSUN test qui SCRIVE: si modifica il modulo e si annulla, o si preme «Salva» su un albero che la
 * validazione rifiuta. Che nulla sia stato scritto si verifica sull'emulatore (l'`updateTime` del
 * documento delle impostazioni), non sull'aspetto della pagina.
 *
 * Account base (`test@example.com`): target 60/30/10 su azioni, obbligazioni e criptovalute, due
 * sotto-target su equity (World 80 / Single Stock 20) con le sottocategorie SPENTE, età impostata e
 * risk-free no.
 *
 * REGRESSION GUARD, visti rossi rompendo una cosa alla volta (2026-09-22): `renderedPanels` tolto da
 * `PageTabs`; la chiamata a `revealTargetProblem` tolta da «Salva» (resta il toast); il ramo
 * `loadFailed` tolto da `AccountSharingSection`; `unsaved` forzato a false nelle definizioni dei tab.
 */

import { test, expect, type Page } from '@playwright/test';

const SETTINGS_DOC =
  'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/assetAllocationTargets/test-user-1';

/** When the settings document was last written — read from the emulator, not from the page. */
async function settingsUpdateTime(): Promise<string> {
  const res = await fetch(SETTINGS_DOC, { headers: { Authorization: 'Bearer owner' } });
  const doc = (await res.json()) as { updateTime: string };
  return doc.updateTime;
}

async function openSettings(page: Page, tab = 'allocazione') {
  await page.goto(`/dashboard/settings?tab=${tab}`, { waitUntil: 'load' });
  await expect(page.locator('h1:visible')).toContainText('Impostazioni', { timeout: 60_000 });
  // The opened tab's panel, with a tile in it, is the load's positive anchor (Radix unmounts the
  // CONTENT of an inactive panel, so no other tab's tiles exist).
  await expect(page.locator(`#settings-tab-pill-panel-${tab} section`).first()).toBeVisible({ timeout: 30_000 });
}

const unsavedBar = (page: Page) => page.getByRole('region', { name: 'Modifiche non salvate' });
/** A tab of the VISIBLE bar (the other one is `display:none`); a string name matches exactly. */
const visibleTab = (page: Page, name: string | RegExp) =>
  page.locator('[role="tablist"]:visible').getByRole('tab', typeof name === 'string' ? { name, exact: true } : { name });

test('ogni aria-controls dei tab nomina un pannello che esiste', async ({ page }) => {
  await openSettings(page);

  const dangling = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"][aria-controls]'))
      .map((tab) => tab.getAttribute('aria-controls')!)
      .filter((id) => !document.getElementById(id))
  );
  expect(dangling).toEqual([]);
});

test('età e risk-free stanno nella tessera della formula, non in un altro tab', async ({ page }) => {
  await openSettings(page);

  const autoCalc = page.locator('section[aria-label="Auto-calcolo Azioni / Obbligazioni"]');
  // D-T5: the age is DECLARED here (one editor, FIRE › Il mio piano), the risk-free rate is typed.
  await expect(autoCalc.locator('#userAge')).toHaveCount(0);
  await expect(autoCalc.getByRole('link', { name: 'FIRE › Il mio piano' })).toBeVisible();
  await expect(autoCalc.locator('#riskFreeRate')).toBeVisible();
  // The seed has an age and no typed rate: the field follows the ECB estimate and says so (no «manca»),
  // with no way back to offer yet because nothing was typed.
  await expect(autoCalc).toContainText('Stima: tasso AAA a 10 anni della BCE');
  await expect(autoCalc).not.toContainText('manca il risk-free rate');
  await expect(autoCalc.getByRole('button', { name: 'Torna alla stima' })).toHaveCount(0);

  await visibleTab(page, 'Preferenze').click();
  await expect(page.locator('section[aria-label="Calcolo dei rendimenti"]')).toBeVisible();
  await expect(page.locator('#userAge')).toHaveCount(0);
});

test('le modifiche non salvate si vedono per tab e «Annulla modifiche» torna al salvato senza scrivere', async ({ page }) => {
  await openSettings(page);
  const before = await settingsUpdateTime();
  const crypto = page.getByRole('spinbutton', { name: 'Target Criptovalute' });
  const saved = await crypto.inputValue();

  await expect(unsavedBar(page)).toHaveCount(0);
  await crypto.fill('15');

  await expect(visibleTab(page, 'Allocazione, modifiche non salvate')).toBeVisible();
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Allocazione');

  await visibleTab(page, 'Preferenze').click();
  await page.getByRole('switch', { name: 'Centri di Costo' }).click();
  await expect(unsavedBar(page)).toContainText('Modifiche non salvate in Allocazione e Preferenze');
  await expect(visibleTab(page, 'Preferenze, modifiche non salvate')).toBeVisible();

  await unsavedBar(page).getByRole('button', { name: 'Annulla modifiche' }).click();

  await expect(unsavedBar(page)).toHaveCount(0);
  await expect(visibleTab(page, 'Preferenze')).toBeVisible();
  await visibleTab(page, 'Allocazione').click();
  await expect(crypto).toHaveValue(saved);
  expect(await settingsUpdateTime()).toBe(before);
});

test('«Salva» con un gruppo che non somma 100 non scrive e porta il fuoco sul campo', async ({ page }) => {
  await openSettings(page);
  const before = await settingsUpdateTime();

  // Switch Azioni's subcategories on (80 + 20, valid), break the sum inside the group, then CLOSE it.
  await page.getByRole('button', { name: /^Apri sottocategorie di Azioni/ }).click();
  await page.locator('#toggle-equity').click();
  const firstSubPct = page.locator('input[id^="target-equity-sub-"][id$="-pct"]').first();
  await firstSubPct.fill(String(Number(await firstSubPct.inputValue()) - 10));
  await page.getByRole('button', { name: /^Chiudi sottocategorie di Azioni/ }).click();

  // Closed, the class row still says it: the sum is ON the row and in its name.
  await expect(page.getByRole('button', { name: /^Apri sottocategorie di Azioni \(sommano 90/ })).toBeVisible();
  await expect(page.locator('section[aria-label="Target per classe"]')).toContainText(
    /Le sottocategorie di Azioni sommano 90\s?% invece del 100\s?%/
  );

  // From ANOTHER tab: «Salva» brings the reader back to the field.
  await visibleTab(page, 'Preferenze').click();
  await page.locator('button:visible', { hasText: /^Salva$/ }).first().click();

  await expect(visibleTab(page, /^Allocazione/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^Chiudi sottocategorie di Azioni/ })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
    .toMatch(/^target-equity-sub-\d+-pct$/);
  expect(await settingsUpdateTime()).toBe(before);

  await unsavedBar(page).getByRole('button', { name: 'Annulla modifiche' }).click();
  await expect(unsavedBar(page)).toHaveCount(0);
});

test('una lettura fallita degli accessi non diventa «nessun accesso»', async ({ page }) => {
  // Positive control first: the members read works and the tile reads.
  await openSettings(page, 'condivisione');
  const tile = page.locator('section[aria-label="Condivisione account"]');
  // The count in the aside appears only once the read has come back.
  await expect(tile).toContainText(/\d+ access[oi]/);
  await expect(page.getByText('Condivisione account · lettura fallita')).toHaveCount(0);

  // The same page with the read cut.
  await page.route('**/api/account/members', (route) => route.abort());
  await openSettings(page, 'condivisione');
  const notice = page.getByRole('alert').filter({ hasText: 'Condivisione account · lettura fallita' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('non vuol dire che non ce l');
  await expect(page.getByText('Nessun accesso condiviso')).toHaveCount(0);

  // And it recovers in place once the read works again.
  await page.unroute('**/api/account/members');
  await notice.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.locator('section[aria-label="Condivisione account"]')).toBeVisible();
});

/**
 * Un documento nel formato vecchio (`monteCarloScenarios`) viene convertito in lettura; il primo «Salva» lo
 * riscrive come v2 anche senza che si sia toccato nulla (RQ8). Prima della correzione del 2026-10-11 il tab
 * risultava «pulito», «Salva» non scriveva e l'avviso tornava a ogni apertura. Visto rosso togliendo `marketPending`.
 * Il documento torna com'era alla fine (PATCH senza maschera = sostituzione intera): un «Salva» riscrive tutta la pagina e
 * altrimenti i test che seguono (sottocategorie di Azioni) leggerebbero un albero cambiato.
 */
test('un documento nel formato vecchio si riscrive come v2 al primo «Salva» e l\'avviso sparisce', async ({ page }) => {
  const num = (v: number) => ({ doubleValue: v });
  const scenario = (e: number, ev: number, b: number, bv: number, c: number, cv: number, i: number) => ({
    mapValue: { fields: { equityReturn: num(e), equityVolatility: num(ev), bondsReturn: num(b), bondsVolatility: num(bv), realEstateReturn: num(3), realEstateVolatility: num(12), commoditiesReturn: num(c), commoditiesVolatility: num(cv), inflationRate: num(i) } },
  });
  const patch = (fields: Record<string, unknown>, mask: string[]) =>
    fetch(`${SETTINGS_DOC}?${mask.map((m) => `updateMask.fieldPaths=${m}`).join('&')}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  const read = async () => ((await (await fetch(SETTINGS_DOC, { headers: { Authorization: 'Bearer owner' } })).json()) as { fields: Record<string, unknown> }).fields;

  // «Salva» writes the WHOLE page (allocation tree included): restore the document as it was, not just the two fields.
  const before = await read();
  await patch(
    { monteCarloScenarios: { mapValue: { fields: { bear: scenario(3, 22, 2, 8, 0, 20, 3), base: scenario(8, 17, 4, 6, 3, 18, 2.5), bull: scenario(11, 15, 5, 5, 5, 16, 2) } } } },
    ['monteCarloScenarios'],
  );
  try {
    await openSettings(page, 'simulazioni');
    await expect(page.locator('section[aria-label="Ipotesi di mercato delle simulazioni"]')).toContainText('convertite in termini reali');
    await expect(visibleTab(page, 'Simulazioni, modifiche non salvate')).toBeVisible();
    expect((await read()).monteCarloMarket).toBeUndefined();

    await unsavedBar(page).getByRole('button', { name: 'Salva' }).click();
    await expect(unsavedBar(page)).toHaveCount(0);
    const market = (await read()).monteCarloMarket as { mapValue: { fields: { version: { integerValue: string } } } };
    expect(market.mapValue.fields.version.integerValue).toBe('2');

    await openSettings(page, 'simulazioni');
    await expect(page.locator('section[aria-label="Ipotesi di mercato delle simulazioni"]')).not.toContainText('convertite in termini reali');
    // The typed values stay tinted, the research's estimates do not.
    await expect(page.getByRole('textbox', { name: 'Volatilità Azioni (%)' })).toHaveAttribute('data-written', 'true');
    await expect(page.getByRole('textbox', { name: 'Volatilità Oro (%)' })).not.toHaveAttribute('data-written', 'true');
  } finally {
    await fetch(SETTINGS_DOC, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: before }) });
  }
});
