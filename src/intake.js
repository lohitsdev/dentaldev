const telnyxClient = require('./telnyx');
const { generateIntakeAudio } = require('./tts');
const { extractPatientInfo } = require('./dialog');
const { sendIntakeEmail } = require('./email');
const config = require('./config');
require('dotenv').config();

/**
 * Handle non-emergency patient intake
 * @param {string} patientPhone - Patient's phone number
 * @param {string} message - Patient message
 * @param {string} messageId - Message ID (if from SMS) or call SID (if from call)
 * @returns {Promise<Object>} Intake result
 */
async function handleIntake(patientPhone, message, messageId = null) {
  try {
    console.log(`Processing intake for ${patientPhone}: ${message}`);
    
    const patientInfo = extractPatientInfo(message);
    const practiceSettings = config.getPracticeSettings();
    
    // Create intake record
    const intakeRecord = {
      id: generateIntakeId(),
      timestamp: new Date().toISOString(),
      patientPhone: patientPhone,
      message: message,
      messageId: messageId,
      priority: determinePriority(message),
      patientInfo: patientInfo,
      status: 'pending',
      followUpScheduled: false
    };

    // Send confirmation to patient
    const confirmationMessage = `Thank you for contacting ${practiceSettings.name}. We've received your message and will get back to you within ${practiceSettings.responseTime || '24 hours'}.

If this is a medical emergency, please call 911 or go to your nearest emergency room.`;
    
    const smsSuccess = await sendPatientConfirmation(patientPhone, confirmationMessage);
    if (smsSuccess) {
      intakeRecord.confirmationSent = true;
    } else {
      intakeRecord.confirmationSent = false;
      intakeRecord.confirmationNote = 'SMS not supported for this number';
    }
    
    // Notify staff via email using SendGrid
    await sendIntakeEmail(intakeRecord, practiceSettings);
    
    // If this is from an active call, provide verbal confirmation
    if (messageId && messageId.startsWith('CA')) { // Twilio Call SID format
      await handleIntakeCall(intakeRecord, practiceSettings);
    }

    // Log intake for records
    await logIntake(intakeRecord);
    
    // Schedule follow-up if needed
    await scheduleFollowUp(intakeRecord, practiceSettings);

    console.log(`Intake processed for ${patientPhone} - ID: ${intakeRecord.id}`);
    return intakeRecord;
    
  } catch (error) {
    console.error('Error handling intake:', error);
    throw error;
  }
}

/**
 * Send confirmation SMS to patient
 * @param {string} phoneNumber - Patient's phone number
 * @param {string} message - Confirmation message
 * @returns {Promise<boolean>} Success status
 */
async function sendPatientConfirmation(phoneNumber, message) {
  try {
    // Check if it's an international number that might not support SMS from US numbers
    const isInternational = phoneNumber.startsWith('+') && !phoneNumber.startsWith('+1');
    
    if (isInternational) {
      console.log(`Skipping SMS for international number ${phoneNumber} - may not be supported`);
      return true; // Return success to not break the flow
    }
    
    await telnyxClient.sendSMS(phoneNumber, message);
    console.log(`Patient confirmation sent to ${phoneNumber}`);
    return true;
    
  } catch (error) {
    // Log the error but don't throw - SMS is optional
    console.error('Error sending patient confirmation:', error);
    
    // Check if it's a Twilio messaging error
    if (error.code === 21612 || error.code === 21614 || error.code === 21408) {
      console.log(`SMS not supported for ${phoneNumber} - continuing without SMS confirmation`);
      return false; // SMS failed but continue
    }
    
    // For other errors, also continue but log
    console.log('SMS confirmation failed, continuing without SMS');
    return false;
  }
}

/**
 * Handle intake during an active call
 * @param {Object} intakeRecord - Intake record
 * @param {Object} practiceSettings - Practice configuration
 */
async function handleIntakeCall(intakeRecord, practiceSettings) {
  try {
    const responseMessage = `Thank you for calling ${practiceSettings.name}. I've got all your information and our team will get back to you within ${practiceSettings.responseTime || '24 hours'}. Is there anything else I can help you with today?`;
    
    // Generate TwiML response
    const twiml = telnyxClient.generateTwiML(responseMessage, {
      gather: true,
      action: `/webhook/intake-followup?intakeId=${intakeRecord.id}`
    });
    
    intakeRecord.twimlResponse = twiml;
    
  } catch (error) {
    console.error('Error handling intake call:', error);
  }
}

/**
 * Determine intake priority based on message content
 * @param {string} message - Patient message
 * @returns {string} Priority level (high, medium, low)
 */
function determinePriority(message) {
  const messageText = message.toLowerCase();
  
  // High priority indicators
  const highPriorityKeywords = [
    'urgent', 'asap', 'soon as possible', 'worried', 'concerned',
    'pain', 'fever', 'infection', 'problem', 'issue', 'help'
  ];
  
  // Medium priority indicators
  const mediumPriorityKeywords = [
    'question', 'follow-up', 'results', 'prescription', 'medication',
    'appointment', 'schedule', 'consultation'
  ];
  
  // Check for high priority
  for (const keyword of highPriorityKeywords) {
    if (messageText.includes(keyword)) {
      return 'high';
    }
  }
  
  // Check for medium priority
  for (const keyword of mediumPriorityKeywords) {
    if (messageText.includes(keyword)) {
      return 'medium';
    }
  }
  
  return 'low';
}

/**
 * Get response deadline based on priority
 * @param {string} priority - Priority level
 * @returns {string} Formatted deadline
 */
function getResponseDeadline(priority) {
  const now = new Date();
  let deadline;
  
  switch (priority) {
    case 'high':
      deadline = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours
      break;
    case 'medium':
      deadline = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours
      break;
    default:
      deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  }
  
  return deadline.toLocaleString();
}

/**
 * Schedule follow-up for intake
 * @param {Object} intakeRecord - Intake record
 * @param {Object} practiceSettings - Practice configuration
 */
async function scheduleFollowUp(intakeRecord, practiceSettings) {
  try {
    // In a real implementation, this would integrate with a scheduling system
    console.log(`Follow-up scheduled for intake ${intakeRecord.id}`);
    
    // Calculate follow-up time based on priority
    const followUpDelay = {
      high: 4 * 60 * 60 * 1000,   // 4 hours
      medium: 12 * 60 * 60 * 1000, // 12 hours
      low: 24 * 60 * 60 * 1000    // 24 hours
    };
    
    const followUpTime = new Date(Date.now() + followUpDelay[intakeRecord.priority]);
    
    intakeRecord.followUpScheduled = followUpTime.toISOString();
    console.log(`Follow-up scheduled for ${followUpTime.toLocaleString()}`);
    
  } catch (error) {
    console.error('Error scheduling follow-up:', error);
  }
}

/**
 * Log intake for record keeping
 * @param {Object} intakeRecord - Intake record
 */
async function logIntake(intakeRecord) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, `intake-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `${new Date().toISOString()} - INTAKE - ${JSON.stringify(intakeRecord)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
    console.log(`Intake logged to ${logFile}`);
    
  } catch (error) {
    console.error('Error logging intake:', error);
  }
}

/**
 * Generate unique intake ID
 * @returns {string} Intake ID
 */
function generateIntakeId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `INT-${timestamp}-${random}`.toUpperCase();
}

/**
 * Update intake status
 * @param {string} intakeId - Intake ID
 * @param {string} status - New status
 * @param {Object} additionalData - Additional data
 */
async function updateIntakeStatus(intakeId, status, additionalData = {}) {
  try {
    console.log(`Intake ${intakeId} status updated to: ${status}`, additionalData);
    
    const logEntry = {
      intakeId,
      status,
      timestamp: new Date().toISOString(),
      ...additionalData
    };
    
    await logIntake(logEntry);
    
  } catch (error) {
    console.error('Error updating intake status:', error);
  }
}

/**
 * Get intake by ID
 * @param {string} intakeId - Intake ID
 * @returns {Object|null} Intake record
 */
async function getIntakeById(intakeId) {
  try {
    console.log(`Looking up intake: ${intakeId}`);
    // In a real implementation, this would query a database
    return null;
    
  } catch (error) {
    console.error('Error getting intake by ID:', error);
    return null;
  }
}

module.exports = {
  handleIntake,
  sendPatientConfirmation,
  determinePriority,
  updateIntakeStatus,
  getIntakeById,
  generateIntakeId
}; 