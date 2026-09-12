import { useState, useEffect } from 'react';
import { POLICY, getZonedNow } from '../config/policy.js';

export function useNow(intervalMs = 1000) {
  const [zoned, setZoned] = useState(() => getZonedNow(POLICY.TIMEZONE));

  useEffect(() => {
    const timer = setInterval(() => {
      setZoned(getZonedNow(POLICY.TIMEZONE));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return zoned;
}

export default useNow;
