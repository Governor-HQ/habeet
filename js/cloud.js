/* habeet cloud: sign in and sync through Supabase, using plain fetch (no library).
   Auth endpoints: /auth/v1. Data: one row per user in table user_data via /rest/v1. */
(function (root) {
  'use strict';
  var SKEY = 'habeet:session';
  var cfg = root.HABEET_CONFIG || {};
  var base = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  var key = String(cfg.supabaseKey || '');
  var sess = null, refreshing = null;

  function configured() { return /^https?:\/\//.test(base) && key.length > 10; }

  function err(msg, code, offline) { var e = new Error(msg); e.code = code || ''; e.offline = !!offline; return e; }

  function b64json(part) {
    var s = part.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  }
  function fromToken(access, refresh) {
    var p = b64json(access.split('.')[1]);
    return { access: access, refresh: refresh, uid: p.sub, email: p.email || '', exp: p.exp * 1000 };
  }
  function store(s) {
    sess = s;
    try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) { /* ignore */ }
  }
  function restore() {
    try { var s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s && s.access && s.refresh && s.uid) sess = s; } catch (e) { sess = null; }
    return sess;
  }
  function friendly(body, status) {
    var code = (body && (body.error_code || body.code)) || '', msg = (body && (body.msg || body.message || body.error_description || body.error)) || '';
    var map = {
      invalid_credentials: 'Wrong email or password.',
      email_not_confirmed: 'Confirm your email first. Check your inbox for the link.',
      user_already_exists: 'That email already has an account. Try signing in.',
      email_exists: 'That email already has an account. Try signing in.',
      weak_password: 'Choose a stronger password (at least 8 characters).',
      over_email_send_rate_limit: 'Too many emails were sent. Wait a few minutes and try again.',
      over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
      validation_failed: 'That email address does not look right.',
      signup_disabled: 'Sign ups are closed right now.',
      same_password: 'Choose a password different from your old one.'
    };
    if (map[code]) return map[code];
    if (status === 429) return 'Too many attempts. Wait a minute and try again.';
    return msg ? String(msg).slice(0, 160) : 'Something went wrong. Try again.';
  }
  function raw(path, opts) {
    opts = opts || {};
    var headers = { apikey: key, 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    if (opts.prefer) headers.Prefer = opts.prefer;
    return fetch(base + path, { method: opts.method || 'GET', headers: headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
      .catch(function () { throw err('You are offline. Check your connection.', 'offline', true); })
      .then(function (res) {
        return res.text().then(function (t) {
          var body = null; try { body = t ? JSON.parse(t) : null; } catch (e) { body = null; }
          return { ok: res.ok, status: res.status, body: body };
        });
      });
  }
  function authFail(r) { var e = err(friendly(r.body, r.status), (r.body && (r.body.error_code || r.body.code)) || String(r.status)); e.status = r.status; return e; }

  function refresh() {
    if (refreshing) return refreshing;
    if (!sess) return Promise.reject(err('Signed out.', 'signed_out'));
    refreshing = raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: sess.refresh } }).then(function (r) {
      refreshing = null;
      if (r.ok && r.body && r.body.access_token) { store(fromToken(r.body.access_token, r.body.refresh_token || sess.refresh)); return sess; }
      if (r.status === 400 || r.status === 401 || r.status === 403) { store(null); throw err('Your session expired. Sign in again.', 'signed_out'); }
      throw authFail(r);
    }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }
  function token() {
    if (!sess) return Promise.reject(err('Signed out.', 'signed_out'));
    if (sess.exp - 60000 > Date.now()) return Promise.resolve(sess.access);
    return refresh().then(function (s) { return s.access; });
  }
  function authed(path, opts) {
    return token().then(function (t) {
      opts = opts || {}; opts.token = t;
      return raw(path, opts).then(function (r) {
        if (r.status === 401) return refresh().then(function (s) { opts.token = s.access; return raw(path, opts); });
        return r;
      });
    });
  }

  function takeSession(r) {
    if (r.body && r.body.access_token) { store(fromToken(r.body.access_token, r.body.refresh_token)); return sess; }
    return null;
  }

  var api = {
    configured: configured,
    restore: restore,
    session: function () { return sess; },
    signUp: function (email, password) {
      return raw('/auth/v1/signup', { method: 'POST', body: { email: email, password: password } }).then(function (r) {
        if (!r.ok) throw authFail(r);
        var s = takeSession(r);
        if (s) return { session: s };
        // with email confirmation on, an address that already exists comes back with no identities
        if (r.body && r.body.identities && !r.body.identities.length) throw err(friendly({ error_code: 'user_already_exists' }), 'user_already_exists');
        return { needsConfirm: true };
      });
    },
    signIn: function (email, password) {
      return raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: password } }).then(function (r) {
        if (!r.ok) throw authFail(r);
        return takeSession(r);
      });
    },
    recover: function (email) {
      return raw('/auth/v1/recover', { method: 'POST', body: { email: email } }).then(function (r) { if (!r.ok) throw authFail(r); return true; });
    },
    updatePassword: function (password) {
      return authed('/auth/v1/user', { method: 'PUT', body: { password: password } }).then(function (r) { if (!r.ok) throw authFail(r); return true; });
    },
    signOut: function () {
      var s = sess; store(null);
      if (!s) return Promise.resolve();
      return raw('/auth/v1/logout', { method: 'POST', token: s.access }).then(function () {}, function () {});
    },
    /* Links in confirmation and reset emails come back as #access_token=...&type=... */
    fromHash: function (hash) {
      var h = String(hash || '').replace(/^#\/?/, '');
      if (h.indexOf('access_token=') === -1 && h.indexOf('error=') === -1) return null;
      var q = {}; h.split('&').forEach(function (p) { var i = p.indexOf('='); if (i > 0) q[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' ')); });
      if (q.error) return { error: q.error_description || q.error };
      try { store(fromToken(q.access_token, q.refresh_token || '')); } catch (e) { return { error: 'That link could not be used.' }; }
      return { type: q.type || '' };
    },
    fetchDoc: function () {
      return authed('/rest/v1/user_data?select=rev,data&limit=1').then(function (r) {
        if (!r.ok) throw authFail(r);
        return r.body && r.body.length ? { rev: r.body[0].rev, data: r.body[0].data } : null;
      });
    },
    /* Write the data if nobody else changed it since baseRev. Returns {rev} or {conflict:true}. */
    pushDoc: function (data, baseRev) {
      if (!baseRev) {
        return authed('/rest/v1/user_data', { method: 'POST', prefer: 'return=representation', body: { data: data, rev: 1 } }).then(function (r) {
          if (r.status === 409) return { conflict: true };
          if (!r.ok) throw authFail(r);
          return { rev: 1 };
        });
      }
      return authed('/rest/v1/user_data?user_id=eq.' + encodeURIComponent(sess.uid) + '&rev=eq.' + baseRev, { method: 'PATCH', prefer: 'return=representation', body: { data: data, rev: baseRev + 1, updated_at: new Date().toISOString() } }).then(function (r) {
        if (!r.ok) throw authFail(r);
        return r.body && r.body.length ? { rev: baseRev + 1 } : { conflict: true };
      });
    },
    deleteAccount: function () {
      return authed('/rest/v1/rpc/delete_me', { method: 'POST', body: {} }).then(function (r) {
        if (!r.ok) throw authFail(r);
        store(null); return true;
      });
    }
  };
  root.HabeetCloud = api;
})(self);
