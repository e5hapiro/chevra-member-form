/**
 * -----------------------------------------------------------------
 * bck-members.js
 * Chevra Kadisha Members Form handler
 * -----------------------------------------------------------------
 * Version: 2.0.1 
 * Last updated: 2026-03-27
 * * CHANGELOG v1.0.0:
 * - Initial implementation of Selection Form.
 * 1.0.1:
 * - Replaced approval emails
 * 2.0.0:
 * - Revised, Simplified and now utilizes a mapping table in the spreadsheet
 * - Mapping table allows for dynamic changing of form fields to database mapping 
 * and includes a pending table for easy copying 
 * 2.0.1:
 * - All Dataobject fields are available for mail merge from template 
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
  authMode: "FULL",
  namedValues: {
    "State": ["co"],
    "Google Groups Enrollment\nWe use a Google Group to share training materials, educational resources, and community event information. May we add your primary email to this group?\n": ["Yes, please add me."],
    "Timestamp": ["3/27/2026 10:22:21"],
    "How would you like to receive shmira and/or tahara scheduling alerts? (Select all that apply)": ["Email"],
    "Primary Email Address:": ["marlalshapiro@gmail.com"],
    "Please indicate your comfort level or interest in the following sacred tasks: [Men’s Taharah (Ritual washing/dressing)]": ["No"],
    "By submitting this application, I certify the information is true and accurate and I agree with the terms and conditions of volunteering with the Boulder Chevra Kadisha. ": ["Agree"],
    "What is your community affiliation?\nThe Boulder Chevra Kadisha is a community-wide, independent organization. We serve all Jews in Boulder County—regardless of synagogue membership.": ["Member of local synagogue"],
    "Primary Mobile Phone Number: \nPlease enter your 10-digit mobile number (e.g., 3035551212). - no spaces, dashes, or parentheses needed.": ["7202533910"],
    "First Name": ["Member 327 Yes"],
    "Address\nWe occasionally send physical mailings, such as educational materials or thank-you notes.": ["2"],
    "Name of synagogue (Please include city and state if not local)\n": ["bbb"],
    "Are you over 18 years old?": ["Yes"],
    "Secondary Phone Number: \nPlease enter your 10-digit number (e.g., 3035551212). - no spaces, dashes, or parentheses needed.": [""],
    "Please indicate your comfort level or interest in the following sacred tasks: [Women’s Taharah (Ritual washing/dressing)]": ["Yes"],
    "City": ["v"],
    "Is there anything you want us to know about you, your skills or past chevra kadisha experience?": [""],
    "Last Name": ["S"],
    "Zip": ["80303"],
    "Please indicate your comfort level or interest in the following sacred tasks: [Shmira (Sitting with the deceased)]": ["Yes"]
  },
  range: {
    columnEnd: 20,
    columnStart: 1,
    rowEnd: 18,
    rowStart: 18
  },
  source: {},
  triggerUid: "8462282913365360640",
  values: [
    "3/27/2026 10:22:21",
    "Yes",
    "Member 327 Yes",
    "S",
    "2",
    "v",
    "co",
    "80303",
    "marlalshapiro@gmail.com",
    "7202533910",
    "",
    "Email",
    "Yes, please add me.",
    "Yes",
    "No",
    "Yes",
    "",
    "Member of local synagogue",
    "bbb",
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
 * Dynamically maps all dataObject keys to [TAGS] in the email template.
 * * @param {Object} sheetInputs - Config for bckLib.
 * @param {Object} dataObject - The mapped data object (keys should be UPPERCASE).
 * @param {boolean} [preApproved=false] - Approval status.
 */
function sendFormConfirmationNotification(sheetInputs, dataObject, preApproved = false) {
  // 1. Email Fallback & Validation
  // Checks PRIMARY_EMAIL first, falls back to EMAIL_1 if primary is missing
  let recipientEmail = dataObject.PRIMARY_EMAIL || dataObject.EMAIL_1;
  
  if (!recipientEmail || recipientEmail.toLowerCase().includes("same as above")) {
    Logger.log('User notification skipped: Missing or invalid Email address.');
    return;
  }

  // 2. Load Template from Sheet
  const emailTemplates = bckLib.getEmails(sheetInputs);
  const templateKey = preApproved ? 'member_preapproved' : 'member_followup';
  const template = emailTemplates.find(t => t.key === templateKey);
  
  if (!template) {
    Logger.log('Error: User template "%s" not found in sheet settings.', templateKey);
    return;
  }

  /**
   * Helper: Replaces [BRACKET_TAGS] with dataObject values.
   * Logic: Finds anything in brackets, converts the inside text to UPPERCASE,
   * and looks for a matching key in the dataObject.
   */
  const replaceText = (text) => {
    if (!text) return '';
    
    // Regex matches anything inside square brackets: [some_field]
    return text.replace(/\[([^\]]+)\]/g, (match, p1) => {
      const key = p1.toUpperCase();
      
      // If the key exists in our data (e.g., SHMIRA), return the value.
      // Otherwise, return the original [tag] so the user knows it's broken.
      return dataObject.hasOwnProperty(key) ? dataObject[key] : match;
    });
  };

  // 3. Build Subject and Body
  // Supports 'subject' field and up to 30 lines (line1, line2, etc.) from the sheet
  const subject = replaceText(template.subject);
  const bodyLines = [];
  
  for (let i = 1; i <= 30; i++) {
    const lineText = replaceText(template[`line${i}`]);
    // Only add lines that actually contain text
    if (lineText && lineText.trim()) {
      bodyLines.push(lineText);
    }
  }
  
  const body = bodyLines.join('\n\n');

  // 4. Send the Email
  try {
    MailApp.sendEmail({
      to: recipientEmail,
      subject: subject,
      body: body
    });
    Logger.log(`User notification sent to ${recipientEmail} (Template: ${templateKey})`);
  } catch (error) {
    Logger.log(`User email ERROR: ${error.toString()}`);
  }
}

/**
 * Sends a notification email to the Admin using Sheet templates.
 * Dynamically maps all dataObject keys to [TAGS] and supports [RECIPIENTEMAIL].
 * @param {Object} sheetInputs - Config for bckLib.
 * @param {Object} dataObject - The mapped data object from the form.
 * @param {boolean} [preApproved=false] - Approval status.
 */
function sendFormUpdateNotification(sheetInputs, dataObject, preApproved = false) {
  const adminEmail = "marlalshapiro@gmail.com"; // Targeted Admin Address
  
  // 1. Identify the user's email (for use in the [RECIPIENTEMAIL] tag)
  let userEmail = dataObject.PRIMARY_EMAIL || dataObject.EMAIL_1 || "N/A";
  if (userEmail.toLowerCase().includes("same as above")) {
    userEmail = "N/A"; 
  }

  // Validation: Ensure we at least have a name before bothering the admin
  if (!dataObject.FIRST_NAME || !dataObject.LAST_NAME) {
    Logger.log('Admin notification skipped: Missing Name.');
    return;
  }

  // 2. Load Template
  const emailTemplates = bckLib.getEmails(sheetInputs);
  const templateKey = preApproved ? 'admin_preapproved' : 'admin_followup';
  const template = emailTemplates.find(t => t.key === templateKey);
  
  if (!template) {
    Logger.log('Error: Admin template "%s" missing.', templateKey);
    return;
  }

  /**
   * Helper: Replaces [BRACKET_TAGS] with dataObject values.
   * Handles dynamic keys from dataObject + custom [RECIPIENTEMAIL] tag.
   */
  const replaceText = (text) => {
    if (!text) return '';
    
    return text.replace(/\[([^\]]+)\]/g, (match, p1) => {
      const key = p1.toUpperCase();
      
      // Special case: recipientEmail isn't a direct key in the dataObject usually
      if (key === "RECIPIENTEMAIL") return userEmail;
      
      // Otherwise, look for the key in dataObject (e.g., [CATEGORY], [PHONE])
      // If the key exists, return value; otherwise return the original [tag]
      return dataObject.hasOwnProperty(key) ? dataObject[key] : match;
    });
  };

  // 3. Construct Subject and Body
  const subject = replaceText(template.subject);
  const bodyLines = [];
  
  for (let i = 1; i <= 30; i++) {
    const lineText = replaceText(template[`line${i}`]);
    if (lineText && lineText.trim()) {
      bodyLines.push(lineText);
    }
  }
  const body = bodyLines.join('\n\n');

  // 4. Send to Admin
  try {
    MailApp.sendEmail({
      to: adminEmail,
      subject: subject,
      body: body
    });
    Logger.log(`Admin notification for ${dataObject.LAST_NAME} sent to ${adminEmail}`);
  } catch (error) {
    Logger.log(`Admin email ERROR: ${error.toString()}`);
  }
}