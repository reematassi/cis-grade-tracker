/**
 * CIS Grade Tracker — Google Sheet backend
 *
 * One-time setup:
 *   1. Create a Google Sheet (this will hold all users' data).
 *   2. In the Sheet: Extensions -> Apps Script.
 *   3. Delete any sample code, paste ALL of this file, and Save.
 *   4. Deploy -> New deployment -> type "Web app".
 *        - Execute as:  Me
 *        - Who has access:  Anyone
 *      Deploy, authorise, and copy the Web app URL (ends in /exec).
 *   5. Paste that URL into the app (Cloud button -> Save URL), or into the
 *      CLOUD_URL constant at the top of index.html before uploading to GitHub.
 *
 * The app sends each section as {crn, headers, row}. Rows are upserted by CRN:
 * an existing CRN is updated in place, a new CRN is appended. A GET returns all
 * rows so the app can load the combined data back.
 */

var SHEET_NAME = 'Data';

// Shared passcode — must match SHEET_TOKEN in index.html (change both together).
// Saves that do not carry this exact token are rejected.
var SHARED_TOKEN = 'HCTCIS-202610-4a9f2e7c1b6d';

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== SHARED_TOKEN) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    var sh = getSheet_();
    var headers = body.headers || [];
    var row = body.row || [];

    // Write the header row once.
    if (sh.getLastRow() === 0 && headers.length) {
      sh.appendRow(headers);
    }

    var firstRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var crnCol = firstRow.indexOf('CRN') + 1;
    if (crnCol === 0) crnCol = 5; // fallback: CRN is the 5th column

    // Find an existing row for this CRN.
    var targetRow = -1;
    var last = sh.getLastRow();
    if (last > 1) {
      var crns = sh.getRange(2, crnCol, last - 1, 1).getValues();
      for (var i = 0; i < crns.length; i++) {
        if (String(crns[i][0]) === String(body.crn)) { targetRow = i + 2; break; }
      }
    }

    if (targetRow > 0) {
      sh.getRange(targetRow, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  // Reading is intentionally disabled: no one can pull the data from this URL.
  // The data lives only in the Google Sheet, which only the owner can open and download.
  return ContentService
    .createTextOutput('This endpoint accepts submissions only. No data is available here.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
