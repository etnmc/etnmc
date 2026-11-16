/* GW-M5610U (module 3495) simulator core. No DOM in this block.
   Button logic follows Casio's Watch Operation Guide 3495. Timing of radio reception is compressed. */
function createWatch(opts){
  'use strict';
  opts = opts || {};
  var now = opts.now || function(){ return Date.now(); };
  var emit = opts.emit || function(){};
  var HOUR = 3600e3, FIG = ' ';

  /* [name, UTC offset (h), transmitter group, summer-time rule] in the order the watch steps through them */
  var C = [
    ['UTC',0,null,null],
    ['LISBON',0,'EU','EU'],['LONDON',0,'EU','EU'],['MADRID',1,'EU','EU'],['PARIS',1,'EU','EU'],
    ['ROME',1,'EU','EU'],['BERLIN',1,'EU','EU'],['STOCKHOLM',1,'EU','EU'],['ATHENS',2,'EU','EU'],
    ['CAIRO',2,null,null],['JERUSALEM',2,null,null],['MOSCOW',3,null,null],['JEDDAH',3,null,null],
    ['TEHRAN',3.5,null,null],['DUBAI',4,null,null],['KABUL',4.5,null,null],['KARACHI',5,null,null],
    ['DELHI',5.5,null,null],['KATHMANDU',5.75,null,null],['DHAKA',6,null,null],['YANGON',6.5,null,null],
    ['BANGKOK',7,null,null],['SINGAPORE',8,null,null],['HONG KONG',8,'CN',null],['BEIJING',8,'CN',null],
    ['TAIPEI',8,'JP',null],['SEOUL',9,'JP',null],['TOKYO',9,'JP',null],['ADELAIDE',9.5,null,'AU'],
    ['GUAM',10,null,null],['SYDNEY',10,null,'AU'],['NOUMEA',11,null,null],['WELLINGTON',12,null,'NZ'],
    ['PAGO PAGO',-11,null,null],['HONOLULU',-10,null,null],['ANCHORAGE',-9,null,null],
    ['VANCOUVER',-8,'NA','NA'],['LOS ANGELES',-8,'NA','NA'],['EDMONTON',-7,'NA','NA'],['DENVER',-7,'NA','NA'],
    ['MEXICO CITY',-6,'NA',null],['CHICAGO',-6,'NA','NA'],['NEW YORK',-5,'NA','NA'],['HALIFAX',-4,'NA','NA'],
    ["ST. JOHN'S",-3.5,'NA','NA'],['BUENOS AIRES',-3,null,null],['RIO DE JANEIRO',-3,null,null],
    ['F. DE NORONHA',-2,null,null],['PRAIA',-1,null,null]
  ];
  var TX = { EU:'MSF / DCF77', CN:'BPC', JP:'JJY', NA:'WWVB' };
  var DOW = [
    ['SU','MO','TU','WE','TH','FR','SA'],
    ['DO','LU','MA','MI','JU','VI','SA'],
    ['DI','LU','MA','ME','JE','VE','SA'],
    ['SO','MO','DI','MI','DO','FR','SA'],
    ['DO','LU','MA','ME','GI','VE','SA'],
    ['BC','ПH','BT','CP','ЧT','ПT','CБ']
  ];
  var LANG = ['ENG','ESP','FRA','DEU','ITA','PyC'];
  var ORDER = ['TK','WT','AL','ST','TR'];
  var NAME = {TK:'Timekeeping', WT:'World Time', AL:'Alarm', ST:'Stopwatch', TR:'Timer'};
  var SET = [
    {n:'Home City', d:'Next city', b:'Previous city', rep:true},
    {n:'Summer time', d:'Next option'},
    {n:'Seconds', d:'Reset seconds to 00'},
    {n:'Hours', d:'Hour up', b:'Hour down', rep:true},
    {n:'Minutes', d:'Minute up', b:'Minute down', rep:true},
    {n:'Year', d:'Year up', b:'Year down', rep:true},
    {n:'Month', d:'Month up', b:'Month down', rep:true},
    {n:'Day', d:'Day up', b:'Day down', rep:true},
    {n:'12/24-hour', d:'Switch 12H / 24H'},
    {n:'Date format', d:'Switch M.DD / DD.M'},
    {n:'Day language', d:'Next language'},
    {n:'Button tone', d:'Switch KEY♪ / MUTE'},
    {n:'Light duration', d:'Switch 1.5 s / 3 s'},
    {n:'Auto receive', d:'Switch On / OFF'},
    {n:'Power saving', d:'Switch On / OFF'}
  ];

  var S, held = {};

  function idx(name){ for (var i=0;i<C.length;i++) if (C[i][0]===name) return i; return 0; }
  function log(m){ emit('log', m); }
  function p2(n){ return (n<10?'0':'')+n; }
  function s2(n){ return (n<10?' ':'')+n; }
  function f2(n){ return (n<10?FIG:'')+n; }
  function cols(s){ var n=0, i, ch; for (i=0;i<s.length;i++){ ch=s.charAt(i); n += (ch==='.'||ch===':'||ch==="'") ? 1 : (ch===' ' ? 3 : 5); if (i<s.length-1) n+=1; } return n; }

  /* ---------- summer-time rules ---------- */
  function lastSun(y,m){ var d = new Date(Date.UTC(y,m+1,0)); return Date.UTC(y,m,d.getUTCDate()-d.getUTCDay()); }
  function nthSun(y,m,n){ var f = new Date(Date.UTC(y,m,1)); return Date.UTC(y,m,1+((7-f.getUTCDay())%7)+7*(n-1)); }
  function ruleDst(rule, off, t){
    if (!rule) return false;
    var o = off*HOUR, y = new Date(t+o).getUTCFullYear(), s, e;
    if (rule==='EU'){ s = lastSun(y,2)+HOUR; e = lastSun(y,9)+HOUR; return t>=s && t<e; }
    if (rule==='NA'){ s = nthSun(y,2,2)+2*HOUR-o; e = nthSun(y,10,1)+HOUR-o; return t>=s && t<e; }
    if (rule==='AU'){ s = nthSun(y,9,1)+2*HOUR-o; e = nthSun(y,3,1)+2*HOUR-o; return t>=s || t<e; }
    if (rule==='NZ'){ s = lastSun(y,8)+2*HOUR-o; e = nthSun(y,3,1)+2*HOUR-o; return t>=s || t<e; }
    return false;
  }

  /* ---------- state ---------- */
  function defaults(factory){
    var t = now();
    function slot(name){ var i = idx(name); return {c:i, dst: ruleDst(C[i][3], C[i][1], t)}; }
    return {
      mode:'TK', sub:null, subT0:0, setIdx:0, setT0:0,
      home: idx(factory ? 'TOKYO' : 'LONDON'), homeDst:'auto', adj:0,
      h24:false, dateFmt:'MD', lang:0, tone:true, lightDur:1.5, autoRx:true, ps:true, autoLight:false,
      wt:[slot('NEW YORK'), slot('TOKYO'), slot('UTC'), slot('DUBAI'), slot('SYDNEY')],
      wtSel:0, wtStage:'city',
      al:[{h:6,m:0,on:false},{h:7,m:0,on:false},{h:12,m:0,on:false},{h:18,m:0,on:false},{h:6,m:30,on:false}],
      sig:false, alSel:0, alStage:'h', snz:null,
      sw:{run:false, t0:0, acc:0, split:null},
      tm:{start:600, left:600e3, run:false, end:0}, tmStage:'h',
      lightUntil:0, rx:null, rxRes:null, lastRx:null, rcvd:false, rcvdKey:0,
      power:'H', sleep:0, dark:false, tilt:0, signal:'good',
      beep:null, banner:null, lastOp:t, lastMin:null
    };
  }

  /* ---------- time ---------- */
  function utc(){ return now() + S.adj; }
  function homeDstOn(t){
    if (S.homeDst==='on') return true;
    if (S.homeDst==='off') return false;
    var c = C[S.home];
    return c[2] ? ruleDst(c[3], c[1], t) : false;
  }
  function homeOff(t){ return C[S.home][1]*HOUR + (homeDstOn(t) ? HOUR : 0); }
  function fields(ms){
    var d = new Date(ms);
    return {y:d.getUTCFullYear(), mo:d.getUTCMonth()+1, d:d.getUTCDate(), h:d.getUTCHours(), mi:d.getUTCMinutes(),
            s:d.getUTCSeconds(), ms:d.getUTCMilliseconds(), dow:d.getUTCDay()};
  }
  function homeNow(){ var t = utc(); return fields(t + homeOff(t)); }
  function slotNow(i){ var w = S.wt[i], c = C[w.c]; return fields(utc() + c[1]*HOUR + (w.dst ? HOUR : 0)); }
  function dayKey(f){ return f.y*10000 + f.mo*100 + f.d; }
  function setHome(ch, zeroSec){
    var t = utc(), off = homeOff(t), f = fields(t+off), k, dim, local;
    for (k in ch) f[k] = ch[k];
    dim = new Date(Date.UTC(f.y, f.mo, 0)).getUTCDate();
    if (f.d > dim) f.d = dim;
    local = Date.UTC(f.y, f.mo-1, f.d, f.h, f.mi, zeroSec ? 0 : f.s, zeroSec ? 0 : f.ms);
    S.adj = (local - off) - now();
    S.rcvd = false;
  }
  function seedLastRx(){
    var t = utc(), off = homeOff(t), f = fields(t+off);
    var today = Date.UTC(f.y, f.mo-1, f.d, 0, 4, 0) - off;
    if (t - today > 6*60e3){ S.lastRx = today; S.rcvd = true; S.rcvdKey = dayKey(f); }
    else { S.lastRx = today - 86400e3; S.rcvd = false; S.rcvdKey = 0; }
  }

  /* ---------- sound and light ---------- */
  function powered(){ return S.power==='H' || S.power==='M'; }
  function key(){ if (S.tone && powered()) emit('beep','key'); }
  function beeping(){ return !!(S.beep && now() < S.beep.until); }
  function beep(kind){
    if (!powered() || S.sleep===2) return false;
    S.beep = {kind:kind, until: now() + (kind==='sig' ? 900 : 10000)};
    S.lightUntil = 0;
    if (S.sub==='rx') endRx(false, true, 'A tone started, so reception stopped.');
    emit('beep', kind);
    return true;
  }
  function stopBeep(){ S.beep = null; emit('beep','stop'); }
  function light(){
    if (!powered()){ log('Light is off at this charge level.'); return false; }
    if (beeping() || S.sub==='rx') return false;
    S.lightUntil = now() + S.lightDur*1000;
    return true;
  }
  function toggleAutoLight(){
    S.autoLight = !S.autoLight;
    log(S.autoLight ? 'Auto light on. LT is shown.' : 'Auto light off.');
  }
  function autoLightChecks(){
    return [
      {ok:S.autoLight, t:'Auto light is switched on (LT shown)'},
      {ok:S.dark, t:'Surroundings are dark'},
      {ok:S.tilt>=40, t:'Watch is tilted 40° or more toward you'},
      {ok:powered(), t:'Charge level is H or M'},
      {ok:!beeping() && S.sub!=='rx', t:'No tone sounding and no reception running'}
    ];
  }
  function autoLightTry(){
    var c = autoLightChecks(), i;
    for (i=0;i<c.length;i++) if (!c[i].ok) return false;
    if (S.sleep){ S.sleep = 0; log('Tilt woke the watch.'); }
    S.lightUntil = now() + S.lightDur*1000;
    log('Auto light fired.');
    return true;
  }

  /* ---------- modes ---------- */
  function wtBanner(){
    var name = C[S.wt[S.wtSel].c][0], w = cols(name);
    S.banner = {t0:now(), a:'-'+(S.wtSel+1)+'-', aMs:800, b:name, bMs: w<=25 ? 1400 : 600+45*(w+2)};
  }
  function setMode(m){ S.mode = m; S.sub = null; S.banner = null; if (m==='WT') wtBanner(); }
  function wake(){ S.sleep = 0; log('Awake.'); }

  /* ---------- settings ---------- */
  function enterSetTK(){ S.sub='set'; S.setIdx=0; S.setT0=now(); log('Settings open. C moves through 15 items. A saves and exits.'); }
  function nextSet(){ S.setIdx=(S.setIdx+1)%15; S.setT0=now(); }
  function exitSet(){ S.sub=null; S.banner=null; log('Saved.'); }
  function adjTK(dir){
    var i = S.setIdx, h = homeNow(), o, dim;
    switch(i){
      case 0:
        S.home = (S.home + dir + C.length) % C.length; S.setT0 = now();
        if (!C[S.home][2] && S.homeDst==='auto') S.homeDst = 'off';
        S.rcvd = false; break;
      case 1:
        o = C[S.home][2] ? ['auto','off','on'] : ['off','on'];
        S.homeDst = o[(o.indexOf(S.homeDst)+1) % o.length]; break;
      case 2: setHome({mi: h.mi + (h.s>=30 ? 1 : 0)}, true); break;
      case 3: setHome({h:(h.h+dir+24)%24}); break;
      case 4: setHome({mi:(h.mi+dir+60)%60}); break;
      case 5: setHome({y:2000+((h.y-2000+dir+100)%100)}); break;
      case 6: setHome({mo:((h.mo-1+dir+12)%12)+1}); break;
      case 7: dim = new Date(Date.UTC(h.y, h.mo, 0)).getUTCDate(); setHome({d:((h.d-1+dir+dim)%dim)+1}); break;
      case 8: S.h24 = !S.h24; break;
      case 9: S.dateFmt = S.dateFmt==='MD' ? 'DM' : 'MD'; break;
      case 10: S.lang = (S.lang+1)%6; break;
      case 11: S.tone = !S.tone; break;
      case 12: S.lightDur = S.lightDur===1.5 ? 3 : 1.5; break;
      case 13: if (C[S.home][2]) S.autoRx = !S.autoRx; else log('Auto receive cannot be changed: '+C[S.home][0]+' has no time signal.'); break;
      case 14: S.ps = !S.ps; break;
    }
  }
  function adjWT(dir){
    var w = S.wt[S.wtSel];
    if (S.wtStage==='city'){ w.c = (w.c + dir + C.length) % C.length; S.setT0 = now(); if (C[w.c][0]==='UTC') w.dst = false; }
    else w.dst = !w.dst;
  }
  function adjAL(dir){ var a = S.al[S.alSel]; if (S.alStage==='h') a.h = (a.h+dir+24)%24; else a.m = (a.m+dir+60)%60; }
  function adjTR(dir){
    var st = S.tm.start, h = Math.floor(st/3600), m = Math.floor(st%3600/60), s = st%60;
    if (S.tmStage==='h') h = (h+dir+24)%24; else if (S.tmStage==='m') m = (m+dir+60)%60; else s = (s+dir+60)%60;
    S.tm.start = h*3600+m*60+s; S.tm.left = tmFull();
  }
  function adjust(dir){
    if (S.mode==='TK') adjTK(dir); else if (S.mode==='WT') adjWT(dir); else if (S.mode==='AL') adjAL(dir); else if (S.mode==='TR') adjTR(dir);
  }

  /* ---------- world time ---------- */
  function nextSlot(){ S.wtSel = (S.wtSel+1)%5; wtBanner(); }
  function comboAvail(){ return S.mode==='WT' && !S.sub && !S.sleep && S.power!=='DEAD' && S.power!=='CHG' && !beeping(); }
  function swap(){
    var w = S.wt[S.wtSel], t = utc(), oldHome = S.home, oldDst = homeDstOn(t);
    S.home = w.c; S.homeDst = C[w.c][2] ? 'auto' : (w.dst ? 'on' : 'off');
    w.c = oldHome; w.dst = C[oldHome][0]==='UTC' ? false : oldDst;
    S.rcvd = false; S.banner = null;
    log('Swapped. Home City is now '+C[S.home][0]+'.');
  }

  /* ---------- alarm ---------- */
  function alName(i){ return i<4 ? 'alarm '+(i+1) : (i===4 ? 'snooze alarm' : 'hourly signal'); }
  function alOn(i){ return i<5 ? S.al[i].on : S.sig; }
  function toggleAl(){
    var i = S.alSel;
    if (i<5){ S.al[i].on = !S.al[i].on; if (i===4 && !S.al[4].on) S.snz = null; } else S.sig = !S.sig;
    log(alName(i).charAt(0).toUpperCase()+alName(i).slice(1)+(alOn(i) ? ' on.' : ' off.'));
  }

  /* ---------- stopwatch ---------- */
  function swTime(){ var w = S.sw; return (w.acc + (w.run ? now()-w.t0 : 0)) % 86400e3; }
  function swStartStop(){ var w = S.sw; if (w.run){ w.acc += now()-w.t0; w.run = false; } else { w.t0 = now(); w.run = true; } }
  function swA(){
    var w = S.sw;
    if (w.split!==null){ w.split = null; return; }
    if (w.run){ w.split = swTime(); return; }
    w.acc = 0;
  }
  function swALabel(){ var w = S.sw; return w.split!==null ? (w.run ? 'Release split' : 'Show final time') : (w.run ? 'Split' : 'Reset to zero'); }

  /* ---------- timer ---------- */
  function tmFull(){ return (S.tm.start || 86400)*1000; }
  function tmLeft(){ return S.tm.run ? Math.max(0, S.tm.end-now()) : S.tm.left; }
  function tmStartStop(){
    var t = S.tm;
    if (t.run){ t.left = Math.max(0, t.end-now()); t.run = false; log('Countdown paused.'); }
    else { t.end = now()+t.left; t.run = true; log('Countdown running.'); }
  }

  /* ---------- radio reception ---------- */
  function rxBlock(manual){
    var c = C[S.home];
    if (!c[2]) return 'Reception is not possible: Home City '+c[0]+' has no time signal.';
    if (!powered()) return 'Reception is not possible: the charge is too low.';
    if (S.mode!=='TK' && S.mode!=='WT') return 'Reception only runs in Timekeeping or World Time mode.';
    if (S.sleep===2) return 'Reception is off in power saving level 2.';
    if (S.tm.run) return 'Reception is blocked while a countdown is running.';
    if (!manual && !S.autoRx) return 'Auto receive is switched off in settings.';
    return null;
  }
  function rxChecks(){
    var c = C[S.home], okMode = S.mode==='TK' || S.mode==='WT';
    return [
      {ok:!!c[2], t: c[2] ? 'Home City '+c[0]+' listens for '+TX[c[2]] : 'Home City '+c[0]+' has no time signal'},
      {ok:S.autoRx && !!c[2], t: (S.autoRx && c[2]) ? 'Auto receive is on' : 'Auto receive is off'},
      {ok:okMode, t: okMode ? 'Mode is Timekeeping or World Time' : 'Mode is '+NAME[S.mode]+': no reception from here'},
      {ok:powered(), t: powered() ? 'Charge level is H or M' : 'Charge is too low'},
      {ok:S.sleep!==2, t: S.sleep===2 ? 'Power saving level 2: reception is off' : (S.sleep===1 ? 'Asleep at level 1: reception still runs' : 'Not in power saving level 2')},
      {ok:!S.tm.run, t: S.tm.run ? 'A countdown is running: reception is blocked' : 'No countdown running'}
    ];
  }
  function startRx(){
    S.sub = 'rx'; S.rx = {t0:now(), dur:9000}; S.lightUntil = 0;
    log('Receiving. Shown here in 9 s. The real watch takes 3 to 8 minutes.');
  }
  function rxLevel(){
    if (!S.rx) return 0;
    var e = now()-S.rx.t0;
    if (S.signal==='none') return 0;
    if (S.signal==='poor') return e<2500 ? 0 : (Math.floor(e/1300)%3===0 ? 0 : 1);
    return e<1500 ? 0 : (e<3500 ? 1 : (e<6000 ? 2 : 3));
  }
  function endRx(ok, cancelled, msg){
    S.rx = null;
    if (cancelled){ S.sub = null; S.rcvd = false; log(msg || 'Reception cancelled.'); return; }
    if (ok){
      S.adj = 0; S.rcvd = true; S.lastRx = now(); S.rcvdKey = dayKey(homeNow());
      log('Signal received. Time and date corrected. RCVD is shown.');
    } else { S.rcvd = false; log('No usable signal. The time was left as it was.'); }
    S.sub = 'rxres'; S.rxRes = {ok:ok, t0:now()}; S.subT0 = now();
  }
  function nightSync(){
    var c = C[S.home], blk = rxBlock(false), res = {blocked:blk, attempts:[], ok:false, hours: c[2]==='CN' ? [1,2,3,4,5] : [0,1,2,3,4,5]};
    if (blk){ log('Overnight sync skipped. '+blk); return res; }
    var win = S.signal==='good' ? 0 : (S.signal==='poor' ? 2 : -1), i, f, off, t;
    for (i=0;i<res.hours.length;i++){ res.attempts.push({h:res.hours[i], ok:i===win}); if (i===win) break; }
    if (win>=0){
      S.adj = 0; t = utc(); off = homeOff(t); f = fields(t+off);
      S.lastRx = Date.UTC(f.y, f.mo-1, f.d, res.hours[win], 4, 0) - off;
      S.rcvd = true; S.rcvdKey = dayKey(f); res.ok = true; res.at = res.hours[win];
      log('Overnight sync succeeded at about '+res.hours[win]+':04. Later attempts were cancelled.');
    } else { S.rcvd = false; log('Overnight sync failed on every attempt. The watch keeps running on its quartz.'); }
    return res;
  }

  /* ---------- environment (controls outside the watch) ---------- */
  function setPower(p){
    var prev = S.power, sig = S.signal, dark = S.dark;
    if (p===prev) return;
    if (prev==='DEAD'){
      S = defaults(true); S.signal = sig; S.dark = dark;
      S.adj = (Date.UTC(2021,0,1,0,0,0) - 9*HOUR) - now();
      log('Power is back. Settings and time were lost. Set the Home City, then sync.');
    }
    S.power = p;
    if (p!=='H' && p!=='M'){
      S.lightUntil = 0;
      if (S.beep){ S.beep = null; emit('beep','stop'); }
      S.rx = null; if (S.sub==='rx' || S.sub==='rxres') S.sub = null;
      if (S.mode!=='TK' || p!=='L'){ S.mode = 'TK'; S.sub = null; }
    }
    if (p==='DEAD'){ S.sw.run = false; S.tm.run = false; S.sleep = 0; held = {}; log('Battery flat. The display is blank.'); }
    else if (p==='CHG') log('CHG flashes. Every function is off until the watch charges.');
    else if (p==='L') log('Charge low. Light, sounds, reception and the other modes are off.');
  }
  function setSleep(n){
    if (n===0){ if (S.sleep) wake(); return true; }
    if (S.power==='DEAD' || S.power==='CHG') return false;
    if (!S.ps){ log('Power saving is switched off in settings, so the watch stays awake.'); return false; }
    if (S.mode==='ST' || S.mode==='TR'){ log('The watch does not enter power saving in '+NAME[S.mode]+' mode.'); return false; }
    S.sleep = n; S.sub = null; S.dark = true; S.lightUntil = 0; S.rx = null;
    log(n===1 ? 'Power saving level 1. Display off. Clock, alarms and overnight sync still run.' : 'Power saving level 2. Everything is off except the clock.');
    return true;
  }
  function setDark(d){ S.dark = !!d; if (!d && S.sleep){ S.sleep = 0; log('Bright light woke the watch.'); } }
  function setTilt(deg){ var was = S.tilt; S.tilt = deg; if (was<40 && deg>=40) return autoLightTry(); return false; }
  function fireAlarm(){
    if (!powered()){ log('Alarm muted: the charge is too low.'); return false; }
    if (S.sleep===2){ log('Alarm muted in power saving level 2.'); return false; }
    log('Alarm tone for 10 s. Any button stops it.');
    return beep('alarm');
  }
  function normalize(){
    held = {}; S.sub = null; S.rx = null; S.banner = null; S.sleep = 0;
    if (S.beep){ S.beep = null; emit('beep','stop'); }
    if (!powered()){ setPower('H'); log('Charge set to H so the watch can respond.'); }
    S.mode = 'TK'; S.lastOp = now();
  }
  function jump(m){ normalize(); if (m!=='TK') setMode(m); }
  function gotoSlot(i){ normalize(); S.wtSel = i; setMode('WT'); }
  function setSlotCity(i, c){ S.wt[i].c = c; S.wt[i].dst = ruleDst(C[c][3], C[c][1], utc()); }
  function setHomeCity(c){ S.home = c; S.homeDst = C[c][2] ? 'auto' : 'off'; S.rcvd = false; }
  function reset(){ held = {}; S = defaults(false); seedLastRx(); emit('beep','stop'); }

  /* ---------- buttons ---------- */
  function act(l, f, down, ms){ return {l:l, f:f, down:!!down, ms:ms||0, dis:null, quiet:false}; }
  function run(a){ if (a.dis){ log(a.dis); return; } if (a.f) a.f(); key(); }
  function resolve(b){
    var r = {p:null, h:null, rep:false}, m = S.mode, set = S.sub==='set', low = S.power==='L', x, i, t, blk;
    if (S.power==='DEAD' || S.power==='CHG') return r;
    if (S.sleep){ r.p = act('Wake the display', wake, true); return r; }
    if (beeping() && S.beep.kind!=='sig'){ r.p = act('Stop the tone', stopBeep, true); return r; }
    if (S.sub==='rx'){ r.p = act('Cancel reception', function(){ endRx(false, true); }, true); return r; }
    if (S.sub==='rxres'){ r.p = act('Back to the time', function(){ S.sub = null; }, true); return r; }

    if (b==='C'){
      if (set){
        if (m==='TK') r.p = act('Next item: '+SET[(S.setIdx+1)%15].n, nextSet, true);
        else if (m==='WT'){
          if (S.wtStage==='dst' || C[S.wt[S.wtSel].c][0]!=='UTC')
            r.p = act(S.wtStage==='city' ? 'Go to summer time' : 'Back to city', function(){ S.wtStage = S.wtStage==='city' ? 'dst' : 'city'; S.setT0 = now(); }, true);
        }
        else if (m==='AL') r.p = act(S.alStage==='h' ? 'Go to minutes' : 'Back to hours', function(){ S.alStage = S.alStage==='h' ? 'm' : 'h'; }, true);
        else if (m==='TR') r.p = act(S.tmStage==='h' ? 'Go to minutes' : (S.tmStage==='m' ? 'Go to seconds' : 'Back to hours'), function(){ S.tmStage = S.tmStage==='h' ? 'm' : (S.tmStage==='m' ? 's' : 'h'); }, true);
        return r;
      }
      if (low){ r.p = act('Change mode', null, true); r.p.dis = 'The other modes are off while the charge is low.'; return r; }
      x = ORDER[(ORDER.indexOf(m)+1)%5];
      r.p = act('Go to '+NAME[x], (function(n){ return function(){ setMode(n); }; })(x), true);
      r.h = act('Return to Timekeeping', function(){ setMode('TK'); }, false, 1000);
      r.h.quiet = (m==='TK' || x==='TK');
      return r;
    }

    if (b==='B'){
      if (set){
        if (m==='TK'){ if (SET[S.setIdx].b){ r.p = act(SET[S.setIdx].b, function(){ adjust(-1); }, true); r.rep = true; } }
        else if (m==='WT'){ if (S.wtStage==='city'){ r.p = act('Previous city', function(){ adjust(-1); }, true); r.rep = true; } }
        else if (m==='AL'){ r.p = act(S.alStage==='h' ? 'Hour down' : 'Minute down', function(){ adjust(-1); }, true); r.rep = true; }
        else if (m==='TR'){ r.p = act(S.tmStage==='h' ? 'Hour down' : (S.tmStage==='m' ? 'Minute down' : 'Second down'), function(){ adjust(-1); }, true); r.rep = true; }
        return r;
      }
      r.p = act('Light for '+S.lightDur+' s', light, true);
      if (low) r.p.dis = 'Light is off while the charge is low.';
      if (m==='TK' && !S.sub && !low) r.h = act(S.autoLight ? 'Switch auto light off' : 'Switch auto light on', toggleAutoLight, false, 3000);
      return r;
    }

    if (b==='D'){
      if (set){
        if (m==='TK'){ r.p = act(SET[S.setIdx].d, function(){ adjust(1); }, true); r.rep = !!SET[S.setIdx].rep; }
        else if (m==='WT'){ r.p = act(S.wtStage==='city' ? 'Next city' : 'Switch summer time OFF / ON', function(){ adjust(1); }, true); r.rep = S.wtStage==='city'; }
        else if (m==='AL'){ r.p = act(S.alStage==='h' ? 'Hour up' : 'Minute up', function(){ adjust(1); }, true); r.rep = true; }
        else if (m==='TR'){ r.p = act(S.tmStage==='h' ? 'Hour up' : (S.tmStage==='m' ? 'Minute up' : 'Second up'), function(){ adjust(1); }, true); r.rep = true; }
        return r;
      }
      if (m==='TK'){
        if (S.sub==='lastrx'){ r.p = act('Back to the time', function(){ S.sub = null; }, true); return r; }
        r.p = act('Show the last sync result', function(){ S.sub = 'lastrx'; S.subT0 = now(); }, false);
        r.h = act('Receive the time signal now', startRx, false, 2000);
        blk = rxBlock(true); if (blk) r.h.dis = blk;
        return r;
      }
      if (m==='WT'){ r.p = act('Next world time slot', nextSlot, true); return r; }
      if (m==='AL'){ r.p = act('Next alarm item', function(){ S.alSel = (S.alSel+1)%6; }, true); return r; }
      if (m==='ST'){ r.p = act(S.sw.run ? 'Stop' : (S.sw.acc ? 'Resume' : 'Start'), swStartStop, true); return r; }
      if (m==='TR'){ r.p = act(S.tm.run ? 'Pause' : (S.tm.left<tmFull() ? 'Resume' : 'Start'), tmStartStop, true); return r; }
    }

    if (b==='A'){
      if (set){ r.p = act('Save and exit', exitSet, true); return r; }
      if (m==='TK'){
        if (S.sub==='lastrx'){ r.p = act('Back to the time', function(){ S.sub = null; }, true); return r; }
        r.h = act('Open settings', enterSetTK, false, 2000); return r;
      }
      if (m==='WT'){ r.h = act('Change the city in this slot', function(){ S.sub = 'set'; S.wtStage = 'city'; S.setT0 = now(); S.banner = null; }, false, 2000); return r; }
      if (m==='AL'){
        i = S.alSel;
        r.p = act('Switch '+alName(i)+(alOn(i) ? ' off' : ' on'), toggleAl, i===5);
        if (i<5) r.h = act('Set the time of '+alName(i), function(){ S.sub = 'set'; S.alStage = 'h'; S.al[S.alSel].on = true; }, false, 2000);
        return r;
      }
      if (m==='ST'){ r.p = act(swALabel(), swA, true); return r; }
      if (m==='TR'){
        t = S.tm;
        if (t.run) return r;
        if (t.left<tmFull()) r.p = act('Reset to the start time', function(){ S.tm.left = tmFull(); }, true);
        else r.h = act('Set the countdown time', function(){ S.sub = 'set'; S.tmStage = 'h'; }, false, 2000);
        return r;
      }
    }
    return r;
  }
  function down(b){
    if (held[b]) return;
    var a = resolve(b), h = held[b] = {t:now(), a:a, fired:false, rep:0};
    var other = b==='A' ? 'B' : (b==='B' ? 'A' : null);
    S.lastOp = now();
    if (other && held[other] && comboAvail()){ held[other].fired = true; h.fired = true; h.a = {p:null, h:null, rep:false}; swap(); key(); return; }
    if (a.p && a.p.down) run(a.p);
  }
  function up(b){
    var h = held[b]; if (!h) return;
    delete held[b];
    if (!h.fired && h.a.p && !h.a.p.down) run(h.a.p);
  }
  function holdInfo(b){
    var h = held[b];
    if (!h || !h.a.h) return {p:0, fired:false};
    return {p: h.fired ? 1 : Math.min(1, (now()-h.t)/h.a.h.ms), fired:h.fired};
  }
  function doPress(b){ var a = resolve(b); S.lastOp = now(); if (a.p) run(a.p); return !!a.p; }
  function doHold(b){
    var a = resolve(b); S.lastOp = now();
    if (a.p && a.p.down && !a.rep && !a.p.dis) run(a.p);
    if (a.h) run(a.h);
    return !!a.h;
  }
  function combo(){ if (!comboAvail()) return false; S.lastOp = now(); swap(); key(); return true; }

  function tick(){
    var t = now(), k, h, H, mk, i, hit;
    for (k in held){
      h = held[k];
      if (h.a.h && !h.fired && t-h.t >= h.a.h.ms){ h.fired = true; run(h.a.h); }
      if (h.a.rep && h.a.p && !h.a.p.dis && t-h.t >= 450 && t-h.rep >= 110){ h.rep = t; h.a.p.f(); S.lastOp = t; }
    }
    if (S.power==='DEAD') return;
    if (S.sub==='rx' && S.rx && t-S.rx.t0 >= S.rx.dur) endRx(S.signal==='good', false);
    if (S.sub==='rxres' && t-S.rxRes.t0 >= 4500) S.sub = null;
    if (S.tm.run && t >= S.tm.end){ S.tm.run = false; S.tm.left = tmFull(); log('Countdown finished. Tone for 10 s.'); beep('timer'); }
    H = homeNow(); mk = dayKey(H)*1440 + H.h*60 + H.mi;
    if (S.lastMin===null) S.lastMin = mk;
    else if (mk!==S.lastMin){
      S.lastMin = mk;
      if (!(S.mode==='TK' && S.sub==='set')){
        hit = false;
        for (i=0;i<4;i++) if (S.al[i].on && S.al[i].h===H.h && S.al[i].m===H.mi) hit = true;
        if (S.al[4].on && S.al[4].h===H.h && S.al[4].m===H.mi){ hit = true; S.snz = {left:6, next:t+5*60e3}; }
        if (hit){ log('Alarm time reached.'); beep('alarm'); }
        else if (S.sig && H.mi===0) beep('sig');
      }
    }
    if (S.snz && t >= S.snz.next){
      if (S.al[4].on){ beep('alarm'); S.snz.left--; S.snz.next = t+5*60e3; if (S.snz.left<=0) S.snz = null; }
      else S.snz = null;
    }
    if (S.beep && t >= S.beep.until) S.beep = null;
    if (t-S.lastOp > 150e3){
      if (S.sub==='set' || S.sub==='lastrx'){ S.sub = null; log('No press for over two minutes. The screen closed by itself.'); }
      else if (S.mode==='AL'){ S.mode = 'TK'; log('Alarm mode returned to Timekeeping by itself.'); }
      S.lastOp = t;
    }
  }

  /* ---------- what the LCD shows ---------- */
  function hm(f){
    var h = f.h, pm = false;
    if (!S.h24){ pm = h>=12; h = h%12; if (h===0) h = 12; }
    return {big:s2(h)+p2(f.mi), P:pm, win:f2(h)+':'+p2(f.mi)};
  }
  function dateStr(f){ return S.dateFmt==='MD' ? f2(f.mo)+'.'+f2(f.d) : f2(f.d)+'.'+f2(f.mo); }
  function view(){
    var t = now(), I = {}, v = {off:false, lit:false, tl:'', tlF:false, win:{text:''}, big:'    ', bigF:[false,false],
        colon:false, prime:false, dprime:false, small:'  ', smallF:false, ind:I};
    var H, x, i, w, F, a, e, cs, s, hA, R, alt, dst;
    if (S.power==='DEAD' || S.sleep){ v.off = true; return v; }
    if (S.power==='CHG'){ v.win = {text:'CHG', flash:true}; return v; }
    v.lit = t < S.lightUntil;
    H = homeNow(); x = hm(H); dst = homeDstOn(utc());
    I[S.power] = S.power==='L' ? 2 : 1;
    I.PS = S.ps ? 1 : 0; I.MUTE = S.tone ? 0 : 1; I.LT = S.autoLight ? 1 : 0;
    I.RCVD = (S.rcvd && S.rcvdKey===dayKey(H)) ? 1 : 0;
    I.ALM = (S.al[0].on || S.al[1].on || S.al[2].on || S.al[3].on) ? 1 : 0;
    I.SNZ = S.al[4].on ? (S.snz ? 2 : 1) : 0;
    I.SIG = S.sig ? 1 : 0;

    hA = held.A;
    if (hA && !hA.fired && hA.a.h && S.mode==='TK' && !S.sub && t-hA.t > 220){
      v.win = {text:'SET'}; v.big = 'Hold'; v.bigF = [true,true]; return v;
    }

    if (S.mode==='TK'){
      v.tl = DOW[S.lang][H.dow]; v.win = {text:dateStr(H)}; v.big = x.big; v.colon = true; v.small = p2(H.s);
      I.P = x.P ? 1 : 0; I.DST = dst ? 1 : 0;
      if (S.sub==='rx'){ v.tl = 'RC'; v.win = {text:''}; I.RCVD = 2; i = rxLevel(); v.small = i ? 'L'+i : '  '; return v; }
      if (S.sub==='rxres' && !S.rxRes.ok){ v.win = {text:'ERR'}; return v; }
      if (S.sub==='lastrx' || S.sub==='rxres'){
        v.tl = ''; v.small = '  '; alt = Math.floor((t-S.subT0)/1100)%2===0;
        if (S.lastRx===null){ v.win = {text:'GET'}; v.big = ' ---'; I.P = 0; }
        else { R = fields(S.lastRx + homeOff(S.lastRx)); a = hm(R); v.win = {text: alt ? 'GET' : dateStr(R)}; v.big = a.big; I.P = a.P ? 1 : 0; }
        return v;
      }
      if (S.sub==='set'){
        i = S.setIdx;
        if (i===0){ v.tl = 'HT'; v.tlF = true; v.win = {text:C[S.home][0], scroll:true, loop:true, t0:S.setT0}; }
        else if (i===1){ v.tl = ''; v.win = {text: S.homeDst==='auto' ? 'AUTO' : (S.homeDst==='on' ? 'ON' : 'OFF'), flash:true}; }
        else if (i===2) v.smallF = true;
        else if (i===3) v.bigF = [true,false];
        else if (i===4) v.bigF = [false,true];
        else if (i===5){ v.big = String(H.y); v.colon = false; v.bigF = [true,true]; v.small = '  '; I.P = 0; }
        else if (i===6 || i===7) v.win = {text:dateStr(H), flash: ((S.dateFmt==='MD') === (i===6)) ? [0,2] : [3,5]};
        else if (i===8){ v.tl = ''; v.win = {text: S.h24 ? '24H' : '12H', flash:true}; }
        else {
          v.tl = ''; v.big = '    '; v.colon = false; v.small = '  '; I.P = 0;
          if (i===9) v.win = {text: S.dateFmt==='MD' ? 'M.DD' : 'DD.M', flash:true};
          else if (i===10) v.win = {text:LANG[S.lang], flash:true};
          else if (i===11) v.win = {text: S.tone ? 'KEY♪' : 'MUTE', flash:true};
          else if (i===12){ v.win = {text:'LIGHT', scroll:true, loop:true, t0:S.setT0}; v.big = '  '+(S.lightDur===3 ? '3' : '1')+' '; v.bigF = [false,true]; }
          else if (i===13){ v.win = {text:'RECEIVING', scroll:true, loop:true, t0:S.setT0}; v.big = (S.autoRx && C[S.home][2]) ? ' On ' : ' OFF'; v.bigF = [true,true]; }
          else { v.win = {text:'POWER SAVING', scroll:true, loop:true, t0:S.setT0}; v.big = S.ps ? ' On ' : ' OFF'; v.bigF = [true,true]; }
        }
        return v;
      }
      if (S.power==='L' && Math.floor(t/1200)%2===0) v.win = {text:'LOW'};
      return v;
    }

    if (S.mode==='WT'){
      w = S.wt[S.wtSel]; F = slotNow(S.wtSel); a = hm(F);
      v.tl = 'WT'; v.big = a.big; v.colon = true; v.small = p2(F.s); I.P = a.P ? 1 : 0; I.DST = w.dst ? 1 : 0;
      if (S.sub==='set'){
        if (S.wtStage==='city'){ v.tlF = true; v.win = {text:C[w.c][0], scroll:true, loop:true, t0:S.setT0}; }
        else v.win = {text: w.dst ? 'ON' : 'OFF', flash:true};
      }
      else if (S.banner && t < S.banner.t0+S.banner.aMs) v.win = {text:S.banner.a};
      else if (S.banner && t < S.banner.t0+S.banner.aMs+S.banner.bMs) v.win = {text:S.banner.b, scroll:true, loop:false, t0:S.banner.t0+S.banner.aMs};
      else v.win = {text:x.win};
      return v;
    }

    if (S.mode==='AL'){
      i = S.alSel; v.tl = 'AL'; v.colon = true;
      v.win = {text: i<4 ? '-'+(i+1)+'-' : (i===4 ? 'SNZ' : 'SIG')};
      if (i<5){
        a = hm({h:S.al[i].h, mi:S.al[i].m}); v.big = a.big; I.P = a.P ? 1 : 0; v.small = S.al[i].on ? 'on' : '--';
        if (S.sub==='set') v.bigF = S.alStage==='h' ? [true,false] : [false,true];
      } else { v.big = '  00'; v.small = S.sig ? 'on' : '--'; }
      return v;
    }

    if (S.mode==='ST'){
      e = S.sw.split!==null ? S.sw.split : swTime();
      v.tl = 'ST'; v.win = {text: S.sw.split!==null ? 'SPL' : x.win};
      if (e < HOUR){ cs = Math.floor(e/10); v.big = p2(Math.floor(cs/6000))+p2(Math.floor(cs/100)%60); v.prime = true; v.dprime = true; v.small = p2(cs%100); }
      else { s = Math.floor(e/1000); v.big = s2(Math.floor(s/3600))+p2(Math.floor(s/60)%60); v.colon = true; v.small = p2(s%60); }
      return v;
    }

    /* Timer */
    s = S.sub==='set' ? S.tm.start : Math.ceil(tmLeft()/1000) % 86400;
    v.tl = 'TR'; v.win = {text:x.win}; v.colon = true;
    v.big = s2(Math.floor(s/3600))+p2(Math.floor(s/60)%60); v.small = p2(s%60);
    if (S.sub==='set'){ if (S.tmStage==='h') v.bigF = [true,false]; else if (S.tmStage==='m') v.bigF = [false,true]; else v.smallF = true; }
    return v;
  }

  /* ---------- descriptions for the panel under the watch ---------- */
  function actions(){
    var o = {}, bs = ['A','B','C','D'], i, a;
    for (i=0;i<4;i++){
      a = resolve(bs[i]);
      o[bs[i]] = {
        press: a.p ? {label:a.p.l, dis:a.p.dis, rep:a.rep} : null,
        hold: (a.h && !a.h.quiet) ? {label:a.h.l, ms:a.h.ms, dis:a.h.dis} : null
      };
    }
    o.combo = comboAvail() ? {label:'Swap Home City with this slot', dis:null} : null;
    return o;
  }
  function setValue(i){
    var H = homeNow();
    switch(i){
      case 0: return C[S.home][0];
      case 1: return S.homeDst.toUpperCase();
      case 2: return p2(H.s);
      case 3: return String(H.h);
      case 4: return p2(H.mi);
      case 5: return String(H.y);
      case 6: return String(H.mo);
      case 7: return String(H.d);
      case 8: return S.h24 ? '24H' : '12H';
      case 9: return S.dateFmt==='MD' ? 'M.DD' : 'DD.M';
      case 10: return LANG[S.lang];
      case 11: return S.tone ? 'KEY♪' : 'MUTE';
      case 12: return S.lightDur+' s';
      case 13: return (S.autoRx && C[S.home][2]) ? 'On' : 'OFF';
      default: return S.ps ? 'On' : 'OFF';
    }
  }
  function status(){
    var m = S.mode, home = C[S.home][0], w, cn, i, t;
    if (S.power==='DEAD') return ['No power', 'Battery flat. The display is blank and the settings are lost.'];
    if (S.power==='CHG') return ['Charge critical', 'CHG flashes. Every function is off until the watch charges.'];
    if (S.sleep===1) return ['Power saving · level 1', 'Display off. Clock, alarms and overnight sync still run. Any button wakes it.'];
    if (S.sleep===2) return ['Power saving · level 2', 'Everything is off except the clock. Any button or bright light wakes it.'];
    if (beeping() && S.beep.kind!=='sig') return [S.beep.kind==='timer' ? 'Timer tone' : 'Alarm tone', 'Sounds for 10 seconds. Any button stops it.'];
    if (S.sub==='rx'){ i = rxLevel(); return ['Receiving time signal', (i ? 'Signal level L'+i+' of L3.' : 'Signal unstable.')+' Keep the watch still.']; }
    if (S.sub==='rxres') return S.rxRes.ok ? ['Sync complete', 'GET alternates with the date. The digits show the time of the sync.'] : ['Sync failed', 'No usable signal. The time was left as it was.'];
    if (m==='TK'){
      if (S.sub==='set') return ['Settings · item '+(S.setIdx+1)+' of 15', SET[S.setIdx].n+': '+setValue(S.setIdx)];
      if (S.sub==='lastrx') return ['Last sync result', S.lastRx===null ? 'No successful sync is stored.' : 'GET alternates with the date. The digits show the time of the last successful sync.'];
      return ['Timekeeping', 'Home City '+home+(S.power==='L' ? '. Charge low: light, sounds, sync and other modes are off.' : '.')];
    }
    if (m==='WT'){
      w = S.wt[S.wtSel]; cn = C[w.c][0];
      if (S.sub==='set') return ['World Time · editing slot '+(S.wtSel+1), S.wtStage==='city' ? 'City: '+cn : 'Summer time: '+(w.dst ? 'ON' : 'OFF')];
      return ['World Time · slot '+(S.wtSel+1)+' of 5', cn+(w.dst ? ', summer time on' : '')+'. The window shows Home time.'];
    }
    if (m==='AL'){
      i = S.alSel;
      if (S.sub==='set') return ['Alarm · setting '+alName(i), S.alStage==='h' ? 'Hours flash.' : 'Minutes flash.'];
      return ['Alarm · '+alName(i), alOn(i) ? 'Switched on.' : 'Switched off.'];
    }
    if (m==='ST') return ['Stopwatch', S.sw.split!==null ? 'Split frozen on the display. Timing '+(S.sw.run ? 'continues.' : 'has stopped.') : (S.sw.run ? 'Running.' : (S.sw.acc ? 'Stopped.' : 'Ready.'))];
    t = S.tm;
    if (S.sub==='set') return ['Timer · setting start time', S.tmStage==='h' ? 'Hours flash.' : (S.tmStage==='m' ? 'Minutes flash.' : 'Seconds flash.')];
    return ['Timer', t.run ? 'Counting down.' : (t.left<tmFull() ? 'Paused.' : 'Ready.')];
  }

  S = defaults(false);
  seedLastRx();

  return {
    down:down, up:up, tick:tick, view:view, actions:actions, status:status, holdInfo:holdInfo,
    doPress:doPress, doHold:doHold, combo:combo,
    setPower:setPower, setSleep:setSleep, setDark:setDark, setTilt:setTilt, fireAlarm:fireAlarm,
    nightSync:nightSync, rxChecks:rxChecks, autoLightChecks:autoLightChecks,
    normalize:normalize, jump:jump, gotoSlot:gotoSlot, setSlotCity:setSlotCity, setHomeCity:setHomeCity, reset:reset,
    setValue:setValue, slotNow:slotNow, homeNow:homeNow, hm:hm, cols:cols,
    dstNow:function(i){ return ruleDst(C[i][3], C[i][1], utc()); }, ruleDst:ruleDst,
    cities:C, tx:TX, setMeta:SET, modeNames:NAME,
    get state(){ return S; }
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = createWatch;
