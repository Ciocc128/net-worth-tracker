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

test('never claims the user owns no pension fund, at any point in the load', async ({ page }) => {
  // Polling after the fact would race the render. A MutationObserver installed before the first
  // script runs records the empty state even if it flashes for one frame.
  await page.addInitScript(() => {
    const marker = 'Nessun fondo pensione ancora tracciato';
    Object.assign(window, { __emptyStateSeen: false });
    const check = () => {
      if (document.body?.innerText?.includes(marker)) {
        Object.assign(window, { __emptyStateSeen: true });
      }
    };
    new MutationObserver(check).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });

  await gotoPension(page);

  const flashed = await page.evaluate(() => (window as unknown as { __emptyStateSeen: boolean }).__emptyStateSeen);
  expect(flashed).toBe(false);
});

test('lays the hero and the return card side by side at 1440px', async ({ page }) => {
  await gotoPension(page);

  const hero = page.getByRole('heading', { name: 'Valore attuale' }).locator('..');
  const returnCard = page.getByRole('heading', { name: 'Rendimento del fondo' }).locator('..');

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
