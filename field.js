(async function () {
  'use strict';
  const A = window.App, $ = A.$;
  const p = await A.guard({ roles: ['field', 'admin'] });
  const key = new URLSearchParams(location.search).get('branch');
  if (!A.has(A.BRANCHES, key)) { location.replace('index.html'); return; }   // no office chosen -> back to the picker

  const office = A.BRANCHES[key].office;
  $('#username').textContent = p.username;
  $('#logout').addEventListener('click', () => A.logout());
  $('#office-name').textContent = office;
  $('#fab').href = 'log.html?branch=' + encodeURIComponent(key);
  document.title = 'ILECO III \u00B7 ' + office + ' \u00B7 Pending';

  let rows = [], q = '';
  const MAX = 300;

  const fmtD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? (+m[2]) + '/' + (+m[3]) + '/' + m[1] : (s || ''); };
  const fmtT = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); if (!m) return ''; let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  async function load() {
    const msg = $('#f-msg'), btn = $('#f-refresh');
    msg.className = 'note'; msg.textContent = 'Loading\u2026'; btn.disabled = true;
    try { rows = (await A.rpc('app_list_complaints', { p_office: office })) || []; msg.textContent = ''; }
    catch (e) { rows = []; msg.className = 'note err'; msg.textContent = e.message; }
    finally { btn.disabled = false; }
    draw();
  }

  function draw() {
    const pending = rows.filter(r => !r.date_acted);
    $('#f-count').textContent = pending.length;
    const list = pending.filter(r => !q || [r.control_number, r.name_of_complainant, r.sitio_barangay, r.town, r.contact_number, r.type_of_complaint, r.description].join(' ').toLowerCase().includes(q)).reverse();
    const box = $('#f-list'); box.textContent = '';
    if (!list.length) { box.appendChild(el('div', 'empty', q ? 'No matches.' : 'Nothing pending.')); return; }

    list.slice(0, MAX).forEach(r => {
      const a = el('a', 'item');
      a.href = 'log.html?branch=' + encodeURIComponent(key) + '&cn=' + encodeURIComponent(r.control_number);
      const top = el('div', 'top2'); top.append(el('span', 'cn', r.control_number), el('span', 'pill pend', 'Pending')); a.appendChild(top);
      a.appendChild(el('div', 'nm', r.name_of_complainant || '(no name)'));
      const addr = [r.sitio_barangay, r.town].filter(Boolean).join(', '); if (addr) a.appendChild(el('div', 'ad', addr));
      if (r.contact_number) a.appendChild(el('div', 'ph', '\uD83D\uDCDE ' + r.contact_number));
      const mt = el('div', 'mt'); mt.append(el('b', '', r.type_of_complaint || ''), el('span', '', [fmtD(r.date_received), fmtT(r.time_received)].filter(Boolean).join(' \u00B7 '))); a.appendChild(mt);
      if (r.description) a.appendChild(el('div', 'ds', r.description));

      const bill = [['Account name', r.account_name], ['Account no.', r.account_number], ['Meter no.', r.meter_number], ['Serial no.', r.serial_number], ['Pole no.', r.pole_number]].filter(x => x[1]);
      if (bill.length) {
        const bx = el('div', 'bill'); bx.appendChild(el('h3', '', 'Bill details'));
        bill.forEach(([k, v]) => { const row = el('div'); row.append(el('span', '', k), el('b', '', v)); bx.appendChild(row); });
        a.appendChild(bx);
      }
      a.appendChild(el('div', 'go', 'Fill in field response \u203A'));
      box.appendChild(a);
    });
    if (list.length > MAX) box.appendChild(el('div', 'empty', 'Showing the newest ' + MAX + ' of ' + list.length + ' \u2014 use search to narrow down.'));
  }

  $('#f-refresh').addEventListener('click', load);
  $('#f-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
  window.addEventListener('pageshow', e => { if (e.persisted) load(); });   // coming back from the log page -> fresh list
  load();
})();
