const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error(`Error creating data directory: ${error.message}`);
  }
}

async function storeCallData(key, data) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${key}.json`);
  try {
    await fs.writeFile(filePath, JSON.stringify(data));
    console.log(`Data stored successfully at ${filePath}`);
  } catch (error) {
    console.error(`Error storing data: ${error.message}`);
    throw error;
  }
}

async function getCallData(key) {
  const filePath = path.join(DATA_DIR, `${key}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File not found: ${filePath}`);
      return null; // File not found
    }
    console.error(`Error reading data: ${error.message}`);
    throw error;
  }
}

async function deleteCallData(key) {
  const filePath = path.join(DATA_DIR, `${key}.json`);
  try {
    await fs.unlink(filePath);
    console.log(`Data deleted successfully: ${filePath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File not found for deletion: ${filePath}`);
      return; // File doesn't exist, no need to delete
    }
    console.error(`Error deleting data: ${error.message}`);
    throw error;
  }
}

module.exports = { storeCallData, getCallData, deleteCallData };
