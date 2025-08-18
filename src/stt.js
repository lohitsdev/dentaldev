const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

/**
 * Transcribe audio using OpenAI Whisper
 * @param {Buffer|string} audioData - Audio buffer or file path
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeWithWhisper(audioData, options = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const formData = new FormData();
    
    if (Buffer.isBuffer(audioData)) {
      formData.append('file', audioData, 'audio.mp3');
    } else if (typeof audioData === 'string') {
      formData.append('file', fs.createReadStream(audioData));
    } else {
      throw new Error('Invalid audio data format');
    }

    formData.append('model', options.model || 'whisper-1');
    formData.append('language', options.language || 'en');
    formData.append('response_format', options.responseFormat || 'json');
    
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders()
        }
      }
    );

    console.log('Whisper transcription completed');
    return {
      provider: 'whisper',
      text: response.data.text,
      confidence: 1.0, // Whisper doesn't provide confidence scores
      language: options.language || 'en'
    };
  } catch (error) {
    console.error('Error with Whisper transcription:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Transcribe audio using Deepgram
 * @param {Buffer|string} audioData - Audio buffer or file path
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeWithDeepgram(audioData, options = {}) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('Deepgram API key not configured');
  }

  try {
    let requestData;
    let headers = {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': 'audio/mp3'
    };

    if (Buffer.isBuffer(audioData)) {
      requestData = audioData;
    } else if (typeof audioData === 'string') {
      requestData = fs.readFileSync(audioData);
    } else {
      throw new Error('Invalid audio data format');
    }

    const params = new URLSearchParams({
      model: options.model || 'nova-2',
      language: options.language || 'en-US',
      smart_format: 'true',
      punctuate: 'true',
      diarize: options.diarize || 'false'
    });

    const response = await axios.post(
      `https://api.deepgram.com/v1/listen?${params}`,
      requestData,
      { headers }
    );

    const transcript = response.data.results.channels[0].alternatives[0];
    
    console.log('Deepgram transcription completed');
    return {
      provider: 'deepgram',
      text: transcript.transcript,
      confidence: transcript.confidence,
      language: options.language || 'en-US',
      words: transcript.words || []
    };
  } catch (error) {
    console.error('Error with Deepgram transcription:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Transcribe audio with fallback providers
 * @param {Buffer|string} audioData - Audio buffer or file path
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} Transcription result
 */
async function transcribe(audioData, options = {}) {
  const preferredProvider = options.provider || 'deepgram';
  
  try {
    if (preferredProvider === 'whisper' && OPENAI_API_KEY) {
      return await transcribeWithWhisper(audioData, options);
    } else if (preferredProvider === 'deepgram' && DEEPGRAM_API_KEY) {
      return await transcribeWithDeepgram(audioData, options);
    } else {
      // Fallback logic
      if (DEEPGRAM_API_KEY) {
        return await transcribeWithDeepgram(audioData, options);
      } else if (OPENAI_API_KEY) {
        return await transcribeWithWhisper(audioData, options);
      } else {
        throw new Error('No STT provider configured');
      }
    }
  } catch (error) {
    console.error(`Error with ${preferredProvider}, trying fallback...`);
    
    // Try fallback provider
    try {
      if (preferredProvider === 'whisper' && DEEPGRAM_API_KEY) {
        return await transcribeWithDeepgram(audioData, options);
      } else if (preferredProvider === 'deepgram' && OPENAI_API_KEY) {
        return await transcribeWithWhisper(audioData, options);
      }
    } catch (fallbackError) {
      console.error('Fallback transcription also failed:', fallbackError);
    }
    
    throw error;
  }
}

/**
 * Transcribe medical audio with enhanced prompts
 * @param {Buffer|string} audioData - Audio buffer or file path
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} Transcription result
 */
async function transcribeMedical(audioData, options = {}) {
  const medicalPrompt = "This is a medical call. Pay attention to symptoms, medications, emergency keywords, and medical terminology.";
  
  return await transcribe(audioData, {
    ...options,
    prompt: medicalPrompt,
    language: options.language || 'en',
    model: options.model || 'nova-2' // Deepgram's medical model
  });
}

/**
 * Real-time transcription setup (for live calls)
 * @param {string} websocketUrl - WebSocket URL for real-time audio
 * @param {Function} onTranscript - Callback for transcript chunks
 * @param {Object} options - Transcription options
 * @returns {WebSocket} WebSocket connection
 */
function setupRealtimeTranscription(websocketUrl, onTranscript, options = {}) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('Deepgram API key required for real-time transcription');
  }

  const WebSocket = require('ws');
  const params = new URLSearchParams({
    encoding: 'linear16',
    sample_rate: '8000',
    channels: '1',
    model: options.model || 'nova-2',
    language: options.language || 'en-US',
    smart_format: 'true',
    interim_results: 'true'
  });

  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`
    }
  });

  ws.on('message', (data) => {
    try {
      const response = JSON.parse(data);
      if (response.channel && response.channel.alternatives) {
        const transcript = response.channel.alternatives[0];
        onTranscript({
          text: transcript.transcript,
          isFinal: response.is_final,
          confidence: transcript.confidence
        });
      }
    } catch (error) {
      console.error('Error parsing real-time transcript:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  return ws;
}

module.exports = {
  transcribe,
  transcribeWithWhisper,
  transcribeWithDeepgram,
  transcribeMedical,
  setupRealtimeTranscription
}; 