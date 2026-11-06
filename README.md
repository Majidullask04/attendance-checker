# MR. ELECTRICAL WORKS — Attendance & Field Telemetry

A production-grade workforce attendance and shift telemetry application for **MR. ELECTRICAL WORKS** (Turnkey EPC · Hyderabad). It manages field and office technician attendance across multiple sites with QR-based check-in, IST-aware shift policy, overtime, geofencing, regularization workflows, and full role-based access.

Built on the **Hallmark `Vantage`** design system (Swiss industrial precision × technical specification architecture) — see [`DESIGN.md`](./DESIGN.md).

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Shift & Attendance Policy](#shift--attendance-policy)
- [Authentication](#authentication)
- [QR Signing & Security](#qr-signing--security)
- [Design System](#design-system)
- [Project Structure](#project-structure)
- [Testing & Quality Gates](#testing--quality-gates)
- [Deployment](#deployment)
- [License](#license)

---

## Features

- **QR-based attendance** — admin-generated rotating QR codes; employees scan to check in/out, with 30-second HMAC-signed payloads to prevent screenshot replay (anti-buddy-punch).
- **Multi-site geofencing** — Haversine distance gating against configured EPC site coordinates (Headquarters, project sites) with live GPS accuracy readout.
- **Work modes** — HQ/Workshop, EPC Project Site, and On-Duty Visit (client substation dispatch) per punch.
- **IST shift policy** — `Asia/Kolkata` timezone, 06:00–09:00 check-in window, 15-minute grace buffer before "late", 13:50 break notification, 17:00 full-day completion, and overtime after 17:00 IST.
- **Break management** — mandatory break with 30-minute countdown, 40-minute max grace, and QR-verified resumption.
- **Overtime tracking** — post-17:00 `ot_start` / `ot_end` sessions.
- **Self-service regularization** — employees request corrections for missed/hatched punches (reason codes); admins approve/reject, reconciled into the timeline and audit log.
- **Roles** — admin vs. technician access, pending-approval gate for new accounts.
- **Live team dashboard** — attendance overview, present/absent/late statistics, shift timeline, and activity feed.
- **Admin tools** — team directory, employee approvals, audit log, PDF report generation, QR token management.
- **Offline queue** — punches locally queued and auto-synced when connectivity returns.
- **Mobile** — Android via Capacitor 8, with native QR camera integration.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Lucide icons, sonner toasts, qrcode, html5-qrcode |
| Backend | Node.js + Express 4 |
| Database | PostgreSQL 16 (via `pg`), with auto-migrations in `backend/db.js` |
| Auth | JWT (jsonwebtoken) + bcrypt password hashing, optional Google/Neon OAuth |
| Design | Hallmark `Vantage` tokens, CSS variables, CSS-in-JS-less architecture |
| Mobile | Capacitor 8 (Android) |
| Lint | Oxlint (`oxlint`) |
| Deploy | Docker / Render (`render.yaml`) / Vercel |

---

## Architecture

```
┌────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (React/Vite) │  HTTP  │  Backend (Express)           │
│  src/                  │ ─────► │  backend/server.js           │
│   ├─ auth/             │        │  ├─ middleware/auth.js       │
│   ├─ screens/          │        │  ├─ routes/auth.js           │
│   ├─ components/       │        │  ├─ routes/qr.js            │
│   ├─ store/useStore.js │        │  ├─ routes/attendance.js    │
│   ├─ api/client.js     │        │  ├─ config/policy.js        │
│   └─ config/           │        │  ├─ utils/qrSign.js         │
└────────────────────────┘        │  └─ db.js                   │
                                  └────────────┬─────────────────┘
                                               │  pg pool
                                        ┌──────▼──────┐
                                        │  PostgreSQL  │
                                        └─────────────┘
```

- **Frontend** is an SPA organized into screens, shared components, a global Zustand-like store (`useStore.js`), an API client with token injection, and auth context.
- **Backend** is an Express API with separate route modules (auth, QR, attendance), JWT middleware, rate limiting, helmet security headers, and a strict CORS allowlist.
- **Single source of truth** for shift/policy rules lives in `backend/config/policy.js` (timezone, windows, grace, break, OT) and mirrors a shared `src/config/policy.js` for the frontend.

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- PostgreSQL 16 (or Docker)
- npm

### 1. Clone & install

```bash
git clone https://github.com/Majidullask04/attendance-checker.git
cd attendance-checker

# Frontend
npm install

# Backend
cd backend
npm install
cd ..
```

### 2. Start PostgreSQL

Either run the included compose file (recommended):

```bash
docker compose up -d postgres
```

Or use a local PostgreSQL instance and set `DATABASE_URL` accordingly (default connection string is `postgres://postgres:postgrespassword@localhost:5432/attendance_db`).

### 3. Configure environment

Copy the example env files and fill in real values:

```bash
cp .env.example .env                    # frontend
cp backend/.env.example backend/.env    # backend
```

Minimum backend variables (see [Environment Variables](#environment-variables)):

```ini
DATABASE_URL=postgres://postgres:postgrespassword@localhost:5432/attendance_db
JWT_SECRET=<a-long-random-secret>
FRONTEND_URL=http://localhost:5173
PORT=3001
```

### 4. Run the backend

```bash
cd backend
npm run dev        # node --watch server.js
```

The API starts on **http://localhost:3001** and auto-runs schema migrations + indexing on boot (`backend/db.js`).

### 5. Run the frontend

```bash
cd ..
npm run dev        # vite
```

Open **http://localhost:5173** (or another port if taken — the backend's CORS allowlist includes 5173/5174/5175).

> **Note:** the app requires authentication. Register an account (the first admin email is auto-approved) or sign in with an approved account.

---

## Environment Variables

### Backend (`.env` / `backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | API port |
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `DATABASE_SSL` | `false` | `true` enables SSL (Render/Neon) |
| `JWT_SECRET` | *(required)* | Secret used to sign/verify JWTs |
| `FRONTEND_URL` | `http://localhost:5175` | Allowed CORS origin(s); comma-separated list supported |
| `APP_TIMEZONE` | `Asia/Kolkata` | Shift timezone |
| `CHECK_IN_START` | `06:00` | Check-in window open |
| `CHECK_IN_END` | `09:00` | On-time deadline |
| `CHECK_IN_GRACE_MINUTES` | `15` | Grace buffer before "late" |
| `BREAK_NOTIFY` | `13:50` | Break notification time |
| `WORK_END` | `17:00` | Full-day completion / OT start |
| `NODE_ENV` | — | `production` enables HTTPS redirect + serving `dist/` |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend API (defaults to `http://localhost:3001`) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Optional; enables Supabase realtime + Google OAuth |
| `VITE_NEON_DATABASE_URL` | Optional; enables Neon/Google JWT verification fallback |

---

## Shift & Attendance Policy

All policy values are configurable via env vars (see above) and centralized in `backend/config/policy.js`.

| Event | Time (IST) |
|---|---|
| Standard check-in window | 06:00 – 09:00 |
| Grace buffer | 09:00 – 09:15 (tagged `grace`, not `late`) |
| Late arrival | after 09:15 |
| Scheduled break notification | 13:50 |
| Break length | 30 minutes default, 40 max grace |
| Full-day check-out | ≥ 17:00 accepted `full_day`, earlier is `early_leave` |
| Overtime | `ot_start` after 17:00, `ot_end` closes the session |

Attendance statuses include `on_time`, `grace`, `late`, `full_day`, `early_leave`, and `ot` — used by the dashboard, team roster, and records timeline.

---

## Authentication

The app uses a 4-phase auth state machine (`src/auth/AuthContext.jsx`):

1. **Initializing** — restoring session from stored JWT.
2. **Unauthenticated** — `LoginScreen.jsx` (email + password) or `SignupScreen.jsx`; optional "Continue with Google".
3. **Pending approval** — `PendingApproval.jsx` blocks new users until an admin approves them in `AdminApprovals.jsx`.
4. **Authenticated** — session hydrates; `AdminGuard.jsx` enforces role-based routes.

**Backend** (`backend/routes/auth.js`):
- `POST /api/auth/signup` — creates account (bcrypt-hashed password), marks non-admin pending.
- `POST /api/auth/login` — verifies password, enforces pending gate, issues JWT.
- `POST /api/auth/neon-sync` — Google/Neon ID-token verification; auto-creates profile, checks admin allowlist.

JWT middleware (`backend/middleware/auth.js`) protects all `/api/qr-token` and `/api/attendance` routes.

---

## QR Signing & Security

To prevent **screenshot replays** (a screenshot of an old QR being used to punch in), QR payloads are **HMAC-signed with a 30-second rotating window**:

- `backend/utils/qrSign.js` — `signQRPayload()` / `verifyQRSignedWindow()` produce `{ l, t, g, exp, sig }`.
- The signature is computed over the location + timestamp window with a server secret; `exp` expires after 30s (45s max-age grace).
- `backend/routes/qr.js` exposes `/api/qr-token/current` and `/regenerate` returning signed payloads.
- `backend/routes/attendance.js` parses and strictly verifies each scan payload; **expired, unsigned, or tampered payloads are rejected** (HTTP 400).
- Offline `/sync-batch` recovery stays lenient (only verifies the token exists) so queued records aren't lost.

---

## Design System

The UI follows the Hallmark **`Vantage`** archetype — Swiss industrial precision. Key tokens (full spec in [`DESIGN.md`](./DESIGN.md) and `src/index.css`):

| Token | Value | Usage |
|---|---|---|
| `--color-surface` | `#FCFCFD` | Specification-paper base |
| `--color-neutral` | `#F4F5F7` | Secondary panel / table header |
| `--color-subtle` | `#EAECEF` | Recessed track / inactive control |
| `--color-on-surface` | `#121417` | Steel-ink primary text |
| `--color-primary` | `#B35010` | Busbar copper — primary CTA, overtime |
| `--color-secondary` | `#5C6470` | Galvanized steel — muted labels, break |
| `--color-tertiary` | `#0E639C` | Breaker blue — telemetry, live status |
| `--color-border` | `#D7DBE0` | 1px technical hairline |
| `--color-panel` | `#121417` | Dark readout chassis |
| `--color-error` | `#A82810` | Fault red — absent / offline |
| `--color-success` | `#156E3F` | Commissioned green — verified check-in |

**Typography:** `Outfit` (display, Roman only), `Plus Jakarta Sans` (UI/body), `JetBrains Mono` (telemetry, `tabular-nums`). **Radii:** 2px buttons/inputs, 6px cards, 10px modals, 9999px status chips. **Motion:** mechanical easings only (`cubic-bezier(0.22,1,0.36,1)` / `cubic-bezier(0.16,1,0.3,1)`), with full `prefers-reduced-motion` support — no bouncy overshoots, no glows, no glassmorphism.

---

## Project Structure

```
attendance-checker/
├── index.html
├── vite.config.js
├── package.json
├── DESIGN.md                 # Vantage design tokens
├── DEPLOYMENT.md             # deployment notes
├── docker-compose.yml
├── Dockerfile
├── render.yaml
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css             # global tokens & base
│   ├── App.css               # screen/component styles
│   ├── auth/                 # AuthContext, Login, Signup, PendingApproval, GoogleAuthModal
│   ├── screens/              # Dashboard, CheckIn, Team, MyRecords, AdminApprovals, AuditLog
│   ├── components/           # Sidebar, MobileNav, DayTimeline, QRGenerator, QRScanner, Toast, AdminGuard, TweaksPanel
│   ├── store/useStore.js     # global store, offline queue
│   ├── api/client.js         # API client with JWT injection
│   ├── lib/                  # neon/auth helpers
│   ├── config/               # frontend policy mirror
│   └── utils/                # formatters, geofence, attendance policy
├── backend/
│   ├── server.js
│   ├── db.js                 # schema + auto-migrations + seeding
│   ├── middleware/auth.js
│   ├── routes/               # auth.js, qr.js, attendance.js
│   ├── config/policy.js
│   └── utils/                # qrSign.js, formatters.js
├── android/                  # Capacitor Android project
└── docs/                     # design audit & QA reports
```

---

## Testing & Quality Gates

```bash
npm run lint      # Oxlint — must be 0 errors / 0 warnings
npm run build     # Vite production build
cd backend && npm start   # API smoke check (node --watch)
```

- Lint config lives in `.oxlintrc.json` (React rules enforced; adivisory defaults tuned).
- The backend auto-runs schema migration + index creation on boot — check the console for `PostgreSQL connected successfully` and `Indexes created successfully`.
- During development, verify the `/api/health` endpoint and that a QR scan rejects an expired/unsigned payload (see [QR Signing](#qr-signing--security)).

---

## Deployment

- **Docker:** `docker compose up --build` builds both the frontend (`Dockerfile` multi-stage) and backend against PostgreSQL.
- **Render:** `render.yaml` scaffolds the API service; set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and `NODE_ENV=production`.
- **Vercel:** the frontend deploys as a static Vite build; point `VITE_API_URL` at the hosted API.
- **Android:** `npx cap sync` after building the web bundle; the app reads the same API via its configured base URL.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for detailed platform instructions.

---

## License

See [`LICENSE`](./LICENSE).
