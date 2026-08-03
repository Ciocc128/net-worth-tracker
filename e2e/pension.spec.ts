/**
 * Previdenza — desktop regressions that only a real browser can catch.
 *
 * Every figure asserted here comes from `scripts/seedPensionE2E.mts`, which the global setup writes
 * before the suite runs; when a number below looks arbitrary, that file explains why it was chosen.
 *
 * Deliberately NOT covered: anything a Vitest file already proves. `derivePensionContributionYears`
 * decides which years exist and `computePensionReturn` decides what the percentages are — those have
 * unit tests. What is tested here is that the page puts them in the right place, at the right size,
 * under the right control.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Match an exact euro amount as the app prints it.
 *
 * Two traps this exists for: `Intl` separates the amount from the € with a NON-BREAKING space, and
 * a plain substring match for "821,01" also matches "1821,01". Anchored regex solves both.
 */
function euro(amount: string): RegExp {
  return new RegExp(`^${amount.replace(/[.]/g, '\\.')}[\\s\\u00a0]*€$`);
}

/** Contributions with taxYear 2026 in the fixture: 534,88 + 134,11 + 152,02. */
const TOTAL_2026 = euro('821,01');
/**
 * The single 2025 contribution. No thousands separator on purpose: CLDR gives Italian
 * `minimumGroupingDigits = 2`, so four-digit amounts are printed ungrouped.
 */
const TOTAL_2025 = euro('1000,00');
/** Last point of the fixture's value series. */
const FUND_VALUE = euro('29.800,00');
/** `valueGrowth (1.800) − contributions recorded in July (821,01)`. */
const MARKET_GAIN = euro('978,99');

/** Il titolo si accorda al numero di fondi tracciati: la fixture ne ha uno, ma il locator no. */
const RETURN_CARD_HEADING = /^Rendimento (del fondo|dei fondi)$/;

function heroValue(page: Page): Locator {
  return page.getByText(FUND_VALUE);
}

async function gotoPension(page: Page): Promise<void> {
  await page.goto('/dashboard/pension');
  // The hero value is the last thing to settle; waiting on it makes every later assertion stable.
  await expect(heroValue(page)).toBeVisible({ timeout: 30_000 });
}

/** Computed pixel size of an element's font — the only way to verify the type scale really applied. */
async function fontSizePx(locator: Locator): Promise<number> {
  const raw = await locator.first().evaluate((el) => getComputedStyle(el).fontSize);
  return parseFloat(raw);
}

/**
 * Nessun frame del caricamento afferma qualcosa che la pagina non ha ancora letto.
 *
 * Polling after the fact would race the render. A MutationObserver installed before the first
 * script runs records the offending state even if it flashes for one frame.
 *
 * TRE marcatori, non uno. L'empty state è il primo, ma le quattro query della pagina defaultano
 * tutte a `[]` e ognuna ha un numero che senza i suoi dati vale zero — su una pagina che altrove si
 * rifiuta di stampare «+0,00%» come misura, uno zero è un'affermazione, non un segnaposto.
 *
 * ONESTÀ SULLA PORTATA DI QUESTO TEST: `versato-totale-zero` e `hero-senza-compagno` NON riproducono
 * la corsa fra le query. Il Web SDK di Firestore multiplexa tutti e quattro i target su UN SOLO
 * webchannel (verificato ispezionando le richieste: un `addTarget` per `assets`,
 * `pensionContributions` e `monthly-snapshots` sulla stessa connessione), quindi non sono ritardabili
 * l'uno rispetto all'altro e sull'emulatore atterrano nello stesso batch di React. Misurato, non
 * supposto: riportando lo skeleton alle sole due query originali questo test resta verde, e anche
 * con latenza CDP — che è uniforme, e quindi non apre nessuna finestra. Valgono come guardia sugli
 * stati DETERMINISTICI (un ramo che rende zero perché è sbagliato, non perché è in ritardo); la
 * corsa vera è coperta dal gate a quattro query nel codice.
 */
test('never states, at any point in the load, something it has not read', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { __violations: [] as string[] });
    const record = (violation: string) => {
      const seen = (window as unknown as { __violations: string[] }).__violations;
      if (!seen.includes(violation)) seen.push(violation);
    };

    const headingWithText = (text: string) =>
      [...document.querySelectorAll('h1, h2, h3, h4')].some((h) => h.textContent?.trim() === text);

    const check = () => {
      // `innerText` restituisce il testo RENDERIZZATO, quindi applica `text-transform`: un marcatore
      // preso da una label eyebrow (`uppercase`) non matcherebbe mai. Questo va bene su una frase in
      // caso normale; per i confronti su titoli si usa `textContent` in `headingWithText`.
      if (document.body?.innerText?.includes('Nessun fondo pensione ancora tracciato')) {
        record('empty-state');
      }

      // «Versato totale» e il suo importo sono fratelli nella riga a piè della card hero.
      const label = [...document.querySelectorAll('span')].find(
        (el) => el.textContent?.trim() === 'Versato totale'
      );
      if (label && /^0,00/.test(label.nextElementSibling?.textContent?.trim() ?? '')) {
        record('versato-totale-zero');
      }

      // La colonna 1fr della riga hero non resta mai vuota: o il rendimento, o la spiegazione del
      // perché non è ancora calcolabile. Con un solo figlio la griglia [2fr_1fr] lascerebbe un terzo
      // di riga bianco a 1440px, senza che niente spieghi il vuoto.
      if (headingWithText('Valore attuale') && !headingWithText('Rendimento del fondo')) {
        record('hero-senza-compagno');
      }
    };

    // `document`, NON `document.documentElement`: quando `addInitScript` gira il documento è appena
    // stato creato e `documentElement` è ancora `null`, quindi `observe()` lancia
    // «parameter 1 is not of type 'Node'», l'init script muore lì e l'observer non si attacca mai —
    // il test resta verde perché non ha osservato niente. `document` è già un Node a quel punto e
    // con `subtree: true` copre esattamente lo stesso albero.
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });

  await gotoPension(page);

  const violations = await page.evaluate(
    () => (window as unknown as { __violations: string[] }).__violations
  );
  expect(violations).toEqual([]);
});

test('lays the hero and the return card side by side at 1440px', async ({ page }) => {
  await gotoPension(page);

  const hero = page.getByRole('heading', { name: 'Valore attuale' }).locator('..');
  const returnCard = page.getByRole('heading', { name: RETURN_CARD_HEADING }).locator('..');

  const heroBox = (await hero.boundingBox())!;
  const returnBox = (await returnCard.boundingBox())!;

  // Side by side, not stacked: the return card starts to the RIGHT of the hero, on the same row.
  expect(returnBox.x).toBeGreaterThan(heroBox.x + heroBox.width / 2);
  expect(Math.abs(returnBox.y - heroBox.y)).toBeLessThan(24);

  // The 2fr_1fr ratio: the hero takes roughly twice the companion's width.
  expect(heroBox.width / returnBox.width).toBeGreaterThan(1.6);

  // Page hero steps up to 54px on desktop (DESIGN.md §3); section heroes stay at 36px.
  expect(await fontSizePx(heroValue(page))).toBe(54);
  expect(await fontSizePx(page.getByText(TOTAL_2026))).toBe(36);
});

test('the year axis governs the tax chapter and leaves the fund value alone', async ({ page }) => {
  await gotoPension(page);

  const yearAxis = page.getByRole('tablist', { name: 'Anno fiscale' });
  await expect(yearAxis.getByRole('tab')).toHaveText(['2026', '2025']);

  // Opens on the current year.
  await expect(page.getByRole('heading', { name: 'Versato nel 2026' })).toBeVisible();
  await expect(page.getByText(TOTAL_2026)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Storico versamenti 2026' })).toBeVisible();

  await yearAxis.getByRole('tab', { name: '2025' }).click();

  // Scoped to its own card: the same amount also appears in the recap rows and in the history.
  const versato2025 = page.getByRole('heading', { name: 'Versato nel 2025' }).locator('..');
  await expect(versato2025).toBeVisible();
  await expect(versato2025.getByText(TOTAL_2025).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Storico versamenti 2025' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Risparmio IRPEF · Marco/ })).toBeVisible();

  // The fund's value and its market return are not annual quantities — the axis must not touch them.
  await expect(heroValue(page)).toBeVisible();
});

test('states the return as a percentage and keeps its decomposition behind a disclosure', async ({
  page,
}) => {
  await gotoPension(page);

  // The fixture's series sits well inside the plausible band, so a percentage is shown rather than
  // the missing-contributions warning or the idle-window note.
  await expect(page.getByText('+3.48%')).toBeVisible();
  await expect(page.getByText('non si è ancora mosso')).toBeHidden();

  const disclosure = page.getByRole('button', { name: 'Da dove viene la crescita' });
  await expect(page.getByText('Ritorno sul tuo capitale')).toBeHidden();

  await disclosure.click();

  await expect(page.getByText('Ritorno sul tuo capitale')).toBeVisible();
  // July's value jump is exactly the contributions recorded that month, so the market gain must
  // exclude them — the whole point of keeping the three causes apart.
  await expect(page.getByText(MARKET_GAIN).first()).toBeVisible();
});

test('keeps the primary action in the page header, above the hero', async ({ page }) => {
  await gotoPension(page);

  const action = page.getByRole('button', { name: 'Registra versamento' });
  await expect(action).toBeVisible();

  const actionBox = (await action.boundingBox())!;
  const heroBox = (await heroValue(page).boundingBox())!;

  expect(actionBox.y).toBeLessThan(heroBox.y);
});
