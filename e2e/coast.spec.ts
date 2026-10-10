/**
 * Coast FIRE — desktop regressions that only a real browser can catch.
 *
 * Runs on the BASE account with the Coast fixture (`scripts/seedCoastFireE2E.mts`): age 35,
 * target 60, custom expenses, two state pensions after the target and the pension fund unlocking
 * at 57 — inside the chart's horizon, so the unlock step is on screen.
 *
 * The fixture fixes the expenses but NOT the clock: each pension's deflation is computed from an
 * absolute start date, so the figures move between runs. These tests therefore assert STRUCTURE
 * and FORMAT (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)); the arithmetic lives in `__tests__/fireService.test.ts`
 * and the words in `__tests__/coastFireView.test.ts`.
 *
 * Since 2026-08-25 the tab is a verdict over tiles: the tiles are located by `role=region` +
 * `aria-label`, the verdict by «Verdetto sul Coast FIRE», the two disclosures by their VISIBLE
 * text (`/^Ipotesi/`, `/^Dettaglio/`).
 */

import { test, expect, type Page } from '@playwright/test';

/** A compact euro amount as the tiles print it: dot-grouped or plain up to four digits, no cents. */
const EURO_COMPACT = /^(\d{1,3}(\.\d{3})+|\d{1,4})[\s ]*€$/;

async function gotoCoast(page: Page): Promise<void> {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await page.getByRole('tab', { name: 'Coast FIRE' }).click();
  // The verdict is the first thing the tab paints once the three queries settle.
  await expect(page.getByRole('region', { name: 'Verdetto sul Coast FIRE' })).toBeVisible({ timeout: 30_000 });
}

/** Opens «Il mio piano» (the plan block above the tabs, closed by default once the plan is written; H1). */
async function openPlan(page: Page) {
  const trigger = page.getByRole('button', { name: /^Il mio piano/ });
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute('data-state')) === 'closed') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('data-state', 'open');
  return trigger;
}

test('the verdict answers the question and the Traguardo carries a formatted shortfall', async ({ page }) => {
  await gotoCoast(page);

  const verdict = page.getByRole('region', { name: 'Verdetto sul Coast FIRE' });
  // One explicit verdict, in words, in either of its two live phrasings.
  await expect(verdict.getByRole('heading', { level: 2 })).toHaveText(/^(Non ancora: continua a versare\.|Sì, puoi smettere di versare\.)$/);
  // The sentence names the Coast number of today and the walk to the target age.
  await expect(verdict).toContainText('al numero Coast FIRE di oggi');
  await expect(verdict).toContainText(/arriveresti a 60 anni|si esaurisce nel \d{4}/);
  // The bridge model is on in the fixture: the lock sentence closes the verdict.
  await expect(verdict).toContainText('restano bloccati fino al');
  // «Non ancora» has a «quando» (2026-09-23): the base seed records income, so the Calcolatore's
  // savings are positive and the pace clause names its basis and a year (or the target age).
  await expect(verdict).toContainText(/Al ritmo attuale, (\d{1,3}(\.\d{3})+|\d{1,4})[\s ]*€ l'anno di risparmio, (lo raggiungi nel \d{4}, a \d{2} anni|non lo raggiungi prima dei 60 anni)\./);
  // The state pensions are the Afflussi tile's, not the verdict's.
  await expect(verdict).not.toContainText('coprono insieme');

  const traguardo = page.getByRole('region', { name: 'Traguardo Coast FIRE' });
  await expect(traguardo).toBeVisible();
  // The hero is the amount right under its sub-eyebrow — the shortfall, or the surplus.
  const hero = traguardo.locator('p:has-text("numero Coast FIRE") + span').first();
  await expect(hero).toHaveText(EURO_COMPACT);
  const progressbar = traguardo.getByRole('progressbar', { name: 'Progresso verso il numero Coast FIRE' });
  await expect(progressbar).toBeVisible();
  // The bar caps at 100; the text says the true share, in the it-IT comma.
  await expect(progressbar).toHaveAttribute('aria-valuetext', /^\d{1,3},\d% del numero Coast FIRE$/);
  const chart = traguardo.locator('[role="img"][aria-label*="proiezione Coast FIRE"]');
  await expect(chart).toBeVisible({ timeout: 15_000 });
  // The accessible name names no hue: on a themed palette the bear is not red (2026-09-23).
  await expect(chart).not.toHaveAttribute('aria-label', /rosso|verde/);
  // The legend is the app's (`SeriesLegend`, neutral ink), with the dotted pace series in it.
  await expect(traguardo.getByText('Capitale richiesto al target', { exact: true })).toBeVisible();
  await expect(traguardo.getByText('Base con il risparmio attuale', { exact: true })).toBeVisible();
  await expect(traguardo.locator('.recharts-legend-wrapper')).toHaveCount(0);
});

test('the Afflussi tile lists both state pensions and the fund unlock, in calendar order', async ({ page }) => {
  await gotoCoast(page);

  const tile = page.getByRole('region', { name: 'Afflussi già considerati' });
  await expect(tile).toBeVisible();
  const items = tile.getByRole('listitem');

  // The fixture's three rows, found by NAME: a goal «Alla scadenza lo spendo» or a dated flow on the account adds
  // its own row (the emulator is shared with the tours — collaudo 2026-10-09), so neither the count nor the first
  // position is the fixture's.
  const yearOf = async (title: string) => {
    const row = items.filter({ has: page.getByText(title, { exact: true }) });
    await expect(row).toHaveCount(1);
    return Number((await row.locator('span.font-mono').first().textContent())?.trim());
  };
  const fund = await yearOf('Sblocco fondo pensione');
  const foreign = await yearOf('Pensione estera');
  const inps = await yearOf('Pensione INPS');
  // The fixture's fund unlock (2048) precedes both pensions (2052, 2058).
  expect(fund).toBeGreaterThan(2020);
  expect(fund).toBeLessThan(foreign);
  expect(foreign).toBeLessThan(inps);

  // Every row, whatever its source: years read left to right in ascending order, and each row carries its own
  // amount (a dated flow's is signed) and says in words which way the money goes (D-CO3).
  const years = await items.evaluateAll((nodes) => nodes.map((node) => Number(node.querySelector('span.font-mono')?.textContent?.trim())));
  expect(years.every((year) => Number.isFinite(year) && year > 2020)).toBe(true);
  expect([...years].sort((a, b) => a - b)).toEqual(years);

  const amounts = await items.evaluateAll((nodes) => nodes.map((node) => node.querySelector('p.font-mono')?.textContent?.trim() ?? ''));
  amounts.forEach((amount) => {
    // The amount is followed by its caption inside the same <p>, so match a prefix.
    expect(amount).toMatch(/^[+−]?(\d{1,3}(\.\d{3})+|\d{1,4})[\s ]*€\s+in (entrata|uscita) · /);
  });
});

test('the Traguardo reads the same walk at three dates, each with what is needed, what there will be and the gap (CO1)', async ({ page }) => {
  await gotoCoast(page);

  const traguardo = page.getByRole('region', { name: 'Traguardo Coast FIRE' });
  const stages = traguardo.getByRole('list', { name: 'Tappe del Coast FIRE' }).getByRole('listitem');
  // The fixture has a target age ahead and two pensions after it: today, at the target age, at steady state.
  await expect(stages).toHaveCount(3);
  await expect(stages.nth(0)).toContainText('Oggi');
  await expect(stages.nth(1)).toContainText('A 60 anni');
  await expect(stages.nth(2)).toContainText('A regime · dal');
  for (const index of [0, 1, 2]) {
    await expect(stages.nth(index)).toContainText('servono');
    await expect(stages.nth(index)).toContainText(/ne (hai|avrai)|esaurito/);
    await expect(stages.nth(index)).toContainText(/basta|mancano/);
  }
  // The method line says «a regime» is not the Calcolatore's number.
  await expect(traguardo).toContainText('Non è il numero FIRE del Calcolatore');
  // The verdict quotes the capital at the target age, one figure with the second stage.
  await expect(page.getByRole('region', { name: 'Verdetto sul Coast FIRE' })).toContainText(/arriveresti a 60 anni|si esaurisce nel \d{4}/);
});

test('the Scenari tile ranks the three Coast numbers, base in the middle', async ({ page }) => {
  await gotoCoast(page);

  const tile = page.getByRole('region', { name: 'Scenari Coast FIRE' });
  const rows = tile.getByRole('list', { name: 'Numero Coast FIRE per scenario' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Scenario Bear');
  await expect(rows.nth(1)).toContainText('Scenario Base');
  await expect(rows.nth(2)).toContainText('Scenario Bull');
  // A higher real return needs less initial capital: Bear > Base > Bull.
  const numbers = await rows.evaluateAll((nodes) =>
    nodes.map((node) => Number((node.querySelector('span.text-right > span')?.textContent ?? '').replace(/[^\d]/g, ''))),
  );
  expect(numbers[0]).toBeGreaterThan(numbers[1]);
  expect(numbers[1]).toBeGreaterThan(numbers[2]);
});

test('Coast FIRE reads «Il mio piano» and has no Ipotesi disclosure of its own', async ({ page }) => {
  await gotoCoast(page);

  // § 15 RP6 (T13): the Ipotesi disclosure moved into the plan block above the tabs.
  await expect(page.getByRole('button', { name: /^Ipotesi/ })).toHaveCount(0);

  const trigger = page.getByRole('button', { name: /^Il mio piano/ });
  await expect(trigger).toBeVisible();
  const contentId = await trigger.getAttribute('aria-controls');
  expect(contentId).toBeTruthy();
  const content = page.locator(`[id="${contentId}"]`);

  const measuredHeight = async (): Promise<number> => {
    if ((await content.count()) === 0) return 0;
    return content.evaluate((el) => el.getBoundingClientRect().height);
  };

  // Normalize to open: the seeded fixture has an age saved, so it starts collapsed.
  await openPlan(page);
  await expect.poll(measuredHeight).toBeGreaterThan(100);
  await expect(page.getByLabel('Età attuale')).toHaveValue('35');
  await expect(page.getByLabel('Età obiettivo')).toHaveValue('60');
  await expect(page.getByRole('region', { name: 'Il mio piano: pensioni' }).getByLabel('Decorrenza')).toHaveCount(2);
  // The pension model moved into the Dettaglio of the tab.
  await page.getByRole('button', { name: /^Dettaglio/ }).first().click();
  await expect(page.getByRole('region', { name: 'Modello della pensione' })).toBeVisible();

  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'closed');
  await expect.poll(measuredHeight).toBeLessThan(1);
});

test('a preview typed in «Il mio piano» survives a tab switch and «Annulla» takes it back (RP3, T7)', async ({ page }) => {
  await gotoCoast(page);
  await openPlan(page);
  const spesa = page.getByLabel(/Spesa del piano/);
  const saved = await spesa.inputValue();
  await spesa.fill('31234');
  await expect(page.getByRole('button', { name: /^Il mio piano/ })).toContainText('Anteprima non salvata');

  // The draft belongs to the page: it is still there after a trip to the Calcolatore and back.
  await page.getByRole('tab', { name: /Calcolatore FIRE/ }).click();
  await expect(page.getByRole('region', { name: 'Reddito passivo sostenibile' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Coast FIRE' }).click();
  await expect(page.getByLabel(/Spesa del piano/)).toHaveValue('31234');
  await expect(page.getByRole('button', { name: /^Il mio piano/ })).toContainText('Anteprima non salvata');

  await page.getByRole('button', { name: 'Annulla' }).click();
  await expect(page.getByLabel(/Spesa del piano/)).toHaveValue(saved);
  await expect(page.getByRole('button', { name: /^Il mio piano/ })).not.toContainText('Anteprima non salvata');
});

test('the projection tooltip names the pension-fund step at the unlock year', async ({ page }) => {
  await gotoCoast(page);

  const chart = page.locator('[role="img"][aria-label*="proiezione Coast FIRE"]');
  await expect(chart).toBeVisible({ timeout: 15_000 });

  // boundingBox is viewport-relative: without the scroll every mouse.move lands outside the
  // window, which reads exactly like "the tooltip never opened".
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();

  // The unlock row by name, not the first row: a goal or a dated flow on the account can come before it.
  const unlockYear = Number(
    await page
      .getByRole('region', { name: 'Afflussi già considerati' })
      .getByRole('listitem')
      .filter({ has: page.getByText('Sblocco fondo pensione', { exact: true }) })
      .locator('span.font-mono')
      .first()
      .textContent(),
  );

  // Sweep the plot area until the hovered year is the unlock year, then read the note.
  const tooltip = page.locator('.recharts-tooltip-wrapper').first();
  let noteFound = false;
  for (let step = 0; step <= 40 && !noteFound; step += 1) {
    await page.mouse.move(box!.x + (box!.width * step) / 40, box!.y + box!.height / 2);
    const text = (await tooltip.textContent()) ?? '';
    if (text.includes(`Anno ${unlockYear}`)) {
      expect(text).toContain('Sblocco del fondo pensione');
      // Whole euros on a thirty-year projection: no cents anywhere in the tooltip (2026-09-23).
      expect(text).not.toMatch(/,\d\d[\s ]*€/);
      noteFound = true;
    }
  }
  expect(noteFound).toBe(true);
});
