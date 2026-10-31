const { test, expect } = require('@playwright/test');
const { mockEndpoint, startSurvey, disableQuick } = require('./helpers');

const SIZES = [[320, 640], [375, 812], [414, 896], [768, 1024], [1024, 768], [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440],
  [844, 390], [667, 375], [640, 400], [360, 640], [375, 667], [320, 568]];   // phone landscape, a 200% zoom of a laptop, and small phones

for (const [w, h] of SIZES) {
  test(`${w}x${h}: no sideways scroll, Start and Next reachable, controls at least 44px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await disableQuick(page);
    await mockEndpoint(page);
    await page.goto('/index.html');
    await page.waitForFunction(() => !document.querySelector('#start').disabled);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await overflow()).toBe(false);
    const inView = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; }, sel);
    expect(await inView('#start'), 'Start button is visible without scrolling').toBe(true);
    await page.click('#start'); await page.waitForSelector('#qt');
    await page.click('#next'); await page.waitForSelector('#ctl');
    expect(await overflow()).toBe(false);
    expect(await inView('#next'), 'Next button is visible').toBe(true);
    const small = await page.evaluate(() => [...document.querySelectorAll('button,.opt,.sc,.pill,input:not(.vh):not(#hp)')]
      .filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [e.className || e.id, Math.round(r.width), Math.round(r.height)]; }).filter(x => x[1] < 44 || x[2] < 44));
    expect(small).toEqual([]);
  });
}

test('text scales with the browser default font size (sizes are rem, not px)', async ({ request }) => {
  const css = await (await request.get('/assets/style.css')).text();
  const px = [...css.matchAll(/font-size:([^;}]+)/g)].map(m => m[1]).filter(v => /\d+px/.test(v));
  expect(px).toEqual([]);
});

test('grid rows lay out answers beneath the label, not in a squeezed column', async ({ page }) => {
  await mockEndpoint(page);
  await startSurvey(page);
  for (let i = 0; i < 40 && !(await page.locator('#ctl .row').count()); i++) {
    await require('./helpers').answerCurrent(page); await page.waitForTimeout(120); await page.click('#next'); await page.waitForTimeout(250);
  }
  const m = await page.evaluate(() => { const row = document.querySelector('#ctl .row'); const p = row.querySelector('.pills').getBoundingClientRect(); const l = row.querySelector('legend').getBoundingClientRect(); return { pillsWidth: p.width, rowWidth: row.getBoundingClientRect().width, pillsBelowLabel: p.top >= l.bottom - 1 }; });
  expect(m.pillsBelowLabel).toBe(true);
  expect(m.pillsWidth).toBeGreaterThan(m.rowWidth * 0.8);
});
