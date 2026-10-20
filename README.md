# CIS Grade Tracker — 202610

A single-page web app for HCT CIS / Applied Data Science faculty to record assessment plans by
course section (CRN). Faculty sign in with their HCT email, see **only the courses assigned to
them**, and enter each section's assessment details. Everything is stored centrally in Google
Sheets; the course list and access list are read **live** from Drive, so updating a sheet updates
the app with no code change.

## How it works

```
Browser (GitHub Pages, static index.html)
        │  email / data / courses  (HTTPS)
        ▼
Google Apps Script Web App  ──reads──►  Access sheet   (email → staff ID)
   (runs as you)            ──reads──►  Courses sheet  (sections tagged with staff ID)
                            ──writes─►  Data sheet     (the entered grades; this file)
```

1. **Sign in** — the app asks for an HCT email and checks it against the access sheet
   **server-side** (the list never appears on the page). Unregistered emails are refused with
   "Your email is not registered. Please contact your course team leader."
2. **My courses** — after sign-in the app loads, live from the courses sheet, only the sections
   whose **ID** matches the signed-in instructor.
3. **Enter data** — five blocks per CRN (CW1, CW2, CW3, Final Assessment, Final Grade), each with
   Assessment Tool, Week, Weight, % A/A-, % B+/B/B-, % F, Post-moderation done, plus Comments.
   Percentages accept numbers only (0–100). A record is **saved to the sheet only when every field
   is complete**; until then it shows a "Not saved" notice listing what's missing.
4. **Timestamp** — the Data sheet stamps the date/time each record was first added (uneditable).
5. **Privacy** — grade data is served only to signed-in faculty and limited to their own CRNs.
   There is no download button; only you (the sheet owner) can download the full data.

## The three files

| Purpose | Where | Notes |
|---|---|---|
| **Data** (entered grades) | the Google Sheet this script is bound to | tab named `Data`, created on first save |
| **Access list** | separate Google Sheet | columns: an **email** column and an **ID** (staff ID) column; a **name** column is optional |
| **Courses** | separate Google Sheet | columns: **Campus, Course Code, Course Name, Instructor, CRN, Num. Students, ID** |

The access `ID` and the courses `ID` must use the **same staff-ID values** — that's the link.
Column headings are auto-detected, but keeping the headings above avoids surprises.

File IDs are set near the top of `google-apps-script.gs`:
```js
var ACCESS_FILE_ID  = '1kZ7jXx1YLm-IOmj5JzNZ10tckUSOlLyhrGkdKpPA9BM';
var COURSES_FILE_ID = '14l8dvhgC6_FDLeRf7mnxnc4XiarguHszFZ32vNpsiNg';
```
To update data later, **edit the same sheets** (don't upload a new file — that changes the ID).

## Setup

1. Open the **Data** Google Sheet → **Extensions → Apps Script**.
2. Paste all of `google-apps-script.gs`, set the two file IDs above, and **Save**.
3. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone** →
   **Deploy** → authorise → copy the **Web app URL** (ends in `/exec`).
4. Put that URL in `index.html` on the `CLOUD_URL` line, and make sure `SHEET_TOKEN` in
   `index.html` matches `SHARED_TOKEN` in the script.
5. Upload `index.html` to a GitHub repo → **Settings → Pages → Deploy from branch → main /(root)**.
6. (Optional, free, faster) In Apps Script → **Triggers** (clock icon) → **Add trigger** →
   function **keepWarm**, **Time-driven**, every **5 minutes**. Keeps the lists cached and warm.

**After any script change**, redeploy with **Manage deployments → ✏️ edit → Version: New version →
Deploy** (the `/exec` URL stays the same).

## Security notes

- The access check and course filtering run on Google's side, so the email list is never exposed.
- Writes require a shared passcode (`SHEET_TOKEN` = `SHARED_TOKEN`) **and** a signed-in email.
- The passcode and script URL are visible in the page source, so this is a practical gate for an
  internal faculty tool, not strong authentication. (Email ownership isn't verified — someone who
  knows a colleague's listed email could sign in as them. A one-time email code could be added
  later if ever needed.)
- Lists are cached for ~5 minutes, so a newly added email/course can take a few minutes to appear.

## Notes

- The HCT logo is embedded in `index.html` — nothing else to upload.
- Sign-in and data only work on the live GitHub site; inside previews, calls to Google are blocked.
