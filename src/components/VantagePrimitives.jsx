// src/components/VantagePrimitives.jsx
// Shared motion & brand primitives locked to DESIGN.md (Hallmark Vantage).
import React, { useEffect, useRef, useState } from 'react';

/**
 * 1. Official MR. ELECTRICAL WORKS Brand Lockup.
 * Dark readout chassis emblem per DESIGN.md §2 (--color-panel #121417, copper dot).
 */
export function BrandLogo({ compact = false, darkChassis = true }) {
  const ink = darkChassis ? 'var(--color-surface)' : 'var(--color-on-surface)';
  const mute = darkChassis ? 'var(--color-panel-muted)' : 'var(--color-secondary)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div
        style={{
          width: compact ? 30 : 34,
          height: compact ? 30 : 34,
          borderRadius: '9999px',
          backgroundColor: 'var(--color-panel)',
          border: '1px solid var(--color-panel-line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: compact ? '11px' : '12px',
          color: 'var(--color-surface)',
          letterSpacing: '-0.03em',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
        aria-label="MR. ELECTRICAL WORKS Emblem"
      >
        <span>MR</span>
        <span style={{ color: 'var(--color-primary)' }}>.</span>
      </div>
      {!compact && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
            }}
          >
            <span style={{ color: ink }}>MR. ELECTRICAL </span>
            <span style={{ color: 'var(--color-primary)' }}>WORKS</span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: mute,
              marginTop: '2px',
            }}
          >
            Attendance · Field Telemetry
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 2. Tabular Count-Up Readout.
 * Quadratic ease-out; snaps immediately when prefers-reduced-motion is set.
 */
export function TelemetryCounter({ value = 0, suffix = '', decimals = 0, duration = 900 }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplayValue(value);
      previousValueRef.current = value;
      return;
    }

    const startValue = previousValueRef.current;
    const delta = value - startValue;
    const startTime = performance.now();
    let rafId;

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress); // Quadratic ease-out
      setDisplayValue(startValue + delta * eased);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplayValue(value);
        previousValueRef.current = value;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {Number(displayValue).toFixed(decimals)}
      {suffix}
    </span>
  );
}
