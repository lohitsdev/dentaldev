require('dotenv').config();
const axios = require('axios');
const { saveAudioFile, textToSpeech } = require('./tts');

// Initialize Telnyx configuration
const apiKey = process.env.TELNYX_API_KEY;
const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;
const connectionId = process.env.TELNYX_CONNECTION_ID;
const outboundVoiceProfileId = process.env.TELNYX_OUTBOUND_VOICE_PROFILE_ID;
const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
let aiAssistantId = 'assistant-2a0ca083-90df-4e20-9689-3f7071f8f9da'; // Use existing assistant ID
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!apiKey || !telnyxPhoneNumber || !connectionId) {
  throw new Error('Missing required Telnyx configuration');
}

// Telnyx API base configuration
const telnyxApi = axios.create({
  baseURL: 'https://api.telnyx.com/v2',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Send SMS message with better error handling
 * @param {string} to - Recipient phone number
 * @param {string} message - Message body
 * @returns {Promise<Object>} Message object
 */
async function sendSMS(to, message) {
  try {
    // Check if SMS is enabled
    const smsEnabled = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
    if (!smsEnabled) {
      console.log('📱 SMS disabled - skipping SMS to:', to);
      return { status: 'disabled', message: 'SMS notifications disabled' };
    }

    const response = await telnyxApi.post('/messages', {
      from: telnyxPhoneNumber,
      to: to,
      text: message,
      messaging_profile_id: messagingProfileId
    });

    console.log(`📱 SMS sent to ${to}: ${response.data.data.id}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ SMS Error:', error.response?.data || error.message);
    
    // Handle specific Telnyx errors
    if (error.response?.status === 401) {
      console.error('🔐 Telnyx authentication failed - check your API_KEY');
    } else if (error.response?.status === 422) {
      console.error('📵 SMS validation error - check phone number format:', to);
    } else if (error.response?.status === 403) {
      console.error('🚫 Permission denied for SMS to:', to);
    }
    
    // Don't throw error - continue without SMS
    return { status: 'failed', error: error.message };
  }
}

/**
 * Make outbound call using Telnyx Call Control
 * @param {string} to - Recipient phone number
 * @param {string} webhookUrl - Webhook URL for call control
 * @returns {Promise<Object>} Call object
 */
async function makeCall(to, webhookUrl) {
  try {
    const response = await telnyxApi.post('/calls', {
      connection_id: connectionId,
      to: to,
      from: telnyxPhoneNumber,
      webhook_url: webhookUrl || `${BASE_URL}/webhook/call`
    });

    console.log(`📞 Call initiated to ${to}: ${response.data.data.call_control_id}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error making call:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Answer an incoming call
 * @param {string} callControlId - Call control ID
 * @returns {Promise<Object>} Response object
 */
async function answerCall(callControlId) {
  try {
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/answer`);
    console.log(`✅ Call answered: ${callControlId}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error answering call:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Hangup a call
 * @param {string} callControlId - Call control ID
 * @returns {Promise<Object>} Response object
 */
async function hangupCall(callControlId) {
  try {
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/hangup`);
    console.log(`📞 Call hung up: ${callControlId}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error hanging up call:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Speak text using Telnyx TTS
 * @param {string} callControlId - Call control ID
 * @param {string} text - Text to speak
 * @param {Object} options - TTS options
 * @returns {Promise<Object>} Response object
 */
async function speakText(callControlId, text, options = {}) {
  try {
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/speak`, {
      payload: text,
      voice: options.voice || 'Telnyx.KokoroTTS.af_heart',
      language: options.language || 'en-US'
    });
    console.log(`🎵 Speaking text on call: ${callControlId}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error speaking text:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Play audio file on call
 * @param {string} callControlId - Call control ID
 * @param {string} audioUrl - URL of audio file to play
 * @returns {Promise<Object>} Response object
 */
async function playAudio(callControlId, audioUrl) {
  try {
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/playback_start`, {
      audio_url: audioUrl
    });
    console.log(`🎵 Playing audio on call: ${callControlId}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error playing audio:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Start gather (collect user input) on call
 * @param {string} callControlId - Call control ID
 * @param {Object} options - Gather options
 * @returns {Promise<Object>} Response object
 */
async function startGather(callControlId, options = {}) {
  try {
    const gatherOptions = {
      minimum_digits: options.minimumDigits || 1,
      maximum_digits: options.maximumDigits || 10,
      timeout_millis: options.timeoutMillis || 10000,
      terminating_digit: options.terminatingDigit || '#',
      valid_digits: options.validDigits || '0123456789*#'
    };

    const response = await telnyxApi.post(`/calls/${callControlId}/actions/gather_using_speak`, {
      ...gatherOptions,
      payload: options.text || 'Please enter your response',
      voice: options.voice || 'Telnyx.KokoroTTS.af_heart',
      language: options.language || 'en-US'
    });
    console.log(`📞 Started gather on call: ${callControlId}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error starting gather:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Transfer a call with recording
 * @param {string} callControlId - Call control ID
 * @param {Object} config - Transfer configuration
 * @returns {Promise<Object>} Transfer result
 */
async function transferCall(callControlId, config) {
  try {
    console.log(`📞 Transferring call ${callControlId} with recording`);
    
    const transferPayload = {
      to: config.to,
      from: config.from,
      record_type: 'dual', // Record both sides
      record_format: 'mp3',
      webhook_url: `${process.env.BASE_URL}/webhook/emergency-recording`,
      timeout_secs: config.timeout_secs || 30,
      client_state: config.client_state,
      command_id: config.command_id || `transfer-${Date.now()}`,
      // Add Telnyx-specific recording parameters
      recording: {
        format: 'mp3',
        channels: 'dual'
      }
    };

    console.log(`📝 Transfer payload:`, JSON.stringify(transferPayload, null, 2));

    const response = await telnyxApi.post(
      `/calls/${callControlId}/actions/transfer`,
      transferPayload
    );
    
    console.log(`✅ Transfer initiated with recording:`, response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error transferring call:', error);
    throw error;
  }
}

/**
 * Start conference call
 * @param {string} callControlId - Call control ID
 * @param {string} conferenceName - Conference name
 * @param {Object} options - Conference options
 * @returns {Promise<Object>} Response object
 */
async function startConference(callControlId, conferenceName, options = {}) {
  try {
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/join_conference`, {
      conference_name: conferenceName,
      start_conference_on_enter: options.startConferenceOnEnter !== false,
      end_conference_on_exit: options.endConferenceOnExit || false,
      hold_audio_url: options.holdAudioUrl || null,
      muted: options.muted || false
    });
    console.log(`🎙️ Joined conference ${conferenceName}: ${callControlId}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error starting conference:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Generate voice response using ElevenLabs TTS with Telnyx fallback
 * @param {string} callControlId - Call control ID
 * @param {string} message - Message to speak
 * @param {Object} options - Additional options
 * @param {Object} ttsOptions - ElevenLabs TTS options
 * @returns {Promise<Object>} Response object
 */
async function generateVoiceResponse(callControlId, message, options = {}, ttsOptions = {}) {
  // Validate and clean the message
  if (!message || typeof message !== 'string') {
    console.error('Invalid message for TTS:', message);
    message = 'I apologize, but I\'m having trouble processing your request.';
  }

  // Clean the message for TTS
  const cleanMessage = message.trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

  try {
    // Try ElevenLabs TTS first
    console.log(`Generating TTS for: "${cleanMessage.substring(0, 100)}${cleanMessage.length > 100 ? '...' : ''}"`);
    
    const audioBuffer = await textToSpeech(cleanMessage, {
      stability: ttsOptions.stability || 0.6,
      similarityBoost: ttsOptions.similarityBoost || 0.8,
      style: ttsOptions.style || 0.2,
      useSpeakerBoost: true
    });
    
    if (audioBuffer && audioBuffer.length > 0) {
      // ElevenLabs succeeded - use audio file
      const audioId = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const filename = `${audioId}.mp3`;
      
      await saveAudioFile(audioBuffer, filename);
      const audioUrl = `${BASE_URL}/audio/${filename}`;
      
      if (options.gather) {
        // Start gather with audio playback
        return await telnyxApi.post(`/calls/${callControlId}/actions/gather_using_audio`, {
          audio_url: audioUrl,
          minimum_digits: options.minimumDigits || 1,
          maximum_digits: options.maximumDigits || 10,
          timeout_millis: options.timeoutMillis || 10000,
          terminating_digit: options.terminatingDigit || '#'
        });
      } else {
        // Just play the audio
        return await playAudio(callControlId, audioUrl);
      }
      
    } else {
      throw new Error('ElevenLabs unavailable - using Telnyx voice');
    }
    
  } catch (error) {
    // Fall back to Telnyx's built-in voice
    console.log('🎵 Using Telnyx built-in voice as fallback');
    
    if (options.gather) {
      return await startGather(callControlId, {
        text: cleanMessage,
        ...options
      });
    } else {
      return await speakText(callControlId, cleanMessage, options);
    }
  }
}

/**
 * Get call details
 * @param {string} callControlId - Call control ID
 * @returns {Promise<Object>} Call details
 */
async function getCallDetails(callControlId) {
  try {
    const response = await telnyxApi.get(`/calls/${callControlId}`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error getting call details:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Compatibility method for TwiML generation (returns call control instructions instead)
 * This is a bridge method to help with Twilio migration
 * @param {string} message - Message to speak
 * @param {Object} options - TwiML-style options
 * @param {Object} ttsOptions - ElevenLabs TTS options
 * @returns {Promise<string>} JSON string with call control instructions
 */
async function generateTwiML(message, options = {}, ttsOptions = {}) {
  // This method returns instructions for call control rather than TwiML
  // It's designed to be used with webhook handlers that can execute the commands
  
  const instructions = {
    type: 'call_control_instructions',
    message: message,
    options: options,
    ttsOptions: ttsOptions,
    actions: []
  };

  if (options.gather) {
    instructions.actions.push({
      command: 'gather',
      parameters: {
        text: message,
        action: options.action || '/webhook/call',
        timeout: options.timeout || 10000
      }
    });
  } else {
    instructions.actions.push({
      command: 'speak',
      parameters: {
        text: message
      }
    });
  }

  if (options.hangup) {
    instructions.actions.push({
      command: 'hangup'
    });
  }

  return JSON.stringify(instructions);
}

/**
 * Compatibility method for conference TwiML generation
 * @param {string} conferenceName - Conference name
 * @param {Object} options - Conference options
 * @returns {string} JSON string with conference instructions
 */
function generateConferenceTwiML(conferenceName, options = {}) {
  const instructions = {
    type: 'conference_instructions',
    conferenceName: conferenceName,
    options: options,
    actions: [
      {
        command: 'speak',
        parameters: {
          text: options.announcement || 'Joining conference'
        }
      },
      {
        command: 'join_conference',
        parameters: {
          conference_name: conferenceName,
          start_conference_on_enter: options.startConferenceOnEnter !== false,
          end_conference_on_exit: options.endConferenceOnExit || false,
          muted: options.muted || false
        }
      }
    ]
  };

  return JSON.stringify(instructions);
}

/**
 * Simple TwiML compatibility method
 * @param {string} message - Message to speak
 * @param {Object} options - Options
 * @returns {string} JSON string with simple instructions
 */
function generateSimpleTwiML(message, options = {}) {
  const instructions = {
    type: 'simple_instructions',
    message: message,
    options: options,
    actions: [
      {
        command: 'speak',
        parameters: {
          text: message
        }
      }
    ]
  };

  if (options.hangup) {
    instructions.actions.push({
      command: 'hangup'
    });
  }

  return JSON.stringify(instructions);
}

/**
 * Execute call control instructions (helper method)
 * @param {string} callControlId - Call control ID
 * @param {string} instructionsJson - JSON instructions from generateTwiML methods
 * @returns {Promise<Object>} Execution result
 */
async function executeInstructions(callControlId, instructionsJson) {
  try {
    const instructions = JSON.parse(instructionsJson);
    const results = [];

    for (const action of instructions.actions) {
      let result;
      
      switch (action.command) {
        case 'speak':
          result = await speakText(callControlId, action.parameters.text);
          break;
          
        case 'gather':
          result = await startGather(callControlId, {
            text: action.parameters.text,
            timeoutMillis: action.parameters.timeout
          });
          break;
          
        case 'join_conference':
          result = await startConference(callControlId, action.parameters.conference_name, action.parameters);
          break;
          
        case 'hangup':
          result = await hangupCall(callControlId);
          break;
          
        default:
          console.warn(`Unknown command: ${action.command}`);
      }
      
      if (result) {
        results.push(result);
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error('❌ Error executing instructions:', error);
    throw error;
  }
}

/**
 * Start AI Assistant for a call using correct Telnyx Call Control
 * @param {string} callControlId - Call control ID from webhook payload
 * @param {Object} options - AI Assistant options
 * @returns {Promise<Object>} AI Assistant session
 */
async function startAIAssistant(callControlId, options = {}) {
  try {
    // Configure recording settings for Telnyx
    const recordingConfig = {
      record_type: 'dual',
      format: 'mp3',
      webhook_url: `${process.env.BASE_URL}/webhook/emergency-recording`,
      recording: {
        format: 'mp3',
        channels: 'dual'
      }
    };

    // Start AI Assistant with recording
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/ai_assistant_start`, {
      assistant: { 
        id: aiAssistantId 
      },
      language: options.language || 'en',
      voice: options.voice || 'Telnyx.KokoroTTS.af_heart',
      initial_message: options.initialMessage || null,
      webhook_url: options.webhookUrl || `${process.env.BASE_URL}/webhook/ai-assistant`,
      ...recordingConfig
    });
    
    console.log(`🤖 AI Assistant started with recording for call: ${callControlId}`);
    return response.data.data;
    
  } catch (error) {
    console.error('❌ Error starting AI Assistant:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Stop AI Assistant for a call
 * @param {string} callControlId - Call control ID from webhook payload
 * @param {Object} options - Options
 * @returns {Promise<Object>} Response
 */
async function stopAIAssistant(callControlId, options = {}) {
  try {
    // FIXED: Use correct endpoint path ai_assistant_stop (not stop_assistant)
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/ai_assistant_stop`, {
      client_state: options.clientState || null,
      command_id: options.commandId || null
    });
    
    console.log(`🤖 AI Assistant stopped for call: ${callControlId}`);
    return response.data.data;
    
  } catch (error) {
    console.error('❌ Error stopping AI Assistant:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Update AI Assistant configuration with GatherUsingAI tool
 * @param {string} assistantId - Assistant ID
 * @param {Object} gatherSchema - JSON Schema for data collection
 * @returns {Promise<Object>} Update result
 */
async function configureAssistantGatherTool(assistantId, gatherSchema) {
  try {
    // Use the exact same structure as the working curl example
    const toolConfig = {
      tools: [
        {
          type: "gather_using_ai",
          name: "GatherUsingAI",
          description: "Collect patient info: name, phone, symptoms, pain & urgency",
          parameters: {
            schema: gatherSchema
          }
        }
      ]
    };

    const response = await telnyxApi.patch(`/ai/assistants/${assistantId}`, toolConfig);
    console.log(`🤖 Assistant configured with GatherUsingAI tool: ${assistantId}`);
    return response.data.data;
    
  } catch (error) {
    console.error('❌ Error configuring Assistant tool:', error.response?.data || error.message);
    console.error(`Status: ${error.response?.status}, Assistant: ${assistantId}`);
    throw error;
  }
}

/**
 * Gather information using AI with structured data extraction
 * @param {string} callControlId - Call control ID from webhook payload
 * @param {Object} schema - JSON Schema for data extraction
 * @param {Object} options - Gather options
 * @returns {Promise<Object>} Response
 */
async function gatherUsingAI(callControlId, schema, options = {}) {
  try {
    const response = await telnyxApi.post(`/calls/${callControlId}/actions/gather_using_ai`, {
      // Send the schema directly as per Telnyx documentation
      schema: schema,
      timeout_millis: options.timeoutMillis || 30000,
      language: options.language || 'en',
      voice: options.voice || 'Telnyx.KokoroTTS.af_heart',
      client_state: options.clientState || null,
      command_id: options.commandId || null
    });
    
    console.log(`🤖 AI Gather started for call: ${callControlId}`);
    return response.data.data;
    
  } catch (error) {
    console.error('❌ Error starting AI gather:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Update AI Assistant context/instructions during a call
 * @param {string} callControlId - Call control ID
 * @param {Object} context - Context data to update
 * @returns {Promise<Object>} Update result
 */
async function updateAIContext(callControlId, context) {
  try {
    // For now, we can use the client_state to pass context
    // This is a placeholder - actual context update may need different approach
    console.log(`🤖 AI Context update requested for call: ${callControlId}`);
    console.log(`📋 Context:`, JSON.stringify(context, null, 2));
    
    return { 
      status: 'context_logged', 
      callControlId: callControlId,
      context: context 
    };
  } catch (error) {
    console.error('❌ Error updating AI context:', error);
    throw error;
  }
}

/**
 * List all AI Assistants
 * @returns {Promise<Object>} List of assistants
 */
async function listAssistants() {
  try {
    const response = await telnyxApi.get('/ai/assistants');
    console.log(`🤖 Listed ${response.data.data.length} assistants`);
    return response.data.data;
  } catch (error) {
    console.error('❌ Error listing assistants:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Create a new AI Assistant
 * @param {Object} assistantConfig - Assistant configuration
 * @returns {Promise<Object>} Created assistant
 */
async function createAssistant(assistantConfig = {}) {
  try {
    const config = {
      name: assistantConfig.name || "After Hours Dental",
      instructions: assistantConfig.instructions || `You are a friendly after-hours AI dental receptionist. 
      
After collecting patient information (name, phone, symptoms, pain level), DO NOT end the conversation. Instead:

For non-emergencies:
1. Thank them for providing their information
2. Let them know they will be contacted during business hours to schedule their appointment
3. Ask if they have any other questions
4. Only end the call if the patient indicates they are done or after 30 seconds of silence

For emergencies:
1. Immediately escalate to emergency protocol
2. Stay on the line until doctor connection is confirmed

Always maintain a warm, professional tone and ensure the patient feels heard and cared for.`,

      greeting: assistantConfig.greeting || "Hello, you've reached our after-hours dental line. May I get your name, please?",
      model: assistantConfig.model || "openai/gpt-4o",
      llm_api_key_ref: assistantConfig.llm_api_key_ref || "openai_key",
      tools: assistantConfig.tools || [],
      conversation_config: {
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 30000  // 30 seconds of silence before auto-hangup
        },
        agent_output_audio_format: "pcm_16000",
        user_input_audio_format: "pcm_16000"
      }
    };

    const response = await telnyxApi.post('/ai/assistants', config);
    console.log(`🤖 Created new assistant: ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error('❌ Error creating assistant:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get specific AI Assistant by ID
 * @param {string} assistantId - Assistant ID
 * @returns {Promise<Object>} Assistant details
 */
async function getAssistant(assistantId) {
  try {
    const response = await telnyxApi.get(`/ai/assistants/${assistantId}`);
    console.log(`🤖 Retrieved assistant: ${assistantId}`);
    return response.data; // Response is directly in data, not data.data
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`🤖 Assistant not found: ${assistantId}`);
      return null;
    }
    console.error('❌ Error getting assistant:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Ensure AI Assistant exists and is configured with GatherUsingAI tool
 * @param {string} assistantId - Assistant ID to check/create
 * @param {Object} gatherSchema - JSON Schema for data collection
 * @returns {Promise<Object>} Assistant configuration result
 */
async function ensureAssistantConfigured(assistantId, gatherSchema) {
  try {
    console.log(`🤖 Using existing assistant: ${assistantId}`);
    
    // Just get the assistant details, don't create
    let assistant = await getAssistant(assistantId);
    
    if (!assistant) {
      console.error(`❌ Assistant not found: ${assistantId}`);
      return {
        success: false,
        error: 'Assistant not found',
        assistantId: assistantId
      };
    }
    
    console.log(`✅ Assistant found: ${assistant.name}`);
    console.log(`📋 Model: ${assistant.model}`);
    console.log(`📋 API Key Ref: ${assistant.llm_api_key_ref || 'Not set'}`);
    console.log(`📋 Tools: ${assistant.tools?.length || 0} configured`);
    
    // Try to configure the GatherUsingAI tool (this may fail due to API endpoint issues)
    try {
      const configResult = await configureAssistantGatherTool(assistant.id, gatherSchema);
      console.log(`✅ GatherUsingAI tool configured successfully`);
      
      return {
        success: true,
        assistantId: assistant.id,
        configured: true,
        created: false,
        configResult: configResult
      };
    } catch (toolError) {
      console.log(`⚠️ GatherUsingAI tool configuration failed, but assistant will work for conversations`);
      console.log(`📋 Assistant is ready with OpenAI GPT-4o for natural dialogue`);
      
      // Return success even if tool configuration fails
      return {
        success: true,
        assistantId: assistant.id,
        configured: false,
        created: false,
        toolConfigurationFailed: true,
        message: 'Assistant ready for conversations without structured data tool'
      };
    }
    
  } catch (error) {
    console.error('❌ Error checking assistant configuration:', error);
    return {
      success: false,
      error: error.message,
      assistantId: assistantId
    };
  }
}

/**
 * Update the AI Assistant ID (used when a new assistant is created)
 * @param {string} newAssistantId - New assistant ID to use
 */
function updateAIAssistantId(newAssistantId) {
  aiAssistantId = newAssistantId;
  console.log(`🤖 Updated AI Assistant ID to: ${aiAssistantId}`);
}

/**
 * Get the current AI Assistant ID
 * @returns {string} Current assistant ID
 */
function getAIAssistantId() {
  return aiAssistantId;
}

/**
 * Dial number with conference support (for conference calls)
 * @param {Object} dialOptions - Dial options including conference_config
 * @returns {Promise<Object>} Call object
 */
async function dialNumber(dialOptions) {
  try {
    const payload = {
      connection_id: dialOptions.connection_id || connectionId,
      to: dialOptions.to,
      from: dialOptions.from || telnyxPhoneNumber,
      webhook_url: dialOptions.webhook_url || `${BASE_URL}/webhook/call`,
      ...dialOptions
    };
    
    // Remove our custom properties to avoid API errors
    delete payload.connection_id;
    payload.connection_id = dialOptions.connection_id || connectionId;
    
    console.log(`📞 Dialing ${dialOptions.to} with options:`, {
      to: dialOptions.to,
      from: payload.from,
      hasConferenceConfig: !!dialOptions.conference_config,
      conferenceName: dialOptions.conference_config?.conference_name
    });
    
    const response = await telnyxApi.post('/calls', payload);
    
    console.log(`📞 Call initiated to ${dialOptions.to}: ${response.data.data.call_control_id}`);
    return {
      success: true,
      call_control_id: response.data.data.call_control_id,
      call_leg_id: response.data.data.call_leg_id,
      call_session_id: response.data.data.call_session_id,
      ...response.data.data
    };
  } catch (error) {
    console.error('❌ Error dialing number:', error.response?.data || error.message);
    return {
      success: false,
      error: error.message,
      details: error.response?.data
    };
  }
}

/**
 * Configure AI Assistant with tools
 * @param {Object} toolConfig - Tool configuration object
 * @returns {Promise<Object>} Configuration result
 */
async function configureAssistant(toolConfig) {
  try {
    const assistantId = 'assistant-2a0ca083-90df-4e20-9689-3f7071f8f9da';
    
    const response = await telnyxApi.patch(`/ai/assistants/${assistantId}`, {
      tools: toolConfig.tools
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Error configuring AI Assistant:', error);
    throw error;
  }
}

/**
 * Retrieve and summarize recordings directly from Telnyx API
 * @param {Object} options - Search options
 * @param {string} options.date - Date to search for (YYYY-MM-DD format)
 * @param {string} options.callId - Specific call ID to search for
 * @returns {Promise<Object>} Recording summaries
 */
async function getRecordingSummaries(options = {}) {
  try {
    console.log('📞 Fetching recordings from Telnyx API...');
    
    // Build filter parameters
    const params = {};
    if (options.date) {
      const startDate = new Date(options.date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
      params.created_at_gte = startDate.toISOString();
      params.created_at_lt = endDate.toISOString();
    }
    
    if (options.callId) {
      params.call_control_id = options.callId;
    }

    // Fetch recordings from Telnyx API
    const response = await telnyxApi.get('/recordings', { params });
    const recordings = response.data.data || [];

    console.log(`Found ${recordings.length} recordings`);

    // Group recordings by call
    const groupedRecordings = {};
    recordings.forEach(recording => {
      const callId = recording.call_control_id;
      if (!groupedRecordings[callId]) {
        groupedRecordings[callId] = {
          id: callId,
          recordings: [],
          totalDuration: 0,
          timestamps: []
        };
      }

      groupedRecordings[callId].recordings.push({
        recordingId: recording.id,
        url: recording.recording_urls?.mp3,
        duration: recording.duration_secs,
        channels: recording.channels,
        format: recording.format,
        timestamp: recording.created_at,
        status: recording.status
      });

      groupedRecordings[callId].totalDuration += recording.duration_secs || 0;
      groupedRecordings[callId].timestamps.push(recording.created_at);
    });

    // Sort recordings by timestamp and add start/end times
    Object.values(groupedRecordings).forEach(group => {
      group.recordings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      group.startTime = group.timestamps[0];
      group.endTime = group.timestamps[group.timestamps.length - 1];
      delete group.timestamps;
    });

    return {
      date: options.date || new Date().toISOString().split('T')[0],
      totalCalls: Object.keys(groupedRecordings).length,
      recordings: groupedRecordings
    };

  } catch (error) {
    console.error('❌ Error fetching recordings from Telnyx:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get conversation insights from Telnyx AI
 * @param {string} conversationId - Conversation ID from AI Assistant
 * @returns {Promise<Object>} Conversation insights
 */
async function getConversationInsights(conversationId) {
  try {
    console.log(`🔍 Fetching conversation insights for: ${conversationId}`);
    
    const response = await telnyxApi.get(`/ai/conversations/${conversationId}/conversations-insights`, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log(`✅ Retrieved insights for conversation: ${conversationId}`);
    return response.data;
    
  } catch (error) {
    console.error('❌ Error fetching conversation insights:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Start real-time emergency detection using GatherUsingAI
 * @param {string} callControlId - Call control ID
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Gather result
 */
async function startEmergencyDetection(callControlId, options = {}) {
  try {
    console.log(`🚨 Starting real-time emergency detection for call: ${callControlId}`);
    
    const gatherConfig = {
      greeting: options.greeting || "How can I help you today?",
      send_partial_results: true,
      parameters: {
        type: "object",
        properties: {
          emergency_detected: {
            type: "boolean",
            description: "True if this is an emergency situation"
          },
          emergency_type: {
            type: "string",
            description: "Type of emergency if detected"
          },
          caller_details: {
            type: "object",
            properties: {
              name: { type: "string" },
              phone: { type: "string" },
              situation: { type: "string" }
            }
          }
        }
      },
      webhook_url: options.webhook_url || `${BASE_URL}/webhook/emergency-gather`,
      webhook_url_method: 'POST',
      language: options.language || 'en-US',
      voice: options.voice || 'Telnyx.KokoroTTS.af_heart',
      client_state: options.client_state || Buffer.from(JSON.stringify({
        call_control_id: callControlId,
        start_time: new Date().toISOString()
      })).toString('base64')
    };

    console.log('📋 Emergency detection config:', JSON.stringify(gatherConfig, null, 2));

    const response = await telnyxApi.post(
      `/calls/${callControlId}/actions/gather_using_ai`,
      gatherConfig,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Emergency detection started for call: ${callControlId}`);
    return response.data;

  } catch (error) {
    console.error('❌ Error starting emergency detection:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  telnyxApi,
  sendSMS,
  makeCall,
  dialNumber,
  answerCall,
  hangupCall,
  speakText,
  playAudio,
  startGather,
  transferCall,
  startConference,
  generateVoiceResponse,
  getCallDetails,
  generateTwiML,
  generateConferenceTwiML,
  generateSimpleTwiML,
  executeInstructions,
  startAIAssistant,
  stopAIAssistant,
  configureAssistantGatherTool,
  gatherUsingAI,
  updateAIContext,
  listAssistants,
  createAssistant,
  getAssistant,
  ensureAssistantConfigured,
  updateAIAssistantId,
  getAIAssistantId,
  telnyxPhoneNumber,
  connectionId,
  configureAssistant,
  getRecordingSummaries,
  getConversationInsights, // Add the new function to exports
  startEmergencyDetection // Add the new function to exports
}; 