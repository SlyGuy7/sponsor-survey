const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');

const survey = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'survey.json'), 'utf8'));
const CORS = { 'access-control-allow-origin': '*' };

// Twelve made-up responses shaped like the rows the Apps Script returns (no contact details, no submission IDs).
function fixture(n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const r = { receivedAt: `2026-10-2${(i % 4) + 1}T15:0${i % 6}:00.000Z`, seconds: 240 + i * 30 };
    survey.questions.forEach(q => {
      const k = q.n ? 'q' + q.n : (q.bonus === 2 ? 'quote_ok' : q.bonus === 3 ? 'results_ok' : null);
      if (!k || q.type === 'contact') return;
      if (q.type === 'single') r[k] = q.options[i % q.options.length].label;
      else if (q.type === 'multi') r[k] = q.options.slice(0, 2).map(o => o.label).join(' | ');
      else if (q.type === 'scale') r[k] = (i % 5) + 1;
      else if (q.type === 'grid') q.rows.forEach((_, ri) => { r[k + '_r' + (ri + 1)] = q.cols[(i + ri) % q.cols.length]; });
      else if (q.type === 'text') r[k] = i === 0 ? '=SUM(1,1) is not a formula here' : `Answer number ${i} to ${k}`;
    });
    r.quote_ok = i % 2 ? 'Yes' : 'No'; r.results_ok = i % 3 ? 'No' : 'Yes';
    return r;
  });
}

async function mock(page, reply) {
  const seen = [];
  await page.route('https://script.google.com/**', route => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(typeof reply === 'function' ? reply(route.request().url()) : reply) });
  });
  return seen;
}
const OK = rows => ({ ok: true, count: rows.length, generatedAt: '2026-10-31T12:00:00.000Z', rows });

test('asks for a key and sends nothing until one is entered', async ({ page }) => {
  const seen = await mock(page, OK(fixture()));
  await page.goto('/dashboard.html');
  await expect(page.locator('#gate')).toBeVisible();
  await page.waitForTimeout(500);
  expect(seen).toEqual([]);
  await page.fill('#keyIn', 'test-key-123');
  await page.click('#gateForm button');
  await expect(page.locator('#out')).toBeVisible();
  expect(seen).toHaveLength(1);
  expect(seen[0]).toContain('action=summary');
  expect(seen[0]).toContain('key=test-key-123');
  await expect(page.locator('#keyIn')).toHaveValue('');
});

test('a key in the link is used once and removed from the address bar', async ({ page }) => {
  const seen = await mock(page, OK(fixture()));
  await page.goto('/dashboard.html#key=abc123');
  await expect(page.locator('#out')).toBeVisible();
  expect(seen[0]).toContain('key=abc123');
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('a rejected key shows a clear message and the key form again', async ({ page }) => {
  await mock(page, { ok: false, error: 'not allowed' });
  await page.goto('/dashboard.html#key=wrong');
  await expect(page.locator('#msg')).toContainText('not accepted');
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#out')).toBeHidden();
});

test('a server error is reported, not shown as empty results', async ({ page }) => {
  await mock(page, { ok: false, error: 'server error' });
  await page.goto('/dashboard.html#key=k');
  await expect(page.locator('#msg')).toContainText('Could not load');
  await expect(page.locator('#tiles .tile')).toHaveCount(0);
});

test.describe('with results', () => {
  test('summary tiles and a chart for every question type', async ({ page }) => {
    const problems = [];
    page.on('pageerror', e => problems.push(String(e)));
    await mock(page, OK(fixture(12)));
    await page.goto('/dashboard.html#key=k');
    await expect(page.locator('#tiles .tile').first()).toContainText('12');
    await expect(page.locator('#tiles')).toContainText('Median time to finish');
    await expect(page.locator('#updated')).toContainText('12 responses');
    await expect(page.locator('.part')).toHaveCount(6);
    const q1 = page.locator('.q-card', { hasText: 'Which best describes your organization?' });
    await expect(q1.locator('.bars li').first()).toContainText('Large company');
    await expect(q1.locator('.val').first()).toContainText('%');
    await expect(page.locator('.q-card', { hasText: 'how clear was it to you what the program expected' })).toContainText('Average:');
    const grid = page.locator('.q-card', { hasText: 'how ready was each of the following' });
    await expect(grid.locator('table.heat')).toBeVisible();
    await expect(grid.locator('tbody tr')).toHaveCount(7);
    await expect(page.locator('.answers').first()).toContainText('Answer number');
    expect(problems).toEqual([]);
  });

  test('never shows contact details or submission IDs', async ({ page }) => {
    await mock(page, OK(fixture()));
    await page.goto('/dashboard.html#key=k');
    await expect(page.locator('#out')).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/contact_|submissionId|@example\.com/);
    await expect(page.getByText('Contact details')).toHaveCount(0);
  });

  test('the quote filter only keeps answers sponsors allowed us to quote', async ({ page }) => {
    await mock(page, OK(fixture(12)));
    await page.goto('/dashboard.html#key=k');
    const card = page.locator('.q-card', { hasText: 'most helpful thing' });
    await expect(card.locator('.answers li').first()).toBeVisible();
    const all = await card.locator('.answers li').count();
    await card.locator('input[type=checkbox]').check();
    const some = await card.locator('.answers li').count();
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(all);
    await expect(card.locator('.answers li .badge').first()).toHaveText('OK to quote');
  });

  test('CSV download has readable headings and neutralises formulas', async ({ page }) => {
    await mock(page, OK(fixture(12)));
    await page.goto('/dashboard.html#key=k');
    await expect(page.locator('#csv')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    expect(dl.suggestedFilename()).toBe('sponsor-survey-results.csv');
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    expect(csv).toContain('"Q1. Which best describes your organization?"');
    expect(csv).toContain('"\'=SUM(1,1) is not a formula here"');
    expect(csv.trim().split('\r\n')).toHaveLength(13);   // header + 12 responses
    expect(csv).not.toMatch(/contact_|submissionId|@/);
  });

  test('refresh asks again and updates the numbers', async ({ page }) => {
    let rows = fixture(3);
    const seen = await mock(page, () => OK(rows));
    await page.goto('/dashboard.html#key=k');
    await expect(page.locator('#updated')).toContainText('3 responses');
    rows = fixture(5);
    await page.click('#refresh');
    await expect(page.locator('#updated')).toContainText('5 responses');
    expect(seen).toHaveLength(2);
  });

  test('empty sheet shows a friendly message', async ({ page }) => {
    await mock(page, OK([]));
    await page.goto('/dashboard.html#key=k');
    await expect(page.locator('#parts')).toContainText('No responses yet');
    await expect(page.locator('#csv')).toBeHidden();
  });

  test('phone layout has no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mock(page, OK(fixture(12)));
    await page.goto('/dashboard.html#key=k');
    await expect(page.locator('#out')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  for (const scheme of ['light', 'dark']) {
    test(`accessibility, ${scheme} scheme`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, bypassCSP: true });
      const page = await ctx.newPage();
      await mock(page, OK(fixture(12)));
      await page.goto('/dashboard.html');
      let r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      expect(r.violations.map(v => v.id + ' ' + v.nodes[0].target), 'key form').toEqual([]);
      await page.fill('#keyIn', 'k'); await page.click('#gateForm button');
      await expect(page.locator('#out')).toBeVisible();
      r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      expect(r.violations.map(v => v.id + ' ' + v.nodes[0].target), 'results').toEqual([]);
      await ctx.close();
    });
  }
});
