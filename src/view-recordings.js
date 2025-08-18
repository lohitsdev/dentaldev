require('dotenv').config();
const { getRecordingSummaries } = require('./telnyx');

async function viewRecordings(options = {}) {
  try {
    console.log('📞 Fetching recordings from Telnyx...');
    const summaries = await getRecordingSummaries(options);
    
    console.log('\n📊 Recording Summary Report');
    console.log('=========================');
    console.log(`Date: ${summaries.date}`);
    console.log(`Total Calls: ${summaries.totalCalls}`);
    console.log('-------------------------\n');
    
    Object.values(summaries.recordings).forEach(call => {
      console.log(`Call ID: ${call.id}`);
      console.log(`Total Duration: ${call.totalDuration} seconds`);
      console.log(`Start Time: ${new Date(call.startTime).toLocaleString()}`);
      console.log(`End Time: ${new Date(call.endTime).toLocaleString()}`);
      
      console.log('\nRecordings:');
      call.recordings.forEach((recording, index) => {
        console.log(`\n  ${index + 1}. Recording Details:`);
        console.log(`     ID: ${recording.recordingId}`);
        console.log(`     URL: ${recording.url || 'Processing...'}`);
        console.log(`     Duration: ${recording.duration} seconds`);
        console.log(`     Format: ${recording.format}`);
        console.log(`     Channels: ${recording.channels}`);
        console.log(`     Status: ${recording.status}`);
        console.log(`     Timestamp: ${new Date(recording.timestamp).toLocaleString()}`);
      });
      
      console.log('\n-------------------------\n');
    });
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Authentication failed - please check your Telnyx API key');
    } else if (error.response?.status === 404) {
      console.error('❌ No recordings found for the specified criteria');
    } else {
      console.error('❌ Error viewing recordings:', error.response?.data || error.message);
    }
  }
}

// If running directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg.startsWith('--date=')) {
      options.date = arg.split('=')[1];
    } else if (arg.startsWith('--call=')) {
      options.callId = arg.split('=')[1];
    }
  });
  
  // If no date specified, use today
  if (!options.date && !options.callId) {
    options.date = new Date().toISOString().split('T')[0];
  }
  
  viewRecordings(options);
} 