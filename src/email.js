const NodemailerComponent = require('./utils/nodemailerComponent');
require('dotenv').config();

const FROM_EMAIL = process.env.GMAIL_USER;
const FROM_NAME = process.env.FROM_NAME || 'Your Practice';

if (!FROM_EMAIL) {
  console.warn('Warning: GMAIL_USER not set. Email functionality may be limited.');
}

const mailer = new NodemailerComponent();

/**
 * Send email using SendGrid
 * @param {Object} emailData - Email configuration
 * @returns {Promise<Object>} Send result
 */
async function sendEmail(emailData) {
  try {
    const response = await mailer.sendMail(
      emailData.to,
      emailData.subject,
      emailData.text,
      emailData.html
    );
    console.log(`Email sent successfully from ${FROM_EMAIL} to ${emailData.to}`);
    return response;
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
}

/**
 * Send emergency alert email
 * @param {Object} emergencyRecord - Emergency record
 * @param {Object} practiceSettings - Practice configuration
 */
async function sendEmergencyEmail(emergencyRecord, practiceSettings) {
  try {
    const emailData = {
      to: practiceSettings.adminEmail,
      subject: `🚨 URGENT: Medical Emergency Alert - ${emergencyRecord.patientPhone}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d32f2f; text-align: center;">🚨 MEDICAL EMERGENCY ALERT 🚨</h2>
          
          <div style="background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Time:</strong> ${new Date(emergencyRecord.timestamp).toLocaleString()}</p>
            <p><strong>Patient Phone:</strong> ${emergencyRecord.patientPhone}</p>
            <p><strong>Emergency ID:</strong> ${emergencyRecord.id}</p>
          </div>
          
          <h3>Emergency Message:</h3>
          <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;">
            ${emergencyRecord.message}
          </blockquote>
          
          <h3>Patient Information:</h3>
          <ul>
            <li><strong>Symptoms:</strong> ${emergencyRecord.patientInfo.symptoms.join(', ') || 'None detected'}</li>
            <li><strong>Contact Info:</strong> ${JSON.stringify(emergencyRecord.patientInfo.contactInfo)}</li>
          </ul>
          
          <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-weight: bold; color: #1976d2;">Please respond immediately</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="tel:${emergencyRecord.patientPhone}" 
               style="background: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
              📞 Call Patient
            </a>
            <a href="mailto:${practiceSettings.adminEmail}?subject=Re: Emergency ${emergencyRecord.id}" 
               style="background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
              📧 Send Update
            </a>
          </div>
        </div>
      `
    };

    await sendEmail(emailData);
    console.log(`Emergency email sent to ${practiceSettings.adminEmail}`);
  } catch (error) {
    console.error('Error sending emergency email:', error);
    throw error;
  }
}

/**
 * Send intake notification email
 * @param {Object} intakeRecord - Intake record
 * @param {Object} practiceSettings - Practice configuration
 */
async function sendIntakeEmail(intakeRecord, practiceSettings) {
  try {
    const priorityColors = {
      high: '#ff5722',
      medium: '#ff9800',
      low: '#4caf50'
    };

    const priorityEmoji = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };

    const emailData = {
      to: practiceSettings.staffEmail || practiceSettings.adminEmail,
      subject: `${priorityEmoji[intakeRecord.priority]} New Patient Intake - ${intakeRecord.patientPhone}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1976d2;">New Patient Intake</h2>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Priority:</strong> 
              <span style="color: ${priorityColors[intakeRecord.priority]}; font-weight: bold;">
                ${intakeRecord.priority.toUpperCase()} ${priorityEmoji[intakeRecord.priority]}
              </span>
            </p>
            <p><strong>Time:</strong> ${new Date(intakeRecord.timestamp).toLocaleString()}</p>
            <p><strong>Patient Phone:</strong> ${intakeRecord.patientPhone}</p>
            <p><strong>Intake ID:</strong> ${intakeRecord.id}</p>
          </div>
          
          <h3>Patient Message:</h3>
          <blockquote style="background: #e3f2fd; padding: 15px; border-left: 4px solid #1976d2; margin: 20px 0;">
            ${intakeRecord.message}
          </blockquote>
          
          <h3>Extracted Information:</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="border: 1px solid #ddd; padding: 12px; background: #f9f9f9; font-weight: bold;">Symptoms:</td>
              <td style="border: 1px solid #ddd; padding: 12px;">${intakeRecord.patientInfo.symptoms.join(', ') || 'None detected'}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 12px; background: #f9f9f9; font-weight: bold;">Contact Info:</td>
              <td style="border: 1px solid #ddd; padding: 12px;">${JSON.stringify(intakeRecord.patientInfo.contactInfo)}</td>
            </tr>
          </table>
          
          <p><strong>Response Required By:</strong> ${getResponseDeadline(intakeRecord.priority)}</p>
          
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 15px 0; font-weight: bold;">Quick Actions:</p>
            <a href="tel:${intakeRecord.patientPhone}" 
               style="background: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
              📞 Call Patient
            </a>
            <a href="mailto:${practiceSettings.adminEmail}?subject=Re: Intake ${intakeRecord.id}" 
               style="background: #4caf50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
              📧 Send Update
            </a>
          </div>
        </div>
      `
    };

    await sendEmail(emailData);
    console.log(`Intake email sent to ${practiceSettings.staffEmail || practiceSettings.adminEmail}`);
  } catch (error) {
    console.error('Error sending intake email:', error);
    throw error;
  }
}

/**
 * Send AI receptionist summary email
 * @param {Object} callSummary - Call summary from AI receptionist
 * @param {Object} practiceSettings - Practice configuration
 */
async function sendReceptionistSummary(callSummary, practiceSettings) {
  try {
    // Ensure we have valid data or defaults
    const safeData = {
      name: callSummary.name || 'Unknown',
      phone: callSummary.phone || 'Unknown',
      status: callSummary.status || 'Unknown',
      summary: callSummary.summary || 'No summary available'
    };

    // Determine status color (red for Urgency, green for Non-Urgency)
    const statusColor = safeData.status === 'Urgency' ? '#d32f2f' : '#2e7d32';

    const emailData = {
      to: practiceSettings.adminEmail || process.env.ADMIN_EMAIL || 'dentalreception6@gmail.com',
      subject: `AFTER HOURS - ${safeData.name} (${safeData.status})`,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; text-align: left;">
Name: ${safeData.name}
<br><br>
Phone: ${safeData.phone}
<br><br>
Status: <span style="color: ${statusColor}; font-weight: bold;">${safeData.status}</span>
<br><br>
Summary: ${safeData.summary}
<br><br>
Sent by AI - Front Desk
</div>`,
      text: `Name: ${safeData.name}

Phone: ${safeData.phone}

Status: ${safeData.status}

Summary: ${safeData.summary}

Sent by AI - Front Desk`
    };

    const result = await sendEmail(emailData);
    console.log(`Email sent successfully to ${emailData.to}`);
    return result;
  } catch (error) {
    console.error('Error sending receptionist summary:', error);
    throw error;
  }
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

module.exports = {
  sendEmail,
  sendEmergencyEmail,
  sendIntakeEmail,
  sendReceptionistSummary
};
