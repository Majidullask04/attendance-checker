# DESIGN_AUDIT.md — MrElectric Attendance Ops

Full-depth Hallmark redesign audit. Codebase: React 19 + Vite 8 frontend, Node/Express + PostgreSQL (Neon) backend, Capacitor 8 Android shell. Audit date: 2026-11-04.
Redesign scope: **app-screens genre (dashboards/tables/forms), full depth** — tokens, system, composition, and content all change; logic and wiring do not.

---

## 1. Product & users

**What it is.** A QR-verified shift attendance system for an electrical-services company ("Mr. Electric / Mr. Electricals"). Employees scan a rotating station QR code to check in/out, take breaks (with QR-verified resume), and log overtime after 17:00 IST. Admins monitor the live team ledger, approve signups, rotate tokens, export a signed PDF attendance report, and correct records with an auditable justification.

**Users.**
1. **Employee / technician** — mobile-first (Capacitor Android APK + phone browser). Primary flows: scan QR to check in, start break, scan again to resume, OT toggle after 5 PM, view own records/history.
2. **Admin (owner)** — desktop browser primarily. Primary flows: live team ledger, per-employee drilldown, signup approvals, token/QR station management, PDF export, audit trail, record corrections.

**Environment realities the design must respect.** Works offline (queued scans sync later), works inside a WebView on Android, status colors carry contractual meaning (Present / Late / Half Day / Absent / Overtime / Flagged), and the system enforces a hard Asia/Kolkata clock (06:00–09:00 window, 13:50 break notify, 17:00 workday end).

---

## 2. Screen inventory

| Route (view id) | File | Roles | Purpose | Data regions |
|---|---|---|---|---|
| Login | `src/screens/auth/Login.jsx` | public | Email/password + Google OAuth entry; dev preset accounts modal | form |
| Signup | `src/screens/auth/Signup.jsx` | public | Registration (name/email/password/department); pending-approval messaging | form |
| PendingApproval | `src/screens/auth/PendingApproval.jsx` | blocked | Explains approval gate; logout | message |
| Dashboard | `src/screens/Dashboard.jsx` | employee | Status card, shift timeline (DayTimeline), week chart, today activity | status + timeline + bar chart + list |
| CheckIn | `src/screens/CheckIn.jsx` | both | QR scan (camera), generate QR (admin), break panel, OT panel, quick actions | scanner + actions + live timers |
| MyRecords | `src/screens/MyRecords.jsx` | employee | Personal history list w/ type filter, weekly summary | table/list + stats |
| Team | `src/screens/Team.jsx` | admin | Employee table (status, hours, OT, break), drilldown per employee | table + drawer/list |
| AuditLog | `src/screens/AuditLog.jsx` | admin | Record correction console with justification | table + form |
| AdminApprovals | `src/screens/AdminApprovals.jsx` | admin | Approve/reject pending signups | list + actions |

**Shell.** `src/App.jsx` gates by auth state; `Sidebar` (desktop) + `MobileNav` (bottom tab) provide IA of 5 employee items (Dashboard, Check In, My Records, Setting?) and 9 admin items (incl. Team, Approvals, Audit, Admin). Toasts via custom `src/components/Toast.jsx` (sonner-style stack rendered from a bespoke store — the `sonner` npm package is installed but effectively unused as a shadow dep).

---

## 3. Component inventory

- **Chrome:** `Sidebar.jsx`, `MobileNav.jsx`, `Toast.jsx` (stack + `addToast` API), `TweaksPanel.jsx` (theme/motion/density demos: `data-theme` electric/emerald/high-contrast, `data-motion` snappy/fluid/reduced, `data-density` compact).
- **Business:** `QRScanner.jsx` (html5-qrcode camera + manual paste + dev simulate), `QRGenerator.jsx` (admin station QR via `qrcode.toDataURL`, station token manager), `DayTimeline.jsx/.css` (shift schedule canvas: check-in/out/break/OT markers + now cursor), `AdminGuard.jsx`, `GoogleAuthModal.jsx` (3 preset dev accounts).
- **Primitives (informal, CSS-only):** `.btn-*` (action/ghost/danger/ot), `.input`, `.card`, `.stat-*`, `.section-*`, `.badge-*`, `.team-*`, `.rec-*`, table row styles, `.empty-state`, `.offline-banner`, `.sonner-toast`.
- **Hooks:** `useNow.js`, `useTimer.js`.
- **State/API:** `store/useStore.js` (608 lines: state machine `idle→checking_in→checked_in ⇄ on_break/ot_active → checking_out`, offline queue, admin 10s polling, 13:50 notify, fictional-confidence-free stats), `api/client.js` (fetch wrapper, retry, offline-aware request, sync-batch, PDF blob), `auth/AuthContext.jsx`, `lib/neonAuth.js`.

---

## 4. Current design system (as-is)

- **Type:** Inter (body/UI) + JetBrains Mono (timestamps, tokens, clocks). No scale discipline: font sizes scattered across 9–42px with several one-off values (`9.5px`, `10.5px`, `13.6px`).
- **Color tokens (index.css):** dark surface stack `--bg-950:#0a0c10 … --bg-850:#151a24`, ink from #f5f7fa down, accent blue hue 217°, semantic red/green/amber; gradients on surfaces (brand gradient card headers) and buttons (`.btn-action`, `.btn-checkin…` are gradient-filled).
- **But:** most components in `App.css` bypass tokens with raw literals — `#0d1117`, `#11151c`, `#e6edf3`, `#58a6ff`, `#8b949e`, `#7ee787`, `#ffa657`, `#f85149` (GitHub-dark-ish palette drift), plus pure `#000`/`#fff` literals in QR components and `@keyframes`, and literal `rgba(0,0,0,…)`/`rgba(255,255,255,…)` overlays.
- **Radius:** mixed `12px/14px/16px/20px/28px` + `50%` pills; no thirded scale.
- **Spacing:** ambiguous values `4 6 8 10 12 14 16 18 20 22 24 28 32 40 …` — no 4/8 rhythm audit done originally.
- **Shadows:** 8+ one-off shadows; several large colored glows (blue/purple) purely decorative.
- **Focus:** no global `:focus-visible` styling; links default UA outline; many interactive divs (`.day-hint-chip` etc.) act as buttons.
- **Theme variants:** three TweaksPanel themes recolor via `data-theme` attribute but most component CSS uses hardcoded literals, so variants are inconsistent (electric nearest current, emerald green, high-contrast).

**Verdict:** token layer exists in name; component layer diverges. The redesign must land one real token system and re-point every component rule.

---

## 5. Information architecture

- Employee nav (sidebar): Dashboard, Check In (primary), My Records. Admin adds: Team, Approvals, Audit Log, Admin (QR manager), plus Tweak demo entry. Mobile: bottom tabs, top bar.
- IA is reasonable; **primary action placement is broken** — check-in/check-out/break/OT buttons live inside the Check In screen, and the scan surface is buried below long explainer text and quick-action blocks. For a tool people use 6–8 times a day, the scan affordance must be the screen.
- Naming drift: "MrElectric Attendance Ops" (login brand), "Mr. Electricals" (PDF header), "Mr. Electric" (derived admin name from email). Redesign unifies the brand surface in the UI (backend text untouched).
- Sidebar footer hardcodes `v2.3 · Neon & Google Verified` — invented marketing claim inside nav chrome; must go.
- Middle-dot-joined meta strings recur ("Token XXX · Station", "12 Mar · 08:45 AM · Main Warehouse") — violates Floor 67.

---

## 6. Interaction & states audit

- **Store machine (preserve):** `idle → checking_in → checked_in ⇄ on_break | ot_active → checking_out` (+offline state). UI states derive correctly; Check In screen renders the right panel per state.
- **Loading states:** ad-hoc. Some async regions show inline spinners (`.spinner`, `scan-loading`), but team table, records list, audit table have no dedicated skeleton/loading rows — data region appears instantly empty then fills: two different data regions show the same visual for "loading" and "empty" (violates four-state rule).
- **Empty states:** present in records/audit with icon + line; inconsistently styled; some regions (team drilldown panel, approval list when empty) show nothing.
- **Error states:** API errors are surfaced via toasts (`addToast`) — good enough for actions — but data-regions have no inline error/refresh affordance (e.g. team fetch fails → silent empty table).
- **Disabled/busy:** buttons get `.disabled` class or inline spinner; double-submit protection exists in store (`checking_in` guard). Keep.
- **Optimistic/offline:** offline banner + queue badge exist; queued scans are labeled in activity feed. Keep, and make queue state first-class in the redesign (not a footnote).
- **Toasts:** custom stack (top-center), stacked with transform math, `pause-on-hover`, swipe-out on click. Technically sound; restyle only.

---

## 7. Animation inventory (as-is)

| Animation | Location | Verdict |
|---|---|---|
| `transition: all` on `.team-quick-card`, with `var(--transition-fast)` — token **undefined** anywhere | App.css | Floor violation (10c) + dead style token; must be replaced with explicit property transitions |
| `.timeline-now-cursor` animates `left` | DayTimeline.css | Floor 10a violation (layout prop). Replace with transform |
| `.week-chart-bars` bar heights animate via `height` | App.css | Floor 10a; chart bars should animate `transform: scaleY()` with static height |
| `.sonner-toast` enter/exit via `transform + opacity` | App.css/Toast.jsx | Correct particle; keep math, restyle |
| `.spinner` rotate | App.css | Correct particle (transform) |
| `fadeIn/fadeUp` keyframes on section contents | App.css | Multiple simultaneous reveals; reduce to one reveal per screen (Floor 13) |
| Decorative gradient/pulse on status hero, glow pulses | App.css | Remove (motion = state, not decoration) |
| Reduced-motion fallback | index.css (`prefers-reduced-motion` block) | Present but incomplete after new keyframes; extend to all motion |
| Manual TweaksPanel `data-motion="snappy|fluid|reduced"` | App.css | Keep as user override; wire to same durations tokens |

---

## 8. Data-viz audit

- **Week chart (Dashboard):** CSS `height`-animated bars with gradient fills, separate legend chips. Per `data-viz.md`: bars should be `transform: scaleY` from a baseline, single neutral fill + accent for the highlight, no gradients; label days on x-axis, hours on y-axis max; no 3D/gauge. Rebuild as inline SVG or transform-based bars in the stat-tile row system.
- **DayTimeline:** horizontal shift timeline with course markers + live cursor — this is a genuinely good "stat row / status bar" pattern; redesign as a true line chart-with-intervals (SVG or flex bars) with correct axis mapping.
- **Stat tiles:** dashboard has a grid of count cards (present/late/absent…) — currently visually equal-weight "card soup" with emoji icons. Redesign as a single stat row (numeric first, tiny label, delta only when real).
- No donuts/gauges anywhere — good; keep it that way.

---

## 9. Responsive behavior audit

- Breakpoint chaos: `@media (max-width: 768/820/900/1024/1170/1280)` and a few `min-width:` — no single mobile-first order; several rules fight (768 hides sidebar, but 820 also adjusts it, 900 blocks grid changes).
- The admin Team table at 768px: no graceful column triage — table overflows horizontally with `overflow-x: hidden` on body (data clipped, not scrollable) — violates Floor 11 (`overflow-x: hidden` must be `clip` / or allow scoped scroll).
- Capacitor 390px: QR scanner modal fits, but quick action grid + scanner + explainer text stack over ~4 screens of scroll; bottom MobileNav (safe-area aware) collides with Scanner while open.
- Login screens `Login.jsx` use fixed 100vh centering — works on phones but not on landscape/short windows (no scroll) — repair with min-height + scroll.

---

## 10. Accessibility audit

- **Contrast:** muted text `#8b949e` on `#0d1117` ≈ 4.6:1 (borderline OK); `#565f73`+ small labels fall below 4.5:1 in several spots (badges, table meta, sidbar group headings). Gradient-text headers fail.
- **Focus:** no `:focus-visible` system; `outline: none` removes keyboard affordance on `.btn-*`/inputs in some rules. Must add visible focus ring token everywhere.
- **Semantics:** icon-only buttons (sidebar collapse, scan controls) lack aria-labels; several clickable divs missing `role="button"`/tabindex; table headers exist (good) but status conveyed by color only (no icon/prefix) for colorblind users.
- **Hit targets:** many action chips/badges < 32px tall; sidebar items ~36px; must reach 32–40px control with 44px hit area on mobile.
- **Motion:** prefers-reduced-motion handled globally, but manual TweaksPanel reduced option isn't equivalent in coverage.
- **i18n:** strings in English only; fine (en-IN audience is target).

---

## 11. Bugs & code smells found (to fix opportunistically — no feature change)

1. **AdminApprovals double store** (`src/screens/AdminApprovals.jsx` imports and calls `useAttendanceStore()` itself): creates a second store instance whose `addToast` is never shown on the real Toast stack. Redesign will pass toast callbacks through root App state (same pattern AuditLog uses? — verify at edit time) so approvals show feedback. No logic change beyond de-duplicating store instantiation.
2. `var(--transition-fast)` referenced but never defined → `transition: all` silently uniform.
3. `.timeline-now-cursor { transition: left }` — layout thrash per tick; also the cursor jumps.
4. `overflow-x: hidden` on html/body hides canvas overflow instead of allowing clip — replaced by `clip` (+ scoped `overflow-x: auto` for tables).
5. Emoji-as-icon all over: 👑 (admin avatar/model), 👷 (employee), ⚡ (brand + favicon + OT CTA), QR placeholders. Backend seeds `users.avatar` with these strings — frontend redesign renders initials/status avatars from `name`/fonts instead, ignoring stored avatar glyphs without touching backend or schema. Note favicon (index.html) uses an emoji — replace SVG favicon needs no new assets (inline SVG bolt replaceable with abstract mark, still no binary asset).
6. Uppercase tracked labels everywhere: section headings, sidebar groups, `.btn` text? (verify at edit), PDF-only styling is out of scope.
7. OTP of gradients: `.btn-checkin/checkout/ot`, login card, dashboard hero — all replaced by single-accent flat design.
8. `#000`/`#fff` in `App.css` (QR scanner mask, `.qr-preview` borders? etc.) replaced with surface tokens; QR code imagery itself remains white-on-black (rendering requirement of html5-qrcode) — acceptable; it's a drawing target, not UI chrome.
9. Status legend uses ambiguous amber/orange pair (late vs half-day) — keep semantics identical (backend labels unchanged), refine iconography/labels only.
10. `VITE_API_URL` empty in dev defaults to `http://localhost:3001/api` but backend dev port uses `3001` origin allowed — consistent.
11. `sonner` dependency unused effectively (import exists in Toast.jsx? verify; safe to ignore wiring) — NOT removing the dep (no package.json changes needed for design task).

---

## 12. Hallmark Floor gate report (app scope)

App-scope skips gates: 1, 6, 8, 9, 32, 42, 44, 46b, 58, 59, 66, 68, 77–79, 81–83, F8, F15, F20. Remaining applicable gates:

- **G3 (uppercase/tracked caps):** VIOLATED throughout (sidebar groups, section titles, badges, buttons). Fix all.
- **G4 (no pure black/white surfaces):** violated in QR overlays + some shadows. Fix (drawing targets exempt).
- **G7 (no emoji-as-icon):** violated (avatars, OT CTA, station copy, favicon). Fix via inline SVG icons (lucide-react already installed) and initial-avatars.
- **G10c (no `transition: all`):** violated (1+ instances). Fix.
- **G10 (only transform/opacity/clip-path/filter):** violated (bar `height`, cursor `left`). Fix.
- **G11 (`overflow-x: hidden` → `clip`):** violated. Fix.
- **G13 (one reveal max per screen):** violated (`fadeUp` on everything). Fix.
- **G67 (no middot-joined meta):** violated (many). Fix with grouped meta layout.
- **G30a/G30 (invented metrics/props):** footer "Neon & Google Verified", "Cryptographically Signed Ledger" (PDF is backend text — out of scope), "confidence" numbers are real (simulated in backend seed? actual randomInt on server — real DB value, keeps). Remove invented claims from frontend surfaces.
- **G48/contrast:** muted literals failing; replaced by token ink-on-surface pairs.
- **G34/`!important` audit:** several `!important` overrides in App.css to flatten during redesign.

---

## 13. Constraints — wiring that MUST survive

- **State machine & timers:** `useStore.js` untouched (idempotent redesign touches presentation JSX/CSS only; helper logic like adding a className stays).
- **API contract** (confirmed by backend read): `/api/auth/{signup,login,neon-sync,me,pending,approve,reject}`, `/api/auth/users/:id DELETE`, `/api/auth/profile PUT`; `/api/attendance/{policy,check-in,check-out,break,ot,scan,sync-batch,records,team,summary,report/pdf,audit,correct/:id}`; `/api/qr-token/{current,regenerate}`; `/api/health`.
- **QR pipeline:** html5-qrcode camera + asset rendering; manual paste; dev sim buttons; admin generate/rotate.
- **Offline:** queue in localStorage; sync-batch behavior; offline banner.
- **PDF:** button downloads blob; do not touch client code path.
- **Timezone:** all IST logic from policy/*.
- **Auth:** JWT `attendance_token`, PENDING_APPROVAL state, admin email allowlist, GIS + Neon fallback, GoogleAuthModal presets (dev convenience kept intact).
- **Capacitor:** `server.url` points to onrender prod; Android safe areas (env(safe-area-inset-bottom)) already in MobileNav — keep.
- **Backend:** no changes. `avatar` DB field may contain emoji — tolerate in renderer (strip if present, render initials), never crash.

---

## 14. Priority register (feeds DESIGN_SYSTEM.md)

1. **Tokens first:** full 4-byte ink/surface/accent/semantic/motion/density set = single source; every component rule re-pointed.
2. **Table/grid density-first:** Team/MyRecords/Audit are tables-first; statuses as colored dot + label (not emoji, not badge-soup).
3. **Scanner as the product's face:** Check In screen = big scan surface + state primary action, explanations in a compact side/below section; machine state visible as a segmented progress row (idle → checked in → break → OT) rather than prose cards."
4. **Stat system:** single stat row + timeline = dashboard; week chart rebuilt as SVG-permissive transform bars, no gradients.
5. **Motion:** duration micro 120 / short 220; queues, toasts, cursor on transform; one reveal per screen max; full prefers-reduced-motion coverage.
6. **Chrome:** Sidebar/MobileNav unified brand, group IA kept, footer claims removed, no uppercase tracked labels; 44px targets on mobile.
7. **States:** every data region gets explicit loading/empty/error/full variants (TweaksPanel demo harness makes testing possible).
8. **Brand unification:** one name surface in UI ("Mr. Electric Attendance"), favicon inline SVG replacing emoji, literal claim strings removed from UI while backend PDF copy (out of scope) stays.
