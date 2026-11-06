const { test, expect } = require('@playwright/test');
const { mockEndpoint, startSurvey, answerAll, answerCurrent } = require('./helpers');

test('welcome shows the five parts as a staircase', async ({ page }) => {
  await mockEndpoint(page);
  await page.goto('/index.html');
  await expect(page.locator('.stair li')).toHaveCount(5);
  await expect(page.locator('.stair')).toContainText('Readiness kit');
  await expect(page.locator('.chip')).toHaveCount(0);
});

test('each part has its own colour, icon and a banner on its first question only', async ({ page }) => {
  await mockEndpoint(page);
  await startSurvey(page);
  await expect(page.locator('#q')).toHaveAttribute('data-part', 'A');
  await expect(page.locator('.part-banner')).toContainText('About you and your organization');
  await expect(page.locator('#partIcon svg')).toHaveCount(1);
  const colourA = await page.evaluate(() => getComputedStyle(document.querySelector('.rail')).backgroundColor);
  await answerCurrent(page); await page.waitForTimeout(150); await page.click('#next');
  await expect(page.locator('.qtext')).toContainText('main focus');
  await expect(page.locator('.part-banner')).toHaveCount(0);          // second question of part A: no banner
  // walk to the first question of part B
  for (let i = 0; i < 12 && (await page.locator('#q').getAttribute('data-part')) !== 'B'; i++) {
    await answerCurrent(page); await page.waitForTimeout(150); await page.click('#next'); await page.waitForTimeout(300);
  }
  await expect(page.locator('#q')).toHaveAttribute('data-part', 'B');
  await expect(page.locator('.part-banner')).toContainText('Before the project started');
  await page.waitForTimeout(700);                                       // let the rail colour transition finish
  const colourB = await page.evaluate(() => getComputedStyle(document.querySelector('.rail')).backgroundColor);
  expect(colourB).not.toBe(colourA);
});

test('finishing a part and passing halfway are celebrated', async ({ page }) => {
  await mockEndpoint(page);
  await startSurvey(page);
  const seen = [];
  for (let i = 0; i < 40; i++) {
    await answerCurrent(page, { pick: 1 }); await page.waitForTimeout(120); await page.click('#next'); await page.waitForTimeout(350);
    const t = (await page.locator('#toast').textContent()).trim();
    if (t) seen.push(t);
    if (await page.locator('.qtext').textContent().then(x => /Overall, how satisfied/.test(x))) break;
  }
  expect(seen.some(t => /Part A complete/.test(t))).toBe(true);
  expect(seen.some(t => /Part B complete/.test(t))).toBe(true);
  expect(seen.some(t => /Halfway there/.test(t))).toBe(true);          // after question 10 of 20
  await expect(page.locator('#toast')).toHaveAttribute('role', 'status');
});

test.describe('thank-you page', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });

  test('recap, share link, download and print-ready answers', async ({ page }) => {
    test.setTimeout(120000);
    await mockEndpoint(page);
    await startSurvey(page);
    await answerAll(page, { pick: 1, email: 'recap@example.com', text: 'Nothing to add' });
    await expect(page.locator('#doneH')).toContainText('Thank');
    await expect(page.locator('#recapParts li')).toHaveCount(6);
    await expect(page.locator('#recapParts li').first()).toContainText('4 of 4');
    await expect(page.locator('#afterRow')).toBeVisible();

    await page.click('#share');
    await expect(page.locator('#share')).toHaveText('Link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://slyguy7.github.io/sponsor-survey/');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    expect(download.suggestedFilename()).toBe('sponsor-survey-my-answers.txt');
    const text = require('fs').readFileSync(await download.path(), 'utf8');
    expect(text).toContain('Q1. Which best describes your organization?');
    expect(text).toContain('Nothing to add');
    expect(text).toContain('recap@example.com');          // contact details the person typed are in their own copy

    await page.click('#mine summary');
    await expect(page.locator('#mineBody dt').first()).toContainText('Q1.');
    // print layout: only the heading and the answers remain
    await page.emulateMedia({ media: 'print' });
    await page.locator('#mine').evaluate(el => { el.open = true; });
    await expect(page.locator('#mineBody')).toBeVisible();
    await expect(page.locator('#afterRow')).toBeHidden();
    await expect(page.locator('#recapParts')).toBeHidden();
  });

  test('nothing is offered until delivery is confirmed', async ({ page }) => {
    await mockEndpoint(page, 'http500');
    await startSurvey(page);
    await answerAll(page);
    await expect(page.locator('#doneH')).toHaveText('We could not confirm delivery');
    await expect(page.locator('#afterRow')).toBeHidden();
    await expect(page.locator('#recapParts')).toBeHidden();
    await expect(page.locator('#mine')).toBeHidden();
  });
});

test('selection pop-in animation is off when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockEndpoint(page);
  await startSurvey(page);
  await page.locator('#ctl .opt').first().click();
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.opt.sel .key')).animationDuration);
  expect(parseFloat(dur)).toBeLessThan(0.01);
});
