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

    // Delete action: remove the row for this CRN entirely.
    if (body.action === 'delete') {
      if (sh.getLastRow() > 1) {
        var hdr0 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        var cc = hdr0.indexOf('CRN') + 1; if (cc === 0) cc = 5;
        var crnsD = sh.getRange(2, cc, sh.getLastRow() - 1, 1).getValues();
        for (var di = crnsD.length - 1; di >= 0; di--) {
          if (String(crnsD[di][0]) === String(body.crn)) sh.deleteRow(di + 2);
        }
      }
      return json_({ ok: true, deleted: true });
    }

    var headers = body.headers || [];
    var row = body.row || [];

    // Write the header row once (data columns + a server Timestamp column).
    if (sh.getLastRow() === 0 && headers.length) {
      sh.appendRow(headers.concat(['Timestamp']));
    }

    var firstRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var crnCol = firstRow.indexOf('CRN') + 1;
    if (crnCol === 0) crnCol = 5; // fallback: CRN is the 5th column

    // The Timestamp column is set by the server and is never taken from the client.
    var tsCol = firstRow.indexOf('Timestamp') + 1;
    if (tsCol === 0) { tsCol = sh.getLastColumn() + 1; sh.getRange(1, tsCol).setValue('Timestamp'); }

    // Find an existing row for this CRN.
    var targetRow = -1;
    var last = sh.getLastRow();
    if (last > 1) {
      var crns = sh.getRange(2, crnCol, last - 1, 1).getValues();
      for (var i = 0; i < crns.length; i++) {
        if (String(crns[i][0]) === String(body.crn)) { targetRow = i + 2; break; }
      }
    }
    var isNew = (targetRow < 0);
    if (isNew) targetRow = sh.getLastRow() + 1;

    if (row.length) sh.getRange(targetRow, 1, 1, row.length).setValues([row]);

    // Stamp the time the record was first added; keep it unchanged on later updates.
    var existingTs = isNew ? '' : sh.getRange(targetRow, tsCol).getValue();
    if (isNew || !existingTs) sh.getRange(targetRow, tsCol).setValue(new Date());

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  // Returns the current rows so the app can SHOW everyone what has been entered.
  // There is no download button in the app; the full file is downloaded only from this
  // Google Sheet, which only the owner can open.
  try {
    var sh = getSheet_();
    var values = sh.getLastRow() ? sh.getDataRange().getValues() : [];
    return json_({ ok: true, values: values });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
