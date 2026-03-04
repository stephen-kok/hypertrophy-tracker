"use strict";
var h=React.createElement,useState=React.useState,useEffect=React.useEffect,useRef=React.useRef,useCallback=React.useCallback,useMemo=React.useMemo,useContext=React.useContext,createContext=React.createContext;

/**
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} name
 * @property {number} sets
 * @property {string} reps
 * @property {number} rest
 * @property {boolean} machine
 * @property {string} notes
 * @property {string} tip
 * @property {number} [increment]
 * @property {string[]} [muscles]
 * @property {string} [rir]
 * @property {string} [tempo]
 * @property {string[]} [alternatives]
 * @property {boolean} [custom]
 * @property {string} [supersetGroup]
 */

/**
 * @typedef {Object} SetData
 * @property {string} weight
 * @property {string} reps
 * @property {boolean} done
 * @property {boolean} [extra]
 */

/**
 * @typedef {Object} DayData
 * @property {Object<string, SetData[]>} exercises
 * @property {Object<string, Array<{weight:string, reps:string}>>} [warmups]
 * @property {Object<string, number>} [rpe]
 * @property {Object<string, string>} [exNotes]
 */

/* ═══ APP VERSION & WHAT'S NEW ═══ */
var APP_VERSION=18;
var WHATS_NEW=[
  "Sound effect + visual popup on rest timer completion",
  "Weekly volume now tracks all days of the week (bug fix)",
  "Auto-convert weights when switching between kg and lbs",
  "Skip/discard exercise option for exercises not completed",
  "Next set highlighted with yellow for quick identification",
  "RIR tracking and wellness check are now optional settings",
  "Exercise swap moved from history to card header for quick access",
  "Clickable RIR explanation badge",
  "UP NEXT badge changes to IN PROGRESS once sets begin",
  "Expanded coach tips with form cues and common mistakes",
  "Bilateral exercise tracking (L/R sides independently)",
  "E1RM now shows units (lbs/kg)",
  "More exercise alternatives across all programs",
  "Improved cross-out visibility on completed exercises",
  "Timer sits flush above navigation bar"
];
function getSeenVersion(){return lsGet("_app_version")||0}
function markVersionSeen(){lsSet("_app_version",APP_VERSION)}
function shouldShowWhatsNew(){return getSeenVersion()<APP_VERSION&&getSeenVersion()>0}

/* ═══ CONFIG VALIDATION ═══ */
function validateConfig(cfg){
  if(!cfg||typeof cfg!=="object")return"Config must be a JSON object";
  if(!cfg.profile||typeof cfg.profile!=="string")return"Missing 'profile' field";
  if(!cfg.name||typeof cfg.name!=="string")return"Missing 'name' field";
  if(!Array.isArray(cfg.days)||cfg.days.length===0)return"Missing or empty 'days' array";
  var ids={};
  for(var i=0;i<cfg.days.length;i++){
    var day=cfg.days[i];
    if(!day.id)return"Day "+(i+1)+" missing 'id'";
    if(!day.title&&!day.label)return"Day '"+day.id+"' missing 'title' or 'label'";
    if(!Array.isArray(day.exercises))return"Day '"+day.id+"' missing 'exercises' array";
    for(var j=0;j<day.exercises.length;j++){
      var ex=day.exercises[j];
      if(!ex.id)return"Exercise "+(j+1)+" in '"+day.id+"' missing 'id'";
      if(!ex.name)return"Exercise '"+ex.id+"' missing 'name'";
      if(ids[ex.id])return"Duplicate exercise id '"+ex.id+"' (first in '"+ids[ex.id]+"')";
      ids[ex.id]=day.id;
      if(!ex.sets||!ex.reps)return"Exercise '"+ex.id+"' missing 'sets' or 'reps'";
    }
  }
  return null;
}

/* ═══ PROFILE ═══ */
function getProfileFromURL(){var p=new URLSearchParams(window.location.search);return p.get("profile")||null}
var PROFILE=null,LS="";
function initProfile(p){PROFILE=p;LS="ht_"+p+"_";runMigrations();/* Set version on first-ever load so What's New doesn't show for new users */if(!lsGet("_app_version"))markVersionSeen()}

/* ═══ DATA MIGRATIONS ═══ */
var MIGRATIONS=[];
function runMigrations(){
  var cur=lsGet("_schema_version")||0;
  for(var i=cur;i<MIGRATIONS.length;i++){try{MIGRATIONS[i]()}catch(e){}}
  if(cur<MIGRATIONS.length)lsSet("_schema_version",MIGRATIONS.length);
}

/* ═══ STORAGE ═══ */
function lsGet(k){try{var v=localStorage.getItem(LS+k);return v?JSON.parse(v):null}catch(e){return null}}
var _storageWarningShown=false;
function lsSet(k,v){try{localStorage.setItem(LS+k,JSON.stringify(v))}catch(e){if(!_storageWarningShown&&e.name==="QuotaExceededError"){_storageWarningShown=true;showUndoToast("Storage full! Export your data now.",null,8000)}}}
var today=function(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
/* Session date lock: once a session starts, the date is locked for that session to prevent midnight boundary issues */
var _sessionDateLock=null;
function getSessionDate(){return _sessionDateLock||today()}
function lockSessionDate(){if(!_sessionDateLock)_sessionDateLock=today()}
function unlockSessionDate(){_sessionDateLock=null}
var fmtTime=function(s){return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
var fmtElapsed=function(s){var hr=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return hr>0?hr+"h "+m+"m":m>0?m+"m "+String(sec).padStart(2,"0")+"s":sec+"s"};
var dataKey=function(dayId,date){return dayId+"@"+date};
function loadDayData(dayId,date){return lsGet(dataKey(dayId,date||getSessionDate()))||{exercises:{},warmups:{},rpe:{},exNotes:{}}}

/* ── Auto-save debounce ── */
var _saveTimers={};
function saveDayData(dayId,data,immediate){
  var key=dayId;
  if(_saveTimers[key])clearTimeout(_saveTimers[key]);
  var d=getSessionDate();
  if(immediate){lsSet(dataKey(dayId,d),data);updateHistoryIndex(dayId,d,data);return}
  _saveTimers[key]=setTimeout(function(){lsSet(dataKey(dayId,d),data);updateHistoryIndex(dayId,d,data)},300);
}

/* ── History index cache ── */
var _historyIndex={};
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
  Object.keys(_historyIndex).forEach(function(did){_historyIndex[did].sort(function(a,b){return b.date.localeCompare(a.date)})});
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
  var entries=_historyIndex[dayId]||[];var results=[];var td=getSessionDate();
  for(var i=0;i<entries.length;i++){
    var e=entries[i];if(e.date===td)continue;
    if(e.data.exercises&&e.data.exercises[exId])results.push({date:e.date,sets:e.data.exercises[exId]});
    if(results.length>=(limit||12))break;
  }
  return results;
}
function getMachineWeight(exId){return lsGet("mw_"+exId)||0}
function setMachineWeightLS(exId,w){lsSet("mw_"+exId,w)}
function getSessionStart(){return lsGet("session_"+getSessionDate())}
function markSessionStart(){if(!getSessionStart()){lsSet("session_"+getSessionDate(),Date.now());lockSessionDate()}}
function endSession(){try{localStorage.removeItem(LS+"session_"+getSessionDate())}catch(e){};unlockSessionDate()}
function getStorageUsage(){try{var used=0;for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)){used+=localStorage.getItem(k).length}}return used}catch(e){return 0}}
function restartSession(){lsSet("session_"+getSessionDate(),Date.now())}

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

/* ═══ EXERCISE SWAPS ═══ */
function getSwaps(dayId){return lsGet("swaps_"+dayId+"_"+getSessionDate())||{}}
function saveSwap(dayId,origId,altName){var swaps=getSwaps(dayId);swaps[origId]=altName;lsSet("swaps_"+dayId+"_"+getSessionDate(),swaps)}
function clearSwap(dayId,origId){var swaps=getSwaps(dayId);delete swaps[origId];lsSet("swaps_"+dayId+"_"+getSessionDate(),swaps)}
function applySwaps(exercises,dayId){
  var swaps=getSwaps(dayId);
  return exercises.map(function(ex){
    if(swaps[ex.id]){
      var altTip=ex.alternativeTips&&ex.alternativeTips[swaps[ex.id]];
      var altFormTips=ex.alternativeFormTips&&ex.alternativeFormTips[swaps[ex.id]];
      return Object.assign({},ex,{name:swaps[ex.id],_swappedFrom:ex.name,tip:altTip||ex.tip,formTips:altFormTips||ex.formTips});
    }
    return ex;
  });
}

/* ═══ CUSTOM VOLUME TARGETS ═══ */
var DEFAULT_VOLUME_TARGETS={chest:[10,20],back:[10,20],quads:[10,20],hamstrings:[10,16],glutes:[8,16],front_delt:[6,12],side_delt:[10,20],rear_delt:[6,12],biceps:[10,20],triceps:[10,16],calves:[8,16],abs:[8,16]};
function getVolumeTargets(){return lsGet("pref_vol_targets")||DEFAULT_VOLUME_TARGETS}
function setVolumeTargets(t){lsSet("pref_vol_targets",t)}

/* ═══ PROGRESSIVE OVERLOAD ═══ */
function parseRepRange(reps){var str=String(reps).replace(/\/leg/i,"");var parts=str.split("-");if(parts.length===2)return{min:parseInt(parts[0])||0,max:parseInt(parts[1])||0};var n=parseInt(str)||0;return{min:n,max:n}}
function getLastSessionRIR(dayId,exId){
  var hist=getHistory(dayId,exId,1);if(!hist.length)return null;
  var dd=loadDayData(dayId,hist[0].date);
  if(!dd.setRir||!dd.setRir[exId])return null;
  var rir=dd.setRir[exId];var vals=[];
  Object.keys(rir).forEach(function(k){if(typeof rir[k]==="number")vals.push(rir[k])});
  if(!vals.length)return null;
  return vals.reduce(function(a,b){return a+b},0)/vals.length;
}
function getOverloadSuggestion(dayId,exercise){
  var hist=getHistory(dayId,exercise.id,1);if(!hist.length)return null;var lastSets=hist[0].sets;if(!lastSets||!lastSets.length)return null;
  var range=parseRepRange(exercise.reps);if(range.max===0)return null;
  var comp=lastSets.filter(function(s){return s.done&&s.weight&&s.reps});if(comp.length<exercise.sets)return null;
  var allTop=comp.every(function(s){return parseInt(s.reps)>=range.max});
  var lw=parseFloat(comp[0].weight)||0;if(lw===0)return null;
  var inc=exercise.increment||(exercise.machine?5:5);
  /* RIR guard: if average RIR was 0-1 last session, don't suggest weight increase */
  var avgRir=getLastSessionRIR(dayId,exercise.id);
  if(avgRir!==null&&avgRir<=1&&allTop){
    return{type:"hold",from:lw,to:lw,msg:"RIR was "+avgRir.toFixed(1)+" last session \u2014 repeat weight, focus on form"};
  }
  var repsFirst=inc<=2.5||range.max>=15;
  if(!allTop){
    /* Volume progression: if stuck at same weight for 3+ sessions, suggest adding a set */
    var hist3=getHistory(dayId,exercise.id,3);
    if(hist3.length>=3){
      var sameWeight=hist3.every(function(h){return h.sets.filter(function(s){return s.done&&s.weight}).some(function(s){return parseFloat(s.weight)===lw})});
      if(sameWeight&&comp.length===exercise.sets){
        return{type:"volume",from:lw,to:lw,msg:"Stuck at "+lw+" for 3 sessions \u2014 try adding 1 extra set"};
      }
    }
    return null;
  }
  if(repsFirst){
    var hist2=getHistory(dayId,exercise.id,2);
    var prevAlsoTop=hist2.length>=2&&hist2[1].sets.filter(function(s){return s.done&&s.weight&&s.reps}).every(function(s){return parseInt(s.reps)>=range.max});
    if(!prevAlsoTop){
      var targetReps=range.max+2;
      return{type:"reps",from:lw,to:lw,targetReps:targetReps,msg:"Try "+exercise.sets+"\u00D7"+targetReps+" at "+lw+" before adding weight"};
    }
  }
  return{type:"weight",from:lw,to:lw+inc,increment:inc};
}

/* ═══ ESTIMATED 1RM ═══ */
/* Epley formula capped at 10 reps for accuracy — high rep counts inflate e1RM unreliably */
function calc1RM(weight,reps){var w=parseFloat(weight),r=parseInt(reps);if(!w||!r||r<=0)return 0;if(r===1)return w;var capped=Math.min(r,10);return Math.round(w*(1+capped/30))}

/* ═══ FATIGUE SCORE ═══ */
function calcFatigueScore(config){
  var rpeScore=0,rpeCount=0,rirScore=0,rirCount=0;
  config.days.forEach(function(day){
    day.exercises.forEach(function(ex){
      var hist=getHistory(day.id,ex.id,3);
      hist.forEach(function(entry){
        var dd=loadDayData(day.id,entry.date);
        if(dd.rpe&&dd.rpe[ex.id]){rpeScore+=dd.rpe[ex.id];rpeCount++}
        /* Factor in per-set RIR data */
        if(dd.setRir&&dd.setRir[ex.id]){
          var rir=dd.setRir[ex.id];
          Object.keys(rir).forEach(function(k){if(typeof rir[k]==="number"){rirScore+=rir[k];rirCount++}});
        }
      });
    });
  });
  /* Factor in recent cardio as mild fatigue contributor */
  var cardioCount=0;
  config.days.forEach(function(day){
    var ck=lsGet("cardio_"+day.id+"_"+getSessionDate());
    if(ck&&ck.done)cardioCount++;
  });
  if(rpeCount<3&&rirCount<3)return null;
  /* Blend RPE and RIR if both available. RIR 0 = RPE 10, RIR 4 = RPE 6 */
  var avg;
  if(rpeCount>=3&&rirCount>=3){
    var rpeAvg=rpeScore/rpeCount;
    var rirAvg=10-rirScore/rirCount;/* Convert RIR to RPE scale */
    avg=(rpeAvg+rirAvg)/2;
  }else if(rpeCount>=3){avg=rpeScore/rpeCount}
  else{avg=10-rirScore/rirCount}
  /* Add small cardio fatigue bump (+0.15 per cardio session this week) */
  if(cardioCount>0)avg=avg+cardioCount*0.15;
  if(avg>=9)return{level:"high",label:"High Fatigue",color:"var(--danger)",msg:"Consider a deload or lighter session"};
  if(avg>=8)return{level:"moderate",label:"Moderate",color:"var(--accent)",msg:"Training load is sustainable"};
  return{level:"low",label:"Fresh",color:"var(--success)",msg:"Ready to push harder"};
}

/* ═══ READINESS CHECK ═══ */
function getReadiness(dayId){return lsGet("readiness_"+dayId+"_"+getSessionDate())}
function saveReadiness(dayId,data){lsSet("readiness_"+dayId+"_"+getSessionDate(),data)}
function getReadinessAdj(dayId){return lsGet("readiness_adj_"+dayId+"_"+getSessionDate())}
function saveReadinessAdj(dayId,adj){lsSet("readiness_adj_"+dayId+"_"+getSessionDate(),adj)}
function calcReadinessAdj(data){
  if(!data)return null;
  var fields=["sleep","soreness","energy","stress"];
  var count=0,sum=0;fields.forEach(function(f){if(data[f]){sum+=data[f];count++}});
  if(count<4)return null;
  var avg=sum/count;
  if(avg>=3.5)return null;/* No adjustment needed */
  if(avg<2)return{volumeMult:0.5,intensityMult:0.85,label:"Low readiness \u2014 50% volume, 85% intensity",level:"low"};
  if(avg<2.5)return{volumeMult:0.7,intensityMult:0.9,label:"Below average readiness \u2014 70% volume, 90% intensity",level:"moderate"};
  return{volumeMult:0.85,intensityMult:0.95,label:"Slightly low readiness \u2014 85% volume, 95% intensity",level:"mild"};
}

/* ═══ DELOAD STRATEGIES ═══ */
var DELOAD_STRATEGIES=[
  {id:"intensity",label:"Reduce Intensity",desc:"Keep sets/reps the same, drop weight to ~55%",icon:"\uD83D\uDCAA",factor:0.55},
  {id:"volume",label:"Reduce Volume",desc:"Keep weight the same, cut sets in half",icon:"\uD83D\uDCCA",factor:1.0,halveSets:true},
  {id:"both",label:"Reduce Both",desc:"Drop weight to ~70% and cut 1 set per exercise",icon:"\u2696\uFE0F",factor:0.7,cutOneSets:true},
  {id:"active",label:"Active Recovery",desc:"Skip weights entirely; do mobility, cardio, stretching",icon:"\uD83E\uDDD8",skipWeights:true}
];
function getActiveDeload(){return lsGet("pref_deload_strategy")}
function setActiveDeload(stratId){lsSet("pref_deload_strategy",stratId)}
function clearActiveDeload(){try{localStorage.removeItem(LS+"pref_deload_strategy")}catch(e){}}
function getDeloadModifiers(dayId,exercise){
  var strat=getActiveDeload();if(!strat)return null;
  var s=DELOAD_STRATEGIES.find(function(d){return d.id===strat});if(!s)return null;
  if(s.skipWeights)return{skip:true,label:"Active Recovery \u2014 skip weights today"};
  var hist=getHistory(dayId,exercise.id,1);var lastWeight=0;
  if(hist.length)hist[0].sets.forEach(function(se){if(se.done&&se.weight){var w=parseFloat(se.weight);if(w>lastWeight)lastWeight=w}});
  var targetWeight=lastWeight>0?Math.round(lastWeight*s.factor):0;
  var targetSets=exercise.sets;
  if(s.halveSets)targetSets=Math.max(1,Math.ceil(exercise.sets/2));
  if(s.cutOneSets)targetSets=Math.max(1,exercise.sets-1);
  return{weight:targetWeight,sets:targetSets,label:s.label,factor:s.factor,halveSets:s.halveSets,cutOneSets:s.cutOneSets};
}

/* ═══ PLATE CALCULATOR ═══ */
var PLATES_LBS=[45,35,25,10,5,2.5];
var PLATES_KG=[25,20,15,10,5,2.5,1.25];
var BAR_LBS=45,BAR_KG=20;

/* ═══ EXPORT / IMPORT ═══ */
function exportData(){
  var data={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)){try{data[k]=JSON.parse(localStorage.getItem(k))}catch(e){data[k]=localStorage.getItem(k)}}}
  var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="hypertrophy_"+PROFILE+"_"+today()+".json";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}
function validateImportData(data){
  if(!data||typeof data!=="object"||Array.isArray(data))return"Import file must be a JSON object.";
  var keys=Object.keys(data);if(keys.length===0)return"Import file is empty.";
  var foreignKeys=0,matchingKeys=0;
  for(var i=0;i<keys.length;i++){
    if(keys[i].indexOf("ht_")===-1)return"Unexpected key '"+keys[i]+"' — not a valid export.";
    if(keys[i].startsWith(LS))matchingKeys++;else foreignKeys++;
  }
  if(matchingKeys===0&&foreignKeys>0)return"This export is from a different profile. Expected keys starting with '"+LS+"'.";
  return null;
}
function importData(file,cb){var r=new FileReader();r.onload=function(e){try{var data=JSON.parse(e.target.result);var err=validateImportData(data);if(err){cb(0,new Error(err));return}var c=0;Object.keys(data).forEach(function(k){localStorage.setItem(k,typeof data[k]==="string"?data[k]:JSON.stringify(data[k]));c++});cb(c,null)}catch(err){cb(0,err)}};r.readAsText(file)}

/* ═══ SHAREABLE SESSION SUMMARY ═══ */
function generateShareText(day,stats,unit){
  var lines=["HYPERTROPHY \u2014 "+day.title,"Date: "+today(),"","Volume: "+Math.round(stats.totalVolume).toLocaleString()+" "+unit,"Sets: "+stats.totalSets,"Duration: "+fmtElapsed(stats.duration)];
  if(stats.avgRpe)lines.push("Avg RPE: "+stats.avgRpe.toFixed(1));
  if(stats.prs.length>0){lines.push("");lines.push("New PRs:");stats.prs.forEach(function(pr){lines.push("  "+pr.name+": "+pr.weight+" "+unit+" (prev: "+pr.prev+")")})}
  lines.push("","Tracked with Hypertrophy Tracker");
  return lines.join("\n");
}

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

  var getTimer=useCallback(function(exKey){return timersRef.current[exKey]||null},[]);

  var setTimer=useCallback(function(exKey,val){
    timersRef.current[exKey]=val;forceUpdate();
  },[forceUpdate]);

  var getActiveTimer=useCallback(function(){
    var keys=Object.keys(timersRef.current);
    for(var i=0;i<keys.length;i++){var t=timersRef.current[keys[i]];if(t&&t.running)return{key:keys[i],timer:t}}
    return null;
  },[]);

  useEffect(function(){
    var handler=function(){
      if(document.visibilityState==="visible"){
        var changed=false;
        Object.keys(timersRef.current).forEach(function(key){
          var t=timersRef.current[key];
          if(t&&t.running&&t.startedAt){
            if(Math.floor((Date.now()-t.startedAt)/1000)>=t.total){
              t.running=false;t.done=true;changed=true;sendTimerNotification();
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
  var cacheRef=useRef({});
  var s=useState(0),rev=s[0],bump=s[1];

  var getData=useCallback(function(dayId){
    if(!cacheRef.current[dayId])cacheRef.current[dayId]=loadDayData(dayId);
    return cacheRef.current[dayId];
  },[]);

  var saveData=useCallback(function(dayId,data){
    cacheRef.current[dayId]=data;saveDayData(dayId,data);bump(function(r){return r+1});
  },[]);

  var invalidate=useCallback(function(dayId){
    if(dayId){delete cacheRef.current[dayId]}else{cacheRef.current={}}
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
    React.Component.call(this,props);this.state={hasError:false,error:null};
  }
  EB.prototype=Object.create(React.Component.prototype);
  EB.prototype.constructor=EB;
  EB.getDerivedStateFromError=function(error){return{hasError:true,error:error}};
  EB.prototype.render=function(){
    if(this.state.hasError){
      return h("div",{className:"empty-state",style:{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}},
        h("div",null,
          h("div",{className:"empty-state__icon"},"\u26A0\uFE0F"),
          h("h2",{className:"empty-state__title"},"Something went wrong"),
          h("p",{className:"empty-state__desc"},this.state.error?String(this.state.error.message):"An unexpected error occurred."),
          h("button",{onClick:function(){window.location.reload()},className:"btn btn--accent",style:{marginTop:16},role:"button","aria-label":"Reload application"},"Reload App")));
    }
    return this.props.children;
  };
  return EB;
}();

/* ── Card-level Error Boundary ── */
var CardErrorBoundary=function(){
  function CEB(props){
    React.Component.call(this,props);this.state={hasError:false};
  }
  CEB.prototype=Object.create(React.Component.prototype);
  CEB.prototype.constructor=CEB;
  CEB.getDerivedStateFromError=function(){return{hasError:true}};
  CEB.prototype.render=function(){
    if(this.state.hasError){
      var self=this;
      return h("div",{className:"card",style:{padding:"12px 14px",background:"var(--danger-bg)",border:"1px solid var(--danger-border)"}},
        h("div",{style:{fontSize:13,fontWeight:700,color:"var(--danger)",marginBottom:4}},"\u26A0 Error loading "+(this.props.name||"component")),
        h("button",{onClick:function(){self.setState({hasError:false})},className:"btn btn--ghost btn--sm"},"Retry"));
    }
    return this.props.children;
  };
  return CEB;
}();

/* ── Toggle Switch ── */
function Toggle(props){
  var on=props.on,onToggle=props.onToggle;
  return h("div",{onClick:onToggle,className:"toggle-track",style:{background:on?"var(--accent)":"rgba(255,255,255,0.1)"},role:"switch","aria-checked":on?"true":"false","aria-label":props.label||"Toggle"},
    h("div",{className:"toggle-knob",style:{left:on?22:2}}));
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
  return h("div",{className:"toast fade-in",role:"alert","aria-live":"polite"},
    h("span",{style:{fontSize:13,color:"var(--text-primary)",fontWeight:600,flex:1}},_toastState.msg),
    h("button",{onClick:function(){if(_toastState.onUndo)_toastState.onUndo();dismissToast()},className:"btn btn--accent-ghost btn--sm","aria-label":"Undo action"},"Undo"));
}

/* ── Save Flash Indicator ── */
var _saveFlashTimer=null;
function showSaveFlash(){
  var existing=document.getElementById("save-flash");
  if(existing)existing.remove();
  var el=document.createElement("div");el.id="save-flash";el.className="save-indicator";el.textContent="\u2713 Saved";
  document.body.appendChild(el);
  if(_saveFlashTimer)clearTimeout(_saveFlashTimer);
  _saveFlashTimer=setTimeout(function(){if(el.parentNode)el.remove()},1600);
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
  return h("div",{className:"overlay overlay--center",onClick:function(e){if(e.target===e.currentTarget){if(_confirmState.onCancel)_confirmState.onCancel();dismissConfirm()}},role:"dialog","aria-modal":"true","aria-label":_confirmState.title},
    h("div",{className:"fade-in",style:{background:"var(--surface)",borderRadius:16,padding:"24px 20px",width:"90%",maxWidth:340,textAlign:"center"}},
      h("h3",{style:{fontSize:16,fontWeight:800,color:"var(--text-bright)",marginBottom:8}},_confirmState.title),
      _confirmState.msg?h("p",{style:{fontSize:13,color:"var(--text-secondary)",marginBottom:20,lineHeight:1.5}},_confirmState.msg):null,
      h("div",{style:{display:"flex",gap:10}},
        h("button",{onClick:function(){if(_confirmState.onCancel)_confirmState.onCancel();dismissConfirm()},className:"btn btn--ghost",style:{flex:1},"aria-label":"Cancel"},"Cancel"),
        h("button",{onClick:function(){if(_confirmState.onConfirm)_confirmState.onConfirm();dismissConfirm()},className:danger?"btn btn--danger":"btn btn--accent",style:{flex:1},"aria-label":_confirmState.confirmLabel},_confirmState.confirmLabel))));
}

/* ── Notification helper ── */
function requestNotifPermission(){if("Notification"in window&&Notification.permission==="default"){Notification.requestPermission()}}
var _audioCtx=null;
function playTimerSound(){
  if(!getPref("timerSound",true))return;
  try{
    if(!_audioCtx)_audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    var ctx=_audioCtx;if(ctx.state==="suspended")ctx.resume();
    var osc=ctx.createOscillator();var gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.value=880;gain.gain.value=0.3;
    osc.start();osc.stop(ctx.currentTime+0.15);
    setTimeout(function(){
      var o2=ctx.createOscillator();var g2=ctx.createGain();
      o2.connect(g2);g2.connect(ctx.destination);
      o2.frequency.value=1100;g2.gain.value=0.3;
      o2.start();o2.stop(ctx.currentTime+0.2);
    },200);
  }catch(e){}
}
function sendTimerNotification(){
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
  playTimerSound();
  if("Notification"in window&&Notification.permission==="granted"){try{new Notification("Rest Complete",{body:"Time to start your next set!",tag:"rest-timer"})}catch(e){}}
}

/* ── Floating Rest Timer ── */
function FloatingTimer(){
  var timers=useTimers();
  var s=useState(null),display=s[0],setDisplay=s[1];
  var intervalRef=useRef(null);
  useEffect(function(){requestNotifPermission()},[]);

  useEffect(function(){
    if(intervalRef.current)clearInterval(intervalRef.current);
    var tick=function(){
      var active=timers.getActiveTimer();
      if(active){
        var left=Math.max(0,active.timer.total-Math.floor((Date.now()-active.timer.startedAt)/1000));
        setDisplay({key:active.key,remaining:left,total:active.timer.total});
        if(left===0){active.timer.running=false;active.timer.done=true;timers.setTimer(active.key,active.timer);sendTimerNotification()}
      }else{setDisplay(null)}
    };
    tick();intervalRef.current=setInterval(tick,1000);
    return function(){if(intervalRef.current)clearInterval(intervalRef.current)};
  },[timers.rev]);

  var doneRef=useRef(null);
  /* Auto-dismiss "REST COMPLETE" after 5 seconds */
  useEffect(function(){
    if(display&&display.remaining===0){
      if(!doneRef.current)doneRef.current=Date.now();
      var id=setTimeout(function(){doneRef.current=null;setDisplay(null)},5000);
      return function(){clearTimeout(id)};
    }else{doneRef.current=null}
  },[display&&display.remaining]);

  if(!display)return null;
  var isDone=display.remaining===0;
  return h("div",{style:{position:"fixed",bottom:56,left:0,right:0,zIndex:100,padding:"10px 16px",background:isDone?"rgba(34,197,94,0.15)":"rgba(10,10,15,0.95)",borderTop:isDone?"1px solid var(--success-border)":"1px solid var(--accent-border)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"space-between"},role:"timer","aria-live":"polite","aria-label":"Rest timer"},
    h("div",{style:{display:"flex",alignItems:"center",gap:10}},
      isDone?h("span",{style:{fontSize:14,fontWeight:800,color:"var(--success)"}},"\u2705 REST COMPLETE"):
      h(React.Fragment,null,
        h("div",{className:"timer-active",style:{width:8,height:8,borderRadius:4,background:"var(--accent)"}}),
        h("span",{style:{fontSize:12,color:"var(--text-secondary)",fontWeight:600}},"Rest"),
        h("span",{style:{fontSize:18,fontWeight:800,color:"var(--accent)",fontVariantNumeric:"tabular-nums"}},fmtTime(display.remaining)))),
    h("button",{onClick:function(){timers.setTimer(display.key,{total:display.total,startedAt:null,running:false,done:false});setDisplay(null);doneRef.current=null},className:"btn btn--ghost btn--sm","aria-label":"Dismiss rest timer"},"Dismiss"));
}

/* ── Rest Timer ── */
function RestTimer(props){
  var exKey=props.exKey,defaultSeconds=props.defaultSeconds;
  var timers=useTimers();
  var s=useState(function(){var t=timers.getTimer(exKey);return t?t.total:defaultSeconds}),total=s[0],setTotal=s[1];
  var totalRef=useRef(total);
  useEffect(function(){totalRef.current=total},[total]);
  var t=timers.getTimer(exKey);
  var running=!!(t&&t.running);
  var done=!!(t&&t.done&&!t.running);
  var sr=useState(function(){if(t&&t.running)return Math.max(0,t.total-Math.floor((Date.now()-t.startedAt)/1000));return null}),remaining=sr[0],setRemaining=sr[1];
  useEffect(function(){
    if(!t||!t.running){setRemaining(t&&t.done?0:null);return}
    setTotal(t.total);totalRef.current=t.total;
    var tick=function(){var left=Math.max(0,t.total-Math.floor((Date.now()-t.startedAt)/1000));setRemaining(left);if(left===0){t.running=false;t.done=true;timers.setTimer(exKey,t)}};
    tick();var id=setInterval(tick,1000);return function(){clearInterval(id)};
  },[timers.rev,exKey]);
  var startFn=useCallback(function(){timers.triggerTimer(exKey,totalRef.current)},[exKey,timers]);
  var stopFn=useCallback(function(){timers.setTimer(exKey,{total:totalRef.current,startedAt:null,running:false,done:false})},[exKey,timers]);
  var progress=running&&remaining!==null?remaining/total:done?0:1;var display=remaining!==null?remaining:total;var color=done?"var(--success)":running?"var(--accent)":"var(--text-dim)";
  var presets=[45,60,90,120,150];
  return h("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"8px 0"},"aria-label":"Rest timer controls"},
    h("div",{style:{position:"relative",width:48,height:48,flexShrink:0}},
      h("svg",{width:48,height:48,style:{transform:"rotate(-90deg)"},"aria-hidden":"true"},
        h("circle",{cx:24,cy:24,r:20,fill:"none",stroke:"rgba(255,255,255,0.05)",strokeWidth:3}),
        h("circle",{cx:24,cy:24,r:20,fill:"none",stroke:color,strokeWidth:3,strokeDasharray:2*Math.PI*20,strokeDashoffset:2*Math.PI*20*(1-progress),strokeLinecap:"round",style:{transition:"stroke-dashoffset 0.3s"}})),
      h("div",{style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontVariantNumeric:"tabular-nums",color:done?"var(--success)":"var(--text-primary)"},"aria-label":"Time remaining: "+fmtTime(display)},fmtTime(display))),
    h("div",{style:{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}},
      !running?h("button",{onClick:startFn,className:done?"btn btn--success btn--sm":"btn btn--accent btn--sm","aria-label":done?"Restart timer":"Start timer"},done?"Restart":"Start"):
        h("button",{onClick:stopFn,className:"btn btn--danger btn--sm","aria-label":"Stop timer"},"Stop"),
      h("div",{style:{display:"flex",gap:3},role:"group","aria-label":"Timer presets"},presets.map(function(sec){return h("button",{key:sec,onClick:function(){setTotal(sec);totalRef.current=sec;if(!running){setRemaining(null);timers.setTimer(exKey,{total:sec,startedAt:null,running:false,done:false})}},style:{padding:"3px 6px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",background:total===sec?"var(--accent-bg)":"rgba(255,255,255,0.04)",color:total===sec?"var(--accent)":"var(--text-dim)",border:total===sec?"1px solid var(--accent-border)":"1px solid rgba(255,255,255,0.07)"},"aria-label":sec+" seconds","aria-pressed":total===sec?"true":"false"},sec<60?sec+"s":(sec/60|0)+(sec%60?":"+(sec%60+"").padStart(2,"0"):"m"))}))));
}

/* ── Strength Trend Chart ── */
function StrengthChart(props){
  var hist=props.hist;
  if(hist.length<2)return null;
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
  var arrow=delta>0?"\u2191":delta<0?"\u2193":"\u2192";var color=delta>0?"var(--success)":delta<0?"var(--danger)":"var(--text-dim)";
  return h("div",{style:{marginTop:8,marginBottom:4,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)"},"aria-label":"Strength trend chart"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
      h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)"}},"Strength Trend"),
      h("span",{style:{fontSize:11,fontWeight:700,color:color}},arrow+" e1RM "+(delta>0?"+":"")+delta)),
    h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none","aria-hidden":"true"},
      h("polyline",{points:wPath,fill:"none",stroke:"rgba(245,158,11,0.4)",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"}),
      h("polyline",{points:e1rmPath,fill:"none",stroke:"var(--info)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"})),
    h("div",{style:{display:"flex",gap:12,marginTop:4}},
      h("span",{style:{fontSize:9,color:"var(--info)",fontWeight:600}},"\u25CF e1RM"),
      h("span",{style:{fontSize:9,color:"rgba(245,158,11,0.6)",fontWeight:600}},"\u25CF Weight")));
}

/* ── History Panel ── */
function HistoryPanel(props){
  var hist=useMemo(function(){return getHistory(props.dayId,props.exId,12)},[props.dayId,props.exId]);
  if(!hist.length)return h("div",{style:{fontSize:11,color:"var(--text-dim)",padding:"10px 0",textAlign:"center"}},
    h("div",{style:{fontSize:20,marginBottom:4},"aria-hidden":"true"},"\uD83D\uDCCA"),
    h("div",{style:{fontStyle:"italic"}},"No history yet"),
    h("div",{style:{fontSize:10,marginTop:2,color:"var(--text-dim)"}},"Complete today\u2019s sets to start tracking progress"));
  return h("div",{className:"fade-in",style:{marginTop:6},"aria-label":"Exercise history"},
    h(StrengthChart,{hist:hist}),
    hist.map(function(entry){var d=new Date(entry.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});var bestE1rm=0;entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var e=calc1RM(s.weight,s.reps);if(e>bestE1rm)bestE1rm=e}});var pastData=loadDayData(props.dayId,entry.date);var rpe=pastData.rpe&&pastData.rpe[props.exId]?pastData.rpe[props.exId]:null;var rpeColor=rpe?rpe<=7?"var(--success)":rpe===8?"var(--accent)":rpe===9?"#f97316":"var(--danger)":null;var exNote=pastData.exNotes&&pastData.exNotes[props.exId]?pastData.exNotes[props.exId]:null;
      return h("div",{key:entry.date,style:{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}},
        h("div",{style:{display:"flex",alignItems:"center",gap:8}},
          h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",width:44,flexShrink:0}},label),
          h("div",{style:{display:"flex",gap:6,flex:1,flexWrap:"wrap"}},entry.sets.map(function(s,i){return(s.weight||s.reps)?h("span",{key:i,style:{fontSize:10,color:s.done?"var(--text-dim)":"var(--text-dim)",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}},(s.weight||"\u2014")+"\u00D7"+(s.reps||"\u2014")):null}).filter(Boolean)),
          bestE1rm>0?h("span",{className:"badge badge--info"},"e1RM "+bestE1rm+" "+getExUnit(props.exId)):null,
          rpe?h("span",{style:{fontSize:9,fontWeight:700,color:rpeColor,flexShrink:0}},"RPE "+rpe):null),
        exNote?h("div",{style:{marginLeft:52,fontSize:10,color:"var(--text-dim)",fontStyle:"italic",marginTop:1}},exNote):null)}));
}

/* ── Machine / Bar Weight ── */
function MachineWeightInput(props){
  var unit=getExUnit(props.exId);
  var s=useState(false),show=s[0],setShow=s[1];var s2=useState(function(){return getMachineWeight(props.exId)}),weight=s2[0],setWeight=s2[1];
  var save=useCallback(function(v){var num=Math.max(0,parseFloat(v)||0);setWeight(num);setMachineWeightLS(props.exId,num)},[props.exId]);
  var label=props.isMachine?(weight>0?"Machine base: "+weight+" "+unit+" \u270E":"+ Set machine base weight"):(weight>0?"Bar weight: "+weight+" "+unit+" \u270E":"+ Set bar weight (default "+(unit==="kg"?20:45)+")");
  return h("div",{style:{padding:"4px 0"}},
    h("button",{onClick:function(){setShow(!show)},style:{fontSize:11,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",padding:"2px 0",textDecoration:"underline",textDecorationColor:"rgba(107,114,128,0.3)",textUnderlineOffset:2},"aria-label":label,"aria-expanded":show?"true":"false"},label),
    show&&h("div",{className:"fade-in",style:{display:"flex",alignItems:"center",gap:8,marginTop:6}},
      h("input",{type:"number",inputMode:"decimal",value:weight||"",placeholder:props.isMachine?"0":unit==="kg"?"20":"45",onChange:function(e){save(e.target.value)},className:"input",style:{width:70},"aria-label":"Weight value"}),
      h("span",{style:{fontSize:11,color:"var(--text-dim)"}},unit+(props.isMachine?" (stack start)":" (bar)"))));
}

/* ── Plate Calculator Display ── */
function PlateDisplay(props){
  var weight=parseFloat(props.weight);var unit=props.exUnit||getUnit();var barOverride=getMachineWeight(props.exId);
  if(!weight||weight<=0)return null;
  var bar=barOverride>0?barOverride:(unit==="kg"?BAR_KG:BAR_LBS);
  if(weight<=bar&&barOverride<=0)return null;
  var plates=unit==="kg"?PLATES_KG:PLATES_LBS;
  var perSide=(weight-bar)/2;if(perSide<0)return h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:2}},"Bar only ("+bar+" "+unit+")");
  var result=[];var rem=perSide;
  plates.forEach(function(p){while(rem>=p-0.001){result.push(p);rem-=p}});
  var remainder=Math.round(rem*100)/100;
  if(result.length===0)return h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:2}},"Bar only ("+bar+" "+unit+")");
  return h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:2,fontStyle:"italic"},"aria-label":"Plate breakdown"},
    "Per side: "+result.join(" + ")+" "+unit,remainder>0?" ("+remainder+" "+unit+" unloadable)":"");
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
  return h("div",{style:{marginBottom:6},"aria-label":"Warmup sets"},
    h("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:show&&sets.length?6:0}},
      h("button",{onClick:function(){setShow(!show)},className:"btn btn--xs",style:{color:"var(--warmup)",background:"none",border:"none"},"aria-expanded":show?"true":"false","aria-label":"Toggle warmup sets"},show?"\u25BE Warmup":"\u25B8 Warmup"),
      h("button",{onClick:addSet,className:"btn btn--ghost btn--xs","aria-label":"Add warmup set"},"+ Add"),
      workingWeight>0&&sets.length===0?h("button",{onClick:autoRamp,className:"btn btn--xs",style:{color:"var(--warmup)",background:"var(--warmup-bg)",border:"1px solid var(--warmup-border)"},"aria-label":"Auto-generate warmup ramp"},"Auto Warmup"):null),
    show&&sets.length>0&&h("div",{className:"fade-in"},sets.map(function(set,i){
      return h("div",{key:i,style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr 28px",gap:5,alignItems:"center",marginBottom:3}},
        h("span",{style:{fontSize:10,color:"var(--warmup)",textAlign:"center",fontWeight:600}},"W"+(i+1)),
        h("input",{type:"number",inputMode:"decimal",placeholder:unit,value:set.weight,onChange:function(e){update(i,"weight",e.target.value)},className:"input input--warmup","aria-label":"Warmup "+(i+1)+" weight"}),
        h("input",{type:"number",inputMode:"numeric",placeholder:"reps",value:set.reps,onChange:function(e){update(i,"reps",e.target.value)},className:"input input--warmup","aria-label":"Warmup "+(i+1)+" reps"}),
        h("button",{onClick:function(){remove(i)},className:"btn btn--xs",style:{width:24,height:24,borderRadius:6,border:"1px solid var(--danger-border)",background:"transparent",color:"var(--danger)",padding:0},"aria-label":"Remove warmup set "+(i+1)},"\u2715"))})));
}

/* ── Set Logger ── */
function SetLogger(props){
  var exId=props.exId,numSets=props.numSets,dayId=props.dayId,onSetUpdate=props.onSetUpdate,onSetDone=props.onSetDone,exKey=props.exKey,rest=props.rest,isMachine=props.isMachine,increment=props.increment||5;
  var dayData=useDayData();
  var su=useState(function(){return getExUnit(exId)}),unit=su[0],setUnitLocal=su[1];
  var toggleUnit=function(){
    var prev=unit;var next=prev==="lbs"?"kg":"lbs";setUnitLocal(next);setExUnit(exId,next);
    /* Save source values on first conversion, restore on convert-back */
    var sourceKey="eu_source_"+exId;var source=lsGet(sourceKey);
    if(source&&source.unit===next){
      /* Converting back to original unit — restore exact values */
      setData(function(cur){var restored=cur.map(function(s,i){return source.sets[i]&&source.sets[i].weight?Object.assign({},s,{weight:source.sets[i].weight}):s});save(restored);return restored});
      try{localStorage.removeItem(LS+sourceKey)}catch(e){}
    }else{
      /* First conversion — save originals and convert */
      lsSet(sourceKey,{unit:prev,sets:data.map(function(s){return{weight:s.weight}})});
      setData(function(cur){var converted=cur.map(function(s){
        if(!s.weight)return s;var w=parseFloat(s.weight);if(!w)return s;
        var cw=prev==="lbs"?Math.round(w/2.20462*2)/2:Math.round(w*2.20462/5)*5;
        return Object.assign({},s,{weight:String(cw)});
      });save(converted);return converted});
    }
  };
  var s=useState(function(){var saved=dayData.getData(dayId);var ex=saved.exercises&&saved.exercises[exId];return Array.from({length:numSets},function(_,i){return ex&&ex[i]?{weight:ex[i].weight||"",reps:ex[i].reps||"",done:!!ex[i].done}:{weight:"",reps:"",done:false}})}),data=s[0],setData=s[1];
  var lastSession=useMemo(function(){var h=getHistory(dayId,exId,1);return h.length?h[0].sets:null},[dayId,exId]);
  var save=useCallback(function(d){var all=dayData.getData(dayId);if(!all.exercises)all.exercises={};all.exercises[exId]=d;dayData.saveData(dayId,all)},[dayId,exId,dayData]);
  var persist=useCallback(function(d){save(d);markSessionStart()},[save]);
  var MAX_WEIGHT=1500,MAX_REPS=100;
  var update=function(idx,field,val){if(val!==""&&(isNaN(Number(val))||Number(val)<0))return;if(val!==""&&field==="weight"&&Number(val)>MAX_WEIGHT)return;if(val!==""&&field==="reps"&&Number(val)>MAX_REPS)return;setData(function(prev){var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{[field]:val}):s});save(next);return next})};
  var toggle=function(idx){setData(function(prev){var wasDone=prev[idx].done;var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{done:!s.done}):s});persist(next);if(!wasDone){if(navigator.vibrate)navigator.vibrate(30);showSaveFlash();if(onSetDone)onSetDone();showUndoToast("Set "+(idx+1)+" logged",function(){setData(function(cur){var reverted=cur.map(function(s,i){return i===idx?Object.assign({},s,{done:false}):s});persist(reverted);if(onSetUpdate)onSetUpdate();return reverted})})}else if(onSetUpdate){onSetUpdate()}return next})};
  var autoFill=function(idx,field){if(lastSession&&lastSession[idx]&&lastSession[idx][field])update(idx,field,lastSession[idx][field])};
  var step=function(idx,field,delta){setData(function(prev){var cur=parseFloat(prev[idx][field])||0;var val=Math.max(0,cur+delta);var max=field==="weight"?MAX_WEIGHT:MAX_REPS;if(val>max)val=max;var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{[field]:String(val)}):s});save(next);return next})};
  var addExtraSet=function(){setData(function(prev){var last=prev[prev.length-1];var next=prev.concat([{weight:last&&last.weight?last.weight:"",reps:"",done:false,extra:true}]);save(next);return next})};
  var removeExtraSet=function(idx){setData(function(prev){var next=prev.filter(function(_,i){return i!==idx});save(next);if(onSetUpdate)onSetUpdate();return next})};
  /* RIR tracking per set */
  var sr=useState(function(){var saved=dayData.getData(dayId);return saved.setRir&&saved.setRir[exId]||{}}),rirData=sr[0],setRirData=sr[1];
  var saveRir=function(idx,val){var next=Object.assign({},rirData);next[idx]=val;setRirData(next);var all=dayData.getData(dayId);if(!all.setRir)all.setRir={};all.setRir[exId]=next;dayData.saveData(dayId,all)};
  var firstWeight=null;for(var wi=0;wi<data.length;wi++){if(data[wi].weight){firstWeight=data[wi].weight;break}}
  var hasExtra=data.length>numSets;var lastCol=hasExtra?"62px":"46px";
  var nextSetIdx=data.findIndex(function(s){return!s.done});

  return h("div",{style:{marginTop:4},"aria-label":"Set logger"},
    h("div",{style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr "+lastCol,gap:5,marginBottom:5}},
      h("span",{style:{fontSize:9,color:"var(--text-dim)",textAlign:"center",fontWeight:700}},"SET"),
      h("button",{onClick:toggleUnit,className:"btn btn--xs",style:{background:"none",border:"none",color:"var(--accent)",padding:0,fontSize:9,fontWeight:700},"aria-label":"Toggle weight unit"},unit.toUpperCase()+" \u21C4"),
      h("span",{style:{fontSize:9,color:"var(--text-dim)",textAlign:"center",fontWeight:700}},"REPS"),
      h("span",null)),
    data.map(function(set,i){var ghost=lastSession&&lastSession[i];var isExtra=i>=numSets;var isNextSet=i===nextSetIdx;
      return h("div",{key:i,className:isExtra?"set-row--extra":"",style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr "+lastCol,gap:5,alignItems:"center",marginBottom:4,background:isNextSet?"rgba(245,158,11,0.06)":"transparent",borderRadius:isNextSet?8:0,padding:isNextSet?"4px 2px":"0"}},
        h("span",{style:{fontSize:12,color:i>=numSets?"var(--accent)":"var(--text-dim)",textAlign:"center",fontWeight:700}},i>=numSets?"+"+(i-numSets+1):i+1),
        h("div",{className:"stepper"},
          h("button",{onClick:function(){step(i,"weight",-increment)},className:"stepper-btn","aria-label":"Decrease weight"},"\u2212"),
          h("input",{type:"number",inputMode:"decimal",placeholder:ghost&&ghost.weight?String(ghost.weight):"\u2014",value:set.weight,onChange:function(e){update(i,"weight",e.target.value)},onFocus:function(){if(!set.weight&&ghost&&ghost.weight)autoFill(i,"weight")},className:"input",style:{opacity:set.done?.55:1},"aria-label":"Set "+(i+1)+" weight"}),
          h("button",{onClick:function(){step(i,"weight",increment)},className:"stepper-btn","aria-label":"Increase weight"},"+")),
        h("div",{className:"stepper"},
          h("button",{onClick:function(){step(i,"reps",-1)},className:"stepper-btn","aria-label":"Decrease reps"},"\u2212"),
          h("input",{type:"number",inputMode:"numeric",placeholder:ghost&&ghost.reps?String(ghost.reps):"\u2014",value:set.reps,onChange:function(e){update(i,"reps",e.target.value)},onFocus:function(){if(!set.reps&&ghost&&ghost.reps)autoFill(i,"reps")},className:"input",style:{opacity:set.done?.55:1},"aria-label":"Set "+(i+1)+" reps"}),
          h("button",{onClick:function(){step(i,"reps",1)},className:"stepper-btn","aria-label":"Increase reps"},"+")),
        h("div",{style:{display:"flex",alignItems:"center",gap:2}},
          h("button",{onClick:function(){toggle(i)},className:set.done?"set-check set-check--done set-done-pop":"set-check","aria-label":"Mark set "+(i+1)+(set.done?" incomplete":" complete"),"aria-pressed":set.done?"true":"false"},set.done?"\u2713":""),
          i>=numSets?h("button",{onClick:function(){removeExtraSet(i)},style:{width:16,height:16,borderRadius:4,border:"1px solid var(--danger-border)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"var(--danger)",padding:0},"aria-label":"Remove extra set"},"\u2715"):null),
        set.done&&getPref("showRir",false)?h("div",{style:{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:4,marginBottom:2,marginTop:-2}},
          h("span",{style:{fontSize:9,color:"var(--text-dim)",fontWeight:600,width:28,textAlign:"center"}},"RIR"),
          [0,1,2,3,4].map(function(r){var active=rirData[i]===r;var color=r===0?"var(--danger)":r<=1?"#f97316":r<=2?"var(--accent)":"var(--success)";return h("button",{key:r,onClick:function(){saveRir(i,r)},style:{padding:"2px 6px",borderRadius:4,fontSize:9,fontWeight:700,border:active?"1px solid "+color:"1px solid rgba(255,255,255,0.06)",background:active?"rgba(255,255,255,0.06)":"transparent",color:active?color:"var(--text-dim)",cursor:"pointer"},"aria-label":r+" reps in reserve"},r)})):null)}),
    data.length<numSets+4?h("button",{onClick:addExtraSet,className:"btn btn--accent-ghost btn--sm btn--full btn--dashed",style:{marginTop:2,opacity:0.7},"aria-label":"Add extra set"},"+1 Set (drop set / extra)"):null,
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
  var colors={6:"var(--success)",7:"#84cc16",8:"var(--accent)",9:"#f97316",10:"var(--danger)"};
  return h("div",{className:"fade-in",style:{marginTop:8,padding:"8px 0"},"aria-label":"RPE rating"},
    h("div",{style:{fontSize:11,fontWeight:700,color:"var(--text-dim)",marginBottom:6}},"How hard was that? (RPE)"),
    h("div",{style:{display:"flex",gap:4},role:"radiogroup","aria-label":"Rate perceived exertion"},[6,7,8,9,10].map(function(val){var active=rpe===val;
      return h("button",{key:val,onClick:function(){save(val)},className:"rpe-btn",style:{border:active?"2px solid "+colors[val]:"1px solid rgba(255,255,255,0.08)",background:active?"rgba(255,255,255,0.06)":"transparent"},role:"radio","aria-checked":active?"true":"false","aria-label":"RPE "+val+" - "+labels[val]},
        h("div",{style:{fontSize:15,fontWeight:800,color:active?colors[val]:"var(--text-dim)"}},val),
        h("div",{style:{fontSize:8,fontWeight:600,color:active?"var(--text-secondary)":"var(--text-dim)",marginTop:1}},labels[val]))})),
    rpe?h("div",{style:{fontSize:11,color:"var(--text-dim)",marginTop:4,fontStyle:"italic"},"aria-live":"polite"},rpe<=7?"Good \u2014 room to progress next session.":rpe===8?"Solid \u2014 right in the hypertrophy zone.":rpe===9?"Tough \u2014 consider same weight next time.":"Max effort \u2014 monitor fatigue, deload may be needed."):null);
}

/* ── Exercise Notes ── */
function ExerciseNotes(props){
  var exId=props.exId,dayId=props.dayId;
  var dayData=useDayData();
  var s=useState(function(){var d=dayData.getData(dayId);return d.exNotes&&d.exNotes[exId]?d.exNotes[exId]:""}),note=s[0],setNote=s[1];
  var save=function(val){setNote(val);var all=dayData.getData(dayId);if(!all.exNotes)all.exNotes={};all.exNotes[exId]=val;dayData.saveData(dayId,all)};
  return h("div",{style:{marginTop:6}},
    h("input",{type:"text",value:note,onChange:function(e){save(e.target.value)},placeholder:"Session note (e.g. shoulder felt tight)...",className:"input input--text","aria-label":"Exercise session note"}));
}

/* ── Quick Log ── */
function QuickLogBtn(props){
  var exId=props.exId,numSets=props.numSets,dayId=props.dayId,exKey=props.exKey,rest=props.rest,onLog=props.onLog;
  var dayData=useDayData();var timers=useTimers();
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
  return h("button",{onClick:handleQL,className:"btn btn--success-ghost btn--full",style:{marginTop:8},"aria-label":"Quick log set "+(nextIdx+1)+" and start rest timer"},"\u26A1 Log Set "+(nextIdx+1)+" + Start Timer");
}

/* ── Exercise Card (Tabbed: Log | History | Coach) ── */
/* ── Card Extras (progressive disclosure for warmups, machine weight) ── */
function CardExtras(props){
  var exId=props.exId,dayId=props.dayId,isMachine=props.isMachine;
  var s=useState(false),show=s[0],setShow=s[1];
  return h("div",{style:{marginTop:8}},
    h("button",{onClick:function(){setShow(!show)},style:{fontSize:11,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",padding:"4px 0",display:"flex",alignItems:"center",gap:4},"aria-expanded":show?"true":"false"},
      h("span",{style:{fontSize:8,transform:show?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block"}},"\u25B6"),
      "Warmups & Setup"),
    show&&h("div",{className:"fade-in",style:{marginTop:4}},
      h(MachineWeightInput,{exId:exId,isMachine:isMachine}),
      h(WarmupSets,{exId:exId,dayId:dayId})));
}

function ExerciseCard(props){
  var exercise=props.exercise,index=props.index,dayId=props.dayId,onSetUpdate=props.onSetUpdate,isNext=props.isNext,supersetGroup=props.supersetGroup,supersetPartner=props.supersetPartner,onSwap=props.onSwap;/* supersetPartnerExId accessed via props */
  var unit=getExUnit(exercise.id);
  var dayData=useDayData();var timers=useTimers();
  var s=useState(false),expanded=s[0],setExpanded=s[1];
  var st=useState("log"),activeTab=st[0],setActiveTab=st[1];
  var sswap=useState(false),showSwapMenu=sswap[0],setShowSwapMenu=sswap[1];
  var sside=useState("L"),activeSide=sside[0],setActiveSide=sside[1];
  var ssk=useState(function(){var d=dayData.getData(dayId);return d._skipped&&d._skipped[exercise.id]||false}),skipped=ssk[0],setSkipped=ssk[1];
  var toggleSkip=function(){var next=!skipped;setSkipped(next);var all=dayData.getData(dayId);if(!all._skipped)all._skipped={};all._skipped[exercise.id]=next;dayData.saveData(dayId,all);if(onSetUpdate)onSetUpdate()};
  var sdr=useState(0),dataRev=sdr[0],bumpDataRev=sdr[1];
  var isBilateral=!!exercise.bilateral;
  var bilateralExId=isBilateral?exercise.id+"_"+activeSide:exercise.id;
  var exKey=dayId+"_"+bilateralExId;var saved=dayData.getData(dayId);var exData=saved.exercises&&saved.exercises[bilateralExId];
  var completedSets,prescribedDone,allDone;
  if(isBilateral){
    var exDataL=saved.exercises&&saved.exercises[exercise.id+"_L"];
    var exDataR=saved.exercises&&saved.exercises[exercise.id+"_R"];
    var doneL=exDataL?exDataL.slice(0,exercise.sets).filter(function(s){return s.done}).length:0;
    var doneR=exDataR?exDataR.slice(0,exercise.sets).filter(function(s){return s.done}).length:0;
    completedSets=doneL+doneR;prescribedDone=doneL+doneR;allDone=doneL===exercise.sets&&doneR===exercise.sets;
  }else{
    completedSets=exData?exData.filter(function(s){return s.done}).length:0;
    prescribedDone=exData?exData.slice(0,exercise.sets).filter(function(s){return s.done}).length:0;
    allDone=prescribedDone===exercise.sets;
  }
  var timerData=timers.getTimer(exKey);var timerRunning=timerData&&timerData.running;
  var meso=getMesocycle();var isDeloadWeek=meso.week===4;
  var mesoRepTarget=meso.mode==="undulating"?getMesoRepTarget(exercise.reps,meso.week):null;
  var overload=useMemo(function(){if(isDeloadWeek)return null;return getOverloadSuggestion(dayId,exercise)},[dayId,exercise,isDeloadWeek]);
  var deloadMod=useMemo(function(){if(!isDeloadWeek)return null;return getDeloadModifiers(dayId,exercise)},[dayId,exercise,isDeloadWeek]);
  var readinessAdj=useMemo(function(){return getReadinessAdj(dayId)},[dayId]);
  var deloadSuggestion=useMemo(function(){
    if(deloadMod&&deloadMod.weight)return deloadMod.weight;
    if(!isDeloadWeek)return null;var hist=getHistory(dayId,exercise.id,1);if(!hist.length)return null;var comp=hist[0].sets.filter(function(s){return s.done&&s.weight});if(!comp.length)return null;var w=parseFloat(comp[0].weight)||0;return w>0?Math.round(w*0.55):null;
  },[dayId,exercise,isDeloadWeek,deloadMod]);
  var e1rm=useMemo(function(){var best=0;var checkData=isBilateral?[].concat(saved.exercises&&saved.exercises[exercise.id+"_L"]||[],saved.exercises&&saved.exercises[exercise.id+"_R"]||[]):[exData||[]].flat();checkData.forEach(function(s){if(s&&s.done&&s.weight&&s.reps){var e=calc1RM(s.weight,s.reps);if(e>best)best=e}});return best},[exData,isBilateral?saved:null]);
  var restLabel=exercise.rest<60?exercise.rest+"s":(exercise.rest/60|0)+(exercise.rest%60?":"+(exercise.rest%60+"").padStart(2,"0"):"m");
  var onToggleDone=useCallback(function(){
    if(getAutoTimer()){
      /* Superset rest logic: only start timer after partner exercise set is also done */
      if(supersetGroup){
        var partnerKey=null;
        if(props.supersetPartnerExId){partnerKey=dayId+"_"+props.supersetPartnerExId}
        if(partnerKey){
          var partnerTimer=timers.getTimer(partnerKey);
          /* If partner's timer is already running/done, we're the second exercise — start rest */
          if(partnerTimer&&(partnerTimer.running||partnerTimer.done)){
            timers.triggerTimer(exKey,exercise.rest);
          }else{
            /* We're first — show a brief "do partner" indicator instead of full rest */
            timers.setTimer(exKey,{total:exercise.rest,startedAt:null,running:false,done:true,waitingPartner:true});
          }
        }else{timers.triggerTimer(exKey,exercise.rest)}
      }else{timers.triggerTimer(exKey,exercise.rest)}
    }
    if(onSetUpdate)onSetUpdate();
  },[exKey,exercise.rest,onSetUpdate,timers,supersetGroup,dayId]);
  var onQuickLog=useCallback(function(){bumpDataRev(function(r){return r+1});if(onSetUpdate)onSetUpdate()},[onSetUpdate]);
  var cardClass="card"+(skipped?" card--skipped":"")+(allDone&&!skipped?" card--done":"")+(isNext&&!allDone&&!skipped&&completedSets===0?" card--next":"");
  return h("div",{className:cardClass,style:{position:"relative"},"aria-label":exercise.name},
    supersetGroup?h("div",{className:"superset-line","aria-hidden":"true"}):null,
    h("div",{onClick:function(){setExpanded(!expanded)},style:{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,WebkitUserSelect:"none",userSelect:"none"},role:"button","aria-expanded":expanded?"true":"false"},
      h("div",{style:{flex:1}},
        h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
          h("span",{className:allDone?"badge badge--success":"badge badge--accent"},index+1),
          h("span",{style:{fontSize:14,fontWeight:700,color:allDone?"var(--text-dim)":"var(--text-bright)",lineHeight:1.3,textDecoration:allDone?"line-through":"none",textDecorationColor:"rgba(34,197,94,0.6)",textDecorationThickness:2}},exercise.name),
          supersetGroup?h("span",{className:"superset-badge"},"SS"):null,
          exercise.alternatives&&exercise.alternatives.length>0?h("button",{onClick:function(e){e.stopPropagation();setShowSwapMenu(!showSwapMenu)},style:{background:"none",border:"1px solid var(--info-border)",borderRadius:5,padding:"1px 5px",cursor:"pointer",fontSize:9,fontWeight:700,color:"var(--info)",lineHeight:"14px"},"aria-label":"Swap exercise"},"\u21C4"):null,
          isNext&&!allDone&&completedSets===0?h("span",{className:"badge badge--accent",style:{letterSpacing:.5}},"UP NEXT"):null,
          isNext&&!allDone&&completedSets>0?h("span",{className:"badge badge--info",style:{letterSpacing:.5}},"IN PROGRESS"):null,
          skipped?h("span",{className:"badge",style:{color:"var(--text-dim)",background:"rgba(255,255,255,0.06)",letterSpacing:.5}},"SKIPPED"):null,
          overload&&!allDone?h("span",{className:overload.type==="hold"?"badge badge--info":overload.type==="volume"?"badge badge--accent":"badge badge--success"},overload.type==="hold"?"\u23F8 Hold weight":overload.type==="volume"?"+1 Set":overload.type==="reps"?"\u2191 More reps":"\u2191 "+overload.to+" "+unit):null,
          deloadSuggestion&&!allDone?h("span",{className:"badge badge--accent"},"\u2193 Deload ~"+deloadSuggestion+" "+unit):null,
          readinessAdj&&!allDone?h("span",{className:"badge badge--info"},readinessAdj.level==="low"?"\u26A0 Light day":"\u2193 Adjusted"):null),
        h("div",{style:{display:"flex",alignItems:"center",gap:6,marginTop:3}},
          h("span",{style:{fontSize:11,color:"var(--text-dim)"}},exercise.sets+"\u00D7"+exercise.reps+" \u00B7 "+restLabel),
          completedSets>0?h("span",{className:allDone?"badge badge--success":"badge badge--accent"},completedSets+"/"+(isBilateral?exercise.sets*2:exercise.sets)):null,
          e1rm>0?h("span",{className:"badge badge--info"},"e1RM "+e1rm+" "+unit):null,
          timerRunning&&!expanded?h("span",{className:"timer-active",style:{width:6,height:6,borderRadius:3,background:"var(--accent)"}}):null),
        !expanded?h("div",{style:{fontSize:11,color:"var(--text-dim)",marginTop:2,fontStyle:"italic"}},exercise.notes):null),
      h("span",{style:{fontSize:16,color:"var(--text-dim)",transform:expanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",marginTop:2,flexShrink:0},"aria-hidden":"true"},"\u25BE")),
    showSwapMenu&&exercise.alternatives?h("div",{className:"fade-in",style:{display:"flex",gap:4,flexWrap:"wrap",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
      exercise._swappedFrom?h("span",{style:{fontSize:10,color:"var(--info)",marginRight:4}},"\u21C4 from "+exercise._swappedFrom):null,
      exercise.alternatives.map(function(alt){return h("button",{key:alt,onClick:function(){if(onSwap)onSwap(exercise.id,alt);setShowSwapMenu(false)},className:"btn btn--info btn--xs"},alt)})):null,
    !expanded&&isNext&&!allDone?h(QuickLogBtn,{exId:exercise.id,numSets:exercise.sets,dayId:dayId,exKey:exKey,rest:exercise.rest,onLog:onQuickLog}):null,
    expanded&&h("div",{className:"fade-in",style:{marginTop:10,borderTop:"1px solid rgba(255,255,255,0.04)",paddingTop:10}},
      h("div",{className:"ex-tabs",role:"tablist"},
        h("button",{onClick:function(){setActiveTab("log")},className:"ex-tab"+(activeTab==="log"?" ex-tab--active":""),role:"tab","aria-selected":activeTab==="log"?"true":"false"},"Log"),
        h("button",{onClick:function(){setActiveTab("history")},className:"ex-tab"+(activeTab==="history"?" ex-tab--active":""),role:"tab","aria-selected":activeTab==="history"?"true":"false"},"History"),
        h("button",{onClick:function(){setActiveTab("coach")},className:"ex-tab"+(activeTab==="coach"?" ex-tab--active":""),role:"tab","aria-selected":activeTab==="coach"?"true":"false"},"Coach")),
      activeTab==="log"&&h("div",{role:"tabpanel"},
        overload?h("div",{style:{fontSize:12,color:overload.type==="hold"?"var(--info)":overload.type==="volume"?"var(--accent)":"var(--success)",background:overload.type==="hold"?"var(--info-bg)":overload.type==="volume"?"var(--accent-bg)":"var(--success-bg)",border:"1px solid "+(overload.type==="hold"?"var(--info-border)":overload.type==="volume"?"var(--accent-border)":"var(--success-border)"),borderRadius:8,padding:"8px 10px",marginBottom:8}},
          overload.type==="hold"?["\u23F8 ",h("strong",{key:"m"},overload.msg)]:
          overload.type==="volume"?["\uD83D\uDCC8 ",h("strong",{key:"m"},overload.msg)]:
          overload.type==="reps"?["\uD83D\uDCC8 ",h("strong",{key:"m"},overload.msg)]:
          ["\uD83D\uDCAA ",h("strong",{key:"w"},overload.to+" "+unit)," (+"+overload.increment+")"]):null,
        readinessAdj?h("div",{style:{fontSize:12,color:"var(--info)",background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:8,padding:"8px 10px",marginBottom:8}},"\uD83D\uDCCA ",readinessAdj.label):null,
        deloadMod&&deloadMod.skip?h("div",{style:{fontSize:12,color:"var(--danger)",background:"var(--danger-bg)",border:"1px solid var(--danger-border)",borderRadius:8,padding:"8px 10px",marginBottom:8}},"\uD83E\uDDD8 ",deloadMod.label):null,
        deloadSuggestion?h("div",{style:{fontSize:12,color:"var(--accent)",background:"var(--accent-bg)",border:"1px solid var(--accent-border)",borderRadius:8,padding:"8px 10px",marginBottom:8}},"\uD83E\uDDD8 Deload ~",h("strong",null,deloadSuggestion+" "+unit)," (55%)"):null,
        mesoRepTarget?h("div",{style:{fontSize:11,color:"var(--info)",background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:8,padding:"6px 10px",marginBottom:6}},"\uD83D\uDCC5 ",mesoRepTarget.label):null,
        exercise.tempo||exercise.rir?h("div",{style:{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}},
          exercise.tempo?h("div",{className:"badge badge--accent",style:{padding:"5px 8px",fontSize:11,borderRadius:6}},"Tempo: ",h("strong",null,exercise.tempo)):null,
          exercise.rir?h("div",{className:"badge badge--info",style:{padding:"5px 8px",fontSize:11,borderRadius:6,cursor:"pointer"},onClick:function(){showConfirm({title:"RIR \u2014 Reps In Reserve",msg:"RIR means how many more reps you could do:\n\n0 = Failure (no reps left)\n1 = Could do 1 more rep\n2 = Could do 2 more reps\n3 = Moderate effort\n4 = Light / warmup effort\n\nTarget: "+exercise.rir+" RIR",confirmLabel:"Got it",onConfirm:function(){}})}},"Target: ",h("strong",null,exercise.rir+" RIR")," \u24D8"):null):null,
        isBilateral?h("div",{style:{display:"flex",gap:4,marginBottom:8}},
          h("button",{onClick:function(){setActiveSide("L")},style:{flex:1,padding:"6px 0",borderRadius:6,border:activeSide==="L"?"1px solid var(--accent-border)":"1px solid rgba(255,255,255,0.08)",background:activeSide==="L"?"var(--accent-bg)":"transparent",color:activeSide==="L"?"var(--accent)":"var(--text-dim)",fontSize:12,fontWeight:700,cursor:"pointer"}},"Left"),
          h("button",{onClick:function(){setActiveSide("R")},style:{flex:1,padding:"6px 0",borderRadius:6,border:activeSide==="R"?"1px solid var(--accent-border)":"1px solid rgba(255,255,255,0.08)",background:activeSide==="R"?"var(--accent-bg)":"transparent",color:activeSide==="R"?"var(--accent)":"var(--text-dim)",fontSize:12,fontWeight:700,cursor:"pointer"}},"Right")):null,
        h(SetLogger,{key:bilateralExId+"_"+dataRev,exId:bilateralExId,numSets:exercise.sets,dayId:dayId,onSetUpdate:onSetUpdate,onSetDone:onToggleDone,exKey:exKey,rest:exercise.rest,isMachine:!!exercise.machine,increment:exercise.increment||5}),
        h(QuickLogBtn,{exId:exercise.id,numSets:exercise.sets,dayId:dayId,exKey:exKey,rest:exercise.rest,onLog:onQuickLog}),
        h(RestTimer,{exKey:exKey,defaultSeconds:exercise.rest}),
        exercise.tempo?h(TempoTimer,{tempo:exercise.tempo}):null,
        supersetPartner?h("div",{style:{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:8,marginTop:4}},
          h("span",{className:"superset-badge"},"SS"),
          h("span",{style:{fontSize:11,fontWeight:600,color:"var(--info)"}},"Superset with: "+supersetPartner),
          timerData&&timerData.waitingPartner?h("span",{style:{fontSize:10,fontWeight:700,color:"var(--accent)",marginLeft:4}},"\u2192 Do "+supersetPartner+" now"):null,
          h("span",{style:{fontSize:10,color:"var(--text-dim)"}},"Alternate sets, minimal rest")):null,
        h(RPERating,{exId:exercise.id,dayId:dayId,allDone:allDone}),
        h(ExerciseNotes,{exId:exercise.id,dayId:dayId}),
        h(CardExtras,{exId:exercise.id,dayId:dayId,isMachine:!!exercise.machine}),
        !allDone?h("button",{onClick:toggleSkip,className:skipped?"btn btn--ghost btn--sm":"btn btn--ghost btn--sm",style:{marginTop:8,opacity:0.6}},skipped?"\u21A9 Undo Skip":"\u23ED Skip Exercise"):null),
      activeTab==="history"&&h("div",{role:"tabpanel"},
        exercise._swappedFrom?h("div",{style:{fontSize:11,color:"var(--info)",marginBottom:6}},"\u21C4 Swapped from ",h("strong",null,exercise._swappedFrom)," for this session"):null,
        h(HistoryPanel,{dayId:dayId,exId:exercise.id})),
      activeTab==="coach"&&h("div",{role:"tabpanel"},
        exercise.tip?h("div",{style:{padding:10,borderRadius:10,background:"var(--accent-bg)",border:"1px solid rgba(245,158,11,0.1)",fontSize:12,color:"var(--text-primary)",lineHeight:1.6,marginBottom:8}},
          h("div",{style:{fontSize:10,fontWeight:700,color:"var(--accent)",marginBottom:4}},"PERFORMANCE"),
          exercise.tip):null,
        exercise.formTips&&exercise.formTips.length>0?h("div",{style:{padding:10,borderRadius:10,background:"var(--info-bg)",border:"1px solid var(--info-border)",fontSize:12,color:"var(--text-primary)",lineHeight:1.6,marginBottom:8}},
          h("div",{style:{fontSize:10,fontWeight:700,color:"var(--info)",marginBottom:4}},"FORM CUES"),
          exercise.formTips.map(function(t,i){return h("div",{key:i,style:{display:"flex",gap:6,marginBottom:2}},h("span",{style:{color:"var(--info)"}},"•"),t)})):null,
        exercise.commonMistakes&&exercise.commonMistakes.length>0?h("div",{style:{padding:10,borderRadius:10,background:"var(--danger-bg)",border:"1px solid var(--danger-border)",fontSize:12,color:"var(--text-primary)",lineHeight:1.6,marginBottom:8}},
          h("div",{style:{fontSize:10,fontWeight:700,color:"var(--danger)",marginBottom:4}},"COMMON MISTAKES"),
          exercise.commonMistakes.map(function(t,i){return h("div",{key:i,style:{display:"flex",gap:6,marginBottom:2}},h("span",{style:{color:"var(--danger)"}},"•"),t)})):null,
        !exercise.tip&&!(exercise.formTips&&exercise.formTips.length)&&!(exercise.commonMistakes&&exercise.commonMistakes.length)?h("div",{style:{fontSize:11,color:"var(--text-dim)",fontStyle:"italic"}},"No coaching tips available."):null,
        exercise.notes?h("div",{style:{fontSize:12,color:"var(--text-dim)",fontStyle:"italic",marginTop:8}},exercise.notes):null)));
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
  var dayId=props.dayId;var unit=getUnit();var cardioKey="cardio_"+dayId+"_"+getSessionDate();
  var s=useState(function(){var saved=lsGet(cardioKey);return saved||{done:false,type:"treadmill",duration:30,incline:12,speed:3.0}}),data=s[0],setData=s[1];
  var s2=useState(data.done),expanded=s2[0],setExpanded=s2[1];
  var save=function(d){setData(d);lsSet(cardioKey,d)};var update=function(field,val){save(Object.assign({},data,{[field]:val}))};var toggleDone=function(){save(Object.assign({},data,{done:!data.done}));if(!expanded)setExpanded(true)};
  var cardioType=CARDIO_TYPES.find(function(c){return c.id===(data.type||"treadmill")})||CARDIO_TYPES[0];
  var switchType=function(typeId){var ct=CARDIO_TYPES.find(function(c){return c.id===typeId})||CARDIO_TYPES[0];save(Object.assign({},ct.defaults,{done:data.done,type:typeId}))};
  var speedLabel=unit==="kg"?"km/h":"mph";
  return h("div",{className:data.done?"card card--done":"card",style:{marginTop:12},"aria-label":"Cardio log"},
    h("div",{onClick:function(){setExpanded(!expanded)},style:{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",WebkitUserSelect:"none",userSelect:"none"},role:"button","aria-expanded":expanded?"true":"false"},
      h("div",{style:{display:"flex",alignItems:"center",gap:8}},
        h("span",{style:{fontSize:18},"aria-hidden":"true"},cardioType.icon),
        h("span",{style:{fontSize:14,fontWeight:700,color:data.done?"var(--text-dim)":"var(--text-bright)"}},cardioType.label+" \u2014 Cardio"),
        data.done?h("span",{className:"badge badge--success"},"Done"):null),
      h("span",{style:{fontSize:16,color:"var(--text-dim)",transform:expanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"},"aria-hidden":"true"},"\u25BE")),
    expanded&&h("div",{className:"fade-in",style:{marginTop:10,borderTop:"1px solid rgba(255,255,255,0.04)",paddingTop:10}},
      h("div",{style:{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"},role:"group"},CARDIO_TYPES.map(function(ct){var active=ct.id===(data.type||"treadmill");return h("button",{key:ct.id,onClick:function(){switchType(ct.id)},style:{padding:"4px 10px",borderRadius:6,border:active?"1px solid var(--accent-border)":"1px solid rgba(255,255,255,0.08)",background:active?"var(--accent-bg)":"transparent",color:active?"var(--accent)":"var(--text-dim)",fontSize:10,fontWeight:600,cursor:"pointer"},"aria-pressed":active?"true":"false"},ct.icon+" "+ct.label)})),
      h("div",{style:{display:"grid",gridTemplateColumns:"repeat("+Math.min(cardioType.fields.length,3)+", 1fr)",gap:8,marginBottom:10}},cardioType.fields.map(function(f){var fieldLabel=f.key==="speed"?speedLabel.toUpperCase():f.label;return h("div",{key:f.key},h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:4}},fieldLabel),f.type==="text"?h("input",{type:"text",value:data[f.key]||"",onChange:function(e){update(f.key,e.target.value)},placeholder:"...",className:"input input--text","aria-label":fieldLabel}):h("input",{type:"number",inputMode:f.type==="decimal"?"decimal":"numeric",value:data[f.key]||"",onChange:function(e){update(f.key,e.target.value)},className:"input","aria-label":fieldLabel}))})),
      h("button",{onClick:toggleDone,className:data.done?"btn btn--success-ghost btn--full":"btn btn--ghost btn--full"},data.done?"\u2713 Completed":"Mark Complete")));
}

/* ── Weekly Volume ── */
var MUSCLE_LABELS={chest:"Chest",back:"Back",quads:"Quads",hamstrings:"Hams",glutes:"Glutes",front_delt:"Front Delt",side_delt:"Side Delt",rear_delt:"Rear Delt",biceps:"Biceps",triceps:"Triceps",calves:"Calves",abs:"Abs"};

function calcWeeklyVolume(config,dayData){
  var vol={};
  /* Get Monday of current week */
  var now=new Date();var dow=now.getDay();
  var mon=new Date(now);mon.setDate(now.getDate()-((dow+6)%7));mon.setHours(0,0,0,0);
  var fmtD=function(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
  config.days.forEach(function(day){
    var allEx=day.exercises.concat(getCustomExercises(day.id));
    for(var d=0;d<7;d++){
      var check=new Date(mon);check.setDate(mon.getDate()+d);
      var dateStr=fmtD(check);
      /* Use context data for today, localStorage for other days */
      var saved=dateStr===getSessionDate()&&dayData?dayData.getData(day.id):loadDayData(day.id,dateStr);
      allEx.forEach(function(ex){var muscles=ex.muscles||[];var sets=saved.exercises&&saved.exercises[ex.id];var doneSets=sets?sets.filter(function(s){return s.done}).length:0;if(doneSets>0){muscles.forEach(function(m){if(!vol[m])vol[m]=0;vol[m]+=doneSets})}});
    }
  });
  return vol;
}

function calcMuscleFrequency(config){
  var freq={};
  config.days.forEach(function(day){var muscles={};day.exercises.concat(getCustomExercises(day.id)).forEach(function(ex){(ex.muscles||[]).forEach(function(m){muscles[m]=true})});Object.keys(muscles).forEach(function(m){if(!freq[m])freq[m]=0;freq[m]++})});
  return freq;
}

function VolumeDashboard(props){
  var onClose=props.onClose,config=props.config;var dayData=useDayData();
  var vol=useMemo(function(){return calcWeeklyVolume(config,dayData)},[config,dayData.rev]);
  var freq=useMemo(function(){return calcMuscleFrequency(config)},[config]);
  var targets=useMemo(function(){return getVolumeTargets()},[]);
  var muscleKeys=Object.keys(MUSCLE_LABELS);
  var maxSets=Math.max(20,Math.max.apply(null,muscleKeys.map(function(m){return vol[m]||0})));
  var se=useState(false),editing=se[0],setEditing=se[1];
  var ste=useState(targets),editTargets=ste[0],setEditTargets=ste[1];
  var saveTargets=function(){setVolumeTargets(editTargets);setEditing(false)};
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true"},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Weekly Volume"),
      h("div",{style:{display:"flex",gap:8}},h("button",{onClick:function(){setEditing(!editing)},className:"btn btn--ghost btn--xs"},editing?"Cancel":"Targets"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715"))),
    h("div",{style:{fontSize:11,color:"var(--text-dim)",marginBottom:14}},"Sets completed this week per muscle group."),
    muscleKeys.map(function(m){
      var sets=vol[m]||0;var target=targets[m]||[10,20];var pct=sets/maxSets;
      var color=sets===0?"var(--text-dim)":sets<target[0]?"var(--accent)":sets>target[1]?"var(--danger)":"var(--success)";
      var label=sets===0?"\u2014":sets<target[0]?"Low":sets>target[1]?"High":"Good";
      return h("div",{key:m,style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
        h("div",{style:{width:70,fontSize:11,fontWeight:600,color:"var(--text-secondary)",textAlign:"right",flexShrink:0}},MUSCLE_LABELS[m]),
        editing?h("div",{style:{display:"flex",gap:4,flex:1,alignItems:"center"}},
          h("input",{type:"number",inputMode:"numeric",value:editTargets[m]?editTargets[m][0]:"",onChange:function(e){var t=Object.assign({},editTargets);t[m]=[parseInt(e.target.value)||0,(t[m]||[10,20])[1]];setEditTargets(t)},className:"input",style:{width:40,fontSize:10,padding:"4px"}}),
          h("span",{style:{fontSize:9,color:"var(--text-dim)"}},"-"),
          h("input",{type:"number",inputMode:"numeric",value:editTargets[m]?editTargets[m][1]:"",onChange:function(e){var t=Object.assign({},editTargets);t[m]=[(t[m]||[10,20])[0],parseInt(e.target.value)||0];setEditTargets(t)},className:"input",style:{width:40,fontSize:10,padding:"4px"}})
        ):h("div",{className:"vol-bar"},
          h("div",{className:"vol-fill",style:{width:(pct*100)+"%",background:color,minWidth:sets>0?2:0}}),
          h("span",{style:{position:"absolute",right:4,top:0,lineHeight:"16px",fontSize:9,fontWeight:700,color:"var(--text-secondary)"}},sets>0?sets:"")),
        !editing?h("span",{style:{width:30,fontSize:9,fontWeight:700,color:color,textAlign:"left",flexShrink:0}},label):null,
        !editing&&freq[m]?h("span",{style:{width:28,fontSize:9,fontWeight:600,color:"var(--text-dim)",textAlign:"center",flexShrink:0}},"\u00D7"+freq[m]):null);
    }),
    editing?h("button",{onClick:saveTargets,className:"btn btn--accent btn--full",style:{marginTop:12}},"Save Targets"):null,
    /* Training Frequency Summary */
    !editing?h("div",{style:{marginTop:16,padding:"12px 14px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)"}},
      h("div",{style:{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:8}},"Weekly Frequency"),
      h("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
        muscleKeys.filter(function(m){return freq[m]}).map(function(m){
          var f=freq[m]||0;var color=f>=3?"var(--success)":f===2?"var(--accent)":"var(--text-dim)";
          return h("div",{key:m,style:{padding:"4px 8px",borderRadius:6,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",textAlign:"center"}},
            h("div",{style:{fontSize:13,fontWeight:800,color:color}},f+"\u00D7"),
            h("div",{style:{fontSize:9,color:"var(--text-dim)",fontWeight:600}},MUSCLE_LABELS[m]))})),
      h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:8,fontStyle:"italic"}},"Most muscles benefit from 2-3\u00D7/week training frequency.")):null,
    /* Week-over-week volume trend */
    !editing?function(){
      var prevVol=calcPreviousWeekVolume(config);
      if(!prevVol)return null;
      var anyDelta=muscleKeys.some(function(m){return(vol[m]||0)>0||(prevVol[m]||0)>0});
      if(!anyDelta)return null;
      return h("div",{style:{marginTop:16,padding:"12px 14px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)"}},
        h("div",{style:{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:8}},"Week-over-Week Trend"),
        muscleKeys.filter(function(m){return(vol[m]||0)>0||(prevVol[m]||0)>0}).map(function(m){
          var cur=vol[m]||0,prev=prevVol[m]||0;var delta=cur-prev;
          var color=delta>0?"var(--success)":delta<0?"var(--danger)":"var(--text-dim)";
          var arrow=delta>0?"\u2191":delta<0?"\u2193":"\u2192";
          return h("div",{key:m,style:{display:"flex",alignItems:"center",gap:8,marginBottom:4}},
            h("span",{style:{width:70,fontSize:11,fontWeight:600,color:"var(--text-secondary)",textAlign:"right",flexShrink:0}},MUSCLE_LABELS[m]),
            h("span",{style:{fontSize:11,fontWeight:700,color:"var(--text-dim)",width:24,textAlign:"center"}},cur),
            h("span",{style:{fontSize:10,color:color,fontWeight:700}},arrow+(delta!==0?" "+(delta>0?"+":"")+delta:"")),
            h("span",{style:{fontSize:10,color:"var(--text-dim)"}},prev>0?"(prev: "+prev+")":"(new)"))
        }));
    }():null));
}

function calcPreviousWeekVolume(config){
  /* Look at sessions from 7-14 days ago */
  var now=new Date();var weekAgo=new Date(now);weekAgo.setDate(weekAgo.getDate()-7);
  var twoWeeksAgo=new Date(now);twoWeeksAgo.setDate(twoWeeksAgo.getDate()-14);
  var fmtD=function(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
  var wStart=fmtD(twoWeeksAgo),wEnd=fmtD(weekAgo);
  var vol={};var found=false;
  config.days.forEach(function(day){
    var allEx=day.exercises.concat(getCustomExercises(day.id));
    if(!_historyBuilt)buildHistoryIndex();
    var entries=_historyIndex[day.id]||[];
    entries.forEach(function(e){
      if(e.date>=wStart&&e.date<wEnd){
        allEx.forEach(function(ex){
          var sets=e.data.exercises&&e.data.exercises[ex.id];
          var doneSets=sets?sets.filter(function(s){return s.done}).length:0;
          if(doneSets>0){found=true;(ex.muscles||[]).forEach(function(m){if(!vol[m])vol[m]=0;vol[m]+=doneSets})}
        });
      }
    });
  });
  return found?vol:null;
}

/* ── Deload Check ── */
function getDeloadWarning(config){
  var warnings=[];
  config.days.forEach(function(day){day.exercises.forEach(function(ex){
    var hist=getHistory(day.id,ex.id,10);var recentRpe=[];
    hist.slice(0,3).forEach(function(entry){var dd=loadDayData(day.id,entry.date);if(dd.rpe&&dd.rpe[ex.id])recentRpe.push(dd.rpe[ex.id])});
    if(recentRpe.length>=2){var avg=recentRpe.reduce(function(a,b){return a+b},0)/recentRpe.length;if(avg>=9&&warnings.indexOf(ex.name)===-1)warnings.push(ex.name)}
  })});
  return warnings.length>0?warnings:null;
}

/* ── Mesocycle & Periodization ── */
var MESO_WEEK_LABELS={1:"Accumulation (moderate load, higher reps)",2:"Intensification (heavier load, moderate reps)",3:"Peak (heavy load, lower reps)",4:"Deload (light load, recovery)"};
var MESO_REP_SHIFT={1:0,2:-1,3:-2,4:4};/* Shift to rep range: 0=normal, -1=lower target, -2=even lower, +4=higher for deload */
function getMesocycle(){return lsGet("mesocycle")||{week:1,startDate:today(),mode:"linear"}}
function setMesocycle(m){lsSet("mesocycle",m)}
function getMesoRepTarget(baseReps,week){
  var range=parseRepRange(baseReps);var shift=MESO_REP_SHIFT[week]||0;
  if(week===4){return{min:Math.max(1,range.min+2),max:range.max+4,label:"Deload: lighter, "+Math.max(1,range.min+2)+"-"+(range.max+4)+" reps"}}
  var newMin=Math.max(1,range.min+shift);var newMax=Math.max(newMin,range.max+shift);
  if(shift===0)return null;/* No change for week 1 */
  return{min:newMin,max:newMax,label:"Wk"+week+": "+newMin+"-"+newMax+" reps"};
}
function advanceMesoWeek(){var m=getMesocycle();m.week=m.week>=4?1:m.week+1;if(m.week===1)m.startDate=today();setMesocycle(m);return m}
function resetMesocycle(){var m={week:1,startDate:today()};setMesocycle(m);return m}

/* ── Body Metrics ── */
function BodyMetrics(props){
  var onClose=props.onClose;var unit=getUnit();var metricsKey="metrics_"+today();
  var s=useState(function(){return lsGet(metricsKey)||{bodyweight:"",waist:"",notes:"",arms:"",chest:"",quads:""}}),data=s[0],setData=s[1];
  var sm=useState(false),showMore=sm[0],setShowMore=sm[1];
  var save=function(d){setData(d);lsSet(metricsKey,d)};var update=function(field,val){save(Object.assign({},data,{[field]:val}))};
  var history=useMemo(function(){var results=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS+"metrics_")){var date=k.slice((LS+"metrics_").length);if(date===today())continue;try{var d=JSON.parse(localStorage.getItem(k));if(d&&(d.bodyweight||d.waist))results.push({date:date,bw:d.bodyweight,waist:d.waist})}catch(e){}}}results.sort(function(a,b){return b.date.localeCompare(a.date)});return results.slice(0,10)},[]);
  var wLabel=unit==="kg"?"BODYWEIGHT (kg)":"BODYWEIGHT (lbs)";var mLabel=unit==="kg"?"WAIST (cm)":"WAIST (inches)";var cmIn=unit==="kg"?"cm":"in";
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true"},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Body Metrics"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}},
      h("div",null,h("label",{style:{fontSize:11,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:6}},wLabel),h("input",{type:"number",inputMode:"decimal",value:data.bodyweight,onChange:function(e){update("bodyweight",e.target.value)},placeholder:unit==="kg"?"63":"140",className:"input input--lg","aria-label":"Bodyweight"})),
      h("div",null,h("label",{style:{fontSize:11,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:6}},mLabel),h("input",{type:"number",inputMode:"decimal",value:data.waist,onChange:function(e){update("waist",e.target.value)},placeholder:unit==="kg"?"81":"32",className:"input input--lg","aria-label":"Waist"}))),
    h("button",{onClick:function(){setShowMore(!showMore)},style:{fontSize:11,fontWeight:600,color:"var(--info)",background:"none",border:"none",cursor:"pointer",padding:"4px 0",marginBottom:8},"aria-expanded":showMore?"true":"false"},showMore?"\u25BE Hide measurements":"\u25B8 More measurements"),
    showMore?h("div",{className:"fade-in",style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}},
      ["arms","chest","quads"].map(function(key){return h("div",{key:key},h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:4}},key.toUpperCase()+" ("+cmIn+")"),h("input",{type:"number",inputMode:"decimal",value:data[key]||"",onChange:function(e){update(key,e.target.value)},className:"input input--lg","aria-label":key}))})):null,
    h("div",{style:{marginBottom:12}},h("label",{style:{fontSize:11,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:6}},"NOTES"),h("input",{type:"text",value:data.notes||"",onChange:function(e){update("notes",e.target.value)},placeholder:"Sleep, energy, etc.",className:"input input--text input--lg"})),
    /* Body Composition Trend Chart */
    history.length>=2?h("div",{style:{marginTop:8,marginBottom:8}},
      h("div",{style:{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:8}},"Trend"),
      (function(){
        var pts=history.slice().reverse();if(data.bodyweight)pts.push({date:today(),bw:data.bodyweight,waist:data.waist});
        var bwVals=pts.filter(function(p){return p.bw}).map(function(p){return parseFloat(p.bw)});
        var waistVals=pts.filter(function(p){return p.waist}).map(function(p){return parseFloat(p.waist)});
        if(bwVals.length<2)return null;
        var W=280,H=70,pad=4;
        var allVals=bwVals.concat(waistVals.length>=2?waistVals:[]);
        var mn=Math.min.apply(null,allVals),mx=Math.max.apply(null,allVals);var range=mx-mn||1;
        var toPath=function(vals){return vals.map(function(v,i){return(pad+i*(W-2*pad)/(vals.length-1))+","+(pad+(1-(v-mn)/range)*(H-2*pad))}).join(" ")};
        var bwDelta=bwVals.length>=2?bwVals[bwVals.length-1]-bwVals[0]:0;
        var bwColor=bwDelta>0?"var(--accent)":bwDelta<0?"var(--info)":"var(--text-dim)";
        return h("div",{style:{padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)"}},
          h("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:4}},
            h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)"}},"Body Composition"),
            h("span",{style:{fontSize:10,fontWeight:700,color:bwColor}},(bwDelta>0?"+":"")+bwDelta.toFixed(1)+" "+unit)),
          h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none","aria-hidden":"true"},
            h("polyline",{points:toPath(bwVals),fill:"none",stroke:"var(--accent)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"}),
            waistVals.length>=2?h("polyline",{points:toPath(waistVals),fill:"none",stroke:"var(--info)",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round",strokeDasharray:"4,3"}):null),
          h("div",{style:{display:"flex",gap:12,marginTop:4}},
            h("span",{style:{fontSize:9,color:"var(--accent)",fontWeight:600}},"\u25CF Weight"),
            waistVals.length>=2?h("span",{style:{fontSize:9,color:"var(--info)",fontWeight:600}},"\u25CF Waist"):null));
      })()):null,
    history.length>0?h("div",{style:{marginTop:4}},h("div",{style:{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:8}},"Recent Entries"),h("div",{style:{maxHeight:200,overflowY:"auto"}},history.map(function(entry){var d=new Date(entry.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});return h("div",{key:entry.date,style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:12}},h("span",{style:{color:"var(--text-dim)",fontWeight:600}},label),h("div",{style:{display:"flex",gap:12}},entry.bw?h("span",{style:{color:"var(--text-primary)"}},entry.bw+" "+unit):null,entry.waist?h("span",{style:{color:"var(--text-secondary)"}},entry.waist+(unit==="kg"?" cm":'"')):null))}))):null));
}

/* ── Completion Summary ── */
function calcSessionStats(day,customs){
  var allEx=day.exercises.concat(customs||[]);var saved=loadDayData(day.id);var totalVolume=0,totalSets=0,prs=[],rpeValues=[];
  allEx.forEach(function(ex){var sets=saved.exercises&&saved.exercises[ex.id];if(!sets)return;sets.forEach(function(s){if(s.done&&s.weight&&s.reps){totalVolume+=parseFloat(s.weight)*parseInt(s.reps);totalSets++}});if(saved.rpe&&saved.rpe[ex.id])rpeValues.push(saved.rpe[ex.id]);var maxW=0;if(sets)sets.forEach(function(s){if(s.done&&s.weight){var w=parseFloat(s.weight);if(w>maxW)maxW=w}});if(maxW>0){var hist=getHistory(day.id,ex.id,10);var hMax=0;hist.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight){var w=parseFloat(s.weight);if(w>hMax)hMax=w}})});if(maxW>hMax&&hMax>0)prs.push({name:ex.name,weight:maxW,prev:hMax})}});
  var dur=getSessionStart()?Math.floor((Date.now()-getSessionStart())/1000):0;var avgRpe=rpeValues.length>0?rpeValues.reduce(function(a,b){return a+b},0)/rpeValues.length:null;var cardio=lsGet("cardio_"+day.id+"_"+getSessionDate());
  return{totalVolume:totalVolume,totalSets:totalSets,prs:prs,duration:dur,avgRpe:avgRpe,cardio:cardio&&cardio.done};
}

function CompletionSummary(props){
  var day=props.day,onClose=props.onClose,customs=props.customs;var unit=getUnit();
  var stats=useMemo(function(){return calcSessionStats(day,customs)},[day,customs]);
  useEffect(function(){saveSessionSummary(day,customs)},[]);
  var shareText=useMemo(function(){return generateShareText(day,stats,unit)},[day,stats,unit]);
  var handleShare=function(){if(navigator.share){navigator.share({text:shareText}).catch(function(){})}else{navigator.clipboard.writeText(shareText).then(function(){showUndoToast("Copied to clipboard!",null,2000)})}};
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true"},
    h("div",{className:"sheet celebrate"},
      h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
        h("div",{style:{display:"flex",alignItems:"center",gap:8}},
          h("span",{style:{fontSize:24},"aria-hidden":"true"},"\uD83C\uDFC6"),
          h("div",null,
            h("h2",{style:{fontSize:18,fontWeight:800,color:"var(--success)",margin:0}},"Workout Complete!"),
            h("p",{style:{fontSize:12,color:"var(--text-dim)",margin:0}},day.title))),
        h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close summary"},"\u2715")),
      h("div",{className:"completion__stats",style:{marginBottom:12}},
        h("div",{className:"dash-card"},h("div",{className:"dash-card__value"},Math.round(stats.totalVolume).toLocaleString()),h("div",{className:"dash-card__label"},"Volume ("+unit+")")),
        h("div",{className:"dash-card"},h("div",{className:"dash-card__value"},fmtElapsed(stats.duration)),h("div",{className:"dash-card__label"},"Duration")),
        h("div",{className:"dash-card"},h("div",{className:"dash-card__value",style:{color:stats.prs.length>0?"var(--accent)":"var(--text-bright)"}},stats.prs.length),h("div",{className:"dash-card__label"},"New PRs")),
        h("div",{className:"dash-card"},h("div",{className:"dash-card__value",style:{color:stats.avgRpe?stats.avgRpe>=9?"var(--danger)":stats.avgRpe>=8?"var(--accent)":"var(--success)":"var(--text-dim)"}},stats.avgRpe?stats.avgRpe.toFixed(1):"\u2014"),h("div",{className:"dash-card__label"},"Avg RPE")),
        stats.cardio?h("div",{className:"dash-card",style:{gridColumn:"1 / -1",background:"var(--success-bg)",border:"1px solid var(--success-border)",textAlign:"center"}},h("span",{style:{fontSize:13,fontWeight:700,color:"var(--success)"}},"\u2713 Cardio completed")):null),
      stats.prs.length>0?h("div",{style:{marginBottom:12}},h("div",{style:{fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:6}},"\uD83D\uDD25 New Personal Records"),stats.prs.map(function(pr){return h("div",{key:pr.name,style:{fontSize:12,color:"var(--text-primary)",padding:"3px 0"}},pr.name+": "+pr.weight+" "+unit+" (prev: "+pr.prev+")")})):null,
      h("div",{style:{display:"flex",gap:8}},
        h("button",{onClick:handleShare,className:"btn btn--info",style:{flex:1}},"\uD83D\uDCE4 Share"),
        h("button",{onClick:function(){exportData();showUndoToast("Backup exported!",null,2000)},className:"btn btn--accent-ghost",style:{flex:1}},"\uD83D\uDCBE Backup"),
        h("button",{onClick:onClose,className:"btn btn--success",style:{flex:1}},"Done"))));
}

/* ── Session History ── */
function saveSessionSummary(day,customs){
  var stats=calcSessionStats(day,customs);var key="session_history";var hist=lsGet(key)||[];
  var sd=getSessionDate();
  if(hist.length>0&&hist[0].date===sd&&hist[0].dayId===day.id)return;
  var sessionRpe=lsGet("sessionRpe_"+day.id+"_"+sd);
  hist.unshift({date:sd,dayId:day.id,dayTitle:day.title,volume:Math.round(stats.totalVolume),sets:stats.totalSets,duration:stats.duration,prs:stats.prs.length,avgRpe:stats.avgRpe?parseFloat(stats.avgRpe.toFixed(1)):null,sessionRpe:sessionRpe||null,cardio:!!stats.cardio});
  if(hist.length>50)hist=hist.slice(0,50);lsSet(key,hist);
}

function SessionHistory(props){
  var onClose=props.onClose;var unit=getUnit();
  var hist=useMemo(function(){return lsGet("session_history")||[]},[]);
  var sc=useState(null),compareIdx=sc[0],setCompareIdx=sc[1];

  /* Build comparison view for same-day sessions */
  var compareView=null;
  if(compareIdx!==null&&hist[compareIdx]){
    var target=hist[compareIdx];
    var prev=null;
    for(var ci=compareIdx+1;ci<hist.length;ci++){if(hist[ci].dayId===target.dayId){prev=hist[ci];break}}
    if(prev){
      var volDelta=target.volume-prev.volume;var setsDelta=target.sets-prev.sets;
      var rpeDelta=target.avgRpe&&prev.avgRpe?(target.avgRpe-prev.avgRpe):null;
      var durDelta=target.duration&&prev.duration?(target.duration-prev.duration):null;
      var fmtDelta=function(v,suffix){return v>0?h("span",{style:{color:"var(--success)"}},"+"+v+suffix):v<0?h("span",{style:{color:"var(--danger)"}},v+suffix):h("span",{style:{color:"var(--text-dim)"}},"0"+suffix)};
      compareView=h("div",{className:"fade-in",style:{background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:10,padding:"12px 14px",marginBottom:12}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}},
          h("span",{style:{fontSize:12,fontWeight:700,color:"var(--info)"}},"Session Comparison"),
          h("button",{onClick:function(){setCompareIdx(null)},className:"btn btn--ghost btn--xs"},"Close")),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,fontSize:11}},
          h("div",{style:{textAlign:"center"}},
            h("div",{style:{fontWeight:700,color:"var(--text-bright)",marginBottom:4}},new Date(target.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),
            h("div",{style:{color:"var(--text-secondary)"}},target.volume+" "+unit),
            h("div",{style:{color:"var(--text-secondary)"}},target.sets+" sets"),
            target.avgRpe?h("div",{style:{color:"var(--text-secondary)"}},"RPE "+target.avgRpe):null),
          h("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"0 8px",borderLeft:"1px solid var(--border)",borderRight:"1px solid var(--border)"}},
            h("div",{style:{fontSize:10,color:"var(--text-dim)",fontWeight:600}},"\u0394"),
            fmtDelta(volDelta," "+unit),
            fmtDelta(setsDelta," sets"),
            rpeDelta!==null?fmtDelta(parseFloat(rpeDelta.toFixed(1))," RPE"):null,
            durDelta!==null?fmtDelta(Math.round(durDelta/60),"m"):null),
          h("div",{style:{textAlign:"center"}},
            h("div",{style:{fontWeight:700,color:"var(--text-bright)",marginBottom:4}},new Date(prev.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),
            h("div",{style:{color:"var(--text-secondary)"}},prev.volume+" "+unit),
            h("div",{style:{color:"var(--text-secondary)"}},prev.sets+" sets"),
            prev.avgRpe?h("div",{style:{color:"var(--text-secondary)"}},"RPE "+prev.avgRpe):null)));
    }else{compareView=h("div",{style:{fontSize:11,color:"var(--text-dim)",padding:"8px 0",fontStyle:"italic"}},"No previous session of this workout found to compare.")}
  }

  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true"},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Session History"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    compareView,
    hist.length===0?h("div",{className:"empty-state"},h("div",{className:"empty-state__icon"},"\uD83D\uDCCB"),h("div",{className:"empty-state__title"},"No sessions yet"),h("div",{className:"empty-state__desc"},"Complete a workout to see it here.")):
    h("div",{style:{maxHeight:"60vh",overflowY:"auto"}},hist.map(function(s,i){
      var d=new Date(s.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
      return h("div",{key:i,style:{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
          h("span",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)"}},s.dayTitle||s.dayId),
          h("div",{style:{display:"flex",alignItems:"center",gap:6}},
            h("button",{onClick:function(){setCompareIdx(compareIdx===i?null:i)},className:"btn btn--info btn--xs",style:{opacity:compareIdx===i?1:0.6},"aria-label":"Compare this session"},"Compare"),
            h("span",{style:{fontSize:11,color:"var(--text-dim)"}},label))),
        h("div",{style:{display:"flex",gap:12,flexWrap:"wrap"}},
          h("span",{style:{fontSize:11,color:"var(--text-secondary)"}},Math.round(s.volume).toLocaleString()+" "+unit+" vol"),
          h("span",{style:{fontSize:11,color:"var(--text-secondary)"}},s.sets+" sets"),
          s.duration?h("span",{style:{fontSize:11,color:"var(--text-secondary)"}},fmtElapsed(s.duration)):null,
          s.avgRpe?h("span",{style:{fontSize:11,color:s.avgRpe>=9?"var(--danger)":s.avgRpe>=8?"var(--accent)":"var(--success)"}},"RPE "+s.avgRpe):null,
          s.prs>0?h("span",{style:{fontSize:11,color:"var(--accent)",fontWeight:700}},s.prs+" PR"+(s.prs>1?"s":"")):null,
          s.cardio?h("span",{style:{fontSize:11,color:"var(--success)"}},"+ Cardio"):null))}))));
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
        var todayData=loadDayData(day.id);var todaySets=todayData.exercises&&todayData.exercises[ex.id];
        var allSessions=hist.slice();if(todaySets)allSessions.unshift({date:today(),sets:todaySets});
        allSessions.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var w=parseFloat(s.weight),r=parseInt(s.reps),e=calc1RM(w,r);if(e>bestE1rm){bestE1rm=e;bestW=w;bestReps=r;bestDate=entry.date}}})});
        if(bestW>0)recs.push({name:ex.name,weight:bestW,reps:bestReps,date:bestDate,e1rm:bestE1rm,unit:exUnit,muscles:ex.muscles||[]});
      });
    });
    recs.sort(function(a,b){return b.e1rm-a.e1rm});return recs;
  },[config]);
  var grouped=useMemo(function(){var g={};records.forEach(function(r){var key=r.muscles.length>0?r.muscles[0]:"other";if(!g[key])g[key]=[];g[key].push(r)});return g},[records]);
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true"},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Personal Records"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    records.length===0?h("div",{className:"empty-state"},h("div",{className:"empty-state__icon"},"\uD83C\uDFC6"),h("div",{className:"empty-state__title"},"No records yet"),h("div",{className:"empty-state__desc"},"Complete sets to see PRs.")):
    h("div",{style:{maxHeight:"65vh",overflowY:"auto"}},Object.keys(grouped).map(function(muscle){
      return h("div",{key:muscle,style:{marginBottom:16}},
        h("div",{style:{fontSize:11,fontWeight:700,color:"var(--accent)",letterSpacing:.5,marginBottom:6}},(MUSCLE_LABELS[muscle]||muscle).toUpperCase()),
        grouped[muscle].map(function(r,i){
          var d=new Date(r.date+"T12:00:00");var label=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
          return h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
            h("div",null,h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)"}},r.name),h("div",{style:{fontSize:11,color:"var(--text-dim)"}},label)),
            h("div",{style:{textAlign:"right"}},h("div",{style:{fontSize:15,fontWeight:800,color:"var(--text-bright)"}},r.weight+" "+r.unit+" \u00D7 "+r.reps),h("div",{style:{fontSize:10,fontWeight:600,color:"var(--info)"}},"e1RM "+r.e1rm+" "+r.unit)));
        }));
    }))));
}

/* ── Add Custom Exercise Form ── */
function AddExerciseForm(props){
  var dayId=props.dayId,onAdd=props.onAdd,onCancel=props.onCancel;var defUnit=getUnit();
  var s=useState({name:"",sets:"3",reps:"10-12",rest:"60",machine:false,unit:defUnit}),form=s[0],setForm=s[1];
  var upd=function(f,v){setForm(Object.assign({},form,{[f]:v}))};
  var submit=function(){if(!form.name.trim())return;var ex={id:"cx_"+Date.now(),name:form.name.trim(),sets:parseInt(form.sets)||3,reps:form.reps||"10",rest:parseInt(form.rest)||60,machine:form.machine,notes:"Custom exercise",tip:"",increment:form.unit==="kg"?2.5:5,custom:true};addCustomExercise(dayId,ex);setExUnit(ex.id,form.unit);onAdd()};
  return h("div",{className:"fade-in",style:{background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:14,padding:"14px",marginBottom:8},"aria-label":"Add custom exercise form"},
    h("div",{style:{fontSize:13,fontWeight:700,color:"var(--info)",marginBottom:10}},"Add Exercise"),
    h("input",{type:"text",placeholder:"Exercise name",value:form.name,onChange:function(e){upd("name",e.target.value)},className:"input",style:{marginBottom:8,textAlign:"left"},"aria-label":"Exercise name"}),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}},
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"SETS"),h("input",{type:"number",inputMode:"numeric",value:form.sets,onChange:function(e){upd("sets",e.target.value)},className:"input","aria-label":"Sets"})),
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"REPS"),h("input",{type:"text",value:form.reps,onChange:function(e){upd("reps",e.target.value)},className:"input","aria-label":"Reps"})),
      h("div",null,h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:3}},"REST (s)"),h("input",{type:"number",inputMode:"numeric",value:form.rest,onChange:function(e){upd("rest",e.target.value)},className:"input","aria-label":"Rest seconds"}))),
    h("div",{style:{display:"flex",gap:8,marginBottom:10}},
      h("button",{onClick:function(){upd("machine",!form.machine)},className:form.machine?"btn btn--accent-ghost btn--sm":"btn btn--ghost btn--sm",style:{flex:1},"aria-pressed":form.machine?"true":"false"},form.machine?"Machine \u2713":"Machine"),
      h("button",{onClick:function(){upd("unit",form.unit==="lbs"?"kg":"lbs")},className:"btn btn--accent-ghost btn--sm",style:{flex:1}},form.unit.toUpperCase())),
    h("div",{style:{display:"flex",gap:8}},
      h("button",{onClick:onCancel,className:"btn btn--ghost",style:{flex:1}},"Cancel"),
      h("button",{onClick:submit,className:"btn btn--info",style:{flex:1,opacity:form.name.trim()?1:0.4}},"Add")));
}

/* ── Session RPE ── */
function SessionRPE(props){
  var dayId=props.dayId;
  var s=useState(function(){return lsGet("sessionRpe_"+dayId+"_"+getSessionDate())}),rpe=s[0],setRpe=s[1];
  var save=function(val){setRpe(val);lsSet("sessionRpe_"+dayId+"_"+getSessionDate(),val)};
  var labels={6:"Easy",7:"Moderate",8:"Hard",9:"Very Hard",10:"Max"};var colors={6:"var(--success)",7:"#84cc16",8:"var(--accent)",9:"#f97316",10:"var(--danger)"};
  return h("div",{className:"fade-in",style:{background:"var(--success-bg)",border:"1px solid var(--success-border)",borderRadius:12,padding:"14px 16px",marginTop:12},"aria-label":"Session RPE rating"},
    h("div",{style:{fontSize:13,fontWeight:700,color:"var(--success)",marginBottom:8}},"Session RPE \u2014 How was the overall workout?"),
    h("div",{style:{display:"flex",gap:4},role:"radiogroup"},[6,7,8,9,10].map(function(val){var active=rpe===val;return h("button",{key:val,onClick:function(){save(val)},className:"rpe-btn",style:{border:active?"2px solid "+colors[val]:"1px solid rgba(255,255,255,0.08)",background:active?"rgba(255,255,255,0.06)":"transparent"},role:"radio","aria-checked":active?"true":"false"},h("div",{style:{fontSize:16,fontWeight:800,color:active?colors[val]:"var(--text-dim)"}},val),h("div",{style:{fontSize:8,fontWeight:600,color:active?"var(--text-secondary)":"var(--text-dim)",marginTop:1}},labels[val]))})),
    rpe?h("div",{style:{fontSize:11,color:"var(--text-secondary)",marginTop:6,fontStyle:"italic"},"aria-live":"polite"},rpe<=7?"Recovered well \u2014 room to push harder.":rpe===8?"Solid session \u2014 sustainable load.":rpe===9?"High fatigue \u2014 watch recovery.":"Maximum effort \u2014 consider lighter session next."):null);
}

/* ── Session Timer ── */
function SessionTimer(props){
  var onRefresh=props.onRefresh;
  var s=useState(0),elapsed=s[0],setElapsed=s[1];var sm=useState(false),showMenu=sm[0],setShowMenu=sm[1];
  var started=getSessionStart();
  useEffect(function(){if(!started)return;var tick=function(){setElapsed(Math.floor((Date.now()-started)/1000))};tick();var id=setInterval(tick,1000);return function(){clearInterval(id)}},[started]);
  if(!started)return h("span",{style:{fontSize:11,color:"var(--text-dim)"}},"Not started");
  return h("div",{style:{position:"relative",display:"inline-flex",alignItems:"center"}},
    h("span",{onClick:function(){setShowMenu(!showMenu)},style:{fontSize:12,fontWeight:700,color:"var(--accent)",fontVariantNumeric:"tabular-nums",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},"aria-label":"Session duration: "+fmtElapsed(elapsed)},fmtElapsed(elapsed),h("span",{style:{fontSize:8,color:"var(--text-dim)"}},"\u25BE")),
    showMenu?h("div",{style:{position:"absolute",top:"100%",right:0,marginTop:4,background:"var(--surface-hover)",border:"1px solid var(--border-light)",borderRadius:10,padding:6,zIndex:300,display:"flex",flexDirection:"column",gap:4,minWidth:120}},
      h("button",{onClick:function(){restartSession();setElapsed(0);setShowMenu(false);if(onRefresh)onRefresh()},className:"btn btn--accent-ghost btn--sm",style:{textAlign:"left"}},"Restart Timer"),
      h("button",{onClick:function(){showConfirm({title:"End Session",msg:"End this session and stop the timer?",confirmLabel:"End",danger:true,onConfirm:function(){endSession();setElapsed(0);setShowMenu(false);if(onRefresh)onRefresh()}})},className:"btn btn--sm",style:{background:"var(--danger-bg)",color:"var(--danger)",border:"1px solid var(--danger-border)",textAlign:"left"}},"End Session")):null);
}

/* ── Readiness Check ── */
function ReadinessCheck(props){
  var dayId=props.dayId,onDismiss=props.onDismiss;
  var s=useState(function(){return getReadiness(dayId)||{}}),data=s[0],setData=s[1];
  var fields=[
    {key:"sleep",label:"Sleep Quality",icon:"\uD83D\uDE34",low:"Poor",high:"Great"},
    {key:"soreness",label:"Muscle Soreness",icon:"\uD83E\uDDB5",low:"Very Sore",high:"None"},
    {key:"energy",label:"Energy Level",icon:"\u26A1",low:"Drained",high:"Energized"},
    {key:"stress",label:"Stress",icon:"\uD83E\uDDE0",low:"High Stress",high:"Relaxed"}
  ];
  var save=function(key,val){var next=Object.assign({},data);next[key]=val;setData(next);saveReadiness(dayId,next)};
  var avg=0,count=0;fields.forEach(function(f){if(data[f.key]){avg+=data[f.key];count++}});
  avg=count>0?avg/count:0;
  var readinessLabel=avg>=4?"Great":avg>=3?"Good":avg>=2?"Fair":"Low";
  var readinessColor=avg>=4?"var(--success)":avg>=3?"var(--accent)":avg>=2?"#f97316":"var(--danger)";
  var allFilled=fields.every(function(f){return data[f.key]});
  return h("div",{className:"card fade-in",style:{background:"rgba(129,140,248,0.04)",border:"1px solid rgba(129,140,248,0.15)",marginBottom:12},"aria-label":"Pre-session readiness check"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
      h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)"}},"How are you feeling?"),
      allFilled?h("span",{style:{fontSize:12,fontWeight:700,color:readinessColor}},readinessLabel+" ("+avg.toFixed(1)+"/5)"):null),
    fields.map(function(f){
      return h("div",{key:f.key,style:{marginBottom:8}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}},
          h("span",{style:{fontSize:11,fontWeight:600,color:"var(--text-secondary)"}},f.icon+" "+f.label),
          h("span",{style:{fontSize:10,color:"var(--text-dim)"}},f.low+" \u2190 \u2192 "+f.high)),
        h("div",{style:{display:"flex",gap:4},role:"radiogroup","aria-label":f.label},
          [1,2,3,4,5].map(function(val){
            var active=data[f.key]===val;
            var color=val<=2?"var(--danger)":val===3?"var(--accent)":"var(--success)";
            return h("button",{key:val,onClick:function(){save(f.key,val)},style:{flex:1,padding:"6px 0",borderRadius:7,border:active?"1px solid "+color:"1px solid rgba(255,255,255,0.08)",background:active?"rgba(255,255,255,0.06)":"transparent",color:active?color:"var(--text-dim)",fontSize:13,fontWeight:700,cursor:"pointer"},role:"radio","aria-checked":active?"true":"false","aria-label":f.label+" "+val+" of 5"},val)})));
    }),
    allFilled?h("div",{style:{marginTop:8}},
      function(){
        var adj=calcReadinessAdj(data);
        if(!adj)return h("div",null,
          h("div",{style:{fontSize:11,color:"var(--success)",background:"var(--success-bg)",borderRadius:8,padding:"8px 10px"}},"High readiness. Great day to push hard and chase PRs!"),
          h("button",{onClick:onDismiss,className:"btn btn--ghost btn--sm",style:{marginTop:6,width:"100%"}},"Dismiss"));
        var applied=getReadinessAdj(dayId);
        return h("div",null,
          h("div",{style:{fontSize:11,color:adj.level==="low"?"var(--danger)":"var(--accent)",background:adj.level==="low"?"var(--danger-bg)":"var(--accent-bg)",borderRadius:8,padding:"8px 10px",marginBottom:6}},adj.label),
          !applied?h("div",{style:{display:"flex",gap:6}},
            h("button",{onClick:function(){saveReadinessAdj(dayId,adj);onDismiss()},className:"btn btn--accent btn--sm",style:{flex:1}},"Apply Adjustment"),
            h("button",{onClick:onDismiss,className:"btn btn--ghost btn--sm",style:{flex:1}},"Train Normal")):
          h("div",null,
            h("div",{style:{fontSize:10,color:"var(--success)",fontWeight:600}},"\u2713 Adjustment applied"),
            h("button",{onClick:onDismiss,className:"btn btn--ghost btn--sm",style:{marginTop:6,width:"100%"}},"Dismiss")));
      }()):null);
}

/* ── Deload Options Panel ── */
function DeloadOptions(props){
  var onSelect=props.onSelect;
  var s=useState(function(){return getActiveDeload()}),active=s[0],setActive=s[1];
  var select=function(stratId){setActiveDeload(stratId);setActive(stratId);showUndoToast(DELOAD_STRATEGIES.find(function(d){return d.id===stratId}).label+" applied to all exercises",function(){clearActiveDeload();setActive(null)});if(onSelect)onSelect()};
  var clear=function(){clearActiveDeload();setActive(null);showUndoToast("Deload strategy cleared",null,3000);if(onSelect)onSelect()};
  return h("div",{style:{background:"var(--danger-bg)",border:"1px solid var(--danger-border)",borderRadius:10,padding:"12px 14px",marginBottom:10}},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}},
      h("div",{style:{fontSize:12,fontWeight:700,color:"var(--danger)"}},"\u26A0 Deload Week \u2014 Choose Your Strategy"),
      active?h("button",{onClick:clear,className:"btn btn--ghost btn--xs"},"Clear"):null),
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}},
      DELOAD_STRATEGIES.map(function(strat){
        var isActive=active===strat.id;
        return h("button",{key:strat.id,onClick:function(){select(strat.id)},style:{padding:"10px 8px",borderRadius:8,border:isActive?"2px solid var(--danger)":"1px solid var(--danger-border)",background:isActive?"rgba(239,68,68,0.1)":"rgba(239,68,68,0.04)",cursor:"pointer",textAlign:"left"},"aria-label":strat.label,"aria-pressed":isActive?"true":"false"},
          h("div",{style:{fontSize:14,marginBottom:2}},strat.icon),
          h("div",{style:{fontSize:11,fontWeight:700,color:isActive?"var(--danger)":"var(--text-bright)"}},strat.label,isActive?" \u2713":""),
          h("div",{style:{fontSize:9,color:"var(--text-dim)",marginTop:2,lineHeight:1.3}},strat.desc))})));
}

/* ── Tempo Timer ── */
function TempoTimer(props){
  var tempo=props.tempo;
  if(!tempo)return null;
  var parts=tempo.split("-").map(function(p){return parseInt(p)||0});
  if(parts.length<3)return null;
  var labels=["Eccentric","Pause","Concentric"];
  var s=useState(false),running=s[0],setRunning=s[1];
  var sp=useState(0),phase=sp[0],setPhase=sp[1];
  var sc=useState(parts[0]),count=sc[0],setCount=sc[1];
  var intervalRef=useRef(null);
  var stop=function(){if(intervalRef.current)clearInterval(intervalRef.current);setRunning(false);setPhase(0);setCount(parts[0])};
  var start=function(){
    setRunning(true);setPhase(0);setCount(parts[0]);
    if(intervalRef.current)clearInterval(intervalRef.current);
    var ph=0,ct=parts[0];
    intervalRef.current=setInterval(function(){
      ct--;
      if(ct<=0){
        ph++;
        if(ph>=parts.length){stop();return}
        ct=parts[ph];
        setPhase(ph);
      }
      setCount(ct);
    },1000);
  };
  useEffect(function(){return function(){if(intervalRef.current)clearInterval(intervalRef.current)}},[]);
  var phaseColors=["var(--danger)","var(--accent)","var(--success)"];
  return h("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}},
    h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)"}},"Tempo "+tempo),
    running?h("div",{style:{display:"flex",alignItems:"center",gap:6}},
      h("span",{style:{fontSize:14,fontWeight:800,color:phaseColors[phase]||"var(--text-primary)",fontVariantNumeric:"tabular-nums",minWidth:18,textAlign:"center"}},count),
      h("span",{style:{fontSize:10,fontWeight:600,color:phaseColors[phase]||"var(--text-dim)"}},labels[phase]||""),
      h("button",{onClick:stop,className:"btn btn--danger btn--xs"},"Stop")):
    h("button",{onClick:start,className:"btn btn--accent-ghost btn--xs"},"Start Tempo"));
}

/* ── Day View ── */
function DayView(props){
  var day=props.day,refresh=props.refresh,config=props.config;
  var dayData=useDayData();
  var s5=useState(false),showComplete=s5[0],setShowComplete=s5[1];
  var s8=useState(false),showAddForm=s8[0],setShowAddForm=s8[1];
  var sc=useState(function(){return getCustomExercises(day.id)}),customs=sc[0],setCustoms=sc[1];
  var sw=useState(0),swapRev=sw[0],bumpSwapRev=sw[1];
  var swappedExercises=useMemo(function(){return applySwaps(day.exercises,day.id)},[day,swapRev]);
  var allExercises=swappedExercises.concat(customs);
  var handleSwap=useCallback(function(origId,altName){
    showConfirm({title:"Swap Exercise",msg:"Replace with "+altName+" for this session? Your logged sets will stay.",confirmLabel:"Swap",onConfirm:function(){saveSwap(day.id,origId,altName);bumpSwapRev(function(r){return r+1});refresh()}});
  },[day.id,refresh]);
  var saved=dayData.getData(day.id);var totalSets=allExercises.reduce(function(a,e){return a+e.sets},0);
  var doneSets=allExercises.reduce(function(a,e){var d=saved.exercises&&saved.exercises[e.id];return a+(d?d.filter(function(s){return s.done}).length:0)},0);
  var pct=totalSets>0?doneSets/totalSets:0;var allComplete=doneSets===totalSets&&totalSets>0;
  var nextExIdx=-1;
  for(var ni=0;ni<allExercises.length;ni++){var exSkip=saved._skipped&&saved._skipped[allExercises[ni].id];if(exSkip)continue;var exD=saved.exercises&&saved.exercises[allExercises[ni].id];var exDone=exD?exD.filter(function(s){return s.done}).length:0;if(exDone<allExercises[ni].sets){nextExIdx=ni;break}}
  var removeCustom=function(exId){var next=removeCustomExercise(day.id,exId);setCustoms(next);refresh()};
  var deloadWarnings=useMemo(function(){return config?getDeloadWarning(config):null},[config]);
  var meso=getMesocycle();var isDeloadWeek=meso.week===4;
  var srd=useState(function(){return !!getReadiness(day.id)}),readinessDone=srd[0],setReadinessDone=srd[1];
  /* Completion summary shown on demand via "View Summary" button */
  return h("div",{style:{paddingBottom:40}},
    h("div",{style:{marginBottom:14}},
      h("h2",{style:{fontSize:18,fontWeight:800,margin:0,color:"var(--text-bright)",letterSpacing:-.3}},day.title),
      h("p",{style:{fontSize:12,color:"var(--text-dim)",margin:"3px 0 0",fontStyle:"italic"}},day.subtitle),
      h("div",{style:{marginTop:10,display:"flex",alignItems:"center",gap:10},"aria-label":"Workout progress"},
        h("div",{className:"progress"},h("div",{className:"progress-fill",style:{width:(pct*100)+"%",background:pct>=1?"var(--success)":"var(--accent)"}})),
        h("span",{style:{fontSize:11,fontWeight:700,color:pct>=1?"var(--success)":"var(--text-secondary)",fontVariantNumeric:"tabular-nums",flexShrink:0}},doneSets+"/"+totalSets+" sets"),
        allComplete?h("button",{onClick:function(){setShowComplete(true)},className:"btn btn--success btn--sm",style:{animation:"celebrate 0.4s ease"}},"View Summary"):null)),
    /* Readiness check - show before first set */
    doneSets===0&&!readinessDone&&getPref("showWellness",false)?h(ReadinessCheck,{dayId:day.id,onDismiss:function(){setReadinessDone(true)}}):null,
    doneSets===0&&!lsGet("onboarded")?h("div",{style:{background:"var(--accent-bg)",border:"1px solid var(--accent-border)",borderRadius:12,padding:"14px 16px",marginBottom:12,textAlign:"center"}},
      h("div",{style:{fontSize:24,marginBottom:6},"aria-hidden":"true"},"\uD83D\uDC4B"),
      h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)",marginBottom:6}},"Welcome to your workout!"),
      h("div",{style:{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7,textAlign:"left",maxWidth:280,margin:"0 auto"}},
        h("div",{style:{marginBottom:4}},"\u2460 ",h("strong",null,"Tap")," an exercise to expand it"),
        h("div",{style:{marginBottom:4}},"\u2461 Log ",h("strong",null,"weight & reps"),", then \u2713 check off each set"),
        h("div",{style:{marginBottom:4}},"\u2462 Use ",h("strong",null,"\u26A1 Quick Log")," to repeat your last set instantly"),
        h("div",null,"\u2463 ",h("strong",null,"Swipe left/right")," to switch training days")),
      h("button",{onClick:function(){lsSet("onboarded",true);refresh()},className:"btn btn--accent btn--sm",style:{marginTop:12}},"Let\u2019s Go")):null,
    isDeloadWeek?h(DeloadOptions,{onSelect:refresh}):
    deloadWarnings?h("div",{style:{background:"var(--danger-bg)",border:"1px solid var(--danger-border)",borderRadius:10,padding:"10px 12px",marginBottom:10},role:"alert"},
      h("div",{style:{fontSize:12,fontWeight:700,color:"var(--danger)",marginBottom:4}},"\u26A0 Consider a Deload"),
      h("div",{style:{fontSize:11,color:"var(--text-secondary)",lineHeight:1.5}},"High RPE (9+) for 2+ sessions on: ",deloadWarnings.join(", "),". Consider reducing weight 40-50%.")):null,
    swappedExercises.map(function(ex,i){
      var ssPartner=null,ssPartnerExId=null;
      if(ex.supersetGroup){for(var si=0;si<swappedExercises.length;si++){if(si!==i&&swappedExercises[si].supersetGroup===ex.supersetGroup){ssPartner=swappedExercises[si].name;ssPartnerExId=swappedExercises[si].id;break}}}
      return h(CardErrorBoundary,{key:ex.id,name:ex.name},h(ExerciseCard,{exercise:ex,index:i,dayId:day.id,onSetUpdate:refresh,isNext:nextExIdx===i,supersetGroup:ex.supersetGroup,supersetPartner:ssPartner,supersetPartnerExId:ssPartnerExId,onSwap:handleSwap}))}),
    customs.length>0?h("div",{style:{borderTop:"1px solid var(--info-border)",marginTop:8,paddingTop:8}},
      h("div",{style:{fontSize:10,fontWeight:700,color:"var(--info)",marginBottom:6,letterSpacing:.5}},"CUSTOM EXERCISES"),
      customs.map(function(ex,i){var ci=day.exercises.length+i;return h("div",{key:ex.id,style:{position:"relative"}},h(ExerciseCard,{exercise:ex,index:ci,dayId:day.id,onSetUpdate:refresh,isNext:nextExIdx===ci}),h("button",{onClick:function(){removeCustom(ex.id)},style:{position:"absolute",top:10,right:10,width:22,height:22,borderRadius:6,border:"1px solid var(--danger-border)",background:"var(--danger-bg)",color:"var(--danger)",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10},"aria-label":"Remove "+ex.name},"\u2715"))})):null,
    showAddForm?h(AddExerciseForm,{dayId:day.id,onAdd:function(){setCustoms(getCustomExercises(day.id));setShowAddForm(false);refresh()},onCancel:function(){setShowAddForm(false)}}):h("button",{onClick:function(){setShowAddForm(true)},className:"btn btn--info btn--full btn--dashed",style:{marginTop:8}},"+ Add Exercise"),
    h(CardioLog,{dayId:day.id}),
    allComplete?h(SessionRPE,{dayId:day.id}):null,
    showComplete?h(CompletionSummary,{day:day,customs:customs,onClose:function(){setShowComplete(false)}}):null);
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
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Settings"},h("div",{className:"sheet fade-in"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Settings"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close settings"},"\u2715")),
    h("div",{style:{fontSize:12,color:"var(--text-dim)",marginBottom:16,padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)"}},h("span",{style:{fontWeight:700,color:"var(--accent)"}},"Profile: "),config.name," \u2014 ",config.program),
    /* Settings groups */
    h("div",{className:"settings-group"},
      h("div",{className:"settings-group__title"},"Preferences"),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Default Unit"),h("div",{className:"settings-row__desc"},"Per-exercise override via LBS/KG toggle")),h("button",{onClick:toggleUnit,className:"btn btn--accent-ghost btn--sm"},unit==="lbs"?"Switch to KG":"Switch to LBS")),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Auto-Start Timer"),h("div",{className:"settings-row__desc"},"Start rest timer on set check-off")),h(Toggle,{on:autoTimer,onToggle:toggleAutoTimer,label:"Auto-start timer"})),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Timer Sound"),h("div",{className:"settings-row__desc"},"Play sound when rest timer completes")),h(Toggle,{on:getPref("timerSound",true),onToggle:function(){setPref("timerSound",!getPref("timerSound",true))},label:"Timer sound"})),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"RIR Tracking"),h("div",{className:"settings-row__desc"},"Rate reps-in-reserve after each set")),h(Toggle,{on:getPref("showRir",false),onToggle:function(){setPref("showRir",!getPref("showRir",false))},label:"Show RIR"})),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Wellness Check"),h("div",{className:"settings-row__desc"},"Pre-session readiness poll (sleep, energy, etc.)")),h(Toggle,{on:getPref("showWellness",false),onToggle:function(){setPref("showWellness",!getPref("showWellness",false))},label:"Show wellness"}))),
    h("div",{className:"settings-group"},
      h("div",{className:"settings-group__title"},"Schedule"),
      h("div",{style:{fontSize:11,color:"var(--text-dim)",marginBottom:10}},"Tap a day to cycle through the week"),
      h("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},config.days.map(function(day){return h("button",{key:day.id,onClick:function(){changeDayFor(day.id)},style:{padding:"8px 12px",borderRadius:8,border:"1px solid var(--accent-border)",background:"var(--accent-bg)",cursor:"pointer",textAlign:"center",minWidth:60},"aria-label":"Change "+day.label+" day"},h("div",{style:{fontSize:10,fontWeight:700,color:"var(--accent)"}},dayMap[day.id]),h("div",{style:{fontSize:12,fontWeight:600,color:"var(--text-primary)",marginTop:2}},day.label))}))),
    h("div",{className:"settings-group"},
      h("div",{className:"settings-group__title"},"Mesocycle"),
      h("div",{style:{fontSize:11,color:"var(--text-dim)",marginBottom:6}},"4-week training block. Week 4 = deload."),
      h("div",{style:{fontSize:10,color:"var(--info)",marginBottom:10,fontStyle:"italic"}},MESO_WEEK_LABELS[getMesocycle().week]),
      h("div",{style:{display:"flex",gap:8,alignItems:"center",marginBottom:10}},
        h("span",{style:{fontSize:13,fontWeight:700,color:"var(--info)"}},"Week "+getMesocycle().week+" of 4"),
        h("button",{onClick:function(){var m=advanceMesoWeek();if(props.onMesoChange)props.onMesoChange(m)},className:"btn btn--info btn--sm"},"Next Week"),
        h("button",{onClick:function(){showConfirm({title:"Reset Mesocycle",msg:"Reset to Week 1?",confirmLabel:"Reset",onConfirm:function(){var m=resetMesocycle();if(props.onMesoChange)props.onMesoChange(m)}})},className:"btn btn--ghost btn--sm"},"Reset")),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Undulating Periodization"),h("div",{className:"settings-row__desc"},"Auto-adjust rep targets each week")),h(Toggle,{on:getMesocycle().mode==="undulating",onToggle:function(){var m=getMesocycle();m.mode=m.mode==="undulating"?"linear":"undulating";setMesocycle(m);if(props.onMesoChange)props.onMesoChange(m)},label:"Undulating periodization"}))),
    h("div",{className:"settings-group"},
      h("div",{className:"settings-group__title"},"Data"),
      h("div",{style:{display:"flex",flexDirection:"column",gap:10}},
        h("button",{onClick:exportData,className:"btn btn--info btn--full"},"\uD83D\uDCE4 Export All Data"),
        h("button",{onClick:function(){fileRef.current&&fileRef.current.click()},className:"btn btn--accent-ghost btn--full"},"\uD83D\uDCE5 Import Data"),
        h("input",{ref:fileRef,type:"file",accept:".json",onChange:handleImport,style:{display:"none"},"aria-label":"Import data file"}),
        msg?h("div",{style:{fontSize:12,color:msg.startsWith("Import failed")?"var(--danger)":"var(--success)",textAlign:"center",padding:8},role:"alert"},msg):null,
        storageInfo?h("div",{style:{fontSize:10,color:storageInfo.used/storageInfo.quota>0.8?"var(--danger)":"var(--text-dim)",textAlign:"center",paddingTop:8}},"Storage: "+(storageInfo.used/1024/1024).toFixed(1)+" / "+(storageInfo.quota/1024/1024).toFixed(0)+" MB"):null)),
    h("div",{className:"settings-group"},
      h("div",{className:"settings-group__title"},"Tools"),
      h("div",{style:{display:"flex",flexDirection:"column",gap:10}},
        h("button",{onClick:function(){if(props.onBodyMetrics)props.onBodyMetrics()},className:"btn btn--accent-ghost btn--full"},"\uD83D\uDCCF Body Metrics"),
        h("button",{onClick:function(){if(props.onSessionHistory)props.onSessionHistory()},className:"btn btn--accent-ghost btn--full"},"\uD83D\uDCCB Session History")))));
}

/* ── Profile Selector ── */
function ProfileSelector(){
  var s=useState(null),profiles=s[0],setProfiles=s[1];var s2=useState(null),error=s2[0],setError=s2[1];
  useEffect(function(){fetch("configs/profiles.json").then(function(r){if(!r.ok)throw new Error("Not found");return r.json()}).then(function(data){setProfiles(data.profiles||[])}).catch(function(){setError("No profiles.json found. Access via ?profile=yourname")})},[]);
  if(error)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:40,textAlign:"center"}},h("div",null,h("div",{style:{fontSize:40,marginBottom:16},"aria-hidden":"true"},"\uD83C\uDFCB\uFE0F"),h("h1",{style:{fontSize:22,fontWeight:800,color:"var(--text-bright)",marginBottom:8}},"HYPER",h("span",{style:{color:"var(--accent)"}},"TROPHY")),h("p",{style:{fontSize:14,color:"var(--text-dim)",lineHeight:1.6}},error)));
  if(!profiles)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"},"aria-label":"Loading"},h("div",{style:{width:24,height:24,border:"3px solid rgba(245,158,11,0.3)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}));
  return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:32}},h("div",{style:{maxWidth:400,width:"100%",textAlign:"center"}},
    h("div",{style:{fontSize:40,marginBottom:12},"aria-hidden":"true"},"\uD83C\uDFCB\uFE0F"),
    h("h1",{style:{fontSize:24,fontWeight:800,color:"var(--text-bright)",marginBottom:4}},"HYPER",h("span",{style:{color:"var(--accent)"}},"TROPHY")),
    h("p",{style:{fontSize:13,color:"var(--text-dim)",marginBottom:24}},"Select your profile"),
    h("div",{style:{display:"flex",flexDirection:"column",gap:10},role:"list"},profiles.map(function(p){return h("a",{key:p.id,href:"?profile="+p.id,style:{display:"block",padding:"16px 20px",borderRadius:14,border:"1px solid var(--accent-border)",background:"var(--accent-bg)",textDecoration:"none",textAlign:"left"},role:"listitem"},h("div",{style:{fontSize:16,fontWeight:700,color:"var(--text-bright)"}},p.name),h("div",{style:{fontSize:12,color:"var(--text-dim)",marginTop:2}},p.program||""))}))));
}

/* ══════════════════════════════════════════
   MAIN APP (with bottom navigation)
   ══════════════════════════════════════════ */
function MainApp(props){
  var config=props.config;var DAYS=config.days;
  var s=useState(0),activeDay=s[0],setActiveDay=s[1];var s2=useState(0),_tick=s2[0],setTick=s2[1];
  /* Bottom nav: 0=Train, 1=Volume, 2=History, 3=Settings */
  var sn=useState(0),navTab=sn[0],setNavTab=sn[1];
  var s3=useState(false),showSettings=s3[0],setShowSettings=s3[1];var s4=useState(false),showMetrics=s4[0],setShowMetrics=s4[1];
  var sv=useState(false),showVolume=sv[0],setShowVolume=sv[1];var sh=useState(false),showHistory=sh[0],setShowHistory=sh[1];
  var sr=useState(false),showRecords=sr[0],setShowRecords=sr[1];
  var swn=useState(function(){return shouldShowWhatsNew()}),showWhatsNew=swn[0],setShowWhatsNew=swn[1];
  var smo=useState(false),showMore=smo[0],setShowMore=smo[1];
  var s7=useState(function(){return getDayMap(DAYS)}),dayMap=s7[0],setDayMapState=s7[1];
  var sm=useState(function(){return getMesocycle()}),meso=sm[0],setMeso=sm[1];
  var scrollRef=useRef(null);var refresh=useCallback(function(){setTick(function(t){return t+1})},[]);
  var dayData=useDayData();
  var fatigue=useMemo(function(){return calcFatigueScore(config)},[config]);
  /* Swipe */
  var touchRef=useRef({startX:0,startY:0});
  var onTouchStart=useCallback(function(e){var t=e.touches[0];touchRef.current={startX:t.clientX,startY:t.clientY}},[]);
  var onTouchEnd=useCallback(function(e){var t=e.changedTouches[0];var dx=t.clientX-touchRef.current.startX;var dy=t.clientY-touchRef.current.startY;/* Increased threshold (80px) and stricter angle (2x) to avoid scroll conflicts */if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*2){if(dx<0){setActiveDay(function(d){return Math.min(d+1,DAYS.length-1)})}else{setActiveDay(function(d){return Math.max(d-1,0)})}}},[DAYS.length]);
  useEffect(function(){var dow=new Date().getDay();var dayToNum={"Mon":1,"Tue":2,"Wed":3,"Thu":4,"Fri":5,"Sat":6,"Sun":0};var best=-1;DAYS.forEach(function(d,i){if(dayToNum[dayMap[d.id]]===dow)best=i});if(best>=0)setActiveDay(best)},[dayMap]);
  useEffect(function(){if(scrollRef.current)scrollRef.current.scrollTop=0},[activeDay]);

  return h("div",{style:{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}},
    /* Header */
    h("div",{className:"header"},
      h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}},
        h("div",null,
          h("h1",{style:{fontSize:20,fontWeight:800,margin:0,letterSpacing:-.5,color:"var(--text-bright)"}},"HYPER",h("span",{style:{color:"var(--accent)"}},"TROPHY")),
          h("div",{style:{display:"flex",alignItems:"center",gap:6,marginTop:2}},
            h("span",{style:{fontSize:11,fontWeight:700,color:"var(--accent)"}},config.name),
            h("span",{style:{fontSize:9,color:"var(--text-dim)"}},"\u00B7"),
            h("span",{style:{fontSize:9,color:"var(--text-dim)",fontWeight:700,letterSpacing:.5}},config.subtitle||""),
            h("span",{style:{fontSize:9,color:"var(--text-dim)"}},"\u00B7"),
            h("span",{style:{fontSize:9,fontWeight:700,color:meso.week===4?"var(--danger)":"var(--info)",letterSpacing:.5}},"Wk "+meso.week+"/4"),
            fatigue?h("span",{style:{fontSize:9,fontWeight:700,color:fatigue.color,marginLeft:4}},"\u25CF "+fatigue.label):null)),
        h("div",{style:{textAlign:"right"}},
          h("div",{style:{fontSize:11,color:"var(--text-dim)"}},new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})),
          h("div",{style:{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",marginTop:2}},h(SessionTimer,{onRefresh:refresh})))),
      /* Day tabs */
      h("div",{style:{display:"flex",gap:3},role:"tablist","aria-label":"Training days"},DAYS.map(function(day,i){
        var saved=dayData.getData(day.id);var customs=getCustomExercises(day.id);var allEx=day.exercises.concat(customs);
        var doneSets=allEx.reduce(function(a,e){var d=saved.exercises&&saved.exercises[e.id];return a+(d?d.filter(function(s){return s.done}).length:0)},0);
        var totalSets=allEx.reduce(function(a,e){return a+e.sets},0);var hasProg=doneSets>0,complete=doneSets===totalSets&&totalSets>0;
        return h("button",{key:day.id,onClick:function(){setActiveDay(i);setNavTab(0)},className:"tab"+(activeDay===i?" tab--active":"")+(complete?" tab--complete":""),role:"tab","aria-selected":activeDay===i?"true":"false"},
          h("div",{style:{fontSize:11,fontWeight:700,color:activeDay===i?"var(--accent)":complete?"var(--success)":"var(--text-dim)",letterSpacing:.4}},dayMap[day.id]),
          h("div",{style:{fontSize:13,fontWeight:700,color:activeDay===i?"var(--text-bright)":complete?"var(--text-dim)":"var(--text-dim)",marginTop:1}},day.label),
          (hasProg||complete)?h("div",{style:{width:4,height:4,borderRadius:2,background:complete?"var(--success)":"var(--accent)",margin:"3px auto 0"},"aria-hidden":"true"}):null)}))),
    /* Content */
    h("div",{ref:scrollRef,onTouchStart:onTouchStart,onTouchEnd:onTouchEnd,className:"content"},
      h(DayView,{key:activeDay,day:DAYS[activeDay],refresh:refresh,config:config})),
    /* Floating timer */
    h(FloatingTimer,null),
    /* Bottom Navigation */
    h("nav",{className:"bottom-nav",role:"navigation","aria-label":"Main navigation"},
      [{icon:"\uD83C\uDFCB\uFE0F",label:"TRAIN",idx:0},{icon:"\uD83D\uDCCA",label:"VOLUME",idx:1},{icon:"\uD83C\uDFC6",label:"PRs",idx:2},{icon:"\u2699\uFE0F",label:"MORE",idx:3}].map(function(nav){
        return h("button",{key:nav.idx,onClick:function(){
          if(nav.idx===0){setNavTab(0)}
          else if(nav.idx===1){setShowVolume(true)}
          else if(nav.idx===2){setShowRecords(true)}
          else if(nav.idx===3){setShowMore(true)}
        },className:"nav-btn"+(navTab===nav.idx?" nav-btn--active":""),"aria-label":nav.label},
          h("span",{className:"nav-btn__icon","aria-hidden":"true"},nav.icon),
          h("span",{className:"nav-btn__label"},nav.label))})),
    /* More Menu */
    showMore?h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)setShowMore(false)},role:"dialog","aria-modal":"true","aria-label":"More options"},
      h("div",{className:"sheet fade-in",style:{paddingBottom:"max(env(safe-area-inset-bottom,0px),24px)"}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
          h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"More"),
          h("button",{onClick:function(){setShowMore(false)},style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close"},"\u2715")),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
          h("button",{onClick:function(){setShowMore(false);setShowMetrics(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCCF Body Metrics"),
          h("button",{onClick:function(){setShowMore(false);setShowHistory(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCCB Session History"),
          h("button",{onClick:function(){setShowMore(false);setShowSettings(true)},className:"btn btn--ghost btn--full",style:{padding:"14px 12px",fontSize:13,gridColumn:"1 / -1"}},"\u2699\uFE0F Settings")))):null,
    /* Modals */
    showSettings?h(SettingsPanel,{onClose:function(){setShowSettings(false);refresh()},config:config,dayMap:dayMap,setDayMapState:setDayMapState,onMesoChange:function(m){setMeso(m)},onBodyMetrics:function(){setShowSettings(false);setShowMetrics(true)},onSessionHistory:function(){setShowSettings(false);setShowHistory(true)}}):null,
    showMetrics?h(BodyMetrics,{onClose:function(){setShowMetrics(false)}}):null,
    showVolume?h(VolumeDashboard,{onClose:function(){setShowVolume(false)},config:config}):null,
    showHistory?h(SessionHistory,{onClose:function(){setShowHistory(false)}}):null,
    showRecords?h(PersonalRecords,{onClose:function(){setShowRecords(false)},config:config}):null,
    /* What's New modal */
    showWhatsNew?h("div",{className:"overlay overlay--center",onClick:function(e){if(e.target===e.currentTarget){markVersionSeen();setShowWhatsNew(false)}},role:"dialog","aria-modal":"true","aria-label":"What's new"},
      h("div",{className:"fade-in",style:{background:"var(--surface)",borderRadius:16,padding:"24px 20px",width:"90%",maxWidth:360}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
          h("h3",{style:{fontSize:16,fontWeight:800,color:"var(--text-bright)"}},"What's New"),
          h("span",{style:{fontSize:11,color:"var(--accent)",fontWeight:700}},"v"+APP_VERSION)),
        h("div",{style:{maxHeight:"50vh",overflowY:"auto"}},
          WHATS_NEW.map(function(item,i){return h("div",{key:i,style:{display:"flex",gap:8,alignItems:"flex-start",padding:"5px 0"}},
            h("span",{style:{color:"var(--success)",fontSize:12,flexShrink:0,marginTop:1}},"\u2713"),
            h("span",{style:{fontSize:12,color:"var(--text-secondary)",lineHeight:1.4}},item))})),
        h("button",{onClick:function(){markVersionSeen();setShowWhatsNew(false)},className:"btn btn--accent btn--full",style:{marginTop:14}},"Got it"))):null,
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
    fetch("configs/"+profileId+".json").then(function(r){if(!r.ok)throw new Error("Profile not found: "+profileId);return r.json()}).then(function(data){
      var err=validateConfig(data);if(err){setError("Config error: "+err);return}
      setConfig(data);
    }).catch(function(err){setError(err.message)});
  },[profileId]);
  if(!profileId)return h(ProfileSelector,null);
  if(error)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:40,textAlign:"center"}},h("div",null,h("div",{style:{fontSize:40,marginBottom:16},"aria-hidden":"true"},"\u26A0\uFE0F"),h("h2",{style:{fontSize:18,fontWeight:700,color:"var(--text-bright)",marginBottom:8}},"Profile Not Found"),h("p",{style:{fontSize:14,color:"var(--text-dim)"}},error),h("a",{href:"?",style:{display:"inline-block",marginTop:16,padding:"10px 20px",borderRadius:10,background:"var(--accent)",color:"#000",fontWeight:700,fontSize:14,textDecoration:"none"}},"View All Profiles")));
  if(!config)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"},"aria-label":"Loading application"},h("div",{style:{width:24,height:24,border:"3px solid rgba(245,158,11,0.3)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}));
  return h(TimerProvider,null,h(DayDataProvider,null,h(MainApp,{config:config})));
}

ReactDOM.createRoot(document.getElementById("root")).render(h(ErrorBoundary,null,h(App)));
if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").then(function(reg){
  reg.addEventListener("updatefound",function(){var nw=reg.installing;if(nw){nw.addEventListener("statechange",function(){if(nw.state==="activated"&&navigator.serviceWorker.controller){
    var toast=document.createElement("div");toast.textContent="Update available \u2014 tap to refresh";
    toast.style.cssText="position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;background:#f59e0b;color:#000;font-weight:700;font-size:13px;z-index:9999;cursor:pointer;font-family:-apple-system,sans-serif";
    toast.onclick=function(){window.location.reload()};document.body.appendChild(toast);setTimeout(function(){if(toast.parentNode)toast.parentNode.removeChild(toast)},10000);
  }})}});
}).catch(function(){})})}

