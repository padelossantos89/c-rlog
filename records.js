/* Record table rendering + Excel export shared by log, admin and field pages. */
(function () {
  'use strict';
  const hm = v => (v ? String(v).slice(0, 5) : '');
  const statusOf = r => (r.date_acted ? 'Completed' : 'Pending');
  const n = v => (v === null || v === undefined ? '' : v);

  // [header, getter, isNumber]
  const COLS = [
    ['Control No.', r => r.control_number], ['Status', statusOf],
    ['Date received', r => r.date_received || ''], ['Time received', r => hm(r.time_received)],
    ['Received by', r => r.received_by || ''], ['Complainant', r => r.name_of_complainant || ''],
    ['Contact No.', r => r.contact_number || ''], ['Sitio / Barangay', r => r.sitio_barangay || ''],
    ['Town', r => r.town || ''], ['Type', r => r.type_of_complaint || ''], ['Description', r => r.description || ''],
    ['Account name', r => r.account_name || ''], ['Account no.', r => r.account_number || ''],
    ['Meter no.', r => r.meter_number || ''], ['Serial no.', r => r.serial_number || ''], ['Pole no.', r => r.pole_number || ''],
    ['Acted by', r => r.acted_by || ''], ['Action taken', r => r.action_taken || ''], ['Date acted', r => r.date_acted || ''],
    ['Place of origin', r => r.place_of_origin || ''], ['Departure', r => hm(r.departure_time)],
    ['Place of arrival', r => r.place_of_arrival || ''], ['Arrival', r => hm(r.arrival_time)], ['Finished', r => hm(r.time_finished)],
    ['Travel (min)', r => n(r.travel_time_min), 1], ['Work (min)', r => n(r.work_duration_min), 1],
    ['Travel + Work (min)', r => n(r.travel_plus_work_min), 1], ['Duration (min)', r => n(r.duration_min), 1],
    ['Net duration (min)', r => n(r.duration_less_travel), 1]
  ];
  const FULL_FIELDS = ['id', 'office', 'control_number', 'date_received', 'time_received', 'received_by', 'name_of_complainant',
    'contact_number', 'sitio_barangay', 'town', 'type_of_complaint', 'description', 'account_name', 'account_number',
    'meter_number', 'serial_number', 'pole_number', 'acted_by', 'action_taken', 'date_acted', 'place_of_origin',
    'departure_time', 'place_of_arrival', 'arrival_time', 'time_finished', 'travel_time_min', 'work_duration_min',
    'travel_plus_work_min', 'duration_min', 'duration_less_travel', 'created_at', 'updated_at'];

  const inRange = (r, from, to) => { const d = r.date_received || ''; if (from && d < from) return false; if (to && d > to) return false; return true; };

  function render(tbody, rows, opts) {
    opts = opts || {};
    const limit = opts.limit || 1000, span = COLS.length + 1 + (opts.withOffice ? 1 : 0);
    tbody.textContent = '';
    if (!rows.length) { const tr = tbody.insertRow(), td = tr.insertCell(); td.colSpan = span; td.className = 'empty'; td.textContent = 'No records found.'; return; }
    const frag = document.createDocumentFragment();
    rows.slice(0, limit).forEach((r, i) => {
      const tr = document.createElement('tr');
      const add = (v, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = v; td.title = v; tr.appendChild(td); return td; };
      add((opts.offset || 0) + i + 1);
      if (opts.withOffice) add(r.office || '');
      COLS.forEach(c => {
        if (c[0] === 'Status') {
          const td = document.createElement('td'), s = document.createElement('span'), v = statusOf(r);
          s.className = 'pill ' + (v === 'Completed' ? 'done' : 'pend'); s.textContent = v; td.appendChild(s); tr.appendChild(td);
        } else add(c[1](r), c[2] ? 'num' : '');
      });
      frag.appendChild(tr);
    });
    if (rows.length > limit) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = span; td.className = 'empty'; td.textContent = 'Showing first ' + limit + ' of ' + rows.length + ' — narrow the filters or download Excel for everything.'; tr.appendChild(td); frag.appendChild(tr); }
    tbody.appendChild(frag);
  }

  async function exportExcel(o) {
    if (!window.ExcelJS) throw new Error('Excel library failed to load.');
    const wb = new ExcelJS.Workbook(); wb.creator = 'ILECO III';
    const ws = wb.addWorksheet(o.full ? 'Full Data' : 'Records');
    let headers, getters;
    if (o.full) { headers = FULL_FIELDS; getters = FULL_FIELDS.map(f => r => n(r[f])); }
    else {
      headers = ['No'].concat(o.withOffice ? ['Office'] : [], COLS.map(c => c[0]));
      getters = [null].concat(o.withOffice ? [r => r.office || ''] : [], COLS.map(c => c[1]));
    }
    ws.addRow(headers);
    // ExcelJS stores strings as plain text (never formulas), so cell values cannot inject formulas.
    o.rows.forEach((r, i) => ws.addRow(getters.map((g, k) => (g ? g(r) : i + 1))));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12202E' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    ws.columns.forEach((col, k) => { col.width = Math.min(Math.max(String(headers[k]).length + 3, 12), 40); });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = String(o.filename || 'ILECO3').replace(/[^\w.\-]+/g, '_') + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  window.Records = { COLS, FULL_FIELDS, statusOf, inRange, render, exportExcel, hm };
})();
