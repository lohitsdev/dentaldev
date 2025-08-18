const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * ElevenLabs Conversational AI Integration
 * Provides real-time conversational AI for natural patient interactions
 */
class ConversationalAI {
  constructor(options = {}) {
    this.apiKey = ELEVENLABS_API_KEY;
    this.agentId = options.agentId || process.env.ELEVENLABS_AGENT_ID;
    this.voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID;
    this.ws = null;
    this.conversationId = null;
    this.isConnected = false;
  }

  /**
   * Get available voices from ElevenLabs
   * @returns {Promise<Array>} List of available voices
   */
  async getVoices() {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const response = await axios.get(`${ELEVENLABS_API_URL}/voices`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      return response.data.voices;
    } catch (error) {
      console.error('Error fetching voices:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a conversational agent for dental receptionist
   * @param {Object} agentConfig - Agent configuration
   * @returns {Promise<Object>} Agent details
   */
  async createDentalReceptionistAgent(agentConfig = {}) {
    try {
      const defaultConfig = {
        name: "Dental Receptionist AI",
        voice_id: this.voiceId,
        prompt: `You are a professional dental receptionist AI for ${process.env.PRACTICE_NAME || 'a dental practice'}. 

Your responsibilities:
1. Greet patients warmly and professionally based on time of day
2. Assess the urgency of their dental concerns
3. Collect patient information for appointments
4. Identify dental emergencies and escalate immediately
5. Provide helpful information about the practice

EMERGENCY INDICATORS (Escalate immediately):
- Severe/excruciating tooth pain (8-10 on pain scale)
- Dental trauma (knocked out tooth, broken tooth)
- Facial swelling affecting breathing/swallowing  
- Heavy bleeding that won't stop
- Signs of infection (fever, pus, abscess)
- Post-surgical complications

Communication Style:
- Warm, empathetic, and professional
- Ask clarifying questions when needed
- Respond to greetings naturally (good morning, hello, etc.)
- Show concern for patient comfort
- Be efficient but thorough

If you detect an emergency, say: "I understand this is urgent. I'm going to connect you with our emergency doctor right away. Please stay on the line."

For non-emergencies, collect: patient name, phone number, preferred appointment time, and brief description of their concern.

Always maintain HIPAA compliance and patient confidentiality.`,
        
        conversation_config: {
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 800
          },
          agent_output_audio_format: "pcm_16000",
          user_input_audio_format: "pcm_16000"
        },
        
        language: "en",
        
        response_engine: {
          type: "conversational_ai",
          config: {
            model: "eleven_turbo_v2_5",
            temperature: 0.7,
            max_tokens: 200,
            stability: 0.6,
            similarity_boost: 0.8,
            style: 0.2
          }
        }
      };

      const config = { ...defaultConfig, ...agentConfig };

      const response = await axios.post(
        `${ELEVENLABS_API_URL}/convai/agents`,
        config,
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      this.agentId = response.data.agent_id;
      console.log(`✅ Created conversational agent: ${this.agentId}`);
      return response.data;

    } catch (error) {
      console.error('Error creating conversational agent:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Start a new conversation session
   * @param {Object} sessionConfig - Session configuration
   * @returns {Promise<Object>} Session details
   */
  async startConversation(sessionConfig = {}) {
    try {
      if (!this.agentId) {
        throw new Error('Agent ID not set. Create an agent first.');
      }

      const config = {
        agent_id: this.agentId,
        requires_auth: false,
        ...sessionConfig
      };

      const response = await axios.post(
        `${ELEVENLABS_API_URL}/convai/conversations`,
        config,
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      this.conversationId = response.data.conversation_id;
      console.log(`🗣️ Started conversation: ${this.conversationId}`);
      return response.data;

    } catch (error) {
      console.error('Error starting conversation:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Connect to real-time conversation WebSocket
   * @param {Function} onMessage - Callback for incoming messages
   * @param {Function} onAudioChunk - Callback for audio chunks
   * @returns {Promise<WebSocket>} WebSocket connection
   */
  async connectWebSocket(onMessage, onAudioChunk) {
    try {
      if (!this.conversationId) {
        throw new Error('Conversation ID not set. Start a conversation first.');
      }

      const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?conversation_id=${this.conversationId}`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      this.ws.on('open', () => {
        console.log('🔗 Connected to ElevenLabs Conversational AI WebSocket');
        this.isConnected = true;
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          switch (message.type) {
            case 'conversation_initiation_metadata':
              console.log('📞 Conversation initiated');
              onMessage({ type: 'conversation_started', data: message });
              break;
              
            case 'audio':
              // Audio chunk from the AI
              if (onAudioChunk) {
                onAudioChunk(Buffer.from(message.audio_event.audio_base_64, 'base64'));
              }
              break;
              
            case 'user_transcript':
              console.log(`👤 User said: ${message.user_transcript.text}`);
              onMessage({ type: 'user_transcript', data: message.user_transcript });
              break;
              
            case 'agent_response':
              console.log(`🤖 AI responded: ${message.agent_response.text}`);
              onMessage({ type: 'agent_response', data: message.agent_response });
              break;
              
            case 'conversation_end':
              console.log('📞 Conversation ended');
              onMessage({ type: 'conversation_end', data: message });
              this.isConnected = false;
              break;
              
            default:
              onMessage({ type: 'unknown', data: message });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
      });

      this.ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
        this.isConnected = false;
      });

      return this.ws;

    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      throw error;
    }
  }

  /**
   * Send audio data to the conversation
   * @param {Buffer} audioBuffer - Audio data (PCM 16kHz)
   */
  sendAudio(audioBuffer) {
    if (this.ws && this.isConnected) {
      const message = {
        user_audio_chunk: {
          chunk: audioBuffer.toString('base64')
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send text message to the conversation
   * @param {string} text - Text message
   */
  sendText(text) {
    if (this.ws && this.isConnected) {
      const message = {
        user_message: {
          text: text
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * End the current conversation
   */
  async endConversation() {
    try {
      if (this.ws) {
        this.ws.close();
      }

      if (this.conversationId) {
        await axios.delete(
          `${ELEVENLABS_API_URL}/convai/conversations/${this.conversationId}`,
          {
            headers: {
              'xi-api-key': this.apiKey
            }
          }
        );
        console.log('🔚 Conversation ended');
      }
    } catch (error) {
      console.error('Error ending conversation:', error);
    }
  }

  /**
   * Get conversation history
   * @returns {Promise<Array>} Conversation messages
   */
  async getConversationHistory() {
    try {
      if (!this.conversationId) {
        return [];
      }

      const response = await axios.get(
        `${ELEVENLABS_API_URL}/convai/conversations/${this.conversationId}`,
        {
          headers: {
            'xi-api-key': this.apiKey
          }
        }
      );

      return response.data.messages || [];
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  /**
   * Analyze conversation for emergency indicators
   * @param {Array} messages - Conversation messages
   * @returns {Object} Analysis result
   */
  analyzeConversationForEmergency(messages) {
    const emergencyKeywords = [
      'emergency', 'urgent', 'severe pain', 'excruciating', 'knocked out tooth',
      'broken tooth', 'heavy bleeding', 'face swollen', 'can\'t breathe',
      'fever', 'infection', 'abscess', 'dry socket'
    ];

    let emergencyScore = 0;
    let detectedKeywords = [];

    messages.forEach(message => {
      if (message.role === 'user') {
        const text = message.text.toLowerCase();
        emergencyKeywords.forEach(keyword => {
          if (text.includes(keyword)) {
            emergencyScore += 10;
            detectedKeywords.push(keyword);
          }
        });
      }
    });

    return {
      isEmergency: emergencyScore >= 30,
      confidence: Math.min(100, emergencyScore),
      keywords: [...new Set(detectedKeywords)],
      recommendation: emergencyScore >= 30 ? 'immediate_escalation' : 'standard_intake'
    };
  }
}

module.exports = ConversationalAI; 