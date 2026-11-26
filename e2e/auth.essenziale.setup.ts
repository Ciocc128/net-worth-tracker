/**
 * Session of the Essenziale view's fixture account — same real-form login as auth.setup.ts.
 *
 * A separate account (see scripts/seedEssenzialeE2E.mts): the view is the viewer's, and the base account in
 * Essenziale would take four areas out of every other spec's menu.
 */

import { test as setup } from '@playwright/test';
import { ESSENZIALE_STORAGE_STATE } from '../playwright.config';
import { expectSignedInAs } from './account';
import { stripPersistedQueryCache } from './persistedCache';

/** Matches `scripts/seedEssenzialeE2E.mts`. */
const EMAIL = 'essenziale@example.com';
const PASSWORD = 'test1234';

setup('authenticate essenziale user', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  // The person in the band (its menu names the account), not `navigation`/`main`: those are in the HTML before the
  // login since 2026-09-28 (see auth.setup.ts).
  await expectSignedInAs(page, EMAIL);

  // indexedDB: true — the Firebase Web SDK parks its session there (see auth.setup.ts).
  await page.context().storageState({ path: ESSENZIALE_STORAGE_STATE, indexedDB: true });
  // The persisted React Query cache out of the state file (see auth.setup.ts).
  stripPersistedQueryCache(ESSENZIALE_STORAGE_STATE);
});
