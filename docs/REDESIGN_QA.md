# Redesign QA — Attendance Checker

Status of verification for the Hallmark-guided redesign of the attendance-checker
application. This document records only what was **actually executed and observed**.

## Build & lint

| Gate | Command | Result |
|---|---|---|
| Production build | `npm run build` (vite) | ✅ PASSED — 1959 modules, `dist/` 717 kB JS / 65 kB CSS |
| Lint | `npm run lint` (oxlint) | ✅ PASSED — 0 errors, 43 warnings (all pre-existing) |

Warnings are pre-existing and untouched by this redesign:

- `backend/middleware/auth.js` — unused catch params (`_localErr`, `_dbErr`, `_neonErr`)
- `src/lib/neonAuth.js` — unused catch param `_e`
- `src/store/useStore.js` — `preserve-manual-memoization` (4×) and `set-state-in-effect` (1×) React Compiler notes

No new errors or warnings were introduced.

## Code changes verified (diff vs HEAD)

| File | Change |
|---|---|
| `src/index.css` | Added `--transition-fast` / `--transition-normal` tokens (were referenced but never defined); `overflow-x: clip` on `html` + `body` (was `hidden`/none); global `:focus-visible` ring (Floor 26a); reduced-motion block retained; line-ending-only reformat of token block |
| `src/components/DayTimeline.jsx` | Cursor positioning via `--cursor-pct` custom property instead of inline `left` (Floor 10a) |
| `src/components/DayTimeline.css` | Cursor uses `transform: translateX(var(--cursor-pct, 0%))` — GPU-composited, no layout thrash |
| `src/components/Sidebar.jsx` | Replaced invented metric text with honest, data-derived value; removed emoji role-badge fallback |
| `src/screens/CheckIn.jsx` | Uppercase tracked label → sentence case |
| `src/screens/Dashboard.jsx` | Middle-dot meta string removed (Floor 63); week-chart bars use `--pct` scaleY path |
| `src/App.css` | `transition: all` narrowed to specific properties; week-chart bar `height` animation → `transform: scaleY()` |
| `src/utils/formatters.js` | Emoji-as-icon fallbacks → `getInitials()` letter avatar |

## Functional preservation

No backend routes, business logic, auth flows, attendance-calculation rules, or
Capacitor wiring were modified. All changes are presentation-layer only.

## Not yet performed (honest gaps)

- **Live browser screenshot verification** — headless browser session over the running
  dev server (desktop / mobile viewports) was **not** completed. `npm run build` and
  `npm run lint` are the verification actually executed.
- **Workflow walkthroughs** (login → check-in QR → break countdown → check-out → OT)
  were not re-exercised in a browser.

These remain open for a follow-up pass before considering the visual QA complete.

## Remaining known issues

- `dist/` main chunk 717 kB (warning only; not blocking).
- 43 pre-existing lint warnings (see above).
- `docs/` and `.hallmark-refs/` are untracked in git (`.hallmark-refs/` is a local
  working copy of the design reference library and can be removed before commit).
