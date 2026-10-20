# CIS Grade Tracker — 202610

A single-page web app for HCT CIS / Applied Data Science faculty to submit each assessment's
grade distribution by section (CRN). Faculty sign in with their HCT email, see **only their own
sections**, pick an assessment, and enter the **number of students** in each grade band. The app
computes the percentages, flags anything outside the accepted range, and emails the Academic
Program Chair (APC). Everything is read live from Google Sheets, so updating a sheet updates the
app with no code change.

## Flow

1. **Sign in** with HCT email — checked server-side against the access list (never shown on the page).
2. **Your sections** appear as cards on the left: course code, title, CRN, enrolled students, program.
3. Pick a section → pick an **assessment** → enter three counts: **A/A-, B+/B/B-, F**.
   - Each % = count ÷ enrolled students. Caps: **A ≤ 25%, B ≤ 35%, F ≤ 20%**.
   - Within range → **green**; over → **red**.
4. **All green** → tick "I confirm the accuracy and correctness…" → **Save** → the faculty get a
   "within range, please post your grades" email (APC copied).
   **Any red** → a **justification is required** → **Save** → the **APC for that program** gets an
   email with the data and justification for review (faculty copied).
5. Every submission is **timestamped** in the Data sheet.

## The four Drive files (read live, by ID)

| File | Columns it needs | Role |
|---|---|---|
| **Access** `1kZ7…A9BM` | an **email** column, an **ID** (staff ID) column (name optional) | who may sign in |
| **Courses** `14l8…siNg` | Campus, Course Code, Course Title, CRN, Num. Students, **ID**, **Program** | each person's sections |
| **APC** `1SPbs…AiB0` | **Program**, **Email** (name optional) | who to email per program |
| **Course-assessments** `1RkFw…ucXQ` | **Course Code** + the assessment names | the assessment dropdown per course |

- The **ID** links Access ↔ Courses (same staff-ID values).
- The **Program** links Courses ↔ APC (same program names).
- The **Course Code** links Courses ↔ Course-assessments.

All IDs are set at the top of `google-apps-script.gs`. Update data by **editing the same sheets**
(don't upload new files — that changes the ID).

## Setup / redeploy

1. Open the **Data** Google Sheet → **Extensions → Apps Script** → paste `google-apps-script.gs`
   (the four file IDs are already filled in) → **Save**.
2. **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy.** (URL stays the same.)
3. The **first time an email is sent**, Google asks you to authorise Gmail — **allow it**. Emails
   go from your Gmail address (≈100/day limit on a free account).
4. Put the Web app `/exec` URL in `index.html` on the `CLOUD_URL` line, and keep `SHEET_TOKEN`
   equal to `SHARED_TOKEN`. Upload `index.html` to GitHub Pages.
5. (Optional, free) Triggers (clock icon) → Add trigger → **keepWarm**, Time-driven, every 5 min.

## Notes

- Column headings are auto-detected; the headings above are the safe set.
- Data is served only to a signed-in listed email and limited to that person's CRNs.
- Sign-in and emails only work on the **live GitHub site** — previews block calls to Google.
- Emails come from Gmail for now; they can be moved to your HCT Outlook via Power Automate later
  without changing the app.
