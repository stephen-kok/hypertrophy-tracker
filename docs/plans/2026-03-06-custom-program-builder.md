# Custom Program Builder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users create/edit their own workout programs entirely in-app, replacing the static JSON config dependency.

**Architecture:** Config stored in localStorage (`custom_config` key). Boot sequence checks localStorage first, falls back to JSON fetch. Three new overlay components (ProgramBuilder, DayEditor, ExerciseEditor) accessible from the More menu. Existing downstream code continues to work unchanged because all components read from `config.days`.

**Tech Stack:** React 18 via CDN, `h()` calls, `var`/`function` only, `lsGet`/`lsSet` storage wrappers.

---

## Task 1: Config-in-localStorage Data Layer + Boot Sequence

**Files:**
- Modify: `app.js` — add `getCustomConfig()` / `saveCustomConfig()` helpers (~line 346, after custom exercises section)
- Modify: `app.js` — update `validateConfig()` (~line 79) to allow empty days array
- Modify: `app.js` — update `App` component boot sequence (~line 3276)

**Context:** Currently `App` fetches `configs/<profile>.json` and passes it as `config` prop. We need to check `lsGet("custom_config")` first. If it exists and validates, use it. Otherwise fetch JSON as before. The custom config key must be profile-scoped (it goes through `lsGet` which prepends `LS`).

**Step 1: Add config storage helpers after line 346 (after `removeCustomExercise`)**

```javascript
/* ═══ CUSTOM CONFIG (Program Builder) ═══ */
function getCustomConfig(){return lsGet("custom_config")||null}
function saveCustomConfig(cfg){lsSet("custom_config",cfg)}
function deleteCustomConfig(){try{localStorage.removeItem(LS+"custom_config")}catch(e){}}
```

**Step 2: Update `validateConfig` to allow empty days for custom programs**

Change line 83 from:
```javascript
if(!Array.isArray(cfg.days)||cfg.days.length===0)return"Missing or empty 'days' array";
```
To:
```javascript
if(!Array.isArray(cfg.days))return"'days' must be an array";
```

This allows blank programs (0 days) created by the builder. The rest of the validation (exercise IDs, names, sets, reps) still runs for any days that do exist.

**Step 3: Update `App` component boot sequence**

Replace the `useEffect` in `App` (~line 3279-3291) with logic that checks localStorage first:

```javascript
useEffect(function(){
  if(!profileId)return;
  var safeId=profileId.replace(/[^a-zA-Z0-9_-]/g,"");
  if(!safeId){setError("Invalid profile name.");return;}
  initProfile(safeId);
  /* Check for custom config in localStorage first */
  var custom=getCustomConfig();
  if(custom){
    var err=validateConfig(custom);
    if(!err){setConfig(custom);return}
    /* Invalid custom config — fall through to JSON fetch */
  }
  var configUrl="configs/"+safeId+".json";
  fetch(configUrl).then(function(r){if(!r.ok)throw new Error("Profile not found: "+profileId);return r.json()}).then(function(data){
    var err=validateConfig(data);if(err){setError("Config error: "+err);return}
    setConfig(data);
    if(navigator.serviceWorker){navigator.serviceWorker.ready.then(function(){if(navigator.serviceWorker.controller){navigator.serviceWorker.controller.postMessage({type:"CACHE_CONFIG",url:"./"+configUrl})}}).catch(function(){})}
  }).catch(function(err){setError(err.message)});
},[profileId]);
```

**Step 4: Add `custom_config` to preservePrefixes**

In the `preservePrefixes` array (~line 293), add `"custom_config"` so it survives data resets:

```javascript
var preservePrefixes=["pref_","eu_","eu_source_","exo_","mw_","templates","perm_swaps_","custom_","custom_config","_app_version","_schema_version",SESSION_HISTORY_KEY,"auto_backup_","_historyManifest"];
```

**Step 5: Add test cases to `tests.html`**

Add a "Program Builder — Config Layer" test section:
- `validateConfig` accepts config with empty days array
- `validateConfig` still rejects config with no days property
- `getCustomConfig()` returns null when nothing stored
- `saveCustomConfig(cfg)` + `getCustomConfig()` round-trips correctly
- `deleteCustomConfig()` clears the stored config

**Step 6: Run tests**

Open `tests.html` in browser. Verify all existing tests still pass and new tests pass.

**Step 7: Commit**

```
git add app.js tests.html
git commit -m "feat: config-in-localStorage data layer and boot sequence for Program Builder"
```

---

## Task 2: ProgramBuilder Overlay (Day List)

**Files:**
- Modify: `app.js` — add `ProgramBuilder` component (insert before the `/* ══════════════════════════════════════════ ROOT` section, ~line 3273)
- Modify: `app.js` — add `showProgramBuilder` state to `MainApp` (~line 2522)
- Modify: `app.js` — add Program Builder button to More menu grid (~line 2672)
- Modify: `app.js` — render ProgramBuilder modal (~line 2695, in the modals section)

**Context:** ProgramBuilder is the top-level overlay. Shows program name/subtitle fields, a list of day cards with reorder/edit/delete, and footer actions. Uses the existing `Overlay` component (line 856) and `CloseBtn` (line 1277).

**Step 1: Add `showProgramBuilder` state to MainApp**

After the `showCardio` state declaration (~line 2522), add:
```javascript
var spb=useState(false),showProgramBuilder=spb[0],setShowProgramBuilder=spb[1];
```

**Step 2: Add Program Builder button to More menu grid**

In the More menu grid (`h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",...}}`), add before the Settings button (~line 2680):
```javascript
h("button",{onClick:function(){setShowMore(false);setShowProgramBuilder(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDEE0 Program Builder"),
```

**Step 3: Add ProgramBuilder component**

Insert before the ROOT section. The component receives `config`, `onClose`, and `onConfigChange` (callback to update config in App state).

Key behavior:
- On first open, if no `custom_config` in localStorage, seed it from the current config prop
- Edits modify the localStorage copy and call `onConfigChange` to update the live config
- Day cards show: label, title, exercise count
- Up/down arrow buttons for reordering days
- Edit button navigates to DayEditor (internal state: `editingDayIndex`)
- Delete button with confirm dialog (warns about history if day has logged data)
- "+ Add Day" button creates a new day with auto-generated ID (`day_` + timestamp)
- "Create Blank Program" clears all days
- "Reset to Original" re-fetches JSON and overwrites localStorage

```javascript
/* ═══ PROGRAM BUILDER ═══ */
function ProgramBuilder(props){
  var config=props.config,onClose=props.onClose,onConfigChange=props.onConfigChange;
  var sc=useState(function(){
    var existing=getCustomConfig();
    if(!existing){existing=deepClone(config);saveCustomConfig(existing)}
    return existing;
  }),cfg=sc[0],setCfg=sc[1];
  var ed=useState(null),editDayIdx=ed[0],setEditDayIdx=ed[1];

  var save=function(next){saveCustomConfig(next);setCfg(next);onConfigChange(next)};

  var updateMeta=function(field,val){var next=deepClone(cfg);next[field]=val;save(next)};

  var addDay=function(){
    var next=deepClone(cfg);
    var newDay={id:"day_"+Date.now(),label:"Day "+(next.days.length+1),title:"New Day",exercises:[]};
    next.days.push(newDay);save(next);
  };

  var deleteDay=function(idx){
    var day=cfg.days[idx];
    var hasHistory=(_historyIndex[day.id]||[]).length>0;
    showConfirm({title:"Delete "+day.label+"?",
      msg:hasHistory?"This day has logged workout data. The data won't be deleted, but it will no longer appear in your workout.":"This will remove the day and all its exercises.",
      confirmLabel:"Delete",danger:true,
      onConfirm:function(){var next=deepClone(cfg);next.days.splice(idx,1);save(next)}});
  };

  var moveDay=function(idx,dir){
    var next=deepClone(cfg);var target=idx+dir;
    if(target<0||target>=next.days.length)return;
    var tmp=next.days[idx];next.days[idx]=next.days[target];next.days[target]=tmp;
    save(next);
  };

  var createBlank=function(){
    showConfirm({title:"Create Blank Program?",msg:"This will remove all days. You can add new ones from scratch.",
      confirmLabel:"Create Blank",danger:true,
      onConfirm:function(){var next=deepClone(cfg);next.days=[];next.program="Custom Program";next.subtitle="";save(next)}});
  };

  var resetToOriginal=function(){
    showConfirm({title:"Reset to Original?",msg:"This will discard all custom changes and restore the original program from the server.",
      confirmLabel:"Reset",danger:true,
      onConfirm:function(){
        var safeId=cfg.profile.replace(/[^a-zA-Z0-9_-]/g,"");
        fetch("configs/"+safeId+".json").then(function(r){return r.json()}).then(function(data){
          var err=validateConfig(data);if(err){showUndoToast("Error: "+err);return}
          deleteCustomConfig();save(data);
        }).catch(function(){showUndoToast("Could not fetch original config")});
      }});
  };

  if(editDayIdx!==null&&cfg.days[editDayIdx]){
    return h(Overlay,{onClose:onClose,label:"Edit Day"},
      h(DayEditor,{day:cfg.days[editDayIdx],dayIndex:editDayIdx,
        onBack:function(){setEditDayIdx(null)},
        onUpdate:function(updatedDay){
          var next=deepClone(cfg);next.days[editDayIdx]=updatedDay;save(next);
        }}));
  }

  return h(Overlay,{onClose:onClose,label:"Program Builder"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Program Builder"),
      h(CloseBtn,{onClick:onClose})),
    /* Program metadata */
    h("div",{style:{marginBottom:16}},
      h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"PROGRAM NAME"),
      h("input",{type:"text",value:cfg.program||"",onChange:function(e){updateMeta("program",e.target.value)},className:"input",style:{marginBottom:8,textAlign:"left"},"aria-label":"Program name"}),
      h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"SUBTITLE"),
      h("input",{type:"text",value:cfg.subtitle||"",onChange:function(e){updateMeta("subtitle",e.target.value)},className:"input",style:{textAlign:"left"},"aria-label":"Program subtitle"})),
    /* Day list */
    cfg.days.length===0?h("div",{style:{textAlign:"center",padding:"32px 0",color:"var(--text-dim)",fontSize:13}},"No days yet. Add one below."):
    cfg.days.map(function(day,i){
      return h("div",{key:day.id,className:"card",style:{marginBottom:8,padding:"12px 14px"}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
          h("div",{style:{flex:1}},
            h("div",{style:{fontSize:14,fontWeight:700,color:"var(--text-bright)"}},day.label||day.title),
            h("div",{style:{fontSize:11,color:"var(--text-secondary)"}},day.title),
            h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:2}},day.exercises.length+" exercise"+(day.exercises.length!==1?"s":""))),
          h("div",{style:{display:"flex",gap:4,alignItems:"center"}},
            h("button",{onClick:function(){moveDay(i,-1)},disabled:i===0,className:"btn btn--ghost btn--xs",style:{opacity:i===0?0.3:1,minWidth:32},"aria-label":"Move "+day.label+" up"},"\u25B2"),
            h("button",{onClick:function(){moveDay(i,1)},disabled:i===cfg.days.length-1,className:"btn btn--ghost btn--xs",style:{opacity:i===cfg.days.length-1?0.3:1,minWidth:32},"aria-label":"Move "+day.label+" down"},"\u25BC"),
            h("button",{onClick:function(){setEditDayIdx(i)},className:"btn btn--accent-ghost btn--xs","aria-label":"Edit "+day.label},"\u270E"),
            h("button",{onClick:function(){deleteDay(i)},className:"btn btn--ghost btn--xs",style:{color:"var(--danger)"},"aria-label":"Delete "+day.label},"\u2715"))));
    }),
    /* Footer actions */
    h("div",{style:{marginTop:16,display:"flex",flexDirection:"column",gap:8}},
      h("button",{onClick:addDay,className:"btn btn--accent btn--full"},"+ Add Day"),
      h("div",{style:{display:"flex",gap:8}},
        h("button",{onClick:createBlank,className:"btn btn--ghost btn--full",style:{flex:1}},"Create Blank"),
        h("button",{onClick:resetToOriginal,className:"btn btn--ghost btn--full",style:{flex:1}},"Reset to Original"))));
}
```

**Step 4: Render ProgramBuilder modal in MainApp**

After the existing modals section (~line 2695, after `showTemplates` render), add:
```javascript
showProgramBuilder?h(ProgramBuilder,{config:config,onClose:function(){setShowProgramBuilder(false)},onConfigChange:function(newCfg){/* Need to trigger re-render with new config */}}):null,
```

**Important:** `config` is passed as a prop from `App`. ProgramBuilder saves to localStorage and the next page load will use it. For live updates within the current session, we need `App` to expose `setConfig`. Add an `onConfigChange` prop to MainApp that calls `setConfig` in App:

In `App` component render (~line 3295), change:
```javascript
return h(TimerProvider,null,h(DayDataProvider,null,h(MainApp,{config:config})));
```
To:
```javascript
return h(TimerProvider,null,h(DayDataProvider,null,h(MainApp,{config:config,onConfigChange:setConfig})));
```

Then in MainApp, wire `onConfigChange`:
```javascript
showProgramBuilder?h(ProgramBuilder,{config:config,onClose:function(){setShowProgramBuilder(false)},onConfigChange:function(newCfg){if(props.onConfigChange)props.onConfigChange(newCfg)}}):null,
```

**Step 5: Run tests and manual smoke test**

Open `tests.html` — all tests pass. Open the app, go to More > Program Builder. Verify:
- Day list renders with all current days
- Reorder buttons work
- Metadata fields are editable
- Close button works

**Step 6: Commit**

```
git add app.js
git commit -m "feat: ProgramBuilder overlay with day list, reorder, delete, and metadata editing"
```

---

## Task 3: DayEditor Sub-View (Exercise List)

**Files:**
- Modify: `app.js` — add `DayEditor` component (insert right before `ProgramBuilder`)

**Context:** DayEditor is shown when the user taps "Edit" on a day card in ProgramBuilder. Shows editable day label/title, exercise list with reorder/edit/delete, and "+ Add Exercise" button. Uses same up/down reorder pattern as ProgramBuilder's day list.

**Step 1: Add DayEditor component**

```javascript
function DayEditor(props){
  var day=props.day,dayIndex=props.dayIndex,onBack=props.onBack,onUpdate=props.onUpdate;
  var sd=useState(function(){return deepClone(day)}),d=sd[0],setD=sd[1];
  var ee=useState(null),editExIdx=ee[0],setEditExIdx=ee[1];

  var save=function(next){setD(next);onUpdate(next)};

  var updateField=function(field,val){var next=deepClone(d);next[field]=val;save(next)};

  var addExercise=function(){
    var newEx={id:"ex_"+Date.now(),name:"New Exercise",sets:3,reps:"10-12",rest:60,machine:false,muscles:[]};
    var next=deepClone(d);next.exercises.push(newEx);save(next);
    setEditExIdx(next.exercises.length-1);
  };

  var deleteExercise=function(idx){
    var ex=d.exercises[idx];
    var hasHistory=false;
    var entries=_historyIndex[d.id]||[];
    for(var i=0;i<entries.length;i++){
      if(entries[i].data&&entries[i].data.exercises&&entries[i].data.exercises[ex.id]){hasHistory=true;break}
    }
    showConfirm({title:"Delete "+ex.name+"?",
      msg:hasHistory?"This exercise has logged data. The data won't be deleted, but it will no longer appear in your workout.":"Remove this exercise from the day.",
      confirmLabel:"Delete",danger:true,
      onConfirm:function(){var next=deepClone(d);next.exercises.splice(idx,1);save(next)}});
  };

  var moveExercise=function(idx,dir){
    var next=deepClone(d);var target=idx+dir;
    if(target<0||target>=next.exercises.length)return;
    var tmp=next.exercises[idx];next.exercises[idx]=next.exercises[target];next.exercises[target]=tmp;
    save(next);
  };

  if(editExIdx!==null&&d.exercises[editExIdx]){
    return h(ExerciseEditor,{exercise:d.exercises[editExIdx],
      onBack:function(){setEditExIdx(null)},
      onUpdate:function(updatedEx){
        var next=deepClone(d);next.exercises[editExIdx]=updatedEx;save(next);
      }});
  }

  return h("div",null,
    h("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:16}},
      h("button",{onClick:onBack,className:"btn btn--ghost btn--xs","aria-label":"Back to day list"},"\u2190"),
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)",flex:1}},"Edit Day")),
    /* Day metadata */
    h("div",{style:{marginBottom:16}},
      h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"LABEL"),
      h("input",{type:"text",value:d.label||"",onChange:function(e){updateField("label",e.target.value)},className:"input",style:{marginBottom:8,textAlign:"left"},"aria-label":"Day label"}),
      h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"TITLE"),
      h("input",{type:"text",value:d.title||"",onChange:function(e){updateField("title",e.target.value)},className:"input",style:{textAlign:"left"},"aria-label":"Day title"})),
    /* Exercise list */
    d.exercises.length===0?h("div",{style:{textAlign:"center",padding:"24px 0",color:"var(--text-dim)",fontSize:13}},"No exercises yet. Add one below."):
    d.exercises.map(function(ex,i){
      return h("div",{key:ex.id,className:"card",style:{marginBottom:6,padding:"10px 12px"}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
          h("div",{style:{flex:1}},
            h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)"}},ex.name),
            h("div",{style:{fontSize:11,color:"var(--text-secondary)"}},ex.sets+" x "+ex.reps+(ex.rest?" \u2022 "+ex.rest+"s rest":""))),
          h("div",{style:{display:"flex",gap:4,alignItems:"center"}},
            h("button",{onClick:function(){moveExercise(i,-1)},disabled:i===0,className:"btn btn--ghost btn--xs",style:{opacity:i===0?0.3:1,minWidth:32},"aria-label":"Move "+ex.name+" up"},"\u25B2"),
            h("button",{onClick:function(){moveExercise(i,1)},disabled:i===d.exercises.length-1,className:"btn btn--ghost btn--xs",style:{opacity:i===d.exercises.length-1?0.3:1,minWidth:32},"aria-label":"Move "+ex.name+" down"},"\u25BC"),
            h("button",{onClick:function(){setEditExIdx(i)},className:"btn btn--accent-ghost btn--xs","aria-label":"Edit "+ex.name},"\u270E"),
            h("button",{onClick:function(){deleteExercise(i)},className:"btn btn--ghost btn--xs",style:{color:"var(--danger)"},"aria-label":"Delete "+ex.name},"\u2715"))));
    }),
    /* Footer */
    h("button",{onClick:addExercise,className:"btn btn--accent btn--full",style:{marginTop:12}},"+ Add Exercise"));
}
```

**Step 2: Run tests and manual smoke test**

Open `tests.html` — all tests pass. In the app: More > Program Builder > tap Edit on a day. Verify:
- Day label/title fields are editable
- Exercise list shows name, sets x reps, rest
- Reorder, edit, and delete buttons work
- "+ Add Exercise" creates a new exercise and opens ExerciseEditor

**Step 3: Commit**

```
git add app.js
git commit -m "feat: DayEditor sub-view with exercise list, reorder, edit, delete"
```

---

## Task 4: ExerciseEditor Sub-View

**Files:**
- Modify: `app.js` — add `ExerciseEditor` component (insert right before `DayEditor`)

**Context:** ExerciseEditor is shown when the user taps "Edit" on an exercise in DayEditor, or when they add a new exercise. Shows editable fields: name, sets, reps, rest, machine toggle, and muscle tag multi-select. Pattern follows `AddExerciseForm` (line 2090) for the muscle tag picker.

**Step 1: Add ExerciseEditor component**

```javascript
function ExerciseEditor(props){
  var exercise=props.exercise,onBack=props.onBack,onUpdate=props.onUpdate;
  var sf=useState(function(){return deepClone(exercise)}),form=sf[0],setForm=sf[1];

  var upd=function(field,val){var next=Object.assign({},form);next[field]=val;setForm(next)};

  var toggleMuscle=function(m){
    var muscles=form.muscles||[];
    var next=muscles.indexOf(m)>=0?muscles.filter(function(x){return x!==m}):muscles.concat([m]);
    upd("muscles",next);
  };

  var handleSave=function(){
    if(!form.name.trim()){showUndoToast("Exercise name is required");return}
    if(form.reps&&!/^\d+(-\d+)?(\/leg)?$/i.test(form.reps.trim())){showUndoToast("Reps format should be like \"10\" or \"8-12\"");return}
    var updated=Object.assign({},form,{
      name:form.name.trim(),
      sets:parseInt(form.sets,10)||3,
      rest:parseInt(form.rest,10)||60
    });
    onUpdate(updated);
    onBack();
  };

  return h("div",null,
    h("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:16}},
      h("button",{onClick:onBack,className:"btn btn--ghost btn--xs","aria-label":"Back to exercise list"},"\u2190"),
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)",flex:1}},"Edit Exercise")),
    /* Name */
    h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"NAME"),
    h("input",{type:"text",value:form.name,onChange:function(e){upd("name",e.target.value)},className:"input",style:{marginBottom:10,textAlign:"left"},"aria-label":"Exercise name"}),
    /* Sets / Reps / Rest grid */
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}},
      h("div",null,
        h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"SETS"),
        h("input",{type:"number",inputMode:"numeric",value:form.sets,onChange:function(e){upd("sets",e.target.value)},className:"input","aria-label":"Sets"})),
      h("div",null,
        h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"REPS"),
        h("input",{type:"text",value:form.reps,onChange:function(e){upd("reps",e.target.value)},className:"input","aria-label":"Reps"})),
      h("div",null,
        h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"REST (s)"),
        h("input",{type:"number",inputMode:"numeric",value:form.rest,onChange:function(e){upd("rest",e.target.value)},className:"input","aria-label":"Rest seconds"}))),
    /* Machine toggle */
    h("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:12}},
      h("span",{style:{fontSize:12,fontWeight:600,color:"var(--text-secondary)"}},"Machine"),
      h(Toggle,{on:form.machine,onToggle:function(){upd("machine",!form.machine)},label:"Machine exercise"})),
    /* Muscle tags */
    h("div",{style:{marginBottom:16}},
      h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:4}},"MUSCLES (for volume tracking)"),
      h("div",{style:{display:"flex",flexWrap:"wrap",gap:4}},
        Object.keys(MUSCLE_LABELS).map(function(m){
          var active=(form.muscles||[]).indexOf(m)>=0;
          return h("button",{key:m,type:"button",onClick:function(){toggleMuscle(m)},className:active?"btn btn--accent-ghost btn--xs":"btn btn--ghost btn--xs",style:{fontSize:10},"aria-pressed":active?"true":"false"},MUSCLE_LABELS[m])}))),
    /* Save / Cancel */
    h("div",{style:{display:"flex",gap:8}},
      h("button",{onClick:onBack,className:"btn btn--ghost",style:{flex:1}},"Cancel"),
      h("button",{onClick:handleSave,className:"btn btn--accent",style:{flex:1}},"Save")));
}
```

**Step 2: Run tests and manual smoke test**

Open `tests.html` — all tests pass. In the app: More > Program Builder > Edit a day > Edit an exercise. Verify:
- Name, sets, reps, rest fields populate with current values
- Machine toggle works
- Muscle tags are selectable (multi-select)
- Save updates the exercise in the day
- Cancel returns without changes
- Validation: empty name shows toast, bad reps format shows toast

**Step 3: Commit**

```
git add app.js
git commit -m "feat: ExerciseEditor sub-view with name, sets, reps, rest, machine, muscle tags"
```

---

## Task 5: Integration Testing + Edge Cases

**Files:**
- Modify: `app.js` — fix any issues found during integration testing
- Modify: `tests.html` — add integration tests

**Context:** Now all three components exist. Test the full flow end-to-end and handle edge cases.

**Step 1: Add integration tests to `tests.html`**

```javascript
/* Program Builder — Integration */
(function(){
  var suite="Program Builder";
  var cfg={profile:"test",name:"Test",program:"Test Program",subtitle:"Test Sub",days:[
    {id:"d1",label:"Day 1",title:"Upper",exercises:[
      {id:"e1",name:"Bench",sets:4,reps:"8-10",rest:90,machine:false,muscles:["chest"]},
      {id:"e2",name:"Row",sets:3,reps:"10-12",rest:60,machine:true,muscles:["back"]}
    ]},
    {id:"d2",label:"Day 2",title:"Lower",exercises:[
      {id:"e3",name:"Squat",sets:4,reps:"6-8",rest:120,machine:false,muscles:["quads"]}
    ]}
  ]};

  // validateConfig accepts empty days
  assert(suite,"validateConfig allows empty days array",
    validateConfig({profile:"t",name:"T",days:[]})===null);

  // validateConfig rejects missing days property
  assert(suite,"validateConfig rejects missing days",
    validateConfig({profile:"t",name:"T"})!==null);

  // validateConfig still catches duplicate exercise IDs
  var dupCfg={profile:"t",name:"T",days:[{id:"d1",label:"D",title:"D",exercises:[
    {id:"x",name:"A",sets:3,reps:"10",rest:60},
    {id:"x",name:"B",sets:3,reps:"10",rest:60}
  ]}]};
  assert(suite,"validateConfig catches duplicate exercise IDs",
    validateConfig(dupCfg)!==null);

  // Round-trip config through localStorage
  var oldLS=LS;LS="ht_test_builder_";
  saveCustomConfig(cfg);
  var loaded=getCustomConfig();
  assert(suite,"saveCustomConfig/getCustomConfig round-trip",
    loaded&&loaded.days.length===2&&loaded.days[0].exercises.length===2);
  deleteCustomConfig();
  assert(suite,"deleteCustomConfig clears config",getCustomConfig()===null);
  LS=oldLS;
})();
```

**Step 2: Manual end-to-end test**

Test the full flow:
1. Open More > Program Builder
2. Edit program name and subtitle
3. Add a new day, verify it appears
4. Edit the new day — change label and title
5. Add an exercise to the new day
6. Edit the exercise — change name, sets, reps, muscle tags
7. Reorder exercises and days
8. Delete an exercise, then a day
9. Create Blank — verify all days gone
10. Reset to Original — verify original program restored
11. Close and reopen — verify changes persist
12. Refresh the page — verify custom config loads instead of JSON

**Step 3: Fix any issues found**

Address any bugs discovered during integration testing.

**Step 4: Commit**

```
git add app.js tests.html
git commit -m "test: integration tests and edge case fixes for Program Builder"
```

---

## Task 6: Version Bump to v55

**Files:**
- Modify: `app.js` — bump `APP_VERSION` to 55, update `WHATS_NEW`
- Modify: `sw.js` — bump `CACHE_NAME` to `hypertrophy-v55`
- Modify: `README.md` — add v55 changelog entry

**Step 1: Bump APP_VERSION**

In `app.js` line 40, change `APP_VERSION` from 54 to 55.

**Step 2: Update WHATS_NEW**

Replace `WHATS_NEW` array with:
```javascript
var WHATS_NEW=["Program Builder — create, edit, and reorder your workout days and exercises right in the app","Build a program from scratch or customize your existing one","Full control over exercise names, sets, reps, rest times, and muscle tags"];
```

**Step 3: Bump CACHE_NAME in sw.js**

Change line 2 from:
```javascript
var CACHE_NAME = 'hypertrophy-v54';
```
To:
```javascript
var CACHE_NAME = 'hypertrophy-v55';
```

**Step 4: Update README.md changelog**

Add v55 entry at the top of the changelog section.

**Step 5: Run tests**

Open `tests.html` — all tests pass.

**Step 6: Commit**

```
git add app.js sw.js README.md
git commit -m "release: v55 — Program Builder"
```
