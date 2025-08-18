const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Get all call recordings with pagination
 * @param {Object} options - Query parameters for filtering recordings
 * @returns {Promise<Object>} - List of call recordings
 */
async function getCallRecordings(options = {}) {
  try {
    const response = await axios.get('https://api.telnyx.com/v1/recordings', {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Accept': 'application/json'
      },
      params: {
        'page[size]': options.pageSize || 20,
        'page[number]': options.page || 1,
        ...options.filters
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching call recordings:', error.message);
    throw error;
  }
}

/**
 * Format recording details for display
 * @param {Object} recording - The recording object from Telnyx API
 * @returns {Object} - Formatted recording details
 */
function formatRecordingDetails(recording) {
  return {
    id: recording.id,
    url: recording.download_urls?.wav || 'Not available',
    duration: recording.call?.duration || 0,
    format: 'wav',
    channels: 'single',
    status: recording.record_type,
    timestamp: new Date(recording.created_at).toLocaleString(),
    from: recording.call?.from,
    to: recording.call?.to,
    sessionId: recording.call?.telnyx_session_uuid
  };
}

/**
 * Get formatted recording details by ID
 * @param {string} recordingId - The ID of the recording to fetch
 * @returns {Promise<Object>} - Formatted recording details
 */
async function getRecordingById(recordingId) {
  try {
    const response = await axios.get(`https://api.telnyx.com/v1/recordings/${recordingId}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    return formatRecordingDetails(response.data.data);
  } catch (error) {
    console.error(`Error fetching recording ${recordingId}:`, error.message);
    throw error;
  }
}

/**
 * Download recording WAV file
 * @param {string} url - The WAV file URL
 * @param {string} outputPath - Where to save the file
 * @returns {Promise<string>} - Path to downloaded file
 */
async function downloadRecording(url, outputPath) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`
      }
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading recording:', error.message);
    throw error;
  }
}

/**
 * Convert audio to text using OpenAI's Whisper model
 * @param {string} audioFilePath - Path to audio file
 * @returns {Promise<Object>} - Transcription result with text and additional details
 */
async function convertAudioToText(audioFilePath) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'en');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', 
      formData,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders()
        }
      }
    );

    return {
      text: response.data.text,
      segments: response.data.segments.map(segment => ({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        confidence: segment.confidence
      })),
      language: response.data.language
    };
  } catch (error) {
    console.error('Error converting audio to text:', error.message);
    throw error;
  }
}

/**
 * Get recording transcription
 * @param {string} recordingId - The recording ID
 * @returns {Promise<Object>} - Recording details with transcription
 */
async function getRecordingTranscription(recordingId) {
  try {
    // First get the recording details
    const recording = await getRecordingById(recordingId);
    
    if (!recording.url || recording.url === 'Not available') {
      throw new Error('Recording URL not available');
    }

    // Create downloads directory if it doesn't exist
    const downloadDir = path.join(__dirname, '../../downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // Download the WAV file
    const outputPath = path.join(downloadDir, `${recordingId}.wav`);
    await downloadRecording(recording.url, outputPath);

    // Convert to text using OpenAI
    const transcriptionResult = await convertAudioToText(outputPath);

    // Clean up the downloaded file
    fs.unlinkSync(outputPath);

    return {
      ...recording,
      transcription: {
        full_text: transcriptionResult.text,
        segments: transcriptionResult.segments,
        detected_language: transcriptionResult.language
      }
    };
  } catch (error) {
    console.error(`Error getting recording transcription:`, error.message);
    throw error;
  }
}

module.exports = {
  getCallRecordings,
  getRecordingById,
  formatRecordingDetails,
  getRecordingTranscription
}; 