const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockEndpoint, KIND, isDone, answerCurrent, disableQuick } = require('./helpers');

test.use({ bypassCSP: true, reducedMotion: 'reduce' });   // bypassCSP lets axe inject itself (the CSP is checked in survey.spec.js); reduced motion keeps entrance animations from being scanned half-faded

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
async function scan(page, label) {
  // let any entrance animation finish, so text is scanned at full opacity
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'), null, { timeout: 10000 });
  await page.waitForTimeout(150);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  // describe every violation fully, so a failure on another machine explains itself
  const detail = violations.map(v => `${label}: ${v.id} (${v.impact}) ` + v.nodes.slice(0, 3).map(n => `${n.target} :: ${((n.any[0] || n.all[0] || n.none[0] || {}).message || '').slice(0, 160)}`).join(' | '));
  expect(detail.join('\n'), label).toBe('');
}

test('no axe violations on any screen type, including both end states', async ({ page }) => {
  test.setTimeout(120000);
  await disableQuick(page);
  await mockEndpoint(page, 'http500');
  await page.goto('/index.html');
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  await scan(page, 'welcome');
  await page.click('#start'); await page.waitForTimeout(300);
  const seen = new Set();
  for (let i = 0; i < 80 && !(await isDone(page)); i++) {
    const kind = await page.evaluate(KIND);
    if (!seen.has(kind)) { seen.add(kind); await page.waitForTimeout(200); await scan(page, 'screen ' + kind); }
    await answerCurrent(page); await page.waitForTimeout(150); await page.click('#next'); await page.waitForTimeout(300);
  }
  expect([...seen].sort()).toEqual(['contact', 'grid', 'multi', 'scale', 'single', 'text']);
  await page.waitForTimeout(1200);
  await scan(page, 'done (failure)');
});

test('landmarks, headings and live regions', async ({ page }) => {
  await mockEndpoint(page);
  await page.goto('/index.html');
  expect(await page.locator('main').count()).toBe(1);
  expect(await page.locator('h1:visible').count()).toBe(1);
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  await page.click('#start'); await page.waitForSelector('#qt');
  expect(await page.locator('h1:visible').count()).toBe(1);
  await expect(page.locator('#qt')).toBeFocused();
  await expect(page.locator('progress')).toHaveAttribute('aria-valuetext', /questions answered/);
  const title = await page.title();
  expect(title).toContain('Sponsor Experience Survey');
});

test('answer groups are real fieldsets with native radios', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  await page.click('#start'); await page.waitForSelector('#ctl fieldset');
  expect(await page.locator('#ctl fieldset input[type=radio]').count()).toBeGreaterThan(3);
  await expect(page.locator('#ctl fieldset')).toHaveAttribute('aria-labelledby', 'qt');
});

test.describe('dark colour scheme', () => {
  test.use({ colorScheme: 'dark' });
  test('no axe violations on the screens that change in dark mode', async ({ page }) => {
    test.setTimeout(120000);
    await disableQuick(page);
    await mockEndpoint(page, 'ok');
    await page.goto('/index.html');
    await page.waitForFunction(() => !document.querySelector('#start').disabled);
    await scan(page, 'dark welcome');
    await page.click('#start'); await page.waitForTimeout(300);
    const seen = new Set();
    for (let i = 0; i < 80 && !(await isDone(page)); i++) {
      const kind = await page.evaluate(KIND);
      await answerCurrent(page);
      if (!seen.has(kind)) { seen.add(kind); await page.waitForTimeout(250); await scan(page, 'dark ' + kind); }
      await page.waitForTimeout(150); await page.click('#next'); await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1200);
    await scan(page, 'dark done');
  });
});
