import React, { useState, useEffect } from 'react';
import { checkBusinessHours } from '../utils/timeCheck';

function BusinessHoursStatus() {
  const [status, setStatus] = useState({
    isOpen: false,
    currentTime: null,
    timezone: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const checkStatus = async () => {
      const result = await checkBusinessHours();
      setStatus({
        ...result,
        loading: false
      });
    };

    checkStatus();
    // Check every minute
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (status.loading) {
    return <div>Checking business hours...</div>;
  }

  if (status.error) {
    return <div>Error: {status.error}</div>;
  }

  return (
    <div>
      <h3>Business Hours Status</h3>
      <p>Current Time: {status.currentTime} ({status.timezone})</p>
      <p>Status: {status.isOpen ? 
        <span style={{color: 'green'}}>Currently Open</span> : 
        <span style={{color: 'red'}}>Currently Closed</span>
      }</p>
    </div>
  );
}

export default BusinessHoursStatus; 