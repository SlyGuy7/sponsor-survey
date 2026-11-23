// Copies the survey's parts and questions from assets/survey.json into apps-script/Code.gs (the SURVEY block),
// so the script can build the Summary, Grids and Comments tabs without reading the website.
//
//   npm run sync:script            update the block (run after changing survey.json)
//   node scripts/sync-script.js --check   exit 1 if the block is out of date (the tests run this)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const gsPath = path.join(root, 'apps-script', 'Code.gs');
const BEGIN = '// ---- BEGIN SURVEY: generated from assets/survey.json by `npm run sync:script`. Do not edit by hand. ----';
const END = '// ---- END SURVEY ----';

const survey = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'survey.json'), 'utf8'));
const keyOf = q => q.n ? 'q' + q.n : (q.bonus === 1 ? 'contact' : q.bonus === 2 ? 'quote_ok' : 'results_ok');
const slim = {
  parts: survey.parts.map(p => ({ id: p.id, label: p.label, name: p.name })),
  questions: survey.questions.map(q => {
    const o = { key: keyOf(q), n: q.n || null, part: q.part, type: q.type, text: q.title || q.text };
    if (q.options) o.options = q.options.map(x => x.label);
    if (q.type === 'scale') { o.low = q.low; o.high = q.high; o.extra = q.extra || []; }
    if (q.type === 'grid') { o.rows = q.rows; o.cols = q.cols; }
    return o;
  }),
};
const block = BEGIN + '\nvar SURVEY = ' + JSON.stringify(slim, null, 1) + ';\n' + END;

const raw = fs.readFileSync(gsPath, 'utf8');
const crlf = raw.includes('\r\n');
const src = raw.replace(/\r\n/g, '\n');
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < a) throw new Error('Code.gs has no SURVEY block between the BEGIN and END markers');
const next = src.slice(0, a) + block + src.slice(b + END.length);

if (process.argv.includes('--check')) {
  if (next !== src) { console.error('The SURVEY block in apps-script/Code.gs is out of date.\nRun: npm run sync:script'); process.exit(1); }
  console.log('Code.gs survey block is up to date.');
} else if (next !== src) {
  fs.writeFileSync(gsPath, crlf ? next.replace(/\n/g, '\r\n') : next);
  console.log('Updated the SURVEY block in apps-script/Code.gs');
} else console.log('Code.gs survey block was already up to date.');
