const { test, expect } = require('@playwright/test');
const { mockEndpoint, answerAll, startSurvey, isDone } = require('./helpers');

const QUESTION = page => page.locator('.qtext');

test.describe('page basics', () => {
  test('loads with no console errors and the Start button becomes enabled', async ({ page }) => {
    const problems = [];
    page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
    page.on('pageerror', e => problems.push(String(e)));
    await mockEndpoint(page);
    await page.goto('/index.html');
    await expect(page.locator('#start')).toBeEnabled();
    await expect(page.locator('h1:visible')).toContainText('Help us help the');
    expect(problems).toEqual([]);
  });

  test('metadata: noindex, canonical, description, social preview, CSP, language', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://slyguy7.github.io/sponsor-survey/');
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /survey/i);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\/.+\.png$/);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(await page.locator('main').count()).toBe(1);
  });

  test('every local asset referenced by the page exists', async ({ page, request }) => {
    await page.goto('/index.html');
    const urls = await page.evaluate(() => [...document.querySelectorAll('link[href],script[src],img[src]')].map(e => e.getAttribute('href') || e.getAttribute('src')).filter(u => !u.startsWith('http') && !u.startsWith('data:')));
    expect(urls.length).toBeGreaterThan(5);
    for (const u of urls) expect((await request.get('/' + u)).status(), u).toBe(200);
  });

  test('404 page links back to the survey', async ({ page }) => {
    await page.goto('/404.html');
    await expect(page.locator('h1')).toHaveText(/does not exist/i);
    await expect(page.locator('a.btn')).toHaveAttribute('href', '/sponsor-survey/');
  });
});

test.describe('completing the survey', () => {
  test('submits exactly once, shows thank-you only after confirmation, and clears saved data', async ({ page }) => {
    const ctl = await mockEndpoint(page);
    await startSurvey(page);
    const kinds = await answerAll(page, { pick: 1 });
    await expect(page.locator('#doneH')).toContainText('Thank');
    await expect(page.locator('#status')).toHaveAttribute('role', 'status');
    await expect(page.locator('#steps')).toBeVisible();
    expect(ctl.bodies).toHaveLength(1);
    expect(kinds.filter(k => k !== 'intro')).toHaveLength(23);   // 20 questions + 3 optional
    const payload = JSON.parse(ctl.bodies[0]);
    expect(payload).toMatchObject({ client: 'v3', hp: '', contact_email: 'a@b.co', q10: 'Scope or goals, or signing the scope document' });
    expect(payload.q11).toBeTruthy();
    expect(payload.elapsedMs).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem('njit-sponsor-survey-v3'))).toBeNull();
  });

  test('skip logic: "Nothing was delayed" removes question 11', async ({ page }) => {
    const ctl = await mockEndpoint(page);
    await startSurvey(page);
    const kinds = await answerAll(page, { pick: 0 });
    expect(kinds.filter(k => k !== 'intro')).toHaveLength(22);
    const payload = JSON.parse(ctl.bodies[0]);
    expect(payload.q10).toBe('Nothing was delayed');
    expect(payload).not.toHaveProperty('q11');
  });

  for (const mode of ['http500', 'html200', 'okfalse', 'abort']) {
    test(`failure (${mode}): never claims success, keeps answers, retry works`, async ({ page }) => {
      const ctl = await mockEndpoint(page, mode);
      await startSurvey(page);
      await answerAll(page);
      await expect(page.locator('#doneH')).toHaveText('We could not confirm delivery');
      await expect(page.locator('#status')).toContainText('could not confirm');
      await expect(page.locator('#retryRow')).toBeVisible();
      await expect(page.locator('#steps')).toBeHidden();
      await expect(page.locator('#closeTab')).toBeHidden();
      expect(await page.evaluate(() => localStorage.getItem('njit-sponsor-survey-v3'))).not.toBeNull();
      ctl.mode = 'ok';
      await page.click('#retry');
      await expect(page.locator('#doneH')).toContainText('Thank');
      expect(ctl.bodies).toHaveLength(2);
      expect(JSON.parse(ctl.bodies[0]).submissionId).toBe(JSON.parse(ctl.bodies[1]).submissionId);   // same id lets the server de-duplicate
    });
  }

  test('contact details are never written to local storage', async ({ page }) => {
    await mockEndpoint(page, 'http500');
    await startSurvey(page);
    await answerAll(page, { email: 'private@example.com' });
    await expect(page.locator('#doneH')).toHaveText('We could not confirm delivery');
    const stored = await page.evaluate(() => localStorage.getItem('njit-sponsor-survey-v3'));
    expect(stored).not.toContain('private@example.com');
    expect(stored).not.toContain('contact');
  });
});

test.describe('validation', () => {
  test('an invalid email blocks submission and is announced', async ({ page }) => {
    await mockEndpoint(page);
    await startSurvey(page);
    for (let i = 0; i < 80 && !(await page.locator('#cn').count()); i++) {
      await require('./helpers').answerCurrent(page); await page.waitForTimeout(120); await page.click('#next'); await page.waitForTimeout(250);
    }
    await page.fill('#ce', 'not-an-email');
    await page.click('#next');
    await expect(page.locator('#err')).toContainText('email');
    await expect(page.locator('#ce')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#cn')).toBeVisible();
  });

  test('"Other" needs text before continuing', async ({ page }) => {
    await mockEndpoint(page);
    await startSurvey(page);
    await page.locator('#ctl .opt').nth(6).click();             // Q1 "Other"
    await page.click('#next');
    await expect(page.locator('#err')).toContainText('Other');
    await expect(page.locator('.other-in.on input')).toBeFocused();
    await page.fill('.other-in.on input', 'Consortium');
    await page.click('#next');
    await expect(QUESTION(page)).toContainText('main focus');
  });

  test('required questions cannot be skipped', async ({ page }) => {
    await startSurvey(page);
    await page.click('#next');
    await expect(page.locator('#err')).toContainText('Choose an answer');
    await expect(QUESTION(page)).toContainText('organization');
  });

  test('multi-select: "I never received this information" excludes the others', async ({ page }) => {
    await startSurvey(page);
    for (let i = 0; i < 40 && !(await page.locator('#ctl input[type=checkbox]').count()); i++) {
      await require('./helpers').answerCurrent(page); await page.waitForTimeout(120); await page.click('#next'); await page.waitForTimeout(250);
    }
    const opts = page.locator('#ctl .opt');
    await opts.nth(0).click(); await opts.nth(1).click();
    expect(await page.locator('#ctl .opt.sel').count()).toBe(2);
    await opts.nth(6).click();
    expect(await page.locator('#ctl .opt.sel').count()).toBe(1);
    await opts.nth(0).click();
    expect(await page.locator('#ctl .opt.sel').count()).toBe(1);
  });
});

test.describe('keyboard, history and resume', () => {
  test('Space selects without advancing, arrows move, Enter continues, ArrowLeft does not navigate', async ({ page }) => {
    await startSurvey(page, { quick: true });
    await page.locator('#ctl input').first().focus();
    await page.keyboard.press('Space');
    expect(await page.locator('#ctl .opt.sel').count()).toBe(1);
    await page.waitForTimeout(800);
    await expect(QUESTION(page)).toContainText('organization');          // no auto-advance from the keyboard
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => [...document.querySelectorAll('#ctl .opt')].findIndex(l => l.classList.contains('sel')))).toBe(1);
    await page.keyboard.press('ArrowLeft');
    await expect(QUESTION(page)).toContainText('organization');
    await page.keyboard.press('Enter');
    await expect(QUESTION(page)).toContainText('main focus');
    await expect(page.locator('#qt')).toBeFocused();                      // focus moves to the new question
  });

  test('digit shortcuts work and turning auto-advance off turns them off', async ({ page }) => {
    await startSurvey(page, { quick: true });
    await page.keyboard.press('3');
    await expect(QUESTION(page)).toContainText('main focus', { timeout: 3000 });   // selected and auto-advanced
    await page.click('#quick');
    await expect(page.locator('#quick')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#quick')).toHaveText('Auto-advance: off');
    await page.keyboard.press('2');
    expect(await page.locator('#ctl .opt.sel').count()).toBe(0);
  });

  test('browser Back steps through questions instead of leaving the survey', async ({ page }) => {
    await startSurvey(page, { quick: true });
    await page.keyboard.press('3'); await expect(QUESTION(page)).toContainText('main focus', { timeout: 3000 });
    await page.goBack();
    await expect(QUESTION(page)).toContainText('organization');
    await page.waitForTimeout(400);                                        // let the screen transition finish, as a person would
    await page.goBack();
    await expect(page.locator('#welcome')).toHaveClass(/on/);
  });

  test('a reload offers to continue, Enter resumes, and Start over needs two clicks', async ({ page }) => {
    await startSurvey(page, { quick: true });
    await page.keyboard.press('3'); await expect(QUESTION(page)).toContainText('main focus', { timeout: 3000 });
    await page.reload();
    await expect(page.locator('#resume')).toBeVisible();
    await expect(page.locator('#start')).toBeHidden();
    await page.waitForFunction(() => !document.querySelector('#resume').disabled);
    await page.keyboard.press('Enter');
    await expect(QUESTION(page)).toContainText('main focus');             // resumed, not wiped
    await page.reload();
    await page.click('#restart');
    await expect(page.locator('#q')).not.toHaveClass(/on/);               // first click only arms it
    await page.click('#restart');
    await expect(page.locator('#q')).toHaveClass(/on/);
    await expect(page.locator('.qtext')).toContainText('organization');   // fresh start: back at question 1
    expect(await page.locator('#ctl .opt.sel').count()).toBe(0);           // earlier answers are gone
  });
});
