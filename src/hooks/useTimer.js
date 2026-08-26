import { useState, useEffect } from 'react';

const computeElapsed = (startTimeIso) => {
  if (!startTimeIso) {
    return {
      formatted: '00h 00m 00s',
      short: '0m 0s',
      totalSeconds: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  const start = new Date(startTimeIso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - start);

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');
  const formatted = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  const short = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;

  return {
    formatted,
    short,
    totalSeconds,
    hours,
    minutes,
    seconds,
  };
};

export function useTimer(startTimeIso) {
  const [elapsed, setElapsed] = useState(() => computeElapsed(startTimeIso));

  useEffect(() => {
    setElapsed(computeElapsed(startTimeIso));
    
    if (!startTimeIso) return;
    
    const interval = setInterval(() => {
      setElapsed(computeElapsed(startTimeIso));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTimeIso]);

  return elapsed;
}
