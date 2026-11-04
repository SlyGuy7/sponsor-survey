// Shared helpers. The real Google Apps Script endpoint is never contacted: every request to it is intercepted.
const CORS = { 'access-control-allow-origin': '*' };

// ctl.mode can be changed between requests: ok | http500 | html200 | okfalse | abort
async function mockEndpoint(page, initial = 'ok') {
  const ctl = { mode: initial, bodies: [] };
  await page.route('https://script.google.com/**', route => {
    ctl.bodies.push(route.request().postData());
    switch (ctl.mode) {
      case 'ok': return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{"ok":true}' });
      case 'http500': return route.fulfill({ status: 500, headers: CORS, body: 'Internal error' });
      case 'html200': return route.fulfill({ status: 200, headers: CORS, contentType: 'text/html', body: '<html>Sign in</html>' });
      case 'okfalse': return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{"ok":false,"error":"x"}' });
      default: return route.abort();
    }
  });
  return ctl;
}

const KIND = () => {
  if (document.querySelector('#ctl .sc')) return 'scale';
  if (document.querySelector('#ctl .pill')) return 'grid';
  if (document.querySelector('#ctl textarea')) return 'text';
  if (document.querySelector('#cn')) return 'contact';
  if (document.querySelector('#ctl input[type=checkbox]')) return 'multi';
  return 'single';
};
const isDone = page => page.evaluate(() => document.querySelector('#done').classList.contains('on'));

// Fill in the current screen the way a person would, without moving on.
async function answerCurrent(page, { pick = 1, email = 'a@b.co', text = 'A test answer' } = {}) {
  const kind = await page.evaluate(KIND);
  if (kind === 'scale') await page.locator('#ctl .sc').nth(3).click();
  else if (kind === 'grid') { const n = await page.locator('#ctl .row').count(); for (let i = 0; i < n; i++) await page.locator('#ctl .row').nth(i).locator('.pill').first().click(); }
  else if (kind === 'text') await page.fill('#ctl textarea', text);
  else if (kind === 'contact') await page.fill('#ce', email);
  else if (kind === 'multi') await page.locator('#ctl .opt').first().click();
  else if (kind === 'single') await page.locator('#ctl .opt').nth(pick).click();
  return kind;
}

// Walk the whole survey. stopAt(kind) can return true to stop early on a screen type.
async function answerAll(page, opts = {}) {
  const seen = [];
  for (let i = 0; i < 80 && !(await isDone(page)); i++) {
    const kind = await answerCurrent(page, opts);
    seen.push(kind);
    await page.waitForTimeout(150);
    await page.click('#next');
    await page.waitForTimeout(300);
  }
  return seen;
}

// Auto-advance (moving on after a tap) is switched off for tests that click "Next" themselves, so they cannot race the timer.
const disableQuick = page => page.addInitScript(() => localStorage.setItem('njit-sponsor-survey-prefs', 'off'));

// Opens the survey and lands on question 1.
async function startSurvey(page, { quick = false } = {}) {
  if (!quick) await disableQuick(page);
  await page.goto('/index.html');
  await page.waitForFunction(() => !document.querySelector('#start').disabled);
  await page.click('#start');
  await page.waitForSelector('.qtext');
}

module.exports = { disableQuick, mockEndpoint, KIND, isDone, answerCurrent, answerAll, startSurvey };
