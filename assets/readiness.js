/* Sponsor readiness package: turns one sponsor's survey answers into a personalised package.
   Runs only in the browser (or in tests). Nothing is stored or sent anywhere.
   The content and the rules live in assets/readiness.json; this file is the engine and the page renderer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Readiness = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Answers that count as "not in place in time" for the readiness grid (question 8) ...
  const GAP = ['Ready after Oct 8', 'Still not ready'];
  // ... and as "unclear" for the expectations grid (question 5).
  const LOW = ['1', '2', 'I do not recall'];

  const val = (a, k) => (a && a[k] !== undefined && a[k] !== null) ? String(a[k]) : '';

  function cond(c, a) {
    if (!c) return false;
    if (c.any) return c.any.some(x => cond(x, a));
    if (c.all) return c.all.every(x => cond(x, a));
    if (c.gap) return GAP.includes(val(a, c.gap));
    if (c.low) return LOW.includes(val(a, c.low));
    if (c.key && c.in) return c.in.includes(val(a, c.key));
    if (c.key && c.has) return val(a, c.key).split(' | ').includes(c.has);
    return false;
  }
  const matches = (item, a) => cond(item.when || item, a);

  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // Pure function: content + answers + today's date -> what to show.
  function build(content, a, today) {
    const day = ymd(today || new Date());
    const hit = content.now.filter(i => matches(i, a));
    const ids = new Set(hit.map(i => i.id));
    const shown = hit.filter(i => !(i.unless || []).some(u => ids.has(u)));
    const by = lvl => shown.filter(i => i.level === lvl);
    const chosen = val(a, 'q19').split(' | ');   // question 19: up to two resources the sponsor picked
    const kit = content.kit
      .map((k, idx) => Object.assign({}, k, { idx, picked: (k.picks || []).some(p => chosen.includes(p)) }))
      .sort((x, y) => Number(y.picked) - Number(x.picked) || x.idx - y.idx)
      .map(k => Object.assign(k, { top: k.picked }));
    return {
      fix: by('fix'), refresh: by('refresh'), info: by('info'),
      dates: content.dates.filter(d => d.until >= day),
      kit,
      contacts: content.contacts
    };
  }

  /* ---------- rendering (text only: content is never inserted as HTML) ---------- */
  function el(tag, attrs) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    const add = c => { if (Array.isArray(c)) c.forEach(add); else if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); };
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return e;
  }
  const paras = t => String(t || '').split('\n\n').map(p => el('p', { text: p }));
  const list = (items, cls) => items && items.length ? el('ul', { class: cls || 'pkg-steps' }, items.map(s => el('li', { text: s }))) : null;
  const src = s => s ? el('p', { class: 'pkg-src', text: 'Source: ' + s }) : null;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function contactList(contacts) {
    return el('ul', { class: 'pkg-contacts' }, contacts.map(c => el('li', null,
      el('b', { text: c.who }), ' ', c.for,
      c.email ? [' ', el('a', { href: 'mailto:' + c.email, text: c.email })] : null)));
  }

  function body(item, ctx) {
    return [
      item.intro ? el('p', { class: 'pkg-intro', text: item.intro }) : null,
      paras(item.body),
      list(item.steps),
      item.timeline ? el('ol', { class: 'pkg-timeline' }, item.timeline.map(t => el('li', null, el('b', { text: t.when }), ' ', t.what))) : null,
      item.template ? el('dl', { class: 'pkg-template' }, item.template.map(t => [el('dt', { text: t.h }), el('dd', { text: t.p })])) : null,
      item.sample ? el('blockquote', { class: 'pkg-sample', text: item.sample }) : null,
      item.contacts ? contactList(ctx.contacts) : null,
      src(item.source)
    ];
  }

  function card(item, ctx, o) {
    const tag = o.tag ? el('span', { class: 'pkg-tag' + (o.fix ? ' fix' : '') }, o.tag) : null;
    if (o.open) return el('article', { class: 'pkg-card' + (o.fix ? ' fix' : ''), 'data-id': item.id }, el('h4', null, item.title, tag ? [' ', tag] : null), body(item, ctx));
    return el('details', { class: 'pkg-card', 'data-id': item.id }, el('summary', null, item.title, tag ? [' ', tag] : null), el('div', { class: 'pkg-more' }, body(item, ctx)));
  }

  function panelNow(r) {
    const n = r.fix.length;
    return [
      el('p', { class: 'pkg-ph', text: 'For the rest of this semester' }),
      el('p', { class: 'pkg-lead', text: n ? plural(n, 'thing') + ' to sort out now, based on your answers.' : 'Nothing urgent stands out in your answers. Here is what is coming up.' }),
      n ? [el('h3', { text: 'Needs attention now' }), r.fix.map(i => card(i, r, { open: true, fix: true, tag: 'Needs attention' }))] : null,
      el('h3', { text: 'Coming up' }),
      r.dates.length
        ? el('ol', { class: 'pkg-dates' }, r.dates.map(d => el('li', null, el('b', { text: d.when }), el('span', { class: 'pkg-dt', text: d.title }), el('span', { text: d.detail }))))
        : el('p', { text: 'The milestones listed in the sponsor guide for this semester have passed.' }),
      r.refresh.length ? [el('h3', { text: 'Worth a second look' }), r.refresh.map(i => card(i, r, { open: false, tag: 'Refresher' }))] : null,
      el('h3', { text: 'Who to contact' }),
      el('div', { class: 'pkg-card' }, el('p', { text: 'Start with your PM. For unresolved performance, scope, compliance or program concerns, contact Capstone leadership promptly instead of waiting until the Showcase.' }), contactList(r.contacts)),
      r.info.length ? [el('h3', { text: 'Good to know' }), r.info.map(i => card(i, r, { open: false }))] : null
    ];
  }

  function panelKit(r) {
    return [
      el('p', { class: 'pkg-ph', text: 'If you were a new sponsor' }),
      el('p', { class: 'pkg-lead', text: 'If you were starting as a new sponsor today, this is the readiness kit we would hand you. It is drafted from the Sponsor Guide and ordered by what you said would have helped you most.' }),
      el('h3', { text: 'Your readiness kit' }),
      r.kit.map(k => card(k, r, { open: k.top, tag: k.picked ? 'You picked this' : '' }))
    ];
  }

  function mount(content, answers, host, today) {
    const r = build(content, answers, today);
    host.textContent = '';
    const t1 = el('button', { type: 'button', role: 'tab', id: 'pkgT1', 'aria-selected': 'true', 'aria-controls': 'pkgP1', class: 'pkg-tab' }, 'For the rest of this semester');
    const t2 = el('button', { type: 'button', role: 'tab', id: 'pkgT2', 'aria-selected': 'false', 'aria-controls': 'pkgP2', tabindex: '-1', class: 'pkg-tab' }, 'If you were a new sponsor');
    const p1 = el('div', { role: 'tabpanel', id: 'pkgP1', 'aria-labelledby': 'pkgT1', tabindex: '0', class: 'pkg-panel' }, panelNow(r));
    const p2 = el('div', { role: 'tabpanel', id: 'pkgP2', 'aria-labelledby': 'pkgT2', tabindex: '0', class: 'pkg-panel', hidden: '' }, panelKit(r));
    const tabs = [[t1, p1], [t2, p2]];
    function select(i, focus) {
      tabs.forEach(([t, p], j) => { t.setAttribute('aria-selected', String(i === j)); t.tabIndex = i === j ? 0 : -1; p.hidden = i !== j; });
      if (focus) tabs[i][0].focus();
    }
    tabs.forEach(([t], i) => {
      t.addEventListener('click', () => select(i, false));
      t.addEventListener('keydown', e => {
        const k = e.key; let j = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % tabs.length;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i + tabs.length - 1) % tabs.length;
        else if (k === 'Home') j = 0; else if (k === 'End') j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); select(j, true); }
      });
    });
    host.append(el('div', { class: 'pkg-tabs', role: 'tablist', 'aria-label': 'Readiness package sections' }, t1, t2), p1, p2);
    return { fix: r.fix.length, refresh: r.refresh.length, kit: r.kit.length };
  }


  /* ---------- reopenable link ----------
     A sponsor's answers are turned into short option codes, such as "5-0123-1" for question 5.
     The codes go after the # in the kit site's address, which a browser never sends to any server.
     No names, emails or free text are included. */
  // The link format version. Raise it whenever questions or options move, so links made before the change
  // are recognised as out of date instead of being decoded against the new questions. 1_ was used until Nov 2026.
  const VERSION = '2_';
  const CODED = q => q.n && q.type !== 'text' && q.type !== 'contact';

  function encode(questions, a) {
    const parts = [];
    (questions || []).filter(CODED).forEach(q => {
      const k = 'q' + q.n; let v = '';
      if (q.type === 'single') { const i = q.options.findIndex(o => o.label === val(a, k)); if (i >= 0) v = String(i); }
      else if (q.type === 'multi') v = val(a, k).split(' | ').map(l => q.options.findIndex(o => o.label === l)).filter(i => i >= 0).join('.');
      else if (q.type === 'scale') { const s = val(a, k); if (/^[1-5]$/.test(s)) v = s; else { const i = (q.extra || []).indexOf(s); if (i >= 0) v = 'x' + i; } }
      else if (q.type === 'grid') { const g = q.rows.map((_, i) => { const j = q.cols.indexOf(val(a, k + '_r' + (i + 1))); return j >= 0 ? String(j) : '-'; }).join(''); if (/\d/.test(g)) v = g; }
      if (v !== '') parts.push(q.n + '-' + v);
    });
    return VERSION + parts.join('_');
  }

  // Never throws: anything that does not fit the survey is ignored, so a damaged link just gives a shorter kit.
  function decode(questions, code) {
    const out = {}, s = String(code || '');
    if (s.slice(0, VERSION.length) !== VERSION) return out;
    s.slice(2).split('_').forEach(p => {
      const at = p.indexOf('-'); if (at < 1) return;
      const q = (questions || []).filter(CODED).find(x => String(x.n) === p.slice(0, at)); if (!q) return;
      const v = p.slice(at + 1), k = 'q' + q.n;
      if (q.type === 'single') { const o = q.options[+v]; if (/^\d+$/.test(v) && o) out[k] = o.label; }
      else if (q.type === 'multi') { const l = v.split('.').filter(x => /^\d+$/.test(x) && q.options[+x]).map(x => q.options[+x].label); if (l.length) out[k] = l.join(' | '); }
      else if (q.type === 'scale') { if (/^[1-5]$/.test(v)) out[k] = v; else if (/^x\d+$/.test(v) && (q.extra || [])[+v.slice(1)]) out[k] = q.extra[+v.slice(1)]; }
      else if (q.type === 'grid') v.split('').slice(0, q.rows.length).forEach((c, i) => { if (/\d/.test(c) && q.cols[+c]) out[k + '_r' + (i + 1)] = q.cols[+c]; });
    });
    return out;
  }

  return { GAP, LOW, VERSION, matches, build, mount, encode, decode };
});
