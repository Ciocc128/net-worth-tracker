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
 * sotto-occhiello tolto; la discesa tolta dal `PlanView`). Il 2026-10-16: `useCompactLayout` forzato a
 * vero (le righe chiuse e la striscia a 1440) per il test della pagina di oggi.
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

/** La scheda «Accumulo» (A1, doc/pac-ottimizzatore § RV1): il piano e il suo mese (RU8: il modello e i criteri sono in Strategia). */
async function openAccumulo(page: Page) {
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sul piano di accumulo' })).toBeVisible({ timeout: 60_000 });
}

/** La scheda «Strategia» (RU8, doc/allocazione-strategia/README.md): Target per classe, Portafoglio modello, Criteri del modello. */
async function openStrategia(page: Page, hash = '') {
  await page.goto(`/dashboard/allocation?tab=strategia${hash}`, { waitUntil: 'load' });
  await expect(page.locator('section[aria-label="Target per classe"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('section[aria-label="Portafoglio modello"]')).toBeVisible({ timeout: 30_000 });
}

/** Ogni nodo interattivo raggiungibile con Tab, in ordine, fino a un tetto. */
async function tabWalk(page: Page, limit = 80): Promise<string[]> {
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

  // I quattro pulsanti della banda e i tre modi del Piano sono due gruppi `AsideToggle`: dentro
  // ciascuno si entra una volta sola e ci si muove con le frecce. Le quattro celle della catena sono
  // quattro link, uno stop ciascuno.
  const bandStops = walk.filter((stop) => /±2%|±5%|5\/25|Personalizza/.test(stop));
  const planStops = walk.filter((stop) => /Ribilancia|Versa|Preleva/.test(stop));
  const chainStops = walk.filter((stop) => /^A:Passo \d/.test(stop));
  expect(bandStops, 'la banda deve essere uno stop solo').toHaveLength(1);
  expect(planStops, 'i modi del Piano devono essere uno stop solo').toHaveLength(1);
  expect(chainStops, 'le quattro celle della catena').toHaveLength(4);

  // …e il giro deve comunque ARRIVARE in fondo alla pagina: una lista che sparisce dall'ordine di
  // focus supererebbe le asserzioni di sopra senza essere raggiungibile. L'Esposizione è una riga
  // chiusa anche a 1440 (D-ST7): il suo bottone è nel giro, le sue viste no finché non si apre.
  expect(walk.some((stop) => /Dettaglio/i.test(stop)), '«Dettaglio» deve restare raggiungibile').toBe(true);
  expect(walk.filter((stop) => /Titoli|Settori|Emittenti/.test(stop)), 'le viste di una riga chiusa').toHaveLength(0);

  // Aperta, le tre viste dell'Esposizione sono UNO stop dopo il suo bottone.
  await page.locator('#alloc-esposizione-trigger').click();
  await expect(page.getByRole('group', { name: "Vista dell'esposizione" })).toBeVisible({ timeout: 30_000 });
  const opened = await tabWalk(page, 12);
  expect(opened.filter((stop) => /Titoli|Settori|Emittenti/.test(stop)), "le viste dell'Esposizione devono essere uno stop solo").toHaveLength(1);
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

  const piano = page.locator('section[aria-label="Ordini"]');
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

test('a 1440 la pagina è quella di oggi: Esposizione e Previdenza chiuse, nessuna striscia del verdetto, il verdetto in due frasi', async ({ page }) => {
  await openAllocazione(page);
  // Solo Esposizione (e Previdenza, se c'è un fondo) sono righe chiuse anche a 1440 (D-ST7): Bilanciamento,
  // Per classe e Ordini restano tessere aperte; nessuna riga si ricorda a desktop.
  const triggers = await page.locator('main [id$="-trigger"]').evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(triggers.filter((id) => id !== 'alloc-esposizione-trigger' && id !== 'alloc-previdenza-trigger')).toEqual([]);
  await expect(page.locator('#alloc-esposizione-trigger')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('list', { name: 'Le cifre del verdetto' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeHidden();
  // Dal 2026-10-15 la deriva è una frase e i prossimi soldi la seguono con un punto, anche a 1440
  // (il taglio del telefono vuole un punto fermo, 2026-09-27): «…meno. Con 1000 € in più compreresti…».
  const verdict = page.getByRole('region', { name: "Verdetto sull'allocazione" });
  await expect(verdict).toContainText(/\. Con 1000[\s ]*€ in più compreresti/);
  await expect(verdict).not.toContainText(/; con 1000/);
  // Il valore del KPI «Fuori posizione» è intero a 1440: nulla è sollevato.
  const bilanciamento = page.getByRole('region', { name: "Bilanciamento dell'allocazione" });
  await expect(bilanciamento.getByText('Fuori posizione', { exact: true }).locator('xpath=following-sibling::p[1]')).toBeVisible();
});

test('a 1440 Accumulo è il piano e basta: nessuna riga chiusa, il verdetto intero, niente modello né criteri', async ({ page }) => {
  await openAccumulo(page);
  // Il fixture base non ha un piano: lo stato vuoto ha il suo verdetto, senza taglio («Il perché») né celle.
  await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Le cifre del verdetto' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Il perché/ })).toHaveCount(0);
  // Il modello e i criteri sono passati a Strategia (D-ST8).
  await expect(page.locator('section[aria-label="Portafoglio modello"]')).toHaveCount(0);
  await expect(page.locator('section[aria-label="Criteri del modello"]')).toHaveCount(0);
  // «Apri il portafoglio modello» porta al blocco 2 di Strategia.
  await page.getByRole('link', { name: 'Apri il portafoglio modello' }).click();
  await expect(page).toHaveURL(/tab=strategia#portafoglio-modello$/);
  await expect(page.locator('section[aria-label="Portafoglio modello"]')).toBeInViewport({ timeout: 30_000 });
});

test.describe('Strategia e la catena dei pesi (RU8)', () => {
  test('la catena è sotto le schede su tutte e tre, tinge le celle della scheda, porta dove si cambia', async ({ page }) => {
    await openAllocazione(page);
    const chain = page.getByRole('navigation', { name: 'La catena dei pesi' });
    await expect(chain.getByRole('link')).toHaveCount(4);
    // Su Bilanciamento nessun link porta alla scheda aperta.
    await expect(chain.locator('a[aria-current="page"]')).toHaveCount(0);
    await expect(chain.getByRole('link', { name: /^Passo 1, target per classe: .*Apri Strategia$/ })).toBeVisible();

    await chain.getByRole('link', { name: /^Passo 1/ }).click();
    await expect(page).toHaveURL(/tab=strategia#target$/);
    await expect(page.locator('section[aria-label="Target per classe"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('navigation', { name: 'La catena dei pesi' }).locator('a[aria-current="page"]')).toHaveCount(2);

    await page.getByRole('navigation', { name: 'La catena dei pesi' }).getByRole('link', { name: /^Passo 3/ }).click();
    await expect(page.getByRole('region', { name: 'Verdetto sul piano di accumulo' })).toBeVisible({ timeout: 30_000 });
  });

  test('Bilanciamento non ha più «Modifica target»: la matita di Per classe porta a Strategia', async ({ page }) => {
    await openAllocazione(page);
    await expect(page.getByRole('link', { name: 'Modifica target', exact: true })).toHaveCount(0);
    await page.locator('section[aria-label="Allocazione per classe"]').getByRole('link', { name: 'Modifica i target per classe' }).click();
    await expect(page).toHaveURL(/tab=strategia#target$/);
    await expect(page.locator('section[aria-label="Target per classe"]')).toBeVisible({ timeout: 30_000 });
  });

  test('cambiare un target accende il pallino e la barra; «Annulla» rilegge e non scrive', async ({ page }) => {
    await openStrategia(page);
    const tile = page.locator('section[aria-label="Target per classe"]');
    await expect(page.getByRole('region', { name: 'Target non salvati' })).toHaveCount(0);
    const crypto = tile.getByRole('spinbutton', { name: 'Target Criptovalute' });
    const before = await crypto.inputValue();
    await crypto.fill(String(Number(before) + 5));
    const bar = page.getByRole('region', { name: 'Target non salvati' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Salva i target' })).toBeVisible();
    // Passare a Bilanciamento e tornare non perde la bozza: la bozza è della pagina.
    await page.getByRole('tab', { name: /Bilanciamento/ }).click();
    await page.getByRole('tab', { name: /Strategia/ }).click();
    await expect(page.locator('section[aria-label="Target per classe"]').getByRole('spinbutton', { name: 'Target Criptovalute' })).toHaveValue(String(Number(before) + 5));
    await page.getByRole('region', { name: 'Target non salvati' }).getByRole('button', { name: 'Annulla' }).click();
    await expect(page.locator('section[aria-label="Target per classe"]').getByRole('spinbutton', { name: 'Target Criptovalute' })).toHaveValue(before);
    await expect(page.getByRole('region', { name: 'Target non salvati' })).toHaveCount(0);
  });

  test('«Salva i target» con un totale sotto 100 non scrive e dice dove', async ({ page }) => {
    await openStrategia(page);
    const tile = page.locator('section[aria-label="Target per classe"]');
    // La fonte «A mano»: Azioni e Obbligazioni scrivibili.
    await tile.getByRole('radio', { name: 'A mano' }).click();
    await tile.getByRole('spinbutton', { name: 'Target Azioni' }).fill('0');
    await tile.getByRole('spinbutton', { name: 'Target Obbligazioni' }).fill('0');
    await expect(tile).toContainText('Le classi sommano');
    await page.getByRole('region', { name: 'Target non salvati' }).getByRole('button', { name: 'Salva i target' }).click();
    await expect(page.getByRole('region', { name: 'Target non salvati' })).toContainText('mancano');
    await page.getByRole('region', { name: 'Target non salvati' }).getByRole('button', { name: 'Annulla' }).click();
  });

  test('«Salva i target» con un gruppo che non somma 100 non scrive e porta il fuoco sul campo', async ({ page }) => {
    // Moved from e2e/settings.spec.ts with the targets (RU8): the same guard, now on Strategia's bar.
    await openStrategia(page);
    const tile = page.locator('section[aria-label="Target per classe"]');

    // Switch Azioni's subcategories on (80 + 20, valid), break the sum inside the group, then CLOSE it.
    await tile.getByRole('button', { name: /^Apri sottocategorie di Azioni/ }).click();
    await page.locator('#toggle-equity').click();
    const firstSubPct = page.locator('input[id^="target-equity-sub-"][id$="-pct"]').first();
    await firstSubPct.fill(String(Number(await firstSubPct.inputValue()) - 10));
    await tile.getByRole('button', { name: /^Chiudi sottocategorie di Azioni/ }).click();

    // Closed, the class row still says it: the sum is ON the row and in its name.
    await expect(tile.getByRole('button', { name: /^Apri sottocategorie di Azioni \(sommano 90/ })).toBeVisible();
    await expect(tile).toContainText(/Le sottocategorie di Azioni sommano 90\s?% invece del 100\s?%/);

    const bar = page.getByRole('region', { name: 'Target non salvati' });
    await bar.getByRole('button', { name: 'Salva i target' }).click();
    await expect(tile.getByRole('button', { name: /^Chiudi sottocategorie di Azioni/ })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
      .toMatch(/^target-equity-sub-\d+-pct$/);

    await bar.getByRole('button', { name: 'Annulla' }).click();
    await expect(bar).toHaveCount(0);
  });

  test('il vecchio indirizzo di Impostazioni porta a Strategia', async ({ page }) => {
    await page.goto('/dashboard/settings?tab=allocazione', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/dashboard\/allocation\?tab=strategia#target$/, { timeout: 60_000 });
    await expect(page.locator('section[aria-label="Target per classe"]')).toBeVisible({ timeout: 60_000 });
  });
});

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
    await openStrategia(page);
    const tile = page.locator('section[aria-label="Portafoglio modello"]');
    await tile.getByRole('button', { name: 'Ricalcola' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ricalcola il portafoglio modello' });
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
