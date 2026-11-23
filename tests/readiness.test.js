// Unit tests for the readiness package: the content file must stay in step with the survey, and the rules must behave.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../assets/readiness.js');
const C = require('../assets/readiness.json');
const S = require('../assets/survey.json');

// Every answer key the survey can send, with the values it can hold.
const KEYS = {};
S.questions.filter(q => q.n).forEach(q => {
  const k = 'q' + q.n;
  if (q.type === 'single' || q.type === 'multi') KEYS[k] = new Set(q.options.map(o => o.label));
  else if (q.type === 'scale') KEYS[k] = new Set(['1', '2', '3', '4', '5', ...(q.extra || [])]);
  else if (q.type === 'grid') q.rows.forEach((_, i) => { KEYS[k + '_r' + (i + 1)] = new Set(q.cols); });
  else KEYS[k] = null;
});

function clauses(c, out = []) {
  if (c.any) c.any.forEach(x => clauses(x, out)); else if (c.all) c.all.forEach(x => clauses(x, out)); else out.push(c);
  return out;
}
const conds = i => clauses(i.when || i);

test('every rule points at a real survey answer and a value that question can give', () => {
  for (const item of C.now) {
    const cs = conds(item);
    assert.ok(cs.some(c => c.gap || c.low || (c.key && (c.in || c.has))), item.id + ' has no condition');
    for (const c of cs) {
      const k = c.gap || c.low || c.key;
      assert.ok(k in KEYS, `${item.id}: unknown answer key ${k}`);
      if (c.gap) for (const v of R.GAP) assert.ok(KEYS[k].has(v), `${item.id}: ${k} cannot be "${v}"`);
      if (c.low) for (const v of R.LOW) assert.ok(KEYS[k].has(v), `${item.id}: ${k} cannot be "${v}"`);
      for (const v of (c.in || []).concat(c.has ? [c.has] : [])) assert.ok(KEYS[k].has(v), `${item.id}: ${k} has no answer "${v}"`);
    }
  }
});

test('items are well formed and ids are unique', () => {
  const ids = [...C.now, ...C.kit].map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const i of C.now) {
    assert.ok(['fix', 'refresh', 'info'].includes(i.level), i.id);
    assert.ok(i.title && i.body && i.source, i.id);
    for (const u of i.unless || []) assert.ok(ids.includes(u), i.id + ' unless ' + u);
  }
  const q19 = S.questions.find(q => q.n === 19);
  const labels = q19.options.map(o => o.label);
  for (const k of C.kit) {
    assert.ok(k.title && k.source, k.id);
    assert.ok(k.picks && k.picks.length, k.id + ' needs picks');
    for (const p of k.picks) assert.ok(labels.includes(p), `${k.id}: question 19 has no answer "${p}"`);
  }
  // every real choice in question 19 leads to a kit item ("None of these" is the only one that does not)
  for (const o of q19.options.filter(o => !o.exclusive)) assert.ok(C.kit.some(k => k.picks.includes(o.label)), 'no kit item for: ' + o.label);
  for (const d of C.dates) assert.match(d.until, /^\d{4}-\d{2}-\d{2}$/);
});

const NOV3 = new Date(2026, 10, 3);
const ids = l => l.map(i => i.id);
// answers with nothing wrong
const GOOD = { q4: '2 to 3', q5_r1: '5', q5_r2: '5', q5_r3: '5', q5_r4: '5', q5_r5: '5', q5_r6: '5', q5_r7: '5', q6: 'I read it closely',
  q8_r1: 'Ready before Sprint 1 (by Sept 28)', q8_r2: 'Ready during Sprint 1 (by Oct 8)', q8_r3: 'Not needed for our project', q11: '1 to 2 hours', q12: 'Weekly or more', q13: 'No', q14: 5, q15: 'About what I expected', q16: 4 };

test('a sponsor with nothing wrong gets no "needs attention" items', () => {
  const r = R.build(C, GOOD, NOV3);
  assert.deepEqual(ids(r.fix), []);
  assert.deepEqual(ids(r.refresh), []);
});

test('each readiness gap shows its own fix, and late counts as a gap', () => {
  const r = R.build(C, { ...GOOD, q8_r2: 'Still not ready', q8_r4: 'Ready after Oct 8', q8_r8: 'Still not ready' }, NOV3);
  assert.deepEqual(ids(r.fix), ['gap-scope-doc', 'gap-data', 'gap-nda']);
});

test('unclear expectations give refreshers, and a refresher steps aside when its fix is already shown', () => {
  const unclear = { ...GOOD, q5_r3: '2', q5_r7: 'I do not recall' };
  assert.deepEqual(ids(R.build(C, unclear, NOV3).refresh), ['rf-scope', 'rf-eval']);
  const both = R.build(C, { ...unclear, q8_r2: 'Still not ready' }, NOV3);
  assert.deepEqual(ids(both.refresh), ['rf-eval']);          // rf-scope hidden: the scope-document fix covers it
  assert.deepEqual(ids(both.fix), ['gap-scope-doc']);
});

test('multi-select and scale answers are matched', () => {
  assert.deepEqual(ids(R.build(C, { ...GOOD, q7: 'Email from the program or professor | I never received this information' }, NOV3).refresh), ['guide-missing']);
  assert.deepEqual(ids(R.build(C, { ...GOOD, q16: 2 }, NOV3).fix), ['unhappy-start']);
  assert.deepEqual(ids(R.build(C, { ...GOOD, q16: 3 }, NOV3).fix), []);
});

test('a skipped question never triggers anything', () => {
  const r = R.build(C, { ...GOOD, q10: undefined }, NOV3);
  assert.ok(!ids(r.fix).includes('blocked-now'));
});

test('dates: only those still ahead are listed', () => {
  assert.equal(R.build(C, GOOD, NOV3).dates.length, 6);
  assert.equal(R.build(C, GOOD, new Date(2026, 10, 9)).dates[0].title, 'Sprint 4');
  assert.equal(R.build(C, GOOD, new Date(2026, 11, 13)).dates.length, 1);
  assert.equal(R.build(C, GOOD, new Date(2026, 11, 14)).dates.length, 0);
});

test('the new-sponsor kit puts what the sponsor picked first', () => {
  const r = R.build(C, { q19: 'A week-by-week checklist for Sprint 1, up to the Oct 8 readiness package | A welcome post in your team\'s Discord channel' }, NOV3);
  assert.deepEqual(ids(r.kit).slice(0, 2), ['kit-sprint1', 'kit-welcome']);
  assert.deepEqual(r.kit.filter(k => k.top).map(k => k.id), ['kit-sprint1', 'kit-welcome']);
  // a named Operations contact leads to the "who to contact" card; "None of these" keeps the default order
  assert.equal(ids(R.build(C, { q19: 'A named Operations contact and instructions for getting help' }, NOV3).kit)[0], 'kit-contacts');
  const none = R.build(C, { q19: 'None of these' }, NOV3);
  assert.deepEqual(ids(none.kit), C.kit.map(k => k.id));
  assert.equal(none.kit.some(k => k.top), false);
});

test('trouble getting help from Operations gives the "who to contact" fix', () => {
  for (const v of ['I needed help but didn’t know whom to contact', 1, 2]) assert.deepEqual(ids(R.build(C, { ...GOOD, q14: v }, NOV3).fix), ['help-gap']);
  for (const v of [3, 4, 5, 'I didn’t need help']) assert.deepEqual(ids(R.build(C, { ...GOOD, q14: v }, NOV3).fix), []);
});

test('contact details can never reach the package', () => {
  const r = R.build(C, { ...GOOD, contact_name: 'Pat Example', contact_org: 'Acme', contact_email: 'pat@acme.test', q8_r2: 'Still not ready' }, NOV3);
  const text = JSON.stringify(r);
  for (const s of ['Pat Example', 'Acme', 'pat@acme.test']) assert.ok(!text.includes(s), s);
});

test('a kit link carries only option codes, and decoding gives back the same kit', () => {
  const a = { ...GOOD, q4: '2 to 3', q5_r3: 'I do not recall', q8_r2: 'Still not ready', q9: 'Not sure', q14: 'I didn’t need help', q16: '2', q18: 'Too early to say', q19: 'A pre-kickoff checklist of what to prepare (scope, data, access, contact)', contact_name: 'Pat Example', contact_email: 'pat@acme.test', q20: 'free text here' };
  const code = R.encode(S.questions, a);
  assert.match(code, /^2_[0-9a-zx._-]+$/);
  for (const s of ['Pat', 'acme', 'free text', 'Still']) assert.ok(!code.includes(s), s);
  const back = R.decode(S.questions, code);
  for (const k of ['q4', 'q5_r3', 'q8_r2', 'q9', 'q14', 'q16', 'q18', 'q19']) assert.equal(back[k], String(a[k]), k);
  assert.equal(back.contact_email, undefined);
  assert.equal(back.q20, undefined);
  assert.deepEqual(ids(R.build(C, back, NOV3).fix), ids(R.build(C, a, NOV3).fix));
});

test('a damaged kit link never throws and never invents answers', () => {
  for (const bad of ['', 'garbage', '3_4-1', '1_4-1', '2_', '2_99-1', '2_4-99', '2_4-', '2_5-zzzz', '2_14-x9', '2_16-7', '2_19-99.-1', null, undefined]) {
    assert.doesNotThrow(() => R.decode(S.questions, bad), String(bad));
    assert.deepEqual(R.decode(S.questions, bad), {}, String(bad));
  }
});

test('how likely a sponsor is to sponsor again changes the kit, and never mentions money', () => {
  const low = R.build(C, { ...GOOD, q18: '2' }, NOV3), high = R.build(C, { ...GOOD, q18: '5' }, NOV3);
  assert.ok(ids(low.refresh).includes('next-easier') && !ids(low.info).includes('next-open'));
  assert.ok(ids(high.info).includes('next-open') && !ids(high.refresh).includes('next-easier'));
  assert.ok(!/\$|contribution|donat|foundation/i.test(JSON.stringify(C)), 'the kit must not mention money');
});

test('only Dr. Eljabiri\'s email is listed as a contact', () => {
  const emails = C.contacts.map(c => c.email).filter(Boolean);
  assert.deepEqual(emails, ['osama.eljabiri@njit.edu']);
});

test('links made before the question changes (version 1_) are refused, not read against the new questions', () => {
  assert.equal(R.VERSION, '2_');
  assert.deepEqual(R.decode(S.questions, '1_1-3_4-0_5---1----_8--3----2-_14-x1_16-4_18-1.5_19-x0'), {});
});
