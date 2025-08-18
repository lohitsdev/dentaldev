import React, { useState, useEffect } from 'react';
import { getLATime } from '../utils/timeCheck';

function TimeDisplay() {
  const [time, setTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkTime = async () => {
      try {
        const currentTime = await getLATime();
        setTime(currentTime);
        setLoading(false);
      } catch (error) {
        setError(error.message);
        setLoading(false);
      }
    };

    checkTime();
    // Update time every minute
    const interval = setInterval(checkTime, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div>Loading time...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h3>Current Time (LA)</h3>
      <p>{time}</p>
    </div>
  );
}

export default TimeDisplay; 