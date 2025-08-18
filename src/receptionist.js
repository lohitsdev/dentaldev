const telnyxClient = require('./telnyx');
const { textToSpeech } = require('./tts');
const { sendReceptionistSummary } = require('./email');
const config = require('./config');
require('dotenv').config();

// Comprehensive dental emergency keywords
const DENTAL_EMERGENCY_KEYWORDS = {
  severe_pain: [
    'severe pain', 'excruciating pain', 'unbearable pain', 'extreme pain',
    'worst pain', 'pain scale 10', 'can\'t sleep', 'crying', 'screaming',
    'sharp pain', 'stabbing pain', 'pulsating pain', 'throbbing pain',
    'constant pain', 'non-stop pain', 'pain all night', 'pain for days',
    'worst pain ever', 'can\'t eat', 'can\'t drink', 'can\'t talk',
    'pain medication not working', 'over the counter not helping',
    'toothache', 'dental pain', 'oral pain', 'jaw pain', 'facial pain'
  ],
  bleeding: [
    'bleeding', 'blood', 'bleeding gums', 'bleeding tooth', 'heavy bleeding',
    'won\'t stop bleeding', 'mouth bleeding', 'gums bleeding', 'bleeding mouth',
    'blood in mouth', 'bleeding after extraction', 'bleeding after surgery',
    'continuous bleeding', 'profuse bleeding', 'bleeding for hours',
    'blood when brushing', 'blood when flossing', 'gums bleeding easily',
    'bleeding socket', 'post-operative bleeding', 'surgical bleeding'
  ],
  swelling: [
    'swelling', 'swollen', 'face swollen', 'cheek swollen', 'jaw swollen',
    'eye swelling', 'facial swelling', 'can\'t open mouth', 'mouth swollen',
    'gums swollen', 'tooth area swollen', 'cheek puffy', 'face puffy',
    'jaw locked', 'can\'t chew', 'can\'t swallow', 'difficulty breathing',
    'swollen lymph nodes', 'swollen under jaw', 'swollen around tooth',
    'facial inflammation', 'oral swelling', 'dental swelling'
  ],
  infection: [
    'infection', 'infected', 'pus', 'abscess', 'fever', 'hot to touch',
    'red and swollen', 'throbbing', 'infected tooth', 'gum infection',
    'dental abscess', 'tooth abscess', 'gum abscess', 'oral infection',
    'bacterial infection', 'viral infection', 'fungal infection',
    'bad taste in mouth', 'bad breath', 'foul odor', 'drainage',
    'white spots', 'yellow spots', 'black spots', 'tooth decay',
    'cavity', 'caries', 'root canal infection', 'periodontal infection'
  ],
  trauma: [
    'knocked out tooth', 'broken tooth', 'cracked tooth', 'tooth fell out',
    'accident', 'hit in face', 'sports injury', 'fell', 'car accident',
    'tooth knocked loose', 'tooth moved', 'tooth displaced', 'tooth chipped',
    'tooth fractured', 'crown fell off', 'filling fell out', 'bridge broken',
    'dental work broken', 'dental work loose', 'dental work fell out',
    'impact injury', 'blow to face', 'fall on face', 'dental trauma',
    'oral injury', 'mouth injury', 'jaw injury', 'facial injury'
  ],
  post_op: [
    'after surgery', 'post surgery', 'after extraction', 'wisdom teeth',
    'dry socket', 'stitches', 'complications', 'healing problems',
    'post-operative pain', 'surgical site infection', 'surgical complications',
    'extraction site', 'surgical site', 'sutures', 'stitches loose',
    'stitches fell out', 'bleeding after surgery', 'pain after surgery',
    'swelling after surgery', 'infection after surgery', 'dry socket pain',
    'alveolar osteitis', 'post-extraction complications', 'surgical wound',
    'healing not normal', 'delayed healing', 'abnormal healing'
  ],
  nerve_issues: [
    'nerve pain', 'tooth nerve', 'dental nerve', 'nerve exposed',
    'sensitive to hot', 'sensitive to cold', 'sensitive to pressure',
    'shooting pain', 'electric shock pain', 'nerve damage', 'pulpitis',
    'irreversible pulpitis', 'reversible pulpitis', 'nerve inflammation',
    'dental pulp', 'tooth pulp', 'pulp exposure', 'nerve exposure'
  ],
  breathing_difficulty: [
    'can\'t breathe', 'difficulty breathing', 'breathing problems',
    'swollen throat', 'throat swelling', 'airway obstruction',
    'trouble swallowing', 'can\'t swallow', 'choking sensation',
    'tight throat', 'throat tightness', 'breathing through mouth only'
  ],
  systemic_symptoms: [
    'fever', 'high temperature', 'chills', 'sweating', 'night sweats',
    'fatigue', 'weakness', 'dizziness', 'lightheaded', 'nausea',
    'vomiting', 'headache', 'migraine', 'ear pain', 'earache',
    'sinus pain', 'sinus pressure', 'facial pressure', 'eye pain'
  ],
  explicit_emergency: [
    'emergency', 'it\'s an emergency', 'this is an emergency', 'urgent', 'urgent care',
    'right now', 'immediately', 'can\'t wait', 'need help now', 'emergency room',
    'dental emergency', 'oral emergency', 'urgent dental care', 'emergency dental',
    'critical', 'life threatening', 'serious', 'severe', 'extreme',
    'need doctor now', 'need dentist now', 'can\'t wait until tomorrow',
    'emergency appointment', 'urgent appointment', 'same day appointment'
  ]
};

const NON_EMERGENCY_KEYWORDS = [
  'appointment', 'schedule', 'reschedule', 'cancel', 'change appointment',
  'billing', 'insurance', 'payment', 'cost', 'price', 'quote',
  'cleaning', 'check-up', 'routine', 'mild discomfort', 'slight pain',
  'question', 'information', 'hours', 'location', 'directions'
];

const EMOTIONAL_DISTRESS_INDICATORS = [
  'crying', 'scared', 'terrified', 'panic', 'help me', 'please help',
  'desperate', 'worried sick', 'can\'t take it', 'emergency room',
  'sobbing', 'hysterical', 'freaking out', 'losing my mind', 'going crazy',
  'can\'t handle this', 'breaking down', 'overwhelmed', 'distressed',
  'anxious', 'nervous', 'fearful', 'afraid', 'worried', 'concerned',
  'stressed', 'tense', 'agitated', 'irritable', 'frustrated', 'angry',
  'desperate', 'urgent', 'critical', 'serious', 'severe', 'extreme',
  'worst ever', 'never felt like this', 'unbearable', 'intolerable',
  'can\'t function', 'can\'t work', 'can\'t sleep', 'can\'t eat',
  'need immediate help', 'need help now', 'can\'t wait', 'emergency',
  'urgent care', 'right now', 'immediately', 'asap', 'stat'
];

/**
 * AI Receptionist - Main entry point for all calls (24/7)
 * @param {string} patientMessage - What the patient said
 * @param {string} callSid - Twilio call SID
 * @param {string} callerPhone - Caller's phone number
 * @param {Object} conversationState - Current conversation state
 * @returns {Promise<Object>} Structured response with classification and next steps
 */
async function processCall(patientMessage, callSid, callerPhone, conversationState = {}) {
  try {
    console.log(`Processing call from ${callerPhone}: ${patientMessage}`);
    
    const practiceSettings = config.getPracticeSettings();
    
    // Check if this is a continuation of an emergency intake
    if (conversationState.mode === 'emergency_intake') {
      return await handleEmergencyIntake(patientMessage, callSid, callerPhone, conversationState, practiceSettings);
    }
    
    // Use fast keyword-based classification only
    const classification = await classifyUrgency(patientMessage);
    
    // Extract basic information 
    const extractedInfo = extractCallInformation(patientMessage, classification.type);
    
    // Generate appropriate response
    const response = generateReceptionistResponse(classification, extractedInfo, practiceSettings);
    
    // Create call summary
    const callSummary = {
      callId: callSid,
      timestamp: new Date().toISOString(),
      phone: callerPhone,
      patientName: extractedInfo.name,
      originalMessage: patientMessage,
      classification: classification.type,
      confidence: classification.confidence,
      summary: classification.summary,
      emotionalTone: classification.emotionalTone,
      extractedInfo: extractedInfo,
      responseGiven: response.message,
      actionTaken: response.action,
      preferredCallbackTime: extractedInfo.preferredCallbackTime,
      keywordAnalysis: classification
    };
    
    // Send email summary and log asynchronously (don't wait)
    // For emergency and non-emergency calls, only send email after collecting patient info
    if (classification.type === 'uncertain') {
      // Only send immediate email for uncertain cases that need clarification
      setImmediate(async () => {
        try {
          await sendReceptionistSummary(callSummary, practiceSettings);
          await logCallSummary(callSummary);
        } catch (error) {
          console.error('Error in background email/logging:', error);
        }
      });
    } else {
      // For emergency and non-emergency, only log the call but don't send email yet
      setImmediate(async () => {
        try {
          await logCallSummary(callSummary);
          if (classification.type === 'emergency') {
            console.log('Emergency call logged - email will be sent after collecting patient details');
            // Send immediate SMS alert to doctor (if enabled) but no email yet
            const smsEnabled = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
            if (smsEnabled) {
              await sendImmediateEmergencySMS(callSummary, practiceSettings);
            }
          } else {
            console.log('Non-emergency call logged - email will be sent after collecting patient info');
          }
        } catch (error) {
          console.error('Error in background logging:', error);
        }
      });
    }
    
    console.log(`Call processed - Classification: ${classification.type}`);
    
    // Generate TwiML response
    let twimlResponse;
    try {
      twimlResponse = await generateTwiMLResponse(response, classification.type, callSid);
    } catch (error) {
      console.error('Error generating TwiML response:', error);
      // Fallback to simple TwiML
      const telnyxClient = require('./telnyx');
      twimlResponse = telnyxClient.generateSimpleTwiML(response.message, {
        gather: response.type === 'clarification',
        hangup: response.type === 'non_emergency'
      });
    }
    
    return {
      greeting: generateNaturalGreeting(practiceSettings.name),
      classification: classification.type,
      confidence: classification.confidence,
      response: response,
      callSummary: callSummary,
      twimlResponse: twimlResponse,
      conversationState: response.conversationState || {}
    };
    
  } catch (error) {
    console.error('Error processing call:', error);
    
    // Fallback response
    const telnyxClient = require('./telnyx');
    const fallbackMessage = 'I apologize, but I\'m experiencing technical difficulties. Please call back in a few minutes or if this is an emergency, please call 911.';
    
    return {
      greeting: 'Hi, this is the AI receptionist.',
      classification: 'error',
      confidence: 0,
      response: { type: 'error', message: fallbackMessage },
      twimlResponse: telnyxClient.generateSimpleTwiML(fallbackMessage, { hangup: true }),
      conversationState: {}
    };
  }
}

/**
 * Generate warm, natural greeting for 24/7 service
 * @param {string} clinicName - Name of the dental clinic
 * @returns {string} Greeting message
 */
function generateNaturalGreeting(clinicName) {
  const timeOfDay = getTimeOfDay();
  
  const greetings = [
    `Hi, this is the AI receptionist for ${clinicName}. How can I help you ${timeOfDay}?`,
    `Thanks for calling ${clinicName}. What can I help you with ${timeOfDay}?`,
    `Hello, you've reached ${clinicName}. I'm here to assist you. What brings you to call ${timeOfDay}?`,
    `Good ${timeOfDay.replace(' ', '')}, this is ${clinicName}'s AI receptionist. How may I help you?`,
    `Hi there, you've reached ${clinicName}. What can I do for you ${timeOfDay}?`
  ];
  
  // Return a random greeting for natural variation
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Get appropriate time of day greeting
 * @returns {string} Time of day
 */
function getTimeOfDay() {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'this morning';
  } else if (hour >= 12 && hour < 17) {
    return 'this afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'this evening';
  } else {
    return 'tonight';
  }
}

/**
 * Handle emergency intake conversation flow
 * @param {string} patientMessage - Patient's response
 * @param {string} callSid - Call SID
 * @param {string} callerPhone - Caller's phone
 * @param {Object} conversationState - Current conversation state
 * @param {Object} practiceSettings - Practice settings
 * @returns {Promise<Object>} Response object
 */
async function handleEmergencyIntake(patientMessage, callSid, callerPhone, conversationState, practiceSettings) {
  const step = conversationState.step || 'name';
  const collectedInfo = conversationState.collectedInfo || {};
  
  let nextStep = step;
  let message = '';
  let completed = false;
  
  switch (step) {
    case 'name':
      // Extract name from response
      const nameMatch = patientMessage.match(/(?:my name is|i'm|this is)\s+([a-zA-Z\s]+)/i) || 
                       patientMessage.match(/^([a-zA-Z\s]+)$/);
      if (nameMatch) {
        collectedInfo.name = nameMatch[1].trim();
        message = `Thank you ${collectedInfo.name}. Can you please confirm your callback number?`;
        nextStep = 'phone';
      } else {
        collectedInfo.name = patientMessage.trim();
        message = `Thank you ${collectedInfo.name}. Can you please confirm your callback number?`;
        nextStep = 'phone';
      }
      break;
      
    case 'phone':
      // Extract or confirm phone number
      const phoneMatch = patientMessage.match(/(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
      if (phoneMatch) {
        collectedInfo.phone = phoneMatch[0];
      } else {
        collectedInfo.phone = callerPhone; // Use the calling number
      }
      message = `Got it. Now please briefly describe your dental emergency - what's happening?`;
      nextStep = 'description';
      break;
      
    case 'description':
      collectedInfo.description = patientMessage;
      collectedInfo.emotionalTone = detectEmotionalTone(patientMessage);
      message = `Thank you ${collectedInfo.name}. I have all the information I need. I'll get the on-call doctor on the line now. Please stay on the line.`;
      completed = true;
      nextStep = 'complete';
      break;
  }
  
  // Create comprehensive call summary for emergency
  const emergencyCallSummary = {
    callId: callSid,
    timestamp: new Date().toISOString(),
    phone: callerPhone,
    patientName: collectedInfo.name,
    callbackNumber: collectedInfo.phone,
    emergencyDescription: collectedInfo.description,
    emotionalTone: collectedInfo.emotionalTone,
    classification: 'emergency',
    confidence: 100,
    summary: `EMERGENCY CALL: ${collectedInfo.name} reporting ${collectedInfo.description}`,
    actionTaken: completed ? 'connecting_to_doctor' : 'collecting_emergency_info',
    conversationStep: nextStep
  };
  
  if (completed) {
    // Send final emergency email with all collected info
    await sendReceptionistSummary(emergencyCallSummary, practiceSettings);
    await logCallSummary(emergencyCallSummary);
    
    // Send urgent SMS to emergency doctor
    await sendEmergencySMSToDoctor(emergencyCallSummary, practiceSettings);
  }
  
  return {
    classification: 'emergency',
    confidence: 100,
    response: {
      type: 'emergency_intake',
      message: message,
      action: completed ? 'connect_emergency_doctor' : 'continue_intake',
      priority: 'immediate'
    },
    callSummary: emergencyCallSummary,
    twimlResponse: await generateEmergencyTwiML(message, completed, nextStep, collectedInfo),
    conversationState: {
      mode: completed ? 'completed' : 'emergency_intake',
      step: nextStep,
      collectedInfo: collectedInfo
    }
  };
}

/**
 * Send urgent SMS notification to emergency doctor
 * @param {Object} emergencyCallSummary - Emergency call details
 * @param {Object} practiceSettings - Practice settings
 */
async function sendEmergencySMSToDoctor(emergencyCallSummary, practiceSettings) {
  try {
    const emergencyDoctorPhone = process.env.PRIMARY_EMERGENCY_DOCTOR;
    const smsEnabled = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
    
    if (!smsEnabled) {
      console.log('SMS notifications disabled - skipping emergency SMS to doctor');
      return;
    }
    
    if (!emergencyDoctorPhone) {
      console.log('No emergency doctor phone configured - skipping SMS');
      return;
    }
    
    // Format emergency SMS message
    const smsMessage = `🚨 DENTAL EMERGENCY 🚨
Patient: ${emergencyCallSummary.patientName}
Phone: ${emergencyCallSummary.callbackNumber}
Emergency: ${emergencyCallSummary.emergencyDescription}
Time: ${new Date().toLocaleString()}
Clinic: ${practiceSettings.name}

Patient is being connected to you now. Please answer incoming call or call back immediately.`;
    
    // Send SMS using Twilio
    const telnyxClient = require('./telnyx');
    await telnyxClient.sendSMS(emergencyDoctorPhone, smsMessage);
    
    console.log(`🚨 Emergency SMS sent to doctor: ${emergencyDoctorPhone}`);
    
    // Log SMS sending
    const smsLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'emergency_sms_to_doctor',
      doctorPhone: emergencyDoctorPhone,
      patientName: emergencyCallSummary.patientName,
      patientPhone: emergencyCallSummary.callbackNumber,
      callId: emergencyCallSummary.callId,
      message: smsMessage
    };
    
    await logCallSummary(smsLogEntry);
    
  } catch (error) {
    console.error('Error sending emergency SMS to doctor:', error);
    // Don't throw error - SMS failure shouldn't stop the emergency flow
  }
}

/**
 * Send immediate SMS alert to emergency doctor when emergency is first detected
 * @param {Object} callSummary - Call summary with initial emergency detection
 * @param {Object} practiceSettings - Practice settings
 */
async function sendImmediateEmergencySMS(callSummary, practiceSettings) {
  try {
    const emergencyDoctorPhone = process.env.PRIMARY_EMERGENCY_DOCTOR;
    const smsEnabled = process.env.ENABLE_SMS_NOTIFICATIONS === 'true';
    
    if (!smsEnabled) {
      console.log('SMS notifications disabled - skipping immediate emergency SMS');
      return;
    }
    
    if (!emergencyDoctorPhone) {
      console.log('No emergency doctor phone configured - skipping immediate SMS');
      return;
    }
    
    // Format immediate alert SMS
    const smsMessage = `🚨 DENTAL EMERGENCY ALERT 🚨
Call from: ${callSummary.phone}
Message: "${callSummary.originalMessage}"
Confidence: ${callSummary.confidence}%
Time: ${new Date().toLocaleString()}
Clinic: ${practiceSettings.name}

Emergency detected! AI is collecting patient details now. Prepare for incoming call transfer.

Call ID: ${callSummary.callId}`;
    
    // Send SMS using Twilio
    const telnyxClient = require('./telnyx');
    await telnyxClient.sendSMS(emergencyDoctorPhone, smsMessage);
    
    console.log(`🚨 Immediate emergency alert SMS sent to doctor: ${emergencyDoctorPhone}`);
    
    // Log SMS sending
    const smsLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'immediate_emergency_alert_sms',
      doctorPhone: emergencyDoctorPhone,
      patientPhone: callSummary.phone,
      callId: callSummary.callId,
      confidence: callSummary.confidence,
      originalMessage: callSummary.originalMessage,
      message: smsMessage
    };
    
    await logCallSummary(smsLogEntry);
    
  } catch (error) {
    console.error('Error sending immediate emergency SMS to doctor:', error);
    // Don't throw error - SMS failure shouldn't stop the emergency flow
  }
}

/**
 * Generate TwiML response for voice calls
 * @param {Object} response - Response configuration
 * @param {string} classificationType - Type of classification
 * @param {string} callSid - Call SID for state management
 * @returns {Promise<string>} TwiML XML
 */
async function generateTwiMLResponse(response, classificationType, callSid) {
  if (response.type === 'emergency_intake') {
    return await generateEmergencyTwiML(response.message, false, 'name', {});
  } else {
    // Get appropriate TTS options based on response type
    const ttsOptions = response.ttsOptions || {};
    
    // For non-emergency calls, we want to continue the conversation, not hang up
    const shouldGather = response.type === 'clarification' || response.type === 'non_emergency';
    const shouldHangup = false; // Never hang up automatically, let the conversation continue
    
    return await telnyxClient.generateTwiML(response.message, {
      gather: shouldGather,
      action: response.type === 'non_emergency' ? '/webhook/appointment-scheduling' : '/webhook/receptionist-followup',
      hangup: shouldHangup
    }, ttsOptions);
  }
}

/**
 * Generate TwiML for emergency intake flow
 * @param {string} message - Message to speak
 * @param {boolean} completed - Whether intake is completed
 * @param {string} nextStep - Next step in the flow
 * @param {Object} collectedInfo - Already collected information
 * @returns {Promise<string>} TwiML XML
 */
async function generateEmergencyTwiML(message, completed, nextStep, collectedInfo) {
  // Emergency responses should have urgent but reassuring tone
  const emergencyTtsOptions = {
    stability: 0.8,
    style: 0.3, // More expressive for urgency
    similarityBoost: 0.9
  };
  
  if (completed) {
    // Final message - connect to doctor (in real implementation, this would dial the doctor)
    return await telnyxClient.generateTwiML(message, {
      gather: false,
      hangup: false,
      action: '/webhook/connect-doctor' // This would handle doctor connection
    }, emergencyTtsOptions);
  } else {
    // Continue gathering information
    return await telnyxClient.generateTwiML(message, {
      gather: true,
      action: `/webhook/emergency-intake?step=${nextStep}&info=${encodeURIComponent(JSON.stringify(collectedInfo))}`,
      hangup: false
    }, emergencyTtsOptions);
  }
}

/**
 * Log call summary for HIPAA compliance
 * @param {Object} callSummary - Call summary data
 */
async function logCallSummary(callSummary) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, `receptionist-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `${new Date().toISOString()} - CALL - ${JSON.stringify(callSummary)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
    console.log(`Call logged to ${logFile}`);
    
  } catch (error) {
    console.error('Error logging call summary:', error);
  }
}

// Keep backward compatibility with the old function name
const processAfterHoursCall = processCall;

/**
 * Classify urgency using keyword analysis only (fast and reliable)
 * @param {string} message - Patient's message
 * @returns {Promise<Object>} Classification result
 */
async function classifyUrgency(message) {
  const messageText = message.toLowerCase().trim();
  let urgencyScore = 0;
  let reasons = [];
  let classification = 'non_emergency';
  
  // Check for explicit emergency declarations (HIGH PRIORITY)
  const explicitEmergencyMatches = DENTAL_EMERGENCY_KEYWORDS.explicit_emergency.filter(keyword => 
    messageText.includes(keyword)
  );
  if (explicitEmergencyMatches.length > 0) {
    urgencyScore += explicitEmergencyMatches.length * 50;
    reasons.push('Explicit emergency declaration detected');
  }
  
  // Check for severe pain indicators
  const painMatches = DENTAL_EMERGENCY_KEYWORDS.severe_pain.filter(keyword => 
    messageText.includes(keyword)
  );
  if (painMatches.length > 0) {
    urgencyScore += painMatches.length * 30;
    reasons.push('Severe pain indicators detected');
  }
  
  // Check for bleeding
  const bleedingMatches = DENTAL_EMERGENCY_KEYWORDS.bleeding.filter(keyword => 
    messageText.includes(keyword)
  );
  if (bleedingMatches.length > 0) {
    urgencyScore += bleedingMatches.length * 25;
    reasons.push('Bleeding indicators detected');
  }
  
  // Check for swelling
  const swellingMatches = DENTAL_EMERGENCY_KEYWORDS.swelling.filter(keyword => 
    messageText.includes(keyword)
  );
  if (swellingMatches.length > 0) {
    urgencyScore += swellingMatches.length * 25;
    reasons.push('Swelling indicators detected');
  }
  
  // Check for infection
  const infectionMatches = DENTAL_EMERGENCY_KEYWORDS.infection.filter(keyword => 
    messageText.includes(keyword)
  );
  if (infectionMatches.length > 0) {
    urgencyScore += infectionMatches.length * 25;
    reasons.push('Infection indicators detected');
  }
  
  // Check for trauma
  const traumaMatches = DENTAL_EMERGENCY_KEYWORDS.trauma.filter(keyword => 
    messageText.includes(keyword)
  );
  if (traumaMatches.length > 0) {
    urgencyScore += traumaMatches.length * 30;
    reasons.push('Dental trauma detected');
  }
  
  // Check for post-operative complications
  const postOpMatches = DENTAL_EMERGENCY_KEYWORDS.post_op.filter(keyword => 
    messageText.includes(keyword)
  );
  if (postOpMatches.length > 0) {
    urgencyScore += postOpMatches.length * 20;
    reasons.push('Post-operative complications detected');
  }
  
  // Check for emotional distress
  const distressMatches = EMOTIONAL_DISTRESS_INDICATORS.filter(indicator => 
    messageText.includes(indicator)
  );
  if (distressMatches.length > 0) {
    urgencyScore += distressMatches.length * 15;
    reasons.push('Emotional distress detected');
  }
  
  // Reduce score for non-emergency indicators
  const nonEmergencyMatches = NON_EMERGENCY_KEYWORDS.filter(keyword => 
    messageText.includes(keyword)
  );
  if (nonEmergencyMatches.length > 0) {
    urgencyScore -= nonEmergencyMatches.length * 10;
    reasons.push('Non-emergency indicators detected');
  }
  
  // Determine classification - lower threshold for explicit emergency declarations
  if (urgencyScore >= 40 || explicitEmergencyMatches.length > 0) {
    classification = 'emergency';
  } else if (urgencyScore >= 20 || reasons.length === 0) {
    classification = 'uncertain';
  } else {
    classification = 'non_emergency';
  }
  
  const confidence = Math.min(100, Math.max(0, urgencyScore));
  
  return {
    type: classification,
    confidence: confidence,
    reasons: reasons,
    summary: generateClassificationSummary(message, classification, reasons),
    emotionalTone: detectEmotionalTone(message)
  };
}

/**
 * Extract relevant information from the call
 * @param {string} message - Patient message
 * @param {string} classification - Call classification
 * @returns {Object} Extracted information
 */
function extractCallInformation(message, classification) {
  const info = {
    name: null,
    phone: null,
    description: message,
    preferredCallbackTime: null,
    urgencyConfirmed: null
  };
  
  // Extract name patterns
  const namePatterns = [
    /my name is ([a-zA-Z\s]+)/i,
    /this is ([a-zA-Z\s]+)/i,
    /i'm ([a-zA-Z\s]+)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      info.name = match[1].trim();
      break;
    }
  }
  
  // Extract phone numbers
  const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
  const phoneMatch = message.match(phoneRegex);
  if (phoneMatch) {
    info.phone = phoneMatch[0];
  }
  
  // Extract callback time preferences
  const timePatterns = [
    /call me back (.+)/i,
    /prefer (.+)/i,
    /morning/i,
    /afternoon/i,
    /evening/i
  ];
  
  for (const pattern of timePatterns) {
    const match = message.match(pattern);
    if (match) {
      info.preferredCallbackTime = match[0];
      break;
    }
  }
  
  return info;
}

/**
 * Generate appropriate response based on classification
 * @param {Object} classification - Classification result
 * @param {Object} extractedInfo - Extracted patient information
 * @param {Object} practiceSettings - Practice configuration
 * @returns {Object} Response configuration
 */
function generateReceptionistResponse(classification, extractedInfo, practiceSettings) {
  const patientName = extractedInfo.name ? extractedInfo.name : '';
  const namePrefix = patientName ? `${patientName}, ` : '';
  
  if (classification.type === 'emergency') {
    return {
      type: 'emergency_intake',
      message: `I understand this is a dental emergency. I need to collect some quick information before connecting you to our on-call doctor. First, can you please tell me your full name?`,
      action: 'start_emergency_intake',
      priority: 'immediate',
      conversationState: {
        mode: 'emergency_intake',
        step: 'name',
        collectedInfo: {}
      },
      ttsOptions: {
        stability: 0.8,
        style: 0.3 // Urgent but reassuring tone
      }
    };
  } else if (classification.type === 'uncertain') {
    return {
      type: 'clarification',
      message: `${namePrefix}thanks for explaining. Just to be sure, would you say this needs urgent attention right now, or is this something we can address with a regular appointment?`,
      action: 'request_clarification',
      priority: 'medium',
      ttsOptions: {
        stability: 0.6,
        style: 0.2
      }
    };
  } else {
    // Non-emergency response
    return {
      type: 'non_emergency',
      message: `${namePrefix}thanks for calling ${practiceSettings.name}. I can help you schedule an appointment or provide information. What would you like to do?`,
      action: 'schedule_appointment',
      priority: 'normal',
      ttsOptions: {
        stability: 0.5,
        style: 0.1
      }
    };
  }
}

/**
 * Generate classification summary
 * @param {string} message - Original message
 * @param {string} classification - Classification type
 * @param {Array} reasons - Classification reasons
 * @returns {string} Summary text
 */
function generateClassificationSummary(message, classification, reasons) {
  const summaryPrefix = {
    emergency: 'EMERGENCY DETECTED: Patient reporting',
    uncertain: 'UNCLEAR URGENCY: Patient mentioned',
    non_emergency: 'NON-EMERGENCY: Patient requesting'
  };
  
  return `${summaryPrefix[classification]} ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}. Classification based on: ${reasons.join(', ')}.`;
}

/**
 * Detect emotional tone from message
 * @param {string} message - Patient message
 * @returns {string} Emotional tone description
 */
function detectEmotionalTone(message) {
  const messageText = message.toLowerCase();
  
  if (EMOTIONAL_DISTRESS_INDICATORS.some(indicator => messageText.includes(indicator))) {
    return 'High distress - patient appears very upset or panicked';
  } else if (messageText.includes('pain') || messageText.includes('hurt')) {
    return 'Pain-related distress - patient experiencing discomfort';
  } else if (messageText.includes('worried') || messageText.includes('concerned')) {
    return 'Concerned but composed - patient seeking reassurance';
  } else {
    return 'Calm and composed - routine inquiry tone';
  }
}

module.exports = {
  processCall,
  processAfterHoursCall, // For backward compatibility
  classifyUrgency,
  generateNaturalGreeting,
  extractCallInformation,
  generateReceptionistResponse,
  DENTAL_EMERGENCY_KEYWORDS,
  NON_EMERGENCY_KEYWORDS
}; 