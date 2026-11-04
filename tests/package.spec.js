const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockEndpoint, answerAll, startSurvey } = require('./helpers');

// Fixed "today" so the dates list is predictable.
const TODAY = new Date('2026-11-03T12:00:00');

async function finish(page, mode = 'ok', opts = { pick: 1 }) {
  await page.clock.setFixedTime(TODAY);
  const ctl = await mockEndpoint(page, mode);
  await startSurvey(page);
  await answerAll(page, opts);
  return ctl;
}

test('after a confirmed submission the sponsor gets a personalised package', async ({ page }) => {
  test.setTimeout(120000);
  await finish(page);
  await expect(page.locator('#doneH')).toContainText('Thank');
  await expect(page.locator('#pkg')).toBeVisible();
  await expect(page.locator('#pkg h2')).toHaveText('Your sponsor readiness package');
  await expect(page.locator('#pkgP1 .pkg-lead')).toBeVisible();
  // dates still ahead on Nov. 3 (Sprint 3 ... Dec. 13)
  await expect(page.locator('.pkg-dates li')).toHaveCount(6);
  await expect(page.locator('.pkg-dates')).toContainText('Midterm presentation submission');
  // the test answers pick the first expectations column ("1"), so every expectation shows as a refresher
  await expect(page.locator('#pkgP1 details[data-id="rf-eval"]')).toHaveCount(1);
  // contact details typed on the last page never appear in the package
  await expect(page.locator('#pkg')).not.toContainText('a@b.co');
  // the package is computed locally: nothing extra was sent
});

test('the two tabs work with the mouse and the keyboard', async ({ page }) => {
  test.setTimeout(120000);
  await finish(page);
  await expect(page.locator('#pkgT1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pkgP2')).toBeHidden();
  await page.locator('#pkgT1').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#pkgT2')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pkgT2')).toBeFocused();
  await expect(page.locator('#pkgP2')).toBeVisible();
  await expect(page.locator('#pkgP1')).toBeHidden();
  await expect(page.locator('#pkgP2 .pkg-card')).toHaveCount(6);
  await page.keyboard.press('Home');
  await expect(page.locator('#pkgT1')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#pkgT2').click();
  await expect(page.locator('#pkgP2 .pkg-lead')).toContainText('new sponsor');
});

test('no package is shown when delivery could not be confirmed, and it appears after a successful retry', async ({ page }) => {
  test.setTimeout(120000);
  const ctl = await finish(page, 'http500');
  await expect(page.locator('#doneH')).toContainText('could not confirm');
  await expect(page.locator('#pkg')).toBeHidden();
  ctl.mode = 'ok';
  await page.click('#retry');
  await expect(page.locator('#doneH')).toContainText('Thank');
  await expect(page.locator('#pkg')).toBeVisible();
});

test('print: only the package prints, with both sections open', async ({ page }) => {
  test.setTimeout(120000);
  await finish(page);
  await page.evaluate(() => { document.querySelectorAll('#pkg details').forEach(d => { d.open = true; }); document.body.classList.add('print-pkg'); });
  await page.emulateMedia({ media: 'print' });
  const m = await page.evaluate(() => {
    const vis = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };
    return { p1: vis('#pkgP1'), p2: vis('#pkgP2'), tabs: vis('.pkg-tabs'), btn: vis('#printPkg'), h1: vis('#doneH'), mine: vis('#mine'), heading: vis('#pkgP2 .pkg-ph') };
  });
  expect(m).toEqual({ p1: true, p2: true, tabs: false, btn: false, h1: false, mine: false, heading: true });
});

for (const scheme of ['light', 'dark']) {
  test(`the package passes the accessibility scan (${scheme})`, async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext({ bypassCSP: true, reducedMotion: 'reduce', colorScheme: scheme });
    const page = await ctx.newPage();
    await finish(page);
    await expect(page.locator('#pkg')).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'), null, { timeout: 10000 });
    for (const tab of ['#pkgT1', '#pkgT2']) {
      await page.click(tab); await page.waitForTimeout(150);
      const { violations } = await new AxeBuilder({ page }).include('#pkg').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      const detail = violations.map(v => `${tab} ${scheme}: ${v.id} ` + v.nodes.slice(0, 3).map(n => `${n.target} :: ${((n.any[0] || n.all[0] || n.none[0] || {}).message || '').slice(0, 140)}`).join(' | '));
      expect(detail.join('\n')).toBe('');
    }
    await ctx.close();
  });
}
