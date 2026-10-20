/**
 * CIS Grade Tracker — Google Sheet backend (band-count + APC email workflow)
 *
 * Bound to the grade-data Google Sheet (holds the "Data" tab). Reads these files by ID:
 *   ACCESS_FILE_ID        : registered faculty  (email -> staff ID, optional name)
 *   COURSES_FILE_ID       : course sections     (Campus, Course Code, Course Title, CRN, Num Students, ID, Program)
 *   APC_FILE_ID           : APC per program     (Program -> APC email, optional name)
 *   COURSE_ASSESS_FILE_ID : assessments/course  (Course Code -> assessment names)
 *
 * On submit: writes one row per (CRN + Assessment) and emails the APC for that program
 * (red = outside range -> APC for review; green = within range -> confirmation to faculty).
 *
 * Redeploy after changes: Deploy -> Manage deployments -> edit -> Version: New version -> Deploy.
 * The first email send will ask you to authorise Gmail — allow it.
 * Optional speed-up: Triggers -> Add trigger -> keepWarm, Time-driven, every 5 minutes.
 */

var SHEET_NAME = 'Data';
var SHARED_TOKEN = 'HCTCIS-202610-4a9f2e7c1b6d';

var ACCESS_FILE_ID        = '1kZ7jXx1YLm-IOmj5JzNZ10tckUSOlLyhrGkdKpPA9BM';
var COURSES_FILE_ID       = '14l8dvhgC6_FDLeRf7mnxnc4XiarguHszFZ32vNpsiNg';
var APC_FILE_ID           = '1SPbsAcoGsZtkuoqSVqYnGHxSi7SUbQ2gi-u0EmTAiB0';
var COURSE_ASSESS_FILE_ID = '1RkFw-baGqzJVRipqO-IwdBM2aN_4dMDMSHNKfGlucXQ';

var CACHE_SECONDS = 300;
var CAPS = { a: 25, b: 35, f: 20 };

/* ---------------- access list ---------------- */
function accessMap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('access_v2');
  if (hit) return JSON.parse(hit);
  var map = {};
  var sheets = SpreadsheetApp.openById(ACCESS_FILE_ID).getSheets();
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
      if (em) map[em] = { id: ic >= 0 ? String(v[r][ic]).trim() : '', name: nc >= 0 ? String(v[r][nc]).trim() : '' };
    }
    break;
  }
  try { cache.put('access_v2', JSON.stringify(map), CACHE_SECONDS); } catch (e) {}
  return map;
}
function findAccess_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  var m = accessMap_();
  return Object.prototype.hasOwnProperty.call(m, email) ? m[email] : null;
}

/* ---------------- courses ---------------- */
function readCourses_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('courses_v3');
  if (hit) return JSON.parse(hit);
  var out = [];
  var v = SpreadsheetApp.openById(COURSES_FILE_ID).getSheets()[0].getDataRange().getValues();
  if (v.length >= 2) {
    var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
    function col(preds) { for (var c = 0; c < h.length; c++) for (var p = 0; p < preds.length; p++) if (preds[p](h[c])) return c; return -1; }
    var campusC = col([function (x) { return x.indexOf('campus') >= 0; }]);
    var codeC = col([function (x) { return x.indexOf('course code') >= 0; }, function (x) { return x === 'code'; }, function (x) { return x.indexOf('code') >= 0; }]);
    var nameC = col([function (x) { return x.indexOf('title') >= 0; }, function (x) { return x.indexOf('course name') >= 0; }, function (x) { return x === 'name'; }]);
    var instrC = col([function (x) { return x.indexOf('instructor') >= 0; }, function (x) { return x.indexOf('faculty') >= 0; }, function (x) { return x.indexOf('lecturer') >= 0; }]);
    var crnC = col([function (x) { return x === 'crn'; }, function (x) { return x.indexOf('crn') >= 0; }]);
    var studC = col([function (x) { return x.indexOf('student') >= 0; }, function (x) { return x.indexOf('enroll') >= 0; }, function (x) { return x.indexOf('num') >= 0; }]);
    var progC = col([function (x) { return x.indexOf('program') >= 0; }, function (x) { return x.indexOf('programme') >= 0; }]);
    var idC = col([function (x) { return x === 'id'; }, function (x) { return x.indexOf('staff id') >= 0; }, function (x) { return x.indexOf('instructor id') >= 0; }, function (x) { return x.indexOf('id') >= 0 && x.indexOf('email') < 0; }]);
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
        program: progC >= 0 ? String(v[r][progC]).trim() : '',
        id: idC >= 0 ? String(v[r][idC]).trim() : ''
      });
    }
  }
  try { cache.put('courses_v3', JSON.stringify(out), CACHE_SECONDS); } catch (e) {}
  return out;
}

/* ---------------- assessments per course ---------------- */
// Returns { assessments: {code -> ["Name, Week, Weight", ...]}, programs: {code -> program} }.
// The assessments sheet has one row per course-assessment with separate Name / Week / Weight
// columns; each assessment is composed into a single "Name, Week, Weight" label.
function readAssessMap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('assess_v2');
  if (hit) return JSON.parse(hit);
  var map = {}, programs = {};
  var v = SpreadsheetApp.openById(COURSE_ASSESS_FILE_ID).getSheets()[0].getDataRange().getValues();
  if (v.length >= 2) {
    var h = v[0].map(function (x) { return String(x).trim(); });
    var hl = h.map(function (x) { return x.toLowerCase(); });
    function find(preds) { for (var c = 0; c < hl.length; c++) for (var p = 0; p < preds.length; p++) if (preds[p](hl[c])) return c; return -1; }
    var codeC = find([function (x) { return x.indexOf('code') >= 0; }]);
    var nameC = find([function (x) { return x.indexOf('assessment') >= 0; }, function (x) { return x.indexOf('tool') >= 0; }, function (x) { return x === 'name' || x === 'type'; }]);
    var weekC = find([function (x) { return x.indexOf('week') >= 0; }]);
    var wtC = find([function (x) { return x.indexOf('weight') >= 0; }, function (x) { return x.indexOf('percent') >= 0; }, function (x) { return x.indexOf('%') >= 0; }]);
    var progC = find([function (x) { return x.indexOf('program') >= 0 || x.indexOf('programme') >= 0; }]);
    for (var r = 1; r < v.length; r++) {
      var code = codeC >= 0 ? String(v[r][codeC]).trim() : '';
      if (!code) continue;
      if (!map[code]) map[code] = [];
      if (progC >= 0 && !programs[code]) { var pg = String(v[r][progC]).trim(); if (pg) programs[code] = pg; }
      if (nameC >= 0) {
        var nm = String(v[r][nameC]).trim();
        var wk = weekC >= 0 ? String(v[r][weekC]).trim() : '';
        var wt = wtC >= 0 ? String(v[r][wtC]).trim() : '';
        if (wk && /^\d+$/.test(wk)) wk = 'Week' + ('0' + wk).slice(-2);
        if (wt && /^\d+(\.\d+)?$/.test(wt)) wt = wt + '%';
        var label = [nm, wk, wt].filter(function (x) { return x !== ''; }).join(', ');
        if (label && /[A-Za-z0-9]/.test(label) && map[code].indexOf(label) < 0) map[code].push(label);
      } else {
        // Fallback: no recognisable name column — keep each non-meta cell intact.
        for (var cc = 0; cc < h.length; cc++) {
          if (cc === codeC || hl[cc].indexOf('code') >= 0 || hl[cc].indexOf('program') >= 0 || hl[cc] === 'id') continue;
          var cell = String(v[r][cc]).trim();
          if (cell && /[A-Za-z]/.test(cell) && map[code].indexOf(cell) < 0) map[code].push(cell);
        }
      }
    }
  }
  var out = { assessments: map, programs: programs };
  try { cache.put('assess_v2', JSON.stringify(out), CACHE_SECONDS); } catch (e) {}
  return out;
}

/* ---------------- APC per program ---------------- */
function apcMap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('apc_v1');
  if (hit) return JSON.parse(hit);
  var map = {};
  var sheets = SpreadsheetApp.openById(APC_FILE_ID).getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var v = sheets[s].getDataRange().getValues();
    if (v.length < 2) continue;
    var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
    var pc = -1, ec = -1, nc = -1;
    for (var c = 0; c < h.length; c++) if (pc < 0 && (h[c].indexOf('program') >= 0 || h[c].indexOf('programme') >= 0)) pc = c;
    for (var c2 = 0; c2 < h.length; c2++) if (ec < 0 && h[c2].indexOf('email') >= 0) ec = c2;
    for (var c3 = 0; c3 < h.length; c3++) if (nc < 0 && h[c3].indexOf('name') >= 0) nc = c3;
    if (pc < 0 || ec < 0) continue;
    for (var r = 1; r < v.length; r++) {
      var pg = String(v[r][pc]).trim().toLowerCase();
      if (pg) map[pg] = { email: String(v[r][ec]).trim(), name: nc >= 0 ? String(v[r][nc]).trim() : '' };
    }
    break;
  }
  try { cache.put('apc_v1', JSON.stringify(map), CACHE_SECONDS); } catch (e) {}
  return map;
}
function apcLookup_(program) {
  program = String(program || '').trim().toLowerCase();
  if (!program) return null;
  var m = apcMap_();
  return Object.prototype.hasOwnProperty.call(m, program) ? m[program] : null;
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
    var amap = readAssessMap_();
    var mine = readCourses_().filter(function (c) { return String(c.id) === String(acc.id); });
    mine.forEach(function (c) {
      c.assessments = amap.assessments[c.code] || [];
      if (!c.program) c.program = amap.programs[c.code] || '';
    });
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
  try {
    var acc = findAccess_(e && e.parameter ? e.parameter.email : '');
    if (!acc) return json_({ ok: false, error: 'unauthorized' });
    var sh = getSheet_();
    var values = sh.getLastRow() ? sh.getDataRange().getValues() : [];
    if (values.length > 1) {
      var mine = {};
      readCourses_().forEach(function (c) { if (String(c.id) === String(acc.id)) mine[String(c.crn)] = true; });
      var crnCol = values[0].indexOf('CRN'); if (crnCol < 0) crnCol = 5;
      var filtered = [values[0]];
      for (var i = 1; i < values.length; i++) if (mine[String(values[i][crnCol])]) filtered.push(values[i]);
      values = filtered;
    }
    return json_({ ok: true, values: values });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== SHARED_TOKEN) return json_({ ok: false, error: 'unauthorized' });
    if (!findAccess_(body.email)) return json_({ ok: false, error: 'unauthorized' });
    var sh = getSheet_();

    if (body.action === 'delete') {
      removeRow_(sh, body.crn, body.assessment);
      return json_({ ok: true, deleted: true });
    }

    // submit — APPEND every submission as its own row (full audit trail; the Timestamp
    // differentiates records). We never overwrite earlier entries.
    var headers = body.headers || [];
    var row = body.row || [];
    if (sh.getLastRow() === 0 && headers.length) sh.appendRow(headers);

    // Fill the server-authoritative columns by heading, so the APC email is resolved here
    // (guarantees the right APC per course even when several courses are entered in one session).
    var apc = apcLookup_(body.program);
    function put(name, val) { var i = headers.indexOf(name); if (i >= 0) row[i] = val; }
    put('Program', body.program || '');
    put('APC Email', apc && apc.email ? apc.email : '');
    put('APC Name', apc && apc.name ? apc.name : '');
    put('Timestamp', new Date());
    put('Status', body.status || '');

    sh.appendRow(row);

    var emailed = sendEmails_(body, apc);
    return json_({ ok: true, emailed: emailed, apc: apc && apc.email ? apc.email : '' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sh, crnCol, asCol, crn, assess) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][crnCol]) === String(crn) && String(data[i][asCol]) === String(assess)) return i + 2;
  }
  return -1;
}
function removeRow_(sh, crn, assess) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var fr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var crnCol = fr.indexOf('CRN'); if (crnCol < 0) crnCol = 5;
  var asCol = fr.indexOf('Assessment'); if (asCol < 0) asCol = 8;
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][crnCol]) === String(crn) && String(data[i][asCol]) === String(assess)) sh.deleteRow(i + 2);
  }
}

/* ---------------- email ---------------- */
function sendEmails_(body, apc) {
  try {
    if (apc === undefined) apc = apcLookup_(body.program);
    var H = body.headers || [], row = body.row || [];
    function g(name) { var i = H.indexOf(name); return i >= 0 ? row[i] : ''; }
    var red = !!body.red;
    var faculty = body.email;
    var code = g('Course Code');
    var subject = (red ? '[Approval needed] ' : '[Submitted] ') + code + ' CRN ' + body.crn + ' — ' + body.assessment + ' grade distribution';
    var html = emailBody_(body, apc, red);

    if (red) {
      // OUT OF RANGE → APC is the main recipient, the instructor is copied.
      MailApp.sendEmail({
        to: (apc && apc.email) ? apc.email : faculty,
        cc: (apc && apc.email) ? faculty : '',
        subject: subject, htmlBody: html, name: 'CIS Grade Tracker', replyTo: faculty
      });
    } else {
      // WITHIN RANGE → confirmation to the instructor only.
      MailApp.sendEmail({ to: faculty, subject: subject, htmlBody: html, name: 'CIS Grade Tracker' });
    }
    return true;
  } catch (e) { return false; }
}
function emailBody_(body, apc, red) {
  var H = body.headers || [], row = body.row || [];
  function g(name) { var i = H.indexOf(name); return i >= 0 ? row[i] : ''; }
  var rows = [
    ['Course', g('Course Code') + ' — ' + g('Course Name')],
    ['CRN', body.crn], ['Program', body.program || ''],
    ['Assessment', body.assessment], ['Enrolled students', g('Num Students')],
    ['A / A- band', g('% A band') + '  (cap ' + CAPS.a + '%)'],
    ['B+ / B / B- band', g('% B band') + '  (cap ' + CAPS.b + '%)'],
    ['F band', g('% F band') + '  (cap ' + CAPS.f + '%)'],
    ['Faculty', g('Faculty Name') + ' <' + g('Faculty Email') + '>'],
    ['Status', g('Status')]
  ];
  if (red) rows.push(['Justification', body.justification || '']);
  var table = rows.map(function (p) {
    return '<tr><td style="padding:4px 10px;color:#566782;white-space:nowrap">' + p[0] +
      '</td><td style="padding:4px 10px;font-weight:600">' + String(p[1] == null ? '' : p[1]) + '</td></tr>';
  }).join('');
  var intro = red
    ? 'The following grade distribution was submitted <b>outside the accepted range</b> for one or more bands and needs your review'
      + (apc ? ' (' + apc.name + ')' : '') + '. The instructor has provided a justification below. Please review and follow up with the instructor as needed.'
    : 'Thank you for submitting your grade distribution. All bands are <b>within the accepted range</b>. You may go ahead and post your grades in the official system.';
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f1b2d">' +
    '<p>' + intro + '</p>' +
    '<table style="border-collapse:collapse;border:1px solid #dbe5f1;border-radius:8px">' + table + '</table>' +
    '<p style="color:#8a96a8;font-size:12px;margin-top:14px">Sent automatically by the CIS Grade Tracker.</p></div>';
}

function keepWarm() { try { accessMap_(); readCourses_(); readAssessMap_(); apcMap_(); } catch (e) {} }

// Run this ONCE from the editor (Run button) to authorise Gmail sending and confirm it works.
// It sends a test email to you. After this, the app's automatic emails will go out.
function sendTestEmail() {
  var me = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: me,
    subject: 'CIS Grade Tracker — test email',
    htmlBody: '<p>If you received this, Gmail sending is authorised and the app can send APC notifications.</p>',
    name: 'CIS Grade Tracker'
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
