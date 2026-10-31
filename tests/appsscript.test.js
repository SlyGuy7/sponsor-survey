// Unit tests for apps-script/Code.gs, run with Node's built-in test runner against an in-memory fake of Google's services.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const chain = () => new Proxy(function () {}, { get: (t, p) => (p === 'then' ? undefined : () => chain()), apply: () => chain() });

function load({ existingHeader } = {}) {
  const state = { rows: existingHeader ? [existingHeader, ['old', 'row']] : [], renamed: null, created: 0 };
  const makeSheet = () => ({
    getLastRow: () => state.rows.length,
    appendRow: r => state.rows.push(r),
    getRange: (r, c, n) => ({
      getValues: () => (r === 1 ? [state.rows[0] || []] : state.rows.slice(r - 1, r - 1 + n).map(x => [x[c - 1]])),
      setValues: v => { if (!state.rows.length) state.rows.push(v[0]); else state.rows[0] = v[0]; },
      setBackground: chain, setFontColor: chain, setFontWeight: chain, setFontSize: chain, setWrap: chain,
      setVerticalAlignment: chain, setHorizontalAlignment: chain, setFontFamily: chain, setNumberFormat: chain,
      createFilter: chain, applyRowBanding: chain,
    }),
    setFrozenRows() {}, setFrozenColumns() {}, setRowHeight() {}, setColumnWidth() {},
    getMaxColumns: () => 100, getMaxRows: () => 1000, insertColumnsAfter() {}, insertRowsAfter() {},
    getBandings: () => [], getFilter: () => null, setName: n => { state.renamed = n; },
  });
  let sheet = existingHeader ? makeSheet() : null;
  const ctx = {
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
    SpreadsheetApp: {
      BandingTheme: { LIGHT_GREY: 'g' },
      openById: () => ({
        getSheetByName: () => sheet,
        insertSheet: () => { state.created++; state.rows = []; sheet = makeSheet(); return sheet; },
      }),
    },
    Utilities: { formatDate: () => '2026-10-31 0600' },
    Date, JSON, String, Number, Math,
  };
  vm.createContext(ctx);
  new vm.Script(code).runInContext(ctx);
  const post = o => JSON.parse(ctx.doPost({ postData: { contents: typeof o === 'string' ? o : JSON.stringify(o) } }).t);
  return { ctx, state, post };
}

const base = { submissionId: 's-1', elapsedMs: 60000, hp: '', q1: 'Small company (10 to 99)', q20: '+1 hi', contact_email: 'a@b.co', bogus: 'x' };

test('saves a valid submission under readable headers', () => {
  const { state, post } = load();
  assert.deepStrictEqual(post(base), { ok: true });
  assert.strictEqual(state.rows.length, 2);
  assert.strictEqual(state.rows[0][0], 'Submission ID');
  assert.ok(state.rows[0].includes('Q1. Which best describes your organization?'));
  assert.strictEqual(state.rows[1][0], 's-1');
  assert.ok(state.rows[1][1] instanceof Date);
});

test('ignores unknown fields', () => {
  const { state, post } = load(); post(base);
  assert.ok(!state.rows[0].includes('bogus'));
  assert.ok(!state.rows[1].includes('x'));
});

test('neutralises spreadsheet formula injection', () => {
  const { state, post } = load(); post({ ...base, q17: '=HYPERLINK("http://x","y")' });
  const col = state.rows[0].findIndex(h => h.startsWith('Q17.'));
  assert.strictEqual(state.rows[1][col], '\'=HYPERLINK("http://x","y")');
  const c20 = state.rows[0].findIndex(h => h.startsWith('Q20.'));
  assert.strictEqual(state.rows[1][c20], "'+1 hi");
});

test('a retry with the same submissionId is not saved twice', () => {
  const { state, post } = load(); post(base);
  assert.deepStrictEqual(post(base), { ok: true, duplicate: true });
  assert.strictEqual(state.rows.length, 2);
});

test('bot submissions (honeypot filled, or too fast) get ok but are not saved', () => {
  const { state, post } = load();
  assert.deepStrictEqual(post({ ...base, submissionId: 's-2', hp: 'spam' }), { ok: true });
  assert.deepStrictEqual(post({ ...base, submissionId: 's-3', elapsedMs: 900 }), { ok: true });
  assert.strictEqual(state.rows.length, 0);
});

test('rejects requests with no valid submissionId, and bad JSON', () => {
  const { post } = load();
  assert.strictEqual(post({ q1: 'x' }).ok, false);
  assert.strictEqual(post({ ...base, submissionId: 'x'.repeat(65) }).ok, false);
  assert.strictEqual(post('{{').ok, false);
});

test('caps very long text', () => {
  const { state, post } = load(); post({ ...base, q17: 'a'.repeat(5000) });
  const col = state.rows[0].findIndex(h => h.startsWith('Q17.'));
  assert.ok(String(state.rows[1][col]).length <= 2100);
});

test('an existing tab with a different layout is renamed and replaced', () => {
  const { state, post } = load({ existingHeader: ['submittedAt', 'submissionId', 'q1'] });
  assert.deepStrictEqual(post(base), { ok: true });
  assert.match(state.renamed, /^Responses \(old /);
  assert.strictEqual(state.created, 1);
  assert.strictEqual(state.rows[0][0], 'Submission ID');
});

test('doGet reports the service is up', () => {
  const { ctx } = load();
  assert.deepStrictEqual(JSON.parse(ctx.doGet().t), { ok: true, service: 'sponsor-survey' });
});

test('every survey question has a column', () => {
  const survey = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'survey.json'), 'utf8'));
  const { state, post } = load(); post(base);
  const headers = state.rows[0];
  for (const q of survey.questions.filter(q => q.n)) {
    const prefix = 'Q' + q.n + '.';
    assert.ok(headers.some(h => h.startsWith(prefix)), 'no column for question ' + q.n);
  }
});
