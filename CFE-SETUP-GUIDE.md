# CFE Heritage Map — Complete Setup Guide

## What You Have

Three HTML files that work together:

* **cfe-map.html** → Public heritage map (share this URL publicly)
* **cfe-submit.html** → Public project submission form (share this URL publicly)
* **cfe-admin.html** → Private admin dashboard (keep this URL private)

\---

## Step 1: Get a Google Maps API Key (Free Tier Available)

1. Go to https://console.cloud.google.com
2. Create a new project named "CFE Heritage Map"
3. Enable these APIs:

   * Maps JavaScript API
   * Geocoding API
   * Places API
4. Go to **Credentials → Create Credentials → API Key**
5. Copy the key (starts with `AIza...`)
6. **Restrict it**: under "API restrictions", select the 3 APIs above + your domain

Replace `YOUR\_GOOGLE\_MAPS\_API\_KEY` in **all 3 HTML files** (search \& replace).

\---

## Step 2: Set Up Google Sheets as Your Database

1. Go to https://sheets.google.com and create a new spreadsheet
2. Name it: **CFE Heritage Map Projects**
3. In Row 1, add these exact column headers:

```
   id | name | name\_contact | email | company | year | type | works | location\_name | lat | lng | country | photos | status | submitted\_at
   ```

4. Go to **File → Share → Publish to web**
5. Select: Sheet 1 → CSV format → Publish
6. Copy the published URL (looks like: `https://docs.google.com/spreadsheets/d/.../pub?output=csv`)

Replace `YOUR\_PUBLISHED\_GOOGLE\_SHEETS\_CSV\_URL` in **cfe-map.html**.

\---

## Step 3: Set Up Google Apps Script (Backend + Email Notifications)

This handles: receiving form submissions, storing to Sheets, and sending email alerts.

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete the default code and paste the following:

```javascript
const SHEET\_ID = 'YOUR\_SPREADSHEET\_ID'; // from the URL of your sheet
const NOTIFY\_EMAIL = 'CFEdigitalhub@gmail.com';
const ADMIN\_URL = 'YOUR\_ADMIN\_PAGE\_URL'; // URL where you host cfe-admin.html

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === 'updateStatus') {
      updateProjectStatus(data.id, data.status);
      return ContentService.createTextOutput(JSON.stringify({success: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (data.action === 'delete') {
      deleteProject(data.id);
      return ContentService.createTextOutput(JSON.stringify({success: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // New submission
    const id = 'proj\_' + Date.now();
    const sheet = SpreadsheetApp.openById(SHEET\_ID).getActiveSheet();
    
    // Handle photo uploads (store as Drive links)
    let photoLinks = '';
    if (data.photos \&\& data.photos.length > 0) {
      const folder = getOrCreateFolder('CFE Heritage Photos');
      const links = \[];
      data.photos.forEach((base64, i) => {
        try {
          const match = base64.match(/^data:(.+);base64,(.+)$/);
          if (match) {
            const mimeType = match\[1];
            const bytes = Utilities.base64Decode(match\[2]);
            const blob = Utilities.newBlob(bytes, mimeType, `${id}\_photo${i+1}.jpg`);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE\_WITH\_LINK, DriveApp.Permission.VIEW);
            links.push('https://drive.google.com/uc?id=' + file.getId());
          }
        } catch(photoErr) { console.error('Photo error:', photoErr); }
      });
      photoLinks = links.join('|');
    }
    
    // Append to sheet
    sheet.appendRow(\[
      id, data.name, data.name\_contact, data.email, data.company,
      data.year, data.type, data.works, data.location\_name,
      data.lat, data.lng, data.country, photoLinks,
      'pending', data.submitted\_at || new Date().toISOString()
    ]);
    
    // Send notification email to CFE team
    const emailBody = `
New project submission for the CFE Heritage Map requires your review.

PROJECT: ${data.name}
Year: ${data.year}
Type: ${data.type}
Location: ${data.location\_name}
Coordinates: ${data.lat}, ${data.lng}

SUBMITTED BY:
Name: ${data.name\_contact}
Email: ${data.email}
Company: ${data.company}

WORKS DESCRIPTION:
${data.works}

Photos submitted: ${data.photos ? data.photos.length : 0}

→ Review and approve/reject this submission in the admin panel:
${ADMIN\_URL}

This is an automated notification from the CFE Heritage Map system.
    `.trim();
    
    MailApp.sendEmail({
      to: NOTIFY\_EMAIL,
      subject: `\[CFE Heritage Map] New submission: ${data.name}`,
      body: emailBody,
    });
    
    // Send confirmation to submitter
    if (data.email) {
      MailApp.sendEmail({
        to: data.email,
        subject: 'CFE Heritage Map — Submission received',
        body: `Dear ${data.name\_contact},\\n\\nThank you for submitting "${data.name}" to the CFE Heritage Map.\\n\\nOur team will review your submission and it will appear on the map once approved. This usually takes 2-5 business days.\\n\\nBest regards,\\nThe CFE Heritage Team\\nCFEdigitalhub@gmail.com`,
      });
    }
    
    return ContentService.createTextOutput(JSON.stringify({success: true, id}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(err) {
    console.error(err);
    return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  if (e.parameter.action === 'list') {
    const sheet = SpreadsheetApp.openById(SHEET\_ID).getActiveSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data\[0];
    const projects = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj\[h] = row\[i]);
      return obj;
    });
    return ContentService.createTextOutput(JSON.stringify({projects}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateProjectStatus(id, status) {
  const sheet = SpreadsheetApp.openById(SHEET\_ID).getActiveSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data\[i]\[0] === id) {
      sheet.getRange(i + 1, 14).setValue(status); // Column N = status
      break;
    }
  }
}

function deleteProject(id) {
  const sheet = SpreadsheetApp.openById(SHEET\_ID).getActiveSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data\[i]\[0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}
```

3. Replace `YOUR\_SPREADSHEET\_ID` with the ID from your sheet's URL
4. Click **Deploy → New deployment**
5. Type: **Web app**
6. Execute as: **Me**
7. Who has access: **Anyone**
8. Click **Deploy** → copy the Web App URL

Replace `YOUR\_GOOGLE\_APPS\_SCRIPT\_WEB\_APP\_URL` in **cfe-submit.html** and **cfe-admin.html**.

\---

## Step 4: Host the Files

**Option A — Netlify (Recommended, Free)**

1. Go to https://netlify.com → Sign up free
2. Drag \& drop all 3 HTML files onto the Netlify dashboard
3. You'll get URLs like: `https://your-site.netlify.app/cfe-map.html`

**Option B — GitHub Pages (Free)**

1. Create a GitHub repo
2. Upload all 3 files
3. Enable Pages in Settings → Pages → Deploy from main branch

**Option C — Your own web server**
Upload all 3 files to your server's public directory.

\---

## Step 5: Update Admin Password

In **cfe-admin.html**, find:

```javascript
ADMIN\_EMAIL: 'admin@cfe.be',
ADMIN\_PASSWORD: 'CFEheritage2025',
```

Change these to your preferred credentials.

\---

## Your Three URLs

Once hosted, you'll have:

* **🗺 Public Map**: `https://your-site.netlify.app/cfe-map.html`
* **📝 Submit Form**: `https://your-site.netlify.app/cfe-submit.html`
* **⚙️ Admin Panel**: `https://your-site.netlify.app/cfe-admin.html`

Share the first two publicly. Keep the admin URL private.

\---

## How It Works

```
Visitor submits form → Apps Script stores in Google Sheets → 
Email sent to CFEdigitalhub@gmail.com → Admin logs in to cfe-admin.html → 
Clicks "Approve" → Project appears live on cfe-map.html
```

\---

## Admin Login (Demo Mode)

Email: admin@cfe.be  
Password: CFEheritage2025

\---

## Cost Summary

* Google Maps API: Free up to 28,000 map loads/month
* Google Sheets + Apps Script: Free
* Netlify hosting: Free (up to 100GB bandwidth/month)
* **Total: £0/month for typical usage**

