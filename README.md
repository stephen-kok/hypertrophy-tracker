# 🏋️ HYPERTROPHY TRACKER

A mobile-first workout tracker built as a PWA (Progressive Web App). Designed to run from your phone's home screen with offline support, rest timers with haptic feedback, progressive overload coaching, and multi-profile support.

![Dark theme gym UI](https://img.shields.io/badge/theme-dark_gym-0a0a0f?style=flat-square) ![PWA](https://img.shields.io/badge/PWA-offline_ready-f59e0b?style=flat-square) ![Profiles](https://img.shields.io/badge/multi-profile-818cf8?style=flat-square)

---

## Features

**During your workout**
- Expandable exercise cards with weight/reps logging per set
- One-tap quick log — copies last set's numbers, marks complete, and auto-starts rest timer
- Rest timer with visual countdown, preset buttons (45s / 60s / 90s / 2m / 2:30), and vibration on completion
- Warm-up set tracking (separate from working sets)
- Machine base weight memory (set once per machine, persists forever)
- Session timer that starts automatically on your first logged set

**Coaching intelligence**
- Progressive overload prompts — when you hit the top of your rep range on all sets, the app tells you to add weight with exercise-specific increments
- Previous session ghost values as input placeholders — tap to auto-fill
- RPE rating (6-10) after completing each exercise with contextual feedback
- Full coaching tips for every exercise covering setup, execution, and common mistakes

**Tracking**
- Session completion summary with total volume, time, new PRs, and average RPE
- Cardio logging (12-3-30 protocol with duration/incline/speed)
- Body metrics (bodyweight and waist measurement with trend history)
- Exercise history showing your last 5 sessions per exercise
- Data export/import as JSON for backups

**Technical**
- Works offline after first load via service worker
- Add to home screen on iOS/Android for full-screen native feel
- All data stored locally on-device via localStorage
- Multi-profile support — one app serves unlimited users via URL parameter

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
├── app.js                  ← Application logic (React components)
├── styles.css              ← Design system (CSS variables + component classes)
├── sw.js                   ← Service worker for offline caching
├── manifest.json           ← PWA manifest
└── configs/
    ├── profiles.json       ← Registry of all available profiles
    └── stephen.json        ← Individual workout config
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
