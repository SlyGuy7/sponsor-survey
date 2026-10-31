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

## Change a question

Edit `assets/survey.json`. Question types: `single`, `multi`, `scale`, `grid`, `text`, `contact`. An option with `"skipTo": 12` skips questions numbered below 12. An option with `"exclusive": true` clears the other choices in a multi-select. Set `config.contactEmail` to show a contact link on the welcome and thank-you pages.

## Set up or redeploy the response collector

1. Create a Google Sheet and keep it private (share only with the Operations team and the professor).
2. In the sheet, open Extensions > Apps Script and paste `apps-script/Code.gs`. Set `SHEET_ID`.
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
4. Copy the `/exec` URL into `ENDPOINT` at the top of `assets/app.js`.
5. Open the `/exec` URL in a browser. You should see `{"ok":true,"service":"sponsor-survey"}`.
6. After every edit to `Code.gs`, deploy a **new version**; the old URL keeps running the old code.

The script ignores unknown fields, caps text length, prefixes values that start with `=`, `+`, `-` or `@` so a sheet never runs them as formulas, rejects honeypot and impossibly fast submissions, de-duplicates retries by `submissionId`, and serializes writes with a lock.

## Test locally

```
python3 -m http.server 8000
```

Open http://localhost:8000/. To test failure handling without touching the real sheet, point `ENDPOINT` at a local mock that returns `{"ok":true}`, an HTTP 500, or nothing.

## Privacy

Responses are anonymous unless the respondent enters contact details on the last screens. The page is marked `noindex`. Fonts are self-hosted, so visiting the page sends nothing to Google except the answers a respondent chooses to submit.
