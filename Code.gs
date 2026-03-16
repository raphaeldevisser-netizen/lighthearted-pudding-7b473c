// ============================================================
// CFE HERITAGE MAP — Google Apps Script Backend
// ============================================================

var SHEET_ID     = '1I2wUtOD1huIsQmcEtGYNNWZd3KU37eAWc-YvePYzCEA';
var NOTIFY_EMAIL = 'CFEdigitalhub' + '@' + 'gmail.com';
var HEADERS      = ['id','name','name_contact','email','company','year','type',
                    'works','location_name','lat','lng','country','photos','status','submitted_at'];

function doPost(e) {
  try {
    var data;

    // Method 1: JSON body (fetch with application/json)
    if (e.postData && e.postData.type === 'application/json') {
      data = JSON.parse(e.postData.contents);

    // Method 2: URL-encoded form field named 'payload'
    } else if (e.parameter && e.parameter.payload) {
      data = JSON.parse(decodeURIComponent(e.parameter.payload));

    // Method 3: Raw post body that is URL-encoded
    } else if (e.postData && e.postData.contents) {
      var raw = e.postData.contents;
      // Check if it looks like url-encoded
      if (raw.indexOf('payload=') === 0) {
        var jsonStr = decodeURIComponent(raw.replace('payload=', ''));
        data = JSON.parse(jsonStr);
      } else {
        data = JSON.parse(raw);
      }
    } else {
      Logger.log('No data received. e.parameter: ' + JSON.stringify(e.parameter));
      return respond('error: no data');
    }

    if (data.action === 'updateStatus') {
      updateProjectStatus(data.id, data.status);
      return respond('ok');
    }

    if (data.action === 'delete') {
      deleteProject(data.id);
      return respond('ok');
    }

    if (data.action === 'addPhoto') {
      addPhotoToProject(data.projectKey, data.photoData, data.photoIndex);
      return respond('ok');
    }

    // New submission
    var sheet = getSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    }

    var photoLinks = savePhotos(data.photos || []);
    var id = 'proj_' + new Date().getTime();

    sheet.appendRow([
      id,
      data.name          || '',
      data.name_contact  || '',
      data.email         || '',
      data.company       || '',
      data.year          || '',
      data.type          || '',
      data.works         || '',
      data.location_name || '',
      data.lat           || '',
      data.lng           || '',
      data.country       || '',
      photoLinks,
      'pending',
      data.submitted_at  || new Date().toISOString()
    ]);

    Logger.log('Row written for: ' + data.name);

    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: '[CFE Heritage Map] New submission: ' + (data.name || 'Unnamed'),
      body:    buildEmailBody(data)
    });

    if (data.email && data.email.indexOf('@') > -1) {
      MailApp.sendEmail({
        to:      data.email,
        subject: 'CFE Heritage Map — Submission received',
        body:    'Dear ' + (data.name_contact || 'submitter') + ',\n\n'
               + 'Thank you for submitting "' + data.name + '" to the CFE Heritage Map.\n\n'
               + 'Our team will review your submission. Once approved it will appear on the map.\n\n'
               + 'Best regards,\nThe CFE Heritage Team'
      });
    }

    return respond('ok');

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    Logger.log('postData contents: ' + (e.postData ? e.postData.contents : 'none'));
    Logger.log('parameters: ' + JSON.stringify(e.parameter));
    return respond('error: ' + err.toString());
  }
}

function doGet(e) {
  var callback = e.parameter.callback || '';
  var action   = e.parameter.action  || '';

  if (action === 'list') {
    try {
      var sheet = getSheet();
      var rows  = sheet.getDataRange().getValues();
      if (rows.length < 2) {
        return respondJSON({projects: []}, callback);
      }
      var hdrs     = rows[0];
      var projects = rows.slice(1).map(function(row) {
        var obj = {};
        hdrs.forEach(function(h, i) {
          obj[h] = row[i] !== undefined ? String(row[i]) : '';
        });
        return obj;
      });
      return respondJSON({projects: projects}, callback);
    } catch (err) {
      Logger.log('doGet error: ' + err.toString());
      return respondJSON({projects: [], error: err.toString()}, callback);
    }
  }

  return respondJSON({status: 'CFE Heritage Map API running'}, callback);
}

function updateProjectStatus(id, status) {
  var sheet     = getSheet();
  var data      = sheet.getDataRange().getValues();
  var hdrs      = data[0];
  var idCol     = hdrs.indexOf('id');
  var statusCol = hdrs.indexOf('status');
  if (idCol === -1 || statusCol === -1) return;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.getRange(i + 1, statusCol + 1).setValue(status);
      return;
    }
  }
}

function deleteProject(id) {
  var sheet = getSheet();
  var data  = sheet.getDataRange().getValues();
  var hdrs  = data[0];
  var idCol = hdrs.indexOf('id');
  if (idCol === -1) return;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function savePhotos(photos) {
  if (!photos || photos.length === 0) return '';
  var folder;
  try {
    var folders = DriveApp.getFoldersByName('CFE Heritage Photos');
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('CFE Heritage Photos');
  } catch (e) { return ''; }
  var links = [];
  for (var i = 0; i < photos.length; i++) {
    try {
      var match = String(photos[i]).match(/^data:(.+);base64,(.+)$/);
      if (!match) continue;
      var blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], 'cfe_photo_' + i + '.jpg');
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      links.push('https://drive.google.com/uc?id=' + file.getId());
    } catch (err) {
      Logger.log('Photo error: ' + err.toString());
    }
  }
  return links.join('|');
}

function addPhotoToProject(projectKey, photoData, photoIndex) {
  try {
    var folder;
    var folders = DriveApp.getFoldersByName('CFE Heritage Photos');
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('CFE Heritage Photos');

    var match = String(photoData).match(/^data:(.+);base64,(.+)$/);
    if (!match) return;
    var blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], 'photo_' + photoIndex + '.jpg');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://drive.google.com/uc?id=' + file.getId();

    // Find the matching row and append photo URL
    var sheet = getSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var nameCol = headers.indexOf('name_contact');
    var submittedCol = headers.indexOf('submitted_at');
    var photosCol = headers.indexOf('photos');

    for (var i = 1; i < data.length; i++) {
      var rowKey = data[i][nameCol] + '_' + data[i][submittedCol];
      if (rowKey === projectKey) {
        var existing = data[i][photosCol] ? String(data[i][photosCol]) : '';
        var updated = existing ? existing + '|' + url : url;
        sheet.getRange(i + 1, photosCol + 1).setValue(updated);
        Logger.log('Photo added to row ' + (i+1));
        return;
      }
    }
    Logger.log('Project not found for key: ' + projectKey);
  } catch(err) {
    Logger.log('addPhoto error: ' + err.toString());
  }
}

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
}

function respond(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

function respondJSON(obj, callback) {
  var json   = JSON.stringify(obj);
  var output = callback ? callback + '(' + json + ')' : json;
  var mime   = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(output).setMimeType(mime);
}

function buildEmailBody(data) {
  return 'New project submitted to the CFE Heritage Map.\n\n'
    + '--- PROJECT ---\n'
    + 'Name:     ' + (data.name          || '') + '\n'
    + 'Year:     ' + (data.year          || '') + '\n'
    + 'Type:     ' + (data.type          || '') + '\n'
    + 'Location: ' + (data.location_name || '') + '\n'
    + 'Coords:   ' + (data.lat || '') + ', ' + (data.lng || '') + '\n\n'
    + '--- SUBMITTED BY ---\n'
    + 'Name:     ' + (data.name_contact  || '') + '\n'
    + 'Email:    ' + (data.email         || '') + '\n'
    + 'Company:  ' + (data.company       || '') + '\n\n'
    + '--- WORKS ---\n'
    + (data.works || 'Not provided') + '\n\n'
    + 'Review: https://raphaeldevisser-netizen.github.io/lighthearted-pudding-7b473c/cfe-admin.html';
}

function testSheetAccess() {
  try {
    var sheet = getSheet();
    Logger.log('Sheet: ' + sheet.getName() + ', Rows: ' + sheet.getLastRow());
    sheet.appendRow(['TEST_ROW', 'test', '', '', '', '', '', '', '', '', '', '', '', 'test', new Date().toISOString()]);
    Logger.log('SUCCESS - test row written');
  } catch (err) {
    Logger.log('FAILED: ' + err.toString());
  }
}
