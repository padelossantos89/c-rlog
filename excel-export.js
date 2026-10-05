/* ILECO III — shared Excel export (used by log.html and admin.html).
   Builds the 3-sheet workbook: "Filtered Records" (letterhead + summary + table + signatures),
   "Summary" and "Charts" — laid out like the approved sample files. */
(function(){
'use strict';
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PIE_COLORS = ['#F5B72E','#3A7CA5','#2E8B57','#B7473D','#8E44AD','#D9900F','#4C7A5E','#5C6BC0','#C2185B','#607D8B','#795548','#00897B'];


function fmtTime(hhmm){
  if(!hhmm) return "";
  const [h,m] = hhmm.split(":").map(Number);
  const period = h>=12 ? "PM" : "AM";
  const h12 = ((h+11)%12)+1;
  return `${h12}:${String(m).padStart(2,"0")} ${period}`;
}

function fmtDate(iso){
  if(!iso) return "";
  const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString("en-US",{month:"numeric", day:"numeric", year:"numeric"});
}

function normTime_(v){
  if(v===null || v===undefined || v==='') return '';
  const to12 = (h,mi)=>{ h=((h%24)+24)%24; return `${((h+11)%12)+1}:${String(mi).padStart(2,'0')} ${h>=12?'PM':'AM'}`; };
  if(typeof v==='number' || /^0?\.\d+$/.test(String(v).trim())){
    const x = Number(v);
    if(x>=0 && x<1){ const t=Math.round(x*1440)%1440; return to12(Math.floor(t/60), t%60); }
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(AM|PM)?$/i);
  if(m){
    let h = +m[1]; const p = m[3] && m[3].toUpperCase();
    if(p==='PM' && h!==12) h+=12;
    if(p==='AM' && h===12) h=0;
    return to12(h, +m[2]);
  }
  if(/^\d{4}-\d{2}-\d{2}T/.test(s)){
    const d = new Date(s);
    if(isNaN(d)) return s;
    const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
    const h = +parts.find(p=>p.type==='hour').value, mi = +parts.find(p=>p.type==='minute').value;
    return to12(h, mi);
  }
  return s;
}

function normDate_(v){
  if(v===null || v===undefined || v==='') return '';
  const s = String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}T/.test(s)){
    const d = new Date(s);
    if(isNaN(d) || d.getUTCFullYear()<1950) return s;
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(d);
    const g = t => parts.find(p=>p.type===t).value;
    return `${g('month')}/${g('day')}/${g('year')}`;
  }
  return s;
}

function _dtMs(dateStr, timeStr){
  if(!dateStr || !timeStr) return null;
  const s = String(dateStr).trim(), t = String(timeStr).trim();
  let y,mo,d;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){ y=+m[1]; mo=+m[2]; d=+m[3]; }
  else { m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(!m) return null; mo=+m[1]; d=+m[2]; y=+m[3]; }
  let h, mi;
  m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(m){ h=+m[1]; mi=+m[2]; const p=m[3].toUpperCase(); if(p==='PM' && h!==12) h+=12; if(p==='AM' && h===12) h=0; }
  else { m = t.match(/^(\d{1,2}):(\d{2})$/); if(!m) return null; h=+m[1]; mi=+m[2]; }
  return Date.UTC(y, mo-1, d, h, mi);
}

function calcDurationMin(dateRec, timeRec, dateFin, timeFin){
  const a = _dtMs(dateRec, timeRec), b = _dtMs(dateFin, timeFin);
  if(a===null || b===null || b < a) return null;
  return Math.round((b - a) / 60000);
}

function applyDurations(rows){
  (rows || []).forEach(r=>{
    ['Time Received','Departure Time','Arrival Time','Time Finished'].forEach(k=>{ if(k in r) r[k] = normTime_(r[k]); });
    ['Date Received','Date Acted'].forEach(k=>{ if(k in r) r[k] = normDate_(r[k]); });
    const d = calcDurationMin(r['Date Received'], r['Time Received'], r['Date Acted'], r['Time Finished']);
    if(d === null) return;
    r['Duration (min)'] = d;
    const tr = r['Travel Time (min)'];
    if(tr !== '' && tr != null && !isNaN(Number(tr))) r['Duration Less Travel Time (min)'] = d - Number(tr);
  });
  return rows;
}

function parseDateToISO_(str){
  if(!str) return '';
  const s = String(str).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m) return '';
  const mm = m[1].padStart(2,'0'), dd = m[2].padStart(2,'0');
  return `${m[3]}-${mm}-${dd}`;
}

function extractBarangay(record){
  const combo = String(record['Sitio/Barangay'] || '');
  const parts = combo.split(',').map(s=>s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length-1] : (parts[0] || '');
}

function shade(hex, amt){
  const c = hex.replace('#','');
  const num = parseInt(c,16);
  let r=(num>>16)+amt, g=((num>>8)&0xff)+amt, b=(num&0xff)+amt;
  r=Math.min(255,Math.max(0,r)); g=Math.min(255,Math.max(0,g)); b=Math.min(255,Math.max(0,b));
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function draw3DBar(obj, svg, legendEl){
  const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(entries.length===0){
    svg.innerHTML = '';
    if(legendEl) legendEl.innerHTML = '<div class="empty">No data yet</div>';
    return;
  }
  const total = entries.reduce((s,[,v])=>s+v,0);
  const max = Math.max(1, ...entries.map(([,v])=>v));
  const labelW = 118, chartW = 260, depth = 9, barH = 16, rowGap = 10;
  const totalH = entries.length * (barH+rowGap);
  svg.setAttribute('viewBox', `0 0 ${labelW+chartW+depth+70} ${totalH+10}`);
  let bars = '';
  entries.forEach(([k,v],i)=>{
    const color = PIE_COLORS[i % PIE_COLORS.length];
    const top = shade(color, 35), side = shade(color, -45);
    const len = (v/max) * chartW;
    const y = i*(barH+rowGap) + 6;
    const x = labelW;
    const pct = Math.round(v/total*100);
    bars += `
      <text x="${labelW-8}" y="${y+barH*0.72}" text-anchor="end" font-size="11" fill="#3A2E00">${E(k)}</text>
      <polygon points="${x},${y} ${x+len},${y} ${x+len+depth},${y-depth} ${x+depth},${y-depth}" fill="${top}"></polygon>
      <rect x="${x}" y="${y}" width="${len}" height="${barH}" fill="${color}"></rect>
      <polygon points="${x+len},${y} ${x+len+depth},${y-depth} ${x+len+depth},${y-depth+barH} ${x+len},${y+barH}" fill="${side}"></polygon>
      <text x="${x+len+depth+6}" y="${y+barH*0.72}" font-size="11" fill="#3A2E00">${v} (${pct}%)</text>`;
  });
  svg.innerHTML = bars;
  if(legendEl) legendEl.innerHTML = entries.map(([k,v],i)=>`
    <div style="display:flex; align-items:center; gap:7px; font-size:12.5px; margin:3px 0;">
      <span style="width:11px; height:11px; border-radius:3px; background:${PIE_COLORS[i % PIE_COLORS.length]}; flex:none;"></span>
      <span>${E(k)} — ${v} (${Math.round(v/total*100)}%)</span>
    </div>`).join('');
}

function svgToPngBase64(svgEl, outWidth, outHeight){
  return new Promise((resolve, reject)=>{
    try{
      const clone = svgEl.cloneNode(true);
      let vbWidth = outWidth, vbHeight = outHeight;
      const vb = svgEl.getAttribute('viewBox');
      if(vb){ const p = vb.split(/\s+/).map(Number); vbWidth = p[2]; vbHeight = p[3]; }
      clone.setAttribute('width', vbWidth);
      clone.setAttribute('height', vbHeight);
      clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
      const svgStr = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgStr], {type:'image/svg+xml;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        canvas.width = outWidth; canvas.height = outHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0,0,outWidth,outHeight);
        ctx.drawImage(img, 0, 0, outWidth, outHeight);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('Could not render chart image')); };
      img.src = url;
    }catch(err){ reject(err); }
  });
}

/* ---------- database rows -> header-keyed records (same shape the log page uses) ---------- */
const OFFICE_ORDER = ['Pani-an Branch Office', 'Sara Branch Office', 'Natividad Branch Office', 'ILECO-III Main Office'];
const T_ = v => v ? fmtTime(String(v).slice(0,5)) : '';
const D_ = v => v ? fmtDate(String(v).slice(0,10)) : '';
const N_ = v => (v === null || v === undefined) ? '' : v;
function recordsFromDb(dbRows){
  const rows = (dbRows || []).slice().sort((a,b)=>{
    const oa = OFFICE_ORDER.indexOf(a.office), ob = OFFICE_ORDER.indexOf(b.office);
    return (oa<0?99:oa)-(ob<0?99:ob) || (a.id||0)-(b.id||0);
  });
  const perOffice = {};   // "No" restarts at 1 for each office, like the approved sample
  return applyDurations(rows.map(r=>({
    "No": (perOffice[r.office] = (perOffice[r.office]||0) + 1), "Office": r.office, "Control Number": r.control_number,
    "Date Received": D_(r.date_received), "Time Received": T_(r.time_received), "Received By": r.received_by || '',
    "Name of Complainant": r.name_of_complainant || '', "Contact Number": r.contact_number || '',
    "Sitio/Barangay": r.sitio_barangay || '', "Town": r.town || '', "Type of Complaint": r.type_of_complaint || '',
    "Description of Complaint": r.description || '', "Account Name": r.account_name || '', "Account Number": r.account_number || '',
    "Meter Number": r.meter_number || '', "Serial Number": r.serial_number || '', "Pole Number": r.pole_number || '',
    "Acted By": r.acted_by || '', "Action Taken": r.action_taken || '', "Date Acted": D_(r.date_acted),
    "Place of Origin": r.place_of_origin || '', "Departure Time": T_(r.departure_time),
    "Place of Arrival": r.place_of_arrival || '', "Arrival Time": T_(r.arrival_time), "Time Finished": T_(r.time_finished),
    "Travel Time (min)": N_(r.travel_time_min), "Work Duration (min)": N_(r.work_duration_min),
    "Travel Time + Work Duration": N_(r.travel_plus_work_min), "Duration (min)": N_(r.duration_min),
    "Duration Less Travel Time (min)": N_(r.duration_less_travel)
  })));
}
function inRange(record, from, to){
  if(!from || !to) return true;
  const iso = parseDateToISO_(record['Date Received']);
  return !!iso && iso >= from && iso <= to;
}

/* ---------- column sets ---------- */
// Overall Records (admin): every column, with Office as the 2nd column — same for both admin buttons.
const OVERALL_COLUMNS = [
    { key:"No", label:"No" },
    { key:"Office", label:"Office" },
    { key:"Control Number", label:"Control Number" },
    { key:"Status", label:"Status" },
    { key:"Date Received", label:"Date Received" },
    { key:"Time Received", label:"Time Received" },
    { key:"Received By", label:"Received By" },
    { key:"Name of Complainant", label:"Name of Complainant" },
    { key:"Contact Number", label:"Contact Number" },
    { key:"Sitio/Barangay", label:"Barangay/Sitio" },
    { key:"Town", label:"Town" },
    { key:"Type of Complaint", label:"Type of Complaint" },
    { key:"Description of Complaint", label:"Description of Complaint" },
    { key:"Account Name", label:"Account Name" },
    { key:"Account Number", label:"Account Number" },
    { key:"Meter Number", label:"Meter Number" },
    { key:"Serial Number", label:"Serial Number" },
    { key:"Pole Number", label:"Pole Number" },
    { key:"Acted By", label:"Acted By" },
    { key:"Action Taken", label:"Action Taken" },
    { key:"Date Acted", label:"Date Acted" },
    { key:"Place of Origin", label:"Place of Origin" },
    { key:"Departure Time", label:"Departure Time" },
    { key:"Place of Arrival", label:"Place of Arrival" },
    { key:"Arrival Time", label:"Arrival Time" },
    { key:"Time Finished", label:"Time Finished" },
    { key:"Travel Time (min)", label:"Travel Time (min)" },
    { key:"Work Duration (min)", label:"Work Duration (min)" },
    { key:"Travel Time + Work Duration", label:"Travel Time + Work Duration" },
    { key:"Duration (min)", label:"Duration (min)" },
    { key:"Duration Less Travel Time (min)", label:"Duration Less Travel Time (min)" }
];
const OVERALL_WIDTHS = {
    "No":5,
    "Office":24,
    "Control Number":14,
    "Status":11,
    "Date Received":11,
    "Time Received":11,
    "Received By":13,
    "Name of Complainant":20,
    "Contact Number":13,
    "Sitio/Barangay":20,
    "Town":11,
    "Type of Complaint":10,
    "Description of Complaint":26,
    "Account Name":16,
    "Account Number":13,
    "Meter Number":11,
    "Serial Number":11,
    "Pole Number":10,
    "Acted By":15,
    "Action Taken":26,
    "Date Acted":11,
    "Place of Origin":13,
    "Departure Time":11,
    "Place of Arrival":24,
    "Arrival Time":11,
    "Time Finished":11,
    "Travel Time (min)":8,
    "Work Duration (min)":8,
    "Travel Time + Work Duration":10,
    "Duration (min)":9,
    "Duration Less Travel Time (min)":10
};

/* ---------- letterhead banner placement (from the approved samples) ---------- */
const BANNER_BRANCH  = { rowHeightPt: 135.4,
  tl: { nativeCol: 4,  nativeColOff: 0,      nativeRow: 0, nativeRowOff: 393700 },
  br: { nativeCol: 17, nativeColOff: 12700,  nativeRow: 0, nativeRowOff: 1574800 } };
const BANNER_OVERALL = { rowHeightPt: 210.65,
  tl: { nativeCol: 3,  nativeColOff: 469900, nativeRow: 0, nativeRowOff: 609600 },
  br: { nativeCol: 26, nativeColOff: 533400, nativeRow: 0, nativeRowOff: 2120900 } };

async function build(o){
  const { rows, columns, widths, branchLabel, fileSlug, filenameTag, from, to, banner } = o;
  const hasRange = !!(from && to);
  const wb = new ExcelJS.Workbook();

  /* ===================== Sheet 1 — Filtered Records ===================== */
  const EXPORT_COLUMNS = columns;
  const colCount = EXPORT_COLUMNS.length;

  const ws = wb.addWorksheet('Filtered Records');
  const WIDTHS = widths;
  EXPORT_COLUMNS.forEach((c,i)=>{ ws.getColumn(i+1).width = WIDTHS[c.key] || 14; });

  const BLUE = 'FF1B3B6F';
  const RED = 'FFCC0000';
  const BORDER = { style:'thin', color:{argb:'FF000000'} };
  const thinBox = { top:BORDER, left:BORDER, bottom:BORDER, right:BORDER };

  const mergeCentered = (r1,c1,r2,c2,text,opts={})=>{
    ws.mergeCells(r1,c1,r2,c2);
    const cell = ws.getCell(r1,c1);
    cell.value = text;
    cell.alignment = { horizontal: opts.align||'center', vertical:'middle', wrapText:true };
    cell.font = { bold: opts.bold!==false, size: opts.size||11, color:{argb: opts.color||'FF000000'}, italic: !!opts.italic };
    if(opts.fill) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:opts.fill} };
    return cell;
  };

  let r = 1;

  // ---- real letterhead image (embedded logo), spanning the full table width ----
  const bannerStartRow = r;
  const totalColUnits = Object.values(WIDTHS).reduce((a,b)=>a+b,0) / Object.values(WIDTHS).length * colCount;
  const estTableWidthPx = Math.round(totalColUnits*7 + colCount*5);
  const bannerHeightPx = Math.round(estTableWidthPx * (201/1467));
  const bannerHeightPt = Math.round(bannerHeightPx / 1.3333);

  const logoId = wb.addImage({ base64: window.LETTERHEAD_IMG_B64, extension: 'png' });
  // banner placement + row height copied from the approved sample workbooks
  ws.addImage(logoId, { tl: banner.tl, br: banner.br, editAs: 'oneCell' });
  ws.getRow(bannerStartRow).height = banner.rowHeightPt;
  r += 2;

  // ---- effectivity / rev / document code ----
  const metaRow = r;
  ws.getCell(metaRow,1).value = 'Effectivity Date:'; ws.getCell(metaRow,1).font = { bold:true, size:9 };
  ws.mergeCells(metaRow,2,metaRow,5);
  ws.getCell(metaRow,2).value = 'September 01, 2026'; ws.getCell(metaRow,2).font = { size:9 };
  const revLabelStart = Math.round(colCount*0.43), revLabelEnd = revLabelStart+1, revValueCol = revLabelEnd+1;
  ws.mergeCells(metaRow,revLabelStart,metaRow,revLabelEnd);
  ws.getCell(metaRow,revLabelStart).value = 'Rev. No.:'; ws.getCell(metaRow,revLabelStart).font = { bold:true, size:9 };
  ws.getCell(metaRow,revValueCol).value = '05'; ws.getCell(metaRow,revValueCol).font = { size:9 };
  const docLabelStart = Math.round(colCount*0.74), docLabelEnd = docLabelStart+1, docValueStart = docLabelEnd+1;
  ws.mergeCells(metaRow,docLabelStart,metaRow,docLabelEnd);
  ws.getCell(metaRow,docLabelStart).value = 'Document Code:'; ws.getCell(metaRow,docLabelStart).font = { bold:true, size:9 };
  ws.mergeCells(metaRow,docValueStart,metaRow,colCount);
  ws.getCell(metaRow,docValueStart).value = 'FO-AO-56'; ws.getCell(metaRow,docValueStart).font = { bold:true, size:9 };
  r += 2;

  // ---- branch identification ----
  mergeCentered(r,1,r,colCount,'ILOILO III ELECTRIC COOPERATIVE INC.', {size:11}); r++;
  mergeCentered(r,1,r,colCount,branchLabel, {size:11}); r += 2;

  // ---- summary title + red totals block (right side) ----
  const sum = key => rows.reduce((s,x)=> s + (Number(x[key])||0), 0);
  const totals = [
    ['TOTAL COMPLAINTS:', rows.length],
    ['TOTAL TRAVEL TIME(MIN):', sum('Travel Time (min)')],
    ['TOTAL DURATION(MIN):', sum('Duration (min)')],
    ['TOTAL DURATION LESS TRAVEL TIME(MIN):', sum('Duration Less Travel Time (min)')]
  ];
  const titleEnd = colCount - 7, labelStart = titleEnd+1, labelEnd = labelStart+2, valueStart = labelEnd+1;
  const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let rangeLabel = '';
  if(hasRange){
    const sameMonth = from.slice(0,7) === to.slice(0,7);
    if(sameMonth){
      const [yy,mm] = from.split('-');
      rangeLabel = `${MONTH_ABBR[parseInt(mm,10)-1]}-${yy.slice(2)}`;
    } else {
      rangeLabel = `${from} to ${to}`;
    }
  }

  mergeCentered(r,1,r,titleEnd,'SUMMARY OF COMPLAINTS', {size:12});
  ws.getRow(r).height = 15.5;
  ws.mergeCells(r,labelStart,r,labelEnd); const l0=ws.getCell(r,labelStart); l0.value=totals[0][0];
  l0.alignment={horizontal:'right',vertical:'middle'}; l0.font={bold:true,color:{argb:RED},size:9};
  ws.mergeCells(r,valueStart,r,colCount); const v0=ws.getCell(r,valueStart); v0.value=totals[0][1];
  v0.alignment={horizontal:'right',vertical:'middle'}; v0.font={bold:true,color:{argb:RED},size:9};
  r++;

  mergeCentered(r,1,r,titleEnd, rangeLabel, {size:11});
  ws.mergeCells(r,labelStart,r,labelEnd); const l1=ws.getCell(r,labelStart); l1.value=totals[1][0];
  l1.alignment={horizontal:'right',vertical:'middle'}; l1.font={bold:true,color:{argb:RED},size:9};
  ws.mergeCells(r,valueStart,r,colCount); const v1=ws.getCell(r,valueStart); v1.value=totals[1][1];
  v1.alignment={horizontal:'right',vertical:'middle'}; v1.font={bold:true,color:{argb:RED},size:9};
  r++;

  for(let i=2;i<totals.length;i++){
    ws.mergeCells(r,labelStart,r,labelEnd); const lbl=ws.getCell(r,labelStart); lbl.value=totals[i][0];
    lbl.alignment={horizontal:'right',vertical:'middle'}; lbl.font={bold:true,color:{argb:RED},size:9};
    ws.mergeCells(r,valueStart,r,colCount); const val=ws.getCell(r,valueStart); val.value=totals[i][1];
    val.alignment={horizontal:'right',vertical:'middle'}; val.font={bold:true,color:{argb:RED},size:9};
    r++;
  }
  r++;

  // ---- table header ----
  const headerRow = r;
  EXPORT_COLUMNS.forEach((c,i)=>{
    const cell = ws.getCell(headerRow, i+1);
    cell.value = c.label;
    cell.font = { bold:true, size:9 };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    cell.border = thinBox;
  });
  ws.getRow(headerRow).height = 20;
  r++;

  // ---- data rows ----
  const durationStart = colCount - 5;
  rows.forEach(rec=>{
    EXPORT_COLUMNS.forEach((c,i)=>{
      const cell = ws.getCell(r, i+1);
      cell.value = c.key==='Status' ? (rec['Time Finished'] ? 'Completed' : 'Pending') : (rec[c.key] ?? '');
      cell.font = { size:9 };
      cell.alignment = { vertical:'middle', horizontal: (i>=durationStart ? 'right':'left') };
      cell.border = thinBox;
    });
    r++;
  });
  if(rows.length===0){
    EXPORT_COLUMNS.forEach((c,i)=>{ ws.getCell(r,i+1).border = thinBox; });
    r++;
  }
  r += 2;

  // ---- signature block (titles only, no personal names) ----
  const sigCols = [1, Math.round(colCount*0.4)+1, Math.round(colCount*0.72)+1];
  const sigLabelRow = r;
  ws.getCell(sigLabelRow,sigCols[0]).value='PREPARED BY:'; ws.getCell(sigLabelRow,sigCols[0]).font={bold:true,size:10};
  ws.getCell(sigLabelRow,sigCols[1]).value='REVIEWED BY:'; ws.getCell(sigLabelRow,sigCols[1]).font={bold:true,size:10};
  ws.getCell(sigLabelRow,sigCols[2]).value='NOTED BY:'; ws.getCell(sigLabelRow,sigCols[2]).font={bold:true,size:10};
  r++;
  const sigLineRow = r;
  [sigCols[0],sigCols[1],sigCols[2]].forEach((c,idx)=>{
    const end = idx<2 ? sigCols[idx+1]-2 : colCount-1;
    ws.mergeCells(sigLineRow,c,sigLineRow,Math.max(c,end));
    ws.getCell(sigLineRow,c).border = { bottom: BORDER };
  });
  ws.getRow(sigLineRow).height = 14.65;
  r++;
  const sigTitleRow = r;
  ws.getCell(sigTitleRow,sigCols[0]).value='MCO Welfare Desk Coordinator'; ws.getCell(sigTitleRow,sigCols[0]).font={size:10};
  ws.getCell(sigTitleRow,sigCols[1]).value='Branch Operations Services Chief'; ws.getCell(sigTitleRow,sigCols[1]).font={size:10};
  ws.getCell(sigTitleRow,sigCols[2]).value='AOSD Manager'; ws.getCell(sigTitleRow,sigCols[2]).font={size:10};

  /* ===================== Sheet 2 — Summary ===================== */
  // Styled to match the app itself: navy header bar, amber accents,
  // stat tiles up top (same four totals as the on-screen Summary tab),
  // then a colored, bordered table per category.
  const ws2 = wb.addWorksheet('Summary');
  const NAVY = 'FF122236';
  const AMBER = 'FFFBC94C';
  const AMBER_DEEP = 'FFE8A423';
  const PAPER = 'FFFFFDF5';
  const INK_SOFT = 'FF5C5C5C';
  ws2.getColumn(1).width = 30; ws2.getColumn(2).width = 12;
  ws2.getColumn(3).width = 4;
  ws2.getColumn(4).width = 22; ws2.getColumn(5).width = 12;

  let r2 = 1;
  ws2.mergeCells(r2,1,r2,5);
  const titleCell = ws2.getCell(r2,1);
  titleCell.value = `ILOILO III ELECTRIC COOPERATIVE, INC. — ${branchLabel}`;
  titleCell.font = { bold:true, size:13, color:{argb:'FFFFFFFF'} };
  titleCell.alignment = { vertical:'middle', horizontal:'center' };
  titleCell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:NAVY} };
  ws2.getRow(r2).height = 16;
  r2++;
  ws2.mergeCells(r2,1,r2,5);
  const subCell = ws2.getCell(r2,1);
  subCell.value = `Summary — ${rangeLabel || 'All records'}`;
  subCell.font = { bold:true, size:11, color:{argb:'FF3A2E00'} };
  subCell.alignment = { vertical:'middle', horizontal:'center' };
  subCell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:AMBER} };
  ws2.getRow(r2).height = 13.4;
  r2 += 2;

  // ---- stat tiles: same four totals shown on the live Summary tab ----
  const sumKey = key => rows.reduce((s,x)=> s + (Number(x[key])||0), 0);
  const stats = [
    ['Total complaints & requests', rows.length],
    ['Total travel time (min)', sumKey('Travel Time (min)')],
    ['Total duration (min)', sumKey('Duration (min)')],
    ['Total duration less travel (min)', sumKey('Duration Less Travel Time (min)')]
  ];
  const statsRow = r2;
  stats.forEach((s,i)=>{
    const c = i+1;
    const numCell = ws2.getCell(statsRow,c);
    numCell.value = s[1];
    numCell.font = { bold:true, size:16, color:{argb:'FF1B1B1B'} };
    numCell.alignment = { horizontal:'center', vertical:'middle' };
    numCell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:PAPER} };
    numCell.border = { top:{style:'thin',color:{argb:AMBER_DEEP}}, bottom:{style:'thin',color:{argb:AMBER_DEEP}}, left:{style:'thin',color:{argb:AMBER_DEEP}}, right:{style:'thin',color:{argb:AMBER_DEEP}} };
  });
  ws2.getRow(statsRow).height = 17.4;
  r2++;
  stats.forEach((s,i)=>{
    const c = i+1;
    const lblCell = ws2.getCell(r2,c);
    lblCell.value = s[0];
    lblCell.font = { size:8.5, color:{argb:INK_SOFT} };
    lblCell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    lblCell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:PAPER} };
    lblCell.border = { bottom:{style:'thin',color:{argb:AMBER_DEEP}}, left:{style:'thin',color:{argb:AMBER_DEEP}}, right:{style:'thin',color:{argb:AMBER_DEEP}} };
  });
  ws2.getRow(r2).height = 17.4;
  r2 += 3;

  const byTown = {}, byType = {}, byBarangay = {};
  rows.forEach(rec=>{
    const t = rec['Town']||'—'; byTown[t]=(byTown[t]||0)+1;
    const y = rec['Type of Complaint']||'—'; byType[y]=(byType[y]||0)+1;
    const b = extractBarangay(rec) || '—'; byBarangay[b]=(byBarangay[b]||0)+1;
  });

  const writeTable = (title, obj) => {
    ws2.mergeCells(r2,1,r2,2);
    const head = ws2.getCell(r2,1);
    head.value = title;
    head.font = { bold:true, size:11, color:{argb:'FFFFFFFF'} };
    head.alignment = { vertical:'middle' };
    head.fill = { type:'pattern', pattern:'solid', fgColor:{argb:NAVY} };
    ws2.getRow(r2).height = 13.4;
    r2++;
    const colHead1 = ws2.getCell(r2,1), colHead2 = ws2.getCell(r2,2);
    colHead1.value = 'Category'; colHead2.value = 'Count';
    [colHead1,colHead2].forEach(c=>{
      c.font = { bold:true, size:9.5, color:{argb:'FF3A2E00'} };
      c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:AMBER} };
      c.alignment = { horizontal: c===colHead2 ? 'right':'left', vertical:'middle' };
    });
    r2++;
    const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]);
    if(entries.length===0){
      ws2.getCell(r2,1).value = 'No data yet';
      ws2.getCell(r2,1).font = { italic:true, size:9.5, color:{argb:INK_SOFT} };
      r2++;
    }
    entries.forEach(([k,v],i)=>{
      const rowFill = i % 2 === 0 ? PAPER : 'FFFFFFFF';
      const kCell = ws2.getCell(r2,1), vCell = ws2.getCell(r2,2);
      kCell.value = k; vCell.value = v;
      [kCell,vCell].forEach(c=>{
        c.font = { size:9.5 };
        c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:rowFill} };
        c.border = { bottom:{style:'hair',color:{argb:'FFE0DCC8'}} };
      });
      vCell.alignment = { horizontal:'right' };
      r2++;
    });
    r2 += 2;
  };
  writeTable('Complaints & Requests by Town', byTown);
  writeTable('Complaints & Requests by Type', byType);
  writeTable('Complaints & Requests by Barangay', byBarangay);

  /* ===================== Sheet 3 — Charts ===================== */
  // 3D bar graphs only (no pie), built off-screen straight from this
  // export's own `rows` — so they always match the exact date range just
  // downloaded, regardless of whatever range the live Summary tab shows.
  const ws3 = wb.addWorksheet('Charts');
  ws3.getColumn(1).width = 4;
  ws3.getCell(1,1).value = `Charts — ${rangeLabel || 'All records'}`;
  ws3.getCell(1,1).font = { bold:true, size:13 };
  ws3.getRow(1).height = 17;
  ws3.getCell(3,1).value = 'Complaints & Requests by Town';
  ws3.getCell(3,1).font = { bold:true, size:11 };
  ws3.getCell(18,1).value = 'Complaints & Requests by Type';
  ws3.getCell(18,1).font = { bold:true, size:11 };
  ws3.getCell(33,1).value = 'Complaints & Requests by Barangay';
  ws3.getCell(33,1).font = { bold:true, size:11 };

  const detachedSvg = viewBox => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox', viewBox);
    return svg;
  };
  const addBarChart = async (obj, row) => {
    const svg = detachedSvg('0 0 480 220');
    draw3DBar(obj, svg, null);
    const b64 = await svgToPngBase64(svg, 700, 340);
    const imgId = wb.addImage({ base64: b64, extension: 'png' });
    ws3.addImage(imgId, { tl:{col:0,row}, ext:{width:560,height:270} });
  };

  try{
    await addBarChart(byTown, 3);
    await addBarChart(byType, 18);
    await addBarChart(byBarangay, 33);
  }catch(chartErr){
    ws3.getCell(48,1).value = 'Charts could not be rendered as images in this browser: ' + chartErr.message;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const rangeSlug = hasRange ? `${from}_to_${to}` : 'all-records';
  const filename = `ILECO3-${fileSlug}-${filenameTag}_${rangeSlug}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return filename;
}


window.IlecoExcel = { build, recordsFromDb, inRange, applyDurations, parseDateToISO_,
  OVERALL_COLUMNS, OVERALL_WIDTHS, BANNER_BRANCH, BANNER_OVERALL };
})();
