/**
* -----------------------------------------------------------------
* _gFormHandler.js
* Chevra Kadisha Members Form handler
* -----------------------------------------------------------------
* _selection_form.js
Version: 1.0.1 * Last updated: 2025-12-16
 * 
 * CHANGELOG v1.0.0:
 *   - Initial implementation of Selection Form.
*  1.0.1:
*    - Replaced approval emails
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
    console.log(eventData);
    
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



function debugPreApproveMember(){

  let eventData = { rawValues: 
   [ '12/9/2025 19:27:56',
     'eshapiro@gmail.com',
     'Yes',
     'Edmond ES 12-9',
     'Shapiro',
     '6391 Swallow Ln',
     'Boulder',
     'CO',
     '80303',
     '3036185661',
     'Yes',
     'Phone Text (at above number)',
     'Yes',
     'No',
     'No',
     'No',
     'No',
     '',
     '',
     'Unaffiliated',
     '',
     '',
     'Agree' ],
  submissionDate: '12/9/2025 19:27:56',
  email: 'eshapiro@gmail.com',
  q_age18plus: 'Yes',
  firstName: 'Edmond ES 12-9',
  lastName: 'Shapiro',
  address: '6391 Swallow Ln',
  city: 'Boulder',
  state: 'CO',
  zipcode: '80303',
  phone: '3036185661',
  q_textToPhone: 'Yes',
  q_preferredEmail: 'Phone Text (at above number)',
  q_willSitShmira: 'Yes',
  q_willTahar: 'No',
  q_willMakeTachrichim: 'No',
  q_haveSatShmira: 'No',
  q_shmiraOtherCongregation: 'No',
  q_haveDoneTahara: '',
  q_taharaOtherCongregation: '',
  q_affiliation: 'Unaffiliated',
  q_synagogueName: '',
  q_otherSkills: '',
  q_certifyTrue: 'Agree' }
  ;
  preApproveMembers(eventData);


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
        subject : `${eventData.firstName} ${eventData.lastName} - Boulder Chevra Kadisha - Welcome`,
        body: `

Dear ${eventData.firstName},

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
      }

      return emailData;

    }

    /**
     * Not yet approved guest email response
     * @param {object} eventData The event data object
     */
    function _followupResponse(eventData) {

      const emailData = {
        subject : `${eventData.firstName} ${eventData.lastName} - BCK Member Volunteer - Let's talk`,
        body: `

Dear ${eventData.firstName},

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


