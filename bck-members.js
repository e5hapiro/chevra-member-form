/**
 * -----------------------------------------------------------------
 * bck-members.js
 * Chevra Kadisha Members Form handler
 * -----------------------------------------------------------------
 * Version: 2.0.0 
 * Last updated: 2025-12-16
 * * CHANGELOG v1.0.0:
 * - Initial implementation of Selection Form.
 * 1.0.1:
 * - Replaced approval emails
 * 2.0.0:
 * - Revised, Simplified and now utilizes a mapping table in the spreadsheet
 * - Mapping table allows for dynamic changing of form fields to database mapping 
 * and includes a pending table for easy copying 
 * -----------------------------------------------------------------
 */

/** * @constant {boolean} DEBUG - Toggle for detailed logging in the Apps Script console.
 */
const DEBUG = true;

/** * @constant {number} TOKEN_COLUMN_NUMBER - The specific column index where unique tokens are stored.
 */
const TOKEN_COLUMN_NUMBER = 24;
/**
 * Development utility to simulate a Form Submit event.
 * Used for testing the `processFormSubmit` logic without needing a live form entry.
 */
function debugSubmission() {
  const eObject = {
    "authMode": "FULL",
    "namedValues": {
      "Please indicate your comfort level or interest in the following sacred tasks: [Women’s Taharah (Ritual washing/dressing)]": ["Yes"],
      "Timestamp": ["3/24/2026 20:22:43"],
      "State": ["CO"],
      "Primary Email Address:": ["eshapiro@gmail.com"],
      "First Name": ["Plum"],
      "Name of synagogue (Please include city and state if not local)\n": ["CBS"],
      "Primary Mobile Phone Number: \nPlease enter your 10-digit mobile number (e.g., 3035551212). - no spaces, dashes, or parentheses needed.": ["3036185661"],
      "Is there anything you want us to know about you, your skills or past chevra kadisha experience?": ["Not applicable"],
      "City": ["Boulder"],
      "Please indicate your comfort level or interest in the following sacred tasks: [Men’s Taharah (Ritual washing/dressing)]": ["No"],
      "Secondary Phone Number: \nPlease enter your 10-digit number (e.g., 3035551212). - no spaces, dashes, or parentheses needed.": [""],
      "Last Name": ["Shapiro123"],
      "Address\nWe occasionally send physical mailings, such as educational materials or thank-you notes.": ["6391 Swallow Ln"],
      "Zip": ["80303"],
      "By submitting this application, I certify the information is true and accurate and I agree with the terms and conditions of volunteering with the Boulder Chevra Kadisha. ": ["Agree"],
      "Please indicate your comfort level or interest in the following sacred tasks: [Shmira (Sitting with the deceased)]": ["Yes"],
      "Google Groups Enrollment\nWe use a Google Group to share training materials, educational resources, and community event information. May we add your primary email to this group?\n": ["Yes, please add me."],
      "How would you like to receive shmira and/or tahara scheduling alerts? (Select all that apply)": ["Email, Text Message"],
      "What is your community affiliation?\nThe Boulder Chevra Kadisha is a community-wide, independent organization. We serve all Jews in Boulder County—regardless of synagogue membership.": ["Member of local synagogue"],
      "Are you over 18 years old?": ["Yes"]
    },
    "range": {
      "columnEnd": 20,
      "columnStart": 1,
      "rowEnd": 14,
      "rowStart": 14
    },
    "source": {},
    "triggerUid": "8462282913365360640",
    "values": [
      "3/24/2026 20:22:43",
      "Yes",
      "Plum",
      "Shapiro123",
      "6391 Swallow Ln",
      "Boulder",
      "CO",
      "80303",
      "eshapiro@gmail.com",
      "3036185661",
      "",
      "Email, Text Message",
      "Yes, please add me.",
      "Yes",
      "No",
      "Yes",
      "Not applicable",
      "Member of local synagogue",
      "CBS",
      "Agree"
    ]
  };

  const response = processFormSubmit(eObject);
  Logger.log(response);
}
/**
 * Main entry point for the 'On form submit' trigger.
 * Orchestrates dynamic data mapping, validation, database appending, and notifications.
 * @param {GoogleAppsScript.Events.SheetsOnFormSubmit} e - The Google Form submit event object.
 */
function processFormSubmit(e) {
  Logger.log("Processing form submit");

  // Check library upfront to ensure logging and inputs are available
  if (typeof bckLib === 'undefined') {
    throw new Error("Required library 'bckLib' is not available.");
  }

  let sheetInputs;
  try {
    // Initialize sheet inputs and ensure SPREADSHEET_ID matches the current context
    sheetInputs = bckLib.getSheetInputs();
    sheetInputs.SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

    if (DEBUG) {
      Logger.log("Capturing event data ->");
      Logger.log(JSON.stringify(e));
    }

    // Dynamic mapping converts raw form headers into standardized DB headers
    // Note: Function name updated to match new "Guest" naming convention
    const mappedData = getMappedMemberData(e);
    const eventData = mappedData.dataObject; 
    const dbRowArray = mappedData.rowArray;

    if (DEBUG) console.log("Mapped Event Data:", eventData);

    // Stop processing if this appears to be a profile update rather than a new entry
    let formUpdated = isFormUpdated(eventData);
    if (formUpdated) return "Update Detected: No Append";

    // Determine if guest meets requirements for automatic approval
    let preApproved = preApproveMembers(eventData);
    
    // Sort into appropriate sheet based on approval status (Guest vs Pending Guest)
    const targetSheetName = preApproved ? "Member DB" : "Pending Member DB";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheetByName(targetSheetName).appendRow(dbRowArray);
   
    // Send email confirmation to the user - passing sheetInputs as per new logic
    sendFormConfirmationNotification(sheetInputs, eventData, preApproved);

    // Send notification to BCK admin of database updates
    sendFormUpdateNotification(sheetInputs, eventData, preApproved);

    const status = preApproved ? "Approved & Appended" : "Pending & Appended";
    return status;

  } catch (err) {
    Logger.log("Error in processFormSubmit: " + err.toString());
    
    // Since library is checked at the top, we can call it safely here
    bckLib.logQCVars("Process FAILED", { errorMessage: err.toString() });
    
    return "Error: " + err.toString(); 
  }
}
/**
 * Transforms raw form responses into a structured object and array based on a mapping table.
 * * @param {GoogleAppsScript.Events.SheetsOnFormSubmit} e - The form submit event object.
 * @returns {Object} result
 * @returns {Array<any>} result.rowArray - Values ordered specifically for spreadsheet appending.
 * @returns {Object} result.dataObject - Key-value pairs where keys are DB Headers.
 */
function getMappedMemberData(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mapSheet = ss.getSheetByName("Members DB Form Questionnaire Map");
  const mapData = mapSheet.getRange(2, 1, mapSheet.getLastRow() - 1, 5).getValues();
  
  const namedValues = e.namedValues;
  const generatedToken = Utilities.getUuid();
  const submissionDate = e.namedValues['Timestamp'] ? e.namedValues['Timestamp'][0] : new Date().toLocaleString();
  
  const dataObject = {};

  // Normalize form responses (lowercase, no spaces) to ensure matching regardless of slight header changes
  const normalizedResponses = {};
  for (let key in namedValues) {
    const cleanKey = key.replace(/\s+/g, '').toLowerCase(); 
    normalizedResponses[cleanKey] = namedValues[key][0];
  }

  // Iterate through mapping instructions
  mapData.forEach(mapping => {
    const rawQuestionTitle = mapping[0].toString();
    const cleanLookupKey = rawQuestionTitle.replace(/\s+/g, '').toLowerCase();
    const dbHeader = mapping[1].toString().trim().replace(/\s+/g, '_');
    const defaultValue = mapping[3].toString();
    
    let finalValue = "";
    
    // Check for Virtual/Named Key Lookup
    if (cleanLookupKey !== "" && normalizedResponses[cleanLookupKey] !== undefined) {
      finalValue = normalizedResponses[cleanLookupKey];
    } 
    // Handle Token and Date placeholders
    else if (defaultValue !== "") {
      finalValue = defaultValue
        .replace(/{Token}/g, generatedToken)
        .replace(/{date}/g, submissionDate);
    }
    
    // Fallback: If header is TOKEN and value is still empty, force Token
    if (dbHeader.toUpperCase() === "TOKEN" && finalValue === "") {
      finalValue = generatedToken;
    }

    dataObject[dbHeader] = finalValue;
  });

  // Construct the row array while respecting 'Hidden' flags in the mapping table
  let rowArray = [];
  mapData.forEach(mapping => {
    const dbHeader = mapping[1].toString().trim().replace(/\s+/g, '_');
    const isHidden = mapping[4].toString().toLowerCase() === "true" || mapping[4].toString().toLowerCase() === "yes";
    
    if (!isHidden) {
      rowArray.push(dataObject[dbHeader]);
    }
  });

  return { rowArray, dataObject };
}

/**
 * Evaluates whether a member meets the criteria for the "Members DB" or requires manual review.
 * * @param {Object} dataObject - The mapped data containing volunteer responses.
 * @returns {boolean} - Returns true if the member meets all automatic approval requirements.
 */
function preApproveMembers(dataObject) {
  let preApproved = false;

  // Validate required fields for logic exist
  if (!dataObject.AFFILIATION || !dataObject.SYNAGOGUE) {
    Logger.log('Error: Missing required fields (Affiliation or Synagogue) for validation');
    return false;
  }

  if (DEBUG) {
    Logger.log("--- Preapproval Check ---");
    Logger.log("Affiliation: " + dataObject.AFFILIATION);
    Logger.log("Shmira Interest: " + dataObject.SHMIRA);
  }

  // Pre-approval business logic
  const meetsAgeReq = dataObject.AGE_18_PLUS === "Yes"; 
  const meetsCertifyReq = dataObject.CERTIFY === "Agree"; 
  const meetsShmiraReq = dataObject.SHMIRA === "Yes";

  if (meetsAgeReq && meetsCertifyReq && meetsShmiraReq) {
    if (DEBUG) Logger.log("Status: Preapproved - Meets all requirements.");
    preApproved = true;
  } else {
    if (DEBUG) Logger.log("Status: Not Preapproved - Requirements not met.");
  }

  return preApproved;
}

/**
 * Checks if the submission is an update to an existing profile.
 * * @param {Object} dataObject - The mapped data from the form.
 * @returns {boolean} - Returns true if "Same as above" is detected in identifying fields.
 */
function isFormUpdated(dataObject) {
  if (!dataObject) return false;

  const emailVal = dataObject.EMAIL_1 ? dataObject.EMAIL_1.toLowerCase() : "";
  
  if (emailVal.includes("same as above")) {
    if (DEBUG) Logger.log("Form Update Detected: 'Same as above' found in Email field.");
    return true;
  }

  return false;
}

/**
 * Sends a confirmation email to the user with specific instructions based on their approval status.
 * * @param {Object} dataObject - The mapped data object.
 * @param {boolean} [preApproved=false] - Whether the user was automatically approved.
 */

/**
 * Sends a confirmation email to the user using Sheet templates.
 * @param {Object} sheetInputs - Config for bckLib.
 * @param {Object} dataObject - The mapped data object.
 * @param {boolean} [preApproved=false] - Approval status.
 */
function sendFormConfirmationNotification(sheetInputs, dataObject, preApproved = false) {
  // 1. Email Fallback Logic
  let recipientEmail = dataObject.PRIMARY_EMAIL;
  if (!recipientEmail || recipientEmail.toLowerCase().includes("same as above")) {
    recipientEmail = dataObject.EMAIL_1; 
  }

  const firstName = dataObject.FIRST_NAME || "";
  const lastName = dataObject.LAST_NAME || "";
  const address = dataObject.ADDRESS || "";

  // 2. Validation
  if (!recipientEmail || !firstName || !lastName || !address) {
    Logger.log('User notification skipped: Missing Email, Name, or Address.');
    return;
  }

  // 3. Load Template from Sheet
  const emailTemplates = bckLib.getEmails(sheetInputs);
  const templateKey = preApproved ? 'guest_preapproved' : 'guest_followup';
  const template = emailTemplates.find(t => t.key === templateKey);
  
  if (!template) {
    Logger.log('Error: User template "%s" not found in sheet.', templateKey);
    return;
  }

  // 4. Dynamic Replacements
  const replacements = {
    '[firstName]': firstName,
    '[lastName]': lastName
  };

  const replaceText = (text) => {
    if (!text) return '';
    return Object.entries(replacements).reduce((str, [k, v]) => 
      str.replace(new RegExp(k.replace(/[[\]]/g, '\\$&'), 'g'), v), text);
  };

  // 5. Build Subject and Body (supporting up to 30 lines from sheet)
  const subject = replaceText(template.subject);
  const bodyLines = [];
  for (let i = 1; i <= 30; i++) {
    const lineText = replaceText(template[`line${i}`]);
    if (lineText && lineText.trim()) bodyLines.push(lineText);
  }
  const body = bodyLines.join('\n\n');

  try {
    MailApp.sendEmail(recipientEmail, subject, body);
    Logger.log(`User notification sent to ${recipientEmail} (${templateKey})`);
  } catch (error) {
    Logger.log(`User email ERROR: ${error}`);
  }
}


/**
 * Sends a notification email to the BCK admin that a new user has been added.
 * * @param {Object} dataObject - The mapped data object.
 * @param {boolean} [preApproved=false] - Whether the user was automatically approved.
 */

/**
 * Sends notification to BCK Admin using Sheet templates.
 * @param {Object} sheetInputs - Config for bckLib.
 * @param {Object} dataObject - Form data.
 * @param {boolean} preApproved - Status.
 */
function sendFormUpdateNotification(sheetInputs, dataObject, preApproved = false) {
  const adminEmail = "marlalshapiro@gmail.com"; // Targeted Admin Address
  
  // Identify the user's email for the body of the admin report
  let userEmail = dataObject.PRIMARY_EMAIL;
  if (!userEmail || userEmail.toLowerCase().includes("same as above")) {
    userEmail = dataObject.EMAIL_1; 
  }

  const category = dataObject.CATEGORY || "Member";
  const firstName = dataObject.FIRST_NAME || "";
  const lastName = dataObject.LAST_NAME || "";
  const phone = dataObject.PRIMARY_MOBILE_PHONE || "N/A";

  if (!firstName || !lastName) {
    Logger.log('Admin notification skipped: Missing Name.');
    return;
  }

  // 1. Load Template
  const emailTemplates = bckLib.getEmails(sheetInputs);
  const templateKey = preApproved ? 'admin_preapproved' : 'admin_followup';
  const template = emailTemplates.find(t => t.key === templateKey);
  
  if (!template) {
    Logger.log('Error: Admin template "%s" missing.', templateKey);
    return;
  }

  // 2. Define Replacements (Match tags in your Google Sheet)
  const replacements = {
    '[category]': category,
    '[firstName]': firstName,
    '[lastName]': lastName,
    '[recipientEmail]': userEmail, // The user's email for the admin to see
    '[phone]': phone
  };

  const replaceText = (text) => {
    if (!text) return '';
    return Object.entries(replacements).reduce((str, [k, v]) => 
      str.replace(new RegExp(k.replace(/[[\]]/g, '\\$&'), 'g'), v), text);
  };

  // 3. Construct Email
  const subject = replaceText(template.subject);
  const bodyLines = [];
  for (let i = 1; i <= 30; i++) {
    const lineText = replaceText(template[`line${i}`]);
    if (lineText && lineText.trim()) bodyLines.push(lineText);
  }
  const body = bodyLines.join('\n\n');

  try {
    // FIX: Send to adminEmail, NOT the userEmail
    MailApp.sendEmail(adminEmail, subject, body);
    Logger.log(`Admin notification for ${lastName} sent to ${adminEmail}`);
  } catch (error) {
    Logger.log(`Admin email ERROR: ${error}`);
  }
}