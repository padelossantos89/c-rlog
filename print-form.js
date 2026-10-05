/* Print preview for the Complaint Form (FO-AO-08) and Request Form (FO-AO-10).
   - Complaint types (SD, K, LF, B, P, T, LV, OP) print on the Complaint Form.
   - Request types (O1-O11) print on the Request Form.
   - The box for the record's type is ticked; everything else comes from the saved record.
   Usage (from log.js):  IlecoPrint.setRecord(record)  -> enables every [data-print-btn] button.
   Nothing is sent anywhere: the form is built in the page and printed with the browser's own
   print dialog, which lists every installed and network printer. */
(function () {
  'use strict';
  const A = window.App, E = A.esc;

  /* ---------- the checkbox lists (labels copied from the Excel forms) ---------- */
  const L = {
    SD1: 'SD1 - Cut-off', SD2: 'SD2 - Loose Connection', SD3: 'SD3 - Sagging', SD4: 'SD4 - Sparking',
    K1: 'K1 - Damaged/Burned/Stopped', K2: 'K2 - Defective',
    LF1: 'LF1 - Vegetation, Animal Contact, Lightning, and Damage on Hardwares', LF2: 'LF2 - Broken Insulator',
    LF3: 'LF3 - Transformer Loose Connection', LF4: 'LF4 - Others (Private Transformer)',
    B1: 'B1 - No bill', B2: 'B2 - For adjustment of Bill', B3: 'B3 - For cancellation of Bill/not used', B4: 'B4 - Sudden Increase/Correct Reading',
    P1: 'P1 - Leaning', P2: 'P2 - Rotten', P3: 'P3 - Burned', P4: 'P4 - Toppled',
    T1: 'T1 - Busted Transformer',
    LV1: 'LV1 - Over extended lines', LV2: 'LV2 - Loose Connection on Primary/Secondary Lines', LV3: 'LV3 - Others',
    OP1: 'OP1 - ',
    O1: 'O1 - Calibration', O2: 'O2 - Transfer of kWh & SDI', O3: 'O3 - Clearing/Rehab/Relocation of Down Guy',
    O4: 'O4 - Temporary Disco', O5: 'O5 - Correction of Account Name / Type of Consumer & Others',
    O6: 'O6 - Change of Family Name (Change Status)', O7: 'O7 - Retirement of Transformer', O8: 'O8 - Debit/Credit Memo',
    O9: 'O9 - Transfer of Pole', O10: 'O10 - Refund of Energy Deposit', O11: 'O11 - Change/Upgrade of SDI'
  };
  const grp = (h, items, two) => ({ h, items, two: !!two });
  const FORMS = {
    complaint: {
      code: 'FO-AO-08', title: 'Complaint Form', nature: 'NATURE OF COMPLAINTS', sig: 'Signature of Complainant:',
      cols: 'c3',
      layout: [
        [grp('1.) SDI', ['SD1', 'SD2', 'SD3', 'SD4'], true), grp('2.) KWH METER', ['K1', 'K2']), grp('3.) LINE FAULT', ['LF1', 'LF2', 'LF3', 'LF4'])],
        [grp('4.) BILL', ['B1', 'B2', 'B3', 'B4'])],
        [grp('5.) POLE', ['P1', 'P2', 'P3', 'P4'], true), grp('6.) TRANSFORMER', ['T1']), grp('7.) LOW VOLTAGE', ['LV1', 'LV2', 'LV3']), grp('8.) OTHERS, PLS SPECIFY', ['OP1'])]
      ]
    },
    request: {
      code: 'FO-AO-10', title: 'Request Form', nature: 'NATURE OF REQUESTS', sig: 'Signature:',
      cols: 'c2',
      layout: [
        [grp('', ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8'])],
        [grp('', ['O9', 'O10', 'O11'])]
      ]
    }
  };
  const formKindOf = code => (/^O\d+$/i.test(String(code || '').trim()) ? 'request' : 'complaint');

  const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l3 3L10.5 2.5" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- small helpers ---------- */
  // "1:02 PM" -> { t: '1:02', p: 'PM' }
  function timeParts(s) {
    const m = String(s || '').trim().match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i);
    return m ? { t: m[1], p: m[2].toUpperCase() } : { t: String(s || '').trim(), p: '' };
  }
  const ap = p => '<span class="pf-ap"><b' + (p === 'AM' ? ' class="sel"' : '') + '>AM</b>/<b' + (p === 'PM' ? ' class="sel"' : '') + '>PM</b></span>';
  const val = (v, cls) => '<span class="pf-v' + (cls ? ' ' + cls : '') + '">' + E(v) + '</span>';
  const lab = t => '<span class="pf-l">' + E(t) + '</span>';
  const timeCell = s => { const x = timeParts(s); return '<span class="pf-time">' + E(x.t) + '</span>' + ap(x.p); };

  function cbHtml(code, rec, kind) {
    const on = String(rec['Type of Complaint'] || '').trim().toUpperCase() === code;
    let label = E(L[code]);
    if (code === 'OP1') label += '<span class="pf-op">' + (on ? E(rec['Description of Complaint'] || '') : '') + '</span>';
    return '<div class="pf-cb' + (on ? ' on' : '') + '"><span class="pf-box">' + (on ? CHECK : '') + '</span><span class="pf-lbl">' + label + '</span></div>';
  }
  function natureHtml(def, rec) {
    return '<div class="pf-cols ' + def.cols + '">' + def.layout.map(col =>
      '<div>' + col.map(g =>
        '<div class="pf-grp">' + (g.h ? '<div class="pf-gh">' + E(g.h) + '</div>' : '') +
        '<div class="pf-items' + (g.two ? ' two' : '') + '">' + g.items.map(c => cbHtml(c, rec)).join('') + '</div></div>'
      ).join('') + '</div>'
    ).join('') + '</div>';
  }

  function formHtml(rec) {
    const kind = formKindOf(rec['Type of Complaint']), def = FORMS[kind];
    const addr = [rec['Sitio/Barangay'], rec['Town']].filter(Boolean).join(', ');
    const rcv = timeParts(rec['Time Received']), dep = timeParts(rec['Departure Time']), arr = timeParts(rec['Arrival Time']), fin = timeParts(rec['Time Finished']);
    return '<div class="pf" data-kind="' + kind + '">' +
      '<img class="pf-hdr" src="form-header.png" alt="Iloilo III Electric Cooperative, Inc.">' +
      '<div class="pf-doc"><span>Effectivity Date: <b>September 1, 2026</b></span><span>Rev. No.: <b>02</b></span><span>Document Code: <b>' + def.code + '</b></span></div>' +
      '<div class="pf-title">' + def.title + '</div>' +
      '<div class="pf-ctl">Control # : <span class="pf-ctlv">' + E(rec['Control Number'] || '') + '</span></div>' +
      '<div class="pf-body">' +
        '<div class="pf-row">' + lab('Date Received:') + val(rec['Date Received'], 'f15') + lab('Time Received:') + '<span class="pf-time" style="min-width:52px">' + E(rcv.t) + '</span>' + ap(rcv.p) + lab('Received by:') + val(rec['Received By'], 'f2') + '</div>' +
        '<div class="pf-row">' + lab('Name of Consumer:') + val(rec['Name of Complainant'], 'f3') + lab(def.sig) + val('', 'f2') + '</div>' +
        '<div class="pf-row">' + lab('Address:') + val(addr, 'f3') + lab('Contact # :') + val(rec['Contact Number'], 'f15') + lab('Account # :') + val(rec['Account Number'], 'f15') + '</div>' +
        '<div class="pf-row">' + lab('Meter # :') + val(rec['Meter Number'], 'f15') + lab('Pole # :') + val(rec['Pole Number'], 'f15') + '<span style="flex:2"></span></div>' +
        '<div class="pf-nature">' + def.nature + '</div>' +
        natureHtml(def, rec) +
        '<div class="pf-row">' + lab('Referred to:') + val('', 'f2') + lab('Acknowledgement :') + val('', 'f2') + '</div>' +
        '<div class="pf-row">' + lab('Action Taken :') + val(rec['Action Taken'], 'wrap') + '</div>' +
        '<div class="pf-travel"><div>' +
          '<div class="pf-trl">' + lab('Travel Time:') + '<span class="pf-l it">FROM: (Origin)</span>' + val(rec['Place of Origin']) + '</div>' +
          '<div class="pf-trl"><span style="width:62px;flex:none"></span><span class="pf-l it">TO: (Arrival Place)</span>' + val(rec['Place of Arrival']) + '</div>' +
        '</div><div>' +
          '<div class="pf-trl">' + lab('Time Leave:') + timeCell(rec['Departure Time']) + '</div>' +
          '<div class="pf-trl">' + lab('Time Arrive:') + timeCell(rec['Arrival Time']) + '</div>' +
        '</div></div>' +
        '<div class="pf-row">' + lab('Acted By :') + val(rec['Acted By'], 'f3') + lab('Date Acted:') + val(rec['Date Acted'], 'f15') + '</div>' +
        '<div class="pf-row">' + lab('Time Acted:') + '<span class="pf-l it">Start :</span>' + timeCell(rec['Arrival Time']) + '<span class="pf-l it" style="margin-left:14px">Finish :</span>' + timeCell(rec['Time Finished']) + '</div>' +
      '</div></div>';
  }

  /* ---------- preview overlay ---------- */
  let overlay, stage, box, page, sheet, titleEl, subEl, copiesSel, current = null, styleEl = null;
  const PAGE_W = 816, PAGE_H = 1056;   // 8.5 x 11 in at 96 dpi

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'print-overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Print preview');
    overlay.innerHTML =
      '<div class="pv-toolbar">' +
        '<div class="pv-title"><h2 id="pv-h"></h2><div class="pv-sub" id="pv-sub"></div></div>' +
        '<label for="pv-copies">Layout <select id="pv-copies"><option value="2">2 copies per sheet (cut in half)</option><option value="1">1 copy per sheet</option></select></label>' +
        '<button type="button" class="btn primary" id="pv-print">🖨 Print…</button>' +
        '<button type="button" class="btn ghost" id="pv-close" style="color:#fff;border-color:rgba(255,255,255,.55)">Close</button>' +
      '</div>' +
      '<div class="pv-stage"><div class="pv-box"><div class="pv-page"><div class="pv-sheet"></div></div></div></div>';
    document.body.appendChild(overlay);
    stage = overlay.querySelector('.pv-stage'); box = overlay.querySelector('.pv-box'); page = overlay.querySelector('.pv-page'); sheet = overlay.querySelector('.pv-sheet');
    titleEl = overlay.querySelector('#pv-h'); subEl = overlay.querySelector('#pv-sub'); copiesSel = overlay.querySelector('#pv-copies');
    try { const c = localStorage.getItem('ileco_print_copies'); if (c === '1' || c === '2') copiesSel.value = c; } catch (_) {}
    copiesSel.addEventListener('change', () => { try { localStorage.setItem('ileco_print_copies', copiesSel.value); } catch (_) {} render(); });
    overlay.querySelector('#pv-close').addEventListener('click', close);
    overlay.querySelector('#pv-print').addEventListener('click', doPrint);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    window.addEventListener('resize', () => { if (overlay.classList.contains('open')) scalePreview(); });
  }

  // Shrink a form so it fits its slot (needed for 2 copies on one short-bond sheet).
  function fit(pf, slotH) {
    const W = 768;                      // 8 in printable width
    let z = 1;
    pf.style.transform = ''; pf.style.width = W + 'px';
    for (let i = 0; i < 8; i++) {
      pf.style.width = (W / z) + 'px'; pf.style.transform = 'scale(' + z + ')';
      const need = pf.offsetHeight * z;
      if (need <= slotH) break;
      z = Math.max(.55, z * (slotH / need) * .995);
    }
  }
  function render() {
    if (!current) return;
    const two = copiesSel.value === '2';
    sheet.className = 'pv-sheet ' + (two ? 'two' : 'one');
    const n = two ? 2 : 1, html = formHtml(current);
    sheet.innerHTML = Array.from({ length: n }, () => '<div class="pv-slot">' + html + '</div>').join('');
    const slotH = two ? 5.25 * 96 - 10 : 10.4 * 96;
    sheet.querySelectorAll('.pf').forEach(pf => fit(pf, slotH));
    const kind = formKindOf(current['Type of Complaint']), def = FORMS[kind];
    titleEl.textContent = 'Print preview — ' + def.title + ' (' + def.code + ')';
    subEl.textContent = 'Control No. ' + (current['Control Number'] || '') + ' · Letter / short bond 8.5 × 11 in · pick your printer in the next window';
    scalePreview();
  }
  function scalePreview() {
    const s = Math.max(.45, Math.min(1, (stage.clientWidth - 36) / PAGE_W, (stage.clientHeight - 36) / PAGE_H));
    page.style.transform = 'scale(' + s + ')';
    box.style.width = Math.round(PAGE_W * s) + 'px'; box.style.height = Math.round(PAGE_H * s) + 'px';
  }
  function doPrint() {
    // Paper size/margins apply only while this preview is printing.
    styleEl = document.createElement('style');
    styleEl.textContent = '@page{size:letter portrait;margin:.25in}';
    document.head.appendChild(styleEl);
    const done = () => { if (styleEl) { styleEl.remove(); styleEl = null; } window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }
  let provider = null;
  function open(rec) {
    // A provider lets the page hand over the freshest data at click time
    // (saved complaint + whatever is currently typed in the field-response section).
    if (!rec && provider) { try { rec = provider(); } catch (_) { rec = null; } }
    rec = rec || current; if (!rec) return;
    current = rec; build();
    document.body.classList.add('print-open'); overlay.classList.add('open');
    render();
    overlay.querySelector('#pv-print').focus();
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('open'); document.body.classList.remove('print-open');
    if (styleEl) { styleEl.remove(); styleEl = null; }
  }

  /* ---------- public API ---------- */
  function buttons() { return Array.prototype.slice.call(document.querySelectorAll('[data-print-btn]')); }
  function setRecord(rec) {
    current = rec || null;
    buttons().forEach(b => { b.disabled = !current; b.title = current ? 'Print ' + (current['Control Number'] || '') : 'Save a complaint/request first'; });
  }
  buttons().forEach(b => { b.disabled = true; b.addEventListener('click', () => open()); });
  function setProvider(fn) { provider = fn; }
  window.IlecoPrint = { setRecord, setProvider, open, close, formHtml, formKindOf };
})();
