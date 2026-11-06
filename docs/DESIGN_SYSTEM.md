# DESIGN_SYSTEM.md — MrElectric Attendance Ops

Design system for the QR-verified shift attendance application. This document is the single source of truth for tokens, type, colour, motion, layout and shared component rules introduced by the Hallmark redesign. It operates on the **app-screens genre** (dashboards / tables / forms) at full depth — tokens, system, composition and content change; business logic and wiring do not.

---

## 1. Principles

1. **Tokens first.** Every colour and font passes through a token declared on `:root`. No literal colour or `font-family` past the token block (Hallmark Floor 48).
2. **Status carries meaning, not decoration.** Present / Late / Half Day / Absent / Overtime / Flagged are semantic; they use the semantic tokens below, never ad-hoc literals.
3. **Motion communicates state.** Only `transform` and `opacity` animate (Floor 10a). No `transition: all`, no animating `width`/`height`/`top`/`left`. Every animation has a `prefers-reduced-motion` fallback (Floor 27).
4. **Focus is visible.** Every interactive element gets a `:focus-visible` ring (Floor 26a).
5. **One idea per screen.** Primary action discoverable; check-in/scan is the face of the product for employees.
6. **Accessibility is a floor, not a feature.** Contrast ≥ 4.5:1 for body text, 3:1 for large text/icons/focus rings; hit targets ≥ 44px on mobile.

---

## 2. Colour tokens

All tokens are defined once in `src/index.css :root`. Components reference tokens only; they never re-declare hex/rgb literals (a few drawing targets inside the QR raster are exempt — the QR code itself must remain white-on-black for the scanner).

| Token | Value | Use |
|---|---|---|
| `--color-bg-primary` | `hsl(224, 25%, 5%)` | App canvas |
| `--color-bg-secondary` | `hsl(224, 22%, 8%)` | Sidebar / drawers |
| `--color-bg-card` | `hsl(224, 20%, 12%)` | Cards, tables |
| `--color-bg-elevated` | `hsl(224, 18%, 16%)` | Raised surfaces, hover |
| `--color-bg-hover` | `hsl(224, 18%, 20%)` | Interactive hover |
| `--color-border` | `hsla(220, 20%, 90%, 0.08)` | Default border |
| `--color-border-subtle` | `hsla(220, 20%, 90%, 0.05)` | Low-emphasis divider |
| `--color-border-hover` | `hsla(220, 20%, 90%, 0.16)` | Border on hover |
| `--color-text-primary` | `hsl(220, 20%, 96%)` | Headings, primary text |
| `--color-text-secondary` | `hsl(220, 12%, 70%)` | Body, labels |
| `--color-text-muted` | `hsl(220, 10%, 48%)` | Meta, captions |
| `--color-accent` | `hsl(217, 91%, 60%)` | Primary action, focus ring |
| `--color-accent-dim` | `hsla(217, 91%, 60%, 0.12)` | Accent washes |
| `--color-success` | `hsl(152, 69%, 45%)` | Present / online / success |
| `--color-warning` | `hsl(38, 95%, 55%)` | Late / break / warning |
| `--color-danger` | `hsl(0, 72%, 58%)` | Absent / flagged / error |
| `--color-info` | `hsl(199, 89%, 55%)` | Checked out / info |
| `--color-purple` | `hsl(270, 75%, 65%)` | Overtime |

Each semantic colour has a `-dim` companion for washed backgrounds and a `-glow` used only where a live pulse is functionally meaningful (e.g. live indicator).

### Rules
- **Accent is a signal, not a fill.** A single primary button per screen uses the accent; everything else stays on neutral surfaces.
- **No gradient text.** Heading gradients are removed.
- **Status is never colour-only.** Every status shows an icon/prefix *and* colour (colourblind-safe).
- **No pure black/white surfaces.** QR raster drawing is exempt; UI chrome uses surface tokens.

---

## 3. Typography

Two families (Hallmark Floor: at most two, one outlier role):

| Role | Family | Face | Use |
|---|---|---|
| UI / body | `Inter` | `--font-sans` | All body, labels, controls |
| Data / time | `JetBrains Mono` | `--font-mono` | Timestamps, counts, tokens, durations |

### Scale (fluid, base 16px)

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Page title (h1) | `clamp(1.4rem, 2.2vw, 1.75rem)` | 600 | −0.025em |
| Section title (h2/h3) | `1.05rem` | 600 | −0.02em |
| Body | `0.9rem–1rem` | 400 | 0 |
| Supporting/labels | `0.8rem` | 500 | 0 |
| Caption/meta/table head | `0.72–0.78rem` | 500 | 0 |
| Data/mono | `0.75–0.82rem` | 500 | 0 |

### Rules
- **No uppercase / tracked labels** (Floor 67). Labels, captions, table heads, nav and chips are sentence case, untracked. Existing uppercase text is converted to sentence case.
- **No middle-dot-joined meta** (Floor 63). `"Token XXX · Station"` and similar become grouped meta rows (label/value pairs or the separated by plain spacing).
- **No eyebrow labels.**
- Body text `min-width: 0` / `overflow-wrap: break-word` on display heads and grid tracks.

---

## 4. Motion

### Tokens
| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 100ms | Press feedback |
| `--duration-press` | 140ms | Press |
| `--duration-fast` | 180ms | Microinteractions |
| `--duration-normal` | 240ms | Standard UI |
| `--duration-modal` | 320ms | Modal enter |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Arrivals |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Toggles |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sidebar drawer |
| `--ease-fluid` | `cubic-bezier(0.16, 1, 0.3, 1)` | Large motion |
| `--transition-fast` | `var(--duration-fast) var(--ease-out)` | Shorthand (added) |
| `--transition-normal` | `var(--duration-normal) var(--ease-out)` | Shorthand (added) |

### Rules
- **Only `transform`/`opacity` animate.** Fixed: timeline cursor now uses `transform: translateX(var(--cursor-pct))` (was `left`); week-chart bars use `transform: scaleY(var(--pct))` (was `height`); team quick cards no longer use `transition: all`.
- **One reveal per screen max.** The staggered `fadeUp` everywhere is reduced to a single screen-level reveal.
- **Reduced motion.** All keyframes/transitions respect `@media (prefers-reduced-motion: reduce)`; under it, reveals show the end state at once. The global reduced-motion block in `index.css` covers all new motion.

---

## 5. Spacing, radius, elevation

| Token | Value |
|---|---|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |
| `--space-3xl` | 64px |

| Token | Value |
|---|---|
| `--radius-xs` | 4px |
| `--radius-sm` | 8px |
| `--radius-md` | 12px |
| `--radius-lg` | 18px |
| `--radius-xl` | 24px |
| `--radius-full` | 9999px |

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px var(--color-border)` |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px var(--color-border)` |
| `--shadow-lg` | `0 12px 36px rgba(0,0,0,0.45), 0 0 0 1px var(--color-border)` |
| `--shadow-xl` | `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px var(--color-border)` |

- Decorative glows (blue/purple halo) are removed; elevation is expressed through surface colour + border + shadow.
- Radius discipline: one radius per nesting level (cards `--radius-lg`, inner panels `--radius-sm/md`, pills `--radius-full`).

---

## 6. Shared components

### Buttons
- **Primary** (`.btn-action`): accent surface, accent-contrast ink, one per screen.
- **Secondary** (`.btn-secondary`): outlined, quiet.
- **Danger** (`.btn-danger`): reserved for destructive, confirm-guarded actions.
- Every button: `:hover`, `:active` (transform scale 0.97), `:focus-visible` ring, `:disabled` state, loading spinner state.
- Hit target ≥ 38px desktop, ≥ 44px mobile.

### Inputs / selects
- Single surface + border, `:focus-visible` accent ring, clear label + helper, error state with icon.

### Tables (Team / My Records / Audit)
- Tables first. Column triage at mobile; no body `overflow-x: hidden` clipping (use `overflow-x: auto` on a scoped wrapper).
- Status = coloured dot + label (not emoji, not badge-soup).
- Loading → skeleton rows; empty → icon + message; error → inline message + retry.

### Status pills / badges
- Semantic colours from §2; always text + indicator, never colour-only.

### Toasts
- Custom stack (top-center) preserved; restyled only; enter/exit via `transform`/`opacity`; `pause-on-hover`.

### Navigation chrome
- Sidebar (desktop) + MobileNav (bottom tabs) unified brand **"Mr. Electric Attendance"**.
- Naming unification in the UI surface (backend text untouched).
- Footer claim "v2.3 · Neon & Google Verified" removed (invented metric) → replaced with neutral account label.
- Emoji avatars/icons replaced: initials from name or lucide icons; stored `avatar` glyphs are tolerated but rendered as initials.

---

## 7. States

Every data region must distinguish four states:
1. **Loading** — skeleton rows / spinner.
2. **Empty** — icon + single guidance line.
3. **Error** — inline message + retry affordance.
4. **Data** — filled content.

Action outcomes surface via toasts (already present for actions) with success/error variants.

---

## 8. Accessibility

- `:focus-visible` ring on all interactive elements (added globally in `index.css`).
- `overflow-x: clip` on `html` and `body` (replaces `hidden`).
- Contrast: muted literals replaced by token ink-on-surface pairs.
- Icon-only controls have `aria-label`.
- Clickable divs expose `role="button"` / `tabindex` (present; audit for gaps).
- `prefers-reduced-motion` fully respected.

---

## 9. Theme variants (TweaksPanel)

Keep `data-theme` (electric / emerald / high-contrast) and `data-motion` / `data-density` overrides, but they must recolor via tokens, not literals. Component CSS is being re-pointed to tokens so all three themes stay consistent. (In progress — see REDESIGN_QA.md.)

---

## 10. Non-goals / preserved wiring

- State machine, timers, API contract, offline queue, PDF blob path, timezone policy, Capacitor config: **untouched**.
- Backend: **no changes**.
- No new runtime dependencies for the design pass (lucide-react already installed for icons).
