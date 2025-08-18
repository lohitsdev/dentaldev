const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default voice
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';
const SPEED_MODE = process.env.TTS_SPEED_MODE === 'true';
const CACHE_ENABLED = process.env.TTS_CACHE_ENABLED === 'true';

// Simple in-memory cache for common responses
const audioCache = new Map();

if (!ELEVENLABS_API_KEY) {
  console.warn('Warning: ELEVENLABS_API_KEY not set. TTS functionality will be limited.');
}

/**
 * Convert text to speech using ElevenLabs with speed optimization and retry logic
 * @param {string} text - Text to convert to speech
 * @param {Object} options - TTS options
 * @returns {Promise<Buffer>} Audio buffer
 */
async function fastTextToSpeech(text, options = {}) {
  // Check cache first
  if (CACHE_ENABLED) {
    const cacheKey = `${text}_${JSON.stringify(options)}`;
    if (audioCache.has(cacheKey)) {
      console.log('Using cached TTS audio');
      return audioCache.get(cacheKey);
    }
  }

  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  const maxRetries = 2;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const voiceId = options.voiceId || ELEVENLABS_VOICE_ID;
      
      // Speed-optimized settings
      const speedSettings = {
        stability: 0.4, // Lower for faster generation
        similarity_boost: 0.6, // Lower for faster generation
        style: 0.0, // Minimal style for speed
        use_speaker_boost: false // Disable for speed
      };

      console.log(`Attempting ElevenLabs TTS (attempt ${attempt}/${maxRetries})`);

      const response = await axios.post(
        `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
        {
          text: text,
          model_id: 'eleven_turbo_v2', // Fastest model
          voice_settings: speedSettings
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY
          },
          responseType: 'arraybuffer',
          timeout: 8000 // Increased from 3000ms to 8000ms for better reliability
        }
      );

      const audioBuffer = Buffer.from(response.data);
      
      // Cache the result
      if (CACHE_ENABLED) {
        const cacheKey = `${text}_${JSON.stringify(options)}`;
        audioCache.set(cacheKey, audioBuffer);
        
        // Limit cache size to prevent memory issues
        if (audioCache.size > 50) {
          const firstKey = audioCache.keys().next().value;
          audioCache.delete(firstKey);
        }
      }

      console.log(`✅ Fast TTS generated successfully on attempt ${attempt} for text: "${text.substring(0, 50)}..."`);
      return audioBuffer;

    } catch (error) {
      lastError = error;
      console.error(`❌ Fast TTS attempt ${attempt} failed:`, error.code || error.message);
      
      if (attempt < maxRetries) {
        console.log(`🔄 Retrying in ${attempt * 500}ms...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }

  console.error('❌ All ElevenLabs TTS attempts failed:', lastError.response?.data || lastError.message);
  throw lastError;
}

/**
 * Main text-to-speech function with ElevenLabs and Twilio fallback
 * @param {string} text - Text to convert to speech
 * @param {Object} options - TTS options
 * @returns {Promise<Buffer>} Audio buffer
 */
async function textToSpeech(text, options = {}) {
  try {
    // First try ElevenLabs
    console.log('🎵 Attempting ElevenLabs TTS...');
    return await fastTextToSpeech(text, options);
    
  } catch (error) {
    console.error('❌ ElevenLabs TTS failed:', error.message);
    
    // Check if it's an account issue
    if (error.code === 'ERR_BAD_REQUEST' || error.response?.status === 401) {
      console.log('🚨 ElevenLabs account issue detected - falling back to Twilio voice');
      
      // Return null to trigger Twilio fallback in generateTwiML
      return null;
    }
    
    // For other errors, try the fallback method
    console.log('🔄 Trying ElevenLabs fallback...');
    return await fallbackTextToSpeech(text, options);
  }
}

/**
 * Save audio buffer to file
 * @param {Buffer} audioBuffer - Audio data
 * @param {string} filename - Output filename
 * @returns {Promise<string>} File path
 */
async function saveAudioFile(audioBuffer, filename) {
  try {
    const audioDir = path.join(__dirname, '..', 'audio');
    
    // Create audio directory if it doesn't exist
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const filePath = path.join(audioDir, filename);
    fs.writeFileSync(filePath, audioBuffer);
    
    console.log(`Audio saved to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Error saving audio file:', error);
    throw error;
  }
}

/**
 * Get available voices from ElevenLabs
 * @returns {Promise<Array>} List of available voices
 */
async function getVoices() {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  try {
    const response = await axios.get(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    return response.data.voices;
  } catch (error) {
    console.error('Error fetching voices:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Generate emergency message audio
 * @param {string} message - Emergency message
 * @param {string} patientInfo - Patient information
 * @returns {Promise<Buffer>} Audio buffer
 */
async function generateEmergencyAudio(message, patientInfo = '') {
  const emergencyText = `URGENT MEDICAL ALERT. ${message}. ${patientInfo}. Please respond immediately.`;
  
  return await textToSpeech(emergencyText, {
    stability: 0.8,
    similarityBoost: 0.9,
    style: 0.3, // More expressive for urgency
    useSpeakerBoost: true
  });
}

/**
 * Generate intake message audio
 * @param {string} message - Intake message
 * @returns {Promise<Buffer>} Audio buffer
 */
async function generateIntakeAudio(message) {
  const intakeText = `Thank you for contacting our practice. ${message}. We will get back to you shortly.`;
  
  return await textToSpeech(intakeText, {
    stability: 0.6,
    similarityBoost: 0.8,
    style: 0.1, // More neutral tone
    useSpeakerBoost: true
  });
}

/**
 * Clean up old audio files
 * @param {number} maxAge - Maximum age in milliseconds
 */
function cleanupAudioFiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
  try {
    const audioDir = path.join(__dirname, '..', 'audio');
    
    if (!fs.existsSync(audioDir)) {
      return;
    }

    const files = fs.readdirSync(audioDir);
    const now = Date.now();

    files.forEach(file => {
      const filePath = path.join(audioDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up old audio file: ${file}`);
      }
    });
  } catch (error) {
    console.error('Error cleaning up audio files:', error);
  }
}

module.exports = {
  textToSpeech,
  saveAudioFile,
  getVoices,
  generateEmergencyAudio,
  generateIntakeAudio,
  cleanupAudioFiles
}; 