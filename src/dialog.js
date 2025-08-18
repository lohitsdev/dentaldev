const axios = require('axios');
require('dotenv').config();

// Emergency keywords and phrases
const EMERGENCY_KEYWORDS = {
  urgent: [
    'emergency', 'urgent', 'help', 'pain', 'bleeding', 'unconscious',
    'stroke', 'heart attack', 'chest pain', 'difficulty breathing',
    'overdose', 'suicide', 'allergic reaction', 'severe', 'critical'
  ],
  symptoms: [
    'chest pain', 'shortness of breath', 'severe headache', 'blurred vision',
    'difficulty breathing', 'severe bleeding', 'loss of consciousness',
    'severe abdominal pain', 'sudden weakness', 'confusion', 'seizure',
    'severe burn', 'broken bone', 'high fever', 'vomiting blood'
  ],
  intensity: [
    'severe', 'extreme', 'unbearable', 'worst', 'sudden', 'sharp',
    'crushing', 'stabbing', 'excruciating', 'intense', 'acute'
  ],
  timing: [
    'sudden', 'immediately', 'now', 'right now', 'just happened',
    'minutes ago', 'getting worse', 'can\'t wait'
  ]
};

// Non-emergency indicators
const NON_EMERGENCY_INDICATORS = [
  'appointment', 'schedule', 'prescription', 'refill', 'routine',
  'check-up', 'follow-up', 'mild', 'slight', 'minor', 'question',
  'information', 'billing', 'insurance'
];

/**
 * Detect emergency from text using keyword analysis
 * @param {string} text - Input text to analyze
 * @returns {Promise<Object>} Emergency detection result
 */
async function detectEmergency(text) {
  if (!text || typeof text !== 'string') {
    return {
      isEmergency: false,
      confidence: 0,
      reasons: [],
      category: 'unknown'
    };
  }

  const normalizedText = text.toLowerCase().trim();
  let emergencyScore = 0;
  let reasons = [];
  let category = 'general';

  // Check for direct emergency keywords
  const urgentMatches = EMERGENCY_KEYWORDS.urgent.filter(keyword => 
    normalizedText.includes(keyword)
  );
  
  if (urgentMatches.length > 0) {
    emergencyScore += urgentMatches.length * 25;
    reasons.push(`Urgent keywords detected: ${urgentMatches.join(', ')}`);
    category = 'urgent';
  }

  // Check for symptom keywords
  const symptomMatches = EMERGENCY_KEYWORDS.symptoms.filter(symptom => 
    normalizedText.includes(symptom)
  );
  
  if (symptomMatches.length > 0) {
    emergencyScore += symptomMatches.length * 20;
    reasons.push(`Critical symptoms detected: ${symptomMatches.join(', ')}`);
    category = 'medical';
  }

  // Check for intensity modifiers
  const intensityMatches = EMERGENCY_KEYWORDS.intensity.filter(intensity => 
    normalizedText.includes(intensity)
  );
  
  if (intensityMatches.length > 0) {
    emergencyScore += intensityMatches.length * 15;
    reasons.push(`High intensity indicators: ${intensityMatches.join(', ')}`);
  }

  // Check for timing urgency
  const timingMatches = EMERGENCY_KEYWORDS.timing.filter(timing => 
    normalizedText.includes(timing)
  );
  
  if (timingMatches.length > 0) {
    emergencyScore += timingMatches.length * 10;
    reasons.push(`Urgent timing indicators: ${timingMatches.join(', ')}`);
  }

  // Reduce score for non-emergency indicators
  const nonEmergencyMatches = NON_EMERGENCY_INDICATORS.filter(indicator => 
    normalizedText.includes(indicator)
  );
  
  if (nonEmergencyMatches.length > 0) {
    emergencyScore -= nonEmergencyMatches.length * 10;
    reasons.push(`Non-emergency indicators: ${nonEmergencyMatches.join(', ')}`);
  }

  // Use AI for complex analysis if OpenAI is available
  let aiAnalysis = null;
  if (process.env.OPENAI_API_KEY && emergencyScore > 20) {
    try {
      aiAnalysis = await analyzeWithAI(text);
      if (aiAnalysis.isEmergency) {
        emergencyScore += 30;
        reasons.push(`AI analysis: ${aiAnalysis.reasoning}`);
      }
    } catch (error) {
      console.warn('AI analysis failed, using keyword-based detection only');
    }
  }

  // Normalize score to confidence percentage
  const confidence = Math.min(100, Math.max(0, emergencyScore));
  const isEmergency = confidence >= 50;

  console.log(`Emergency detection for "${text.substring(0, 100)}..."`);
  console.log(`Score: ${emergencyScore}, Confidence: ${confidence}%, Emergency: ${isEmergency}`);

  return {
    isEmergency,
    confidence,
    reasons,
    category,
    aiAnalysis,
    keywords: {
      urgent: urgentMatches,
      symptoms: symptomMatches,
      intensity: intensityMatches,
      timing: timingMatches
    }
  };
}

/**
 * Analyze text using OpenAI for emergency detection
 * @param {string} text - Text to analyze
 * @returns {Promise<Object>} AI analysis result
 */
async function analyzeWithAI(text) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a medical emergency detection system. Analyze the following patient message and determine if it represents a medical emergency that requires immediate attention. 

Consider:
- Life-threatening symptoms
- Severe pain or distress
- Sudden onset of symptoms
- Urgent medical terminology
- Patient's tone and language

Respond with a JSON object containing:
- isEmergency (boolean)
- urgencyLevel (1-5, where 5 is life-threatening)
- reasoning (brief explanation)
- recommendedAction (string)`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    return JSON.parse(aiResponse);
  } catch (error) {
    console.error('Error with AI analysis:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Generate appropriate response based on emergency detection
 * @param {Object} detectionResult - Result from detectEmergency
 * @param {string} patientName - Patient name if available
 * @returns {Object} Response configuration
 */
function generateResponse(detectionResult, patientName = 'Patient') {
  const { isEmergency, confidence, category } = detectionResult;

  if (isEmergency) {
    return {
      type: 'emergency',
      message: `${patientName}, I've detected this may be a medical emergency. I'm connecting you to our emergency protocol immediately. Please stay on the line.`,
      action: 'emergency_flow',
      priority: 'high',
      ttsOptions: {
        stability: 0.8,
        style: 0.3 // More urgent tone
      }
    };
  } else if (confidence > 25) {
    return {
      type: 'urgent',
      message: `${patientName}, I understand this is urgent. Let me connect you to a healthcare provider who can assist you right away.`,
      action: 'priority_intake',
      priority: 'medium',
      ttsOptions: {
        stability: 0.6,
        style: 0.2
      }
    };
  } else {
    return {
      type: 'routine',
      message: `${patientName}, thank you for contacting us. I'll help you get the care you need. Let me gather some information to assist you properly.`,
      action: 'standard_intake',
      priority: 'normal',
      ttsOptions: {
        stability: 0.5,
        style: 0.1
      }
    };
  }
}

/**
 * Extract patient information from message
 * @param {string} text - Patient message
 * @returns {Object} Extracted patient information
 */
function extractPatientInfo(text) {
  const info = {
    symptoms: [],
    medications: [],
    conditions: [],
    demographics: {},
    contactInfo: {}
  };

  // Extract potential symptoms
  EMERGENCY_KEYWORDS.symptoms.forEach(symptom => {
    if (text.toLowerCase().includes(symptom)) {
      info.symptoms.push(symptom);
    }
  });

  // Extract phone numbers
  const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
  const phoneMatches = text.match(phoneRegex);
  if (phoneMatches) {
    info.contactInfo.phones = phoneMatches;
  }

  // Extract email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emailMatches = text.match(emailRegex);
  if (emailMatches) {
    info.contactInfo.emails = emailMatches;
  }

  return info;
}

module.exports = {
  detectEmergency,
  analyzeWithAI,
  generateResponse,
  extractPatientInfo,
  EMERGENCY_KEYWORDS,
  NON_EMERGENCY_INDICATORS
}; 