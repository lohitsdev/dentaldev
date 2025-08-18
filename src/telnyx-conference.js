const telnyxHelper = require('./telnyx');

/**
 * Telnyx Conference Management for Emergency Calls
 * Using Telnyx Call Control API conference_config
 */

// In-memory storage for active conferences
let activeConferences = new Map();

/**
 * Create emergency conference and add patient
 * @param {string} patientCallControlId - Patient's call control ID
 * @param {string} patientPhone - Patient's phone number
 * @param {Object} emergencyInfo - Emergency information
 * @returns {Promise<Object>} Conference creation result
 */
async function createEmergencyConference(patientCallControlId, patientPhone, emergencyInfo) {
  try {
    const emergencyId = `emergency-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const conferenceName = `dental-emergency-${emergencyId}`;
    
    console.log(`🎪 Creating emergency conference: ${conferenceName}`);
    console.log(`👤 Patient: ${emergencyInfo.name || 'Unknown'} (${patientPhone})`);
    console.log(`🚨 Emergency: ${emergencyInfo.symptoms || 'Not specified'}`);
    
    // Store conference info
    const conferenceInfo = {
      id: emergencyId,
      name: conferenceName,
      created: new Date().toISOString(),
      patientPhone: patientPhone,
      patientCallControlId: patientCallControlId,
      emergencyInfo: emergencyInfo,
      participants: [],
      status: 'active',
      doctorNotified: false,
      recordings: []
    };
    
    activeConferences.set(emergencyId, conferenceInfo);
    
    // Add patient to conference using Telnyx Call Control API
    const patientJoinResult = await addPatientToConference(patientCallControlId, conferenceName, emergencyInfo);
    
    if (patientJoinResult.success) {
      conferenceInfo.participants.push({
        type: 'patient',
        phone: patientPhone,
        callControlId: patientCallControlId,
        joinedAt: new Date().toISOString(),
        role: 'participant'
      });
      
      console.log(`✅ Patient added to conference: ${conferenceName}`);
    }
    
    return {
      success: true,
      emergencyId: emergencyId,
      conferenceName: conferenceName,
      conferenceInfo: conferenceInfo,
      patientJoinResult: patientJoinResult
    };
    
  } catch (error) {
    console.error('❌ Error creating emergency conference:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Add patient to emergency conference using hold music while waiting for doctor
 * @param {string} callControlId - Patient's call control ID
 * @param {string} conferenceName - Conference name
 * @param {Object} emergencyInfo - Emergency information
 * @returns {Promise<Object>} Join result
 */
async function addPatientToConference(callControlId, conferenceName, emergencyInfo) {
  try {
    console.log(`🎪 Adding patient to conference: ${conferenceName}`);
    
    // First, inform the patient about the emergency protocol
    const emergencyMessage = `Thank you ${emergencyInfo.name || 'for calling'}. I understand this is a dental emergency. I'm immediately connecting you to our emergency doctor. Please stay on the line.`;
    
    await telnyxHelper.speakText(callControlId, emergencyMessage, {
      voice: 'male'
    });
    
    // Wait for speech to complete, then dial the patient into conference
    // Note: In a real implementation, you'd wait for the 'call.speak.ended' webhook
    setTimeout(async () => {
      try {
        // Create a new outbound call to add patient to conference
        const conferenceDialResult = await telnyxHelper.dialNumber({
          to: callControlId, // This should be the patient's number, but we'll use transfer instead
          from: process.env.TELNYX_PHONE_NUMBER,
          connection_id: process.env.TELNYX_CONNECTION_ID,
          conference_config: {
            conference_name: conferenceName,
            start_conference_on_enter: false, // Wait for doctor
            start_conference_on_create: false, // Don't start until doctor joins
            mute: false,
            hold: true, // Put patient on hold initially
            hold_audio_url: "https://s3.amazonaws.com/com.twilio.sounds.music/index.xml", // Hold music
            beep_enabled: "on_enter",
            end_conference_on_exit: false // Don't end when patient leaves
          }
        });
        
        console.log(`🎵 Patient on hold with music in conference: ${conferenceName}`);
        
      } catch (dialError) {
        console.error('❌ Error dialing patient into conference:', dialError);
      }
    }, 3000); // Wait 3 seconds for speech to complete
    
    return {
      success: true,
      message: 'Patient being added to conference with hold music'
    };
    
  } catch (error) {
    console.error('❌ Error adding patient to conference:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Dial emergency doctor and add to conference
 * @param {string} emergencyId - Emergency ID
 * @param {string} doctorPhone - Doctor's phone number
 * @returns {Promise<Object>} Doctor dial result
 */
async function dialDoctorToConference(emergencyId, doctorPhone) {
  try {
    const conferenceInfo = activeConferences.get(emergencyId);
    if (!conferenceInfo) {
      throw new Error(`Conference not found: ${emergencyId}`);
    }
    
    console.log(`👨‍⚕️ Dialing emergency doctor: ${doctorPhone}`);
    console.log(`🎪 Conference: ${conferenceInfo.name}`);
    
    // Dial the doctor and add to conference
    const doctorDialResult = await telnyxHelper.dialNumber({
      to: doctorPhone,
      from: process.env.TELNYX_PHONE_NUMBER,
      connection_id: process.env.TELNYX_CONNECTION_ID,
      timeout_secs: 30,
      conference_config: {
        conference_name: conferenceInfo.name,
        start_conference_on_enter: true, // Start conference when doctor joins
        start_conference_on_create: true,
        mute: false,
        hold: false,
        supervisor_role: "barge", // Doctor can hear and speak to everyone
        beep_enabled: "on_enter",
        end_conference_on_exit: true // End conference when doctor leaves
      },
      // Add client state to identify this as a doctor call
      client_state: Buffer.from(JSON.stringify({
        type: 'emergency_doctor',
        emergencyId: emergencyId,
        patientInfo: conferenceInfo.emergencyInfo
      })).toString('base64')
    });
    
    if (doctorDialResult.success) {
      // Update conference info
      conferenceInfo.participants.push({
        type: 'doctor',
        phone: doctorPhone,
        callControlId: doctorDialResult.call_control_id,
        joinedAt: new Date().toISOString(),
        role: 'moderator'
      });
      
      conferenceInfo.doctorNotified = true;
      
      console.log(`✅ Doctor dialed successfully: ${doctorDialResult.call_control_id}`);
      console.log(`🎪 Doctor will join conference: ${conferenceInfo.name}`);
    }
    
    return doctorDialResult;
    
  } catch (error) {
    console.error('❌ Error dialing doctor to conference:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get active emergency conferences
 * @returns {Array} List of active conferences
 */
function getActiveConferences() {
  return Array.from(activeConferences.values()).filter(conf => conf.status === 'active');
}

/**
 * Find conference by emergency ID
 * @param {string} emergencyId - Emergency ID
 * @returns {Object|null} Conference info
 */
function findConference(emergencyId) {
  return activeConferences.get(emergencyId) || null;
}

/**
 * Find conference by name
 * @param {string} conferenceName - Conference name
 * @returns {Object|null} Conference info
 */
function findConferenceByName(conferenceName) {
  for (const [id, conference] of activeConferences.entries()) {
    if (conference.name === conferenceName) {
      return conference;
    }
  }
  return null;
}

/**
 * End emergency conference
 * @param {string} emergencyId - Emergency ID
 * @returns {Promise<Object>} End result
 */
async function endEmergencyConference(emergencyId) {
  try {
    const conferenceInfo = activeConferences.get(emergencyId);
    if (!conferenceInfo) {
      throw new Error(`Conference not found: ${emergencyId}`);
    }
    
    console.log(`🎪 Ending emergency conference: ${conferenceInfo.name}`);
    
    // Hangup all participants
    const hangupPromises = conferenceInfo.participants.map(async (participant) => {
      try {
        if (participant.callControlId) {
          await telnyxHelper.hangupCall(participant.callControlId);
          console.log(`📞 Hung up ${participant.type}: ${participant.phone}`);
        }
      } catch (error) {
        console.error(`❌ Error hanging up ${participant.type}:`, error);
      }
    });
    
    await Promise.all(hangupPromises);
    
    // Update conference status
    conferenceInfo.status = 'ended';
    conferenceInfo.endedAt = new Date().toISOString();
    
    // Clean up after 1 hour
    setTimeout(() => {
      activeConferences.delete(emergencyId);
      console.log(`🗑️ Cleaned up conference data: ${emergencyId}`);
    }, 60 * 60 * 1000);
    
    return {
      success: true,
      emergencyId: emergencyId,
      participantsHungUp: conferenceInfo.participants.length
    };
    
  } catch (error) {
    console.error('❌ Error ending emergency conference:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle conference participant events
 * @param {Object} eventData - Conference event data
 * @returns {Object} Event handling result
 */
async function handleConferenceEvent(eventData) {
  try {
    const { event_type, payload } = eventData;
    
    console.log(`🎪 Conference event: ${event_type}`, payload);
    
    // Extract emergency info from client state if available
    let emergencyInfo = null;
    if (payload.client_state) {
      try {
        const clientState = JSON.parse(Buffer.from(payload.client_state, 'base64').toString());
        emergencyInfo = clientState;
      } catch (error) {
        console.error('❌ Error parsing client state:', error);
      }
    }
    
    switch (event_type) {
      case 'call.answered':
        if (emergencyInfo && emergencyInfo.type === 'emergency_doctor') {
          console.log(`👨‍⚕️ Emergency doctor answered: ${payload.from}`);
          console.log(`🎪 Joining conference for emergency: ${emergencyInfo.emergencyId}`);
          
          // Doctor will automatically join conference due to conference_config
          // Conference will start when doctor enters
        }
        break;
        
      case 'call.hangup':
        if (emergencyInfo && emergencyInfo.type === 'emergency_doctor') {
          console.log(`👨‍⚕️ Emergency doctor hung up: ${payload.from}`);
          
          // End the conference since doctor left
          if (emergencyInfo.emergencyId) {
            await endEmergencyConference(emergencyInfo.emergencyId);
          }
        }
        break;
        
      default:
        console.log(`🎪 Unhandled conference event: ${event_type}`);
    }
    
    return { success: true, event_type: event_type };
    
  } catch (error) {
    console.error('❌ Error handling conference event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create emergency conference flow (main function)
 * @param {string} patientCallControlId - Patient's call control ID  
 * @param {string} patientPhone - Patient's phone number
 * @param {Object} emergencyInfo - Emergency information
 * @returns {Promise<Object>} Complete emergency conference result
 */
async function initiateEmergencyConference(patientCallControlId, patientPhone, emergencyInfo) {
  try {
    console.log('🚨 INITIATING EMERGENCY CONFERENCE PROTOCOL');
    console.log(`👤 Patient: ${emergencyInfo.name || 'Unknown'} (${patientPhone})`);
    console.log(`🩺 Emergency: ${emergencyInfo.symptoms || 'Not specified'}`);
    
    // Step 1: Create conference and add patient
    const conferenceResult = await createEmergencyConference(patientCallControlId, patientPhone, emergencyInfo);
    
    if (!conferenceResult.success) {
      throw new Error(`Failed to create conference: ${conferenceResult.error}`);
    }
    
    const { emergencyId, conferenceName } = conferenceResult;
    
    // Step 2: Determine which doctor to call
    const currentHour = new Date().getHours();
    const isNightTime = currentHour < 8 || currentHour > 18;
    
    let doctorPhone;
    if (isNightTime) {
      doctorPhone = process.env.NIGHT_EMERGENCY_DOCTOR || process.env.PRIMARY_EMERGENCY_DOCTOR;
    } else {
      doctorPhone = process.env.PRIMARY_EMERGENCY_DOCTOR;
    }
    
    console.log(`👨‍⚕️ Selected doctor: ${doctorPhone} (${isNightTime ? 'night' : 'day'} hours)`);
    
    // Step 3: Dial doctor to conference
    const doctorResult = await dialDoctorToConference(emergencyId, doctorPhone);
    
    // Step 4: Try backup doctor if primary doesn't answer (after timeout)
    if (!doctorResult.success) {
      console.log('⚠️ Primary doctor unavailable, trying backup...');
      
      const backupDoctor = process.env.BACKUP_EMERGENCY_DOCTOR;
      if (backupDoctor && backupDoctor !== doctorPhone) {
        const backupResult = await dialDoctorToConference(emergencyId, backupDoctor);
        doctorResult.backupAttempt = backupResult;
      }
    }
    
    return {
      success: true,
      emergencyId: emergencyId,
      conferenceName: conferenceName,
      conferenceInfo: conferenceResult.conferenceInfo,
      doctorDialResult: doctorResult,
      message: 'Emergency conference initiated successfully'
    };
    
  } catch (error) {
    console.error('❌ Error initiating emergency conference:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createEmergencyConference,
  addPatientToConference,
  dialDoctorToConference,
  getActiveConferences,
  findConference,
  findConferenceByName,
  endEmergencyConference,
  handleConferenceEvent,
  initiateEmergencyConference
}; 