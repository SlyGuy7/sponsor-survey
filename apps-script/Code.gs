/**
 * Sponsor Experience Survey: response collector (Google Apps Script web app).
 *
 * Setup
 *  1. Create a Google Sheet (keep it PRIVATE: share only with the Operations team and the professor).
 *  2. Extensions > Apps Script, paste this file, set SHEET_ID below, and save.
 *  3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *  4. Copy the /exec URL into ENDPOINT in assets/app.js.
 *  5. Open the /exec URL in a private window: you should see {"ok":true,"service":"sponsor-survey"}.
 *
 * After editing this file: Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 * The URL stays the same.
 *
 * The "Responses" tab is created and formatted automatically. If a tab with that name already exists
 * with a different layout, it is renamed to "Responses (old ...)" and a fresh one is created.
 * To re-apply the formatting at any time, run setupSheet from the editor.
 *
 * Results dashboard: run createDashboardKey once (open View > Logs or the Execution log to read the key),
 * then open dashboard.html on your site and paste the key. Run it again to replace the key.
 */
var SHEET_ID = 'PASTE_SHEET_ID_HERE';
var SHEET_NAME = 'Responses';
var MAX_LEN = 2100;       // longest allowed text value (questions allow 2000 characters)
var MIN_MS = 8000;        // 20 questions cannot be answered faster than this by a person

// One entry per column, in order. key = field sent by the survey, label = header shown in the sheet.
var COLUMNS = [
 {
  "key": "submissionId",
  "label": "Submission ID",
  "width": 150
 },
 {
  "key": "receivedAt",
  "label": "Received",
  "width": 160
 },
 {
  "key": "seconds",
  "label": "Time taken (seconds)",
  "width": 100
 },
 {
  "key": "q1",
  "label": "Q1. Which best describes your organization?",
  "width": 230
 },
 {
  "key": "q1_other",
  "label": "Q1 - Other (typed answer)",
  "width": 200
 },
 {
  "key": "q2",
  "label": "Q2. Which best describes your project's main focus?",
  "width": 230
 },
 {
  "key": "q2_other",
  "label": "Q2 - Other (typed answer)",
  "width": 200
 },
 {
  "key": "q3",
  "label": "Q3. Which best describes your role on this project?",
  "width": 230
 },
 {
  "key": "q3_other",
  "label": "Q3 - Other (typed answer)",
  "width": 200
 },
 {
  "key": "q4",
  "label": "Q4. Before this semester, how many NJIT Capstone projects had you sponsored or supported?",
  "width": 230
 },
 {
  "key": "q5_r1",
  "label": "Q5. Meeting with the team about weekly (30 to 60 minutes)",
  "width": 200
 },
 {
  "key": "q5_r2",
  "label": "Q5. Giving timely feedback at sprint reviews and the midterm",
  "width": 200
 },
 {
  "key": "q5_r3",
  "label": "Q5. Signing a scope document with the Project Manager by the end of Sprint 1",
  "width": 200
 },
 {
  "key": "q5_r4",
  "label": "Q5. Separating must-have goals from stretch goals",
  "width": 200
 },
 {
  "key": "q5_r5",
  "label": "Q5. Telling the Project Manager early about student concerns, instead of removing a student yourself",
  "width": 200
 },
 {
  "key": "q5_r6",
  "label": "Q5. Attending the Industry Open House and the Final Showcase",
  "width": 200
 },
 {
  "key": "q5_r7",
  "label": "Q5. Completing the official Sponsor Evaluation by Dec 13",
  "width": 200
 },
 {
  "key": "q6",
  "label": "Q6. Which best describes your use of the Sponsor Partnership Guide & FAQ before the project started?",
  "width": 230
 },
 {
  "key": "q7",
  "label": "Q7. Where did you learn what was expected of you?",
  "width": 260
 },
 {
  "key": "q7_other",
  "label": "Q7 - Other (typed answer)",
  "width": 200
 },
 {
  "key": "q8_r1",
  "label": "Q8. Clear goals, with must-haves separated from stretch goals",
  "width": 200
 },
 {
  "key": "q8_r2",
  "label": "Q8. A signed scope document",
  "width": 200
 },
 {
  "key": "q8_r3",
  "label": "Q8. Written requirements and acceptance criteria",
  "width": 200
 },
 {
  "key": "q8_r4",
  "label": "Q8. Data, documents, or sample material",
  "width": 200
 },
 {
  "key": "q8_r5",
  "label": "Q8. Accounts, tools, or system access",
  "width": 200
 },
 {
  "key": "q8_r6",
  "label": "Q8. One named representative who can make decisions",
  "width": 200
 },
 {
  "key": "q8_r7",
  "label": "Q8. A named technical contact",
  "width": 200
 },
 {
  "key": "q8_r8",
  "label": "Q8. NDA or agreement completed by every team member",
  "width": 200
 },
 {
  "key": "q9",
  "label": "Q9. Which issue, if any, caused the longest delay in your team’s ability to begin meaningful work?",
  "width": 230
 },
 {
  "key": "q9_other",
  "label": "Q9 - Other (typed answer)",
  "width": 200
 },
 {
  "key": "q10",
  "label": "Q10. About how long did the team wait for that issue to be resolved?",
  "width": 230
 },
 {
  "key": "q11",
  "label": "Q11. How soon did the team have a named day-to-day contact on your side who could answer technical questions?",
  "width": 230
 },
 {
  "key": "q12",
  "label": "Q12. During Sprints 1 to 3, how often did you hold a regular check-in with the team?",
  "width": 230
 },
 {
  "key": "q13",
  "label": "Q13. After the semester began, did your project's scope change?",
  "width": 230
 },
 {
  "key": "q14",
  "label": "Q14. During the first month, how easy was it to get help from Capstone Operations when you needed it?",
  "width": 200
 },
 {
  "key": "q15",
  "label": "Q15. Compared with what you expected, the time this project asked of you was:",
  "width": 230
 },
 {
  "key": "q16",
  "label": "Q16. Overall, how satisfied are you with how the project got started?",
  "width": 120
 },
 {
  "key": "q17",
  "label": "Q17. What was the most helpful thing anyone did to help you get ready or get started?",
  "width": 380
 },
 {
  "key": "q18",
  "label": "Q18. Which resources would have helped you most before kickoff or during your first month?",
  "width": 260
 },
 {
  "key": "q19",
  "label": "Q19. How would you prefer to receive it?",
  "width": 230
 },
 {
  "key": "q20",
  "label": "Q20. What is one thing Capstone Operations could have done to better prepare or support you before kickoff or during your first month?",
  "width": 380
 },
 {
  "key": "contact_name",
  "label": "Contact: name",
  "width": 170
 },
 {
  "key": "contact_org",
  "label": "Contact: organization",
  "width": 190
 },
 {
  "key": "contact_email",
  "label": "Contact: email",
  "width": 220
 },
 {
  "key": "quote_ok",
  "label": "May we quote Q17 and Q20 without naming you?",
  "width": 170
 },
 {
  "key": "results_ok",
  "label": "Wants a summary of the results?",
  "width": 150
 }
];

var HEADERS = COLUMNS.map(function (c) { return c.label; });

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Spreadsheet formula injection guard: a leading = + - @ would be executed as a formula.
function clean_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return v;
  var s = String(v).slice(0, MAX_LEN);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

// Make the sheet readable: coloured frozen header, wrapped text, sensible widths, banded rows, filter.
function setupSheet_(sheet) {
  var n = COLUMNS.length;
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, n).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  sheet.setRowHeight(1, 84);
  for (var i = 0; i < n; i++) sheet.setColumnWidth(i + 1, COLUMNS[i].width);

  var rows = Math.max(sheet.getMaxRows(), 1000);
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  var body = sheet.getRange(2, 1, rows - 1, n);
  body.setWrap(true).setVerticalAlignment('top').setFontFamily('Arial').setFontSize(10);

  sheet.getBandings().forEach(function (b) { b.remove(); });
  sheet.getRange(1, 1, rows, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);

  sheet.getRange(1, 1, 1, n)
    .setBackground('#1C1475').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10)
    .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('left');

  var received = COLUMNS.map(function (c) { return c.key; }).indexOf('receivedAt') + 1;
  sheet.getRange(2, received, rows - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');

  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, rows, n).createFilter();
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet && sheet.getLastRow() > 0) {
    var have = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].join('|');
    if (have !== HEADERS.join('|')) {
      sheet.setName(SHEET_NAME + ' (old ' + Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd HHmm') + ')');
      sheet = null;
    }
  }
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME, 0);
  if (sheet.getLastRow() === 0) setupSheet_(sheet);
  return sheet;
}

// Run this from the editor to (re)apply the formatting.
function setupSheet() { setupSheet_(getSheet_()); }

// ---- Results for the team's dashboard (dashboard.html) -------------------------------------------
// Protected by a secret key kept in Script Properties, never in the website. Contact details are never returned.
function createDashboardKey() {
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_KEY', key);
  Logger.log('Dashboard key: ' + key);
  return key;
}

function summary_() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, count: 0, rows: [] };
  var have = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].join('|');
  if (have !== HEADERS.join('|')) return { ok: false, error: 'unexpected layout' };
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS.length).getValues();
  var rows = values.map(function (r) {
    var o = {};
    COLUMNS.forEach(function (c, i) {
      if (/^contact_/.test(c.key) || c.key === 'submissionId') return;          // never leave the sheet
      var v = r[i];
      o[c.key] = v instanceof Date ? v.toISOString() : v;
    });
    return o;
  });
  return { ok: true, count: rows.length, generatedAt: new Date().toISOString(), rows: rows };
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'summary') {
    var key = PropertiesService.getScriptProperties().getProperty('DASHBOARD_KEY');
    if (!key || !p.key || String(p.key) !== key) return json_({ ok: false, error: 'not allowed' });
    try { return json_(summary_()); } catch (err) { return json_({ ok: false, error: 'server error' }); }
  }
  return json_({ ok: true, service: 'sponsor-survey' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!d.submissionId || typeof d.submissionId !== 'string' || d.submissionId.length > 64) return json_({ ok: false, error: 'bad request' });

    // Bots: honeypot filled or impossibly fast. Pretend success so they learn nothing.
    if (d.hp || (Number(d.elapsedMs) || 0) < MIN_MS) return json_({ ok: true });

    var sheet = getSheet_();

    // De-duplicate: a retry carries the same submissionId.
    var last = sheet.getLastRow();
    if (last > 1) {
      var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (ids[i][0] === d.submissionId) return json_({ ok: true, duplicate: true });
    }

    d.receivedAt = new Date();
    d.seconds = Math.round((Number(d.elapsedMs) || 0) / 1000);
    sheet.appendRow(COLUMNS.map(function (c) { return c.key === 'receivedAt' ? d.receivedAt : clean_(d[c.key]); }));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server error' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
