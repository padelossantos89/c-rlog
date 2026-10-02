(async function () {
  'use strict';
  const A = window.App, R = window.Records, $ = A.$;
  const p = await A.guard({ roles: ['field', 'admin'] });
  $('#username').textContent = p.username;
  $('#logout').addEventListener('click', () => A.logout());

  const app = $('#app'), bg = $('#sheet-bg'), sheet = $('#sheet');
  let office = A.OFFICES[0], tab = 'pending', rows = [], q = '', cur = null;

  app.innerHTML =
    '<div class="bar"><select id="f-office" aria-label="Office"></select><button class="btn ghost" id="f-refresh" type="button">\u21BB</button></div>' +
    '<div class="bar"><input id="f-q" type="search" placeholder="Search control no., name, barangay\u2026" autocomplete="off"></div>' +
    '<div class="tabs"><button class="tab on" data-t="pending" type="button">Pending</button><button class="tab" data-t="done" type="button">Completed</button></div>' +
    '<div id="f-msg" class="field-note"></div><div id="f-list"></div>';
  const sel = $('#f-office'); A.OFFICES.forEach(o => { const e = document.createElement('option'); e.value = e.textContent = o; sel.appendChild(e); });

  async function load() {
    $('#f-msg').textContent = 'Loading\u2026';
    try { rows = await A.rpc('app_list_complaints', { p_office: office }) || []; $('#f-msg').textContent = ''; }
    catch (e) { $('#f-msg').textContent = e.message; rows = []; }
    list();
  }
  function list() {
    const box = $('#f-list'); box.textContent = '';
    const l = rows.filter(r => (tab === 'pending') === !r.date_acted && (!q || [r.control_number, r.name_of_complainant, r.sitio_barangay, r.description].join(' ').toLowerCase().includes(q))).reverse().slice(0, 300);
    if (!l.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = tab === 'pending' ? 'Nothing pending.' : 'No completed records.'; box.appendChild(d); return; }
    l.forEach(r => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item' + (r.date_acted ? ' done' : ''); b.dataset.cn = r.control_number;
      const mk = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; b.appendChild(d); };
      mk('cn', r.control_number); mk('who2', r.name_of_complainant || '(no name)');
      mk('sm2', [r.sitio_barangay, r.town].filter(Boolean).join(', ')); mk('sm2', [r.type_of_complaint, r.description].filter(Boolean).join(' \u00B7 '));
      mk('sm2', 'Received ' + (r.date_received || '') + ' ' + R.hm(r.time_received));
      box.appendChild(b);
    });
  }
  sel.addEventListener('change', () => { office = sel.value; load(); });
  $('#f-refresh').addEventListener('click', load);
  $('#f-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); list(); });
  app.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.t; app.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t)); list(); }));
  $('#f-list').addEventListener('click', e => { const b = e.target.closest('.item'); if (b) openSheet(rows.find(r => r.control_number === b.dataset.cn)); });

  /* ---- response sheet ---- */
  function openSheet(rec) {
    if (!rec) return; cur = rec;
    const E = A.esc;
    sheet.innerHTML =
      '<h2>' + E(rec.control_number) + '</h2><div class="sm2" style="color:var(--ink-soft);margin-bottom:12px">' + E(rec.name_of_complainant) + ' \u00B7 ' + E([rec.sitio_barangay, rec.town].filter(Boolean).join(', ')) + '<br>' + E([rec.type_of_complaint, rec.description].filter(Boolean).join(' \u00B7 ')) + '</div>' +
      '<div class="msg-box" id="s-err"></div>' +
      '<div class="row"><label for="s-by">Acted by</label><input id="s-by" maxlength="200" value="' + E(rec.acted_by) + '"></div>' +
      '<div class="row"><label for="s-act">Action taken</label><textarea id="s-act" rows="3" maxlength="1000">' + E(rec.action_taken) + '</textarea></div>' +
      '<div class="row"><label for="s-date">Date acted</label><input id="s-date" type="date" value="' + E(rec.date_acted || A.today()) + '"></div>' +
      '<div class="two"><div class="row"><label for="s-orig">Place of origin</label><input id="s-orig" maxlength="200" value="' + E(rec.place_of_origin) + '"></div><div class="row"><label for="s-arrp">Place of arrival</label><input id="s-arrp" maxlength="200" value="' + E(rec.place_of_arrival) + '"></div></div>' +
      '<div class="two"><div class="row"><label for="s-dep">Departure</label><input id="s-dep" type="time" value="' + E(R.hm(rec.departure_time)) + '"></div><div class="row"><label for="s-arr">Arrival</label><input id="s-arr" type="time" value="' + E(R.hm(rec.arrival_time)) + '"></div></div>' +
      '<div class="row"><label for="s-fin">Time finished</label><input id="s-fin" type="time" value="' + E(R.hm(rec.time_finished)) + '"></div>' +
      '<div class="calc"><div><b id="c-t">\u2013</b><span>Travel</span></div><div><b id="c-w">\u2013</b><span>Work</span></div><div><b id="c-s">\u2013</b><span>T+W</span></div><div><b id="c-d">\u2013</b><span>Duration</span></div><div><b id="c-n">\u2013</b><span>Net</span></div></div>' +
      '<div class="actions"><button class="btn ghost" id="s-cancel" type="button">Cancel</button><button class="btn primary" id="s-save" type="button">Save response</button></div>';
    bg.classList.add('open'); bg.setAttribute('aria-hidden', 'false');
    ['s-date', 's-dep', 's-arr', 's-fin'].forEach(id => $('#' + id).addEventListener('input', calc));
    $('#s-cancel').addEventListener('click', close); $('#s-save').addEventListener('click', save); calc();
  }
  function close() { bg.classList.remove('open'); bg.setAttribute('aria-hidden', 'true'); sheet.textContent = ''; cur = null; }
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) close(); });

  function calc() {
    const d = A.computeDurations({ dateReceived: cur.date_received, timeReceived: cur.time_received, dateActed: $('#s-date').value, departure: $('#s-dep').value, arrival: $('#s-arr').value, finished: $('#s-fin').value });
    const f = x => (x == null ? '\u2013' : x);
    $('#c-t').textContent = f(d.travel); $('#c-w').textContent = f(d.work); $('#c-s').textContent = f(d.sum); $('#c-d').textContent = f(d.duration); $('#c-n').textContent = f(d.net);
    return d;
  }
  async function save() {
    const err = $('#s-err'), v = id => $('#' + id).value.trim(); A.show(err, '');
    if (!v('s-by') || !v('s-act') || !v('s-date')) return A.show(err, 'Acted by, Action taken and Date acted are required.');
    const times = [v('s-dep'), v('s-arr'), v('s-fin')], given = times.filter(Boolean).length;
    if (given && given < 3) return A.show(err, 'Enter all three times or leave them all blank.');
    const d = calc(); if (given === 3 && d.duration == null) return A.show(err, 'Finish time cannot be before the time the complaint was received.');
    const row = Object.assign({}, cur, { acted_by: v('s-by'), action_taken: v('s-act'), date_acted: v('s-date'), place_of_origin: v('s-orig'), place_of_arrival: v('s-arrp'),
      departure_time: times[0] || null, arrival_time: times[1] || null, time_finished: times[2] || null,
      travel_time_min: d.travel, work_duration_min: d.work, travel_plus_work_min: d.sum, duration_min: d.duration, duration_less_travel: d.net });
    const btn = $('#s-save'); btn.disabled = true;
    try {
      const res = await A.rpc('app_update_complaint', { p_office: office, p_control_number: cur.control_number, p_row: row }), r = Array.isArray(res) ? res[0] : res;
      if (!r || !r.ok) throw new Error((r && r.error) || 'Could not save.');
      close(); load();
    } catch (ex) { A.show(err, ex.message); btn.disabled = false; }
  }
  load();
})();
