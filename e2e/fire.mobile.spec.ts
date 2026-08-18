/**
 * Calcolatore FIRE — layout a 390px.
 *
 * PERCHÉ ESISTE: l'hero `[2fr_1fr]` di questo tab è uscito dal viewport per due volte. La prima
 * fu misurata il 2026-08-18 mentre si ridisegnava il tab Coast e archiviata come debito noto; la
 * seconda la segnalò l'owner, come scorrimento orizzontale della pagina su mobile. Nessun test
 * poteva vederla: Vitest non ha un motore di layout, e `fire.spec.ts` gira a 1440px, dove la
 * griglia usa il suo template esplicito e il difetto non esiste.
 *
 * PERCHÉ SI MISURA `main` E NON IL DOCUMENTO: la shell della dashboard monta la pagina dentro
 * `<main class="flex-1 overflow-y-auto">`, e un `overflow-y` diverso da `visible` fa computare
 * `overflow-x: visible` a `auto`. Il contenitore di scroll orizzontale è quindi `main`, non il
 * documento — `document.scrollWidth - clientWidth` resta 0 anche mentre la pagina scorre di lato,
 * che è esattamente il motivo per cui il difetto è sopravvissuto alla prima misurazione.
 *
 * L'asserzione nomina gli elementi colpevoli invece di limitarsi al totale: un overflow è sempre
 * causato da un elemento preciso, e un fallimento che dice solo "81px" costringe a rifare da capo
 * la misura (AGENTS → *Tailwind Breakpoints*: misura gli elementi, non il documento).
 */

import { test, expect } from '@playwright/test';

/** I collapsible del tab: contenuto che l'owner aprirà, quindi contenuto da misurare. */
const DISCLOSURES = [
  'Impostazioni FIRE',
  'Mostra dettaglio storico',
  'Parametri e tabella',
  'Come funziona il FIRE?',
] as const;

test('il tab Calcolatore FIRE non scorre in orizzontale a 390px', async ({ page }) => {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await expect(page.getByText('Reddito passivo sostenibile', { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  for (const label of DISCLOSURES) {
    const trigger = page.getByText(label, { exact: true }).filter({ visible: true });
    if ((await trigger.count()) > 0) {
      await trigger.first().click();
      await page.waitForTimeout(500);
    }
  }

  // I grafici e i count-up si assestano tardi: una misura presa prima leggerebbe larghezze
  // intermedie.
  await page.waitForTimeout(2000);

  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.clientWidth;

    // Un solo px di tolleranza: i bordi sub-pixel di Chromium arrotondano verso l'alto.
    const offenders = Array.from(main.querySelectorAll('*'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 || rect.height > 0) && rect.right > limit + 1;
      })
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`)
      .slice(0, 5);

    return { scrollWidth: main.scrollWidth, clientWidth: limit, offenders };
  });

  expect(
    measurement.offenders,
    `Elementi oltre il bordo destro di main (${measurement.clientWidth}px)`
  ).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});
