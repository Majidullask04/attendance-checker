import { useState, useEffect, useCallback } from 'react';

const EARTH_RADIUS_M = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

// Haversine distance in metres between two lat/lng points
export function haversineMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Real device geolocation via navigator.geolocation.
 * Returns { position, coords, accuracy, status, error, refresh }.
 *  - status: 'idle' | 'requesting' | 'ok' | 'denied' | 'unavailable' | 'error'
 *  - coords: { lat, lng } or null.
 */
export function useGeolocation({ enableHighAccuracy = true, timeoutMs = 10000 } = {}) {
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation is not supported by this device/browser.');
      return;
    }
    setStatus('requesting');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setAccuracy(Math.round(acc || 0));
        setStatus('ok');
      },
      (err) => {
        let code = 'error';
        if (err && err.code === 1) code = 'denied';
        else if (err && err.code === 2) code = 'unavailable';
        setStatus(code);
        setCoords(null);
        setAccuracy(null);
        setError(err && err.message ? err.message : 'Unable to obtain GPS location.');
      },
      { enableHighAccuracy, timeout: timeoutMs, maximumAge: 5000 }
    );
  }, [enableHighAccuracy, timeoutMs]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, coords, accuracy, error, refresh };
}

export default useGeolocation;
