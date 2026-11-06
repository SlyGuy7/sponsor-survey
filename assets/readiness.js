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
    const chosen = val(a, 'q18').split(' | ');   // question 18: up to two resources the sponsor picked
    const kit = content.kit
      .map((k, idx) => Object.assign({}, k, { idx, picked: (k.picks || []).some(p => chosen.includes(p)) }))
      .sort((x, y) => Number(y.picked) - Number(x.picked) || x.idx - y.idx)
      .map(k => Object.assign(k, { top: k.picked }));
    const pref = val(a, 'q19');
    return {
      fix: by('fix'), refresh: by('refresh'), info: by('info'),
      dates: content.dates.filter(d => d.until >= day),
      kit, delivery: pref && pref !== 'No preference' ? pref : '',
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
      r.delivery ? el('p', { class: 'pkg-note', text: 'Noted: you would prefer to receive it as "' + r.delivery.charAt(0).toLowerCase() + r.delivery.slice(1) + '".' }) : null,
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

  return { GAP, LOW, matches, build, mount };
});
