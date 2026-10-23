/**
 * At 390 portrait — where the bottom nav IS visible, its layout animation stays (2026-10-08).
 *
 * `BottomNavigation` turns `layout` and the active pill's `layoutId` on only in portrait below 1440
 * (`useMediaQuery`, `false` on the server and during hydration). Here it must be on:
 *   1. the «+» of Cashflow › Tracciamento appears ABOVE the pill at the right edge, and the pill stays
 *      where it was, centred — sampled every frame (since 2026-10-23: it used to glide aside);
 *   2. a client navigation measures the nav's nodes (Framer reads them through
 *      `getBoundingClientRect`, spied) — the positive control of the «0 at 1440» in
 *      `motion.layout.spec.ts`, which proves that spy counts what it claims to.
 *
 * Test 1 caught a real defect on its first run (2026-10-08): with `layout={isPillVisible}` alone the
 * pill JUMPED — the media query answers `true` only after hydration, and Framer sets up its layout
 * measuring when the element mounts — so the nav is remounted when the gate flips (its `key`).
 * Seen red (2026-10-08) with the media query inverted in `BottomNavigation.tsx`: the pill jumped
 * (two positions) and the spy counted 0.
 */

import { test, expect, type Page } from '@playwright/test';

const bottomNav = (page: Page) => page.locator('nav[data-nav="pill"]');

async function openPanoramica(page: Page) {
  await page.goto('/dashboard');
  await expect(page.locator('main h1').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
  await expect(bottomNav(page)).toBeVisible();
  // Past hydration (the media query's real value) and the page's entrance.
  await page.waitForTimeout(1_000);
}

test('the «+» of Tracciamento floats above the pill, which stays centred', async ({ page }) => {
  // The browser-without-view-transitions path (Firefox's; `runViewTransition` feature-detects the
  // API): on a dev server the page scene freezes rendering while the route compiles.
  await page.addInitScript(() => {
    delete (Document.prototype as unknown as Record<string, unknown>).startViewTransition;
  });
  await openPanoramica(page);
  await expect(page.getByRole('button', { name: 'Aggiungi nuova voce' })).toHaveCount(0);

  // Every frame from before the click: the nav's left edge.
  await page.evaluate(() => {
    const nav = document.querySelector('nav[data-nav="pill"]')!;
    const lefts: number[] = [];
    (window as unknown as { __lefts: number[] }).__lefts = lefts;
    const start = performance.now();
    const tick = () => {
      lefts.push(Math.round(nav.getBoundingClientRect().left * 10) / 10);
      if (performance.now() - start < 2_500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await bottomNav(page).getByRole('link', { name: 'Cashflow' }).click();
  await page.waitForURL('**/dashboard/cashflow');
  const fab = page.getByRole('button', { name: 'Aggiungi nuova voce' });
  await expect(fab).toBeVisible();
  await page.waitForTimeout(2_600);

  // The pill never moved: one left edge in every frame, and its centre is the viewport's.
  const lefts = await page.evaluate(() => (window as unknown as { __lefts: number[] }).__lefts);
  expect(new Set(lefts).size).toBe(1);
  const pill = (await bottomNav(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(pill.x + pill.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  // The «+» sits above the pill, inside the right edge, at least 44px.
  const plus = (await fab.boundingBox())!;
  expect(plus.y + plus.height).toBeLessThanOrEqual(pill.y);
  expect(plus.x + plus.width).toBeLessThanOrEqual(viewport.width);
  expect(plus.width).toBeGreaterThanOrEqual(44);
});

test('a client navigation measures the visible nav — the control of the 0 at 1440', async ({ page }) => {
  await page.addInitScript(() => {
    const spy = { bottomNavMeasures: 0 };
    (window as unknown as { __perf14: typeof spy }).__perf14 = spy;
    const getBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.closest('nav[data-nav="pill"]')) spy.bottomNavMeasures++;
      return getBoundingClientRect.call(this);
    };
  });
  await openPanoramica(page);
  await page.evaluate(() => ((window as unknown as { __perf14: { bottomNavMeasures: number } }).__perf14.bottomNavMeasures = 0));

  await bottomNav(page).getByRole('link', { name: 'Patrimonio' }).click();
  await page.waitForURL('**/dashboard/assets');
  await expect(page.locator('main h1').filter({ visible: true }).first()).toHaveText(/./, { timeout: 30_000 });
  await page.waitForTimeout(800);

  const { bottomNavMeasures } = await page.evaluate(() => ({ ...(window as unknown as { __perf14: { bottomNavMeasures: number } }).__perf14 }));
  expect(bottomNavMeasures).toBeGreaterThan(0);
});

test('a navigation from the pill is the soft scene: no view transition, the pill stays live', async ({ page }) => {
  await openPanoramica(page);
  // Every frame of the navigation: any view-transition pseudo the browser animates, the name the
  // pill's container wears, and whether <main> was fading out (data-page-leaving).
  await page.evaluate(() => {
    const seen = { pseudos: new Set<string>(), containerNames: new Set<string>(), leaving: false, vt: false };
    (window as unknown as { __scene: typeof seen }).__scene = seen;
    const container = document.querySelector('[data-bottom-nav]')!;
    const tick = () => {
      const root = document.documentElement;
      if (root.hasAttribute('data-page-leaving')) seen.leaving = true;
      if (root.dataset.vt === 'page') seen.vt = true;
      seen.containerNames.add(getComputedStyle(container).viewTransitionName);
      for (const animation of document.getAnimations()) {
        const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement;
        if (pseudo?.startsWith('::view-transition')) seen.pseudos.add(pseudo);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await bottomNav(page).getByRole('link', { name: 'Patrimonio' }).click();
  await page.waitForURL('**/dashboard/assets');
  await expect(page.locator('main h1').filter({ visible: true }).first()).toHaveText(/./, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const scene = await page.evaluate(() => {
    const seen = (window as unknown as { __scene: { pseudos: Set<string>; containerNames: Set<string>; leaving: boolean; vt: boolean } }).__scene;
    return { pseudos: [...seen.pseudos], containerNames: [...seen.containerNames], leaving: seen.leaving, vt: seen.vt };
  });
  // Anchor: the page that was left faded out.
  expect(scene.leaving).toBe(true);
  // No view transition ran, so the glass pill was never a snapshot: never named, never captured.
  expect(scene.vt).toBe(false);
  expect(scene.pseudos).toEqual([]);
  expect(scene.containerNames).toEqual(['none']);
  // The next page's mount gave <main> back.
  await expect(page.locator('html')).not.toHaveAttribute('data-page-leaving', /.*/);
  expect(await page.locator('#page-main').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});
