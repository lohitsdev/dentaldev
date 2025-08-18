const twilio = require('twilio');
const ConversationalAI = require('./conversational-ai');
const { sendReceptionistSummary } = require('./email');
const config = require('./config');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!accountSid || !authToken || !twilioPhoneNumber) {
  throw new Error('Missing required Twilio configuration');
}

const client = twilio(accountSid, authToken);

// Active conversations map
const activeConversations = new Map();

/**
 * Enhanced Twilio integration with ElevenLabs Conversational AI
 */
class TwilioConversationalIntegration {
  constructor() {
    this.conversationalAI = new ConversationalAI();
    this.agentCreated = false;
  }

  /**
   * Get count of active conversations
   * @returns {number} Number of active conversations
   */
  getActiveConversationsCount() {
    return activeConversations.size;
  }

  /**
   * Send audio to conversation (method called by webhook)
   * @param {string} callSid - Call SID
   * @param {Buffer} audioBuffer - Audio data
   */
  sendAudioToConversation(callSid, audioBuffer) {
    const conversationData = activeConversations.get(callSid);
    if (conversationData && conversationData.ai) {
      conversationData.ai.sendAudio(audioBuffer);
    }
  }

  /**
   * Initialize the conversational agent (one-time setup)
   */
  async initializeAgent() {
    if (!this.agentCreated) {
      try {
        // Check if agent ID already exists
        if (process.env.ELEVENLABS_AGENT_ID) {
          this.conversationalAI.agentId = process.env.ELEVENLABS_AGENT_ID;
          this.agentCreated = true;
          console.log('✅ Using existing conversational AI agent:', this.conversationalAI.agentId);
        } else {
          await this.conversationalAI.createDentalReceptionistAgent();
          this.agentCreated = true;
          console.log('✅ Conversational AI agent initialized');
        }
      } catch (error) {
        console.error('Failed to create conversational agent:', error);
        throw error;
      }
    }
  }

  /**
   * Handle incoming call with conversational AI
   * @param {string} callSid - Twilio call SID
   * @param {string} from - Caller's phone number
   * @returns {Promise<string>} TwiML response
   */
  async handleIncomingCall(callSid, from) {
    try {
      // Ensure agent is initialized
      await this.initializeAgent();

      // Start a new conversation
      const conversationSession = await this.conversationalAI.startConversation({
        user_id: from,
        session_metadata: {
          call_sid: callSid,
          phone_number: from,
          start_time: new Date().toISOString()
        }
      });

      // Store conversation in active sessions
      const conversationData = {
        conversationId: conversationSession.conversation_id,
        callSid: callSid,
        from: from,
        startTime: new Date().toISOString(),
        messages: [],
        emergencyDetected: false,
        patientInfo: {},
        ai: this.conversationalAI
      };

      activeConversations.set(callSid, conversationData);

      // Set up WebSocket for real-time conversation
      await this.setupConversationWebSocket(callSid, conversationData);

      // Generate TwiML to start the conversation stream
      const twiml = this.generateConversationalTwiML(callSid);
      
      return twiml;

    } catch (error) {
      console.error('Error handling incoming call:', error);
      // Fallback to basic TTS if conversational AI fails
      return this.generateFallbackTwiML("I apologize, but I'm having technical difficulties. Please call back in a moment or if this is an emergency, call 911.");
    }
  }

  /**
   * Set up WebSocket connection for real-time conversation
   * @param {string} callSid - Call SID
   * @param {Object} conversationData - Conversation data
   */
  async setupConversationWebSocket(callSid, conversationData) {
    try {
      const ws = await conversationData.ai.connectWebSocket(
        (message) => this.handleConversationMessage(callSid, message),
        (audioChunk) => this.handleAudioChunk(callSid, audioChunk)
      );

      conversationData.websocket = ws;
      console.log(`🔗 WebSocket connected for call ${callSid}`);

    } catch (error) {
      console.error('Error setting up WebSocket:', error);
    }
  }

  /**
   * Handle conversation messages from ElevenLabs
   * @param {string} callSid - Call SID
   * @param {Object} message - Message from conversational AI
   */
  async handleConversationMessage(callSid, message) {
    const conversationData = activeConversations.get(callSid);
    if (!conversationData) return;

    // Store message in conversation history
    conversationData.messages.push({
      type: message.type,
      timestamp: new Date().toISOString(),
      data: message.data
    });

    switch (message.type) {
      case 'user_transcript':
        // User spoke - analyze for emergencies
        const userText = message.data.text;
        await this.analyzeUserInput(callSid, userText);
        break;

      case 'agent_response':
        // AI responded - check if we need to take action
        const agentText = message.data.text;
        await this.handleAgentResponse(callSid, agentText);
        break;

      case 'conversation_end':
        // Conversation ended - cleanup and send summary
        await this.handleConversationEnd(callSid);
        break;
    }
  }

  /**
   * Analyze user input for emergencies and collect patient info
   * @param {string} callSid - Call SID
   * @param {string} userText - What the user said
   */
  async analyzeUserInput(callSid, userText) {
    const conversationData = activeConversations.get(callSid);
    if (!conversationData) return;

    // Use the conversation AI's emergency analysis
    const emergencyAnalysis = conversationData.ai.analyzeConversationForEmergency([
      { role: 'user', text: userText }
    ]);

    if (emergencyAnalysis.isEmergency && !conversationData.emergencyDetected) {
      conversationData.emergencyDetected = true;
      console.log(`🚨 Emergency detected in call ${callSid}: ${emergencyAnalysis.keywords.join(', ')}`);

      // Send immediate alert to emergency doctor
      const practiceSettings = config.getPracticeSettings();
      await this.sendEmergencyAlert(callSid, conversationData, emergencyAnalysis, practiceSettings);
    }

    // Extract patient information
    this.extractPatientInfo(conversationData, userText);
  }

  /**
   * Handle AI agent responses
   * @param {string} callSid - Call SID
   * @param {string} agentText - What the AI said
   */
  async handleAgentResponse(callSid, agentText) {
    const conversationData = activeConversations.get(callSid);
    if (!conversationData) return;

    // Check if AI is asking for emergency escalation
    if (agentText.toLowerCase().includes('connect you with our emergency doctor') ||
        agentText.toLowerCase().includes('emergency doctor right away')) {
      
      // Trigger emergency doctor connection
      setTimeout(() => {
        this.connectToEmergencyDoctor(callSid);
      }, 2000); // Give AI time to finish speaking
    }
  }

  /**
   * Connect call to emergency doctor
   * @param {string} callSid - Call SID
   */
  async connectToEmergencyDoctor(callSid) {
    try {
      const conversationData = activeConversations.get(callSid);
      if (!conversationData) return;

      const emergencyDoctor = process.env.PRIMARY_EMERGENCY_DOCTOR;
      const enableRealTransfers = process.env.ENABLE_REAL_TRANSFERS === 'true';

      if (enableRealTransfers && emergencyDoctor) {
        // Create a conference call
        const conference = await client.conferences.create({
          friendlyName: `emergency-${callSid}`,
          record: true,
          statusCallback: `${BASE_URL}/webhook/conference-status`
        });

        // Add the emergency doctor to the conference
        await client.conferences(conference.sid)
          .participants
          .create({
            from: twilioPhoneNumber,
            to: emergencyDoctor,
            earlyMedia: true
          });

        // Transfer the patient to the conference
        await client.calls(callSid).update({
          twiml: `<Response><Say>Connecting you to our emergency doctor now.</Say><Dial><Conference>${conference.friendlyName}</Conference></Dial></Response>`
        });

        console.log(`📞 Emergency call ${callSid} transferred to doctor conference ${conference.sid}`);
      }
    } catch (error) {
      console.error('Error connecting to emergency doctor:', error);
    }
  }

  /**
   * Extract patient information from conversation
   * @param {Object} conversationData - Conversation data
   * @param {string} userText - User input
   */
  extractPatientInfo(conversationData, userText) {
    const text = userText.toLowerCase();

    // Extract name
    const namePatterns = [
      /my name is ([a-zA-Z\s]+)/i,
      /i'm ([a-zA-Z\s]+)/i,
      /this is ([a-zA-Z\s]+)/i
    ];

    for (const pattern of namePatterns) {
      const match = userText.match(pattern);
      if (match) {
        conversationData.patientInfo.name = match[1].trim();
        break;
      }
    }

    // Extract phone number
    const phoneMatch = userText.match(/(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
    if (phoneMatch) {
      conversationData.patientInfo.callbackNumber = phoneMatch[0];
    }

    // Extract symptoms/concerns
    if (text.includes('pain') || text.includes('hurt') || text.includes('tooth')) {
      if (!conversationData.patientInfo.symptoms) {
        conversationData.patientInfo.symptoms = [];
      }
      conversationData.patientInfo.symptoms.push(userText);
    }
  }

  /**
   * Send emergency alert
   * @param {string} callSid - Call SID
   * @param {Object} conversationData - Conversation data
   * @param {Object} emergencyAnalysis - Emergency analysis
   * @param {Object} practiceSettings - Practice settings
   */
  async sendEmergencyAlert(callSid, conversationData, emergencyAnalysis, practiceSettings) {
    try {
      // Send SMS to emergency doctor if enabled
      const smsEnabled = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
      const emergencyDoctor = process.env.PRIMARY_EMERGENCY_DOCTOR;

      if (smsEnabled && emergencyDoctor) {
        const alertMessage = `🚨 DENTAL EMERGENCY ALERT 🚨
Patient: ${conversationData.patientInfo.name || 'Unknown'}
Phone: ${conversationData.from}
Keywords: ${emergencyAnalysis.keywords.join(', ')}
Confidence: ${emergencyAnalysis.confidence}%
Time: ${new Date().toLocaleString()}

AI is handling initial triage. Prepare for call transfer.

Call ID: ${callSid}`;

        await client.messages.create({
          body: alertMessage,
          from: twilioPhoneNumber,
          to: emergencyDoctor
        });

        console.log(`📱 Emergency SMS sent to doctor: ${emergencyDoctor}`);
      }
    } catch (error) {
      console.error('Error sending emergency alert:', error);
    }
  }

  /**
   * Handle conversation end
   * @param {string} callSid - Call SID
   */
  async handleConversationEnd(callSid) {
    const conversationData = activeConversations.get(callSid);
    if (!conversationData) return;

    try {
      // Get full conversation history
      const conversationHistory = await conversationData.ai.getConversationHistory();
      
      // Create comprehensive call summary
      const callSummary = {
        callId: callSid,
        timestamp: conversationData.startTime,
        endTime: new Date().toISOString(),
        phone: conversationData.from,
        patientName: conversationData.patientInfo.name || 'Not provided',
        callbackNumber: conversationData.patientInfo.callbackNumber || conversationData.from,
        classification: conversationData.emergencyDetected ? 'emergency' : 'non_emergency',
        emergencyDetected: conversationData.emergencyDetected,
        patientInfo: conversationData.patientInfo,
        conversationHistory: conversationHistory,
        summary: this.generateConversationSummary(conversationHistory),
        actionTaken: conversationData.emergencyDetected ? 'emergency_escalation' : 'appointment_scheduling'
      };

      // Send email summary to staff
      const practiceSettings = config.getPracticeSettings();
      await sendReceptionistSummary(callSummary, practiceSettings);

      // Log for compliance
      await this.logConversation(callSummary);

      // Clean up
      if (conversationData.websocket) {
        conversationData.websocket.close();
      }
      await conversationData.ai.endConversation();
      activeConversations.delete(callSid);

      console.log(`📋 Conversation ${callSid} ended and summarized`);

    } catch (error) {
      console.error('Error handling conversation end:', error);
    }
  }

  /**
   * Generate conversation summary
   * @param {Array} conversationHistory - Conversation messages
   * @returns {string} Summary
   */
  generateConversationSummary(conversationHistory) {
    const userMessages = conversationHistory
      .filter(msg => msg.role === 'user')
      .map(msg => msg.text)
      .join(' ');

    return `Patient conversation: ${userMessages.substring(0, 500)}${userMessages.length > 500 ? '...' : ''}`;
  }

  /**
   * Generate TwiML for conversational AI (connects to media stream)
   * @param {string} callSid - Call SID
   * @returns {string} TwiML
   */
  generateConversationalTwiML(callSid) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    // Start media stream to connect with ElevenLabs
    const start = twiml.start();
    start.stream({
      name: `conversation-${callSid}`,
      url: `wss://${process.env.BASE_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000'}/stream/${callSid}`,
      track: 'both_tracks'
    });

    // Keep the call alive while streaming
    twiml.say('Hello, please hold while I connect you to our AI receptionist.');
    twiml.pause({ length: 300 }); // 5 minutes max call duration

    return twiml.toString();
  }

  /**
   * Generate fallback TwiML when conversational AI fails
   * @param {string} message - Message to speak
   * @returns {string} TwiML
   */
  generateFallbackTwiML(message) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();
    
    twiml.say(message);
    twiml.hangup();
    
    return twiml.toString();
  }

  /**
   * Handle audio chunks from conversational AI
   * @param {string} callSid - Call SID
   * @param {Buffer} audioChunk - Audio data
   */
  handleAudioChunk(callSid, audioChunk) {
    // In a real implementation, you would stream this audio back to Twilio
    // This requires setting up a WebSocket server for media streaming
    console.log(`🎵 Received audio chunk for call ${callSid}: ${audioChunk.length} bytes`);
  }

  /**
   * Log conversation for HIPAA compliance
   * @param {Object} callSummary - Call summary
   */
  async logConversation(callSummary) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const logsDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const logFile = path.join(logsDir, `conversational-ai-${new Date().toISOString().split('T')[0]}.log`);
      const logEntry = `${new Date().toISOString()} - CONVERSATION - ${JSON.stringify(callSummary)}\n`;
      
      fs.appendFileSync(logFile, logEntry);
      console.log(`📝 Conversation logged to ${logFile}`);
      
    } catch (error) {
      console.error('Error logging conversation:', error);
    }
  }
}

module.exports = TwilioConversationalIntegration; 