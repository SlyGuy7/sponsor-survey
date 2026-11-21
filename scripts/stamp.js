// Gives every CSS, JS and JSON file a version tag (?v=...) taken from its contents, so a visitor's
// browser always loads a matching set of files after an update instead of mixing old and new ones.
//
//   npm run stamp          update the tags (run this before committing a change to any asset)
//   node scripts/stamp.js --check   exit 1 if any tag is out of date (the tests run this)
//
// Order matters: the JSON files are stamped into the scripts that fetch them first, then the
// scripts and styles (now final) are stamped into the HTML pages.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const check = process.argv.includes('--check');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
// Line endings are ignored so Windows (CRLF) and Linux (LF) checkouts give the same tag.
const digest = s => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);

// [file to update, assets it references]
const STEPS = [
  ['assets/app.js', ['assets/survey.json', 'assets/readiness.json']],
  ['assets/dashboard.js', ['assets/survey.json', 'assets/app.js']],
  ['index.html', ['assets/style.css', 'assets/noscript.css', 'assets/readiness.js', 'assets/app.js']],
  ['dashboard.html', ['assets/dashboard.css', 'assets/noscript.css', 'assets/dashboard.js']],
  ['404.html', ['assets/style.css']],
];

const pending = {};                     // file -> new text, so --check never writes
const text = f => pending[f] !== undefined ? pending[f] : read(f);
const hashOf = f => digest(text(f));
const stale = [];

for (const [file, assets] of STEPS) {
  let src = text(file);
  for (const a of assets) {
    // matches assets/app.js or /sponsor-survey/assets/app.js, with or without an existing ?v=
    const re = new RegExp('((?:/sponsor-survey/)?' + a.replace(/[.]/g, '\\.') + ')(\\?v=[0-9a-f]+)?(?=[\'"])', 'g');
    if (!re.test(src)) throw new Error(`${file} does not reference ${a}`);
    src = src.replace(re, `$1?v=${hashOf(a)}`);
  }
  if (src !== text(file)) { pending[file] = src; stale.push(file); }
}

if (check) {
  if (stale.length) { console.error('Out-of-date version tags in: ' + stale.join(', ') + '\nRun: npm run stamp'); process.exit(1); }
  console.log('Version tags are up to date.');
} else {
  for (const f of stale) fs.writeFileSync(path.join(root, f), pending[f]);
  console.log(stale.length ? 'Updated: ' + stale.join(', ') : 'Version tags were already up to date.');
}
