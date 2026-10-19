# CIS Grade Tracker — 202610

A single-page web app for recording course assessment plans by section (CRN), for the
HCT CIS / Applied Data Science program. Pick a course, optionally narrow by the faculty
teaching it, choose a section (CRN), and fill in the assessment details. Data is kept in the
browser, can be exported as CSV / JSON, and can sync to one shared Google Sheet so you get a
single copy of every user's data.

## Features

- **Find a course** — click the field to see all courses, or search by code or name
  (e.g. `CIS-4913` or `capstone`).
- **Faculty filter (scoped to the course)** — once a course is chosen, the Faculty box lists
  only the instructors teaching *that* course; pick one to show just their sections, or leave
  it on "All faculty".
- **Section selector** — lists every CRN for the chosen course/faculty, filterable by CRN,
  instructor or campus.
- **Assessment data entry** per CRN — five blocks (**CW1, CW2, CW3, Final Assessment,
  Final Grade**), each with: Assessment Tool, Week, Weight, % A/A-, % B+/B/B-, % F,
  Post-moderation done — plus a Comments box.
- **Searchable dropdowns** — the Assessment Tool list (18 tools, sorted) filters as you type;
  so do the course and faculty fields.
- **Controlled values**
  - Week: `Week01` … `Week16`
  - Assessment tools: Assignment, Case Study, Exam, Final Assignment,
    Final Examination (Practical), Final Examination (Theoretical), Final Project,
    In-Class Activity, Lab Assignment, Midterm, Portfolio, Practical Assessment, Presentation,
    Professional Certification (PCQ), Project, Quiz, Report, Test
  - Post-moderation done: `Yes` / `No`
- **Automatic save** — entries save as you type (no Save button); sections with data get a
  check in the list.
- **Password-protected export** — the first export asks you to set a password; only a hash is
  stored. (A convenience lock, not file encryption.)
- **Export** — CSV (columns match the CIS workbook, so rows paste straight back) or JSON.
- **Cloud sync to a Google Sheet** — see below. Gives you one central copy of everyone's data,
  updated automatically.
- **Built-in Help**, **light / dark theme**, responsive layout, and the **HCT logo** embedded.

## Cloud sync — one copy of all users' data (Google Sheet)

Because GitHub Pages is static, browsers can't share data on their own. To collect everyone's
entries in one place, connect the app to a Google Sheet (one-time setup, ~5 minutes):

1. Create a **Google Sheet** (this holds all data).
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the sample code, paste all of **`google-apps-script.gs`** (included), and **Save**.
4. **Deploy → New deployment → Web app**:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   Deploy, authorise, and copy the **Web app URL** (ends in `/exec`).
5. Paste that URL into the `CLOUD_URL = ""` line near the top of `index.html` (between the
   quotes) before uploading to GitHub. Every user who opens your GitHub link then syncs to your
   sheet automatically — there is nothing for them to configure.

Once connected, every change each person makes is written to the sheet automatically (new CRNs
are added, existing ones updated in place).

**Your master copy:** open the Google Sheet any time — it has every user's data.
**File → Download** saves it as **CSV** or **Excel (.xlsx)**.

> Note: the browsers only talk to *your* sheet through the URL you deploy. The URL itself grants
> write access to that sheet, so share it only with the people who should be entering data.

## Installing it on GitHub

It is a single self-contained file — no build step, no dependencies.

### Option A — upload in the browser (simplest)
1. On github.com, create a new repository (e.g. `cis-grade-tracker`).
2. **Add file → Upload files**, drag in `index.html` and `README.md` (and `google-apps-script.gs`
   for reference), and **Commit**.
3. **Settings → Pages** → *Deploy from a branch* → branch `main`, folder `/ (root)` → **Save**.
4. After a minute it's live at `https://<your-username>.github.io/<repo>/`.

### Option B — command line
```bash
git init
git add index.html README.md google-apps-script.gs
git commit -m "CIS Grade Tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```
Then enable **Settings → Pages** as in step 3 above.

## Notes

- The HCT logo and the course/section data are embedded in `index.html` — nothing else to upload.
- The data was de-duplicated: fully identical rows (every field repeated) were removed.
- Without cloud sync, data stays only in the browser it was entered in — use **Export** or
  **Cloud sync** to collect it.
