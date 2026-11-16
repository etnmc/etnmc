const createWatch = require('../src/core.js');
const assert = require('assert');
let T = Date.UTC(2026, 10, 16, 10, 58, 50, 0); // Mon 16 Nov 2026 10:58:50 UTC
const logs = [], beeps = [];
const W = createWatch({ now: () => T, emit: (k, d) => (k === 'log' ? logs : beeps).push(d) });
const S = () => W.state;
const adv = (ms, step = 50) => { for (let i = 0; i < ms; i += step) { T += step; W.tick(); } };
const show = (v) => `[${v.tl}|${(v.win.text||'').replace(/ /g,'_')}|${v.big}${v.colon?':':''}|${v.small}]`;

// 1 initial
let v = W.view();
console.log('init', show(v), JSON.stringify(v.ind));
assert.equal(v.tl, 'MO'); assert.equal(v.big, '1058'); assert.equal(v.small, '50'); assert.equal(v.ind.RCVD, 1); assert.equal(v.ind.P, 0); assert.equal(v.ind.H, 1);
assert.equal(v.win.text.replace(/ /g,'_'), '11.16');

// 2 physical hold A -> settings
W.down('A'); adv(500); v = W.view(); console.log('holding A', show(v)); assert.equal(v.big, 'Hold');
adv(1600); assert.equal(S().sub, 'set'); W.up('A'); v = W.view(); console.log('set0', show(v)); assert.equal(v.tl, 'HT');
// walk all 15 setting screens, render each
for (let i = 0; i < 15; i++) { v = W.view(); assert.equal(S().setIdx, i); console.log(' set', i, show(v), 'D:', W.actions().D.press.label, '| B:', W.actions().B.press ? W.actions().B.press.label : '-'); W.doPress('C'); }
assert.equal(S().setIdx, 0);
// date format via C x9, D, A
for (let i = 0; i < 9; i++) W.doPress('C'); W.doPress('D'); W.doPress('A');
assert.equal(S().dateFmt, 'DM'); assert.equal(S().sub, null);
v = W.view(); console.log('DM', show(v)); assert.equal(v.win.text.replace(/ /g,'_'), '16.11');

// 3 modes loop with physical presses
['WT','AL','ST','TR','TK'].forEach(m => { W.down('C'); W.up('C'); assert.equal(S().mode, m); console.log(m, show(W.view()), W.status().join(' / ')); });
// hold C from stopwatch returns to TK
W.jump('AL'); W.down('C'); assert.equal(S().mode, 'ST'); adv(1100); assert.equal(S().mode, 'TK'); W.up('C');

// 4 world time: banner then home time, next slot, swap
W.doPress('C'); v = W.view(); console.log('WT banner', show(v)); assert.equal(v.win.text, '-1-');
adv(900); v = W.view(); console.log('WT banner2', show(v), v.win.scroll); assert.equal(v.win.text, 'NEW YORK');
adv(4000); v = W.view(); console.log('WT steady', show(v), JSON.stringify(v.ind)); assert.equal(v.win.text.replace(/ /g,'_'), '10:58'); assert.equal(v.big, ' 558');
W.down('A'); W.down('B'); W.up('A'); W.up('B');
assert.equal(W.cities[S().home][0], 'NEW YORK'); assert.equal(W.cities[S().wt[0].c][0], 'LONDON'); assert.equal(S().sub, null);
v = W.view(); console.log('swapped', show(v)); assert.equal(v.big, '1058');
assert.equal(W.combo(), true); assert.equal(W.cities[S().home][0], 'LONDON');
// WT set
W.doHold('A'); assert.equal(S().sub, 'set'); W.doPress('D'); console.log('WT set', show(W.view()), W.status().join(' / ')); W.doPress('C'); console.log('WT dst', show(W.view())); W.doPress('B'); W.doPress('A'); 
W.doHold('A'); W.doPress('B'); W.doPress('A'); assert.equal(W.cities[S().wt[0].c][0], 'NEW YORK');

// 5 stopwatch
W.jump('ST'); W.doPress('D'); adv(1230, 10); v = W.view(); console.log('ST run', show(v), v.prime, v.dprime); assert.equal(v.big, '0001'); assert.equal(v.small, '23');
W.doPress('A'); adv(1000, 10); v = W.view(); console.log('ST split', show(v)); assert.equal(v.win.text, 'SPL'); assert.equal(v.small, '23');
W.doPress('D'); W.doPress('A'); v = W.view(); console.log('ST final', show(v)); assert.equal(v.big, '0002'); W.doPress('A'); assert.equal(S().sw.acc, 0);
S().sw.acc = 3722e3; v = W.view(); console.log('ST >1h', show(v)); assert.equal(v.big, ' 102'); assert.equal(v.small, '02'); S().sw.acc = 0;

// 6 timer: set 10 s and run
W.jump('TR'); v = W.view(); console.log('TR', show(v)); assert.equal(v.big, ' 010');
W.doHold('A'); W.doPress('C'); for (let i = 0; i < 10; i++) W.doPress('B'); W.doPress('C'); for (let i = 0; i < 10; i++) W.doPress('D'); W.doPress('A');
assert.equal(S().tm.start, 10); W.doPress('D'); adv(4000); v = W.view(); console.log('TR running', show(v)); assert.equal(v.small, '06');
W.doPress('D'); assert.equal(S().tm.run, false); console.log('TR paused acts', JSON.stringify(W.actions().A)); W.doPress('D'); adv(6200);
assert.ok(beeps.includes('timer')); console.log('TR done', show(W.view()), W.status().join(' / '));
assert.equal(W.actions().A.press.label, 'Stop the tone'); W.doPress('B'); assert.equal(S().beep, null);

// 7 alarm
W.jump('AL'); v = W.view(); console.log('AL', show(v)); assert.equal(v.small, '--'); W.down('A'); W.up('A'); assert.equal(S().al[0].on, true); v = W.view(); assert.equal(v.small, 'on'); assert.equal(v.ind.ALM, 1);
W.doHold('A'); W.doPress('D'); W.doPress('C'); W.doPress('D'); W.doPress('A'); assert.deepEqual([S().al[0].h, S().al[0].m], [7, 1]);
for (let i = 0; i < 5; i++) W.doPress('D'); v = W.view(); console.log('SIG', show(v)); W.doPress('A'); assert.equal(S().sig, true);
// alarm fires at home 11:02? set alarm 1 to next minute and let time pass
W.jump('TK'); const tg = new Date(T + 60000); S().al[0].h = tg.getUTCHours(); S().al[0].m = tg.getUTCMinutes(); beeps.length = 0; for (let i = 0; i < 130 && !beeps.includes('alarm'); i++) adv(500, 500); assert.ok(beeps.includes('alarm'), 'alarm should fire'); assert.equal(W.status()[0], 'Alarm tone');
W.doPress('C'); assert.equal(S().mode, 'TK'); assert.equal(S().beep, null);

// 8 reception
W.down('D'); adv(2100); assert.equal(S().sub, 'rx'); W.up('D'); adv(3000); v = W.view(); console.log('rx', show(v), v.ind.RCVD); assert.equal(v.tl, 'RC');
adv(6500); assert.equal(S().sub, 'rxres'); v = W.view(); console.log('rxres', show(v)); adv(5000); assert.equal(S().sub, null); assert.equal(W.view().ind.RCVD, 1);
W.down('D'); W.up('D'); assert.equal(S().sub, 'lastrx'); console.log('lastrx', show(W.view())); W.doPress('D');
// manual time change clears RCVD
W.doHold('A'); for (let i = 0; i < 4; i++) W.doPress('C'); W.doPress('D'); W.doPress('A'); assert.equal(W.view().ind.RCVD, 0);
// blocked reception
W.setHomeCity(W.cities.findIndex(c => c[0] === 'DUBAI')); console.log('blocked:', W.actions().D.hold.dis); assert.ok(W.actions().D.hold.dis);
console.log('night', JSON.stringify(W.nightSync())); W.setHomeCity(W.cities.findIndex(c => c[0] === 'LONDON'));
S().signal = 'poor'; console.log('night poor', JSON.stringify(W.nightSync())); S().signal = 'good';

// 9 power and sleep
W.jump('ST'); W.setPower('L'); assert.equal(S().mode, 'TK'); v = W.view(); console.log('L', show(v), JSON.stringify(v.ind), JSON.stringify(W.actions().B.press)); assert.equal(v.ind.L, 2);
W.setPower('CHG'); console.log('CHG', show(W.view())); W.setPower('DEAD'); assert.equal(W.view().off, true); W.setPower('M');
v = W.view(); console.log('after flat', show(v), W.cities[S().home][0]); assert.equal(W.cities[S().home][0], 'TOKYO');
W.reset(); assert.equal(W.setSleep(1), true); assert.equal(W.view().off, true); console.log('sleep acts', JSON.stringify(W.actions().A)); W.doPress('A'); assert.equal(S().sleep, 0);
// auto light
W.doHold('B'); assert.equal(S().autoLight, true); W.setDark(true); assert.equal(W.setTilt(50), true); assert.equal(W.view().lit, true); adv(1600); assert.equal(W.view().lit, false);
W.setDark(false); W.setTilt(0); assert.equal(W.setTilt(60), false);

// 10 DST rules
const lon = [0, 'EU'];
assert.equal(W.ruleDst('EU', 0, Date.UTC(2026, 6, 1)), true); assert.equal(W.ruleDst('EU', 0, Date.UTC(2026, 10, 16)), false);
assert.equal(W.ruleDst('EU', 0, Date.UTC(2026, 2, 29, 0, 59)), false); assert.equal(W.ruleDst('EU', 0, Date.UTC(2026, 2, 29, 1, 0)), true);
assert.equal(W.ruleDst('NA', -5, Date.UTC(2026, 2, 8, 6, 59)), false); assert.equal(W.ruleDst('NA', -5, Date.UTC(2026, 2, 8, 7, 0)), true);
assert.equal(W.ruleDst('NA', -5, Date.UTC(2026, 10, 1, 5, 59)), true); assert.equal(W.ruleDst('NA', -5, Date.UTC(2026, 10, 1, 6, 0)), false);
assert.equal(W.ruleDst('AU', 10, Date.UTC(2026, 10, 16)), true); assert.equal(W.ruleDst('AU', 10, Date.UTC(2026, 5, 16)), false);
assert.equal(W.ruleDst('NZ', 12, Date.UTC(2026, 0, 16)), true);
// idle auto-return
W.reset(); W.doHold('A'); adv(151000, 1000); assert.equal(S().sub, null);
// 12h pm display + 24h
T = Date.UTC(2026, 6, 4, 21, 5, 9); W.reset(); v = W.view(); console.log('summer', show(v), JSON.stringify(v.ind)); assert.equal(v.big, '1005'); assert.equal(v.ind.P, 1); assert.equal(v.ind.DST, 1);
console.log('logs:', logs.length, '| last:', logs.slice(-3));
console.log('ALL OK');
