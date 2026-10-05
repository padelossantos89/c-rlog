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

  /* ---- "Items per page" pager — same look and behaviour as the log page's Records table ---- */
  function makePager(barId, storeKey, rerender) {
    const bar = $('#' + barId);
    const pg = { page: 1, size: (function () { try { return Number(sessionStorage.getItem(storeKey)) || 10; } catch (_) { return 10; } })() };
    const mk = (cls, txt, label, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.setAttribute('aria-label', label); b.disabled = dis; return b; };
    bar.addEventListener('change', e => {
      if (!e.target.classList.contains('pg-size')) return;
      pg.size = Number(e.target.value); pg.page = 1;
      try { sessionStorage.setItem(storeKey, pg.size); } catch (_) {}
      rerender();
    });
    bar.addEventListener('click', e => {
      if (e.target.classList.contains('pg-prev')) { pg.page--; rerender(); }
      else if (e.target.classList.contains('pg-next')) { pg.page++; rerender(); }
    });
    return {
      reset() { pg.page = 1; },
      // Draws the bar for `total` rows and returns the slice bounds for the current page.
      draw(total) {
        const pages = Math.max(1, Math.ceil(total / pg.size));
        pg.page = Math.min(Math.max(pg.page, 1), pages);
        const start = (pg.page - 1) * pg.size, end = Math.min(start + pg.size, total);
        bar.textContent = '';
        const lab = document.createElement('label'); lab.textContent = 'Items per page: ';
        const sel = document.createElement('select'); sel.className = 'pg-size'; sel.setAttribute('aria-label', 'Items per page');
        [10, 25, 50, 100].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; o.selected = n === pg.size; sel.appendChild(o); });
        lab.appendChild(sel);
        const nav = document.createElement('div'); nav.className = 'pg-nav';
        const info = document.createElement('span'); info.textContent = (total ? start + 1 : 0) + ' - ' + end + ' of ' + total;
        nav.append(info, mk('pg-prev', '\u2039', 'Previous page', pg.page <= 1), mk('pg-next', '\u203A', 'Next page', pg.page >= pages));
        bar.append(lab, nav);
        return { start, end };
      }
    };
  }

  /* ================= ACTIVITY ================= */
  let acts = [];
  const actPager = makePager('activity-pg', 'ileco_pgsize_activity', renderActs);
  function renderActs() {
    const q = $('#act-search').value.trim().toLowerCase(), f = $('#act-from').value, t = $('#act-to').value;
    const body = $('#activity-body'); body.textContent = '';
    const list = acts.filter(a => {
      const d = a.created_at ? new Date(a.created_at) : null, day = d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';
      return (!f || day >= f) && (!t || day <= t) && (!q || [a.username, a.role, a.action, a.details].join(' ').toLowerCase().includes(q));
    });
    const pr = actPager.draw(list.length);
    if (!list.length) { const c = body.insertRow().insertCell(); c.colSpan = 5; c.className = 'empty'; c.textContent = 'No activity found.'; return; }
    list.slice(pr.start, pr.end).forEach(a => { const tr = body.insertRow(); [fmtTime(a.created_at), a.username, a.role, a.action, a.details].forEach(v => { tr.insertCell().textContent = v || ''; }); });
  }
  async function loadActs() { try { acts = await A.rpc('admin_list_activity', { p_limit: 2000 }) || []; } catch (e) { banner.textContent = 'Could not load activity. ' + e.message; } renderActs(); }
  ['act-search', 'act-from', 'act-to'].forEach(id => $('#' + id).addEventListener('input', () => { actPager.reset(); renderActs(); }));
  $('#act-clear-btn').addEventListener('click', () => { ['act-search', 'act-from', 'act-to'].forEach(id => { $('#' + id).value = ''; }); actPager.reset(); renderActs(); });
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
  const ovPager = makePager('overall-pg', 'ileco_pgsize_overall', renderOverall);
  function renderOverall() {
    const l = ovFiltered(), done = l.filter(r => r.date_acted).length, box = $('#ov-stat-row'); box.textContent = '';
    [['Total', l.length], ['Completed', done], ['Pending', l.length - done]].forEach(([k, v]) => box.appendChild(A.statBox(k, v)));
    const pr = ovPager.draw(l.length);   // stats above always cover the full filtered set
    R.render($('#overall-body'), l.slice(pr.start, pr.end), { withOffice: true, offset: pr.start });
  }
  const refilter = () => { ovPager.reset(); renderOverall(); };
  async function loadAll() {
    try { all = await A.rpc('admin_list_all_complaints') || []; $('#ov-banner').textContent = ''; } catch (e) { $('#ov-banner').textContent = 'Could not load records. ' + e.message; }
    fill($('#ov-office'), A.OFFICES); fill($('#ov-town'), [...new Set(all.map(r => r.town).filter(Boolean))].sort()); fill($('#ov-type'), [...new Set(all.map(r => r.type_of_complaint).filter(Boolean))].sort());
    renderOverall();
  }
  ['ov-search', 'ov-office', 'ov-town', 'ov-type', 'ov-status', 'ov-from', 'ov-to'].forEach(id => $('#' + id).addEventListener('input', refilter));
  $('#ov-search-btn').addEventListener('click', refilter);
  $('#ov-refresh-btn').addEventListener('click', loadAll);
  // Overall Records Excel — same workbook layout for both buttons (matches the approved sample files).
  function hook(btnId, fromId, toId, errId, tag, basic) {
    $('#' + btnId).addEventListener('click', async ev => {
      const f = $('#' + fromId).value, t = $('#' + toId).value, b = ev.currentTarget;
      let msg = null;
      if (f && t && f > t) msg = 'Invalid date range: From Date cannot be later than To Date.';
      else if ((f && !t) || (!f && t)) msg = 'Enter both a From Date and To Date to choose what to download.';
      showErr(errId, msg); if (msg) return;
      if (typeof ExcelJS === 'undefined') { showErr(errId, 'The Excel export library is still loading \u2014 try again in a moment.'); return; }
      const X = IlecoExcel, recs = X.recordsFromDb(all), hasRange = !!(f && t);
      const rows = hasRange ? recs.filter(r => X.inRange(r, f, t)) : recs;
      b.disabled = true;
      try {
        const cfg = basic
          ? { columns: X.OVERALL_BASIC_COLUMNS, widths: X.OVERALL_BASIC_WIDTHS, banner: X.BANNER_OVERALL_BASIC, layout: X.LAYOUT_OVERALL_BASIC }
          : { columns: X.OVERALL_COLUMNS, widths: X.OVERALL_WIDTHS, banner: X.BANNER_OVERALL };
        await X.build(Object.assign({ rows, branchLabel: 'OVERALL RECORDS \u2014 ALL OFFICES', fileSlug: 'All-Offices', filenameTag: tag, from: f, to: t }, cfg));
        A.logActivity('Downloaded Excel', 'All offices \u2014 ' + tag + ' \u2014 ' + (hasRange ? f + ' to ' + t : 'all records') + ' (' + rows.length + ' rows)');
      } catch (x) { showErr(errId, 'Could not create the Excel file: ' + x.message); } finally { b.disabled = false; }
    });
  }
  // "Download Excel" (top right) = the sample layout (22 columns); "(Full Data)" = every column (31 columns).
  hook('ov-download-btn', 'ov-dl-from', 'ov-dl-to', 'ov-dl-error', 'Overall_Records', true);
  hook('ov-download-all-btn', 'ov-full-from', 'ov-full-to', 'ov-full-error', 'Overall_Records_Full', false);

  loadUsers(); loadActs(); loadAll();
})();
