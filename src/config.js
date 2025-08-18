require('dotenv').config();

/**
 * Default practice configuration
 */
const defaultConfig = {
  name: process.env.PRACTICE_NAME || 'Healthcare Practice',
  responseTime: '24 hours',
  emergencyContacts: [
    {
      name: 'Dr. Emergency Contact',
      phone: process.env.EMERGENCY_CONTACT || '+1234567890',
      role: 'Primary Physician'
    }
  ],
  adminEmail: process.env.ADMIN_EMAIL || 'admin@practice.com',
  staffEmail: process.env.STAFF_EMAIL || process.env.ADMIN_EMAIL || 'staff@practice.com',
  timezone: process.env.TIMEZONE || 'America/Los_Angeles',
  emergencyHours: {
    from: process.env.EMERGENCY_HOURS_FROM || '17:00',  // 5 PM default
    to: process.env.EMERGENCY_HOURS_TO || '09:00'      // 9 AM default
  },
  businessHours: {
    monday: { open: '00:00', close: '23:59' },
    tuesday: { open: '00:00', close: '23:59' },
    wednesday: { open: '00:00', close: '23:59' },
    thursday: { open: '00:00', close: '23:59' },
    friday: { open: '00:00', close: '23:59' },
    saturday: { open: '00:00', close: '23:59' },
    sunday: { open: '00:00', close: '23:59' }
  },
  autoResponder: {
    enabled: true,
    afterHoursMessage: 'Thank you for contacting us. Our AI assistant is here to help you 24/7.',
    businessHoursMessage: 'Thank you for contacting us. Our AI assistant is here to help you.'
  },
  emergencyKeywords: {
    enabled: true,
    sensitivity: 'medium', // low, medium, high
    autoEscalate: true
  },
  compliance: {
    hipaaCompliant: true,
    recordRetentionDays: 2555, // 7 years
    auditLogging: true
  }
};

/**
 * Load configuration from environment or config file
 * @returns {Object} Practice configuration
 */
function loadConfig() {
  try {
    // Try to load from config file if it exists
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '..', 'config.json');
    
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return mergeConfig(defaultConfig, fileConfig);
    }
    
    return defaultConfig;
  } catch (error) {
    console.warn('Error loading config file, using defaults:', error.message);
    return defaultConfig;
  }
}

/**
 * Merge configuration objects
 * @param {Object} defaults - Default configuration
 * @param {Object} overrides - Override configuration
 * @returns {Object} Merged configuration
 */
function mergeConfig(defaults, overrides) {
  const merged = { ...defaults };
  
  for (const key in overrides) {
    if (typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
      merged[key] = { ...defaults[key], ...overrides[key] };
    } else {
      merged[key] = overrides[key];
    }
  }
  
  return merged;
}

/**
 * Get practice settings
 * @returns {Object} Current practice configuration
 */
function getPracticeSettings() {
  return loadConfig();
}

/**
 * Check if practice is currently open (now always returns true for 24/7 operation)
 * @returns {boolean} True if practice is open
 */
function isPracticeOpen() {
  // Always return true for 24/7 operation
  return true;
}

/**
 * Get appropriate auto-response message
 * @returns {string} Auto-response message
 */
function getAutoResponseMessage() {
  const config = getPracticeSettings();
  
  if (!config.autoResponder.enabled) {
    return '';
  }
  
  // Always use business hours message since we're 24/7 now
  return config.autoResponder.businessHoursMessage;
}

/**
 * Get emergency contacts
 * @returns {Array} List of emergency contacts
 */
function getEmergencyContacts() {
  const config = getPracticeSettings();
  return config.emergencyContacts || [];
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];
  
  // Required fields
  if (!config.name) {
    errors.push('Practice name is required');
  }
  
  if (!config.adminEmail) {
    errors.push('Admin email is required');
  }
  
  if (!config.emergencyContacts || config.emergencyContacts.length === 0) {
    warnings.push('No emergency contacts configured');
  }
  
  // Validate emergency contacts
  if (config.emergencyContacts) {
    config.emergencyContacts.forEach((contact, index) => {
      if (!contact.phone) {
        errors.push(`Emergency contact ${index + 1} missing phone number`);
      }
      if (!contact.name) {
        warnings.push(`Emergency contact ${index + 1} missing name`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Save configuration to file
 * @param {Object} config - Configuration to save
 * @returns {boolean} Success status
 */
function saveConfig(config) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const validation = validateConfig(config);
    if (!validation.isValid) {
      console.error('Configuration validation failed:', validation.errors);
      return false;
    }
    
    const configPath = path.join(__dirname, '..', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log('Configuration saved successfully');
    return true;
    
  } catch (error) {
    console.error('Error saving configuration:', error);
    return false;
  }
}

/**
 * Update specific configuration setting
 * @param {string} key - Configuration key
 * @param {*} value - New value
 * @returns {boolean} Success status
 */
function updateSetting(key, value) {
  try {
    const currentConfig = getPracticeSettings();
    
    // Handle nested keys (e.g., 'businessHours.monday.open')
    const keys = key.split('.');
    let target = currentConfig;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]]) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    target[keys[keys.length - 1]] = value;
    
    return saveConfig(currentConfig);
    
  } catch (error) {
    console.error('Error updating setting:', error);
    return false;
  }
}

/**
 * Get configuration summary for API responses
 * @returns {Object} Public configuration summary
 */
function getPublicConfig() {
  const config = getPracticeSettings();
  
  return {
    name: config.name,
    responseTime: config.responseTime,
    businessHours: '24/7 Service Available',
    timezone: config.timezone,
    isOpen: true, // Always open now
    autoResponseMessage: getAutoResponseMessage()
  };
}

module.exports = {
  getPracticeSettings,
  isPracticeOpen,
  getAutoResponseMessage,
  getEmergencyContacts,
  validateConfig,
  saveConfig,
  updateSetting,
  getPublicConfig,
  defaultConfig
}; 