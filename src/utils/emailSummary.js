const NodemailerComponent = require('../utils/nodemailerComponent');
const { getRecordingTranscription } = require('./callRecordings');
require('dotenv').config();

const mailer = new NodemailerComponent();

/**
 * Generate a summary of the call using OpenAI
 * @param {Object} transcriptionData - The transcription data
 * @returns {Promise<string>} - The generated summary
 */
async function generateCallSummary(transcriptionData) {
  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that creates concise summaries of phone call transcripts. Focus on key points, action items, and important details."
          },
          {
            role: "user",
            content: `Please provide a concise summary of this call transcript: ${transcriptionData.full_text}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating summary:', error.message);
    return 'Error generating summary. Please review the full transcript.';
  }
}

/**
 * Format the email HTML content
 * @param {Object} data - Call and transcription data
 * @param {string} summary - Generated summary
 * @returns {string} - Formatted HTML content
 */
function formatEmailContent(data, summary) {
  const duration = data.duration ? `${Math.round(data.duration / 60)} minutes ${data.duration % 60} seconds` : 'N/A';
  
  return `
    <h2>Call Summary Report</h2>
    <div style="margin-bottom: 20px;">
      <p><strong>Call Duration:</strong> ${duration}</p>
      <p><strong>From:</strong> ${data.from || 'Unknown'}</p>
      <p><strong>To:</strong> ${data.to || 'Unknown'}</p>
      <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
    </div>

    <div style="margin-bottom: 20px;">
      <h3>AI-Generated Summary</h3>
      <p style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
        ${summary}
      </p>
    </div>

    <div>
      <h3>Full Transcript</h3>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
        ${data.transcription.segments.map(segment => 
          `<p><strong>[${new Date(segment.start * 1000).toISOString().substr(11, 8)}]</strong> ${segment.text}</p>`
        ).join('')}
      </div>
    </div>
  `;
}

/**
 * Send email summary of the call
 * @param {string} recordingId - The recording ID
 * @returns {Promise<void>}
 */
async function sendCallSummaryEmail(recordingId) {
  try {
    // Get recording transcription
    const recordingData = await getRecordingTranscription(recordingId);
    
    // Generate summary using OpenAI
    const summary = await generateCallSummary(recordingData.transcription);

    // Prepare email content
    const htmlContent = formatEmailContent(recordingData, summary);

    // Send email
    await mailer.sendMail(
      process.env.ADMIN_EMAIL,
      `Call Summary - ${new Date(recordingData.timestamp).toLocaleString()}`,
      htmlContent.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      htmlContent
    );
    console.log(`Call summary email sent successfully from ${process.env.GMAIL_USER} to ${process.env.ADMIN_EMAIL}`);
    
  } catch (error) {
    console.error('Error sending call summary email:', error.message);
    throw error;
  }
}

module.exports = {
  sendCallSummaryEmail
};
