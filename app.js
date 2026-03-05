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
var APP_VERSION=42;
var WHATS_NEW=[
  "Code cleanup: extracted formatDate/formatDateFull helpers, replacing 8 duplicate date formatters",
  "Code cleanup: named constants SAVE_DEBOUNCE_MS, SWIPE_THRESHOLD_PX, SESSION_WARN_SECS replace magic numbers",
  "Code cleanup: calcWeeklyVolume and calcPreviousWeekVolume unified into calcVolumeForWeek",
  "CSS: replaced all 'transition: all' rules with specific property transitions — better paint performance",
  "CSS: .content now has overscroll-behavior-y: contain — prevents accidental page pull-to-refresh",
  "CSS: app root uses 100dvh (dynamic viewport) for correct height on mobile browsers with toolbar",
  "CSS: added --warning (#f97316) and --lime (#84cc16) CSS variables — orange and lime-green are now in the design system"
];
function getSeenVersion(){return lsGet("_app_version")||0}
function markVersionSeen(){lsSet("_app_version",APP_VERSION)}
function shouldShowWhatsNew(){return getSeenVersion()<APP_VERSION&&getSeenVersion()>0}

/* ═══ CONSTANTS ═══ */
var SAVE_DEBOUNCE_MS=300;     /* debounce delay before writing dayData to localStorage */
var SWIPE_THRESHOLD_PX=80;    /* minimum horizontal swipe distance to trigger day change */
var SESSION_WARN_SECS=5400;   /* 90 minutes — show long-session warning */

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
function initProfile(p){PROFILE=p;LS="ht_"+p+"_";
  /* Restore session date lock in case of page reload during a midnight workout */
  try{var lock=localStorage.getItem("ht_session_lock");if(lock){_sessionDateLock=lock;if(!getSessionStart())unlockSessionDate()}}catch(e){}
  runMigrations();/* Set version on first-ever load so What's New doesn't show for new users */if(!lsGet("_app_version"))markVersionSeen()}

/* ═══ DATA MIGRATIONS ═══ */
var MIGRATIONS=[];
function runMigrations(){
  var cur=lsGet("_schema_version")||0;
  for(var i=cur;i<MIGRATIONS.length;i++){try{MIGRATIONS[i]()}catch(e){console.error("[Migration] Failed at step "+(i+1)+":",e)}}
  if(cur<MIGRATIONS.length)lsSet("_schema_version",MIGRATIONS.length);
}

/* ═══ INDEXEDDB BACKEND ═══ */
var _idb=null;var _idbReady=false;var _idbFailed=false;var _idbQueue=[];
function openIDB(){
  if(!window.indexedDB){_idbFailed=true;return}
  var req=indexedDB.open("hypertrophy-tracker",1);
  req.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains("data"))db.createObjectStore("data")};
  req.onsuccess=function(e){_idb=e.target.result;_idbReady=true;_idbQueue.forEach(function(fn){fn()});_idbQueue=[]};
  req.onerror=function(){console.warn("IndexedDB failed to open:",req.error);_idbFailed=true;_idbQueue=[]};
  req.onblocked=function(){console.warn("IndexedDB blocked by another tab");_idbFailed=true;_idbQueue=[]};
}
openIDB();
function idbSet(k,v){
  if(_idbFailed)return;
  if(!_idbReady){_idbQueue.push(function(){idbSet(k,v)});return}
  try{var tx=_idb.transaction("data","readwrite");tx.objectStore("data").put(v,k)}catch(e){console.warn("idbSet failed:",k,e)}
}
function idbGet(k,cb){
  if(!_idbReady){cb(null);return}
  try{var tx=_idb.transaction("data","readonly");var req=tx.objectStore("data").get(k);req.onsuccess=function(){cb(req.result!==undefined?req.result:null)};req.onerror=function(){cb(null)}}catch(e){cb(null)}
}
function idbDelete(k){
  if(!_idbReady)return;
  try{var tx=_idb.transaction("data","readwrite");tx.objectStore("data").delete(k)}catch(e){console.warn("idbDelete failed:",k,e)}
}
function migrateToIDB(cb){
  if(!_idbReady){cb(0);return}
  try{
    var count=0;var tx=_idb.transaction("data","readwrite");var store=tx.objectStore("data");
    for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)){try{store.put(JSON.parse(localStorage.getItem(k)),k);count++}catch(e){store.put(localStorage.getItem(k),k);count++}}}
    tx.oncomplete=function(){cb(count)};tx.onerror=function(){cb(count)};
  }catch(e){console.warn("migrateToIDB failed:",e);cb(0)}
}

/* ═══ STORAGE ═══ */
function lsGet(k){try{var v=localStorage.getItem(LS+k);return v?JSON.parse(v):null}catch(e){console.warn("[lsGet] Failed to parse key '"+k+"':",e.message);return null}}
var _storageWarningShown=false;
var _storageFull=false;var _storageFullListeners=[];
function onStorageFullChange(fn){_storageFullListeners.push(fn);return function(){_storageFullListeners=_storageFullListeners.filter(function(f){return f!==fn})}}
function lsSet(k,v){try{localStorage.setItem(LS+k,JSON.stringify(v));if(_storageFull){_storageFull=false;_storageFullListeners.forEach(function(fn){fn(false)})}idbSet(LS+k,v)}catch(e){if(e.name==="QuotaExceededError"){if(!_storageFull){_storageFull=true;_storageFullListeners.forEach(function(fn){fn(true)})}if(!_storageWarningShown){_storageWarningShown=true;showUndoToast("Storage full! Export your data and clear old sessions.",null,10000)}idbSet(LS+k,v)}else{console.warn("localStorage write failed for "+k+":",e.message)}}}
var today=function(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
/* Session date lock: once a session starts, the date is locked for that session to prevent midnight boundary issues */
var _sessionDateLock=null;
function getSessionDate(){return _sessionDateLock||today()}
function lockSessionDate(){if(!_sessionDateLock){_sessionDateLock=today();try{localStorage.setItem("ht_session_lock",_sessionDateLock)}catch(e){}}}
function unlockSessionDate(){_sessionDateLock=null;try{localStorage.removeItem("ht_session_lock")}catch(e){}}
var fmtTime=function(s){return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
var fmtElapsed=function(s){var hr=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return hr>0?hr+"h "+m+"m":m>0?m+"m "+String(sec).padStart(2,"0")+"s":sec+"s"};
/* formatDate("2026-03-04") → "Mar 4" ; formatDateFull("2026-03-04") → "Wed, Mar 4" */
var formatDate=function(dateStr){return new Date(dateStr+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})};
var formatDateFull=function(dateStr){return new Date(dateStr+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})};
var dataKey=function(dayId,date){return dayId+"@"+date};
function loadDayData(dayId,date){return lsGet(dataKey(dayId,date||getSessionDate()))||{exercises:{},warmups:{},rpe:{},exNotes:{}}}

/* ── Auto-save debounce ── */
var _saveTimers={};
var _pendingSaves={};/* tracks {data,date} for each dayId awaiting debounce */
var _lastActivity=Date.now();
function saveDayData(dayId,data,immediate){
  _lastActivity=Date.now();
  var key=dayId;
  if(_saveTimers[key])clearTimeout(_saveTimers[key]);
  var d=getSessionDate();
  if(immediate){delete _pendingSaves[key];lsSet(dataKey(dayId,d),data);updateHistoryIndex(dayId,d,data);return}
  _pendingSaves[key]={data:data,date:d};
  _saveTimers[key]=setTimeout(function(){delete _pendingSaves[key];lsSet(dataKey(dayId,d),data);updateHistoryIndex(dayId,d,data)},SAVE_DEBOUNCE_MS);
}
/* Flush all pending debounced saves immediately — called on page close to prevent data loss */
function flushPendingSaves(){
  Object.keys(_pendingSaves).forEach(function(dayId){
    clearTimeout(_saveTimers[dayId]);
    var p=_pendingSaves[dayId];
    lsSet(dataKey(dayId,p.date),p.data);
    updateHistoryIndex(dayId,p.date,p.data);
    delete _pendingSaves[dayId];delete _saveTimers[dayId];
  });
}
window.addEventListener("pagehide",flushPendingSaves);

/* ── History index cache ── */
var _historyIndex={};
var _historyBuilt=false;
function buildHistoryIndex(){
  _historyIndex={};
  /* Try loading manifest for fast path */
  var manifest=lsGet("_historyManifest");
  if(manifest){
    var keys=Object.keys(manifest);
    for(var mi=0;mi<keys.length;mi++){
      var dayId=keys[mi];var dates=manifest[dayId];
      if(!_historyIndex[dayId])_historyIndex[dayId]=[];
      for(var di=0;di<dates.length;di++){
        try{var data=JSON.parse(localStorage.getItem(LS+dayId+"@"+dates[di]));if(data&&data.exercises)_historyIndex[dayId].push({date:dates[di],data:data})}catch(e){}
      }
    }
  }else{
    /* Full scan fallback — build manifest */
    var newManifest={};
    for(var i=0,_lsLen=localStorage.length;i<_lsLen;i++){
      var k=localStorage.key(i);if(!k||!k.startsWith(LS))continue;
      var rest=k.slice(LS.length);var atIdx=rest.indexOf("@");if(atIdx===-1)continue;
      var dayId=rest.slice(0,atIdx);var date=rest.slice(atIdx+1);
      if(!date||date.length!==10)continue;
      try{var data=JSON.parse(localStorage.getItem(k));if(data&&data.exercises){if(!_historyIndex[dayId])_historyIndex[dayId]=[];_historyIndex[dayId].push({date:date,data:data});if(!newManifest[dayId])newManifest[dayId]=[];newManifest[dayId].push(date)}}catch(e){}
    }
    lsSet("_historyManifest",newManifest);
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
  /* Update manifest */
  var manifest=lsGet("_historyManifest")||{};
  if(!manifest[dayId])manifest[dayId]=[];
  if(manifest[dayId].indexOf(date)===-1){manifest[dayId].push(date);lsSet("_historyManifest",manifest)}
}
function getIndexDataForDate(dayId,dateStr){
  if(!_historyBuilt)buildHistoryIndex();
  var entries=_historyIndex[dayId]||[];
  for(var i=0;i<entries.length;i++){if(entries[i].date===dateStr)return entries[i].data}
  return null;
}
function getHistory(dayId,exId,limit){
  if(!_historyBuilt)buildHistoryIndex();
  var entries=_historyIndex[dayId]||[];var results=[];var td=getSessionDate();
  for(var i=0;i<entries.length;i++){
    var e=entries[i];if(e.date===td)continue;
    if(e.data.exercises&&e.data.exercises[exId])results.push({date:e.date,sets:e.data.exercises[exId]});
    if(results.length>=(limit||30))break;
  }
  return results;
}
function getBilateralHistory(dayId,ex,limit){
  if(!ex.bilateral)return getHistory(dayId,ex.id,limit);
  if(!_historyBuilt)buildHistoryIndex();
  var entries=_historyIndex[dayId]||[];var results=[];var td=getSessionDate();
  for(var i=0;i<entries.length;i++){
    var e=entries[i];if(e.date===td)continue;
    var lSets=e.data.exercises&&e.data.exercises[ex.id+"_L"];
    var rSets=e.data.exercises&&e.data.exercises[ex.id+"_R"];
    if(lSets||rSets){
      var tagged=[].concat((lSets||[]).map(function(s){var c={};for(var k in s)c[k]=s[k];c._side="L";return c}),(rSets||[]).map(function(s){var c={};for(var k in s)c[k]=s[k];c._side="R";return c}));
      results.push({date:e.date,sets:tagged});
    }
    if(results.length>=(limit||30))break;
  }
  return results;
}
function getMachineWeight(exId){return lsGet("mw_"+exId)||0}
function setMachineWeightLS(exId,w){lsSet("mw_"+exId,w)}
function getSessionStart(){return lsGet("session_"+getSessionDate())}
function markSessionStart(){if(!getSessionStart()){lsSet("session_"+getSessionDate(),Date.now());lockSessionDate()}}
function endSession(){try{localStorage.removeItem(LS+"session_"+getSessionDate())}catch(e){};unlockSessionDate()}
function getStorageUsage(){try{var used=0;for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)){used+=localStorage.getItem(k).length}}return used}catch(e){return 0}}
/* ht_onboarded is intentionally global (no profile prefix) — shown once across all profiles */
function getOnboarded(){try{return localStorage.getItem("ht_onboarded")}catch(e){return"1"}}
function setOnboarded(){try{localStorage.setItem("ht_onboarded","1")}catch(e){}}
function restartSession(){lsSet("session_"+getSessionDate(),Date.now())}

/* ═══ STORAGE CLEANUP ═══ */
function getStorageStats(){
  try{
    var keys=[];var totalBytes=0;var oldest=null;
    for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)){var v=localStorage.getItem(k)||"";totalBytes+=k.length+v.length;
      var atIdx=k.indexOf("@");if(atIdx!==-1){var date=k.slice(atIdx+1);if(date.length===10&&(!oldest||date<oldest))oldest=date}
      keys.push(k)}}
    return{keys:keys,totalBytes:totalBytes,keyCount:keys.length,oldestSession:oldest}
  }catch(e){console.warn("[getStorageStats] Failed:",e.message);return{keys:[],totalBytes:0,keyCount:0,oldestSession:null}}
}
function cleanOldData(monthsToKeep){
  var cutoff=new Date();cutoff.setMonth(cutoff.getMonth()-monthsToKeep);
  var cutoffStr=cutoff.getFullYear()+"-"+String(cutoff.getMonth()+1).padStart(2,"0")+"-"+String(cutoff.getDate()).padStart(2,"0");
  var preservePrefixes=["pref_","eu_","eu_source_","exo_","mw_","templates","perm_swaps_","custom_","_app_version","_schema_version","session_history","auto_backup_","_historyManifest"];
  var removed=0;var freedBytes=0;
  try{
  for(var i=localStorage.length-1;i>=0;i--){
    var k=localStorage.key(i);if(!k||!k.startsWith(LS))continue;
    var suffix=k.slice(LS.length);
    /* Preserve preferences, overrides, templates, permanent swaps */
    var keep=false;preservePrefixes.forEach(function(p){if(suffix.startsWith(p)||suffix===p)keep=true});
    if(keep)continue;
    /* Check date-keyed entries */
    var atIdx=suffix.indexOf("@");if(atIdx!==-1){var date=suffix.slice(atIdx+1);if(date.length===10&&date<cutoffStr){freedBytes+=k.length+(localStorage.getItem(k)||"").length;localStorage.removeItem(k);idbDelete(k);removed++}continue}
    /* Session RPE, cardio, swaps with dates embedded */
    var dateMatch=suffix.match(/\d{4}-\d{2}-\d{2}/);
    if(dateMatch&&dateMatch[0]<cutoffStr){freedBytes+=k.length+(localStorage.getItem(k)||"").length;localStorage.removeItem(k);idbDelete(k);removed++}
  }
  }catch(e){console.warn("[cleanOldData] Failed during iteration:",e.message)}
  /* Rebuild history manifest — reset index first to prevent stale reads during rebuild */
  _historyIndex={};_historyBuilt=false;localStorage.removeItem(LS+"_historyManifest");
  return{removed:removed,freedBytes:freedBytes}
}

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

/* ═══ EXERCISE OVERRIDES ═══ */
function getExOverrides(exId){return lsGet("exo_"+exId)||null}
function setExOverride(exId,field,val){var o=getExOverrides(exId)||{};o[field]=val;lsSet("exo_"+exId,o)}
function clearExOverrides(exId){try{localStorage.removeItem(LS+"exo_"+exId)}catch(e){}}
function applyOverrides(exercises){
  return exercises.map(function(ex){
    var o=getExOverrides(ex.id);if(!o)return ex;
    var merged=Object.assign({},ex);
    if(o.sets)merged.sets=parseInt(o.sets,10)||ex.sets;
    if(o.reps)merged.reps=o.reps;
    if(o.rest)merged.rest=parseInt(o.rest,10)||ex.rest;
    return merged;
  });
}

/* ═══ CUSTOM EXERCISES ═══ */
function getCustomExercises(dayId){return lsGet("custom_"+dayId)||[]}
function saveCustomExercises(dayId,list){lsSet("custom_"+dayId,list)}
function addCustomExercise(dayId,ex){var list=getCustomExercises(dayId);list.push(ex);saveCustomExercises(dayId,list);return list}
function removeCustomExercise(dayId,exId){var list=getCustomExercises(dayId).filter(function(e){return e.id!==exId});saveCustomExercises(dayId,list);return list}

/* ═══ EXERCISE SWAPS ═══ */
function getPermanentSwaps(dayId){return lsGet("perm_swaps_"+dayId)||{}}
function savePermanentSwap(dayId,origId,altName){var swaps=getPermanentSwaps(dayId);swaps[origId]=altName;lsSet("perm_swaps_"+dayId,swaps)}
function clearPermanentSwap(dayId,origId){var swaps=getPermanentSwaps(dayId);delete swaps[origId];lsSet("perm_swaps_"+dayId,swaps)}
function getSwaps(dayId){var perm=getPermanentSwaps(dayId);var session=lsGet("swaps_"+dayId+"_"+getSessionDate())||{};return Object.assign({},perm,session)}
function saveSwap(dayId,origId,altName){var swaps=lsGet("swaps_"+dayId+"_"+getSessionDate())||{};swaps[origId]=altName;lsSet("swaps_"+dayId+"_"+getSessionDate(),swaps)}
function clearSwap(dayId,origId){var swaps=lsGet("swaps_"+dayId+"_"+getSessionDate())||{};delete swaps[origId];lsSet("swaps_"+dayId+"_"+getSessionDate(),swaps)}
function applySwaps(exercises,dayId){
  var swaps=getSwaps(dayId);
  return exercises.map(function(ex){
    if(swaps[ex.id]){
      var altTip=ex.alternativeTips&&ex.alternativeTips[swaps[ex.id]];
      var altFormTips=ex.alternativeFormTips&&ex.alternativeFormTips[swaps[ex.id]];
      return Object.assign({},ex,{name:swaps[ex.id],_swappedFrom:ex.name,tip:altTip||ex.tip,formTips:altFormTips||ex.formTips,_permanentSwap:!!getPermanentSwaps(dayId)[ex.id]});
    }
    return ex;
  });
}

/* ═══ WORKOUT TEMPLATES ═══ */
function getTemplates(){return lsGet("templates")||[]}
function saveTemplate(name,dayId,exercises){var tpl=getTemplates();tpl.unshift({name:name,dayId:dayId,exercises:exercises.map(function(ex){return{id:ex.id,name:ex.name,sets:ex.sets,reps:ex.reps,rest:ex.rest,muscles:ex.muscles||[]}}),createdAt:today()});if(tpl.length>20)tpl=tpl.slice(0,20);lsSet("templates",tpl)}
function deleteTemplate(idx){var tpl=getTemplates();tpl.splice(idx,1);lsSet("templates",tpl)}

/* ═══ CUSTOM VOLUME TARGETS ═══ */
var DEFAULT_VOLUME_TARGETS={chest:[10,20],back:[10,20],quads:[10,20],hamstrings:[10,16],glutes:[8,16],front_delt:[6,12],side_delt:[10,20],rear_delt:[6,12],biceps:[10,20],triceps:[10,16],calves:[8,16],abs:[8,16]};
function getVolumeTargets(){return lsGet("pref_vol_targets")||DEFAULT_VOLUME_TARGETS}
function setVolumeTargets(t){lsSet("pref_vol_targets",t)}

/* ═══ PROGRESSIVE OVERLOAD ═══ */
function parseRepRange(reps){var str=String(reps).replace(/\/leg/i,"");var parts=str.split("-");if(parts.length===2)return{min:parseInt(parts[0],10)||0,max:parseInt(parts[1],10)||0};var n=parseInt(str,10)||0;return{min:n,max:n}}
function getLastSessionRIR(dayId,exId){
  /* Read from in-memory index to avoid a loadDayData call */
  if(!_historyBuilt)buildHistoryIndex();
  var entries=_historyIndex[dayId]||[];var td=getSessionDate();
  for(var i=0;i<entries.length;i++){
    var e=entries[i];if(e.date===td)continue;
    if(!e.data.exercises||!e.data.exercises[exId])continue;
    if(!e.data.setRir||!e.data.setRir[exId])return null;
    var rir=e.data.setRir[exId];var vals=[];
    Object.keys(rir).forEach(function(k){if(typeof rir[k]==="number")vals.push(rir[k])});
    if(!vals.length)return null;
    return vals.reduce(function(a,b){return a+b},0)/vals.length;
  }
  return null;
}
/* RIR trend across multiple sessions — reads from in-memory index to avoid N loadDayData calls */
function getRIRTrend(dayId,exId,n){
  if(!_historyBuilt)buildHistoryIndex();
  var entries=_historyIndex[dayId]||[];var td=getSessionDate();var limit=n||3;
  var sessionAvgs=[];
  for(var i=0;i<entries.length&&sessionAvgs.length<limit;i++){
    var e=entries[i];if(e.date===td)continue;
    if(!e.data.exercises||!e.data.exercises[exId])continue;
    if(!e.data.setRir||!e.data.setRir[exId])continue;
    var rir=e.data.setRir[exId];var vals=[];
    Object.keys(rir).forEach(function(k){if(typeof rir[k]==="number")vals.push(rir[k])});
    if(vals.length)sessionAvgs.push(vals.reduce(function(a,b){return a+b},0)/vals.length);
  }
  if(sessionAvgs.length<2)return null;
  var overall=sessionAvgs.reduce(function(a,b){return a+b},0)/sessionAvgs.length;
  var declining=sessionAvgs.length>=2&&sessionAvgs[0]<sessionAvgs[sessionAvgs.length-1]-0.5;
  return{avg:overall,declining:declining,sessions:sessionAvgs};
}
function bestWeight(sets){var w=0;(sets||[]).forEach(function(s){var v=parseFloat(s.weight)||0;if(v>w)w=v});return w}
function getBilateralRIRTrend(dayId,exercise,n){
  if(!exercise.bilateral)return getRIRTrend(dayId,exercise.id,n);
  var trendL=getRIRTrend(dayId,exercise.id+"_L",n);var trendR=getRIRTrend(dayId,exercise.id+"_R",n);
  if(trendL&&trendR)return{avg:(trendL.avg+trendR.avg)/2,declining:trendL.declining||trendR.declining,sessions:trendL.sessions};
  return trendL||trendR||null;
}
function getOverloadSuggestion(dayId,exercise){
  var hist=getBilateralHistory(dayId,exercise,1);if(!hist.length)return null;var lastSets=hist[0].sets;if(!lastSets||!lastSets.length)return null;
  var range=parseRepRange(exercise.reps);if(range.max===0)return null;
  /* Use mesocycle-adjusted rep range if undulating mode is active */
  var meso=getMesocycle();var mesoTarget=meso.mode==="undulating"?getMesoRepTarget(exercise.reps,meso.week):null;
  var effectiveRange=mesoTarget?{min:mesoTarget.min,max:mesoTarget.max}:range;
  var comp=lastSets.filter(function(s){return s.done&&s.weight&&s.reps});if(comp.length<Math.max(1,Math.floor(exercise.sets*0.8)))return null;
  var allTop=comp.every(function(s){return parseInt(s.reps)>=effectiveRange.max});
  var lw=bestWeight(comp);if(lw===0)return null;
  var inc=exercise.increment||(exercise.machine?2.5:5);
  /* RIR guard: if average RIR was 0-1 last session, don't suggest weight increase */
  var avgRir=exercise.bilateral?function(){var l=getLastSessionRIR(dayId,exercise.id+"_L");var r=getLastSessionRIR(dayId,exercise.id+"_R");if(l!==null&&r!==null)return(l+r)/2;return l!==null?l:r}():getLastSessionRIR(dayId,exercise.id);
  if(avgRir!==null&&avgRir<=1&&allTop){
    return{type:"hold",from:lw,to:lw,msg:"RIR was "+avgRir.toFixed(1)+" last session \u2014 repeat weight, focus on form"};
  }
  /* RIR trend guard: declining RIR across sessions suggests approaching overreach */
  var rirTrend=getBilateralRIRTrend(dayId,exercise,3);
  if(rirTrend&&rirTrend.declining&&allTop){
    return{type:"hold",from:lw,to:lw,msg:"RIR trending down ("+rirTrend.sessions.slice().reverse().map(function(v){return v.toFixed(1)}).join("\u2192")+") \u2014 consolidate before adding weight"};
  }
  /* Readiness guard: if readiness is low/moderate, suppress weight increase */
  var readinessAdj=getReadinessAdj(dayId);
  if(readinessAdj&&allTop){
    return{type:"hold",from:lw,to:lw,msg:readinessAdj.label+" \u2014 repeat weight today"};
  }
  var repsFirst=(inc<=2.5&&effectiveRange.max>=12)||effectiveRange.max>=15;
  if(!allTop){
    /* Struggling user guard: near failure but not hitting target reps — hold weight */
    if(avgRir!==null&&avgRir<=1){
      return{type:"hold",from:lw,to:lw,msg:"RIR was "+avgRir.toFixed(1)+" but didn\u2019t hit target reps \u2014 repeat weight, focus on form"};
    }
    /* Volume progression: if stuck at same weight for 3+ sessions, suggest adding a set */
    var hist3=getBilateralHistory(dayId,exercise,3);
    if(hist3.length>=3){
      var sameWeight=hist3.every(function(h){return h.sets.filter(function(s){return s.done&&s.weight}).some(function(s){return parseFloat(s.weight)===lw})});
      if(sameWeight&&comp.length>=Math.ceil(exercise.sets*0.8)){
        return{type:"volume",from:lw,to:lw,msg:"Stuck at "+lw+" for 3 sessions \u2014 try adding 1 extra set"};
      }
    }
    return null;
  }
  if(repsFirst){
    var hist2=getBilateralHistory(dayId,exercise,2);
    var prevAlsoTop=hist2.length>=2&&hist2[1].sets.filter(function(s){return s.done&&s.weight&&s.reps}).every(function(s){return parseInt(s.reps)>=effectiveRange.max});
    if(!prevAlsoTop){
      var targetReps=Math.min(effectiveRange.max+2,30);
      return{type:"reps",from:lw,to:lw,targetReps:targetReps,msg:"Try "+exercise.sets+"\u00D7"+targetReps+" at "+lw+" before adding weight"};
    }
  }
  return{type:"weight",from:lw,to:lw+inc,increment:inc};
}

/* ═══ ESTIMATED 1RM ═══ */
/* Epley formula capped at 10 reps for accuracy — high rep counts inflate e1RM unreliably */
function calc1RM(weight,reps){var w=parseFloat(weight),r=parseInt(reps);if(!w||!r||r<=0)return 0;if(r===1)return w;var capped=Math.min(r,10);return Math.round(w*(1+capped/30))}

/* ═══ FATIGUE SCORE ═══ */
function calcFatigueScore(config,dayData){
  var rpeScore=0,rpeCount=0,rirScore=0,rirCount=0;
  var todayDate=getSessionDate();
  config.days.forEach(function(day){
    /* Include today's live data from context if available */
    if(dayData){
      var live=dayData.getData(day.id);
      if(live){
        day.exercises.forEach(function(ex){
          if(live.rpe&&live.rpe[ex.id]){rpeScore+=live.rpe[ex.id];rpeCount++}
          if(live.setRir&&live.setRir[ex.id]){
            var rir=live.setRir[ex.id];
            Object.keys(rir).forEach(function(k){if(typeof rir[k]==="number"){rirScore+=rir[k];rirCount++}});
          }
        });
      }
    }
    /* Use in-memory history index — avoids N×3 loadDayData calls per fatigue recalc */
    if(!_historyBuilt)buildHistoryIndex();
    var dayEntries=_historyIndex[day.id]||[];var histCount=0;
    for(var hi=0;hi<dayEntries.length&&histCount<3;hi++){
      var hEntry=dayEntries[hi];if(hEntry.date===todayDate)continue;
      if(!hEntry.data.exercises||!Object.keys(hEntry.data.exercises).length)continue;
      histCount++;
      day.exercises.forEach(function(ex){
        if(hEntry.data.rpe&&hEntry.data.rpe[ex.id]){rpeScore+=hEntry.data.rpe[ex.id];rpeCount++}
        if(hEntry.data.setRir&&hEntry.data.setRir[ex.id]){
          var rir=hEntry.data.setRir[ex.id];
          Object.keys(rir).forEach(function(k){if(typeof rir[k]==="number"){rirScore+=rir[k];rirCount++}});
        }
      });
    }
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
  if(avg>=9.5)return{level:"high",label:"High Fatigue",color:"var(--danger)",msg:"Consider a deload or lighter session"};
  if(avg>=8.5)return{level:"moderate",label:"Moderate",color:"var(--accent)",msg:"Training load is sustainable"};
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
function clearActiveDeload(){try{localStorage.removeItem(LS+"pref_deload_strategy");localStorage.removeItem(LS+"pref_deload_muscles")}catch(e){}}
function getDeloadMuscles(){return lsGet("pref_deload_muscles")||null}
function setDeloadMuscles(muscles){lsSet("pref_deload_muscles",muscles)}
function getDeloadModifiers(dayId,exercise){
  var strat=getActiveDeload();if(!strat)return null;
  var s=DELOAD_STRATEGIES.find(function(d){return d.id===strat});if(!s)return null;
  /* Per-muscle filter: if specific muscles selected, skip exercises that don't target them */
  var deloadMuscles=getDeloadMuscles();
  if(deloadMuscles&&deloadMuscles.length>0&&exercise.muscles){
    var overlap=exercise.muscles.some(function(m){return deloadMuscles.indexOf(m)>=0});
    if(!overlap)return null;
  }
  if(s.skipWeights)return{skip:true,label:"Active Recovery \u2014 skip weights today"};
  var hist=getBilateralHistory(dayId,exercise,1);var lastWeight=0;
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

/* ═══ BACKUP REMINDER ═══ */
function checkBackupReminder(){
  var lastBackup=lsGet("pref_last_backup")||0;
  var TWO_WEEKS=14*24*60*60*1000;
  if(lastBackup&&Date.now()-lastBackup<TWO_WEEKS)return;
  var sessionCount=lsGet("session_history");
  if(!sessionCount||!sessionCount.length||sessionCount.length<3)return;
  showUndoToast("Back up your data! Tap Export in Settings.",null,8000);
}
function markBackupDone(){lsSet("pref_last_backup",Date.now())}

/* ═══ AUTO-BACKUP ═══ */
function checkAutoBackup(){
  var SEVEN_DAYS=7*24*60*60*1000;
  var lastAuto=lsGet("pref_auto_backup_time");
  if(lastAuto&&Date.now()-lastAuto<SEVEN_DAYS)return;
  var sessionCount=lsGet("session_history");
  if(!sessionCount||!sessionCount.length||sessionCount.length<3)return;
  /* Skip if storage is above 60% to avoid tripling usage */
  if(navigator.storage&&navigator.storage.estimate){
    navigator.storage.estimate().then(function(est){
      if(est.usage&&est.quota&&est.usage/est.quota>0.6)return;
      performAutoBackup();
    }).catch(function(){performAutoBackup()});
  }else{performAutoBackup()}
}
function performAutoBackup(){
  var data={"_export_meta":{version:APP_VERSION,profile:PROFILE,date:today(),format:1,auto:true}};
  for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)&&k.indexOf("auto_backup")===-1){try{data[k]=JSON.parse(localStorage.getItem(k))}catch(e){data[k]=localStorage.getItem(k)}}}
  /* Store backup in localStorage (keep last 2) */
  var prev=lsGet("auto_backup_1");
  if(prev)lsSet("auto_backup_2",prev);
  lsSet("auto_backup_1",{date:today(),data:data});
  lsSet("pref_auto_backup_time",Date.now());
}
function downloadAutoBackup(slot){
  var backup=lsGet("auto_backup_"+slot);if(!backup||!backup.data)return;
  downloadJSON(backup.data,"hypertrophy_"+PROFILE+"_auto_"+backup.date+".json");
}

/* ═══ EXPORT / IMPORT ═══ */
function buildExportData(){
  var data={"_export_meta":{version:APP_VERSION,profile:PROFILE,date:today(),format:1}};
  for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS)){try{data[k]=JSON.parse(localStorage.getItem(k))}catch(e){data[k]=localStorage.getItem(k)}}}
  return data;
}
function downloadJSON(data,filename){
  var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}
function exportData(){downloadJSON(buildExportData(),"hypertrophy_"+PROFILE+"_"+today()+".json");markBackupDone()}
function validateImportData(data){
  if(!data||typeof data!=="object"||Array.isArray(data))return"Import file must be a JSON object.";
  var keys=Object.keys(data);if(keys.length===0)return"Import file is empty.";
  var foreignKeys=0,matchingKeys=0;
  for(var i=0;i<keys.length;i++){
    if(keys[i]==="_export_meta")continue;/* skip versioning metadata */
    if(!keys[i].startsWith("ht_"))return"Unexpected key '"+keys[i]+"' — not a valid export.";
    if(keys[i].startsWith(LS))matchingKeys++;else foreignKeys++;
  }
  if(matchingKeys===0&&foreignKeys>0)return"This export is from a different profile. Expected keys starting with '"+LS+"'.";
  return null;
}
function importData(file,cb){if(file.size>50*1024*1024){cb(0,new Error("File too large (max 50 MB). Export a smaller dataset."));return}var r=new FileReader();r.onload=function(e){try{var data=JSON.parse(e.target.result);var err=validateImportData(data);if(err){cb(0,new Error(err));return}var meta=data._export_meta;var warnings=[];if(meta){if(meta.format&&meta.format!==1)warnings.push("Unknown export format (v"+meta.format+").");if(meta.version&&meta.version>APP_VERSION)warnings.push("Export from newer app (v"+meta.version+" vs v"+APP_VERSION+").");if(meta.profile&&meta.profile!==PROFILE)warnings.push("Profile mismatch: export is '"+meta.profile+"', current is '"+PROFILE+"'.")}var c=0;Object.keys(data).forEach(function(k){if(k==="_export_meta")return;if(!k.startsWith(LS))return;/* skip cross-profile keys */var rawVal=typeof data[k]==="string"?data[k]:JSON.stringify(data[k]);try{localStorage.setItem(k,rawVal);idbSet(k,data[k]);c++}catch(e){console.warn("[import] Failed to write key",k,e.message)}});_historyBuilt=false;try{localStorage.removeItem(LS+"_historyManifest")}catch(e){};cb(c,null,warnings.length?warnings:null)}catch(err){cb(0,err,null)}};r.onerror=function(){cb(0,new Error("File could not be read"),null)};r.readAsText(file)}

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

  /* Cross-tab sync: detect changes from other tabs */
  useEffect(function(){
    var onStorage=function(e){
      if(!e.key||!e.key.startsWith(LS))return;
      /* Only invalidate affected dayId if it's a day data key, otherwise invalidate all */
      var suffix=e.key.slice(LS.length);
      var atIdx=suffix.indexOf("@");
      if(atIdx>=0){var dayId=suffix.slice(0,atIdx);if(dayId)delete cacheRef.current[dayId];else cacheRef.current={}}else{cacheRef.current={}}
      bump(function(r){return r+1});
    };
    window.addEventListener("storage",onStorage);
    return function(){window.removeEventListener("storage",onStorage)};
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
  EB.prototype.componentDidCatch=function(error,info){console.error("[ErrorBoundary] Uncaught error:",error,info)};
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
    React.Component.call(this,props);this.state={hasError:false,retries:0};
  }
  CEB.prototype=Object.create(React.Component.prototype);
  CEB.prototype.constructor=CEB;
  CEB.getDerivedStateFromError=function(){return{hasError:true}};
  CEB.prototype.render=function(){
    if(this.state.hasError){
      var self=this;var maxRetries=3;var exhausted=self.state.retries>=maxRetries;
      return h("div",{className:"card",style:{padding:"12px 14px",background:"var(--danger-bg)",border:"1px solid var(--danger-border)"}},
        h("div",{style:{fontSize:13,fontWeight:700,color:"var(--danger)",marginBottom:4}},"\u26A0 Error loading "+(this.props.name||"component")),
        h("button",{onClick:function(){if(!exhausted)self.setState(function(s){return{hasError:false,retries:s.retries+1}})},disabled:exhausted,className:"btn btn--ghost btn--sm"},exhausted?"Failed — reload page":"Retry"));
    }
    return this.props.children;
  };
  return CEB;
}();

/* ── Focus Trap Hook ── */
var FOCUSABLE_SELECTOR='button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),a[href]';
function useFocusTrap(ref,onClose){
  useEffect(function(){
    if(!ref)return;
    var el=ref.current;if(!el)return;
    var prev=document.activeElement;
    var focusable=el.querySelectorAll(FOCUSABLE_SELECTOR);
    if(focusable.length)focusable[0].focus();
    var trap=function(e){
      if(e.key==="Escape"){if(onClose){e.preventDefault();onClose()}return}
      if(e.key!=="Tab")return;
      var nodes=el.querySelectorAll(FOCUSABLE_SELECTOR);
      if(!nodes.length)return;
      var first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    };
    el.addEventListener("keydown",trap);
    return function(){el.removeEventListener("keydown",trap);if(prev&&prev.focus)prev.focus()};
  },[ref]);
}

/* ── Overlay with focus trap ── */
function Overlay(props){
  var ref=useRef(null);
  var onClose=props.onClose;
  useFocusTrap(ref,onClose);
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget&&onClose)onClose()},role:"dialog","aria-modal":"true","aria-label":props.label||""},
    h("div",{className:props.sheetClass||"sheet fade-in",ref:ref,style:props.sheetStyle||undefined},props.children));
}

/* ── Toggle Switch ── */
function Toggle(props){
  var on=props.on,onToggle=props.onToggle;
  return h("div",{onClick:onToggle,onKeyDown:function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();onToggle()}},tabIndex:0,role:"switch","aria-checked":on?"true":"false","aria-label":props.label||"Toggle",style:{display:"flex",alignItems:"center",minHeight:44,cursor:"pointer"}},
    h("div",{className:"toggle-track",style:{background:on?"var(--accent)":"rgba(255,255,255,0.1)"}},
      h("div",{className:"toggle-knob",style:{left:on?22:2}})));
}

/* ── Undo Toast (queue-based) ── */
var _toastQueue=[];var _toastCurrent=null;var _toastTimer=null;
var _toastListeners=[];
function _notifyToast(){_toastListeners.forEach(function(fn){fn()})}
function _showNextToast(){
  if(_toastTimer){clearTimeout(_toastTimer);_toastTimer=null}
  if(_toastQueue.length===0){_toastCurrent=null;_notifyToast();return}
  _toastCurrent=_toastQueue.shift();
  _toastTimer=setTimeout(function(){_showNextToast()},_toastCurrent.duration||4000);
  _notifyToast();
}
function showUndoToast(msg,onUndo,duration){
  _toastQueue.push({msg:msg,onUndo:onUndo,duration:duration||4000});
  if(!_toastCurrent)_showNextToast();
}
function dismissToast(){_showNextToast()}
function UndoToast(){
  var s=useState(0),bump=s[1];
  useEffect(function(){var fn=function(){bump(function(r){return r+1})};_toastListeners.push(fn);return function(){_toastListeners=_toastListeners.filter(function(f){return f!==fn})}},[]);
  if(!_toastCurrent)return null;
  return h("div",{className:"toast fade-in",role:"alert","aria-live":"polite"},
    h("span",{style:{fontSize:13,color:"var(--text-primary)",fontWeight:600,flex:1}},_toastCurrent.msg),
    _toastCurrent.onUndo?h("button",{onClick:function(){_toastCurrent.onUndo();dismissToast()},className:"btn btn--accent-ghost btn--sm","aria-label":"Undo action"},"Undo"):null);
}

/* ── Save Flash Indicator ── */
var _saveFlashVisible=false;var _saveFlashListeners=[];var _saveFlashTimer=null;
function showSaveFlash(){
  _saveFlashVisible=true;_saveFlashListeners.forEach(function(fn){fn(true)});
  if(_saveFlashTimer)clearTimeout(_saveFlashTimer);
  _saveFlashTimer=setTimeout(function(){_saveFlashVisible=false;_saveFlashListeners.forEach(function(fn){fn(false)})},1600);
}
function SaveFlash(){
  var s=useState(_saveFlashVisible),visible=s[0],setVisible=s[1];
  useEffect(function(){_saveFlashListeners.push(setVisible);return function(){_saveFlashListeners=_saveFlashListeners.filter(function(f){return f!==setVisible})}},[]);
  if(!visible)return null;
  return h("div",{className:"save-indicator fade-in","aria-live":"polite"},"\u2713 Saved");
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
  var s=useState(0),bump=s[1];var dialogRef=useRef(null);
  useEffect(function(){var fn=function(){bump(function(r){return r+1})};_confirmListeners.push(fn);return function(){_confirmListeners=_confirmListeners.filter(function(f){return f!==fn})}},[]);
  var trapRef=_confirmState.show?dialogRef:null;
  useFocusTrap(trapRef,function(){if(_confirmState.onCancel)_confirmState.onCancel();dismissConfirm()});
  if(!_confirmState.show)return null;
  var danger=_confirmState.danger;
  return h("div",{className:"overlay overlay--center",onClick:function(e){if(e.target===e.currentTarget){if(_confirmState.onCancel)_confirmState.onCancel();dismissConfirm()}},role:"dialog","aria-modal":"true","aria-label":_confirmState.title,"aria-describedby":_confirmState.msg?"confirm-desc":undefined},
    h("div",{ref:dialogRef,className:"fade-in",style:{background:"var(--surface)",borderRadius:16,padding:"24px 20px",width:"90%",maxWidth:340,textAlign:"center"}},
      h("h3",{style:{fontSize:16,fontWeight:800,color:"var(--text-bright)",marginBottom:8}},_confirmState.title),
      _confirmState.msg?h("p",{id:"confirm-desc",style:{fontSize:13,color:"var(--text-secondary)",marginBottom:20,lineHeight:1.5}},_confirmState.msg):null,
      h("div",{style:{display:"flex",gap:10}},
        h("button",{type:"button",onClick:function(){if(_confirmState.onCancel)_confirmState.onCancel();dismissConfirm()},className:"btn btn--ghost",style:{flex:1},"aria-label":"Cancel"},"Cancel"),
        h("button",{type:"button",onClick:function(){if(_confirmState.onConfirm)_confirmState.onConfirm();dismissConfirm()},className:danger?"btn btn--danger":"btn btn--accent",style:{flex:1},"aria-label":_confirmState.confirmLabel},_confirmState.confirmLabel))));
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
  }catch(e){console.debug("Timer sound failed:",e)}
}
var _lastTimerNotif=0;
function sendTimerNotification(){
  var now=Date.now();if(now-_lastTimerNotif<500)return;_lastTimerNotif=now;
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
  playTimerSound();
  /* Toast removed — FloatingTimer already shows "REST COMPLETE" banner */
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
        if(left===0&&active.timer.running){var updated=Object.assign({},active.timer,{running:false,done:true});timers.setTimer(active.key,updated);sendTimerNotification()}
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
  },[display?display.remaining:null]);

  if(!display)return null;
  var isDone=display.remaining===0;
  return h("div",{style:{position:"fixed",bottom:56,left:0,right:0,zIndex:100,padding:"10px 16px",background:isDone?"rgba(34,197,94,0.15)":"rgba(10,10,15,0.95)",borderTop:isDone?"1px solid var(--success-border)":"1px solid var(--accent-border)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"space-between"},role:"status","aria-live":"off","aria-label":isDone?"Rest complete":"Rest timer: "+fmtTime(display.remaining)+" remaining"},
    isDone?h("span",{role:"status","aria-live":"assertive",className:"sr-only"},"Rest complete, time to start your next set"):null,
    h("div",{style:{display:"flex",alignItems:"center",gap:10}},
      isDone?h("span",{style:{fontSize:14,fontWeight:800,color:"var(--success)"}},"\u2705 REST COMPLETE"):
      h(React.Fragment,null,
        h("div",{className:"timer-active",style:{width:8,height:8,borderRadius:4,background:"var(--accent)"}}),
        h("span",{style:{fontSize:12,color:"var(--text-secondary)",fontWeight:600}},"Rest"),
        h("span",{style:{fontSize:18,fontWeight:800,color:"var(--accent)",fontVariantNumeric:"tabular-nums"},"aria-hidden":"true"},fmtTime(display.remaining)))),
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
  var presets=getPref("timerPresets",[45,60,90,120,150]);
  return h("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"8px 0"},"aria-label":"Rest timer controls"},
    h("div",{style:{position:"relative",width:48,height:48,flexShrink:0}},
      h("svg",{width:48,height:48,style:{transform:"rotate(-90deg)"},"aria-hidden":"true"},
        h("circle",{cx:24,cy:24,r:20,fill:"none",stroke:"rgba(255,255,255,0.05)",strokeWidth:3}),
        h("circle",{cx:24,cy:24,r:20,fill:"none",stroke:color,strokeWidth:3,strokeDasharray:2*Math.PI*20,strokeDashoffset:2*Math.PI*20*(1-progress),strokeLinecap:"round",style:{transition:"stroke-dashoffset 0.3s"}})),
      h("div",{style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontVariantNumeric:"tabular-nums",color:done?"var(--success)":"var(--text-primary)"},"aria-label":"Time remaining: "+fmtTime(display)},fmtTime(display))),
    h("div",{style:{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}},
      !running?h("button",{onClick:startFn,className:done?"btn btn--success btn--sm":"btn btn--accent btn--sm","aria-label":done?"Restart timer":"Start timer"},done?"Restart":"Start"):
        h("button",{onClick:stopFn,className:"btn btn--danger btn--sm","aria-label":"Stop timer"},"Stop"),
      h("div",{style:{display:"flex",gap:3},role:"group","aria-label":"Timer presets"},presets.map(function(sec){return h("button",{key:sec,onClick:function(){setTotal(sec);totalRef.current=sec;if(!running){setRemaining(null);timers.setTimer(exKey,{total:sec,startedAt:null,running:false,done:false})}},style:{padding:"6px 8px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",minHeight:32,background:total===sec?"var(--accent-bg)":"rgba(255,255,255,0.04)",color:total===sec?"var(--accent)":"var(--text-dim)",border:total===sec?"1px solid var(--accent-border)":"1px solid rgba(255,255,255,0.07)"},"aria-label":sec+" seconds","aria-pressed":total===sec?"true":"false"},sec<60?sec+"s":(sec/60|0)+(sec%60?":"+(sec%60+"").padStart(2,"0"):"m"))}))));
}

/* ── Strength Trend Chart ── */
function StrengthChart(props){
  var hist=props.hist;
  if(hist.length<2)return null;
  var points=hist.slice().reverse().map(function(entry){
    var bestW=bestWeight(entry.sets.filter(function(s){return s.done&&s.weight&&s.reps}));var bestE1rm=0;
    entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var e=calc1RM(parseFloat(s.weight),parseInt(s.reps));if(e>bestE1rm)bestE1rm=e}});
    return{date:entry.date,weight:bestW,e1rm:bestE1rm};
  }).filter(function(p){return p.weight>0});
  if(points.length<2)return null;
  var W=280,H=70,pad=4;
  var e1rmVals=points.map(function(p){return p.e1rm});var wVals=points.map(function(p){return p.weight});
  var mn=Math.min(Math.min(...e1rmVals),Math.min(...wVals));
  var mx=Math.max(Math.max(...e1rmVals),Math.max(...wVals));
  var range=mx-mn||1;
  var toPath=function(vals){return vals.map(function(v,i){return(pad+i*(W-2*pad)/(vals.length-1))+","+(pad+(1-(v-mn)/range)*(H-2*pad))}).join(" ")};
  var e1rmPath=toPath(e1rmVals);var wPath=toPath(wVals);
  var first=e1rmVals[0],last=e1rmVals[e1rmVals.length-1];var delta=last-first;
  var arrow=delta>0?"\u2191":delta<0?"\u2193":"\u2192";var color=delta>0?"var(--success)":delta<0?"var(--danger)":"var(--text-dim)";
  return h("div",{style:{marginTop:8,marginBottom:4,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)"},"aria-label":"Strength trend chart"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
      h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)"}},"Strength Trend"),
      h("span",{style:{fontSize:11,fontWeight:700,color:color}},arrow+" e1RM "+(delta>0?"+":"")+delta)),
    h("span",{className:"sr-only"},"Strength trend: e1RM "+(delta>0?"increased by ":delta<0?"decreased by ":"unchanged at ")+Math.abs(delta)+" over "+points.length+" sessions"),
    h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none","aria-hidden":"true"},
      h("polyline",{points:wPath,fill:"none",stroke:"rgba(245,158,11,0.4)",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"}),
      h("polyline",{points:e1rmPath,fill:"none",stroke:"var(--info)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"})),
    h("div",{style:{display:"flex",gap:12,marginTop:4}},
      h("span",{style:{fontSize:9,color:"var(--info)",fontWeight:600}},"\u25CF e1RM"),
      h("span",{style:{fontSize:9,color:"rgba(245,158,11,0.6)",fontWeight:600}},"\u25CF Weight"),
      props.rpeData&&props.rpeData.length>=2?h("span",{style:{fontSize:9,color:"var(--danger)",fontWeight:600,opacity:0.7}},"\u25CF RPE"):null),
    props.rpeData&&props.rpeData.length>=2?function(){
      var rVals=props.rpeData;var rMn=Math.min(...rVals);var rMx=Math.max(...rVals);var rRange=rMx-rMn||1;
      var rPath=rVals.map(function(v,i){return(pad+i*(W-2*pad)/(rVals.length-1))+","+(pad+(1-(v-rMn)/rRange)*(H-2*pad))}).join(" ");
      return h("svg",{width:"100%",height:30,viewBox:"0 0 "+W+" 30",preserveAspectRatio:"none",style:{marginTop:2},"aria-hidden":"true"},
        h("polyline",{points:rPath,fill:"none",stroke:"var(--danger)",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round",opacity:0.6}));
    }():null);
}

/* ── History Panel ── */
function HistoryPanel(props){
  var hist=useMemo(function(){return props.exercise&&props.exercise.bilateral?getBilateralHistory(props.dayId,props.exercise,30):getHistory(props.dayId,props.exId,30)},[props.dayId,props.exId,props.exercise]);
  if(!hist.length)return h("div",{style:{fontSize:11,color:"var(--text-dim)",padding:"10px 0",textAlign:"center"}},
    h("div",{style:{fontSize:20,marginBottom:4},"aria-hidden":"true"},"\uD83D\uDCCA"),
    h("div",{style:{fontStyle:"italic"}},"No history yet"),
    h("div",{style:{fontSize:10,marginTop:2,color:"var(--text-dim)"}},"Complete today\u2019s sets to start tracking progress"));
  var rpeData=useMemo(function(){return hist.map(function(entry){var dd=loadDayData(props.dayId,entry.date);return dd.rpe&&dd.rpe[props.exId]?dd.rpe[props.exId]:null}).filter(function(v){return v!==null}).reverse()},[hist,props.dayId,props.exId]);
  /* Rest time analysis across sessions */
  var restAnalysis=useMemo(function(){
    var rests=[];
    hist.forEach(function(entry){
      var dd=loadDayData(props.dayId,entry.date);
      if(!dd.setTimestamps||!dd.setTimestamps[props.exId])return;
      var ts=dd.setTimestamps[props.exId];var keys=Object.keys(ts).map(Number).sort(function(a,b){return a-b});
      var sessionRests=[];
      for(var i=1;i<keys.length;i++){var diff=Math.round((ts[keys[i]]-ts[keys[i-1]])/1000);if(diff>0&&diff<600)sessionRests.push(diff)}
      if(sessionRests.length){var avg=Math.round(sessionRests.reduce(function(a,b){return a+b},0)/sessionRests.length);rests.push({date:entry.date,avg:avg})}
    });
    if(rests.length<2)return null;
    var overall=Math.round(rests.reduce(function(a,r){return a+r.avg},0)/rests.length);
    var recent=rests[0].avg,oldest=rests[rests.length-1].avg;
    var drift=recent-oldest;var drifting=Math.abs(drift)>15;
    return{overall:overall,recent:recent,drift:drift,drifting:drifting,sessions:rests.length};
  },[hist,props.dayId,props.exId]);
  return h("div",{className:"fade-in",style:{marginTop:6},"aria-label":"Exercise history"},
    restAnalysis?h("div",{style:{padding:"6px 10px",marginBottom:8,borderRadius:8,background:"rgba(255,255,255,0.02)",border:"1px solid var(--border)",fontSize:11}},
      h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
        h("span",{style:{fontWeight:700,color:"var(--text-dim)"}},"Avg Rest: "+fmtTime(restAnalysis.overall)),
        restAnalysis.drifting?h("span",{style:{fontWeight:700,color:restAnalysis.drift>0?"var(--warning)":"var(--info)",fontSize:10}},(restAnalysis.drift>0?"\u2191 ":"\u2193 ")+Math.abs(restAnalysis.drift)+"s drift over "+restAnalysis.sessions+" sessions"):
        h("span",{style:{color:"var(--success)",fontSize:10,fontWeight:600}},"\u2713 Consistent"))):null,
    h(StrengthChart,{hist:hist,rpeData:rpeData}),
    hist.map(function(entry){var label=formatDate(entry.date);var bestE1rm=0;entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var e=calc1RM(s.weight,s.reps);if(e>bestE1rm)bestE1rm=e}});var pastData=loadDayData(props.dayId,entry.date);var rpe=pastData.rpe&&pastData.rpe[props.exId]?pastData.rpe[props.exId]:null;var rpeColor=rpe?rpe<=7?"var(--success)":rpe===8?"var(--accent)":rpe===9?"var(--warning)":"var(--danger)":null;var exNote=pastData.exNotes&&pastData.exNotes[props.exId]?pastData.exNotes[props.exId]:null;
      var avgRest=null;if(pastData.setTimestamps&&pastData.setTimestamps[props.exId]){var ts=pastData.setTimestamps[props.exId];var keys=Object.keys(ts).map(Number).sort(function(a,b){return a-b});var rests=[];for(var ri=1;ri<keys.length;ri++){var diff=Math.round((ts[keys[ri]]-ts[keys[ri-1]])/1000);if(diff>0&&diff<600)rests.push(diff)}if(rests.length)avgRest=Math.round(rests.reduce(function(a,b){return a+b},0)/rests.length)}
      return h("div",{key:entry.date,style:{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}},
        h("div",{style:{display:"flex",alignItems:"center",gap:8}},
          h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",width:44,flexShrink:0}},label),
          h("div",{style:{display:"flex",gap:6,flex:1,flexWrap:"wrap"}},entry.sets.map(function(s,i){return(s.weight||s.reps)?h("span",{key:i,style:{fontSize:10,color:s.done?"var(--text-dim)":"var(--text-dim)",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}},(s._side?s._side+" ":"")+(s.weight||"\u2014")+"\u00D7"+(s.reps||"\u2014")):null}).filter(Boolean)),
          bestE1rm>0?h("span",{className:"badge badge--info"},"e1RM "+bestE1rm+" "+getExUnit(props.exId)):null,
          rpe?h("span",{style:{fontSize:9,fontWeight:700,color:rpeColor,flexShrink:0}},"RPE "+rpe):null,
          avgRest?h("span",{style:{fontSize:9,fontWeight:600,color:"var(--text-dim)",flexShrink:0}},fmtTime(avgRest)+" rest"):null),
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
  var workingWeight=useMemo(function(){var saved=dayData.getData(dayId);var exSets=saved.exercises&&saved.exercises[exId];var w=0;if(exSets)exSets.forEach(function(s){if(s.weight){var v=parseFloat(s.weight);if(v>w)w=v}});if(!w){var hist=getHistory(dayId,exId,1);if(hist.length)hist[0].sets.forEach(function(s){if(s.done&&s.weight){var v=parseFloat(s.weight);if(v>w)w=v}})}return w},[dayId,exId,dayData.rev]);
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
        h("button",{type:"button",onClick:function(){remove(i)},className:"btn btn--xs",style:{width:44,height:44,borderRadius:6,border:"1px solid var(--danger-border)",background:"transparent",color:"var(--danger)",padding:0},"aria-label":"Remove warmup set "+(i+1)},"\u2715"))})));
}

/* ── Set Logger ── */
function SetLogger(props){
  var exId=props.exId,numSets=props.numSets,dayId=props.dayId,onSetUpdate=props.onSetUpdate,onSetDone=props.onSetDone,exKey=props.exKey,rest=props.rest,isMachine=props.isMachine,increment=props.increment||5,intensityMult=props.intensityMult;
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
      setData(function(cur){lsSet(sourceKey,{unit:prev,sets:cur.map(function(s){return{weight:s.weight}})});var converted=cur.map(function(s){
        if(!s.weight)return s;var w=parseFloat(s.weight);if(!w)return s;
        var cw=prev==="lbs"?Math.round(w/2.20462*2)/2:Math.round(w*2.20462/5)*5;
        return Object.assign({},s,{weight:String(cw)});
      });save(converted);return converted});
    }
  };
  var baseExId=exId.replace(/_[LR]$/,"");
  var schemeData=useMemo(function(){var ov=getExOverrides(baseExId);if(!ov||!ov.scheme||!SCHEME_PRESETS[ov.scheme])return null;return{type:ov.scheme,sets:SCHEME_PRESETS[ov.scheme](numSets,ov.reps||props.reps||"8-10")}},[baseExId,numSets]);
  var s=useState(function(){var saved=dayData.getData(dayId);var ex=saved.exercises&&saved.exercises[exId];var len=ex?Math.max(numSets,ex.length):numSets;return Array.from({length:len},function(_,i){return ex&&ex[i]?{weight:ex[i].weight||"",reps:ex[i].reps||"",done:!!ex[i].done,extra:i>=numSets||undefined}:{weight:"",reps:"",done:false}})}),data=s[0],setData=s[1];
  var lastSession=useMemo(function(){var h=getHistory(dayId,exId,1);return h.length?h[0].sets:null},[dayId,exId]);
  var save=useCallback(function(d){var all=dayData.getData(dayId);if(!all.exercises)all.exercises={};all.exercises[exId]=d;dayData.saveData(dayId,all)},[dayId,exId,dayData]);
  var persist=useCallback(function(d){save(d);markSessionStart()},[save]);
  var MAX_WEIGHT=1500,MAX_REPS=100;
  var update=function(idx,field,val){if(val!==""&&(isNaN(Number(val))||Number(val)<0))return;if(val!==""&&field==="weight"&&Number(val)>MAX_WEIGHT)return;if(val!==""&&field==="reps"&&Number(val)>MAX_REPS)return;setData(function(prev){var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{[field]:val}):s});save(next);return next})};
  var toggle=function(idx){setData(function(prev){var wasDone=prev[idx].done;var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{done:!s.done}):s});persist(next);if(!wasDone){saveSetTimestamp(idx);if(navigator.vibrate)navigator.vibrate(30);showSaveFlash();if(onSetDone)onSetDone();showUndoToast("Set "+(idx+1)+" logged",function(){setData(function(cur){var reverted=cur.map(function(s,i){return i===idx?Object.assign({},s,{done:false}):s});persist(reverted);if(onSetUpdate)onSetUpdate();return reverted})})}else if(onSetUpdate){onSetUpdate()}return next})};
  var autoFill=function(idx,field){if(lastSession&&lastSession[idx]&&lastSession[idx][field])update(idx,field,lastSession[idx][field])};
  var step=function(idx,field,delta){if(navigator.vibrate)navigator.vibrate(10);setData(function(prev){var cur=parseFloat(prev[idx][field])||0;var val=Math.max(0,cur+delta);var max=field==="weight"?MAX_WEIGHT:MAX_REPS;if(val>max)val=max;var next=prev.map(function(s,i){return i===idx?Object.assign({},s,{[field]:String(val)}):s});save(next);return next})};
  var addExtraSet=function(){setData(function(prev){var last=prev[prev.length-1];var next=prev.concat([{weight:last&&last.weight?last.weight:"",reps:"",done:false,extra:true}]);save(next);return next})};
  var removeExtraSet=function(idx){setData(function(prev){var next=prev.filter(function(_,i){return i!==idx});save(next);if(onSetUpdate)onSetUpdate();return next})};
  /* RIR tracking per set */
  var sr=useState(function(){var saved=dayData.getData(dayId);return saved.setRir&&saved.setRir[exId]||{}}),rirData=sr[0],setRirData=sr[1];
  var saveRir=function(idx,val){var next=Object.assign({},rirData);next[idx]=val;setRirData(next);var all=dayData.getData(dayId);if(!all.setRir)all.setRir={};all.setRir[exId]=next;dayData.saveData(dayId,all);
    /* Intra-session RPE autoregulation: if RIR 0 (failure), suggest weight reduction for remaining sets */
    if(val===0){var curW=data[idx]&&parseFloat(data[idx].weight);if(curW&&curW>0){var newW=unit==="kg"?Math.round(curW*0.95*2)/2:Math.round(curW*0.95/5)*5;if(newW<curW){var hasUndone=data.some(function(s,si){return si>idx&&!s.done});if(hasUndone)showUndoToast("RIR 0 \u2014 consider "+newW+" "+unit+" (-5%) for remaining sets",null,5000)}}}};

  /* Rest period tracking: store timestamp of each set completion */
  var saveSetTimestamp=function(idx){var all=dayData.getData(dayId);if(!all.setTimestamps)all.setTimestamps={};if(!all.setTimestamps[exId])all.setTimestamps[exId]={};all.setTimestamps[exId][idx]=Date.now();dayData.saveData(dayId,all)};
  var firstWeight=null;for(var wi=0;wi<data.length;wi++){if(data[wi].weight){firstWeight=data[wi].weight;break}}
  var hasExtra=data.length>numSets;var lastCol=hasExtra?"62px":"46px";
  var nextSetIdx=data.findIndex(function(s){return!s.done});
  var showApplyAll=firstWeight&&data.some(function(s,i){return i>0&&!s.weight&&!s.done});
  var applyWeightToAll=function(){var w=firstWeight;setData(function(prev){var next=prev.map(function(s){return s.weight?s:Object.assign({},s,{weight:w})});save(next);return next})};

  return h("div",{style:{marginTop:4},"aria-label":"Set logger"},
    h("div",{style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr "+lastCol,gap:5,marginBottom:5}},
      h("span",{style:{fontSize:9,color:"var(--text-dim)",textAlign:"center",fontWeight:700}},"SET"),
      h("button",{onClick:toggleUnit,className:"btn btn--xs",style:{background:"none",border:"none",color:"var(--accent)",padding:0,fontSize:9,fontWeight:700},"aria-label":"Toggle weight unit"},unit.toUpperCase()+" \u21C4"),
      h("span",{style:{fontSize:9,color:"var(--text-dim)",textAlign:"center",fontWeight:700}},"REPS"),
      h("span",null)),
    showApplyAll?h("button",{onClick:applyWeightToAll,className:"btn btn--accent-ghost btn--xs",style:{marginBottom:4,fontSize:10},"aria-label":"Apply weight to all sets"},"Apply "+firstWeight+" "+unit+" to all sets"):null,
    data.map(function(set,i){var ghost=lastSession&&lastSession[i];var ghostWeight=ghost&&ghost.weight?intensityMult?String(unit==="kg"?Math.round(parseFloat(ghost.weight)*intensityMult*2)/2:Math.round(parseFloat(ghost.weight)*intensityMult)):String(ghost.weight):null;var isExtra=i>=numSets;var isNextSet=i===nextSetIdx;
      return h("div",{key:i,className:isExtra?"set-row--extra":"",style:{display:"grid",gridTemplateColumns:"28px 1fr 1fr "+lastCol,gap:5,alignItems:"center",marginBottom:4,background:isNextSet?"rgba(245,158,11,0.06)":"transparent",borderRadius:isNextSet?8:0,padding:isNextSet?"4px 2px":"0"}},
        h("span",{style:{fontSize:12,color:i>=numSets?"var(--accent)":"var(--text-dim)",textAlign:"center",fontWeight:700},title:schemeData&&schemeData.sets[i]?schemeData.sets[i].note:""},i>=numSets?"+"+(i-numSets+1):i+1),
        h("div",{className:"stepper"},
          h("button",{onClick:function(){step(i,"weight",-increment)},className:"stepper-btn","aria-label":"Decrease weight"},"\u2212"),
          h("input",{type:"number",inputMode:"decimal",placeholder:ghostWeight||"\u2014",value:set.weight,onChange:function(e){update(i,"weight",e.target.value)},onFocus:function(){if(!set.done&&!set.weight&&ghostWeight){update(i,"weight",ghostWeight)}},className:"input",style:{opacity:set.done?.55:1},"aria-label":"Set "+(i+1)+" weight"}),
          h("button",{onClick:function(){step(i,"weight",increment)},className:"stepper-btn","aria-label":"Increase weight"},"+")),
        h("div",{className:"stepper"},
          h("button",{onClick:function(){step(i,"reps",-1)},className:"stepper-btn","aria-label":"Decrease reps"},"\u2212"),
          h("input",{type:"number",inputMode:"numeric",placeholder:schemeData&&schemeData.sets[i]?String(schemeData.sets[i].reps):ghost&&ghost.reps?String(ghost.reps):"\u2014",value:set.reps,onChange:function(e){update(i,"reps",e.target.value)},onFocus:function(){if(!set.reps&&ghost&&ghost.reps)autoFill(i,"reps")},className:"input",style:{opacity:set.done?.55:1},"aria-label":"Set "+(i+1)+" reps"}),
          h("button",{onClick:function(){step(i,"reps",1)},className:"stepper-btn","aria-label":"Increase reps"},"+")),
        h("div",{style:{display:"flex",alignItems:"center",gap:2}},
          h("button",{onClick:function(){toggle(i)},className:set.done?"set-check set-check--done set-done-pop":"set-check","aria-label":"Mark set "+(i+1)+(set.done?" incomplete":" complete"),"aria-pressed":set.done?"true":"false"},set.done?"\u2713":""),
          i>=numSets?h("button",{onClick:function(){removeExtraSet(i)},style:{width:28,height:28,borderRadius:6,border:"1px solid var(--danger-border)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"var(--danger)",padding:0},"aria-label":"Remove extra set"},"\u2715"):null),
        set.done&&getPref("showRir",true)?h("div",{style:{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:4,marginBottom:2,marginTop:-2}},
          h("span",{style:{fontSize:9,color:"var(--text-dim)",fontWeight:600,width:28,textAlign:"center"}},"RIR"),
          [0,1,2,3,4].map(function(r){var active=rirData[i]===r;var color=r===0?"var(--danger)":r<=1?"var(--warning)":r<=2?"var(--accent)":"var(--success)";return h("button",{key:r,onClick:function(){saveRir(i,r)},style:{padding:"2px 6px",borderRadius:4,fontSize:9,fontWeight:700,border:active?"1px solid "+color:"1px solid rgba(255,255,255,0.06)",background:active?"rgba(255,255,255,0.06)":"transparent",color:active?color:"var(--text-dim)",cursor:"pointer"},"aria-label":r+" reps in reserve"},r)})):null)}),
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
  var colors={6:"var(--success)",7:"var(--lime)",8:"var(--accent)",9:"var(--warning)",10:"var(--danger)"};
  return h("div",{className:"fade-in",style:{marginTop:8,padding:"8px 0"},"aria-label":"RPE rating"},
    h("div",{style:{fontSize:11,fontWeight:700,color:"var(--text-dim)",marginBottom:6}},"How hard was that? (RPE)"),
    h("div",{style:{display:"flex",gap:4},role:"radiogroup","aria-label":"Rate perceived exertion"},[6,7,8,9,10].map(function(val){var active=rpe===val;
      return h("button",{key:val,onClick:function(){save(val)},className:"rpe-btn",style:{border:active?"2px solid "+colors[val]:"1px solid rgba(255,255,255,0.08)",background:active?"rgba(255,255,255,0.06)":"transparent"},role:"radio","aria-checked":active?"true":"false","aria-label":"RPE "+val+" - "+labels[val]},
        h("div",{style:{fontSize:15,fontWeight:800,color:active?colors[val]:"var(--text-dim)"}},val),
        h("div",{style:{fontSize:8,fontWeight:600,color:active?"var(--text-secondary)":"var(--text-dim)",marginTop:1}},labels[val]))})),
    rpe?h("div",{style:{fontSize:11,color:rpe>=9?"var(--warning)":"var(--text-dim)",marginTop:4,fontStyle:"italic"},"aria-live":"polite"},rpe<=7?"Good \u2014 room to progress next session.":rpe===8?"Solid \u2014 right in the hypertrophy zone.":rpe===9?"Tough \u2014 repeat this weight next session, focus on form.":"Max effort \u2014 drop 5-10% next session. Consider a deload if this persists."):null);
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
var SCHEME_TYPES=[{id:"straight",label:"Straight"},{id:"pyramid",label:"Pyramid \u25B2"},{id:"drop",label:"Drop Set \u25BC"},{id:"cluster",label:"Cluster"}];
var SCHEME_PRESETS={pyramid:function(sets,reps){var r=parseRepRange(reps);return Array.from({length:sets},function(_,i){var shift=Math.round((r.max-r.min)*i/(sets-1||1));return{reps:Math.max(1,r.max-shift),note:i===0?"Light":"+"+(i*5)+"%"}})},
  drop:function(sets,reps){var r=parseRepRange(reps);return Array.from({length:sets},function(_,i){return{reps:Math.min(r.max+i*2,30),note:i===0?"Top set":"-"+(i*10)+"%"}})},
  cluster:function(sets,reps){var r=parseRepRange(reps);return Array.from({length:sets},function(){return{reps:Math.max(1,Math.ceil(r.min/2)),note:"Rest-pause"}})}};

function ExerciseOverrideEditor(props){
  var exId=props.exId,exercise=props.exercise;
  var so=useState(false),showEdit=so[0],setShowEdit=so[1];
  var overrides=getExOverrides(exId)||{};
  var sf=useState({sets:overrides.sets||"",reps:overrides.reps||"",rest:overrides.rest||"",scheme:overrides.scheme||""}),form=sf[0],setForm=sf[1];
  var upd=function(f,v){setForm(Object.assign({},form,{[f]:v}))};
  var save=function(){var ov={};["sets","reps","rest","scheme"].forEach(function(k){if(form[k])ov[k]=form[k]});if(Object.keys(ov).length){lsSet("exo_"+exId,ov)}else{clearExOverrides(exId)}setShowEdit(false);showUndoToast("Exercise updated",null,2000);if(props.onUpdate)props.onUpdate()};
  var reset=function(){clearExOverrides(exId);setForm({sets:"",reps:"",rest:"",scheme:""});setShowEdit(false);showUndoToast("Reset to defaults",null,2000);if(props.onUpdate)props.onUpdate()};
  var hasOverrides=overrides.sets||overrides.reps||overrides.rest||overrides.scheme;
  var schemePreview=form.scheme&&form.scheme!=="straight"&&SCHEME_PRESETS[form.scheme]?SCHEME_PRESETS[form.scheme](parseInt(form.sets)||exercise.sets,form.reps||exercise.reps):null;
  return h("div",{style:{marginTop:4}},
    h("button",{type:"button",onClick:function(){setShowEdit(!showEdit)},style:{fontSize:11,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",padding:"8px 0",minHeight:44,display:"flex",alignItems:"center",gap:4}},
      "\u270E Customize",hasOverrides?" (modified)":""),
    showEdit&&h("div",{className:"fade-in",style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:6}},
      h("div",null,h("label",{style:{fontSize:9,fontWeight:700,color:"var(--text-dim)"}},"SETS"),h("input",{type:"number",inputMode:"numeric",value:form.sets,placeholder:String(exercise.sets),onChange:function(e){upd("sets",e.target.value)},className:"input",style:{fontSize:12}})),
      h("div",null,h("label",{style:{fontSize:9,fontWeight:700,color:"var(--text-dim)"}},"REPS"),h("input",{type:"text",value:form.reps,placeholder:exercise.reps,onChange:function(e){upd("reps",e.target.value)},className:"input",style:{fontSize:12}})),
      h("div",null,h("label",{style:{fontSize:9,fontWeight:700,color:"var(--text-dim)"}},"REST (s)"),h("input",{type:"number",inputMode:"numeric",value:form.rest,placeholder:String(exercise.rest),onChange:function(e){upd("rest",e.target.value)},className:"input",style:{fontSize:12}})),
      h("div",{style:{gridColumn:"1 / -1"}},h("label",{style:{fontSize:9,fontWeight:700,color:"var(--text-dim)"}},"SCHEME"),
        h("div",{style:{display:"flex",gap:4,marginTop:2}},SCHEME_TYPES.map(function(st){return h("button",{key:st.id,onClick:function(){upd("scheme",st.id==="straight"?"":st.id)},className:"btn btn--xs",style:{flex:1,background:(form.scheme||"straight")===st.id?"var(--accent-bg)":"transparent",color:(form.scheme||"straight")===st.id?"var(--accent)":"var(--text-dim)",border:"1px solid "+((form.scheme||"straight")===st.id?"var(--accent-border)":"var(--border)")}},st.label)}))),
      schemePreview?h("div",{style:{gridColumn:"1 / -1",background:"var(--surface-alt)",borderRadius:6,padding:8}},
        h("div",{style:{fontSize:9,fontWeight:700,color:"var(--text-dim)",marginBottom:4}},"SET PREVIEW"),
        schemePreview.map(function(sp,i){return h("div",{key:i,style:{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-secondary)",padding:"2px 0"}},h("span",null,"Set "+(i+1)+": "+sp.reps+" reps"),h("span",{style:{color:"var(--text-dim)"}},sp.note))})):null,
      h("button",{onClick:save,className:"btn btn--accent btn--sm",style:{gridColumn:"1 / -1"}},"Save"),
      hasOverrides?h("button",{onClick:reset,className:"btn btn--ghost btn--xs",style:{gridColumn:"1 / -1"}},"Reset to Default"):null));
}

function CardExtras(props){
  var exId=props.exId,dayId=props.dayId,isMachine=props.isMachine,exercise=props.exercise;
  var s=useState(false),show=s[0],setShow=s[1];
  return h("div",{style:{marginTop:8}},
    h("button",{onClick:function(){setShow(!show)},style:{fontSize:11,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",padding:"4px 0",display:"flex",alignItems:"center",gap:4},"aria-expanded":show?"true":"false"},
      h("span",{style:{fontSize:8,transform:show?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block"}},"\u25B6"),
      "Warmups & Setup"),
    show&&h("div",{className:"fade-in",style:{marginTop:4}},
      h(MachineWeightInput,{exId:exId,isMachine:isMachine}),
      h(WarmupSets,{exId:exId,dayId:dayId}),
      h(ExerciseOverrideEditor,{exId:exId,exercise:exercise,onUpdate:props.onUpdate})));
}

function ExerciseCard(props){
  var exercise=props.exercise,index=props.index,dayId=props.dayId,onSetUpdate=props.onSetUpdate,isNext=props.isNext,supersetGroup=props.supersetGroup,supersetPartner=props.supersetPartner,onSwap=props.onSwap;/* supersetPartnerExId accessed via props */
  var unit=getExUnit(exercise.id);
  var dayData=useDayData();var timers=useTimers();
  var s=useState(!!props.isNext),expanded=s[0],setExpanded=s[1];
  var st=useState("log"),activeTab=st[0],setActiveTab=st[1];
  var sswap=useState(false),showSwapMenu=sswap[0],setShowSwapMenu=sswap[1];
  var ssq=useState(""),swapSearch=ssq[0],setSwapSearch=ssq[1];
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
    if(!isDeloadWeek)return null;var hist=getBilateralHistory(dayId,exercise,1);if(!hist.length)return null;var comp=hist[0].sets.filter(function(s){return s.done&&s.weight});if(!comp.length)return null;var w=parseFloat(comp[0].weight)||0;var intensityStrat=DELOAD_STRATEGIES.find(function(s){return s.id==="intensity"});var deloadFactor=intensityStrat?intensityStrat.factor:0.55;return w>0?Math.round(w*deloadFactor):null;
  },[dayId,exercise,isDeloadWeek,deloadMod]);
  var e1rm=useMemo(function(){var best=0;var checkData=isBilateral?[].concat(saved.exercises&&saved.exercises[exercise.id+"_L"]||[],saved.exercises&&saved.exercises[exercise.id+"_R"]||[]):[exData||[]].flat();checkData.forEach(function(s){if(s&&s.done&&s.weight&&s.reps){var e=calc1RM(s.weight,s.reps);if(e>best)best=e}});return best},[exData,isBilateral?dayData.rev:null]);
  /* PR detection */
  var isPR=useMemo(function(){
    if(e1rm<=0)return false;
    var hist=getBilateralHistory(dayId,exercise,30);
    var histBest=0;hist.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var e=calc1RM(s.weight,s.reps);if(e>histBest)histBest=e}})});
    return hist.length>0&&e1rm>histBest;
  },[e1rm,dayId,exercise]);
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
  },[exKey,exercise.rest,onSetUpdate,timers,supersetGroup,dayId,props.supersetPartnerExId]);
  var onQuickLog=useCallback(function(){bumpDataRev(function(r){return r+1});if(onSetUpdate)onSetUpdate()},[onSetUpdate]);
  var cardClass="card"+(skipped?" card--skipped":"")+(allDone&&!skipped?" card--done":"")+(isNext&&!allDone&&!skipped&&completedSets===0?" card--next":"");
  return h("div",{className:cardClass,style:{position:"relative"},"aria-label":exercise.name},
    supersetGroup?h("div",{className:"superset-line","aria-hidden":"true"}):null,
    h("div",{onClick:function(){setExpanded(!expanded)},onKeyDown:function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();setExpanded(!expanded)}},tabIndex:0,style:{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,WebkitUserSelect:"none",userSelect:"none"},role:"button","aria-expanded":expanded?"true":"false"},
      h("div",{style:{flex:1}},
        h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
          h("span",{className:allDone?"badge badge--success":"badge badge--accent"},index+1),
          h("span",{style:{fontSize:14,fontWeight:700,color:allDone?"var(--text-dim)":"var(--text-bright)",lineHeight:1.3,textDecoration:allDone?"line-through":"none",textDecorationColor:"rgba(34,197,94,0.6)",textDecorationThickness:2}},exercise.name),
          supersetGroup?h("span",{className:"superset-badge"},"SS"):null,
          h("button",{onClick:function(e){e.stopPropagation();setShowSwapMenu(!showSwapMenu)},style:{background:"none",border:"1px solid var(--info-border)",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:"var(--info)",lineHeight:"16px",minHeight:28},"aria-label":"Swap exercise"},"\u21C4"),
          function(){
            var badges=[];
            if(isNext&&!allDone&&completedSets===0)badges.push(h("span",{key:"next",className:"badge badge--accent",style:{letterSpacing:.5}},"UP NEXT"));
            if(isNext&&!allDone&&completedSets>0)badges.push(h("span",{key:"prog",className:"badge badge--info",style:{letterSpacing:.5}},"IN PROGRESS"));
            if(skipped)badges.push(h("span",{key:"skip",className:"badge",style:{color:"var(--text-dim)",background:"rgba(255,255,255,0.06)",letterSpacing:.5}},"SKIPPED"));
            if(overload&&!allDone)badges.push(h("span",{key:"ol",className:overload.type==="hold"?"badge badge--info":overload.type==="volume"?"badge badge--accent":"badge badge--success"},overload.type==="hold"?"\u23F8 Hold":overload.type==="volume"?"+1 Set":overload.type==="reps"?"\u2191 Reps":"\u2191 "+overload.to+" "+unit));
            if(deloadMod&&deloadMod.skip&&!allDone)badges.push(h("span",{key:"dlsk",className:"badge badge--info"},"\uD83E\uDDD8 Recovery"));
            if(deloadSuggestion&&!allDone)badges.push(h("span",{key:"dl",className:"badge badge--accent"},"\u2193 ~"+deloadSuggestion));
            if(readinessAdj&&!allDone)badges.push(h("span",{key:"rd",className:"badge badge--info"},readinessAdj.level==="low"?"\u26A0 Light":"\u2193 Adj"));
            if(!expanded&&badges.length>2){var extra=badges.length-2;badges=badges.slice(0,2);badges.push(h("span",{key:"more",className:"badge",style:{color:"var(--text-dim)",background:"rgba(255,255,255,0.06)",fontSize:9}},"+"+extra+" more"))}
            return badges;
          }()),
        h("div",{style:{display:"flex",alignItems:"center",gap:6,marginTop:3}},
          h("span",{style:{fontSize:11,color:"var(--text-dim)"}},exercise.sets+"\u00D7"+exercise.reps+" \u00B7 "+restLabel),
          completedSets>0?h("span",{className:allDone?"badge badge--success":"badge badge--accent"},completedSets+"/"+(isBilateral?exercise.sets*2:exercise.sets)):null,
          e1rm>0?h("span",{className:isPR?"badge badge--success":"badge badge--info"},isPR?"\uD83C\uDF89 PR! e1RM "+e1rm+" "+unit:"e1RM "+e1rm+" "+unit):null,
          timerRunning&&!expanded?h("span",{className:"timer-active",style:{width:6,height:6,borderRadius:3,background:"var(--accent)"}}):null),
        !expanded?h("div",{style:{fontSize:11,color:"var(--text-dim)",marginTop:2,fontStyle:"italic"}},exercise.notes):null),
      h("span",{style:{fontSize:16,color:"var(--text-dim)",transform:expanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",marginTop:2,flexShrink:0},"aria-hidden":"true"},"\u25BE")),
    showSwapMenu?h("div",{className:"fade-in",style:{padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
      exercise._swappedFrom?h("div",{style:{display:"flex",alignItems:"center",gap:4,marginBottom:4,flexWrap:"wrap"}},
        h("span",{style:{fontSize:10,color:"var(--info)"}},"\u21C4 from "+exercise._swappedFrom),
        exercise._permanentSwap?h("span",{className:"badge badge--info"},"Permanent"):null,
        h("button",{onClick:function(){clearSwap(dayId,exercise.id);if(exercise._permanentSwap)clearPermanentSwap(dayId,exercise.id);setShowSwapMenu(false);if(onSwap)onSwap(exercise.id,null)},className:"btn btn--ghost btn--xs",style:{fontSize:9}},"Revert")):null,
      exercise.alternatives?h("div",{style:{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}},
        exercise.alternatives.map(function(alt){return h(React.Fragment,{key:alt},
          h("button",{onClick:function(){if(onSwap)onSwap(exercise.id,alt,false);setShowSwapMenu(false)},className:"btn btn--info btn--xs"},alt),
          h("button",{onClick:function(){if(onSwap)onSwap(exercise.id,alt,true);setShowSwapMenu(false)},className:"btn btn--xs",style:{color:"var(--info)",background:"none",border:"1px solid var(--info-border)",fontSize:9}},"\uD83D\uDD12"))})):null,
      h("div",{style:{marginTop:4}},
        h("input",{type:"text",value:swapSearch,onChange:function(e){setSwapSearch(e.target.value)},placeholder:"Search all exercises\u2026",style:{width:"100%",padding:"6px 8px",background:"var(--surface-alt)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11},onClick:function(e){e.stopPropagation()}}),
        swapSearch.length>=2?h("div",{style:{maxHeight:120,overflowY:"auto",marginTop:4}},(function(){
          var q=swapSearch.toLowerCase();var lib=props.exerciseLibrary||[];
          var matches=lib.filter(function(ex){return ex.name.toLowerCase().indexOf(q)>=0&&ex.name!==exercise.name});
          if(matches.length===0)return h("div",{style:{fontSize:10,color:"var(--text-dim)",padding:4}},"No matches. Type a custom name and tap Swap.");
          return matches.slice(0,8).map(function(ex){return h("button",{key:ex.name,onClick:function(){if(onSwap)onSwap(exercise.id,ex.name,false);setShowSwapMenu(false);setSwapSearch("")},className:"btn btn--ghost btn--xs",style:{display:"block",width:"100%",textAlign:"left",padding:"4px 6px",fontSize:11}},ex.name,ex.muscles.length?h("span",{style:{color:"var(--text-dim)",fontSize:9,marginLeft:4}},ex.muscles.slice(0,2).join(", ")):null)})
        })()):null,
        swapSearch.length>=2?h("button",{onClick:function(){if(onSwap)onSwap(exercise.id,swapSearch,false);setShowSwapMenu(false);setSwapSearch("")},className:"btn btn--accent btn--xs",style:{marginTop:4,width:"100%"}},"Swap to \""+swapSearch+"\""):null)):null,
    !expanded&&isNext&&!allDone?h(QuickLogBtn,{exId:bilateralExId,numSets:exercise.sets,dayId:dayId,exKey:exKey,rest:exercise.rest,onLog:onQuickLog}):null,
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
        h(SetLogger,{key:bilateralExId+"_"+dataRev,exId:bilateralExId,numSets:readinessAdj?Math.max(1,Math.round(exercise.sets*readinessAdj.volumeMult)):exercise.sets,dayId:dayId,onSetUpdate:onSetUpdate,onSetDone:onToggleDone,exKey:exKey,rest:exercise.rest,isMachine:!!exercise.machine,increment:exercise.increment||(exercise.machine?2.5:5),intensityMult:readinessAdj?readinessAdj.intensityMult:null}),
        h(QuickLogBtn,{exId:bilateralExId,numSets:exercise.sets,dayId:dayId,exKey:exKey,rest:exercise.rest,onLog:onQuickLog}),
        h(RestTimer,{exKey:exKey,defaultSeconds:exercise.rest}),
        exercise.tempo?h(TempoTimer,{tempo:exercise.tempo}):null,
        supersetPartner?h("div",{style:{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:8,marginTop:4}},
          h("span",{className:"superset-badge"},"SS"),
          h("span",{style:{fontSize:11,fontWeight:600,color:"var(--info)"}},"Superset with: "+supersetPartner),
          timerData&&timerData.waitingPartner?h("span",{style:{fontSize:10,fontWeight:700,color:"var(--accent)",marginLeft:4}},"\u2192 Do "+supersetPartner+" now"):null,
          h("span",{style:{fontSize:10,color:"var(--text-dim)"}},"Alternate sets, minimal rest")):null,
        h(RPERating,{exId:exercise.id,dayId:dayId,allDone:allDone}),
        h(ExerciseNotes,{exId:exercise.id,dayId:dayId}),
        h(CardExtras,{exId:exercise.id,dayId:dayId,isMachine:!!exercise.machine,exercise:exercise,onUpdate:onSetUpdate}),
        !allDone?h("button",{onClick:toggleSkip,className:skipped?"btn btn--ghost btn--sm":"btn btn--ghost btn--sm",style:{marginTop:8,opacity:0.6}},skipped?"\u21A9 Undo Skip":"\u23ED Skip Exercise"):null),
      activeTab==="history"&&h("div",{role:"tabpanel"},
        exercise._swappedFrom?h("div",{style:{fontSize:11,color:"var(--info)",marginBottom:6}},"\u21C4 Swapped from ",h("strong",null,exercise._swappedFrom)," for this session"):null,
        h(HistoryPanel,{dayId:dayId,exId:exercise.id,exercise:exercise})),
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
      h("div",{style:{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"},role:"radiogroup","aria-label":"Cardio type"},CARDIO_TYPES.map(function(ct){var active=ct.id===(data.type||"treadmill");return h("button",{key:ct.id,onClick:function(){switchType(ct.id)},style:{padding:"4px 10px",borderRadius:6,border:active?"1px solid var(--accent-border)":"1px solid rgba(255,255,255,0.08)",background:active?"var(--accent-bg)":"transparent",color:active?"var(--accent)":"var(--text-dim)",fontSize:10,fontWeight:600,cursor:"pointer"},role:"radio","aria-checked":active?"true":"false"},ct.icon+" "+ct.label)})),
      h("div",{style:{display:"grid",gridTemplateColumns:"repeat("+Math.min(cardioType.fields.length,3)+", 1fr)",gap:8,marginBottom:10}},cardioType.fields.map(function(f){var fieldLabel=f.key==="speed"?speedLabel.toUpperCase():f.label;return h("div",{key:f.key},h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:4}},fieldLabel),f.type==="text"?h("input",{type:"text",value:data[f.key]||"",onChange:function(e){update(f.key,e.target.value)},placeholder:"...",className:"input input--text","aria-label":fieldLabel}):h("input",{type:"number",inputMode:f.type==="decimal"?"decimal":"numeric",value:data[f.key]||"",onChange:function(e){update(f.key,e.target.value)},className:"input","aria-label":fieldLabel}))})),
      h("button",{onClick:toggleDone,className:data.done?"btn btn--success-ghost btn--full":"btn btn--ghost btn--full"},data.done?"\u2713 Completed":"Mark Complete")));
}

/* ── Bilateral helper ── */
function countBilateralDone(ex,saved,effectiveOnly){
  var rirData=effectiveOnly&&saved.setRir?saved.setRir:null;
  var isEffective=function(exId,idx){
    if(!rirData||!rirData[exId])return true;/* No RIR data = count the set */
    var rir=rirData[exId][idx];
    return rir===undefined||rir===null||rir<=2;
  };
  if(ex.bilateral){
    var l=saved.exercises&&saved.exercises[ex.id+"_L"];var r=saved.exercises&&saved.exercises[ex.id+"_R"];
    var lCount=l?l.filter(function(s,i){return s.done&&isEffective(ex.id+"_L",i)}).length:0;
    var rCount=r?r.filter(function(s,i){return s.done&&isEffective(ex.id+"_R",i)}).length:0;
    return Math.min(lCount,ex.sets)+Math.min(rCount,ex.sets);
  }
  var d=saved.exercises&&saved.exercises[ex.id];
  return d?Math.min(d.filter(function(s,i){return s.done&&isEffective(ex.id,i)}).length,ex.sets):0;
}
function getBilateralSets(ex,saved){
  if(ex.bilateral){return[].concat(saved.exercises&&saved.exercises[ex.id+"_L"]||[],saved.exercises&&saved.exercises[ex.id+"_R"]||[])}
  return saved.exercises&&saved.exercises[ex.id]||[];
}
function totalSetsFor(ex){return ex.bilateral?ex.sets*2:ex.sets}

/* ── Weekly Volume ── */
var MUSCLE_LABELS={chest:"Chest",back:"Back",quads:"Quads",hamstrings:"Hams",glutes:"Glutes",front_delt:"Front Delt",side_delt:"Side Delt",rear_delt:"Rear Delt",biceps:"Biceps",triceps:"Triceps",calves:"Calves",abs:"Abs"};

/* calcVolumeForWeek(config, mondayDate, dayData?) — counts done sets per muscle for any Mon-Sun block.
   mondayDate: Date object for Monday. dayData: DayDataContext (optional, for today's live data). */
function calcVolumeForWeek(config,mondayDate,dayData){
  var vol={};var found=false;
  var fmtD=function(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
  config.days.forEach(function(day){
    var allEx=day.exercises.concat(getCustomExercises(day.id));
    for(var d=0;d<7;d++){
      var check=new Date(mondayDate);check.setDate(mondayDate.getDate()+d);
      var dateStr=fmtD(check);
      var saved=dateStr===getSessionDate()&&dayData?dayData.getData(day.id):(getIndexDataForDate(day.id,dateStr)||loadDayData(day.id,dateStr));
      allEx.forEach(function(ex){var muscles=ex.muscles||[];var doneSets=countBilateralDone(ex,saved,true);if(doneSets>0){found=true;muscles.forEach(function(m){if(!vol[m])vol[m]=0;vol[m]+=doneSets})}});
    }
  });
  return found||dayData?vol:null;
}
function calcWeeklyVolume(config,dayData){
  var now=new Date();var dow=now.getDay();
  var mon=new Date(now);mon.setDate(now.getDate()-((dow+6)%7));mon.setHours(0,0,0,0);
  return calcVolumeForWeek(config,mon,dayData)||{};
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
  var rawTargets=useMemo(function(){return getVolumeTargets()},[]);
  var mesoWeek=getMesocycle().week;
  var MESO_VOL_FACTOR={1:0.85,2:1.0,3:1.1,4:0.5};
  var mesoFactor=MESO_VOL_FACTOR[mesoWeek]||1.0;
  var targets=useMemo(function(){var scaled={};Object.keys(rawTargets).forEach(function(m){var t=rawTargets[m]||[10,20];scaled[m]=[Math.round(t[0]*mesoFactor),Math.round(t[1]*mesoFactor)]});return scaled},[rawTargets,mesoFactor]);
  var muscleKeys=Object.keys(MUSCLE_LABELS);
  var maxSets=Math.max(20,...muscleKeys.map(function(m){return vol[m]||0}));
  var se=useState(false),editing=se[0],setEditing=se[1];
  var ste=useState(rawTargets),editTargets=ste[0],setEditTargets=ste[1];
  var saveTargets=function(){setVolumeTargets(editTargets);setEditing(false)};
  var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Weekly Volume"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Weekly Volume"),
      h("div",{style:{display:"flex",gap:8}},h("button",{onClick:function(){setEditing(!editing)},className:"btn btn--ghost btn--xs"},editing?"Cancel":"Targets"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close"},"\u2715"))),
    mesoFactor!==1.0?h("div",{style:{fontSize:10,color:"var(--info)",marginBottom:8,fontStyle:"italic"}},"Wk "+mesoWeek+" targets scaled to "+Math.round(mesoFactor*100)+"% of base"):null,
    h("div",{style:{fontSize:11,color:"var(--text-dim)",marginBottom:14}},"Sets completed this week per muscle group."),
    !muscleKeys.some(function(m){return vol[m]>0})?h("div",{style:{textAlign:"center",padding:"24px 16px",color:"var(--text-dim)"}},h("div",{style:{fontSize:28,marginBottom:8}},"\uD83D\uDCCA"),h("div",{style:{fontSize:13,fontWeight:600,marginBottom:4}},"No volume logged this week"),h("div",{style:{fontSize:11}},"Complete sets in your workouts to see volume tracking here.")):null,
    muscleKeys.map(function(m){
      var sets=vol[m]||0;var target=targets[m]||[10,20];var pct=sets/maxSets;
      var color=sets===0?"var(--text-dim)":sets<target[0]?"var(--accent)":sets>target[1]?"var(--danger)":"var(--success)";
      var label=sets===0?"\u2014":sets<target[0]?"Low":sets>target[1]?"High":"Good";
      return h("div",{key:m,style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
        h("div",{style:{width:70,fontSize:11,fontWeight:600,color:"var(--text-secondary)",textAlign:"right",flexShrink:0}},MUSCLE_LABELS[m]),
        editing?h("div",{style:{display:"flex",gap:4,flex:1,alignItems:"center"}},
          h("input",{type:"number",inputMode:"numeric",min:"0",value:editTargets[m]?editTargets[m][0]:"",onChange:function(e){var t=Object.assign({},editTargets);t[m]=[Math.max(0,parseInt(e.target.value,10)||0),(t[m]||[10,20])[1]];setEditTargets(t)},className:"input input--sm",style:{width:40}}),
          h("span",{style:{fontSize:9,color:"var(--text-dim)"}},"-"),
          h("input",{type:"number",inputMode:"numeric",min:"0",value:editTargets[m]?editTargets[m][1]:"",onChange:function(e){var t=Object.assign({},editTargets);t[m]=[(t[m]||[10,20])[0],Math.max(0,parseInt(e.target.value,10)||0)];setEditTargets(t)},className:"input input--sm",style:{width:40}})
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
  var now=new Date();var dow=now.getDay();
  var mon=new Date(now);mon.setDate(now.getDate()-((dow+6)%7)-7);mon.setHours(0,0,0,0);
  return calcVolumeForWeek(config,mon,null);
}

/* ── Deload Check ── */
function getDeloadWarning(config){
  var warnings=[];
  config.days.forEach(function(day){day.exercises.forEach(function(ex){
    var hist=getBilateralHistory(day.id,ex,10);var recentRpe=[];
    hist.slice(0,3).forEach(function(entry){if(entry.data.rpe&&entry.data.rpe[ex.id])recentRpe.push(entry.data.rpe[ex.id])});
    if(recentRpe.length>=2){var avg=recentRpe.reduce(function(a,b){return a+b},0)/recentRpe.length;if(avg>=9&&warnings.indexOf(ex.name)===-1)warnings.push(ex.name)}
  })});
  return warnings.length>0?warnings:null;
}

/* ── Mesocycle & Periodization ── */
var MESO_WEEK_LABELS={1:"Accumulation (moderate load, higher reps)",2:"Intensification (heavier load, moderate reps)",3:"Peak (heavy load, lower reps)",4:"Deload (light load, recovery)"};
var MESO_REP_SHIFT={1:0,2:-1,3:-2,4:4};/* Shift to rep range: 0=normal, -1=lower target, -2=even lower, +4=higher for deload */
function getMesocycle(){var m=lsGet("mesocycle")||{week:1,startDate:today(),mode:"linear"};if(!m.week||m.week<1||m.week>4)m.week=1;return m}
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
  var onClose=props.onClose;var unit=getUnit();var metricsKey="metrics_"+today();var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var s=useState(function(){return lsGet(metricsKey)||{bodyweight:"",waist:"",notes:"",arms:"",chest:"",quads:""}}),data=s[0],setData=s[1];
  var sm=useState(false),showMore=sm[0],setShowMore=sm[1];
  var save=function(d){setData(d);lsSet(metricsKey,d)};var update=function(field,val){save(Object.assign({},data,{[field]:val}))};
  var history=useMemo(function(){var results=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.startsWith(LS+"metrics_")){var date=k.slice((LS+"metrics_").length);if(date===today())continue;try{var d=JSON.parse(localStorage.getItem(k));if(d&&(d.bodyweight||d.waist))results.push({date:date,bw:d.bodyweight,waist:d.waist})}catch(e){}}}results.sort(function(a,b){return b.date.localeCompare(a.date)});return results.slice(0,10)},[]);
  var wLabel=unit==="kg"?"BODYWEIGHT (kg)":"BODYWEIGHT (lbs)";var mLabel=unit==="kg"?"WAIST (cm)":"WAIST (inches)";var cmIn=unit==="kg"?"cm":"in";
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Body Metrics"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Body Metrics"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close"},"\u2715")),
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
        var toPath=function(vals){var mn=Math.min(...vals),mx=Math.max(...vals);var range=mx-mn||1;return vals.map(function(v,i){return(pad+i*(W-2*pad)/(vals.length-1))+","+(pad+(1-(v-mn)/range)*(H-2*pad))}).join(" ")};
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
    history.length>0?h("div",{style:{marginTop:4}},h("div",{style:{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:8}},"Recent Entries"),h("div",{style:{maxHeight:200,overflowY:"auto"}},history.map(function(entry){var label=formatDate(entry.date);return h("div",{key:entry.date,style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:12}},h("span",{style:{color:"var(--text-dim)",fontWeight:600}},label),h("div",{style:{display:"flex",gap:12}},entry.bw?h("span",{style:{color:"var(--text-primary)"}},entry.bw+" "+unit):null,entry.waist?h("span",{style:{color:"var(--text-secondary)"}},entry.waist+(unit==="kg"?" cm":'"')):null))}))):null));
}

/* ── Completion Summary ── */
function calcWorkoutStreak(){
  var hist=lsGet("session_history")||[];if(!hist.length)return 0;
  /* Count consecutive weeks with at least 1 session */
  var now=new Date();var streak=0;
  for(var w=0;w<52;w++){
    var weekStart=new Date(now);weekStart.setDate(now.getDate()-((now.getDay()+6)%7)-w*7);weekStart.setHours(0,0,0,0);
    var weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+7);
    var fD=function(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
    var wStart=fD(weekStart),wEnd=fD(weekEnd);
    var found=hist.some(function(s){return s.date>=wStart&&s.date<wEnd});
    if(found)streak++;else break;
  }
  return streak;
}

function calcSessionStats(day,customs){
  var allEx=day.exercises.concat(customs||[]);var saved=loadDayData(day.id);var totalVolume=0,totalSets=0,prs=[],rpeValues=[];
  allEx.forEach(function(ex){var sets=getBilateralSets(ex,saved);if(!sets.length)return;sets.forEach(function(s){if(s.done&&s.weight&&s.reps){totalVolume+=parseFloat(s.weight)*parseInt(s.reps);totalSets++}});if(saved.rpe&&saved.rpe[ex.id])rpeValues.push(saved.rpe[ex.id]);var maxW=0;sets.forEach(function(s){if(s.done&&s.weight){var w=parseFloat(s.weight);if(w>maxW)maxW=w}});if(maxW>0){var hist=getBilateralHistory(day.id,ex,10);var hMax=0;hist.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight){var w=parseFloat(s.weight);if(w>hMax)hMax=w}})});if(maxW>hMax&&hMax>0)prs.push({name:ex.name,weight:maxW,prev:hMax})}});
  var dur=getSessionStart()?Math.floor((Date.now()-getSessionStart())/1000):0;var avgRpe=rpeValues.length>0?rpeValues.reduce(function(a,b){return a+b},0)/rpeValues.length:null;var cardio=lsGet("cardio_"+day.id+"_"+getSessionDate());
  return{totalVolume:totalVolume,totalSets:totalSets,prs:prs,duration:dur,avgRpe:avgRpe,cardio:cardio&&cardio.done};
}

function CompletionSummary(props){
  var day=props.day,onClose=props.onClose,customs=props.customs;var unit=getUnit();var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var stats=useMemo(function(){return calcSessionStats(day,customs)},[day,customs]);
  var streak=useMemo(function(){return calcWorkoutStreak()},[]);
  useEffect(function(){saveSessionSummary(day,customs)},[]);
  var shareText=useMemo(function(){return generateShareText(day,stats,unit)},[day,stats,unit]);
  var handleShare=function(){if(navigator.share){navigator.share({text:shareText}).catch(function(){})}else{navigator.clipboard.writeText(shareText).then(function(){showUndoToast("Copied to clipboard!",null,2000)}).catch(function(){showUndoToast("Failed to copy \u2014 try long-pressing the text",null,3000)})}};
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Workout Complete"},
    h("div",{className:"sheet celebrate",ref:sheetRef},
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
      streak>1?h("div",{style:{textAlign:"center",fontSize:13,fontWeight:700,color:"var(--accent)",marginBottom:8}},"\uD83D\uDD25 "+streak+" week streak!"):null,
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
  if(hist.length>100)hist=hist.slice(0,100);lsSet(key,hist);
}

function SessionHistory(props){
  var onClose=props.onClose;var unit=getUnit();var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var hist=useMemo(function(){return lsGet("session_history")||[]},[]);
  var sc=useState(null),compareIdx=sc[0],setCompareIdx=sc[1];
  var sd=useState(false),showDetail=sd[0],setShowDetail=sd[1];

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
      /* Per-exercise detail comparison */
      var exerciseDetail=null;
      if(showDetail){
        var tData=loadDayData(target.dayId,target.date);
        var pData=loadDayData(prev.dayId,prev.date);
        var allExIds={};
        if(tData.exercises)Object.keys(tData.exercises).forEach(function(k){allExIds[k]=true});
        if(pData.exercises)Object.keys(pData.exercises).forEach(function(k){allExIds[k]=true});
        var rows=[];
        Object.keys(allExIds).forEach(function(exId){
          var tSets=(tData.exercises&&tData.exercises[exId])||[];
          var pSets=(pData.exercises&&pData.exercises[exId])||[];
          var tDone=tSets.filter(function(s){return s.done});
          var pDone=pSets.filter(function(s){return s.done});
          if(!tDone.length&&!pDone.length)return;
          var bestW=function(sets){var m=0;sets.forEach(function(s){var w=parseFloat(s.weight)||0;if(w>m)m=w});return m};
          var tw=bestW(tDone),pw=bestW(pDone);
          var name=exId.replace(/_L$|_R$/,"").replace(/_/g," ");
          rows.push({name:name,tSets:tDone.length,pSets:pDone.length,tw:tw,pw:pw,wDelta:tw-pw});
        });
        exerciseDetail=h("div",{style:{marginTop:8,borderTop:"1px solid var(--border)",paddingTop:8}},
          rows.length===0?h("div",{style:{fontSize:11,color:"var(--text-dim)",fontStyle:"italic"}},"No exercise data available"):
          rows.map(function(r){
            var wColor=r.wDelta>0?"var(--success)":r.wDelta<0?"var(--danger)":"var(--text-dim)";
            return h("div",{key:r.name,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",fontSize:11}},
              h("span",{style:{color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textTransform:"capitalize"}},r.name),
              h("span",{style:{color:"var(--text-dim)",width:50,textAlign:"center"}},r.pSets?""+r.pw:"\u2014"),
              h("span",{style:{color:wColor,width:40,textAlign:"center",fontWeight:600}},r.wDelta>0?"+"+r.wDelta:r.wDelta<0?""+r.wDelta:"\u2022"),
              h("span",{style:{color:"var(--text-bright)",width:50,textAlign:"center"}},r.tSets?""+r.tw:"\u2014"))
          }));
      }
      compareView=h("div",{className:"fade-in",style:{background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:10,padding:"12px 14px",marginBottom:12}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}},
          h("span",{style:{fontSize:12,fontWeight:700,color:"var(--info)"}},"Session Comparison"),
          h("button",{onClick:function(){setCompareIdx(null);setShowDetail(false)},className:"btn btn--ghost btn--xs"},"Close")),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,fontSize:11}},
          h("div",{style:{textAlign:"center"}},
            h("div",{style:{fontWeight:700,color:"var(--text-bright)",marginBottom:4}},formatDate(target.date)),
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
            h("div",{style:{fontWeight:700,color:"var(--text-bright)",marginBottom:4}},formatDate(prev.date)),
            h("div",{style:{color:"var(--text-secondary)"}},prev.volume+" "+unit),
            h("div",{style:{color:"var(--text-secondary)"}},prev.sets+" sets"),
            prev.avgRpe?h("div",{style:{color:"var(--text-secondary)"}},"RPE "+prev.avgRpe):null)),
        h("button",{onClick:function(){setShowDetail(!showDetail)},className:"btn btn--info btn--xs",style:{marginTop:8,width:"100%"}},showDetail?"Hide Exercise Details":"Show Exercise Details"),
        exerciseDetail);
    }else{compareView=h("div",{style:{fontSize:11,color:"var(--text-dim)",padding:"8px 0",fontStyle:"italic"}},"No previous session of this workout found to compare.")}
  }

  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Session History"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Session History"),h("div",{style:{display:"flex",gap:8,alignItems:"center"}},hist.length>0?h("button",{onClick:function(){var csv="Date,Workout,Volume ("+unit+"),Sets,Duration (min),Avg RPE,PRs,Cardio\n";hist.forEach(function(s){csv+=s.date+","+'"'+(s.dayTitle||s.dayId).replace(/"/g,'""')+'"'+","+Math.round(s.volume)+","+s.sets+","+(s.duration?Math.round(s.duration/60):"")+","+(s.avgRpe||"")+","+(s.prs||0)+","+(s.cardio?"Yes":"No")+"\n"});var blob=new Blob([csv],{type:"text/csv"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="session-history.csv";a.click();URL.revokeObjectURL(url)},className:"btn btn--ghost btn--xs"},"Export CSV"):null,h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close"},"\u2715"))),
    compareView,
    hist.length===0?h("div",{className:"empty-state"},h("div",{className:"empty-state__icon"},"\uD83D\uDCCB"),h("div",{className:"empty-state__title"},"No sessions yet"),h("div",{className:"empty-state__desc"},"Complete a workout to see it here.")):
    h("div",{style:{maxHeight:"60vh",overflowY:"auto"}},hist.map(function(s,i){
      var label=formatDateFull(s.date);
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
  var onClose=props.onClose,config=props.config;var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var srf=useState(0),repFilter=srf[0],setRepFilter=srf[1];/* 0=e1RM, 1=1RM, 3=3RM, 5=5RM, 8=8RM, 10=10RM */
  var repFilters=[{val:0,label:"e1RM"},{val:1,label:"1RM"},{val:3,label:"3RM"},{val:5,label:"5RM"},{val:8,label:"8RM"},{val:10,label:"10RM"}];
  var records=useMemo(function(){
    var recs=[];
    config.days.forEach(function(day){
      var allEx=day.exercises.concat(getCustomExercises(day.id));
      var todayData=loadDayData(day.id);/* hoisted — one read per day, not per exercise */
      allEx.forEach(function(ex){
        var exUnit=getExUnit(ex.id);var hist=getBilateralHistory(day.id,ex,50);
        var todaySets=getBilateralSets(ex,todayData);if(!todaySets.length)todaySets=null;
        var allSessions=hist.slice();if(todaySets)allSessions.unshift({date:today(),sets:todaySets});
        if(repFilter===0){
          /* e1RM mode — original behavior */
          var bestW=0,bestReps=0,bestDate="",bestE1rm=0;
          allSessions.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var w=parseFloat(s.weight),r=parseInt(s.reps),e=calc1RM(w,r);if(e>bestE1rm){bestE1rm=e;bestW=w;bestReps=r;bestDate=entry.date}}})});
          if(bestW>0)recs.push({name:ex.name,weight:bestW,reps:bestReps,date:bestDate,e1rm:bestE1rm,unit:exUnit,muscles:ex.muscles||[]});
        }else{
          /* Rep-range mode — best weight at exactly N reps or more */
          var bestW2=0,bestR2=0,bestDate2="";
          allSessions.forEach(function(entry){entry.sets.forEach(function(s){if(s.done&&s.weight&&s.reps){var w=parseFloat(s.weight),r=parseInt(s.reps);if(r>=repFilter&&w>bestW2){bestW2=w;bestR2=r;bestDate2=entry.date}}})});
          if(bestW2>0)recs.push({name:ex.name,weight:bestW2,reps:bestR2,date:bestDate2,e1rm:calc1RM(bestW2,bestR2),unit:exUnit,muscles:ex.muscles||[]});
        }
      });
    });
    recs.sort(function(a,b){return b.e1rm-a.e1rm});return recs;
  },[config,repFilter]);
  var grouped=useMemo(function(){var g={};records.forEach(function(r){var key=r.muscles.length>0?r.muscles[0]:"other";if(!g[key])g[key]=[];g[key].push(r)});return g},[records]);
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Personal Records"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Personal Records"),h("button",{onClick:onClose,"aria-label":"Close",style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    h("div",{style:{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"},role:"tablist"},repFilters.map(function(rf){var active=repFilter===rf.val;return h("button",{key:rf.val,onClick:function(){setRepFilter(rf.val)},style:{padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:700,border:active?"1px solid var(--accent)":"1px solid rgba(255,255,255,0.08)",background:active?"var(--accent-bg)":"transparent",color:active?"var(--accent)":"var(--text-dim)",cursor:"pointer"},role:"tab","aria-selected":active?"true":"false"},rf.label)})),
    records.length===0?h("div",{className:"empty-state"},h("div",{className:"empty-state__icon"},"\uD83C\uDFC6"),h("div",{className:"empty-state__title"},"No records yet"),h("div",{className:"empty-state__desc"},"Complete sets to see PRs.")):
    h("div",{style:{maxHeight:"65vh",overflowY:"auto"}},Object.keys(grouped).map(function(muscle){
      return h("div",{key:muscle,style:{marginBottom:16}},
        h("div",{style:{fontSize:11,fontWeight:700,color:"var(--accent)",letterSpacing:.5,marginBottom:6}},(MUSCLE_LABELS[muscle]||muscle).toUpperCase()),
        grouped[muscle].map(function(r,i){
          var label=formatDate(r.date);
          return h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
            h("div",null,h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)"}},r.name),h("div",{style:{fontSize:11,color:"var(--text-dim)"}},label)),
            h("div",{style:{textAlign:"right"}},h("div",{style:{fontSize:15,fontWeight:800,color:"var(--text-bright)"}},r.weight+" "+r.unit+" \u00D7 "+r.reps),h("div",{style:{fontSize:10,fontWeight:600,color:"var(--info)"}},"e1RM "+r.e1rm+" "+r.unit)));
        }));
    }))));
}

/* ── Add Custom Exercise Form ── */
function AddExerciseForm(props){
  var dayId=props.dayId,onAdd=props.onAdd,onCancel=props.onCancel;var defUnit=getUnit();
  var s=useState({name:"",sets:"3",reps:"10-12",rest:"60",machine:false,unit:defUnit,muscles:[]}),form=s[0],setForm=s[1];
  var upd=function(f,v){setForm(Object.assign({},form,{[f]:v}))};
  var toggleMuscle=function(m){var next=form.muscles.indexOf(m)>=0?form.muscles.filter(function(x){return x!==m}):form.muscles.concat([m]);upd("muscles",next)};
  var submit=function(){if(!form.name.trim())return;if(form.reps&&!/^\d+(-\d+)?(\/leg)?$/i.test(form.reps.trim())){showUndoToast("Reps format should be like \"10\" or \"8-12\"",null,3000);return}var ex={id:"cx_"+Date.now(),name:form.name.trim(),sets:parseInt(form.sets,10)||3,reps:form.reps||"10",rest:parseInt(form.rest,10)||60,machine:form.machine,notes:"Custom exercise",tip:"",increment:form.unit==="kg"?2.5:5,muscles:form.muscles,custom:true};addCustomExercise(dayId,ex);setExUnit(ex.id,form.unit);onAdd()};
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
    h("div",{style:{marginBottom:10}},
      h("label",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",display:"block",marginBottom:4}},"MUSCLES (for volume tracking)"),
      h("div",{style:{display:"flex",flexWrap:"wrap",gap:4}},
        Object.keys(MUSCLE_LABELS).map(function(m){
          var active=form.muscles.indexOf(m)>=0;
          return h("button",{key:m,type:"button",onClick:function(){toggleMuscle(m)},className:active?"btn btn--accent-ghost btn--xs":"btn btn--ghost btn--xs",style:{fontSize:10},"aria-pressed":active?"true":"false"},MUSCLE_LABELS[m])}))),
    h("div",{style:{display:"flex",gap:8}},
      h("button",{onClick:onCancel,className:"btn btn--ghost",style:{flex:1}},"Cancel"),
      h("button",{onClick:submit,className:"btn btn--info",style:{flex:1,opacity:form.name.trim()?1:0.4}},"Add")));
}

/* ── Session RPE ── */
function SessionRPE(props){
  var dayId=props.dayId;
  var s=useState(function(){return lsGet("sessionRpe_"+dayId+"_"+getSessionDate())}),rpe=s[0],setRpe=s[1];
  var save=function(val){setRpe(val);lsSet("sessionRpe_"+dayId+"_"+getSessionDate(),val)};
  var labels={6:"Easy",7:"Moderate",8:"Hard",9:"Very Hard",10:"Max"};var colors={6:"var(--success)",7:"var(--lime)",8:"var(--accent)",9:"var(--warning)",10:"var(--danger)"};
  return h("div",{className:"fade-in",style:{background:"var(--success-bg)",border:"1px solid var(--success-border)",borderRadius:12,padding:"14px 16px",marginTop:12},"aria-label":"Session RPE rating"},
    h("div",{style:{fontSize:13,fontWeight:700,color:"var(--success)",marginBottom:8}},"Session RPE \u2014 How was the overall workout?"),
    h("div",{style:{display:"flex",gap:4},role:"radiogroup","aria-label":"Session RPE"},[6,7,8,9,10].map(function(val){var active=rpe===val;return h("button",{key:val,onClick:function(){save(val)},className:"rpe-btn",style:{border:active?"2px solid "+colors[val]:"1px solid rgba(255,255,255,0.08)",background:active?"rgba(255,255,255,0.06)":"transparent"},role:"radio","aria-checked":active?"true":"false"},h("div",{style:{fontSize:16,fontWeight:800,color:active?colors[val]:"var(--text-dim)"}},val),h("div",{style:{fontSize:8,fontWeight:600,color:active?"var(--text-secondary)":"var(--text-dim)",marginTop:1}},labels[val]))})),
    rpe?h("div",{style:{fontSize:11,color:"var(--text-secondary)",marginTop:6,fontStyle:"italic"},"aria-live":"polite"},rpe<=7?"Recovered well \u2014 room to push harder.":rpe===8?"Solid session \u2014 sustainable load.":rpe===9?"High fatigue \u2014 watch recovery.":"Maximum effort \u2014 consider lighter session next."):null);
}

/* ── Session Timer ── */
function SessionTimer(props){
  var onRefresh=props.onRefresh;
  var s=useState(0),elapsed=s[0],setElapsed=s[1];var sm=useState(false),showMenu=sm[0],setShowMenu=sm[1];
  var warnedRef=useRef(false);
  var started=getSessionStart();
  useEffect(function(){if(!started)return;var tick=function(){var e=Math.floor((Date.now()-started)/1000);setElapsed(e);if(e>=SESSION_WARN_SECS&&!warnedRef.current){warnedRef.current=true;showUndoToast("\u26A0 Session is 90 min \u2014 consider wrapping up",null,8000)}}; tick();var id=setInterval(tick,1000);return function(){clearInterval(id)}},[started]);
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
  var readinessColor=avg>=4?"var(--success)":avg>=3?"var(--accent)":avg>=2?"var(--warning)":"var(--danger)";
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
  var sm=useState(function(){return getDeloadMuscles()||[]}),selectedMuscles=sm[0],setSelectedMuscles=sm[1];
  var sme=useState(false),showMuscleFilter=sme[0],setShowMuscleFilter=sme[1];
  var select=function(stratId){setActiveDeload(stratId);setActive(stratId);showUndoToast(DELOAD_STRATEGIES.find(function(d){return d.id===stratId}).label+" applied"+(selectedMuscles.length?" to "+selectedMuscles.length+" muscle groups":" to all exercises"),function(){clearActiveDeload();setActive(null)});if(onSelect)onSelect()};
  var clear=function(){clearActiveDeload();setActive(null);setSelectedMuscles([]);showUndoToast("Deload strategy cleared",null,3000);if(onSelect)onSelect()};
  var toggleMuscle=function(m){var next=selectedMuscles.indexOf(m)>=0?selectedMuscles.filter(function(x){return x!==m}):selectedMuscles.concat([m]);setSelectedMuscles(next);setDeloadMuscles(next.length?next:null);if(onSelect)onSelect()};
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
          h("div",{style:{fontSize:9,color:"var(--text-dim)",marginTop:2,lineHeight:1.3}},strat.desc))})),
    active?h("div",{style:{marginTop:8,borderTop:"1px solid var(--danger-border)",paddingTop:8}},
      h("button",{onClick:function(){setShowMuscleFilter(!showMuscleFilter)},style:{fontSize:11,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:4}},
        h("span",{style:{fontSize:8,transform:showMuscleFilter?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block"}},"\u25B6"),
        "Selective Deload",selectedMuscles.length?" ("+selectedMuscles.length+" muscles)":"  (all muscles)"),
      showMuscleFilter?h("div",{className:"fade-in",style:{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}},
        Object.keys(MUSCLE_LABELS).map(function(m){
          var sel=selectedMuscles.indexOf(m)>=0;
          return h("button",{key:m,onClick:function(){toggleMuscle(m)},style:{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",border:sel?"1px solid var(--danger)":"1px solid rgba(255,255,255,0.08)",background:sel?"rgba(239,68,68,0.15)":"transparent",color:sel?"var(--danger)":"var(--text-dim)"},"aria-pressed":sel?"true":"false"},MUSCLE_LABELS[m])}),
        selectedMuscles.length?h("button",{onClick:function(){setSelectedMuscles([]);setDeloadMuscles(null);if(onSelect)onSelect()},style:{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",background:"transparent",color:"var(--text-dim)"}},"Clear filter"):null):null):null);
}

/* ── Tempo Timer ── */
function TempoTimer(props){
  var tempo=props.tempo;
  var parts=tempo?tempo.split("-").map(function(p){return parseInt(p)||0}):[];
  var valid=parts.length>=3;
  var labels=["Eccentric","Pause","Concentric"];
  var s=useState(false),running=s[0],setRunning=s[1];
  var sp=useState(0),phase=sp[0],setPhase=sp[1];
  var sc=useState(valid?parts[0]:0),count=sc[0],setCount=sc[1];
  var intervalRef=useRef(null);
  useEffect(function(){return function(){if(intervalRef.current)clearInterval(intervalRef.current)}},[]);
  if(!valid)return null;
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
  var phaseColors=["var(--danger)","var(--accent)","var(--success)"];
  return h("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}},
    h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)"}},"Tempo "+tempo),
    running?h("div",{style:{display:"flex",alignItems:"center",gap:6}},
      h("span",{style:{fontSize:14,fontWeight:800,color:phaseColors[phase]||"var(--text-primary)",fontVariantNumeric:"tabular-nums",minWidth:18,textAlign:"center"}},count),
      h("span",{style:{fontSize:10,fontWeight:600,color:phaseColors[phase]||"var(--text-dim)"}},labels[phase]||""),
      h("button",{onClick:stop,className:"btn btn--danger btn--xs"},"Stop")):
    h("button",{onClick:start,className:"btn btn--accent-ghost btn--xs"},"Start Tempo"));
}

/* ── Onboarding Steps ── */
function OnboardingSteps(props){
  var s=useState(0),step=s[0],setStep=s[1];
  var steps=[
    {icon:"\uD83C\uDFCB\uFE0F",title:"Log Your Sets",desc:"Tap an exercise to expand it. Enter weight & reps, then check off each set. Your data saves automatically."},
    {icon:"\u26A1",title:"Quick Tools",desc:"Use Quick Log to repeat your last set instantly. Swipe left/right to switch training days. Rest timers start automatically."},
    {icon:"\uD83D\uDCCA",title:"Track Progress",desc:"Check Volume for weekly muscle tracking, PRs for personal records, and the Coach tab for form tips on each exercise."}
  ];
  var cur=steps[step];
  return h("div",{style:{background:"var(--accent-bg)",border:"1px solid var(--accent-border)",borderRadius:12,padding:"18px 16px",marginBottom:12,textAlign:"center"}},
    h("div",{style:{fontSize:28,marginBottom:8},"aria-hidden":"true"},cur.icon),
    h("div",{style:{fontSize:14,fontWeight:700,color:"var(--text-bright)",marginBottom:6}},cur.title),
    h("div",{style:{fontSize:12,color:"var(--text-secondary)",lineHeight:1.6,maxWidth:280,margin:"0 auto",marginBottom:12}},cur.desc),
    h("div",{style:{display:"flex",justifyContent:"center",gap:6,marginBottom:10},"aria-hidden":"true"},steps.map(function(_,i){return h("div",{key:i,style:{width:step===i?16:6,height:6,borderRadius:3,background:step===i?"var(--accent)":"rgba(255,255,255,0.12)",transition:"width 0.2s"}})})),
    h("div",{style:{display:"flex",gap:8,justifyContent:"center"}},
      step>0?h("button",{onClick:function(){setStep(step-1)},className:"btn btn--ghost btn--sm"},"Back"):null,
      step<steps.length-1?h("button",{onClick:function(){setStep(step+1)},className:"btn btn--accent btn--sm"},"Next"):
      h("button",{onClick:props.onDone,className:"btn btn--accent btn--sm"},"Let\u2019s Go!")));
}

/* ── Day View ── */
function DayView(props){
  var day=props.day,refresh=props.refresh,config=props.config;
  var dayData=useDayData();
  var s5=useState(false),showComplete=s5[0],setShowComplete=s5[1];
  var s8=useState(false),showAddForm=s8[0],setShowAddForm=s8[1];
  var sc=useState(function(){return getCustomExercises(day.id)}),customs=sc[0],setCustoms=sc[1];
  var sw=useState(0),swapRev=sw[0],bumpSwapRev=sw[1];
  var swappedExercises=useMemo(function(){return applyOverrides(applySwaps(day.exercises,day.id))},[day,swapRev]);
  var exerciseLibrary=useMemo(function(){var seen={};var lib=[];config.days.forEach(function(d){d.exercises.forEach(function(ex){if(!seen[ex.name]){seen[ex.name]=true;lib.push({name:ex.name,muscles:ex.muscles||[]})}});d.exercises.forEach(function(ex){if(ex.alternatives)ex.alternatives.forEach(function(alt){if(!seen[alt]){seen[alt]=true;lib.push({name:alt,muscles:ex.muscles||[]})}})})});return lib},[config]);
  var allExercises=swappedExercises.concat(customs);
  var handleSwap=useCallback(function(origId,altName,permanent){
    if(!altName){/* revert */bumpSwapRev(function(r){return r+1});refresh();return}
    if(permanent){
      savePermanentSwap(day.id,origId,altName);bumpSwapRev(function(r){return r+1});refresh();
      showUndoToast("Permanently swapped to "+altName,function(){clearPermanentSwap(day.id,origId);bumpSwapRev(function(r){return r+1});refresh()});
    }else{
      saveSwap(day.id,origId,altName);bumpSwapRev(function(r){return r+1});refresh();
    }
  },[day.id,refresh]);
  var saved=dayData.getData(day.id);var totalSets=allExercises.reduce(function(a,e){return a+totalSetsFor(e)},0);
  var doneSets=allExercises.reduce(function(a,e){return a+countBilateralDone(e,saved)},0);
  var pct=totalSets>0?doneSets/totalSets:0;var allComplete=doneSets===totalSets&&totalSets>0;
  var nextExIdx=-1;
  for(var ni=0;ni<allExercises.length;ni++){var exSkip=saved._skipped&&saved._skipped[allExercises[ni].id];if(exSkip)continue;var exDone=countBilateralDone(allExercises[ni],saved);if(exDone<totalSetsFor(allExercises[ni])){nextExIdx=ni;break}}
  var removeCustom=function(exId,exName){showConfirm({title:"Remove Exercise",msg:"Remove \""+exName+"\" from today's workout?",confirmLabel:"Remove",danger:true,onConfirm:function(){var next=removeCustomExercise(day.id,exId);setCustoms(next);refresh()}})};
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
    doneSets===0&&!readinessDone&&getPref("showWellness",true)?h(ReadinessCheck,{dayId:day.id,onDismiss:function(){setReadinessDone(true)}}):null,
    doneSets===0&&!getOnboarded()?h(OnboardingSteps,{onDone:function(){setOnboarded();refresh()}}):null,
    isDeloadWeek?h(DeloadOptions,{onSelect:refresh}):
    props.fatigue&&props.fatigue.level==="high"&&!isDeloadWeek?h("div",{style:{background:"var(--danger-bg)",border:"1px solid var(--danger-border)",borderRadius:10,padding:"10px 12px",marginBottom:10},role:"alert"},
      h("div",{style:{fontSize:12,fontWeight:700,color:"var(--danger)",marginBottom:4}},"\u26A0 High Fatigue Detected"),
      h("div",{style:{fontSize:11,color:"var(--text-secondary)",marginBottom:8}},props.fatigue.msg),
      h("button",{onClick:function(){var m=getMesocycle();m.week=4;setMesocycle(m);if(props.onMesoChange)props.onMesoChange(m);refresh()},className:"btn btn--danger btn--sm"},"Start Deload Week")):
    deloadWarnings?h("div",{style:{background:"var(--danger-bg)",border:"1px solid var(--danger-border)",borderRadius:10,padding:"10px 12px",marginBottom:10},role:"alert"},
      h("div",{style:{fontSize:12,fontWeight:700,color:"var(--danger)",marginBottom:4}},"\u26A0 Consider a Deload"),
      h("div",{style:{fontSize:11,color:"var(--text-secondary)",lineHeight:1.5}},"High RPE (9+) for 2+ sessions on: ",deloadWarnings.join(", "),". Consider reducing weight 40-50%.")):null,
    nextExIdx>=1&&!allComplete?h("button",{onClick:function(){var cards=document.querySelectorAll(".card--next");if(cards.length)cards[0].scrollIntoView({behavior:"smooth",block:"center"})},className:"btn btn--accent-ghost btn--sm",style:{marginBottom:8,width:"100%"}},"Jump to Next: "+allExercises[nextExIdx].name):null,
    swappedExercises.map(function(ex,i){
      var ssPartner=null,ssPartnerExId=null;
      if(ex.supersetGroup){for(var si=0;si<swappedExercises.length;si++){if(si!==i&&swappedExercises[si].supersetGroup===ex.supersetGroup){ssPartner=swappedExercises[si].name;ssPartnerExId=swappedExercises[si].id;break}}}
      return h(CardErrorBoundary,{key:ex.id,name:ex.name},h(ExerciseCard,{exercise:ex,index:i,dayId:day.id,onSetUpdate:refresh,isNext:nextExIdx===i,supersetGroup:ex.supersetGroup,supersetPartner:ssPartner,supersetPartnerExId:ssPartnerExId,onSwap:handleSwap,exerciseLibrary:exerciseLibrary}))}),
    customs.length>0?h("div",{style:{borderTop:"1px solid var(--info-border)",marginTop:8,paddingTop:8}},
      h("div",{style:{fontSize:10,fontWeight:700,color:"var(--info)",marginBottom:6,letterSpacing:.5}},"CUSTOM EXERCISES"),
      customs.map(function(ex,i){var ci=day.exercises.length+i;return h("div",{key:ex.id,style:{position:"relative"}},h(ExerciseCard,{exercise:ex,index:ci,dayId:day.id,onSetUpdate:refresh,isNext:nextExIdx===ci}),h("button",{onClick:function(){removeCustom(ex.id,ex.name)},style:{position:"absolute",top:10,right:10,width:22,height:22,borderRadius:6,border:"1px solid var(--danger-border)",background:"var(--danger-bg)",color:"var(--danger)",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10},"aria-label":"Remove "+ex.name},"\u2715"))})):null,
    showAddForm?h(AddExerciseForm,{dayId:day.id,onAdd:function(){setCustoms(getCustomExercises(day.id));setShowAddForm(false);refresh()},onCancel:function(){setShowAddForm(false)}}):h("button",{onClick:function(){setShowAddForm(true)},className:"btn btn--info btn--full btn--dashed",style:{marginTop:8}},"+ Add Exercise"),
    h(CardioLog,{dayId:day.id}),
    allComplete?h(SessionRPE,{dayId:day.id}):null,
    showComplete?h(CompletionSummary,{day:day,customs:customs,onClose:function(){setShowComplete(false)}}):null);
}

/* ── Collapsible Settings Group ── */
function SettingsGroup(props){
  var s=useState(props.defaultOpen!==false),open=s[0],setOpen=s[1];
  return h("div",{className:"settings-group"},
    h("button",{onClick:function(){setOpen(!open)},style:{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:"0 4px",width:"100%",marginBottom:open?8:0},"aria-expanded":open?"true":"false"},
      h("span",{style:{fontSize:8,transform:open?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block",color:"var(--text-dim)"}},"\u25B6"),
      h("span",{className:"settings-group__title",style:{margin:0}},props.title)),
    open?h("div",{className:"fade-in"},props.children):null);
}

/* ── Settings Panel ── */
function SettingsPanel(props){
  var onClose=props.onClose,config=props.config,dayMap=props.dayMap,setDayMapState=props.setDayMapState;
  var s=useState(null),msg=s[0],setMsg=s[1];var fileRef=useRef(null);var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var sq=useState(null),storageInfo=sq[0],setStorageInfo=sq[1];
  var scl=useState(null),cleanupResult=scl[0],setCleanupResult=scl[1];
  var sclm=useState(6),cleanupMonths=sclm[0],setCleanupMonths=sclm[1];
  useEffect(function(){if(navigator.storage&&navigator.storage.estimate){navigator.storage.estimate().then(function(est){setStorageInfo({used:est.usage||0,quota:est.quota||0})}).catch(function(){})}},[]);
  var s2=useState(getUnit()),unit=s2[0],setUnitState=s2[1];
  var s3=useState(getAutoTimer()),autoTimer=s3[0],setAutoTimerState=s3[1];
  var s4=useState(function(){return getPref("timerSound",true)}),timerSound=s4[0],setTimerSound=s4[1];
  var stp=useState(function(){return getPref("timerPresets",[45,60,90,120,150])}),timerPresets=stp[0],setTimerPresetsState=stp[1];
  var stpe=useState(false),editingPresets=stpe[0],setEditingPresets=stpe[1];
  var stpi=useState(""),presetInput=stpi[0],setPresetInput=stpi[1];
  var s5r=useState(function(){return getPref("showRir",true)}),showRir=s5r[0],setShowRir=s5r[1];
  var s6w=useState(function(){return getPref("showWellness",true)}),showWellness=s6w[0],setShowWellness=s6w[1];
  var DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  var handleImport=function(e){
    var file=e.target.files&&e.target.files[0];if(!file)return;
    var doImport=function(){importData(file,function(count,err,warnings){if(err)setMsg("Import failed: "+(err.message||"Unknown error"));else{var wmsg=warnings?" ("+warnings.join(" ")+")":"";setMsg("Imported "+count+" records."+wmsg);setTimeout(function(){window.location.reload()},warnings?4000:1500)}})};
    var r=new FileReader();
    r.onload=function(ev){try{var data=JSON.parse(ev.target.result);var overwrites=Object.keys(data).filter(function(k){return k!=="_export_meta"&&k.startsWith(LS)&&localStorage.getItem(k)!==null}).length;if(overwrites>0){showConfirm({title:"Confirm Import",msg:"This will overwrite "+overwrites+" existing record"+(overwrites===1?"":"s")+". Continue?",confirmLabel:"Import",danger:true,onConfirm:doImport})}else{doImport()}}catch(err){setMsg("Import failed: "+(err.message||"Unknown error"))}};
    r.onerror=function(){setMsg("Import failed: File could not be read")};r.readAsText(file);
  };
  var toggleUnit=function(){var next=unit==="lbs"?"kg":"lbs";setUnitState(next);setUnit(next)};
  var toggleAutoTimer=function(){var next=!autoTimer;setAutoTimerState(next);setAutoTimer(next)};
  var changeDayFor=function(dayId){var cur=dayMap[dayId];var idx=DOW.indexOf(cur);var next=DOW[(idx+1)%7];var newMap=Object.assign({},dayMap);newMap[dayId]=next;setDayMapState(newMap);setDayMap(newMap)};
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Settings"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}},h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Settings"),h("button",{onClick:onClose,style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close settings"},"\u2715")),
    h("div",{style:{fontSize:12,color:"var(--text-dim)",marginBottom:16,padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}},
      h("span",null,h("span",{style:{fontWeight:700,color:"var(--accent)"}},"Profile: "),config.name," \u2014 ",config.program),
      h("button",{onClick:function(){window.location.href="?"},className:"btn btn--ghost btn--xs"},"Switch")),
    /* Settings groups */
    h(SettingsGroup,{title:"Preferences"},
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Default Unit"),h("div",{className:"settings-row__desc"},"Per-exercise override via LBS/KG toggle")),h("button",{onClick:toggleUnit,className:"btn btn--accent-ghost btn--sm"},unit==="lbs"?"Switch to KG":"Switch to LBS")),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Auto-Start Timer"),h("div",{className:"settings-row__desc"},"Start rest timer on set check-off")),h(Toggle,{on:autoTimer,onToggle:toggleAutoTimer,label:"Auto-start timer"})),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Timer Sound"),h("div",{className:"settings-row__desc"},"Play sound when rest timer completes")),h(Toggle,{on:timerSound,onToggle:function(){var next=!timerSound;setTimerSound(next);setPref("timerSound",next)},label:"Timer sound"})),
      h("div",{className:"settings-row",style:{flexDirection:"column",alignItems:"stretch"}},h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},h("div",null,h("div",{className:"settings-row__label"},"Timer Presets"),h("div",{className:"settings-row__desc"},"Customize rest timer quick-select buttons")),h("button",{onClick:function(){setEditingPresets(!editingPresets)},className:"btn btn--ghost btn--xs"},editingPresets?"Done":"Edit")),
        editingPresets?h("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginTop:8,alignItems:"center"}},
          timerPresets.map(function(sec){return h("div",{key:sec,style:{display:"flex",alignItems:"center",gap:2,padding:"4px 8px",borderRadius:6,background:"var(--accent-bg)",border:"1px solid var(--accent-border)"}},
            h("span",{style:{fontSize:11,fontWeight:600,color:"var(--accent)"}},sec+"s"),
            h("button",{onClick:function(){var next=timerPresets.filter(function(s){return s!==sec});setTimerPresetsState(next);setPref("timerPresets",next)},style:{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:12,padding:"0 2px"}},"\u2715"))}),
          h("div",{style:{display:"flex",gap:4,alignItems:"center"}},
            h("input",{type:"number",inputMode:"numeric",value:presetInput,onChange:function(e){setPresetInput(e.target.value)},placeholder:"sec",className:"input input--sm",style:{width:50}}),
            h("button",{onClick:function(){var v=parseInt(presetInput);if(v&&v>0&&v<=600&&timerPresets.indexOf(v)===-1){var next=timerPresets.concat([v]).sort(function(a,b){return a-b});setTimerPresetsState(next);setPref("timerPresets",next);setPresetInput("")}},className:"btn btn--accent btn--xs"},"+"))
        ):null),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"RIR Tracking"),h("div",{className:"settings-row__desc"},"Rate reps-in-reserve after each set")),h(Toggle,{on:showRir,onToggle:function(){var next=!showRir;setShowRir(next);setPref("showRir",next)},label:"Show RIR"})),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Wellness Check"),h("div",{className:"settings-row__desc"},"Pre-session readiness poll (sleep, energy, etc.)")),h(Toggle,{on:showWellness,onToggle:function(){var next=!showWellness;setShowWellness(next);setPref("showWellness",next)},label:"Show wellness"}))),
    h(SettingsGroup,{title:"Schedule"},
      h("div",{style:{fontSize:11,color:"var(--text-dim)",marginBottom:10}},"Tap a day to cycle through the week"),
      h("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},config.days.map(function(day){return h("button",{key:day.id,onClick:function(){changeDayFor(day.id)},style:{padding:"8px 12px",borderRadius:8,border:"1px solid var(--accent-border)",background:"var(--accent-bg)",cursor:"pointer",textAlign:"center",minWidth:60},"aria-label":"Change "+day.label+" day"},h("div",{style:{fontSize:10,fontWeight:700,color:"var(--accent)"}},dayMap[day.id]),h("div",{style:{fontSize:12,fontWeight:600,color:"var(--text-primary)",marginTop:2}},day.label))}))),
    h(SettingsGroup,{title:"Mesocycle",defaultOpen:false},
      h("div",{style:{fontSize:11,color:"var(--text-dim)",marginBottom:6}},"4-week training block. Week 4 = deload."),
      h("div",{style:{fontSize:10,color:"var(--info)",marginBottom:10,fontStyle:"italic"}},MESO_WEEK_LABELS[getMesocycle().week]),
      h("div",{style:{display:"flex",gap:8,alignItems:"center",marginBottom:10}},
        h("span",{style:{fontSize:13,fontWeight:700,color:"var(--info)"}},"Week "+getMesocycle().week+" of 4"),
        h("button",{onClick:function(){var m=advanceMesoWeek();if(props.onMesoChange)props.onMesoChange(m)},className:"btn btn--info btn--sm"},"Next Week"),
        h("button",{onClick:function(){showConfirm({title:"Reset Mesocycle",msg:"Reset to Week 1?",confirmLabel:"Reset",onConfirm:function(){var m=resetMesocycle();if(props.onMesoChange)props.onMesoChange(m)}})},className:"btn btn--ghost btn--sm"},"Reset")),
      h("div",{className:"settings-row"},h("div",null,h("div",{className:"settings-row__label"},"Undulating Periodization"),h("div",{className:"settings-row__desc"},"Auto-adjust rep targets each week")),h(Toggle,{on:getMesocycle().mode==="undulating",onToggle:function(){var m=getMesocycle();m.mode=m.mode==="undulating"?"linear":"undulating";setMesocycle(m);if(props.onMesoChange)props.onMesoChange(m)},label:"Undulating periodization"}))),
    h(SettingsGroup,{title:"Data"},
      h("div",{style:{display:"flex",flexDirection:"column",gap:10}},
        h("button",{onClick:exportData,className:"btn btn--info btn--full"},"\uD83D\uDCE4 Export All Data"),
        h("button",{onClick:function(){fileRef.current&&fileRef.current.click()},className:"btn btn--accent-ghost btn--full"},"\uD83D\uDCE5 Import Data"),
        h("input",{ref:fileRef,type:"file",accept:".json",onChange:handleImport,style:{display:"none"},"aria-label":"Import data file"}),
        msg?h("div",{style:{fontSize:12,color:msg.startsWith("Import failed")?"var(--danger)":"var(--success)",textAlign:"center",padding:8},role:"alert"},msg):null,
        storageInfo?function(){var pct=storageInfo.quota?storageInfo.used/storageInfo.quota:0;var profileBytes=getStorageUsage();var barColor=pct>0.8?"var(--danger)":pct>0.5?"var(--accent)":"var(--success)";return h("div",{style:{paddingTop:8}},
          h("div",{style:{display:"flex",justifyContent:"space-between",fontSize:10,color:pct>0.8?"var(--danger)":"var(--text-dim)",marginBottom:4}},
            h("span",null,"Storage: "+(storageInfo.used/1024/1024).toFixed(1)+" / "+(storageInfo.quota/1024/1024).toFixed(0)+" MB"),
            h("span",null,Math.round(pct*100)+"%")),
          h("div",{style:{height:4,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden"}},
            h("div",{style:{width:Math.max(1,pct*100)+"%",height:"100%",borderRadius:2,background:barColor,transition:"width 0.3s"}})),
          h("div",{style:{fontSize:9,color:"var(--text-dim)",marginTop:4,textAlign:"center"}},"Profile data: "+(profileBytes/1024).toFixed(1)+" KB"),
          pct>0.8?h("div",{style:{fontSize:10,color:"var(--danger)",textAlign:"center",marginTop:4,fontWeight:700}},"Storage nearly full! Export and clear old data."):null)}():null,
        function(){var b1=lsGet("auto_backup_1"),b2=lsGet("auto_backup_2");if(!b1)return null;return h("div",{style:{marginTop:8,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:8,border:"1px solid var(--border)"}},
          h("div",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",marginBottom:6}},"Auto-Backups"),
          h("div",{style:{display:"flex",gap:6}},
            h("button",{onClick:function(){downloadAutoBackup(1)},className:"btn btn--ghost btn--xs"},"Download ("+b1.date+")"),
            b2?h("button",{onClick:function(){downloadAutoBackup(2)},className:"btn btn--ghost btn--xs"},"Download ("+b2.date+")"):null))}(),
        /* Storage Cleanup */
        h("div",{style:{marginTop:8,padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:8,border:"1px solid var(--border)"}},
          h("div",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",marginBottom:6}},"Storage Cleanup"),
          h("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
            h("span",{style:{fontSize:11,color:"var(--text-secondary)"}},"Keep last"),
            h("select",{value:cleanupMonths,onChange:function(e){setCleanupMonths(parseInt(e.target.value,10))},"aria-label":"Data retention period",style:{background:"var(--surface-alt)",color:"var(--text-bright)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 8px",fontSize:11}},
              h("option",{value:3},"3 months"),h("option",{value:6},"6 months"),h("option",{value:12},"12 months")),
            h("button",{onClick:function(){performAutoBackup();showConfirm({title:"Clear Old Data",msg:"Delete workout data older than "+cleanupMonths+" months? Preferences, templates, and session summaries are preserved. A backup was saved automatically.",confirmLabel:"Clear",onConfirm:function(){var r=cleanOldData(cleanupMonths);setCleanupResult(r);if(navigator.storage&&navigator.storage.estimate){navigator.storage.estimate().then(function(est){setStorageInfo({used:est.usage||0,quota:est.quota||0})}).catch(function(){})}showUndoToast("Removed "+r.removed+" old records ("+(r.freedBytes/1024).toFixed(1)+" KB freed)",null,5000)}})},className:"btn btn--ghost btn--xs"},"Clean up")),
          cleanupResult?h("div",{style:{fontSize:10,color:"var(--success)"},role:"status","aria-live":"polite"},"\u2713 Removed "+cleanupResult.removed+" records, freed "+(cleanupResult.freedBytes/1024).toFixed(1)+" KB"):null,
          h("div",{style:{fontSize:9,color:"var(--text-dim)",marginTop:4}},"Keeps: preferences, overrides, templates, session history")),
        /* IndexedDB Migration */
        _idbReady?h("div",{style:{marginTop:8,padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:8,border:"1px solid var(--border)"}},
          h("div",{style:{fontSize:10,fontWeight:700,color:"var(--text-dim)",marginBottom:6}},"IndexedDB Backup"),
          h("div",{style:{fontSize:9,color:"var(--text-dim)",marginBottom:6}},"Mirror all data to IndexedDB for extra durability and larger storage capacity."),
          h("button",{onClick:function(){migrateToIDB(function(count){showUndoToast("Mirrored "+count+" records to IndexedDB",null,4000)})},className:"btn btn--ghost btn--xs"},"Mirror to IndexedDB")):null)),
    h(SettingsGroup,{title:"Tools",defaultOpen:false},
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
    h("div",{style:{display:"flex",flexDirection:"column",gap:10},role:"list"},profiles.map(function(p){var isCurrent=getProfileFromURL()===p.id;return h("a",{key:p.id,href:"?profile="+p.id,onClick:isCurrent?function(e){e.preventDefault()}:undefined,style:{display:"block",padding:"16px 20px",borderRadius:14,border:isCurrent?"1px solid var(--accent)":"1px solid var(--accent-border)",background:isCurrent?"rgba(245,158,11,0.15)":"var(--accent-bg)",textDecoration:"none",textAlign:"left"},role:"listitem"},h("div",{style:{fontSize:16,fontWeight:700,color:"var(--text-bright)"}},p.name,isCurrent?" (current)":""),h("div",{style:{fontSize:12,color:"var(--text-dim)",marginTop:2}},p.program||""))}))));
}

/* ── Offline Indicator ── */
function OfflineIndicator(){
  var s=useState(!navigator.onLine),offline=s[0],setOffline=s[1];
  useEffect(function(){
    var goOff=function(){setOffline(true)};var goOn=function(){setOffline(false)};
    window.addEventListener("offline",goOff);window.addEventListener("online",goOn);
    return function(){window.removeEventListener("offline",goOff);window.removeEventListener("online",goOn)};
  },[]);
  if(!offline)return null;
  return h("div",{style:{background:"var(--danger)",color:"#fff",textAlign:"center",padding:"6px 12px",fontSize:11,fontWeight:700}},"You are offline \u2014 data is saved locally");
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
  var smo=useState(false),showMore=smo[0],setShowMore=smo[1];var moreRef=useRef(null);useFocusTrap(showMore?moreRef:null,function(){setShowMore(false)});
  var scal=useState(false),showCalendar=scal[0],setShowCalendar=scal[1];
  var sft=useState(false),showFatigueTrend=sft[0],setShowFatigueTrend=sft[1];
  var stpl=useState(false),showTemplates=stpl[0],setShowTemplates=stpl[1];
  var sinst=useState(!!_deferredInstallPrompt),canInstall=sinst[0],setCanInstall=sinst[1];
  useEffect(function(){return onInstallPromptChange(setCanInstall)},[]);
  var s7=useState(function(){return getDayMap(DAYS)}),dayMap=s7[0],setDayMapState=s7[1];
  var sm=useState(function(){return getMesocycle()}),meso=sm[0],setMeso=sm[1];
  var scrollRef=useRef(null);var refresh=useCallback(function(){setTick(function(t){return t+1})},[]);
  var dayData=useDayData();
  /* Week strip data (memoized to avoid 7×N loadDayData calls per render) */
  var weekStripData=useMemo(function(){var now=new Date();var dayOfWeek=now.getDay()||7;var result=[];
    for(var wi=1;wi<=7;wi++){var d=new Date(now);d.setDate(d.getDate()+(wi-dayOfWeek));
      var dateStr=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
      var doneSets=0,totalSets=0;
      /* Use context cache for today; history index for past dates — avoids 7×N loadDayData calls */
      if(dateStr===getSessionDate()){
        config.days.forEach(function(day){var live=dayData.getData(day.id);var customs=getCustomExercises(day.id);var allEx=day.exercises.concat(customs);allEx.forEach(function(e){totalSets+=totalSetsFor(e);doneSets+=countBilateralDone(e,live)})});
      }else{
        if(!_historyBuilt)buildHistoryIndex();
        config.days.forEach(function(day){var customs=getCustomExercises(day.id);var allEx=day.exercises.concat(customs);allEx.forEach(function(e){totalSets+=totalSetsFor(e)});var entries=_historyIndex[day.id]||[];for(var ei=0;ei<entries.length;ei++){if(entries[ei].date===dateStr){allEx.forEach(function(e){doneSets+=countBilateralDone(e,entries[ei].data)});break}}});
      }
      result.push({dow:wi,hasSets:doneSets>0,complete:totalSets>0&&doneSets>=totalSets})}return result},[config,dayData.rev]);
  /* Debounce fatigue calculation — only recompute 500ms after last data change to avoid 40+ localStorage reads per keystroke */
  var sfat=useState(null),fatigue=sfat[0],setFatigue=sfat[1];
  useEffect(function(){var id=setTimeout(function(){setFatigue(calcFatigueScore(config,dayData))},500);return function(){clearTimeout(id)}},[config,dayData.rev]);
  /* Swipe */
  var touchRef=useRef({startX:0,startY:0});
  var onTouchStart=useCallback(function(e){var t=e.touches[0];touchRef.current={startX:t.clientX,startY:t.clientY}},[]);
  var onTouchEnd=useCallback(function(e){var t=e.changedTouches[0];var dx=t.clientX-touchRef.current.startX;var dy=t.clientY-touchRef.current.startY;/* Increased threshold (80px) and stricter angle (2x) to avoid scroll conflicts */if(Math.abs(dx)>SWIPE_THRESHOLD_PX&&Math.abs(dx)>Math.abs(dy)*2){if(dx<0){setActiveDay(function(d){return Math.min(d+1,DAYS.length-1)})}else{setActiveDay(function(d){return Math.max(d-1,0)})}}},[DAYS.length]);
  useEffect(function(){var dow=new Date().getDay();var dayToNum={"Mon":1,"Tue":2,"Wed":3,"Thu":4,"Fri":5,"Sat":6,"Sun":0};var best=-1;DAYS.forEach(function(d,i){if(dayToNum[dayMap[d.id]]===dow)best=i});if(best>=0)setActiveDay(best)},[dayMap]);
  useEffect(function(){if(scrollRef.current)scrollRef.current.scrollTop=0},[activeDay]);

  /* ── Storage full listener ── */
  var ssf=useState(_storageFull),storageFull=ssf[0],setStorageFull=ssf[1];
  useEffect(function(){return onStorageFullChange(setStorageFull)},[]);

  /* ── Auto-advance mesocycle ── */
  var sma=useState(false),showMesoAdvance=sma[0],setShowMesoAdvance=sma[1];
  var checkMesoAdvance=useCallback(function(){
    var m=getMesocycle();if(m.week>=4)return;
    var weekKey="meso_advanced_wk"+m.week;if(lsGet(weekKey))return;
    var allDaysDone=DAYS.every(function(day){
      var now=new Date();var dayOfWeek=now.getDay()||7;
      for(var di=1-dayOfWeek;di<=7-dayOfWeek;di++){
        var d=new Date(now);d.setDate(d.getDate()+di);
        var dateStr=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
        var dd=loadDayData(day.id,dateStr);
        var customs=getCustomExercises(day.id);var allEx=day.exercises.concat(customs);
        var total=allEx.reduce(function(a,e){return a+totalSetsFor(e)},0);
        var done=allEx.reduce(function(a,e){return a+countBilateralDone(e,dd)},0);
        if(done>=Math.ceil(total*0.5))return true;
      }
      return false;
    });
    if(allDaysDone)setShowMesoAdvance(true);
  },[DAYS]);
  useEffect(function(){checkMesoAdvance()},[]);
  useEffect(function(){var onVis=function(){if(!document.hidden)checkMesoAdvance()};document.addEventListener("visibilitychange",onVis);return function(){document.removeEventListener("visibilitychange",onVis)}},[checkMesoAdvance]);

  /* ── Backup reminder & auto-backup check ── */
  useEffect(function(){checkBackupReminder();checkAutoBackup()},[]);

  /* ── Auto-end session after 30 min inactivity ── */
  useEffect(function(){
    var INACTIVITY_MS=30*60*1000;
    var onInteract=function(){_lastActivity=Date.now()};
    document.addEventListener("pointerdown",onInteract);
    function checkAutoEnd(){
      var started=getSessionStart();if(!started)return;
      /* Stale session from a different day */
      if(_sessionDateLock&&_sessionDateLock!==today()){endSession();showUndoToast("Previous session ended automatically",null,5000);refresh();return}
      /* 30 min inactivity */
      if(Date.now()-_lastActivity>INACTIVITY_MS){endSession();showUndoToast("Session auto-ended after 30 min inactivity",null,5000);refresh()}
    }
    var id=setInterval(checkAutoEnd,60000);
    var onVis=function(){if(!document.hidden)checkAutoEnd()};
    document.addEventListener("visibilitychange",onVis);
    checkAutoEnd();
    return function(){clearInterval(id);document.removeEventListener("visibilitychange",onVis);document.removeEventListener("pointerdown",onInteract)};
  },[]);

  return h("div",{className:"app-root",style:{display:"flex",flexDirection:"column",overflow:"hidden"}},
    h(OfflineIndicator),
    storageFull?h("div",{style:{background:"var(--danger)",color:"#fff",textAlign:"center",padding:"6px 12px",fontSize:11,fontWeight:700}},"Storage full! Export your data in Settings to avoid data loss."):null,
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
          h("div",{style:{fontSize:11,color:"var(--text-dim)"}},formatDateFull(today())),
          h("div",{style:{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",marginTop:2}},h(SessionTimer,{onRefresh:refresh})))),
      /* Day tabs */
      h("div",{style:{display:"flex",gap:3},role:"tablist","aria-label":"Training days"},DAYS.map(function(day,i){
        var saved=dayData.getData(day.id);var customs=getCustomExercises(day.id);var allEx=day.exercises.concat(customs);
        var doneSets=allEx.reduce(function(a,e){return a+countBilateralDone(e,saved)},0);
        var totalSets=allEx.reduce(function(a,e){return a+totalSetsFor(e)},0);var hasProg=doneSets>0,complete=doneSets===totalSets&&totalSets>0;
        return h("button",{key:day.id,onClick:function(){setActiveDay(i);setNavTab(0)},className:"tab"+(activeDay===i?" tab--active":"")+(complete?" tab--complete":""),role:"tab","aria-selected":activeDay===i?"true":"false","aria-controls":"day-panel-"+day.id},
          h("div",{style:{fontSize:11,fontWeight:700,color:activeDay===i?"var(--accent)":complete?"var(--success)":"var(--text-dim)",letterSpacing:.4}},dayMap[day.id]),
          h("div",{style:{fontSize:13,fontWeight:700,color:activeDay===i?"var(--text-bright)":complete?"var(--text-dim)":"var(--text-dim)",marginTop:1}},day.label),
          (hasProg||complete)?h("div",{style:{width:4,height:4,borderRadius:2,background:complete?"var(--success)":"var(--accent)",margin:"3px auto 0"},"aria-hidden":"true"}):null)})),
      /* Swipe dot indicators */
      h("div",{style:{display:"flex",justifyContent:"center",gap:4,marginTop:6},"aria-hidden":"true"},DAYS.map(function(_,i){return h("div",{key:i,style:{width:activeDay===i?12:5,height:5,borderRadius:3,background:activeDay===i?"var(--accent)":"rgba(255,255,255,0.12)",transition:"width 0.2s, background 0.2s"}})}))),
    /* Week strip */
    h("div",{style:{display:"flex",justifyContent:"center",gap:3,padding:"4px 16px 6px",background:"var(--bg)"},"aria-label":"This week"},
      weekStripData.map(function(wd){var isToday=wd.dow===(new Date().getDay()||7);return h("div",{key:wd.dow,style:{flex:1,textAlign:"center",padding:"3px 0",borderRadius:6,background:isToday?"rgba(245,158,11,0.1)":"transparent",border:isToday?"1px solid var(--accent-border)":"1px solid transparent"}},
        h("div",{style:{fontSize:9,fontWeight:700,color:isToday?"var(--accent)":"var(--text-dim)"}},["M","T","W","T","F","S","S"][wd.dow-1]),
        h("div",{style:{width:5,height:5,borderRadius:3,margin:"2px auto 0",background:wd.complete?"var(--success)":wd.hasSets?"var(--accent)":"rgba(255,255,255,0.06)"}}))})),
    /* Content */
    h("main",{ref:scrollRef,onTouchStart:onTouchStart,onTouchEnd:onTouchEnd,className:"content"},
      showMesoAdvance?h("div",{style:{background:"var(--info-bg)",border:"1px solid var(--info-border)",borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}},
        h("div",null,h("div",{style:{fontSize:12,fontWeight:700,color:"var(--info)"}},"Week "+meso.week+" Complete"),h("div",{style:{fontSize:11,color:"var(--text-secondary)"}},"All training days done this week. Advance mesocycle?")),
        h("div",{style:{display:"flex",gap:6}},
          h("button",{onClick:function(){var m=advanceMesoWeek();setMeso(m);lsSet("meso_advanced_wk"+(m.week-1>0?m.week-1:4),true);setShowMesoAdvance(false);refresh()},className:"btn btn--info btn--sm"},"Advance"),
          h("button",{onClick:function(){lsSet("meso_advanced_wk"+meso.week,true);setShowMesoAdvance(false)},className:"btn btn--ghost btn--sm"},"Dismiss"))):null,
      h("div",{id:"day-panel-"+DAYS[activeDay].id,role:"tabpanel","aria-label":DAYS[activeDay].label},
        h(DayView,{key:activeDay,day:DAYS[activeDay],refresh:refresh,config:config,fatigue:fatigue,onMesoChange:function(m){setMeso(m)}}))),
    /* Save flash + Floating timer */
    h(SaveFlash,null),
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
      h("div",{className:"sheet fade-in",ref:moreRef,style:{paddingBottom:"max(env(safe-area-inset-bottom,0px),24px)"}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
          h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"More"),
          h("button",{onClick:function(){setShowMore(false)},style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"},"aria-label":"Close"},"\u2715")),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
          h("button",{onClick:function(){setShowMore(false);setShowMetrics(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCCF Body Metrics"),
          h("button",{onClick:function(){setShowMore(false);setShowHistory(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCCB Session History"),
          h("button",{onClick:function(){setShowMore(false);setShowCalendar(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCC5 Workout Calendar"),
          h("button",{onClick:function(){setShowMore(false);setShowFatigueTrend(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCCA Fatigue Trend"),
          h("button",{onClick:function(){setShowMore(false);setShowTemplates(true)},className:"btn btn--accent-ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\uD83D\uDCCB Templates"),
          h("button",{onClick:function(){setShowMore(false);setShowSettings(true)},className:"btn btn--ghost btn--full",style:{padding:"14px 12px",fontSize:13}},"\u2699\uFE0F Settings")),
        /* PWA Install */
        function(){if(isStandalone())return null;
          if(canInstall)return h("button",{onClick:function(){triggerInstallPrompt();setShowMore(false)},className:"btn btn--accent btn--full",style:{marginTop:10,padding:"14px 12px",fontSize:13}},"\uD83D\uDCF2 Install App");
          if(isIOS())return h("div",{style:{marginTop:10,padding:"10px 12px",background:"rgba(255,255,255,0.03)",borderRadius:10,fontSize:11,color:"var(--text-dim)",textAlign:"center",lineHeight:1.5}},"To install: tap ",h("span",{style:{fontWeight:700}},"Share \u2B06\uFE0F")," then ",h("span",{style:{fontWeight:700}},"Add to Home Screen"));
          return null}())):null,
    /* Modals */
    showSettings?h(SettingsPanel,{onClose:function(){setShowSettings(false);refresh()},config:config,dayMap:dayMap,setDayMapState:setDayMapState,onMesoChange:function(m){setMeso(m)},onBodyMetrics:function(){setShowSettings(false);setShowMetrics(true)},onSessionHistory:function(){setShowSettings(false);setShowHistory(true)}}):null,
    showMetrics?h(BodyMetrics,{onClose:function(){setShowMetrics(false)}}):null,
    showVolume?h(VolumeDashboard,{onClose:function(){setShowVolume(false)},config:config}):null,
    showHistory?h(SessionHistory,{onClose:function(){setShowHistory(false)}}):null,
    showRecords?h(PersonalRecords,{onClose:function(){setShowRecords(false)},config:config}):null,
    showCalendar?h(WorkoutCalendar,{onClose:function(){setShowCalendar(false)},config:config}):null,
    showFatigueTrend?h(FatigueTrendChart,{onClose:function(){setShowFatigueTrend(false)},config:config}):null,
    showTemplates?h(TemplateManager,{onClose:function(){setShowTemplates(false);refresh()},config:config}):null,
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

/* ── Workout Templates ── */
function TemplateManager(props){
  var onClose=props.onClose,config=props.config;var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var st=useState(function(){return getTemplates()}),templates=st[0],setTemplates=st[1];
  var ss=useState(false),showSave=ss[0],setShowSave=ss[1];
  var sn=useState(""),tplName=sn[0],setTplName=sn[1];
  var sd=useState(config.days[0].id),saveDayId=sd[0],setSaveDayId=sd[1];

  var handleSave=function(){
    if(!tplName.trim())return;
    var day=config.days.find(function(d){return d.id===saveDayId});if(!day)return;
    var exercises=applyOverrides(applySwaps(day.exercises,day.id)).concat(getCustomExercises(day.id));
    saveTemplate(tplName.trim(),saveDayId,exercises);
    setTemplates(getTemplates());setShowSave(false);setTplName("");
    showUndoToast("Template saved!",null,2000);
  };

  var handleLoad=function(tpl){
    tpl.exercises.forEach(function(ex){
      var existing=false;
      config.days.forEach(function(d){d.exercises.forEach(function(e){if(e.id===ex.id)existing=true})});
      if(!existing){addCustomExercise(saveDayId,{id:ex.id+"_tpl_"+Date.now(),name:ex.name,sets:ex.sets,reps:ex.reps||"8-10",rest:ex.rest||90,muscles:ex.muscles||[],custom:true})}
    });
    showUndoToast("Template loaded to "+saveDayId,null,2000);onClose();
  };

  var handleDelete=function(idx){showConfirm({title:"Delete Template",msg:"Delete \""+templates[idx].name+"\"? This cannot be undone.",confirmLabel:"Delete",danger:true,onConfirm:function(){deleteTemplate(idx);setTemplates(getTemplates())}})}

  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Workout Templates"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Workout Templates"),
      h("button",{onClick:onClose,"aria-label":"Close",style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    h("button",{onClick:function(){setShowSave(!showSave)},className:"btn btn--accent btn--full",style:{marginBottom:12}},showSave?"Cancel":"+ Save Current Workout"),
    showSave?h("div",{className:"fade-in",style:{background:"var(--surface-alt)",borderRadius:10,padding:12,marginBottom:12}},
      h("input",{type:"text",value:tplName,onChange:function(e){setTplName(e.target.value)},placeholder:"Template name",style:{width:"100%",padding:"8px 10px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:13,marginBottom:8}}),
      h("select",{value:saveDayId,onChange:function(e){setSaveDayId(e.target.value)},style:{width:"100%",padding:"8px 10px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:13,marginBottom:8}},
        config.days.map(function(d){return h("option",{key:d.id,value:d.id},d.title||d.label)})),
      h("button",{onClick:handleSave,className:"btn btn--success btn--full",disabled:!tplName.trim()},"Save Template")):null,
    templates.length===0?h("div",{className:"empty-state"},h("div",{className:"empty-state__icon"},"\uD83D\uDCCB"),h("div",{className:"empty-state__title"},"No templates yet"),h("div",{className:"empty-state__desc"},"Save a workout to reuse it later.")):
    h("div",{style:{maxHeight:"50vh",overflowY:"auto"}},templates.map(function(tpl,i){
      return h("div",{key:i,style:{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
          h("span",{style:{fontSize:13,fontWeight:700,color:"var(--text-bright)"}},tpl.name),
          h("div",{style:{display:"flex",gap:4}},
            h("button",{onClick:function(){handleLoad(tpl)},className:"btn btn--success btn--xs"},"Load"),
            h("button",{onClick:function(){handleDelete(i)},className:"btn btn--ghost btn--xs",style:{color:"var(--danger)"}},"\u2715"))),
        h("div",{style:{fontSize:11,color:"var(--text-dim)"}},tpl.exercises.length+" exercises \u00B7 "+tpl.createdAt),
        h("div",{style:{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}},tpl.exercises.map(function(ex){return h("span",{key:ex.id,style:{fontSize:10,color:"var(--text-secondary)",background:"rgba(255,255,255,0.04)",padding:"2px 6px",borderRadius:4}},ex.name)})))}))));
}

/* ── Fatigue Trend Chart (4-week rolling) ── */
function FatigueTrendChart(props){
  var onClose=props.onClose,config=props.config;var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var data=useMemo(function(){
    var points=[];
    /* Scan last 28 days */
    var now=new Date();
    for(var d=27;d>=0;d--){
      var dt=new Date(now);dt.setDate(dt.getDate()-d);
      var dateStr=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
      var rpeSum=0,rpeCount=0,rirSum=0,rirCount=0;
      config.days.forEach(function(day){
        var dd=getIndexDataForDate(day.id,dateStr);if(!dd||!dd.exercises)return;
        var hasSets=Object.keys(dd.exercises).some(function(k){return dd.exercises[k].some(function(s){return s.done})});
        if(!hasSets)return;
        day.exercises.forEach(function(ex){
          if(dd.rpe&&dd.rpe[ex.id]){rpeSum+=dd.rpe[ex.id];rpeCount++}
          if(dd.setRir&&dd.setRir[ex.id]){var rir=dd.setRir[ex.id];Object.keys(rir).forEach(function(k){if(typeof rir[k]==="number"){rirSum+=rir[k];rirCount++}})}
        });
      });
      var score=null;
      if(rpeCount>=1&&rirCount>=1){score=((rpeSum/rpeCount)+(10-rirSum/rirCount))/2}
      else if(rpeCount>=1){score=rpeSum/rpeCount}
      else if(rirCount>=1){score=10-rirSum/rirCount}
      points.push({date:dateStr,score:score,day:dt.getDay()});
    }
    return points;
  },[config]);
  var scored=data.filter(function(p){return p.score!==null});
  if(scored.length<2)return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Fatigue Trend"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Fatigue Trend"),
      h("button",{onClick:onClose,"aria-label":"Close",style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    h("div",{style:{textAlign:"center",padding:"20px 0",color:"var(--text-dim)",fontSize:12}},"Not enough data yet. Log RPE or RIR for at least 2 sessions.")));
  var W=300,H=120,pad=8;
  var vals=scored.map(function(p){return p.score});
  var mn=Math.min(...vals),mx=Math.max(...vals);var range=mx-mn||1;
  var pathPts=scored.map(function(p,i){return(pad+i*(W-2*pad)/(scored.length-1))+","+(pad+(1-(p.score-mn)/range)*(H-2*pad))}).join(" ");
  /* Weekly averages */
  var weeks=[[],[],[],[]];
  data.forEach(function(p,i){var wk=Math.floor(i/7);if(wk<4&&p.score!==null)weeks[wk].push(p.score)});
  var weekAvgs=weeks.map(function(w){return w.length?Math.round(w.reduce(function(a,b){return a+b},0)/w.length*10)/10:null});
  var latest=scored[scored.length-1].score;var earliest=scored[0].score;
  var trend=latest-earliest;var trendColor=trend>0.5?"var(--danger)":trend<-0.5?"var(--success)":"var(--text-dim)";
  var trendLabel=trend>0.5?"Fatigue increasing":trend<-0.5?"Fatigue decreasing":"Stable";
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Fatigue Trend"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Fatigue Trend"),
      h("button",{onClick:onClose,"aria-label":"Close",style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    h("div",{style:{textAlign:"center",marginBottom:12}},
      h("span",{style:{fontSize:13,fontWeight:700,color:trendColor}},trendLabel),
      h("span",{style:{fontSize:11,color:"var(--text-dim)",marginLeft:8}},"(last 4 weeks)")),
    h("svg",{width:"100%",height:H,viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none",style:{background:"rgba(255,255,255,0.02)",borderRadius:8},"aria-hidden":"true"},
      h("line",{x1:pad,y1:pad+(1-(8.5-mn)/range)*(H-2*pad),x2:W-pad,y2:pad+(1-(8.5-mn)/range)*(H-2*pad),stroke:"rgba(239,68,68,0.2)",strokeWidth:1,strokeDasharray:"4"}),
      h("polyline",{points:pathPts,fill:"none",stroke:"var(--accent)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"})),
    h("div",{style:{display:"flex",justifyContent:"space-between",fontSize:9,color:"var(--text-dim)",marginTop:4,padding:"0 4px"}},
      h("span",null,"4 weeks ago"),
      h("span",null,"Today")),
    h("div",{style:{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:"var(--text-dim)",padding:"0 4px"}},
      h("span",null,"Low fatigue"),
      h("span",{style:{color:"rgba(239,68,68,0.5)"}},"--- RPE 8.5 threshold"),
      h("span",null,"High fatigue")),
    h("div",{style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:16}},
      weekAvgs.map(function(avg,i){return h("div",{key:i,style:{textAlign:"center",padding:"8px 4px",borderRadius:8,background:avg===null?"rgba(255,255,255,0.02)":avg>=8.5?"var(--danger-bg)":avg>=7.5?"var(--accent-bg)":"var(--success-bg)",border:"1px solid "+(avg===null?"var(--border)":avg>=8.5?"var(--danger-border)":avg>=7.5?"var(--accent-border)":"var(--success-border)")}},
        h("div",{style:{fontSize:9,fontWeight:700,color:"var(--text-dim)"}},"Wk "+(i+1)),
        h("div",{style:{fontSize:16,fontWeight:800,color:avg===null?"var(--text-dim)":avg>=8.5?"var(--danger)":avg>=7.5?"var(--accent)":"var(--success)"}},avg!==null?avg.toFixed(1):"\u2014"))}))));
}

/* ── Workout Calendar ── */
function WorkoutCalendar(props){
  var onClose=props.onClose,config=props.config;var sheetRef=useRef(null);useFocusTrap(sheetRef,onClose);
  var sm=useState(function(){var d=new Date();return{year:d.getFullYear(),month:d.getMonth()}}),monthState=sm[0],setMonthState=sm[1];
  var sd=useState(null),selectedDate=sd[0],setSelectedDate=sd[1];
  var workoutDates=useMemo(function(){
    if(!_historyBuilt)buildHistoryIndex();
    var dates={};
    Object.keys(_historyIndex||{}).forEach(function(dayId){
      (_historyIndex[dayId]||[]).forEach(function(entry){
        if(!dates[entry.date])dates[entry.date]={sets:0,days:0};
        var exKeys=Object.keys(entry.data.exercises||{});
        var doneSets=0;exKeys.forEach(function(ek){(entry.data.exercises[ek]||[]).forEach(function(s){if(s.done)doneSets++})});
        dates[entry.date].sets+=doneSets;dates[entry.date].days++;
      });
    });
    return dates;
  },[]);
  var y=monthState.year,m=monthState.month;
  var firstDay=new Date(y,m,1).getDay()||7;/* Mon=1 */
  var daysInMonth=new Date(y,m+1,0).getDate();
  var prevMonth=function(){setMonthState(m===0?{year:y-1,month:11}:{year:y,month:m-1})};
  var nextMonth=function(){setMonthState(m===11?{year:y+1,month:0}:{year:y,month:m+1})};
  var monthLabel=new Date(y,m).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  var cells=[];for(var pad=1;pad<firstDay;pad++)cells.push(null);
  for(var d=1;d<=daysInMonth;d++)cells.push(d);
  var todayStr=today();
  return h("div",{className:"overlay",onClick:function(e){if(e.target===e.currentTarget)onClose()},role:"dialog","aria-modal":"true","aria-label":"Workout Calendar"},h("div",{className:"sheet fade-in",ref:sheetRef},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("h3",{style:{fontSize:18,fontWeight:800,color:"var(--text-bright)"}},"Workout Calendar"),
      h("button",{onClick:onClose,"aria-label":"Close",style:{background:"none",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer"}},"\u2715")),
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
      h("button",{onClick:prevMonth,className:"btn btn--ghost btn--sm"},"\u2190"),
      h("span",{style:{fontSize:14,fontWeight:700,color:"var(--text-bright)"}},monthLabel),
      h("button",{onClick:nextMonth,className:"btn btn--ghost btn--sm"},"\u2192")),
    h("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,textAlign:"center"}},
      ["M","T","W","T","F","S","S"].map(function(dl,i){return h("div",{key:"h"+i,style:{fontSize:9,fontWeight:700,color:"var(--text-dim)",padding:"4px 0"}},dl)}),
      cells.map(function(day,i){
        if(!day)return h("div",{key:"e"+i});
        var dateStr=y+"-"+String(m+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
        var wd=workoutDates[dateStr];var isToday=dateStr===todayStr;
        var bg=wd?wd.sets>=15?"rgba(34,197,94,0.4)":wd.sets>=8?"rgba(34,197,94,0.25)":"rgba(34,197,94,0.12)":"transparent";
        var clickHandler=wd?(function(ds){return function(){setSelectedDate(function(prev){return prev===ds?null:ds})}})(dateStr):undefined;
        return h("div",{key:i,onClick:clickHandler,onKeyDown:wd?function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();clickHandler()}}:undefined,role:wd?"button":undefined,tabIndex:wd?0:undefined,"aria-label":wd?day+" - "+wd.sets+" sets":undefined,style:{padding:"6px 2px",borderRadius:6,background:bg,border:isToday?"1px solid var(--accent)":selectedDate===dateStr?"1px solid var(--info)":"1px solid transparent",minHeight:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:wd?"pointer":"default"}},
          h("span",{style:{fontSize:11,fontWeight:isToday?800:500,color:wd?"var(--text-bright)":"var(--text-dim)"}},day));
      })),
    selectedDate&&workoutDates[selectedDate]?function(){
      var details=[];
      config.days.forEach(function(day){
        var dd=loadDayData(day.id,selectedDate);
        if(!dd.exercises||!Object.keys(dd.exercises).length)return;
        var dayExercises=[];
        Object.keys(dd.exercises).forEach(function(exId){
          var sets=dd.exercises[exId];var done=sets.filter(function(s){return s.done});
          if(done.length===0)return;
          var exName=exId;day.exercises.forEach(function(e){if(e.id===exId||e.id+"_L"===exId||e.id+"_R"===exId)exName=e.name+(exId.endsWith("_L")?" (L)":exId.endsWith("_R")?" (R)":"")});
          dayExercises.push({name:exName,sets:done.map(function(s){return s.weight+"×"+s.reps})});
        });
        if(dayExercises.length)details.push({title:day.title,exercises:dayExercises});
      });
      var label=formatDateFull(selectedDate);
      return h("div",{className:"fade-in",style:{marginTop:12,padding:"12px 14px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid var(--border)"}},
        h("div",{style:{fontSize:12,fontWeight:700,color:"var(--info)",marginBottom:8}},label),
        details.length===0?h("div",{style:{fontSize:11,color:"var(--text-dim)"}},"No detailed data available"):
        details.map(function(d,di){return h("div",{key:di,style:{marginBottom:di<details.length-1?10:0}},
          h("div",{style:{fontSize:11,fontWeight:700,color:"var(--text-secondary)",marginBottom:4}},d.title),
          d.exercises.map(function(ex,ei){return h("div",{key:ei,style:{fontSize:11,color:"var(--text-dim)",marginBottom:2}},
            ex.name+": "+ex.sets.join(", "))}))})
      );
    }():null,
    h("div",{style:{display:"flex",gap:12,marginTop:12,justifyContent:"center"}},
      h("div",{style:{display:"flex",alignItems:"center",gap:4}},h("div",{style:{width:10,height:10,borderRadius:3,background:"rgba(34,197,94,0.12)"}}),h("span",{style:{fontSize:9,color:"var(--text-dim)"}},"1-7 sets")),
      h("div",{style:{display:"flex",alignItems:"center",gap:4}},h("div",{style:{width:10,height:10,borderRadius:3,background:"rgba(34,197,94,0.25)"}}),h("span",{style:{fontSize:9,color:"var(--text-dim)"}},"8-14 sets")),
      h("div",{style:{display:"flex",alignItems:"center",gap:4}},h("div",{style:{width:10,height:10,borderRadius:3,background:"rgba(34,197,94,0.4)"}}),h("span",{style:{fontSize:9,color:"var(--text-dim)"}},"15+ sets")))));
}

/* ══════════════════════════════════════════
   ROOT
   ══════════════════════════════════════════ */
function App(){
  var profileId=getProfileFromURL();
  var s=useState(null),config=s[0],setConfig=s[1];var s2=useState(null),error=s2[0],setError=s2[1];
  useEffect(function(){
    if(!profileId)return;
    var safeId=profileId.replace(/[^a-zA-Z0-9_-]/g,"");
    initProfile(safeId);
    var configUrl="configs/"+safeId+".json";
    fetch(configUrl).then(function(r){if(!r.ok)throw new Error("Profile not found: "+profileId);return r.json()}).then(function(data){
      var err=validateConfig(data);if(err){setError("Config error: "+err);return}
      setConfig(data);
      /* Cache config in SW for offline access — use ready to handle first-install case where controller isn't set yet */
      if(navigator.serviceWorker){navigator.serviceWorker.ready.then(function(){if(navigator.serviceWorker.controller){navigator.serviceWorker.controller.postMessage({type:"CACHE_CONFIG",url:"./"+configUrl})}}).catch(function(){})}
    }).catch(function(err){setError(err.message)});
  },[profileId]);
  if(!profileId)return h(ProfileSelector,null);
  if(error)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",padding:40,textAlign:"center"}},h("div",null,h("div",{style:{fontSize:40,marginBottom:16},"aria-hidden":"true"},"\u26A0\uFE0F"),h("h2",{style:{fontSize:18,fontWeight:700,color:"var(--text-bright)",marginBottom:8}},"Profile Not Found"),h("p",{style:{fontSize:14,color:"var(--text-dim)"}},error),h("a",{href:"?",style:{display:"inline-block",marginTop:16,padding:"10px 20px",borderRadius:10,background:"var(--accent)",color:"#000",fontWeight:700,fontSize:14,textDecoration:"none"}},"View All Profiles")));
  if(!config)return h("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"},"aria-label":"Loading application"},h("div",{style:{width:24,height:24,border:"3px solid rgba(245,158,11,0.3)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}));
  return h(TimerProvider,null,h(DayDataProvider,null,h(MainApp,{config:config})));
}

ReactDOM.createRoot(document.getElementById("root")).render(h(ErrorBoundary,null,h(App)));

/* ═══ PWA INSTALL PROMPT ═══ */
var _deferredInstallPrompt=null;
var _installPromptListeners=[];
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();_deferredInstallPrompt=e;_installPromptListeners.forEach(function(fn){fn(true)})});
window.addEventListener("appinstalled",function(){_deferredInstallPrompt=null;_installPromptListeners.forEach(function(fn){fn(false)})});
function onInstallPromptChange(fn){_installPromptListeners.push(fn);return function(){_installPromptListeners=_installPromptListeners.filter(function(f){return f!==fn})}}
function triggerInstallPrompt(){var p=_deferredInstallPrompt;if(p){p.prompt();p.userChoice.then(function(){_deferredInstallPrompt=null;_installPromptListeners.forEach(function(fn){fn(false)})}).catch(function(){_deferredInstallPrompt=null;_installPromptListeners.forEach(function(fn){fn(false)})})}}
function isIOS(){return/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&"ontouchend"in document)}
function isStandalone(){return window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}

if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").then(function(reg){
  reg.addEventListener("updatefound",function(){var nw=reg.installing;if(nw){nw.addEventListener("statechange",function(){if(nw.state==="installed"&&navigator.serviceWorker.controller){
    var toast=document.createElement("div");toast.textContent="Update available \u2014 tap to refresh";
    toast.style.cssText="position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;background:#f59e0b;color:#000;font-weight:700;font-size:13px;z-index:9999;cursor:pointer;font-family:-apple-system,sans-serif";
    toast.onclick=function(){nw.postMessage({type:"SKIP_WAITING"})};document.body.appendChild(toast);
  }})}});
  setInterval(function(){reg.update().catch(function(){})},3600000);
}).catch(function(e){console.warn("SW registration failed:",e)})});
  navigator.serviceWorker.addEventListener("controllerchange",function(){
    /* Delay reload if user is actively typing to prevent data loss */
    if(document.activeElement&&(document.activeElement.tagName==="INPUT"||document.activeElement.tagName==="TEXTAREA")){
      var banner=document.createElement("div");banner.textContent="Update ready \u2014 tap to reload";
      banner.style.cssText="position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;background:#22c55e;color:#000;font-weight:700;font-size:13px;z-index:9999;cursor:pointer;font-family:-apple-system,sans-serif";
      banner.onclick=function(){window.location.reload()};document.body.appendChild(banner);
    }else{window.location.reload()}
  });
}

