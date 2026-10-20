/**
 * CIS Grade Tracker — Google Sheet backend
 *
 * This script is bound to the grade-data Google Sheet (the one that holds the "Data" tab).
 * It also reads two other files in your Drive by their IDs:
 *   - ACCESS_FILE_ID   : the registered-faculty list (email -> staff ID)
 *   - COURSES_FILE_ID  : all course sections, each tagged with the instructor's staff ID
 *
 * What it does:
 *   - Sign-in: checks an email against the access list (the list never reaches the page).
 *   - Courses: returns ONLY the courses whose ID matches the signed-in instructor.
 *   - Data: serves/saves grade rows only for signed-in faculty, limited to their own CRNs.
 *
 * Setup / redeploy:
 *   Extensions -> Apps Script -> paste this file -> Save ->
 *   Deploy -> Manage deployments -> edit -> Version: New version -> Who has access: Anyone -> Deploy.
 *
 * Optional speed-up (free): Triggers (clock icon) -> Add trigger -> function keepWarm,
 *   event source Time-driven, Minutes timer, every 5 minutes. Keeps the lists cached and warm.
 */

var SHEET_NAME = 'Data';

// Shared passcode — must match SHEET_TOKEN in index.html (change both together).
var SHARED_TOKEN = 'HCTCIS-202610-4a9f2e7c1b6d';

// Registered-faculty list (file ID from its URL): email + staff ID (+ name if present).
var ACCESS_FILE_ID = '1kZ7jXx1YLm-IOmj5JzNZ10tckUSOlLyhrGkdKpPA9BM';

// All courses, each row tagged with the instructor's staff ID (column heading "ID").
var COURSES_FILE_ID = '14l8dvhgC6_FDLeRf7mnxnc4XiarguHszFZ32vNpsiNg';

var CACHE_SECONDS = 300; // lists are cached for 5 minutes for speed

/* ---------------- access list (email -> {id, name}) ---------------- */
function accessMap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('access_v2');
  if (hit) return JSON.parse(hit);
  var map = {};
  var ss = SpreadsheetApp.openById(ACCESS_FILE_ID);
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var v = sheets[s].getDataRange().getValues();
    if (v.length < 2) continue;
    var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
    var ec = -1, ic = -1, nc = -1;
    for (var c = 0; c < h.length; c++) if (ec < 0 && h[c].indexOf('email') >= 0) ec = c;
    if (ec < 0) continue;
    for (var c2 = 0; c2 < h.length; c2++) if (ic < 0 && c2 !== ec && (h[c2] === 'id' || h[c2].indexOf('id') >= 0)) ic = c2;
    for (var c3 = 0; c3 < h.length; c3++) if (nc < 0 && h[c3].indexOf('name') >= 0) nc = c3;
    for (var r = 1; r < v.length; r++) {
      var em = String(v[r][ec]).trim().toLowerCase();
      if (!em) continue;
      map[em] = { id: ic >= 0 ? String(v[r][ic]).trim() : '', name: nc >= 0 ? String(v[r][nc]).trim() : '' };
    }
    break; // first sheet that has an email column
  }
  cache.put('access_v2', JSON.stringify(map), CACHE_SECONDS);
  return map;
}
function findAccess_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  var m = accessMap_();
  return Object.prototype.hasOwnProperty.call(m, email) ? m[email] : null;
}

/* ---------------- courses (live, cached) ---------------- */
function readCourses_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('courses_v2');
  if (hit) return JSON.parse(hit);
  var out = [];
  var ss = SpreadsheetApp.openById(COURSES_FILE_ID);
  var sh = ss.getSheets()[0];
  var v = sh.getDataRange().getValues();
  if (v.length >= 2) {
    var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
    function col(preds) { for (var c = 0; c < h.length; c++) for (var p = 0; p < preds.length; p++) if (preds[p](h[c])) return c; return -1; }
    var campusC = col([function (x) { return x === 'campus'; }, function (x) { return x.indexOf('campus') >= 0; }]);
    var codeC = col([function (x) { return x.indexOf('course code') >= 0; }, function (x) { return x === 'code'; }, function (x) { return x.indexOf('code') >= 0; }]);
    var nameC = col([function (x) { return x.indexOf('course name') >= 0; }, function (x) { return x.indexOf('course title') >= 0; }, function (x) { return x === 'name' || x === 'title'; }]);
    var instrC = col([function (x) { return x.indexOf('instructor') >= 0; }, function (x) { return x.indexOf('faculty') >= 0; }, function (x) { return x.indexOf('lecturer') >= 0; }]);
    var crnC = col([function (x) { return x === 'crn'; }, function (x) { return x.indexOf('crn') >= 0; }]);
    var studC = col([function (x) { return x.indexOf('student') >= 0; }, function (x) { return x.indexOf('enroll') >= 0; }, function (x) { return x.indexOf('num') >= 0; }]);
    var idC = col([function (x) { return x === 'id'; }, function (x) { return x.indexOf('staff id') >= 0; }, function (x) { return x.indexOf('instructor id') >= 0; }, function (x) { return x.indexOf('faculty id') >= 0; }, function (x) { return x.indexOf('id') >= 0 && x.indexOf('email') < 0; }]);
    for (var r = 1; r < v.length; r++) {
      var crn = crnC >= 0 ? String(v[r][crnC]).trim() : '';
      if (!crn) continue;
      out.push({
        campus: campusC >= 0 ? String(v[r][campusC]).trim() : '',
        code: codeC >= 0 ? String(v[r][codeC]).trim() : '',
        name: nameC >= 0 ? String(v[r][nameC]).trim() : '',
        instructor: instrC >= 0 ? String(v[r][instrC]).trim() : '',
        crn: crn,
        students: studC >= 0 ? v[r][studC] : '',
        id: idC >= 0 ? String(v[r][idC]).trim() : ''
      });
    }
  }
  cache.put('courses_v2', JSON.stringify(out), CACHE_SECONDS);
  return out;
}
function myCrnSet_(id) {
  var set = {};
  readCourses_().forEach(function (c) { if (String(c.id) === String(id)) set[String(c.crn)] = true; });
  return set;
}

/* ---------------- endpoints ---------------- */
function handleAuth_(e) {
  try {
    var acc = findAccess_(e && e.parameter ? e.parameter.email : '');
    if (!acc) return json_({ ok: true, authorized: false });
    return json_({ ok: true, authorized: true, instructorId: acc.id, name: acc.name });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function handleCourses_(e) {
  try {
    var acc = findAccess_(e && e.parameter ? e.parameter.email : '');
    if (!acc) return json_({ ok: true, authorized: false });
    var mine = readCourses_().filter(function (c) { return String(c.id) === String(acc.id); });
    return json_({ ok: true, authorized: true, id: acc.id, name: acc.name, courses: mine });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : '';
  if (action === 'auth') return handleAuth_(e);
  if (action === 'courses') return handleCourses_(e);

  // Default: grade data — only for a signed-in faculty email, limited to their own CRNs.
  try {
    var acc = findAccess_(e && e.parameter ? e.parameter.email : '');
    if (!acc) return json_({ ok: false, error: 'unauthorized' });
    var sh = getSheet_();
    var values = sh.getLastRow() ? sh.getDataRange().getValues() : [];
    if (values.length > 1) {
      var mine = myCrnSet_(acc.id);
      var crnCol = values[0].indexOf('CRN'); if (crnCol < 0) crnCol = 4;
      var filtered = [values[0]];
      for (var i = 1; i < values.length; i++) if (mine[String(values[i][crnCol])]) filtered.push(values[i]);
      values = filtered;
    }
    return json_({ ok: true, values: values });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== SHARED_TOKEN) return json_({ ok: false, error: 'unauthorized' });
    if (!findAccess_(body.email)) return json_({ ok: false, error: 'unauthorized' }); // must be signed-in faculty
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

    if (sh.getLastRow() === 0 && headers.length) {
      sh.appendRow(headers.concat(['Timestamp']));
    }

    var firstRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var crnCol = firstRow.indexOf('CRN') + 1;
    if (crnCol === 0) crnCol = 5;

    var tsCol = firstRow.indexOf('Timestamp') + 1;
    if (tsCol === 0) { tsCol = sh.getLastColumn() + 1; sh.getRange(1, tsCol).setValue('Timestamp'); }

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

    var existingTs = isNew ? '' : sh.getRange(targetRow, tsCol).getValue();
    if (isNew || !existingTs) sh.getRange(targetRow, tsCol).setValue(new Date());

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Optional: run on a 5-minute time trigger to keep the lists cached and the script warm.
function keepWarm() {
  try { accessMap_(); readCourses_(); } catch (e) {}
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
