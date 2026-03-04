# Hypertrophy Tracker — Development Guide

## Architecture Overview

**Zero-build PWA**: React 18 via CDN (`h = React.createElement` shorthand), single `app.js` file (~2150 lines), `styles.css` design system, `sw.js` service worker. No Node.js, no bundler, no transpiler.

**Files:**
- `index.html` — App shell with inline critical CSS, React 18 CDN scripts (SRI hashes)
- `app.js` — All application logic: components, state, storage, utilities
- `styles.css` — CSS variables design system, component classes, animations
- `sw.js` — Service worker: network-first for navigation, stale-while-revalidate for assets
- `configs/profiles.json` — Registry of user profiles
- `configs/<name>.json` — Per-user workout configuration (exercises, days, tips)
- `tests.html` — 60+ automated tests (raw assertions, no framework)

## Key Conventions

### Every Release Must:
1. Bump `APP_VERSION` in app.js (line ~40)
2. Update `WHATS_NEW` array in app.js
3. Bump `CACHE_NAME` version in sw.js (e.g., `hypertrophy-v23` → `hypertrophy-v24`)
4. Update README.md changelog section

### Code Style
- `h = React.createElement` — all UI built with `h()` calls, not JSX
- `var` for all declarations (no `let`/`const` — ES5-compatible style throughout)
- Functions use `function` keyword, not arrow functions
- Semicolons used; single-line chaining common for compact code
- Component state: `var s=useState(initial),value=s[0],setter=s[1]`

### Storage System
- **localStorage** with profile-prefixed keys: `ht_[profile]_[key]`
- `lsGet(k)` / `lsSet(k,v)` — JSON parse/stringify wrappers
- `LS` global = `"ht_" + PROFILE + "_"` — set by `initProfile()`
- **Preferences**: `getPref(k, default)` / `setPref(k, v)` — stored as `pref_[key]`
- **Per-exercise units**: `getExUnit(exId)` / `setExUnit(exId, unit)` — stored as `eu_[exId]`
- **Day data**: `loadDayData(dayId, date)` → `{exercises: {exId: [{weight,reps,done}]}, warmups, rpe, exNotes, setRir, _skipped}`
- **Key format**: `[dayId]@[YYYY-MM-DD]` for workout data
- **Session date lock**: `getSessionDate()` locks to prevent midnight boundary issues
- **Auto-save**: 300ms debounce via `saveDayData()`

### React Contexts
1. **TimerContext** (line ~359): Global rest timer management
   - `triggerTimer(exKey, seconds)`, `getTimer(exKey)`, `setTimer(exKey, val)`, `getActiveTimer()`
   - Timer objects: `{total, startedAt, running, done, waitingPartner}`
   - `useTimers()` hook to access
2. **DayDataContext** (line ~411): Workout data persistence
   - `getData(dayId)`, `saveData(dayId, data)`, `invalidate()`
   - `useDayData()` hook to access
   - `rev` counter triggers re-renders on data change

### Exercise Config Schema
```json
{
  "id": "unique_id",           // Storage key — NEVER change after data exists
  "name": "Exercise Name",
  "sets": 4,
  "reps": "8-10",              // Range or fixed; "/leg" suffix for unilateral display
  "rest": 90,                  // Seconds
  "machine": false,            // Shows machine base weight option
  "notes": "Short card note",
  "tip": "Detailed coaching tip",
  "increment": 5,              // Weight jump for overload (default: 5)
  "muscles": ["chest", "triceps"],  // For volume tracking
  "rir": "1-2",                // Target RIR display
  "tempo": "3-1-2",            // Eccentric-pause-concentric
  "alternatives": ["Alt 1"],   // Swap options
  "supersetGroup": "ss1",      // Pairs exercises
  "bilateral": true,           // L/R side tracking
  "formTips": ["Tip 1"],       // Coach tab form cues
  "commonMistakes": ["Err 1"], // Coach tab mistakes
  "alternativeTips": {"Alt 1": "Tip for alt"}  // Tips for swapped exercises
}
```

**Muscle keys**: `chest`, `back`, `quads`, `hamstrings`, `glutes`, `front_delt`, `side_delt`, `rear_delt`, `biceps`, `triceps`, `calves`, `abs`

### Component Hierarchy
```
App
└── TimerProvider
    └── DayDataProvider
        └── MainApp
            ├── Header (day tabs, session timer, fatigue)
            ├── DayView
            │   ├── ReadinessCheck (conditional on pref)
            │   ├── DeloadOptions (week 4 only)
            │   ├── ExerciseCard (per exercise)
            │   │   ├── SetLogger (weight/reps/done per set)
            │   │   │   └── RIR buttons (conditional on pref)
            │   │   ├── RestTimer
            │   │   ├── RPERating
            │   │   ├── HistoryPanel + StrengthChart
            │   │   ├── Coach tab (tip, formTips, commonMistakes)
            │   │   ├── ExerciseNotes
            │   │   ├── CardExtras (warmups, machine weight)
            │   │   └── QuickLogBtn
            │   ├── CardioLog
            │   └── SessionRPE
            ├── FloatingTimer (fixed position above nav)
            ├── Bottom Nav (Train/Volume/PRs/More)
            └── Modals (Settings, VolumeDashboard, PersonalRecords, etc.)
```

### Key Functions Reference

**Progressive Overload** (line ~208):
- `getOverloadSuggestion(dayId, exercise)` — Returns `{type, from, to, msg}` or null
- Types: `"weight"` (increase), `"hold"` (RIR too low), `"volume"` (add set), `"reps"` (reps first)
- Guards: won't suggest increase if avg RIR ≤ 1

**Volume Tracking** (line ~975):
- `calcWeeklyVolume(config, dayData)` — Scans Mon-Sun of current week, counts done sets per muscle
- `calcPreviousWeekVolume(config)` — Same for 7-14 days ago
- `calcMuscleFrequency(config)` — Count of days each muscle appears

**History** (line ~120):
- `buildHistoryIndex()` — Scans localStorage, builds `_historyIndex` cache
- `getHistory(dayId, exId, limit)` — Returns `[{date, sets}]` excluding today
- `updateHistoryIndex(dayId, date, data)` — Live updates cache without rebuild

**Exercise Swaps** (line ~180):
- Stored per day+date: `swaps_[dayId]_[date]`
- `applySwaps(exercises, dayId)` — Returns modified array with `_swappedFrom`, updated `tip`
- Carries `alternativeTips` and `alternativeFormTips` from config

**Bilateral Exercises** (ExerciseCard):
- When `exercise.bilateral === true`, exId is suffixed with `_L` or `_R`
- SetLogger receives suffixed exId, so each side stores data independently
- Completion counts both sides combined
- History/overload work per-side automatically via suffixed IDs

**Unit Conversion** (SetLogger):
- On kg↔lbs toggle, converts all logged weights in current data
- Stores original source values in `eu_source_[exId]` so converting back is lossless
- Rounding: kg → nearest 0.5kg, lbs → nearest 5lbs

**Timer Sound** (line ~547):
- `playTimerSound()` — AudioContext two-tone beep (880Hz + 1100Hz)
- Controlled by `getPref("timerSound", true)`
- Called from `sendTimerNotification()` alongside vibration and browser notification

### Settings Preferences
| Key | Default | Description |
|-----|---------|-------------|
| `unit` | `"lbs"` | Global default weight unit |
| `autotimer` | `true` | Auto-start rest timer on set completion |
| `timerSound` | `true` | Play audio on timer completion |
| `showRir` | `false` | Show RIR buttons after set completion |
| `showWellness` | `false` | Show pre-session readiness check |

### CSS Design System
- Dark theme: `--bg: #0a0a0f`, `--surface: #141419`
- Accent: `--accent: #f59e0b` (orange/yellow)
- Status colors: `--success` (green), `--danger` (red), `--info` (purple), `--warmup` (violet)
- Touch targets: minimum 44px height
- Animations: `fadeIn`, `setDone` (pop), `pulse` (timer), `celebrate` (completion)
- Responsive: single breakpoint at 500px (sheet border-radius, completion grid)

### Testing
- Open `tests.html` in browser — runs all tests automatically
- Tests cover: plate calculator, overload logic, date utilities, rep range parsing, config validation
- No test framework — raw `console.assert` style with pass/fail counts

### Common Gotchas
- Exercise `id` is the storage key — changing it orphans all historical data
- `getSessionDate()` may differ from `today()` due to session date locking
- FloatingTimer renders at `bottom: 56px` (nav height) — no additional padding
- `calcWeeklyVolume` scans all 7 days Mon-Sun via `loadDayData(dayId, dateStr)`
- Unit conversion stores source values — clearing `eu_source_[exId]` breaks round-trip
- Bilateral exercises use suffixed IDs (`exId_L`, `exId_R`) — history is per-side
- `_skipped` map in dayData tracks skipped exercises — excluded from next-exercise logic
