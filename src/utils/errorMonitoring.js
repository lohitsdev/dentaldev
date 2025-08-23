const NodemailerComponent = require('./nodemailerComponent');
require('dotenv').config();

const mailer = new NodemailerComponent();
const ERROR_EMAIL = 'dentalreception6@gmail.com';

/**
 * Send detailed error notification email
 * @param {Object} errorData - Error information
 * @param {Object} requestData - Request data that caused the error
 * @param {string} endpoint - Endpoint that failed
 * @returns {Promise<void>}
 */
async function sendErrorNotification(errorData, requestData = {}, endpoint = 'Unknown') {
  try {
    const timestamp = new Date().toISOString();
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Prepare error details
    const errorDetails = {
      errorId,
      timestamp,
      endpoint,
      errorMessage: errorData.message || 'Unknown error',
      errorStack: errorData.stack || 'No stack trace available',
      requestBody: requestData.body || {},
      requestHeaders: requestData.headers || {},
      requestQuery: requestData.query || {},
      requestMethod: requestData.method || 'Unknown',
      requestUrl: requestData.url || 'Unknown',
      userAgent: requestData.headers?.['user-agent'] || 'Unknown',
      ipAddress: requestData.ip || requestData.connection?.remoteAddress || 'Unknown'
    };

    // Create detailed HTML email
    const htmlContent = generateErrorEmailHTML(errorDetails);
    
    // Create text version
    const textContent = generateErrorEmailText(errorDetails);

    // Send email
    await mailer.sendMail(
      ERROR_EMAIL,
      `🚨 SYSTEM ERROR - ${endpoint} - ${errorId}`,
      textContent,
      htmlContent
    );

    console.log(`📧 Error notification sent to ${ERROR_EMAIL} for error: ${errorId}`);
    
  } catch (emailError) {
    console.error('❌ Failed to send error notification email:', emailError);
    // Log the original error details to console as fallback
    console.error('Original error details:', {
      endpoint,
      error: errorData.message,
      stack: errorData.stack,
      requestData: JSON.stringify(requestData, null, 2)
    });
  }
}

/**
 * Generate HTML email content for error notification
 * @param {Object} errorDetails - Error details object
 * @returns {string} HTML content
 */
function generateErrorEmailHTML(errorDetails) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #f5f5f5; padding: 20px;">
      <div style="background-color: #d32f2f; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">🚨 SYSTEM ERROR ALERT</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Dental After Hours System</p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #d32f2f;">
          <h2 style="color: #d32f2f; margin: 0 0 15px 0; font-size: 20px;">Error Summary</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #333; width: 150px;">Error ID:</td>
              <td style="padding: 8px 0; color: #666; font-family: monospace;">${errorDetails.errorId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #333;">Timestamp:</td>
              <td style="padding: 8px 0; color: #666;">${new Date(errorDetails.timestamp).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #333;">Endpoint:</td>
              <td style="padding: 8px 0; color: #666; font-family: monospace;">${errorDetails.endpoint}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #333;">Method:</td>
              <td style="padding: 8px 0; color: #666;">${errorDetails.requestMethod}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #333;">IP Address:</td>
              <td style="padding: 8px 0; color: #666;">${errorDetails.ipAddress}</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #d32f2f; margin: 0 0 15px 0; font-size: 18px;">🔥 Error Message</h3>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; border-left: 4px solid #ff5722;">
            <code style="color: #d32f2f; font-size: 14px; word-break: break-word;">${errorDetails.errorMessage}</code>
          </div>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #1976d2; margin: 0 0 15px 0; font-size: 18px;">📥 Request Data</h3>
          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 6px; border-left: 4px solid #1976d2;">
            <h4 style="margin: 0 0 10px 0; color: #1976d2;">Request Body:</h4>
            <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin: 0 0 15px 0;"><code>${JSON.stringify(errorDetails.requestBody, null, 2)}</code></pre>
            
            <h4 style="margin: 0 0 10px 0; color: #1976d2;">Request URL:</h4>
            <code style="background-color: #f5f5f5; padding: 5px; border-radius: 4px; font-size: 12px;">${errorDetails.requestUrl}</code>
            
            <h4 style="margin: 15px 0 10px 0; color: #1976d2;">User Agent:</h4>
            <code style="background-color: #f5f5f5; padding: 5px; border-radius: 4px; font-size: 12px; word-break: break-word;">${errorDetails.userAgent}</code>
          </div>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #ff5722; margin: 0 0 15px 0; font-size: 18px;">🔍 Stack Trace</h3>
          <div style="background-color: #fff3e0; padding: 15px; border-radius: 6px; border-left: 4px solid #ff5722;">
            <pre style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 11px; margin: 0; white-space: pre-wrap; word-break: break-word;"><code>${errorDetails.errorStack}</code></pre>
          </div>
        </div>

        <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #4caf50;">
          <h3 style="color: #2e7d32; margin: 0 0 15px 0;">🔧 Next Steps</h3>
          <p style="margin: 0; color: #2e7d32; font-size: 14px;">
            1. Check the error message and stack trace above<br/>
            2. Review the request data for any malformed inputs<br/>
            3. Check server logs for additional context<br/>
            4. Test the endpoint manually if needed<br/>
            5. Monitor for similar errors
          </p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 0;">Dental After Hours Error Monitoring System</p>
          <p style="margin: 5px 0 0 0;">Generated at ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate text email content for error notification
 * @param {Object} errorDetails - Error details object
 * @returns {string} Text content
 */
function generateErrorEmailText(errorDetails) {
  return `
🚨 SYSTEM ERROR ALERT - Dental After Hours System

ERROR SUMMARY
=============
Error ID: ${errorDetails.errorId}
Timestamp: ${new Date(errorDetails.timestamp).toLocaleString()}
Endpoint: ${errorDetails.endpoint}
Method: ${errorDetails.requestMethod}
IP Address: ${errorDetails.ipAddress}

ERROR MESSAGE
=============
${errorDetails.errorMessage}

REQUEST DATA
============
URL: ${errorDetails.requestUrl}
Body: ${JSON.stringify(errorDetails.requestBody, null, 2)}
User Agent: ${errorDetails.userAgent}

STACK TRACE
===========
${errorDetails.errorStack}

NEXT STEPS
==========
1. Check the error message and stack trace above
2. Review the request data for any malformed inputs
3. Check server logs for additional context
4. Test the endpoint manually if needed
5. Monitor for similar errors

---
Dental After Hours Error Monitoring System
Generated at ${new Date().toLocaleString()}
  `;
}

/**
 * Send webhook processing failure notification
 * @param {string} webhookType - Type of webhook that failed
 * @param {Object} webhookData - Original webhook data
 * @param {Error} error - Error that occurred
 * @param {Object} requestData - Express request object data
 */
async function sendWebhookFailureNotification(webhookType, webhookData, error, requestData) {
  const errorData = {
    message: `Webhook processing failed: ${webhookType}`,
    stack: error.stack,
    webhookType,
    webhookData,
    originalError: error.message
  };

  await sendErrorNotification(errorData, requestData, `webhook/${webhookType}`);
}

/**
 * Send unhandled endpoint notification
 * @param {Object} requestData - Express request object data
 */
async function sendUnhandledEndpointNotification(requestData) {
  const errorData = {
    message: `Unhandled endpoint accessed: ${requestData.method} ${requestData.url}`,
    stack: 'No stack trace - endpoint not found',
    endpointNotFound: true
  };

  await sendErrorNotification(errorData, requestData, 'unhandled-endpoint');
}

module.exports = {
  sendErrorNotification,
  sendWebhookFailureNotification,
  sendUnhandledEndpointNotification
};
