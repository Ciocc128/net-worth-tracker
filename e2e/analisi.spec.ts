/**
 * Analisi (entity-first redesign, 2026-08-14) — desktop regressions only a real browser can catch.
 *
 * Every figure asserted here comes from `scripts/seedAnalisiE2E.mts`: all expenses are dated
 * JANUARY of the current/previous year, so year-to-date windows contain them whatever month the
 * suite runs in, and every derived number below is exact. When an amount looks arbitrary, that
 * file explains the arithmetic.
 *
 * Deliberately NOT covered: what Vitest already proves. `expenseEntityStats` decides the year
 * table's numbers and `comparisonDeltas` the pacing/ranking — those have unit tests. What is
 * tested here is the page: that a bookmarked focus URL cold-loads into an open dossier, that the
 * search reaches a zero-spend entity, that the focus survives a period switch, and that every
 * entity entry point lands on the same destination.
 */

import { test, expect, type Page } from '@playwright/test';

const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;

/**
 * Match an exact euro amount as the app prints it — Intl uses a non-breaking space before €,
 * and Italian CLDR prints four-digit amounts UNGROUPED ("2000,00 €"). Anchored, so "300,00"
 * cannot also match "1300,00".
 */
function euro(amount: string): RegExp {
  return new RegExp(`^${amount.replace(/[.]/g, '\\.')}[\\s\\u00a0]*€$`);
}

/** The dossier's period-scoped hero block ("Totale · {finestra}" + the amount under it). */
function dossierHero(page: Page, periodLabel: string) {
  return page.getByText(`Totale · ${periodLabel}`).locator('..');
}

/** The dossier's per-year table (the year-over-year answer). */
function perYearTable(page: Page) {
  return page.getByText('Per anno', { exact: true }).locator('..');
}

async function gotoAnalisi(page: Page, query = ''): Promise<void> {
  await page.goto(`/dashboard/analisi${query}`);
  // The KPI trio is the last always-visible block to settle. `.first()`: the seeded
  // income is one category, so the same amount legitimately repeats in its
  // composition row (Stipendio = 100% of Entrate).
  await expect(page.getByText(euro('2000,00')).first()).toBeVisible({ timeout: 30_000 });
}

test('states the seeded KPI totals with their YoY pacing rows', async ({ page }) => {
  await gotoAnalisi(page);

  // January-only fixture: Entrate 2000, Spese 780, Risparmio 1220 — the transfer row
  // (+150) must be inside none of them.
  await expect(page.getByText(euro('780,00'))).toBeVisible();
  await expect(page.getByText(euro('1220,00'))).toBeVisible();
  // The savings label is duplicated in the DOM (mobile row + desktop stack) and the
  // DOM-first copy is the HIDDEN mobile one — filter on visibility, not position.
  await expect(page.getByText('61.0% risparmiato').filter({ visible: true })).toBeVisible();

  // Pacing from comparisonDeltas: spese (780−900)/900, entrate (2000−1900)/1900 — both
  // captioned against the previous year's same months.
  await expect(page.getByText('-13.3%')).toBeVisible();
  await expect(page.getByText('+5.3%')).toBeVisible();
  await expect(page.getByText(`vs ${PREVIOUS_YEAR} (stessi mesi`).first()).toBeVisible();
});

test('drills composition → category dossier → subcategory transactions, writing the focus to the URL', async ({
  page,
}) => {
  await gotoAnalisi(page);

  // Level 1 → Casa (aria-label from CompositionList: "name, value, share").
  await page.getByRole('listitem', { name: /^Casa, /, exact: false }).click();

  // Category dossier: period hero + per-year table + its own subcategory ranking.
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(euro('380,00'))).toBeVisible();
  const casaYears = perYearTable(page);
  await expect(casaYears.getByText('YTD')).toBeVisible();
  await expect(
    casaYears.getByText(new RegExp(`\\+40,00[\\s\\u00a0]*€ \\(\\+11\\.8%\\) vs ${PREVIOUS_YEAR} stessi mesi`))
  ).toBeVisible();
  await expect(page.getByText(`Sottocategorie · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page).toHaveURL(/focusType=fixed/);
  await expect(page).toHaveURL(/focusCat=e2e-cat-casa/);

  // Level 2 → Condominio: the condominio question, answered in place.
  await page.getByRole('listitem', { name: /^Condominio, /, exact: false }).click();

  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(euro('300,00'))).toBeVisible();
  const condYears = perYearTable(page);
  await expect(
    condYears.getByText(new RegExp(`\\+50,00[\\s\\u00a0]*€ \\(\\+20\\.0%\\) vs ${PREVIOUS_YEAR} stessi mesi`))
  ).toBeVisible();
  // The oldest tracked year has no baseline — "—", never a fabricated zero.
  // `exact`: the CY row's delta caption also contains the previous year ("vs 2025 stessi mesi").
  await expect(condYears.getByText(String(PREVIOUS_YEAR), { exact: true })).toBeVisible();
  await expect(condYears.getByText('—')).toBeVisible();

  // The transaction list is period-scoped and signed ("netto"), under the gross hero.
  // The total row is duplicated in the DOM (mobile card + desktop tfoot) and the
  // DOM-first copy is the hidden mobile one — filter on visibility, not position.
  await expect(page.getByText(`Transazioni · ${CURRENT_YEAR}`)).toBeVisible();
  await expect(page.getByText('Totale netto (1 voce)').filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/focusSub=e2e-sub-cond/);
});

test('cold-loads a bookmarked focus URL straight into the open dossier', async ({ page }) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa&focusSub=e2e-sub-cond');

  // No clicks: the deep link IS the check — breadcrumb, hero and year delta all present.
  await expect(page.getByLabel('Posizione nel drill-down').getByText('Condominio')).toBeVisible();
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(euro('300,00'))).toBeVisible();
  await expect(
    perYearTable(page).getByText(new RegExp(`\\+50,00[\\s\\u00a0]*€ \\(\\+20\\.0%\\)`))
  ).toBeVisible();
});

test('keeps the focus across a period switch — the period is a cursor, not a cage', async ({
  page,
}) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa&focusSub=e2e-sub-cond');
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(euro('300,00'))).toBeVisible();

  await page.getByRole('tablist', { name: 'Periodo di analisi' }).getByRole('tab', { name: 'Storico' }).click();

  // Same entity, re-scoped: 300 (CY) + 250 (PY) over the whole tracked history.
  await expect(dossierHero(page, 'Storico Completo').getByText(euro('550,00'))).toBeVisible();
  await expect(page).toHaveURL(/focusSub=e2e-sub-cond/);
});

test('reaches a zero-spend entity through the search — one interaction, honest empty dossier', async ({
  page,
}) => {
  await gotoAnalisi(page);

  await page.getByRole('button', { name: /Vai a categoria/ }).click();
  await page.getByPlaceholder(/Cerca categoria o sottocategoria/).fill('skipass');
  await page.getByRole('option', { name: /Skipass/ }).click();

  // Never spent a euro on it, still a legitimate focus — and the dossier says so
  // instead of rendering empty chrome.
  await expect(
    page.getByText(`Nessuna transazione registrata per questa voce dal ${PREVIOUS_YEAR}.`)
  ).toBeVisible();
});

test('excludes transfer categories from the entity search', async ({ page }) => {
  await gotoAnalisi(page);

  await page.getByRole('button', { name: /Vai a categoria/ }).click();
  const input = page.getByPlaceholder(/Cerca categoria o sottocategoria/);

  // The taxonomy HAS a "Giroconto" transfer category; net-zero movements have no
  // dossier semantics, so the search must not offer it.
  await input.fill('giroconto');
  await expect(page.getByText('Nessuna voce trovata')).toBeVisible();

  // Control: the same input finds a real spending entity, so the empty state above
  // proves exclusion, not a broken search.
  await input.fill('condominio');
  await expect(page.getByRole('option', { name: /Condominio/ })).toBeVisible();
});

test('ranks the YoY drivers in the promoted Confronto, ceased categories included, rows focusing the dossier', async ({
  page,
}) => {
  await gotoAnalisi(page);

  await page.getByRole('tablist', { name: 'Vista confronto' }).getByRole('tab', { name: 'Per Categoria' }).click();

  // Sorted by |Δ|: Alimentari −100, Palestra −60 (spent only last year → a driver,
  // not an omission), Casa +40. Aria-labels are the spoken form of each delta row.
  const alimentari = page.getByRole('button', {
    name: `Alimentari, meno 100 euro rispetto al ${PREVIOUS_YEAR}`,
  });
  const palestra = page.getByRole('button', {
    name: `Palestra, cessata, meno 60 euro rispetto al ${PREVIOUS_YEAR}`,
  });
  const casa = page.getByRole('button', { name: `Casa, più 40 euro rispetto al ${PREVIOUS_YEAR}` });
  await expect(alimentari).toBeVisible();
  await expect(palestra).toBeVisible();
  await expect(casa).toBeVisible();
  await expect(palestra.getByText('Cessata')).toBeVisible();

  const [alimentariBox, palestraBox, casaBox] = await Promise.all([
    alimentari.boundingBox(),
    palestra.boundingBox(),
    casa.boundingBox(),
  ]);
  expect(alimentariBox!.y).toBeLessThan(palestraBox!.y);
  expect(palestraBox!.y).toBeLessThan(casaBox!.y);

  // A delta row is an entity entry point like every other: it lands on the dossier.
  await alimentari.click();
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(euro('400,00'))).toBeVisible();
  await expect(page).toHaveURL(/focusCat=e2e-cat-alimentari/);
});

test('lets the sibling composition stay usable while an entity is focused', async ({ page }) => {
  await gotoAnalisi(page, '?focusType=fixed&focusCat=e2e-cat-casa');
  await expect(dossierHero(page, String(CURRENT_YEAR)).getByText(euro('380,00'))).toBeVisible();

  // The income card is not part of this drill — it must show its own level-1 list,
  // never a title-only empty shell.
  await expect(page.getByRole('listitem', { name: /^Stipendio, /, exact: false })).toBeVisible();
});
