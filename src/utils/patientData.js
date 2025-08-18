const { storeCallData, getCallData, deleteCallData } = require('./fileStorage');

async function updatePatientRecord(storageKey, patientInfo) {
  let existingData = await getCallData(storageKey);

  if (existingData) {
    // Update existing record
    existingData = { ...existingData, ...patientInfo };
  } else {
    // Create new record
    existingData = patientInfo;
  }

  await storeCallData(storageKey, existingData);
  console.log(`Patient record updated for ${patientInfo.name}`);
}

async function getPatientRecord(storageKey) {
  return await getCallData(storageKey);
}

async function deletePatientRecord(storageKey) {
  await deleteCallData(storageKey);
  console.log(`Patient record deleted for key ${storageKey}`);
}

module.exports = { 
  updatePatientRecord, 
  getCallData: getPatientRecord, 
  deleteCallData: deletePatientRecord 
};
