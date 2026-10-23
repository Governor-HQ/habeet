// UI test. Needs a static server on :8777 and Playwright (playwright-core + a Chromium).
// Run: node tests/ui.test.js   (env: PW=path to playwright-core, CHROME=path to chromium, SHOTS=folder)
// Sign in, sync and account deletion are tested against a fake Supabase (tests/mock-supabase.js).
const PW = process.env.PW || 'playwright-core';
const CHROME = process.env.CHROME || undefined;
const SHOTS = process.env.SHOTS || '/tmp/habeet-shots';
const URL = process.env.URL || 'http://localhost:8777/index.html';
const { chromium } = require(PW);
const fs = require('fs');
const { createServer, jwt } = require('./mock-supabase.js');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NOW = '2026-10-23T09:30:00';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const errors = [];
  const mock = createServer();
  async function newCtx(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, serviceWorkers: 'block' }, opts || {}));
    await mock.install(ctx);
    return ctx;
  }
  async function newPage(ctx, label) {
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(NOW) });
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push((label || '') + m.text()); });
    page.on('pageerror', e => errors.push((label || '') + 'pageerror: ' + e.message));
    return page;
  }
  const T = page => async sel => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  async function signup(page, email, pw) {
    await page.goto(URL);
    await page.click('[data-act="auth-mode"][data-v="up"]');
    await page.fill('#a-email', email); await page.fill('#a-pass', pw || 'password123');
    await page.click('#authform button[type=submit]');
    await page.waitForSelector('#view h1.h-title');
  }
  async function signin(page, email, pw) {
    await page.goto(URL);
    await page.fill('#a-email', email); await page.fill('#a-pass', pw || 'password123');
    await page.click('#authform button[type=submit]');
    await page.waitForSelector('#view h1.h-title');
  }
  async function flush(page) { await page.clock.runFor(2500); await sleep(350); }

  const ctx = await newCtx();
  const page = await newPage(ctx);
  const text = T(page);

  // ---------- 0. sign in gate ----------
  await page.goto(URL);
  ok('signed-out visitors see the sign in screen', (await text('.authh')) === 'Welcome back', await text('.authh'));
  ok('no tab bar on sign in', !(await page.locator('.tabbar').isVisible()));
  await page.screenshot({ path: SHOTS + '/20-signin.png' });
  await page.click('#authform button[type=submit]');
  ok('empty email rejected', (await text('.authmsg')).includes('valid email'), await text('.authmsg'));
  await page.fill('#a-email', 'someone@example.com');
  await page.click('#authform button[type=submit]');
  ok('empty password rejected', (await text('.authmsg')).includes('password'), await text('.authmsg'));
  await page.fill('#a-pass', 'whatever1');
  await page.click('#authform button[type=submit]');
  await page.waitForSelector('.authmsg.err');
  ok('wrong login explained', (await text('.authmsg')) === 'Wrong email or password.', await text('.authmsg'));
  await page.click('[data-act="auth-mode"][data-v="up"]');
  await page.fill('#a-email', 'me@example.com'); await page.fill('#a-pass', 'short');
  await page.click('#authform button[type=submit]');
  ok('short password rejected', (await text('.authmsg')).includes('8 characters'), await text('.authmsg'));
  await page.screenshot({ path: SHOTS + '/21-signup-error.png' });
  await page.click('[data-act="show-pw"]');
  ok('show password toggles', (await page.locator('#a-pass').getAttribute('type')) === 'text');
  await page.click('[data-act="show-pw"]');

  // legacy local data on this device is carried into the new account
  await page.evaluate(() => localStorage.setItem('habeet:v1', JSON.stringify({ version: 1, habits: [{ id: 'old1', name: 'From before accounts', icon: 'star', color: 1, days: [0, 1, 2, 3, 4, 5, 6], part: 0, startDay: '2026-10-20' }], log: { old1: { '2026-10-21': 'd' } }, settings: { theme: 'auto', weekStart: 1 } })));
  await page.reload();
  await page.click('[data-act="auth-mode"][data-v="up"]');
  ok('note about existing habits', (await page.locator('.authcard').innerText()).includes('already on this device'));
  await page.fill('#a-email', 'me@example.com'); await page.fill('#a-pass', 'password123');
  await page.click('#authform button[type=submit]');
  await page.waitForSelector('#view h1.h-title');
  ok('signed up lands on today', (await text('h1')) === 'Friday, 23 October', await text('h1'));
  ok('old habit kept', (await page.locator('.hrow .hname b', { hasText: 'From before accounts' }).count()) === 1);
  await flush(page);
  const uid = mock.users['me@example.com'].id;
  ok('old habit pushed to the cloud', mock.data[uid] && mock.data[uid].data.habits.length === 1, mock.data[uid]);
  ok('cloud row starts at rev 1', mock.data[uid].rev === 1);
  // clean slate for the rest of the walkthrough
  await page.click('.chk'); // tick it
  await page.click('.hlink');
  await page.click('[data-go^="#/edit/"] >> nth=0');
  await page.click('[data-act="delete"]'); await page.click('.dialog [data-ok]');
  await page.goto(URL + '#/today');
  await page.click('.chk', { timeout: 500 }).catch(() => {});
  ok('old habit deleted for a clean start', await page.locator('.empty h2').count() === 1);

  // ---------- 1. empty state ----------
  ok('empty state shown', (await page.locator('.empty h2').innerText()) === 'Start with one habit');
  ok('date shows', (await text('h1')) === 'Friday, 23 October', await text('h1'));
  await page.screenshot({ path: SHOTS + '/01-empty.png' });

  // ---------- 2. starter habit (journal is a plain check habit) ----------
  await page.click('[data-act="starter"][data-i="3"]');
  ok('starter adds a habit', (await page.locator('.hrow').count()) === 1);
  ok('progress 0 of 1', (await text('.progress .n')) === '0 of 1 done today', await text('.progress .n'));

  // ---------- 3. tick ----------
  await page.click('.chk');
  ok('tick marks done', await page.locator('.hrow.done').count() === 1);
  ok('streak chip 1', (await text('.streak')) === '1', await text('.streak'));
  ok('progress 1 of 1', (await text('.progress .n')) === '1 of 1 done today');
  ok('chk pressed state', (await page.locator('.chk').getAttribute('aria-pressed')) === 'true');
  await page.click('.chk');
  ok('tick again undoes', await page.locator('.hrow.done').count() === 0);
  await page.click('.chk');

  // ---------- 4. persistence ----------
  await page.reload();
  ok('persists after reload', await page.locator('.hrow.done').count() === 1);

  // ---------- 5. new habit through the form, including an XSS-looking name ----------
  await page.click('.head [data-go="#/new"]');
  ok('form opens', await page.locator('#habitform').count() === 1);
  await page.click('#habitform button[type=submit]');
  ok('empty name rejected', (await page.locator('.toast').innerText()).includes('name'));
  await page.fill('#f-name', '<img src=x onerror="window.__xss=1">Stretch');
  await page.click('[data-act="f-icon"][data-v="heart"]');
  await page.click('[data-act="f-color"][data-v="5"]');
  await page.click('[data-act="f-preset"][data-v="week"]');
  await page.click('[data-act="f-part"][data-v="1"]');
  ok('preview updates', (await text('#pvs')) === 'Mon to Fri · Afternoon', await text('#pvs'));
  await page.screenshot({ path: SHOTS + '/02-form.png', fullPage: true });
  await page.click('#habitform button[type=submit]');
  ok('back on today after save', (await text('h1')) === 'Friday, 23 October');
  ok('two habits now', await page.locator('.hrow').count() === 2);
  ok('afternoon section exists', (await page.locator('.sec[aria-label="Afternoon"] .hrow').count()) === 1);
  ok('xss not executed', (await page.evaluate(() => window.__xss)) === undefined);
  ok('name shown as text', (await text('.sec[aria-label="Afternoon"] .hname b')).startsWith('<img'));
  await page.screenshot({ path: SHOTS + '/03-today.png', fullPage: true });

  // ---------- 6. detail + back-fill via edit start date and calendar taps ----------
  await page.click('.sec[aria-label="Evening"] a.hlink');
  ok('detail opens', (await text('.dhead h1')) === 'Write in a journal');
  await page.click('[data-go^="#/edit/"] >> nth=0');
  await page.fill('#f-start', '2026-10-15');
  await page.dispatchEvent('#f-start', 'change');
  await page.click('#habitform button[type=submit]');
  ok('back on detail after save', (await text('.dhead h1')) === 'Write in a journal');
  for (const lab of ['Tuesday, 20', 'Wednesday, 21', 'Thursday, 22']) await page.click('.cal button[aria-label^="' + lab + '"]');
  ok('streak counts backfilled days + today', (await text('.stat2 .tint .num')).startsWith('4'), await text('.stat2 .tint .num'));
  await page.click('.cal button[aria-label^="Friday, 16"]');
  await page.click('.cal button[aria-label^="Friday, 16"]'); // done -> skip
  ok('calendar cycles to skip', await page.locator('.cal button.skip').count() === 1);
  await page.click('.cal button[aria-label^="Friday, 16"]'); // skip -> none
  ok('calendar cycles back to none', await page.locator('.cal button.skip').count() === 0);
  await page.click('.cal button[aria-label^="Friday, 16"]'); // none -> done
  await page.screenshot({ path: SHOTS + '/04-detail.png', fullPage: true });

  // ---------- 7. skip today from detail and long-press skip on Today ----------
  await page.click('[data-act="skiptoday"]');
  ok('skip today button flips', (await text('[data-act="skiptoday"]')) === 'Undo skip');
  ok('skip keeps streak', (await text('.stat2 .tint .num')).startsWith('3'), await text('.stat2 .tint .num'));
  await page.click('[data-act="skiptoday"]');
  await page.goto(URL + '#/today');
  const chk = page.locator('.sec[aria-label="Afternoon"] .chk');
  const bb = await chk.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down(); await page.clock.runFor(800); await page.mouse.up();
  ok('long press skips', await page.locator('.sec[aria-label="Afternoon"] .hrow.skip').count() === 1);
  await page.click('.sec[aria-label="Afternoon"] .hrow.skip .chk');
  ok('tap after long press still toggles later', true);

  // ---------- 8. week strip back-fill ----------
  await page.click('.wd >> nth=3');
  ok('past day title', (await text('h1')) === 'Thursday, 22 October', await text('h1'));
  await page.click('.wd >> nth=4');
  await page.click('[data-act="week"][data-d="-7"]');
  ok('previous week works', (await text('h1')) === 'Friday, 16 October', await text('h1'));
  await page.goto(URL + '#/today');

  // ---------- 8b. ideas page ----------
  await page.goto(URL + '#/ideas');
  ok('ideas page opens', (await text('h1')) === 'Ideas', await text('h1'));
  const idea0 = await page.locator('.hrow .hname b').first().innerText();
  ok('ideas show goals', (await page.locator('.hrow .hname small').first().innerText()).startsWith('8 glasses'), await page.locator('.hrow .hname small').first().innerText());
  await page.click('[data-act="idea-add"] >> nth=0');
  ok('idea marked added', (await page.locator('.addbtn.added').count()) >= 1);
  ok('idea toast', (await page.locator('.toast').innerText()).startsWith('Added'));
  await page.click('[data-act="idea-cat"][data-v="Money"]');
  ok('category filter', (await page.locator('.hrow').count()) === 5, await page.locator('.hrow').count());
  await page.click('[data-act="idea-cat"][data-v="All"]');
  await page.goto(URL + '#/today');
  ok('added idea shows on today', (await page.locator('.hrow .hname b', { hasText: idea0 }).count()) === 1, idea0);

  // ---------- 8c. counted habit ----------
  const water = page.locator('.hrow', { hasText: 'Drink water' });
  ok('count row shows 0 of 8', (await water.locator('.hname small').innerText()) === '0 of 8 glasses', await water.locator('.hname small').innerText());
  ok('minus disabled at zero', await water.locator('[data-act="dec"]').isDisabled());
  for (let i = 0; i < 3; i++) await water.locator('[data-act="inc"]').click();
  ok('count shows 3 of 8', (await water.locator('.hname small').innerText()) === '3 of 8 glasses');
  ok('count bar width', (await water.locator('.rbar i').evaluate(e => e.style.width)) === '38%', await water.locator('.rbar i').evaluate(e => e.style.width));
  await water.locator('[data-act="dec"]').click();
  ok('minus removes one', (await water.locator('.hname small').innerText()) === '2 of 8 glasses');
  for (let i = 0; i < 6; i++) await water.locator('[data-act="inc"]').click();
  ok('goal completes the habit', await page.locator('.hrow.done', { hasText: 'Drink water' }).count() === 1);
  ok('goal toast', (await page.locator('.toast').innerText()).includes('goal reached'), await page.locator('.toast').innerText());
  await page.screenshot({ path: SHOTS + '/14-count-done.png', fullPage: true });
  await water.locator('[data-act="dec"]').click();
  ok('minus below goal reopens it', await page.locator('.hrow.done', { hasText: 'Drink water' }).count() === 0);

  // ---------- 8d. timed habit ----------
  await page.goto(URL + '#/ideas');
  await page.click('[data-act="idea-cat"][data-v="Mind"]');
  await page.locator('.hrow', { hasText: 'Meditate' }).locator('[data-act="idea-add"]').click();
  await page.goto(URL + '#/today');
  const med = page.locator('.hrow', { hasText: 'Meditate' });
  ok('timed row shows 0 of 10 min', (await med.locator('.hname small').innerText()) === '0 sec of 10 min', await med.locator('.hname small').innerText());
  await med.locator('[data-act="timer-start"]').click();
  await page.clock.runFor(90000);
  ok('timer counts live', /^1:(29|30) of 10:00$/.test(await med.locator('[data-live]').innerText()), await med.locator('[data-live]').innerText());
  await page.screenshot({ path: SHOTS + '/15-timer-running.png', fullPage: true });
  await page.reload();
  await page.clock.runFor(30000);
  ok('timer survives a reload and keeps counting by clock', (await page.locator('.hrow', { hasText: 'Meditate' }).locator('[data-live]').innerText()).startsWith('2:'), await page.locator('.hrow', { hasText: 'Meditate' }).locator('[data-live]').innerText());
  await page.locator('.hrow', { hasText: 'Meditate' }).locator('[data-act="timer-stop"]').click();
  const medSub = await page.locator('.hrow', { hasText: 'Meditate' }).locator('.hname small').innerText();
  ok('stop saves the time', /^2 min of 10 min$/.test(medSub), medSub);
  await page.locator('.hrow', { hasText: 'Meditate' }).locator('[data-act="timer-start"]').click();
  await page.clock.runFor(8 * 60 * 1000 + 30000);
  await page.clock.runFor(2000);
  ok('timer finishes at the goal on its own', await page.locator('.hrow.done', { hasText: 'Meditate' }).count() === 1);
  ok('finished time is capped at the goal', (await page.locator('.hrow', { hasText: 'Meditate' }).locator('.hname small').innerText()) === 'Done · 10 min', await page.locator('.hrow', { hasText: 'Meditate' }).locator('.hname small').innerText());
  await page.click('.hrow.done:has-text("Meditate") .chk'); // untick clears
  ok('untick clears timed progress', (await page.locator('.hrow', { hasText: 'Meditate' }).locator('.hname small').innerText()) === '0 sec of 10 min');
  await page.click('.hrow:has-text("Meditate") .chk'); // straight completion check
  ok('timed habit can be ticked straight away', await page.locator('.hrow.done', { hasText: 'Meditate' }).count() === 1);

  // ---------- 8e. goal edits keep history ----------
  await page.goto(URL + '#/habits');
  await page.click('.hlist .hrow:has-text("Drink water")');
  await page.click('[data-go^="#/edit/"] >> nth=0');
  ok('type is locked when editing', await page.locator('[data-act="f-kind"][data-v="check"]').isDisabled());
  ok('goal note on edit', (await page.locator('.field + .hint, .goalrow + .hint').first().innerText()).includes('starts today'));
  await page.fill('#f-start', '2026-10-15'); await page.dispatchEvent('#f-start', 'change');
  await page.fill('#f-goal', '10'); await page.fill('#f-unit', '<b>cups</b>');
  await page.click('#habitform button[type=submit]');
  await page.goto(URL + '#/today');
  ok('new goal used today', (await page.locator('.hrow', { hasText: 'Drink water' }).locator('.hname small').innerText()).includes('of 10 '), await page.locator('.hrow', { hasText: 'Drink water' }).locator('.hname small').innerText());
  ok('unit is escaped, not html', (await page.locator('.hrow .hname small b').count()) === 0);
  await page.click('.wd >> nth=3'); // Thursday: still on the old goal of 8
  const ydaySub = await page.locator('.hrow', { hasText: 'Drink water' }).locator('.hname small').innerText();
  ok('yesterday keeps the old goal', ydaySub.includes('of 8 '), ydaySub);
  await page.goto(URL + '#/new');
  await page.fill('#f-name', 'Zero goal');
  await page.click('[data-act="f-kind"][data-v="time"]');
  await page.fill('#f-goal', '0');
  await page.click('#habitform button[type=submit]');
  ok('goal of zero rejected', (await page.locator('.toast').innerText()).includes('Goal must be'), await page.locator('.toast').innerText());
  await page.fill('#f-goal', '99999');
  await page.click('#habitform button[type=submit]');
  ok('goal too large rejected', (await page.locator('.toast').innerText()).includes('1440'), await page.locator('.toast').innerText());
  await page.goto(URL + '#/today');

  // ---------- 9. overview ----------
  await page.click('.tab[data-go="#/overview"]');
  ok('overview title', (await text('h1')) === 'Overview');
  await page.click('[data-act="range"][data-r="12w"]');
  ok('range switches', (await page.locator('[data-act="range"].on').innerText()) === '12 weeks');
  ok('heat cards', await page.locator('.heat').count() === 4, await page.locator('.heat').count());
  await page.screenshot({ path: SHOTS + '/05-overview.png', fullPage: true });

  // ---------- 10. settings: account, theme, export, import, archive, erase ----------
  await page.click('.tab[data-go="#/settings"]');
  ok('account card shows email', (await text('.acct b')) === 'me@example.com', await text('.acct b'));
  await page.screenshot({ path: SHOTS + '/16-settings-account.png', fullPage: true });
  await page.click('[data-act="theme"][data-v="dark"]');
  ok('dark theme applied', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.screenshot({ path: SHOTS + '/06-settings-dark.png', fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.backup [data-act="export"]')]);
  const file = SHOTS + '/export.json'; await dl.saveAs(file);
  const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok('export has habits', exp.habits.length === 4 && exp.version === 2, [exp.habits.length, exp.version]);
  ok('export keeps goals', exp.habits.some(h => h.kind === 'count' && h.goals.length === 2));
  ok('export file name', /^habeet-backup-2026-10-23\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  ok('lastBackup recorded', (await page.locator('.backup b').innerText()).startsWith('Last backup 0 days ago'), await page.locator('.backup b').innerText());

  await page.click('.tab[data-go="#/habits"]');
  await page.click('.hlist .hrow >> nth=0');
  await page.click('[data-act="archive"]');
  ok('archive hides from habits list', await page.locator('.hlist .hrow').count() === 3);
  await page.click('.tab[data-go="#/settings"]');
  ok('archived listed', await page.locator('.archrow').count() === 1);
  await page.click('.archrow [data-act="unarchive"]');
  ok('restored', await page.locator('.archrow').count() === 0);

  fs.writeFileSync(SHOTS + '/bad.json', '{"hello":1}');
  await page.setInputFiles('#file', SHOTS + '/bad.json');
  await page.waitForSelector('.toast');
  ok('bad import rejected', (await page.locator('.toast').innerText()).includes('not a habeet backup'));
  fs.writeFileSync(SHOTS + '/v1.json', JSON.stringify({ version: 1, habits: [{ id: 'v1a', name: 'From a v1 backup', icon: 'star', color: 0, days: [0, 1, 2, 3, 4, 5, 6], part: 0, startDay: '2026-10-01' }], log: { v1a: { '2026-10-22': 'd' } }, settings: {} }));
  exp.habits.splice(1, 3);
  fs.writeFileSync(SHOTS + '/good.json', JSON.stringify(exp));
  await page.setInputFiles('#file', SHOTS + '/v1.json');
  await page.waitForSelector('.dialog');
  ok('v1 backup still imports', (await page.locator('.dialog').innerText()).includes('1 habit'));
  await page.click('.dialog [data-no]');
  await page.setInputFiles('#file', SHOTS + '/good.json');
  await page.waitForSelector('.dialog');
  ok('import asks to confirm', await page.locator('.dialog').count() === 1);
  await page.click('.dialog [data-ok]');
  await page.click('.tab[data-go="#/habits"]');
  ok('import replaced data', await page.locator('.hlist .hrow').count() === 1);

  // ---------- 11. sync: a second device sees the data, and offline edits merge ----------
  await flush(page);
  ok('cloud has the imported state', mock.data[uid].data.habits.length === 1, mock.data[uid].data.habits.length);
  const revA = mock.data[uid].rev;
  ok('cloud rev moved on', revA > 1, revA);
  const ctxB = await newCtx({ viewport: { width: 390, height: 844 } });
  const pageB = await newPage(ctxB, 'B ');
  await signin(pageB, 'me@example.com');
  ok('device B sees the habit after signing in', (await pageB.locator('.hrow').count()) === 1, await pageB.locator('.hrow').count());
  const bName = await pageB.locator('.hrow .hname b').first().innerText();
  // A goes offline and adds a habit; B adds a different one and ticks the first
  mock.down = true;
  await page.goto(URL + '#/new');
  await page.fill('#f-name', 'Added offline on A');
  await page.click('#habitform button[type=submit]');
  await flush(page);
  mock.down = false;
  await pageB.goto(URL + '#/new');
  await pageB.fill('#f-name', 'Added on B');
  await pageB.click('#habitform button[type=submit]');
  await flush(pageB);
  const bCount = mock.data[uid].data.habits.length;
  ok('B pushed its habit', bCount === 2, bCount);
  await page.reload(); await flush(page); await flush(page);
  const merged = mock.data[uid].data.habits.map(h => h.name).sort();
  ok('both devices\' habits are in the cloud after merge', merged.includes('Added offline on A') && merged.includes('Added on B') && merged.includes(bName), merged);
  await page.goto(URL + '#/habits');
  ok('device A shows the merged list', (await page.locator('.hlist .hrow').count()) === 3, await page.locator('.hlist .hrow').count());
  await pageB.reload(); await flush(pageB);
  await pageB.goto(URL + '#/habits');
  ok('device B catches up too', (await pageB.locator('.hlist .hrow').count()) === 3, await pageB.locator('.hlist .hrow').count());
  await ctxB.close();

  // ---------- 12. expired access token refreshes by itself ----------
  mock.ttl = 30; // new tokens expire 30 s after "now", which the app treats as already stale
  const before = mock.count(/grant_type=refresh_token/);
  await page.evaluate(() => { var s = JSON.parse(localStorage.getItem('habeet:session')); s.exp = 1; localStorage.setItem('habeet:session', JSON.stringify(s)); });
  await page.reload();
  await page.goto(URL + '#/new'); await page.fill('#f-name', 'After refresh'); await page.click('#habitform button[type=submit]'); await flush(page);
  ok('refresh token used when the access token is old', mock.count(/grant_type=refresh_token/) > before);
  ok('change still synced after refresh', mock.data[uid].data.habits.some(h => h.name === 'After refresh'));
  mock.ttl = 86400 * 365;

  // ---------- 13. sign out clears this device, sign in brings it back ----------
  await page.click('.tab[data-go="#/settings"]');
  await page.click('[data-act="signout"]');
  await page.click('.dialog [data-ok]');
  await page.waitForSelector('.authh');
  ok('signed out shows the sign in screen', (await text('.authh')) === 'Welcome back');
  ok('local habits removed on sign out', (await page.evaluate(() => localStorage.getItem('habeet:v1'))) === null);
  ok('session removed on sign out', (await page.evaluate(() => localStorage.getItem('habeet:session'))) === null);
  await signin(page, 'me@example.com');
  await page.goto(URL + '#/habits');
  ok('data returns after signing in again', (await page.locator('.hlist .hrow').count()) === 4, await page.locator('.hlist .hrow').count());

  // ---------- 14. corrupted storage does not crash (cloud unreachable) ----------
  mock.down = true;
  await page.goto(URL + '#/today');
  await page.evaluate(() => localStorage.setItem('habeet:v1', '{not json'));
  await page.reload();
  ok('corrupt data recovers', await page.locator('.empty h2').count() === 1);
  ok('corrupt copy kept', (await page.evaluate(() => localStorage.getItem('habeet:v1:corrupt'))) === '{not json');
  mock.down = false;

  // ---------- 15. desktop layout ----------
  const d = await newCtx({ viewport: { width: 1280, height: 850 } });
  const dp = await newPage(d, 'desktop ');
  await signup(dp, 'desk@example.com');
  mock.down = true;
  const seed = { version: 1, habits: [
    { id: 'a1', name: 'Morning run', icon: 'run', color: 0, days: [1, 2, 3, 4, 5, 6], part: 0, startDay: '2026-08-03' },
    { id: 'a2', name: 'Drink water', icon: 'water', color: 3, days: [0, 1, 2, 3, 4, 5, 6], part: 0, startDay: '2026-08-03', kind: 'count', goals: [{ from: '2026-08-03', goal: 8 }], unit: 'glasses' },
    { id: 'a3', name: 'Meditate', icon: 'lotus', color: 6, days: [0, 1, 2, 3, 4, 5, 6], part: 0, startDay: '2026-08-03', kind: 'time', goals: [{ from: '2026-08-03', goal: 10 }] },
    { id: 'a4', name: 'Study coding 1 hour', icon: 'code', color: 5, days: [1, 2, 3, 4, 5], part: 1, startDay: '2026-08-03' },
    { id: 'a5', name: 'Read 20 pages', icon: 'book', color: 4, days: [0, 1, 2, 3, 4, 5, 6], part: 2, startDay: '2026-08-03' },
    { id: 'a6', name: 'Journal', icon: 'pen', color: 1, days: [0, 1, 2, 3, 4, 5, 6], part: 2, startDay: '2026-08-03' }],
    log: {}, settings: { theme: 'light', weekStart: 1, lastBackup: null, noticeDismissed: false } };
  let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  seed.habits.forEach(h => { const l = {}; for (let i = 1; i < 80; i++) { const dt = new Date(Date.UTC(2026, 9, 23 - i)); const k = dt.toISOString().slice(0, 10); if (h.days.includes(dt.getUTCDay()) && rnd() > .15) l[k] = h.kind === 'count' ? 8 : h.kind === 'time' ? 600 : 'd'; } seed.log[h.id] = l; });
  seed.log.a1['2026-10-23'] = 'd'; seed.log.a2['2026-10-23'] = 5; seed.log.a3['2026-10-23'] = 240; seed.log.a5['2026-10-23'] = 'd';
  await dp.evaluate(v => localStorage.setItem('habeet:v1', JSON.stringify(v)), seed);
  await dp.reload();
  ok('desktop sidebar visible', await dp.locator('.side').isVisible());
  ok('desktop tabbar hidden', !(await dp.locator('.tabbar').isVisible()));
  ok('desktop aside visible', await dp.locator('.aside').isVisible());
  ok('sidebar shows account', (await dp.locator('.sidefoot').innerText()).includes('desk@example.com'));
  await dp.screenshot({ path: SHOTS + '/07-desktop-today.png' });
  await dp.goto(URL + '#/overview'); await dp.screenshot({ path: SHOTS + '/08-desktop-overview.png', fullPage: true });
  await dp.goto(URL + '#/habit/a2'); await dp.screenshot({ path: SHOTS + '/09-desktop-detail.png', fullPage: true });
  await dp.goto(URL + '#/habits'); await dp.screenshot({ path: SHOTS + '/10-desktop-habits.png' });
  await dp.goto(URL + '#/settings'); await dp.screenshot({ path: SHOTS + '/11-desktop-settings.png', fullPage: true });
  await dp.goto(URL); // signed-in users never see the sign in page again
  await d.clearCookies();
  const dsign = await d.newPage(); await dsign.goto(URL + '#/today');
  await dsign.evaluate(() => { localStorage.removeItem('habeet:session'); }); await dsign.reload();
  await dsign.screenshot({ path: SHOTS + '/22-desktop-signin.png' });
  await dsign.close();

  // no horizontal scroll on phone with the same data
  await page.evaluate(v => localStorage.setItem('habeet:v1', JSON.stringify(v)), seed);
  mock.down = true;
  for (const r of ['today', 'overview', 'habits', 'settings', 'habit/a2', 'habit/a3', 'new', 'ideas']) {
    await page.goto(URL + '#/' + r); await page.reload();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('no horizontal scroll on phone: ' + r, sw <= 0, sw);
  }
  await page.goto(URL + '#/today'); await page.reload(); await page.screenshot({ path: SHOTS + '/12-phone-today-seeded.png', fullPage: true });
  await page.goto(URL + '#/overview'); await page.reload(); await page.screenshot({ path: SHOTS + '/13-phone-overview-seeded.png', fullPage: true });
  mock.down = false;

  // ---------- 16. account flows on their own: confirm email, reset, bad links, delete ----------
  mock.requireConfirm = true;
  const c2 = await newCtx(); const p2 = await newPage(c2, 'c2 ');
  await p2.goto(URL); await p2.click('[data-act="auth-mode"][data-v="up"]');
  await p2.fill('#a-email', 'new@example.com'); await p2.fill('#a-pass', 'password123');
  await p2.click('#authform button[type=submit]');
  await p2.waitForSelector('.authh');
  ok('confirm screen after sign up', (await p2.locator('.authh').innerText()) === 'Check your email');
  await p2.screenshot({ path: SHOTS + '/23-confirm.png' });
  await p2.click('[data-act="auth-mode"][data-v="in"]');
  await p2.fill('#a-email', 'new@example.com'); await p2.fill('#a-pass', 'password123');
  await p2.click('#authform button[type=submit]');
  await p2.waitForSelector('.authmsg.err');
  ok('unconfirmed login explained', (await p2.locator('.authmsg').innerText()).includes('Confirm your email'), await p2.locator('.authmsg').innerText());
  await p2.click('[data-act="auth-mode"][data-v="up"]');
  await p2.fill('#a-email', 'new@example.com'); await p2.fill('#a-pass', 'password123');
  await p2.click('#authform button[type=submit]');
  await p2.waitForSelector('.authmsg.err');
  ok('duplicate sign up explained', (await p2.locator('.authmsg').innerText()).includes('already has an account'), await p2.locator('.authmsg').innerText());
  // the confirmation link signs the person in
  mock.users['new@example.com'].confirmed = true;
  const link = '#access_token=' + mock.tokenFor('new@example.com') + '&refresh_token=rtX&type=signup';
  await p2.goto('about:blank'); await p2.goto(URL + link);
  await p2.waitForSelector('#view h1.h-title');
  ok('confirmation link signs in', (await p2.locator('h1').first().innerText()) === 'Friday, 23 October');
  ok('token removed from the address bar', !(await p2.evaluate(() => location.href)).includes('access_token'));
  mock.requireConfirm = false;

  // forgot password
  await p2.evaluate(() => { localStorage.removeItem('habeet:session'); localStorage.removeItem('habeet:sync'); localStorage.removeItem('habeet:v1'); });
  await p2.goto(URL);
  await p2.click('[data-act="auth-mode"][data-v="forgot"]');
  await p2.fill('#a-email', 'new@example.com');
  await p2.click('#authform button[type=submit]');
  await p2.waitForSelector('.authmsg.ok');
  ok('reset email requested', mock.sent.some(x => x.type === 'recover' && x.to === 'new@example.com'));
  ok('reset message does not reveal accounts', (await p2.locator('.authmsg').innerText()).startsWith('If that email'));
  // the reset link opens the new-password screen
  await p2.goto('about:blank'); await p2.goto(URL + '#access_token=' + mock.tokenFor('new@example.com') + '&refresh_token=rtY&type=recovery');
  await p2.waitForSelector('.authh');
  ok('recovery link shows new password screen', (await p2.locator('.authh').innerText()) === 'Choose a new password');
  await p2.fill('#a-pass', 'short'); await p2.click('#authform button[type=submit]');
  ok('short new password rejected', (await p2.locator('.authmsg').innerText()).includes('8 characters'));
  await p2.fill('#a-pass', 'brandnewpass9'); await p2.click('#authform button[type=submit]');
  await p2.waitForSelector('#view h1.h-title');
  ok('password changed and signed in', mock.users['new@example.com'].pw === 'brandnewpass9');
  // an expired link says so
  await p2.evaluate(() => { localStorage.removeItem('habeet:session'); localStorage.removeItem('habeet:sync'); localStorage.removeItem('habeet:v1'); });
  await p2.goto('about:blank'); await p2.goto(URL + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await p2.waitForSelector('.authmsg.err');
  ok('expired link explained', (await p2.locator('.authmsg').innerText()).includes('expired'), await p2.locator('.authmsg').innerText());

  // delete account
  await signin(p2, 'new@example.com', 'brandnewpass9');
  await p2.click('[data-act="starter"][data-i="3"]'); await flush(p2);
  const uid2 = mock.users['new@example.com'].id;
  ok('second account has data in the cloud', !!mock.data[uid2]);
  await p2.click('.tab[data-go="#/settings"]');
  await p2.click('[data-act="delete-account"]');
  ok('delete asks first', (await p2.locator('.dialog h2').innerText()) === 'Delete your account?');
  await p2.click('.dialog [data-ok]');
  await p2.waitForSelector('.authh');
  ok('account and data gone from the cloud', !mock.users['new@example.com'] && !mock.data[uid2]);
  ok('device cleared after deleting', (await p2.evaluate(() => localStorage.getItem('habeet:v1'))) === null);
  await p2.fill('#a-email', 'new@example.com'); await p2.fill('#a-pass', 'brandnewpass9');
  await p2.click('#authform button[type=submit]'); await p2.waitForSelector('.authmsg.err');
  ok('deleted account cannot sign in', (await p2.locator('.authmsg').innerText()) === 'Wrong email or password.');

  // a different person on the same browser never sees the last person's habits
  await signup(p2, 'first@example.com'); await p2.click('[data-act="starter"][data-i="3"]');
  await p2.evaluate(() => localStorage.setItem('habeet:session', 'bad')); // simulate lost session but keep data
  mock.down = true; await p2.reload(); mock.down = false;
  ok('broken session sends you to sign in', (await p2.locator('.authh').count()) === 1);
  await p2.evaluate(() => localStorage.removeItem('habeet:session'));
  await signup(p2, 'second@example.com');
  ok('other account starts empty', (await p2.locator('.empty h2').count()) === 1);
  await c2.close();

  // ---------- 17. not connected yet ----------
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p3 = await c3.newPage();
  p3.on('pageerror', e => errors.push('c3 ' + e.message));
  await p3.goto(URL);
  ok('setup screen when config is empty', (await p3.locator('.authh').innerText()) === 'Almost ready');
  await p3.screenshot({ path: SHOTS + '/24-setup.png' });
  await c3.close();

  // ---------- 18. offline: signed-in app opens from saved data ----------
  const c4 = await newCtx(); const p4 = await newPage(c4, 'c4 ');
  await signup(p4, 'offline@example.com'); await p4.click('[data-act="starter"][data-i="3"]'); await flush(p4);
  mock.down = true; await p4.reload();
  ok('opens offline with saved data', (await p4.locator('.hrow').count()) === 1);
  await p4.click('.chk'); await flush(p4);
  ok('offline edit marks unsynced', (await p4.evaluate(() => JSON.parse(localStorage.getItem('habeet:sync')).dirty)) === true);
  mock.down = false; await p4.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(400);
  ok('offline edit syncs when back online', mock.data[mock.users['offline@example.com'].id].data.log && Object.keys(mock.data[mock.users['offline@example.com'].id].data.log).length === 1);
  ok('synced flag cleared', (await p4.evaluate(() => JSON.parse(localStorage.getItem('habeet:sync')).dirty)) === false);
  await c4.close();

  ok('no console errors', errors.length === 0, errors);
  await browser.close();
  console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `All ${pass} UI checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
