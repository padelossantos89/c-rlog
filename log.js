
(async function(){
const App = window.App;
const E = App.esc;   // HTML-escape anything that came from the database before showing it

/* AUTH GUARD — real Supabase session, verified server-side. Redirects to login.html if not signed in. */
const profile = await App.guard({ roles: ['admin','office','field'] });
const IS_FIELD = profile.role === 'field';
if(IS_FIELD) document.documentElement.classList.add('field-mode');

// Only "Downloaded Excel" is logged from the browser; the database logs saved complaints/responses itself.
const logActivity = (action, details) => App.logActivity(action, details);

(function(){
  const logoutLink = document.getElementById('logout-link');
  if(logoutLink){
    logoutLink.addEventListener('click', (e)=>{ e.preventDefault(); App.logout(); });
  }
})();

/* =========================================================================
   CONFIGURATION
   Each branch office can write to its own Google Sheet. Paste each branch's
   deployed Apps Script Web App URL below (see SETUP.md). Leave a branch's
   scriptUrl blank to run that branch in demo mode.
   ========================================================================= */
const BRANCHES = {
  "pani-an":   { name:"Pani-an Branch Office",   email:"ileco3.pao@gmail.com", address:"" },
  "sara":      { name:"Sara Branch Office",       email:"ileco3.sao@gmail.com", address:"Brgy. Preciosa, Sara, Iloilo" },
  "natividad": { name:"Natividad Branch Office",  email:"ileco3.nao@gmail.com", address:"" },
  "main":      { name:"ILECO-III Main Office",    email:"", address:"" }
};
const branchKeyRaw_ = new URLSearchParams(location.search).get('branch');
const branchKey = Object.prototype.hasOwnProperty.call(BRANCHES, branchKeyRaw_) ? branchKeyRaw_ : 'pani-an';
const BRANCH = BRANCHES[branchKey];
// (legacy Apps Script URLs removed — this office's data now lives in the complaints table, keyed by BRANCH.name)

document.title = `ILECO III · ${BRANCH.name} · Complaints & Response Log`;
document.getElementById('branch-subtitle').textContent = `${BRANCH.name} · Complaint & Request Log`;
document.getElementById('branch-address').textContent = BRANCH.address || BRANCH.name;
document.getElementById('branch-contact').innerHTML =
  `<strong>ileco3@gmail.com</strong>` + (BRANCH.email ? ` &middot; ${BRANCH.email}` : '');
if(IS_FIELD){
  const back = document.getElementById('change-branch');
  back.href = 'field.html?branch=' + encodeURIComponent(branchKey);
  back.innerHTML = '&larr; Status list';
}

const COLUMNS_SHEET = ["No","Control Number","Date Received","Time Received","Received By","Name of Complainant","Contact Number",
  "Sitio/Barangay","Town","Type of Complaint","Description of Complaint",
  "Account Name","Account Number","Meter Number","Serial Number","Pole Number",
  "Acted By","Action Taken","Date Acted",
  "Place of Origin","Departure Time","Place of Arrival","Arrival Time","Time Finished",
  "Travel Time (min)","Work Duration (min)","Travel Time + Work Duration","Duration (min)",
  "Duration Less Travel Time (min)"];
const BILL_COLUMNS = ["Account Name","Account Number","Meter Number","Serial Number","Pole Number"];
const EXCEL_COLUMNS = COLUMNS_SHEET.filter(c => !BILL_COLUMNS.includes(c));
const COLUMNS = COLUMNS_SHEET; // kept for backward compatibility with older code below

const CONTROL_PREFIX = { "pani-an":"PBO", "sara":"SBO", "natividad":"NBO", "main":"IMO" };

/* ---------- Type of complaint -> Description auto-fill ---------- */
const TYPE_DESCRIPTIONS = {
  "SD1":"Cut-off", "SD2":"Loose connection", "SD3":"Sagging", "SD4":"Sparking",
  "K1":"Damaged/Burned/Stopped", "K2":"Defective",
  "LF1":"Vegetation, Animal Contact, Lightning, and Damage on Hardwares",
  "LF2":"Broken Insulator", "LF3":"Transformer Loose Connection", "LF4":"Others (Private Transformer)",
  "B1":"No bill", "B2":"For adjustment of bill", "B3":"For cancellation of bill/not used", "B4":"Sudden increase/correct reading",
  "P1":"Leaning", "P2":"Rotten", "P3":"Burned", "P4":"Toppled",
  "T1":"Busted transformer",
  "LV1":"Over extended lines", "LV2":"Loose connection on primary/secondary lines", "LV3":"Others",
  "OP1":"",
  "O1":"Calibration", "O2":"Transfer of kWh & SD1", "O3":"Clearing/Rehab/Relocation of Down",
  "O4":"Temporary Disco", "O5":"Correction of Account Name / Type of Consumer & Others",
  "O6":"Change of Family Name (Change Status)", "O7":"Retirement of Transformer", "O8":"Debit/Credit Memo",
  "O9":"Transfer of Pole", "O10":"Refund of Energy Deposit", "O11":"Change/Upgrade of SDI"
};

/* ---------- barangay coverage: loaded from barangays.js ---------- */
const COVERAGE = window.COVERAGE || {};

const BRANCH_TOWNS = COVERAGE[branchKey] || {};
const BARANGAY_TO_TOWN = {};
Object.keys(BRANCH_TOWNS).forEach(town=>{
  BRANCH_TOWNS[town].forEach(brgy=>{ BARANGAY_TO_TOWN[brgy] = town; });
});

let records = [];
let lastSnap = null;   // the record most recently saved/looked up — this is what "Print form" prints

/* ---------- time helpers ---------- */
function toMinutes(hhmm){
  if(!hhmm) return null;
  const [h,m] = hhmm.split(":").map(Number);
  return h*60+m;
}
function diffMinutes(startHHMM, endHHMM){
  const a = toMinutes(startHHMM), b = toMinutes(endHHMM);
  if(a===null || b===null) return null;
  let d = b - a;
  if(d < 0) d += 1440; // crossed midnight
  return d;
}
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


/* ---------- Duration (min) = (Date & Time Finished) - (Date & Time Received), in minutes ----------
   Date Finished = Date Acted. Applied to every record (all 4 offices + Overall). */

/* ---------- Normalise Sheet values so every office reads the same ----------
   Google Sheets may hand back a time as "6:20 AM", "06:20:00", a fraction of a day,
   or an ISO stamp (1899-12-30T…Z) depending on how that Sheet's cells are formatted. */
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


/* ---------- Instant-load cache: show the last saved records at once, refresh in the background ---------- */
const ROWS_CACHE_PREFIX_ = 'ileco_rows_v1:';
function rowsCacheSet_(key, rows){
  try{
    const headers = [], seen = {};
    rows.forEach(r=>Object.keys(r).forEach(k=>{ if(!seen[k]){ seen[k]=1; headers.push(k); } }));
    const data = rows.map(r=>headers.map(h=> r[h]===undefined ? '' : r[h]));
    sessionStorage.setItem(ROWS_CACHE_PREFIX_+key, JSON.stringify({ t:Date.now(), h:headers, d:data }));
  }catch(e){ /* storage full or blocked - the cache is optional */ }
}
function rowsCacheGet_(key){
  try{
    const s = sessionStorage.getItem(ROWS_CACHE_PREFIX_+key);
    if(!s) return null;
    const o = JSON.parse(s);
    return o.d.map(a=>{ const r = {}; o.h.forEach((h,i)=>{ r[h] = a[i]; }); return r; });
  }catch(e){ return null; }
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

/* ---------- element helper (must come before anything that uses it) ---------- */
const f = id => document.getElementById(id);

/* ---------- barangay dropdown: populate + auto-fill town ---------- */
function populateBarangayDropdown(){
  const sel = f('barangay');
  const towns = Object.keys(BRANCH_TOWNS).sort();
  towns.forEach(town=>{
    const group = document.createElement('optgroup');
    group.label = town;
    [...BRANCH_TOWNS[town]].sort().forEach(brgy=>{
      const opt = document.createElement('option');
      opt.value = brgy; opt.textContent = brgy;
      group.appendChild(opt);
    });
    sel.appendChild(group);
  });
}
f('barangay').addEventListener('change', ()=>{
  // Several towns share barangay names (e.g. "Poblacion"), so the town must
  // come from the selected option's own optgroup, not a name-only lookup.
  const sel = f('barangay');
  const opt = sel.options[sel.selectedIndex];
  const town = (opt && opt.parentElement && opt.parentElement.tagName === 'OPTGROUP')
    ? opt.parentElement.label
    : (BARANGAY_TO_TOWN[sel.value] || '');
  f('town').value = town;
});

f('type').addEventListener('change', ()=>{
  f('description').value = TYPE_DESCRIPTIONS[f('type').value] ?? '';
});

/* ---------- live duration preview on the field-response form ---------- */
let currentControlNumber = null;
let currentReceivedTimeRaw = null;
let currentComplainant = '';
let currentAddress = '';

function recalc(){
  const dep=f('departureTime').value, arr=f('arrivalTime').value, fin=f('finishTime').value, rec=currentReceivedTimeRaw;
  const travel = diffMinutes(dep, arr);
  const work = diffMinutes(arr, fin);
  const duration = calcDurationMin(f('dateReceived').value, rec, f('dateActed').value, fin);
  const sum = (travel!==null && work!==null) ? travel+work : null;
  const net = (duration!==null && travel!==null) ? duration-travel : null;
  f('calcTravel').textContent = travel ?? "–";
  f('calcWork').textContent = work ?? "–";
  f('calcSum').textContent = sum ?? "–";
  f('calcDuration').textContent = duration ?? "–";
  f('calcNet').textContent = net ?? "–";
}

/* ---------- validation: Date Acted / Time sequence rules ---------- */
function validateFieldResponse(){
  const dateReceived = f('dateReceived').value;     // "YYYY-MM-DD", set once a complaint is loaded
  const dateActed = f('dateActed').value;           // "YYYY-MM-DD"
  const dep = f('departureTime').value;             // "HH:MM"
  const arr = f('arrivalTime').value;
  const fin = f('finishTime').value;

  if(dateReceived && dateActed && dateActed < dateReceived){
    return "Invalid Date: Date Acted cannot be earlier than Date Received.";
  }
  if(dateReceived && dateActed && dateActed === dateReceived && currentReceivedTimeRaw && dep){
    if(toMinutes(dep) < toMinutes(currentReceivedTimeRaw)){
      return "Invalid Time: Departure Time cannot be earlier than Time Received.";
    }
  }
  if(dep && arr && toMinutes(arr) <= toMinutes(dep)){
    return "Invalid Time: Arrival Time must be later than Departure Time.";
  }
  if(arr && fin && toMinutes(fin) <= toMinutes(arr)){
    return "Invalid Time: Time Finished must be later than Arrival Time.";
  }
  return null;
}

function showValidationError(msg){
  const box = document.getElementById('fr-validation-error');
  if(msg){ box.textContent = msg; box.style.display = ''; }
  else { box.textContent = ''; box.style.display = 'none'; }
  return msg;
}

function recalcAndValidate(){
  recalc();
  showValidationError(validateFieldResponse());
}

["dateActed","departureTime","arrivalTime","finishTime"].forEach(id=>{
  f(id).addEventListener('input', recalcAndValidate);
  f(id).addEventListener('change', recalcAndValidate);
});

/* ---------- what "Print form" prints ----------
   = the saved Complaint/Request Received data (lastSnap) + the field-response values currently
   on screen, so one printout always carries both halves of the record. */
function printRecord_(){
  if(!lastSnap) return null;
  const rec = Object.assign({}, lastSnap);
  if(currentControlNumber && currentControlNumber === rec["Control Number"] && !f('actedBy').disabled){
    const dep=f('departureTime').value, arr=f('arrivalTime').value, fin=f('finishTime').value;
    Object.assign(rec, {
      "Acted By": f('actedBy').value, "Action Taken": f('action').value, "Date Acted": fmtDate(f('dateActed').value),
      "Place of Origin": f('origin').value, "Departure Time": fmtTime(dep),
      "Place of Arrival": f('arrivalPlace').value, "Arrival Time": fmtTime(arr), "Time Finished": fmtTime(fin)
    });
  }
  return rec;
}
if(window.IlecoPrint) window.IlecoPrint.setProvider(printRecord_);

/* ---------- enable/disable the field-response form ---------- */
function setFieldResponseEnabled(enabled){
  ['actedBy','action','dateActed','origin','arrivalPlace','departureTime','arrivalTime','finishTime'].forEach(id=>{
    f(id).disabled = !enabled;
  });
  document.getElementById('fr-submit-btn').disabled = !enabled;
}

function showControlNumber(cn){
  document.getElementById('control-number-value').textContent = cn;
  document.getElementById('control-number-display').style.display = '';
  f('frControl').value = cn;
  f('frComplainant').value = currentComplainant;
  f('frAddress').value = currentAddress;
}

/* ---------- Field response: look up an existing Control Number on Enter ---------- */
function parseTimeTo24_(str){
  if(!str) return null;
  const m = normTime_(str).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!m) return null;
  let h = parseInt(m[1],10);
  const period = m[3].toUpperCase();
  if(period==='PM' && h!==12) h += 12;
  if(period==='AM' && h===12) h = 0;
  return `${String(h).padStart(2,'0')}:${m[2]}`;
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

function setComplaintFieldsEnabled(enabled){
  ['dateReceived','timeReceived','receivedBy','complainant','contactNumber','sitio','barangay','town',
   'type','description','acctName','acctNumber','meterNumber','serialNumber','poleNumber']
    .forEach(id => { const el = f(id); if(el) el.disabled = !enabled; });
  const btn = document.querySelector('#complaint-form button[type=submit]');
  if(btn) btn.disabled = !enabled;
}

function populateComplaintFields(match){
  f('dateReceived').value = parseDateToISO_(match['Date Received']);
  f('timeReceived').value = parseTimeTo24_(match['Time Received']) || '';
  f('receivedBy').value = match['Received By'] || '';
  f('complainant').value = match['Name of Complainant'] || '';
  f('contactNumber').value = match['Contact Number'] || '';

  const combo = String(match['Sitio/Barangay'] || '');
  const parts = combo.split(',').map(s=>s.trim());
  const barangayName = parts.length > 1 ? parts[parts.length-1] : parts[0];
  const sitioValue = parts.length > 1 ? parts.slice(0,-1).join(', ') : '';
  f('sitio').value = sitioValue;

  const barangaySel = f('barangay');
  if(barangaySel && barangaySel.tagName === 'SELECT'){
    let found = false;
    Array.from(barangaySel.options).forEach(opt=>{
      const inTown = opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' && opt.parentElement.label === match['Town'];
      if(!found && (opt.value === barangayName) && (inTown || !match['Town'])){
        barangaySel.value = opt.value; found = true;
      }
    });
    if(!found){ barangaySel.value = ''; }
  } else if(barangaySel){
    barangaySel.value = barangayName;
  }
  f('town').value = match['Town'] || '';

  const typeSel = f('type');
  if(typeSel) typeSel.value = match['Type of Complaint'] || '';
  f('description').value = match['Description of Complaint'] || '';

  f('acctName').value = match['Account Name'] || '';
  f('acctNumber').value = match['Account Number'] || '';
  f('meterNumber').value = match['Meter Number'] || '';
  f('serialNumber').value = match['Serial Number'] || '';
  f('poleNumber').value = match['Pole Number'] || '';

  // This is an existing complaint being resumed — lock the intake fields so
  // it can't accidentally be re-submitted as a second, duplicate complaint.
  setComplaintFieldsEnabled(false);
}

document.getElementById('complaint-form').addEventListener('reset', ()=>{
  setTimeout(()=> setComplaintFieldsEnabled(true), 0);
});

/* ---------- Clear form: wipes BOTH forms, the Control Number banner and the print record ---------- */
function clearAllForms(){
  document.getElementById('complaint-form').reset();
  f('barangay').value = ""; f('town').value = "";
  setComplaintFieldsEnabled(true);

  document.getElementById('fieldresponse-form').reset();
  f('frControl').value = ""; f('frComplainant').value = ""; f('frAddress').value = "";
  document.getElementById('fr-lookup-msg').textContent = '';
  setFieldResponseEnabled(false);

  currentControlNumber = null; currentReceivedTimeRaw = null; currentComplainant = ''; currentAddress = '';
  lastSnap = null;
  if(window.IlecoPrint) window.IlecoPrint.setRecord(null);

  document.getElementById('control-number-value').textContent = '\u2013';
  document.getElementById('control-number-display').style.display = 'none';
  document.getElementById('save-toast').textContent = '';
  document.getElementById('fr-save-toast').textContent = '';
  recalcAndValidate();
}
document.getElementById('clear-form-btn').addEventListener('click', clearAllForms);

async function lookupControlNumber(){
  const msg = document.getElementById('fr-lookup-msg');
  const cn = f('frControl').value.trim();
  if(!cn){ return; }
  msg.style.color = 'var(--ink-soft)';
  msg.textContent = 'Looking up…';

  const findIn = list => list.find(r => String(r['Control Number']||'').trim().toUpperCase() === cn.toUpperCase());
  let match = findIn(records);
  if(!match){
    try{ records = await fetchRows(); } catch(err){ /* keep whatever we already had */ }
    match = findIn(records);
  }

  if(!match){
    msg.style.color = 'var(--red)';
    msg.textContent = `No complaint found with Control Number "${cn}".`;
    setFieldResponseEnabled(false);
    f('frComplainant').value = ''; f('frAddress').value = '';
    return;
  }

  currentControlNumber = match['Control Number'];
  currentComplainant = match['Name of Complainant'] || '';
  currentAddress = [match['Sitio/Barangay'], match['Town']].filter(Boolean).join(', ');
  currentReceivedTimeRaw = parseTimeTo24_(match['Time Received']);

  populateComplaintFields(match);
  lastSnap = match;
  if(window.IlecoPrint) window.IlecoPrint.setRecord(lastSnap);   // looked-up record is printable too

  f('actedBy').value = match['Acted By'] || '';
  f('action').value = match['Action Taken'] || '';
  f('dateActed').value = parseDateToISO_(match['Date Acted']);
  f('origin').value = match['Place of Origin'] || '';
  f('arrivalPlace').value = match['Place of Arrival'] || '';
  f('departureTime').value = parseTimeTo24_(match['Departure Time']) || '';
  f('arrivalTime').value = parseTimeTo24_(match['Arrival Time']) || '';
  f('finishTime').value = parseTimeTo24_(match['Time Finished']) || '';

  f('frComplainant').value = currentComplainant;
  f('frAddress').value = currentAddress;
  document.getElementById('control-number-value').textContent = currentControlNumber;
  document.getElementById('control-number-display').style.display = '';
  setFieldResponseEnabled(true);
  recalcAndValidate();
  msg.style.color = 'var(--green)';
  msg.textContent = `Found — ready to fill in the field response.`;
}

f('frControl').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    lookupControlNumber();
  }
});

/* ---------- Complaint / Request Received: submit ---------- */
document.getElementById('complaint-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!f('barangay').value){ alert('Please select a barangay.'); return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;

  currentReceivedTimeRaw = f('timeReceived').value;
  const sitioBarangay = f('sitio').value ? `${f('sitio').value}, ${f('barangay').value}` : f('barangay').value;
  currentComplainant = f('complainant').value;
  currentAddress = [sitioBarangay, f('town').value].filter(Boolean).join(', ');

  const data = {
    "Date Received": fmtDate(f('dateReceived').value),
    "Time Received": fmtTime(currentReceivedTimeRaw),
    "Received By": f('receivedBy').value,
    "Name of Complainant": currentComplainant,
    "Contact Number": f('contactNumber').value,
    "Sitio/Barangay": sitioBarangay,
    "Town": f('town').value,
    "Type of Complaint": f('type').value,
    "Description of Complaint": f('description').value,
    "Account Name": f('acctName').value,
    "Account Number": f('acctNumber').value,
    "Meter Number": f('meterNumber').value,
    "Serial Number": f('serialNumber').value,
    "Pole Number": f('poleNumber').value
  };

  try{
    const result = await saveComplaint(data);
    currentControlNumber = result.controlNumber;
    // (the database records this in the Activity Log)
    showControlNumber(currentControlNumber);
    lastSnap = Object.assign({}, data, { "Control Number": currentControlNumber, office: BRANCH.name });
    if(window.IlecoPrint) window.IlecoPrint.setRecord(lastSnap);   // Complaint/Request saved -> printable now
    setFieldResponseEnabled(true);
    recalcAndValidate();
    document.getElementById('complaint-form').reset();
    f('barangay').value = ""; f('town').value = "";
    const toast = document.getElementById('save-toast');
    toast.textContent = "Saved ✓ Control No. " + currentControlNumber;
    setTimeout(()=> toast.textContent = "", 5000);
    loadRecords(); // refresh Records/Summary in the background
  } catch(err){
    alert("Could not save the complaint: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Field response: submit ---------- */
document.getElementById('fieldresponse-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!currentControlNumber){ alert('Save a complaint above first to get a Control Number.'); return; }

  const validationMsg = validateFieldResponse();
  if(validationMsg){
    showValidationError(validationMsg);
    return;
  }

  const btn = document.getElementById('fr-submit-btn');
  btn.disabled = true;

  const dep=f('departureTime').value, arr=f('arrivalTime').value, fin=f('finishTime').value, rec=currentReceivedTimeRaw;
  const travel = diffMinutes(dep, arr);
  const work = diffMinutes(arr, fin);
  const duration = calcDurationMin(f('dateReceived').value, rec, f('dateActed').value, fin);
  const sum = (travel!==null && work!==null) ? travel+work : "";
  const net = (duration!==null && travel!==null) ? duration-travel : "";

  const data = {
    "Acted By": f('actedBy').value,
    "Action Taken": f('action').value,
    "Date Acted": fmtDate(f('dateActed').value),
    "Place of Origin": f('origin').value,
    "Departure Time": fmtTime(dep),
    "Place of Arrival": f('arrivalPlace').value,
    "Arrival Time": fmtTime(arr),
    "Time Finished": fmtTime(fin),
    "Travel Time (min)": travel ?? "",
    "Work Duration (min)": work ?? "",
    "Travel Time + Work Duration": sum,
    "Duration (min)": duration ?? "",
    "Duration Less Travel Time (min)": net
  };

  try{
    const savedCN = currentControlNumber;
    await saveFieldResponse(savedCN, data);
    // (the database records this in the Activity Log)
    // show the result instantly in Records/Summary; a real refresh follows in the background
    const localRec = records.find(r => String(r['Control Number']||'').trim() === savedCN);
    if(localRec){ Object.assign(localRec, data); rowsCacheSet_(branchKey, records); }
    // field response saved -> the printable form now includes the response
    const printBase = localRec || (lastSnap && lastSnap["Control Number"] === savedCN ? lastSnap : { "Control Number": savedCN });
    lastSnap = Object.assign({}, printBase, data);
    if(window.IlecoPrint) window.IlecoPrint.setRecord(lastSnap);
    const toast = document.getElementById('fr-save-toast');
    toast.textContent = "Field response saved ✓";
    if(IS_FIELD){ setTimeout(()=>{ location.href = 'field.html?branch=' + encodeURIComponent(branchKey); }, 1400); }
    setTimeout(()=> toast.textContent = "", 4000);
    document.getElementById('fieldresponse-form').reset();
    f('frControl').value = ""; f('frComplainant').value = ""; f('frAddress').value = "";
    currentControlNumber = null; currentReceivedTimeRaw = null;
    setFieldResponseEnabled(false);
    document.getElementById('complaint-form').reset();
    setComplaintFieldsEnabled(true);
    recalcAndValidate();
    document.getElementById('control-number-display').style.display = 'none';
    renderFilters(records); renderTable(); renderSummary();
    loadRecords(); // background sync with the Sheet
  } catch(err){
    alert("Could not save the field response: " + err.message);
    btn.disabled = false;
  }
});

/* ---------- persistence: Supabase (secure RPC functions — see supabase/schema.sql) ---------- */
function isLive(){ return true; }

// database row  ->  the header-keyed record the rest of this file works with
const dbTime_ = v => v ? fmtTime(String(v).slice(0,5)) : '';
const dbDate_ = v => v ? fmtDate(String(v).slice(0,10)) : '';
const dbNum_  = v => (v === null || v === undefined) ? '' : v;
function rowToRecord_(r, idx){
  return {
    "No": idx+1, "office": r.office, "Control Number": r.control_number,
    "Date Received": dbDate_(r.date_received), "Time Received": dbTime_(r.time_received), "Received By": r.received_by || '',
    "Name of Complainant": r.name_of_complainant || '', "Contact Number": r.contact_number || '',
    "Sitio/Barangay": r.sitio_barangay || '', "Town": r.town || '',
    "Type of Complaint": r.type_of_complaint || '', "Description of Complaint": r.description || '',
    "Account Name": r.account_name || '', "Account Number": r.account_number || '', "Meter Number": r.meter_number || '',
    "Serial Number": r.serial_number || '', "Pole Number": r.pole_number || '',
    "Acted By": r.acted_by || '', "Action Taken": r.action_taken || '', "Date Acted": dbDate_(r.date_acted),
    "Place of Origin": r.place_of_origin || '', "Departure Time": dbTime_(r.departure_time),
    "Place of Arrival": r.place_of_arrival || '', "Arrival Time": dbTime_(r.arrival_time), "Time Finished": dbTime_(r.time_finished),
    "Travel Time (min)": dbNum_(r.travel_time_min), "Work Duration (min)": dbNum_(r.work_duration_min),
    "Travel Time + Work Duration": dbNum_(r.travel_plus_work_min), "Duration (min)": dbNum_(r.duration_min),
    "Duration Less Travel Time (min)": dbNum_(r.duration_less_travel)
  };
}
// header-keyed form data  ->  database columns
const str_ = v => (v === undefined || v === null) ? '' : String(v);
const int_ = v => (v === '' || v === undefined || v === null || isNaN(Number(v))) ? null : Math.round(Number(v));
function complaintToDb_(d){
  return {
    office: BRANCH.name,
    date_received: parseDateToISO_(d["Date Received"]) || null, time_received: parseTimeTo24_(d["Time Received"]) || null,
    received_by: str_(d["Received By"]), name_of_complainant: str_(d["Name of Complainant"]), contact_number: str_(d["Contact Number"]),
    sitio_barangay: str_(d["Sitio/Barangay"]), town: str_(d["Town"]), type_of_complaint: str_(d["Type of Complaint"]),
    description: str_(d["Description of Complaint"]), account_name: str_(d["Account Name"]), account_number: str_(d["Account Number"]),
    meter_number: str_(d["Meter Number"]), serial_number: str_(d["Serial Number"]), pole_number: str_(d["Pole Number"])
  };
}
function responseToDb_(d){
  return {
    acted_by: str_(d["Acted By"]), action_taken: str_(d["Action Taken"]), date_acted: parseDateToISO_(d["Date Acted"]) || null,
    place_of_origin: str_(d["Place of Origin"]), departure_time: parseTimeTo24_(d["Departure Time"]) || null,
    place_of_arrival: str_(d["Place of Arrival"]), arrival_time: parseTimeTo24_(d["Arrival Time"]) || null,
    time_finished: parseTimeTo24_(d["Time Finished"]) || null,
    travel_time_min: int_(d["Travel Time (min)"]), work_duration_min: int_(d["Work Duration (min)"]),
    travel_plus_work_min: int_(d["Travel Time + Work Duration"]), duration_min: int_(d["Duration (min)"]),
    duration_less_travel: int_(d["Duration Less Travel Time (min)"])
  };
}

// The Control Number is reserved and the complaint saved in ONE atomic database call,
// so two people saving at the same moment can never collide.
async function saveComplaint(data){
  const res = await App.rpc('app_insert_complaint', { p_row: complaintToDb_(data) });
  const r = Array.isArray(res) ? res[0] : res;
  if(!r || !r.ok) throw new Error((r && r.error) || 'Could not save the complaint.');
  return { controlNumber: r.control_number };
}

async function saveFieldResponse(controlNumber, data){
  const res = await App.rpc('app_update_complaint', { p_office: BRANCH.name, p_control_number: controlNumber, p_row: responseToDb_(data) });
  const r = Array.isArray(res) ? res[0] : res;
  if(!r || !r.ok) throw new Error((r && r.error) || 'Control Number not found: ' + controlNumber);
}

async function fetchRows(){
  const data = await App.rpc('app_list_complaints', { p_office: BRANCH.name });
  const rows = (data || []).map(rowToRecord_);
  const fresh = applyDurations(rows);
  rowsCacheSet_(branchKey, fresh);
  return fresh;
}

populateBarangayDropdown();

/* ---------- action-taken pill styling ---------- */
function pillFor(action){
  const a = (action||"").toLowerCase();
  if(a.includes("refus")) return "red";
  if(a.includes("repair")) return "green";
  if(a.includes("adjust") || a.includes("increase") || a.includes("bill")) return "blue";
  return "amber";
}

/* ---------- rendering ---------- */
function renderConnBanner(){
  const el = document.getElementById('conn-banner');
  if(isLive()){
    el.innerHTML = `<div class="conn live">Connected to database<span></span></div>`;
  }
}

function renderStats(target, rows){
  const total = rows.length;
  const sum = key => rows.reduce((s,r)=> s + (Number(r[key])||0), 0);
  target.innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Total complaints &amp; requests</div></div>
    <div class="stat"><div class="num">${sum('Travel Time (min)')}</div><div class="lbl">Total travel time (min)</div></div>
    <div class="stat"><div class="num">${sum('Duration (min)')}</div><div class="lbl">Total duration (min)</div></div>
    <div class="stat"><div class="num">${sum('Duration Less Travel Time (min)')}</div><div class="lbl">Total duration less travel (min)</div></div>
  `;
}

function renderFilters(rows){
  const townSel = document.getElementById('filter-town');
  const typeSel = document.getElementById('filter-type');
  const towns = [...new Set(rows.map(r=>r['Town']).filter(Boolean))].sort();
  const types = [...new Set(rows.map(r=>r['Type of Complaint']).filter(Boolean))].sort();
  townSel.innerHTML = '<option value="">All towns</option>' + towns.map(t=>`<option>${E(t)}</option>`).join('');
  typeSel.innerHTML = '<option value="">All types</option>' + types.map(t=>`<option>${E(t)}</option>`).join('');
}

/* ---------- shared From/To Date range: drives Records, Summary and Excel export alike ---------- */
function getDateRange(){
  return {
    from: document.getElementById('filter-from-date').value,
    to: document.getElementById('filter-to-date').value
  };
}

function validateDateRangeInputs(){
  const { from, to } = getDateRange();
  if(from && to && from > to){
    return "Invalid date range: From Date cannot be later than To Date.";
  }
  if((from && !to) || (!from && to)){
    return "Enter both a From Date and To Date to filter by date range.";
  }
  return null;
}

/* ---------- separate date range just for the Excel download ---------- */
function getDownloadDateRange(fromId, toId){
  return {
    from: document.getElementById(fromId).value,
    to: document.getElementById(toId).value
  };
}

function validateDownloadDateRangeInputs(fromId, toId){
  const { from, to } = getDownloadDateRange(fromId, toId);
  if(from && to && from > to){
    return "Invalid date range: From Date cannot be later than To Date.";
  }
  if((from && !to) || (!from && to)){
    return "Enter both a From Date and To Date to choose what to download.";
  }
  return null;
}

function showDownloadDateError(errorBoxId, msg){
  const box = document.getElementById(errorBoxId);
  if(!box) return;
  if(msg){ box.textContent = msg; box.style.display = ''; }
  else { box.textContent = ''; box.style.display = 'none'; }
}

function recordInDateRange(record, from, to){
  if(!from || !to) return true; // no complete range set — don't filter
  const iso = parseDateToISO_(record['Date Received']);
  if(!iso) return false;
  return iso >= from && iso <= to;
}

function syncDateInputs(source){
  const from = document.getElementById('filter-from-date').value;
  const to = document.getElementById('filter-to-date').value;
  document.getElementById('summary-from-date').value = from;
  document.getElementById('summary-to-date').value = to;
}

function showDateError(msg){
  const tblBox = document.getElementById('tbl-date-error');
  const sumBox = document.getElementById('summary-date-error');
  [tblBox, sumBox].forEach(box=>{
    if(msg){ box.textContent = msg; box.style.display = ''; }
    else { box.textContent = ''; box.style.display = 'none'; }
  });
}

function applyDateRangeAndRerender(){
  syncDateInputs();
  const msg = validateDateRangeInputs();
  showDateError(msg);
  renderTable();
  renderSummary();
}

["filter-from-date","filter-to-date","summary-from-date","summary-to-date"].forEach(id=>{
  document.getElementById(id).addEventListener('change', ()=>{
    // Keep the Records-tab fields as the values of record — whichever pair changed, copy it across.
    if(id.startsWith('summary-')){
      document.getElementById('filter-from-date').value = document.getElementById('summary-from-date').value;
      document.getElementById('filter-to-date').value = document.getElementById('summary-to-date').value;
    }
    applyDateRangeAndRerender();
  });
});

// ---------- Reusable pagination: default 10 per page, matches the style used elsewhere ----------
function makePaginator_(barEl, pageSizeKey){
  const state = { page: 1, pageSize: Number(sessionStorage.getItem(pageSizeKey)) || 10 };
  return {
    state,
    slice(rows){
      const total = rows.length;
      const pages = Math.max(1, Math.ceil(total / state.pageSize));
      if(state.page > pages) state.page = pages;
      if(state.page < 1) state.page = 1;
      const start = (state.page - 1) * state.pageSize;
      const pageRows = rows.slice(start, start + state.pageSize);
      const shownFrom = total === 0 ? 0 : start + 1;
      const shownTo = Math.min(start + state.pageSize, total);
      barEl.innerHTML = `
        <label>Items per page:
          <select class="pg-size">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===state.pageSize?'selected':''}>${n}</option>`).join('')}
          </select>
        </label>
        <div class="pg-nav">
          <span>${shownFrom} - ${shownTo} of ${total}</span>
          <button class="pg-prev" ${state.page<=1?'disabled':''} aria-label="Previous page">‹</button>
          <button class="pg-next" ${state.page>=pages?'disabled':''} aria-label="Next page">›</button>
        </div>`;
      return pageRows;
    }
  };
}
function wirePaginator_(barEl, paginator, rerender){
  barEl.addEventListener('change', e=>{
    if(!e.target.classList.contains('pg-size')) return;
    paginator.state.pageSize = Number(e.target.value);
    sessionStorage.setItem(barEl.dataset.pgkey, paginator.state.pageSize);
    paginator.state.page = 1;
    rerender();
  });
  barEl.addEventListener('click', e=>{
    if(e.target.classList.contains('pg-prev')){ paginator.state.page--; rerender(); }
    else if(e.target.classList.contains('pg-next')){ paginator.state.page++; rerender(); }
  });
}
const recordsPaginator_ = makePaginator_(document.getElementById('records-pg'), 'ileco_pgsize_records');
document.getElementById('records-pg').dataset.pgkey = 'ileco_pgsize_records';
wirePaginator_(document.getElementById('records-pg'), recordsPaginator_, renderTable);

function renderTable(){
  const q = document.getElementById('search-box').value.toLowerCase();
  const town = document.getElementById('filter-town').value;
  const type = document.getElementById('filter-type').value;
  const { from, to } = getDateRange();
  const dateRangeOk = !validateDateRangeInputs() || (!from && !to);

  const allRows = records.filter(r=>{
    if(town && r['Town']!==town) return false;
    if(type && r['Type of Complaint']!==type) return false;
    if(dateRangeOk && !recordInDateRange(r, from, to)) return false;
    if(q){
      const hay = [r['Name of Complainant'],r['Sitio/Barangay'],r['Action Taken'],r['Received By'],(r['Time Finished'] ? 'Completed' : 'Pending')].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const rows = recordsPaginator_.slice(allRows); // stats below still use the FULL filtered set, not just this page

  const body = document.getElementById('records-body');
  if(rows.length===0){
    body.innerHTML = `<tr><td colspan="${document.querySelectorAll('#records-table thead th').length}"><div class="empty">No records match. Try clearing the search or filters.</div></td></tr>`;
  } else {
    body.innerHTML = rows.map(r=>`
      <tr>
        <td>${E(r['No'])}</td><td class="mono">${E(r['Control Number'])}</td><td><span class="pill ${r['Time Finished'] ? 'green' : 'amber'}">${r['Time Finished'] ? 'Completed' : 'Pending'}</span></td><td>${E(r['Date Received'])}</td><td>${E(r['Time Received'])}</td><td>${E(r['Received By'])}</td>
        <td>${E(r['Name of Complainant'])}</td><td>${E(r['Contact Number'])}</td><td>${E(r['Sitio/Barangay'])}</td><td>${E(r['Town'])}</td><td>${E(r['Type of Complaint'])}</td><td>${E(r['Description of Complaint'])}</td>
        <td>${E(r['Account Name'])}</td><td>${E(r['Account Number'])}</td><td>${E(r['Meter Number'])}</td><td>${E(r['Serial Number'])}</td><td>${E(r['Pole Number'])}</td>
        <td>${E(r['Acted By'])}</td><td><span class="pill ${pillFor(r['Action Taken'])}">${E(r['Action Taken'])}</span></td><td>${E(r['Date Acted'])}</td>
        <td>${E(r['Place of Origin'])}</td><td>${E(r['Departure Time'])}</td><td>${E(r['Place of Arrival'])}</td><td>${E(r['Arrival Time'])}</td><td>${E(r['Time Finished'])}</td>
        <td class="num">${E(r['Travel Time (min)'])}</td><td class="num">${E(r['Work Duration (min)'])}</td><td class="num">${E(r['Travel Time + Work Duration'])}</td>
        <td class="num">${E(r['Duration (min)'])}</td><td class="num">${E(r['Duration Less Travel Time (min)'])}</td>
      </tr>`).join('');
  }
  renderStats(document.getElementById('stat-row'), allRows);
}

function renderSummary(){
  const { from, to } = getDateRange();
  const rangeOk = !validateDateRangeInputs();
  const filtered = rangeOk ? records.filter(r => recordInDateRange(r, from, to)) : records;

  renderStats(document.getElementById('summary-stats'), filtered);
  const byTown = {}, byType = {}, byBarangay = {};
  filtered.forEach(r=>{
    const t = r['Town']||'—'; byTown[t] = (byTown[t]||0)+1;
    const y = r['Type of Complaint']||'—'; byType[y] = (byType[y]||0)+1;
    const b = extractBarangay(r) || '—'; byBarangay[b] = (byBarangay[b]||0)+1;
  });
  draw3DBar(byTown, document.getElementById('bar3d-town'), document.getElementById('bar3d-town-legend'));
  draw3DBar(byType, document.getElementById('bar3d-type'), document.getElementById('bar3d-type-legend'));
  draw3DBar(byBarangay, document.getElementById('bar3d-barangay'), document.getElementById('bar3d-barangay-legend'));
}

function extractBarangay(record){
  const combo = String(record['Sitio/Barangay'] || '');
  const parts = combo.split(',').map(s=>s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length-1] : (parts[0] || '');
}

const PIE_COLORS = ['#F5B72E','#3A7CA5','#2E8B57','#B7473D','#8E44AD','#D9900F','#4C7A5E','#5C6BC0','#C2185B','#607D8B','#795548','#00897B'];

function shade(hex, amt){
  const c = hex.replace('#','');
  const num = parseInt(c,16);
  let r=(num>>16)+amt, g=((num>>8)&0xff)+amt, b=(num&0xff)+amt;
  r=Math.min(255,Math.max(0,r)); g=Math.min(255,Math.max(0,g)); b=Math.min(255,Math.max(0,b));
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/* ---------- pseudo-3D pie (tilted disc with an extruded side wall) ---------- */
/* ---------- pseudo-3D horizontal bar chart, with count + % detail ---------- */
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

async function loadRecords(){
  renderConnBanner();
  if(isLive() && records.length===0){
    const cached = rowsCacheGet_(branchKey);   // show the last saved records instantly
    if(cached && cached.length){ records = applyDurations(cached); renderFilters(records); renderTable(); renderSummary(); }
  }
  try{
    records = await fetchRows();
  }catch(err){
    records = [];
    document.getElementById('conn-banner').innerHTML = `<div class="conn demo">Couldn't reach the database (${E(err.message)}).</div>`;
  }
  renderFilters(records);
  renderTable();
  renderSummary();
}

document.getElementById('search-box').addEventListener('input', ()=>{ recordsPaginator_.state.page=1; renderTable(); });
document.getElementById('filter-town').addEventListener('change', ()=>{ recordsPaginator_.state.page=1; renderTable(); });
document.getElementById('filter-type').addEventListener('change', ()=>{ recordsPaginator_.state.page=1; renderTable(); });
/* ---------- download records as Excel, styled like the official form ---------- */
function recordMatchesMonth(record, year, month){
  const raw = record['Date Received'];
  if(!raw) return false;
  const d = new Date(raw);
  if(isNaN(d)) return false;
  return d.getFullYear()===year && (d.getMonth()+1)===month;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const LETTERHEAD_IMG_B64 = window.LETTERHEAD_IMG_B64;
const COL_WIDTHS = [5,11,11,13,20,20,11,9,15,26,11,13,11,24,11,11,8,8,10,9,10];
const LAST_COL_LETTER = "U"; // 21 columns, A..U

function branchDisplayLabel(){
  return branchKey === 'main' ? 'MAIN OFFICE' : BRANCH.name.toUpperCase();
}

/* ---------- rasterize an on-screen SVG chart into a PNG for embedding in Excel ---------- */
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

/* ---------- column sets for the two Excel exports ---------- */
// Matches the original ILECO summary-of-complaints form exactly: no
// Control Number, Contact Number, Description, or Bill Details columns.
const BASIC_EXPORT_COLUMNS = [
  { key:"No", label:"No" },
  { key:"Date Received", label:"Date Received" },
  { key:"Time Received", label:"Time Received" },
  { key:"Received By", label:"Received By" },
  { key:"Name of Complainant", label:"Name of Complainant" },
  { key:"Sitio/Barangay", label:"Barangay/Sitio" },
  { key:"Town", label:"Town" },
  { key:"Type of Complaint", label:"Type of Complaint" },
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
const BASIC_WIDTHS = {"No":5,"Date Received":11,"Time Received":11,"Received By":13,
  "Name of Complainant":20,"Sitio/Barangay":20,"Town":11,"Type of Complaint":10,
  "Acted By":15,"Action Taken":26,"Date Acted":11,"Place of Origin":13,"Departure Time":11,
  "Place of Arrival":24,"Arrival Time":11,"Time Finished":11,"Travel Time (min)":8,"Work Duration (min)":8,
  "Travel Time + Work Duration":10,"Duration (min)":9,"Duration Less Travel Time (min)":10};

// Full export = the basic set plus Control Number, Contact Number,
// Description, and the Bill Details columns — everything logged in the sheet.
const FULL_EXPORT_COLUMNS = [
  { key:"No", label:"No" },
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
const FULL_WIDTHS = Object.assign({}, BASIC_WIDTHS, {
  "Status":11,
  "Control Number":14, "Contact Number":13, "Description of Complaint":26,
  "Account Name":16, "Account Number":13, "Meter Number":11, "Serial Number":11, "Pole Number":10
});

async function downloadExcel(opts = {}){
  const { fromId = 'dl-from-date', toId = 'dl-to-date', errorBoxId = 'dl-date-error',
          columns = BASIC_EXPORT_COLUMNS, widths = BASIC_WIDTHS, filenameTag = 'Complaint_Records' } = opts;
  if(typeof ExcelJS === 'undefined'){ alert('The Excel export library is still loading — try again in a moment.'); return; }

  const rangeMsg = validateDownloadDateRangeInputs(fromId, toId);
  if(rangeMsg){ showDownloadDateError(errorBoxId, rangeMsg); alert(rangeMsg); return; }
  showDownloadDateError(errorBoxId, null);
  const { from, to } = getDownloadDateRange(fromId, toId);
  const hasRange = !!(from && to);
  const rows = hasRange ? records.filter(r => recordInDateRange(r, from, to)) : records.slice();

  try{
    // The workbook itself is built by the shared excel-export.js (same layout as the approved sample files).
    await IlecoExcel.build({
      rows, columns, widths, branchLabel: branchDisplayLabel(),
      fileSlug: BRANCH.name.replace(/[^a-z0-9]+/gi, '-'), filenameTag, from, to,
      banner: IlecoExcel.BANNER_BRANCH
    });
    await logActivity('Downloaded Excel', `${BRANCH.name} — ${filenameTag} — ${hasRange ? from+' to '+to : 'all records'} (${rows.length} rows)`);
  }catch(err){
    alert('Could not create the Excel file: ' + err.message);
  }
}

document.getElementById('download-btn').addEventListener('click', ()=>downloadExcel({
  fromId: 'dl-from-date', toId: 'dl-to-date', errorBoxId: 'dl-date-error',
  columns: BASIC_EXPORT_COLUMNS, widths: BASIC_WIDTHS, filenameTag: 'Complaint_Records'
}));
document.getElementById('download-all-btn').addEventListener('click', ()=>downloadExcel({
  fromId: 'full-from-date', toId: 'full-to-date', errorBoxId: 'full-date-error',
  columns: FULL_EXPORT_COLUMNS, widths: FULL_WIDTHS, filenameTag: 'Complaint_Records_Full'
}));
document.getElementById('summary-download-btn').addEventListener('click', ()=>downloadExcel({
  fromId: 'summary-dl-from-date', toId: 'summary-dl-to-date', errorBoxId: 'summary-dl-date-error',
  columns: BASIC_EXPORT_COLUMNS, widths: BASIC_WIDTHS, filenameTag: 'Complaint_Records'
}));
document.getElementById('summary-download-all-btn').addEventListener('click', ()=>downloadExcel({
  fromId: 'summary-full-from-date', toId: 'summary-full-to-date', errorBoxId: 'summary-full-date-error',
  columns: FULL_EXPORT_COLUMNS, widths: FULL_WIDTHS, filenameTag: 'Complaint_Records_Full'
}));

document.getElementById('refresh-btn').addEventListener('click', loadRecords);

/* ---------- nav ---------- */
document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
    if(btn.dataset.view!=='log') loadRecords();
  });
});

/* ---------- init ---------- */
(function init(){
  const now = new Date();
  f('dateReceived').value = now.toISOString().slice(0,10);
  f('timeReceived').value = now.toTimeString().slice(0,5);
  if(f('download-month')) f('download-month').value = now.toISOString().slice(0,7);
  recalc();
  loadRecords();
  const cnParam = new URLSearchParams(location.search).get('cn');
  if(cnParam){
    f('frControl').value = cnParam;
    lookupControlNumber().then(()=>{
      const el = document.getElementById('fieldresponse-form');
      if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }
})();

})();
