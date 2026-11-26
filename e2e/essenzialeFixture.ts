import { expect, type Page } from '@playwright/test';

/**
 * The Essenziale view's fixture account (scripts/seedEssenzialeE2E.mts) through the Firestore emulator's REST API: the
 * specs put the viewer back in Essenziale before each test and read back what a choice wrote.
 */
export const ESSENZIALE_UID = 'test-user-essenziale';

const DOC_URL = `http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/userPreferences/${ESSENZIALE_UID}`;
// Without this header the emulator filters the call through the rules, and a read looks like «no document».
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Replaces the viewer's preferences with `{ viewPreset: 'essenziale' }` (no overrides). */
export async function resetToEssenziale(): Promise<void> {
  const response = await fetch(DOC_URL, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: { viewPreset: { stringValue: 'essenziale' } } }),
  });
  expect(response.ok).toBe(true);
}

/** The stored view: the preset and the overrides as a plain map. */
export async function readView(): Promise<{ viewPreset?: string; overrides: Record<string, boolean> }> {
  const response = await fetch(DOC_URL, { headers: OWNER });
  const body = (await response.json()) as {
    fields?: {
      viewPreset?: { stringValue: string };
      viewAreaOverrides?: { mapValue: { fields?: Record<string, { booleanValue: boolean }> } };
    };
  };
  const overrides = Object.fromEntries(
    Object.entries(body.fields?.viewAreaOverrides?.mapValue.fields ?? {}).map(([key, value]) => [key, value.booleanValue]),
  );
  return { viewPreset: body.fields?.viewPreset?.stringValue, overrides };
}

/** The group names on the band's first floor, as a reader sees them (hidden ones excluded). */
export const bandGroups = (page: Page) => page.locator('[data-nav="folders"] a').filter({ visible: true });

/** The tabs on the band's bottom edge (the open group's pages). */
export const bandPages = (page: Page) => page.locator('[data-band-pages] a').filter({ visible: true });

/** The page's visible tab bar («Sezioni di …»: a tile's own tablist, Tracciamento's Feed · Tabella, is not it). */
export const visibleTabs = (page: Page) =>
  page.getByRole('tablist', { name: /^Sezioni / }).filter({ visible: true }).getByRole('tab');

/** The page has mounted (its `h1`, the shell's «page is here» marker). */
export async function pageReady(page: Page, title: string) {
  await expect(page.locator('main h1').first()).toContainText(title, { timeout: 60_000 });
}
