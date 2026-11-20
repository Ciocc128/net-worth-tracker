import { expect, type Page } from '@playwright/test';

/**
 * The person in the band (D-FD8) opens the account menu: name and email at its top, Impostazioni, the theme, «Esci».
 * It replaces the sidebar footer's profile as the place a spec reads WHO is signed in. The band mounts with the
 * page, after Firebase Auth has answered, so a visible person is also the «session is ready» signal that
 * `navigation` and `main` (in the HTML before Auth) cannot give. At `desktop:` and in landscape on a tablet.
 */
export const accountButton = (page: Page) => page.locator('[data-account-menu]').filter({ visible: true }).first();

/** Opens the account menu and returns it. */
export async function openAccountMenu(page: Page) {
  await accountButton(page).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/** Waits for the session: the band's person is there and the menu names `email`; closes the menu. */
export async function expectSignedInAs(page: Page, email: string): Promise<void> {
  const menu = await openAccountMenu(page);
  await expect(menu).toContainText(email);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}
