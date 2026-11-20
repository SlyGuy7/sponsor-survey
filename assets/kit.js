/* kit.html: rebuilds a sponsor's readiness kit from the codes in the address after the #.
   Nothing is sent anywhere: the page only reads two files from its own site. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const MISSING = 'This kit link is missing or damaged, so there is nothing to build. Take the survey and your kit will appear when you finish.';

async function load(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

async function boot() {
  const m = /^#kit=(1_[0-9a-zx._-]*)$/.exec(location.hash);
  if (!m) { $('#kitP').textContent = MISSING; $('#noKit').hidden = false; return; }
  try {
    const [survey, content] = await Promise.all([load('assets/survey.json'), load('assets/readiness.json')]);
    const answers = Readiness.decode(survey.questions, m[1]);
    if (!Object.keys(answers).length) { $('#kitP').textContent = MISSING; $('#noKit').hidden = false; return; }
    Readiness.mount(content, answers, $('#pkgBody'));
    $('#pkg').hidden = false;
    $('#kitP').textContent = 'The dates and next steps below are filtered to today.';
    document.title = 'Your sponsor readiness kit';
  } catch (e) {
    $('#kitP').textContent = 'The kit could not be loaded. Please check your connection and reload this page.';
  }
}

$('#printPkg').addEventListener('click', () => {
  const closed = [...document.querySelectorAll('#pkg details:not([open])')];
  closed.forEach(d => { d.open = true; });
  document.body.classList.add('print-pkg');
  const undo = () => { document.body.classList.remove('print-pkg'); closed.forEach(d => { d.open = false; }); removeEventListener('afterprint', undo); };
  addEventListener('afterprint', undo);
  window.print();
});
boot();
})();
