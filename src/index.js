const express = require('express');
const bodyParser = require('body-parser');
const { processWebhookEvent } = require('./utils/callHandler');
const { handleWebhook } = require('./utils/webhookHandler');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());

// Health check endpoint (keep this first for monitoring)
const fs = require('fs').promises;
const path = require('path');

app.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: require('../package.json').version,

      // Core Services
      services: {
        server: {
          status: 'healthy',
          port: process.env.PORT || 3000,
          baseUrl: process.env.BASE_URL || 'http://localhost:3000',
          uptime_hours: Math.floor(process.uptime() / 3600),
          node_version: process.version
        },

        telnyx: {
          status: 'unknown',
          configured: !!process.env.TELNYX_API_KEY && !!process.env.TELNYX_PHONE_NUMBER,
          features: {
            sms: process.env.ENABLE_SMS_NOTIFICATIONS === 'true',
            voice: true,
            emergency_transfer: process.env.ENABLE_REAL_TRANSFERS === 'true',
            conference: process.env.ENABLE_CONFERENCE_CALLS === 'true',
            ai_assistant: !!process.env.TELNYX_AI_ASSISTANT_ID,
            recording: true
          },
          phone_numbers: {
            main: process.env.TELNYX_PHONE_NUMBER || 'Not configured',
            messaging_profile: process.env.TELNYX_MESSAGING_PROFILE_ID || 'Not configured'
          }
        },

        sendgrid: {
          status: 'unknown',
          configured: !!process.env.SENDGRID_API_KEY && !!process.env.FROM_EMAIL,
          features: {
            emergency_email: true,
            notifications: true
          },
          email_config: {
            from_email: process.env.FROM_EMAIL || 'Not configured',
            from_name: process.env.FROM_NAME || 'Not configured',
            admin_email: process.env.ADMIN_EMAIL || 'Not configured'
          }
        }
      },

      // Emergency Configuration
      emergency: {
        doctors: {
          primary: !!process.env.PRIMARY_EMERGENCY_DOCTOR,
          backup: !!process.env.BACKUP_EMERGENCY_DOCTOR,
          night: !!process.env.NIGHT_EMERGENCY_DOCTOR,
          schedule: {
            night_hours_start: 22,
            night_hours_end: 6,
            current_active: getCurrentActiveDoctor()
          }
        },
        templates: {
          sms: {
            configured: !!process.env.SMS_TEMPLATE_EMERGENCY_DOCTOR,
            last_updated: process.env.SMS_TEMPLATE_LAST_UPDATED || 'Unknown'
          },
          email: {
            configured: !!process.env.EMAIL_TEMPLATE_EMERGENCY_SUBJECT && !!process.env.EMAIL_TEMPLATE_EMERGENCY_BODY,
            last_updated: process.env.EMAIL_TEMPLATE_LAST_UPDATED || 'Unknown'
          }
        },
        features: {
          real_transfers: process.env.ENABLE_REAL_TRANSFERS === 'true',
          conference_calls: process.env.ENABLE_CONFERENCE_CALLS === 'true',
          sms_notifications: process.env.ENABLE_SMS_NOTIFICATIONS === 'true',
          max_ring_time: parseInt(process.env.MAX_RING_TIME || '30', 10)
        }
      },

      // Practice Information
      practice: {
        name: process.env.PRACTICE_NAME || 'Not configured',
        timezone: process.env.TIMEZONE || 'America/New_York',
        current_time: new Date().toLocaleString('en-US', { timeZone: process.env.TIMEZONE || 'America/New_York' }),
        operating_hours: '24/7',
        features: {
          ai_receptionist: true,
          emergency_detection: true,
          call_recording: true,
          transcription: true
        }
      }, 

      // API Endpoints
      endpoints: {
        '/api/settings': { method: 'GET,POST', status: 'active' },
        '/api/calls': { method: 'GET', status: 'active' },
        '/api/active-calls': { method: 'GET', status: 'active' },
        '/api/templates': { method: 'GET,POST', status: 'active' },
        '/test/email': { method: 'POST', status: 'active' },
        '/test/sms': { method: 'POST', status: 'active' },
        '/test/email-config': { method: 'GET', status: 'active' },
        '/test/sms-config': { method: 'GET', status: 'active' }
      },

      // Webhook Endpoints
      webhooks: {
        '/webhook/call': { method: 'POST', status: 'active', handler: 'processWebhookEvent' },
        '/webhook/sms': { method: 'POST', status: 'active', handler: 'processWebhookEvent' },
        '/webhook/ai-assistant': { method: 'POST', status: 'active', handler: 'processWebhookEvent' },
        '/webhook/emergency': { method: 'POST', status: 'active', handler: 'processWebhookEvent' },
        '/webhook/emergency-recording': { method: 'POST', status: 'active', handler: 'processWebhookEvent' },
        '/webhook/emergency-gather': { method: 'POST', status: 'active', handler: 'processWebhookEvent' }
      },

      // System Stats
      system: {
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
          external: Math.round(process.memoryUsage().external / 1024 / 1024) + 'MB'
        },
        cpu: {
          arch: process.arch,
          cpus: require('os').cpus().length,
          platform: process.platform,
          load_average: require('os').loadavg()
        },
        network: {
          hostname: require('os').hostname(),
          network_interfaces: Object.keys(require('os').networkInterfaces()).length
        }
      }
    };

    // Check Telnyx API status
    try {
      const telnyxClient = require('./telnyx');
      await telnyxClient.getCallDetails('test');
      healthStatus.services.telnyx.status = 'healthy';
    } catch (error) {
      healthStatus.services.telnyx.status = 'error';
      healthStatus.services.telnyx.error = error.message;
    }


    // Check SendGrid API status
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.client.request({
        method: 'GET',
        url: '/v3/stats',
        qs: {
          aggregated_by: 'day',
          limit: 1,
          start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      });
      healthStatus.services.sendgrid.status = 'healthy';
    } catch (error) {
      healthStatus.services.sendgrid.status = 'error';
      healthStatus.services.sendgrid.error = error.message;
    }

    // Check file system status
    try {
      const testFile = path.join(process.env.DATA_DIR || '/data', 'health_check.txt');
      await fs.writeFile(testFile, 'Health check');
      await fs.unlink(testFile);
      healthStatus.services.fileSystem = { status: 'healthy' };
    } catch (error) {
      healthStatus.services.fileSystem = { status: 'error', message: error.message };
    }


    // Add response time
    healthStatus.responseTime = Date.now() - startTime;

    // Overall status is healthy only if all critical services are healthy
    healthStatus.status = (
      healthStatus.services.telnyx.status === 'healthy'
    ) ? 'healthy' : 'degraded';

    res.json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Helper function to determine current active doctor based on time
function getCurrentActiveDoctor() {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    return 'night';
  } else {
    return 'primary';
  }
}

// Helper function to determine emergency status based on pain level
function determineEmergencyStatus(painLevel) {
  // Handle null, undefined, or non-numeric values
  if (painLevel === null || painLevel === undefined || isNaN(painLevel)) {
    return 'Non-Emergency';  // Default to non-emergency if no pain level
  }
  
  // Convert to number if it's a string
  const numericPainLevel = Number(painLevel);
  
  // Emergency if pain level is 7 or higher
  return numericPainLevel >= 7 ? 'Emergency' : 'Non-Emergency';
}

// Email configuration test endpoint
app.get('/test/email-config', (req, res) => {
  const config = {
    gmailUser: process.env.GMAIL_USER ? 'Present' : 'Missing',
    gmailPass: process.env.GMAIL_PASS ? 'Present' : 'Missing',
    fromName: process.env.FROM_NAME || 'Not set',
    adminEmail: process.env.ADMIN_EMAIL || 'Not set',
    timestamp: new Date().toISOString()
  };
  
  console.log('🧪 Testing email configuration:', config);
  
  res.json(config);
});

// This endpoint has been removed as we are not using SendGrid

// Email test endpoint
app.post('/test/email', async (req, res) => {
  try {
    const { sendTestEmail } = require('./utils/callHandler');
    const recipientEmail = process.env.ADMIN_EMAIL;
    
    console.log(`🧪 Testing email functionality to ${recipientEmail}`);
    const result = await sendTestEmail(recipientEmail);
    
    if (result) {
      res.json({ success: true, message: 'Test email sent successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send test email' });
    }
  } catch (error) {
    console.error('Error in test email endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// This endpoint has been removed as we are not using SendGrid

const { sendDoctorEmailNotification } = require('./email-notifications');

// Add test endpoint for email sending
app.get('/test/send-test-email', async (req, res) => {
  try {
    console.log('🧪 Testing email notification with test data...');
    
    const testData = {
      name: 'Test Patient',
      phone: '+1234567890',
      symptoms: 'Test symptoms for email verification',
      message: 'This is a test summary to verify email notifications are working properly.',
      status: 'Test',
      timestamp: new Date()
    };
    
    const result = await sendDoctorEmailNotification(testData, 'non-emergency');
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in test email endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

const { storeCallData } = require('./utils/fileStorage');

// AI Assistant webhook endpoint
app.post('/webhook/ai-assistant', async (req, res) => {
  const requestId = `ai_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${requestId}] 🤖 AI Assistant webhook received at ${new Date().toISOString()}`);
  console.log('📥 Raw webhook payload:', JSON.stringify(req.body, null, 2));

  try {
    const webhookType = req.body.event_type === 'conversation_insight_result' ? 'Conversation Insight' : 'Initial';
    console.log(`[${requestId}] Processing ${webhookType} webhook`);

    // Log call_control_id and Conversational_id if they exist
    const callControlId = req.body.call_control_id;
    const conversationalId = req.body.Conversational_id;
    console.log('🔍 Debug - callControlId:', callControlId);
    console.log('🔍 Debug - conversationalId:', conversationalId);

    
    // Use call_control_id if available, otherwise use Conversational_id
    const storageKey = callControlId || conversationalId;
    
    console.log('🔍 Debug - storageKey:', storageKey);
    
    if (storageKey) {
      const callData = {
        name: req.body.name || 'Unknown',
        phone: req.body.phone || 'Unknown',
        pain_level: req.body.pain_level || 0,
        status: determineEmergencyStatus(req.body.pain_level)
      };
      
      try {
        await storeCallData(storageKey, callData);
        console.log('💾 Stored call data with ID:', storageKey);
        console.log('💾 Stored data:', callData);
      } catch (storageError) {
        console.error('❌ Error storing call data:', storageError);
        console.log('📁 Current working directory:', process.cwd());
        console.log('🔧 DATA_DIR value:', process.env.DATA_DIR);
      }
    } else {
      console.log('⚠️ No storage key found - cannot store call data');
    }


    await handleWebhook(req.body);

    console.log(`[${requestId}] ✅ ${webhookType} webhook processed successfully`);
    res.status(200).json({ message: 'OK', requestId, webhookType });
  } catch (error) {

    console.error(`[${requestId}] ❌ Error processing AI assistant webhook:`, error);
    console.error('Stack trace:', error.stack);
    console.log('📁 Current working directory:', process.cwd());
    console.log('🔧 DATA_DIR value:', process.env.DATA_DIR);
    res.status(500).json({ error: 'Internal server error', requestId });
  } finally {
    console.log(`${'='.repeat(80)}\n`);
  }
});


// Test endpoint for AI insights
app.post('/test-insights', async (req, res) => {
  console.log('🧪 Test insights webhook received:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ received: true, body: req.body });
});

const { getCallData, deleteCallData } = require('./utils/fileStorage');

// AI Assistant Insights webhook endpoint (call completion)
app.post('/webhook/ai/insights', async (req, res) => {
  const startTime = new Date();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    console.log(`\n📥 [${requestId}] Raw webhook payload:`, JSON.stringify(req.body, null, 2));
    
    if (!req.body) {
      throw new Error('Missing request body');
    }

    const eventType = req.body.event_type;
    const payload = req.body.payload;

    console.log(`\n📋 [${requestId}] Validated Data:`);
    console.log(`Event Type: ${eventType}`);
    console.log(`Call Control ID: ${payload?.metadata?.call_control_id || 'Not provided'}`);
    
    if (eventType === 'conversation_insight_result') {
      console.log(`\n🔄 [${requestId}] Processing conversation insights result`);
      
      // Get AI summary from results
      const aiSummary = payload.results[0]?.result || 'No summary available';
      
      console.log(`\n[${requestId}] 📝 AI Summary:`, aiSummary);

      // Create final call summary
      const callControlId = payload?.metadata?.call_control_id;
      const conversationId = payload?.conversation_id;
      
      console.log('🔍 Debug - AI Insights callControlId:', callControlId);
      console.log('🔍 Debug - AI Insights conversationId:', conversationId);
      
      // Try to find stored data using both IDs
      let storedData = await getCallData(callControlId) || await getCallData(conversationId);
      
      console.log('🔍 Debug - Found storedData:', storedData);
      
      if (storedData) {
        console.log(`\n${'='.repeat(80)}`);
        console.log('📋 FINAL CALL SUMMARY');
        console.log(`${'='.repeat(80)}`);
        console.log(`👤 Name: ${storedData.name}`);
        console.log(`📞 Phone: ${storedData.phone}`);
        console.log(`🚨 Status: ${storedData.status} (Pain Level: ${storedData.pain_level})`);
        console.log(`📝 Summary: ${aiSummary}`);
        console.log(`${'='.repeat(80)}\n`);
        
        // Send email notification
        try {
          const { sendReceptionistSummary } = require('./email');
          const practiceSettings = require('./config').getPracticeSettings();
          
          const emailData = {
            name: storedData.name,
            phone: storedData.phone,
            status: storedData.status,
            summary: aiSummary,
            timeCalled: new Date().toLocaleTimeString('en-US', {
              timeZone: 'America/Los_Angeles',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }),
            timestamp: new Date()
          };
          
          console.log('📧 Sending email with data:', emailData);
          await sendReceptionistSummary(emailData, practiceSettings);
          console.log('✅ Final call summary sent via email');
        } catch (error) {
          console.error('❌ Error sending email summary:', error);
        }
        
        // Clean up stored data
        await deleteCallData(callControlId || conversationId);
        console.log('🧹 Cleaned up stored data for key:', callControlId || conversationId);
      } else {
        console.log('⚠️ No stored data found for final summary');
        console.log('🔍 Checked IDs:', { callControlId, conversationId });
      }
    }
    
    // Calculate processing time
    const processingTime = new Date() - startTime;
    
    res.status(200).json({
      message: 'Insights processed successfully',
      request_id: requestId,
      event_type: eventType,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`\n❌ [${requestId}] Error processing AI Assistant insights:`, error);
    console.error('Stack trace:', error.stack);
    
    res.status(200).json({
      message: 'Insights received with processing error',
      request_id: requestId,
      error: error.message,
      processing_time_ms: new Date() - startTime,
      timestamp: new Date().toISOString()
    });
  }
});

// GatherUsingAI webhook endpoint
app.post('/webhook/gather-ai', async (req, res) => {
  const startTime = new Date();
  const requestId = `gather_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    console.log(`\n📥 [${requestId}] GatherUsingAI webhook received:`, JSON.stringify(req.body, null, 2));
    
    if (!req.body) {
      throw new Error('Missing request body');
    }

    // Process through webhook event handler
    await processWebhookEvent({
      data: {
        event_type: 'gather.using.ai',
        payload: req.body
      }
    });

    // Calculate processing time
    const processingTime = new Date() - startTime;
    
    console.log(`\n[${requestId}] ✅ GatherUsingAI webhook processed successfully`);
    
    res.status(200).json({
      message: 'GatherUsingAI webhook processed successfully',
      request_id: requestId,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`\n❌ [${requestId}] Error processing GatherUsingAI webhook:`, error);
    console.error('Stack trace:', error.stack);
    
    res.status(200).json({
      message: 'GatherUsingAI webhook received with processing error',
      request_id: requestId,
      error: error.message,
      processing_time_ms: new Date() - startTime,
      timestamp: new Date().toISOString()
    });
  }
});

// Generic webhook endpoint for Telnyx events
app.post('/webhook', async (req, res) => {
  try {
    console.log('📝 Raw webhook body:', JSON.stringify(req.body, null, 2));
    await processWebhookEvent(req.body);
    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Call webhook endpoint
app.post('/webhook/call', async (req, res) => {
  const startTime = new Date();
  const requestId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${requestId}] Call webhook received at ${startTime.toISOString()}`);
    console.log('📞 Raw webhook payload:', JSON.stringify(req.body, null, 2));

    // Extract event type and data
    const eventType = req.body.data?.event_type;
    const payload = req.body.data?.payload;

    console.log(`\n[${requestId}] Event Type: ${eventType}`);
    console.log(`[${requestId}] Call Control ID: ${payload?.call_control_id || 'Not provided'}`);

    if (eventType === 'call.hangup') {
      console.log(`\n[${requestId}] 🔚 Processing call.hangup event`);
      console.log(`Duration: ${payload.duration || 'Not provided'} seconds`);
      console.log(`From: ${payload.from || 'Unknown'}`);
      console.log(`To: ${payload.to || 'Unknown'}`);
      console.log(`Hangup Cause: ${payload.hangup_cause || 'Unknown'}`);
      
      // Process the hangup event
      await processWebhookEvent({
        data: {
          event_type: 'call.hangup',
          payload: payload
        }
      });

      console.log(`\n[${requestId}] ✅ Call.hangup event processed successfully`);
    } else {
      // Process other call events
      console.log(`\n[${requestId}] Processing ${eventType} event`);
      await processWebhookEvent({
        data: {
          event_type: eventType,
          payload: req.body
        }
      });
    }

    // Calculate processing time
    const processingTime = new Date() - startTime;
    console.log(`\n[${requestId}] ⏱️ Processing completed in ${processingTime}ms`);

    res.status(200).json({ 
      message: 'Webhook processed successfully',
      request_id: requestId,
      event_type: eventType,
      processing_time_ms: processingTime
    });
  } catch (error) {
    console.error(`\n[${requestId}] ❌ Error processing call webhook:`, error);
    console.error('Stack trace:', error.stack);
    console.error('Request body:', req.body);

    // Still return 200 to acknowledge receipt
    res.status(200).json({ 
      message: 'Webhook received with processing error',
      request_id: requestId,
      error: error.message
    });
  } finally {
    console.log(`${'='.repeat(80)}\n`);
  }
});

// SMS webhook endpoint
app.post('/webhook/sms', async (req, res) => {
  try {
    console.log('📱 SMS webhook received:', JSON.stringify(req.body, null, 2));
    await processWebhookEvent({
      data: {
        event_type: 'message.event',
        payload: req.body
      }
    });
    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('❌ Error processing SMS webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Emergency recording webhook endpoint
app.post('/webhook/emergency-recording', async (req, res) => {
  try {
    console.log('🚨 Emergency recording webhook received:', JSON.stringify(req.body, null, 2));
    await processWebhookEvent({
      data: {
        event_type: 'emergency.recording',
        payload: req.body
      }
    });
    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('❌ Error processing emergency recording webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Emergency status webhook endpoint
app.post('/webhook/emergency', async (req, res) => {
  const startTime = new Date();
  const requestId = `emg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚨 [${requestId}] Emergency webhook received at ${startTime.toISOString()}`);
  
  try {
    // Log raw request data
    console.log(`\n📥 [${requestId}] Raw webhook payload:`, JSON.stringify(req.body, null, 2));
    
    // Validate request structure
    if (!req.body) {
      throw new Error('Missing request body');
    }

    // Validate against schema
    if (typeof req.body.Emergency !== 'boolean') {
      throw new Error('Invalid request: Emergency must be a boolean value (true/false)');
    }

    const isEmergency = req.body.Emergency;
    const reason = req.body.Reason || req.body['Reason '] || 'No reason provided'; // Handle both "Reason" and "Reason " (with space)
    
    // Extract patient info from reason if available
    let patientInfo = {};
    if (reason && reason !== 'No reason provided') {
      // Try to extract name and phone from reason string like "Bob Smith (+17346744780) is requesting..."
      const namePhoneMatch = reason.match(/^([^(]+)\s*\((\+\d+)\)/);
      if (namePhoneMatch) {
        patientInfo.name = namePhoneMatch[1].trim();
        patientInfo.phone = namePhoneMatch[2];
        patientInfo.reason = reason;
      } else {
        patientInfo.reason = reason;
      }
    }
    
    // Log validated data
    console.log(`\n📋 [${requestId}] Validated Data:`);
    console.log(`Emergency Status: ${isEmergency ? 'TRUE' : 'FALSE'}`);
    console.log(`Reason: ${reason}`);
    if (patientInfo.name) console.log(`Patient Name: ${patientInfo.name}`);
    if (patientInfo.phone) console.log(`Patient Phone: ${patientInfo.phone}`);

    // Process through webhook event handler
    await processWebhookEvent({
      data: {
        event_type: 'emergency.status',
        payload: {
          Emergency: req.body.Emergency,
          is_emergency: isEmergency,
          reason: reason,
          patientInfo: patientInfo,
          timestamp: new Date().toISOString(),
          request_id: requestId
        }
      }
    });

    // Calculate processing time
    const processingTime = new Date() - startTime;
    
    // Log success response
    console.log(`\n✅ [${requestId}] Processing completed in ${processingTime}ms`);
    
    // Return response
    res.status(200).json({
      message: 'Emergency status processed successfully',
      request_id: requestId,
      is_emergency: isEmergency,
      reason: reason,
      patient_info: patientInfo,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    // Calculate processing time even for errors
    const processingTime = new Date() - startTime;
    
    console.error(`\n❌ [${requestId}] Error processing emergency status:`, error);
    console.error('Stack trace:', error.stack);
    
    // Log error details
    console.error(`\n🔍 [${requestId}] Error Context:`);
    console.error('Headers:', req.headers);
    console.error('Query:', req.query);
    console.error('Body:', req.body);
    
    // Return 400 for validation errors, 200 for other errors to acknowledge receipt
    const statusCode = error.message.includes('Invalid request') ? 400 : 200;
    
    res.status(statusCode).json({
      message: 'Emergency status received with error',
      request_id: requestId,
      error: error.message,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

// Emergency gather webhook endpoint
app.post('/webhook/emergency-gather', async (req, res) => {
  const startTime = new Date();
  const requestId = `emg_gather_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 [${requestId}] Emergency gather webhook received at ${startTime.toISOString()}`);
  
  try {
    // Log raw request data
    console.log(`\n [${requestId}] Raw webhook payload:`, JSON.stringify(req.body, null, 2));
    
    // Validate request structure
    if (!req.body) {
      throw new Error('Missing request body');
    }

    // Process through webhook event handler
    await processWebhookEvent({
      data: {
        event_type: 'gather.using.ai',
        payload: req.body
      }
    });

    // Calculate processing time
    const processingTime = new Date() - startTime;
    
    // Log success response
    console.log(`\n✅ [${requestId}] Processing completed in ${processingTime}ms`);
    
    // Return response
    res.status(200).json({
      message: 'Emergency gather event processed successfully',
      request_id: requestId,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    // Calculate processing time even for errors
    const processingTime = new Date() - startTime;
    
    console.error(`\n❌ [${requestId}] Error processing emergency gather:`, error);
    console.error('Stack trace:', error.stack);
    
    // Log error details
    console.error(`\n🔍 [${requestId}] Error Context:`);
    console.error('Headers:', req.headers);
    console.error('Query:', req.query);
    console.error('Body:', req.body);
    
    // Still return 200 to acknowledge receipt
    res.status(200).json({
      message: 'Emergency gather event received with error',
      request_id: requestId,
      error: error.message,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

// Los Angeles Time endpoint
app.get('/api/la-time', (req, res) => {
  try {
    // Set headers for JSON response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('time-check', 'active');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    
    // Get config
    const config = require('./config').getPracticeSettings();
    const timezone = config.timezone;
    const emergencyHours = config.emergencyHours;
    const weekendHours = {
      from: process.env.WEEKEND_HOURS_FROM || '09:00',
      to: process.env.WEEKEND_HOURS_TO || '17:00'
    };

    // Parse weekend days from env (default to Sunday[0] and Saturday[6])
    const weekendDays = (process.env.WEEKEND_DAYS || '0,6')
      .split(',')
      .map(day => parseInt(day.trim()))
      .filter(day => !isNaN(day) && day >= 0 && day <= 6);

    // Get current time in configured timezone
    const now = new Date();
    
    // Get the day of the week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getDay();
    
    const timeInZone = now.toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false
    });

    // Convert current time to minutes since midnight
    const [currentHour, currentMinute] = timeInZone.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;

    // Get day name for response
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[dayOfWeek];

    // If it's a weekend day, check against weekend hours
    if (weekendDays.includes(dayOfWeek)) {
      const [weekendFromHour, weekendFromMinute] = weekendHours.from.split(':').map(Number);
      const [weekendToHour, weekendToMinute] = weekendHours.to.split(':').map(Number);
      const weekendFromMinutes = weekendFromHour * 60 + weekendFromMinute;
      const weekendToMinutes = weekendToHour * 60 + weekendToMinute;

      const isWithinWeekendHours = currentMinutes >= weekendFromMinutes && currentMinutes <= weekendToMinutes;
      res.json({ 
        status: isWithinWeekendHours ? 'open' : 'closed',
        reason: `Weekend hours (${currentDayName})`,
        hours: `${weekendHours.from} - ${weekendHours.to}`,
        isWeekend: true,
        currentDay: currentDayName
      });
      return;
    }

    // For other days, check emergency hours
    // Convert emergency hours to minutes
    const [fromHour, fromMinute] = emergencyHours.from.split(':').map(Number);
    const [toHour, toMinute] = emergencyHours.to.split(':').map(Number);
    const fromMinutes = fromHour * 60 + fromMinute;
    const toMinutes = toHour * 60 + toMinute;

    // Check if current time is within emergency hours
    let isEmergencyTime;
    if (fromMinutes > toMinutes) {
      // Emergency hours span across midnight (e.g., 17:00 to 09:00)
      isEmergencyTime = currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
    } else {
      // Emergency hours within same day
      isEmergencyTime = currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
    }

    // Return JSON response
    res.json({ 
      status: isEmergencyTime ? 'open' : 'closed',
      reason: `Emergency hours (${currentDayName})`,
      hours: `${emergencyHours.from} - ${emergencyHours.to}`,
      isWeekend: false,
      currentDay: currentDayName
    });
  } catch (error) {
    console.error('Error checking emergency hours:', error);
    res.json({ status: 'error' });
  }
});

// Settings endpoints
app.get('/api/settings', async (req, res) => {
  try {
    const settings = {
      practiceName: process.env.PRACTICE_NAME || 'Dental Practice',
      adminEmail: process.env.ADMIN_EMAIL,
      fromEmail: process.env.FROM_EMAIL,
      fromName: process.env.FROM_NAME,
      primaryDoctorPhone: process.env.PRIMARY_EMERGENCY_DOCTOR,
      backupDoctorPhone: process.env.BACKUP_EMERGENCY_DOCTOR,
      nightDoctorPhone: process.env.NIGHT_EMERGENCY_DOCTOR,
      enableSMS: process.env.ENABLE_SMS_NOTIFICATIONS === 'true',
      enableRealTransfers: process.env.ENABLE_REAL_TRANSFERS === 'true',
      enableConferenceCalls: process.env.ENABLE_CONFERENCE_CALLS === 'true',
      maxRingTime: parseInt(process.env.MAX_RING_TIME || '30', 10)
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    
    // Update environment variables (in memory)
    process.env.PRACTICE_NAME = settings.practiceName;
    process.env.ADMIN_EMAIL = settings.adminEmail;
    process.env.FROM_EMAIL = settings.fromEmail;
    process.env.FROM_NAME = settings.fromName;
    process.env.PRIMARY_EMERGENCY_DOCTOR = settings.primaryDoctorPhone;
    process.env.BACKUP_EMERGENCY_DOCTOR = settings.backupDoctorPhone;
    process.env.NIGHT_EMERGENCY_DOCTOR = settings.nightDoctorPhone;
    process.env.ENABLE_SMS_NOTIFICATIONS = settings.enableSMS.toString();
    process.env.ENABLE_REAL_TRANSFERS = settings.enableRealTransfers.toString();
    process.env.ENABLE_CONFERENCE_CALLS = settings.enableConferenceCalls.toString();
    process.env.MAX_RING_TIME = settings.maxRingTime.toString();
    
    // In a real implementation, you would save these to a database or .env file
    
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Message templates endpoints
app.get('/api/templates', async (req, res) => {
  try {
    const templates = {
      email: {
        emergency: {
          subject: process.env.EMAIL_TEMPLATE_EMERGENCY_SUBJECT || '🚨 URGENT: Dental Emergency Alert - {{patientName}}',
          body: process.env.EMAIL_TEMPLATE_EMERGENCY_BODY || `
Dear Doctor,

A dental emergency has been reported:

Patient: {{patientName}}
Phone: {{patientPhone}}
Emergency Description: {{symptoms}}
Time: {{timestamp}}

Urgency Level: EMERGENCY
Status: {{status}}

Patient Message:
{{message}}

Please respond immediately.

Best regards,
{{practiceName}} AI Assistant`
        }
      },
      sms: {
        emergency: {
          doctor: process.env.SMS_TEMPLATE_EMERGENCY_DOCTOR || `🚨 URGENT DENTAL EMERGENCY
Patient: {{patientName}}
Phone: {{patientPhone}}
Symptoms: {{symptoms}}
Time: {{timestamp}}

Please respond immediately.
- {{practiceName}}`
        }
      }
    };
    
    res.json(templates);
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

app.post('/api/templates', async (req, res) => {
  try {
    const templates = req.body;
    
    // Update email templates
    if (templates.email?.emergency) {
      process.env.EMAIL_TEMPLATE_EMERGENCY_SUBJECT = templates.email.emergency.subject;
      process.env.EMAIL_TEMPLATE_EMERGENCY_BODY = templates.email.emergency.body;
    }
    
    // Update SMS templates
    if (templates.sms?.emergency) {
      process.env.SMS_TEMPLATE_EMERGENCY_DOCTOR = templates.sms.emergency.doctor;
    }
    
    res.json({ success: true, message: 'Templates updated successfully' });
  } catch (error) {
    console.error('Error updating templates:', error);
    res.status(500).json({ error: 'Failed to update templates' });
  }
});

// Test template endpoint
app.post('/api/templates/test', async (req, res) => {
  try {
    const { type, templateId, testData } = req.body;
    
    // Example test data if not provided
    const defaultTestData = {
      patientName: 'Test Patient',
      patientPhone: '+1234567890',
      symptoms: 'severe tooth pain',
      timestamp: new Date().toLocaleString(),
      status: 'pending',
      message: 'This is a test message',
      reason: 'Regular checkup',
      callbackTime: 'tomorrow morning',
      practiceName: process.env.PRACTICE_NAME || 'Dental Practice'
    };
    
    const data = { ...defaultTestData, ...testData };
    
    let result;
    switch (type) {
      case 'email':
        const { sendTestEmail } = require('./utils/callHandler');
        result = await sendTestEmail(process.env.ADMIN_EMAIL, data);
        break;
        
      case 'sms':
        const { sendTestNotification } = require('./sms-notifications');
        result = await sendTestNotification('Test template message', data);
        break;
        
      default:
        throw new Error('Invalid template type');
    }
    
    res.json({ 
      success: true, 
      message: 'Template test sent successfully',
      result 
    });
  } catch (error) {
    console.error('Error testing template:', error);
    res.status(500).json({ error: 'Failed to test template' });
  }
});

// Debug endpoint to check current template values
app.get('/api/templates/debug', (req, res) => {
  try {
    const currentTemplates = {
      email: {
        emergency: {
          enabled: process.env.EMAIL_TEMPLATE_EMERGENCY_ENABLED === 'true',
          subject: process.env.EMAIL_TEMPLATE_EMERGENCY_SUBJECT,
          body: process.env.EMAIL_TEMPLATE_EMERGENCY_BODY,
          lastUpdated: new Date().toISOString()
        }
      },
      environment: {
        SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'Present' : 'Missing',
        FROM_EMAIL: process.env.FROM_EMAIL,
        FROM_NAME: process.env.FROM_NAME,
        PRIMARY_DOCTOR_EMAIL: process.env.PRIMARY_DOCTOR_EMAIL
      }
    };

    res.json(currentTemplates);
  } catch (error) {
    console.error('Error getting debug template info:', error);
    res.status(500).json({ error: 'Failed to get debug template info' });
  }
});

// Call history endpoint
app.get('/api/calls', async (req, res) => {
  try {
    const date = req.query.date; // Format: YYYY-MM-DD
    const { _activeCallRecordings } = require('./utils/callHandler');
    const { getCallRecordings } = require('./utils/callRecordings');
    
    // Get recordings for the specified date
    const recordings = await getCallRecordings({
      pageSize: 50,
      page: 1,
      filters: date ? {
        'filter[created_at][gte]': `${date}T00:00:00Z`,
        'filter[created_at][lte]': `${date}T23:59:59Z`
      } : {}
    });
    
    // Transform recordings into call history format
    const calls = recordings.data.map(recording => ({
      id: recording.id,
      timestamp: recording.created_at,
      from: recording.from || 'Unknown',
      duration: Math.round(recording.duration || 0),
      emergency: recording.metadata?.emergency === true,
      status: recording.status,
      summary: recording.metadata?.summary || null,
      patientName: recording.metadata?.patientName || null,
      symptoms: recording.metadata?.symptoms || null,
      transcription: recording.transcription || null
    }));
    
    res.json(calls);
  } catch (error) {
    console.error('Error getting call history:', error);
    res.status(500).json({ error: 'Failed to get call history' });
  }
});

// Active calls endpoint
app.get('/api/active-calls', async (req, res) => {
  try {
    const { _activeCallRecordings } = require('./utils/callHandler');
    
    // Convert active calls map to array
    const activeCalls = Array.from(_activeCallRecordings.entries())
      .filter(([_, call]) => call.status !== 'completed' && call.status !== 'hangup')
      .map(([id, call]) => ({
        id,
        duration: Math.round((new Date() - call.startTime) / 1000),
        from: call.from,
        to: call.to,
        status: call.status,
        isEmergency: call.isEmergency
      }));
    
    res.json(activeCalls);
  } catch (error) {
    console.error('Error getting active calls:', error);
    res.status(500).json({ error: 'Failed to get active calls' });
  }
});

// SMS configuration test endpoint
app.get('/test/sms-config', (req, res) => {
  const config = {
    telnyxKey: process.env.TELNYX_API_KEY ? 'Present' : 'Missing',
    fromNumber: process.env.TELNYX_PHONE_NUMBER,
    enabled: process.env.ENABLE_SMS_NOTIFICATIONS === 'true',
    timestamp: new Date().toISOString()
  };
  
  console.log('🧪 Testing SMS configuration:', config);
  
  if (process.env.TELNYX_API_KEY && process.env.TELNYX_PHONE_NUMBER) {
    res.json({ ...config, status: 'Configured' });
  } else {
    res.json({ ...config, status: 'Missing Configuration' });
  }
});

// SMS test endpoint
app.post('/test/sms', async (req, res) => {
  try {
    const { sendTestNotification } = require('./sms-notifications');
    console.log('🧪 Testing SMS functionality');
    
    const result = await sendTestNotification('Test SMS from dental AI system');
    
    if (result.success) {
      res.json({ success: true, message: 'Test SMS sent successfully' });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error in test SMS endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling for 404 Not Found
app.use((req, res) => {
  console.log(`❌ 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    error: 'Not Found',
    message: `The requested endpoint ${req.method} ${req.url} does not exist`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌐 Base URL: ${process.env.BASE_URL}`);
  
  console.log(`\n📡 WEBHOOK ENDPOINTS:`);
  console.log('- POST /webhook/ai-assistant');
  console.log('- POST /webhook/ai/insights');
  console.log('- POST /webhook/gather-ai');
  console.log('- POST /webhook/call');
  console.log('- POST /webhook/sms');
  console.log('- POST /webhook/emergency');
  console.log('- POST /webhook/emergency-recording');
  console.log('- POST /webhook/emergency-gather');
  console.log('- POST /webhook (generic)');
  
  console.log(`\n⚡ Ready to receive webhooks...\n`);
});
