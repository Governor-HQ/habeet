// A small fake of the Supabase pieces habeet uses (auth + one table + delete_me), run inside Playwright.
// install(context, opts) intercepts https://mock.supabase.co/** and serves /js/config.js with its address.
const HOST = 'https://mock.supabase.co';
const KEY = 'sb_publishable_mock_key_123456';

function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function jwt(user, ttlSec) { return b64({ alg: 'HS256' }) + '.' + b64({ sub: user.id, email: user.email, exp: Math.floor(Date.parse('2026-10-23T09:30:00') / 1000) + ttlSec }) + '.sig'; }

function createServer(over) {
  const m = Object.assign({
    users: {}, data: {}, refresh: {}, requireConfirm: false, down: false, ttl: 86400 * 365, calls: [], nextId: 1, sent: [],
  }, over || {});
  m.reset = () => { m.users = {}; m.data = {}; m.refresh = {}; m.calls = []; };
  m.count = (re) => m.calls.filter(c => re.test(c)).length;
  m.userByToken = (t) => { try { const p = JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); return Object.values(m.users).find(u => u.id === p.sub); } catch (e) { return null; } };
  m.session = (u) => { const rt = 'rt' + (m.nextId++); m.refresh[rt] = u.id; return { access_token: jwt(u, m.ttl), refresh_token: rt, token_type: 'bearer', expires_in: m.ttl, user: { id: u.id, email: u.email } }; };
  m.tokenFor = (email) => jwt(m.users[email], m.ttl);

  m.handle = async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (m.down) return route.abort('failed');
    m.calls.push(method + ' ' + path + (url.search || ''));
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) { body = {}; }
    const auth = (req.headers()['authorization'] || '').replace('Bearer ', '');
    if (req.headers()['apikey'] !== KEY) return json(401, { message: 'No API key' });

    if (path === '/auth/v1/signup') {
      if (!body.email || !body.password) return json(400, { error_code: 'validation_failed', msg: 'bad' });
      if (body.password.length < 6) return json(422, { error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      if (m.users[body.email]) return m.requireConfirm ? json(200, { id: 'x', email: body.email, identities: [] }) : json(422, { error_code: 'user_already_exists', msg: 'User already registered' });
      const u = { id: 'u' + (m.nextId++), email: body.email, pw: body.password, confirmed: !m.requireConfirm };
      m.users[u.email] = u;
      if (m.requireConfirm) { m.sent.push({ to: u.email, type: 'confirm' }); return json(200, { id: u.id, email: u.email, identities: [{}] }); }
      return json(200, m.session(u));
    }
    if (path === '/auth/v1/token') {
      const gt = url.searchParams.get('grant_type');
      if (gt === 'password') {
        const u = m.users[body.email];
        if (!u || u.pw !== body.password) return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (!u.confirmed) return json(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
        return json(200, m.session(u));
      }
      if (gt === 'refresh_token') {
        const id = m.refresh[body.refresh_token]; const u = Object.values(m.users).find(x => x.id === id);
        if (!u) return json(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
        delete m.refresh[body.refresh_token]; return json(200, m.session(u));
      }
    }
    if (path === '/auth/v1/recover') { m.sent.push({ to: body.email, type: 'recover' }); return json(200, {}); }
    if (path === '/auth/v1/logout') return json(204, {});
    if (path === '/auth/v1/user' && method === 'PUT') {
      const u = m.userByToken(auth); if (!u) return json(401, { msg: 'bad jwt' });
      if (body.password === u.pw) return json(422, { error_code: 'same_password', msg: 'same' });
      u.pw = body.password; return json(200, { id: u.id, email: u.email });
    }
    const u = m.userByToken(auth);
    if (path.startsWith('/rest/v1/') ) {
      if (!u) return json(401, { message: 'JWT invalid' });
      if (path === '/rest/v1/rpc/delete_me') { delete m.users[u.email]; delete m.data[u.id]; return json(204, {}); }
      if (path === '/rest/v1/user_data') {
        const row = m.data[u.id];
        if (method === 'GET') return json(200, row ? [{ rev: row.rev, data: row.data }] : []);
        if (method === 'POST') { if (row) return json(409, { code: '23505', message: 'duplicate key' }); m.data[u.id] = { rev: body.rev || 1, data: body.data }; return json(201, [m.data[u.id]]); }
        if (method === 'PATCH') {
          const want = Number((url.searchParams.get('rev') || '').replace('eq.', ''));
          if (!row || row.rev !== want) return json(200, []);
          m.data[u.id] = { rev: body.rev, data: body.data }; return json(200, [m.data[u.id]]);
        }
      }
    }
    return json(404, { message: 'not found ' + path });
  };

  m.install = async (context, opts) => {
    opts = opts || {};
    await context.route(HOST + '/**', m.handle);
    if (!opts.noConfig) await context.route('**/js/config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.HABEET_CONFIG = ' + JSON.stringify({ supabaseUrl: HOST, supabaseKey: KEY }) + ';' }));
  };
  return m;
}
module.exports = { createServer, HOST, KEY, jwt };
