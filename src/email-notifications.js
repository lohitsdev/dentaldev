const NodemailerComponent = require('./utils/nodemailerComponent');
require('dotenv').config();

// Initialize Nodemailer
const mailer = new NodemailerComponent();

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
 * Send email notification to doctor
 * @param {Object} patientInfo - Patient information
 * @param {string} urgencyLevel - Urgency level (emergency or non-emergency)
 * @returns {Promise<Object>} Email send result
 */
async function sendDoctorEmailNotification(patientInfo, urgencyLevel = 'non-emergency') {
  try {
    const isEmergency = urgencyLevel === 'emergency';
    const templateEnabled = isEmergency 
      ? process.env.EMAIL_TEMPLATE_EMERGENCY_ENABLED === 'true'
      : process.env.EMAIL_TEMPLATE_NONEMERGENCY_ENABLED === 'true';

    // If email notifications are disabled for this type, return early
    if (!templateEnabled) {
      console.log(`📧 ${isEmergency ? 'Emergency' : 'Non-emergency'} email notifications are disabled`);
      return {
        success: false,
        error: 'Email notifications disabled for this type'
      };
    }

    // Get appropriate template
    const subject = isEmergency
      ? process.env.EMAIL_TEMPLATE_EMERGENCY_SUBJECT
      : process.env.EMAIL_TEMPLATE_NONEMERGENCY_SUBJECT;

    const body = isEmergency
      ? process.env.EMAIL_TEMPLATE_EMERGENCY_BODY
      : process.env.EMAIL_TEMPLATE_NONEMERGENCY_BODY;

    // Prepare data for template processing
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

    // Process templates
    const processedSubject = processTemplate(subject, templateData);
    const processedBody = processTemplate(body, templateData);

const result = await mailer.sendMail(
  process.env.PRIMARY_DOCTOR_EMAIL,
  processedSubject,
  processedBody.replace(/<[^>]*>/g, ''), // Strip HTML for text version
  processedBody
);
console.log(`Email sent from ${process.env.GMAIL_USER} to ${process.env.PRIMARY_DOCTOR_EMAIL}`);
    console.log(`📧 ${isEmergency ? 'Emergency' : 'Non-emergency'} email notification sent: ${result.messageId}`);
    
    return {
      success: true,
      messageId: result.messageId
    };
    
  } catch (error) {
    console.error('❌ Error sending email notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendDoctorEmailNotification
};
