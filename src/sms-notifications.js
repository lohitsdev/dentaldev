// Use dynamic import for Telnyx SDK (ES Module)
let telnyx = null;

// Initialize Telnyx SDK asynchronously
async function initializeTelnyx() {
  if (!telnyx) {
    const TelnyxModule = await import('telnyx');
    telnyx = TelnyxModule.default(process.env.TELNYX_API_KEY);
  }
  return telnyx;
}

// Configuration from environment variables
const FROM_NUMBER = process.env.TELNYX_PHONE_NUMBER || '+12136950452';
const DOCTOR_NUMBERS = {
  primary: process.env.PRIMARY_EMERGENCY_DOCTOR || '+17346744780',
  backup: process.env.BACKUP_EMERGENCY_DOCTOR || '+17346744780',
  night: process.env.NIGHT_EMERGENCY_DOCTOR || '+17346744780'
};

/**
 * Replace template variables in a string
 * @param {string} template - Template string with variables
 * @param {Object} data - Data to replace variables with
 * @returns {string} Processed string
 */
function processTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match; // Return original if no replacement found
  });
}

/**
 * Send SMS notification to doctor with patient information
 * @param {Object} patientInfo - Structured patient information
 * @param {string} urgencyLevel - emergency, high, medium, low
 * @returns {Promise<Object>} SMS sending result
 */
async function sendDoctorNotification(patientInfo, urgencyLevel = 'medium') {
  try {
    const isEmergency = urgencyLevel === 'emergency';
    const templateEnabled = isEmergency 
      ? process.env.SMS_TEMPLATE_EMERGENCY_ENABLED === 'true'
      : process.env.SMS_TEMPLATE_NONEMERGENCY_ENABLED === 'true';

    // Check if SMS is enabled
    const smsEnabled = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
    if (!smsEnabled || !templateEnabled) {
      console.log(`📱 SMS ${isEmergency ? 'emergency' : 'non-emergency'} notifications disabled - skipping SMS`);
      return { 
        status: 'disabled', 
        message: `SMS notifications disabled for ${isEmergency ? 'emergency' : 'non-emergency'} messages` 
      };
    }

    // Initialize Telnyx SDK
    const telnyxClient = await initializeTelnyx();
    
    // Determine which doctor to notify based on urgency and time
    const doctorNumber = selectDoctorNumber(urgencyLevel);

    // Prepare template data
    const templateData = {
      patientName: patientInfo.name || 'Unknown Patient',
      patientPhone: patientInfo.phone || 'No phone provided',
      symptoms: patientInfo.symptoms || 'Not specified',
      timestamp: new Date().toLocaleString(),
      status: patientInfo.status || 'New',
      message: patientInfo.message || 'No message',
      reason: patientInfo.reason || patientInfo.symptoms || 'Not specified',
      callbackTime: patientInfo.callbackTime || 'Not specified',
      practiceName: process.env.PRACTICE_NAME || 'Dental Practice'
    };

    // Get appropriate templates
    if (isEmergency) {
      // Send to doctor
      const doctorTemplate = process.env.SMS_TEMPLATE_EMERGENCY_DOCTOR;
      const doctorMessage = processTemplate(doctorTemplate, templateData);
      await telnyxClient.messages.create({
        from: FROM_NUMBER,
        to: doctorNumber,
        text: doctorMessage
      });

      // Send to patient
      const patientTemplate = process.env.SMS_TEMPLATE_EMERGENCY_PATIENT;
      const patientMessage = processTemplate(patientTemplate, templateData);
      await telnyxClient.messages.create({
        from: FROM_NUMBER,
        to: patientInfo.phone,
        text: patientMessage
      });
    } else {
      // Send confirmation to patient
      const confirmationTemplate = process.env.SMS_TEMPLATE_NONEMERGENCY_CONFIRMATION;
      const confirmationMessage = processTemplate(confirmationTemplate, templateData);
      await telnyxClient.messages.create({
        from: FROM_NUMBER,
        to: patientInfo.phone,
        text: confirmationMessage
      });

      // Send reminder if callback time is specified
      if (patientInfo.callbackTime) {
        const reminderTemplate = process.env.SMS_TEMPLATE_NONEMERGENCY_REMINDER;
        const reminderMessage = processTemplate(reminderTemplate, templateData);
        await telnyxClient.messages.create({
          from: FROM_NUMBER,
          to: patientInfo.phone,
          text: reminderMessage
        });
      }
    }
    
    console.log(`📱 SMS notifications sent for ${isEmergency ? 'emergency' : 'non-emergency'} case`);
    return {
      success: true,
      type: isEmergency ? 'emergency' : 'non-emergency',
      recipientCount: isEmergency ? 2 : (patientInfo.callbackTime ? 2 : 1)
    };
    
  } catch (error) {
    console.error('❌ Failed to send SMS notification:', error);
    return {
      success: false,
      error: error.message,
      patientInfo: patientInfo
    };
  }
}

/**
 * Select appropriate doctor number based on urgency and time
 * @param {string} urgencyLevel - emergency, high, medium, low
 * @returns {string} Doctor phone number
 */
function selectDoctorNumber(urgencyLevel) {
  const currentHour = new Date().getHours();
  const isNightTime = currentHour < 8 || currentHour > 18; // Before 8 AM or after 6 PM
  
  if (urgencyLevel === 'emergency') {
    // Always use primary for emergencies
    return DOCTOR_NUMBERS.primary;
  } else if (isNightTime) {
    // Use night doctor for after-hours
    return DOCTOR_NUMBERS.night;
  } else {
    // Use primary during business hours
    return DOCTOR_NUMBERS.primary;
  }
}

/**
 * Send test notification (for testing purposes)
 * @param {string} testMessage - Test message
 * @param {Object} testData - Test data for template variables
 * @returns {Promise<Object>} Test result
 */
async function sendTestNotification(testMessage = 'Test notification from dental AI assistant', testData = {}) {
  try {
    // Initialize Telnyx SDK
    const telnyxClient = await initializeTelnyx();
    
    // Use test data or defaults
    const templateData = {
      patientName: testData.patientName || 'Test Patient',
      patientPhone: testData.patientPhone || '+1234567890',
      symptoms: testData.symptoms || 'Test symptoms',
      timestamp: new Date().toLocaleString(),
      status: testData.status || 'Test',
      message: testData.message || testMessage,
      reason: testData.reason || 'Testing',
      callbackTime: testData.callbackTime || 'Not specified',
      practiceName: process.env.PRACTICE_NAME || 'Dental Practice'
    };

    // Process test message with template
    const processedMessage = processTemplate(testMessage, templateData);
    
    const result = await telnyxClient.messages.create({
      from: FROM_NUMBER,
      to: DOCTOR_NUMBERS.primary,
      text: processedMessage
    });
    
    console.log(`✅ Test SMS sent: ${result.id}`);
    return { success: true, messageId: result.id };
    
  } catch (error) {
    console.error('❌ Test SMS failed:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendDoctorNotification,
  sendTestNotification,
  processTemplate,
  selectDoctorNumber
}; 