const telnyxClient = require('./telnyx');
const { generateEmergencyAudio } = require('./tts');
const { extractPatientInfo } = require('./dialog');
const { sendEmergencyEmail } = require('./email');
const config = require('./config');
const { sendReceptionistSummary } = require('./email');
const telnyxHelper = require('./telnyx');
const { sendDoctorNotification } = require('./sms-notifications');
const { sendDoctorEmailNotification } = require('./email-notifications');
const { initiateEmergencyConference, handleConferenceEvent } = require('./telnyx-conference');
require('dotenv').config();

/**
 * Handle emergency situation using Telnyx conference calling
 * @param {string} patientPhone - Patient's phone number
 * @param {string} message - Emergency message
 * @param {string} callControlId - Call control ID (optional)
 * @param {Object} emergencyInfo - Structured emergency information (optional)
 * @returns {Promise<Object>} Emergency handling result
 */
async function handleEmergency(callerPhone, message, callControlId, patientInfo = {}) {
  try {
    console.log(`🚨 Handling emergency for ${callerPhone}: ${message}`);
    
    // Get emergency doctor based on time of day
    const currentHour = new Date().getHours();
    let doctorNumber = process.env.PRIMARY_EMERGENCY_DOCTOR;
    
    // Use night doctor between 10 PM and 6 AM
    if (currentHour >= 22 || currentHour <= 6) {
      doctorNumber = process.env.NIGHT_EMERGENCY_DOCTOR || process.env.PRIMARY_EMERGENCY_DOCTOR;
    }
    
    // Generate unique emergency ID
    const emergencyId = `emergency-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Transfer configuration with recording
    const transferConfig = {
      to: doctorNumber,
      from: process.env.TELNYX_PHONE_NUMBER,
      client_state: JSON.stringify({
        emergencyId,
        patientInfo,
        type: 'emergency_transfer'
      }),
      command_id: `emergency-${emergencyId}`
    };

    console.log(`📞 Transferring emergency call to doctor: ${doctorNumber}`);
    
    // Start the transfer with recording
    const transferResult = await telnyxHelper.transferCall(callControlId, transferConfig);
    
    console.log(`✅ Emergency transfer initiated:`, transferResult);
    
    // Send notifications
    await Promise.all([
      sendDoctorNotification({
        type: 'emergency',
        phone: callerPhone,
        message: message,
        emergencyId
      }),
      sendDoctorEmailNotification({
        type: 'emergency',
        phone: callerPhone,
        message: message,
        emergencyId
      })
    ]);

    return {
      success: true,
      emergencyId,
      transferResult
    };
  } catch (error) {
    console.error('❌ Error handling emergency:', error);
    throw error;
  }
}

/**
 * Handle emergency fallback when conference fails
 * @param {string} callControlId - Call control ID
 * @param {string} patientPhone - Patient phone number
 * @param {Object} emergencyRecord - Emergency record
 */
async function handleEmergencyFallback(callControlId, patientPhone, emergencyRecord) {
  try {
    console.log('🔄 Emergency conference fallback - using direct transfer');
    
    // Inform patient about the transfer
    await telnyxHelper.speakText(callControlId, 
      "I understand this is an emergency. I'm connecting you directly to our emergency doctor now. Please hold on.",
      { voice: 'male' }
    );
    
    // Determine which doctor to call
    const currentHour = new Date().getHours();
    const isNightTime = currentHour < 8 || currentHour > 18;
    
    let doctorPhone;
    if (isNightTime) {
      doctorPhone = process.env.NIGHT_EMERGENCY_DOCTOR || process.env.PRIMARY_EMERGENCY_DOCTOR;
    } else {
      doctorPhone = process.env.PRIMARY_EMERGENCY_DOCTOR;
    }
    
    // Transfer call directly to doctor
    await telnyxHelper.transferCall(callControlId, doctorPhone);
    
    emergencyRecord.status = 'transferred_to_doctor';
    emergencyRecord.transferredTo = doctorPhone;
    
    console.log(`📞 Emergency call transferred to: ${doctorPhone}`);
    
  } catch (error) {
    console.error('❌ Emergency fallback failed:', error);
    emergencyRecord.status = 'fallback_failed';
    throw error;
  }
}

/**
 * Send emergency notifications (SMS + Email)
 * @param {Object} emergencyRecord - Emergency record
 * @param {Object} emergencyInfo - Structured emergency info
 */
async function sendEmergencyNotifications(emergencyRecord, emergencyInfo) {
  try {
    // Prepare patient information for notifications
    const patientInfo = {
      name: emergencyInfo?.name || extractNameFromMessage(emergencyRecord.message),
      phone: emergencyInfo?.phone || emergencyRecord.patientPhone,
      symptoms: emergencyInfo?.symptoms || emergencyRecord.message,
      pain_level: emergencyInfo?.pain_level || null,
      urgency_level: 'emergency',
      emergencyId: emergencyRecord.id,
      timestamp: emergencyRecord.timestamp
    };
    
    // Send SMS notification
    console.log('📱 Sending emergency SMS notification');
    const smsResult = await sendDoctorNotification(patientInfo, 'emergency');
    
    if (smsResult.success) {
      console.log(`✅ Emergency SMS sent: ${smsResult.messageId}`);
    } else {
      console.error(`❌ Emergency SMS failed: ${smsResult.error}`);
    }
    
    // Send Email notification
    console.log('📧 Sending emergency email notification');
    const emailResult = await sendDoctorEmailNotification(patientInfo, 'emergency');
    
    if (emailResult.success) {
      console.log(`✅ Emergency email sent: ${emailResult.messageId}`);
    } else {
      console.error(`❌ Emergency email failed: ${emailResult.error}`);
    }
    
    return {
      sms: smsResult,
      email: emailResult
    };
    
  } catch (error) {
    console.error('❌ Error sending emergency notifications:', error);
    throw error;
  }
}

/**
 * Extract name from emergency message (simple implementation)
 * @param {string} message - Emergency message
 * @returns {string} Extracted name or 'Unknown'
 */
function extractNameFromMessage(message) {
  // Simple regex to extract names like "My name is John" or "This is Mary"
  const namePatterns = [
    /(?:my name is|i am|this is|i'm)\s+([a-zA-Z\s]+)/i,
    /^([a-zA-Z\s]+)(?:\s+here|\s+calling)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 1 && name.length < 50) {
        return name;
      }
    }
  }
  
  return 'Unknown Patient';
}

/**
 * Send emergency alerts to all configured contacts
 * @param {Object} emergencyRecord - Emergency record
 * @param {Object} practiceSettings - Practice configuration
 */
async function sendEmergencyAlerts(emergencyRecord, practiceSettings) {
  const { patientPhone, message, timestamp } = emergencyRecord;
  const alertMessage = `🚨 DENTAL EMERGENCY ALERT 🚨\n\nPatient: ${patientPhone}\nTime: ${new Date(timestamp).toLocaleString()}\nMessage: ${message}\n\nPatient is being connected to emergency conference. Join immediately.`;

  const emergencyContacts = practiceSettings.emergencyContacts || [];
  
  // Send SMS to all emergency contacts
  for (const contact of emergencyContacts) {
    try {
      const smsEnabled = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
      if (smsEnabled) {
        const sms = await telnyxClient.sendSMS(contact.phone, alertMessage);
        emergencyRecord.alerts.push({
          type: 'sms',
          contact: contact.phone,
          name: contact.name,
          sid: sms.sid,
          timestamp: new Date().toISOString()
        });
        console.log(`📱 Emergency SMS sent to ${contact.name} (${contact.phone})`);
      } else {
        console.log(`📱 SMS disabled - would send emergency alert to ${contact.name}`);
      }
    } catch (error) {
      console.error(`Failed to send emergency SMS to ${contact.phone}:`, error);
    }
  }

  // Send email alert to admin using SendGrid
  if (practiceSettings.adminEmail) {
    try {
      await sendEmergencyEmail(emergencyRecord, practiceSettings);
    } catch (error) {
      console.error('Failed to send emergency email:', error);
    }
  }
}

/**
 * Handle emergency during an active call - SIMPLIFIED APPROACH
 * @param {Object} emergencyRecord - Emergency record
 * @param {Object} practiceSettings - Practice configuration
 * @returns {Promise<Object>} Conference details
 */
async function handleEmergencyCall(emergencyRecord, practiceSettings) {
  try {
    const enableConference = process.env.ENABLE_CONFERENCE_CALLS === 'true';
    
    if (!enableConference) {
      console.log('📞 Conference calls disabled - using fallback emergency response');
      return { type: 'fallback', message: 'Conference disabled' };
    }

    console.log(`📞 Creating emergency conference for ${emergencyRecord.id}`);
    
    // Create emergency conference name (TwiML-based, no REST API)
    const conferenceName = `emergency-${emergencyRecord.id}`;
    
    console.log(`✅ Emergency conference prepared: ${conferenceName}`);

    // Send notifications to doctors (SMS/Email only - no calls)
    await notifyEmergencyDoctors(emergencyRecord, conferenceName);

    emergencyRecord.conferenceName = conferenceName;
    emergencyRecord.conferenceType = 'twiml';
    emergencyRecord.status = 'conference_ready';
    
    console.log(`🎪 Emergency conference ${conferenceName} ready - doctors notified`);
    
    return {
      type: 'conference',
      conferenceName: conferenceName,
      conferenceType: 'twiml',
      notificationsSent: true
    };
    
  } catch (error) {
    console.error('❌ Error creating emergency conference:', error);
    return { type: 'error', error: error.message };
  }
}

/**
 * Notify emergency doctors via SMS/Email (no outbound calls)
 * @param {Object} emergencyRecord - Emergency record
 * @param {string} conferenceName - Conference name
 */
async function notifyEmergencyDoctors(emergencyRecord, conferenceName) {
  const primaryDoctor = process.env.PRIMARY_EMERGENCY_DOCTOR;
  const telnyxNumber = process.env.TELNYX_PHONE_NUMBER;
  
  const notificationMessage = `🚨 DENTAL EMERGENCY 🚨
Patient: ${emergencyRecord.patientPhone}
Conference: ${conferenceName}

CALL NOW: ${telnyxNumber}
Say "Doctor Emergency" to join the conference.

Time: ${new Date().toLocaleString()}`;

  console.log(`📧 Notifying emergency doctors about conference: ${conferenceName}`);
  
  // Send SMS notification (if enabled)
  if (process.env.ENABLE_SMS_NOTIFICATIONS === 'true' && primaryDoctor) {
    try {
      await telnyxClient.sendSMS(primaryDoctor, notificationMessage);
      console.log(`📱 Emergency SMS sent to doctor: ${primaryDoctor}`);
    } catch (error) {
      console.error(`❌ Failed to send SMS to doctor:`, error);
    }
  } else {
    console.log(`📱 SMS disabled - would notify doctor: ${primaryDoctor}`);
  }
}

/**
 * Generate TwiML to connect patient to emergency conference
 * @param {string} conferenceName - Conference name
 * @param {string} emergencyId - Emergency ID
 * @returns {string} TwiML XML
 */
function generateEmergencyConferenceTwiML(conferenceName, emergencyId) {
  // Use the simplified TwiML generation from telnyx.js
  return telnyxClient.generateConferenceTwiML(conferenceName, {
    announcement: "This is a dental emergency. I'm connecting you to our emergency doctor now. Please stay on the line.",
    timeout: 60,
    record: 'record-from-answer',
    recordingCallback: `/webhook/emergency-recording?emergencyId=${emergencyId}`,
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    recordConference: 'record-from-start'
  });
}

/**
 * Initiate outbound emergency call to patient
 * @param {Object} emergencyRecord - Emergency record
 * @param {Object} practiceSettings - Practice configuration
 */
async function initiateEmergencyCall(emergencyRecord, practiceSettings) {
  try {
    const callbackUrl = `${process.env.BASE_URL}/webhook/emergency-callback?emergencyId=${emergencyRecord.id}`;
    
    // Call patient back immediately
    const call = await telnyxClient.makeCall(emergencyRecord.patientPhone, callbackUrl);
    
    emergencyRecord.outboundCallSid = call.sid;
    emergencyRecord.status = 'calling_patient';
    
    console.log(`📞 Initiated emergency callback to ${emergencyRecord.patientPhone}`);
    
  } catch (error) {
    console.error('Error initiating emergency call:', error);
    throw error;
  }
}

/**
 * Connect existing call to emergency conference
 * @param {string} callSid - Existing call SID
 * @param {string} conferenceName - Conference name  
 * @param {string} emergencyId - Emergency ID
 * @returns {Promise<string>} TwiML to redirect call
 */
async function connectCallToEmergencyConference(callSid, conferenceName, emergencyId) {
  try {
    // Generate TwiML to connect to conference
    const twiml = generateEmergencyConferenceTwiML(conferenceName, emergencyId);
    
    // Update the call to use new TwiML
    await telnyxClient.client.calls(callSid).update({
      twiml: twiml
    });
    
    console.log(`🎪 Connected call ${callSid} to emergency conference ${conferenceName}`);
    return twiml;
    
  } catch (error) {
    console.error('❌ Error connecting call to conference:', error);
    throw error;
  }
}

/**
 * Log emergency for compliance and record keeping
 * @param {Object} emergencyRecord - Emergency record
 */
async function logEmergency(emergencyRecord) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, `emergency-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `${new Date().toISOString()} - EMERGENCY - ${JSON.stringify(emergencyRecord)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
    console.log(`📝 Emergency logged to ${logFile}`);
    
  } catch (error) {
    console.error('Error logging emergency:', error);
  }
}

/**
 * Generate unique emergency ID
 * @returns {string} Emergency ID
 */
function generateEmergencyId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `EMG-${timestamp}-${random}`.toUpperCase();
}

/**
 * Update emergency status
 * @param {string} emergencyId - Emergency ID
 * @param {string} status - New status
 * @param {Object} additionalData - Additional data to update
 */
async function updateEmergencyStatus(emergencyId, status, additionalData = {}) {
  try {
    console.log(`📊 Emergency ${emergencyId} status updated to: ${status}`, additionalData);
    
    // Log status update
    const logEntry = {
      emergencyId,
      status,
      timestamp: new Date().toISOString(),
      ...additionalData
    };
    
    await logEmergency(logEntry);
    
  } catch (error) {
    console.error('Error updating emergency status:', error);
  }
}

/**
 * Get emergency details by ID
 * @param {string} emergencyId - Emergency ID
 * @returns {Object|null} Emergency record
 */
async function getEmergencyById(emergencyId) {
  try {
    console.log(`🔍 Looking up emergency: ${emergencyId}`);
    return null;
    
  } catch (error) {
    console.error('Error getting emergency by ID:', error);
    return null;
  }
}

module.exports = {
  handleEmergency,
  sendEmergencyAlerts,
  handleEmergencyCall,
  initiateEmergencyCall,
  connectCallToEmergencyConference,
  generateEmergencyConferenceTwiML,
  updateEmergencyStatus,
  getEmergencyById,
  generateEmergencyId
}; 