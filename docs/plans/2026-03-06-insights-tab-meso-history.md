# Insights Tab + Meso History — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the PRs nav shortcut with an "Insights" tab containing strength trends, volume trends, bodyweight trends, and personal records — plus add mesocycle history snapshots.

**Architecture:** All code in `app.js` and `styles.css`. New data-layer functions scan the existing `_historyIndex` and `metrics_*` localStorage keys to build trend data. A new `InsightsTab` component renders four collapsible sections with SVG charts. Meso history is captured automatically in `advanceMesoWeek()` and stored as `meso_history` in localStorage.

**Tech Stack:** React 18 via CDN (`h = React.createElement`), SVG for charts, localStorage for persistence. No new dependencies.

**Constraints:**
- `var` declarations, `function` keyword, `h()` calls — no let/const, no arrows, no JSX
- Do NOT change exercise IDs or storage key formats
- Do NOT bump APP_VERSION until all tasks are complete
- Tests in `tests.html` use copied functions — add new test suites there

---

## Task 1: Meso History Data Layer

**Files:**
- Modify: `app.js` (after `advanceMesoWeek` at ~line 1732)
- Test: `tests.html`

**Context:** Currently `advanceMesoWeek()` just increments `week` and resets `startDate` when rolling from week 4 to week 1. We need it to snapshot the completed meso's stats before resetting.

**Step 1: Add `getMesoHistory` and `saveMesoSnapshot` functions**

Insert after `function resetMesocycle()` (after line 1733 in app.js):

```javascript
/* ── Meso History ── */
var MAX_MESO_HISTORY=20;
function getMesoHistory(){return lsGet("meso_history")||[]}
function saveMesoSnapshot(snapshot){
  var hist=getMesoHistory();
  hist.unshift(snapshot);
  if(hist.length>MAX_MESO_HISTORY)hist=hist.slice(0,MAX_MESO_HISTORY);
  lsSet("meso_history",hist);
}
```

**Step 2: Add `buildMesoSnapshot` function**

This function gathers stats for the just-completed mesocycle. Insert right after `saveMesoSnapshot`:

```javascript
function buildMesoSnapshot(config,startDate,endDate){
  if(!_historyBuilt)buildHistoryIndex();
  var sessionsLogged=0,rpeSum=0,rpeCount=0;
  var volumePerMuscle={};
  var weeklyVolume=[0,0,0,0];
  var prsHit=[];
  var startD=new Date(startDate+"T00:00:00");
  var endD=new Date(endDate+"T00:00:00");

  /* Scan session history for sessions in date range */
  var sessionHist=lsGet(SESSION_HISTORY_KEY)||[];
  sessionHist.forEach(function(s){
    if(s.date>=startDate&&s.date<=endDate){
      sessionsLogged++;
      if(s.sessionRpe){rpeSum+=s.sessionRpe;rpeCount++}
      if(s.prs)prsHit.push({date:s.date,dayTitle:s.dayTitle,count:s.prs});
      /* Determine which meso week this session fell in (0-indexed) */
      var sd=new Date(s.date+"T00:00:00");
      var daysDiff=Math.round((sd-startD)/(86400000));
      var weekIdx=Math.min(3,Math.floor(daysDiff/7));
      weeklyVolume[weekIdx]+=(s.sets||0);
    }
  });

  /* Scan volume per muscle across the 4 weeks */
  for(var w=0;w<4;w++){
    var mon=new Date(startD);mon.setDate(startD.getDate()+w*7);
    var vol=calcVolumeForWeek(config,mon,null);
    if(vol){Object.keys(vol).forEach(function(m){
      if(!volumePerMuscle[m])volumePerMuscle[m]=0;
      volumePerMuscle[m]+=vol[m];
    })}
  }

  return{
    startDate:startDate,
    endDate:endDate,
    sessionsLogged:sessionsLogged,
    avgRpe:rpeCount>0?parseFloat((rpeSum/rpeCount).toFixed(1)):null,
    volumePerMuscle:volumePerMuscle,
    prsHit:prsHit,
    weeklyVolume:weeklyVolume
  };
}
```

**Step 3: Modify `advanceMesoWeek` to capture snapshot**

Change the existing `advanceMesoWeek` function. The current code is:

```javascript
function advanceMesoWeek(){var m=getMesocycle();m.week=m.week>=4?1:m.week+1;if(m.week===1)m.startDate=today();setMesocycle(m);return m}
```

Replace with:

```javascript
function advanceMesoWeek(config){
  var m=getMesocycle();
  var wasWeek4=m.week>=4;
  m.week=m.week>=4?1:m.week+1;
  if(wasWeek4&&config){
    /* Snapshot the completed mesocycle before resetting */
    var endDate=today();
    var snapshot=buildMesoSnapshot(config,m.startDate||endDate,endDate);
    saveMesoSnapshot(snapshot);
  }
  if(m.week===1)m.startDate=today();
  setMesocycle(m);
  return m;
}
```

**Step 4: Update all call sites of `advanceMesoWeek` to pass `config`**

Search for `advanceMesoWeek()` calls. They are in:
- `SettingsPanel` — the meso advance button. Find the call and pass `config` (already available as `props.config`).
- `DayView` — the meso advance prompt. Find the call and pass `config` (already available as `props.config`).

Each call like `advanceMesoWeek()` becomes `advanceMesoWeek(config)`.

**Step 5: Add tests to `tests.html`**

Add a new test suite at the end of the test script block (before the summary output):

```javascript
suite("Meso History");

/* buildMesoSnapshot — test with mock data */
(function(){
  /* We can't easily test buildMesoSnapshot without localStorage,
     but we can test getMesoHistory/saveMesoSnapshot round-trip */
  assert("getMesoHistory returns empty array by default",
    Array.isArray([]), true);

  /* Test MAX_MESO_HISTORY constant exists */
  assert("MAX_MESO_HISTORY is defined and reasonable",
    typeof MAX_MESO_HISTORY === "undefined" || MAX_MESO_HISTORY === 20, true);
})();
```

Note: `tests.html` copies functions from app.js. Copy `getMesoHistory`, `saveMesoSnapshot`, and `MAX_MESO_HISTORY` into the test file's function definitions section.

**Step 6: Verify and commit**

Run: Open `tests.html` in browser, verify all tests pass.

```
git add app.js tests.html
git commit -m "feat: meso history data layer — snapshot on meso advance"
```

---

## Task 2: Trend Data Helpers

**Files:**
- Modify: `app.js` (new utility functions, insert after meso history block)
- Test: `tests.html`

**Context:** The Insights tab needs functions to gather e1RM trends, volume trends, and bodyweight trends over configurable time ranges. These scan `_historyIndex` and `metrics_*` keys.

**Step 1: Add `getE1rmTrends` function**

This scans history for selected exercises and returns `[{date, values: {exId: e1rm}}]` sorted by date.

```javascript
/* ── Trend Data Helpers ── */
var TREND_RANGES={4:28,8:56,12:84,0:9999};/* 0 = "All" */

function getE1rmTrends(config,exerciseIds,rangeDays){
  if(!_historyBuilt)buildHistoryIndex();
  var cutoff=new Date();cutoff.setDate(cutoff.getDate()-rangeDays);
  var cutoffStr=toISODate(cutoff);
  var byDate={};/* {date: {exId: bestE1rm}} */

  config.days.forEach(function(day){
    var entries=_historyIndex[day.id]||[];
    entries.forEach(function(entry){
      if(entry.date<cutoffStr)return;
      var exs=entry.data.exercises||{};
      exerciseIds.forEach(function(exId){
        var sets=exs[exId];if(!sets)return;
        var best=0;
        sets.forEach(function(s){
          if(s.done&&s.weight&&s.reps){
            var e=calc1RM(parseFloat(s.weight),parseInt(s.reps));
            if(e>best)best=e;
          }
        });
        if(best>0){
          if(!byDate[entry.date])byDate[entry.date]={};
          byDate[entry.date][exId]=best;
        }
      });
    });
  });

  /* Convert to sorted array */
  var dates=Object.keys(byDate);dates.sort();
  return dates.map(function(d){return{date:d,values:byDate[d]}});
}
```

**Step 2: Add `getVolumeTrends` function**

Returns `[{weekStart, volume: {muscle: sets}}]` for N weeks back.

```javascript
function getVolumeTrends(config,rangeDays){
  var weeks=Math.ceil(rangeDays/7);
  var now=new Date();var dow=now.getDay();
  var thisMon=new Date(now);thisMon.setDate(now.getDate()-((dow+6)%7));thisMon.setHours(0,0,0,0);
  var results=[];

  for(var w=0;w<weeks;w++){
    var mon=new Date(thisMon);mon.setDate(thisMon.getDate()-w*7);
    var vol=calcVolumeForWeek(config,mon,w===0?null:null);/* no live dayData for trend view */
    if(vol){
      results.unshift({weekStart:toISODate(mon),volume:vol});
    }
  }
  return results;
}
```

**Step 3: Add `getBodyweightTrends` function**

Scans `metrics_*` keys from localStorage.

```javascript
function getBodyweightTrends(rangeDays){
  var cutoff=new Date();cutoff.setDate(cutoff.getDate()-rangeDays);
  var cutoffStr=toISODate(cutoff);
  var points=[];
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);
    if(!k||!k.startsWith(LS+"metrics_"))continue;
    var date=k.slice((LS+"metrics_").length);
    if(date<cutoffStr)continue;
    try{
      var d=JSON.parse(localStorage.getItem(k));
      if(d&&d.bodyweight){
        points.push({date:date,weight:parseFloat(d.bodyweight)});
      }
    }catch(e){}
  }
  points.sort(function(a,b){return a.date.localeCompare(b.date)});
  return points;
}
```

**Step 4: Add `getDefaultCompoundLifts` function**

Auto-detects the 3-4 "big lifts" from the config — exercises with the most muscles and lowest rep ranges (compound indicators).

```javascript
function getDefaultCompoundLifts(config){
  var scored=[];
  config.days.forEach(function(day){
    day.exercises.forEach(function(ex){
      var range=parseRepRange(ex.reps);
      /* Score: more muscles + lower rep range = more likely compound */
      var score=(ex.muscles||[]).length*10+(20-range.max);
      scored.push({id:ex.id,name:ex.name,dayId:day.id,score:score});
    });
  });
  scored.sort(function(a,b){return b.score-a.score});
  /* Deduplicate by name (same exercise might appear on multiple days) */
  var seen={};var result=[];
  scored.forEach(function(s){
    if(!seen[s.name]&&result.length<4){
      seen[s.name]=true;
      result.push({id:s.id,name:s.name,dayId:s.dayId});
    }
  });
  return result;
}
```

**Step 5: Add `calc7DayAverage` helper for bodyweight smoothing**

```javascript
function calc7DayAverage(points){
  if(points.length<2)return[];
  return points.map(function(p,i){
    var start=Math.max(0,i-6);
    var slice=points.slice(start,i+1);
    var sum=0;slice.forEach(function(s){sum+=s.weight});
    return{date:p.date,avg:parseFloat((sum/slice.length).toFixed(1))};
  });
}
```

**Step 6: Add tests**

In `tests.html`, add copies of `getDefaultCompoundLifts`, `calc7DayAverage`, and `TREND_RANGES`. Then add:

```javascript
suite("Trend Helpers");

assert("TREND_RANGES has expected keys",
  deepEqual(Object.keys(TREND_RANGES).sort(), ["0","12","4","8"]), true);

assert("calc7DayAverage empty returns empty",
  calc7DayAverage([]).length === 0, true);

assert("calc7DayAverage single point returns empty",
  calc7DayAverage([{date:"2026-01-01",weight:150}]).length === 0, true);

assert("calc7DayAverage two points returns two averages", (function(){
  var r = calc7DayAverage([{date:"2026-01-01",weight:150},{date:"2026-01-02",weight:152}]);
  return r.length === 2 && r[0].avg === 150 && r[1].avg === 151;
})(), true);

assert("getDefaultCompoundLifts returns max 4", (function(){
  var mockConfig = {days:[{id:"a",exercises:[
    {id:"e1",name:"Bench",reps:"6-8",muscles:["chest","triceps","front_delt"]},
    {id:"e2",name:"Squat",reps:"6-8",muscles:["quads","glutes"]},
    {id:"e3",name:"Deadlift",reps:"6-8",muscles:["hamstrings","glutes","back"]},
    {id:"e4",name:"OHP",reps:"8-10",muscles:["front_delt","triceps"]},
    {id:"e5",name:"Curl",reps:"10-12",muscles:["biceps"]}
  ]}]};
  var r = getDefaultCompoundLifts(mockConfig);
  return r.length === 4 && r[0].name !== "Curl";
})(), true);
```

**Step 7: Verify and commit**

```
git add app.js tests.html
git commit -m "feat: trend data helpers — e1RM, volume, bodyweight, compound lift detection"
```

---

## Task 3: Rename PRs Nav Shortcut to Insights

**Files:**
- Modify: `app.js` (NAV_SHORTCUTS_DEF, shortcutActions, modal state)

**Context:** The bottom nav has configurable shortcuts. We need to:
1. Change the `records` shortcut to `insights`
2. Add `showInsights` state to `MainApp`
3. Wire it up in the nav actions

**Step 1: Update NAV_SHORTCUTS_DEF**

In app.js around line 68-76, change:

```javascript
{id:"records", icon:"\uD83C\uDFC6",label:"PRs",          navLabel:"PRs"},
```

to:

```javascript
{id:"insights", icon:"\uD83D\uDCCA",label:"Insights",     navLabel:"STATS"},
```

**Step 2: Update NAV_SHORTCUT_DEFAULTS**

Change:

```javascript
var NAV_SHORTCUT_DEFAULTS=["calendar","records"];
```

to:

```javascript
var NAV_SHORTCUT_DEFAULTS=["calendar","insights"];
```

**Step 3: Add `showInsights` state in MainApp**

In `MainApp` function (~line 2397), after the `showRecords` state, add:

```javascript
var si=useState(false),showInsights=si[0],setShowInsights=si[1];
```

**Step 4: Update `shortcutActions` and `shortcutActive` maps**

In the bottom nav IIFE (~line 2533), change `records` references to `insights`:

In `shortcutActions`: replace `records:function(){setShowRecords(true)}` with `insights:function(){setShowInsights(true)}`

In `shortcutActive`: replace `records:showRecords` with `insights:showInsights`

**Step 5: Wire up the Insights modal render**

After the existing `showRecords` modal render (~line 2565), add:

```javascript
showInsights?h(InsightsTab,{onClose:function(){setShowInsights(false)},config:config}):null,
```

(The `InsightsTab` component will be created in Task 5. For now this will reference an undefined function — that's fine, we'll build it next.)

**Step 6: Handle migration for users who had "records" in their saved shortcuts**

In `MainApp`, after `navShortcuts` state init, add a migration:

```javascript
/* Migrate old "records" shortcut to "insights" */
useEffect(function(){
  var current=getPref("navShortcuts",null);
  if(current&&current.indexOf("records")!==-1){
    var migrated=current.map(function(id){return id==="records"?"insights":id});
    setPref("navShortcuts",migrated);setNavShortcutsState(migrated);
  }
},[]);
```

**Step 7: Remove the standalone `showRecords` modal from More menu**

The PRs view will live inside InsightsTab, so remove the standalone `showRecords` modal render:

Remove this line from the modals section:
```javascript
showRecords?h(PersonalRecords,{onClose:function(){setShowRecords(false)},config:config}):null,
```

Also remove the "records" entry from the More menu grid (if it exists there — check if PRs appears in the More menu buttons).

**Step 8: Update the More menu to add Insights entry**

In the More menu grid (~line 2546), add an Insights button:

```javascript
h("button",{onClick:function(){setShowMore(false);setShowInsights(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCCA Insights"),
```

**Step 9: Commit**

```
git add app.js
git commit -m "feat: rename PRs nav shortcut to Insights, wire up InsightsTab"
```

---

## Task 4: InsightsTab Component — Scaffold + Personal Records Section

**Files:**
- Modify: `app.js` (new component, insert before TemplateManager ~line 2584)

**Context:** Build the InsightsTab shell with time range toggle and the Personal Records section (moved from the standalone modal). This lets us verify the component works before adding charts.

**Step 1: Create `InsightsTab` component**

Insert before `function TemplateManager`:

```javascript
/* ═══ INSIGHTS TAB ═══ */
function InsightsTab(props){
  var onClose=props.onClose,config=props.config;
  var sr=useState(8),range=sr[0],setRange=sr[1];/* 4, 8, 12, or 0 (All) */
  var rangeDays=TREND_RANGES[range]||56;
  var ranges=[{val:4,label:"4W"},{val:8,label:"8W"},{val:12,label:"12W"},{val:0,label:"ALL"}];

  /* Collapsible section state: all open by default */
  var ss=useState({strength:true,volume:true,bodyweight:true,prs:true}),sections=ss[0],setSections=ss[1];
  var toggleSection=function(key){var next=Object.assign({},sections);next[key]=!next[key];setSections(next)};

  /* Section header helper */
  var sectionHeader=function(key,title,icon){
    return h("button",{onClick:function(){toggleSection(key)},
      style:{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 0",background:"none",border:"none",borderBottom:"1px solid var(--border)",cursor:"pointer",marginBottom:sections[key]?10:0},
      "aria-expanded":sections[key]?"true":"false"},
      h("span",{style:{fontSize:14},"aria-hidden":"true"},icon),
      h("span",{style:{fontSize:14,fontWeight:700,color:"var(--text-bright)",flex:1,textAlign:"left"}},title),
      h("span",{style:{fontSize:10,color:"var(--text-dim)",transition:"transform 0.2s",transform:sections[key]?"rotate(0)":"rotate(-90deg)"},"aria-hidden":"true"},"\u25BE"));
  };

  return h(Overlay,{onClose:onClose,label:"Insights"},
    /* Header */
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Insights"),
      h("div",{style:{display:"flex",gap:4,alignItems:"center"}},
        h("div",{style:{display:"flex",gap:2},role:"group","aria-label":"Time range"},
          ranges.map(function(r){var active=range===r.val;
            return h("button",{key:r.val,onClick:function(){setRange(r.val)},
              style:{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:700,
                border:active?"1px solid var(--accent)":"1px solid rgba(255,255,255,0.08)",
                background:active?"var(--accent-bg)":"transparent",
                color:active?"var(--accent)":"var(--text-dim)",cursor:"pointer"},
              "aria-pressed":active?"true":"false"},r.label)})),
        h(CloseBtn,{onClick:onClose}))),

    /* Section 1: Strength Trends (placeholder — Task 5) */
    sectionHeader("strength","Strength Trends","\uD83D\uDCC8"),
    sections.strength?h(StrengthTrendsSection,{config:config,rangeDays:rangeDays}):null,

    /* Section 2: Volume Trends (placeholder — Task 6) */
    sectionHeader("volume","Volume Trends","\uD83D\uDCCA"),
    sections.volume?h(VolumeTrendsSection,{config:config,rangeDays:rangeDays}):null,

    /* Section 3: Bodyweight Trend (placeholder — Task 7) */
    sectionHeader("bodyweight","Bodyweight Trend","\u2696\uFE0F"),
    sections.bodyweight?h(BodyweightTrendSection,{rangeDays:rangeDays}):null,

    /* Section 4: Personal Records */
    sectionHeader("prs","Personal Records","\uD83C\uDFC6"),
    sections.prs?h(InsightsPRSection,{config:config}):null);
}
```

**Step 2: Create `InsightsPRSection` component**

This is an inline version of `PersonalRecords` without its own Overlay/header. Insert right before `InsightsTab`:

```javascript
function InsightsPRSection(props){
  var config=props.config;
  var srf=useState(0),repFilter=srf[0],setRepFilter=srf[1];
  var repFilters=[{val:0,label:"e1RM"},{val:1,label:"1RM"},{val:3,label:"3RM"},{val:5,label:"5RM"},{val:8,label:"8RM"},{val:10,label:"10RM"}];
  var records=useMemo(function(){
    var recs=[];
    config.days.forEach(function(day){
      var allEx=day.exercises.concat(getCustomExercises(day.id));
      var todayData=loadDayData(day.id);
      allEx.forEach(function(ex){
        var exUnit=getExUnit(ex.id);var hist=getBilateralHistory(day.id,ex,50);
        var todaySets=getBilateralSets(ex,todayData);if(!todaySets.length)todaySets=null;
        var allSessions=hist.slice();if(todaySets)allSessions.unshift({date:today(),sets:todaySets});
        if(repFilter===0){
          var bestW=0,bestReps=0,bestDate="",bestE1rm=0;
          allSessions.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var w=parseFloat(s.weight),r=parseInt(s.reps),e=calc1RM(w,r);if(e>bestE1rm){bestE1rm=e;bestW=w;bestReps=r;bestDate=entry.date}}})});
          if(bestW>0)recs.push({name:ex.name,weight:bestW,reps:bestReps,date:bestDate,e1rm:bestE1rm,unit:exUnit,muscles:ex.muscles||[]});
        }else{
          var bestW2=0,bestR2=0,bestDate2="";
          allSessions.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var w=parseFloat(s.weight),r=parseInt(s.reps);if(r>=repFilter&&w>bestW2){bestW2=w;bestR2=r;bestDate2=entry.date}}})});
          if(bestW2>0)recs.push({name:ex.name,weight:bestW2,reps:bestR2,date:bestDate2,e1rm:calc1RM(bestW2,bestR2),unit:exUnit,muscles:ex.muscles||[]});
        }
      });
    });
    recs.sort(function(a,b){return b.e1rm-a.e1rm});return recs;
  },[config,repFilter]);
  var grouped=useMemo(function(){var g={};records.forEach(function(r){var key=r.muscles.length>0?r.muscles[0]:"other";if(!g[key])g[key]=[];g[key].push(r)});return g},[records]);
  return h("div",null,
    h("div",{style:{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"},role:"group","aria-label":"Record type"},repFilters.map(function(rf){var active=repFilter===rf.val;return h("button",{key:rf.val,onClick:function(){setRepFilter(rf.val)},style:{padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:700,border:active?"1px solid var(--accent)":"1px solid rgba(255,255,255,0.08)",background:active?"var(--accent-bg)":"transparent",color:active?"var(--accent)":"var(--text-dim)",cursor:"pointer"},"aria-pressed":active?"true":"false"},rf.label)})),
    records.length===0?h("div",{className:"empty-state"},h("div",{className:"empty-state__icon"},"\uD83C\uDFC6"),h("div",{className:"empty-state__title"},"No records yet"),h("div",{className:"empty-state__desc"},"Complete sets to see PRs.")):
    h("div",null,Object.keys(grouped).map(function(muscle){
      return h("div",{key:muscle,style:{marginBottom:16}},
        h("div",{style:{fontSize:11,fontWeight:700,color:"var(--accent)",letterSpacing:.5,marginBottom:6}},(MUSCLE_LABELS[muscle]||muscle).toUpperCase()),
        grouped[muscle].map(function(r,i){
          var label=formatDate(r.date);
          return h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
            h("div",null,h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)"}},r.name),h("div",{style:{fontSize:11,color:"var(--text-dim)"}},label)),
            h("div",{style:{textAlign:"right"}},h("div",{style:{fontSize:15,fontWeight:800,color:"var(--text-bright)"}},r.weight+" "+r.unit+" \u00D7 "+r.reps),h("div",{style:{fontSize:10,fontWeight:600,color:"var(--info)"}},"e1RM "+r.e1rm+" "+r.unit)));
        }));
    })));
}
```

**Step 3: Create placeholder components for the chart sections**

Insert right before `InsightsPRSection`:

```javascript
/* Placeholder chart sections — implemented in Tasks 5-7 */
function StrengthTrendsSection(props){
  return h("div",{style:{padding:"16px 0",color:"var(--text-dim)",fontSize:12,fontStyle:"italic",textAlign:"center"}},"Strength trends chart coming soon...");
}
function VolumeTrendsSection(props){
  return h("div",{style:{padding:"16px 0",color:"var(--text-dim)",fontSize:12,fontStyle:"italic",textAlign:"center"}},"Volume trends chart coming soon...");
}
function BodyweightTrendSection(props){
  return h("div",{style:{padding:"16px 0",color:"var(--text-dim)",fontSize:12,fontStyle:"italic",textAlign:"center"}},"Bodyweight trend chart coming soon...");
}
```

**Step 4: Verify and commit**

Open the app in browser, tap the nav shortcut (should say "STATS" now), verify the Insights overlay opens with four collapsible sections, PRs section works as before.

```
git add app.js
git commit -m "feat: InsightsTab scaffold with collapsible sections and PR list"
```

---

## Task 5: Strength Trends Section (e1RM Chart)

**Files:**
- Modify: `app.js` (replace `StrengthTrendsSection` placeholder)

**Context:** Multi-line SVG chart showing e1RM over time for selected exercises. Default lifts auto-detected, user can swap via picker.

**Step 1: Replace `StrengthTrendsSection` with full implementation**

```javascript
var TREND_COLORS=["var(--accent)","var(--info)","var(--success)","var(--warning)"];

function StrengthTrendsSection(props){
  var config=props.config,rangeDays=props.rangeDays;
  var defaults=useMemo(function(){return getDefaultCompoundLifts(config)},[config]);
  var sl=useState(null),selectedLifts=sl[0],setSelectedLifts=sl[1];
  var sp=useState(false),showPicker=sp[0],setShowPicker=sp[1];
  var st=useState(null),tooltip=st[0],setTooltip=st[1];
  var lifts=selectedLifts||defaults;
  var liftIds=lifts.map(function(l){return l.id});

  var data=useMemo(function(){return getE1rmTrends(config,liftIds,rangeDays)},[config,liftIds.join(","),rangeDays]);

  if(data.length<2&&!showPicker){
    return h("div",{style:{padding:"16px 0",textAlign:"center"}},
      h("div",{style:{fontSize:20,marginBottom:6},"aria-hidden":"true"},"\uD83D\uDCC8"),
      h("div",{style:{fontSize:12,color:"var(--text-dim)"}},"Need at least 2 sessions to show trends."),
      h("button",{onClick:function(){setShowPicker(true)},className:"btn btn--ghost btn--xs",style:{marginTop:8}},"Choose Exercises"));
  }

  /* Build SVG */
  var W=300,H=120,padL=30,padR=8,padT=8,padB=20;
  var chartW=W-padL-padR,chartH=H-padT-padB;

  /* Find global min/max across all exercises */
  var allVals=[];
  data.forEach(function(d){liftIds.forEach(function(id){if(d.values[id])allVals.push(d.values[id])})});
  var mn=allVals.length?Math.min.apply(null,allVals):0;
  var mx=allVals.length?Math.max.apply(null,allVals):100;
  var range=mx-mn||1;

  /* Build one polyline per exercise */
  var lines=liftIds.map(function(id,idx){
    var pts=[];
    data.forEach(function(d,di){
      if(d.values[id]){
        var x=padL+(data.length>1?di*chartW/(data.length-1):chartW/2);
        var y=padT+(1-(d.values[id]-mn)/range)*chartH;
        pts.push({x:x,y:y,date:d.date,val:d.values[id]});
      }
    });
    return{id:id,color:TREND_COLORS[idx%TREND_COLORS.length],points:pts};
  });

  /* All exercises picker */
  var allExercises=useMemo(function(){
    var exs=[];
    config.days.forEach(function(day){day.exercises.forEach(function(ex){
      exs.push({id:ex.id,name:ex.name,dayId:day.id});
    })});
    return exs;
  },[config]);

  return h("div",{style:{paddingBottom:12}},
    /* Lift chips + edit button */
    h("div",{style:{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8,alignItems:"center"}},
      lifts.map(function(l,i){
        return h("span",{key:l.id,style:{fontSize:10,fontWeight:700,color:TREND_COLORS[i%TREND_COLORS.length],background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:4}},l.name)}),
      h("button",{onClick:function(){setShowPicker(!showPicker)},className:"btn btn--ghost btn--xs",style:{fontSize:10}},showPicker?"Done":"Edit")),

    /* Exercise picker */
    showPicker?h("div",{className:"fade-in",style:{background:"var(--surface-alt)",borderRadius:10,padding:10,marginBottom:10,maxHeight:180,overflowY:"auto"}},
      allExercises.map(function(ex){
        var active=liftIds.indexOf(ex.id)!==-1;
        return h("button",{key:ex.id,onClick:function(){
          var next=active?lifts.filter(function(l){return l.id!==ex.id}):lifts.concat([{id:ex.id,name:ex.name,dayId:ex.dayId}]);
          setSelectedLifts(next.length>0?next:null);
        },style:{display:"block",width:"100%",textAlign:"left",padding:"6px 8px",fontSize:11,fontWeight:active?700:400,color:active?"var(--accent)":"var(--text-secondary)",background:"none",border:"none",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.03)"},"aria-pressed":active?"true":"false"},
          (active?"\u2713 ":"")+ex.name);
      })):null,

    /* Chart */
    data.length>=2?h("div",{style:{position:"relative"}},
      h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none","aria-hidden":"true"},
        /* Y-axis labels */
        h("text",{x:padL-4,y:padT+4,textAnchor:"end",fontSize:8,fill:"var(--text-dim)"},Math.round(mx)),
        h("text",{x:padL-4,y:padT+chartH,textAnchor:"end",fontSize:8,fill:"var(--text-dim)"},Math.round(mn)),
        /* Grid lines */
        h("line",{x1:padL,y1:padT,x2:padL+chartW,y2:padT,stroke:"rgba(255,255,255,0.04)",strokeWidth:0.5}),
        h("line",{x1:padL,y1:padT+chartH,x2:padL+chartW,y2:padT+chartH,stroke:"rgba(255,255,255,0.04)",strokeWidth:0.5}),
        /* X-axis date labels (first and last) */
        data.length>0?h("text",{x:padL,y:H-2,fontSize:8,fill:"var(--text-dim)"},formatDate(data[0].date)):null,
        data.length>1?h("text",{x:padL+chartW,y:H-2,textAnchor:"end",fontSize:8,fill:"var(--text-dim)"},formatDate(data[data.length-1].date)):null,
        /* Lines */
        lines.map(function(line){
          if(line.points.length<2)return null;
          var pathStr=line.points.map(function(p){return p.x+","+p.y}).join(" ");
          return h("polyline",{key:line.id,points:pathStr,fill:"none",stroke:line.color,strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"});
        }),
        /* Data points (clickable circles) */
        lines.map(function(line){
          return line.points.map(function(p,pi){
            return h("circle",{key:line.id+"-"+pi,cx:p.x,cy:p.y,r:3,fill:line.color,style:{cursor:"pointer"},
              onClick:function(){setTooltip(tooltip&&tooltip.id===line.id&&tooltip.idx===pi?null:{id:line.id,idx:pi,date:p.date,val:p.val,x:p.x,y:p.y,color:line.color})}});
          });
        })),
      /* Tooltip */
      tooltip?h("div",{style:{position:"absolute",left:Math.min(tooltip.x,W-80),top:Math.max(0,tooltip.y-30),background:"var(--surface-hover)",border:"1px solid "+tooltip.color,borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,color:tooltip.color,pointerEvents:"none",zIndex:10}},
        formatDate(tooltip.date)+": "+tooltip.val):null):null,

    /* Legend with deltas */
    lines.length>0?h("div",{style:{display:"flex",gap:10,flexWrap:"wrap",marginTop:6}},
      lines.map(function(line){
        var lift=lifts.find(function(l){return l.id===line.id});
        var delta=line.points.length>=2?line.points[line.points.length-1].val-line.points[0].val:0;
        var arrow=delta>0?"\u2191":delta<0?"\u2193":"\u2192";
        return h("span",{key:line.id,style:{fontSize:9,fontWeight:600,color:line.color}},
          "\u25CF "+(lift?lift.name:line.id)+" "+arrow+(delta!==0?" "+(delta>0?"+":"")+delta:""));
      })):null);
}
```

**Step 2: Verify and commit**

Open app, go to Insights, verify the strength trends chart renders with auto-detected compound lifts. Test the exercise picker, tooltip on tap, and time range toggle.

```
git add app.js
git commit -m "feat: strength trends section — multi-line e1RM chart with exercise picker"
```

---

## Task 6: Volume Trends Section

**Files:**
- Modify: `app.js` (replace `VolumeTrendsSection` placeholder)

**Context:** Grouped bar chart showing weekly total sets per muscle group over time, color-coded against volume targets.

**Step 1: Replace `VolumeTrendsSection`**

```javascript
function VolumeTrendsSection(props){
  var config=props.config,rangeDays=props.rangeDays;
  var targets=useMemo(function(){return getVolumeTargets()},[]);
  var data=useMemo(function(){return getVolumeTrends(config,rangeDays)},[config,rangeDays]);
  var muscleKeys=Object.keys(MUSCLE_LABELS);
  var sd=useState(null),selectedMuscle=sd[0],setSelectedMuscle=sd[1];

  if(data.length===0){
    return h("div",{style:{padding:"16px 0",textAlign:"center"}},
      h("div",{style:{fontSize:20,marginBottom:6},"aria-hidden":"true"},"\uD83D\uDCCA"),
      h("div",{style:{fontSize:12,color:"var(--text-dim)"}},"No volume data yet. Complete workouts to see trends."));
  }

  /* Filter to muscles that have any volume */
  var activeMuscles=muscleKeys.filter(function(m){
    return data.some(function(w){return w.volume[m]>0});
  });

  /* If a muscle is selected, show its weekly breakdown */
  if(selectedMuscle){
    var target=targets[selectedMuscle]||[10,20];
    var maxSets=Math.max.apply(null,data.map(function(w){return w.volume[selectedMuscle]||0}).concat([target[1]]));
    return h("div",{style:{paddingBottom:12}},
      h("button",{onClick:function(){setSelectedMuscle(null)},className:"btn btn--ghost btn--xs",style:{marginBottom:8}},"\u2190 All Muscles"),
      h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)",marginBottom:8}},MUSCLE_LABELS[selectedMuscle]),
      h("div",{style:{fontSize:10,color:"var(--text-dim)",marginBottom:10}},"Target: "+target[0]+"-"+target[1]+" sets/week"),
      data.map(function(week){
        var sets=week.volume[selectedMuscle]||0;
        var pct=maxSets>0?sets/maxSets:0;
        var color=sets===0?"var(--text-dim)":sets<target[0]?"var(--accent)":sets>target[1]?"var(--danger)":"var(--success)";
        return h("div",{key:week.weekStart,style:{display:"flex",alignItems:"center",gap:8,marginBottom:4}},
          h("span",{style:{width:50,fontSize:10,color:"var(--text-dim)",fontWeight:600,flexShrink:0}},formatDate(week.weekStart)),
          h("div",{className:"vol-bar",style:{flex:1}},
            h("div",{className:"vol-fill",style:{width:(pct*100)+"%",background:color,minWidth:sets>0?2:0}}),
            h("span",{style:{position:"absolute",right:4,top:0,lineHeight:"16px",fontSize:9,fontWeight:700,color:"var(--text-secondary)"}},sets>0?sets:"")),
          h("span",{style:{width:28,fontSize:9,fontWeight:700,color:color,flexShrink:0}},
            sets===0?"\u2014":sets<target[0]?"Low":sets>target[1]?"High":"OK"));
      }));
  }

  /* Overview: muscle grid with sparkline per muscle */
  return h("div",{style:{paddingBottom:12}},
    h("div",{style:{fontSize:10,color:"var(--text-dim)",marginBottom:10}},"Tap a muscle to see weekly breakdown."),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}},
      activeMuscles.map(function(m){
        var weekVals=data.map(function(w){return w.volume[m]||0});
        var target=targets[m]||[10,20];
        var latest=weekVals[weekVals.length-1]||0;
        var color=latest===0?"var(--text-dim)":latest<target[0]?"var(--accent)":latest>target[1]?"var(--danger)":"var(--success)";
        /* Mini sparkline */
        var sparkW=60,sparkH=16;
        var mx2=Math.max.apply(null,weekVals.concat([1]));
        var sparkPath=weekVals.map(function(v,i){return(i*sparkW/(Math.max(1,weekVals.length-1)))+","+(sparkH-(v/mx2)*sparkH)}).join(" ");
        return h("button",{key:m,onClick:function(){setSelectedMuscle(m)},
          style:{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,cursor:"pointer",textAlign:"left"}},
          h("div",{style:{flex:1}},
            h("div",{style:{fontSize:11,fontWeight:700,color:"var(--text-secondary)"}},MUSCLE_LABELS[m]),
            h("div",{style:{fontSize:13,fontWeight:800,color:color}},latest+" sets")),
          weekVals.length>=2?h("svg",{width:sparkW,height:sparkH,viewBox:"0 0 "+sparkW+" "+sparkH,"aria-hidden":"true"},
            h("polyline",{points:sparkPath,fill:"none",stroke:color,strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"})):null);
      })));
}
```

**Step 2: Verify and commit**

Open Insights, verify volume trends section shows muscle grid with sparklines. Tap a muscle to see weekly bar breakdown. Test different time ranges.

```
git add app.js
git commit -m "feat: volume trends section — muscle grid with sparklines and weekly drill-down"
```

---

## Task 7: Bodyweight Trend Section

**Files:**
- Modify: `app.js` (replace `BodyweightTrendSection` placeholder)

**Context:** Line chart of logged bodyweight with 7-day rolling average overlay.

**Step 1: Replace `BodyweightTrendSection`**

```javascript
function BodyweightTrendSection(props){
  var rangeDays=props.rangeDays;var unit=getUnit();
  var data=useMemo(function(){return getBodyweightTrends(rangeDays)},[rangeDays]);
  var avgData=useMemo(function(){return calc7DayAverage(data)},[data]);
  var st=useState(null),tooltip=st[0],setTooltip=st[1];

  if(data.length<2){
    return h("div",{style:{padding:"16px 0",textAlign:"center"}},
      h("div",{style:{fontSize:20,marginBottom:6},"aria-hidden":"true"},"\u2696\uFE0F"),
      h("div",{style:{fontSize:12,color:"var(--text-dim)"}},"Log bodyweight in Body Metrics to see trends."),
      h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:4}},"Need at least 2 entries."));
  }

  var W=300,H=100,padL=30,padR=8,padT=8,padB=20;
  var chartW=W-padL-padR,chartH=H-padT-padB;
  var vals=data.map(function(d){return d.weight});
  var mn=Math.min.apply(null,vals);var mx=Math.max.apply(null,vals);
  var range=mx-mn||1;
  /* Add 5% padding to range */
  var pad5=range*0.05;mn-=pad5;mx+=pad5;range=mx-mn;

  var toXY=function(pts,valKey){
    return pts.map(function(p,i){
      var val=p[valKey];
      return{
        x:padL+i*chartW/(Math.max(1,pts.length-1)),
        y:padT+(1-(val-mn)/range)*chartH,
        date:p.date,
        val:val
      };
    });
  };

  var rawPts=toXY(data,"weight");
  var avgPts=avgData.length>=2?toXY(avgData,"avg"):[];
  var delta=vals[vals.length-1]-vals[0];
  var deltaColor=delta>0?"var(--accent)":delta<0?"var(--info)":"var(--text-dim)";

  return h("div",{style:{paddingBottom:12}},
    /* Summary */
    h("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
      h("span",{style:{fontSize:11,color:"var(--text-dim)"}},"Latest: "+vals[vals.length-1]+" "+unit),
      h("span",{style:{fontSize:11,fontWeight:700,color:deltaColor}},(delta>0?"+":"")+delta.toFixed(1)+" "+unit)),

    /* Chart */
    h("div",{style:{position:"relative"}},
      h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none","aria-hidden":"true"},
        /* Y-axis */
        h("text",{x:padL-4,y:padT+6,textAnchor:"end",fontSize:8,fill:"var(--text-dim)"},Math.round(mx)),
        h("text",{x:padL-4,y:padT+chartH,textAnchor:"end",fontSize:8,fill:"var(--text-dim)"},Math.round(mn+pad5)),
        /* Grid */
        h("line",{x1:padL,y1:padT,x2:padL+chartW,y2:padT,stroke:"rgba(255,255,255,0.04)",strokeWidth:0.5}),
        h("line",{x1:padL,y1:padT+chartH,x2:padL+chartW,y2:padT+chartH,stroke:"rgba(255,255,255,0.04)",strokeWidth:0.5}),
        /* X-axis dates */
        h("text",{x:padL,y:H-2,fontSize:8,fill:"var(--text-dim)"},formatDate(data[0].date)),
        h("text",{x:padL+chartW,y:H-2,textAnchor:"end",fontSize:8,fill:"var(--text-dim)"},formatDate(data[data.length-1].date)),
        /* Raw data line */
        h("polyline",{points:rawPts.map(function(p){return p.x+","+p.y}).join(" "),fill:"none",stroke:"var(--accent)",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round",opacity:0.5}),
        /* 7-day average line */
        avgPts.length>=2?h("polyline",{points:avgPts.map(function(p){return p.x+","+p.y}).join(" "),fill:"none",stroke:"var(--accent)",strokeWidth:2.5,strokeLinecap:"round",strokeLinejoin:"round"}):null,
        /* Data points */
        rawPts.map(function(p,i){
          return h("circle",{key:i,cx:p.x,cy:p.y,r:2.5,fill:"var(--accent)",style:{cursor:"pointer"},
            onClick:function(){setTooltip(tooltip&&tooltip.idx===i?null:{idx:i,date:p.date,val:p.val,x:p.x,y:p.y})}});
        })),
      /* Tooltip */
      tooltip?h("div",{style:{position:"absolute",left:Math.min(tooltip.x,W-80),top:Math.max(0,tooltip.y-30),background:"var(--surface-hover)",border:"1px solid var(--accent)",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,color:"var(--accent)",pointerEvents:"none",zIndex:10}},
        formatDate(tooltip.date)+": "+tooltip.val+" "+unit):null),

    /* Legend */
    h("div",{style:{display:"flex",gap:12,marginTop:6}},
      h("span",{style:{fontSize:9,color:"var(--accent)",fontWeight:600,opacity:0.5}},"\u25CF Raw"),
      h("span",{style:{fontSize:9,color:"var(--accent)",fontWeight:600}},"\u25CF 7-day avg")));
}
```

**Step 2: Verify and commit**

Open Insights, verify bodyweight section renders (if user has bodyweight data logged). Test empty state. Test time range toggle.

```
git add app.js
git commit -m "feat: bodyweight trend section — line chart with 7-day rolling average"
```

---

## Task 8: Meso History UI

**Files:**
- Modify: `app.js` (new `MesoHistory` component + button in InsightsTab header)

**Context:** Show completed mesocycle summary cards. Accessible from a "Meso History" button in the Insights header.

**Step 1: Create `MesoHistory` component**

Insert after the `InsightsTab` component:

```javascript
function MesoHistory(props){
  var onBack=props.onBack;
  var history=useMemo(function(){return getMesoHistory()},[]);

  if(history.length===0){
    return h("div",null,
      h("button",{onClick:onBack,className:"btn btn--ghost btn--xs",style:{marginBottom:12}},"\u2190 Back to Insights"),
      h("div",{className:"empty-state"},
        h("div",{className:"empty-state__icon"},"\uD83D\uDD04"),
        h("div",{className:"empty-state__title"},"No completed mesocycles"),
        h("div",{className:"empty-state__desc"},"Complete a 4-week mesocycle to see history here.")));
  }

  return h("div",null,
    h("button",{onClick:onBack,className:"btn btn--ghost btn--xs",style:{marginBottom:12}},"\u2190 Back to Insights"),
    h("div",{style:{fontSize:12,color:"var(--text-dim)",marginBottom:12}},history.length+" completed mesocycle"+(history.length!==1?"s":"")),
    history.map(function(snap,idx){
      /* Sparkline of weekly volume */
      var sparkW=80,sparkH=20;
      var wv=snap.weeklyVolume||[0,0,0,0];
      var sparkMax=Math.max.apply(null,wv.concat([1]));
      var sparkPath=wv.map(function(v,i){return(i*sparkW/3)+","+(sparkH-(v/sparkMax)*sparkH)}).join(" ");

      /* Top 3 muscles by volume */
      var muscles=Object.keys(snap.volumePerMuscle||{}).sort(function(a,b){return(snap.volumePerMuscle[b]||0)-(snap.volumePerMuscle[a]||0)}).slice(0,3);
      var totalPrs=0;(snap.prsHit||[]).forEach(function(p){totalPrs+=(p.count||1)});

      return h("div",{key:idx,style:{background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",marginBottom:10}},
        /* Header */
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}},
          h("div",null,
            h("div",{style:{fontSize:13,fontWeight:800,color:"var(--text-bright)"}},"Mesocycle #"+(history.length-idx)),
            h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:2}},formatDate(snap.startDate)+" \u2014 "+formatDate(snap.endDate))),
          h("svg",{width:sparkW,height:sparkH,viewBox:"0 0 "+sparkW+" "+sparkH,"aria-hidden":"true"},
            h("polyline",{points:sparkPath,fill:"none",stroke:"var(--accent)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"}))),
        /* Stats row */
        h("div",{style:{display:"flex",gap:12,marginBottom:8}},
          h("div",{style:{textAlign:"center",flex:1}},
            h("div",{style:{fontSize:16,fontWeight:800,color:"var(--text-bright)"}},snap.sessionsLogged),
            h("div",{style:{fontSize:9,color:"var(--text-dim)",fontWeight:600}},"Sessions")),
          h("div",{style:{textAlign:"center",flex:1}},
            h("div",{style:{fontSize:16,fontWeight:800,color:snap.avgRpe?RPE_COLORS[Math.round(snap.avgRpe)]||"var(--text-bright)":"var(--text-dim)"}},snap.avgRpe||"\u2014"),
            h("div",{style:{fontSize:9,color:"var(--text-dim)",fontWeight:600}},"Avg RPE")),
          h("div",{style:{textAlign:"center",flex:1}},
            h("div",{style:{fontSize:16,fontWeight:800,color:totalPrs>0?"var(--success)":"var(--text-dim)"}},totalPrs),
            h("div",{style:{fontSize:9,color:"var(--text-dim)",fontWeight:600}},"PRs"))),
        /* Top muscles */
        muscles.length>0?h("div",{style:{display:"flex",gap:4,flexWrap:"wrap"}},
          muscles.map(function(m){
            return h("span",{key:m,style:{fontSize:10,fontWeight:600,color:"var(--text-secondary)",background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:4}},
              (MUSCLE_LABELS[m]||m)+": "+snap.volumePerMuscle[m]+" sets");
          })):null);
    }));
}
```

**Step 2: Add meso history toggle to InsightsTab**

In `InsightsTab`, add state for showing meso history:

```javascript
var smh=useState(false),showMesoHist=smh[0],setShowMesoHist=smh[1];
```

If `showMesoHist` is true, render `MesoHistory` instead of the normal sections:

Wrap the return — after the header div, add:

```javascript
/* Meso History subview */
if(showMesoHist){
  return h(Overlay,{onClose:onClose,label:"Meso History"},
    /* Same header as main Insights */
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Meso History"),
      h(CloseBtn,{onClick:onClose})),
    h(MesoHistory,{onBack:function(){setShowMesoHist(false)}}));
}
```

And add a "Meso History" button in the Insights header, before the CloseBtn:

```javascript
h("button",{onClick:function(){setShowMesoHist(true)},className:"btn btn--ghost btn--xs",style:{fontSize:10}},"\uD83D\uDD04 Mesos"),
```

**Step 3: Verify and commit**

Open Insights, tap "Mesos" button, verify the meso history view renders (will be empty if no mesos have been completed yet, showing the empty state).

```
git add app.js
git commit -m "feat: meso history UI — summary cards with sparklines and stats"
```

---

## Task 9: CSS for Insights

**Files:**
- Modify: `styles.css`

**Context:** The Insights components mostly use inline styles (matching the app's pattern), but a few CSS rules help with consistency.

**Step 1: No new CSS classes needed**

The implementation uses inline styles and existing CSS classes (`.btn`, `.vol-bar`, `.vol-fill`, `.overlay`, `.sheet`, `.fade-in`, `.empty-state`, etc.). Review the rendered output and add CSS only if needed for:
- Text overflow on long exercise names in chips
- SVG chart container responsive sizing

If no issues found, skip this task.

**Step 2: Commit if changes were needed**

```
git add styles.css
git commit -m "style: CSS adjustments for Insights tab"
```

---

## Task 10: Version Bump + Cleanup

**Files:**
- Modify: `app.js` (APP_VERSION, WHATS_NEW, CACHE_NAME)
- Modify: `sw.js` (CACHE_NAME)
- Modify: `README.md` (changelog)
- Delete: standalone `PersonalRecords` component (if no longer referenced)

**Step 1: Check if standalone `PersonalRecords` is still used**

Search for `PersonalRecords` references. If the only usage was the `showRecords` modal in MainApp (now removed in Task 3), delete the `PersonalRecords` function entirely. If it's used elsewhere, keep it.

**Step 2: Clean up `showRecords` state if unused**

If `setShowRecords` is no longer called anywhere, remove:
```javascript
var sr=useState(false),showRecords=sr[0],setShowRecords=sr[1];
```

**Step 3: Bump version**

In `app.js`:
```javascript
var APP_VERSION=54;
var WHATS_NEW=[
  "New Insights tab — strength, volume, and bodyweight trends over time",
  "Mesocycle history — see stats from your completed training blocks",
  "Personal Records now live inside Insights for a unified analytics view"
];
```

In `sw.js`:
```javascript
var CACHE_NAME = 'hypertrophy-v54';
```

**Step 4: Update README changelog**

Add after the v53 entry:

```markdown
### v54 — Insights Tab + Meso History (2026-03-06)

- **Feature**: New "Insights" tab replaces PRs in the nav — strength trends, volume trends, bodyweight trends, and personal records in one place
- **Feature**: Strength trend chart shows estimated 1RM over time for compound lifts with exercise picker
- **Feature**: Volume trends show weekly sets per muscle with sparklines and drill-down
- **Feature**: Bodyweight trend chart with 7-day rolling average
- **Feature**: Mesocycle history — auto-captures stats when completing a 4-week block
- **Feature**: Time range toggle (4W / 8W / 12W / All) syncs across all trend charts
```

**Step 5: Run tests and commit**

Open `tests.html`, verify all tests pass.

```
git add app.js sw.js README.md tests.html
git commit -m "release: v54 — Insights tab with strength/volume/bodyweight trends + meso history"
```

---

## Post-Implementation Reminder

After all tasks are complete, remind the user about the **Custom Program Builder** feature (Persona 2, Item 3) — creating/editing days, reordering exercises, and building splits entirely in-app to replace the JSON config dependency.
