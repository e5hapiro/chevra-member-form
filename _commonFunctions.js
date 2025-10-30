
/**
 * Adds unique token value to the last column of the last row entered
 * @param {object} eventData The event data object
 */
function addToken(e,columnNumber) {

  if (columnNumber) {

    try {
      var sheet = e.range.getSheet();
      var row = e.range.getRow();
      var uuid = Utilities.getUuid();
      sheet.getRange(row, columnNumber).setValue(uuid);
      Logger.log('Token added successfully for row: ' + row + ' column:' + columnNumber);
    } catch (error) {
      // Stores detailed information for easier debugging
      Logger.log('addToken failed for row: ' + (e && e.range ? e.range.getRow() : 'unknown') + ', error: ' + error.toString());
    }

    Logger.log('addToken failed no column provided ');

  }
  
}



/**
 * Sends individual, personalized notification emails to all volunteers about the new shifts.
 * @param {object} eventData The event data object
 */
function isFormUpdated(eventData) {

  let formUpdated = false;

  // Validate required fields for prevalidation
  if (!eventData || 
      !eventData.submissionDate ||
      !eventData.email) {
    Logger.log('Error: Missing required event data fields for checking updates');
    return false;
  }

  // Check for update race condition
  if (
        eventData.submissionDate !== "" &&
        eventData.email === ""
      ) 
      {
        formUpdated = true;
      };

  return formUpdated;

}


/**
 * Quality Control Logger: Logs a set of variables with a context message.
 * ONLY logs if the global constant DEBUG is set to true.
 *
 * @param {string} context - A message describing where in the code this is being called.
 * @param {Object} varsObject - An object where keys are variable names and values are the variables.
 */
function logQCVars_(context, varsObject) {
  // --- QA CHECK ---
  if (typeof DEBUG === 'undefined' || DEBUG === false) {
    return;
  }
  // --- END QA CHECK ---

  Logger.log(`--- QC LOG: ${context} ---`);
  
  if (typeof varsObject !== 'object' || varsObject === null) {
    Logger.log(`Invalid varsObject: ${varsObject}`);
    Logger.log(`--- END QC LOG: ${context} ---`);
    return;
  }

  for (const key in varsObject) {
    if (Object.prototype.hasOwnProperty.call(varsObject, key)) {
      const value = varsObject[key];
      
      if (typeof value === 'object' && value !== null) {
        try {
          Logger.log(`[${key}]: ${JSON.stringify(value)}`);
        } catch (e) {
          Logger.log(`[${key}] (Object): ${value.toString()}`);
        }
      } else {
        Logger.log(`[${key}]: ${value}`);
      }
    }
  }
  Logger.log(`--- END QC LOG: ${context} ---`);
}

