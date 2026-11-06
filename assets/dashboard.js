(() => {
'use strict';

const $ = s => document.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
  }
  kids.flat().forEach(c => { if (c !== null && c !== undefined) e.append(c); });
  return e;
};

let SURVEY = null, EP = '', KEY = '', ROWS = [], REMEMBER = false;

// The key is only kept in this browser if the person ticks "Remember on this device", and only once the server accepts it.
const STORE = 'njit-sponsor-survey-dashboard-key';
const saved = {
  get() { try { return localStorage.getItem(STORE) || ''; } catch (e) { return ''; } },
  set(k) { try { localStorage.setItem(STORE, k); } catch (e) { /* private window: simply not remembered */ } },
  clear() { try { localStorage.removeItem(STORE); } catch (e) { /* nothing to clear */ } },
};
const syncForget = () => { $('#forget').hidden = !saved.get(); };

const keyOf = q => q.n ? 'q' + q.n : (q.bonus === 1 ? 'contact' : q.bonus === 2 ? 'quote_ok' : 'results_ok');
const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const pct = (n, t) => t ? Math.round(100 * n / t) : 0;

function msg(text, bad) {
  const m = $('#msg'); m.textContent = text; m.hidden = !text; m.classList.toggle('bad', !!bad);
}

/* ---------- data ---------- */
function clearResults() {
  ROWS = [];
  ['#tiles', '#glanceCards', '#jump', '#parts'].forEach(s => $(s).replaceChildren());
  ['#out', '#glance', '#jump', '#refresh', '#csv'].forEach(s => { $(s).hidden = true; });
  $('#updated').textContent = 'Private page for the Operations team';
}
async function load() {
  const key = KEY;
  msg('Loading results…');
  try {
    if (!SURVEY) { const r = await fetch('assets/survey.json', { cache: 'no-cache' }); SURVEY = await r.json(); SURVEY.questions.forEach(q => { q.key = keyOf(q); }); }
    if (!EP) {
      const t = await (await fetch('assets/app.js', { cache: 'no-cache' })).text();   // the survey page and this page always use the same script address
      const m = t.match(/const ENDPOINT = '([^']+)'/); if (!m) throw new Error('endpoint');
      EP = m[1];
    }
    const res = await fetch(EP + '?action=summary&key=' + encodeURIComponent(key));
    const out = await res.json();
    if (key !== KEY) return;                              // "Forget this device" was pressed while this was loading
    if (!out || out.ok !== true) {
      if (out && out.error === 'not allowed') {
        if (saved.get() === key) saved.clear();           // a replaced key should not be tried again
        KEY = ''; REMEMBER = false; clearResults(); syncForget(); $('#gate').hidden = false;
        msg('That key was not accepted. Run createDashboardKey in Apps Script again and paste the new key.', true);
        return;
      }
      throw new Error((out && out.error) || 'failed');
    }
    if (REMEMBER) { saved.set(key); REMEMBER = false; $('#rememberKey').checked = false; }
    ROWS = out.rows || [];
    $('#gate').hidden = true; msg(''); syncForget();
    render();
  } catch (e) {
    if (key !== KEY) return;
    msg('Could not load the results. Check your connection and try again.', true);
    if (key && saved.get() === key) $('#refresh').hidden = false;   // the key form is hidden in this case, so offer a way to retry
  }
}

/* ---------- charts built from plain elements ---------- */
function barList(items, total) {
  return el('ul', { class: 'bars' }, items.map(([label, n]) => {
    const bar = el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i'));
    bar.firstChild.style.setProperty('--w', pct(n, total) + '%');
    return el('li', {}, el('span', { text: label }), bar, el('span', { class: 'val', text: n + ' · ' + pct(n, total) + '%' }));
  }));
}
function tally(values, order) {
  const m = new Map(order.map(o => [o, 0]));
  values.forEach(v => m.set(v, (m.get(v) || 0) + 1));
  return [...m.entries()];
}
function card(q, body, metaText, cls) {
  const h = el('h3', { text: (q.n ? 'Q' + q.n + '. ' : '') + q.text });
  return el('article', { class: 'card q-card' + (cls ? ' ' + cls : '') }, h, el('p', { class: 'meta', text: metaText }), body);
}

function singleCard(q) {
  const vals = ROWS.map(r => r[q.key]).filter(has).map(String);
  const body = [barList(tally(vals, q.options.map(o => o.label)), vals.length)];
  const others = ROWS.map(r => r[q.key + '_other']).filter(has);
  if (others.length) body.push(el('p', { class: 'meta', text: 'Typed under “Other”: ' + others.join('; ') }));
  return card(q, body, plural(vals.length, 'answer'));
}
function multiCard(q) {
  const vals = ROWS.flatMap(r => has(r[q.key]) ? String(r[q.key]).split(' | ') : []);
  const people = ROWS.filter(r => has(r[q.key])).length;
  const body = [barList(tally(vals, q.options.map(o => o.label)), people)];
  const others = ROWS.map(r => r[q.key + '_other']).filter(has);
  if (others.length) body.push(el('p', { class: 'meta', text: 'Typed under “Other”: ' + others.join('; ') }));
  return card(q, body, plural(people, 'person') + ' (people could pick several)');
}
function scaleCard(q) {
  const vals = ROWS.map(r => r[q.key]).filter(has);
  const nums = vals.map(Number).filter(n => n >= 1 && n <= 5);
  const order = ['1', '2', '3', '4', '5', ...(q.extra || [])];
  const body = [barList(tally(vals.map(String), order), vals.length)];
  if (nums.length) body.push(el('p', { class: 'avg', text: 'Average: ' + (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) + ' of 5 (1 = ' + q.low + ', 5 = ' + q.high + ')' }));
  return card(q, body, plural(vals.length, 'answer'));
}
function gridCard(q) {
  const n = ROWS.length;
  const table = el('table', { class: 'heat' }, el('caption', { text: 'Number of sponsors choosing each answer' }),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, el('span', { class: 'vh', text: 'Item' })), q.cols.map(c => el('th', { scope: 'col', text: c })))),
    el('tbody', {}, q.rows.map((r, i) => {
      const vals = ROWS.map(x => x[q.key + '_r' + (i + 1)]).filter(has).map(String);
      return el('tr', {}, el('th', { scope: 'row', text: r }), q.cols.map(c => {
        const k = vals.filter(v => v === c).length;
        const td = el('td', { text: String(k), 'aria-label': c + ': ' + k });
        td.style.setProperty('--heat', n ? k / n : 0);
        return td;
      }));
    })));
  const wrap = el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Answer counts for question ' + q.n + '; scrolls sideways on small screens' }, table);
  return card(q, [wrap], plural(n, 'response') + '; darker cells mean more sponsors', 'wide');
}
function textCard(q) {
  const items = ROWS.filter(r => has(r[q.key])).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  const list = el('ul', { class: 'answers' });
  const box = el('input', { type: 'checkbox', id: 'f' + q.key });
  const draw = () => {
    list.replaceChildren();
    const shown = box.checked ? items.filter(r => r.quote_ok === 'Yes') : items;
    if (!shown.length) list.append(el('li', { class: 'empty', text: items.length ? 'No answers with permission to quote.' : 'No answers yet.' }));
    shown.forEach(r => list.append(el('li', { class: r.quote_ok === 'Yes' ? 'yes' : '' }, el('p', { text: String(r[q.key]) }),
      el('span', { class: 'badge', text: r.quote_ok === 'Yes' ? 'OK to quote' : r.quote_ok === 'No' ? 'Do not quote' : 'No quote answer' }))));
  };
  box.addEventListener('change', draw); draw();
  const scroller = el('div', { class: 'scroller', tabindex: '0', role: 'region', 'aria-label': 'Answers to question ' + q.n }, list);
  return card(q, [el('label', { class: 'filter', for: 'f' + q.key }, box, 'Only answers we may quote'), scroller], plural(items.length, 'answer'));
}

/* ---------- at a glance: the same answers, ranked so the findings stand out ---------- */
const byNumber = n => SURVEY.questions.find(q => q.n === n);
// Ranks a grid question's rows by how many people gave one of the `hit` answers, leaving out answers in `skip`.
function rankRows(q, hit, skip) {
  return q.rows.map((label, i) => {
    const vals = ROWS.map(r => r[q.key + '_r' + (i + 1)]).filter(has).map(String).filter(v => !skip.includes(v));
    return { label, n: vals.filter(v => hit.includes(v)).length, of: vals.length };
  }).filter(x => x.of > 0).sort((a, b) => pct(b.n, b.of) - pct(a.n, a.of) || b.n - a.n).slice(0, 5);
}
function rankList(items) {
  return el('ol', { class: 'bars' }, items.map(x => {
    const bar = el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i'));
    bar.firstChild.style.setProperty('--w', pct(x.n, x.of) + '%');
    return el('li', {}, el('span', { text: x.label }), bar, el('span', { class: 'val', text: x.n + ' of ' + x.of + ' · ' + pct(x.n, x.of) + '%' }));
  }));
}
function glanceCard(title, meta, items, extra) {
  if (!items.length) return null;
  return el('article', { class: 'card q-card' }, el('h3', { text: title }), el('p', { class: 'meta', text: meta }), rankList(items), extra || null);
}
// Ranks the options of a "choose up to N" question by how many sponsors picked each, leaving out stand-alone answers such as "None of these".
function rankPicks(q) {
  const answers = ROWS.map(r => r[q.key]).filter(has).map(v => String(v).split(' | '));
  return q.options.filter(o => !o.exclusive).map(o => ({ label: o.label, n: answers.filter(a => a.includes(o.label)).length, of: answers.length }))
    .filter(x => x.of > 0 && x.n > 0).sort((a, b) => pct(b.n, b.of) - pct(a.n, a.of) || b.n - a.n).slice(0, 5);
}
// The most common answer to question 9, leaving out the options that skip ahead ("No significant delay", "Not sure").
function topWait() {
  const q = byNumber(9); if (!q) return null;
  const none = q.options.filter(o => o.skipTo).map(o => o.label);
  const counts = tally(ROWS.map(r => r.q9).filter(has).map(String).filter(v => !none.includes(v)), []);
  const max = Math.max(0, ...counts.map(c => c[1]));
  if (!max) return null;
  return el('p', { class: 'avg', text: 'Most common longest wait: ' + counts.filter(c => c[1] === max).map(c => c[0]).join(' / ') + ' (' + plural(max, 'sponsor') + ')' });
}
function renderGlance() {
  const n = ROWS.length;
  const ready = byNumber(8), clear = byNumber(5), wanted = byNumber(18);
  const cards = [
    ready && glanceCard('Where readiness slipped', 'Ready after Oct 8 or still not ready. “Not needed” is left out.', rankRows(ready, ['Ready after Oct 8', 'Still not ready'], ['Not needed for our project']), topWait()),
    clear && glanceCard('Least clear expectations', 'Rated 1 or 2, or “I do not recall”.', rankRows(clear, ['1', '2', 'I do not recall'], [])),
    wanted && glanceCard('Most wanted before kickoff', 'Each sponsor could pick up to two. “None of these” is left out.', rankPicks(wanted)),
  ].filter(Boolean);
  $('#glanceCards').replaceChildren(...cards);
  $('#glanceNote').textContent = n < 5 ? 'Only ' + plural(n, 'response') + ' so far, so treat these as early signals. Top five in each list.' : 'Top five in each list, highest share first.';
  $('#glance').hidden = !cards.length;
}

function tile(n, l, extra) { return el('div', { class: 'tile' }, el('div', { class: 'n', text: n }), el('div', { class: 'l', text: l }), extra); }
function sparkline() {
  const byDay = new Map();
  ROWS.forEach(r => { if (has(r.receivedAt)) { const d = new Date(r.receivedAt).toLocaleDateString(); byDay.set(d, (byDay.get(d) || 0) + 1); } });
  const pts = [...byDay.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0])).map(e => e[1]);
  if (pts.length < 2) return null;
  const max = Math.max(...pts), w = 160, h = 36;
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Responses per day: ' + pts.join(', '));
  const line = document.createElementNS(SVGNS, 'polyline');
  line.setAttribute('points', pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - 4 - (v / max) * (h - 8)}`).join(' '));
  svg.append(line); return svg;
}

function render() {
  const n = ROWS.length;
  $('#out').hidden = false; $('#refresh').hidden = false; $('#csv').hidden = n === 0;
  $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + plural(n, 'response');
  const secs = ROWS.map(r => Number(r.seconds)).filter(x => x > 0).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : 0;
  const want = ROWS.filter(r => r.results_ok === 'Yes').length, ok = ROWS.filter(r => r.quote_ok === 'Yes').length;
  const latest = ROWS.map(r => r.receivedAt).filter(has).sort().pop();
  const sat = ROWS.map(r => Number(r.q16)).filter(x => x >= 1 && x <= 5);
  const tiles = $('#tiles'); tiles.replaceChildren(
    tile(String(n), 'Responses', sparkline()),
    tile(sat.length ? (sat.reduce((a, b) => a + b, 0) / sat.length).toFixed(1) + ' / 5' : '–', 'Satisfaction with how the project started'),
    tile(median ? (median / 60).toFixed(1) + ' min' : '–', 'Median time to finish'),
    tile(latest ? new Date(latest).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '–', 'Latest response'),
    tile(pct(want, n) + '%', 'Want a summary of the results (' + want + ')'),
    tile(pct(ok, n) + '%', 'Said we may quote them (' + ok + ')'));
  const parts = $('#parts'); parts.replaceChildren();
  $('#glance').hidden = true; $('#jump').hidden = true;
  if (!n) { parts.append(el('p', { class: 'msg', text: 'No responses yet. This page fills in as sponsors finish the survey.' })); return; }
  renderGlance();
  $('#jump').replaceChildren(...SURVEY.parts.filter(p => SURVEY.questions.some(q => q.part === p.id && q.type !== 'contact')).map(p => el('a', { href: '#p' + p.id, text: p.label })));
  $('#jump').hidden = false;
  SURVEY.parts.forEach(p => {
    const qs = SURVEY.questions.filter(q => q.part === p.id && q.type !== 'contact');
    if (!qs.length) return;
    const cards = qs.map(q => ({ single: singleCard, multi: multiCard, scale: scaleCard, grid: gridCard, text: textCard })[q.type](q));
    parts.append(el('section', { class: 'part', 'aria-labelledby': 'p' + p.id }, el('h2', { id: 'p' + p.id, text: p.label + ': ' + p.name }), el('p', { class: 'note', text: p.note }), el('div', { class: 'cards' }, cards)));
  });
}

/* ---------- CSV export (answers only, contact details are never in this data) ---------- */
function labelFor(k) {
  if (k === 'receivedAt') return 'Received'; if (k === 'seconds') return 'Seconds taken';
  const m = k.match(/^q(\d+)(?:_r(\d+)|_other)?$/);
  if (m) { const q = SURVEY.questions.find(x => x.n === +m[1]); if (q) return 'Q' + q.n + (m[2] ? '. ' + q.rows[+m[2] - 1] : k.endsWith('_other') ? ' other' : '. ' + q.text); }
  return k;
}
const cell = v => { let s = String(v === undefined || v === null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function downloadCsv() {
  const keys = ['receivedAt', 'seconds', ...SURVEY.questions.flatMap(q => q.type === 'contact' ? [] : q.type === 'grid' ? q.rows.map((_, i) => q.key + '_r' + (i + 1)) : (q.options && q.options.some(o => o.other) ? [q.key, q.key + '_other'] : [q.key]))];
  const lines = [keys.map(k => cell(labelFor(k))).join(','), ...ROWS.map(r => keys.map(k => cell(r[k])).join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
  a.download = 'sponsor-survey-results.csv';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- start ---------- */
$('#gateForm').addEventListener('submit', e => { e.preventDefault(); KEY = $('#keyIn').value.trim(); $('#keyIn').value = ''; REMEMBER = $('#rememberKey').checked; if (KEY) load(); });
$('#refresh').addEventListener('click', load);
$('#csv').addEventListener('click', downloadCsv);
$('#forget').addEventListener('click', () => {
  saved.clear(); KEY = ''; REMEMBER = false;
  clearResults(); syncForget(); $('#gate').hidden = false;
  msg('This device has forgotten the key.');
  $('#keyIn').focus();
});
syncForget();
const m = location.hash.match(/key=([^&]+)/);
if (m) { KEY = decodeURIComponent(m[1]); history.replaceState(null, '', location.pathname); load(); }
else if (saved.get()) { KEY = saved.get(); $('#gate').hidden = true; load(); }
})();
