/* habeet logic: dates, streaks, rates and data validation.
   Pure functions with no DOM access, so they can be tested in Node.
   A day is a string "YYYY-MM-DD" in the user's local calendar. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HabeetLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 864e5;
  var KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isKey(k) {
    if (typeof k !== 'string' || !KEY_RE.test(k)) return false;
    var p = k.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function parse(k) { var p = k.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function fmt(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function add(k, n) { return fmt(parse(k) + n * DAY); }
  function dow(k) { return new Date(parse(k)).getUTCDay(); } // 0 = Sunday
  function diff(a, b) { return Math.round((parse(a) - parse(b)) / DAY); } // a - b in days
  function localKey(date) {
    date = date || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function weekStartOf(k, weekStart) { return add(k, -((dow(k) - weekStart + 7) % 7)); }
  function monthStartOf(k) { return k.slice(0, 8) + '01'; }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m is 1-12

  function scheduled(h, k) { return h.days.indexOf(dow(k)) !== -1; }

  /* Habit kinds: 'check' (yes/no), 'time' (minutes, timer or tick), 'count' (add up to a goal).
     A log value is 'd' (done), 's' (skipped) or a number: seconds for time, a count for count.
     The goal can change over time, so each habit keeps goals: [{from, goal}] and a day uses
     the last goal that started on or before it. */
  function kindOf(h) { return h.kind === 'time' || h.kind === 'count' ? h.kind : 'check'; }
  function goalOn(h, k) {
    var g = h.goals;
    if (!g || !g.length) return 0;
    var out = g[0].goal;
    for (var i = 0; i < g.length; i++) if (g[i].from <= k) out = g[i].goal;
    return out;
  }
  /* Amount needed to finish a day: seconds for time, a count for count, 0 for check. */
  function target(h, k) {
    var kd = kindOf(h);
    if (kd === 'check') return 0;
    var g = goalOn(h, k);
    return kd === 'time' ? g * 60 : g;
  }
  function rawEntry(log, h, k) { var l = log[h.id]; return l && l[k] !== undefined ? l[k] : ''; }
  /* Progress made on a day, in the same unit as target(). A tick counts as full. */
  function progress(log, h, k) {
    var v = rawEntry(log, h, k);
    if (typeof v === 'number') return v;
    return v === 'd' ? target(h, k) : 0;
  }
  function entry(log, h, k) {
    var v = rawEntry(log, h, k);
    if (v === 'd' || v === 's') return v;
    if (typeof v === 'number') {
      var t = target(h, k);
      return t > 0 && v >= t ? 'd' : '';
    }
    return '';
  }
  /* Set the goal from a day on. Keeps older days on the goal they had. */
  function setGoal(h, goal, from) {
    if (!h.goals) h.goals = [];
    var last = h.goals[h.goals.length - 1];
    if (last && last.goal === goal) return;
    if (last && last.from === from) { last.goal = goal; return; }
    if (last && last.from > from) { h.goals = h.goals.filter(function (x) { return x.from < from; }); }
    h.goals.push({ from: from, goal: goal });
  }

  /* Status of one habit on one day, given today's key t:
     done | skip | missed | pending | future | off (not scheduled) | before (not tracking yet) */
  function status(h, log, k, t) {
    if (k < h.startDay) return 'before';
    if (!scheduled(h, k)) return 'off';
    var v = entry(log, h, k);
    if (v === 'd') return 'done';
    if (v === 's') return 'skip';
    if (k > t) return 'future';
    if (k === t) return 'pending';
    return 'missed';
  }

  /* Streak rules:
     - Only scheduled days count. Unscheduled days are ignored.
     - A skipped day neither adds to the streak nor breaks it.
     - Today does not break the streak while it is still pending. */
  function streaks(h, log, t) {
    var cur = 0, best = 0, run = 0, k;
    if (h.startDay > t) return { current: 0, best: 0 };
    k = entry(log, h, t) === 'd' ? t : add(t, -1);
    for (; k >= h.startDay; k = add(k, -1)) {
      if (!scheduled(h, k)) continue;
      var v = entry(log, h, k);
      if (v === 'd') cur++;
      else if (v === 's') continue;
      else break;
    }
    for (k = h.startDay; k <= t; k = add(k, 1)) {
      if (!scheduled(h, k)) continue;
      var w = entry(log, h, k);
      if (w === 'd') { run++; if (run > best) best = run; }
      else if (w === 's') { /* neutral */ }
      else if (k !== t) run = 0;
    }
    return { current: cur, best: Math.max(best, cur) };
  }

  /* Share of scheduled days completed in [from, to]. Skipped days and a
     still-pending today are left out. Returns null when nothing counts. */
  function counts(h, log, from, to, t) {
    var done = 0, total = 0;
    var a = from < h.startDay ? h.startDay : from;
    var b = to > t ? t : to;
    for (var k = a; k <= b; k = add(k, 1)) {
      if (!scheduled(h, k)) continue;
      var v = entry(log, h, k);
      if (v === 's') continue;
      if (v === 'd') { done++; total++; }
      else if (k !== t) total++;
    }
    return { done: done, total: total };
  }
  function rate(h, log, from, to, t) {
    var c = counts(h, log, from, to, t);
    return c.total ? Math.round(100 * c.done / c.total) : null;
  }
  function overallRate(habits, log, from, to, t) {
    var done = 0, total = 0;
    habits.forEach(function (h) { var c = counts(h, log, from, to, t); done += c.done; total += c.total; });
    return total ? Math.round(100 * done / total) : null;
  }

  /* Progress for one day across habits: only habits scheduled that day, not skipped. */
  function dayProgress(habits, log, k, t) {
    var done = 0, total = 0;
    habits.forEach(function (h) {
      var s = status(h, log, k, t);
      if (s === 'done') { done++; total++; }
      else if (s === 'pending' || s === 'missed' || s === 'future') total++;
    });
    return { done: done, total: total };
  }

  /* Completion for each of the last n weeks (oldest first). */
  function weeklyRates(habits, log, t, weekStart, n) {
    var out = [], ws = weekStartOf(t, weekStart);
    for (var i = n - 1; i >= 0; i--) {
      var from = add(ws, -7 * i);
      out.push({ from: from, rate: overallRate(habits, log, from, add(from, 6), t) });
    }
    return out;
  }

  function totalDone(h, log) {
    var l = log[h.id] || {}, n = 0;
    for (var k in l) if (entry(log, h, k) === 'd') n++;
    return n;
  }

  /* Weekday (0-6) with the best completion rate, or -1 if there is no data. */
  function bestWeekday(h, log, t) {
    var done = [0, 0, 0, 0, 0, 0, 0], total = [0, 0, 0, 0, 0, 0, 0];
    for (var k = h.startDay; k <= t; k = add(k, 1)) {
      if (!scheduled(h, k)) continue;
      var v = entry(log, h, k);
      if (v === 's' || (v !== 'd' && k === t)) continue;
      var d = dow(k);
      total[d]++; if (v === 'd') done[d]++;
    }
    var best = -1, bestR = -1;
    for (var i = 0; i < 7; i++) {
      if (!total[i]) continue;
      var r = done[i] / total[i];
      if (r > bestR) { bestR = r; best = i; }
    }
    return best;
  }

  /* Next state when tapping a calendar day: none -> done -> skip -> none */
  function nextState(v) { return v === 'd' ? 's' : v === 's' ? '' : 'd'; }

  /* ---------- data validation (used on load and on import) ---------- */
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var ICON_RE = /^[a-z]{1,20}$/;

  var MAX_TIME_GOAL = 1440, MAX_COUNT_GOAL = 10000;

  function defaults() {
    return {
      version: 2, updated: 0, habits: [], log: {}, deleted: {},
      settings: { theme: 'auto', weekStart: 1, lastBackup: null, noticeDismissed: false }
    };
  }

  function cleanGoals(raw, kind, start) {
    var max = kind === 'time' ? MAX_TIME_GOAL : MAX_COUNT_GOAL, out = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (g) {
        if (!g || typeof g !== 'object' || !isKey(g.from)) return;
        var n = typeof g.goal === 'number' && isFinite(g.goal) ? Math.floor(g.goal) : 0;
        if (n < 1) return;
        out.push({ from: g.from, goal: Math.min(max, n) });
      });
      out.sort(function (x, y) { return x.from < y.from ? -1 : x.from > y.from ? 1 : 0; });
      out = out.filter(function (g, i) { return i === out.length - 1 || out[i + 1].from !== g.from; });
    }
    if (!out.length) out.push({ from: start, goal: kind === 'time' ? 30 : 8 });
    return out;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'This file is not a habeet backup.' };
    if (typeof raw.version !== 'number') return { ok: false, error: 'This file is not a habeet backup.' };
    if (raw.version > 2) return { ok: false, error: 'This backup was made by a newer version of habeet.' };
    if (!Array.isArray(raw.habits)) return { ok: false, error: 'This backup has no habits list.' };
    var out = defaults(), seen = {}, i;
    if (typeof raw.updated === 'number' && isFinite(raw.updated) && raw.updated > 0) out.updated = Math.floor(raw.updated);
    if (raw.deleted && typeof raw.deleted === 'object' && !Array.isArray(raw.deleted)) {
      var dn = 0;
      for (var did in raw.deleted) {
        if (dn >= 2000) break;
        if (Object.prototype.hasOwnProperty.call(raw.deleted, did) && ID_RE.test(did) && typeof raw.deleted[did] === 'number' && isFinite(raw.deleted[did])) { out.deleted[did] = Math.floor(raw.deleted[did]); dn++; }
      }
    }
    for (i = 0; i < raw.habits.length && out.habits.length < 200; i++) {
      var h = raw.habits[i];
      if (!h || typeof h !== 'object') continue;
      if (typeof h.id !== 'string' || !ID_RE.test(h.id) || seen[h.id]) continue;
      var name = typeof h.name === 'string' ? h.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
      if (!name) continue;
      var days = Array.isArray(h.days) ? h.days.filter(function (d, j, a) {
        return typeof d === 'number' && d % 1 === 0 && d >= 0 && d <= 6 && a.indexOf(d) === j;
      }).sort() : [];
      if (!days.length) days = [0, 1, 2, 3, 4, 5, 6];
      var color = typeof h.color === 'number' ? Math.max(0, Math.min(6, Math.floor(h.color))) : 0;
      var part = typeof h.part === 'number' ? Math.max(0, Math.min(2, Math.floor(h.part))) : 0;
      var start = isKey(h.startDay) ? h.startDay : localKey();
      var kind = h.kind === 'time' || h.kind === 'count' ? h.kind : 'check';
      seen[h.id] = true;
      var item = {
        id: h.id, name: name,
        icon: typeof h.icon === 'string' && ICON_RE.test(h.icon) ? h.icon : 'star',
        color: color, days: days, part: part, startDay: start, archived: h.archived === true,
        kind: kind, u: typeof h.u === 'number' && isFinite(h.u) ? Math.floor(h.u) : 0
      };
      if (kind !== 'check') {
        item.goals = cleanGoals(h.goals, kind, start);
        item.unit = kind === 'count' && typeof h.unit === 'string' ? h.unit.replace(/\s+/g, ' ').trim().slice(0, 12) : '';
      }
      out.habits.push(item);
    }
    if (raw.log && typeof raw.log === 'object') {
      var budget = 200000;
      out.habits.forEach(function (hh) {
        var src = raw.log[hh.id];
        if (!src || typeof src !== 'object') return;
        var dst = {}, kd = hh.kind;
        for (var k in src) {
          if (budget-- <= 0) break;
          if (!Object.prototype.hasOwnProperty.call(src, k) || !isKey(k)) continue;
          var v = src[k];
          if (v === 'd' || v === 's') dst[k] = v;
          else if (kd !== 'check' && typeof v === 'number' && isFinite(v) && v >= 1) dst[k] = Math.min(kd === 'time' ? 86400 : 1000000, Math.floor(v));
        }
        out.log[hh.id] = dst;
      });
    }
    var s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto') out.settings.theme = s.theme;
    if (s.weekStart === 0 || s.weekStart === 1) out.settings.weekStart = s.weekStart;
    if (typeof s.lastBackup === 'number' && isFinite(s.lastBackup)) out.settings.lastBackup = s.lastBackup;
    if (s.noticeDismissed === true) out.settings.noticeDismissed = true;
    return { ok: true, state: out };
  }

  /* ---------- sync merge ----------
     Used only when this device and the cloud both changed since they last agreed.
     Habits: the newer edit of each habit wins; a deleted habit stays deleted.
     Days: both sides' entries are kept. If both have one for the same day, progress takes
     the larger number, a tick beats progress, and otherwise the more recently saved side wins. */
  function merge(a, b) {
    var aNew = (a.updated || 0) >= (b.updated || 0);
    var out = defaults();
    out.updated = Math.max(a.updated || 0, b.updated || 0);
    var id;
    for (id in b.deleted) out.deleted[id] = b.deleted[id];
    for (id in a.deleted) out.deleted[id] = Math.max(a.deleted[id], out.deleted[id] || 0);
    var map = {}, order = [];
    [b.habits, a.habits].forEach(function (list) {
      list.forEach(function (h) {
        if (out.deleted[h.id]) return;
        if (!map[h.id]) { map[h.id] = h; order.push(h.id); }
        else if ((h.u || 0) >= (map[h.id].u || 0)) map[h.id] = h;
      });
    });
    // keep this device's order first, then habits only the cloud has
    var ordered = [];
    a.habits.forEach(function (h) { if (map[h.id] && ordered.indexOf(h.id) === -1) ordered.push(h.id); });
    order.forEach(function (hid) { if (ordered.indexOf(hid) === -1) ordered.push(hid); });
    out.habits = ordered.map(function (hid) { return JSON.parse(JSON.stringify(map[hid])); });
    out.habits.forEach(function (h) {
      var la = (a.log && a.log[h.id]) || {}, lb = (b.log && b.log[h.id]) || {}, dst = {}, k;
      for (k in lb) dst[k] = lb[k];
      for (k in la) {
        if (!(k in dst)) { dst[k] = la[k]; continue; }
        var x = la[k], y = dst[k];
        if (x === y) continue;
        if (typeof x === 'number' && typeof y === 'number') dst[k] = Math.max(x, y);
        else if (x === 'd' || y === 'd') dst[k] = 'd';
        else dst[k] = aNew ? x : y;
      }
      out.log[h.id] = dst;
    });
    out.settings = JSON.parse(JSON.stringify(aNew ? a.settings : b.settings));
    return out;
  }

  return {
    isKey: isKey, add: add, diff: diff, dow: dow, localKey: localKey, parse: parse,
    weekStartOf: weekStartOf, monthStartOf: monthStartOf, daysInMonth: daysInMonth,
    scheduled: scheduled, entry: entry, status: status, streaks: streaks, counts: counts,
    rate: rate, overallRate: overallRate, dayProgress: dayProgress, weeklyRates: weeklyRates,
    totalDone: totalDone, bestWeekday: bestWeekday, nextState: nextState,
    defaults: defaults, sanitize: sanitize, merge: merge,
    kindOf: kindOf, goalOn: goalOn, target: target, rawEntry: rawEntry, progress: progress, setGoal: setGoal
  };
});
