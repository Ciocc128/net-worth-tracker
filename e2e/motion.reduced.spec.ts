/**
 * «Riduci movimento» moves nothing in the page (AN1, doc/animazioni/README.md §§ 5.1–5.3, § 10).
 *
 * 1. With `reducedMotion: 'reduce'` no animation of `main` is running after a chart has been drawn
 *    (Storico), a FIRE tab has been changed and «Dettaglio» has been opened — the Recharts series
 *    (`useChartMotion`), the tab panel's fade (`[data-tab-switched]`) and the disclosure's height
 *    (`disclosure-motion`) are all behind the media query.
 * 2. The positive control, WITHOUT the preference, in the same flow: the first mount of FIRE animates
 *    no panel, the first change of tab gives the new panel a 200 ms animation, and «Dettaglio»
 *    opens in 300 ms — so a green (1) is not an observer that sees nothing.
 *
 * Written 2026-10-23 without the emulators at hand (cloud container): run it on the Mac with
 * `npm run test:e2e -- e2e/motion.reduced.spec.ts` before the merge.
 */

import { test, expect, type Page } from '@playwright/test';

/** The animations running inside `main`, as `{ name, duration }`. */
const runningAnimations = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector('main')?.getAnimations({ subtree: true }) ?? [])
      .filter((animation) => animation.playState === 'running')
      .map((animation) => ({
        name: (animation as CSSAnimation).animationName ?? (animation as CSSTransition).transitionProperty ?? '',
        duration: Number(animation.effect?.getTiming().duration ?? 0),
      })),
  );

async function waitForPage(page: Page) {
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('with «riduci movimento»', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a drawn chart, a changed FIRE tab and an opened «Dettaglio» leave no animation running', async ({ page }) => {
    await page.goto('/dashboard/history');
    await waitForPage(page);
    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    await expect(page.getByRole('button', { name: /^Dettaglio/ })).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => runningAnimations(page), { timeout: 5_000 }).toEqual([]);

    await page.goto('/dashboard/fire-simulations');
    await waitForPage(page);
    await page.getByRole('tab', { name: 'Coast FIRE' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Coast FIRE' })).toBeVisible();
    await expect.poll(() => runningAnimations(page), { timeout: 5_000 }).toEqual([]);
  });
});

test.describe('without the preference (the positive control)', () => {
  test('the first change of FIRE tab animates the new panel for 200 ms, the first mount none', async ({ page }) => {
    await page.goto('/dashboard/fire-simulations');
    await waitForPage(page);
    const panelFades = async () => (await runningAnimations(page)).filter((animation) => animation.name === 'tab-panel-in');
    expect(await panelFades()).toEqual([]);

    await page.getByRole('tab', { name: 'Coast FIRE' }).click();
    await expect.poll(panelFades, { timeout: 2_000 }).toEqual([{ name: 'tab-panel-in', duration: 200 }]);
  });

  test('«Dettaglio» opens in 300 ms', async ({ page }) => {
    await page.goto('/dashboard/history');
    await waitForPage(page);
    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    await expect
      .poll(async () => (await runningAnimations(page)).filter((animation) => animation.name === 'disclosure-down'), { timeout: 2_000 })
      .toEqual([{ name: 'disclosure-down', duration: 300 }]);
  });
});
