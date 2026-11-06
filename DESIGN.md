# MR. ELECTRICAL WORKS — Workforce & Shift Telemetry Design System (Hallmark Vantage Lock)

## 1. Brand & Functional Identity
- **Organization:** MR. ELECTRICAL WORKS (Turnkey EPC · Hyderabad)
- **Application Name:** MR. ELECTRICAL WORKS — Attendance & Field Telemetry
- **Hallmark Archetype:** `Vantage` (Swiss Industrial Precision × Technical Specification Architecture)
- **Timezone Standard:** `Asia/Kolkata` (IST, UTC+05:30) — Shift Window 06:00–09:00, Break Alert 13:50, Full Day 17:00, Overtime >17:00.

## 2. Locked Color & Material Tokens (Strict Parity with MR-Electrical-works)
- `--color-surface`: `#FCFCFD` (Specification Paper Base — strictly no pure `#FFFFFF`)
- `--color-neutral`: `#F4F5F7` (Secondary Panel / Table Header Surface)
- `--color-subtle`: `#EAECEF` (recessed Track / Inactive Control Surface)
- `--color-on-surface`: `#121417` (Steel Ink Primary Text — strictly no pure `#000000`)
- `--color-primary`: `#B35010` (Electrolytic Busbar Copper — Primary CTA, Active Spine, Overtime Indicator; max 5% screen area)
- `--color-primary-hover`: `#9C4208`
- `--color-primary-light`: `#F5EBE4`
- `--color-secondary`: `#5C6470` (Galvanized Steel — Secondary Labels, Muted Captions, Break Segments)
- `--color-secondary-light`: `#EAECEF`
- `--color-tertiary`: `#0E639C` (Grid Incomer Breaker Blue — Live Shift Telemetry, Active On-Site Status, WebSocket Online)
- `--color-tertiary-light`: `#E6F3FA`
- `--color-border`: `#D7DBE0` (1px Solid Technical Hairline Rule)
- `--color-panel`: `#121417` (Dark Readout Chassis for Shift Chronometer, Sidebar Header & QR Viewfinder)
- `--color-error`: `#A82810` (Fault Trip Red — Absent, Late Violation, Offline Fault)
- `--color-error-light`: `#FBEAE6`
- `--color-success`: `#156E3F` (Commissioned Green — Verified Check-In / Approved)
- `--color-success-light`: `#E7F5EE`
- `--color-warning`: `#9A5B13` (Load Warning Amber — Break Threshold / Pending Approval)
- `--color-warning-light`: `#FDF3E7`

## 3. Typography Rules (Hallmark Typography Purity)
- **Display (`--font-display`):** `'Outfit', sans-serif` (Weights: 600, 700; Roman only — italic display headers are forbidden; letter-spacing `-0.02em`).
- **UI & Body (`--font-sans`):** `'Plus Jakarta Sans', sans-serif` (Weights: 400, 500, 600; 13px–15px; sentence case).
- **Telemetry & Data (`--font-mono`):** `'JetBrains Mono', monospace` (`font-variant-numeric: tabular-nums` mandatory on all timestamps, elapsed timers, GPS coordinates, employee IDs, and KPI counters).

## 4. Geometry, Borders & Chrome
- **Buttons & Inputs:** `2px` (`--radius-sm: 2px`)
- **Cards, Data Tables & Panels:** `6px` (`--radius-md: 6px`) with `1px solid var(--color-border)` (`#D7DBE0`)
- **Primary Telemetry Frames & Modals:** `10px` (`--radius-lg: 10px`)
- **Status Chips Only:** `9999px` (`--radius-full: 9999px`)
- **Banned Patterns:** Glassmorphism (`backdrop-filter: blur`), neon drop-shadows, gradient buttons, eyebrow all-caps labels above every heading, and `cubic-bezier` bounce overshoots.

## 5. Motion & Animation Floor
- `--ease-mechanical`: `cubic-bezier(0.22, 1, 0.36, 1)` (`450ms` panel & timeline reveals)
- `--ease-snap`: `cubic-bezier(0.16, 1, 0.3, 1)` (`180ms` micro-interactions & masked text)
- `--duration-telemetry`: `250ms` (tabular readout updates)
- Respect `@media (prefers-reduced-motion: reduce)` across all CSS and JS animations.
