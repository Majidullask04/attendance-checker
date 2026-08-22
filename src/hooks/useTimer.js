import { useState, useEffect } from 'react';

export function useTimer(startTimeIso) {
  const [elapsed, setElapsed] = useState({
    formatted: '00h 00m 00s',
    short: '0m 0s',
    totalSeconds: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    if (!startTimeIso) {
      setElapsed({
        formatted: '00h 00m 00s',
        short: '0m 0s',
        totalSeconds: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
      return;
    }

    const updateTimer = () => {
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

      setElapsed({
        formatted,
        short,
        totalSeconds,
        hours,
        minutes,
        seconds,
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTimeIso]);

  return elapsed;
}
