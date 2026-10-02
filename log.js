(async function () {
  'use strict';
  const A = window.App, R = window.Records, $ = A.$;

  const key = new URLSearchParams(location.search).get('branch');
  if (!key || !A.has(A.BRANCHES, key)) { location.replace('index.html'); return; }
  const B = A.BRANCHES[key];
  const profile = await A.guard({ roles: ['admin', 'office'] });

  // ---- header ----
  $('#branch-subtitle').textContent = B.office + ' \u00B7 Complaints & Field Response Log';
  $('#branch-address').textContent = B.address;
  const bc = $('#branch-contact'); bc.textContent = '';
  const st = document.createElement('strong'); st.textContent = 'ileco3@gmail.com'; bc.appendChild(st);
  if (B.email) bc.appendChild(document.createTextNode(' \u00B7 ' + B.email));
  $('#logout-link').addEventListener('click', e => { e.preventDefault(); A.logout(); });
  A.initNav();

  let rows = [], current = null;
  const banner = $('#conn-banner');

  async function load() {
    try { rows = await A.rpc('app_list_complaints', { p_office: B.office }) || []; banner.textContent = ''; }
    catch (e) { banner.textContent = 'Could not load records. ' + e.message; }
    renderAll();
  }

  // ---- complaint form ----
  const MAXLEN = { receivedBy: 200, complainant: 200, contactNumber: 60, sitio: 150, description: 1000, acctName: 200, acctNumber: 60, meterNumber: 60, serialNumber: 60, poleNumber: 60, actedBy: 200, action: 1000, origin: 200, arrivalPlace: 200, frControl: 40 };
  Object.keys(MAXLEN).forEach(id => { const el = $('#' + id); if (el) el.maxLength = MAXLEN[id]; });

  const bar = $('#barangay'), townMap = {};
  Object.keys(window.BARANGAYS || {}).forEach(t => window.BARANGAYS[t].forEach(b => { townMap[b] = t; const o = document.createElement('option'); o.value = b; o.textContent = b + ' (' + t + ')'; bar.appendChild(o); }));
  bar.addEventListener('change', () => { $('#town').value = townMap[bar.value] || ''; });

  function defaults() { $('#dateReceived').value = A.today(); $('#timeReceived').value = A.nowHM(); $('#town').value = ''; }
  defaults();
  $('#complaint-form').addEventListener('reset', () => setTimeout(defaults, 0));

  $('#complaint-form').addEventListener('submit', async e => {
    e.preventDefault();
    const t = $('#save-toast'), btn = e.submitter || $('#complaint-form button[type=submit]');
    const v = id => $('#' + id).value.trim();
    if (!A.isDate(v('dateReceived')) || !A.isTime(v('timeReceived'))) { A.toast(t, 'Enter a valid date and time.', true); return; }
    const row = {
      office: B.office, date_received: v('dateReceived'), time_received: v('timeReceived'), received_by: v('receivedBy'),
      name_of_complainant: v('complainant'), contact_number: v('contactNumber'),
      sitio_barangay: [v('sitio'), v('barangay')].filter(Boolean).join(', '), town: v('town'),
      type_of_complaint: v('type'), description: v('description'), account_name: v('acctName'), account_number: v('acctNumber'),
      meter_number: v('meterNumber'), serial_number: v('serialNumber'), pole_number: v('poleNumber')
    };
    btn.disabled = true;
    try {
      const res = await A.rpc('app_insert_complaint', { p_row: row }), r = Array.isArray(res) ? res[0] : res;
      if (!r || !r.ok) throw new Error((r && r.error) || 'Could not save.');
      $('#control-number-display').style.display = 'block'; $('#control-number-value').textContent = r.control_number;
      A.toast(t, 'Saved.');
      await load();
      $('#frControl').value = r.control_number; lookup(r.control_number);
      e.target.reset();
    } catch (ex) { A.toast(t, ex.message, true); } finally { btn.disabled = false; }
  });

  // ---- field response ----
  const FR = ['actedBy', 'action', 'dateActed', 'origin', 'arrivalPlace', 'departureTime', 'arrivalTime', 'finishTime'];
  const setEnabled = on => { FR.forEach(id => { $('#' + id).disabled = !on; }); $('#fr-submit-btn').disabled = !on; };
  const lookMsg = (m, ok) => { const el = $('#fr-lookup-msg'); el.textContent = m; el.className = ok ? 'ok' : 'err'; };

  function calc() {
    if (!current) return null;
    const d = A.computeDurations({ dateReceived: current.date_received, timeReceived: current.time_received, dateActed: $('#dateActed').value,
      departure: $('#departureTime').value, arrival: $('#arrivalTime').value, finished: $('#finishTime').value });
    const f = x => (x == null ? '\u2013' : x);
    $('#calcTravel').textContent = f(d.travel); $('#calcWork').textContent = f(d.work); $('#calcSum').textContent = f(d.sum);
    $('#calcDuration').textContent = f(d.duration); $('#calcNet').textContent = f(d.net);
    return d;
  }
  ['dateActed', 'departureTime', 'arrivalTime', 'finishTime'].forEach(id => $('#' + id).addEventListener('input', calc));

  async function lookup(cn) {
    cn = String(cn || '').trim().toUpperCase();
    if (!cn) return;
    let rec = rows.find(r => r.control_number === cn);
    if (!rec) { await load(); rec = rows.find(r => r.control_number === cn); }
    if (!rec) { current = null; setEnabled(false); lookMsg('No record with that Control Number in ' + B.office + '.', false); return; }
    current = rec; lookMsg('Record found.', true); setEnabled(true);
    $('#frControl').value = rec.control_number;
    $('#frComplainant').value = rec.name_of_complainant || ''; $('#frAddress').value = [rec.sitio_barangay, rec.town].filter(Boolean).join(', ');
    $('#actedBy').value = rec.acted_by || ''; $('#action').value = rec.action_taken || ''; $('#dateActed').value = rec.date_acted || A.today();
    $('#origin').value = rec.place_of_origin || ''; $('#arrivalPlace').value = rec.place_of_arrival || '';
    $('#departureTime').value = R.hm(rec.departure_time); $('#arrivalTime').value = R.hm(rec.arrival_time); $('#finishTime').value = R.hm(rec.time_finished);
    calc();
  }
  $('#frControl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookup(e.target.value); } });
  setEnabled(false);

  $('#fieldresponse-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#fr-validation-error'), t = $('#fr-save-toast'); err.style.display = 'none';
    const fail = m => { err.textContent = m; err.style.display = 'block'; };
    if (!current) return fail('Look up a Control Number first.');
    const v = id => $('#' + id).value.trim();
    if (!v('actedBy') || !v('action') || !v('dateActed')) return fail('Acted by, Action taken and Date acted are required.');
    const times = [v('departureTime'), v('arrivalTime'), v('finishTime')], given = times.filter(Boolean).length;
    if (given && given < 3) return fail('Enter all three times (departure, arrival, finished) or leave them all blank.');
    const d = calc();
    if (given === 3 && d.duration == null) return fail('Finish time cannot be before the time the complaint was received.');
    const row = Object.assign({}, current, {
      acted_by: v('actedBy'), action_taken: v('action'), date_acted: v('dateActed'), place_of_origin: v('origin'), place_of_arrival: v('arrivalPlace'),
      departure_time: times[0] || null, arrival_time: times[1] || null, time_finished: times[2] || null,
      travel_time_min: d.travel, work_duration_min: d.work, travel_plus_work_min: d.sum, duration_min: d.duration, duration_less_travel: d.net
    });
    $('#fr-submit-btn').disabled = true;
    try {
      const res = await A.rpc('app_update_complaint', { p_office: B.office, p_control_number: current.control_number, p_row: row }), r = Array.isArray(res) ? res[0] : res;
      if (!r || !r.ok) throw new Error((r && r.error) || 'Could not save.');
      A.toast(t, 'Field response saved.'); await load(); lookup(current.control_number);
    } catch (ex) { A.toast(t, ex.message, true); } finally { $('#fr-submit-btn').disabled = !current; }
  });

  // ---- records ----
  function filtered() {
    const q = $('#search-box').value.trim().toLowerCase(), town = $('#filter-town').value, type = $('#filter-type').value;
    const f = $('#filter-from-date').value, to = $('#filter-to-date').value, e = $('#tbl-date-error');
    const re = A.rangeError(f, to); e.textContent = re || ''; e.style.display = re ? 'block' : 'none';
    return rows.filter(r => (!town || r.town === town) && (!type || r.type_of_complaint === type) && (re || R.inRange(r, f, to)) &&
      (!q || [r.control_number, r.name_of_complainant, r.sitio_barangay, r.action_taken, r.description, r.town].join(' ').toLowerCase().includes(q)));
  }
  function fillSelect(sel, vals, all) { const keep = sel.value; sel.length = 1; vals.forEach(x => { const o = document.createElement('option'); o.value = x; o.textContent = x; sel.appendChild(o); }); sel.value = vals.includes(keep) ? keep : ''; }
  function stats(box, list) {
    const done = list.filter(r => r.date_acted).length, durs = list.map(r => r.duration_min).filter(x => x != null);
    const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : '\u2013';
    box.textContent = ''; [['Total', list.length], ['Completed', done], ['Pending', list.length - done], ['Avg duration (min)', avg]].forEach(([k, v]) => box.appendChild(A.statBox(k, v)));
  }
  function renderRecords() { const l = filtered().slice().reverse(); stats($('#stat-row'), l); R.render($('#records-body'), l); }

  // ---- summary ----
  const PALETTE = ['#F2A900', '#12202E', '#1E7A46', '#B3261E', '#3A6EA5', '#8A5A00', '#7A4E9B', '#5B6672'];
  function bar3d(svgId, legendId, list, field) {
    const svg = $('#' + svgId), leg = $('#' + legendId), NS = 'http://www.w3.org/2000/svg';
    svg.textContent = ''; leg.textContent = ''; leg.className = 'legend';
    const c = {}; list.forEach(r => { const k = r[field] || '(blank)'; c[k] = (c[k] || 0) + 1; });
    const ent = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!ent.length) { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 20); t.setAttribute('y', 40); t.textContent = 'No data'; svg.appendChild(t); return; }
    const max = ent[0][1], w = 480 / ent.length, bw = Math.min(40, w * .55), d = 8, base = 180;
    const mk = (tag, at) => { const el = document.createElementNS(NS, tag); Object.keys(at).forEach(k => el.setAttribute(k, at[k])); svg.appendChild(el); return el; };
    ent.forEach(([name, n], i) => {
      const x = i * w + (w - bw) / 2, h = Math.max(4, (n / max) * 130), y = base - h, col = PALETTE[i % PALETTE.length];
      mk('rect', { x, y, width: bw, height: h, fill: col });
      mk('polygon', { points: [x, y, x + d, y - d, x + bw + d, y - d, x + bw, y].join(' '), fill: col, opacity: .75 });
      mk('polygon', { points: [x + bw, y, x + bw + d, y - d, x + bw + d, base - d, x + bw, base].join(' '), fill: col, opacity: .55 });
      mk('text', { x: x + bw / 2, y: y - d - 3, 'text-anchor': 'middle' }).textContent = n;
      mk('text', { x: x + bw / 2, y: base + 14, 'text-anchor': 'middle' }).textContent = name.length > 9 ? name.slice(0, 8) + '\u2026' : name;
      const s = document.createElement('span'), ch = document.createElement('i'); ch.style.background = col; s.appendChild(ch); s.appendChild(document.createTextNode(name + ' (' + n + ')')); leg.appendChild(s);
    });
  }
  function summaryList() {
    const f = $('#summary-from-date').value, t = $('#summary-to-date').value, e = $('#summary-date-error');
    const re = A.rangeError(f, t); e.textContent = re || ''; e.style.display = re ? 'block' : 'none';
    return re ? rows : rows.filter(r => R.inRange(r, f, t));
  }
  function renderSummary() {
    const l = summaryList(); stats($('#summary-stats'), l);
    bar3d('bar3d-town', 'bar3d-town-legend', l, 'town'); bar3d('bar3d-type', 'bar3d-type-legend', l, 'type_of_complaint');
    bar3d('bar3d-barangay', 'bar3d-barangay-legend', l.map(r => ({ b: (r.sitio_barangay || '').split(',').pop().trim() })), 'b');
  }
  function renderAll() {
    fillSelect($('#filter-town'), [...new Set(rows.map(r => r.town).filter(Boolean))].sort());
    fillSelect($('#filter-type'), [...new Set(rows.map(r => r.type_of_complaint).filter(Boolean))].sort());
    renderRecords(); renderSummary();
  }
  ['search-box', 'filter-town', 'filter-type', 'filter-from-date', 'filter-to-date'].forEach(id => $('#' + id).addEventListener('input', renderRecords));
  ['summary-from-date', 'summary-to-date'].forEach(id => $('#' + id).addEventListener('input', renderSummary));
  $('#refresh-btn').addEventListener('click', load);

  // ---- downloads ----
  function hook(btnId, fromId, toId, errId, full) {
    $('#' + btnId).addEventListener('click', async ev => {
      const f = $('#' + fromId).value, t = $('#' + toId).value, e = $('#' + errId), b = ev.currentTarget;
      const re = A.rangeError(f, t); e.textContent = re || ''; e.style.display = re ? 'block' : 'none'; if (re) return;
      const list = rows.filter(r => R.inRange(r, f, t));
      if (!list.length) { e.textContent = 'No records in that date range.'; e.style.display = 'block'; return; }
      b.disabled = true;
      try {
        await R.exportExcel({ rows: list, full, filename: 'ILECO3_' + B.office + (full ? '_full' : '') + '_' + (f || 'start') + '_to_' + (t || 'latest') });
        A.logActivity('Downloaded Excel', B.office + (full ? ' (full data)' : '') + ' \u00B7 ' + (f || 'start') + ' to ' + (t || 'latest') + ' \u00B7 ' + list.length + ' rows');
      } catch (x) { e.textContent = x.message; e.style.display = 'block'; } finally { b.disabled = false; }
    });
  }
  hook('download-btn', 'dl-from-date', 'dl-to-date', 'dl-date-error', false);
  hook('download-all-btn', 'full-from-date', 'full-to-date', 'full-date-error', true);
  hook('summary-download-btn', 'summary-dl-from-date', 'summary-dl-to-date', 'summary-dl-date-error', false);
  hook('summary-download-all-btn', 'summary-full-from-date', 'summary-full-to-date', 'summary-full-date-error', true);

  load();
})();
