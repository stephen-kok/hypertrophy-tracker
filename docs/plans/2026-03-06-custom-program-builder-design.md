# Custom Program Builder — Design Document

## Overview

A "Program Builder" accessible from the More menu. Lets users edit their current program or create a blank one from scratch. On first open, copies the JSON config into localStorage as the single source of truth. From then on, the app reads from localStorage instead of the JSON file.

## Data Layer

**Storage:** `lsSet("custom_config", configObject)` — stores the full config shape (same schema as `stephen.json`). When present, the app uses this instead of fetching the JSON file.

**Boot sequence change:** In the `App` component's `useEffect`, after fetching the JSON config, check if `lsGet("custom_config")` exists. If it does, use that instead. If not, use the fetched JSON (and on first Program Builder open, seed localStorage from it).

**Config shape stays identical** — `{profile, name, program, subtitle, days: [{id, label, title, exercises: [...]}]}`. All downstream code (volume, history, overload, Insights) continues to work unchanged because they read from `config.days`.

## UI Components

### ProgramBuilder (overlay from More menu)
- Header: "Program Builder" + Close button
- Program metadata: editable name, subtitle fields
- Day list: each day shown as a card with label, title, exercise count
- Per-day actions: edit, reorder (up/down arrows), delete (with confirm)
- Footer: "+ Add Day" button, "Create Blank Program" button, "Reset to Original" button (re-seeds from JSON)

### DayEditor (sub-view within ProgramBuilder)
- Header: back arrow + day label (editable)
- Day title field (editable)
- Exercise list: each exercise shown as a compact row (name, sets x reps, rest)
- Per-exercise actions: edit, reorder (up/down arrows), delete (with confirm)
- Footer: "+ Add Exercise" button

### ExerciseEditor (sub-view within DayEditor)
- Fields: name, sets (number), reps (text like "8-10"), rest (seconds), machine toggle
- Muscle tags: multi-select grid of muscle groups (same as AddExerciseForm)
- Save / Cancel buttons

## Navigation Flow

```
More Menu -> Program Builder (day list)
  -> tap day -> DayEditor (exercise list)
    -> tap exercise -> ExerciseEditor (fields)
    -> "+ Add Exercise" -> ExerciseEditor (blank)
  -> "+ Add Day" -> DayEditor (blank)
  -> "Create Blank" -> clears all days, stays in builder
  -> "Reset to Original" -> confirm -> re-fetches JSON, overwrites localStorage
```

## Integration with Existing Systems

- **Exercise overrides** (`exo_*` keys): Already exist for per-exercise sets/reps/rest tweaks. When the user edits an exercise in the builder, we write directly to the config. Overrides still apply on top if present.
- **Custom exercises** (`custom_*` keys): Builder replaces this for users who use it. Existing custom exercises left as-is (still append at render time).
- **Swaps** (`swaps_*`, `perm_swaps_*`): Continue to work — operate on exercise IDs which don't change.
- **History/volume**: Keyed on `dayId` and `exId`. As long as IDs aren't changed, history is preserved.

## ID Management

- **Day IDs**: Auto-generated on creation (`day_` + timestamp). Never change after creation.
- **Exercise IDs**: Auto-generated on creation (`ex_` + timestamp). Never change after creation.
- Editing a day's label or exercise's name doesn't change the ID.
- Deleting a day/exercise with history shows a warning: "This will not delete your logged data, but it will no longer appear in your workout."

## Editable Fields (v1)

- Days: add, remove, reorder, edit label/title
- Exercises: add, remove, reorder, edit name/sets/reps/rest/machine toggle
- Muscle tags: multi-select for volume tracking
- Program metadata: name, subtitle

## Not in v1

- Drag-and-drop reordering
- Editing tips, formTips, commonMistakes, alternatives
- Editing tempo, RIR targets, bilateral flag, increment
- Import/export of programs
- Sharing programs between profiles
