


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

  Logger.log("Token added");

  let eventData = {}; 
  
  try {
    const context = "formSubmit e values"
    const rawValues = e.values;
    logQCVars_(context, rawValues)

    // --- Create a single data object ---
    eventData = {
      rawValues: rawValues,
      submissionDate: rawValues[0],
      email: rawValues[1],
      firstName: rawValues[2],
      lastName: rawValues[3],
      address: rawValues[4],
      city: rawValues[5],
      state: rawValues[6],
      zipcode: rawValues[7],
      phone: rawValues[8],
      q_textToPhone: rawValues[9],
      q_preferredEmail: rawValues[10],
      q_willSitShmira: rawValues[11],
      q_willTahar: rawValues[12],
      q_willMakeTachrichim: rawValues[13],
      q_haveSatShmira: rawValues[14],
      q_wantTrainShmira: rawValues[15],
      q_preferredShmiraComms: rawValues[16],
      q_haveDoneTahara: rawValues[17],
      q_wantTrainTahara: rawValues[18],
      q_preferredTaharaComms: rawValues[19],
      q_sewMachine: rawValues[20],
      q_affiliation: rawValues[21],      
      q_synagogueName: rawValues[22],
      q_certifyTrue: rawValues[23]
    };

    // --- QC LOG 1: After initial extraction ---
    // Log the entire data object
    logQCVars_("After Variable Extraction", eventData);

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
    //let preApproved = preApproveGuests(eventData);
    //addApprovalCheckbox(e, preApproved);  // Adds a checkbox whether preapproval has occurred
   
    // -------------------------------------------------------------------
    // --- Individual Email Notification to all volunteers ---
    // -------------------------------------------------------------------
    //sendFormConfirmationNotification(eventData, preApproved);
    
    // --- QC LOG 5: Process Complete ---
    //logQCVars_("Process Complete", { status: "Success" });
    return

  } catch (e) {
    Logger.log("Error in processFormSubmit: " + e.toString());
    
    // --- QC LOG 6: On Error ---
    // Log the error AND the state of the data object when it failed
    logQCVars_("Process FAILED", {
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
      !eventData.q_certifyTrue ||
      !eventData.q_age18plus || 
      !eventData.q_shmiraBizHoursOk || 
      !eventData.q_relationToDeceased || 
      !eventData.q_affiliation ||
      !eventData.q_synagogueName ) {
    Logger.log('Error: Missing required event data fields for prevalidation');
    return false;
  }

  if(DEBUG){
    Logger.log("Preapproval Criteria used:");
    Logger.log("18Plus?"+ eventData.q_age18plus );
    Logger.log("ShmiraBizHours?:"+ eventData.q_shmiraBizHoursOk );
    Logger.log("Relation to Deceased:"+ eventData.q_relationToDeceased );
    Logger.log("Affiliation:"+ eventData.q_affiliation );
    Logger.log("SynagogueName:"+ eventData.q_synagogueName );
  };

  // Preapprove family if matching the following answers
  if (
        (eventData.q_age18plus === "Yes" &&
        eventData.q_shmiraBizHoursOk === "Yes") &&
          (
            eventData.q_relationToDeceased === "Family"
          ))
      {
            if(DEBUG){Logger.log("Preapproved - meets family minimums");};
            preApproved = true;
      };

  // Preapprove family or community members if matching the following answers
  if (
        (eventData.q_age18plus === "Yes" &&
        eventData.q_shmiraBizHoursOk === "Yes") &&
          (
            eventData.q_affiliation === "Member of local synagogue" &&
            eventData.q_synagogueName !== ""
          ))
      {
          if(DEBUG){Logger.log("Preapproved - meets local synagogue minimums");};
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

        Access to Member Volunteer Portal
        Please go to: (hidden member url)  to create a unique log in and passcode to the member portal. In this portal, you will fid…..…. Security…….???...

        Shmira Schedule 
        Here is your url to access the Shomrim Schedule. The url is unique to you and will save and confirm your Shmira sign ups. You will not need an additional id or password to access this site.  When there is a death in the community, you will receive an email request to sit shmira. The email will include this url/link. Remember that it is unique to you. Please do not share it. 

        Tahara Requests
        Tahara requests will only go to volunteers who have indicated they will do tahara. The Tahara Lead will contact volunteers by email and/or text when needed. 

        If you have any questions, do not hesitate to contact us by email or phone.

        Thank you,
        Boulder Chevra Kadisha

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

        Thank you for submitting your Guest Shomerim application with the Boulder Chevra Kadisha. 

        We need to discuss the available options with you. Please call us at (303) 842-5365 or reply to this email with your availability to have a 15-minute conversation. 
       
        We appreciate your willingness to perform this sacred duty and look forward to speaking with you. 

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

    Logger.log(`Guest notification sent successfully to ${eventData.email}.`);

  } catch (error) {
    Logger.log(`ERROR sending notification email to ${eventData.email}: ${error.toString()}`);
  }
  
  Logger.log(`Finished sending new guest notifications.`);

};


