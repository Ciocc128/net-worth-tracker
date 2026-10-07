/**
 * Allocazione — quello che solo un layout vero può dire, a 1440px.
 *
 * PERCHÉ ESISTE: fino al 2026-09-21 questa pagina era l'unica con un verdetto su tessere senza
 * NESSUNA spec (doc/guide/allocazione.md → Per-page blind spots), e la critique di quel giorno ha
 * misurato sul mirror tre difetti che né Vitest né `tsc` possono vedere:
 *  1. «Dettaglio» stava a 41 Tab dall'inizio pagina, perché i tre gruppi di `AsideToggle` e le due
 *     liste erano 27 stop dentro `main`;
 *  2. l'`aria-label` della riga di Per classe SOSTITUIVA il contenuto, quindi un lettore di schermo
 *     sentiva otto nomi di classe e nessuna cifra — e la tessera È la tabella dati della pagina;
 *  3. le sotto-righe stampavano una percentuale della CLASSE nella stessa colonna in cui la riga di
 *     classe stampa una percentuale del portafoglio, sotto un'unica intestazione.
 *
 * …e un quarto, che il modo aperto di default non nominava mai uno strumento: «vendi N € di azioni»
 * non è un ordine che qualcuno possa portare a un broker.
 *
 * REGRESSION GUARD, tutti visti rossi rompendo una cosa alla volta (roving focus tolto da
 * `AsideToggle` e da `RankedRows`; `tabIndex` esplicito tolto; `aria-label` rimesso sulla riga; il
 * sotto-occhiello tolto; la discesa tolta dal `PlanView`).
 *
 * Account base (`test@example.com`): target 60/30/10 su azioni, obbligazioni e criptovalute, due
 * sotto-target su equity (World 80 / Single Stock 20, aggiunti al seed il 2026-09-21 perché senza
 * di essi nessuna classe si apre e i piani non hanno un livello sotto la classe), più un conto e
 * una casa che nessun target nomina. Gli importi dipendono dai prezzi del seed e dal mese in cui
 * gira la suite, quindi si asserisce la STRUTTURA e l'aritmetica di ciò che è stampato, mai una cifra.
 *
 * NON copre la ritenuta sulle vendite: la sua stima richiede basi di costo in euro e un'aliquota
 * per strumento, che il fixture base non porta. Quella è coperta da Vitest (`allocazioneSummary` →
 * «estimatePlanSaleTax») e, il 2026-09-21, dall'evidenza sul mirror.
 */

import { test, expect, type Page } from '@playwright/test';

async function openAllocazione(page: Page) {
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('section[aria-label="Allocazione per classe"]')).toBeVisible({ timeout: 30_000 });
}

/** La scheda «Accumulo» (A1, doc/pac-ottimizzatore § RV1): Accumulo, Portafoglio modello e Obiettivi vivono qui. */
async function openAccumulo(page: Page) {
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sul piano di accumulo' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('section[aria-label="Portafoglio modello"]')).toBeVisible({ timeout: 30_000 });
}

/** Ogni nodo interattivo raggiungibile con Tab, in ordine, fino a un tetto. */
async function tabWalk(page: Page, limit = 60): Promise<string[]> {
  const walk: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return `${el.tagName}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}`;
    });
    if (stop === null) break;
    walk.push(stop);
  }
  return walk;
}

test('una lista di controlli dello stesso tipo è UNO stop di Tab, non N', async ({ page }) => {
  await openAllocazione(page);

  // Nessun click prima del giro: un click su `body` sposta l'inizio della sequenza oltre il salta-contenuto.
  const walk = await tabWalk(page);

  // I quattro pulsanti della banda, i tre modi del Piano e le tre viste dell'Esposizione sono tre
  // gruppi `AsideToggle`: dentro ciascuno si entra una volta sola e ci si muove con le frecce.
  const bandStops = walk.filter((stop) => /±2%|±5%|5\/25|Personalizza/.test(stop));
  const planStops = walk.filter((stop) => /Ribilancia|Versa|Preleva/.test(stop));
  const viewStops = walk.filter((stop) => /Titoli|Settori|Emittenti/.test(stop));
  expect(bandStops, 'la banda deve essere uno stop solo').toHaveLength(1);
  expect(planStops, 'i modi del Piano devono essere uno stop solo').toHaveLength(1);
  expect(viewStops, "le viste dell'Esposizione devono essere uno stop solo").toHaveLength(1);

  // …e il giro deve comunque ARRIVARE in fondo alla pagina: una lista che sparisce dall'ordine di
  // focus supererebbe le asserzioni di sopra senza essere raggiungibile.
  expect(walk.some((stop) => /Dettaglio/i.test(stop)), '«Dettaglio» deve restare raggiungibile').toBe(true);
});

test('le frecce muovono dentro un gruppo, e il Tab successivo lo lascia', async ({ page }) => {
  await openAllocazione(page);

  const band = page.getByRole('group', { name: 'Soglia di ribilanciamento' });
  await band.getByRole('button', { name: '±2%', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(band.getByRole('button', { name: '±5%', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(band.getByRole('button', { name: 'Personalizza', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(band.getByRole('button', { name: '±2%', exact: true })).toBeFocused();

  // Uscire dal gruppo costa un Tab, non quattro.
  await page.keyboard.press('Tab');
  await expect(band.getByRole('button', { name: '±5%', exact: true })).not.toBeFocused();
  await expect(band.getByRole('button', { name: '5/25', exact: true })).not.toBeFocused();
});

test('la riga di Per classe annuncia le sue cifre, non solo il nome della classe', async ({ page }) => {
  await openAllocazione(page);

  const row = page.locator('section[aria-label="Allocazione per classe"] [role="button"]').first();
  await expect(row).toBeVisible();

  // Il nome accessibile di un `role="button"` SOSTITUISCE il contenuto quando è un `aria-label`:
  // qui non deve essercene uno, così quello che il lettore sente è la riga stessa.
  expect(await row.getAttribute('aria-label'), 'un aria-label qui cancella percentuali e gap').toBeNull();
  const name = await row.evaluate((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
  expect(name, 'la riga deve portare una percentuale').toMatch(/\d+,\d%/);
  expect(name, "la riga deve portare l'euro del gap").toMatch(/€/);
  // …e il verso dell'apertura resta annunciato, sul chevron.
  expect(name).toMatch(/Espandi|Comprimi/);
});

test('aprire una classe dichiara che le sotto-righe sono percentuali della CLASSE', async ({ page }) => {
  await openAllocazione(page);

  const tile = page.locator('section[aria-label="Allocazione per classe"]');
  const subHeader = tile.getByText('% della classe · target · gap');
  const expandable = tile.locator('[role="button"][aria-expanded]');
  test.skip((await expandable.count()) === 0, 'il fixture non ha classi con sottocategorie');

  await expandable.first().click();
  await expect(subHeader.first()).toBeVisible();
});

/** «−25.000 €» / «+1810 €» → un numero. L'it-IT non raggruppa a quattro cifre e lo spazio prima di € è unificatore. */
function euro(text: string): number {
  const match = text.replace(/[\s ]/g, '').match(/([+−-]?)([\d.]+),?(\d*)€/);
  if (!match) throw new Error(`non è un importo: ${JSON.stringify(text)}`);
  const value = Number(`${match[2].replace(/\./g, '')}.${match[3] || '0'}`);
  return match[1] === '+' ? value : -value;
}

test('il Ribilancia nomina gli strumenti, e le gambe tornano a sommare la mossa di classe', async ({ page }) => {
  await openAllocazione(page);

  const piano = page.locator('section[aria-label="Piano"]');
  const operations = piano.getByRole('list', { name: 'Operazioni del ribilanciamento' });
  await expect(operations).toBeVisible();

  // Un ordine su una CLASSE non è eseguibile da nessuna parte: fino al 2026-09-21 il modo che si
  // apre da solo era l'unico dei tre a non nominare mai un ticker.
  const equityMove = operations.locator('li').filter({ hasText: 'Azioni' }).first();
  await expect(equityMove).toContainText('VWCE.DE');

  const { classAmount, legs } = await equityMove.evaluate((li) => {
    // L'IMPORTO di una riga porta il colore dell'azione inline; la didascalia sotto («restano
    // N €») è mono come lui ma non colorata, e sommarla darebbe un numero senza senso.
    const amountOf = (el: Element) => (el.textContent ?? '').trim();
    const classAmount = amountOf(li.querySelector('p[style*="color"]')!);
    // Le FOGLIE, non «la profondità 2»: `collapseRepeatedLevels` solleva un figlio unico che
    // ripeteva il suo livello, quindi uno strumento può stare a profondità 1. Una riga è una
    // foglia quando sotto di sé non ha un altro blocco rientrato.
    const rows = Array.from(li.querySelectorAll<HTMLElement>('div.pl-4 > div'));
    const leaves = rows.filter((row) => row.querySelector('div.pl-4') === null);
    return { classAmount, legs: leaves.map((row) => amountOf(row.querySelector('p[style*="color"]')!)) };
  });

  expect(legs.length, 'la mossa deve scendere agli strumenti').toBeGreaterThan(0);
  const sum = legs.map(euro).reduce((total, leg) => total + leg, 0);
  // All'euro: il piano è arrotondato alle unità in ogni riga, quindi la somma può scostarsi di una
  // unità per gamba, mai di più.
  expect(Math.abs(sum - euro(classAmount))).toBeLessThanOrEqual(legs.length);
});

test('la pagina non scorre di lato, misurato sugli elementi e non sul contenitore', async ({ page }) => {
  await openAllocazione(page);

  const overflow = await page.evaluate(() => {
    // `main` è lo scroller orizzontale (la shell clippa a `SidebarInset`), quindi il documento
    // misura sempre 0: AGENTS.md → Tailwind Breakpoints.
    const main = document.querySelector('main')!;
    const right = main.getBoundingClientRect().left + main.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      // Una tabella `sr-only` è clippata a 1px ma le sue celle tengono i rettangoli: 69 falsi
      // colpevoli su Storico prima che fossero escluse.
      if (el.closest('.sr-only')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > right + 1) offenders.push(el.className?.toString().slice(0, 60) || el.tagName);
    }
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });

  expect(overflow.scrollWidth).toBe(overflow.clientWidth);
  expect(overflow.offenders).toEqual([]);
});

/** Every tile of the grid, grouped by its column (x), each column sorted top to bottom. */
async function stacks(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('section[aria-label="Piano"]')!.closest('.grid')!;
    const byX = new Map<number, { name: string; top: number; bottom: number; width: number }[]>();
    for (const section of Array.from(grid.querySelectorAll('section'))) {
      // Only the tiles, not the sections nested inside one.
      if (section.parentElement?.closest('section')) continue;
      const rect = section.getBoundingClientRect();
      if (rect.height === 0) continue;
      const x = Math.round(rect.x);
      const list = byX.get(x) ?? [];
      list.push({ name: section.getAttribute('aria-label') ?? '?', top: rect.top, bottom: rect.bottom, width: rect.width });
      byX.set(x, list);
    }
    return Array.from(byX.values()).map((list) => list.sort((a, b) => a.top - b.top));
  });
}

test('due pile indipendenti: fra due tessere della stessa colonna 12px, in ogni modo del Piano (fork, 2026-09-25)', async ({ page }) => {
  await openAllocazione(page);
  await expect(page.locator('section[aria-label="Esposizione del portafoglio"]')).toBeVisible({ timeout: 30_000 });
  const piano = page.locator('section[aria-label="Piano"]');

  // Il Piano cambia altezza col modo (sul conto del proprietario da 381 a 1159px): con righe a tutta
  // larghezza sotto due colonne, ogni cambio apriva un vuoto sotto la colonna più corta.
  for (const mode of ['Ribilancia', 'Versa'] as const) {
    const toggle = piano.getByRole('button', { name: mode, exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const columns = await stacks(page);
    expect(columns, 'due pile, nessuna tessera a tutta larghezza').toHaveLength(2);
    for (const column of columns) {
      for (let i = 1; i < column.length; i += 1) {
        const gap = column[i].top - column[i - 1].bottom;
        expect(Math.abs(gap - 12), `${column[i - 1].name} → ${column[i].name} in ${mode}`).toBeLessThanOrEqual(1);
      }
    }
    const names = columns.map((column) => column.map((tile) => tile.name));
    // Dal 2026-10-07 Accumulo e il portafoglio modello (ex Composizione ideale) stanno nella scheda «Accumulo» (A1).
    expect(names[0].slice(0, 2)).toEqual(["Bilanciamento dell'allocazione", 'Allocazione per classe']);
    expect(names[1].slice(0, 2)).toEqual(['Piano', 'Esposizione del portafoglio']);
  }
});

/**
 * Su `tablet:` (768–1439px) le pile sono `contents` e le tessere tornano all'ordine `order-*`: Per
 * classe ed Esposizione sono le sole a mezza larghezza, e con altre tessere in mezzo ciascuna restava
 * sola con mezza riga vuota accanto (fork, 2026-09-27, visto sul giro su iPad). Dal 2026-10-07 le due
 * tessere del fork non sono più in questa scheda e le due stanno una dopo l'altra (`order-3`, `order-4`).
 */
for (const width of [1024, 820]) {
  test(`su iPad Per classe ed Esposizione stanno sulla stessa riga (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 1024 ? 768 : 1180 });
    await openAllocazione(page);
    const perClasse = page.locator('section[aria-label="Allocazione per classe"]');
    const esposizione = page.locator('section[aria-label="Esposizione del portafoglio"]');
    await expect(esposizione).toBeVisible({ timeout: 30_000 });

    const left = await perClasse.boundingBox();
    const right = await esposizione.boundingBox();
    expect(left && right).toBeTruthy();
    expect(Math.abs(right!.y - left!.y), 'stessa riga').toBeLessThanOrEqual(1);
    expect(right!.x, 'Esposizione a destra di Per classe').toBeGreaterThan(left!.x + left!.width);
  });
}

/**
 * «Composizione ideale» › «Con vendite mirate» (fork, 2026-09-27, doc/weight-optimizer-targeted-ate.md
 * §11.2). The base account has no ideal allocation, so this block turns one on for the duration —
 * classes only, no geography — and removes the field afterwards. With targets 60/30/10 against a
 * portfolio that is mostly Bitcoin (bought at 38.000, now 55.000), Ideale sells Bitcoin and pays
 * tax: the mode must sell nothing at cap 0, and a «Non vendere» tick must take Bitcoin out of sale.
 * Apple is in dollars with no EUR cost basis: its box is ticked and disabled (§3, `null` = unknown).
 *
 * REGRESSION GUARD, seen red once each: the lock ignored (`applyTargetedLocks` returning every
 * candidate as sellable — Bitcoin stays in sale), and the tax column dropped from the table.
 */
test.describe('Composizione ideale › Con vendite mirate', () => {
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
    // An update mask naming a field the body omits deletes that field.
    await fetch(SETTINGS_URL, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ fields: {} }) });
  });

  test('cap 0 sells nothing taxed; «Non vendere» takes a row out of sale', async ({ page }) => {
    await openAccumulo(page);
    const tile = page.locator('section[aria-label="Portafoglio modello"]');
    await tile.getByRole('button', { name: 'Ricalcola' }).click();
    const dialog = page.getByRole('dialog', { name: 'Composizione ideale' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('radio', { name: 'Con vendite mirate' }).click();
    await expect(dialog.getByLabel('Tasse massime (€)')).toBeVisible();

    // The rows are there BEFORE «Calcola» (§9.3), each with its box; Apple's is forced.
    const row = (name: string) => dialog.locator('tbody tr', { has: page.getByText(name, { exact: true }) });
    await expect(row('Bitcoin')).toBeVisible();
    await expect(row('Apple Inc.').getByRole('checkbox')).toBeDisabled();
    await expect(row('Apple Inc.').getByRole('checkbox')).toBeChecked();
    await expect(row('Bitcoin').getByRole('checkbox')).not.toBeChecked();

    await dialog.getByRole('button', { name: 'Calcola' }).click();
    const taxCell = (name: string) => row(name).locator('td').last();

    // Cap empty = 0: no taxed sale — every tax cell is «—» or «0,00 €», and the total says so.
    await expect(dialog.getByText(/^(Nessuna vendita|Vendi .*paghi circa 0\s€)/)).toBeVisible({ timeout: 60_000 });
    for (const cell of await dialog.locator('tbody tr td:last-child').allTextContents()) {
      expect(cell.replace(/\s/g, ' ')).toMatch(/^(—|0,00 €)$/);
    }

    // A cap no sale reaches: Bitcoin is sold, with its tax on the row.
    await dialog.getByLabel('Tasse massime (€)').fill('100000');
    await expect(dialog.getByText(/il tetto di 100\.000\s€ non serve/)).toBeVisible();
    await expect(taxCell('Bitcoin')).not.toHaveText('—');
    await expect(taxCell('Bitcoin')).not.toHaveText(/^0,00/);

    // «Non vendere» on Bitcoin: the row is no longer in sale.
    await row('Bitcoin').getByRole('checkbox').click();
    await expect(row('Bitcoin').getByRole('checkbox')).toBeChecked();
    await expect(taxCell('Bitcoin')).toHaveText('—');
  });
});
