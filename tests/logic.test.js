// Run with: node tests/logic.test.js
const L = require('../js/logic.js');
let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
}

// dates
eq('add across month', L.add('2026-10-31', 1), '2026-11-01');
eq('add across year', L.add('2026-12-31', 1), '2027-01-01');
eq('leap day', L.add('2028-02-28', 1), '2028-02-29');
eq('dow friday', L.dow('2026-10-23'), 5);
eq('diff', L.diff('2026-10-23', '2026-10-20'), 3);
eq('weekStart monday', L.weekStartOf('2026-10-23', 1), '2026-10-19');
eq('weekStart sunday', L.weekStartOf('2026-10-23', 0), '2026-10-18');
eq('weekStart on sunday itself, monday start', L.weekStartOf('2026-10-25', 1), '2026-10-19');
eq('isKey bad', L.isKey('2026-02-30'), false);
eq('isKey ok', L.isKey('2026-02-28'), true);
eq('daysInMonth feb 2028', L.daysInMonth(2028, 2), 29);

const T = '2026-10-23'; // Friday
const all = [0, 1, 2, 3, 4, 5, 6];
function hab(over) { return Object.assign({ id: 'h1', name: 'x', days: all, startDay: '2026-10-01', part: 0, color: 0, icon: 'star' }, over); }
function logOf(h, map) { return { [h.id]: map }; }

// streak: three done days up to yesterday, today pending -> 3
let h = hab();
let log = logOf(h, { '2026-10-20': 'd', '2026-10-21': 'd', '2026-10-22': 'd' });
eq('pending today keeps streak', L.streaks(h, log, T), { current: 3, best: 3 });
log = logOf(h, { '2026-10-20': 'd', '2026-10-21': 'd', '2026-10-22': 'd', '2026-10-23': 'd' });
eq('today done adds one', L.streaks(h, log, T).current, 4);
log = logOf(h, { '2026-10-20': 'd', '2026-10-21': 'd', '2026-10-23': 'd' });
eq('missed yesterday breaks, today done = 1', L.streaks(h, log, T).current, 1);
log = logOf(h, { '2026-10-20': 'd', '2026-10-21': 'd' });
eq('missed yesterday, today pending = 0', L.streaks(h, log, T).current, 0);
eq('best survives a break', L.streaks(h, log, T).best, 2);

// skip is neutral
log = logOf(h, { '2026-10-19': 'd', '2026-10-20': 'd', '2026-10-21': 's', '2026-10-22': 'd', '2026-10-23': 'd' });
eq('skip does not break or count', L.streaks(h, log, T), { current: 4, best: 4 });
log = logOf(h, { '2026-10-22': 's' });
eq('only skip = 0', L.streaks(h, log, T).current, 0);

// unscheduled days ignored: Mon-Fri habit, weekend gap
h = hab({ days: [1, 2, 3, 4, 5], startDay: '2026-10-01' });
log = logOf(h, { '2026-10-15': 'd', '2026-10-16': 'd', '2026-10-19': 'd', '2026-10-20': 'd', '2026-10-21': 'd', '2026-10-22': 'd' });
eq('weekend does not break weekday habit', L.streaks(h, log, T).current, 6);
// today (Fri) pending, still fine
eq('weekday habit today pending', L.streaks(h, log, T).current, 6);
// Saturday as today for a weekday habit
eq('today unscheduled keeps streak', L.streaks(h, logOf(h, { '2026-10-23': 'd', '2026-10-22': 'd' }), '2026-10-24').current, 2);

// start day bounds the walk
h = hab({ startDay: '2026-10-22' });
log = logOf(h, { '2026-10-20': 'd', '2026-10-21': 'd', '2026-10-22': 'd' });
eq('days before start ignored', L.streaks(h, log, T).current, 1);
eq('future start gives zero', L.streaks(hab({ startDay: '2026-11-01' }), {}, T), { current: 0, best: 0 });

// best streak is longer earlier run
h = hab({ startDay: '2026-09-01' });
const m = {};
for (let i = 0; i < 10; i++) m[L.add('2026-09-05', i)] = 'd'; // 10 in a row, then gap
m['2026-10-22'] = 'd';
eq('best from older run', L.streaks(h, logOf(h, m), T), { current: 1, best: 10 });

// status
h = hab({ days: [1, 2, 3, 4, 5] });
eq('status done', L.status(h, logOf(h, { '2026-10-22': 'd' }), '2026-10-22', T), 'done');
eq('status skip', L.status(h, logOf(h, { '2026-10-22': 's' }), '2026-10-22', T), 'skip');
eq('status missed', L.status(h, {}, '2026-10-22', T), 'missed');
eq('status pending', L.status(h, {}, T, T), 'pending');
eq('status future', L.status(h, {}, '2026-10-26', T), 'future');
eq('status off', L.status(h, {}, '2026-10-24', T), 'off');
eq('status before', L.status(h, {}, '2026-09-30', T), 'before');

// rates
h = hab({ startDay: '2026-10-19' });
log = logOf(h, { '2026-10-19': 'd', '2026-10-20': 'd', '2026-10-21': 'd', '2026-10-22': 's' });
// Mon..Thu: 3 done, 1 skipped (excluded), today Fri pending excluded -> 3/3
eq('rate with skip and pending today', L.rate(h, log, '2026-10-19', '2026-10-25', T), 100);
log = logOf(h, { '2026-10-19': 'd', '2026-10-21': 'd' });
// Mon d, Tue missed, Wed d, Thu missed, Fri pending excluded -> 2/4
eq('rate with misses', L.rate(h, log, '2026-10-19', '2026-10-25', T), 50);
log = logOf(h, { '2026-10-19': 'd', '2026-10-21': 'd', '2026-10-23': 'd' });
eq('today done counts', L.rate(h, log, '2026-10-19', '2026-10-25', T), 60); // 3/5
eq('no data gives null', L.rate(hab({ startDay: '2026-10-23' }), {}, '2026-10-19', '2026-10-25', T), null);

// overall + day progress
const a = hab({ id: 'a' }), b = hab({ id: 'b', days: [1] }); // b is Monday only
const lg = { a: { '2026-10-23': 'd' }, b: {} };
eq('day progress friday', L.dayProgress([a, b], lg, T, T), { done: 1, total: 1 });
eq('day progress monday', L.dayProgress([a, b], lg, '2026-10-19', T), { done: 0, total: 2 });

// weekly rates length and order
const wr = L.weeklyRates([a], { a: {} }, T, 1, 12);
eq('weekly rates length', wr.length, 12);
eq('weekly rates last week starts monday', wr[11].from, '2026-10-19');

// best weekday
h = hab({ startDay: '2026-10-05' });
log = logOf(h, { '2026-10-05': 'd', '2026-10-12': 'd', '2026-10-19': 'd', '2026-10-06': 'd' });
eq('best weekday is monday', L.bestWeekday(h, log, T), 1);

eq('nextState cycle', [L.nextState(''), L.nextState('d'), L.nextState('s')], ['d', 's', '']);

// sanitize
eq('rejects junk', L.sanitize('x').ok, false);
eq('rejects no version', L.sanitize({ habits: [] }).ok, false);
eq('rejects newer version', L.sanitize({ version: 3, habits: [] }).ok, false);
eq('accepts v1 backups', L.sanitize({ version: 1, habits: [] }).ok, true);
const dirty = {
  version: 1,
  habits: [
    { id: 'ok1', name: '  Read   books  ', icon: 'book', color: 99, days: [1, 1, 9, 'x', 3], part: 7, startDay: '2026-10-01' },
    { id: 'ok1', name: 'dup', days: [1] },
    { id: 'bad id!', name: 'x' },
    { id: 'noname', name: '   ' },
    { id: 'z', name: '<img src=x onerror=alert(1)>', icon: 'BAD ICON', days: [], startDay: 'nope' }
  ],
  log: { ok1: { '2026-10-02': 'd', '2026-10-03': 'x', 'junk': 'd', '2026-02-31': 'd' }, ghost: { '2026-10-02': 'd' } },
  settings: { theme: 'neon', weekStart: 5, lastBackup: 'x' }
};
const r = L.sanitize(dirty);
eq('sanitize ok', r.ok, true);
eq('keeps two valid habits', r.state.habits.map(x => x.id), ['ok1', 'z']);
eq('name cleaned', r.state.habits[0].name, 'Read books');
eq('colour clamped', r.state.habits[0].color, 6);
eq('days cleaned', r.state.habits[0].days, [1, 3]);
eq('part clamped', r.state.habits[0].part, 2);
eq('empty days become every day', r.state.habits[1].days, [0, 1, 2, 3, 4, 5, 6]);
eq('bad icon replaced', r.state.habits[1].icon, 'star');
eq('log filtered', r.state.log.ok1, { '2026-10-02': 'd' });
eq('ghost log dropped', r.state.log.ghost, undefined);
eq('settings defaulted', r.state.settings, { theme: 'auto', weekStart: 1, lastBackup: null, noticeDismissed: false });
eq('start day fallback is valid', L.isKey(r.state.habits[1].startDay), true);

// ---------- v2: timed and counted habits ----------
const cnt = hab({ id: 'c1', kind: 'count', goals: [{ from: '2026-10-01', goal: 6 }], unit: 'cups' });
const tim = hab({ id: 't1', kind: 'time', goals: [{ from: '2026-10-01', goal: 30 }] });
eq('check kind default', L.kindOf(hab()), 'check');
eq('count target', L.target(cnt, T), 6);
eq('time target is seconds', L.target(tim, T), 1800);
eq('check target zero', L.target(hab(), T), 0);
let kl = { c1: { '2026-10-23': 3 }, t1: { '2026-10-23': 600 } };
eq('partial count is not done', L.entry(kl, cnt, T), '');
eq('partial count progress', L.progress(kl, cnt, T), 3);
kl.c1[T] = 6;
eq('count at goal is done', L.entry(kl, cnt, T), 'd');
kl.c1[T] = 9;
eq('count over goal is done', L.entry(kl, cnt, T), 'd');
eq('partial time not done', L.entry(kl, tim, T), '');
kl.t1[T] = 1800;
eq('time at goal is done', L.entry(kl, tim, T), 'd');
eq('tick on time habit counts as full', L.progress({ t1: { [T]: 'd' } }, tim, T), 1800);
eq('status uses derived done', L.status(cnt, kl, T, T), 'done');
eq('partial today is pending', L.status(cnt, { c1: { [T]: 2 } }, T, T), 'pending');
eq('partial yesterday is missed', L.status(cnt, { c1: { '2026-10-22': 2 } }, '2026-10-22', T), 'missed');
kl = { c1: { '2026-10-21': 6, '2026-10-22': 7, '2026-10-23': 2 } };
eq('streak counts only reached goals', L.streaks(cnt, kl, T).current, 2);
eq('totalDone counts derived', L.totalDone(cnt, kl), 2);

// goal changes apply from a date and keep history honest
const g = hab({ id: 'g1', kind: 'count', goals: [{ from: '2026-10-01', goal: 6 }] });
L.setGoal(g, 8, '2026-10-23');
eq('old day keeps old goal', L.goalOn(g, '2026-10-22'), 6);
eq('new day uses new goal', L.goalOn(g, '2026-10-23'), 8);
eq('old day still done at old goal', L.entry({ g1: { '2026-10-22': 6 } }, g, '2026-10-22'), 'd');
eq('new day not done at old amount', L.entry({ g1: { '2026-10-23': 6 } }, g, '2026-10-23'), '');
L.setGoal(g, 10, '2026-10-23');
eq('same day edit replaces', g.goals, [{ from: '2026-10-01', goal: 6 }, { from: '2026-10-23', goal: 10 }]);
L.setGoal(g, 10, '2026-10-24');
eq('same goal adds nothing', g.goals.length, 2);

// sanitize keeps v2 fields and drops bad ones
const v2 = L.sanitize({ version: 2, updated: 99, habits: [
  { id: 'a', name: 'Water', kind: 'count', goals: [{ from: '2026-10-01', goal: 8.9 }, { from: 'bad', goal: 3 }, { from: '2026-10-05', goal: -2 }], unit: '  glasses of water too long ', startDay: '2026-10-01' },
  { id: 'b', name: 'Read', kind: 'time', startDay: '2026-10-01' },
  { id: 'c', name: 'Plain', kind: 'weird' }
], log: { a: { '2026-10-02': 5, '2026-10-03': 0, '2026-10-04': 'd', '2026-10-05': 1.5 }, c: { '2026-10-02': 7 } }, deleted: { x1: 5, 'bad id!': 3 } });
eq('v2 ok', v2.ok, true);
eq('goal floored and filtered', v2.state.habits[0].goals, [{ from: '2026-10-01', goal: 8 }]);
eq('unit trimmed to 12', v2.state.habits[0].unit, 'glasses of w');
eq('time habit gets default goal', v2.state.habits[1].goals[0].goal, 30);
eq('unknown kind becomes check', v2.state.habits[2].kind, 'check');
eq('check habit has no goals', v2.state.habits[2].goals, undefined);
eq('numbers kept for counted, junk dropped', v2.state.log.a, { '2026-10-02': 5, '2026-10-04': 'd', '2026-10-05': 1 });
eq('numbers dropped for check', v2.state.log.c, {});
eq('deleted ids kept, bad dropped', v2.state.deleted, { x1: 5 });
eq('updated kept', v2.state.updated, 99);
eq('v1 habit becomes check', L.sanitize({ version: 1, habits: [{ id: 'q', name: 'Q' }] }).state.habits[0].kind, 'check');
eq('defaults are v2', L.defaults().version, 2);
const round = L.sanitize(JSON.parse(JSON.stringify(v2.state)));
eq('sanitize is stable', round.state, v2.state);

// ---------- merge ----------
function doc(updated, habits, log, deleted) { const d = L.defaults(); d.updated = updated; d.habits = habits; d.log = log || {}; d.deleted = deleted || {}; return d; }
const hA = hab({ id: 'a', name: 'Alpha', u: 10, kind: 'check' }), hB = hab({ id: 'b', name: 'Beta', u: 10, kind: 'check' });
let mg = L.merge(doc(5, [hA], { a: { '2026-10-20': 'd' } }), doc(9, [hA, hB], { a: { '2026-10-21': 'd' }, b: {} }));
eq('merge unions habits', mg.habits.map(x => x.id).sort(), ['a', 'b']);
eq('merge unions days', Object.keys(mg.log.a).sort(), ['2026-10-20', '2026-10-21']);
eq('merge keeps this device order first', L.merge(doc(5, [hB, hA]), doc(9, [hA, hB])).habits.map(x => x.id), ['b', 'a']);
eq('newer habit edit wins', L.merge(doc(5, [Object.assign({}, hA, { name: 'New', u: 20 })]), doc(9, [hA])).habits[0].name, 'New');
eq('older habit edit loses', L.merge(doc(5, [Object.assign({}, hA, { name: 'Old', u: 5 })]), doc(9, [hA])).habits[0].name, 'Alpha');
eq('deleted on one side stays deleted', L.merge(doc(5, [hA], {}, {}), doc(9, [], {}, { a: 7 })).habits.length, 0);
eq('deleted survives in result', L.merge(doc(5, [], {}, { a: 7 }), doc(9, [hA])).deleted, { a: 7 });
mg = L.merge(doc(5, [cnt], { c1: { '2026-10-23': 2, '2026-10-22': 'd' } }), doc(9, [cnt], { c1: { '2026-10-23': 4, '2026-10-22': 's' } }));
eq('merge takes larger progress', mg.log.c1['2026-10-23'], 4);
eq('merge: tick beats skip', mg.log.c1['2026-10-22'], 'd');
mg = L.merge(doc(9, [hA], { a: { '2026-10-20': 's' } }), doc(5, [hA], { a: { '2026-10-20': 'd' } }));
eq('merge: tick beats skip either way', mg.log.a['2026-10-20'], 'd');
eq('merge settings from newer side', L.merge(Object.assign(doc(9, []), { settings: { theme: 'dark', weekStart: 0, lastBackup: null, noticeDismissed: false } }), doc(5, [])).settings.theme, 'dark');
eq('merge result is valid', L.sanitize(JSON.parse(JSON.stringify(mg))).ok, true);

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `All ${pass} checks passed`);
process.exit(fail ? 1 : 0);
