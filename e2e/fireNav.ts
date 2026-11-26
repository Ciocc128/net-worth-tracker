/**
 * FIRE's navigation since RU10 (doc/riordino-ui/ondata-3.md § 5.1): three tabs — Quando · E se… · Approfondimenti (and, until
 * RU11, Traguardi) — and, inside Approfondimenti, a pill that picks Coast FIRE · Dopo il FIRE · Proiezione. The specs of the
 * six tabs of before go through these two helpers, so the next change of the bar is one edit.
 */
import { expect, type Page } from '@playwright/test';

export type FireTabName = 'Quando' | 'E se…' | 'Approfondimenti' | 'Traguardi';
export type FireViewName = 'Coast FIRE' | 'Dopo il FIRE' | 'Proiezione';

export async function openFireTab(page: Page, name: FireTabName): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}

/** Opens Approfondimenti and picks the view on its axis pill (a radiogroup, not a second bar of tabs). */
export async function openFireView(page: Page, view: FireViewName): Promise<void> {
  const group = page.getByRole('radiogroup', { name: 'Vista di Approfondimenti' });
  if (!(await group.isVisible())) await openFireTab(page, 'Approfondimenti');
  await group.getByRole('radio', { name: view, exact: true }).click();
  await expect(group.getByRole('radio', { name: view, exact: true })).toHaveAttribute('aria-checked', 'true');
}
