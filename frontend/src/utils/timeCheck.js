/**
 * Check if business is currently open
 * @returns {Promise<string>} 'open' or 'closed'
 */
async function checkBusinessStatus() {
  try {
    const response = await fetch('/api/la-time', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to check business hours');
    }

    const data = await response.json();
    return data.status;  // Will return 'open' or 'closed'
  } catch (error) {
    console.error('Error checking business status:', error);
    return 'error';
  }
}

export { checkBusinessStatus }; 