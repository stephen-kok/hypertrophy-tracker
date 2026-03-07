# v56 — Workout Flow & Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix timer notification bugs, add setup instructions to Coach tab, text-only bottom nav, auto-collapse/advance exercise cards, widen weight inputs, and add end-session prompts.

**Architecture:** All changes in existing `app.js`, `styles.css`, and `sw.js`. No new files. Exercise config gains an optional `setup` array field. Timer system gets a `notified` flag. DayView lifts card expansion state to coordinate auto-collapse/advance. End-session prompt is a new inline component rendered conditionally in DayView.

**Tech Stack:** React 18 via CDN, `h = React.createElement`, `var` declarations, `function` keywords.

---

### Task 1: Fix Timer — "REST COMPLETE" Banner Vanishes Instantly

**Files:**
- Modify: `app.js:710-713` (`getActiveTimer`)
- Modify: `app.js:984-995` (FloatingTimer useEffect tick)

**Step 1: Fix `getActiveTimer` to also return done timers**

In `app.js:710-713`, change `getActiveTimer` to return timers that are either `running` OR `done` (but not `waitingPartner`):

```js
var getActiveTimer=useCallback(function(){
  var keys=Object.keys(timersRef.current);
  // Prioritize running timers, then done timers
  var doneKey=null;
  for(var i=0;i<keys.length;i++){
    var t=timersRef.current[keys[i]];
    if(t&&t.running)return{key:keys[i],timer:t};
    if(t&&t.done&&!t.waitingPartner&&!doneKey)doneKey=keys[i];
  }
  if(doneKey)return{key:doneKey,timer:timersRef.current[doneKey]};
  return null;
},[]);
```

**Step 2: Add dismiss handler to FloatingTimer**

In `app.js:978` (FloatingTimer), when the user taps the done banner, clear the timer from `timersRef` so the banner disappears:

In the `isDone` branch of the return JSX (~line 1006), add an `onClick` to the container div:

```js
onClick:isDone?function(){timers.setTimer(display.key,null)}:undefined
```

**Step 3: Run tests**

Open `tests.html` in browser. Expected: all existing tests pass.

**Step 4: Commit**

```
feat: fix REST COMPLETE banner vanishing instantly

getActiveTimer now returns done timers so FloatingTimer keeps
showing the green banner until tapped or a new timer starts.
```

---

### Task 2: Fix Timer — Sound/Vibration Only Fires Once

**Files:**
- Modify: `app.js:700` (`triggerTimer` — add `notified:false`)
- Modify: `app.js:720-724` (visibilitychange handler — check `notified`)
- Modify: `app.js:988-990` (FloatingTimer tick — check `notified`)

**Step 1: Add `notified` flag to timer objects**

In `app.js:700`, add `notified:false` to the timer object created in `triggerTimer`:

```js
timersRef.current[exKey]={total:seconds,startedAt:Date.now(),running:true,done:false,notified:false};
```

**Step 2: Guard notification calls with `notified` flag**

In `app.js:722-724` (visibilitychange handler), change:
```js
if(t&&t.running&&t.startedAt){
  if(Math.floor((Date.now()-t.startedAt)/1000)>=t.total){
    t.running=false;t.done=true;t.notified=true;changed=true;sendTimerNotification();
  }
}
```

In `app.js:990` (FloatingTimer tick), change the `left===0&&active.timer.running` block:
```js
if(left===0&&active.timer.running){var updated=Object.assign({},active.timer,{running:false,done:true,notified:true});timers.setTimer(active.key,updated);sendTimerNotification()}
```

Also guard against double-notification in `app.js:990` — check `!active.timer.notified`:
```js
if(left===0&&!active.timer.notified){var updated=Object.assign({},active.timer,{running:false,done:true,notified:true});timers.setTimer(active.key,updated);sendTimerNotification()}
```

**Step 3: Remove the `_lastTimerNotif` 500ms debounce**

In `app.js:967-969`, remove the `_lastTimerNotif` variable and the early return guard in `sendTimerNotification`. The `notified` flag now prevents double-fire, so this debounce is no longer needed:

```js
function sendTimerNotification(){
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
  playTimerSound();
  if(navigator.serviceWorker&&navigator.serviceWorker.controller){navigator.serviceWorker.controller.postMessage({type:"SHOW_TIMER_NOTIFICATION"})}
  else if("Notification"in window&&Notification.permission==="granted"){try{new Notification("Rest Complete",{body:"Time to start your next set!",tag:"rest-timer"})}catch(e){}}
}
```

**Step 4: Run tests**

Open `tests.html` in browser. Expected: all pass.

**Step 5: Commit**

```
fix: timer sound/vibration now fires reliably every rest completion

Added notified flag to timer objects so sendTimerNotification is
called exactly once per timer lifecycle. Removed racy 500ms debounce.
```

---

### Task 3: Bottom Nav — Text Only (Remove Icons)

**Files:**
- Modify: `app.js:2664-2666` (bottom nav render)
- Modify: `styles.css:151` (`.nav-btn__icon` rule)

**Step 1: Remove icon spans from nav buttons**

In `app.js:2664`, the Train button — remove the `nav-btn__icon` span:
```js
h("button",{onClick:function(){setNavTab(0)},className:"nav-btn"+(navTab===0?" nav-btn--active":""),"aria-label":"Train","aria-current":navTab===0?"page":undefined},h("span",{className:"nav-btn__label"},"TRAIN")),
```

In `app.js:2665`, the shortcut buttons — remove the `nav-btn__icon` span:
```js
navShortcuts.map(function(id){var def=NAV_SHORTCUTS_DEF.find(function(d){return d.id===id})||NAV_SHORTCUTS_DEF[0];return h("button",{key:id,onClick:function(){if(shortcutActions[id])shortcutActions[id]()},className:"nav-btn"+(shortcutActive[id]?" nav-btn--active":""),"aria-label":def.label,"aria-current":shortcutActive[id]?"page":undefined},h("span",{className:"nav-btn__label"},def.navLabel))}),
```

In `app.js:2666`, the More button — remove the `nav-btn__icon` span:
```js
h("button",{onClick:function(){setShowMore(true)},className:"nav-btn","aria-label":"More"},h("span",{className:"nav-btn__label"},"MORE")));
```

**Step 2: Update nav label font size**

In `styles.css:152`, increase `.nav-btn__label` font size since it's now the only element:
```css
.nav-btn__label{font-size:11px;font-weight:700;letter-spacing:.5px}
```

**Step 3: Remove `.nav-btn__icon` CSS rule**

Delete `styles.css:151` (`.nav-btn__icon{font-size:18px}`).

**Step 4: Also remove icons from Settings nav shortcut picker**

In `app.js:2430`, remove the icon from the slot label:
```js
h("div",{style:{fontSize:12,fontWeight:700,color:"var(--text-primary)",marginBottom:6}},"Slot "+(slot+1)+" \u2014 "+curDef.label),
```

In `app.js:2432`, remove the icon from the picker buttons:
```js
NAV_SHORTCUTS_DEF.map(function(def){return h("button",{key:def.id,onClick:function(){handleSlot(slot,def.id)},className:"btn btn--xs "+(curShortcuts[slot]===def.id?"btn--accent":"btn--ghost")},def.label)})))});
```

**Step 5: Run tests, verify visually**

Open `tests.html`. Expected: all pass.

**Step 6: Commit**

```
feat: text-only bottom nav — remove emoji icons
```

---

### Task 4: Widen Weight Input

**Files:**
- Modify: `app.js:1261` (weight input style)

**Step 1: Change weight input width**

In `app.js:1261`, change `style:{opacity:set.done?.55:1}` — but the width is not inline here. Look at the stepper grid. The weight input inside the stepper has no explicit width — it uses `className:"input"` which has `width:100%`. The stepper container is in a grid column with `1fr`. This should auto-size. However, line 1147 (warmup/machine weight input) has `style:{width:70}`.

Actually re-reading line 1261: the weight input in SetLogger does NOT have an explicit width — it inherits `width:100%` from the `.input` class and fills its grid column. The grid columns are `28px 1fr 1fr [lastCol]`. So the issue may be that the `1fr` columns are too narrow on small screens with the stepper buttons taking space.

The fix: widen the `.stepper` input by adjusting the grid or the stepper button min-width. Actually the real issue is likely the `1fr` space with 2x 32px stepper buttons leaves very little room for the input text.

Increase the `.input` min-width inside steppers, or reduce stepper button width. Best approach: set the weight input `min-width` to accommodate 4+ chars. In `app.js:1261`, add a `style` with `minWidth:48`:

```js
h("input",{type:"number",inputMode:"decimal",placeholder:ghostWeight||"\u2014",value:set.weight,onChange:function(e){update(i,"weight",e.target.value)},onFocus:function(){if(!set.done&&!set.weight&&ghostWeight){update(i,"weight",ghostWeight)}},className:"input",style:{opacity:set.done?.55:1,minWidth:48},"aria-label":"Set "+(i+1)+" weight"}),
```

Also reduce stepper button min-width from 32px to 28px in `styles.css:122`:
```css
.stepper-btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:5px;width:28px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--text-muted);flex-shrink:0;padding:0;min-height:44px;min-width:28px}
```

**Step 2: Run tests**

Open `tests.html`. Expected: all pass.

**Step 3: Commit**

```
fix: widen weight input to prevent clipping on decimal values
```

---

### Task 5: Setup Instructions in Coach Tab

**Files:**
- Modify: `app.js:1529-1539` (Coach tab render in ExerciseCard)
- Modify: `app.js:2380` area (Settings — add toggle)
- Modify: `configs/*.json` (add `setup` arrays to exercises — sample data)

**Step 1: Add settings toggle for setup instructions**

In `app.js` SettingsPanel, after the `showExBadges` toggle (~line 2415), add a new toggle:

```js
h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Setup Instructions"),h("div",{className:"settings-row__desc"},"Show machine/equipment setup tips in Coach tab")),h(Toggle,{on:showSetup,onToggle:function(){var next=!showSetup;setShowSetup(next);setPref("showSetup",next)},label:"Show setup instructions"})),
```

Add state for it near the other setting states (~line 2383):
```js
var s11u=useState(function(){return getPref("showSetup",true)}),showSetup=s11u[0],setShowSetup=s11u[1];
```

**Step 2: Render setup section in Coach tab**

In `app.js:1529`, in the coach tab panel, add a setup section BEFORE the performance tip. Insert right after the `activeTab==="coach"&&h("div",{role:"tabpanel"` line:

```js
exercise.setup&&exercise.setup.length>0&&getPref("showSetup",true)?h("div",{style:{padding:10,borderRadius:10,background:"rgba(255,255,255,0.03)",border:"1px solid var(--border)",fontSize:12,color:"var(--text-primary)",lineHeight:1.6,marginBottom:8}},
  h("div",{style:{fontSize:10,fontWeight:700,color:"var(--text-muted)",marginBottom:4}},"SETUP"),
  exercise.setup.map(function(t,i){return h("div",{key:i,style:{display:"flex",gap:6,marginBottom:2}},h("span",{style:{color:"var(--text-muted)"}},"•"),t)})):null,
```

**Step 3: Update the "no tips" fallback condition**

In `app.js:1539`, update the empty-state check to include `setup`:
```js
!exercise.tip&&!(exercise.formTips&&exercise.formTips.length)&&!(exercise.commonMistakes&&exercise.commonMistakes.length)&&!(exercise.setup&&exercise.setup.length)?h("div",{style:{fontSize:11,color:"var(--text-dim)",fontStyle:"italic"}},"No coaching tips available."):null,
```

**Step 4: Add sample setup data to a config file**

Pick one config (e.g. `configs/kokstad.json`) and add `"setup": ["Adjust seat so handles are at chest height", "Set pin to appropriate weight"]` to 2-3 machine exercises as examples.

**Step 5: Run tests**

Open `tests.html`. Expected: all pass.

**Step 6: Commit**

```
feat: setup instructions in Coach tab with settings toggle
```

---

### Task 6: Auto-Collapse Card & Auto-Advance to Next Exercise

**Files:**
- Modify: `app.js:1379-1383` (ExerciseCard — lift expanded state, add onComplete callback)
- Modify: `app.js:1292-1302` (RPERating — add onRated callback)
- Modify: `app.js:2294-2345` (DayView — manage expanded index)

**Step 1: Lift expansion state to DayView**

In DayView (`app.js:2294`), add state for which card index is expanded:

```js
var sexp=useState(function(){return nextExIdx>=0?nextExIdx:0}),expandedIdx=sexp[0],setExpandedIdx=sexp[1];
```

**Step 2: Pass expanded/onToggle/onComplete to ExerciseCard**

In `app.js:2345`, add props to ExerciseCard:
```js
h(ExerciseCard,{exercise:ex,index:i,dayId:day.id,onSetUpdate:refresh,isNext:nextExIdx===i,
  expanded:expandedIdx===i,onToggleExpand:function(){setExpandedIdx(expandedIdx===i?-1:i)},
  onComplete:function(){
    // Find next incomplete exercise after this one
    var nextIdx=-1;
    for(var ni2=i+1;ni2<allExercises.length;ni2++){
      var exSkip2=saved._skipped&&saved._skipped[allExercises[ni2].id];
      if(exSkip2)continue;
      var exDone2=countBilateralDone(allExercises[ni2],saved);
      if(exDone2<totalSetsFor(allExercises[ni2])){nextIdx=ni2;break}
    }
    setTimeout(function(){setExpandedIdx(nextIdx)},500);
  },
  supersetGroup:ex.supersetGroup,supersetPartner:ssPartner,supersetPartnerExId:ssPartnerExId,onSwap:handleSwap,exerciseLibrary:exerciseLibrary,meso:meso})
```

Do the same for custom exercises in ~line 2348.

**Step 3: ExerciseCard uses lifted expanded state**

In `app.js:1383`, replace the local `expanded` state:
```js
var expanded=props.expanded!==undefined?props.expanded:!!props.isNext;
var setExpanded=props.onToggleExpand||function(){};
```

Remove the `useState(!!props.isNext)` line for expanded.

**Step 4: Add onRated callback to RPERating**

In `app.js:1297`, after saving RPE, call `onRated` if provided:
```js
var save=function(val){setRpe(val);var all=dayData.getData(dayId);if(!all.rpe)all.rpe={};all.rpe[exId]=val;dayData.saveData(dayId,all);if(props.onRated)props.onRated()};
```

**Step 5: Wire RPERating.onRated to ExerciseCard.onComplete**

In `app.js:1522`, the RPERating render — add `onRated`:
```js
h(RPERating,{exId:exercise.id,dayId:dayId,allDone:allDone,onRated:function(){if(props.onComplete)props.onComplete()}}),
```

**Step 6: Handle case when showRir is off**

If RIR/RPE is disabled (`showRir` pref is false), RPERating returns null and `onRated` never fires. In ExerciseCard, detect when `allDone` becomes true AND `showRir` is off, then call `onComplete` directly.

Add a useEffect in ExerciseCard (after `allDone` is computed, ~line 1405):
```js
var prevAllDone=useRef(false);
useEffect(function(){
  if(allDone&&!prevAllDone.current&&!getPref("showRir",true)){
    if(props.onComplete)props.onComplete();
  }
  prevAllDone.current=allDone;
},[allDone]);
```

**Step 7: Run tests**

Open `tests.html`. Expected: all pass.

**Step 8: Commit**

```
feat: auto-collapse completed exercise card, auto-advance to next
```

---

### Task 7: End Session Prompt

**Files:**
- Modify: `app.js` (new `SessionEndPrompt` component, ~after CardioLog)
- Modify: `app.js:2294-2352` (DayView — render SessionEndPrompt)

**Step 1: Create SessionEndPrompt component**

Add a new function component after CardioLog (~line 1571):

```js
function SessionEndPrompt(props){
  var allExDone=props.allExDone,cardioDone=props.cardioDone,onEndSession=props.onEndSession,onScrollToCardio=props.onScrollToCardio;
  if(!allExDone)return null;
  if(cardioDone){
    return h("div",{className:"fade-in",style:{marginTop:16,padding:"16px",background:"var(--success-bg)",border:"1px solid var(--success-border)",borderRadius:12,textAlign:"center"}},
      h("div",{style:{fontSize:14,fontWeight:700,color:"var(--success)",marginBottom:10}},"Workout complete!"),
      h("button",{onClick:onEndSession,className:"btn btn--success",style:{width:"100%"}},"End Session"));
  }
  return h("div",{className:"fade-in",style:{marginTop:16,padding:"16px",background:"var(--accent-bg)",border:"1px solid var(--accent-border)",borderRadius:12,textAlign:"center"}},
    h("div",{style:{fontSize:14,fontWeight:700,color:"var(--accent)",marginBottom:10}},"All exercises complete!"),
    h("div",{style:{display:"flex",gap:8}},
      h("button",{onClick:onEndSession,className:"btn btn--success",style:{flex:1}},"End Session"),
      h("button",{onClick:onScrollToCardio,className:"btn btn--accent-ghost",style:{flex:1}},"Still have cardio")));
}
```

**Step 2: Render SessionEndPrompt in DayView**

In `app.js:2350` (DayView, after CardioLog), check cardio done status and render the prompt:

```js
(function(){
  var cardioKey="cardio_"+day.id+"_"+getSessionDate();
  var cardioData=lsGet(cardioKey);
  var cardioDone=cardioData&&cardioData.done;
  var cardioRef=null;/* use ref on CardioLog wrapper */
  return allComplete?h(SessionEndPrompt,{allExDone:true,cardioDone:cardioDone,onEndSession:function(){
    saveSessionSummary(day,allExercises);
    endSession();
    setShowComplete(true);
    if(props.onEndSession)props.onEndSession();
  },onScrollToCardio:function(){
    var cardioEl=document.querySelector("[aria-label='Cardio log']");
    if(cardioEl)cardioEl.scrollIntoView({behavior:"smooth",block:"center"});
  }}):null;
})(),
```

Place this AFTER the CardioLog render and BEFORE the SessionRPE/CompletionSummary renders.

**Step 3: Run tests**

Open `tests.html`. Expected: all pass.

**Step 4: Commit**

```
feat: end session prompt when all exercises/cardio complete
```

---

### Task 8: Version Bump & Release

**Files:**
- Modify: `app.js:40` (APP_VERSION → 56)
- Modify: `app.js:41` (WHATS_NEW)
- Modify: `sw.js:2` (CACHE_NAME → hypertrophy-v56)

**Step 1: Bump version**

`app.js:40`: `var APP_VERSION=56;`

`sw.js:2`: `var CACHE_NAME = 'hypertrophy-v56';`

**Step 2: Update WHATS_NEW**

```js
var WHATS_NEW=["Rest timer now stays visible until you tap it and sounds play every time","Cards auto-collapse when done and advance to the next exercise","Setup instructions in the Coach tab for equipment guidance","End session prompt when your workout is complete","Cleaner text-only bottom navigation"];
```

**Step 3: Run all tests**

Open `tests.html`. Expected: all pass.

**Step 4: Commit**

```
release: v56 — Workout Flow & Polish
```
