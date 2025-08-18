const { getCallRecordings, getRecordingById, getRecordingTranscription } = require('../utils/callRecordings');

async function main() {
  try {
    // Example 1: Get all recordings (paginated)
    const allRecordings = await getCallRecordings({
      pageSize: 10,
      page: 1,
      filters: {
        'filter[created_at][gte]': '2024-01-01T00:00:00Z'
      }
    });
    console.log('All Recordings:', JSON.stringify(allRecordings, null, 2));

    // Example 2: Get a specific recording by ID
    const recordingId = '38a5a7c2-3676-414a-998e-8ab9a3b1e8a8'; // Use one of your recording IDs
    const singleRecording = await getRecordingById(recordingId);
    console.log('Single Recording Details:', JSON.stringify(singleRecording, null, 2));

    // Example 3: Get recording with transcription
    console.log('\nFetching recording transcription...');
    const recordingWithTranscription = await getRecordingTranscription(recordingId);
    console.log('Recording Transcription:', JSON.stringify(recordingWithTranscription, null, 2));

  } catch (error) {
    console.error('Error in main:', error.message);
  }
}

main(); 