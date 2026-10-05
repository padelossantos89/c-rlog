(async function () {
  'use strict';
  const A = window.App, $ = A.$, $$ = A.$$;
  const p = await A.guard({ roles: ['admin', 'office', 'field'] });

  /* ---------- admins / office staff: unchanged ---------- */
  if (p.role !== 'field') {
    if (p.role === 'admin') $('#admin-link').style.display = 'inline';
    $('#logout-link').addEventListener('click', e => { e.preventDefault(); A.logout(); });
    return;
  }

  /* ---------- field crew: phone layout with pending counts ---------- */
  document.documentElement.classList.add('field-mode');

  const bar = $('header.top'); bar.className = 'top fieldbar'; bar.textContent = '';
  const mark = document.createElement('div'); mark.className = 'mark';
  const who = document.createElement('div'); who.className = 'who';
  const b = document.createElement('b'); b.textContent = 'Iloilo III Electric Cooperative, Inc.';
  const sm = document.createElement('small'); sm.textContent = 'Field crew \u00B7 ' + p.username;
  who.append(b, sm);
  const out = document.createElement('button'); out.type = 'button'; out.className = 'out'; out.textContent = 'Log out';
  out.addEventListener('click', () => A.logout());
  bar.append(mark, who, out);

  // each office opens its pending list (field.html) instead of the full log
  $$('a.card[data-office]').forEach(a => { a.href = a.getAttribute('href').replace('log.html', 'field.html'); });

  async function loadCounts() {
    await Promise.all($$('a.card[data-office]').map(async a => {
      const pill = $('.pend', a);
      try {
        const rows = (await A.rpc('app_list_complaints', { p_office: a.dataset.office })) || [];
        const n = rows.filter(r => !r.date_acted).length;
        pill.textContent = n + ' pending';
        pill.className = 'pend field-only ' + (n ? 'has' : 'zero');
      } catch (_) { pill.textContent = '\u2013'; pill.className = 'pend field-only'; }
    }));
  }
  loadCounts();
  window.addEventListener('pageshow', e => { if (e.persisted) loadCounts(); });   // back button -> fresh counts
})();
