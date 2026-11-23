/**
 * Sponsor Experience Survey: response collector (Google Apps Script web app).
 *
 * Setup
 *  1. Create a Google Sheet (keep it PRIVATE: share only with the Operations team and the professor).
 *  2. Extensions > Apps Script, paste this file and save. Then open Project Settings (gear icon) >
 *     Script Properties > Add script property: name SHEET_ID, value = the long ID in the Sheet's
 *     address (between /d/ and /edit). Saved there, it survives pasting a new version of this file.
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
// Fallback only. Keep the real ID in Script Properties (see Setup, step 2) so a fresh paste never wipes it,
// and never commit the real ID to the repository.
var SHEET_ID = 'PASTE_SHEET_ID_HERE';

// The Sheet ID from Script Properties, or the value above. Empty when neither has been set.
function sheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || SHEET_ID;
  return id && id !== 'PASTE_SHEET_ID_HERE' ? String(id).trim() : '';
}
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
  "label": "Q5. Giving timely feedback at sprint reviews",
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
  "label": "Q5. Raising concerns about a student with the Project Manager first",
  "width": 200
 },
 {
  "key": "q5_r6",
  "label": "Q5. Attending the Final Showcase",
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
  "label": "Q8. Clear project goals",
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
  "label": "Q11. During the first month, about how many hours a week did this project take of your time?",
  "width": 230
 },
 {
  "key": "q12",
  "label": "Q12. So far this semester, how often have you held a regular check-in with the team?",
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
  "label": "Q18. How likely are you to sponsor a Capstone project again?",
  "width": 170
 },
 {
  "key": "q19",
  "label": "Q19. Which resources would have helped you most before kickoff or during your first month?",
  "width": 260
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

// ---- BEGIN SURVEY: generated from assets/survey.json by `npm run sync:script`. Do not edit by hand. ----
var SURVEY = {
 "parts": [
  {
   "id": "A",
   "label": "Part A",
   "name": "About you and your organization"
  },
  {
   "id": "B",
   "label": "Part B",
   "name": "Before the project started"
  },
  {
   "id": "C",
   "label": "Part C",
   "name": "Kickoff and communication"
  },
  {
   "id": "D",
   "label": "Part D",
   "name": "Overall experience"
  },
  {
   "id": "E",
   "label": "Part E",
   "name": "A readiness kit for new sponsors"
  },
  {
   "id": "X",
   "label": "Bonus",
   "name": "Before you go"
  }
 ],
 "questions": [
  {
   "key": "q1",
   "n": 1,
   "part": "A",
   "type": "single",
   "text": "Which best describes your organization?",
   "options": [
    "Large company (1,000 or more employees)",
    "Mid-size company (100 to 999)",
    "Small company (10 to 99)",
    "Startup or very small team (under 10)",
    "University or research group",
    "Nonprofit or government",
    "Other",
    "Prefer not to say"
   ]
  },
  {
   "key": "q2",
   "n": 2,
   "part": "A",
   "type": "single",
   "text": "Which best describes your project's main focus?",
   "options": [
    "Software, web, or mobile development",
    "Data science, AI, or machine learning",
    "Cybersecurity",
    "UX/UI or design",
    "Systems integration or network engineering",
    "Process automation, dashboards, or visualization",
    "Other",
    "Prefer not to say"
   ]
  },
  {
   "key": "q3",
   "n": 3,
   "part": "A",
   "type": "single",
   "text": "Which best describes your role on this project?",
   "options": [
    "Executive or final decision maker",
    "Manager or program lead",
    "Technical lead or engineer",
    "Partnerships or university-relations coordinator",
    "Other",
    "Prefer not to say"
   ]
  },
  {
   "key": "q4",
   "n": 4,
   "part": "A",
   "type": "single",
   "text": "Before this semester, how many NJIT Capstone projects had you sponsored or supported?",
   "options": [
    "None, this is my first",
    "1",
    "2 to 3",
    "4 or more",
    "Prefer not to say"
   ]
  },
  {
   "key": "q5",
   "n": 5,
   "part": "B",
   "type": "grid",
   "text": "Before your team started, how clear was each of these sponsor expectations to you?",
   "rows": [
    "Meeting with the team about weekly (30 to 60 minutes)",
    "Giving timely feedback at sprint reviews",
    "Signing a scope document with the Project Manager by the end of Sprint 1",
    "Separating must-have goals from stretch goals",
    "Raising concerns about a student with the Project Manager first",
    "Attending the Final Showcase",
    "Completing the official Sponsor Evaluation by Dec 13"
   ],
   "cols": [
    "1",
    "2",
    "3",
    "4",
    "5",
    "I do not recall"
   ]
  },
  {
   "key": "q6",
   "n": 6,
   "part": "B",
   "type": "single",
   "text": "Which best describes your use of the Sponsor Partnership Guide & FAQ before the project started?",
   "options": [
    "I read it closely",
    "I skimmed it",
    "I received it but did not open it",
    "I never received it or did not know it existed",
    "I am not sure"
   ]
  },
  {
   "key": "q7",
   "n": 7,
   "part": "B",
   "type": "multi",
   "text": "Where did you learn what was expected of you?",
   "options": [
    "Email from the program or professor",
    "A meeting, call, or the Industry Open House",
    "A written guide or agreement (Sponsor Partnership Guide & FAQ, sponsor acknowledgment)",
    "The student Project Manager (PM)",
    "The official Capstone Discord",
    "A colleague or earlier sponsor",
    "I figured it out as the project went",
    "I never received this information",
    "Other"
   ]
  },
  {
   "key": "q8",
   "n": 8,
   "part": "B",
   "type": "grid",
   "text": "When your student team began, how ready was each of the following?",
   "rows": [
    "Clear project goals",
    "A signed scope document",
    "Written requirements and acceptance criteria",
    "Data, documents, or sample material",
    "Accounts, tools, or system access",
    "One named representative who can make decisions",
    "A named technical contact",
    "NDA or agreement completed by every team member"
   ],
   "cols": [
    "Ready before Sprint 1 (by Sept 28)",
    "Ready during Sprint 1 (by Oct 8)",
    "Ready after Oct 8",
    "Still not ready",
    "Not needed for our project"
   ]
  },
  {
   "key": "q9",
   "n": 9,
   "part": "B",
   "type": "single",
   "text": "Which issue, if any, caused the longest delay in your team’s ability to begin meaningful work?",
   "options": [
    "No significant delay",
    "Unclear scope or goals",
    "Getting the scope document signed",
    "Requirements or acceptance criteria",
    "Data or documents",
    "Access to accounts, tools, or systems",
    "A technical contact",
    "A decision or approval",
    "An agreement (NDA or IP)",
    "Something else",
    "Not sure"
   ]
  },
  {
   "key": "q10",
   "n": 10,
   "part": "B",
   "type": "single",
   "text": "About how long did the team wait for that issue to be resolved?",
   "options": [
    "Less than 3 days",
    "3 to 7 days",
    "1 to 2 weeks",
    "More than 2 weeks",
    "Still waiting",
    "I am not sure"
   ]
  },
  {
   "key": "q11",
   "n": 11,
   "part": "C",
   "type": "single",
   "text": "During the first month, about how many hours a week did this project take of your time?",
   "options": [
    "Less than 1 hour",
    "1 to 2 hours",
    "3 to 5 hours",
    "6 to 10 hours",
    "More than 10 hours",
    "I am not sure"
   ]
  },
  {
   "key": "q12",
   "n": 12,
   "part": "C",
   "type": "single",
   "text": "So far this semester, how often have you held a regular check-in with the team?",
   "options": [
    "Weekly or more",
    "About every two weeks",
    "Only at sprint reviews or milestones",
    "Rarely",
    "No regular check-ins"
   ]
  },
  {
   "key": "q13",
   "n": 13,
   "part": "C",
   "type": "single",
   "text": "After the semester began, did your project's scope change?",
   "options": [
    "No",
    "Small changes, agreed with the Project Manager",
    "Small changes, not agreed with the Project Manager",
    "A major change, documented with the Project Manager",
    "A major change, not documented",
    "I am not sure"
   ]
  },
  {
   "key": "q14",
   "n": 14,
   "part": "C",
   "type": "scale",
   "text": "During the first month, how easy was it to get help from Capstone Operations when you needed it?",
   "low": "Very difficult",
   "high": "Very easy",
   "extra": [
    "I needed help but didn’t know whom to contact",
    "I didn’t need help"
   ]
  },
  {
   "key": "q15",
   "n": 15,
   "part": "D",
   "type": "single",
   "text": "Compared with what you expected, the time this project asked of you was:",
   "options": [
    "Much less than expected",
    "Somewhat less",
    "About what I expected",
    "Somewhat more",
    "Much more than expected"
   ]
  },
  {
   "key": "q16",
   "n": 16,
   "part": "D",
   "type": "scale",
   "text": "Overall, how satisfied are you with how the project got started?",
   "low": "Very dissatisfied",
   "high": "Very satisfied",
   "extra": []
  },
  {
   "key": "q17",
   "n": 17,
   "part": "D",
   "type": "text",
   "text": "What was the most helpful thing anyone did to help you get ready or get started?"
  },
  {
   "key": "q18",
   "n": 18,
   "part": "D",
   "type": "scale",
   "text": "How likely are you to sponsor a Capstone project again?",
   "low": "Very unlikely",
   "high": "Very likely",
   "extra": [
    "Too early to say"
   ]
  },
  {
   "key": "q19",
   "n": 19,
   "part": "E",
   "type": "multi",
   "text": "Which resources would have helped you most before kickoff or during your first month?",
   "options": [
    "A pre-kickoff checklist of what to prepare (scope, data, access, contact)",
    "A scope document template to sign with the Project Manager",
    "A week-by-week checklist for Sprint 1, up to the Oct 8 readiness package",
    "A one-page summary of the Sponsor Partnership Guide & FAQ",
    "A \"who to contact when\" card (PM first, then Capstone leadership)",
    "A welcome post in your team's Discord channel",
    "A named Operations contact and instructions for getting help",
    "None of these"
   ]
  },
  {
   "key": "q20",
   "n": 20,
   "part": "E",
   "type": "text",
   "text": "What is one thing Capstone Operations could have done to better prepare or support you before kickoff or during your first month?"
  },
  {
   "key": "contact",
   "n": null,
   "part": "X",
   "type": "contact",
   "text": "Contact details"
  },
  {
   "key": "quote_ok",
   "n": null,
   "part": "X",
   "type": "single",
   "text": "Permission to quote",
   "options": [
    "Yes",
    "No"
   ]
  },
  {
   "key": "results_ok",
   "n": null,
   "part": "X",
   "type": "single",
   "text": "Results",
   "options": [
    "Yes",
    "No"
   ]
  }
 ]
};
// ---- END SURVEY ----

// Writes the real error to Apps Script's Executions page (Error level), so a failed save can be diagnosed there.
// Sponsors still only see "server error".
function logError_(what, err) {
  console.error('Failed while ' + what + ': ' + ((err && (err.stack || err.message)) || err));
}

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

// How the time received is shown, for example "Nov 23, 2026  3:04 PM".
var DATE_FORMAT = 'mmm d, yyyy  h:mm am/pm';

// ---- Making the Responses tab easy to read ----------------------------------------------------
// Header cells take their survey part's colour, so the eye can find "Part B" at a glance.
var PART_COLORS = { meta: '#3A3766', A: '#1C1475', B: '#2A2090', C: '#14105A', D: '#33299E', E: '#9E0000', X: '#55527A' };
// Background and text colours for highlighted answers.
var TINTS = { bad: ['#FBE3E3', '#8A0000'], warn: ['#FFF1D0', '#6B4300'], good: ['#E1F3E7', '#0F5E33'], muted: ['#F1F0F6', '#6B6890'] };
// Which answers to highlight. keys: a pattern for the column keys. scale: 1-2 red, 4-5 green.
// contains: match inside a multi-select answer (answers are joined with " | ").
// A test checks that every label here is a real answer in the survey.
var HIGHLIGHTS = [
  { keys: /^q5_r\d+$/, scale: true, warn: ['I do not recall'] },
  { keys: /^q6$/, warn: ['I received it but did not open it', 'I never received it or did not know it existed'], good: ['I read it closely'] },
  { keys: /^q7$/, contains: true, bad: ['I never received this information'], warn: ['I figured it out as the project went'] },
  { keys: /^q8_r\d+$/, good: ['Ready before Sprint 1 (by Sept 28)', 'Ready during Sprint 1 (by Oct 8)'], warn: ['Ready after Oct 8'], bad: ['Still not ready'], muted: ['Not needed for our project'] },
  { keys: /^q9$/, good: ['No significant delay'] },
  { keys: /^q10$/, warn: ['1 to 2 weeks'], bad: ['More than 2 weeks', 'Still waiting'] },
  { keys: /^q12$/, good: ['Weekly or more'], warn: ['Only at sprint reviews or milestones', 'Rarely'], bad: ['No regular check-ins'] },
  { keys: /^q13$/, bad: ['Small changes, not agreed with the Project Manager', 'A major change, not documented'] },
  { keys: /^q14$/, scale: true, bad: ['I needed help but didn’t know whom to contact'] },
  { keys: /^q15$/, warn: ['Somewhat more'], bad: ['Much more than expected'] },
  { keys: /^q16$/, scale: true },
  { keys: /^q18$/, scale: true, muted: ['Too early to say'] },
  { keys: /^(quote_ok|results_ok)$/, good: ['Yes'] },
];

// Part of each column: the survey part of its question, or "meta" for ID, time received and time taken.
function partOfKey_(key) {
  var base = key.replace(/_(r\d+|other)$/, '').replace(/^contact_.*/, 'contact');
  for (var i = 0; i < SURVEY.questions.length; i++) if (SURVEY.questions[i].key === base) return SURVEY.questions[i].part;
  return 'meta';
}

function highlightRules_(sheet, rows) {
  var rules = [];
  var rule = function (range, kind) { return SpreadsheetApp.newConditionalFormatRule().setRanges([range]).setBackground(TINTS[kind][0]).setFontColor(TINTS[kind][1]); };
  COLUMNS.forEach(function (c, i) {
    HIGHLIGHTS.forEach(function (h) {
      if (!h.keys.test(c.key)) return;
      var range = sheet.getRange(2, i + 1, rows - 1, 1);
      ['bad', 'warn', 'good', 'muted'].forEach(function (kind) {
        (h[kind] || []).forEach(function (v) { rules.push((h.contains ? rule(range, kind).whenTextContains(v) : rule(range, kind).whenTextEqualTo(v)).build()); });
      });
      if (h.scale) {
        rules.push(rule(range, 'bad').whenNumberBetween(1, 2).build());
        rules.push(rule(range, 'good').whenNumberBetween(4, 5).build());
      }
    });
  });
  sheet.setConditionalFormatRules(rules);
}

// Make the sheet readable: part-coloured frozen header, readable dates, wrapped text, sensible widths,
// banded rows, a filter, and highlighted answers. Data rows are never changed.
function setupSheet_(sheet) {
  var n = COLUMNS.length;
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, n).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);                       // submission ID and time received stay in view
  sheet.setRowHeight(1, 96);
  for (var i = 0; i < n; i++) sheet.setColumnWidth(i + 1, COLUMNS[i].width);

  var rows = Math.max(sheet.getMaxRows(), 1000);
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  var body = sheet.getRange(2, 1, rows - 1, n);
  body.setWrap(true).setVerticalAlignment('top').setFontFamily('Arial').setFontSize(10).setFontColor('#16133D');

  sheet.getBandings().forEach(function (b) { b.remove(); });
  sheet.getRange(1, 1, rows, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);

  sheet.getRange(1, 1, 1, n)
    .setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10).setFontFamily('Arial')
    .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('left');
  COLUMNS.forEach(function (c, i) { sheet.getRange(1, i + 1).setBackground(PART_COLORS[partOfKey_(c.key)] || PART_COLORS.meta); });

  var keys = COLUMNS.map(function (c) { return c.key; });
  sheet.getRange(2, keys.indexOf('receivedAt') + 1, rows - 1, 1).setNumberFormat(DATE_FORMAT);
  sheet.getRange(2, keys.indexOf('submissionId') + 1, rows - 1, 1).setFontColor('#8C89B0').setFontSize(8);
  // 1-5 ratings and counts read best centred
  COLUMNS.forEach(function (c, i) {
    if (/^(seconds|q5_r\d+|q14|q16|q18)$/.test(c.key)) sheet.getRange(2, i + 1, rows - 1, 1).setHorizontalAlignment('center');
  });

  highlightRules_(sheet, rows);
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, rows, n).createFilter();
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(sheetId_());
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet && sheet.getLastRow() > 0) {
    var have = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].join('|');
    if (have !== HEADERS.join('|')) {
      // A name with seconds, plus a counter if even that is taken, so two layout changes close together never collide.
      var base = SHEET_NAME + ' (old ' + Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd HHmmss'), name = base + ')';
      for (var n = 2; ss.getSheetByName(name) && n < 100; n++) name = base + ' ' + n + ')';
      sheet.setName(name);
      sheet = null;
    }
  }
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME, 0);
  if (sheet.getLastRow() === 0) setupSheet_(sheet);
  return sheet;
}

// Run this from the editor to (re)apply the formatting.
function setupSheet() { setupSheet_(getSheet_()); }

// ---- Summary, Grids and Comments tabs ----------------------------------------------------------
// Live tables built from the Responses tab. Every formula finds the Responses tab by name (INDIRECT) and
// each column by its header (MATCH), so the tables keep working when the script sets an old Responses tab
// aside or columns move. Run buildReportTabs from the editor once, and again after changing the questions.
function colLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function fq_(s) { return String(s).replace(/"/g, '""'); }                 // text inside a formula's quotes
function crit_(s) { return fq_(String(s).replace(/[~*?]/g, '~$&')); }    // a COUNTIF criterion, wildcards made literal
// The answers in one column of the Responses tab (row 2 down), found by the column's header.
function col_(key) {
  var i = COLUMNS.map(function (c) { return c.key; }).indexOf(key);
  if (i < 0) throw new Error('No Responses column for ' + key);
  var last = colLetter_(COLUMNS.length), tab = "'" + SHEET_NAME + "'!";
  return 'INDEX(INDIRECT("' + tab + 'A2:' + last + '"),0,MATCH("' + fq_(HEADERS[i]) + '",INDIRECT("' + tab + 'A1:' + last + '1"),0))';
}
function partTitle_(id) {
  for (var i = 0; i < SURVEY.parts.length; i++) if (SURVEY.parts[i].id === id) return SURVEY.parts[i].label + ': ' + SURVEY.parts[i].name;
  return id;
}

// A plan is { rows: [[cell, ...]], styles: [{ row, kind }], formats: [{ row, col, rows, fmt }], heat: [{ row, col, rows, cols }], widths: [px] }.
// Rows and columns are 1-based. A cell that starts with "=" is a formula.
function summaryPlan_() {
  var p = { rows: [], styles: [], formats: [], heat: [], widths: [460, 110, 90, 220] };
  var add = function (cells, kind) { p.rows.push(cells); if (kind) p.styles.push({ row: p.rows.length, kind: kind }); return p.rows.length; };
  add(['Sponsor Experience Survey: results'], 'title');
  add(['Live counts from the Responses tab. They update by themselves as answers arrive.'], 'note');
  add([]);
  add(['At a glance', '', '', ''], 'section');
  add(['Responses received', '=COUNTA(' + col_('submissionId') + ')']);
  var latest = add(['Latest response', '=IF(COUNTA(' + col_('submissionId') + ')=0,"None yet",MAX(' + col_('receivedAt') + '))']);
  p.formats.push({ row: latest, col: 2, rows: 1, fmt: DATE_FORMAT });
  add(['Average satisfaction with how the project started (Q16)', '=IFERROR(TEXT(AVERAGE(' + col_('q16') + '),"0.0")&" / 5","No answers yet")']);
  add(['Median time to finish', '=IFERROR(TEXT(MEDIAN(' + col_('seconds') + ')/60,"0.0")&" min","No answers yet")']);
  add(['Want a summary of the results', '=COUNTIF(' + col_('results_ok') + ',"Yes")']);
  add(['Said we may quote them', '=COUNTIF(' + col_('quote_ok') + ',"Yes")']);
  var part = null;
  SURVEY.questions.forEach(function (q) {
    if (!q.n || (q.type !== 'single' && q.type !== 'multi' && q.type !== 'scale')) return;
    if (q.part !== part) { part = q.part; add([]); add([partTitle_(part), '', '', ''], 'part:' + part); }
    add([]);
    var c = col_(q.key);
    add(['Q' + q.n + '. ' + q.text, 'Sponsors', 'Share', q.type === 'multi' ? 'More than one answer allowed' : ''], 'qhead');
    var nRow = add(['Answered by', '=COUNTIF(' + c + ',"<>")', '', ''], 'sub');
    var opts = q.type === 'scale' ? ['1', '2', '3', '4', '5'].concat(q.extra || []) : q.options;
    var first = p.rows.length + 1;
    opts.forEach(function (o) {
      var r = p.rows.length + 1;
      var label = q.type === 'scale' && /^[1-5]$/.test(o) ? o + (o === '1' ? ' = ' + q.low : o === '5' ? ' = ' + q.high : '') : o;
      var count = q.type === 'multi'
        ? '=IFERROR(COUNTIF(TOCOL(SPLIT(FILTER(' + c + ',' + c + '<>"")," | ",FALSE),1),"' + crit_(o) + '"),0)'
        : '=COUNTIF(' + c + ',"' + crit_(o) + '")';
      add([label, count, '=IF($B$' + nRow + '=0,"",B' + r + '/$B$' + nRow + ')', '=IF(C' + r + '="","",REPT("█",ROUND(C' + r + '*20)))']);
    });
    p.formats.push({ row: first, col: 3, rows: opts.length, fmt: '0%' });
    p.styles.push({ row: first, kind: 'bars', rows: opts.length });
    if (q.type === 'scale') add(['Average (1 to 5)', '=IFERROR(ROUND(AVERAGE(' + c + '),1),"")', '', ''], 'sub');
  });
  return p;
}

function gridsPlan_() {
  var p = { rows: [], styles: [], formats: [], heat: [], widths: [330] };
  var add = function (cells, kind) { p.rows.push(cells); if (kind) p.styles.push({ row: p.rows.length, kind: kind }); return p.rows.length; };
  add(['Readiness and expectation grids'], 'title');
  add(['How many sponsors chose each answer. Darker red means more sponsors.'], 'note');
  SURVEY.questions.forEach(function (q) {
    if (q.type !== 'grid') return;
    var rated = q.cols.some(function (x) { return /^[1-5]$/.test(x); });
    add([]);
    add(['Q' + q.n + '. ' + q.text], 'qtitle');
    add([''].concat(q.cols, ['Answered by'], rated ? ['Average (1 to 5)'] : []), 'qhead');
    var first = p.rows.length + 1;
    q.rows.forEach(function (rowLabel, i) {
      var c = col_(q.key + '_r' + (i + 1));
      add([rowLabel].concat(q.cols.map(function (x) { return '=COUNTIF(' + c + ',"' + crit_(x) + '")'; }),
        ['=COUNTIF(' + c + ',"<>")'], rated ? ['=IFERROR(ROUND(AVERAGE(' + c + '),1),"")'] : []));
    });
    p.heat.push({ row: first, col: 2, rows: q.rows.length, cols: q.cols.length });
  });
  return p;
}

function commentsPlan_() {
  var keys = ['receivedAt', 'q17', 'q20', 'contact_name', 'contact_org', 'contact_email', 'quote_ok', 'results_ok'];
  var heads = ['Received', 'Q17. Most helpful thing anyone did', 'Q20. What Operations could have done', 'Name', 'Organization', 'Email', 'OK to quote', 'Wants results'];
  var cols = keys.map(col_);
  var p = { rows: [], styles: [], formats: [], heat: [], widths: [150, 360, 360, 150, 170, 210, 90, 100] };
  p.rows.push(['Written answers and follow-up contacts']); p.styles.push({ row: 1, kind: 'title' });
  p.rows.push(['Newest first. Only responses with a written answer or an email are listed. Quote only rows marked Yes.']); p.styles.push({ row: 2, kind: 'note' });
  p.rows.push([]);
  p.rows.push(heads); p.styles.push({ row: 4, kind: 'qhead' });
  p.rows.push(['=IFERROR(SORT(FILTER({' + cols.join(',') + '},LEN(' + cols[1] + ')+LEN(' + cols[2] + ')+LEN(' + cols[5] + ')>0),1,FALSE),"No written answers or contact details yet.")']);
  p.formats.push({ row: 5, col: 1, rows: 995, fmt: 'mmm d, yyyy' });
  p.styles.push({ row: 5, kind: 'wrap', rows: 995 });
  return p;
}

function writeTab_(ss, name, index, plan) {
  var old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet(name, index);
  var w = Math.max.apply(null, plan.rows.map(function (r) { return r.length; }).concat([plan.widths.length, 1]));
  var grid = plan.rows.map(function (r) { var o = r.slice(); while (o.length < w) o.push(''); return o; });
  if (sh.getMaxRows() < grid.length) sh.insertRowsAfter(sh.getMaxRows(), grid.length - sh.getMaxRows());
  if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), w).setFontFamily('Arial').setFontSize(10).setFontColor('#16133D').setVerticalAlignment('top');
  sh.getRange(1, 1, grid.length, w).setValues(grid);
  plan.widths.forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });
  for (var c = plan.widths.length + 1; c <= w; c++) sh.setColumnWidth(c, 120);
  sh.setHiddenGridlines(true);
  var row = function (r, n) { return sh.getRange(r, 1, n || 1, w); };
  plan.styles.forEach(function (s) {
    var k = s.kind;
    if (k === 'title') sh.getRange(s.row, 1).setFontSize(18).setFontWeight('bold').setFontColor('#1C1475');
    else if (k === 'note') sh.getRange(s.row, 1).setFontColor('#55527A').setFontStyle('italic');
    else if (k === 'section') row(s.row).setBackground('#1C1475').setFontColor('#FFFFFF').setFontWeight('bold');
    else if (k.indexOf('part:') === 0) row(s.row).setBackground(PART_COLORS[k.slice(5)] || PART_COLORS.meta).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
    else if (k === 'qtitle') sh.getRange(s.row, 1).setFontWeight('bold').setFontColor('#1C1475').setFontSize(11);
    else if (k === 'qhead') row(s.row).setBackground('#EEEDF7').setFontWeight('bold').setFontColor('#1C1475').setWrap(true);
    else if (k === 'sub') row(s.row).setFontColor('#55527A').setFontStyle('italic');
    else if (k === 'bars') sh.getRange(s.row, 4, s.rows, 1).setFontColor('#CC0000');
    else if (k === 'wrap') row(s.row, s.rows).setWrap(true);
  });
  plan.formats.forEach(function (f) { sh.getRange(f.row, f.col, f.rows, 1).setNumberFormat(f.fmt); });
  var rules = plan.heat.map(function (h) {
    return SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(h.row, h.col, h.rows, h.cols)])
      .setGradientMinpoint('#FFFFFF').setGradientMaxpoint('#E35A5A').build();
  });
  sh.setConditionalFormatRules(rules);
  return sh;
}

// Run from the editor: rebuilds the Summary, Grids and Comments tabs (replacing any old ones) next to Responses.
function buildReportTabs() {
  var ss = SpreadsheetApp.openById(sheetId_());
  var responses = getSheet_();                        // makes sure Responses exists in the current layout
  var at = responses.getIndex();                      // position of Responses (1-based), so the tabs follow it
  writeTab_(ss, 'Summary', at, summaryPlan_());
  writeTab_(ss, 'Grids', at + 1, gridsPlan_());
  writeTab_(ss, 'Comments', at + 2, commentsPlan_());
}

// ---- Results for the team's dashboard (dashboard.html) -------------------------------------------
// Protected by a secret key kept in Script Properties, never in the website. Contact details are never returned.
function createDashboardKey() {
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_KEY', key);
  Logger.log('Dashboard key: ' + key);
  return key;
}

function summary_() {
  var sheet = SpreadsheetApp.openById(sheetId_()).getSheetByName(SHEET_NAME);
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
    try { return json_(summary_()); } catch (err) { logError_('dashboard summary', err); return json_({ ok: false, error: 'server error' }); }
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

    if (!sheetId_()) return json_({ ok: false, error: 'not configured: set SHEET_ID in Script Properties' });
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
    // Writing a date resets the cell to Google's default format, so give the new row the readable one again.
    var receivedCol = COLUMNS.map(function (c) { return c.key; }).indexOf('receivedAt') + 1;
    try { sheet.getRange(sheet.getLastRow(), receivedCol).setNumberFormat(DATE_FORMAT); } catch (fmtErr) { /* the answer is saved; only the look is affected */ }
    return json_({ ok: true });
  } catch (err) {
    logError_('saving a response', err);
    return json_({ ok: false, error: 'server error' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
