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
const DEBUG = false;

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
      "Please indicate your comfort level or interest in the following sacred tasks: [Women’s Taharah (Ritual washing/dressing)]": ["No"],
      "Name of synagogue (Please include city and state if not local)\n": ["Bonai Shalom"],
      "Timestamp": ["3/10/2026 17:04:05"],
      "First Name": ["Edmond"],
      "Are you over 18 years old?": ["Yes"],
      "Google Groups Enrollment\nWe use a Google Group to share training materials, educational resources, and community event information. May we add your primary email to this group?\n": ["Yes, please add me."],
      "Email Address": ["eshapiro@outlook.com"],
      "State": ["CO"],
      "Address\nWe occasionally send physical mailings, such as educational materials or thank-you notes.": ["6931"],
      "Zip": ["80303"],
      "Last Name": ["Shapiro"],
      "Cell Phone \nPlease enter your 10-digit mobile number (e.g., 3035551212). - no spaces, dashes, or parentheses needed.": ["3036185661"],
      "Is there anything you want us to know about you, your skills or past chevra kadisha experience?": ["Ignore above"],
      "City": ["Boulder"],
      "What is your community affiliation?\nThe Boulder Chevra Kadisha is a community-wide, independent organization. We serve all Jews in Boulder County—regardless of synagogue membership.": ["Member of local synagogue"],
      "Please indicate your comfort level or interest in the following sacred tasks: [Shmira (Sitting with the deceased)]": ["Yes"],
      "Please indicate your comfort level or interest in the following sacred tasks: [Men’s Taharah (Ritual washing/dressing)]": ["Yes"],
      "By submitting this application, I certify the information is true and accurate and I agree with the terms and conditions of volunteering with the Boulder Chevra Kadisha. ": ["Agree"],
      "Primary Email": ["Same as above"],
      "Primary Mobile Phone Number (if different than above):  Please enter your 10-digit mobile number (e.g., 3035551212). - no spaces, dashes, or parentheses needed.": [""],
      "Primary Email Address (if different than above): ": [""],
      "How would you like to receive shmira and/or tahara scheduling alerts? (Select all that apply)": ["Email, Text Message"],
      "Secondary Phone\n(use for voice only - no texting) Please enter your 10-digit number (e.g., 3035551212). - no spaces, dashes, or parentheses needed.": [""]
    },
    "range": { "columnEnd": 23, "columnStart": 1, "rowEnd": 6, "rowStart": 6 },
    "source": {},
    "triggerUid": "8462282913365360640",
    "values": ["3/10/2026 17:04:05", "eshapiro@outlook.com", "Yes", "Edmond", "Shapiro", "Same as above", "3036185661", "", "6931", "Boulder", "CO", "80303", "Yes", "Yes", "No", "Ignore above", "Member of local synagogue", "", "", "Email, Text Message", "Yes, please add me.", "Bonai Shalom", "Agree"]
  };

  const response = processFormSubmit(eObject);
  Logger.log(response);
}

/**
 * Main entry point for the 'On form submit' trigger.
 * Orchestrates dynamic data mapping, validation, database appending, and notifications.
 * * @param {GoogleAppsScript.Events.SheetsOnFormSubmit} e - The Google Form submit event object.
 */
function processFormSubmit(e) {
  Logger.log("Processing form submit");
  
  try {
    if (DEBUG) {
      Logger.log("Capturing event data - >");
      Logger.log(JSON.stringify(e));
    }

    // Dynamic mapping converts raw form headers into standardized DB headers
    const mappedData = getMappedMemberData(e);
    const eventData = mappedData.dataObject; 
    const dbRowArray = mappedData.rowArray;

    if (DEBUG) console.log("Mapped Event Data:", eventData);

    // Stop processing if this appears to be a profile update rather than a new member
    let formUpdated = isFormUpdated(eventData);
    if (formUpdated) return;

    // Determine if member meets requirements for automatic approval
    let preApproved = preApproveMembers(eventData);
    
    // Sort into appropriate sheet based on approval status
    const targetSheetName = preApproved ? "Members DB" : "Pending Member DB";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheetByName(targetSheetName).appendRow(dbRowArray);
   
    // Send email confirmation to the user
    sendFormConfirmationNotification(eventData, preApproved);
    
  } catch (err) {
    Logger.log("Error in processFormSubmit: " + err.toString());
    // Assumes existence of a library 'bckLib' for external logging
    if (typeof bckLib !== 'undefined') {
      bckLib.logQCVars("Process FAILED", { errorMessage: err.toString() });
    }
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
function sendFormConfirmationNotification(dataObject, preApproved = false) {
  // Fallback: If user used "Same as above" in contact email, use the system-captured email
  let recipientEmail = dataObject.EMAIL_1;
  if (!recipientEmail || recipientEmail.toLowerCase().includes("same as above")) {
    recipientEmail = dataObject.EMAIL_ADDRESS; 
  }

  const firstName = dataObject.FIRST_NAME || "";
  const lastName = dataObject.LAST_NAME || "";
  const address = dataObject.ADDRESS || "";

  if (!recipientEmail || !firstName || !lastName || !address) {
    Logger.log('Error: Missing required fields (Email, Name, or Address) for notification');
    return;
  }

  /**
   * Generates the email subject and body for pre-approved members.
   * @returns {Object} {subject, body}
   */
  function _preApprovedResponse() {
    return {
      subject : `${firstName} ${lastName} - Boulder Chevra Kadisha - Welcome`,
      body: `
Dear ${firstName},

Welcome to the Boulder Chevra Kadisha Family of dedicated volunteers.

NEXT STEPS:

- Set up a member account on the Boulder Chevra Kadisha website. This will give you access to training documents, policy guides and mortuary information. To gain access to the Boulder Chevra Kadisha Member only website, please go to www.BoulderChevraKadisha.org/XXXXX and use the password:XXXXXXXX to activate and set up your account. Once you have an account, you can log into it from the home page at www.BoulderChevraKadisha.org.

- You have been automatically added to the Boulder Chevra Kadisha training and communication list. We typically send communications via email, but if you indicated that you like to receive texts, you will also receive a text. We send out information when there is an in-person or an online training, workshop, or other event (either sponsored by the Boulder Chevra Kadisha or a similar group). Since our work is mostly done alone, the in-person events are a great way to meet other volunteers.

- If you indicated that you are interested in sitting shmira, you were automatically added to the Shomrim Volunteer List. When there is a death in the community and a request for our services, you will receive an email request to sit shmira. The email will include a link to a web portal where you may sign up for shmira times. Please remember that this link is unique to you so please do not share it with anyone. The web portal will email you a confirmation of any shifts you sign up for and calendar entries for the shifts. If you are new to sitting shmira and would like to have a partner for your first time, send us an email at: Boulder.Chevra@gmail.com. We will make sure to partner you up with someone.

- If you indicated that you are interested in helping with Tahara, your contact information was sent to our Tahara Leads. A Tahara Lead will contact you to discuss Tahara, your experience, and your preferences with you. You do not need to have prior experience to help with tahara. If you are new to this, the Tahara Lead will make sure you are partnered with an appropriate team for on-the-job-training. Before your first tahara, you should review the tahara manuals on the member only section of our website. When there is a need for tahara, the Tahara Lead contacts volunteers by email and/or text. 

If you have any questions, do not hesitate to contact us by email or phone.

With gratitude,
Boulder Chevra Kadisha
Phone - 303-842-5365
Email - boulder.chevra@gmail.com
      `
    };
  }


  /**
   * Generates the email subject and body for members requiring follow-up.
   * @returns {Object} {subject, body}
   */
  function _followupResponse() {
    return {
      subject : `${firstName} ${lastName} - BCK Member Volunteer - Let's talk`,
      body: `
Dear ${firstName},

Thank you for submitting your Member Volunteer form with the Boulder Chevra Kadisha.

We want to get to know you better. Please give us a call or write us an email. If you get our voice mail, just let us know some good days and times we can talk.

Please contact us at:
Boulder Chevra Kadisha
Phone - 303-842-5365
Email - boulder.chevra@gmail.com

We appreciate your willingness to perform this sacred duty and look forward to speaking with you.

With gratitude,

Boulder Chevra Kadisha
      `
    };
  }

  const emailData = preApproved ? _preApprovedResponse() : _followupResponse();

  try {
    MailApp.sendEmail({
      to: recipientEmail,
      subject: emailData.subject,
      body: emailData.body
    });
    Logger.log(`Member notification sent successfully to ${recipientEmail}.`);
  } catch (error) {
    Logger.log(`ERROR sending notification email to ${recipientEmail}: ${error.toString()}`);
  }
}