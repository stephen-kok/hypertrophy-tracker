# 🏋️ HYPERTROPHY TRACKER

A mobile-first workout tracker built as a PWA (Progressive Web App). Designed to run from your phone's home screen with offline support, rest timers with haptic feedback, progressive overload coaching, and multi-profile support.

![Dark theme gym UI](https://img.shields.io/badge/theme-dark_gym-0a0a0f?style=flat-square) ![PWA](https://img.shields.io/badge/PWA-offline_ready-f59e0b?style=flat-square) ![Profiles](https://img.shields.io/badge/multi-profile-818cf8?style=flat-square)

---

## Features

**During your workout**
- Expandable exercise cards with weight/reps logging per set
- One-tap quick log — copies last set's numbers, marks complete, and auto-starts rest timer
- Rest timer with visual countdown, preset buttons (45s / 60s / 90s / 2m / 2:30), and vibration on completion
- Warm-up set tracking (separate from working sets, hidden behind disclosure toggle)
- Machine base weight memory (set once per machine, persists forever)
- Session timer that starts automatically on your first logged set
- Exercise substitution — swap exercises mid-session from config alternatives
- Superset partner display for paired exercises
- Tempo timer with phase-based countdown (eccentric / pause / concentric / pause)

**Coaching intelligence**
- Progressive overload prompts — when you hit the top of your rep range on all sets, the app tells you to add weight with exercise-specific increments
- Previous session ghost values as input placeholders — tap to auto-fill
- RPE rating (6-10) after completing each exercise with contextual feedback
- Per-set RIR (Reps in Reserve) tracking with compact 0-4 buttons
- Pre-session readiness check (sleep, soreness, energy, stress — rated 1-5)
- Deload options with 4 strategies (intensity, volume, both, active recovery)
- Full coaching tips for every exercise covering setup, execution, and common mistakes

**Periodization**
- Undulating periodization mode with mesocycle-aware rep targets
- 4-week mesocycle blocks: Accumulation → Intensification → Peak → Deload
- Automatic rep range shifting based on mesocycle week

**Tracking**
- Session completion summary with total volume, time, new PRs, and average RPE
- Session comparison — side-by-side delta view between sessions
- Training frequency analytics with compact tiles
- Cardio logging (12-3-30 protocol with duration/incline/speed) with fatigue integration
- Body metrics (bodyweight and waist measurement with trend history and SVG chart)
- Exercise history showing your last 30 sessions per exercise
- Data export/import as JSON for backups with profile namespace validation

**Technical**
- Works offline after first load via service worker
- Add to home screen on iOS/Android for full-screen native feel
- All data stored locally on-device via localStorage with quota warning
- Multi-profile support — one app serves unlimited users via URL parameter
- Session date locking prevents midnight boundary data splitting
- SRI integrity hashes on CDN scripts
- 60+ automated tests (tests.html)

---

## Usage

Access the app via your GitHub Pages URL with a profile parameter:

```
https://yourusername.github.io/hypertrophy-tracker/?profile=stephen
```

Visiting without a profile parameter shows a profile selector screen.

### Adding to your phone

1. Open your profile URL in Safari (iOS) or Chrome (Android)
2. Tap **Share → Add to Home Screen**
3. The app launches full-screen with no browser chrome

---

## Adding a New Profile

**1. Create a config file**

Add a new JSON file in the `configs/` folder (e.g., `configs/mike.json`). Follow this structure:

```json
{
  "profile": "mike",
  "name": "Mike",
  "program": "4-Day Upper/Lower Split",
  "subtitle": "Upper / Lower / Upper / Lower",
  "days": [
    {
      "id": "upper1",
      "label": "Upper",
      "day": "Mon",
      "title": "Upper Body A — Push Focus",
      "subtitle": "Description of the day's focus.",
      "exercises": [
        {
          "id": "u1e1",
          "name": "Bench Press",
          "sets": 4,
          "reps": "6-8",
          "rest": 150,
          "machine": false,
          "notes": "Short cue shown on the card",
          "tip": "Detailed coaching tip shown on expand.",
          "increment": 5
        }
      ]
    }
  ]
}
```

**Key fields:**
| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Unique per exercise across the whole config. Used as storage key. |
| `name` | Yes | Display name |
| `sets` / `reps` | Yes | Reps can be a range like `"8-10"` or fixed like `"12"`. Append `/leg` for unilateral. |
| `rest` | Yes | Rest time in seconds |
| `machine` | Yes | `true` shows the machine base weight option |
| `increment` | No | Weight jump for overload prompts (default: 5 lbs) |
| `tip` | No | Coaching notes shown when expanded |
| `tempo` | No | Tempo string e.g. `"3-1-2-0"` (eccentric-pause-concentric-pause) |
| `alternatives` | No | Array of substitute exercise names |
| `supersetGroup` | No | Group ID to pair exercises as supersets |
| `rir` | No | Target RIR for the exercise |
| `bilateral` | No | `true` for exercises done per-side (e.g. split squats) |
| `formTips` | No | Array of form cue strings shown in Coach tab |
| `commonMistakes` | No | Array of common mistake strings shown in Coach tab |
| `alternativeTips` | No | Object mapping alternative names to their coaching tips |

**2. Register the profile**

Add an entry to `configs/profiles.json`:

```json
{
  "profiles": [
    { "id": "stephen", "name": "Stephen", "program": "5-Day Hypertrophy Split" },
    { "id": "mike", "name": "Mike", "program": "4-Day Upper/Lower Split" }
  ]
}
```

**3. Share the link**

```
https://yourusername.github.io/hypertrophy-tracker/?profile=mike
```

No changes to `index.html` needed. Each profile's data is fully isolated in localStorage.

---

## Repo Structure

```
├── index.html              ← App shell (shared across all profiles)
├── app.js                  ← Application logic (React components, ~2150 lines)
├── styles.css              ← Design system (CSS variables + component classes)
├── sw.js                   ← Service worker for offline caching
├── tests.html              ← Automated test suite (60+ tests)
├── manifest.json           ← PWA manifest
└── configs/
    ├── profiles.json       ← Registry of all available profiles
    ├── stephen.json        ← Individual workout config
    └── james.json          ← Individual workout config
```

---

## Data & Privacy

All workout data is stored locally on each user's device via `localStorage`. Nothing is sent to any server. The GitHub Pages site serves only static files — the config JSON and the app shell.

Export your data regularly via **Settings → Export All Data** to guard against browser cache clearing.

---

## Tech Stack

Vanilla JavaScript with React 18 (CDN), no build step. Extracted CSS design system (`styles.css`) with CSS variables. Service worker for offline caching. Designed to be maintainable without any tooling — edit the JSON configs and push to GitHub.

---

## Changelog

### v30 — Training Intelligence, UX Polish & Fatigue Insights (2026-03-04)

**Phase 2 — Training Intelligence**
- RPE autoregulation: RIR 0 suggests -5% weight for remaining sets
- Rest time analysis in History tab with drift detection (>15s threshold)
- 4-week fatigue trend chart (RPE+RIR blend) in More menu
- Per-muscle selective deload control in week 4

**Phase 3 — UX Polish**
- Badge overflow: collapsed cards show 2 badges max with +N indicator
- Swipe dot indicators below day tabs
- Stepped onboarding (3-step overlay for new users)
- Weekly calendar strip showing training activity
- Collapsible settings sections

**Tests**
- RPE weight reduction calc, rest time drift detection, fatigue score thresholds

### v29 — 4-Persona Review: Accessibility, Training Intelligence, Performance, Tests (2026-03-04)

**Phase 1 — Accessibility & Quick Wins**
- WCAG AA contrast: raised `--text-muted` to #8e95a3, `--text-dim` to #8b8fa8 (~5.7:1 ratio)
- Added `@media (prefers-reduced-motion: reduce)` to disable all animations
- Fixed `[role="tabpanel"]:focus` to `:focus-visible` for keyboard visibility
- Added `scrollbar-width:none` for Firefox scrollbar hiding
- Added `defer` to React/ReactDOM/app.js script tags for non-blocking load
- Added `<noscript>` fallback for JS-disabled browsers
- Added `useFocusTrap` to More menu overlay
- Added `role="button"`, `tabIndex`, and keyboard handler to calendar day cells
- Added `aria-describedby` to ConfirmDialog for screen reader descriptions
- Removed unconditional `self.skipWaiting()` from SW install (use message-based activation)

**Phase 2 — Training Intelligence**
- Overload: 80% set completion threshold (`Math.floor(sets*0.8)`) replaces strict 100%
- Added "hold" suggestion for struggling users (RIR ≤ 1 but not hitting target reps)
- Machine `repsFirst` now requires `effectiveRange.max >= 12` (was always-on for increment ≤ 2.5)
- Capped `targetReps` at 30 to prevent absurd high-rep suggestions
- Added "Active Recovery" badge on exercise cards during deload skip weeks
- Fatigue thresholds adjusted (high ≥ 9.5, moderate ≥ 8.5) for hypertrophy training
- Body composition chart: independent Y-axis normalization per metric (weight vs waist)
- Readiness adjustments now auto-modify SetLogger: volumeMult reduces sets, intensityMult adjusts ghost weights

**Phase 3 — Performance**
- Debounced `calcFatigueScore` (500ms) — eliminates 40+ localStorage reads per keystroke
- Added `console.warn` for non-QuotaExceeded localStorage errors

**Phase 4 — Tests & Infrastructure**
- New test suites: 80% threshold, repsFirst machine logic, targetReps cap, session date locking, unit conversion round-trip, input validation boundaries
- Updated test-local `getOverloadSuggestion` to match production logic
- Replaced tautological input validation assertions with meaningful boundary tests

### v28 — 4-Persona Review & Bug Fixes (2026-03-04)
- Fixed effective volume filter: only counts sets at RIR ≤ 2 (was counting all sets)
- Mesocycle-aware overload suggestions now use weekly undulating rep targets
- Fixed previous-week volume comparison (was using rolling window instead of Mon-Sun block)
- Fixed bilateral RIR guard — hold-weight suggestion now works for bilateral exercises
- Focus trap on all modals/dialogs for keyboard accessibility
- Toast queue system prevents message loss from rapid events
- Calendar drill-down: tap workout dates to see exercise details
- CSV export for session history
- Bilateral history shows L/R labels per set
- History manifest optimization for faster startup
- Dynamic SW config caching on profile load
- Timer double-fire guard (500ms debounce)
- Fixed showRir default to match documented behavior (off by default)
- Fixed timer auto-dismiss useEffect dependency
- 7 new test suites covering RIR trends, volume filter, periodization, bilateral counting
- Custom exercises now support muscle group assignment for volume tracking
- Added missing exercise alternatives across both config profiles

### v27 — Infrastructure & Reliability (2026-03-04)
- Cross-tab data sync via `storage` event prevents corruption with multiple tabs open
- Service worker update is now user-controlled (no more mid-session race conditions)
- Auto-backup every 7 days with downloadable snapshots in Settings > Data
- Per-profile config files precached in service worker for offline access

### v26 — Power User Features (2026-03-04)
- Workout calendar heatmap with month navigation and color-coded training intensity
- Rep-range PRs: filter personal records by e1RM, 1RM, 3RM, 5RM, 8RM, or 10RM
- In-app profile switcher button in Settings

### v25 — Training Intelligence (2026-03-04)
- Readiness check now suppresses overload suggestions when fatigue is detected
- RIR trend analysis across 3 sessions detects approaching overreach
- High fatigue score triggers deload suggestion with one-tap activation
- Volume targets auto-scale by mesocycle week (W1: 85%, W2: 100%, W3: 110%, W4: 50%)
- Rest periods tracked per set with average displayed in exercise history
- Auto-advance mesocycle when all training days complete for the week

### v24 — Quick Wins: Defaults, UX, Reliability (2026-03-04)
- RIR tracking now enabled by default for better auto-regulation feedback
- Offline indicator banner when internet connection is lost
- "Apply to all sets" button copies weight from first set to remaining empty sets
- Custom rest timer presets (configurable in Settings)
- Larger weight/reps input fields (16px font, 44px min-height) for easier gym use
- Persistent storage-full warning banner (replaces dismissable toast)
- Volume Dashboard empty state with guidance message

### v23 — Comprehensive Review Update (2026-03-03)
**UX & Usability**
- Auto-expand next exercise card for faster workout flow
- Enlarged touch targets on timer presets, swap buttons, and stepper controls
- Haptic feedback on weight/rep steppers
- Better text contrast (--text-dim now WCAG AA compliant)
- Pinch-to-zoom re-enabled (removed user-scalable=no)

**Training Intelligence**
- Effective volume filtering — only counts sets at RIR ≤ 4
- Permanent exercise swaps (lock icon persists across sessions)
- RPE/RIR trend mini-chart below strength chart
- PR detection with celebration badge on new e1RM records
- Workout streak counter in session completion summary
- Exercise config overrides — customize sets/reps/rest per exercise
- Overload uses max weight across all sets (not just first set)
- Machine exercises default to 2.5 increment (was 5)
- History expanded to 30 sessions (was 12)

**Reliability**
- Backup reminder every 14 days
- Storage quota warning with extended toast duration
- Export includes version metadata for safer imports
- CDN failure fallback with reload prompt
- Separated CDN caching in service worker for partial connectivity

**Programming**
- Tempo guidance added to all exercises in both configs
- Standing calf raises added for gastrocnemius coverage (Stephen & James)
- Romanian Deadlift added to James's Legs day for hip hinge coverage
- Additional coaching cues: squat foot placement, bench wrist alignment, RDL spine cue
- Removed side_delt from overhead presses (front_delt only)

**Tests**
- Added unit conversion test suite
- Added volume counting and ascending overload tests
- Fixed calc1RM test divergence (10-rep cap)

### v22 — Form Tips, Auto-End Session, Timer Toast (2026-03-03)
- Added formTips and commonMistakes to all exercises in both config files (Coach tab now fully populated)
- Session auto-ends after 30 minutes of inactivity (also detects stale sessions from previous days)
- Toast notification shown on rest timer completion for better visibility
- Browser notifications already work when on a different screen (existing feature)

### v21 — Fix Bilateral History in Overload, Deload, and History Panel (2026-03-03)
- Overload suggestions now work for bilateral exercises (was silently skipping them)
- Deload weight targets use bilateral history (was showing 0 weight)
- Deload suggestion fallback uses bilateral history
- History tab shows bilateral exercise history (was always empty)
- Deload warnings detect bilateral exercise RPE trends

### v20 — Bug Fixes: History, Hooks, Extra Sets (2026-03-03)
**Bilateral History**
- PR detection and personal records now query bilateral `_L`/`_R` history keys (fixes false PRs every session)
- Previous week volume trend includes bilateral exercises
- Added `getBilateralHistory()` helper for merged L/R history lookups

**Stability**
- TempoTimer hooks moved before early returns (fixes Rules of Hooks violation)
- SetLogger preserves extra/drop sets on re-mount instead of truncating to prescribed count
- `countBilateralDone` capped at prescribed sets (prevents progress exceeding 100%)
- `workingWeight` memo now reacts to data changes (fixes stale warmup auto-ramp)
- UndoToast hides Undo button when no undo action is provided

### v19 — Bug Fixes: Bilateral Aggregates, Timer, Settings (2026-03-03)
**Bilateral Tracking Fixes**
- Bilateral exercises (L/R) now correctly counted in weekly volume dashboard
- Progress bar and day tab completion include bilateral sets
- Session completion summary includes bilateral volume and PRs
- Personal Records page detects bilateral exercise data
- Next-exercise detection handles bilateral completion correctly
- QuickLogBtn writes to correct bilateral-suffixed key (no more data split)

**Timer & Settings**
- Fixed double notification (vibration + sound) on timer completion
- Settings toggles (RIR, Wellness, Timer Sound) now visually update immediately on tap
- Fixed unit conversion stale closure — saves source weights from current state

**Service Worker**
- Config JSON files (profiles, stephen, james) added to precache for full offline support
- Fixed unhandled promise rejection on background revalidation when offline

**Data**
- Added missing `focus` field to james.json config
- Fixed unstable e1RM memo dependency for bilateral exercises

### v18 — UX Overhaul, Sound, Bilateral Tracking (2026-03-03)
**Bug Fixes**
- Weekly volume dashboard now correctly aggregates all days of the current week (Mon-Sun), not just today
- Timer floating bar sits flush above bottom nav (removed gap from safe-area padding)

**Sound & Notifications**
- Two-tone audio chime (AudioContext) plays on rest timer completion
- "REST COMPLETE" visual popup persists for 5 seconds instead of immediately vanishing
- Timer sound toggle in Settings (on by default)

**Settings & Toggles**
- RIR tracking is now an optional setting (on by default) — toggle in Settings
- Wellness check (readiness poll) is now an optional setting (off by default) — toggle in Settings

**UX Improvements**
- "UP NEXT" badge changes to "IN PROGRESS" once you start logging sets on an exercise
- Exercise swap button moved from History tab to card header (⇄ icon) for quick access
- Clickable RIR badge opens explanation modal (0=failure through 4=light effort)
- Next undone set highlighted with yellow/accent background in set logger
- Skip/Discard exercise button — marks exercise as skipped with dashed border and reduced opacity
- Skipped exercises excluded from "next exercise" logic

**Weight Conversion**
- Auto-converts logged weights when toggling between kg and lbs (rounded to nearest 0.5kg or 5lbs)
- Stores original values so converting back recovers exact numbers (no rounding drift)

**Coach Tips**
- Coach tab now shows categorized sections: Performance, Form Cues, Common Mistakes
- Coach tips update when exercise is swapped (via `alternativeTips` in config)
- Added `formTips` and `commonMistakes` to bench press, squat, and other key compounds

**Exercise Config**
- Added alternatives to 20+ exercises that were previously missing swap options
- Cable fly alternatives: Pec Deck, Dumbbell Fly, Low-to-High Cable Fly
- Hanging leg raise alternatives: Cable Crunch, Ab Wheel Rollout, Weighted Leg Raise, Dragon Flag
- Added alternatives for curls, tricep extensions, lateral raises, rows, and more

**Bilateral Tracking**
- Exercises with `"bilateral": true` in config show Left/Right toggle tabs
- Each side tracks sets independently with its own weight/reps/completion
- Combined progress shown in card header (e.g., "4/6 sets")
- Bulgarian Split Squat configured as bilateral in both profiles

**Display**
- E1RM badges now show units (e.g., "e1RM 185 lbs" instead of "e1RM 185")
- Completed exercise cross-out uses green color at higher opacity with thicker line
- Completed exercise cards get a green left border accent

### v17 — Phases 5-8: Close the Loop, UX, Reliability, Maturity (2026-03-02)
**Phase 5 — Close the Loop**
- Readiness check now adjusts workout (volume & intensity reduction based on score)
- Deload strategies apply real changes: reduced weights, halved sets, or active recovery
- RIR integration into overload algorithm — won't suggest weight increase at RIR 0-1
- Volume progression: suggests adding extra sets when stuck at same weight for 3 sessions
- Superset rest logic: timer waits for both exercises before starting rest

**Phase 6 — UX Tightening**
- Touch target audit: all interactive elements meet 44px minimum (stepper, checkboxes, RPE)
- Haptic feedback (vibration) on set completion
- Save indicator flash confirming auto-save
- Extra set visual distinction with accent left border
- Session timer dropdown chevron for discoverability
- Swipe gesture refinement (80px threshold, 2x angle ratio)
- Completion summary changed from blocking full-screen to dismissible bottom sheet

**Phase 7 — Architecture & Reliability**
- Config validation on load with clear error messages for malformed JSON
- Per-exercise card error boundaries (graceful degradation instead of full-app crash)
- e1RM Epley formula capped at 10 reps for accuracy
- What's New modal for returning users after version updates
- App version tracking to control feature announcements

**Phase 8 — Product Maturity**
- One-tap backup export from completion summary
- Week-over-week volume trend per muscle group in Volume Dashboard
- Previous week comparison with delta arrows

### v16 — Phases 0-4: Training Intelligence & Periodization (2026-03-02)
**Phase 0 — Foundation**
- SRI integrity hashes on React CDN scripts
- Expanded test suite to 60+ tests (plate calculator, overload logic, date edge cases)
- localStorage quota detection with user warning
- Minimal FOUC prevention in `index.html`

**Phase 1 — Data Integrity & UX Fixes**
- Midnight boundary fix: session date locking prevents data splitting across days
- Import validation checks profile namespace to reject cross-profile imports
- Card simplification: warmups & machine weight hidden behind disclosure toggle
- Toast repositioned to avoid floating timer overlap

**Phase 2 — UX Enhancements**
- Exercise substitution system (session-scoped swaps from config alternatives)
- Restructured "More" tab with quick-access grid (Body Metrics, Session History, Settings)
- Enhanced onboarding with 4-step numbered guide
- Improved empty states with icons and actionable suggestions

**Phase 3 — Training Intelligence**
- Pre-session readiness check (sleep, soreness, energy, stress — 1-5 scale)
- Per-set RIR tracking with compact 0-4 buttons after set completion
- Deload options with 4 strategies (intensity, volume, both, active recovery)
- Superset partner display for paired exercises
- Tempo timer with phase-based countdown
- Enhanced fatigue scoring blending RPE + RIR + cardio data

**Phase 4 — Periodization & Analytics**
- Undulating periodization mode with mesocycle-aware rep targets
- Training frequency analytics tiles in volume dashboard
- Body composition trend chart (SVG line chart)
- Session comparison with side-by-side delta view
- Cardio fatigue integration (+0.15 per cardio session to fatigue score)

### v10 — Major Rewrite (2026-03-02)
**Architecture & CSS**
- Extracted full design system to `styles.css` with CSS custom properties
- Replaced inline styles throughout `app.js` with semantic CSS classes
- Trimmed `index.html` inline CSS to critical-path only

**UI Overhaul**
- Tabbed exercise cards (Log | History | Coach) replacing single accordion view
- Bottom navigation bar (Train | Volume | PRs | More) replacing header icon buttons
- Grouped settings panel with Tools section for Body Metrics and Session History
- Full-screen completion overlay with session stats

**Accessibility**
- ARIA labels, roles (`tablist`, `tab`, `tabpanel`, `dialog`), and `aria-selected`/`aria-modal` attributes on all interactive elements
- Focus-visible outlines for keyboard navigation

**Training Intelligence**
- Fatigue score calculated from recent RPE history, displayed in header
- Custom editable volume targets per muscle group
- Mesocycle tracking (4-week blocks) with deload warnings
- Shareable session summaries via Web Share API

**Data & Performance**
- Auto-save with debounce to reduce localStorage writes
- Service worker cache bumped to v10 with `styles.css` included

### v9 — Phases 11-14 (prior)
- Data integrity, progress visualization, power features, code quality

### v8 — Phases 7-10 (prior)
- Training intelligence, data insights, code quality, session controls

### v7 — Phase 6 (prior)
- UX polish: stepper buttons, set animation, confirm dialog
