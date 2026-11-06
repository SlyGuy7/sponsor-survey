# Sponsor Experience Survey

A 20-question survey for project sponsors, built by the Fall 2026 NJIT capstone Operations team. It asks how prepared sponsors were before their student team began, so the next sponsor starts ready.

Live site: https://slyguy7.github.io/sponsor-survey/

## How it works

- Static site on GitHub Pages: plain HTML, CSS and JavaScript, no build step, no third-party scripts.
- Answers are posted to a Google Apps Script web app (`apps-script/Code.gs`) that writes them to a private Google Sheet.
- The page only shows "Your answers are in" after the script replies `{"ok":true}`. Any other reply, a timeout or a blocked request shows "We could not confirm delivery", keeps the answers on the device and offers Retry and "Copy my answers".
- Progress is saved in the browser for 24 hours. Contact details (name, organization, email) are never saved to disk until they are sent.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page structure, metadata and the content security policy |
| `assets/style.css` | All styles (design tokens are at the top of `:root`) |
| `assets/app.js` | Survey logic, submit, keyboard and history handling |
| `assets/survey.json` | Every question, option and setting. Edit this to change the survey |
| `assets/fonts/` | Self-hosted WOFF2 fonts (Bricolage Grotesque, Instrument Sans) |
| `assets/njit-logo.png`, `favicon.svg`, `og.png` | Logo, tab icon and link-preview image |
| `apps-script/Code.gs` | The response collector. Not served by GitHub Pages; paste it into Apps Script |
| `404.html` | Page shown for mistyped links |
| `dashboard.html`, `assets/dashboard.js`, `assets/dashboard.css` | Private results page for the team (see below) |
| `tests/`, `package.json`, `playwright.config.js`, `.github/workflows/test.yml` | Automated tests and the workflow that runs them |

## Change a question

Edit `assets/survey.json`. Question types: `single`, `multi`, `scale`, `grid`, `text`, `contact`. An option with `"skipTo": 12` skips questions numbered below 12. An option with `"exclusive": true` clears the other choices in a multi-select, and `"max": 2` on a multi-select limits how many answers can be chosen. Set `config.contactEmail` to show a contact link on the welcome and thank-you pages.

## Set up or redeploy the response collector

1. Create a Google Sheet and keep it private (share only with the Operations team and the professor).
2. In the sheet, open Extensions > Apps Script and paste `apps-script/Code.gs`. Set `SHEET_ID`.
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
4. Copy the `/exec` URL into `ENDPOINT` at the top of `assets/app.js`.
5. Open the `/exec` URL in a browser. You should see `{"ok":true,"service":"sponsor-survey"}`.
6. After every edit to `Code.gs`, deploy a **new version**; the old URL keeps running the old code.

The script ignores unknown fields, caps text length, prefixes values that start with `=`, `+`, `-` or `@` so a sheet never runs them as formulas, rejects honeypot and impossibly fast submissions, de-duplicates retries by `submissionId`, and serializes writes with a lock.

## Automated tests

Every push runs the checks in `.github/workflows/test.yml` (Actions tab on GitHub; a green tick means they passed). GitHub Pages publishes your branch whether or not they pass, so look at the tick before you share a new version.

| Command | What it checks |
| --- | --- |
| `npm test` | 15 Apps Script unit tests, then browser tests: the full survey, skip logic, validation, keyboard use, Back button, resume, all four failure modes, accessibility (axe on every screen type in light and dark), layout at 16 screen sizes, the thank-you page, and the results dashboard |
| `npm run lighthouse` | Lighthouse performance 90+, accessibility and best practices 100, on the survey and the dashboard, mobile and desktop |

First time: `npm install` then `npx playwright install chromium`. The real response sheet is never contacted; the tests intercept the network request.

## Sponsor readiness package

After a sponsor's answers are confirmed, the thank-you page shows a personalised package: one tab for the rest of this semester (fixes, dates, who to contact) and one showing the readiness kit a new sponsor would get. It is built in the sponsor's browser from their own answers; nothing extra is stored or sent, and contact details are never used.

- `assets/readiness.json` holds all the wording and the rules (which answer shows which item). Each item names the sponsor-guide section it comes from. Wording edits are safe; a change to the survey's questions or answer options must go through the tests, which check every rule still matches a real answer.
- `assets/readiness.js` is the engine and the page drawing code.
- Dates in `readiness.json` are Fall 2026. Update them each semester; past dates hide themselves automatically.

## Results dashboard

`dashboard.html` opens with an "At a glance" section (the biggest readiness gaps, the least clear expectations and the resources sponsors most wanted before kickoff) and then shows the team's results as charts, a heat table for the grid questions, the free-text answers (with a filter for the ones sponsors allowed us to quote) and a CSV download. It is private by key, not by hiding the page:

1. In Apps Script, run `createDashboardKey` once. Open the Execution log and copy the key it prints.
2. Open `https://slyguy7.github.io/sponsor-survey/dashboard.html` and paste the key into the form. Tick "Remember on this device" to skip this step next time in that browser; "Forget this device" removes it again. Do not tick it on a shared computer. A link ending in `#key=YOUR_KEY` also works; the key is removed from the address bar as soon as the page reads it and a link never saves it.
3. Share the key only with the Operations team and the professor. To replace it, run `createDashboardKey` again; the old key stops working immediately, and any browser that remembered it asks for the new one.

The script never returns names, organizations, emails or submission IDs, so they cannot appear on the dashboard or in its CSV. Redeploy the script (new version) after updating `Code.gs`.

## Test by hand

```
python3 -m http.server 8000
```

Open http://localhost:8000/. To test failure handling without touching the real sheet, point `ENDPOINT` at a local mock that returns `{"ok":true}`, an HTTP 500, or nothing.

## Design

Each part of the survey has its own rail color and icon, and a short banner on its first question. A message appears when a part is finished and at the halfway point. The welcome page says what a sponsor gets for their time and shows the five parts as a row of steps, grids become a matrix with column headings on wide screens, the page follows the device's light or dark setting, and the thank-you page offers a recap, a link to share, a downloadable copy of the answers and a print layout.

## Privacy

Responses are anonymous unless the respondent enters contact details on the last screens. The page is marked `noindex`. Fonts are self-hosted, so visiting the page sends nothing to Google except the answers a respondent chooses to submit.
