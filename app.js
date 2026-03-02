"use strict";
var h=React.createElement,useState=React.useState,useEffect=React.useEffect,useRef=React.useRef,useCallback=React.useCallback,useMemo=React.useMemo,useContext=React.useContext,createContext=React.createContext;

/**
 * @typedef {Object} Exercise
 * @property {string} id - Unique exercise identifier
 * @property {string} name - Display name
 * @property {number} sets - Prescribed number of sets
 * @property {string} reps - Rep range (e.g. "8-10", "12-15/leg")
 * @property {number} rest - Rest period in seconds
 * @property {boolean} machine - Whether this is a machine exercise
 * @property {string} notes - Coach notes
 * @property {string} tip - Coaching tip
 * @property {number} [increment] - Weight increment for progressive overload
 * @property {string[]} [muscles] - Target muscle groups
 * @property {string} [rir] - Reps in reserve target
 * @property {string} [tempo] - Tempo prescription
 * @property {string[]} [alternatives] - Substitute exercise names
 * @property {boolean} [custom] - Whether user-added
 */

/**
 * @typedef {Object} SetData
 * @property {string} weight - Weight used
 * @property {string} reps - Reps performed
 * @property {boolean} done - Whether set is completed
 * @property {boolean} [extra] - Whether this is an extra/drop set
 */

/**
 * @typedef {Object} DayData
 * @property {Object<string, SetData[]>} exercises - Exercise sets keyed by exercise id
 * @property {Object<string, Array<{weight:string, reps:string}>>} [warmups] - Warmup sets
 * @property {Object<string, number>} [rpe] - Per-exercise RPE ratings
 * @property {Object<string, string>} [exNotes] - Per-exercise session notes
 */

/**
 * @typedef {Object} DayConfig
 * @property {string} id - Day identifier
 * @property {string} label - Short label for tabs
 * @property {string} day - Day of week abbreviation
 * @property {string} title - Full day title
 * @property {string} subtitle - Day description
 * @property {Exercise[]} exercises - List of exercises
 */

/**
 * @typedef {Object} ProfileConfig
 * @property {string} profile - Profile id
 * @property {string} name - User display name
 * @property {string} program - Program name
 * @property {string} subtitle - Program subtitle
 * @property {DayConfig[]} days - Training days
 */

/**
 * @typedef {Object} OverloadSuggestion
 * @property {"weight"|"reps"} type - Overload strategy
 * @property {number} from - Current weight
 * @property {number} to - Suggested weight
 * @property {number} [increment] - Weight increment
 * @property {number} [targetReps] - Suggested rep count (reps-first)
 * @property {string} [msg] - Display message (reps-first)
 */

/* ═══ PROFILE ═══ */
function getProfileFromURL(){var p=new URLSearchParams(window.location.search);return p.get("profile")||null}
var PROFILE=null,LS="";
function initProfile(p){PROFILE=p;LS="ht_"+p+"_";runMigrations()}

/* ═══ DATA MIGRATIONS ═══ */
var LS_VERSION=0;
var MIGRATIONS=[
  /* Add migration functions here. Bump LS_VERSION to match length. */
];
function runMigrations(){
  var cur=lsGet("_schema_version")||0;
  for(var i=cur;i<MIGRATIONS.length;i++){try{MIGRATIONS[i]()}catch(e){}}
  if(cur<MIGRATIONS.length)lsSet("_schema_version",MIGRATIONS.length);
}

/* ═══ STORAGE ═══ */
function lsGet(k){try{var v=localStorage.getItem(LS+k);return v?JSON.parse(v):null}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(LS+k,JSON.stringify(v))}catch(e){}}
var today=function(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
var fmtTime=function(s){return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
var fmtElapsed=function(s){var hr=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return hr>0?hr+"h "+m+"m":m>0?m+"m "+String(sec).padStart(2,"0")+"s":sec+"s"};
var dataKey=function(dayId,date){return dayId+"@"+date};
function loadDayData(dayId,date){return lsGet(dataKey(dayId,date||today()))||{exercises:{},warmups:{},rpe:{},exNotes:{}}}
function saveDayData(dayId,data){lsSet(dataKey(dayId,today()),data);updateHistoryIndex(dayId,today(),data)}
/* History index cache — built once per session, updated on save */
var _historyIndex={};/* Map<dayId, [{date, data}]> sorted desc by date */
var _historyBuilt=false;
function buildHistoryIndex(){
  _historyIndex={};
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);if(!k||!k.startsWith(LS))continue;
    var rest=k.slice(LS.length);var atIdx=rest.indexOf("@");if(atIdx===-1)continue;
    var dayId=rest.slice(0,atIdx);var date=rest.slice(atIdx+1);
    if(!date||date.length!==10)continue;
    try{var data=JSON.parse(localStorage.getItem(k));if(data&&data.exercises){if(!_historyIndex[dayId])_historyIndex[dayId]=[];_historyIndex[dayId].push({date:date,data:data})}}catch(e){}
  }
  Object.keys(_historyIndex).forEach(function(dayId){_historyIndex[dayId].sort(function(a,b){return b.date.localeCompare(a.date)})});
  _historyBuilt=true;
}
function updateHistoryIndex(dayId,date,data){
  if(!_historyBuilt)return;
  if(!_historyIndex[dayId])_historyIndex[dayId]=[];
  var existing=_historyIndex[dayId];
  for(var i=0;i<existing.length;i++){if(existing[i].date===date){existing[i].data=data;return}}
  existing.push({date:date,data:data});existing.sort(function(a,b){return b.date.localeCompare(a.date)});
}
function getHistory(dayId,exId,limit){
  if(!_historyBuilt)buildHistoryIndex();
  var entries=_historyIndex[dayId]||[];var results=[];var td=today();
  for(var i=0;i<entries.length;i++){
    var e=entries[i];if(e.date===td)continue;
    if(e.data.exercises&&e.data.exercises[exId])results.push({date:e.date,sets:e.data.exercises[exId]});
    if(results.length>=(limit||12))break;
  }
  return results;
}
function getMachineWeight(exId){return lsGet("mw_"+exId)||0}
function setMachineWeightLS(exId,w){lsSet("mw_"+exId,w)}
function getSessionStart(){return lsGet("session_"+today())}
function markSessionStart(){if(!getSessionStart()){lsSet("session_"+today(),Date.now())}}
function endSession(){try{localStorage.removeItem(LS+"session_"+today())}catch(e){}}
function restartSession(){lsSet("session_"+today(),Date.now())}

/* ═══ PREFERENCES ═══ */
function getPref(k,def){var v=lsGet("pref_"+k);return v!==null?v:def}
function setPref(k,v){lsSet("pref_"+k,v)}
function getUnit(){return getPref("unit","lbs")}
function setUnit(u){setPref("unit",u)}
function getAutoTimer(){return getPref("autotimer",true)}
function setAutoTimer(v){setPref("autotimer",v)}
function getDayMap(configDays){var saved=lsGet("pref_daymap");if(saved)return saved;var m={};configDays.forEach(function(d){m[d.id]=d.day});return m}
function setDayMap(m){lsSet("pref_daymap",m)}

/* ═══ PER-EXERCISE UNIT ═══ */
function getExUnit(exId){var v=lsGet("eu_"+exId);return v||getUnit()}
function setExUnit(exId,u){lsSet("eu_"+exId,u)}

/* ═══ CUSTOM EXERCISES ═══ */
function getCustomExercises(dayId){return lsGet("custom_"+dayId)||[]}
function saveCustomExercises(dayId,list){lsSet("custom_"+dayId,list)}
function addCustomExercise(dayId,ex){var list=getCustomExercises(dayId);list.push(ex);saveCustomExercises(dayId,list);return list}
function removeCustomExercise(dayId,exId){var list=getCustomExercises(dayId).filter(function(e){return e.id!==exId});saveCustomExercises(dayId,list);return list}

/* ═══ PROGRESSIVE OVERLOAD ═══ */
function parseRepRange(reps){var str=String(reps).replace(/\/leg/i,"");var parts=str.split("-");if(parts.length===2)return{min:parseInt(parts[0])||0,max:parseInt(parts[1])||0};var n=parseInt(str)||0;return{min:n,max:n}}
function getOverloadSuggestion(dayId,exercise){
  var hist=getHistory(dayId,exercise.id,1);if(!hist.length)return null;var lastSets=hist[0].sets;if(!lastSets||!lastSets.length)return null;
  var range=parseRepRange(exercise.reps);if(range.max===0)return null;
  var comp=lastSets.filter(function(s){return s.done&&s.weight&&s.reps});if(comp.length<exercise.sets)return null;
  var allTop=comp.every(function(s){return parseInt(s.reps)>=range.max});
  var lw=parseFloat(comp[0].weight)||0;if(lw===0)return null;
  var inc=exercise.increment||(exercise.machine?5:5);
  /* Reps-first for isolation exercises (small increments / high rep ranges) */
  var repsFirst=inc<=2.5||range.max>=15;
  if(!allTop)return null;
  if(repsFirst){
    /* Check if already did extra reps beyond range.max for 2+ sessions */
    var hist2=getHistory(dayId,exercise.id,2);
    var prevAlsoTop=hist2.length>=2&&hist2[1].sets.filter(function(s){return s.done&&s.weight&&s.reps}).every(function(s){return parseInt(s.reps)>=range.max});
    if(!prevAlsoTop){
      /* Suggest adding reps first */
      var targetReps=range.max+2;
      return{type:"reps",from:lw,to:lw,targetReps:targetReps,msg:"Try "+exercise.sets+"×"+targetReps+" at "+lw+" before adding weight"};
    }
  }
  return{type:"weight",from:lw,to:lw+inc,increment:inc};
}

/* ═══ ESTIMATED 1RM ═══ */
function calc1RM(weight,reps){var w=parseFloat(weight),r=parseInt(reps);if(!w||!r||r<=0)return 0;if(r===1)return w;return Math.round(w*(1+r/30))}

/* ═══ PLATE CALCULATOR ═══ */
var PLATES_LBS=[45,35,25,10,5,2.5];
var PLATES_KG=[25,20,15,10,5,2.5,1.25];
var BAR_LBS=45,BAR_KG=20;

/* ═══ EXPORT / IMPORT ═══ */
function exportData(){
  var data={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)){try{data[k]=JSON.parse(localStorage.getItem(k))}catch(e){data[k]=localStorage.getItem(k)}}}
  var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="hypertrophy_"+PROFILE+"_"+today()+".json";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

/* Validated import — rejects malformed data */
function validateImportData(data){
  if(!data||typeof data!=="object"||Array.isArray(data))return"Import file must be a JSON object.";
  var keys=Object.keys(data);
  if(keys.length===0)return"Import file is empty.";
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    if(typeof k!=="string")return"Invalid key found: "+k;
    /* Keys should start with profile prefix or be recognizable */
    if(k.indexOf("ht_")===-1)return"Unexpected key '"+k+"' — this doesn't look like a Hypertrophy Tracker export.";
  }
  return null;
}
function importData(file,cb){var r=new FileReader();r.onload=function(e){try{var data=JSON.parse(e.target.result);var err=validateImportData(data);if(err){cb(0,new Error(err));return}var c=0;Object.keys(data).forEach(function(k){localStorage.setItem(k,typeof data[k]==="string"?data[k]:JSON.stringify(data[k]));c++});cb(c,null)}catch(err){cb(0,err)}};r.readAsText(file)}

/* ═══ TIMER CONTEXT ═══ */
var TimerContext=createContext(null);

function TimerProvider(props){
  var timersRef=useRef({});
  var s=useState(0),rev=s[0],bump=s[1];
  var forceUpdate=useCallback(function(){bump(function(r){return r+1})},[]);

  var triggerTimer=useCallback(function(exKey,seconds){
    timersRef.current[exKey]={total:seconds,startedAt:Date.now(),running:true,done:false};
    forceUpdate();
  },[forceUpdate]);

  var getTimer=useCallback(function(exKey){
    return timersRef.current[exKey]||null;
  },[]);

  var setTimer=useCallback(function(exKey,val){
    timersRef.current[exKey]=val;
    forceUpdate();
  },[forceUpdate]);

  var getActiveTimer=useCallback(function(){
    var keys=Object.keys(timersRef.current);
    for(var i=0;i<keys.length;i++){
      var t=timersRef.current[keys[i]];
      if(t&&t.running)return{key:keys[i],timer:t};
    }
    return null;
  },[]);

  /* Handle visibility change for background timers */
  useEffect(function(){
    var handler=function(){
      if(document.visibilityState==="visible"){
        var changed=false;
        Object.keys(timersRef.current).forEach(function(key){
          var t=timersRef.current[key];
          if(t&&t.running&&t.startedAt){
            if(Math.floor((Date.now()-t.startedAt)/1000)>=t.total){
              t.running=false;t.done=true;changed=true;
              sendTimerNotification();
            }
          }
        });
        if(changed)forceUpdate();
      }
    };
    document.addEventListener("visibilitychange",handler);
    return function(){document.removeEventListener("visibilitychange",handler)};
  },[forceUpdate]);

  var ctx=useMemo(function(){return{triggerTimer:triggerTimer,getTimer:getTimer,setTimer:setTimer,getActiveTimer:getActiveTimer,rev:rev}},[triggerTimer,getTimer,setTimer,getActiveTimer,rev]);
  return h(TimerContext.Provider,{value:ctx},props.children);
}

function useTimers(){return useContext(TimerContext)}

/* ═══ DAY DATA CONTEXT ═══ */
var DayDataContext=createContext(null);

function DayDataProvider(props){
  /* Cache of loaded day data keyed by dayId (for today's date) */
  var cacheRef=useRef({});
  var s=useState(0),rev=s[0],bump=s[1];

  var getData=useCallback(function(dayId){
    if(!cacheRef.current[dayId]){
      cacheRef.current[dayId]=loadDayData(dayId);
    }
    return cacheRef.current[dayId];
  },[]);

  var saveData=useCallback(function(dayId,data){
    cacheRef.current[dayId]=data;
    saveDayData(dayId,data);
    bump(function(r){return r+1});
  },[]);

  var invalidate=useCallback(function(dayId){
    if(dayId){delete cacheRef.current[dayId]}
    else{cacheRef.current={}}
    bump(function(r){return r+1});
  },[]);

  var ctx=useMemo(function(){return{getData:getData,saveData:saveData,invalidate:invalidate,rev:rev}},[getData,saveData,invalidate,rev]);
  return h(DayDataContext.Provider,{value:ctx},props.children);
}

function useDayData(){return useContext(DayDataContext)}

/* ═══ COMPONENTS ═══ */

/* ── Error Boundary ── */
var ErrorBoundary=function(){
  function EB(props){
    React.Component.call(this,props);
    this.state={hasError:false,error:null};
  }
  EB.prototype=Object.create(React.Component.prototype);
  EB.prototype.constructor=EB;
  EB.getDerivedStateFromError=function(error){return{hasError:true,error:error}};
  EB.prototype.render=function(){
    if(this.state.hasError){
      return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:40,textAlign:"center"}},
        h("div",null,
          h("div",{style:{fontSize:40,marginBottom:16}},"⚠️"),
          h("h2",{style:{fontSize:18,fontWeight:700,color:"#f1f5f9",marginBottom:8}},"Something went wrong"),
          h("p",{style:{fontSize:13,color:"#6b7280",marginBottom:16,maxWidth:300}},this.state.error?String(this.state.error.message):"An unexpected error occurred."),
          h("button",{onClick:function(){window.location.reload()},style:{padding:"10px 24px",borderRadius:10,border:"none",background:"#f59e0b",color:"#000",fontSize:14,fontWeight:700,cursor:"pointer"}},"Reload App")));
    }
    return this.props.children;
  };
  return EB;
}();

/* ── Toggle Switch ── */
function Toggle(props){
  var on=props.on,onToggle=props.onToggle;
  return h("div",{onClick:onToggle,className:"toggle-track",style:{background:on?"#f59e0b":"rgba(255,255,255,0.1)"}},h("div",{className:"toggle-knob",style:{left:on?22:2}}));
}

/* ── Undo Toast ── */
var _toastState={show:false,msg:"",onUndo:null,timer:null};
var _toastListeners=[];
function showUndoToast(msg,onUndo,duration){
  if(_toastState.timer)clearTimeout(_toastState.timer);
  _toastState={show:true,msg:msg,onUndo:onUndo,timer:setTimeout(function(){dismissToast()},duration||4000)};
  _toastListeners.forEach(function(fn){fn()});
}
function dismissToast(){
  if(_toastState.timer)clearTimeout(_toastState.timer);
  _toastState={show:false,msg:"",onUndo:null,timer:null};
  _toastListeners.forEach(function(fn){fn()});
}
function UndoToast(){
  var s=useState(0),bump=s[1];
  useEffect(function(){var fn=function(){bump(function(r){return r+1})};_toastListeners.push(fn);return function(){_toastListeners=_toastListeners.filter(function(f){return f!==fn})}},[]);
  if(!_toastState.show)return null;
  return h("div",{style:{position:"fixed",bottom:60,left:"50%",transform:"translateX(-50%)",zIndex:400,background:"#1e1e24",border:"1px solid rgba(245,158,11,0.3)",borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",minWidth:220,maxWidth:"90vw"}},
    h("span",{style:{fontSize:13,color:"#e5e7eb",fontWeight:600,flex:1}},_toastState.msg),
    h("button",{onClick:function(){if(_toastState.onUndo)_toastState.onUndo();dismissToast()},style:{padding:"4px 12px",borderRadius:7,border:"1px solid rgba(245,158,11,0.4)",background:"rgba(245,158,11,0.1)",color:"#f59e0b",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}},"Undo"));
}

/* ── Custom Confirm Dialog ── */
var _confirmState={show:false,title:"",msg:"",onConfirm:null,onCancel:null,confirmLabel:"Confirm",danger:false};
var _confirmListeners=[];
function showConfirm(opts){
  _confirmState={show:true,title:opts.title||"Confirm",msg:opts.msg||"",onConfirm:opts.onConfirm,onCancel:opts.onCancel||null,confirmLabel:opts.confirmLabel||"Confirm",danger:opts.danger!==undefined?opts.danger:false};
  _confirmListeners.forEach(function(fn){fn()});
}
function dismissConfirm(){
  _confirmState={show:false,title:"",msg:"",onConfirm:null,onCancel:null,confirmLabel:"Confirm",danger:false};
  _confirmListeners.forEach(function(fn){fn()});
}
function ConfirmDialog(){
  var s=useState(0),bump=s[1];
  useEffect(function(){var fn=function(){bump(function(r){return r+1})};_confirmListeners.push(fn);return function(){_confirmListeners=_confirmListeners.filter(function(f){return f!==fn})}},[]);
  if(!_confirmState.show)return null;
  var danger=_confirmState.danger;
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget){if(_confirmState.onCancel)_confirmState.onCancel();dismissConfirm()}},style:{alignItems:"center"}},
    h("div",{className:"fade-in",style:{background:"#141419",borderRadius:16,padding:"24px 20px",width:"90%",maxWidth:340,textAlign:"center"}},
      h("h3",{style:{fontSize:16,fontWeight:800,color:"#f1f5f9",marginBottom:8}},_confirmState.title),
      _confirmState.msg?h("p",{style:{fontSize:13,color:"#9ca3af",marginBottom:20,lineHeight:1.5}},_confirmState.msg):null,
      h("div",{style:{display:"flex",gap:10}},
        h("button",{onClick:function(){if(_confirmState.onCancel)_confirmState.onCancel();dismissConfirm()},style:{flex:1,padding:"10px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#9ca3af",fontSize:13,fontWeight:600,cursor:"pointer"}},"Cancel"),
        h("button",{onClick:function(){if(_confirmState.onConfirm)_confirmState.onConfirm();dismissConfirm()},style:{flex:1,padding:"10px",borderRadius:10,border:"none",background:danger?"#ef4444":"#f59e0b",color:danger?"#fff":"#000",fontSize:13,fontWeight:700,cursor:"pointer"}},_confirmState.confirmLabel))));
}

/* ── Notification helper ── */
function requestNotifPermission(){if("Notification"in window&&Notification.permission==="default"){Notification.requestPermission()}}
function sendTimerNotification(){
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
  if("Notification"in window&&Notification.permission==="granted"){try{new Notification("Rest Complete",{body:"Time to start your next set!",icon:"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxODAgMTgwIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgcng9IjQwIiBmaWxsPSIjMGEwYTBmIi8+PHRleHQgeD0iOTAiIHk9IjEwNSIgZm9udC1mYW1pbHk9Ii1hcHBsZS1zeXN0ZW0sIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNzAiIGZvbnQtd2VpZ2h0PSI4MDAiIGZpbGw9IiNmNTllMGIiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkhUPC90ZXh0Pjwvc3ZnPg==",tag:"rest-timer"})}catch(e){}}
}

/* ── Floating Rest Timer ── */
function FloatingTimer(){
  var timers=useTimers();
  var s=useState(null),display=s[0],setDisplay=s[1];
  var intervalRef=useRef(null);
  /* Request notification permission on first render */
  useEffect(function(){requestNotifPermission()},[]);

  useEffect(function(){
    if(intervalRef.current)clearInterval(intervalRef.current);
    var tick=function(){
      var active=timers.getActiveTimer();
      if(active){
        var left=Math.max(0,active.timer.total-Math.floor((Date.now()-active.timer.startedAt)/1000));
        setDisplay({key:active.key,remaining:left,total:active.timer.total});
        if(left===0){
          active.timer.running=false;active.timer.done=true;
          timers.setTimer(active.key,active.timer);
          sendTimerNotification();
        }
      }else{setDisplay(null)}
    };
    tick();
    intervalRef.current=setInterval(tick,1000);
    return function(){if(intervalRef.current)clearInterval(intervalRef.current)};
  },[timers.rev]);

  if(!display||display.remaining===0)return null;
  return h("div",{style:{position:"fixed",bottom:0,left:0,right:0,zIndex:100,padding:"10px 16px",paddingBottom:"max(env(safe-area-inset-bottom, 0px), 10px)",background:"rgba(10,10,15,0.95)",borderTop:"1px solid rgba(245,158,11,0.3)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"space-between"}},
    h("div",{style:{display:"flex",alignItems:"center",gap:10}},
      h("div",{className:"timer-active",style:{width:8,height:8,borderRadius:4,background:"#f59e0b"}}),
      h("span",{style:{fontSize:12,color:"#9ca3af",fontWeight:600}},"Rest"),
      h("span",{style:{fontSize:18,fontWeight:800,color:"#f59e0b",fontVariantNumeric:"tabular-nums"}},fmtTime(display.remaining))),
    h("button",{onClick:function(){timers.setTimer(display.key,{total:display.total,startedAt:null,running:false,done:false})},style:{padding:"4px 12px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#6b7280",fontSize:11,fontWeight:600,cursor:"pointer"}},"Dismiss"));
}

/* ── Rest Timer ── */
function RestTimer(props){
  var exKey=props.exKey,defaultSeconds=props.defaultSeconds;
  var timers=useTimers();
  var s=useState(function(){var t=timers.getTimer(exKey);return t?t.total:defaultSeconds}),total=s[0],setTotal=s[1];
  var totalRef=useRef(total);
  useEffect(function(){totalRef.current=total},[total]);
  /* Derive running/done/remaining from context timer */
  var t=timers.getTimer(exKey);
  var running=!!(t&&t.running);
  var done=!!(t&&t.done&&!t.running);
  /* Live countdown via single interval */
  var sr=useState(function(){if(t&&t.running)return Math.max(0,t.total-Math.floor((Date.now()-t.startedAt)/1000));return null}),remaining=sr[0],setRemaining=sr[1];
  useEffect(function(){
    if(!t||!t.running){setRemaining(t&&t.done?0:null);return}
    setTotal(t.total);totalRef.current=t.total;
    var tick=function(){var left=Math.max(0,t.total-Math.floor((Date.now()-t.startedAt)/1000));setRemaining(left);if(left===0){t.running=false;t.done=true;timers.setTimer(exKey,t)}};
    tick();var id=setInterval(tick,1000);return function(){clearInterval(id)};
  },[timers.rev,exKey]);
  var startFn=useCallback(function(){timers.triggerTimer(exKey,totalRef.current)},[exKey,timers]);
  var stopFn=useCallback(function(){timers.setTimer(exKey,{total:totalRef.current,startedAt:null,running:false,done:false})},[exKey,timers]);
  var progress=running&&remaining!==null?remaining/total:done?0:1;var display=remaining!==null?remaining:total;var color=done?"#22c55e":running?"#f59e0b":"#4b5563";
  var presets=[45,60,90,120,150];
  return h("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}},
    h("div",{style:{position:"relative",width:48,height:48,flexShrink:0}},h("svg",{width:48,height:48,style:{transform:"rotate(-90deg)"}},h("circle",{cx:24,cy:24,r:20,fill:"none",stroke:"rgba(255,255,255,0.05)",strokeWidth:3}),h("circle",{cx:24,cy:24,r:20,fill:"none",stroke:color,strokeWidth:3,strokeDasharray:2*Math.PI*20,strokeDashoffset:2*Math.PI*20*(1-progress),strokeLinecap:"round",style:{transition:"stroke-dashoffset 0.3s"}})),h("div",{style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontVariantNumeric:"tabular-nums",color:done?"#22c55e":"#e5e7eb"}},fmtTime(display))),
    h("div",{style:{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}},
      !running?h("button",{onClick:startFn,style:{padding:"5px 12px",borderRadius:7,border:"none",background:done?"#22c55e":"#f59e0b",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}},done?"Restart":"Start"):h("button",{onClick:stopFn,style:{padding:"5px 12px",borderRadius:7,border:"none",background:"#ef4444",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}},"Stop"),
      h("div",{style:{display:"flex",gap:3}},presets.map(function(sec){return h("button",{key:sec,onClick:function(){setTotal(sec);totalRef.current=sec;if(!running){setRemaining(null);timers.setTimer(exKey,{total:sec,startedAt:null,running:false,done:false})}},style:{padding:"3px 6px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",background:total===sec?"rgba(245,158,11,0.18)":"rgba(255,255,255,0.04)",color:total===sec?"#f59e0b":"#6b7280",border:total===sec?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(255,255,255,0.07)"}},sec<60?sec+"s":(sec/60|0)+(sec%60?":"+(sec%60+"").padStart(2,"0"):"m"))}))));
}

/* ── Strength Trend Chart ── */
function StrengthChart(props){
  var hist=props.hist;
  if(hist.length<2)return null;
  /* Compute e1RM and best weight per session, reversed to chronological */
  var points=hist.slice().reverse().map(function(entry){
    var bestW=0,bestE1rm=0;
    entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var w=parseFloat(s.weight),r=parseInt(s.reps);if(w>bestW)bestW=w;var e=calc1RM(w,r);if(e>bestE1rm)bestE1rm=e}});
    return{date:entry.date,weight:bestW,e1rm:bestE1rm};
  }).filter(function(p){return p.weight>0});
  if(points.length<2)return null;
  var W=280,H=70,pad=4;
  var e1rmVals=points.map(function(p){return p.e1rm});var wVals=points.map(function(p){return p.weight});
  var mn=Math.min(Math.min.apply(null,e1rmVals),Math.min.apply(null,wVals));
  var mx=Math.max(Math.max.apply(null,e1rmVals),Math.max.apply(null,wVals));
  var range=mx-mn||1;
  var toPath=function(vals){return vals.map(function(v,i){return(pad+i*(W-2*pad)/(vals.length-1))+","+(pad+(1-(v-mn)/range)*(H-2*pad))}).join(" ")};
  var e1rmPath=toPath(e1rmVals);var wPath=toPath(wVals);
  var first=e1rmVals[0],last=e1rmVals[e1rmVals.length-1];var delta=last-first;
  var arrow=delta>0?"↑":delta<0?"↓":"→";var color=delta>0?"#22c55e":delta<0?"#ef4444":"#6b7280";
  return h("div",{style:{marginTop:8,marginBottom:4,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)"}},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
      h("span",{style:{fontSize:10,fontWeight:700,color:"#6b7280"}},"Strength Trend"),
      h("span",{style:{fontSize:11,fontWeight:700,color:color}},arrow+" e1RM "+(delta>0?"+":"")+delta)),
    h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none"},
      h("polyline",{points:wPath,fill:"none",stroke:"rgba(245,158,11,0.4)",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"}),
      h("polyline",{points:e1rmPath,fill:"none",stroke:"#818cf8",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"})),
    h("div",{style:{display:"flex",gap:12,marginTop:4}},
      h("span",{style:{fontSize:9,color:"#818cf8",fontWeight:600}},"● e1RM"),
      h("span",{style:{fontSize:9,color:"rgba(245,158,11,0.6)",fontWeight:600}},"● Weight")));
}

/* ── History Panel ── */
function HistoryPanel(props){
  var hist=useMemo(function(){return getHistory(props.dayId,props.exId,12)},[props.dayId,props.exId]);
  if(!hist.length)return h("div",{style:{fontSize:11,color:"#71717a",fontStyle:"italic",padding:"6px 0"}},"No previous sessions yet.");
  return h("div",{className:"fade-in",style:{marginTop:6}},
    h(StrengthChart,{hist:hist}),
    hist.map(function(entry){var d=new Date(entry.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});var bestE1rm=0;entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var e=calc1RM(s.weight,s.reps);if(e>bestE1rm)bestE1rm=e}});var pastData=loadDayData(props.dayId,entry.date);var rpe=pastData.rpe&&pastData.rpe[props.exId]?pastData.rpe[props.exId]:null;var rpeColor=rpe?rpe<=7?"#22c55e":rpe===8?"#f59e0b":rpe===9?"#f97316":"#ef4444":null;var exNote=pastData.exNotes&&pastData.exNotes[props.exId]?pastData.exNotes[props.exId]:null;return h("div",{key:entry.date,style:{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}},h("div",{style:{display:"flex",alignItems:"center",gap:8}},h("span",{style:{fontSize:10,fontWeight:700,color:"#4b5563",width:44,flexShrink:0}},label),h("div",{style:{display:"flex",gap:6,flex:1,flexWrap:"wrap"}},entry.sets.map(function(s,i){return(s.weight||s.reps)?h("span",{key:i,style:{fontSize:10,color:s.done?"#6b7280":"#4b5563",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}},(s.weight||"—")+"×"+(s.reps||"—")):null}).filter(Boolean)),bestE1rm>0?h("span",{style:{fontSize:9,fontWeight:600,color:"#818cf8",flexShrink:0}},"e1RM "+bestE1rm):null,rpe?h("span",{style:{fontSize:9,fontWeight:700,color:rpeColor,flexShrink:0}},"RPE "+rpe):null),exNote?h("div",{style:{marginLeft:52,fontSize:10,color:"#6b7280",fontStyle:"italic",marginTop:1}},exNote):null)}));
}

/* ── Machine / Bar Weight ── */
function MachineWeightInput(props){
  var unit=getExUnit(props.exId);
  var s=useState(false),show=s[0],setShow=s[1];var s2=useState(function(){return getMachineWeight(props.exId)}),weight=s2[0],setWeight=s2[1];
  var save=useCallback(function(v){var num=Math.max(0,parseFloat(v)||0);setWeight(num);setMachineWeightLS(props.exId,num)},[props.exId]);
  var label=props.isMachine?(weight>0?"Machine base: "+weight+" "+unit+" ✎":"+ Set machine base weight"):(weight>0?"Bar weight: "+weight+" "+unit+" ✎":"+ Set bar weight (default "+(unit==="kg"?20:45)+")");
  return h("div",{style:{padding:"4px 0"}},h("button",{onClick:function(){setShow(!show)},style:{fontSize:11,color:"#6b7280",background:"none",border:"none",cursor:"pointer",padding:"2px 0",textDecoration:"underline",textDecorationColor:"rgba(107,114,128,0.3)",textUnderlineOffset:2}},label),show&&h("div",{className:"fade-in",style:{display:"flex",alignItems:"center",gap:8,marginTop:6}},h("input",{type:"number",inputMode:"decimal",value:weight||"",placeholder:props.isMachine?"0":unit==="kg"?"20":"45",onChange:function(e){save(e.target.value)},style:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,padding:"6px 8px",color:"#e5e7eb",fontSize:13,fontWeight:600,textAlign:"center",width:70,outline:"none"}}),h("span",{style:{fontSize:11,color:"#6b7280"}},unit+(props.isMachine?" (stack start)":" (bar)"))));
}

/* ── Plate Calculator Display ── */
function PlateDisplay(props){
  var weight=parseFloat(props.weight);var unit=props.exUnit||getUnit();var barOverride=getMachineWeight(props.exId);
  if(!weight||weight<=0)return null;
  var bar=barOverride>0?barOverride:(unit==="kg"?BAR_KG:BAR_LBS);
  if(weight<=bar&&barOverride<=0)return null;
  var plates=unit==="kg"?PLATES_KG:PLATES_LBS;
  var perSide=(weight-bar)/2;if(perSide<0)return h("div",{style:{fontSize:10,color:"#4b5563",marginTop:2}},"Bar only ("+bar+" "+unit+")");
  var result=[];var rem=perSide;
  plates.forEach(function(p){while(rem>=p-0.001){result.push(p);rem-=p}});
  var remainder=Math.round(rem*100)/100;
  if(result.length===0)return h("div",{style:{fontSize:10,color:"#4b5563",marginTop:2}},"Bar only ("+bar+" "+unit+")");
  var plateStr=result.join(" + ");
  return h("div",{style:{fontSize:10,color:"#4b5563",marginTop:2,fontStyle:"italic"}},
    "Per side: "+plateStr+" "+unit,remainder>0?" ("+remainder+" "+unit+" unloadable)":"");
}

/* ── Warmup Sets ── */
function WarmupSets(props){
  var exId=props.exId,dayId=props.dayId;var unit=getExUnit(exId);
  var dayData=useDayData();
  var s=useState(function(){var d=dayData.getData(dayId);return d.warmups&&d.warmups[exId]?d.warmups[exId]:[]}),sets=s[0],setSets=s[1];
  var s2=useState(sets.length>0),show=s2[0],setShow=s2[1];
  var persist=useCallback(function(d){var all=dayData.getData(dayId);if(!all.warmups)all.warmups={};all.warmups[exId]=d;dayData.saveData(dayId,all);markSessionStart()},[dayId,exId,dayData]);
  var addSet=function(){var next=sets.concat([{weight:"",reps:""}]);setSets(next);persist(next);setShow(true)};
  var update=function(idx,field,val){if(val!==""&&(isNaN(Number(val))||Number(val)<0))return;var next=sets.map(function(s,i){return i===idx?Object.assign({},s,{[field]:val}):s});setSets(next);persist(next)};
  var remove=function(idx){var next=sets.filter(function(_,i){return i!==idx});setSets(next);persist(next)};
  var autoRamp=function(){
    var saved=dayData.getData(dayId);var exSets=saved.exercises&&saved.exercises[exId];var w=0;
    if(exSets)exSets.forEach(function(s){if(s.weight){var v=parseFloat(s.weight);if(v>w)w=v}});
    if(!w){var hist=getHistory(dayId,exId,1);if(hist.length)hist[0].sets.forEach(function(s){if(s.done&&s.weight){var v=parseFloat(s.weight);if(v>w)w=v}})}
    if(!w)return;
    var bar=unit==="kg"?20:45;var ramp=[{weight:String(Math.round(bar)),reps:"10"},{weight:String(Math.round(w*0.5)),reps:"5"},{weight:String(Math.round(w*0.7)),reps:"3"},{weight:String(Math.round(w*0.85)),reps:"1"}];
    ramp=ramp.filter(function(r){return parseFloat(r.weight)>=bar});var seen={};ramp=ramp.filter(function(r){if(seen[r.weight])return false;seen[r.weight]=true;return true});
    setSets(ramp);persist(ramp);setShow(true);
  };
  var workingWeight=useMemo(function(){var saved=dayData.getData(dayId);var exSets=saved.exercises&&saved.exercises[exId];var w=0;if(exSets)exSets.forEach(function(s){if(s.weight){var v=parseFloat(s.weight);if(v>w)w=v}});if(!w){var hist=getHistory(dayId,exId,1);if(hist.length)hist[0].sets.forEach(function(s){if(s.done&&s.weight){var v=parseFloat(s.weight);if(v>w)w=v}})}return w},[dayId,exId]);
  var iStyle={background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"7px 4px",color:"#a78bfa",fontSize:13,fontWeight:600,textAlign:"center",outline:"none",width:"100%",boxSizing:"border-box"};
  return h("div",{style:{marginBottom:6}},h("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:show&&sets.length?6:0}},h("button",{onClick:function(){setShow(!show)},style:{fontSize:10,fontWeight:700,color:"#a78bfa",background:"none",border:"none",padding:"3px 0",cursor:"pointer"}},show?"▾ Warmup":"▸ Warmup"),h("button",{onClick:addSet,style:{fontSize:10,fontWeight:700,color:"#6b7280",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:5,padding:"3px 8px",cursor:"pointer"}},"+  Add"),workingWeight>0&&sets.length===0?h("button",{onClick:autoRamp,style:{fontSize:10,fontWeight:700,color:"#a78bfa",background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:5,padding:"3px 8px",cursor:"pointer"}},"Auto Warmup"):null),show&&sets.length>0&&h("div",{className:"fade-in"},sets.map(function(set,i){return h("div",{key:i,style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr 28px",gap:5,alignItems:"center",marginBottom:3}},h("span",{style:{fontSize:10,color:"#a78bfa",textAlign:"center",fontWeight:600}},"W"+(i+1)),h("input",{type:"number",inputMode:"decimal",placeholder:unit,value:set.weight,onChange:function(e){update(i,"weight",e.target.value)},style:iStyle}),h("input",{type:"number",inputMode:"numeric",placeholder:"reps",value:set.reps,onChange:function(e){update(i,"reps",e.target.value)},style:iStyle}),h("button",{onClick:function(){remove(i)},style:{width:24,height:24,borderRadius:6,border:"1px solid rgba(239,68,68,0.2)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#ef4444"}},"✕"))})));
}

/* ── Set Logger ── */
function SetLogger(props){
  var exId=props.exId,numSets=props.numSets,dayId=props.dayId,onSetUpdate=props.onSetUpdate,onSetDone=props.onSetDone,exKey=props.exKey,rest=props.rest,isMachine=props.isMachine,increment=props.increment||5;
  var dayData=useDayData();
  var su=useState(function(){return getExUnit(exId)}),unit=su[0],setUnitLocal=su[1];
  var toggleUnit=function(){var next=unit==="lbs"?"kg":"lbs";setUnitLocal(next);setExUnit(exId,next)};
  var s=useState(function(){var saved=dayData.getData(dayId);var ex=saved.exercises&&saved.exercises[exId];return Array.from({length:numSets},function(_,i){return ex&&ex[i]?{weight:ex[i].weight||"",reps:ex[i].reps||"",done:!!ex[i].done}:{weight:"",reps:"",done:false}})}),data=s[0],setData=s[1];
  var lastSession=useMemo(function(){var h=getHistory(dayId,exId,1);return h.length?h[0].sets:null},[dayId,exId]);
  var save=useCallback(function(d){var all=dayData.getData(dayId);if(!all.exercises)all.exercises={};all.exercises[exId]=d;dayData.saveData(dayId,all)},[dayId,exId,dayData]);
  var persist=useCallback(function(d){save(d);markSessionStart()},[save]);
  var MAX_WEIGHT=1500,MAX_REPS=100;
  var update=function(idx,field,val){if(val!==""&&(isNaN(Number(val))||Number(val)<0))return;if(val!==""&&field==="weight"&&Number(val)>MAX_WEIGHT)return;if(val!==""&&field==="reps"&&Number(val)>MAX_REPS)return;setData(function(prev){var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{[field]:val}):s});save(next);return next})};
  var toggle=function(idx){setData(function(prev){var wasDone=prev[idx].done;var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{done:!s.done}):s});persist(next);if(!wasDone){if(onSetDone)onSetDone();showUndoToast("Set "+(idx+1)+" logged",function(){setData(function(cur){var reverted=cur.map(function(s,i){return i===idx?Object.assign({},s,{done:false}):s});persist(reverted);if(onSetUpdate)onSetUpdate();return reverted})})}else if(onSetUpdate){onSetUpdate()}return next})};
  var autoFill=function(idx,field){if(lastSession&&lastSession[idx]&&lastSession[idx][field])update(idx,field,lastSession[idx][field])};
  var step=function(idx,field,delta){setData(function(prev){var cur=parseFloat(prev[idx][field])||0;var val=Math.max(0,cur+delta);var max=field==="weight"?MAX_WEIGHT:MAX_REPS;if(val>max)val=max;var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{[field]:String(val)}):s});save(next);return next})};
  var addExtraSet=function(){setData(function(prev){var last=prev[prev.length-1];var next=prev.concat([{weight:last&&last.weight?last.weight:"",reps:"",done:false,extra:true}]);save(next);return next})};
  var removeExtraSet=function(idx){setData(function(prev){var next=prev.filter(function(_,i){return i!==idx});save(next);if(onSetUpdate)onSetUpdate();return next})};
  var iStyle={background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,padding:"9px 4px",color:"#e5e7eb",fontSize:14,fontWeight:600,textAlign:"center",outline:"none",width:"100%",boxSizing:"border-box",fontVariantNumeric:"tabular-nums"};
  var stepBtnStyle={background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:5,width:24,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#6b7280",flexShrink:0,padding:0};

  var firstWeight=null;for(var wi=0;wi<data.length;wi++){if(data[wi].weight){firstWeight=data[wi].weight;break}}
  var hasExtra=data.length>numSets;var lastCol=hasExtra?"52px":"34px";

  return h("div",{style:{marginTop:4}},h("div",{style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr "+lastCol,gap:5,marginBottom:5}},h("span",{style:{fontSize:9,color:"#4b5563",textAlign:"center",fontWeight:700}},"SET"),h("button",{onClick:toggleUnit,style:{fontSize:9,fontWeight:700,textAlign:"center",cursor:"pointer",background:"none",border:"none",color:"#f59e0b",padding:0}},unit.toUpperCase()+" ↔"),h("span",{style:{fontSize:9,color:"#4b5563",textAlign:"center",fontWeight:700}},"REPS"),h("span",null)),data.map(function(set,i){var ghost=lastSession&&lastSession[i];return h("div",{key:i,style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr "+lastCol,gap:5,alignItems:"center",marginBottom:4}},h("span",{style:{fontSize:12,color:i>=numSets?"#f59e0b":"#4b5563",textAlign:"center",fontWeight:700}},i>=numSets?"+"+(i-numSets+1):i+1),h("div",{style:{display:"flex",alignItems:"center",gap:2}},h("button",{onClick:function(){step(i,"weight",-increment)},style:stepBtnStyle},"\u2212"),h("input",{type:"number",inputMode:"decimal",placeholder:ghost&&ghost.weight?String(ghost.weight):"—",value:set.weight,onChange:function(e){update(i,"weight",e.target.value)},onFocus:function(){if(!set.weight&&ghost&&ghost.weight)autoFill(i,"weight")},style:Object.assign({},iStyle,{opacity:set.done?.4:1})}),h("button",{onClick:function(){step(i,"weight",increment)},style:stepBtnStyle},"+")),h("div",{style:{display:"flex",alignItems:"center",gap:2}},h("button",{onClick:function(){step(i,"reps",-1)},style:stepBtnStyle},"\u2212"),h("input",{type:"number",inputMode:"numeric",placeholder:ghost&&ghost.reps?String(ghost.reps):"—",value:set.reps,onChange:function(e){update(i,"reps",e.target.value)},onFocus:function(){if(!set.reps&&ghost&&ghost.reps)autoFill(i,"reps")},style:Object.assign({},iStyle,{opacity:set.done?.4:1})}),h("button",{onClick:function(){step(i,"reps",1)},style:stepBtnStyle},"+")),h("div",{style:{display:"flex",alignItems:"center",gap:2}},h("button",{onClick:function(){toggle(i)},className:set.done?"set-done-pop":"",style:{width:32,height:32,borderRadius:7,border:set.done?"2px solid #22c55e":"2px solid rgba(255,255,255,0.08)",background:set.done?"rgba(34,197,94,0.15)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:set.done?"#22c55e":"#71717a"}},set.done?"✓":""),i>=numSets?h("button",{onClick:function(){removeExtraSet(i)},style:{width:16,height:16,borderRadius:4,border:"1px solid rgba(239,68,68,0.3)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#ef4444",padding:0}},"✕"):null))}),
    data.length<numSets+4?h("button",{onClick:addExtraSet,style:{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:"100%",padding:"6px",borderRadius:7,border:"1px dashed rgba(245,158,11,0.25)",background:"transparent",color:"#f59e0b",fontSize:11,fontWeight:600,cursor:"pointer",marginTop:2,opacity:0.7}},"+1 Set (drop set / extra)"):null,
    !isMachine&&firstWeight?h(PlateDisplay,{weight:firstWeight,exId:exId,exUnit:unit}):null);
}

/* ── RPE Rating ── */
function RPERating(props){
  var exId=props.exId,dayId=props.dayId,allDone=props.allDone;
  var dayData=useDayData();
  var s=useState(function(){var d=dayData.getData(dayId);return d.rpe&&d.rpe[exId]?d.rpe[exId]:null}),rpe=s[0],setRpe=s[1];
  if(!allDone)return null;
  var save=function(val){setRpe(val);var all=dayData.getData(dayId);if(!all.rpe)all.rpe={};all.rpe[exId]=val;dayData.saveData(dayId,all)};
  var labels={6:"Light",7:"Moderate",8:"Hard",9:"Very Hard",10:"Max"};
  return h("div",{className:"fade-in",style:{marginTop:8,padding:"8px 0"}},h("div",{style:{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:6}},"How hard was that? (RPE)"),h("div",{style:{display:"flex",gap:4}},[6,7,8,9,10].map(function(val){var active=rpe===val;var colors={6:"#22c55e",7:"#84cc16",8:"#f59e0b",9:"#f97316",10:"#ef4444"};return h("button",{key:val,onClick:function(){save(val)},style:{flex:1,padding:"6px 2px",borderRadius:8,border:active?"2px solid "+colors[val]:"1px solid rgba(255,255,255,0.08)",background:active?"rgba(255,255,255,0.06)":"transparent",cursor:"pointer",textAlign:"center"}},h("div",{style:{fontSize:15,fontWeight:800,color:active?colors[val]:"#4b5563"}},val),h("div",{style:{fontSize:8,fontWeight:600,color:active?"#9ca3af":"#71717a",marginTop:1}},labels[val]))})),rpe?h("div",{style:{fontSize:11,color:"#6b7280",marginTop:4,fontStyle:"italic"}},rpe<=7?"Good — room to progress next session.":rpe===8?"Solid — right in the hypertrophy zone.":rpe===9?"Tough — consider same weight next time.":"Max effort — monitor fatigue, deload may be needed."):null);
}

/* ── Exercise Notes ── */
function ExerciseNotes(props){
  var exId=props.exId,dayId=props.dayId;
  var dayData=useDayData();
  var s=useState(function(){var d=dayData.getData(dayId);return d.exNotes&&d.exNotes[exId]?d.exNotes[exId]:""}),note=s[0],setNote=s[1];
  var save=function(val){setNote(val);var all=dayData.getData(dayId);if(!all.exNotes)all.exNotes={};all.exNotes[exId]=val;dayData.saveData(dayId,all)};
  return h("div",{style:{marginTop:6}},
    h("input",{type:"text",value:note,onChange:function(e){save(e.target.value)},placeholder:"Session note (e.g. shoulder felt tight)...",style:{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"7px 10px",color:"#d1d5db",fontSize:12,outline:"none",fontStyle:note?"normal":"italic"}}));
}

/* ── Quick Log ── */
function QuickLogBtn(props){
  var exId=props.exId,numSets=props.numSets,dayId=props.dayId,exKey=props.exKey,rest=props.rest,onLog=props.onLog;
  var dayData=useDayData();
  var timers=useTimers();
  var handleQL=function(){
    var all=dayData.getData(dayId);if(!all.exercises)all.exercises={};
    var sets=all.exercises[exId]||Array.from({length:numSets},function(){return{weight:"",reps:"",done:false}});
    var idx=-1;for(var i=0;i<numSets;i++){if(!sets[i]||!sets[i].done){idx=i;break}}if(idx===-1)return;
    var w="",r="";if(idx>0&&sets[idx-1]&&sets[idx-1].weight){w=sets[idx-1].weight;r=sets[idx-1].reps}else{var hist=getHistory(dayId,exId,1);if(hist.length&&hist[0].sets&&hist[0].sets[idx]){w=hist[0].sets[idx].weight||"";r=hist[0].sets[idx].reps||""}}
    if(!w)return;sets[idx]={weight:w,reps:r,done:true};all.exercises[exId]=sets;dayData.saveData(dayId,all);markSessionStart();timers.triggerTimer(exKey,rest);if(onLog)onLog();
  };
  var all=dayData.getData(dayId);var sets=all.exercises&&all.exercises[exId];var nextIdx=-1;
  if(sets){for(var i=0;i<numSets;i++){if(!sets[i]||!sets[i].done){nextIdx=i;break}}}else{nextIdx=0}if(nextIdx===-1)return null;
  var hasRef=false;if(nextIdx>0&&sets&&sets[nextIdx-1]&&sets[nextIdx-1].weight)hasRef=true;else{var hist=getHistory(dayId,exId,1);if(hist.length&&hist[0].sets&&hist[0].sets[nextIdx]&&hist[0].sets[nextIdx].weight)hasRef=true}
  if(!hasRef)return null;
  return h("button",{onClick:handleQL,style:{width:"100%",padding:"10px",borderRadius:10,border:"1px solid rgba(34,197,94,0.3)",background:"rgba(34,197,94,0.08)",color:"#22c55e",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:8}},"⚡ Log Set "+(nextIdx+1)+" + Start Timer");
}

/* ── Exercise Card ── */
function ExerciseCard(props){
  var exercise=props.exercise,index=props.index,dayId=props.dayId,onSetUpdate=props.onSetUpdate,isNext=props.isNext;
  var unit=getExUnit(exercise.id);
  var dayData=useDayData();
  var timers=useTimers();
  var s=useState(false),expanded=s[0],setExpanded=s[1];var s2=useState(false),showTip=s2[0],setShowTip=s2[1];var s3=useState(false),showHistory=s3[0],setShowHistory=s3[1];
  var sdr=useState(0),dataRev=sdr[0],bumpDataRev=sdr[1];
  var exKey=dayId+"_"+exercise.id;var saved=dayData.getData(dayId);var exData=saved.exercises&&saved.exercises[exercise.id];
  var completedSets=exData?exData.filter(function(s){return s.done}).length:0;
  /* Only count prescribed sets (not extra/drop sets) for allDone */
  var prescribedDone=exData?exData.slice(0,exercise.sets).filter(function(s){return s.done}).length:0;
  var allDone=prescribedDone===exercise.sets;
  var timerData=timers.getTimer(exKey);
  var timerRunning=timerData&&timerData.running;
  var meso=getMesocycle();var isDeloadWeek=meso.week===4;
  var overload=useMemo(function(){if(isDeloadWeek)return null;return getOverloadSuggestion(dayId,exercise)},[dayId,exercise,isDeloadWeek]);
  var deloadSuggestion=useMemo(function(){if(!isDeloadWeek)return null;var hist=getHistory(dayId,exercise.id,1);if(!hist.length)return null;var comp=hist[0].sets.filter(function(s){return s.done&&s.weight});if(!comp.length)return null;var w=parseFloat(comp[0].weight)||0;return w>0?Math.round(w*0.55):null},[dayId,exercise,isDeloadWeek]);
  var e1rm=useMemo(function(){var best=0;if(exData)exData.forEach(function(s){if(s.done&&s.weight&&s.reps){var e=calc1RM(s.weight,s.reps);if(e>best)best=e}});return best},[exData]);
  var restLabel=exercise.rest<60?exercise.rest+"s":(exercise.rest/60|0)+(exercise.rest%60?":"+(exercise.rest%60+"").padStart(2,"0"):"m");
  var onToggleDone=useCallback(function(){
    if(getAutoTimer()){timers.triggerTimer(exKey,exercise.rest)}
    if(onSetUpdate)onSetUpdate();
  },[exKey,exercise.rest,onSetUpdate,timers]);
  var onQuickLog=useCallback(function(){bumpDataRev(function(r){return r+1});if(onSetUpdate)onSetUpdate()},[onSetUpdate]);
  return h("div",{style:{background:allDone?"rgba(34,197,94,0.03)":isNext?"rgba(245,158,11,0.04)":"rgba(255,255,255,0.025)",borderRadius:14,border:allDone?"1px solid rgba(34,197,94,0.12)":isNext?"1px solid rgba(245,158,11,0.2)":"1px solid rgba(255,255,255,0.055)",borderLeft:isNext&&!allDone?"3px solid #f59e0b":undefined,padding:"12px 14px",marginBottom:8,transition:"all 0.2s"}},
    h("div",{onClick:function(){setExpanded(!expanded)},style:{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,WebkitUserSelect:"none",userSelect:"none"}},
      h("div",{style:{flex:1}},h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},h("span",{style:{fontSize:10,fontWeight:800,color:allDone?"#22c55e":"#f59e0b",background:allDone?"rgba(34,197,94,0.1)":"rgba(245,158,11,0.1)",padding:"2px 6px",borderRadius:4,letterSpacing:.4,lineHeight:"16px"}},index+1),h("span",{style:{fontSize:14,fontWeight:700,color:allDone?"#6b7280":"#f1f5f9",lineHeight:1.3,textDecoration:allDone?"line-through":"none",textDecorationColor:"rgba(107,114,128,0.4)"}},exercise.name),isNext&&!allDone?h("span",{style:{fontSize:9,fontWeight:800,color:"#f59e0b",background:"rgba(245,158,11,0.15)",padding:"2px 6px",borderRadius:4,letterSpacing:.5}},"UP NEXT"):null,overload&&!allDone?h("span",{style:{fontSize:10,fontWeight:700,color:"#22c55e",background:"rgba(34,197,94,0.1)",padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}},overload.type==="reps"?"↑ More reps":"↑ "+overload.to+" "+unit):null,deloadSuggestion&&!allDone?h("span",{style:{fontSize:10,fontWeight:700,color:"#f59e0b",background:"rgba(245,158,11,0.1)",padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}},"↓ Deload ~"+deloadSuggestion+" "+unit):null),h("div",{style:{display:"flex",alignItems:"center",gap:6,marginTop:3}},h("span",{style:{fontSize:11,color:"#6b7280"}},exercise.sets+"×"+exercise.reps+" · "+restLabel),completedSets>0?h("span",{style:{fontSize:10,fontWeight:700,color:allDone?"#22c55e":"#f59e0b",background:allDone?"rgba(34,197,94,0.1)":"rgba(245,158,11,0.08)",padding:"1px 5px",borderRadius:4}},completedSets+"/"+exercise.sets):null,e1rm>0?h("span",{style:{fontSize:10,fontWeight:600,color:"#818cf8",background:"rgba(99,102,241,0.08)",padding:"1px 5px",borderRadius:4,whiteSpace:"nowrap"}},"e1RM "+e1rm):null,timerRunning&&!expanded?h("span",{className:"timer-active",style:{width:6,height:6,borderRadius:3,background:"#f59e0b"}}):null),!expanded?h("div",{style:{fontSize:11,color:"#4b5563",marginTop:2,fontStyle:"italic"}},exercise.notes):null),
      h("span",{style:{fontSize:16,color:"#71717a",transform:expanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",marginTop:2,flexShrink:0}},"\u25BE")),
    /* Collapsed Quick Log for current exercise */
    !expanded&&isNext&&!allDone?h(QuickLogBtn,{exId:exercise.id,numSets:exercise.sets,dayId:dayId,exKey:exKey,rest:exercise.rest,onLog:onQuickLog}):null,
    expanded&&h("div",{className:"fade-in",style:{marginTop:10,borderTop:"1px solid rgba(255,255,255,0.04)",paddingTop:10}},
      h("div",{style:{fontSize:12,color:"#6b7280",fontStyle:"italic",marginBottom:6}},exercise.notes),
      exercise.alternatives&&exercise.alternatives.length>0?h("div",{style:{display:"flex",alignItems:"center",gap:4,marginBottom:6,flexWrap:"wrap"}},h("span",{style:{fontSize:10,fontWeight:600,color:"#71717a"}},"Swap:"),exercise.alternatives.map(function(alt){return h("span",{key:alt,style:{fontSize:10,fontWeight:600,color:"#818cf8",background:"rgba(99,102,241,0.08)",border:"1px solid rgba(99,102,241,0.15)",borderRadius:5,padding:"2px 6px"}},alt)})):null,
      overload?h("div",{style:{fontSize:12,color:"#22c55e",background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.12)",borderRadius:8,padding:"8px 10px",marginBottom:8}},overload.type==="reps"?["📈 Hit top of rep range! ",h("strong",{key:"msg"},overload.msg)]:["💪 Ready to progress! Move up to ",h("strong",{key:"w"},overload.to+" "+unit)," (+"+overload.increment+")"]):null,
      deloadSuggestion?h("div",{style:{fontSize:12,color:"#f59e0b",background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.12)",borderRadius:8,padding:"8px 10px",marginBottom:8}},"🧘 Deload week — reduce to ~",h("strong",null,deloadSuggestion+" "+unit)," (55% of last working weight). Focus on form and recovery."):null,
      exercise.tempo||exercise.rir?h("div",{style:{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}},
        exercise.tempo?h("div",{style:{fontSize:11,color:"#f59e0b",background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.12)",borderRadius:6,padding:"5px 8px"}},"Tempo: ",h("strong",null,exercise.tempo)):null,
        exercise.rir?h("div",{style:{fontSize:11,color:"#818cf8",background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.12)",borderRadius:6,padding:"5px 8px"}},"Target: ",h("strong",null,exercise.rir+" RIR")):null):null,
      h(MachineWeightInput,{exId:exercise.id,isMachine:!!exercise.machine}),
      h(WarmupSets,{exId:exercise.id,dayId:dayId}),
      h(SetLogger,{key:exercise.id+"_"+dataRev,exId:exercise.id,numSets:exercise.sets,dayId:dayId,onSetUpdate:onSetUpdate,onSetDone:onToggleDone,exKey:exKey,rest:exercise.rest,isMachine:!!exercise.machine,increment:exercise.increment||5}),
      h(RPERating,{exId:exercise.id,dayId:dayId,allDone:allDone}),
      h(ExerciseNotes,{exId:exercise.id,dayId:dayId}),
      h(QuickLogBtn,{exId:exercise.id,numSets:exercise.sets,dayId:dayId,exKey:exKey,rest:exercise.rest,onLog:onQuickLog}),
      h(RestTimer,{exKey:exKey,defaultSeconds:exercise.rest}),
      h("div",{style:{display:"flex",gap:6,marginTop:8}},h("button",{onClick:function(){setShowHistory(!showHistory);if(showTip)setShowTip(false)},style:{flex:1,padding:"7px",borderRadius:8,border:"1px solid rgba(99,102,241,0.2)",background:showHistory?"rgba(99,102,241,0.08)":"transparent",color:"#818cf8",fontSize:11,fontWeight:600,cursor:"pointer"}},(showHistory?"Hide":"View")+" History"),h("button",{onClick:function(){setShowTip(!showTip);if(showHistory)setShowHistory(false)},style:{flex:1,padding:"7px",borderRadius:8,border:"1px solid rgba(245,158,11,0.2)",background:showTip?"rgba(245,158,11,0.08)":"transparent",color:"#f59e0b",fontSize:11,fontWeight:600,cursor:"pointer"}},(showTip?"Hide":"")+" Coaching Tip")),
      showHistory&&h(HistoryPanel,{dayId:dayId,exId:exercise.id}),
      showTip&&h("div",{className:"fade-in",style:{marginTop:8,padding:10,borderRadius:10,background:"rgba(245,158,11,0.04)",border:"1px solid rgba(245,158,11,0.1)",fontSize:12,color:"#d1d5db",lineHeight:1.6}},exercise.tip)));
}

/* ── Cardio ── */
var CARDIO_TYPES=[
  {id:"treadmill",label:"Treadmill",icon:"\uD83C\uDFC3",fields:[{key:"duration",label:"MIN",type:"numeric"},{key:"incline",label:"INCLINE %",type:"decimal"},{key:"speed",label:"SPEED",type:"decimal"}],defaults:{duration:30,incline:12,speed:3.0}},
  {id:"bike",label:"Bike",icon:"\uD83D\uDEB2",fields:[{key:"duration",label:"MIN",type:"numeric"},{key:"resistance",label:"LEVEL",type:"numeric"},{key:"rpm",label:"RPM",type:"numeric"}],defaults:{duration:30,resistance:8,rpm:80}},
  {id:"stairclimber",label:"Stair Climber",icon:"\uD83E\uDDF1",fields:[{key:"duration",label:"MIN",type:"numeric"},{key:"level",label:"LEVEL",type:"numeric"},{key:"floors",label:"FLOORS",type:"numeric"}],defaults:{duration:20,level:8,floors:0}},
  {id:"rowing",label:"Rowing",icon:"\uD83D\uDEA3",fields:[{key:"duration",label:"MIN",type:"numeric"},{key:"resistance",label:"LEVEL",type:"numeric"},{key:"distance",label:"METERS",type:"numeric"}],defaults:{duration:20,resistance:6,distance:0}},
  {id:"other",label:"Other",icon:"\u2764\uFE0F",fields:[{key:"duration",label:"MIN",type:"numeric"},{key:"notes",label:"NOTES",type:"text"}],defaults:{duration:30,notes:""}}
];

function CardioLog(props){
  var dayId=props.dayId;var unit=getUnit();var cardioKey="cardio_"+dayId+"_"+today();
  var s=useState(function(){var saved=lsGet(cardioKey);return saved||{done:false,type:"treadmill",duration:30,incline:12,speed:3.0}}),data=s[0],setData=s[1];
  var s2=useState(data.done),expanded=s2[0],setExpanded=s2[1];
  var save=function(d){setData(d);lsSet(cardioKey,d)};var update=function(field,val){save(Object.assign({},data,{[field]:val}))};var toggleDone=function(){save(Object.assign({},data,{done:!data.done}));if(!expanded)setExpanded(true)};
  var cardioType=CARDIO_TYPES.find(function(c){return c.id===(data.type||"treadmill")})||CARDIO_TYPES[0];
  var switchType=function(typeId){var ct=CARDIO_TYPES.find(function(c){return c.id===typeId})||CARDIO_TYPES[0];save(Object.assign({},ct.defaults,{done:data.done,type:typeId}))};
  var speedLabel=unit==="kg"?"km/h":"mph";
  var iStyle={background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,padding:"8px 4px",color:"#e5e7eb",fontSize:14,fontWeight:600,textAlign:"center",outline:"none",width:"100%"};
  return h("div",{style:{background:data.done?"rgba(34,197,94,0.03)":"rgba(255,255,255,0.025)",borderRadius:14,border:data.done?"1px solid rgba(34,197,94,0.12)":"1px solid rgba(255,255,255,0.055)",padding:"12px 14px",marginTop:12}},
    h("div",{onClick:function(){setExpanded(!expanded)},style:{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",WebkitUserSelect:"none",userSelect:"none"}},h("div",{style:{display:"flex",alignItems:"center",gap:8}},h("span",{style:{fontSize:18}},cardioType.icon),h("span",{style:{fontSize:14,fontWeight:700,color:data.done?"#6b7280":"#f1f5f9"}},cardioType.label+" — Cardio"),data.done?h("span",{style:{fontSize:10,fontWeight:700,color:"#22c55e",background:"rgba(34,197,94,0.1)",padding:"2px 6px",borderRadius:4,marginLeft:4}},"Done"):null),h("span",{style:{fontSize:16,color:"#71717a",transform:expanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}},"\u25BE")),
    expanded&&h("div",{className:"fade-in",style:{marginTop:10,borderTop:"1px solid rgba(255,255,255,0.04)",paddingTop:10}},
      /* Cardio type selector */
      h("div",{style:{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}},CARDIO_TYPES.map(function(ct){var active=ct.id===(data.type||"treadmill");return h("button",{key:ct.id,onClick:function(){switchType(ct.id)},style:{padding:"4px 10px",borderRadius:6,border:active?"1px solid rgba(245,158,11,0.4)":"1px solid rgba(255,255,255,0.08)",background:active?"rgba(245,158,11,0.1)":"transparent",color:active?"#f59e0b":"#6b7280",fontSize:10,fontWeight:600,cursor:"pointer"}},ct.icon+" "+ct.label)})),
      /* Dynamic fields */
      h("div",{style:{display:"grid",gridTemplateColumns:"repeat("+Math.min(cardioType.fields.length,3)+", 1fr)",gap:8,marginBottom:10}},cardioType.fields.map(function(f){var fieldLabel=f.key==="speed"?speedLabel.toUpperCase():f.label;return h("div",{key:f.key},h("label",{style:{fontSize:10,fontWeight:700,color:"#4b5563",display:"block",marginBottom:4}},fieldLabel),f.type==="text"?h("input",{type:"text",value:data[f.key]||"",onChange:function(e){update(f.key,e.target.value)},placeholder:"...",style:Object.assign({},iStyle,{textAlign:"left",fontSize:12})}):h("input",{type:"number",inputMode:f.type==="decimal"?"decimal":"numeric",value:data[f.key]||"",onChange:function(e){update(f.key,e.target.value)},style:iStyle}))})),
      h("button",{onClick:toggleDone,style:{width:"100%",padding:"10px",borderRadius:10,border:data.done?"1px solid rgba(34,197,94,0.3)":"1px solid rgba(255,255,255,0.1)",background:data.done?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.03)",color:data.done?"#22c55e":"#9ca3af",fontSize:13,fontWeight:700,cursor:"pointer"}},data.done?"✓ Completed":"Mark Complete")));
}

/* ── Weekly Volume Dashboard ── */
var MUSCLE_LABELS={chest:"Chest",back:"Back",quads:"Quads",hamstrings:"Hams",glutes:"Glutes",front_delt:"Front Delt",side_delt:"Side Delt",rear_delt:"Rear Delt",biceps:"Biceps",triceps:"Triceps",calves:"Calves",abs:"Abs"};
var VOLUME_TARGETS={chest:[10,20],back:[10,20],quads:[10,20],hamstrings:[10,16],glutes:[8,16],front_delt:[6,12],side_delt:[10,20],rear_delt:[6,12],biceps:[10,20],triceps:[10,16],calves:[8,16],abs:[8,16]};

function calcWeeklyVolume(config,dayData){
  var vol={};
  config.days.forEach(function(day){
    var saved=dayData?dayData.getData(day.id):loadDayData(day.id);
    var customs=getCustomExercises(day.id);
    var allEx=day.exercises.concat(customs);
    allEx.forEach(function(ex){
      var muscles=ex.muscles||[];
      var sets=saved.exercises&&saved.exercises[ex.id];
      var doneSets=sets?sets.filter(function(s){return s.done}).length:0;
      if(doneSets>0){muscles.forEach(function(m){if(!vol[m])vol[m]=0;vol[m]+=doneSets})}
    });
  });
  return vol;
}

function calcMuscleFrequency(config){
  var freq={};
  config.days.forEach(function(day){
    var muscles={};
    var allEx=day.exercises.concat(getCustomExercises(day.id));
    allEx.forEach(function(ex){(ex.muscles||[]).forEach(function(m){muscles[m]=true})});
    Object.keys(muscles).forEach(function(m){if(!freq[m])freq[m]=0;freq[m]++});
  });
  return freq;
}

function VolumeDashboard(props){
  var onClose=props.onClose,config=props.config;
  var dayData=useDayData();
  var vol=useMemo(function(){return calcWeeklyVolume(config,dayData)},[config,dayData.rev]);
  var freq=useMemo(function(){return calcMuscleFrequency(config)},[config]);
  var muscleKeys=Object.keys(MUSCLE_LABELS);
  var maxSets=Math.max(20,Math.max.apply(null,muscleKeys.map(function(m){return vol[m]||0})));
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()}},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"#f1f5f9"}},"Weekly Volume"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}},"✕")),
    h("div",{style:{fontSize:11,color:"#6b7280",marginBottom:14}},"Sets completed this week per muscle group. Target: 10-20 sets for most muscles."),
    muscleKeys.map(function(m){
      var sets=vol[m]||0;var target=VOLUME_TARGETS[m]||[10,20];
      var pct=sets/maxSets;
      var color=sets===0?"#71717a":sets<target[0]?"#f59e0b":sets>target[1]?"#ef4444":"#22c55e";
      var label=sets===0?"—":sets<target[0]?"Low":sets>target[1]?"High":"Good";
      return h("div",{key:m,style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
        h("div",{style:{width:70,fontSize:11,fontWeight:600,color:"#9ca3af",textAlign:"right",flexShrink:0}},MUSCLE_LABELS[m]),
        h("div",{style:{flex:1,height:16,borderRadius:4,background:"rgba(255,255,255,0.04)",overflow:"hidden",position:"relative"}},
          h("div",{style:{width:(pct*100)+"%",height:"100%",borderRadius:4,background:color,transition:"width 0.3s",minWidth:sets>0?2:0}}),
          h("span",{style:{position:"absolute",right:4,top:0,lineHeight:"16px",fontSize:9,fontWeight:700,color:"#9ca3af"}},sets>0?sets:"")),
        h("span",{style:{width:30,fontSize:9,fontWeight:700,color:color,textAlign:"left",flexShrink:0}},label),
        freq[m]?h("span",{style:{width:28,fontSize:9,fontWeight:600,color:"#71717a",textAlign:"center",flexShrink:0}},"×"+freq[m]):null);
    }),
    /* 4-Week Volume Trend */
    (function(){
      var weeks=[];
      for(var w=0;w<4;w++){
        var weekVol={};var d=new Date();d.setDate(d.getDate()-w*7);
        var weekDates=[];for(var dd=0;dd<7;dd++){var dt=new Date(d);dt.setDate(dt.getDate()-dd);weekDates.push(dt.toISOString().slice(0,10))}
        config.days.forEach(function(day){
          var allEx=day.exercises.concat(getCustomExercises(day.id));
          weekDates.forEach(function(date){
            var saved=loadDayData(day.id,date);
            allEx.forEach(function(ex){var muscles=ex.muscles||[];var sets=saved.exercises&&saved.exercises[ex.id];var done=sets?sets.filter(function(s){return s.done}).length:0;if(done>0)muscles.forEach(function(m){if(!weekVol[m])weekVol[m]=0;weekVol[m]+=done})});
          });
        });
        weeks.push(weekVol);
      }
      var hasPast=weeks.slice(1).some(function(wv){return Object.keys(wv).length>0});
      if(!hasPast)return null;
      return h("div",{style:{marginTop:16,borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:12}},
        h("div",{style:{fontSize:12,fontWeight:700,color:"#6b7280",marginBottom:10}},"4-Week Trend"),
        h("div",{style:{display:"grid",gridTemplateColumns:"70px repeat(4, 1fr)",gap:4,fontSize:10}},
          h("span",null),h("span",{style:{color:"#6b7280",textAlign:"center",fontWeight:600}},"This"),h("span",{style:{color:"#4b5563",textAlign:"center",fontWeight:600}},"-1w"),h("span",{style:{color:"#4b5563",textAlign:"center",fontWeight:600}},"-2w"),h("span",{style:{color:"#4b5563",textAlign:"center",fontWeight:600}},"-3w"),
          muscleKeys.filter(function(m){return weeks.some(function(wv){return(wv[m]||0)>0})}).map(function(m){
            return [h("div",{key:m+"l",style:{color:"#9ca3af",fontWeight:600,textAlign:"right",paddingRight:4}},MUSCLE_LABELS[m])].concat(weeks.map(function(wv,wi){var v=wv[m]||0;var target=VOLUME_TARGETS[m]||[10,20];var c=v===0?"#71717a":v<target[0]?"#f59e0b":v>target[1]?"#ef4444":"#22c55e";return h("div",{key:m+wi,style:{textAlign:"center",fontWeight:700,color:c}},v||"—")}));
          })));
    })()));
}

/* ── Deload Check ── */
function getDeloadWarning(config){
  var warnings=[];
  config.days.forEach(function(day){
    day.exercises.forEach(function(ex){
      var hist=getHistory(day.id,ex.id,10);
      var recentRpe=[];
      hist.slice(0,3).forEach(function(entry){
        var dayData=loadDayData(day.id,entry.date);
        if(dayData.rpe&&dayData.rpe[ex.id])recentRpe.push(dayData.rpe[ex.id]);
      });
      if(recentRpe.length>=2){
        var avg=recentRpe.reduce(function(a,b){return a+b},0)/recentRpe.length;
        if(avg>=9&&warnings.indexOf(ex.name)===-1)warnings.push(ex.name);
      }
    });
  });
  return warnings.length>0?warnings:null;
}

/* ── Mesocycle Tracking ── */
function getMesocycle(){return lsGet("mesocycle")||{week:1,startDate:today()}}
function setMesocycle(m){lsSet("mesocycle",m)}
function advanceMesoWeek(){var m=getMesocycle();m.week=m.week>=4?1:m.week+1;if(m.week===1)m.startDate=today();setMesocycle(m);return m}
function resetMesocycle(){var m={week:1,startDate:today()};setMesocycle(m);return m}

/* ── Body Metrics ── */
function BodyMetrics(props){
  var onClose=props.onClose;var unit=getUnit();var metricsKey="metrics_"+today();
  var s=useState(function(){return lsGet(metricsKey)||{bodyweight:"",waist:"",notes:"",arms:"",chest:"",quads:""}}),data=s[0],setData=s[1];
  var sm=useState(false),showMore=sm[0],setShowMore=sm[1];
  var save=function(d){setData(d);lsSet(metricsKey,d)};var update=function(field,val){save(Object.assign({},data,{[field]:val}))};
  var history=useMemo(function(){var results=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS+"metrics_")){var date=k.slice((LS+"metrics_").length);if(date===today())continue;try{var d=JSON.parse(localStorage.getItem(k));if(d&&(d.bodyweight||d.waist))results.push({date:date,bw:d.bodyweight,waist:d.waist,arms:d.arms,chest:d.chest,quads:d.quads})}catch(e){}}}results.sort(function(a,b){return b.date.localeCompare(a.date)});return results.slice(0,10)},[]);
  var iStyle={background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 8px",color:"#e5e7eb",fontSize:15,fontWeight:600,textAlign:"center",outline:"none",width:"100%"};
  var wLabel=unit==="kg"?"BODYWEIGHT (kg)":"BODYWEIGHT (lbs)";var mLabel=unit==="kg"?"WAIST (cm)":"WAIST (inches)";var cmIn=unit==="kg"?"cm":"in";
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()}},h("div",{className:"sheet fade-in"},h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"#f1f5f9"}},"Body Metrics"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}},"✕")),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}},h("div",null,h("label",{style:{fontSize:11,fontWeight:700,color:"#6b7280",display:"block",marginBottom:6}},wLabel),h("input",{type:"number",inputMode:"decimal",value:data.bodyweight,onChange:function(e){update("bodyweight",e.target.value)},placeholder:unit==="kg"?"63":"140",style:iStyle})),h("div",null,h("label",{style:{fontSize:11,fontWeight:700,color:"#6b7280",display:"block",marginBottom:6}},mLabel),h("input",{type:"number",inputMode:"decimal",value:data.waist,onChange:function(e){update("waist",e.target.value)},placeholder:unit==="kg"?"81":"32",style:iStyle}))),
    /* Extended measurements */
    h("button",{onClick:function(){setShowMore(!showMore)},style:{fontSize:11,fontWeight:600,color:"#818cf8",background:"none",border:"none",cursor:"pointer",padding:"4px 0",marginBottom:8}},showMore?"▾ Hide measurements":"▸ More measurements (arms, chest, quads)"),
    showMore?h("div",{className:"fade-in",style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}},
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"#6b7280",display:"block",marginBottom:4}},"ARMS ("+cmIn+")"),h("input",{type:"number",inputMode:"decimal",value:data.arms||"",onChange:function(e){update("arms",e.target.value)},style:iStyle})),
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"#6b7280",display:"block",marginBottom:4}},"CHEST ("+cmIn+")"),h("input",{type:"number",inputMode:"decimal",value:data.chest||"",onChange:function(e){update("chest",e.target.value)},style:iStyle})),
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"#6b7280",display:"block",marginBottom:4}},"QUADS ("+cmIn+")"),h("input",{type:"number",inputMode:"decimal",value:data.quads||"",onChange:function(e){update("quads",e.target.value)},style:iStyle}))):null,
    h("div",{style:{marginBottom:12}},h("label",{style:{fontSize:11,fontWeight:700,color:"#6b7280",display:"block",marginBottom:6}},"NOTES"),h("input",{type:"text",value:data.notes||"",onChange:function(e){update("notes",e.target.value)},placeholder:"Sleep, energy, etc.",style:Object.assign({},iStyle,{textAlign:"left",fontSize:13})})),
    /* Bodyweight sparkline */
    (function(){var bwPoints=history.filter(function(e){return e.bw}).map(function(e){return parseFloat(e.bw)}).reverse();if(bwPoints.length<2)return null;var W=260,H=50,pad=2;var mn=Math.min.apply(null,bwPoints),mx=Math.max.apply(null,bwPoints);var range=mx-mn||1;var pts=bwPoints.map(function(v,i){return(pad+i*(W-2*pad)/(bwPoints.length-1))+","+(pad+(1-(v-mn)/range)*(H-2*pad))}).join(" ");var first=bwPoints[0],last=bwPoints[bwPoints.length-1];var delta=last-first;var arrow=delta>0.5?"↑":delta<-0.5?"↓":"→";var color=delta>0.5?"#22c55e":delta<-0.5?"#ef4444":"#6b7280";return h("div",{style:{marginBottom:12,padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)"}},h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},h("span",{style:{fontSize:11,fontWeight:700,color:"#6b7280"}},"Weight Trend"),h("span",{style:{fontSize:12,fontWeight:700,color:color}},arrow+" "+(delta>0?"+":"")+delta.toFixed(1)+" "+unit)),h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none"},h("polyline",{points:pts,fill:"none",stroke:"#f59e0b",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"})))})(),
    history.length>0?h("div",{style:{marginTop:4}},h("div",{style:{fontSize:12,fontWeight:700,color:"#6b7280",marginBottom:8}},"Recent Entries"),h("div",{style:{maxHeight:200,overflowY:"auto"}},history.map(function(entry){var d=new Date(entry.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});return h("div",{key:entry.date,style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:12}},h("span",{style:{color:"#6b7280",fontWeight:600}},label),h("div",{style:{display:"flex",gap:12}},entry.bw?h("span",{style:{color:"#e5e7eb"}},entry.bw+" "+unit):null,entry.waist?h("span",{style:{color:"#9ca3af"}},entry.waist+(unit==="kg"?" cm":'"')):null,entry.arms?h("span",{style:{color:"#818cf8"}},"💪"+entry.arms):null))}))):null));
}

/* ── Completion Summary ── */
function calcSessionStats(day,customs){
  var allEx=day.exercises.concat(customs||[]);
  var saved=loadDayData(day.id);var totalVolume=0,totalSets=0,prs=[],rpeValues=[];
  allEx.forEach(function(ex){var sets=saved.exercises&&saved.exercises[ex.id];if(!sets)return;sets.forEach(function(s){if(s.done&&s.weight&&s.reps){totalVolume+=parseFloat(s.weight)*parseInt(s.reps);totalSets++}});if(saved.rpe&&saved.rpe[ex.id])rpeValues.push(saved.rpe[ex.id]);var maxW=0;if(sets)sets.forEach(function(s){if(s.done&&s.weight){var w=parseFloat(s.weight);if(w>maxW)maxW=w}});if(maxW>0){var hist=getHistory(day.id,ex.id,10);var hMax=0;hist.forEach(function(h){h.sets.forEach(function(s){if(s.done&&s.weight){var w=parseFloat(s.weight);if(w>hMax)hMax=w}})});if(maxW>hMax&&hMax>0)prs.push({name:ex.name,weight:maxW,prev:hMax})}});
  var dur=getSessionStart()?Math.floor((Date.now()-getSessionStart())/1000):0;var avgRpe=rpeValues.length>0?rpeValues.reduce(function(a,b){return a+b},0)/rpeValues.length:null;var cardio=lsGet("cardio_"+day.id+"_"+today());
  return{totalVolume:totalVolume,totalSets:totalSets,prs:prs,duration:dur,avgRpe:avgRpe,cardio:cardio&&cardio.done};
}
function CompletionSummary(props){
  var day=props.day,onClose=props.onClose,customs=props.customs;var unit=getUnit();var stats=useMemo(function(){return calcSessionStats(day,customs)},[day,customs]);
  /* Save session summary on first render */
  useEffect(function(){saveSessionSummary(day,customs)},[]);
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()}},h("div",{className:"sheet fade-in",style:{textAlign:"center",paddingTop:32}},h("div",{style:{fontSize:48,marginBottom:8}},"🏆"),h("h2",{style:{fontSize:22,fontWeight:800,color:"#22c55e",margin:"0 0 4px"}},"Workout Complete!"),h("p",{style:{fontSize:13,color:"#6b7280",marginBottom:20}},day.title),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}},h("div",{style:{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,border:"1px solid rgba(255,255,255,0.06)"}},h("div",{style:{fontSize:24,fontWeight:800,color:"#f1f5f9"}},Math.round(stats.totalVolume).toLocaleString()),h("div",{style:{fontSize:11,color:"#6b7280",marginTop:4}},"Volume ("+unit+")")),h("div",{style:{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,border:"1px solid rgba(255,255,255,0.06)"}},h("div",{style:{fontSize:24,fontWeight:800,color:"#f1f5f9"}},fmtElapsed(stats.duration)),h("div",{style:{fontSize:11,color:"#6b7280",marginTop:4}},"Session Time")),h("div",{style:{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,border:"1px solid rgba(255,255,255,0.06)"}},h("div",{style:{fontSize:24,fontWeight:800,color:stats.prs.length>0?"#f59e0b":"#f1f5f9"}},stats.prs.length),h("div",{style:{fontSize:11,color:"#6b7280",marginTop:4}},"New PRs")),h("div",{style:{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,border:"1px solid rgba(255,255,255,0.06)"}},h("div",{style:{fontSize:24,fontWeight:800,color:stats.avgRpe?stats.avgRpe>=9?"#ef4444":stats.avgRpe>=8?"#f59e0b":"#22c55e":"#71717a"}},stats.avgRpe?stats.avgRpe.toFixed(1):"—"),h("div",{style:{fontSize:11,color:"#6b7280",marginTop:4}},"Avg RPE")),stats.cardio?h("div",{style:{gridColumn:"1 / -1",background:"rgba(34,197,94,0.04)",borderRadius:12,padding:12,border:"1px solid rgba(34,197,94,0.12)",textAlign:"center"}},h("span",{style:{fontSize:13,fontWeight:700,color:"#22c55e"}},"✓ Cardio completed")):null),
    stats.prs.length>0?h("div",{style:{marginBottom:16}},h("div",{style:{fontSize:13,fontWeight:700,color:"#f59e0b",marginBottom:8}},"🔥 New Personal Records"),stats.prs.map(function(pr){return h("div",{key:pr.name,style:{fontSize:12,color:"#d1d5db",padding:"4px 0"}},pr.name+": "+pr.weight+" "+unit+" (prev: "+pr.prev+")")})):null,
    h("button",{onClick:onClose,style:{width:"100%",padding:14,borderRadius:12,border:"none",background:"#22c55e",color:"#000",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8}},"Done")));
}

/* ── Session History ── */
function saveSessionSummary(day,customs){
  var stats=calcSessionStats(day,customs);
  var key="session_history";var hist=lsGet(key)||[];
  if(hist.length>0&&hist[0].date===today()&&hist[0].dayId===day.id)return;
  var sessionRpe=lsGet("sessionRpe_"+day.id+"_"+today());
  hist.unshift({date:today(),dayId:day.id,dayTitle:day.title,volume:Math.round(stats.totalVolume),sets:stats.totalSets,duration:stats.duration,prs:stats.prs.length,avgRpe:stats.avgRpe?parseFloat(stats.avgRpe.toFixed(1)):null,sessionRpe:sessionRpe||null,cardio:!!stats.cardio});
  if(hist.length>50)hist=hist.slice(0,50);
  lsSet(key,hist);
}

function SessionHistory(props){
  var onClose=props.onClose;var unit=getUnit();
  var hist=useMemo(function(){return lsGet("session_history")||[]},[]);
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()}},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"#f1f5f9"}},"Session History"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}},"✕")),
    hist.length===0?h("div",{style:{textAlign:"center",padding:"32px 0",color:"#4b5563"}},"No completed sessions yet. Finish a workout to see it here."):
    h("div",{style:{maxHeight:"60vh",overflowY:"auto"}},hist.map(function(s,i){
      var d=new Date(s.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
      return h("div",{key:i,style:{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
          h("span",{style:{fontSize:13,fontWeight:700,color:"#f1f5f9"}},s.dayTitle||s.dayId),
          h("span",{style:{fontSize:11,color:"#6b7280"}},label)),
        h("div",{style:{display:"flex",gap:12,flexWrap:"wrap"}},
          h("span",{style:{fontSize:11,color:"#9ca3af"}},Math.round(s.volume).toLocaleString()+" "+unit+" vol"),
          h("span",{style:{fontSize:11,color:"#9ca3af"}},s.sets+" sets"),
          s.duration?h("span",{style:{fontSize:11,color:"#9ca3af"}},fmtElapsed(s.duration)):null,
          s.avgRpe?h("span",{style:{fontSize:11,color:s.avgRpe>=9?"#ef4444":s.avgRpe>=8?"#f59e0b":"#22c55e"}},"RPE "+s.avgRpe):null,
          s.sessionRpe?h("span",{style:{fontSize:11,color:s.sessionRpe>=9?"#ef4444":s.sessionRpe>=8?"#f59e0b":"#22c55e",fontWeight:700}},"Session "+s.sessionRpe):null,
          s.prs>0?h("span",{style:{fontSize:11,color:"#f59e0b",fontWeight:700}},s.prs+" PR"+(s.prs>1?"s":"")):null,
          s.cardio?h("span",{style:{fontSize:11,color:"#22c55e"}},"+ Cardio"):null))}))));
}

/* ── Personal Records ── */
function PersonalRecords(props){
  var onClose=props.onClose,config=props.config;
  var records=useMemo(function(){
    var recs=[];
    config.days.forEach(function(day){
      var allEx=day.exercises.concat(getCustomExercises(day.id));
      allEx.forEach(function(ex){
        var exUnit=getExUnit(ex.id);var hist=getHistory(day.id,ex.id,50);var bestW=0,bestReps=0,bestDate="",bestE1rm=0;
        /* Also check today's data */
        var todayData=loadDayData(day.id);var todaySets=todayData.exercises&&todayData.exercises[ex.id];
        var allSessions=hist.slice();if(todaySets)allSessions.unshift({date:today(),sets:todaySets});
        allSessions.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var w=parseFloat(s.weight),r=parseInt(s.reps),e=calc1RM(w,r);if(e>bestE1rm){bestE1rm=e;bestW=w;bestReps=r;bestDate=entry.date}}})});
        if(bestW>0)recs.push({name:ex.name,weight:bestW,reps:bestReps,date:bestDate,e1rm:bestE1rm,unit:exUnit,muscles:ex.muscles||[]});
      });
    });
    recs.sort(function(a,b){return b.e1rm-a.e1rm});return recs;
  },[config]);
  var grouped=useMemo(function(){var g={};records.forEach(function(r){var key=r.muscles.length>0?r.muscles[0]:"other";if(!g[key])g[key]=[];g[key].push(r)});return g},[records]);
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()}},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"#f1f5f9"}},"Personal Records"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}},"✕")),
    records.length===0?h("div",{style:{textAlign:"center",padding:"32px 0",color:"#4b5563"}},"No records yet. Complete some sets to see your PRs here."):
    h("div",{style:{maxHeight:"65vh",overflowY:"auto"}},Object.keys(grouped).map(function(muscle){
      return h("div",{key:muscle,style:{marginBottom:16}},
        h("div",{style:{fontSize:11,fontWeight:700,color:"#f59e0b",letterSpacing:.5,marginBottom:6}},(MUSCLE_LABELS[muscle]||muscle).toUpperCase()),
        grouped[muscle].map(function(r,i){
          var d=new Date(r.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
          return h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
            h("div",null,h("div",{style:{fontSize:13,fontWeight:700,color:"#f1f5f9"}},r.name),h("div",{style:{fontSize:11,color:"#6b7280"}},label)),
            h("div",{style:{textAlign:"right"}},h("div",{style:{fontSize:15,fontWeight:800,color:"#f1f5f9"}},r.weight+" "+r.unit+" × "+r.reps),h("div",{style:{fontSize:10,fontWeight:600,color:"#818cf8"}},"e1RM "+r.e1rm)));
        }));
    }))));
}

/* ── Add Custom Exercise Form ── */
function AddExerciseForm(props){
  var dayId=props.dayId,onAdd=props.onAdd,onCancel=props.onCancel;var defUnit=getUnit();
  var s=useState({name:"",sets:"3",reps:"10-12",rest:"60",machine:false,unit:defUnit}),form=s[0],setForm=s[1];
  var upd=function(f,v){setForm(Object.assign({},form,{[f]:v}))};
  var submit=function(){if(!form.name.trim())return;var ex={id:"cx_"+Date.now(),name:form.name.trim(),sets:parseInt(form.sets)||3,reps:form.reps||"10",rest:parseInt(form.rest)||60,machine:form.machine,notes:"Custom exercise",tip:"",increment:form.unit==="kg"?2.5:5,custom:true};addCustomExercise(dayId,ex);setExUnit(ex.id,form.unit);onAdd()};
  var iStyle={background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,padding:"8px",color:"#e5e7eb",fontSize:13,fontWeight:600,outline:"none",width:"100%"};
  return h("div",{className:"fade-in",style:{background:"rgba(99,102,241,0.04)",border:"1px solid rgba(99,102,241,0.15)",borderRadius:14,padding:"14px",marginBottom:8}},
    h("div",{style:{fontSize:13,fontWeight:700,color:"#818cf8",marginBottom:10}},"Add Exercise"),
    h("input",{type:"text",placeholder:"Exercise name",value:form.name,onChange:function(e){upd("name",e.target.value)},style:Object.assign({},iStyle,{marginBottom:8})}),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}},
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"#4b5563",display:"block",marginBottom:3}},"SETS"),h("input",{type:"number",inputMode:"numeric",value:form.sets,onChange:function(e){upd("sets",e.target.value)},style:Object.assign({},iStyle,{textAlign:"center"})})),
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"#4b5563",display:"block",marginBottom:3}},"REPS"),h("input",{type:"text",value:form.reps,onChange:function(e){upd("reps",e.target.value)},style:Object.assign({},iStyle,{textAlign:"center"})})),
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"#4b5563",display:"block",marginBottom:3}},"REST (s)"),h("input",{type:"number",inputMode:"numeric",value:form.rest,onChange:function(e){upd("rest",e.target.value)},style:Object.assign({},iStyle,{textAlign:"center"})}))),
    h("div",{style:{display:"flex",gap:8,marginBottom:10}},
      h("button",{onClick:function(){upd("machine",!form.machine)},style:{flex:1,padding:"7px",borderRadius:7,border:form.machine?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(255,255,255,0.08)",background:form.machine?"rgba(245,158,11,0.08)":"transparent",color:form.machine?"#f59e0b":"#6b7280",fontSize:11,fontWeight:600,cursor:"pointer"}},form.machine?"Machine ✓":"Machine"),
      h("button",{onClick:function(){upd("unit",form.unit==="lbs"?"kg":"lbs")},style:{flex:1,padding:"7px",borderRadius:7,border:"1px solid rgba(245,158,11,0.3)",background:"rgba(245,158,11,0.08)",color:"#f59e0b",fontSize:11,fontWeight:600,cursor:"pointer"}},form.unit.toUpperCase())),
    h("div",{style:{display:"flex",gap:8}},
      h("button",{onClick:onCancel,style:{flex:1,padding:"9px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#6b7280",fontSize:12,fontWeight:600,cursor:"pointer"}},"Cancel"),
      h("button",{onClick:submit,style:{flex:1,padding:"9px",borderRadius:8,border:"none",background:form.name.trim()?"#818cf8":"rgba(99,102,241,0.3)",color:form.name.trim()?"#fff":"#6b7280",fontSize:12,fontWeight:700,cursor:"pointer"}},"Add")));
}

/* ── Session RPE ── */
function SessionRPE(props){
  var dayId=props.dayId;
  var s=useState(function(){return lsGet("sessionRpe_"+dayId+"_"+today())}),rpe=s[0],setRpe=s[1];
  var save=function(val){setRpe(val);lsSet("sessionRpe_"+dayId+"_"+today(),val)};
  var labels={6:"Easy",7:"Moderate",8:"Hard",9:"Very Hard",10:"Max"};var colors={6:"#22c55e",7:"#84cc16",8:"#f59e0b",9:"#f97316",10:"#ef4444"};
  return h("div",{className:"fade-in",style:{background:"rgba(34,197,94,0.04)",border:"1px solid rgba(34,197,94,0.12)",borderRadius:12,padding:"14px 16px",marginTop:12}},
    h("div",{style:{fontSize:13,fontWeight:700,color:"#22c55e",marginBottom:8}},"Session RPE — How was the overall workout?"),
    h("div",{style:{display:"flex",gap:4}},[6,7,8,9,10].map(function(val){var active=rpe===val;return h("button",{key:val,onClick:function(){save(val)},style:{flex:1,padding:"8px 2px",borderRadius:8,border:active?"2px solid "+colors[val]:"1px solid rgba(255,255,255,0.08)",background:active?"rgba(255,255,255,0.06)":"transparent",cursor:"pointer",textAlign:"center"}},h("div",{style:{fontSize:16,fontWeight:800,color:active?colors[val]:"#4b5563"}},val),h("div",{style:{fontSize:8,fontWeight:600,color:active?"#9ca3af":"#71717a",marginTop:1}},labels[val]))})),
    rpe?h("div",{style:{fontSize:11,color:"#9ca3af",marginTop:6,fontStyle:"italic"}},rpe<=7?"Recovered well — room to push harder next session.":rpe===8?"Solid session — sustainable training load.":rpe===9?"High fatigue — watch recovery before next session.":"Maximum effort — consider lighter session next."):null);
}

/* ── Day View ── */
function DayView(props){
  var day=props.day,refresh=props.refresh,config=props.config;
  var dayData=useDayData();
  var s5=useState(false),showComplete=s5[0],setShowComplete=s5[1];var s6=useState(false),dismissed=s6[0],setDismissed=s6[1];
  var s8=useState(false),showAddForm=s8[0],setShowAddForm=s8[1];
  var sc=useState(function(){return getCustomExercises(day.id)}),customs=sc[0],setCustoms=sc[1];
  var allExercises=day.exercises.concat(customs);
  var saved=dayData.getData(day.id);var totalSets=allExercises.reduce(function(a,e){return a+e.sets},0);
  var doneSets=allExercises.reduce(function(a,e){var d=saved.exercises&&saved.exercises[e.id];return a+(d?d.filter(function(s){return s.done}).length:0)},0);
  var pct=totalSets>0?doneSets/totalSets:0;var allComplete=doneSets===totalSets&&totalSets>0;
  /* Find the next incomplete exercise index */
  var nextExIdx=-1;
  for(var ni=0;ni<allExercises.length;ni++){var exD=saved.exercises&&saved.exercises[allExercises[ni].id];var exDone=exD?exD.filter(function(s){return s.done}).length:0;if(exDone<allExercises[ni].sets){nextExIdx=ni;break}}
  var removeCustom=function(exId){var next=removeCustomExercise(day.id,exId);setCustoms(next);refresh()};
  var deloadWarnings=useMemo(function(){return config?getDeloadWarning(config):null},[config]);
  useEffect(function(){if(allComplete&&!dismissed)setShowComplete(true)},[allComplete,dismissed]);
  return h("div",{style:{paddingBottom:40}},h("div",{style:{marginBottom:14}},h("h2",{style:{fontSize:18,fontWeight:800,margin:0,color:"#f1f5f9",letterSpacing:-.3}},day.title),h("p",{style:{fontSize:12,color:"#6b7280",margin:"3px 0 0",fontStyle:"italic"}},day.subtitle),h("div",{style:{marginTop:10,display:"flex",alignItems:"center",gap:10}},h("div",{style:{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden"}},h("div",{style:{width:(pct*100)+"%",height:"100%",borderRadius:2,background:pct>=1?"#22c55e":"#f59e0b",transition:"width 0.3s"}})),h("span",{style:{fontSize:11,fontWeight:700,color:pct>=1?"#22c55e":"#9ca3af",fontVariantNumeric:"tabular-nums",flexShrink:0}},doneSets+"/"+totalSets),allComplete?h("button",{onClick:function(){setShowComplete(true)},style:{fontSize:10,fontWeight:700,color:"#22c55e",background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:6,padding:"3px 8px",cursor:"pointer"}},"Summary"):null)),
    doneSets===0&&!lsGet("onboarded")?h("div",{style:{background:"rgba(245,158,11,0.04)",border:"1px solid rgba(245,158,11,0.12)",borderRadius:12,padding:"14px 16px",marginBottom:12,textAlign:"center"}},h("div",{style:{fontSize:24,marginBottom:6}},"👋"),h("div",{style:{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:4}},"Welcome to your workout!"),h("div",{style:{fontSize:12,color:"#9ca3af",lineHeight:1.5}},"Tap an exercise below to expand it, then log your sets. Use ","⚡"," Quick Log for speed. Your rest timer starts automatically."),h("button",{onClick:function(){lsSet("onboarded",true);refresh()},style:{marginTop:10,padding:"6px 16px",borderRadius:8,border:"1px solid rgba(245,158,11,0.3)",background:"rgba(245,158,11,0.1)",color:"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer"}},"Got it")):null,
    deloadWarnings?h("div",{style:{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:10,padding:"10px 12px",marginBottom:10}},h("div",{style:{fontSize:12,fontWeight:700,color:"#ef4444",marginBottom:4}},"⚠ Consider a Deload"),h("div",{style:{fontSize:11,color:"#9ca3af",lineHeight:1.5}},"High RPE (9+) for 2+ sessions on: ",deloadWarnings.join(", "),". Consider reducing weight 40-50% this week to recover.")):null,
    day.exercises.map(function(ex,i){return h(ExerciseCard,{key:ex.id,exercise:ex,index:i,dayId:day.id,onSetUpdate:refresh,isNext:nextExIdx===i})}),
    customs.length>0?h("div",{style:{borderTop:"1px solid rgba(99,102,241,0.1)",marginTop:8,paddingTop:8}},h("div",{style:{fontSize:10,fontWeight:700,color:"#818cf8",marginBottom:6,letterSpacing:.5}},"CUSTOM EXERCISES"),customs.map(function(ex,i){var ci=day.exercises.length+i;return h("div",{key:ex.id,style:{position:"relative"}},h(ExerciseCard,{exercise:ex,index:ci,dayId:day.id,onSetUpdate:refresh,isNext:nextExIdx===ci}),h("button",{onClick:function(){removeCustom(ex.id)},style:{position:"absolute",top:10,right:10,width:22,height:22,borderRadius:6,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",color:"#ef4444",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}},"✕"))})):null,
    showAddForm?h(AddExerciseForm,{dayId:day.id,onAdd:function(){setCustoms(getCustomExercises(day.id));setShowAddForm(false);refresh()},onCancel:function(){setShowAddForm(false)}}):h("button",{onClick:function(){setShowAddForm(true)},style:{width:"100%",padding:"10px",borderRadius:10,border:"1px dashed rgba(99,102,241,0.3)",background:"transparent",color:"#818cf8",fontSize:12,fontWeight:600,cursor:"pointer",marginTop:8}},"+ Add Exercise"),
    h(CardioLog,{dayId:day.id}),
    allComplete?h(SessionRPE,{dayId:day.id}):null,
    showComplete?h(CompletionSummary,{day:day,customs:customs,onClose:function(){setShowComplete(false);setDismissed(true)}}):null);
}

function SessionTimer(props){
  var onRefresh=props.onRefresh;
  var s=useState(0),elapsed=s[0],setElapsed=s[1];var sm=useState(false),showMenu=sm[0],setShowMenu=sm[1];
  var started=getSessionStart();
  useEffect(function(){if(!started)return;var tick=function(){setElapsed(Math.floor((Date.now()-started)/1000))};tick();var id=setInterval(tick,1000);return function(){clearInterval(id)}},[started]);
  if(!started)return h("span",{style:{fontSize:11,color:"#71717a"}},"Not started");
  return h("div",{style:{position:"relative",display:"inline-flex",alignItems:"center"}},
    h("span",{onClick:function(){setShowMenu(!showMenu)},style:{fontSize:12,fontWeight:700,color:"#f59e0b",fontVariantNumeric:"tabular-nums",cursor:"pointer"}},fmtElapsed(elapsed)),
    showMenu?h("div",{style:{position:"absolute",top:"100%",right:0,marginTop:4,background:"#1e1e24",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:6,zIndex:300,display:"flex",flexDirection:"column",gap:4,minWidth:120}},
      h("button",{onClick:function(){restartSession();setElapsed(0);setShowMenu(false);if(onRefresh)onRefresh()},style:{padding:"6px 10px",borderRadius:6,border:"none",background:"rgba(245,158,11,0.1)",color:"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"left"}},"↻ Restart Timer"),
      h("button",{onClick:function(){showConfirm({title:"End Session",msg:"End this session and stop the timer?",confirmLabel:"End",danger:true,onConfirm:function(){endSession();setElapsed(0);setShowMenu(false);if(onRefresh)onRefresh()}})},style:{padding:"6px 10px",borderRadius:6,border:"none",background:"rgba(239,68,68,0.1)",color:"#ef4444",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"left"}},"■ End Session")):null);
}

/* ── Settings Panel ── */
function SettingsPanel(props){
  var onClose=props.onClose,config=props.config,dayMap=props.dayMap,setDayMapState=props.setDayMapState;
  var s=useState(null),msg=s[0],setMsg=s[1];var fileRef=useRef(null);
  var sq=useState(null),storageInfo=sq[0],setStorageInfo=sq[1];
  useEffect(function(){if(navigator.storage&&navigator.storage.estimate){navigator.storage.estimate().then(function(est){setStorageInfo({used:est.usage||0,quota:est.quota||0})})}},[]);
  var s2=useState(getUnit()),unit=s2[0],setUnitState=s2[1];
  var s3=useState(getAutoTimer()),autoTimer=s3[0],setAutoTimerState=s3[1];
  var DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  var handleImport=function(e){var file=e.target.files&&e.target.files[0];if(!file)return;importData(file,function(count,err){if(err)setMsg("Import failed: "+(err.message||"Unknown error"));else{setMsg("Imported "+count+" records.");setTimeout(function(){window.location.reload()},1500)}})};
  var toggleUnit=function(){var next=unit==="lbs"?"kg":"lbs";setUnitState(next);setUnit(next)};
  var toggleAutoTimer=function(){var next=!autoTimer;setAutoTimerState(next);setAutoTimer(next)};
  var changeDayFor=function(dayId){var cur=dayMap[dayId];var idx=DOW.indexOf(cur);var next=DOW[(idx+1)%7];var newMap=Object.assign({},dayMap);newMap[dayId]=next;setDayMapState(newMap);setDayMap(newMap)};

  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()}},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}},h("h3",{style:{fontSize:18,fontWeight:800,color:"#f1f5f9"}},"Settings"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"#6b7280",fontSize:20,cursor:"pointer"}},"✕")),
    h("div",{style:{fontSize:12,color:"#6b7280",marginBottom:16,padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)"}},h("span",{style:{fontWeight:700,color:"#f59e0b"}},"Profile: "),config.name," — ",config.program),

    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}},h("div",null,h("div",{style:{fontSize:14,fontWeight:700,color:"#f1f5f9"}},"Default Unit"),h("div",{style:{fontSize:11,color:"#6b7280"}},"For new exercises & body metrics. Tap LBS/KG ↔ on each exercise to override.")),h("button",{onClick:toggleUnit,style:{padding:"6px 14px",borderRadius:8,border:"1px solid rgba(245,158,11,0.3)",background:"rgba(245,158,11,0.08)",color:"#f59e0b",fontSize:13,fontWeight:700,cursor:"pointer"}},unit==="lbs"?"Switch to KG":"Switch to LBS")),

    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}},h("div",null,h("div",{style:{fontSize:14,fontWeight:700,color:"#f1f5f9"}},"Auto-Start Timer"),h("div",{style:{fontSize:11,color:"#6b7280"}},"Start rest timer when set is checked off")),h(Toggle,{on:autoTimer,onToggle:toggleAutoTimer})),

    h("div",{style:{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}},h("div",{style:{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:8}},"Workout Days"),h("div",{style:{fontSize:11,color:"#6b7280",marginBottom:10}},"Tap a day to cycle through the week"),h("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},config.days.map(function(day){return h("button",{key:day.id,onClick:function(){changeDayFor(day.id)},style:{padding:"8px 12px",borderRadius:8,border:"1px solid rgba(245,158,11,0.2)",background:"rgba(245,158,11,0.05)",cursor:"pointer",textAlign:"center",minWidth:60}},h("div",{style:{fontSize:10,fontWeight:700,color:"#f59e0b"}},dayMap[day.id]),h("div",{style:{fontSize:12,fontWeight:600,color:"#e5e7eb",marginTop:2}},day.label))}))),

    h("div",{style:{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}},h("div",{style:{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:4}},"Mesocycle"),h("div",{style:{fontSize:11,color:"#6b7280",marginBottom:10}},"Track your 4-week training block. Week 4 is deload week."),h("div",{style:{display:"flex",gap:8,alignItems:"center"}},h("span",{style:{fontSize:13,fontWeight:700,color:"#818cf8"}},"Week "+getMesocycle().week+" of 4"),h("button",{onClick:function(){var m=advanceMesoWeek();if(props.onMesoChange)props.onMesoChange(m)},style:{padding:"6px 12px",borderRadius:7,border:"1px solid rgba(129,140,248,0.3)",background:"rgba(129,140,248,0.08)",color:"#818cf8",fontSize:11,fontWeight:700,cursor:"pointer"}},"Next Week"),h("button",{onClick:function(){showConfirm({title:"Reset Mesocycle",msg:"Reset to Week 1? This won't delete any data.",confirmLabel:"Reset",onConfirm:function(){var m=resetMesocycle();if(props.onMesoChange)props.onMesoChange(m)}})},style:{padding:"6px 12px",borderRadius:7,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#6b7280",fontSize:11,fontWeight:600,cursor:"pointer"}},"Reset"))),

    h("div",{style:{display:"flex",flexDirection:"column",gap:10,paddingTop:16}},
      h("button",{onClick:exportData,style:{width:"100%",padding:"12px",borderRadius:10,border:"1px solid rgba(99,102,241,0.3)",background:"rgba(99,102,241,0.08)",color:"#818cf8",fontSize:14,fontWeight:700,cursor:"pointer"}},"📤 Export All Data"),
      h("button",{onClick:function(){fileRef.current&&fileRef.current.click()},style:{width:"100%",padding:"12px",borderRadius:10,border:"1px solid rgba(245,158,11,0.3)",background:"rgba(245,158,11,0.08)",color:"#f59e0b",fontSize:14,fontWeight:700,cursor:"pointer"}},"📥 Import Data"),
      h("input",{ref:fileRef,type:"file",accept:".json",onChange:handleImport,style:{display:"none"}}),
      msg?h("div",{style:{fontSize:12,color:msg.startsWith("Import failed")?"#ef4444":"#22c55e",textAlign:"center",padding:8}},msg):null,
      storageInfo?h("div",{style:{fontSize:10,color:storageInfo.used/storageInfo.quota>0.8?"#ef4444":"#4b5563",textAlign:"center",paddingTop:8}},"Storage: "+(storageInfo.used/1024/1024).toFixed(1)+" / "+(storageInfo.quota/1024/1024).toFixed(0)+" MB",storageInfo.used/storageInfo.quota>0.8?" ⚠ Running low":""):null)));
}

/* ── Profile Selector ── */
function ProfileSelector(){
  var s=useState(null),profiles=s[0],setProfiles=s[1];var s2=useState(null),error=s2[0],setError=s2[1];
  useEffect(function(){fetch("configs/profiles.json").then(function(r){if(!r.ok)throw new Error("Not found");return r.json()}).then(function(data){setProfiles(data.profiles||[])}).catch(function(){setError("No profiles.json found. Access via ?profile=yourname")})},[]);
  if(error)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:40,textAlign:"center"}},h("div",null,h("div",{style:{fontSize:40,marginBottom:16}},"🏋️"),h("h1",{style:{fontSize:22,fontWeight:800,color:"#f1f5f9",marginBottom:8}},"HYPER",h("span",{style:{color:"#f59e0b"}},"TROPHY")),h("p",{style:{fontSize:14,color:"#6b7280",lineHeight:1.6}},error)));
  if(!profiles)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}},h("div",{style:{width:24,height:24,border:"3px solid rgba(245,158,11,0.3)",borderTopColor:"#f59e0b",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}));
  return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:32}},h("div",{style:{maxWidth:400,width:"100%",textAlign:"center"}},h("div",{style:{fontSize:40,marginBottom:12}},"🏋️"),h("h1",{style:{fontSize:24,fontWeight:800,color:"#f1f5f9",marginBottom:4}},"HYPER",h("span",{style:{color:"#f59e0b"}},"TROPHY")),h("p",{style:{fontSize:13,color:"#6b7280",marginBottom:24}},"Select your profile"),h("div",{style:{display:"flex",flexDirection:"column",gap:10}},profiles.map(function(p){return h("a",{key:p.id,href:"?profile="+p.id,style:{display:"block",padding:"16px 20px",borderRadius:14,border:"1px solid rgba(245,158,11,0.2)",background:"rgba(245,158,11,0.05)",textDecoration:"none",textAlign:"left"}},h("div",{style:{fontSize:16,fontWeight:700,color:"#f1f5f9"}},p.name),h("div",{style:{fontSize:12,color:"#6b7280",marginTop:2}},p.program||""))}))));
}

/* ══════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════ */
function MainApp(props){
  var config=props.config;var DAYS=config.days;
  var s=useState(0),activeDay=s[0],setActiveDay=s[1];var s2=useState(0),_tick=s2[0],setTick=s2[1];
  var s3=useState(false),showSettings=s3[0],setShowSettings=s3[1];var s4=useState(false),showMetrics=s4[0],setShowMetrics=s4[1];var sv=useState(false),showVolume=sv[0],setShowVolume=sv[1];var sh=useState(false),showHistory=sh[0],setShowHistory=sh[1];var sr=useState(false),showRecords=sr[0],setShowRecords=sr[1];
  var s7=useState(function(){return getDayMap(DAYS)}),dayMap=s7[0],setDayMapState=s7[1];
  var sm=useState(function(){return getMesocycle()}),meso=sm[0],setMeso=sm[1];
  var scrollRef=useRef(null);var refresh=useCallback(function(){setTick(function(t){return t+1})},[]);
  var dayData=useDayData();
  /* Swipe navigation */
  var touchRef=useRef({startX:0,startY:0});
  var onTouchStart=useCallback(function(e){var t=e.touches[0];touchRef.current={startX:t.clientX,startY:t.clientY}},[]);
  var onTouchEnd=useCallback(function(e){var t=e.changedTouches[0];var dx=t.clientX-touchRef.current.startX;var dy=t.clientY-touchRef.current.startY;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx<0){setActiveDay(function(d){return Math.min(d+1,DAYS.length-1)})}else{setActiveDay(function(d){return Math.max(d-1,0)})}}},[DAYS.length]);

  useEffect(function(){var dow=new Date().getDay();var dayToNum={"Mon":1,"Tue":2,"Wed":3,"Thu":4,"Fri":5,"Sat":6,"Sun":0};var best=-1;DAYS.forEach(function(d,i){if(dayToNum[dayMap[d.id]]===dow)best=i});if(best>=0)setActiveDay(best)},[dayMap]);
  useEffect(function(){if(scrollRef.current)scrollRef.current.scrollTop=0},[activeDay]);

  return h("div",{style:{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}},
    h("div",{style:{paddingTop:"max(env(safe-area-inset-top, 0px), 12px)",paddingLeft:16,paddingRight:16,paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(10,10,15,0.97)",flexShrink:0,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}},
      h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}},
        h("div",null,
          h("h1",{style:{fontSize:20,fontWeight:800,margin:0,letterSpacing:-.5,color:"#f1f5f9"}},"HYPER",h("span",{style:{color:"#f59e0b"}},"TROPHY")),
          h("div",{style:{display:"flex",alignItems:"center",gap:6,marginTop:2}},
            h("span",{style:{fontSize:11,fontWeight:700,color:"#f59e0b"}},config.name),
            h("span",{style:{fontSize:9,color:"#71717a"}},"\u00B7"),
            h("span",{style:{fontSize:9,color:"#71717a",fontWeight:700,letterSpacing:.5}},config.subtitle||""),
            h("span",{style:{fontSize:9,color:"#71717a"}},"\u00B7"),
            h("span",{style:{fontSize:9,fontWeight:700,color:meso.week===4?"#ef4444":"#818cf8",letterSpacing:.5}},"Wk "+meso.week+"/4"))),
        h("div",{style:{display:"flex",alignItems:"center",gap:6}},
          h("div",{style:{textAlign:"right"}},h("div",{style:{fontSize:11,color:"#6b7280"}},new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})),h("div",{style:{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",marginTop:2}},h(SessionTimer,{onRefresh:refresh}))),
          h("button",{onClick:function(){setShowVolume(true)},style:{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.15)",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:12,color:"#818cf8"},title:"Weekly Volume"},"📊"),
          h("button",{onClick:function(){setShowRecords(true)},style:{background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.15)",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:12,color:"#22c55e"},title:"PRs"},"🏆"),
          h("button",{onClick:function(){setShowHistory(true)},style:{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:12,color:"#f59e0b"},title:"History"},"📋"),
          h("button",{onClick:function(){setShowMetrics(true)},style:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:13,color:"#6b7280"}},"⚖"),
          h("button",{onClick:function(){setShowSettings(true)},style:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:14,color:"#6b7280"}},"⚙"))),
      /* Tabs */
      h("div",{style:{display:"flex",gap:3}},DAYS.map(function(day,i){var saved=dayData.getData(day.id);var customs=getCustomExercises(day.id);var allEx=day.exercises.concat(customs);var doneSets=allEx.reduce(function(a,e){var d=saved.exercises&&saved.exercises[e.id];return a+(d?d.filter(function(s){return s.done}).length:0)},0);var totalSets=allEx.reduce(function(a,e){return a+e.sets},0);var hasProg=doneSets>0,complete=doneSets===totalSets&&totalSets>0;
        return h("button",{key:day.id,onClick:function(){setActiveDay(i)},style:{flex:1,padding:"8px 2px 6px",minHeight:44,borderRadius:9,border:activeDay===i?"1px solid rgba(245,158,11,0.4)":complete?"1px solid rgba(34,197,94,0.15)":"1px solid rgba(255,255,255,0.04)",background:activeDay===i?"rgba(245,158,11,0.1)":complete?"rgba(34,197,94,0.04)":"rgba(255,255,255,0.02)",cursor:"pointer",textAlign:"center",transition:"all 0.15s"}},h("div",{style:{fontSize:11,fontWeight:700,color:activeDay===i?"#f59e0b":complete?"#22c55e":"#4b5563",letterSpacing:.4}},dayMap[day.id]),h("div",{style:{fontSize:13,fontWeight:700,color:activeDay===i?"#f1f5f9":complete?"#6b7280":"#6b7280",marginTop:1}},day.label),(hasProg||complete)?h("div",{style:{width:4,height:4,borderRadius:2,background:complete?"#22c55e":"#f59e0b",margin:"3px auto 0"}}):null)}))),
    /* Content */
    h("div",{ref:scrollRef,onTouchStart:onTouchStart,onTouchEnd:onTouchEnd,style:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingTop:16,paddingLeft:16,paddingRight:16,paddingBottom:"max(env(safe-area-inset-bottom, 0px), 20px)"}},h(DayView,{key:activeDay,day:DAYS[activeDay],refresh:refresh,config:config})),
    /* Floating timer */
    h(FloatingTimer,null),
    showSettings?h(SettingsPanel,{onClose:function(){setShowSettings(false);refresh()},config:config,dayMap:dayMap,setDayMapState:setDayMapState,onMesoChange:function(m){setMeso(m)}}):null,
    showMetrics?h(BodyMetrics,{onClose:function(){setShowMetrics(false)}}):null,
    showVolume?h(VolumeDashboard,{onClose:function(){setShowVolume(false)},config:config}):null,
    showHistory?h(SessionHistory,{onClose:function(){setShowHistory(false)}}):null,
    showRecords?h(PersonalRecords,{onClose:function(){setShowRecords(false)},config:config}):null,
    h(UndoToast,null),
    h(ConfirmDialog,null));
}

/* ══════════════════════════════════════════
   ROOT
   ══════════════════════════════════════════ */
function App(){
  var profileId=getProfileFromURL();
  var s=useState(null),config=s[0],setConfig=s[1];var s2=useState(null),error=s2[0],setError=s2[1];
  useEffect(function(){
    if(!profileId)return;
    initProfile(profileId);
    fetch("configs/"+profileId+".json").then(function(r){if(!r.ok)throw new Error("Profile not found: "+profileId);return r.json()}).then(function(data){setConfig(data)}).catch(function(err){setError(err.message)});
  },[profileId]);
  if(!profileId)return h(ProfileSelector,null);
  if(error)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:40,textAlign:"center"}},h("div",null,h("div",{style:{fontSize:40,marginBottom:16}},"⚠️"),h("h2",{style:{fontSize:18,fontWeight:700,color:"#f1f5f9",marginBottom:8}},"Profile Not Found"),h("p",{style:{fontSize:14,color:"#6b7280"}},error),h("a",{href:"?",style:{display:"inline-block",marginTop:16,padding:"10px 20px",borderRadius:10,background:"#f59e0b",color:"#000",fontWeight:700,fontSize:14,textDecoration:"none"}},"View All Profiles")));
  if(!config)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}},h("div",{style:{width:24,height:24,border:"3px solid rgba(245,158,11,0.3)",borderTopColor:"#f59e0b",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}));
  return h(TimerProvider,null,h(DayDataProvider,null,h(MainApp,{config:config})));
}

ReactDOM.createRoot(document.getElementById("root")).render(h(ErrorBoundary,null,h(App)));
if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").then(function(reg){
  reg.addEventListener("updatefound",function(){var nw=reg.installing;if(nw){nw.addEventListener("statechange",function(){if(nw.state==="activated"&&navigator.serviceWorker.controller){
    var toast=document.createElement("div");toast.textContent="Update available — tap to refresh";
    toast.style.cssText="position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;background:#f59e0b;color:#000;font-weight:700;font-size:13px;z-index:9999;cursor:pointer;font-family:-apple-system,sans-serif";
    toast.onclick=function(){window.location.reload()};document.body.appendChild(toast);setTimeout(function(){if(toast.parentNode)toast.parentNode.removeChild(toast)},10000);
  }})}});
}).catch(function(){})})}
