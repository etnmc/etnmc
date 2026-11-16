/* Interface for the simulator: draws the LCD, wires buttons, panels and demos. */
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var wideMQ = window.matchMedia ? window.matchMedia('(min-width: 1000px)') : null;
  var BTNS = ['A','B','C','D'];
  var logEl = $('log');
  var W = createWatch({emit:onEmit});

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function setText(el, s){ if (el._t!==s){ el._t = s; el.textContent = s; } }
  function setAttr(el, k, v){ var key = '_a_'+k; if (el[key]!==v){ el[key] = v; el.setAttribute(k, v); } }
  function setCls(el, c, on){ var key = '_c_'+c; on = !!on; if (el[key]!==on){ el[key] = on; el.classList.toggle(c, on); } }
  function mk(tag, at, parent){ var e = document.createElementNS(NS, tag), k; for (k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e; }
  function each(sel, fn){ Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  /* ---------- log and sound ---------- */
  function addLog(m){
    var li = document.createElement('li'); li.textContent = m;
    logEl.insertBefore(li, logEl.firstChild);
    while (logEl.children.length>4) logEl.removeChild(logEl.lastChild);
  }
  var AC = null, soundOn = false, nodes = [];
  function tone(t0, dur, vol){
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = 'square'; o.frequency.value = 4096; g.gain.value = vol;
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0+dur);
    nodes.push(o); o.onended = function(){ var i = nodes.indexOf(o); if (i>=0) nodes.splice(i,1); };
  }
  function sound(kind){
    var t, i, j;
    if (kind==='stop'){ nodes.slice().forEach(function(o){ try{ o.stop(); }catch(e){} }); nodes = []; return; }
    if (!soundOn || !AC) return;
    t = AC.currentTime+0.02;
    if (kind==='key') tone(t, 0.035, 0.03);
    else if (kind==='sig'){ tone(t, 0.06, 0.04); tone(t+0.16, 0.06, 0.04); }
    else for (i=0;i<10;i++) for (j=0;j<4;j++) tone(t+i+j*0.12, 0.06, 0.04);
  }
  function onEmit(type, d){ if (type==='log') addLog(d); else if (type==='beep') sound(d); }

  /* ---------- LCD construction ---------- */
  var lcd = $('lcd'), IND = {};
  mk('rect', {'class':'lcd-bg', width:216, height:138, rx:5}, lcd);
  mk('rect', {'class':'lcd-glow', width:216, height:138, rx:5, fill:'url(#litg)'}, lcd);
  mk('rect', {'class':'lcd-frame', x:108, y:5, width:100, height:31, rx:3}, lcd);
  mk('path', {'class':'lcd-rule', d:'M6 117.5H210M106 117.5V133'}, lcd);
  function ind(key, x, y, txt, size){ var e = mk('text', {'class':'ind', x:x, y:y, 'font-size':size||8.5}, lcd); e.textContent = txt; IND[key] = e; }
  ind('RCVD', 6, 15, 'RCVD'); ind('PS', 6, 26, 'PS'); ind('P', 9, 73, 'P', 11); ind('DST', 177, 50, 'DST'); ind('LT', 190, 62, 'LT');
  IND.MUTE = mk('g', {'class':'ind'}, lcd);
  mk('path', {d:'M167 42.5v9M167 42.5l4.6 2', fill:'none', stroke:'currentColor', 'stroke-width':1.3}, IND.MUTE);
  mk('ellipse', {cx:165.2, cy:52, rx:2.3, ry:1.8}, IND.MUTE);
  mk('path', {d:'M160.5 55.5L173 41', fill:'none', stroke:'currentColor', 'stroke-width':1.2}, IND.MUTE);
  function bar(key, x){ IND[key] = mk('rect', {'class':'ind', x:x, y:123, width:22, height:4.5, rx:0.6}, lcd); }
  bar('SNZ',14); bar('ALM',42); bar('SIG',70); bar('L',122); bar('M',150); bar('H',178);

  var mg = mk('g', {transform:'translate(0 33.2) skewX(-6) translate(0 -33.2)'}, lcd);
  function matrix(x, y, n){
    var m = {n:n, el:[], st:[]}, r, c;
    for (c=0;c<n;c++){ m.el[c] = []; m.st[c] = 0; for (r=0;r<7;r++) m.el[c][r] = mk('rect', {'class':'dot', x:(x+c*3.6).toFixed(1), y:(y+r*3.6).toFixed(1), width:3.7, height:3.3, rx:0.7}, mg); }
    return m;
  }
  function paint(m, out){
    var c, r, d, bits;
    for (c=0;c<m.n;c++){
      bits = out[c]|0; d = bits ^ m.st[c]; if (!d) continue;
      for (r=0;r<7;r++) if ((d>>r)&1) m.el[c][r].classList.toggle('on', !!((bits>>r)&1));
      m.st[c] = bits;
    }
  }
  var TL = matrix(46, 8, 11), WIN = matrix(113, 8, 25);

  function segPaths(w, h, t){
    var g = t*0.14, k = t/2, m = h/2;
    function hz(y){ var a = k+g, b = w-k-g; return 'M'+a+' '+y+'L'+(a+k)+' '+(y-k)+'L'+(b-k)+' '+(y-k)+'L'+b+' '+y+'L'+(b-k)+' '+(y+k)+'L'+(a+k)+' '+(y+k)+'Z'; }
    function vt(x, a, b){ return 'M'+x+' '+a+'L'+(x+k)+' '+(a+k)+'L'+(x+k)+' '+(b-k)+'L'+x+' '+b+'L'+(x-k)+' '+(b-k)+'L'+(x-k)+' '+(a+k)+'Z'; }
    return {a:hz(k), g:hz(m), d:hz(h-k), f:vt(k,k+g,m-g), b:vt(w-k,k+g,m-g), e:vt(k,m+g,h-k-g), c:vt(w-k,m+g,h-k-g)};
  }
  var dg = mk('g', {transform:'translate(0 112) skewX(-6) translate(0 -112)'}, lcd);
  function digit(x, y, w, h, t){
    var p = segPaths(w, h, t), g = mk('g', {transform:'translate('+x+' '+y+')'}, dg), o = {s:{}, cur:' '}, k;
    for (k in p) o.s[k] = mk('path', {'class':'seg7', d:p[k]}, g);
    return o;
  }
  var BIG = [digit(27,60,25,52,6.8), digit(57,60,25,52,6.8), digit(97,60,25,52,6.8), digit(127,60,25,52,6.8)];
  var SML = [digit(166,80,16,32,4.5), digit(187,80,16,32,4.5)];
  var COLON = mk('path', {'class':'seg7', d:'M87 75h5.6v5.6H87zM87 93h5.6v5.6H87z'}, dg);
  var PRIME = mk('path', {'class':'seg7', d:'M87 60h4.6l-1.3 10h-2.4z'}, dg);
  var DPRIME = mk('path', {'class':'seg7', d:'M155.6 80h2.1l-.6 7h-1.2zM159.1 80h2.1l-.6 7h-1.2z'}, dg);
  var SEG = {'0':'abcdef','O':'abcdef','1':'bc','l':'bc','2':'abdeg','3':'abcdg','4':'bcfg','5':'acdfg','6':'acdefg','7':'abc','8':'abcdefg','9':'abcdfg',
             'H':'bcefg','o':'cdeg','n':'ceg','d':'bcdeg','F':'aefg','L':'def','-':'g',' ':''};
  function setDigit(o, ch){ if (o.cur===ch) return; o.cur = ch; var on = SEG[ch]||'', k; for (k in o.s) o.s[k].classList.toggle('on', on.indexOf(k)>=0); }

  /* 5x7 characters for the two dot-matrix areas: seven rows per glyph, two hex digits per row */
  var GL = {A:'0E11111F111111',B:'1E11111E11111E',C:'0E11101010110E',D:'1E11111111111E',E:'1F10101E10101F',F:'1F10101E101010',
    G:'0E11101711110F',H:'1111111F111111',I:'0E04040404040E',J:'0702020202120C',K:'11121418141211',L:'1010101010101F',
    M:'111B1515111111',N:'11111915131111',O:'0E11111111110E',P:'1E11111E101010',Q:'0E11111115120D',R:'1E11111E141211',
    S:'0F10100E01011E',T:'1F040404040404',U:'1111111111110E',V:'11111111110A04',W:'1111111515150A',X:'11110A040A1111',
    Y:'1111110A040404',Z:'1F01020408101F','0':'0E11131519110E','1':'040C040404040E','2':'0E11010204081F','3':'1F02040201110E',
    '4':'02060A121F0202','5':'1F101E0101110E','6':'0608101E11110E','7':'1F010204080808','8':'0E11110E11110E','9':'0E11110F01020C',
    '-':'0000001F000000','y':'000011110F010E','♪':'060505040C1C08','П':'1F111111111111','Ч':'1111110F010101','Б':'1F10101E11111E'};
  var GC = {}, LC = {};
  function glyph(ch){
    if (GC[ch]) return GC[ch];
    var s = GL[ch], c, r, k, row;
    if (ch==='.') c = [64]; else if (ch===':') c = [20]; else if (ch==="'") c = [3]; else if (ch===' ') c = [0,0,0];
    else { c = [0,0,0,0,0]; if (s) for (r=0;r<7;r++){ row = parseInt(s.substr(r*2,2),16); for (k=0;k<5;k++) if ((row>>(4-k))&1) c[k] |= (1<<r); } }
    return (GC[ch] = c);
  }
  function lay(text){
    if (LC[text]) return LC[text];
    var out = [], starts = [], i, g, k;
    for (i=0;i<text.length;i++){ starts.push(out.length); g = glyph(text.charAt(i)); for (k=0;k<g.length;k++) out.push(g[k]); if (i<text.length-1) out.push(0); }
    starts.push(out.length);
    return (LC[text] = {c:out, s:starts});
  }
  var buf25 = [], buf11 = [];
  function drawWin(w, t, ph){
    var L = lay(w.text||''), n = L.c.length, i, off, sh, k, per, a, b;
    for (i=0;i<25;i++) buf25[i] = 0;
    if (n<=25 || !w.scroll || reduced){
      off = n<=25 ? Math.floor((25-n)/2) : 0;
      for (i=0;i<n && i+off<25;i++) buf25[i+off] = L.c[i];
      if (w.flash && !ph){
        if (w.flash===true) for (i=0;i<25;i++) buf25[i] = 0;
        else { a = L.s[w.flash[0]]+off; b = L.s[w.flash[1]]+off; for (i=a;i<b && i<25;i++) buf25[i] = 0; }
      }
    } else {
      sh = t-(w.t0||0); sh = sh<600 ? 0 : Math.floor((sh-600)/45); per = n+14;
      for (i=0;i<25;i++){ k = w.loop ? (i+sh)%per : i+sh; buf25[i] = k<n ? L.c[k] : 0; }
    }
    paint(WIN, buf25);
  }

  /* ---------- buttons on the watch ---------- */
  var BTN = {}, RC = 81.7, demo = null;
  each('#watch .btn', function(g){
    var b = g.getAttribute('data-b');
    BTN[b] = {g:g, ring:g.querySelector('.ring')};
    function dn(e){ if (e) e.preventDefault(); stopDemo(); W.down(b); g.classList.add('held'); }
    function up(){ W.up(b); g.classList.remove('held'); }
    g.addEventListener('pointerdown', function(e){ try{ g.setPointerCapture(e.pointerId); }catch(x){} dn(e); });
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up); g.addEventListener('lostpointercapture', up);
    g.addEventListener('keydown', function(e){ if ((e.key===' ' || e.key==='Enter') && !e.repeat) dn(e); else if (e.key===' ') e.preventDefault(); });
    g.addEventListener('keyup', function(e){ if (e.key===' ' || e.key==='Enter') up(); });
    g.addEventListener('blur', up);
  });
  $('watch').addEventListener('contextmenu', function(e){ e.preventDefault(); });
  function typing(e){ var t = e.target; return t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.tagName==='SELECT' || t.isContentEditable); }
  document.addEventListener('keydown', function(e){
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    var k = (e.key||'').toUpperCase();
    if (k.length===1 && 'ABCD'.indexOf(k)>=0){ stopDemo(); W.down(k); BTN[k].g.classList.add('held'); }
  });
  document.addEventListener('keyup', function(e){
    var k = (e.key||'').toUpperCase();
    if (k.length===1 && 'ABCD'.indexOf(k)>=0){ W.up(k); BTN[k].g.classList.remove('held'); }
  });
  function pulse(b, long){ var g = BTN[b].g; g.classList.add('demo'); setTimeout(function(){ g.classList.remove('demo'); }, long ? 700 : 230); }

  /* ---------- panel under the watch ---------- */
  var OP = {}, lastActs = '';
  BTNS.forEach(function(b){
    OP[b] = {p:$('op-'+b+'-p'), h:$('op-'+b+'-h')};
    OP[b].p.addEventListener('click', function(){ if (this.getAttribute('aria-disabled')) return; stopDemo(); pulse(b); W.doPress(b); });
    OP[b].h.addEventListener('click', function(){ stopDemo(); pulse(b, true); W.doHold(b); });
  });
  $('op-combo').addEventListener('click', function(){ stopDemo(); pulse('A'); pulse('B'); W.combo(); });
  function setOp(el, o, kind, keepWhenEmpty){
    if (!o){
      el.hidden = !keepWhenEmpty; el.className = 'op none'; el.setAttribute('aria-disabled','true');
      el.innerHTML = '<b>'+kind+'</b>No function here'; return;
    }
    el.hidden = false; el.className = 'op'+(o.dis ? ' blocked' : ''); el.removeAttribute('aria-disabled');
    el.innerHTML = '<b>'+kind+(o.rep ? ' · hold to scroll' : '')+'</b>'+esc(o.label)+(o.dis ? '<i>'+esc(o.dis)+'</i>' : '');
  }
  function syncActs(){
    var a = W.actions(), sig = JSON.stringify(a);
    if (sig===lastActs) return; lastActs = sig;
    BTNS.forEach(function(b){
      setOp(OP[b].p, a[b].press, 'Press', true);
      setOp(OP[b].h, a[b].hold, a[b].hold ? 'Hold '+(a[b].hold.ms/1000)+' s' : 'Hold', false);
    });
    $('act-combo').hidden = !a.combo;
    if (a.combo) setOp($('op-combo'), a.combo, 'A and B together', false);
  }

  /* ---------- demos ---------- */
  var demoLine = $('demoline'), stopBtn = $('stopdemo');
  function tokLabel(s){ return s.combo ? 'A + B' : ((s.hold ? 'hold ' : '')+s.b+(s.n>1 ? ' ×'+s.n : '')); }
  function scrollToSim(){
    if (wideMQ && wideMQ.matches) return;
    var r = $('watchfig').getBoundingClientRect();
    if (r.top < -20 || r.bottom > window.innerHeight+20) $('sim').scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block:'start'});
  }
  function stopDemo(){
    if (!demo) return;
    clearTimeout(demo.timer); demo = null; stopBtn.hidden = true;
    each('#demoline .tok', function(t){ t.classList.remove('cur'); });
  }
  function nextStep(){
    if (!demo) return;
    if (demo.i>=demo.steps.length){ stopDemo(); return; }
    var st = demo.steps[demo.i++], s = st.s;
    each('#demoline .tok', function(t){ t.classList.toggle('cur', t.getAttribute('data-i')===String(st.si)); });
    if (s.combo){ pulse('A'); pulse('B'); W.combo(); }
    else if (s.b){ pulse(s.b, !!s.hold); if (s.hold) W.doHold(s.b); else W.doPress(s.b); }
    demo.timer = setTimeout(nextStep, st.gap);
  }
  function runDemo(def){
    stopDemo();
    W.normalize(); if (def.pre) def.pre();
    var steps = [], html = '<span class="ttl">Demo: '+esc(def.t)+'</span>';
    def.s.forEach(function(s, si){
      var n = s.n||1, i;
      if (!s.wait) html += '<span class="tok" data-i="'+si+'">'+esc(tokLabel(s))+'</span>';
      for (i=0;i<n;i++) steps.push({s:s, si:si, gap: s.wait ? s.wait : (n>3 ? 150 : (s.hold ? 1200 : 640))});
    });
    demoLine.innerHTML = html; demoLine.hidden = false; stopBtn.hidden = false;
    demo = {steps:steps, i:0, timer:0};
    scrollToSim();
    demo.timer = setTimeout(nextStep, (wideMQ && wideMQ.matches) ? 450 : 950);
  }
  var DEMOS = {
    rxnow:{t:'receive now', s:[{b:'D',hold:1}]},
    lastrx:{t:'last sync result', s:[{b:'D'},{wait:4800},{b:'D'}]},
    autolight:{t:'auto light on or off', s:[{b:'B',hold:1}]},
    swap:{t:'swap Home and world time', s:[{b:'C'},{wait:4300},{combo:1},{wait:3400},{combo:1},{wait:1600},{b:'C',hold:1}]},
    wtcity:{t:'change a slot city', s:[{b:'C'},{wait:1300},{b:'A',hold:1},{wait:1500},{b:'D'},{wait:2000},{b:'B'},{wait:1600},{b:'C'},{wait:1600},{b:'A'}]},
    alarmset:{t:'set alarm 1 to 7:30', pre:function(){ var s = W.state; s.alSel = 0; s.al[0].h = 6; s.al[0].m = 0; s.al[0].on = false; },
      s:[{b:'C',n:2},{b:'A',hold:1},{b:'D'},{b:'C'},{b:'D',n:30},{b:'A'}]},
    sig:{t:'hourly signal on or off', pre:function(){ W.state.alSel = 0; }, s:[{b:'C',n:2},{b:'D',n:5},{b:'A'}]},
    split:{t:'time two finishers', pre:function(){ var w = W.state.sw; w.run = false; w.acc = 0; w.split = null; },
      s:[{b:'C',n:3},{b:'D'},{wait:2300},{b:'A'},{wait:1900},{b:'D'},{wait:1700},{b:'A'},{wait:2400},{b:'A'}]},
    timer10:{t:'set and run 10 seconds', pre:function(){ var t = W.state.tm; t.run = false; t.start = 600; t.left = 600e3; },
      s:[{b:'C',n:4},{b:'A',hold:1},{b:'C'},{b:'B',n:10},{b:'C'},{b:'D',n:10},{b:'A'},{b:'D'}]}
  };
  each('[data-demo]', function(el){ el.addEventListener('click', function(){ runDemo(DEMOS[el.getAttribute('data-demo')]); }); });
  stopBtn.addEventListener('click', stopDemo);

  /* ---------- 01 buttons and modes ---------- */
  var nodes01 = [], uiFlash = null;
  each('#loop .node', function(n){ nodes01.push(n); n.addEventListener('click', function(){ stopDemo(); W.jump(n.getAttribute('data-mode')); scrollToSim(); }); });
  each('#legend .lg', function(n){ n.addEventListener('click', function(){
    var s = W.state;
    if (s.power==='DEAD' || s.power==='CHG' || s.sleep) addLog('The display is off. Wake or charge the watch first.');
    uiFlash = {k:n.getAttribute('data-ind'), until:Date.now()+2800}; scrollToSim();
  }); });

  /* ---------- 02 radio sync ---------- */
  var night = $('night'), NM = [], nightTimer = 0, nightOut = $('night-out');
  (function(){
    var i, x, g;
    mk('path', {d:'M40 27v-6h280v6', 'class':'n-ax'}, night);
    var cap = mk('text', {x:180, y:13, 'text-anchor':'middle', 'class':'n-txt'}, night); cap.textContent = 'AUTO RECEIVE WINDOW';
    mk('path', {d:'M24 46H336', 'class':'n-ax'}, night);
    for (i=0;i<6;i++){
      x = 40+56*i; g = mk('g', {'class':'n-m'}, night);
      mk('circle', {cx:x, cy:46, r:9}, g);
      NM.push({g:g, t:mk('text', {x:x, y:46.5}, g)});
      mk('text', {x:x, y:74, 'text-anchor':'middle', 'class':'n-txt'}, night).textContent = '0'+i+':00';
    }
  })();
  function drawNight(res){
    clearTimeout(nightTimer);
    var k = 0, n = res.hours.length;
    NM.forEach(function(m, h){ m.g.setAttribute('class', 'n-m'+(res.hours.indexOf(h)<0 || res.blocked ? ' skip' : '')); m.t.textContent = res.blocked ? '–' : ''; });
    if (res.blocked){ setText(nightOut, 'No attempts tonight. '+res.blocked); return; }
    setText(nightOut, 'Listening…');
    (function step(){
      if (k>=res.attempts.length){
        NM.forEach(function(m, h){ if (res.ok && h>res.at && res.hours.indexOf(h)>=0){ m.g.setAttribute('class','n-m skip'); m.t.textContent = '–'; } });
        setText(nightOut, res.ok ? 'Synced at about 0'+res.at+':04 on attempt '+res.attempts.length+' of '+n+'. The rest were cancelled. RCVD is on.' :
          'All '+n+' attempts failed. The watch runs on its quartz until tomorrow night. RCVD is off.');
        return;
      }
      var a = res.attempts[k++], m = NM[a.h];
      m.g.setAttribute('class', 'n-m '+(a.ok ? 'ok' : 'fail')); m.t.textContent = a.ok ? '✓' : '✕';
      nightTimer = setTimeout(step, reduced ? 0 : 430);
    })();
  }
  $('night-run').addEventListener('click', function(){ stopDemo(); drawNight(W.nightSync()); });
  ['good','poor','none'].forEach(function(q){ $('sig-'+q).addEventListener('click', function(){ W.state.signal = q; syncPanels(); }); });

  /* ---------- 03 solar ---------- */
  var rungs = [], states = [];
  each('#ladder .rung', function(r){ rungs.push(r); r.addEventListener('click', function(){ stopDemo(); W.setPower(r.getAttribute('data-p')); syncPanels(); }); });
  each('#psflow .state', function(r){ states.push(r); r.addEventListener('click', function(){ stopDemo(); W.setSleep(+r.getAttribute('data-sleep')); syncPanels(); }); });

  /* ---------- 04 light ---------- */
  var tilt = $('tilt'), tiltOut = $('tilt-out'), arm = $('gauge-arm'), gauge = $('gauge');
  tilt.addEventListener('input', function(){ W.setTilt(+tilt.value); syncPanels(); });
  $('amb-bright').addEventListener('click', function(){ W.setDark(false); syncPanels(); });
  $('amb-dark').addEventListener('click', function(){ W.setDark(true); syncPanels(); });
  function drawChecks(el, list){
    var sig = JSON.stringify(list); if (el._sig===sig) return; el._sig = sig;
    el.innerHTML = list.map(function(c){ return '<li class="'+(c.ok ? 'ok' : 'no')+'"><span class="s">'+(c.ok ? '✓ OK' : '✕ NO')+'</span><span>'+esc(c.t)+'</span></li>'; }).join('');
  }

  /* ---------- 05 settings rail ---------- */
  var SETINFO = [
    ['Sets the time zone and decides which transmitter the watch listens for. HT flashes at the top left and the city name scrolls in the window.', 'B and D step through the 49 entries. Hold either one to scroll fast.', 'Changing it clears RCVD until the next sync (owner reports).'],
    ['AUTO follows the summer-time flag in the radio signal. OFF and ON force standard or summer time.', 'D cycles AUTO, OFF and ON.', 'AUTO is only offered when the Home City has a time signal. If the watch is an hour out after the clocks change, run a manual receive.'],
    ['Lines the seconds up with a reference clock.', 'D resets the seconds to 00. Between 30 and 59 seconds the minute is rounded up.', 'Any manual change to the time or date removes RCVD.'],
    ['Sets the hour. P marks p.m. in 12-hour mode.', 'B down, D up. Hold to scroll.', ''],
    ['Sets the minute.', 'B down, D up. Hold to scroll.', ''],
    ['2000 to 2099. The year is only ever shown on this screen. The day of the week is worked out from the date.', 'B down, D up.', ''],
    ['Sets the month.', 'B down, D up.', ''],
    ['Sets the day of the month.', 'B down, D up.', ''],
    ['Applies to every mode, including alarm times.', 'D switches between 12H and 24H.', ''],
    ['M.DD is month then day. DD.M is day then month, the UK order.', 'D switches between the two.', 'New on module 3495.'],
    ['Day-of-week abbreviations in English, Spanish, French, German, Italian or Russian.', 'D steps through ENG, ESP, FRA, DEU, ITA and PyC.', 'New on module 3495.'],
    ['MUTE silences the beep on button presses only. Alarms, the hourly signal and the timer still sound.', 'D switches between KEY♪ and MUTE.', 'A struck-through note on the display means muted.'],
    ['How long the light stays on for each press or tilt.', 'D switches between 1 (1.5 seconds) and 3 (3 seconds).', 'The longer setting uses more charge.'],
    ['Switches the overnight radio sync on or off. The word RECEIVING scrolls in the window.', 'D switches between On and OFF.', 'It cannot be changed while the Home City has no time signal.'],
    ['Lets the display switch off in the dark at night. POWER SAVING scrolls in the window.', 'D switches between On and OFF.', 'PS on the display means this setting is on. It does not mean the watch is asleep.']
  ];
  var rail = $('rail'), RV = [], RLI = [], TOGGLES = {1:1,8:1,9:1,10:1,11:1,12:1,13:1,14:1};
  W.setMeta.forEach(function(m, i){
    var li = document.createElement('li'), d = SETINFO[i];
    li.innerHTML = '<button class="rhead" id="rh-'+i+'" aria-expanded="false" aria-controls="rd-'+i+'"><span class="rc">'+(i ? 'C × '+i : 'First')+'</span><span class="rn">'+esc(m.n)+'</span><span class="rv" id="rv-'+i+'"></span></button>'+
      '<div class="rdet" id="rd-'+i+'" hidden><p>'+esc(d[0])+'</p><p class="k">'+esc(d[1])+'</p>'+(d[2] ? '<p class="k">'+esc(d[2])+'</p>' : '')+
      '<div class="row"><button class="chip run" id="rg-'+i+'">Take me there</button>'+(TOGGLES[i] ? '<button class="chip run" id="rt-'+i+'">Change it for me</button>' : '')+'</div></div>';
    rail.appendChild(li); RLI.push(li); RV.push(li.querySelector('.rv'));
    li.querySelector('.rhead').addEventListener('click', function(){
      var open = li.classList.contains('open');
      RLI.forEach(function(x, j){ x.classList.remove('open'); $('rd-'+j).hidden = true; $('rh-'+j).setAttribute('aria-expanded','false'); });
      if (!open){ li.classList.add('open'); $('rd-'+i).hidden = false; this.setAttribute('aria-expanded','true'); }
    });
    function path(extra){ var s = [{b:'A',hold:1}]; if (i) s.push({b:'C',n:i}); return s.concat(extra||[]); }
    $('rg-'+i).addEventListener('click', function(){ runDemo({t:'go to '+m.n.toLowerCase(), s:path()}); });
    if (TOGGLES[i]) $('rt-'+i).addEventListener('click', function(){ runDemo({t:'change '+m.n.toLowerCase(), s:path([{wait:900},{b:'D'},{wait:1300},{b:'A'}])}); });
  });

  /* ---------- 06 world time ---------- */
  var slotsEl = $('slots'), SL = [], citiesEl = $('cities'), CB = [], cityMode = 'slot';
  function fmtOff(o){ var a = Math.abs(o), h = Math.floor(a), m = Math.round((a-h)*60); return 'UTC'+(o===0 ? '±0' : (o<0 ? '−' : '+')+h+(m ? ':'+(m<10?'0':'')+m : '')); }
  (function(){
    var i, b;
    for (i=0;i<5;i++){
      b = document.createElement('button'); b.className = 'slot'; b.id = 'slot-'+i; b.setAttribute('aria-pressed','false');
      b.innerHTML = '<b>Slot '+(i+1)+'</b><span class="nm"></span><span class="tm"></span><span class="mt"></span>';
      slotsEl.appendChild(b); SL.push({b:b, nm:b.querySelector('.nm'), tm:b.querySelector('.tm'), mt:b.querySelector('.mt')});
      (function(i){ b.addEventListener('click', function(){ stopDemo(); W.gotoSlot(i); syncPanels(); scrollToSim(); }); })(i);
    }
    W.cities.forEach(function(c, i){
      var e = document.createElement('button'); e.className = 'city'; e.id = 'city-'+i;
      e.innerHTML = '<span class="nm">'+esc(c[0])+'</span><span class="of">'+fmtOff(c[1])+'</span><span class="tx'+(c[2] ? ' has' : '')+'">'+(c[2] ? 'Signal: '+W.tx[c[2]] : 'No time signal')+(W.dstNow(i) ? ' · on summer time now' : '')+'</span>';
      citiesEl.appendChild(e); CB.push(e);
      e.addEventListener('click', function(){
        stopDemo();
        if (cityMode==='slot'){ var k = W.state.wtSel; W.setSlotCity(k, i); W.gotoSlot(k); addLog(c[0]+' loaded into slot '+(k+1)+'.'); }
        else { W.setHomeCity(i); W.jump('TK'); addLog('Home City set to '+c[0]+'. RCVD cleared until the next sync.'); }
        syncPanels(); scrollToSim();
      });
    });
  })();
  $('cityq').addEventListener('input', function(){ var q = this.value.trim().toUpperCase(); W.cities.forEach(function(c, i){ CB[i].hidden = !!q && c[0].indexOf(q)<0; }); });
  $('cm-slot').addEventListener('click', function(){ cityMode = 'slot'; syncPanels(); });
  $('cm-home').addEventListener('click', function(){ cityMode = 'home'; syncPanels(); });

  /* ---------- 07 timing, tools ---------- */
  $('alarm-now').addEventListener('click', function(){ stopDemo(); W.normalize(); W.fireAlarm(); scrollToSim(); });
  $('snd').addEventListener('click', function(){
    soundOn = !soundOn;
    if (soundOn && !AC){ try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ soundOn = false; } }
    if (soundOn && AC && AC.state==='suspended' && AC.resume) AC.resume();
    this.setAttribute('aria-pressed', String(soundOn)); this.textContent = soundOn ? 'Sound on' : 'Sound off';
    if (soundOn) sound('key'); else sound('stop');
  });
  $('rst').addEventListener('click', function(){
    stopDemo(); W.reset(); logEl.innerHTML = ''; demoLine.hidden = true; uiFlash = null; tilt.value = 0;
    clearTimeout(nightTimer); NM.forEach(function(m){ m.g.setAttribute('class','n-m'); m.t.textContent = ''; }); setText(nightOut, 'Not run yet.');
    addLog('Simulator reset.'); syncPanels();
  });
  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(es){ var e = es[es.length-1]; $('jump').hidden = e.isIntersecting || e.boundingClientRect.top > 0; }, {threshold:0.2}).observe($('watchfig'));
  }

  /* ---------- keep panels in step with the watch ---------- */
  function syncPanels(){
    var s = W.state, C = W.cities, i, f, x, w, c, lc, bad;
    setText($('envline'), 'Charge '+(s.power==='DEAD' ? 'flat' : s.power)+' · '+(s.dark ? 'Dark' : 'Bright')+(s.sleep ? ' · Asleep L'+s.sleep : ''));
    nodes01.forEach(function(n){ setAttr(n, 'aria-current', String(n.getAttribute('data-mode')===s.mode)); });
    drawChecks($('preflight'), W.rxChecks());
    ['good','poor','none'].forEach(function(q){ setAttr($('sig-'+q), 'aria-pressed', String(s.signal===q)); });
    each('#txtable tbody tr', function(tr){ setCls(tr, 'hot', tr.getAttribute('data-tx')===C[s.home][2]); });
    rungs.forEach(function(r){ setAttr(r, 'aria-pressed', String(r.getAttribute('data-p')===s.power)); });
    states.forEach(function(r){ setAttr(r, 'aria-current', String(+r.getAttribute('data-sleep')===s.sleep)); });
    setAttr($('amb-bright'), 'aria-pressed', String(!s.dark)); setAttr($('amb-dark'), 'aria-pressed', String(!!s.dark));
    if (+tilt.value!==s.tilt) tilt.value = s.tilt;
    setText(tiltOut, s.tilt+'°'); setAttr(arm, 'transform', 'rotate('+(-s.tilt)+' 50 125)');
    lc = W.autoLightChecks(); drawChecks($('lt-checks'), lc);
    bad = null; for (i=0;i<lc.length;i++) if (!lc[i].ok){ bad = lc[i]; break; }
    setText($('lt-out'), bad ? 'Auto light will not fire. Not met: '+bad.t.charAt(0).toLowerCase()+bad.t.slice(1)+'.' : 'All met. The light fires each time the angle passes 40°.');
    for (i=0;i<15;i++){ setText(RV[i], W.setValue(i)); setCls(RLI[i], 'cur', s.mode==='TK' && s.sub==='set' && s.setIdx===i); }
    for (i=0;i<5;i++){
      w = s.wt[i]; c = C[w.c]; f = W.slotNow(i); x = W.hm(f);
      setText(SL[i].nm, c[0]); setText(SL[i].tm, x.big.slice(0,2).replace(' ','')+':'+x.big.slice(2)+(s.h24 ? '' : (x.P ? ' PM' : ' AM')));
      setText(SL[i].mt, fmtOff(c[1])+(w.dst ? ' · DST on' : ''));
      setAttr(SL[i].b, 'aria-pressed', String(i===s.wtSel));
    }
    setText($('cm-n'), String(s.wtSel+1));
    setAttr($('cm-slot'), 'aria-pressed', String(cityMode==='slot')); setAttr($('cm-home'), 'aria-pressed', String(cityMode==='home'));
    for (i=0;i<CB.length;i++) setCls(CB[i], 'home', i===s.home);
  }

  /* ---------- frame loop ---------- */
  var lastSync = 0, wf = $('watchfig');
  function frame(){
    var t = Date.now(), v, ph, i, k, on, I, s, h, st;
    W.tick();
    v = W.view(); ph = (Math.floor(t/400)%2)===0; I = v.ind; s = W.state;
    setCls(lcd, 'lit', v.lit); setCls(lcd, 'blank', v.off); setCls(gauge, 'lit', v.lit);
    for (i=0;i<11;i++) buf11[i] = 0;
    if (!v.off && v.tl && !(v.tlF && !ph)){ k = lay(v.tl).c; for (i=0;i<k.length && i<11;i++) buf11[i] = k[i]; }
    paint(TL, buf11);
    drawWin(v.off ? {text:''} : v.win, t, ph);
    for (i=0;i<4;i++) setDigit(BIG[i], (v.off || (v.bigF[i>>1] && !ph)) ? ' ' : v.big.charAt(i));
    for (i=0;i<2;i++) setDigit(SML[i], (v.off || (v.smallF && !ph)) ? ' ' : v.small.charAt(i));
    setCls(COLON, 'on', !v.off && v.colon); setCls(PRIME, 'on', !v.off && v.prime); setCls(DPRIME, 'on', !v.off && v.dprime);
    for (k in IND){
      on = v.off ? 0 : (I[k]||0);
      if (!v.off && uiFlash && t<uiFlash.until && (uiFlash.k===k || (uiFlash.k==='LMH' && (k==='L' || k==='M' || k==='H')))) on = 2;
      setCls(IND[k], 'on', on===2 ? ph : !!on);
    }
    for (i=0;i<4;i++){
      h = W.holdInfo(BTNS[i]);
      BTN[BTNS[i]].ring.style.strokeDashoffset = (RC*(1-h.p)).toFixed(1);
    }
    setCls(wf, 'beeping', !!(s.beep && t<s.beep.until && s.beep.kind!=='sig'));
    st = W.status(); setText($('st-title'), st[0]); setText($('st-detail'), st[1]);
    syncActs();
    if (t-lastSync > 200){ lastSync = t; syncPanels(); }
    window.requestAnimationFrame(frame);
  }
  addLog('Ready. The time follows this device\u2019s clock.');
  syncPanels();
  window.requestAnimationFrame(frame);
})();
