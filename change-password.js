(async function () {
  'use strict';
  const A = window.App, $ = A.$;
  const p = await A.guard({ allowMustChange: true });
  const form = $('#cp-form'), msg = $('#cp-msg'), btn = $('#cp-btn');
  form.addEventListener('submit', async e => {
    e.preventDefault(); A.show(msg, '');
    const oldPw = $('#oldPassword').value, pw = $('#newPassword').value, pw2 = $('#confirmPassword').value;
    const bad = A.passwordError(pw) || (pw !== pw2 ? 'New passwords do not match.' : null) || (pw === oldPw ? 'New password must be different from the current one.' : null);
    if (bad) { A.show(msg, bad); return; }
    btn.disabled = true; btn.textContent = 'Saving\u2026';
    try {
      // Re-verify the current password before allowing the change.
      const { error: e1 } = await A.sb.auth.signInWithPassword({ email: A.emailOf(p.username), password: oldPw });
      if (e1) throw new Error('Current password is incorrect.');
      const { error: e2 } = await A.sb.auth.updateUser({ password: pw });
      if (e2) throw new Error(e2.message && /weak|pwned|breach|common/i.test(e2.message) ? 'That password is too weak or has appeared in a data breach. Choose another.' : 'Could not change the password.');
      await A.rpc('mark_password_changed');
      A.show(msg, 'Password updated. Redirecting\u2026', true);
      setTimeout(() => location.replace(A.homeFor(p.role)), 700);
    } catch (ex) { A.show(msg, ex.message || 'Could not change the password.'); }
    finally { btn.disabled = false; btn.textContent = 'Save new password'; $('#oldPassword').value = ''; }
  });
})();
