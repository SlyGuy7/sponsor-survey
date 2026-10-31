/**
 * Sponsor Experience Survey: response collector (Google Apps Script web app).
 *
 * Setup
 *  1. Create a Google Sheet (keep it PRIVATE: share only with the Operations team and the professor).
 *  2. Extensions > Apps Script, paste this file, set SHEET_ID below.
 *  3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *  4. Copy the /exec URL into ENDPOINT in assets/app.js. Redeploy as a NEW VERSION after every edit.
 *  5. Open the /exec URL in a browser: you should see {"ok":true,"service":"sponsor-survey"}.
 */
const SHEET_ID = 'PASTE_SHEET_ID_HERE';
const SHEET_NAME = 'Responses';
const MAX_LEN = 2100;       // longest allowed text value (questions allow 2000 characters)
const MIN_MS = 8000;        // 20 questions cannot be answered faster than this by a person

// Columns, in order. Unknown keys in a request are ignored.
const COLUMNS = ['submissionId', 'submittedAt', 'receivedAt', 'elapsedMs',
  'q1', 'q1_other', 'q2', 'q2_other', 'q3', 'q3_other', 'q4', 'q5', 'q6', 'q7', 'q8', 'q8_other',
  'q9_r1', 'q9_r2', 'q9_r3', 'q9_r4', 'q9_r5', 'q9_r6', 'q9_r7', 'q10', 'q10_other', 'q11', 'q12', 'q13', 'q14', 'q15', 'q16',
  'q17', 'q18_r1', 'q18_r2', 'q18_r3', 'q18_r4', 'q18_r5', 'q18_r6', 'q19', 'q20',
  'contact_name', 'contact_org', 'contact_email', 'quote_ok', 'results_ok'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Spreadsheet formula injection guard: a leading = + - @ would be executed as a formula.
function clean_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return v;
  let s = String(v).slice(0, MAX_LEN);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function doGet() { return json_({ ok: true, service: 'sponsor-survey' }); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!d.submissionId || typeof d.submissionId !== 'string' || d.submissionId.length > 64) return json_({ ok: false, error: 'bad request' });

    // Bots: honeypot filled or impossibly fast. Pretend success so they learn nothing.
    if (d.hp || (Number(d.elapsedMs) || 0) < MIN_MS) return json_({ ok: true });

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME) || SpreadsheetApp.openById(SHEET_ID).insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) { sheet.appendRow(COLUMNS); sheet.setFrozenRows(1); }

    // De-duplicate: a retry carries the same submissionId.
    const last = sheet.getLastRow();
    if (last > 1) {
      const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (ids[i][0] === d.submissionId) return json_({ ok: true, duplicate: true });
    }

    d.receivedAt = new Date().toISOString();
    sheet.appendRow(COLUMNS.map(function (c) { return clean_(d[c]); }));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server error' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
