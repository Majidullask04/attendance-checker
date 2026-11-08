# Update Notes: v1.2.0 (Zoho People 6-Layer Attendance Architecture)

Implements the full 6-layer Zoho People pipeline — capture → validation → database → workflows → approvals → payroll:

## Layer 2 — Multi-Modal Capture
- Every punch now records `capture_method` (`QR_KIOSK_SIGNED`, `GPS_MOBILE_GEOFENCE`, `BIOMETRIC_TERMINAL`, `REGULARIZED_BY_ADMIN`), `ip_address` (x-forwarded-for aware), `gps_accuracy`, `distance_meters`, `geofence_status`, `arrival_status`, `device_info` (WEB_DESKTOP / ANDROID_CAPACITOR / MOBILE_WEB / KIOSK), `work_mode` + `site_code`.
- New work-mode selector on the Check-In screen (HQ Workshop / EPC Project Site / On-Duty Visit), tagged to each scan.
- `POST /api/attendance/biometric-webhook` — on-site fingerprint/face terminals push punches directly (`x-device-key: BIOMETRIC_DEVICE_KEY` env required). Accepts `IN/OUT/BREAK_IN/BREAK_OUT/OT_IN/OT_OUT`, employee code or email, and reconciles the daily rollup instantly.

## Layer 3 — Validation Rules Engine (`backend/utils/validationEngine.js`, `src/utils/attendancePolicy.js`)
- **Duplicate punch cooldown**: identical punch type within 120s → `409`.
- **Strict shift state machine**: check-in required before break/checkout/OT; open break blocks OT; checkout auto-closes an open break (never corrupts break math).
- **Multi-site geofence**: Haversine distance against `sites_geofences` (HQ Workshop Hyderabad + EPC substations, 250–400m radii). Tags `IN_ZONE` / `OUTSIDE_GEOFENCE` / `APPROVED_ON_DUTY`; out-of-geofence punches are flagged for admin review.
- **IST windows**: 06:00–09:00 on-time · 09:00–09:15 grace buffer · >09:15 late · OT only after 17:00 IST.
- **Day math**: gross − break + permission credit vs 480-min shift; 10-min round-off for a full day; 240-min OT cap.

## Layer 4 — Database (`backend/db.js`, all migrations idempotent)
- `sites_geofences` (seeded), extended `attendance_records` columns, `daily_attendance_summary` (materialized rollup keyed `user_id + date_ist`, auto-recomputed after every punch/approval/offline sync), `workflow_requests`, `audit_logs`.

## Layer 5 — Workflow & Approval Engine (`backend/routes/workflows.js`)
- `GET/POST /api/workflows` + `PATCH /api/workflows/:id/review` for **Regularization** (auto-writes corrected punches as `REGULARIZED_BY_ADMIN`), **Permission** (30–120 min credited toward effective hours), **On-Duty** (`day_status = ON_DUTY`, payable 1.0).
- Approval Center screen now has two tabs — **Attendance Workflows** (status filters + 1-click approve/reject) and **User Accounts** — plus live badge counts on the sidebar.
- Employees raise requests from **My Records** via the Raise Request bar/modal.

## Layer 6 — Reports, Dashboard & Payroll
- `GET /api/reports/payroll-muster?month=YYYY-MM` — monthly muster matrix (`P`, `HD`, `OD`, `REG`, `A`, `WO`) + per-employee payroll totals (payable days, effective hours, deficit hours, OT hours, late count).
- `&format=csv` (or the new **Export Payroll CSV** button on Team → Muster) emits a UTF-8 payroll-ready CSV for Zoho Payroll / accounting import.
- Operations dashboard adds **On-Site Present / On Break / Overtime Active / Pending Workflows** telemetry cards.

---

# Update Notes: v1.1.0 (Timezone Fix, Shift Policy, Break Countdown, OT & PDF Reports)

## 🐛 Bug Fixed: "Scanned but still Absent on the Admin Dashboard"

**Root Cause:**
Day queries previously used PostgreSQL's `recorded_at::date = NOW()::date`. On host platforms like Render or default cloud VMs, the database server runs in **UTC**, whereas staff in India scan in **IST (UTC+05:30)**.
Any morning scan between 06:00 and 09:00 IST corresponds to 00:30–03:30 UTC. If any timezone conversion or edge-of-day boundary shifted, or when querying historical dates, the records fell outside the expected day and staff appeared falsely **Absent**.

**Fix:**
All day queries now use explicit `[from, to)` bounds computed in `Asia/Kolkata` (configurable via `APP_TIMEZONE`):
- `getDayBounds(dateString, 'Asia/Kolkata')` converts calendar day boundaries (`00:00:00.000` to `23:59:59.999` IST) into exact UTC timestamps.
- Queries execute index-friendly range scans: `recorded_at >= $from AND recorded_at < $to`.

---

## ⏰ Implemented Shift Schedule & Rules

| Time (IST) | Behavior & Policy Enforced |
|---|---|
| **06:00 – 09:00 AM** | **Morning Check-In Window**: Scanning the station QR records **Present** (on-time). Scans after 09:00 AM are flagged as **Late**. Employees who do not scan are automatically computed as **Absent** on the Admin dashboard. |
| **01:50 PM (13:50)** | **Break Notification**: In-app toast reminder and Web Notification API trigger. Tapping "Take Break" starts a live **30-minute countdown** (grace limit: 40 minutes). |
| **Break Resumption** | **Mandatory QR Scan**: Employee must scan the station QR to resume their shift. If the break is left unresumed or exceeds 40 minutes, the day's attendance is classified as **Half Day**. |
| **05:00 PM (17:00)** | **Full Day Completion**: Workday completes. Employees can perform normal check-out. |
| **After 05:00 PM** | **Overtime (OT)**: Scanning toggles Overtime sessions (`ot_start` / `ot_end`) with independent OT hour tracking. |
| **Any Day → PDF** | **PDF Attendance Ledger**: Admin selects any date (IST) on the Team screen and clicks **Export PDF Report** to download an audit-ready PDF report with employee names, departments, check-ins, check-outs, break lengths, regular hours, OT hours, and statuses. |

---

## 🗄️ Database Constraint Auto-Migration

PostgreSQL's `attendance_records` table check constraint was updated:
```sql
CHECK (record_type IN ('check_in', 'check_out', 'break_start', 'break_end', 'ot_start', 'ot_end'))
```
On application startup, `backend/db.js` automatically drops the old check constraint if present and applies the new constraint, guaranteeing seamless schema upgrades without manual SQL execution.

---

## 🐳 Docker Deployment & Local Testing

### 1. Run Everything with Docker Compose
```bash
docker compose up --build
```
This starts:
- **PostgreSQL 16**: Port `5432` with volume persistence (`pgdata`).
- **Attendance Web App**: Port `3001` (serving both Express API and built React UI).

Open: [http://localhost:3001](http://localhost:3001)

### 2. Build Container Image Manually
```bash
docker build -t attendance-checker .
docker run -p 3001:3001 -e DATABASE_URL="<postgres-url>" attendance-checker
```

---

## 📁 Updated Files

- `Dockerfile` & `backend/Dockerfile` — Multi-stage and standalone container manifests
- `docker-compose.yml` — Full-stack compose orchestration
- `backend/config/policy.js` — Schedule policy & timezone boundary calculation
- `backend/db.js` — Auto-migration of `record_type` check constraint for OT
- `backend/routes/attendance.js` — Range-based queries, break timer, OT router, and PDF report streaming
- `backend/package.json` — Added `pdfkit`
- `backend/server.js` — Static frontend serving for production container
- `src/config/policy.js` — Client-side schedule rules
- `src/hooks/useNow.js` — Live IST clock hook
- `src/components/DayTimeline.jsx` / `DayTimeline.css` — Interactive visual shift timeline
- `src/api/client.js` — Break, OT, date-aware team queries, and PDF download methods
- `src/store/useStore.js` — Shift state management, break countdown, and 1:50 PM notification
- `src/screens/CheckIn.jsx` — Break countdown UI, QR resumption enforcement, and post-5 PM OT
- `src/screens/Team.jsx` — Date picker, PDF export button, and full-detail attendance table
- `src/screens/Dashboard.jsx` — Embedded DayTimeline and shift event labels
- `src/screens/MyRecords.jsx` — Badge labels for break and OT events
- `src/App.css` — Table, pill, badge, and timer styles
