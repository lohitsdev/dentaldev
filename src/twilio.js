const twilio = require('twilio');
const { textToSpeech, saveAudioFile } = require('./tts');
const path = require('path');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!accountSid || !authToken || !twilioPhoneNumber) {
  throw new Error('Missing required Twilio configuration');
}

const client = twilio(accountSid, authToken);

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

    const messageObj = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: to
    });
    console.log(`📱 SMS sent to ${to}: ${messageObj.sid}`);
    return messageObj;
  } catch (error) {
    console.error('❌ SMS Error:', error.message);
    
    // Handle specific Twilio errors
    if (error.code === 20003) {
      console.error('🔐 Twilio authentication failed - check your ACCOUNT_SID and AUTH_TOKEN');
    } else if (error.code === 21612 || error.code === 21614) {
      console.error('📵 SMS not supported for this number:', to);
    } else if (error.code === 21408) {
      console.error('🚫 Permission denied for SMS to:', to);
    }
    
    // Don't throw error - continue without SMS
    return { status: 'failed', error: error.message };
  }
}

/**
 * Make outbound call
 * @param {string} to - Recipient phone number
 * @param {string} twimlUrl - TwiML URL for call flow
 * @returns {Promise<Object>} Call object
 */
async function makeCall(to, twimlUrl) {
  try {
    const call = await client.calls.create({
      url: twimlUrl,
      to: to,
      from: twilioPhoneNumber
    });
    console.log(`Call initiated to ${to}: ${call.sid}`);
    return call;
  } catch (error) {
    console.error('Error making call:', error);
    throw error;
  }
}

/**
 * Generate TwiML to join a specific conference
 * @param {string} conferenceName - Conference name to join
 * @param {Object} options - Conference options
 * @returns {string} TwiML XML
 */
function generateConferenceTwiML(conferenceName, options = {}) {
  const VoiceResponse = require('twilio').twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  
  // Announcement for the participant
  if (options.announcement) {
    twiml.say({
      voice: 'alice'
    }, options.announcement);
  }
  
  // Join the conference
  const dial = twiml.dial({
    timeout: options.timeout || 30,
    record: options.record || false,
    recordingStatusCallback: options.recordingCallback
  });
  
  // Use Twilio's default hold music (no custom waitUrl)
  dial.conference({
    startConferenceOnEnter: options.startConferenceOnEnter !== false, // Default true
    endConferenceOnExit: options.endConferenceOnExit || false,
    statusCallback: '/webhook/conference-status',
    statusCallbackEvent: ['start', 'end', 'join', 'leave'],
    record: options.recordConference || 'record-from-start'
    // Removed waitUrl - will use Twilio's default classical music
  }, conferenceName);
  
  return twiml.toString();
}

/**
 * Generate TwiML for voice response using ElevenLabs TTS with Twilio fallback
 * @param {string} message - Message to speak
 * @param {Object} options - Additional TwiML options
 * @param {Object} ttsOptions - ElevenLabs TTS options
 * @returns {Promise<string>} TwiML XML
 */
async function generateTwiML(message, options = {}, ttsOptions = {}) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  
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
        const gather = twiml.gather({
          input: 'speech dtmf',
          timeout: 10,
          action: options.action || '/webhook/call'
        });
        gather.play(audioUrl);
      } else {
        twiml.play(audioUrl);
        if (options.action && !options.hangup) {
          twiml.redirect(options.action);
        }
      }
      
      console.log(`Generated ElevenLabs TTS audio: ${audioUrl}`);
      
    } else {
      throw new Error('ElevenLabs unavailable - using Twilio voice');
    }
    
  } catch (error) {
    // Fall back to Twilio's built-in voice
    console.log('🎵 Using Twilio built-in voice as fallback');
    
    if (options.gather) {
      const gather = twiml.gather({
        input: 'speech dtmf',
        timeout: 10,
        action: options.action || '/webhook/call'
      });
      gather.say({
        voice: 'alice'
      }, cleanMessage);
    } else {
      twiml.say({
        voice: 'alice'
      }, cleanMessage);
      if (options.action && !options.hangup) {
        twiml.redirect(options.action);
      }
    }
    
    console.log('✅ Generated Twilio fallback voice TwiML');
  }
  
  if (options.hangup) {
    twiml.hangup();
  }
  
  const twimlString = twiml.toString();
  console.log(`Generated TwiML response (${twimlString.length} chars)`);
  return twimlString;
}

/**
 * Generate TwiML for voice response (synchronous version for backward compatibility)
 * @param {string} message - Message to speak
 * @param {Object} options - Additional TwiML options
 * @returns {string} TwiML XML (using Twilio default voice)
 */
function generateSimpleTwiML(message, options = {}) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  
  if (options.gather) {
    const gather = twiml.gather({
      input: 'speech dtmf',
      timeout: 10,
      action: options.action || '/webhook/call'
    });
    gather.say(message);
  } else {
    twiml.say(message);
    // Add redirect after saying message if action is specified
    if (options.action && !options.hangup) {
      twiml.redirect(options.action);
    }
  }
  
  if (options.hangup) {
    twiml.hangup();
  }
  
  return twiml.toString();
}

/**
 * Get call details
 * @param {string} callSid - Call SID
 * @returns {Promise<Object>} Call details
 */
async function getCallDetails(callSid) {
  try {
    const call = await client.calls(callSid).fetch();
    return call;
  } catch (error) {
    console.error('Error fetching call details:', error);
    throw error;
  }
}

module.exports = {
  client,
  sendSMS,
  makeCall,
  generateConferenceTwiML,
  generateTwiML,
  generateSimpleTwiML,
  getCallDetails
}; 