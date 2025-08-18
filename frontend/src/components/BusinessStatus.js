import React, { useState, useEffect } from 'react';
import { checkBusinessStatus } from '../utils/timeCheck';

function BusinessStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const currentStatus = await checkBusinessStatus();
        setStatus(currentStatus);
        setLoading(false);
      } catch (error) {
        setError(error.message);
        setLoading(false);
      }
    };

    checkStatus();
    // Check every minute
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div>Checking business hours...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h3>Business Status</h3>
      <p>{status === 'open' ? 
        <span style={{color: 'green'}}>Currently Open</span> : 
        <span style={{color: 'red'}}>Currently Closed</span>
      }</p>
    </div>
  );
}

export default BusinessStatus; 