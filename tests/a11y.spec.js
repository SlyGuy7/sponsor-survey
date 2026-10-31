const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockEndpoint, KIND, isDone, answerCurrent, disableQuick } = require('./helpers');

test.use({ bypassCSP: true });   // lets axe inject itself; the CSP itself is checked in survey.spec.js

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
async function scan(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map(v => `${label}: ${v.id} ${v.nodes[0].target}`), label).toEqual([]);
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
  expect([...seen].sort()).toEqual(['contact', 'grid', 'intro', 'multi', 'scale', 'single', 'text']);
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
  await page.click('#start'); await page.click('#next'); await page.waitForSelector('#ctl fieldset');
  expect(await page.locator('#ctl fieldset input[type=radio]').count()).toBeGreaterThan(3);
  await expect(page.locator('#ctl fieldset')).toHaveAttribute('aria-labelledby', 'qt');
});
