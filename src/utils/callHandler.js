// Required imports
const { storeCallData, getCallData, deleteCallData } = require('./fileStorage');

/**
 * Send SMS notification
 * @param {Object} callData - Call data including transcription
 * @param {boolean} isEmergency - Whether this is an emergency call
 */
async function sendSMSNotification(callData, isEmergency = false) {
  // Only send SMS for emergency cases
  if (!isEmergency) {
    console.log('[SMS SKIPPED] Non-emergency case - SMS notification not required');
    return;
  }

  try {
    // Simple emergency message
    const message = `EMERGENCY: A patient needs immediate dental attention. AI Assistant is gathering details and will transfer the call once assessment is complete.`;

    // Get the recipient phone number
    const recipientNumber = process.env.PRIMARY_EMERGENCY_DOCTOR;

    // Ensure the recipient number is valid
    if (!recipientNumber || !recipientNumber.startsWith('+')) {
      throw new Error('Invalid recipient phone number format. Must start with "+" followed by country code.');
    }

    const axios = require('axios');
    await axios.post('https://api.telnyx.com/v2/messages', {
      from: process.env.TELNYX_PHONE_NUMBER,
      to: recipientNumber,
      text: message,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[SMS SENT] Emergency notification sent to ${recipientNumber}`);
  } catch (error) {
    console.error('[SMS ERROR]', error.message, error.response?.data || '');
  }
}

/**
 * Handle AI Assistant event
 * @param {Object} event - AI Assistant event data
 * @returns {Promise<Object>} Event handling result
 */
async function handleAssistantEvent(event) {
  try {
    console.log('[AI ASSISTANT EVENT] Processing data:', event.data.payload);
    
    // Extract patient information from payload
    const patientInfo = {
      name: event.data.payload.name !== undefined ? event.data.payload.name || 'Unknown' : 'Unknown',
      phone: event.data.payload.phone !== undefined ? event.data.payload.phone || 'Unknown' : 'Unknown',
      symptoms: event.data.payload.Reasons || 'Not specified',
      timeCalled: new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      status: event.data.payload.Emergency !== undefined ? 
        (event.data.payload.Emergency === true ? 'Urgent' : 'Non-Urgent') : 
        'Unknown',
      timestamp: new Date()
    };

    // Log patient info
    console.log('📝 Patient Info:', patientInfo);
    
    // Store patient info in disk
    const storageKey = event.data.payload.call_control_id || event.data.payload.Conversational_id || `call_${Date.now()}`;
    await storeCallData(storageKey, patientInfo);
    console.log(`💾 Stored call data with ID: ${storageKey}`);

    // Send SMS for emergencies
    if (event.data.payload.Emergency === true) {
      await sendSMSNotification(patientInfo, true);
    }
    
    return {
      status: 'processed',
      patientInfo,
      storageKey
    };

  } catch (error) {
    console.error('Error handling AI Assistant event:', error);
    throw error;
  }
}

/**
 * Handle emergency status event
 * @param {Object} event - Emergency status event data
 * @returns {Promise<Object>} Event handling result
 */
async function handleEmergencyStatus(event) {
  try {
    const requestId = event.data.payload.request_id || `emg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Check the Emergency field from the payload
    const isEmergency = event.data.payload.Emergency === true || event.data.payload.is_emergency === true;
    
    console.log(`[EMERGENCY STATUS] Processing status: ${isEmergency ? 'YES' : 'NO'}, Request ID: ${requestId}`);

    // Retrieve stored call data
    const storageKey = event.data.payload.call_control_id || event.data.payload.Conversational_id || requestId;
    const storedData = await getCallData(storageKey);

    if (isEmergency) {
      // Send emergency SMS to doctor
      const doctorPhone = process.env.PRIMARY_EMERGENCY_DOCTOR;
      if (doctorPhone) {
        console.log(`[SMS] Sending emergency SMS to ${doctorPhone}`);
        const telnyxClient = require('../telnyx');
        
        // Use patient info from webhook payload or stored data
        const webhookPatientInfo = event.data.payload.patientInfo || {};
        const patientName = webhookPatientInfo.name || storedData?.name || 'Unknown Patient';
        const patientPhone = webhookPatientInfo.phone || storedData?.phone || 'Unknown Phone';
        const reason = event.data.payload.reason || webhookPatientInfo.reason || storedData?.symptoms || 'Not specified';
        
        // Use phone number exactly as received from webhook
        const displayPhone = patientPhone;
        
        // Create the SMS message in the requested format
        const message = `URGENCY: ${patientName} (${displayPhone}) requesting to speak to doctor due to ${reason}.`;
        
        console.log(`[SMS] URGENCY details - Name: ${patientName}, Phone: ${patientPhone}, Reason: ${reason}`);
        
        await telnyxClient.sendSMS(doctorPhone, message);
        console.log('[SMS SENT] URGENCY notification sent to', doctorPhone);
        console.log(`[EMERGENCY STATUS] ✅ URGENCY SMS sent for request ${requestId}`);
      } else {
        console.log('[SMS ERROR] No emergency doctor phone number configured');
      }
    }

    return {
      status: 'processed',
      requestId,
      isEmergency: isEmergency,
      storedData: storedData || null
    };
  } catch (error) {
    console.error('Error handling emergency status:', error);
    throw error;
  }
}

/**
 * Handle GatherUsingAI webhook
 * @param {Object} event - GatherUsingAI event data
 * @returns {Promise<Object>} Event handling result
 */
async function handleGatherUsingAI(event) {
  try {
    console.log('🤖 [GATHER USING AI] Processing data:', JSON.stringify(event.data, null, 2));

    // Extract data from function arguments
    const args = event.data.function?.arguments || event.data.payload;
    const isEmergency = args.Emergency !== undefined ? args.Emergency === true : null;
    const conversationalId = args.Conversational_id;

    console.log('🚨 [GATHER USING AI] Emergency Status:', isEmergency === null ? 'UNKNOWN' : (isEmergency ? 'YES' : 'NO'));
    console.log('📞 [GATHER USING AI] Conversational ID:', conversationalId);
    console.log('👤 [GATHER USING AI] Patient Name:', args.name || 'Unknown');
    console.log('📱 [GATHER USING AI] Patient Phone:', args.phone || 'Unknown');
    console.log('📝 [GATHER USING AI] Reasons:', args.Reasons || 'Not specified');

    // If it's an emergency, trigger emergency workflow
    if (isEmergency === true) {  // Only trigger if explicitly true
      console.log('\n🚨 [EMERGENCY DETECTED] Sending emergency SMS notification');
      const requestId = `emg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      // Send emergency webhook
      await processWebhookEvent({
        data: {
          event_type: 'emergency.status',
          payload: {
            Emergency: true,
            request_id: requestId
          }
        }
      });
    }

    return {
      status: 'processed',
      isEmergency: isEmergency === null ? 'Unknown' : (isEmergency ? 'Urgent' : 'Non-Urgent'),
      conversationalId
    };
  } catch (error) {
    console.error('❌ Error handling GatherUsingAI event:', error);
    throw error;
  }
}

/**
 * Process webhook event
 * @param {Object} event - Webhook event data
 * @returns {Promise<Object>} Event handling result
 */
async function processWebhookEvent(event) {
  try {
    console.log('[WEBHOOK RECEIVED] Type:', event.data.event_type);

    switch (event.data.event_type) {
      case 'assistant.event':
        return await handleAssistantEvent(event);

      case 'emergency.status':
        return await handleEmergencyStatus(event);

      case 'gather.using.ai':
        return await handleGatherUsingAI(event);

      case 'message.event':
        console.log('[SMS EVENT] Processing message event');
        return { status: 'processed', type: 'sms' };

      case 'call':
        console.log('[CALL EVENT] Processing call event');
        // Add any specific call event processing logic here
        return { status: 'processed', type: 'call' };

      case 'conversation_insight_result':
        console.log('[INSIGHT EVENT] Processing conversation insight result');
        // Add logic to handle conversation insights
        return { status: 'processed', type: 'insight' };

      case 'emergency.recording':
        console.log('[EMERGENCY RECORDING EVENT] Processing emergency recording');
        // Add logic to handle emergency recordings
        return { status: 'processed', type: 'emergency_recording' };

      default:
        console.log('[WEBHOOK] Unhandled event type:', event.data.event_type);
        // Process the event data even if it's an unknown type
        console.log('[WEBHOOK] Processing unknown event data:', JSON.stringify(event.data, null, 2));
        return { status: 'processed', type: event.data.event_type };
    }
  } catch (error) {
    console.error('Error processing webhook event:', error);
    throw error;
  }
}

/**
 * Send a test email
 * @param {string} recipientEmail - Email address to send to
 * @param {Object} testData - Test data to include in email
 * @returns {Promise<Object>} Send result
 */
async function sendTestEmail(recipientEmail, testData = {}) {
  try {
    const { sendEmail } = require('../email');
    
    const emailData = {
      to: recipientEmail,
      subject: 'Test Email - Dental AI System',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Test Email</h2>
          <p>This is a test email sent at ${new Date().toISOString()}</p>
          <p>Test Data:</p>
          <pre>${JSON.stringify(testData, null, 2)}</pre>
          <p>Configuration:</p>
          <ul>
            <li>From: ${process.env.FROM_EMAIL}</li>
            <li>To: ${recipientEmail}</li>
            <li>SendGrid API Key: ${process.env.SENDGRID_API_KEY ? 'Configured' : 'Missing'}</li>
          </ul>
        </div>
      `,
      text: `Test Email\n\nThis is a test email sent at ${new Date().toISOString()}\n\nTest Data: ${JSON.stringify(testData)}`
    };

    const result = await sendEmail(emailData);
    console.log('Test email sent successfully');
    return result;
  } catch (error) {
    console.error('Error sending test email:', error);
    throw error;
  }
}

module.exports = {
  processWebhookEvent,
  sendTestEmail
};
