/* Shared helpers: Supabase client, session guard, validation, durations. */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
      storage: window.sessionStorage            // session ends when the tab/browser closes
    }
  });

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const never = () => new Promise(() => {});
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  const BRANCHES = {
    'pani-an':  { office: 'Pani-an Branch Office',  email: 'ileco3.pao@gmail.com', address: 'Pani-an Branch Office' },
    'sara':     { office: 'Sara Branch Office',     email: 'ileco3.sao@gmail.com', address: 'Sara Branch Office' },
    'natividad':{ office: 'Natividad Branch Office',email: 'ileco3.nao@gmail.com', address: 'Natividad Branch Office' },
    'main':     { office: 'ILECO-III Main Office',  email: '',                     address: 'Main Office \u00B7 Brgy. Preciosa, Sara, Iloilo' }
  };
  const OFFICES = Object.values(BRANCHES).map(b => b.office);

  /* ---------- credentials ---------- */
  const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
  const cleanUser = u => String(u || '').trim().toLowerCase();
  const emailOf = u => cleanUser(u) + '@' + C.EMAIL_DOMAIN;
  function usernameError(u) {
    return USERNAME_RE.test(cleanUser(u)) ? null : 'Username: 3\u201332 characters; letters, numbers, . _ - only.';
  }
  function passwordError(pw) {
    if (typeof pw !== 'string' || pw.length < C.MIN_PASSWORD) return 'Password must be at least ' + C.MIN_PASSWORD + ' characters.';
    if (pw.length > 128) return 'Password is too long.';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
    if (/^(.)\1+$/.test(pw)) return 'Password is too simple.';
    return null;
  }

  /* ---------- backend calls ---------- */
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) {
      if (/not authorized|jwt|expired/i.test(error.message || '')) { await sb.auth.signOut(); location.replace('login.html'); await never(); }
      throw new Error('Request failed. Please try again.');   // never leak DB internals to the UI
    }
    return data;
  }
  async function adminFn(body) {
    const { data, error } = await sb.functions.invoke('admin-users', { body });
    if (error) {
      let msg = 'Request failed.';
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  const logActivity = (action, details) => sb.rpc('log_activity', { p_action: action, p_details: details || '' }).then(() => {}, () => {});

  /* ---------- session guard ---------- */
  const homeFor = role => (role === 'field' ? 'field.html' : 'index.html');
  let idleTimer = null;
  function startIdleTimer() {
    const ms = (C.IDLE_TIMEOUT_MIN || 30) * 60000;
    const reset = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => logout(true), ms); };
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset();
  }
  async function logout(auto) {
    try { await sb.rpc('log_activity', { p_action: 'Logged out', p_details: auto ? 'Auto (idle timeout)' : '' }); } catch (_) {}
    await sb.auth.signOut();
    location.replace('login.html');
  }
  async function guard(opts) {
    opts = opts || {};
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.replace('login.html'); return never(); }
    const { data, error } = await sb.rpc('my_profile');
    const p = Array.isArray(data) ? data[0] : data;
    if (error || !p) { await sb.auth.signOut(); location.replace('login.html'); return never(); }
    if (p.must_change_password && !opts.allowMustChange) { location.replace('change-password.html'); return never(); }
    if (opts.roles && !opts.roles.includes(p.role)) { location.replace(homeFor(p.role)); return never(); }
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('login.html'); });
    startIdleTimer();
    document.body.classList.add('ready');
    return p;
  }

  /* ---------- UI helpers ---------- */
  function show(el, msg, ok) { if (!el) return; el.textContent = msg || ''; el.classList.toggle('show', !!msg); el.classList.toggle('ok', !!ok); el.style.display = msg ? 'block' : 'none'; }
  function toast(el, msg, err, ms) { if (!el) return; el.textContent = msg; el.classList.toggle('err', !!err); clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, ms || 4000); }
  function statBox(k, v) { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<div class="v"></div><div class="k"></div>'; d.firstChild.textContent = v; d.lastChild.textContent = k; return d; }
  function initNav() {
    const btns = $$('.nav-btn[data-view]');
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(x => x.classList.toggle('active', x === b));
      $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
    }));
  }
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s));
  const isTime = s => /^\d{2}:\d{2}(:\d{2})?$/.test(s || '');
  function rangeError(from, to) { if (from && to && from > to) return '"From" date must not be after "To" date.'; return null; }

  /* ---------- durations (minutes) ---------- */
  const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':'); return (+h) * 60 + (+m); };
  const diff = (a, b) => { if (a == null || b == null) return null; let d = b - a; if (d < 0) d += 1440; return d; };
  function computeDurations(x) {
    const dep = toMin(x.departure), arr = toMin(x.arrival), fin = toMin(x.finished);
    const travel = diff(dep, arr), work = diff(arr, fin);
    const sum = travel != null && work != null ? travel + work : null;
    let duration = null;
    if (x.dateReceived && x.timeReceived && x.dateActed && x.finished) {
      const s = new Date(x.dateReceived + 'T' + String(x.timeReceived).slice(0, 5) + ':00');
      const e = new Date(x.dateActed + 'T' + String(x.finished).slice(0, 5) + ':00');
      const d = Math.round((e - s) / 60000);
      duration = d >= 0 ? d : null;
    }
    const net = duration != null && travel != null ? duration - travel : null;
    return { travel, work, sum, duration, net };
  }

  window.App = { sb, $, $$, esc, never, has, BRANCHES, OFFICES, cleanUser, emailOf, usernameError, passwordError,
    rpc, adminFn, logActivity, guard, logout, homeFor, show, toast, statBox, initNav, today, nowHM, isDate, isTime,
    rangeError, computeDurations, config: C };
})();
