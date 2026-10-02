(async function () {
  'use strict';
  const A = window.App, $ = A.$;
  const form = $('#login-form'), setup = $('#setup-card'), checking = $('#checking-card'), err = $('#login-error'), btn = $('#login-btn');

  // Already signed in? Go straight to the right page.
  try {
    const { data: { session } } = await A.sb.auth.getSession();
    if (session) {
      const { data } = await A.sb.rpc('my_profile'); const p = Array.isArray(data) ? data[0] : data;
      if (p) { location.replace(p.must_change_password ? 'change-password.html' : A.homeFor(p.role)); return; }
      await A.sb.auth.signOut();
    }
  } catch (_) {}

  try {
    const { data, error } = await A.sb.rpc('has_any_accounts');
    if (error) throw error;
    checking.style.display = 'none';
    (data ? form : setup).style.display = 'block';
  } catch (_) {
    checking.style.display = 'none'; form.style.display = 'block';
    A.show(err, 'Cannot reach the server. Check your connection and try again.');
  }

  // Client-side throttle on top of Supabase's server-side rate limits.
  const KEY = 'login_fail';
  const state = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || { n: 0, until: 0 }; } catch (_) { return { n: 0, until: 0 }; } };
  const save = s => sessionStorage.setItem(KEY, JSON.stringify(s));

  form.addEventListener('submit', async e => {
    e.preventDefault(); A.show(err, '');
    const st = state(), wait = Math.ceil((st.until - Date.now()) / 1000);
    if (wait > 0) { A.show(err, 'Too many attempts. Try again in ' + wait + ' seconds.'); return; }
    const username = A.cleanUser($('#username').value), password = $('#password').value;
    if (!password || A.usernameError(username)) { A.show(err, 'Incorrect username or password.'); return; }
    btn.disabled = true; btn.textContent = 'Signing in\u2026';
    try {
      const { error } = await A.sb.auth.signInWithPassword({ email: A.emailOf(username), password });
      if (error) {
        st.n++; if (st.n >= 5) { st.until = Date.now() + Math.min(300, 15 * Math.pow(2, st.n - 5)) * 1000; } save(st);
        A.show(err, error.status === 429 ? 'Too many attempts. Please wait a few minutes.' : 'Incorrect username or password.');
        return;
      }
      sessionStorage.removeItem(KEY);
      const { data } = await A.sb.rpc('my_profile'); const p = Array.isArray(data) ? data[0] : data;
      if (!p) { await A.sb.auth.signOut(); A.show(err, 'This account is not authorized.'); return; }
      await A.logActivity('Logged in', '');
      location.replace(p.must_change_password ? 'change-password.html' : A.homeFor(p.role));
    } catch (_) {
      A.show(err, 'Something went wrong. Please try again.');
    } finally { btn.disabled = false; btn.textContent = 'Log in'; $('#password').value = ''; }
  });
})();
