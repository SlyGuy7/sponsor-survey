// Runs Lighthouse against the local site and fails if a score drops. SEO is not enforced: the page is
// deliberately `noindex` (private survey), which Lighthouse scores as a failing "is-crawlable" check.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MIN = { performance: 0.9, accessibility: 1, 'best-practices': 1 };   // shared CI machines are slower than a laptop
const port = 4174;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
const lh = path.join(__dirname, '..', 'node_modules', '.bin', 'lighthouse');
let failed = false;
try {
  for (const [page, preset] of [['index.html', 'mobile'], ['index.html', 'desktop'], ['dashboard.html', 'mobile'], ['dashboard.html', 'desktop']]) {
    const out = path.join(os.tmpdir(), `lh-${page}-${preset}.json`);
    const args = [`http://127.0.0.1:${port}/${page}`, '--chrome-flags=--headless=new --no-sandbox', '--output=json', `--output-path=${out}`, '--quiet'];
    if (preset === 'desktop') args.push('--preset=desktop');
    try { execFileSync(lh, args, { stdio: 'ignore', timeout: 120000, env: process.env }); }
    catch (e) { console.error('Lighthouse failed to run (is Chrome installed? set CHROME_PATH):', e.message); failed = true; continue; }
    const r = JSON.parse(fs.readFileSync(out, 'utf8'));
    for (const [cat, min] of Object.entries(MIN)) {
      const score = r.categories[cat].score;
      const ok = score >= min;
      console.log(`${page.padEnd(15)} ${preset.padEnd(8)} ${cat.padEnd(15)} ${Math.round(score * 100)} ${ok ? 'ok' : 'FAIL (needs ' + Math.round(min * 100) + ')'}`);
      if (!ok) failed = true;
    }
  }
} finally { server.kill(); }
process.exit(failed ? 1 : 0);
