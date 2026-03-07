# v56 — Workout Flow & Polish

## 1. Setup Instructions (Coach Tab)

New `setup` array field in exercise config schema (like `formTips`). Displayed in the Coach tab as a new section above form tips with a distinct visual style (neutral background, gear/wrench theme).

New setting: `getPref("showSetup", true)` — toggle in Settings, on by default. When off, the setup section is hidden.

## 2. Bottom Nav — Text Only

Remove emoji icons from all nav buttons (TRAIN, shortcuts, MORE). Render only the `navLabel` text. Delete the `nav-btn__icon` span and its CSS rule. Adjust spacing/padding as needed.

## 3. Timer Notification Fixes

**"REST COMPLETE" vanishes instantly**: `getActiveTimer()` only returns timers with `running:true`. Once marked done, next tick returns `null` and `setDisplay(null)` fires. Fix: also return timers where `done:true` so FloatingTimer keeps showing the completion state until dismissed or a new timer starts.

**Sound/vibration only fires once**: Multiple paths can race to mark a timer done (FloatingTimer tick vs visibilitychange handler). Add a `notified` flag to timer objects so `sendTimerNotification()` is called exactly once per timer lifecycle, but guaranteed.

**No auto-dismiss**: Keep the green "REST COMPLETE" banner visible until the user taps it or starts a new set (which triggers a new timer).

## 4. Auto-Collapse & Auto-Advance

When `allDone` becomes true AND RPE is rated (or `showRir` pref is off), auto-collapse the card after ~500ms delay. Auto-expand the next incomplete exercise card.

Implementation: ExerciseCard detects completion, calls `onComplete(index)` callback. DayView manages which card is expanded via lifted state.

## 5. Weight Input Width

Widen weight input from `width:70` to `width:82` to accommodate 4+ character decimals (12.5, 125.5). Stepper buttons stay at 32px min-width.

## 6. End Session Flow

**Trigger**: All exercise cards complete (all `allDone`).

**First prompt** (inline at bottom of exercise list): "All exercises complete!" with two buttons: "End Session" and "Still have cardio".

**"Still have cardio"**: Scrolls to CardioLog section, optionally highlights it.

**After cardio done**: Second prompt — "Workout complete! End session?" with "End Session" button.

**End Session action**: Calls existing `endSession()`, triggers `CompletionSummary`.
