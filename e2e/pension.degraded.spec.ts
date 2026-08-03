/**
 * Previdenza — i tre stati in cui il rendimento NON è una misura.
 *
 * La fixture principale descrive un fondo che va bene, e da quei dati i rami degradati sono
 * irraggiungibili: la card di riepilogo mostra sempre una percentuale e il collapsible c'è sempre.
 * Sono però i rami dove vive la logica più delicata della pagina — quella che decide di NON dare un
 * numero — e fino a qui non li copriva niente.
 *
 * Ogni test rise mina il proprio scenario prima di navigare. Gira su un account separato
 * (`test-user-degraded`) proprio per potersi permettere di riscrivere snapshot e versamenti senza
 * che nessun'altra spec ne dipenda; il progetto Playwright `degraded` è quello che gli passa la
 * sessione giusta.
 */

import { spawnSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

/**
 * Riscrive lo scenario dell'account degradato.
 *
 * Sincrono, e va bene: la suite gira con `workers: 1`, quindi non c'è nessun altro test a metà
 * navigazione mentre Firestore viene riscritto.
 */
function seedScenario(scenario: 'suspicious' | 'idle' | 'fresh'): void {
  const result = spawnSync('npm', ['run', 'e2e:seed', '--', scenario], {
    stdio: 'pipe',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `Seed dello scenario «${scenario}» fallito:\n${result.stderr?.toString() ?? ''}`
    );
  }
}

/**
 * La card del rendimento, individuata dal suo titolo — è la stessa in tutti e tre gli stati.
 * Il titolo si accorda al numero di fondi tracciati: gli scenari ne hanno uno, ma il locator no.
 */
function returnCard(page: Page) {
  return page.getByRole('heading', { name: /^Rendimento (del fondo|dei fondi)$/ }).locator('..');
}

async function gotoPension(page: Page): Promise<void> {
  await page.goto('/dashboard/pension');
  // Il titolo di capitolo è l'ultimo elemento stabile comune a tutti gli scenari: aspettarlo rende
  // stabili le asserzioni successive senza presupporre quale variante di card sia stata resa.
  await expect(page.getByRole('heading', { name: /^(Il fondo|I fondi) oggi$/ })).toBeVisible({
    timeout: 30_000,
  });
}

/** Il collapsible con la scomposizione in euro. Assente = il locator non risolve nulla. */
function breakdownDisclosure(page: Page) {
  return page.getByRole('button', { name: 'Da dove viene la crescita' });
}

test('copertura sospetta: dichiara il rendimento inattendibile e NON scompone la crescita', async ({
  page,
}) => {
  seedScenario('suspicious');
  await gotoPension(page);

  // La spiegazione prende il posto della percentuale.
  await expect(returnCard(page)).toContainText('verrebbe letta come rendimento di mercato');
  await expect(page.getByText(/^[+-]\d+\.\d{2}%$/)).toBeHidden();

  // IL PUNTO DI QUESTO TEST. Prima la guardia guardava solo `hasNoMovement`, quindi qui il
  // collapsible restava e stampava «Guadagno di mercato» in grassetto e colorato dal segno: il
  // numero che la card sopra aveva appena dichiarato NON essere un guadagno di mercato, a quaranta
  // pixel di distanza. Un numero e la sua smentita sulla stessa schermata.
  await expect(breakdownDisclosure(page)).toHaveCount(0);
  await expect(page.getByText('Guadagno di mercato')).toHaveCount(0);
});

test('finestra ferma: spiega invece di stampare +0,00% e NON scompone la crescita', async ({
  page,
}) => {
  seedScenario('idle');
  await gotoPension(page);

  await expect(returnCard(page)).toContainText('non si è ancora mosso');
  await expect(page.getByText('+0.00%')).toHaveCount(0);

  // Ogni riga della scomposizione varrebbe zero: il blocco va omesso, non riempito di zeri.
  await expect(breakdownDisclosure(page)).toHaveCount(0);
});

test('fondo appena creato: la colonna del rendimento spiega, e non resta vuota a 1440px', async ({
  page,
}) => {
  seedScenario('fresh');
  await gotoPension(page);

  await expect(returnCard(page)).toContainText('Nessuna fotografia mensile');

  // LA REGRESSIONE DI LAYOUT. Senza una card in colonna 2, la griglia `[2fr_1fr]` con un solo figlio
  // lasciava un terzo di riga bianco a 1440px — lo stato di ogni fondo appena creato, finché il cron
  // serale non scrive la prima fotografia che lo contiene. Le stesse asserzioni geometriche della
  // spec principale, qui su uno scenario che allora non le avrebbe superate.
  const hero = page.getByRole('heading', { name: 'Valore attuale' }).locator('..');
  const heroBox = (await hero.boundingBox())!;
  const returnBox = (await returnCard(page).boundingBox())!;

  expect(returnBox.x).toBeGreaterThan(heroBox.x + heroBox.width / 2);
  expect(Math.abs(returnBox.y - heroBox.y)).toBeLessThan(24);
  expect(heroBox.width / returnBox.width).toBeGreaterThan(1.6);

  await expect(breakdownDisclosure(page)).toHaveCount(0);
});
