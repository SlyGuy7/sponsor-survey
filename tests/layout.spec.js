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
    await page.click('#start'); await page.waitForSelector('#ctl');
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

async function reachGrid(page) {
  await mockEndpoint(page);
  await startSurvey(page);
  for (let i = 0; i < 40 && !(await page.locator('#ctl .row').count()); i++) {
    await require('./helpers').answerCurrent(page); await page.waitForTimeout(120); await page.click('#next'); await page.waitForTimeout(250);
  }
}

test('desktop grids are a matrix: one header row, answers on the same line as the label', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await reachGrid(page);
  await expect(page.locator('.mx-head')).toBeVisible();
  expect(await page.locator('.mx-head span').count()).toBe(6);            // label column + 5 answers
  const m = await page.evaluate(() => {
    const row = document.querySelector('#ctl .row'); const l = row.querySelector('.rl').getBoundingClientRect();
    const pills = [...row.querySelectorAll('.pill')].map(p => p.getBoundingClientRect());
    const head = [...document.querySelectorAll('.mx-head span')].slice(1).map(s => s.getBoundingClientRect());
    const aligned = pills.every((p, i) => Math.abs((p.left + p.width / 2) - (head[i].left + head[i].width / 2)) < 6);
    return { sameLine: pills.every(p => Math.abs((p.top + p.height / 2) - (l.top + l.height / 2)) < 30), aligned, accessibleNames: [...row.querySelectorAll('.pill')].map(p => p.textContent.trim()) };
  });
  expect(m.sameLine).toBe(true);
  expect(m.aligned, 'each radio sits under its column heading').toBe(true);
  expect(m.accessibleNames.every(n => n.length > 3)).toBe(true);          // the visible column text stays available to screen readers
  await page.locator('#ctl .row').first().locator('.pill').nth(2).click();
  await expect(page.locator('#ctl .row').first()).toHaveClass(/done/);
});

test('phone grids stay as rows of labelled answers beneath each question', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reachGrid(page);
  await expect(page.locator('.mx-head')).toBeHidden();
  const m = await page.evaluate(() => { const row = document.querySelector('#ctl .row'); const p = row.querySelector('.pills').getBoundingClientRect(); const l = row.querySelector('.rl').getBoundingClientRect(); return { below: p.top >= l.bottom - 1, wide: p.width > row.getBoundingClientRect().width * 0.8 }; });
  expect(m.below && m.wide).toBe(true);
});
