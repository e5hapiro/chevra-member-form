/**
* -----------------------------------------------------------------
* _gFormHandler.js
* Chevra Kadisha Members Form handler
* -----------------------------------------------------------------
* _selection_form.js
Version: 1.0.0 * Last updated: 2025-11-12
 * 
 * CHANGELOG v1.0.0:
 *   - Initial implementation of Selection Form.
 * -----------------------------------------------------------------
 */


// --- QA & DEBUGGING CONSTANT ---
// Set to true to see detailed QC logs.
// Set to false for production to reduce logging.
const DEBUG = true;

const TOKEN_COLUMN_NUMBER = 24

/**
 * ADMIN FUNCTIONS (Triggered by form submit or manual run)
 * -------------------------------------------------------------------
 */

/**
 * Handles the 'On form submit' trigger from the administrator's event form.
 * This function processes the form response and updates the Shifts Master sheet.
 * @param {GoogleAppsScript.Events.SheetsOnFormSubmit} e The form submit event object.
 */
function processFormSubmit(e) {
  
  Logger.log("Processing form submit");

  addToken(e,TOKEN_COLUMN_NUMBER);

  let eventData = {}; 
  
  try {
    const context = "formSubmit e values"
    const rawValues = e.values;
    bckLib.logQCVars(context, rawValues)

    // --- Create a single data object ---
    eventData = {
      rawValues: rawValues,
      submissionDate: rawValues[0],
      email: rawValues[1],
      q_age18plus: rawValues[2],
      firstName: rawValues[3],
      lastName: rawValues[4],
      address: rawValues[5],
      city: rawValues[6],
      state: rawValues[7],
      zipcode: rawValues[8],
      phone: rawValues[9],
      q_textToPhone: rawValues[10],
      q_preferredEmail: rawValues[11],
      q_willSitShmira: rawValues[12],
      q_willTahar: rawValues[13],
      q_willMakeTachrichim: rawValues[14],
      q_haveSatShmira: rawValues[15],
      q_shmiraOtherCongregation: rawValues[16],
      q_haveDoneTahara: rawValues[17],
      q_taharaOtherCongregation: rawValues[18],
      q_affiliation: rawValues[19],      
      q_synagogueName: rawValues[20],
      q_otherSkills: rawValues[21],
      q_certifyTrue: rawValues[22]
    };

    // --- QC LOG 1: After initial extraction ---
    // Log the entire data object
    logQCVars("After Variable Extraction", eventData);

    // -------------------------------------------------------------------
    // --- Handle Updated Form scenario ---
    // -------------------------------------------------------------------
    let formUpdated = isFormUpdated(eventData);

    // If the form is updated current not proceeding with any change
    if (formUpdated) {
        return
    }

    // -------------------------------------------------------------------
    // --- Preapproval Validation ---
    // -------------------------------------------------------------------
    let preApproved = preApproveMembers(eventData);
    addApprovalCheckbox(e, preApproved);  // Adds a checkbox whether preapproval has occurred
   
    // -------------------------------------------------------------------
    // --- Individual Email Notification to all volunteers ---
    // -------------------------------------------------------------------
    sendFormConfirmationNotification(eventData, preApproved);
    
    // --- QC LOG 5: Process Complete ---
    //bckLib.logQCVars("Process Complete", { status: "Success" });
    return

  } catch (e) {
    Logger.log("Error in processFormSubmit: " + e.toString());
    
    // --- QC LOG 6: On Error ---
    // Log the error AND the state of the data object when it failed
    bckLib.logQCVars("Process FAILED", {
      errorMessage: e.toString(),
      errorStack: e.stack || "No stack available",
      eventDataAtFailure: eventData 
    });
  }


}


/**
 * Determines if a guest is preapproved following Chevra Kadiskah logic
 * @param {object} eventData The event data object
 */
function preApproveMembers(eventData) {

  let preApproved = false;

  // Validate required fields for prevalidation
  if (!eventData || 
      !eventData.q_age18plus ||
      !eventData.q_certifyTrue ||
      !eventData.q_affiliation ||
      !eventData.q_synagogueName ) {
    Logger.log('Error: Missing required event data fields for prevalidation');
    return false;
  }

  if(DEBUG){
    Logger.log("Preapproval Criteria used:");
    Logger.log("CertifyTrue"+ eventData.q_certifyTrue );
    Logger.log("SitShmira"+ eventData.q_willSitShmira ); 
    Logger.log("18Plus?"+ eventData.q_age18plus );
  };

  // Preapprove family if matching the following answers
  if 
        (
        eventData.q_age18plus === "Yes" &&
        eventData.q_certifyTrue === "Agree" &&
        eventData.q_willSitShmira === "Yes"  
        )
      {
            if(DEBUG){Logger.log("Preapproved - meets member requirements");};
            preApproved = true;
      };

  if(DEBUG){Logger.log("Returning") + preApproved;};
  return preApproved;

}


/**
 * Adds approval checkbox to the last column of the last row entered
 * @param {object} eventData The event data object
 * @param boolean preApproval 
 */
function addApprovalCheckbox(e, preApproved=false) {
  try {
    var sheet = e.range.getSheet();
    var row = e.range.getRow();
    var numColumns = sheet.getLastColumn();
    var checkboxCell = sheet.getRange(row, numColumns);
    checkboxCell.setValue(preApproved);
    Logger.log('Approval Checkbox added successfully for row: ' + row);
  } catch (error) {
    Logger.log('add Approval Checkbox failed for row: ' + (e && e.range ? e.range.getRow() : 'unknown') + ', error: ' + error.toString());
  }
}



/**
 * Sends individual, personalized notification emails to all volunteers about the new shifts.
 * @param {object} eventData The event data object
 */
function sendFormConfirmationNotification(eventData, preApproved = false) {

  /**
   * Preapproved guest email response
   * @param {object} eventData The event data object 
   */
    function _preApprovedResponse(eventData) {

      const emailData = {
        subject : `${eventData.firstName} ${eventData.lastName} - Thank you for volunteering with Boulder's Chevra Chadisha`,
        body: `

        Dear ${eventData.firstName},

        Your Volunteer Membership to the Boulder Chevra Kadisha has been approved. 

        Shmira Schedule 
        When there is a death in the community, you will receive an email request to sit shmira. The email will include a link to a web portal where you may sign up for shmira. Please remember that this link is unique to you so please do not share it. 

        If you have any questions, do not hesitate to contact us by email or phone.

        With gratitude,

        Boulder Chevra Kadisha
        Phone - 303-842-5365
        Email - boulder.chevra@gmail.com
        
      `
      }

      return emailData;

    }

    /**
     * Not yet approved guest email response
     * @param {object} eventData The event data object
     */
    function _followupResponse(eventData) {

      const emailData = {
        subject : `${eventData.firstName} ${eventData.lastName} - Thank you for volunteering with Boulder's Chevra Chadisha - Let's talk`,
        body: `

        Dear ${eventData.firstName},

        Your Volunteer Membership to the Boulder Chevra Kadisha has not yet been approved. 

        Please contact us at: 
          Boulder Chevra Kadisha
          Phone - 303-842-5365
          Email - boulder.chevra@gmail.com

        With gratitude,

        Boulder Chevra Kadisha
        
      `
      }

      return emailData;

    }


  // Validate required fields
  if (!eventData || 
      !eventData.email || 
      !eventData.firstName || 
      !eventData.lastName || 
      !eventData.address ) {
    Logger.log('Error: Missing required event data fields for email notification');
    return;
  }

  // Based on preapproved validation send different messages.
  let emailData = {};
  switch (preApproved) {
    case true:
      emailData = _preApprovedResponse(eventData);
      break;

    case false:
      emailData = _followupResponse(eventData);
      break;
  }

  try {
    MailApp.sendEmail({
      to: eventData.email,
      subject: emailData.subject,
      body: emailData.body
    });

    Logger.log(`Member notification sent successfully to ${eventData.email}.`);

  } catch (error) {
    Logger.log(`ERROR sending notification email to ${eventData.email}: ${error.toString()}`);
  }
  
  Logger.log(`Finished sending new guest notifications.`);

};


