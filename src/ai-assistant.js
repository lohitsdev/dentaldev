const telnyxClient = require('./telnyx');
const { classifyUrgency, DENTAL_EMERGENCY_KEYWORDS } = require('./receptionist');
const { handleEmergency } = require('./emergency');
const { handleIntake } = require('./intake');
const config = require('./config');
const { sendDoctorNotification } = require('./sms-notifications');
require('dotenv').config();

// Define patient information schema for structured data collection
const PATIENT_SCHEMA = {
  type: "object",
  properties: {
    name: { 
      type: "string",
      description: "Patient full name"
    },
    phone: { 
      type: "string", 
      pattern: "^\\+?[0-9]{7,15}$",
      description: "Phone number"
    },
    symptoms: { 
      type: "string",
      description: "Reason for calling"
    },
    pain_level: { 
      type: "integer", 
      minimum: 1, 
      maximum: 10,
      description: "Pain level 1–10"
    },
    urgency_level: { 
      type: "string", 
      enum: ["low", "medium", "high", "emergency"],
      description: "Urgency"
    }
  },
  required: ["name", "symptoms"]
};

/**
 * Configure the AI Assistant with GatherUsingAI tool for patient data collection
 * @returns {Promise<Object>} Configuration result
 */
async function configurePatientDataCollection() {
  try {
    const assistantId = 'assistant-2a0ca083-90df-4e20-9689-3f7071f8f9da'; // Use existing assistant
    
    // Just verify the assistant exists and get its details
    console.log(`🤖 Using existing assistant: ${assistantId}`);
    
    try {
      const assistant = await telnyxClient.getAssistant(assistantId);
      
      if (assistant) {
        console.log(`✅ Assistant found: ${assistant.name}`);
        console.log(`📋 Model: ${assistant.model}`);
        console.log(`📋 API Key Ref: ${assistant.llm_api_key_ref || 'Not set'}`);
        console.log(`📋 Tools: ${assistant.tools?.length || 0} configured`);
        
        return {
          success: true,
          assistantId: assistant.id,
          model: assistant.model,
          apiKeyRef: assistant.llm_api_key_ref,
          tools: assistant.tools?.length || 0,
          message: 'Using existing assistant - ready for conversations'
        };
      } else {
        throw new Error('Assistant not found');
      }
    } catch (error) {
      console.error(`❌ Error fetching assistant ${assistantId}:`, error.message);
      
      return {
        success: false,
        error: error.message,
        assistantId: assistantId,
        message: 'Failed to fetch existing assistant'
      };
    }
    
  } catch (error) {
    console.error('❌ Error configuring patient data collection:', error);
    
    return { 
      status: 'fallback', 
      error: error.message,
      message: 'Assistant configuration failed'
    };
  }
}

/**
 * Start patient information gathering using AI
 * @param {string} callControlId - Call control ID from webhook payload
 * @param {string} callerPhone - Caller's phone number
 * @returns {Promise<Object>} Gather result
 */
async function startPatientDataGathering(callControlId, callerPhone) {
  try {
    console.log(`🤖 Starting patient data gathering for call: ${callControlId}`);
    
    const gatherResult = await telnyxClient.gatherUsingAI(callControlId, PATIENT_SCHEMA, {
      timeoutMillis: 60000, // 1 minute timeout
      language: 'en',
      voice: 'Telnyx.KokoroTTS.af_heart',
      clientState: Buffer.from(JSON.stringify({
        callerPhone: callerPhone,
        gatherType: 'patient_info',
        startTime: new Date().toISOString()
      })).toString('base64')
    });
    
    console.log(`🤖 Patient data gathering started:`, JSON.stringify(gatherResult, null, 2));
    
    return {
      success: true,
      gatherId: gatherResult.id || callControlId,
      callControlId: callControlId,
      callerPhone: callerPhone,
      status: 'gathering_patient_data',
      schema: PATIENT_SCHEMA
    };
    
  } catch (error) {
    console.error('❌ Error starting patient data gathering:', error);
    throw error;
  }
}

/**
 * Start AI Assistant conversation for incoming call
 * @param {string} callControlId - Call control ID from webhook payload
 * @param {string} callerPhone - Caller's phone number
 * @returns {Promise<Object>} AI Assistant session result
 */
async function startAIConversation(callControlId, callerPhone) {
  try {
    console.log(`🤖 Starting AI Assistant for call: ${callControlId} from ${callerPhone}`);
    
    const practiceSettings = config.getPracticeSettings();
    
    // Initial greeting message for the AI Assistant
    const initialMessage = `Hi, this is the AI receptionist for ${practiceSettings.name}. I'll help you today by asking a few quick questions about your visit. How can I help you?`;
    
    // Start the AI conversation without client_state
    const aiSession = await telnyxClient.startAIAssistant(callControlId, {
      assistant: {
        id: 'assistant-2a0ca083-90df-4e20-9689-3f7071f8f9da'
      },
      language: 'en',
      voice: 'Telnyx.KokoroTTS.af_heart',
      initial_message: initialMessage,
      webhook_url: `${process.env.BASE_URL}/webhook/ai-assistant`
    });
    
    console.log(`✅ AI Assistant started successfully:`, aiSession);
    return aiSession;
  } catch (error) {
    console.error('❌ Error starting AI Assistant:', error);
    throw error;
  }
}

/**
 * Handle AI Assistant webhook events
 * @param {Object} eventData - Webhook event data from Telnyx
 * @returns {Promise<Object>} Processing result
 */
async function handleAIAssistantEvent(eventData) {
  try {
    const { event_type, payload } = eventData;
    const callControlId = payload.call_control_id;
    const callerPhone = payload.from || payload.caller_number;
    
    console.log(`🤖 AI Assistant event: ${event_type} for call ${callControlId}`);
    
    switch (event_type) {
      case 'assistant.initialization':
        return await handleAssistantInitialization(payload);
        
      case 'assistant.conversation_started':
        return await handleConversationStarted(payload);
        
      case 'assistant.user_spoke':
      case 'assistant.transcript':
      case 'assistant.user_input':
        return await handleUserSpoke(payload);
        
      case 'assistant.assistant_spoke':
      case 'assistant.response':
        return await handleAssistantSpoke(payload);
        
      case 'assistant.conversation_ended':
      case 'assistant.ended':
        return await handleConversationEnded(payload);
        
      case 'assistant.error':
        return await handleAIError(payload);
        
      default:
        console.log(`🤖 Unhandled AI Assistant event: ${event_type}`);
        console.log(`📋 Full unhandled event payload:`, JSON.stringify(eventData, null, 2));
        
        // Log all unhandled events for debugging
        const unhandledLog = {
          eventType: event_type,
          callControlId: callControlId,
          from: callerPhone,
          timestamp: new Date().toISOString(),
          fullPayload: eventData
        };
        
        console.log(`📝 Unhandled event logged:`, JSON.stringify(unhandledLog, null, 2));
        
        return { status: 'ignored', eventType: event_type, logged: true };
    }
    
  } catch (error) {
    console.error('❌ Error handling AI Assistant event:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Handle assistant initialization event
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} Result
 */
async function handleAssistantInitialization(payload) {
  const { call_control_id, assistant_id, from, to } = payload;
  console.log(`🤖 AI Assistant initialized: ${assistant_id} for call ${call_control_id}`);
  console.log(`📞 Call from ${from} to ${to}`);
  
  // Log the call start
  const callLog = {
    callControlId: call_control_id,
    assistantId: assistant_id,
    from: from,
    to: to,
    timestamp: new Date().toISOString(),
    event: 'ai_assistant_initialized'
  };
  
  console.log(`📋 Call initialized:`, JSON.stringify(callLog, null, 2));
  
  return { status: 'initialized', callControlId: call_control_id };
}

/**
 * Handle conversation started event
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} Result
 */
async function handleConversationStarted(payload) {
  const { call_control_id } = payload;
  console.log(`🤖 AI conversation started for call: ${call_control_id}`);
  
  // Set initial context for dental practice
  const dentalContext = {
    instructions: `You are an AI receptionist for a dental clinic. Your main goals are:
    1. Greet patients warmly and professionally
    2. Collect patient information (name, phone, reason for calling)
    3. IMPORTANT: Identify emergency vs non-emergency situations
    4. For emergencies: Immediately escalate to emergency protocol
    5. For non-emergencies: Schedule appointments or provide information
    
    Emergency indicators include: severe pain, bleeding, swelling, infection, trauma, knocked out teeth, abscess.
    Always ask follow-up questions to understand the urgency level.`,
    
    practice_info: {
      name: config.getPracticeSettings().name,
      emergency_contact: process.env.EMERGENCY_CONTACT,
      type: 'dental_clinic'
    }
  };
  
  try {
    await telnyxClient.updateAIContext(call_control_id, dentalContext);
    console.log(`🤖 Dental context set for AI Assistant`);
  } catch (error) {
    console.error('❌ Error setting AI context:', error);
  }
  
  return { status: 'conversation_started', contextSet: true };
}

/**
 * Handle user spoke event (patient said something)
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} Result
 */
async function handleUserSpoke(payload) {
  const { call_control_id, transcript, from, user_message, text } = payload;
  // Try different field names for the user message
  const userMessage = transcript || user_message || text || payload.message;
  
  console.log(`👤 Patient said: "${userMessage}" on call ${call_control_id}`);
  console.log(`📋 Full user spoke payload:`, JSON.stringify(payload, null, 2));
  
  if (!userMessage) {
    console.log(`⚠️ No transcript found in payload. Available fields:`, Object.keys(payload));
    return { status: 'no_transcript', availableFields: Object.keys(payload) };
  }
  
  // Log the user input for debugging
  const userInputLog = {
    callControlId: call_control_id,
    from: from,
    userMessage: userMessage,
    timestamp: new Date().toISOString(),
    event: 'user_spoke',
    fullPayload: payload
  };
  
  console.log(`📝 User input logged:`, JSON.stringify(userInputLog, null, 2));
  
  // Analyze for emergency indicators using our existing logic
  const urgencyClassification = await classifyUrgency(userMessage);
  
  console.log(`📊 Urgency classification: ${urgencyClassification.type} (confidence: ${urgencyClassification.confidence}%)`);
  
  // Extract and display customer details based on urgency type
  let customerDetails = null;
  
  if (urgencyClassification.type === 'emergency') {
    // EMERGENCY DETECTED - Extract emergency details
    console.log(`🚨 EMERGENCY DETECTED! Extracting emergency details`);
    
    customerDetails = extractCustomerDetails(userMessage, 'emergency');
    customerDetails.originalMessage = userMessage;
    await displayCustomerDetails(customerDetails, call_control_id, from);
    
    try {
      // Start emergency protocol (don't try to stop AI Assistant for now)
      await handleEmergency(from, userMessage, call_control_id);
      
      console.log(`🚨 Emergency protocol initiated for ${call_control_id}`);
      
      return { 
        status: 'emergency_escalated', 
        classification: urgencyClassification,
        customerDetails: customerDetails,
        action: 'emergency_protocol_initiated',
        userMessage: userMessage
      };
      
    } catch (error) {
      console.error('❌ Error handling emergency escalation:', error);
      return { status: 'emergency_escalation_failed', error: error.message };
    }
    
  } else if (urgencyClassification.type === 'uncertain') {
    console.log(`❓ Uncertain urgency - needs clarification`);
    
    // Still extract any available details
    customerDetails = extractCustomerDetails(userMessage, 'uncertain');
    customerDetails.originalMessage = userMessage;
    if (Object.keys(customerDetails.extracted).length > 0) {
      await displayCustomerDetails(customerDetails, call_control_id, from);
    }
    
    return { 
      status: 'clarification_needed', 
      classification: urgencyClassification,
      customerDetails: customerDetails,
      action: 'ai_assistant_continues',
      userMessage: userMessage
    };
    
  } else {
    // Non-emergency - extract non-emergency details
    console.log(`✅ Non-emergency call - extracting customer details`);
    
    customerDetails = extractCustomerDetails(userMessage, 'non-emergency');
    customerDetails.originalMessage = userMessage;
    if (Object.keys(customerDetails.extracted).length > 0) {
      await displayCustomerDetails(customerDetails, call_control_id, from);
    }
    
    // Log for intake processing
    setImmediate(async () => {
      try {
        await handleIntake(from, userMessage, call_control_id);
      } catch (error) {
        console.error('Error in background intake logging:', error);
      }
    });
    
    return { 
      status: 'non_emergency_continued', 
      classification: urgencyClassification,
      customerDetails: customerDetails,
      action: 'ai_assistant_continues',
      userMessage: userMessage
    };
  }
}

/**
 * Handle assistant spoke event (AI said something)
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} Result
 */
async function handleAssistantSpoke(payload) {
  const { call_control_id, assistant_message, response, text } = payload;
  // Try different field names for the AI message
  const aiMessage = assistant_message || response || text || payload.message || payload.transcript;
  
  console.log(`🤖 AI Assistant said: "${aiMessage}" on call ${call_control_id}`);
  console.log(`📋 Full assistant spoke payload:`, JSON.stringify(payload, null, 2));
  
  // Log the AI response for debugging
  const aiResponseLog = {
    callControlId: call_control_id,
    aiMessage: aiMessage,
    timestamp: new Date().toISOString(),
    event: 'assistant_spoke',
    fullPayload: payload
  };
  
  console.log(`📝 AI response logged:`, JSON.stringify(aiResponseLog, null, 2));
  
  // Monitor AI responses for quality and compliance
  return { status: 'assistant_spoke_logged', message: aiMessage };
}

/**
 * Handle conversation ended event
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} Result
 */
async function handleConversationEnded(payload) {
  const { call_control_id, reason } = payload;
  
  console.log(`🤖 AI conversation ended for call ${call_control_id}, reason: ${reason}`);
  
  return { status: 'conversation_ended', reason: reason };
}

/**
 * Handle AI Assistant error
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} Result
 */
async function handleAIError(payload) {
  const { call_control_id, error_message } = payload;
  
  console.error(`🤖 AI Assistant error for call ${call_control_id}: ${error_message}`);
  
  // Fallback to manual speech
  try {
    await telnyxClient.speakText(call_control_id, 
      "I apologize for the technical difficulty. Let me help you directly. How can I assist you today?"
    );
  } catch (error) {
    console.error('❌ Error in AI fallback:', error);
  }
  
  return { status: 'ai_error_handled', fallback: 'manual_speech' };
}

/**
 * Check if message contains emergency keywords for quick detection
 * @param {string} message - User message
 * @returns {boolean} True if emergency keywords detected
 */
function hasEmergencyKeywords(message) {
  const messageText = message.toLowerCase();
  
  for (const category of Object.values(DENTAL_EMERGENCY_KEYWORDS)) {
    for (const keyword of category) {
      if (messageText.includes(keyword)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Extract customer details from conversation text
 * @param {string} text - User message text
 * @param {string} urgencyType - Type of urgency (emergency, non-emergency)
 * @returns {Object} Extracted customer details
 */
function extractCustomerDetails(text, urgencyType) {
  const details = {
    type: urgencyType,
    timestamp: new Date().toISOString(),
    extracted: {}
  };

  // Improved patterns for name extraction
  const namePatterns = [
    /(?:my name is|i'm|i am|this is|name's)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i,
    /(?:^|\s)([A-Z][a-z]+\s+[A-Z][a-z]+)(?=\s+and|\.|,|$)/,  // First Last followed by delimiter
  ];

  // Improved phone number patterns
  const phonePatterns = [
    /(?:call me (?:back )?at|phone (?:number )?is|number is|reach me at)\s*([0-9\-\.\s\(\)]{10,})/i,
    /(\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4})/  // Standard US phone format
  ];

  // Extract name
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) {
      details.extracted.name = match[1].trim();
      break;
    }
  }

  // Extract phone number
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      // Clean phone number: remove non-digits except +, then format
      const cleaned = match[1].replace(/[^\d]/g, '');
      if (cleaned.length === 10 || cleaned.length === 11) {
        details.extracted.phone = cleaned.length === 11 ? cleaned.substring(1) : cleaned;
        // Format for display: XXX-XXX-XXXX
        const formatted = details.extracted.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
        details.extracted.phoneFormatted = formatted;
      }
      break;
    }
  }

  if (urgencyType === 'emergency') {
    // Emergency-specific extractions
    const emergencyKeywords = [
      'bleeding', 'severe pain', 'knocked out', 'broken tooth', 'swelling', 
      'infection', 'abscess', 'trauma', 'accident', 'can\'t eat', 'can\'t sleep',
      'extreme pain', 'unbearable', 'throbbing'
    ];
    
    const foundKeywords = emergencyKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    if (foundKeywords.length > 0) {
      details.extracted.emergencyDescription = foundKeywords.join(', ');
    }

    // Detect emotional tone
    const stressIndicators = ['help', 'urgent', 'please', 'pain', 'hurt', 'emergency', 'severe', 'extreme'];
    const stressCount = stressIndicators.filter(word => text.toLowerCase().includes(word)).length;
    
    if (stressCount >= 3) {
      details.extracted.emotionalTone = 'high stress/urgent';
    } else if (stressCount >= 2) {
      details.extracted.emotionalTone = 'moderate concern';
    } else {
      details.extracted.emotionalTone = 'calm';
    }

  } else {
    // Non-emergency specific extractions
    const reasonPatterns = [
      /(?:calling about|need|want|looking for|reason for|calling because)\s+([^.!?]+)/i,
      /(?:schedule|appointment|cleaning|checkup|filling|crown|root canal|whitening)/i
    ];

    for (const pattern of reasonPatterns) {
      const match = text.match(pattern);
      if (match) {
        details.extracted.reason = match[1] ? match[1].trim() : match[0];
        break;
      }
    }

    // Extract preferred callback time
    const timePatterns = [
      /(?:call me|call back|available)\s+(?:at|around|between|after|before|in the)\s+([^.!?]+)/i,
      /(morning|afternoon|evening|tomorrow|today|monday|tuesday|wednesday|thursday|friday)/i
    ];

    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        details.extracted.preferredCallbackTime = match[1] ? match[1].trim() : match[0];
        break;
      }
    }
  }

  return details;
}

/**
 * Display customer details in console with formatting and send SMS notification
 * @param {Object} details - Customer details object
 * @param {string} callControlId - Call control ID
 * @param {string} callerPhone - Caller's phone number
 */
async function displayCustomerDetails(details, callControlId, callerPhone) {
  if (Object.keys(details.extracted).length === 0) {
    return; // No details to display
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 CUSTOMER DETAILS CAPTURED');
  console.log('='.repeat(60));
  console.log(`🕒 Timestamp: ${details.timestamp}`);
  console.log(`📞 Call ID: ${callControlId}`);
  console.log(`📱 Caller: ${callerPhone}`);
  console.log(`🚨 Type: ${details.type.toUpperCase()}`);
  console.log('-'.repeat(60));

  if (details.type === 'emergency') {
    console.log('🚨 EMERGENCY DETAILS:');
    if (details.extracted.name) {
      console.log(`👤 Full Name: ${details.extracted.name}`);
    }
    if (details.extracted.phoneFormatted) {
      console.log(`📞 Callback Number: ${details.extracted.phoneFormatted}`);
    }
    if (details.extracted.emergencyDescription) {
      console.log(`🩺 Emergency Description: ${details.extracted.emergencyDescription}`);
    }
    if (details.extracted.emotionalTone) {
      console.log(`😟 Emotional Tone: ${details.extracted.emotionalTone}`);
    }
  } else {
    console.log('📝 NON-EMERGENCY DETAILS:');
    if (details.extracted.name) {
      console.log(`👤 Name: ${details.extracted.name}`);
    }
    if (details.extracted.phoneFormatted) {
      console.log(`📞 Phone Number: ${details.extracted.phoneFormatted}`);
    }
    if (details.extracted.reason) {
      console.log(`💬 Reason for Call: ${details.extracted.reason}`);
    }
    if (details.extracted.preferredCallbackTime) {
      console.log(`⏰ Preferred Callback Time: ${details.extracted.preferredCallbackTime}`);
    }
  }

  console.log('='.repeat(60));
  console.log('📝 Raw Message: ' + details.originalMessage?.substring(0, 200) + (details.originalMessage?.length > 200 ? '...' : ''));
  console.log('='.repeat(60) + '\n');
  
  // Check if we have enough information to send SMS notification
  if (shouldSendNotification(details)) {
    console.log(`📱 Sending SMS notification to doctor...`);
    
    // Convert our extracted details to the format expected by SMS notification
    const patientInfo = convertDetailsToPatientInfo(details, callerPhone);
    const urgencyLevel = details.type === 'emergency' ? 'emergency' : 'medium';
    
    try {
      const smsResult = await sendDoctorNotification(patientInfo, urgencyLevel);
      
      if (smsResult.success) {
        console.log(`✅ Doctor notified via SMS: ${smsResult.messageId}`);
      } else {
        console.error(`❌ SMS notification failed: ${smsResult.error}`);
      }
    } catch (error) {
      console.error(`❌ Error sending SMS notification:`, error);
    }
  }
}

/**
 * Check if we have enough information to send a notification
 * @param {Object} details - Customer details object
 * @returns {boolean} True if notification should be sent
 */
function shouldSendNotification(details) {
  const extracted = details.extracted;
  
  // We need at least a name OR phone number, and some kind of issue description
  const hasIdentity = extracted.name || extracted.phone;
  const hasIssue = extracted.emergencyDescription || extracted.reason || details.originalMessage;
  
  return hasIdentity && hasIssue;
}

/**
 * Convert our extracted details format to the SMS notification format
 * @param {Object} details - Customer details object
 * @param {string} callerPhone - Caller's phone number
 * @returns {Object} Patient info object for SMS notification
 */
function convertDetailsToPatientInfo(details, callerPhone) {
  const extracted = details.extracted;
  
  const patientInfo = {
    name: extracted.name || 'Unknown',
    phone: extracted.phoneFormatted || extracted.phone || callerPhone
  };
  
  if (details.type === 'emergency') {
    patientInfo.symptoms = extracted.emergencyDescription || 'Emergency dental issue';
    patientInfo.urgency_level = 'emergency';
    
    if (extracted.emotionalTone) {
      patientInfo.emotionalTone = extracted.emotionalTone;
    }
  } else {
    patientInfo.symptoms = extracted.reason || 'Dental consultation request';
    patientInfo.urgency_level = 'medium';
    
    if (extracted.preferredCallbackTime) {
      patientInfo.preferredCallbackTime = extracted.preferredCallbackTime;
    }
  }
  
  return patientInfo;
}

module.exports = {
  startAIConversation,
  handleAIAssistantEvent,
  handleAssistantInitialization,
  handleConversationStarted,
  handleUserSpoke,
  handleAssistantSpoke,
  handleConversationEnded,
  handleAIError,
  hasEmergencyKeywords,
  configurePatientDataCollection,
  startPatientDataGathering,
  extractCustomerDetails,
  displayCustomerDetails,
  shouldSendNotification,
  convertDetailsToPatientInfo
}; 