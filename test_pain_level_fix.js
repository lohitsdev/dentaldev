// Test script to verify pain level parsing fix
const { determineEmergencyStatus } = require('./src/index.js');

// Test cases that simulate the webhook data
const testCases = [
  {
    name: "John Peterson",
    phone: 13107510189,
    "Pain level": "10",  // This is how it comes from the webhook
    call_control_id: "test-123"
  },
  {
    name: "Jane Doe", 
    phone: 13107510188,
    "Pain level": "3",
    call_control_id: "test-124"
  },
  {
    name: "Bob Smith",
    phone: 13107510187,
    "Pain level": "7",
    call_control_id: "test-125"
  }
];

console.log('Testing pain level parsing fix...\n');

testCases.forEach((testCase, index) => {
  // Simulate the fixed parsing logic
  const painLevel = testCase['Pain level'] || testCase.pain_level || null;
  const status = determineEmergencyStatus(painLevel);
  
  console.log(`Test Case ${index + 1}:`);
  console.log(`  Name: ${testCase.name}`);
  console.log(`  Raw Pain Level: "${testCase['Pain level']}"`);
  console.log(`  Parsed Pain Level: ${painLevel}`);
  console.log(`  Status: ${status}`);
  console.log(`  Expected: ${painLevel >= 7 ? 'Emergency' : 'Non-Emergency'}`);
  console.log(`  ✅ ${status === (painLevel >= 7 ? 'Emergency' : 'Non-Emergency') ? 'PASS' : 'FAIL'}\n`);
});

