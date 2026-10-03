(async function () {
  'use strict';
  const A = window.App, R = window.Records, $ = A.$;
  const me = await A.guard({ roles: ['admin'] });
  $('#admin-username').textContent = me.username;
  $('#logout-link').addEventListener('click', e => { e.preventDefault(); A.logout(); });
  A.initNav();
  const banner = $('#conn-banner');
  const fmtTime = s => (s ? new Date(s).toLocaleString() : '');

  /* ================= USERS ================= */
  let users = [];
  async function loadUsers() {
    try { users = await A.rpc('admin_list_users') || []; banner.textContent = ''; } catch (e) { banner.textContent = 'Could not load users. ' + e.message; }
    const body = $('#users-body'); body.textContent = '';
    users.forEach(u => {
      const tr = body.insertRow(), self = A.cleanUser(u.username) === A.cleanUser(me.username);
      tr.insertCell().textContent = u.username + (self ? ' (you)' : '');
      const rc = tr.insertCell();
      const sel = document.createElement('select'); ['office', 'field', 'admin'].forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; sel.appendChild(o); });
      sel.value = u.role; sel.disabled = self; sel.dataset.action = 'role'; sel.dataset.user = u.username; sel.setAttribute('aria-label', 'Role for ' + u.username); rc.appendChild(sel);
      tr.insertCell().textContent = u.must_change_password ? 'Must change on next login' : 'Set by user';
      tr.insertCell().textContent = fmtTime(u.created_at);
      const ac = tr.insertCell();
      const mk = (txt, act, cls, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ' + cls; b.textContent = txt; b.dataset.action = act; b.dataset.user = u.username; b.disabled = !!dis; ac.appendChild(b); };
      mk('Reset password', 'reset', 'ghost'); mk('Delete', 'delete', 'danger', self);
    });
  }
  $('#users-body').addEventListener('click', async e => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const user = b.dataset.user;
    try {
      if (b.dataset.action === 'reset') {
        const pw = window.prompt('New temporary password for "' + user + '" (min ' + A.config.MIN_PASSWORD + ' chars, letters + numbers). They must change it at next login:');
        if (pw === null) return;
        const bad = A.passwordError(pw); if (bad) { alert(bad); return; }
        await A.adminFn({ action: 'reset_password', username: user, password: pw }); alert('Password reset.');
      } else if (b.dataset.action === 'delete') {
        if (!confirm('Delete user "' + user + '"? This cannot be undone.')) return;
        await A.adminFn({ action: 'delete', username: user });
      }
      loadUsers();
    } catch (ex) { alert(ex.message); }
  });
  $('#users-body').addEventListener('change', async e => {
    const s = e.target.closest('select[data-action="role"]'); if (!s) return;
    try { await A.adminFn({ action: 'set_role', username: s.dataset.user, role: s.value }); } catch (ex) { alert(ex.message); }
    loadUsers();
  });
  $('#create-user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#create-error'), t = $('#create-toast'), btn = $('#create-user-btn');
    const username = A.cleanUser($('#newUsername').value), pw = $('#newTempPassword').value, role = $('#newRole').value;
    const bad = A.usernameError(username) || A.passwordError(pw); A.show(err, bad || ''); if (bad) return;
    btn.disabled = true;
    try { await A.adminFn({ action: 'create', username, password: pw, role }); e.target.reset(); A.toast(t, 'User created.'); loadUsers(); }
    catch (ex) { A.show(err, ex.message); } finally { btn.disabled = false; }
  });

  /* ================= ACTIVITY ================= */
  let acts = [];
  function renderActs() {
    const q = $('#act-search').value.trim().toLowerCase(), f = $('#act-from').value, t = $('#act-to').value;
    const body = $('#activity-body'); body.textContent = '';
    const list = acts.filter(a => {
      const d = a.created_at ? new Date(a.created_at) : null, day = d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';
      return (!f || day >= f) && (!t || day <= t) && (!q || [a.username, a.role, a.action, a.details].join(' ').toLowerCase().includes(q));
    });
    if (!list.length) { const c = body.insertRow().insertCell(); c.colSpan = 5; c.className = 'empty'; c.textContent = 'No activity found.'; return; }
    list.forEach(a => { const tr = body.insertRow(); [fmtTime(a.created_at), a.username, a.role, a.action, a.details].forEach(v => { tr.insertCell().textContent = v || ''; }); });
  }
  async function loadActs() { try { acts = await A.rpc('admin_list_activity', { p_limit: 2000 }) || []; } catch (e) { banner.textContent = 'Could not load activity. ' + e.message; } renderActs(); }
  ['act-search', 'act-from', 'act-to'].forEach(id => $('#' + id).addEventListener('input', renderActs));
  $('#act-clear-btn').addEventListener('click', () => { ['act-search', 'act-from', 'act-to'].forEach(id => { $('#' + id).value = ''; }); renderActs(); });
  $('#refresh-activity-btn').addEventListener('click', loadActs);

  /* ================= OVERALL RECORDS ================= */
  let all = [];
  const showErr = (id, m) => { const e = $('#' + id); e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; };
  function fill(sel, vals) { const keep = sel.value; sel.length = 1; vals.forEach(x => { const o = document.createElement('option'); o.value = x; o.textContent = x; sel.appendChild(o); }); sel.value = vals.includes(keep) ? keep : ''; }
  function ovFiltered() {
    const q = $('#ov-search').value.trim().toLowerCase(), off = $('#ov-office').value, town = $('#ov-town').value, type = $('#ov-type').value, st = $('#ov-status').value;
    const f = $('#ov-from').value, t = $('#ov-to').value, re = A.rangeError(f, t); showErr('ov-date-error', re);
    return all.filter(r => (!off || r.office === off) && (!town || r.town === town) && (!type || r.type_of_complaint === type) &&
      (!st || R.statusOf(r) === st) && (re || R.inRange(r, f, t)) &&
      (!q || [r.control_number, r.name_of_complainant, r.sitio_barangay, r.action_taken, r.description, r.office].join(' ').toLowerCase().includes(q)));
  }
  // ---------- Reusable pagination: default 10 per page ----------
  function makePaginator(barEl, pageSizeKey) {
    const state = { page: 1, pageSize: Number(sessionStorage.getItem(pageSizeKey)) || 10 };
    return { state, slice(rows) {
      const total = rows.length, pages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > pages) state.page = pages; if (state.page < 1) state.page = 1;
      const start = (state.page - 1) * state.pageSize, pageRows = rows.slice(start, start + state.pageSize);
      const from = total === 0 ? 0 : start + 1, to = Math.min(start + state.pageSize, total);
      barEl.innerHTML = '<label>Items per page: <select class="pg-size">' +
        [10, 25, 50, 100].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') +
        '</select></label><div class="pg-nav"><span>' + from + ' - ' + to + ' of ' + total + '</span>' +
        '<button class="pg-prev"' + (state.page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">‹</button>' +
        '<button class="pg-next"' + (state.page >= pages ? ' disabled' : '') + ' aria-label="Next page">›</button></div>';
      return pageRows;
    } };
  }
  function wirePaginator(barEl, paginator, rerender) {
    barEl.addEventListener('change', e => {
      if (!e.target.classList.contains('pg-size')) return;
      paginator.state.pageSize = Number(e.target.value); sessionStorage.setItem(barEl.dataset.pgkey, paginator.state.pageSize);
      paginator.state.page = 1; rerender();
    });
    barEl.addEventListener('click', e => {
      if (e.target.classList.contains('pg-prev')) { paginator.state.page--; rerender(); }
      else if (e.target.classList.contains('pg-next')) { paginator.state.page++; rerender(); }
    });
  }
  const ovPg = makePaginator($('#overall-pg'), 'ileco_pgsize_overall');
  $('#overall-pg').dataset.pgkey = 'ileco_pgsize_overall';
  wirePaginator($('#overall-pg'), ovPg, renderOverall);

  let overallSearched = false;
  function renderOverall() {
    if (!overallSearched) {
      $('#ov-stat-row').textContent = ''; $('#overall-pg').innerHTML = '';
      const body = $('#overall-body'); body.textContent = '';
      const tr = body.insertRow(), td = tr.insertCell();
      td.colSpan = document.querySelectorAll('#overall-table thead th').length; td.className = 'empty';
      td.textContent = 'Enter a search term or choose filters above, then click 🔍 Search.';
      return;
    }
    const full = ovFiltered(), done = full.filter(r => r.date_acted).length, box = $('#ov-stat-row'); box.textContent = '';
    [['Total', full.length], ['Completed', done], ['Pending', full.length - done]].forEach(([k, v]) => box.appendChild(A.statBox(k, v)));
    const l = ovPg.slice(full);
    R.render($('#overall-body'), l, { withOffice: true });
  }
  async function loadAll() {
    try { all = await A.rpc('admin_list_all_complaints') || []; $('#ov-banner').textContent = ''; } catch (e) { $('#ov-banner').textContent = 'Could not load records. ' + e.message; }
    fill($('#ov-office'), A.OFFICES); fill($('#ov-town'), [...new Set(all.map(r => r.town).filter(Boolean))].sort()); fill($('#ov-type'), [...new Set(all.map(r => r.type_of_complaint).filter(Boolean))].sort());
    overallSearched = true;
    renderOverall();
  }
  function runSearch() { ovPg.state.page = 1; if (!overallSearched) loadAll(); else renderOverall(); }
  ['ov-search', 'ov-office', 'ov-town', 'ov-type', 'ov-status', 'ov-from', 'ov-to'].forEach(id => $('#' + id).addEventListener('input', () => { if (overallSearched) { ovPg.state.page = 1; renderOverall(); } }));
  $('#ov-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
  $('#ov-search-btn').addEventListener('click', runSearch);
  $('#ov-refresh-btn').addEventListener('click', loadAll);
  function hook(btnId, fromId, toId, errId, full) {
    $('#' + btnId).addEventListener('click', async ev => {
      const f = $('#' + fromId).value, t = $('#' + toId).value, b = ev.currentTarget, re = A.rangeError(f, t); showErr(errId, re); if (re) return;
      const list = all.filter(r => R.inRange(r, f, t)); if (!list.length) { showErr(errId, 'No records in that date range.'); return; }
      b.disabled = true;
      try {
        await R.exportExcel({ rows: list, withOffice: true, full, filename: 'ILECO3_all_offices' + (full ? '_full' : '') + '_' + (f || 'start') + '_to_' + (t || 'latest') });
        A.logActivity('Downloaded Excel', 'All offices' + (full ? ' (full data)' : '') + ' \u00B7 ' + (f || 'start') + ' to ' + (t || 'latest') + ' \u00B7 ' + list.length + ' rows');
      } catch (x) { showErr(errId, x.message); } finally { b.disabled = false; }
    });
  }
  hook('ov-download-btn', 'ov-dl-from', 'ov-dl-to', 'ov-dl-error', false);
  hook('ov-download-all-btn', 'ov-full-from', 'ov-full-to', 'ov-full-error', true);

  loadUsers(); loadActs(); renderOverall(); // Overall Records waits for a search
})();
