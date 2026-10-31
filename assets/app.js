(() => {
'use strict';

/* ---------- configuration ---------- */
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwBxJbu22vcLFs9wwNe2_FlNMnvDnc9Lntr7zteddkXoKNfT--q7UE7JIuWLiiOO3epng/exec';
const STORE = 'njit-sponsor-survey-v2';
const PREF = 'njit-sponsor-survey-prefs';
const TTL = 24 * 60 * 60 * 1000;          // saved progress expires after 24 hours
const SEND_TIMEOUT = 20000;
const AUTO_MS = 480;

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const esc = s => String(s).replace(/[&<>"'`]/g, c => ESC[c]);
const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
const coarse = () => matchMedia('(pointer:coarse)').matches;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const canStore = safe(() => { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }, false);
const welcome = $('#welcome'), qs = $('#q'), done = $('#done'), stage = $('#stage'), wrap = $('#wrap');

let DATA, PARTS, QS, SCREENS;
let ans = {}, pos = -1, hist = [], busy = false, sid = null, autoT = null, started = 0;
let lastPayload = null, sending = false, lastInput = 'key';
let quick = safe(() => localStorage.getItem(PREF) !== 'off', true);

/* ---------- storage (contact details are never written to disk) ---------- */
const persistable = () => { const { contact, ...rest } = ans; return rest; };
const save = () => canStore && safe(() => localStorage.setItem(STORE, JSON.stringify({ ans: persistable(), pos, hist, sid, started, t: Date.now() })));
const wipe = () => safe(() => localStorage.removeItem(STORE));
const load = () => {
  const s = safe(() => JSON.parse(localStorage.getItem(STORE) || 'null'), null);
  if (!s) return null;
  if (!s.t || Date.now() - s.t > TTL) { wipe(); return null; }
  return s;
};
const uid = () => 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

/* ---------- survey logic ---------- */
const keyOf = q => q.n ? 'q' + q.n : (q.bonus === 1 ? 'contact' : q.bonus === 2 ? 'quote_ok' : 'results_ok');
const partOf = id => PARTS.find(p => p.id === id);
const optOf = (q, a) => q.options && a && q.options.find(o => o.label === a.v);

// A question is skipped when an earlier answer chose an option with skipTo > this question's number.
function skipped(q) {
  if (!q.n) return false;
  return QS.some(p => p.n && p.n < q.n && p.type === 'single' && ans[p.key] && (() => {
    const o = optOf(p, ans[p.key]);
    return o && o.skipTo && q.n < o.skipTo;
  })());
}
function qAnswered(q) {
  const a = ans[q.key]; if (a === undefined || a === null) return false;
  if (q.type === 'grid') return q.rows.every((_, i) => a[i] !== undefined);
  if (q.type === 'multi') return !!(a.v && a.v.length);
  if (q.type === 'contact') return Object.values(a).some(v => String(v).trim());
  if (q.type === 'text') return !!String(a).trim();
  if (q.type === 'single') return !!a.v;
  return a !== '';
}
const screenPart = () => { const s = SCREENS[pos]; return s ? (s.kind === 'intro' ? s.part.id : s.q.part) : null; };
const partHasQuestions = id => QS.some(q => q.part === id && !skipped(q));
const skipScreen = s => s.kind === 'q' ? skipped(s.q) : !partHasQuestions(s.part.id);
const isLast = () => !SCREENS.slice(pos + 1).some(s => s.kind === 'q' && !skipped(s.q));
const numbered = () => QS.filter(q => q.n && !skipped(q));
const total = () => QS.filter(q => q.n).length;

function progress() {
  const segs = $$('.seg');
  PARTS.forEach((p, i) => {
    const list = QS.filter(q => q.part === p.id && !skipped(q));
    const n = list.filter(qAnswered).length;
    segs[i].style.setProperty('--f', list.length ? n / list.length : 0);
    segs[i].classList.toggle('cur', screenPart() === p.id);
  });
  const all = numbered(), got = all.filter(qAnswered).length;
  const bar = $('#progress');
  bar.value = Math.round(100 * got / all.length);
  bar.setAttribute('aria-valuetext', got + ' of ' + all.length + ' questions answered');
}

/* ---------- rendering ---------- */
function buildProg() {
  $('#prog').innerHTML = PARTS.map(p => `<div class="seg"><i></i></div>`).join('');
}
function nextLabel(q) {
  return isLast() ? 'Submit &check;' : (q && q.optional && !qAnswered(q) ? 'Skip &rarr;' : 'Next &rarr;');
}
function hintFor(q) {
  if (q.type === 'text') return 'Ctrl + Enter to continue';
  if (!quick) return 'Enter to continue';
  if (q.type === 'single' || q.type === 'multi') return `Keys 1–${Math.min(9, q.options.length)} choose, Enter continues`;
  if (q.type === 'scale') return `Keys 1–${Math.min(9, 5 + (q.extra || []).length)} choose, Enter continues`;
  return 'Enter to continue';
}
function render() {
  const s = SCREENS[pos], part = partOf(screenPart());
  clearTimeout(autoT);
  $('#partName').textContent = part.label;
  $('#partTitle').textContent = part.name;
  $('#back').disabled = false;
  qs.classList.toggle('intro', s.kind === 'intro');
  let html, heading;
  if (s.kind === 'intro') {
    $('#bignum').textContent = part.id === 'X' ? '+' : part.id;
    $('#railCount').textContent = part.id === 'X' ? 'Optional' : 'Part ' + (PARTS.indexOf(part) + 1) + ' of ' + PARTS.filter(p => p.id !== 'X').length;
    html = `<div class="intro-body in"><h1 class="intro-h" id="qt" tabindex="-1" aria-describedby="railCount">${esc(part.name)}</h1><p>${esc(part.note)}</p></div>`;
    $('#next').innerHTML = 'Let&rsquo;s go &rarr;';
    $('#hint').textContent = 'Enter to continue';
    heading = part.name;
  } else {
    const q = s.q;
    $('#bignum').textContent = q.n ? String(q.n).padStart(2, '0') : '+' + q.bonus;
    $('#railCount').textContent = q.n ? 'Question ' + q.n + ' of ' + total() : 'Optional';
    html = `<div class="in"><h1 class="qtext" id="qt" tabindex="-1" aria-describedby="railCount">${esc(q.text)}</h1><p class="qhint" id="qh">${esc(q.hint || (q.optional ? 'Optional.' : ''))}</p><div id="ctl"></div><div class="err" id="err" role="alert"></div></div>`;
    $('#next').innerHTML = nextLabel(q);
    $('#hint').textContent = hintFor(q);
    heading = q.text;
  }
  stage.innerHTML = html; wrap.scrollTop = 0;
  if (s.kind === 'q') drawCtl(s.q);
  progress(); save();
  document.title = (s.kind === 'q' && s.q.n ? 'Question ' + s.q.n + ' of ' + total() : part.name) + ' – Sponsor Experience Survey';
  // focus: text fields on devices with a keyboard, otherwise the heading so assistive technology reads it
  const field = s.kind === 'q' && (s.q.type === 'text' || s.q.type === 'contact') && !coarse() ? stage.querySelector('input,textarea') : null;
  setTimeout(() => (field || $('#qt')).focus({ preventScroll: true }), 60);
}

function drawCtl(q) {
  const c = $('#ctl'), a = ans[q.key];
  if (q.type === 'single' || q.type === 'multi') {
    const multi = q.type === 'multi', cur = multi ? (a && a.v || []) : (a && a.v);
    c.innerHTML = `<fieldset class="opts" aria-labelledby="qt" aria-describedby="qh">` + q.options.map((o, i) => {
      const sel = multi ? cur.includes(o.label) : cur === o.label;
      return `<label class="opt${multi ? ' multi' : ''}${sel ? ' sel' : ''}"><input class="vh" type="${multi ? 'checkbox' : 'radio'}" name="${q.key}" value="${i}"${sel ? ' checked' : ''}><span class="key" aria-hidden="true">${i + 1}</span><span>${esc(o.label)}</span></label>` +
        (o.other ? `<div class="other-in${sel ? ' on' : ''}" data-o="${i}"><input class="txt" type="text" aria-label="Other, please specify" placeholder="Please specify" maxlength="200" value="${esc((a && a.other) || '')}"></div>` : '');
    }).join('') + `</fieldset>`;
  } else if (q.type === 'scale') {
    const ex = q.extra || [];
    c.innerHTML = `<fieldset class="scale-set" aria-labelledby="qt" aria-describedby="scaleLbl"><div class="scale">` +
      [1, 2, 3, 4, 5].map(n => `<label class="sc${a === n ? ' sel' : ''}"><input class="vh" type="radio" name="${q.key}" value="${n}"${a === n ? ' checked' : ''}><span>${n}</span></label>`).join('') +
      `</div><div class="scale-lbl" id="scaleLbl"><span>1 = ${esc(q.low || '')}</span><span>5 = ${esc(q.high || '')}</span></div>` +
      (ex.length ? `<div class="opts extra">` + ex.map((e, i) => `<label class="opt${a === e ? ' sel' : ''}"><input class="vh" type="radio" name="${q.key}" value="${esc(e)}"${a === e ? ' checked' : ''}><span class="key" aria-hidden="true">${6 + i}</span><span>${esc(e)}</span></label>`).join('') + `</div>` : '') + `</fieldset>`;
  } else if (q.type === 'grid') {
    const nums = q.cols.every(x => /^\d$|Not sure/.test(x));
    c.className = 'grid';
    c.innerHTML = q.rows.map((r, ri) => `<fieldset class="row${a && a[ri] !== undefined ? ' done' : ''}" data-r="${ri}"><legend>${esc(r)}</legend><i aria-hidden="true">&check;</i><div class="pills${nums ? ' nums' : ''}">` +
      q.cols.map((cl, ci) => `<label class="pill${a && a[ri] === cl ? ' sel' : ''}"><input class="vh" type="radio" name="${q.key}_${ri}" value="${ci}"${a && a[ri] === cl ? ' checked' : ''}><span>${esc(cl)}</span></label>`).join('') + `</div></fieldset>`).join('');
  } else if (q.type === 'text') {
    c.innerHTML = `<textarea class="area" id="ta" maxlength="2000" aria-labelledby="qt" aria-describedby="qh cc-wrap" placeholder="Type your answer here">${esc(a || '')}</textarea><div class="count" id="cc-wrap"><span id="cc">${(a || '').length}</span> / 2000 characters</div>`;
  } else if (q.type === 'contact') {
    const v = a || {};
    c.className = 'contact';
    c.innerHTML = `<label>Name<input class="txt" id="cn" type="text" autocomplete="name" value="${esc(v.name || '')}" maxlength="120"></label><label>Organization<input class="txt" id="co" type="text" autocomplete="organization" value="${esc(v.org || '')}" maxlength="160"></label><label>Email<input class="txt" id="ce" type="email" inputmode="email" autocomplete="email" enterkeyhint="done" value="${esc(v.email || '')}" maxlength="160" aria-describedby="err"></label>`;
  }
}

/* ---------- answering (all in place: no re-rendering, so focus is never lost) ---------- */
function syncOpts(q) {
  const a = ans[q.key] || {}, multi = q.type === 'multi';
  $$('#ctl .opt').forEach((lab, i) => {
    const o = q.options[i]; const sel = multi ? (a.v || []).includes(o.label) : a.v === o.label;
    lab.classList.toggle('sel', sel); lab.querySelector('input').checked = sel;
    const oi = $(`#ctl .other-in[data-o="${i}"]`); if (oi) oi.classList.toggle('on', sel);
  });
}
function pickOpt(q, i) {
  const o = q.options[i], cur = ans[q.key] || {};
  if (q.type === 'multi') {
    const set = new Set(cur.v || []);
    if (set.has(o.label)) set.delete(o.label);
    else {
      if (o.exclusive) set.clear(); else q.options.filter(x => x.exclusive).forEach(x => set.delete(x.label));
      set.add(o.label);
    }
    ans[q.key] = { ...cur, v: [...set] };
  } else {
    ans[q.key] = { v: o.label, other: o.other ? (cur.other || '') : '' };
  }
  save(); syncOpts(q); progress(); $('#next').innerHTML = nextLabel(q);
  if (o.other && ans[q.key].v && (q.type === 'single' || (ans[q.key].v || []).includes(o.label))) { const inp = $(`#ctl .other-in[data-o="${i}"] input`); if (inp && lastInput !== 'key') inp.focus(); return; }
  if (q.type === 'single') autoAdvance();
}
function pickScale(q, v) {
  ans[q.key] = v; save(); progress();
  $$('#ctl .sc, #ctl .opt').forEach(l => { const val = l.querySelector('input').value; l.classList.toggle('sel', String(v) === val); });
  $('#next').innerHTML = nextLabel(q);
  autoAdvance();
}
function pickCell(q, ri, ci) {
  const cur = { ...(ans[q.key] || {}) }; cur[ri] = q.cols[ci]; ans[q.key] = cur; save();
  const row = $(`#ctl .row[data-r="${ri}"]`);
  row.classList.add('done'); row.querySelectorAll('.pill').forEach((p, i) => p.classList.toggle('sel', i === ci));
  progress();
  const nx = row.nextElementSibling; if (nx && !nx.classList.contains('done')) nx.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
}
function autoAdvance() {
  clearTimeout(autoT);
  if (quick && (lastInput === 'pointer' || lastInput === 'shortcut')) autoT = setTimeout(() => go(1), AUTO_MS);
}
const curQ = () => { const s = SCREENS && SCREENS[pos]; return s && s.kind === 'q' ? s.q : null; };

stage.addEventListener('change', e => {
  const t = e.target, q = curQ(); if (!q || !t.matches('input.vh')) return;
  if (q.type === 'single' || q.type === 'multi') pickOpt(q, +t.value);
  else if (q.type === 'scale') pickScale(q, t.value in { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 } ? +t.value : t.value);
  else if (q.type === 'grid') pickCell(q, +t.name.split('_').pop(), +t.value);
});
stage.addEventListener('input', e => {
  const t = e.target, q = curQ(); if (!q) return;
  if (t.id === 'ta') { ans[q.key] = t.value; $('#cc').textContent = t.value.length; save(); progress(); $('#next').innerHTML = nextLabel(q); }
  else if (t.closest('.other-in')) { const cur = ans[q.key] || {}; ans[q.key] = { ...cur, other: t.value }; save(); }
  else if (q.type === 'contact') { ans.contact = { name: $('#cn').value, org: $('#co').value, email: $('#ce').value }; progress(); $('#next').innerHTML = nextLabel(q); $('#ce').removeAttribute('aria-invalid'); }
});

/* ---------- validation and navigation ---------- */
function fail(msg, focusEl) {
  const e = $('#err'); e.textContent = msg; e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake');
  if (focusEl) focusEl.focus();
  return false;
}
function validate(q) {
  const a = ans[q.key];
  if (q.type === 'contact') {
    const em = a && String(a.email || '').trim();
    if (em && !EMAIL.test(em)) { $('#ce').setAttribute('aria-invalid', 'true'); return fail('That email address does not look right. Check it, or leave the field empty.', $('#ce')); }
    return true;
  }
  if (q.optional) return true;
  if (!qAnswered(q)) {
    let m = 'Choose an answer to continue.';
    if (q.type === 'grid') { const left = q.rows.filter((_, i) => !a || a[i] === undefined).length; m = left + ' row' + (left > 1 ? 's' : '') + ' still need an answer.'; }
    if (q.type === 'multi') m = 'Choose at least one answer.';
    if (q.type === 'text') m = 'Please type an answer to continue.';
    return fail(m);
  }
  if (q.options && (q.type === 'single' || q.type === 'multi')) {
    const chosen = q.type === 'single' ? [a.v] : (a.v || []);
    const needsOther = q.options.some(o => o.other && chosen.includes(o.label));
    if (needsOther && !String(a.other || '').trim()) { return fail('Please add a few words for “Other”.', $('#ctl .other-in.on input')); }
  }
  return true;
}
function nextIndex() {
  let n = pos + 1; while (n < SCREENS.length && skipScreen(SCREENS[n])) n++; return n;
}
function go(d) {
  if (busy || sending) return; clearTimeout(autoT);
  if (d > 0) {
    const s = SCREENS[pos];
    if (s.kind === 'q' && !validate(s.q)) return;
    const n = nextIndex();
    if (n >= SCREENS.length) return finish();
    hist.push(pos);
    swap(() => { pos = n; render(); history.pushState({ sv: 1 }, '', '#q' + pos); });
  } else if (hist.length) {
    history.back();            // popstate does the work, so the browser Back button and ours behave the same
  } else {
    history.back();
  }
}
function backStep() {
  if (busy || !hist.length) return;
  const p = hist.pop(); swap(() => { pos = p; render(); });
}
function swap(fn) {
  busy = true; const el = stage.firstElementChild; if (el) { el.classList.remove('in'); el.classList.add('out'); }
  setTimeout(() => { fn(); busy = false; }, reduced() ? 0 : 170);
}
function show(el) { [welcome, qs, done].forEach(x => x.classList.remove('on')); el.classList.add('on'); }
function startSurvey(from) {
  if (from) { ans = from.ans || {}; pos = Math.min(from.pos, SCREENS.length - 1); hist = from.hist || []; sid = from.sid || uid(); started = from.started || Date.now(); }
  else { ans = {}; pos = 0; hist = []; sid = uid(); started = Date.now(); wipe(); }
  buildProg(); show(qs); history.pushState({ sv: 1 }, '', '#q' + pos); render();
}
addEventListener('popstate', () => {
  if (done.classList.contains('on')) { history.pushState({ sv: 1 }, '', '#done'); return; }
  if (!qs.classList.contains('on')) return;
  if (hist.length) backStep(); else { show(welcome); document.title = 'Sponsor Experience Survey'; initWelcome(); }
});

/* ---------- submit ---------- */
function payload() {
  const o = { submissionId: sid, submittedAt: new Date().toISOString(), elapsedMs: Date.now() - started, hp: $('#hp').value, client: 'v2' };
  QS.forEach(q => {
    const a = ans[q.key];
    if (skipped(q) || a === undefined || a === null) return;
    if (q.type === 'single') { o[q.key] = a.v || ''; if (q.options.some(x => x.other && x.label === a.v)) o[q.key + '_other'] = a.other || ''; }
    else if (q.type === 'multi') { o[q.key] = (a.v || []).join(' | '); if (q.options.some(x => x.other && (a.v || []).includes(x.label))) o[q.key + '_other'] = a.other || ''; }
    else if (q.type === 'scale' || q.type === 'text') o[q.key] = a;
    else if (q.type === 'grid') q.rows.forEach((_, i) => { o[q.key + '_r' + (i + 1)] = a[i] || ''; });
    else if (q.type === 'contact') { o.contact_name = a.name || ''; o.contact_org = a.org || ''; o.contact_email = a.email || ''; }
  });
  return o;
}
function setStatus(kind, text) {
  $('#status').className = 'status' + (kind === 'ok' ? ' ok' : kind === 'bad' ? ' bad' : '');
  $('#statusTxt').textContent = text;
}
async function send() {
  if (sending) return; sending = true;
  $('#retry').disabled = true; $('#retryRow').hidden = true; $('#failHelp').hidden = true;
  setStatus('', 'Sending your answers…');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), SEND_TIMEOUT);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(lastPayload), signal: ctl.signal });
    if (!res.ok) throw new Error('http ' + res.status);
    const out = await res.json();                       // the Apps Script answers {"ok":true}
    if (!out || out.ok !== true) throw new Error('rejected');
    onSuccess();
  } catch (e) {
    onFailure();
  } finally { clearTimeout(t); sending = false; $('#retry').disabled = false; }
}
function onSuccess() {
  wipe(); lastPayload = null; ans = {};
  $('#doneH').innerHTML = 'Thank <em>you.</em>';
  $('#doneP').textContent = 'Your answers will shape what the next sponsor receives before their project begins.';
  setStatus('ok', 'Your answers are in. Thank you.'); document.title = 'Thank you \u2013 Sponsor Experience Survey';
  $('#steps').hidden = false; $('#closeTab').hidden = false;
  confetti();
}
function onFailure() {
  $('#doneH').textContent = 'We could not confirm delivery';
  $('#doneP').textContent = canStore ? 'Nothing has been lost. Your answers are saved on this device.' : 'Use “Copy my answers” before you leave this page, because this browser cannot save them.';
  setStatus('bad', 'We could not confirm that your answers arrived.'); document.title = 'Delivery not confirmed \u2013 Sponsor Experience Survey';
  $('#retryRow').hidden = false; $('#failHelp').hidden = false;
}
function finish() {
  lastPayload = payload(); show(done); stage.innerHTML = '';
  document.title = 'Sending – Sponsor Experience Survey';
  $('#doneH').textContent = 'Sending…'; $('#steps').hidden = true; $('#closeTab').hidden = true;
  $('#doneH').focus({ preventScroll: true });
  send();
}
$('#retry').addEventListener('click', send);
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(lastPayload, null, 2)); $('#copy').textContent = 'Copied'; }
  catch (e) { $('#copy').textContent = 'Copy blocked by this browser'; }
});

/* ---------- confetti (success only, skipped for reduced motion) ---------- */
function confetti() {
  if (reduced()) return;
  const cv = $('#fx'), cx = cv.getContext('2d'); const W = cv.width = cv.offsetWidth, H = cv.height = cv.offsetHeight;
  const root = getComputedStyle(document.documentElement);
  const cols = ['--red', '--paper', '--paper', '--on-dark', '--pink'].map(v => root.getPropertyValue(v).trim() || '#fff');
  const P = Array.from({ length: 150 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * .5, w: 6 + Math.random() * 8, h: 10 + Math.random() * 10, vy: 2 + Math.random() * 4, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[Math.random() * cols.length | 0] }));
  const t0 = performance.now();
  (function tick(t) {
    cx.clearRect(0, 0, W, H); const age = t - t0; let alive = 0;
    P.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += p.vr; if (p.y < H + 30) alive++; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.globalAlpha = Math.max(0, 1 - age / 4200); cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore(); });
    if (alive && age < 4200) requestAnimationFrame(tick); else cx.clearRect(0, 0, W, H);
  })(t0);
}

/* ---------- keyboard ---------- */
// Record how the last answer was made, so auto-advance only follows a pointer tap or a shortcut key,
// and any further input cancels a pending advance.
addEventListener('pointerdown', () => { lastInput = 'pointer'; clearTimeout(autoT); }, true);
addEventListener('keydown', e => {
  clearTimeout(autoT);
  lastInput = (quick && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) ? 'shortcut' : 'key';
}, true);
document.addEventListener('keydown', e => {
  const inQ = qs.classList.contains('on'), inW = welcome.classList.contains('on');
  const t = e.target, tag = (t.tagName || '').toLowerCase();
  if (inW && e.key === 'Enter' && tag !== 'button' && tag !== 'a') {
    e.preventDefault(); const b = [$('#resume'), $('#start')].find(x => !x.hidden && !x.disabled); if (b) b.click(); return;
  }
  if (!inQ || busy) return;
  if (e.key === 'Enter') {
    if (tag === 'textarea' && !(e.ctrlKey || e.metaKey)) return;
    if (tag === 'button' && !t.closest('#next')) return;          // let every other button use its native Enter
    e.preventDefault(); go(1); return;
  }
  if (tag === 'input' && t.type !== 'radio' && t.type !== 'checkbox') return;
  if (tag === 'textarea') return;
  if (quick && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const q = curQ(); if (!q) return;
    const inputs = $$('#ctl input.vh');
    if (q.type === 'single' || q.type === 'multi' || q.type === 'scale') { const el = inputs[+e.key - 1]; if (el) { e.preventDefault(); el.click(); el.focus({ preventScroll: true }); } }
  }
});

/* ---------- welcome, preferences, boot ---------- */
function setQuick(on) {
  quick = on; safe(() => localStorage.setItem(PREF, on ? 'on' : 'off'));
  const b = $('#quick'); b.setAttribute('aria-pressed', String(on)); b.textContent = 'Quick mode: ' + (on ? 'on' : 'off');
  const q = curQ(); if (q) $('#hint').textContent = hintFor(q);
}
$('#quick').addEventListener('click', () => { setQuick(!quick); clearTimeout(autoT); });
function initWelcome() {
  const saved = load(); const has = !!(saved && saved.pos >= 0 && Object.keys(saved.ans || {}).length);
  $('#resume').hidden = !has; $('#restart').hidden = !has; $('#start').hidden = has;
  $('#restartNote').hidden = true; $('#restart').textContent = 'Start over'; $('#restart').dataset.armed = '';
}
$('#start').addEventListener('click', () => startSurvey());
$('#resume').addEventListener('click', () => startSurvey(load()));
$('#restart').addEventListener('click', () => {
  const b = $('#restart');
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Yes, delete my saved answers'; const n = $('#restartNote'); n.textContent = 'This deletes the answers saved on this device and starts again.'; n.hidden = false; return; }
  wipe(); startSurvey();
});
$('#next').addEventListener('click', () => go(1));
$('#back').addEventListener('click', () => go(-1));

function applyConfig() {
  const cfg = DATA.config || {};
  if (cfg.estimate) $('#estimate').textContent = cfg.estimate.replace(/ minutes?$/, '');
  if (cfg.contactEmail) $$('[data-contact]').forEach(el => { el.hidden = false; $$('[data-contact-link]').forEach(a => { a.href = 'mailto:' + cfg.contactEmail; a.textContent = cfg.contactEmail; }); });
}
async function boot() {
  history.replaceState(null, '', location.pathname + location.search);
  setQuick(quick);
  try {
    const res = await fetch('assets/survey.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) { $('#loadErr').hidden = false; return; }
  PARTS = DATA.parts; QS = DATA.questions;
  QS.forEach(q => { q.key = keyOf(q); });
  SCREENS = [];
  PARTS.forEach(p => { SCREENS.push({ kind: 'intro', part: p }); QS.filter(q => q.part === p.id).forEach(q => SCREENS.push({ kind: 'q', q })); });
  applyConfig(); initWelcome();
  $('#start').disabled = false;
}
boot();
})();
