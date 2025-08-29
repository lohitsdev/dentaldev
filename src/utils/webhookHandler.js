const { updatePatientRecord, getCallData } = require('./patientData');
const { sendReceptionistSummary } = require('../email');
const { getPracticeSettings } = require('../config');

async function handleWebhook(webhookData) {
  console.log('Processing webhook data:', JSON.stringify(webhookData, null, 2));

  try {
    if (webhookData.event_type === 'conversation_insight_result') {
      await handleConversationInsight(webhookData);
    } else {
      await handleInitialWebhook(webhookData);
    }
  } catch (error) {
    console.error('Error processing webhook data:', error);
  }
}

async function handleInitialWebhook(webhookData) {
  const { call_control_id, phone } = webhookData;
  const name = webhookData.Name || webhookData.name;
  
  if (!call_control_id) {
    console.log('No call_control_id found, skipping storage');
    return;
  }

  // Handle new is_urgent format and legacy pain level formats
  let status = 'Non-Urgent'; // default
  
  if (webhookData.is_urgent !== undefined) {
    // New format: is_urgent boolean
    status = webhookData.is_urgent === true ? 'Urgent' : 'Non-Urgent';
  } else {
    // Legacy format: pain level based
    const pain_level = webhookData['Pain level'] || webhookData.pain_level || null;
    status = determineEmergencyStatus(pain_level);
  }

  const patientInfo = {
    call_control_id,
    name: name || 'Unknown',
    phone: phone ? phone.toString() : 'Unknown',
    pain_level: webhookData['Pain level'] || webhookData.pain_level || null,
    is_urgent: webhookData.is_urgent,
    status: status,
    timeCalled: new Date().toLocaleTimeString(),
    timestamp: new Date().toISOString()
  };

  await updatePatientRecord(call_control_id, patientInfo);
  console.log('Patient data saved with call_control_id:', call_control_id);
  console.log('Patient info:', patientInfo);
}

async function handleConversationInsight(webhookData) {
  const { payload } = webhookData;
  const aiSummary = payload.results[0]?.result || 'No summary available';
  const callControlId = payload.metadata.call_control_id;
  
  console.log('Looking for stored data with call_control_id:', callControlId);

  let patientInfo = await getCallData(callControlId);

  if (patientInfo) {
    console.log('Found existing patient record:', patientInfo);
    
    // Update with AI summary and extracted symptoms
    patientInfo.aiSummary = aiSummary;
    patientInfo.symptoms = extractSymptomsFromSummary(aiSummary);
    
    console.log('Sending email notification...');
    await sendEmailNotification(patientInfo);
    
    console.log('Email sent successfully for patient:', patientInfo.name);
  } else {
    console.log('No matching patient record found for call_control_id:', callControlId);
  }
}

function extractPatientInfo(webhookData) {
  const { phone, call_control_id } = webhookData;
  const name = webhookData.Name || webhookData.name;
  
  // Handle new is_urgent format and legacy pain level formats
  let status = 'Non-Urgent'; // default
  
  if (webhookData.is_urgent !== undefined) {
    // New format: is_urgent boolean
    status = webhookData.is_urgent === true ? 'Urgent' : 'Non-Urgent';
  } else {
    // Legacy format: pain level based
    const pain_level = webhookData['Pain level'] || webhookData.pain_level || null;
    status = determineEmergencyStatus(pain_level);
  }
  
  return {
    name: name || 'Unknown',
    phone: phone ? phone.toString() : 'Unknown',
    pain_level: webhookData['Pain level'] || webhookData.pain_level || null,
    is_urgent: webhookData.is_urgent,
    call_control_id: call_control_id,
    status: status,
    symptoms: 'Not specified',
    timeCalled: new Date().toLocaleTimeString(),
    timestamp: new Date().toISOString(),
    aiSummary: ''
  };
}

function extractPhoneFromSummary(summary) {
  const phoneMatch = summary.match(/(\d{1}-\d{3}-\d{3}-\d{2}|\d{3}-\d{3}-\d{4}|\d{10})/);
  return phoneMatch ? phoneMatch[1].replace(/\D/g, '') : 'Unknown';
}

function extractNameFromSummary(summary) {
  const nameMatch = summary.match(/(\w+) contacted/);
  return nameMatch ? nameMatch[1] : 'Unknown';
}

function extractSymptomsFromSummary(summary) {
  const symptomsMatch = summary.match(/reason for calling as (.*?) with a pain level/);
  return symptomsMatch ? symptomsMatch[1] : 'Not specified';
}

function determineEmergencyStatus(painLevel) {
  if (painLevel === null || painLevel === undefined) {
    return 'Non-Urgent';
  }
  
  const numericPainLevel = Number(painLevel);
  
  if (isNaN(numericPainLevel)) {
    return 'Non-Urgent';
  }
  
  // Urgent if pain level is 10, Non-Urgent if pain level is 0
  if (numericPainLevel === 10) {
    return 'Urgent';
  } else if (numericPainLevel === 0) {
    return 'Non-Urgent';
  } else {
    // For other pain levels, determine based on threshold (7 or higher = Urgent)
    return numericPainLevel >= 7 ? 'Urgent' : 'Non-Urgent';
  }
}

async function sendEmailNotification(patientInfo) {
  try {
    const practiceSettings = getPracticeSettings();
    const emailData = {
      name: patientInfo.name,
      phone: patientInfo.phone,
      status: patientInfo.status,
      symptoms: patientInfo.symptoms,
      summary: patientInfo.aiSummary,
      timeCalled: patientInfo.timeCalled,
      timestamp: patientInfo.timestamp
    };
    
    await sendReceptionistSummary(emailData, practiceSettings);
    console.log('Email notification sent for patient:', patientInfo.name);
  } catch (error) {
    console.error('Error sending email notification:', error);
  }
}

module.exports = { handleWebhook };
