import { useState, useEffect } from 'react';

export function useNepalTime() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const nepalTime = new Date(time.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }));
  const hours = String(nepalTime.getHours()).padStart(2, '0');
  const minutes = String(nepalTime.getMinutes()).padStart(2, '0');
  const seconds = String(nepalTime.getSeconds()).padStart(2, '0');
  const dateStr = nepalTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    time: `${hours}:${minutes}:${seconds}`,
    date: dateStr,
    full: `${dateStr} | ${hours}:${minutes}:${seconds}`,
  };
}
