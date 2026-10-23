/* habeet app: views, events and storage. No build step, no dependencies. */
(function () {
  'use strict';
  var L = window.HabeetLogic, I = window.HabeetIcons, C = window.HabeetCloud;
  var KEY = 'habeet:v1';
  var VERSION = '1.1';
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var PARTS = [
    { n: 'Morning', ic: 'sunrise', c: 1 },
    { n: 'Afternoon', ic: 'sun', c: 4 },
    { n: 'Evening', ic: 'moon', c: 5 }
  ];
  var STARTERS = [
    { name: 'Drink water', icon: 'water', color: 3, part: 0, kind: 'count', goal: 8, unit: 'glasses' },
    { name: 'Read', icon: 'book', color: 4, part: 2, kind: 'time', goal: 20 },
    { name: 'Move', icon: 'run', color: 0, part: 0, kind: 'time', goal: 30 },
    { name: 'Write in a journal', icon: 'pen', color: 1, part: 2 }
  ];
  var MAX_GOAL = { time: 1440, count: 10000 };

  var state, memoryOnly = false, today = L.localKey(), route = { name: 'today' };
  var ui = { gate: null, auth: { mode: 'in', err: '', msg: '', busy: false, email: '' }, ideaCat: 'All', prefill: null, viewDay: null, ovRange: 'week', calMonth: null, draft: null, persisted: null, installEvt: null, longFired: false, pressTimer: null };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function newId() {
    if (window.crypto && crypto.randomUUID) return 'h' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    return 'h' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function active() { return state.habits.filter(function (h) { return !h.archived; }); }
  function byId(id) { for (var i = 0; i < state.habits.length; i++) if (state.habits[i].id === id) return state.habits[i]; return null; }
  function ic(n, s, w) { return I.svg(I.has(n) ? n : 'star', s, w); }
  function parts(k) { var p = k.split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function longDate(k) { var p = parts(k); return DOW[L.dow(k)] + ', ' + p.d + ' ' + MONTHS[p.m - 1]; }
  function shortDate(k) { var p = parts(k); return DOW3[L.dow(k)] + ' ' + p.d + ' ' + MONTHS[p.m - 1].slice(0, 3); }
  function dayLabels() { return state.settings.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]; }
  function sched(h) {
    var d = h.days.join('');
    if (d === '0123456') return 'Every day';
    if (d === '12345') return 'Mon to Fri';
    if (d === '123456') return 'Mon to Sat';
    if (d === '06') return 'Weekends';
    return h.days.map(function (x) { return DOW3[x]; }).join(', ');
  }
  function daysAgo(ts) { return Math.floor((Date.now() - ts) / 864e5); }
  function makeHabit(o) {
    var kind = o.kind === 'time' || o.kind === 'count' ? o.kind : 'check';
    var h = { id: newId(), name: o.name, icon: o.icon, color: o.color, days: (o.days || [0, 1, 2, 3, 4, 5, 6]).slice().sort(), part: o.part, startDay: o.startDay || today, archived: false, kind: kind, u: Date.now() };
    if (kind !== 'check') { h.goals = [{ from: h.startDay, goal: o.goal || (kind === 'time' ? 30 : 8) }]; h.unit = kind === 'count' ? (o.unit || '') : ''; }
    return h;
  }
  function touch(h) { h.u = Date.now(); }
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(sec));
    if (sec < 60) return sec + ' sec';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function unitOf(h) { return h.unit || 'times'; }
  /* "30 min" or "6 cups": the goal as shown in lists */
  function goalText(h, k) {
    var kd = L.kindOf(h); if (kd === 'check') return '';
    var g = L.goalOn(h, k || today);
    return kd === 'time' ? fmtDur(g * 60) : g + ' ' + unitOf(h);
  }
  function metaLine(h) { var g = goalText(h); return (g ? g + ' · ' : '') + sched(h); }

  /* ---------- timers ----------
     A running timer stores its start time, so it keeps counting while the app is closed.
     It is saved on this device only (not synced). */
  var TKEY = 'habeet:timers', timers = {};
  function loadTimers() {
    try { var t = JSON.parse(localStorage.getItem(TKEY) || '{}'); if (t && typeof t === 'object' && !Array.isArray(t)) timers = t; } catch (e) { timers = {}; }
  }
  function saveTimers() { try { localStorage.setItem(TKEY, JSON.stringify(timers)); } catch (e) { /* ignore */ } }
  function timerElapsed(id) { var t = timers[id]; return t ? Math.max(0, Math.floor((Date.now() - t.start) / 1000)) : 0; }
  function liveProgress(h, k) {
    var base = L.progress(state.log, h, k);
    return timers[h.id] && timers[h.id].day === k ? base + timerElapsed(h.id) : base;
  }
  function startTimer(id) {
    var h = byId(id); if (!h || L.kindOf(h) !== 'time') return;
    if (L.entry(state.log, h, today) !== '') return;
    timers[id] = { start: Date.now(), day: today }; saveTimers(); render();
  }
  /* Stop a timer and add its time to that day. Never goes past the goal. */
  function stopTimer(id, quiet) {
    var t = timers[id]; if (!t) return;
    var h = byId(id), el = timerElapsed(id);
    delete timers[id]; saveTimers();
    if (h) {
      var raw = L.rawEntry(state.log, h, t.day);
      if (raw !== 'd' && raw !== 's') {
        var cur = typeof raw === 'number' ? raw : 0, room = Math.max(0, L.target(h, t.day) - cur), credit = Math.min(el, room);
        if (credit > 0) { var l = state.log[id] || (state.log[id] = {}); l[t.day] = cur + credit; save(); }
        if (!quiet && L.entry(state.log, h, t.day) === 'd') toast(h.name + ': goal reached.');
      }
    }
    render();
  }
  function checkTimers() {
    var finished = false;
    Object.keys(timers).forEach(function (id) {
      var h = byId(id), t = timers[id];
      if (!h) { delete timers[id]; saveTimers(); return; }
      var raw = L.rawEntry(state.log, h, t.day);
      if (raw === 'd' || raw === 's' || liveProgress(h, t.day) >= L.target(h, t.day)) { stopTimer(id, false); finished = true; }
    });
    return finished;
  }
  function updateLive() {
    if (!Object.keys(timers).length) return;
    if (checkTimers()) return;
    document.querySelectorAll('[data-live]').forEach(function (el) {
      var h = byId(el.getAttribute('data-live')); if (!h) return;
      var day = el.getAttribute('data-day'), v = liveProgress(h, day), tg = L.target(h, day);
      el.textContent = fmtClock(v) + ' of ' + fmtClock(tg);
      var bar = el.closest('.hname').querySelector('.rbar i'); if (bar) bar.style.width = Math.min(100, Math.round(100 * v / tg)) + '%';
    });
  }
  function logCount() { var n = 0; for (var id in state.log) for (var k in state.log[id]) n++; return n; }

  /* ---------- storage ---------- */
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { memoryOnly = true; }
    if (!raw) return L.defaults();
    try {
      var res = L.sanitize(JSON.parse(raw));
      if (res.ok) return res.state;
    } catch (e) { /* fall through */ }
    try { localStorage.setItem(KEY + ':corrupt', raw); } catch (e2) { /* ignore */ }
    ui.loadError = true;
    return L.defaults();
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); memoryOnly = false; }
    catch (e) { if (!memoryOnly) { memoryOnly = true; toast('Could not save here. Your changes will be lost when you close this tab.'); } }
  }
  function save() {
    state.updated = Date.now();
    saveLocal();
    if (cloudOn()) { meta.dirty = true; saveMeta(); scheduleSync(); }
  }
  function applyTheme() {
    var t = state.settings.theme, root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    var dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#17161B' : '#F0ECE6');
  }

  /* ---------- dialog and toast ---------- */
  var toastTimer;
  function toast(msg) {
    var old = $('.toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 3200);
  }
  function confirmBox(o) {
    return new Promise(function (resolve) {
      var s = document.createElement('div'); s.className = 'scrim';
      s.innerHTML = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t">' + esc(o.title) + '</h2><p>' + esc(o.text) +
        '</p><div class="btns"><button class="btn ' + (o.danger ? 'danger' : '') + '" data-ok>' + esc(o.ok) + '</button><button class="btn soft" data-no>Cancel</button></div></div>';
      function done(v) { s.remove(); document.removeEventListener('keydown', key); resolve(v); }
      function key(e) { if (e.key === 'Escape') done(false); }
      s.addEventListener('click', function (e) { if (e.target === s || e.target.hasAttribute('data-no')) done(false); else if (e.target.closest('[data-ok]')) done(true); });
      document.addEventListener('keydown', key);
      document.body.appendChild(s); $('[data-no]', s).focus();
    });
  }

  /* ---------- routing ---------- */
  function parseRoute() {
    var h = (location.hash || '#/today').replace(/^#\/?/, '').split('/');
    var n = h[0] || 'today';
    if (n === 'habit' && h[1]) return { name: 'habit', id: h[1] };
    if (n === 'edit' && h[1]) return { name: 'edit', id: h[1] };
    if (['today', 'overview', 'habits', 'settings', 'new', 'ideas'].indexOf(n) !== -1) return { name: n };
    return { name: 'today' };
  }
  function navTab() {
    var n = route.name;
    return n === 'today' ? 'today' : n === 'overview' ? 'overview' : n === 'settings' ? 'settings' : 'habits';
  }
  function go(hash) {
    if (location.hash === hash) { render(); return; }
    location.hash = hash;
    onRoute(); // render right away; the hashchange event that follows is then skipped
  }

  /* ---------- pieces ---------- */
  var NAV = [['today', 'today', 'Today'], ['bars', 'overview', 'Overview'], ['list', 'habits', 'Habits'], ['gear', 'settings', 'Settings']];
  function sideHTML() {
    var on = navTab();
    var foot = cloudOn()
      ? '<b>' + esc(C.session().email || 'Signed in') + '</b><span data-syncline>' + syncLabel() + '</span><button data-act="export">Export a copy</button>'
      : '<b>Saved on this device</b>' + (state.settings.lastBackup ? 'Last backup ' + daysAgo(state.settings.lastBackup) + ' days ago.' : 'Not signed in.') + '<button data-act="export">Export a copy</button>';
    return '<div class="brand"><i>' + ic('check', 18, 2.4) + '</i>habeet</div>' +
      NAV.map(function (n) { return '<button class="nav ' + (n[1] === on ? 'on' : '') + '" data-go="#/' + n[1] + '"' + (n[1] === on ? ' aria-current="page"' : '') + '>' + ic(n[0], 20) + n[2] + '</button>'; }).join('') +
      '<div class="sidefoot">' + foot + '</div>';
  }
  function tabHTML() {
    var on = navTab();
    return NAV.map(function (n) { return '<button class="tab ' + (n[1] === on ? 'on' : '') + '" data-go="#/' + n[1] + '"' + (n[1] === on ? ' aria-current="page"' : '') + '>' + ic(n[0], 22) + '<span>' + n[2] + '</span></button>'; }).join('');
  }
  function backupNeeded() {
    if (cloudOn()) return false;
    if (!logCount()) return false;
    return !state.settings.lastBackup || daysAgo(state.settings.lastBackup) >= 14;
  }
  function backupNotice() {
    if (!backupNeeded()) return '';
    var msg = state.settings.lastBackup ? 'Last backup ' + daysAgo(state.settings.lastBackup) + ' days ago.' : 'You have not saved a backup yet.';
    return '<div class="notice" role="note">' + ic('shield', 20) + '<div><b>' + msg + '</b>Your habits live only in this browser. Export a copy so nothing gets lost.</div><button class="x" data-act="export">Export</button></div>';
  }
  function storageNotice() {
    return memoryOnly ? '<div class="notice" role="alert">' + ic('shield', 20) + '<div><b>Saving is not working</b>This browser is blocking storage, so changes will be lost when you close the tab. Try a normal (not private) window.</div></div>' : '';
  }

  /* ---------- today ---------- */
  function rowHTML(h, k) {
    var st = L.status(h, state.log, k, today), kd = L.kindOf(h);
    var cls = st === 'done' ? 'done' : st === 'skip' ? 'skip' : '';
    var sub = sched(h), bar = '', ctl = '';
    var chip = '';
    if (k === today) { var s = L.streaks(h, state.log, today).current; chip = '<span class="streak ' + (s ? '' : 'zero') + '" title="Current streak">' + ic('flame', 13, 2) + s + '</span>'; }
    if (kd !== 'check' && st !== 'skip') {
      var tg = L.target(h, k), live = !!(timers[h.id] && timers[h.id].day === k), v = liveProgress(h, k);
      if (live) sub = '<span data-live="' + h.id + '" data-day="' + k + '">' + fmtClock(v) + ' of ' + fmtClock(tg) + '</span>';
      else if (kd === 'time') sub = v >= tg ? 'Done · ' + fmtDur(tg) : fmtDur(v) + ' of ' + fmtDur(tg);
      else sub = esc(v + ' of ' + tg + ' ' + unitOf(h));
      bar = '<span class="rbar" aria-hidden="true"><i style="width:' + Math.min(100, Math.round(100 * v / tg)) + '%"></i></span>';
    } else if (st === 'skip') sub = 'Skipped';
    var label = st === 'done' ? 'Mark ' + h.name + ' as not done' : 'Mark ' + h.name + ' as done';
    var chk = '<button class="chk" data-act="tick" data-id="' + h.id + '" data-day="' + k + '" aria-pressed="' + (st === 'done') + '" aria-label="' + esc(label) + '">' + (st === 'done' ? ic('check', 18, 2.6) : st === 'skip' ? ic('skip', 14, 2) : '') + '</button>';
    if (kd === 'count') {
      ctl = '<span class="stepper"><button class="stepb" data-act="dec" data-id="' + h.id + '" data-day="' + k + '" aria-label="Remove one from ' + esc(h.name) + '"' + (L.progress(state.log, h, k) < 1 ? ' disabled' : '') + '>' + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg></button>' +
        '<button class="stepb plus" data-act="inc" data-id="' + h.id + '" data-day="' + k + '" aria-label="Add one to ' + esc(h.name) + '">' + ic('plus', 16, 2.6) + '</button></span>';
    } else if (kd === 'time') {
      var running = !!(timers[h.id] && timers[h.id].day === k);
      if (running) ctl = '<button class="stepb stop" data-act="timer-stop" data-id="' + h.id + '" aria-label="Stop timer for ' + esc(h.name) + '"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>';
      else if (k === today && st === 'pending') ctl = '<button class="stepb play" data-act="timer-start" data-id="' + h.id + '" aria-label="Start timer for ' + esc(h.name) + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg></button>';
      ctl += chk;
    } else ctl = chk;
    return '<div class="hrow c' + h.color + ' ' + cls + '"><a class="hlink" href="#/habit/' + h.id + '"><span class="hic">' + ic(h.icon, 22) + '</span><span class="hname"><b>' + esc(h.name) + '</b><small>' + (st === 'skip' ? 'Skipped' : kd === 'check' ? esc(sub) : sub) + '</small>' + bar + '</span></a>' + chip + ctl + '</div>';
  }
  function weekStripHTML(vd) {
    var ws = L.weekStartOf(vd, state.settings.weekStart), thisWs = L.weekStartOf(today, state.settings.weekStart);
    var hs = active(), out = '<div class="weekstrip" role="group" aria-label="Choose a day"><button class="nv" data-act="week" data-d="-7" aria-label="Previous week">' + ic('back', 18) + '</button>';
    for (var i = 0; i < 7; i++) {
      var k = L.add(ws, i), fut = k > today, pr = L.dayProgress(hs, state.log, k, today);
      var p = pr.total ? Math.round(100 * pr.done / pr.total) : 0;
      out += '<button class="wd ' + (k === vd ? 'sel ' : '') + (k === today ? 'today' : '') + '" ' + (fut ? 'disabled ' : '') + 'data-act="day" data-day="' + k + '" aria-label="' + esc(longDate(k)) + (k === vd ? ', selected' : '') + '">' +
        DOW3[L.dow(k)].charAt(0) + '<span class="ring" style="--p:' + (fut ? 0 : p) + '"><span>' + parts(k).d + '</span></span></button>';
    }
    return out + '<button class="nv" data-act="week" data-d="7" aria-label="Next week"' + (ws >= thisWs ? ' disabled' : '') + '>' + ic('next', 18) + '</button></div>';
  }
  function hintText(hs) {
    var kinds = {}; hs.forEach(function (h) { kinds[L.kindOf(h)] = true; });
    var t = 'Tap the circle to tick. Press and hold to skip a day.';
    if (kinds.count) t += ' Use + to add to a count.';
    if (kinds.time) t += ' Press play to time it.';
    return t;
  }
  function viewToday() {
    var vd = ui.viewDay && ui.viewDay <= today ? ui.viewDay : today;
    var hs = active(), isToday = vd === today;
    var hr = new Date().getHours();
    var eyebrow = isToday ? (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') : (vd < today ? 'Looking back' : '');
    var head = '<div class="head"><div><div class="eyebrow">' + eyebrow + '</div><h1 class="h-title">' + longDate(vd) + '</h1></div>' +
      '<button class="btn sm" data-go="#/new" style="width:auto">' + ic('plus', 18, 2.2) + 'New habit</button></div>';
    if (!hs.length) {
      return head + storageNotice() + '<div class="card empty"><h2>Start with one habit</h2><p>Pick one to begin, or make your own. Your habits are saved to your account and follow you to every device.</p>' +
        '<div class="starters">' + STARTERS.map(function (s, i) { return '<button data-act="starter" data-i="' + i + '">' + esc(s.name) + '</button>'; }).join('') + '</div>' +
        '<div class="empty-btns"><button class="btn sm" data-go="#/ideas">' + ic('star', 18, 2) + 'Browse ideas</button><button class="btn sm ghost" data-go="#/new">' + ic('plus', 18, 2.2) + 'Make my own</button></div></div>';
    }
    var pr = L.dayProgress(hs, state.log, vd, today), pct = pr.total ? Math.round(100 * pr.done / pr.total) : 0;
    var cols = [[], [], []], any = false;
    PARTS.forEach(function (p, pi) {
      var rows = hs.filter(function (h) { var s = L.status(h, state.log, vd, today); return h.part === pi && (s === 'done' || s === 'skip' || s === 'pending' || s === 'missed'); });
      if (!rows.length) return; any = true;
      var dn = rows.filter(function (h) { return L.status(h, state.log, vd, today) === 'done'; }).length;
      cols[pi] = '<section class="sec c' + p.c + '" aria-label="' + p.n + '"><div class="sechead"><span class="sic" style="background:var(--t);color:var(--i)">' + ic(p.ic, 18) + '</span><h3>' + p.n + '</h3><span class="cnt">' + dn + ' of ' + rows.length + '</span><span class="mini" aria-hidden="true"><i style="width:' + Math.round(100 * dn / rows.length) + '%"></i></span></div>' +
        rows.map(function (h) { return rowHTML(h, vd); }).join('') + '</section>';
    });
    var secs = any ? '<div class="sections"><div class="col">' + cols[0] + '</div><div class="col">' + cols[1] + cols[2] + '</div></div>' +
      '<p class="hint">' + hintText(hs) + '</p>' : '<div class="card empty"><p>Nothing is scheduled on this day.</p></div>';
    var main = head + storageNotice() + backupNotice() + weekStripHTML(vd) +
      '<div class="card progress" style="margin-bottom:14px"><div class="top"><b class="n">' + pr.done + ' of ' + pr.total + ' done' + (isToday ? ' today' : '') + '</b><b class="p">' + pct + '%</b></div><div class="bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div></div>' + secs;
    return '<div class="today-grid"><div>' + main + '</div>' + asideHTML(hs) + '</div>';
  }
  function asideHTML(hs) {
    var ws = L.weekStartOf(today, state.settings.weekStart);
    var wr = L.overallRate(hs, state.log, ws, L.add(ws, 6), today), mr = L.overallRate(hs, state.log, L.monthStartOf(today), today, today);
    var best = null; hs.forEach(function (h) { var s = L.streaks(h, state.log, today).current; if (s > 0 && (!best || s > best.s)) best = { h: h, s: s }; });
    var left = hs.filter(function (h) { return L.status(h, state.log, today, today) === 'pending'; });
    return '<aside class="aside" aria-label="Summary"><div class="card asidecard" style="text-align:center"><div class="eyebrow" style="margin-bottom:14px">This week</div><div class="ringbig" style="--p:' + (wr || 0) + '"><div><b>' + (wr === null ? '-' : wr + '%') + '</b><span>completed</span></div></div>' +
      '<div class="small muted" style="margin-top:14px;display:flex;justify-content:space-between"><span>This month</span><b style="color:var(--ink)">' + (mr === null ? '-' : mr + '%') + '</b></div></div>' +
      (best ? '<div class="card asidecard c' + best.h.color + '" style="background:var(--t)"><div style="display:flex;gap:12px;align-items:center"><span class="hic" style="background:var(--card)">' + ic('flame', 22) + '</span><div><div class="small" style="font-weight:600;color:var(--i)">Longest running streak</div><b style="font-size:15px">' + esc(best.h.name) + ', ' + best.s + ' day' + (best.s === 1 ? '' : 's') + '</b></div></div></div>' : '') +
      (left.length ? '<div class="card asidecard"><b class="disp" style="font-size:17px">Not done yet</b><ul class="todo">' + left.map(function (h) { return '<li class="c' + h.color + '"><span style="color:var(--i)">' + ic(h.icon, 18) + '</span>' + esc(h.name) + '</li>'; }).join('') + '</ul></div>' : '') +
      '</aside>';
  }

  /* ---------- habit detail ---------- */
  function viewHabit(id) {
    var h = byId(id);
    if (!h) return '<div class="card empty"><h2>Habit not found</h2><p>It may have been removed.</p><button class="btn sm" data-go="#/habits">Back to habits</button></div>';
    var sk = L.streaks(h, state.log, today), cm = ui.calMonth || L.monthStartOf(today);
    var p = parts(cm), first = cm, lead = (L.dow(first) - state.settings.weekStart + 7) % 7, n = L.daysInMonth(p.y, p.m);
    var cells = dayLabels().map(function (d) { return '<div class="dh">' + DOW3[d].charAt(0) + '</div>'; }).join('');
    for (var i = 0; i < lead; i++) cells += '<div class="d"></div>';
    for (var d = 1; d <= n; d++) {
      var k = p.y + '-' + (p.m < 10 ? '0' : '') + p.m + '-' + (d < 10 ? '0' : '') + d, st = L.status(h, state.log, k, today), cls = '', edit = false;
      if (st === 'done') { cls = 'done'; edit = true; } else if (st === 'skip') { cls = 'skip'; edit = true; } else if (st === 'missed') { cls = 'missed'; edit = true; } else if (st === 'pending') { edit = true; } else cls = 'off';
      if (k === today) cls += ' tod';
      cells += '<div class="d">' + (edit ? '<button class="' + cls + '" data-act="cal" data-day="' + k + '" aria-label="' + esc(longDate(k) + ', ' + (st === 'pending' ? 'not done yet' : st)) + '">' + d + '</button>' : '<span class="d2 ' + cls + '">' + d + '</span>') + '</div>';
    }
    var nextOk = cm < L.monthStartOf(today), prevOk = cm > L.monthStartOf(h.startDay);
    var ws = L.weekStartOf(today, state.settings.weekStart);
    var r30 = L.rate(h, state.log, L.add(today, -29), today, today), bw = L.bestWeekday(h, state.log, today);
    var ts = L.status(h, state.log, today, today);
    var canSkip = ts === 'pending' || ts === 'skip' || ts === 'done';
    return '<div class="c' + h.color + '"><div class="topbar"><button class="iconbtn" data-act="back" aria-label="Back">' + ic('back', 20) + '</button><span class="t">Habit</span><button class="iconbtn" data-go="#/edit/' + h.id + '" aria-label="Edit habit">' + ic('edit', 18) + '</button></div>' +
      '<div class="dhead"><span class="hic">' + ic(h.icon, 30) + '</span><div><h1 class="disp">' + esc(h.name) + '</h1><div class="muted small">' + esc(metaLine(h)) + ' · ' + PARTS[h.part].n + (h.archived ? ' · Archived' : '') + '</div></div></div>' +
      '<div class="detail-grid"><div class="stack"><div class="stat2"><div class="card tint"><div class="lab">' + ic('flame', 15, 2) + 'Current streak</div><div class="num">' + sk.current + ' <small>day' + (sk.current === 1 ? '' : 's') + '</small></div></div>' +
      '<div class="card"><div class="lab">Best streak</div><div class="num">' + sk.best + ' <small>day' + (sk.best === 1 ? '' : 's') + '</small></div></div></div>' +
      '<div class="stat3"><div class="card"><span class="disp">' + (r30 === null ? '-' : r30 + '%') + '</span><small>Last 30 days</small></div><div class="card"><span class="disp">' + L.totalDone(h, state.log) + '</span><small>Total done</small></div><div class="card"><span class="disp">' + (bw < 0 ? '-' : DOW3[bw]) + '</span><small>Best day</small></div></div></div>' +
      '<div class="stack"><div class="card"><div class="calhead"><button class="nv" data-act="month" data-d="-1" aria-label="Previous month"' + (prevOk ? '' : ' disabled') + '>' + ic('back', 18) + '</button><h3>' + MONTHS[p.m - 1] + ' ' + p.y + '</h3><button class="nv" data-act="month" data-d="1" aria-label="Next month"' + (nextOk ? '' : ' disabled') + '>' + ic('next', 18) + '</button></div>' +
      '<div class="cal">' + cells + '</div><div class="legend"><span><i style="background:var(--i)"></i>Done</span><span><i style="background:var(--t)"></i>Missed</span><span><i style="border:1.5px dashed var(--i)"></i>Skipped</span><span>Tap a day to change it</span></div></div>' +
      '<div class="actions">' + (h.archived ? '' : (canSkip ? '<button class="btn ghost" data-act="skiptoday" data-id="' + h.id + '">' + ic('skip', 16) + (ts === 'skip' ? 'Undo skip' : 'Skip today') + '</button>' : '')) +
      '<button class="btn ghost" data-go="#/edit/' + h.id + '">' + ic('edit', 16) + 'Edit</button>' +
      (h.archived ? '<button class="btn ghost" data-act="unarchive" data-id="' + h.id + '">' + ic('restore', 16) + 'Restore</button>' : '<button class="btn ghost" data-act="archive" data-id="' + h.id + '">' + ic('archive', 16) + 'Archive</button>') + '</div></div></div></div>';
  }

  /* ---------- overview ---------- */
  function viewOverview() {
    var hs = active(), ws = L.weekStartOf(today, state.settings.weekStart);
    if (!hs.length) return '<div class="head"><div><h1 class="h-title">Overview</h1></div></div><div class="card empty"><p>Add a habit and your progress will show up here.</p><button class="btn sm" data-go="#/new">' + ic('plus', 18, 2.2) + 'New habit</button></div>';
    var wr = L.overallRate(hs, state.log, ws, L.add(ws, 6), today), mr = L.overallRate(hs, state.log, L.monthStartOf(today), today, today);
    var weeks = L.weeklyRates(hs, state.log, today, state.settings.weekStart, 12);
    var chart = weeks.map(function (w, i) {
      return '<div class="col ' + (i === 11 ? 'now' : '') + '"><span>' + (w.rate === null ? '' : w.rate) + '</span><i style="height:' + (w.rate === null ? 4 : Math.max(4, w.rate * 0.95)) + '%"></i></div>';
    }).join('');
    var rng = ui.ovRange, from = rng === 'week' ? ws : rng === 'month' ? L.monthStartOf(today) : L.add(today, -83);
    var rlab = rng === 'week' ? 'this week' : rng === 'month' ? 'this month' : 'last 12 weeks';
    var rates = hs.map(function (h) {
      var r = L.rate(h, state.log, from, today, today);
      return '<div class="li c' + h.color + '"><span class="hic">' + ic(h.icon, 16) + '</span><a class="nm" href="#/habit/' + h.id + '" style="color:inherit;text-decoration:none">' + esc(h.name) + '</a><span class="mini" aria-hidden="true"><i style="width:' + (r || 0) + '%"></i></span><b>' + (r === null ? '-' : r + '%') + '</b></div>';
    }).join('');
    var hws = L.add(ws, -77);
    var heats = hs.map(function (h) {
      var cells = '';
      for (var i = 0; i < 84; i++) {
        var k = L.add(hws, i), st = L.status(h, state.log, k, today), c = st === 'done' ? 'd' : st === 'skip' ? 's' : st === 'off' ? 'o' : st === 'future' ? 'f' : st === 'before' ? 'b' : '';
        cells += '<i class="' + c + '"></i>';
      }
      var s = L.streaks(h, state.log, today), r = L.rate(h, state.log, L.add(today, -83), today, today);
      return '<a class="card heat c' + h.color + '" href="#/habit/' + h.id + '" style="text-decoration:none;color:inherit"><div class="hh"><span class="hic">' + ic(h.icon, 18) + '</span><b>' + esc(h.name) + '</b><em>' + (r === null ? '-' : r + '%') + '</em></div><div class="heatgrid" role="img" aria-label="Last 12 weeks for ' + esc(h.name) + '">' + cells + '</div><div class="ft"><span>Streak ' + s.current + '</span><span>Best ' + s.best + '</span></div></a>';
    }).join('');
    return '<div class="head"><div><div class="eyebrow">Progress</div><h1 class="h-title">Overview</h1></div></div><div class="stack">' +
      '<div class="ovtiles"><div class="card tint"><div class="lab">This week</div><div class="num">' + (wr === null ? '-' : wr + '%') + '</div></div><div class="card"><div class="lab">This month</div><div class="num">' + (mr === null ? '-' : mr + '%') + '</div></div></div>' +
      '<div class="card"><div class="small" style="font-weight:600;margin-bottom:12px">Weekly completion, last 12 weeks</div><div class="chart" role="img" aria-label="Weekly completion for the last 12 weeks">' + chart + '</div></div>' +
      '<div class="seg" role="group" aria-label="Range">' + [['week', 'Week'], ['month', 'Month'], ['12w', '12 weeks']].map(function (r) { return '<button class="' + (rng === r[0] ? 'on' : '') + '" data-act="range" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<div class="card rates"><div class="small" style="font-weight:600;margin-bottom:2px">Habits, ' + rlab + '</div>' + rates + '</div>' +
      '<h2 class="disp" style="font-size:20px;margin:6px 4px 0">Last 12 weeks, habit by habit</h2><div class="heats">' + heats + '</div></div>';
  }

  /* ---------- habits list ---------- */
  function viewHabits() {
    var hs = active();
    var rows = hs.map(function (h) {
      return '<a class="hrow c' + h.color + '" href="#/habit/' + h.id + '" style="text-decoration:none;color:inherit"><span class="hic">' + ic(h.icon, 22) + '</span><span class="hname"><b>' + esc(h.name) + '</b><small>' + esc(metaLine(h)) + ' · ' + PARTS[h.part].n + '</small></span>' + ic('next', 18) + '</a>';
    }).join('');
    return '<div class="narrow"><div class="head"><div><div class="eyebrow">' + hs.length + ' active</div><h1 class="h-title">Habits</h1></div><div class="head-btns"><button class="btn sm ghost" data-go="#/ideas">' + ic('star', 18, 2) + 'Ideas</button><button class="btn sm" data-go="#/new">' + ic('plus', 18, 2.2) + 'New habit</button></div></div>' +
      (hs.length ? '<div class="card hlist" style="padding:6px 12px">' + rows + '</div>' : '<div class="card empty"><p>No habits yet.</p></div>') +
      (state.habits.some(function (h) { return h.archived; }) ? '<p class="hint" style="margin-top:14px">Archived habits are in <a href="#/settings">Settings</a>.</p>' : '') + '</div>';
  }

  /* ---------- ideas ---------- */
  function flatIdeas() {
    var out = [];
    (window.HabeetIdeas || []).forEach(function (g) { g.items.forEach(function (it) { out.push({ cat: g.cat, it: it, i: out.length }); }); });
    return out;
  }
  function hasHabit(name) {
    var n = name.toLowerCase();
    return active().some(function (h) { return h.name.toLowerCase() === n; });
  }
  function ideaMeta(it, days) {
    var g = it.kind === 'time' ? fmtDur((it.goal || 30) * 60) : it.kind === 'count' ? (it.goal || 8) + ' ' + (it.unit || 'times') : '';
    return (g ? g + ' · ' : '') + sched({ days: days });
  }
  function viewIdeas() {
    var cats = ['All'].concat((window.HabeetIdeas || []).map(function (g) { return g.cat; }));
    if (cats.indexOf(ui.ideaCat) === -1) ui.ideaCat = 'All';
    var list = flatIdeas().filter(function (x) { return ui.ideaCat === 'All' || x.cat === ui.ideaCat; });
    var rows = list.map(function (x) {
      var it = x.it, have = hasHabit(it.name), days = it.days || [0, 1, 2, 3, 4, 5, 6];
      return '<div class="hrow c' + it.color + '"><span class="hic">' + ic(it.icon, 22) + '</span><span class="hname"><b>' + esc(it.name) + '</b><small>' + esc(ideaMeta(it, days)) + ' · ' + PARTS[it.part].n + '</small></span>' +
        (have ? '<span class="addbtn added" aria-label="Already added">' + ic('check', 16, 2.4) + 'Added</span>'
          : '<button class="addbtn" data-act="idea-add" data-i="' + x.i + '" aria-label="Add ' + esc(it.name) + '">' + ic('plus', 16, 2.4) + 'Add</button>') + '</div>';
    }).join('');
    return '<div class="narrow"><div class="head"><div><div class="eyebrow">Pick a habit to start</div><h1 class="h-title">Ideas</h1></div><button class="btn sm ghost" data-go="#/new">' + ic('plus', 18, 2.2) + 'Make my own</button></div>' +
      '<div class="cats" role="group" aria-label="Category">' + cats.map(function (c) { return '<button class="' + (ui.ideaCat === c ? 'on' : '') + '" data-act="idea-cat" data-v="' + esc(c) + '" aria-pressed="' + (ui.ideaCat === c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<div class="card hlist" style="padding:6px 12px">' + rows + '</div><p class="hint" style="margin-top:12px">Tap Add and it appears on Today. You can change anything later from the habit page.</p></div>';
  }

  /* ---------- add / edit form ---------- */
  function startDraft(h) {
    var pf = !h && ui.prefill ? ui.prefill : null; ui.prefill = null;
    ui.draft = pf ? { id: null, name: pf.name, icon: pf.icon, color: pf.color, days: (pf.days || [0, 1, 2, 3, 4, 5, 6]).slice(), part: pf.part, startDay: today, kind: pf.kind || 'check', goal: pf.goal || 30, unit: pf.unit || '' }
      : h ? { id: h.id, name: h.name, icon: h.icon, color: h.color, days: h.days.slice(), part: h.part, startDay: h.startDay, kind: L.kindOf(h), goal: L.goalOn(h, today) || 30, unit: h.unit || '' }
      : { id: null, name: '', icon: 'star', color: 2, days: [0, 1, 2, 3, 4, 5, 6], part: 0, startDay: today, kind: 'check', goal: 30, unit: '' };
  }
  function viewForm(id) {
    var h = id ? byId(id) : null;
    if (id && !h) return '<div class="card empty"><h2>Habit not found</h2><button class="btn sm" data-go="#/habits">Back to habits</button></div>';
    if (!ui.draft || ui.draft.id !== (h ? h.id : null)) startDraft(h);
    var d = ui.draft;
    return '<form class="narrow stack" id="habitform" novalidate><div class="topbar"><button type="button" class="iconbtn" data-act="back" aria-label="Back">' + ic('back', 20) + '</button><span class="t">' + (h ? 'Edit habit' : 'New habit') + '</span><span style="width:42px"></span></div>' + (h ? '' : '<div class="hint" style="padding:0">Not sure what to track? <a href="#/ideas">Browse ideas</a></div>') +
      '<div class="card preview c' + d.color + '" id="pv"><span class="hic" id="pvi">' + ic(d.icon, 26) + '</span><span class="hname"><b id="pvn">' + (d.name ? esc(d.name) : 'Your habit') + '</b><small id="pvs"></small></span></div>' +
      '<div class="field"><label for="f-name">Name</label><input id="f-name" maxlength="40" autocomplete="off" placeholder="e.g. Stretch" value="' + esc(d.name) + '"></div>' +
      '<div><div class="eyebrow opt-label">Type</div><div class="seg" role="group" aria-label="Type">' + [['check', 'Check'], ['time', 'Timed'], ['count', 'Count']].map(function (t) {
        return '<button type="button" data-act="f-kind" data-v="' + t[0] + '" class="' + (d.kind === t[0] ? 'on' : '') + '" aria-pressed="' + (d.kind === t[0]) + '"' + (h && d.kind !== t[0] ? ' disabled' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>' +
      '<p class="hint kindnote">' + (d.kind === 'check' ? 'A simple yes or no each day.' : d.kind === 'time' ? 'Finish with a tick, or start a timer and it completes at your goal.' : 'Add as you go. It completes when you reach your goal.') + (h ? ' The type cannot be changed after the habit is made.' : '') + '</p></div>' +
      (d.kind === 'check' ? '' : '<div class="goalrow"><div class="field"><label for="f-goal">' + (d.kind === 'time' ? 'Goal, minutes a day' : 'Goal, per day') + '</label><input id="f-goal" type="number" inputmode="numeric" min="1" max="' + MAX_GOAL[d.kind] + '" step="1" value="' + esc(d.goal) + '"></div>' +
        (d.kind === 'count' ? '<div class="field"><label for="f-unit">Counting (optional)</label><input id="f-unit" maxlength="12" autocomplete="off" placeholder="e.g. cups" value="' + esc(d.unit) + '"></div>' : '') + '</div>' +
        (h ? '<p class="hint" style="padding:0;margin-top:-4px">A new goal starts today. Past days keep the goal they had.</p>' : '')) +
      '<div><div class="eyebrow opt-label">Icon</div><div class="icons" role="group" aria-label="Icon">' + I.CHOICES.map(function (n) { return '<button type="button" data-act="f-icon" data-v="' + n + '" class="' + (d.icon === n ? 'on' : '') + '" aria-label="' + n + '" aria-pressed="' + (d.icon === n) + '">' + ic(n, 22) + '</button>'; }).join('') + '</div></div>' +
      '<div><div class="eyebrow opt-label">Colour</div><div class="colors" role="group" aria-label="Colour">' + [0, 1, 2, 3, 4, 5, 6].map(function (c) { return '<button type="button" class="c' + c + ' ' + (d.color === c ? 'on' : '') + '" data-act="f-color" data-v="' + c + '" aria-label="Colour ' + (c + 1) + '" aria-pressed="' + (d.color === c) + '">' + ic('check', 18, 2.6) + '</button>'; }).join('') + '</div></div>' +
      '<div><div class="eyebrow opt-label">Repeat on</div><div class="chips" role="group" aria-label="Repeat on">' + dayLabels().map(function (x) { return '<button type="button" data-act="f-day" data-v="' + x + '" class="' + (d.days.indexOf(x) !== -1 ? 'on' : '') + '" aria-label="' + DOW[x] + '" aria-pressed="' + (d.days.indexOf(x) !== -1) + '">' + DOW3[x].charAt(0) + '</button>'; }).join('') + '</div>' +
      '<div class="quick"><button type="button" data-act="f-preset" data-v="all">Every day</button><button type="button" data-act="f-preset" data-v="week">Weekdays</button><button type="button" data-act="f-preset" data-v="end">Weekends</button></div></div>' +
      '<div><div class="eyebrow opt-label">Time of day</div><div class="seg" role="group" aria-label="Time of day">' + PARTS.map(function (p, i) { return '<button type="button" data-act="f-part" data-v="' + i + '" class="' + (d.part === i ? 'on' : '') + '" aria-pressed="' + (d.part === i) + '">' + p.n + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label for="f-start">Tracking since</label><input id="f-start" type="date" max="' + today + '" value="' + d.startDay + '"></div>' +
      '<div class="form-actions"><button type="submit" class="btn">' + (h ? 'Save changes' : 'Add habit') + '</button>' +
      (h ? '<button type="button" class="btn danger" data-act="delete" data-id="' + h.id + '">' + ic('trash', 16) + 'Delete permanently</button>' : '') + '</div></form>';
  }
  function updatePreview() {
    var d = ui.draft; if (!d) return;
    var pv = $('#pv'); if (!pv) return;
    pv.className = 'card preview c' + d.color;
    $('#pvi').innerHTML = ic(d.icon, 26);
    $('#pvn').textContent = d.name.trim() || 'Your habit';
    var gl = d.kind === 'time' ? Number(d.goal) > 0 ? fmtDur(Number(d.goal) * 60) + ' · ' : '' : d.kind === 'count' ? Number(d.goal) > 0 ? Number(d.goal) + ' ' + (d.unit.trim() || 'times') + ' · ' : '' : '';
    $('#pvs').textContent = gl + sched({ days: d.days.slice().sort() }) + ' · ' + PARTS[d.part].n;
  }
  function saveForm() {
    var d = ui.draft, name = d.name.replace(/\s+/g, ' ').trim();
    if (!name) { toast('Give your habit a name.'); $('#f-name').focus(); return; }
    if (!d.days.length) { toast('Pick at least one day.'); return; }
    var start = L.isKey(d.startDay) && d.startDay <= today ? d.startDay : today;
    var days = d.days.slice().sort(), goal = Math.floor(Number(d.goal)), unit = d.unit.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (d.kind !== 'check' && !(goal >= 1 && goal <= MAX_GOAL[d.kind])) { toast('Goal must be a number from 1 to ' + MAX_GOAL[d.kind] + '.'); var gf = $('#f-goal'); if (gf) gf.focus(); return; }
    if (d.id) {
      var h = byId(d.id); if (!h) return;
      h.name = name; h.icon = d.icon; h.color = d.color; h.days = days; h.part = d.part; h.startDay = start;
      if (L.kindOf(h) !== 'check') {
        if (h.goals && h.goals[0] && h.goals[0].from > start) h.goals[0].from = start; // tracking from an earlier day: the first goal covers it
        L.setGoal(h, goal, today); if (L.kindOf(h) === 'count') h.unit = unit;
      }
      touch(h);
    } else {
      state.habits.push(makeHabit({ name: name, icon: d.icon, color: d.color, days: days, part: d.part, startDay: start, kind: d.kind, goal: goal, unit: unit }));
    }
    save(); var id = d.id; ui.draft = null;
    toast(id ? 'Saved.' : 'Habit added.');
    if (id) go('#/habit/' + id); else go('#/today');
  }

  /* ---------- settings ---------- */
  function viewSettings() {
    var s = state.settings, arch = state.habits.filter(function (h) { return h.archived; });
    var lb = s.lastBackup ? 'Last backup ' + daysAgo(s.lastBackup) + ' days ago' : 'No backup yet';
    var tone = backupNeeded() ? 'notice' : 'card';
    var inst = ui.installEvt ? '<button class="li2" data-act="install"><span class="g">Install on this device<small>Opens like an app and works offline</small></span><span class="r">Install</span></button>'
      : '<div class="li2"><span class="g">Add to home screen<small>Use your browser menu, then "Add to Home screen"</small></span></div>';
    return '<div class="narrow"><div class="head"><div><div class="eyebrow">Preferences</div><h1 class="h-title">Settings</h1></div></div><div class="stack">' + storageNotice() + accountCard() +
      '<div class="' + tone + ' backup" style="padding:16px' + (tone === 'card' ? '' : ';flex-direction:column;align-items:stretch') + '"><div style="display:flex;gap:12px;align-items:center">' + ic('shield', 22) + '<div><b>' + lb + '</b><div class="small" style="opacity:.85">' + (cloudOn() ? 'Your habits are safe in your account. You can also keep a copy of your own.' : 'Your habits live only in this browser. Export a copy now and then.') + '</div></div></div>' +
      '<div class="row"><button class="btn" data-act="export">' + ic('down', 18) + 'Export</button><button class="btn ghost" data-act="import">' + ic('up', 18) + 'Import</button></div></div>' +
      '<div class="eyebrow" style="margin:6px 4px -6px">Look</div><div class="seg" role="group" aria-label="Theme">' + [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(function (t) { return '<button class="' + (s.theme === t[0] ? 'on' : '') + '" data-act="theme" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="eyebrow" style="margin:6px 4px -6px">Week starts on</div><div class="seg" role="group" aria-label="Week starts on">' + [[1, 'Monday'], [0, 'Sunday']].map(function (t) { return '<button class="' + (s.weekStart === t[0] ? 'on' : '') + '" data-act="weekstart" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="eyebrow" style="margin:6px 4px -6px">Data</div><div class="set">' +
      '<button class="li2" data-act="persist" role="switch" aria-checked="' + (ui.persisted === true) + '"><span class="g">Keep my data on this device<small>Asks the browser not to clear it. Safari may still clear unused sites after about 7 days.</small></span><span class="toggle ' + (ui.persisted === true ? 'on' : '') + '"></span></button>' + inst + '</div>' +
      '<div class="eyebrow" style="margin:6px 4px -6px">Archived habits</div><div class="set">' + (arch.length ? arch.map(function (h) {
        return '<div class="archrow c' + h.color + '"><span class="hic">' + ic(h.icon, 16) + '</span><a class="nm" href="#/habit/' + h.id + '" style="color:inherit;text-decoration:none">' + esc(h.name) + '</a><button data-act="unarchive" data-id="' + h.id + '">Restore</button><button class="del" data-act="delete" data-id="' + h.id + '">Delete</button></div>'; }).join('') : '<div class="li2 muted">Nothing archived. History is kept when you archive a habit.</div>') + '</div>' +
      '<button class="btn danger" data-act="erase">' + ic('trash', 16) + 'Erase all my habits and history</button>' +
      '<p class="hint">habeet ' + VERSION + ' · No ads. Your data is never sold or shared.</p></div></div>';
  }

  /* ---------- render ---------- */
  function render() {
    route = parseRoute();
    document.body.classList.toggle('gate', !!ui.gate);
    if (ui.gate) {
      $('#view').innerHTML = viewGate(); $('#side').innerHTML = ''; $('#tabs').innerHTML = '';
      document.title = 'Sign in · habeet';
      return;
    }
    var v;
    switch (route.name) {
      case 'overview': v = viewOverview(); break;
      case 'habits': v = viewHabits(); break;
      case 'ideas': v = viewIdeas(); break;
      case 'settings': v = viewSettings(); break;
      case 'habit': v = viewHabit(route.id); break;
      case 'new': v = viewForm(null); break;
      case 'edit': v = viewForm(route.id); break;
      default: v = viewToday();
    }
    $('#view').innerHTML = v;
    $('#side').innerHTML = sideHTML();
    $('#tabs').innerHTML = tabHTML();
    document.title = (route.name === 'today' ? 'Today' : route.name === 'habit' ? 'Habit' : route.name.charAt(0).toUpperCase() + route.name.slice(1)) + ' · habeet';
    if (route.name === 'new' || route.name === 'edit') updatePreview();
  }
  var lastRoute = '';
  function onRoute() {
    var sig = (location.hash || '#/today');
    if (sig !== lastRoute) {
      var r = parseRoute();
      if (r.name === 'habit') ui.calMonth = null;
      if (r.name !== 'new' && r.name !== 'edit') ui.draft = null;
      if (r.name === 'new') ui.draft = null;
      if (r.name === 'today') ui.viewDay = null; // opening Today always starts on today
      if (lastRoute) {
        window.scrollTo(0, 0);
        if (ui.goingBack) { ui.goingBack = false; ui.navDepth = Math.max(0, (ui.navDepth || 0) - 1); }
        else ui.navDepth = (ui.navDepth || 0) + 1;
      }
      lastRoute = sig;
    }
    render();
  }

  /* ---------- actions ---------- */
  function setEntry(id, day, v) {
    var h = byId(id); if (!h) return;
    if (day < h.startDay || day > today) return;
    var l = state.log[id] || (state.log[id] = {});
    if (v) l[day] = v; else delete l[day];
    save(); render();
  }
  function doExport() {
    var data = JSON.stringify(Object.assign({ app: 'habeet', exportedAt: new Date().toISOString() }, state), null, 2);
    var blob = new Blob([data], { type: 'application/json' }), url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'habeet-backup-' + today + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    state.settings.lastBackup = Date.now(); save(); render();
    toast('Backup saved to your downloads.');
  }
  function doImport(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      var res;
      try { res = L.sanitize(JSON.parse(String(r.result))); } catch (e) { res = { ok: false, error: 'This file could not be read as a habeet backup.' }; }
      if (!res.ok) { toast(res.error); return; }
      confirmBox({ title: 'Replace your data?', text: 'This backup has ' + res.state.habits.length + ' habit' + (res.state.habits.length === 1 ? '' : 's') + '. Everything currently on this device (' + state.habits.length + ' habit' + (state.habits.length === 1 ? '' : 's') + ') will be replaced.', ok: 'Replace with backup', danger: true }).then(function (ok) {
        if (!ok) return;
        state = res.state; save(); applyTheme(); render(); toast('Backup restored.');
      });
    };
    r.onerror = function () { toast('Could not read that file.'); };
    r.readAsText(file);
  }
  function removeHabit(id) {
    var h = byId(id); if (!h) return;
    confirmBox({ title: 'Delete "' + h.name + '"?', text: 'This removes the habit and all of its history for good. Archive it instead if you may want it back.', ok: 'Delete', danger: true }).then(function (ok) {
      if (!ok) return;
      state.habits = state.habits.filter(function (x) { return x.id !== id; }); delete state.log[id];
      state.deleted[id] = Date.now(); delete timers[id]; saveTimers();
      save(); ui.draft = null; toast('Deleted.');
      if (route.name === 'settings') render(); else go('#/habits');
    });
  }

  function onClick(e) {
    var go_ = e.target.closest('[data-go]');
    if (go_) { e.preventDefault(); go(go_.getAttribute('data-go')); return; }
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id'), v = el.getAttribute('data-v');
    switch (act) {
      case 'tick':
        if (ui.longFired) { ui.longFired = false; return; }
        var h = byId(id), day = el.getAttribute('data-day'); if (!h) return;
        if (timers[id]) { delete timers[id]; saveTimers(); }
        setEntry(id, day, L.entry(state.log, h, day) === 'd' ? '' : 'd'); break;
      case 'inc': case 'dec':
        var ch = byId(id), cd = el.getAttribute('data-day'); if (!ch || L.kindOf(ch) !== 'count') return;
        var was = L.entry(state.log, ch, cd), cur2 = L.progress(state.log, ch, cd);
        var nv = act === 'inc' ? Math.min(1000000, cur2 + 1) : Math.max(0, cur2 - 1);
        var keepY = window.scrollY; setEntry(id, cd, nv > 0 ? nv : ''); window.scrollTo(0, keepY);
        if (act === 'inc' && was !== 'd' && L.entry(state.log, ch, cd) === 'd') { toast(ch.name + ': goal reached.'); if (navigator.vibrate) try { navigator.vibrate(20); } catch (x2) { /* ignore */ } }
        break;
      case 'timer-start': startTimer(id); break;
      case 'timer-stop': stopTimer(id, false); break;
      case 'auth-mode': ui.auth.mode = v; ui.auth.err = ''; ui.auth.msg = ''; render(); break;
      case 'show-pw': var pw = $('#a-pass'); if (pw) { var show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; el.textContent = show ? 'Hide' : 'Show'; el.setAttribute('aria-pressed', String(show)); } break;
      case 'sync-now': syncNow(true); break;
      case 'signout': doSignOut(); break;
      case 'delete-account': doDeleteAccount(); break;
      case 'f-kind':
        if (ui.draft.id) break;
        ui.draft.kind = v; ui.draft.goal = v === 'time' ? 30 : v === 'count' ? 8 : ui.draft.goal; render(); break;
      case 'day': ui.viewDay = el.getAttribute('data-day'); render(); break;
      case 'week':
        var base = ui.viewDay || today, nd = L.add(base, Number(el.getAttribute('data-d')));
        ui.viewDay = nd > today ? today : nd; render(); break;
      case 'starter':
        var s = STARTERS[Number(el.getAttribute('data-i'))];
        state.habits.push(makeHabit(s));
        save(); render(); break;
      case 'back': if (ui.navDepth > 0) { ui.goingBack = true; history.back(); } else go('#/habits'); break;
      case 'cal': var hh = byId(route.id); if (hh) setEntry(hh.id, el.getAttribute('data-day'), L.nextState(L.entry(state.log, hh, el.getAttribute('data-day')))); break;
      case 'month': ui.calMonth = L.monthStartOf(L.add(ui.calMonth || L.monthStartOf(today), Number(el.getAttribute('data-d')) > 0 ? 32 : -1)); render(); break;
      case 'skiptoday': var sh = byId(id); if (sh) setEntry(id, today, L.entry(state.log, sh, today) === 's' ? '' : 's'); break;
      case 'archive': var ah = byId(id); if (ah) { ah.archived = true; touch(ah); save(); toast('Archived. Find it in Settings.'); go('#/habits'); } break;
      case 'unarchive': var uh = byId(id); if (uh) { uh.archived = false; touch(uh); save(); render(); toast('Restored.'); } break;
      case 'delete': removeHabit(id); break;
      case 'idea-cat': ui.ideaCat = v; render(); break;
      case 'idea-add':
        var x = flatIdeas()[Number(el.getAttribute('data-i'))]; if (!x || hasHabit(x.it.name)) break;
        state.habits.push(makeHabit(x.it));
        save(); var keep = window.scrollY; render(); window.scrollTo(0, keep); toast('Added. Find it on Today.'); break;
      case 'range': ui.ovRange = el.getAttribute('data-r'); render(); break;
      case 'export': doExport(); break;
      case 'import': $('#file').click(); break;
      case 'theme': state.settings.theme = v; save(); applyTheme(); render(); break;
      case 'weekstart': state.settings.weekStart = Number(v); save(); render(); break;
      case 'persist':
        if (!navigator.storage || !navigator.storage.persist) { toast('This browser does not support this setting.'); break; }
        navigator.storage.persist().then(function (ok) { ui.persisted = ok; render(); toast(ok ? 'Done. The browser will try to keep your data.' : 'The browser declined. Exporting a backup is the safe route.'); });
        break;
      case 'install':
        if (ui.installEvt) { ui.installEvt.prompt(); ui.installEvt = null; render(); } break;
      case 'erase':
        confirmBox({ title: 'Erase everything?', text: 'All habits and history will be deleted from this device and from your account. Export a backup first if you might want them.', ok: 'Erase all data', danger: true }).then(function (ok) {
          if (!ok) return;
          state = L.defaults(); ui.draft = null; ui.viewDay = null; save(); applyTheme(); go('#/today'); toast('All data erased.');
        }); break;
      case 'f-icon': ui.draft.icon = v; setOn(el, '.icons'); updatePreview(); break;
      case 'f-color': ui.draft.color = Number(v); setOn(el, '.colors'); updatePreview(); break;
      case 'f-part': ui.draft.part = Number(v); setOn(el, '.seg'); updatePreview(); break;
      case 'f-day':
        var dn = Number(v), i = ui.draft.days.indexOf(dn);
        if (i === -1) ui.draft.days.push(dn); else ui.draft.days.splice(i, 1);
        el.classList.toggle('on', i === -1); el.setAttribute('aria-pressed', String(i === -1)); updatePreview(); break;
      case 'f-preset':
        ui.draft.days = v === 'all' ? [0, 1, 2, 3, 4, 5, 6] : v === 'week' ? [1, 2, 3, 4, 5] : [0, 6];
        document.querySelectorAll('[data-act="f-day"]').forEach(function (b) { var on = ui.draft.days.indexOf(Number(b.getAttribute('data-v'))) !== -1; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        updatePreview(); break;
    }
  }
  function setOn(el, groupSel) {
    var g = el.closest(groupSel);
    g.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
    el.classList.add('on'); el.setAttribute('aria-pressed', 'true');
  }

  /* press and hold on a tick circle skips that day */
  function pressStart(e) {
    var el = e.target.closest('.chk'); if (!el) return;
    clearTimeout(ui.pressTimer); ui.longFired = false;
    ui.pressTimer = setTimeout(function () {
      var h = byId(el.getAttribute('data-id')), day = el.getAttribute('data-day'); if (!h) return;
      ui.longFired = true;
      var cur = L.entry(state.log, h, day);
      setEntry(h.id, day, cur === 's' ? '' : 's');
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (x) { /* ignore */ }
      setTimeout(function () { ui.longFired = false; }, 400);
    }, 550);
  }
  function pressEnd() { clearTimeout(ui.pressTimer); }

  /* ---------- accounts and sync ---------- */
  var MKEY = 'habeet:sync', meta = { uid: null, rev: null, dirty: false };
  var sy = { status: 'idle', running: false, timer: null };
  function loadMeta() {
    try { var m = JSON.parse(localStorage.getItem(MKEY) || 'null'); if (m && typeof m === 'object') return { uid: m.uid || null, rev: typeof m.rev === 'number' ? m.rev : null, dirty: m.dirty === true }; } catch (e) { /* ignore */ }
    return { uid: null, rev: null, dirty: false };
  }
  function saveMeta() { try { localStorage.setItem(MKEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } }
  function cloudOn() { return !!(C && C.configured() && C.session() && !ui.gate); }

  /* Decide whether data already on this device belongs to the account that just signed in. */
  function claimLocal(uid) {
    if (meta.uid && meta.uid !== uid) {
      state = L.defaults(); meta = { uid: uid, rev: null, dirty: false };
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      timers = {}; saveTimers(); saveLocal();
    } else if (!meta.uid) {
      meta = { uid: uid, rev: null, dirty: state.habits.length > 0 || Object.keys(state.deleted).length > 0 };
    }
    saveMeta();
  }
  function boot() {
    if (!C || !C.configured()) { ui.gate = 'setup'; return; }
    var hr = C.fromHash(location.hash);
    if (hr) {
      try { history.replaceState(null, '', location.pathname + location.search + '#/today'); } catch (e) { /* ignore */ }
      if (hr.error) ui.auth.err = hr.error;
      else if (hr.type === 'recovery') { ui.gate = 'auth'; ui.auth.mode = 'recover'; return; }
    } else C.restore();
    if (C.session()) { ui.gate = null; claimLocal(C.session().uid); }
    else ui.gate = 'auth';
  }
  function toAuth(msg) { ui.gate = 'auth'; ui.auth.mode = 'in'; ui.auth.err = msg || ''; ui.auth.msg = ''; render(); }
  function syncLabel() {
    return { idle: 'Saved to your account', syncing: 'Syncing…', ok: 'Synced', offline: 'Offline. Saved here, will sync later.', error: 'Could not sync. Will retry.' }[sy.status] || '';
  }
  function setStatus(st) {
    sy.status = st;
    document.querySelectorAll('[data-syncline]').forEach(function (n) { n.textContent = syncLabel(); });
  }
  function scheduleSync() { clearTimeout(sy.timer); sy.timer = setTimeout(function () { syncNow(); }, 1200); }
  function adopt(remote, rev) {
    state = remote; meta.rev = rev; meta.dirty = false; saveMeta(); saveLocal(); applyTheme(); render();
  }
  function syncFail(e) {
    sy.running = false;
    if (e && e.code === 'signed_out') { toAuth('Your session expired. Sign in again.'); return; }
    setStatus(e && e.offline ? 'offline' : 'error');
  }
  /* Pull the cloud copy, merge if both sides changed, then push. */
  function syncNow(manual) {
    if (!cloudOn()) return Promise.resolve();
    if (sy.running) return sy.running;
    if (navigator.onLine === false) { setStatus('offline'); if (manual) toast('You are offline.'); return Promise.resolve(); }
    setStatus('syncing');
    var tries = 0;
    function pushState(base) {
      var snap = state.updated;
      return C.pushDoc(state, base).then(function (r) {
        if (r.conflict) return attempt();
        meta.rev = r.rev; if (state.updated === snap) meta.dirty = false; saveMeta();
        return null;
      });
    }
    function attempt() {
      if (++tries > 4) { throw new Error('Too many conflicts'); }
      return C.fetchDoc().then(function (doc) {
        if (!doc) return pushState(null);
        var res = L.sanitize(doc.data);
        if (!res.ok) { var ee = new Error(res.error); throw ee; }
        if (!meta.dirty) { if (doc.rev !== meta.rev) adopt(res.state, doc.rev); return null; }
        if (meta.rev && doc.rev === meta.rev) return pushState(doc.rev);
        state = L.merge(state, res.state); saveLocal(); render();
        return pushState(doc.rev);
      });
    }
    sy.running = attempt().then(function () {
      sy.running = false; setStatus(meta.dirty ? 'idle' : 'ok');
      if (meta.dirty) scheduleSync();
      if (manual) toast('Synced.');
    }, function (e) { syncFail(e); if (manual) toast(e && e.offline ? 'You are offline.' : 'Could not sync. Try again soon.'); });
    return sy.running;
  }
  function clearLocalAccount() {
    state = L.defaults(); meta = { uid: null, rev: null, dirty: false }; timers = {};
    try { localStorage.removeItem(KEY); localStorage.removeItem(MKEY); localStorage.removeItem(TKEY); } catch (e) { /* ignore */ }
    ui.draft = null; ui.viewDay = null; ui.gate = 'auth'; ui.auth = { mode: 'in', err: '', msg: '', busy: false, email: '' };
    applyTheme();
  }
  function doSignOut() {
    confirmBox({ title: 'Sign out?', text: 'Your habits stay safe in your account. They are removed from this device until you sign in again.', ok: 'Sign out' }).then(function (ok) {
      if (!ok) return;
      var finish = function () { C.signOut().then(function () { clearLocalAccount(); go('#/today'); render(); }); };
      if (!meta.dirty) { finish(); return; }
      toast('Saving your latest changes first…');
      syncNow().then(function () {
        if (!meta.dirty) { finish(); return; }
        confirmBox({ title: 'Some changes are not synced', text: 'You seem to be offline, so your latest changes are only on this device. Signing out now will lose them.', ok: 'Sign out anyway', danger: true }).then(function (ok2) { if (ok2) finish(); });
      });
    });
  }
  function doDeleteAccount() {
    confirmBox({ title: 'Delete your account?', text: 'This permanently deletes your account, all your habits and your history. It cannot be undone. Export a backup first if you might want them.', ok: 'Delete my account', danger: true }).then(function (ok) {
      if (!ok) return;
      C.deleteAccount().then(function () { clearLocalAccount(); go('#/today'); render(); toast('Your account was deleted.'); },
        function (e) { toast(e && e.offline ? 'You are offline. Try again when connected.' : 'Could not delete the account. Try again.'); });
    });
  }
  function accountCard() {
    if (!cloudOn()) return '';
    return '<div class="card acct"><div class="acct-top"><span class="hic" style="background:var(--soft)">' + ic('shield', 20) + '</span><div><b>' + esc(C.session().email || 'Your account') + '</b><div class="small muted" data-syncline>' + syncLabel() + '</div></div></div>' +
      '<div class="row"><button class="btn ghost" data-act="sync-now">Sync now</button><button class="btn ghost" data-act="signout">Sign out</button></div>' +
      '<button class="linkbtn" data-act="delete-account">Delete my account</button></div>';
  }

  /* ---------- sign in screens ---------- */
  function viewGate() {
    var a = ui.auth, brand = '<div class="authbrand"><i>' + ic('check', 22, 2.4) + '</i>habeet</div>';
    if (ui.gate === 'setup') {
      return '<div class="authwrap">' + brand + '<div class="card"><h1 class="disp authh">Almost ready</h1><p class="muted">This copy of habeet is not connected to its sign-in service yet. The owner needs to add the project address and key to <b>js/config.js</b>.</p></div></div>';
    }
    var msg = (a.err ? '<div class="authmsg err" role="alert">' + esc(a.err) + '</div>' : '') + (a.msg ? '<div class="authmsg ok" role="status">' + esc(a.msg) + '</div>' : '');
    var local = state.habits.length && !meta.uid ? '<p class="small muted" style="margin:0 0 4px">The habits already on this device will be added to your account.</p>' : '';
    var email = '<div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" value="' + esc(a.email) + '"></div>';
    var priv = '<details class="priv"><summary>What do you store about me?</summary><p>Your email address and your habits with their history, so you can sign in on any device. Nothing is sold or shared, and there are no ads. You can delete your account from Settings at any time and everything goes with it.</p></details>';
    var body;
    if (a.mode === 'confirm') {
      body = '<h1 class="disp authh">Check your email</h1><p class="muted">We sent a link to <b>' + esc(a.email) + '</b>. Open it to confirm your account, then come back and sign in.</p><button class="btn" data-act="auth-mode" data-v="in">Back to sign in</button>';
    } else if (a.mode === 'forgot') {
      body = '<h1 class="disp authh">Reset password</h1><p class="muted">Enter your email and we will send you a link to choose a new password.</p>' + msg + '<form id="authform" class="stack" novalidate>' + email + '<button class="btn" type="submit"' + (a.busy ? ' disabled' : '') + '>' + (a.busy ? 'Sending…' : 'Send reset link') + '</button><button type="button" class="linkbtn" data-act="auth-mode" data-v="in">Back to sign in</button></form>';
    } else if (a.mode === 'recover') {
      body = '<h1 class="disp authh">Choose a new password</h1>' + msg + '<form id="authform" class="stack" novalidate><div class="field"><label for="a-pass">New password</label><div class="pwrow"><input id="a-pass" type="password" autocomplete="new-password"><button type="button" class="linkbtn" data-act="show-pw" aria-pressed="false">Show</button></div></div><p class="small muted" style="margin:0">At least 8 characters.</p><button class="btn" type="submit"' + (a.busy ? ' disabled' : '') + '>' + (a.busy ? 'Saving…' : 'Save password') + '</button></form>';
    } else {
      var up = a.mode === 'up';
      body = '<h1 class="disp authh">' + (up ? 'Create your account' : 'Welcome back') + '</h1>' +
        '<div class="seg" role="group" aria-label="Sign in or create account"><button type="button" data-act="auth-mode" data-v="in" class="' + (up ? '' : 'on') + '" aria-pressed="' + !up + '">Sign in</button><button type="button" data-act="auth-mode" data-v="up" class="' + (up ? 'on' : '') + '" aria-pressed="' + up + '">Create account</button></div>' + msg + local +
        '<form id="authform" class="stack" novalidate>' + email +
        '<div class="field"><label for="a-pass">Password</label><div class="pwrow"><input id="a-pass" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '"><button type="button" class="linkbtn" data-act="show-pw" aria-pressed="false">Show</button></div></div>' +
        (up ? '<p class="small muted" style="margin:0">At least 8 characters.</p>' : '') +
        '<button class="btn" type="submit"' + (a.busy ? ' disabled' : '') + '>' + (a.busy ? 'Please wait…' : up ? 'Create account' : 'Sign in') + '</button>' +
        (up ? '' : '<button type="button" class="linkbtn" data-act="auth-mode" data-v="forgot">Forgot your password?</button>') + '</form>';
    }
    return '<div class="authwrap">' + brand + '<div class="card authcard">' + body + '</div>' + (a.mode === 'confirm' ? '' : priv) + '</div>';
  }
  function doAuth() {
    var a = ui.auth; if (a.busy) return;
    var em = ($('#a-email') ? $('#a-email').value : a.email).trim(), pw = $('#a-pass') ? $('#a-pass').value : '';
    a.email = em; a.err = ''; a.msg = '';
    var needEmail = a.mode !== 'recover';
    if (needEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { a.err = 'Enter a valid email address.'; render(); return; }
    if (a.mode !== 'forgot' && a.mode !== 'in' && pw.length < 8) { a.err = 'Use at least 8 characters for your password.'; render(); return; }
    if (a.mode === 'in' && !pw) { a.err = 'Enter your password.'; render(); return; }
    a.busy = true; render();
    var p;
    if (a.mode === 'forgot') p = C.recover(em).then(function () { a.msg = 'If that email has an account, a reset link is on its way.'; });
    else if (a.mode === 'recover') p = C.updatePassword(pw).then(function () { finishAuth(); });
    else if (a.mode === 'up') p = C.signUp(em, pw).then(function (r) { if (r.session) finishAuth(); else a.mode = 'confirm'; });
    else p = C.signIn(em, pw).then(function () { finishAuth(); });
    p.then(function () { a.busy = false; if (ui.gate) render(); }, function (e) {
      a.busy = false; a.err = e && e.message ? e.message : 'Something went wrong. Try again.'; if (e && e.code === 'signed_out') a.mode = 'in'; render();
      var f = $('#a-email') || $('#a-pass'); if (f) f.focus();
    });
  }
  function finishAuth() {
    ui.gate = null; ui.auth = { mode: 'in', err: '', msg: '', busy: false, email: '' };
    claimLocal(C.session().uid);
    go('#/today'); render(); syncNow();
  }

  /* ---------- start ---------- */
  function init() {
    state = load();
    meta = loadMeta();
    boot();
    applyTheme();
    document.addEventListener('click', onClick);
    document.addEventListener('pointerdown', pressStart);
    ['pointerup', 'pointerleave', 'pointercancel', 'scroll'].forEach(function (t) { document.addEventListener(t, pressEnd, true); });
    document.addEventListener('contextmenu', function (e) { if (e.target.closest('.chk')) e.preventDefault(); });
    $('#file').addEventListener('change', function (e) { doImport(e.target.files[0]); e.target.value = ''; });
    document.addEventListener('input', function (e) {
      if (!ui.draft) return;
      if (e.target.id === 'f-name') { ui.draft.name = e.target.value; updatePreview(); }
      else if (e.target.id === 'f-goal') { ui.draft.goal = e.target.value; updatePreview(); }
      else if (e.target.id === 'f-unit') { ui.draft.unit = e.target.value; updatePreview(); }
    });
    document.addEventListener('change', function (e) { if (e.target.id === 'f-start') ui.draft.startDay = e.target.value; });
    document.addEventListener('submit', function (e) {
      if (e.target.id === 'habitform') { e.preventDefault(); saveForm(); }
      else if (e.target.id === 'authform') { e.preventDefault(); doAuth(); }
    });
    window.addEventListener('hashchange', function () { if ((location.hash || '#/today') !== lastRoute) onRoute(); });
    window.addEventListener('storage', function (e) {
      if (e.key === KEY && !ui.gate) { state = load(); applyTheme(); render(); }
      else if (e.key === 'habeet:session' && !e.newValue && cloudOn()) { toAuth('You were signed out in another tab.'); }
    });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ui.installEvt = e; if (route.name === 'settings') render(); });
    loadTimers(); checkTimers();
    setInterval(updateLive, 1000);
    function tick() { var k = L.localKey(); if (k !== today) { if (ui.viewDay === today) ui.viewDay = null; today = k; render(); } }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); updateLive(); } });
    setInterval(tick, 60000);
    if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* old browsers */ } }
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (p) { ui.persisted = p; if (route.name === 'settings') render(); });
    window.addEventListener('online', function () { if (cloudOn()) syncNow(); });
    window.addEventListener('offline', function () { if (cloudOn()) { setStatus('offline'); } });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && cloudOn()) syncNow(); });
    setInterval(function () { if (cloudOn()) syncNow(); }, 300000);
    onRoute();
    if (cloudOn()) syncNow();
    if (ui.loadError) toast('Your saved data could not be read. A copy was kept and you are starting fresh.');
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
  }
  init();
})();
