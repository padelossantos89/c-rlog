(async function () {
  'use strict';
  const A = window.App, $ = A.$;
  const checking = $('#checking-card'), done = $('#done-card'), form = $('#setup-form'), msg = $('#setup-msg'), btn = $('#setup-btn');
  try {
    const { data, error } = await A.sb.rpc('has_any_accounts'); if (error) throw error;
    checking.style.display = 'none'; (data ? done : form).style.display = 'block';
  } catch (_) { checking.querySelector('.sub').textContent = 'Cannot reach the server. Check your connection and reload.'; return; }

  form.addEventListener('submit', async e => {
    e.preventDefault(); A.show(msg, '');
    const username = A.cleanUser($('#username').value), pw = $('#password').value, pw2 = $('#confirmPassword').value, key = $('#setupKey').value;
    const bad = A.usernameError(username) || A.passwordError(pw) || (pw !== pw2 ? 'Passwords do not match.' : null);
    if (bad) { A.show(msg, bad); return; }
    btn.disabled = true; btn.textContent = 'Creating\u2026';
    try {
      await A.adminFn({ action: 'bootstrap', username, password: pw, setup_key: key });
      const { error } = await A.sb.auth.signInWithPassword({ email: A.emailOf(username), password: pw });
      if (error) throw new Error('Account created. Please sign in.');
      await A.logActivity('Logged in', '');
      location.replace('index.html');
    } catch (ex) {
      A.show(msg, ex.message || 'Setup failed.');
      if (/created/i.test(ex.message || '')) setTimeout(() => location.replace('login.html'), 1500);
    } finally { btn.disabled = false; btn.textContent = 'Create admin account'; $('#setupKey').value = ''; }
  });
})();
