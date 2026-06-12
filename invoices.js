"use strict";

// ── CONSTANTS ─────────────────────────────────────────────────────────────
const INV_KEY         = "soa_invoices";
const MASTER_KEY      = "soa_masters";     // {toName,toAddr,owner,charterers,vessel}[]
const META_KEY        = "soa_inv_meta";    // {counters:{fy:lastSeq}}
const INV_NUMBERS_KEY = "soa_inv_numbers"; // string[] of every invoice number ever used

let INV_BANK = {
  swift:    "",
  bank:     "",
  favoring: "SEAORION SHIPPING LLP",
  account:  "",
};

const _MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                 "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

// ── DATE HELPERS ──────────────────────────────────────────────────────────
function invOrdinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "TH";
  switch (n % 10) {
    case 1: return n + "ST";
    case 2: return n + "ND";
    case 3: return n + "RD";
    default: return n + "TH";
  }
}
// "2026-05-12" → "12TH MAY 2026"
function invFmtCpDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${invOrdinal(d)} ${_MONTHS[m - 1]} ${y}`;
}
// "2026-06-03" → "03-06-2026"
function invFmtShortDate(iso) {
  if (!iso) return "";
  return iso.split("-").reverse().join("-");
}

// ── GENERIC STORAGE ───────────────────────────────────────────────────────
function _keyLoad(key, def) {
  if (!window._cache) window._cache = {};
  if (window._cache[key] !== undefined) return window._cache[key];
  try {
    const v = localStorage.getItem(key);
    const d = v ? JSON.parse(v) : def;
    window._cache[key] = d;
    return d;
  } catch { return JSON.parse(JSON.stringify(def)); }
}
function _keySave(key, data) {
  if (!window._cache) window._cache = {};
  window._cache[key] = data;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  if (window._fbEnabled && window._db) {
    window._db.collection("seaorion").doc(key)
      .set({ payload: JSON.stringify(data) })
      .catch(e => console.error(`Firestore[${key}]:`, e));
  }
}

// ── INVOICES ──────────────────────────────────────────────────────────────
const invLoad  = () => _keyLoad(INV_KEY, []);
const invSave  = d  => _keySave(INV_KEY, d);

// ── MASTER DATA ───────────────────────────────────────────────────────────
const masterLoad = () => _keyLoad(MASTER_KEY, []);
const masterSave = d => _keySave(MASTER_KEY, d);

function masterUpsert(rec) {
  const masters = masterLoad();
  // Natural key: toName + vessel (most specific unique combo)
  const key = (rec.toName || "").toLowerCase() + "||" + (rec.vessel || "").toLowerCase();
  const idx  = masters.findIndex(m =>
    (m.toName || "").toLowerCase() + "||" + (m.vessel || "").toLowerCase() === key
  );
  const entry = { ...rec, updatedAt: Date.now() };
  if (idx >= 0) masters[idx] = entry;
  else masters.push(entry);
  masterSave(masters);
}

function masterSearch(field, query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const seen = new Set();
  return masterLoad()
    .filter(m => (m[field] || "").toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter(m => { const v = m[field] || ""; if (seen.has(v)) return false; seen.add(v); return true; })
    .slice(0, 8);
}

// ── INVOICE META / COUNTER ────────────────────────────────────────────────
const metaLoad = () => _keyLoad(META_KEY, { counters: {} });
const metaSave = d => _keySave(META_KEY, d);

function invGetFY(d) {
  const dt = d || new Date();
  const y = dt.getFullYear(), m = dt.getMonth() + 1; // month is 1-indexed
  const start = m >= 4 ? y : y - 1;
  return String(start).slice(2) + String(start + 1).slice(2); // "2627"
}

function invNextNumberStr() {
  const meta = metaLoad();
  const fy   = invGetFY();
  const last = (meta.counters || {})[fy] || 0;
  return `SOS-${fy}-${String(last + 1).padStart(2, "0")}`;
}

function invSaveUsedNumber(invoiceNo) {
  const m = (invoiceNo || "").match(/^SOS-(\d{4})-(\d+)$/);
  if (!m) return;
  const [, fy, seqStr] = m;
  const seq  = parseInt(seqStr, 10);
  const meta = metaLoad();
  if (!meta.counters) meta.counters = {};
  if (seq > (meta.counters[fy] || 0)) {
    meta.counters[fy] = seq;
    metaSave(meta);
  }
}

// ── INVOICE NUMBER MASTER ─────────────────────────────────────────────────
const invNumsLoad = () => _keyLoad(INV_NUMBERS_KEY, []);
const invNumsSave = d  => _keySave(INV_NUMBERS_KEY, d);

function invNumAdd(invoiceNo) {
  if (!invoiceNo) return;
  const nums = invNumsLoad();
  if (!nums.includes(invoiceNo)) { nums.push(invoiceNo); invNumsSave(nums); }
}

function invNumIsUsed(invoiceNo) {
  return !!(invoiceNo && invNumsLoad().includes(invoiceNo));
}

// Bootstrap from existing invoices on first load
function invBootstrapNumbers() {
  if (invNumsLoad().length) return;
  const nums = [...new Set(invLoad().map(i => i.invoiceNo).filter(Boolean))];
  if (nums.length) invNumsSave(nums);
}

// Real-time duplicate check on the Invoice No field
function invCheckInvNo() {
  const input = document.getElementById("invNo");
  const warn  = document.getElementById("invNoWarn");
  if (!input || !warn) return;
  const val = input.value.trim();
  if (val && invNumIsUsed(val)) {
    warn.textContent = "⚠ This number was already used — proceeding will create a duplicate.";
    input.style.borderColor = "#f87171";
  } else {
    warn.textContent = "";
    input.style.borderColor = "";
  }
}

// Seed counter from existing invoices on first load (backward compat)
function invBootstrapCounter() {
  const meta = metaLoad();
  if (Object.keys(meta.counters || {}).length) return;
  const counters = {};
  invLoad().forEach(inv => {
    const m = (inv.invoiceNo || "").match(/^SOS-(\d{4})-(\d+)$/);
    if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, parseInt(m[2], 10));
  });
  if (Object.keys(counters).length) {
    meta.counters = counters;
    metaSave(meta);
  }
}

// ── AUTOCOMPLETE ENGINE ───────────────────────────────────────────────────
function invAcAttach(inputId, masterField) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let acEl = null;

  function show(records) {
    hide();
    if (!records.length) return;
    acEl = document.createElement("ul");
    acEl.className = "inv-ac-list";
    records.forEach(rec => {
      const li = document.createElement("li");
      li.className = "inv-ac-item";
      li.textContent = rec[masterField] || "";
      li.addEventListener("mousedown", e => {
        e.preventDefault();
        invAcFill(rec);
        hide();
      });
      acEl.appendChild(li);
    });
    const wrap = input.closest(".inv-ac-wrap");
    if (wrap) wrap.appendChild(acEl);
  }

  function hide() { acEl?.remove(); acEl = null; }

  function refresh() {
    const val = input.value.trim();
    val ? show(masterSearch(masterField, val)) : hide();
  }

  input.addEventListener("input",  refresh);
  input.addEventListener("focus",  refresh);
  input.addEventListener("blur",   () => setTimeout(hide, 180));
  input.addEventListener("keydown", e => {
    if (!acEl) return;
    const items = [...acEl.querySelectorAll(".inv-ac-item")];
    const cur   = acEl.querySelector(".inv-ac-item.ac-active");
    let idx     = cur ? items.indexOf(cur) : -1;
    if (e.key === "ArrowDown")  { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); }
    else if (e.key === "Enter" && cur) { e.preventDefault(); cur.dispatchEvent(new MouseEvent("mousedown")); return; }
    else if (e.key === "Escape") { hide(); return; }
    else return;
    items.forEach((li, i) => li.classList.toggle("ac-active", i === idx));
    items[idx]?.scrollIntoView({ block: "nearest" });
  });
}

function invAcFill(rec) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };
  // Combined TO field: company name + address in one textarea
  const toEl = document.getElementById("invTo");
  if (toEl) toEl.value = (rec.toName || "") + (rec.toAddr ? "\n" + rec.toAddr : "");
  set("invOwner",      rec.owner);
  set("invCharterers", rec.charterers);
  set("invVessel",     rec.vessel);
}

// Autocomplete for combined TO textarea — only fires on the first line
function invAcAttachTo(textareaId) {
  const input = document.getElementById(textareaId);
  if (!input) return;
  let acEl = null;

  function getQuery() {
    const val = input.value || "";
    const cursor = input.selectionStart ?? val.indexOf("\n");
    const firstNL = val.indexOf("\n");
    // Only autocomplete when cursor hasn't passed the first newline
    if (firstNL !== -1 && cursor > firstNL) return "";
    return val.split("\n")[0].trim();
  }

  function show(records) {
    hide();
    if (!records.length) return;
    acEl = document.createElement("ul");
    acEl.className = "inv-ac-list";
    records.forEach(rec => {
      const li = document.createElement("li");
      li.className = "inv-ac-item";
      li.innerHTML = `<strong>${_esc(rec.toName)}</strong>` +
        (rec.toAddr ? `<span style="opacity:.5;font-size:.8em;margin-left:8px;">${_esc(rec.toAddr.replace(/\n/g,", "))}</span>` : "");
      li.addEventListener("mousedown", e => { e.preventDefault(); invAcFill(rec); hide(); });
      acEl.appendChild(li);
    });
    const wrap = input.closest(".inv-ac-wrap");
    if (wrap) wrap.appendChild(acEl);
  }

  function hide() { acEl?.remove(); acEl = null; }
  function refresh() {
    const q = getQuery();
    q ? show(masterSearch("toName", q)) : hide();
  }

  input.addEventListener("input",  refresh);
  input.addEventListener("focus",  refresh);
  input.addEventListener("blur",   () => setTimeout(hide, 180));
  input.addEventListener("keydown", e => {
    if (!acEl) return;
    const items = [...acEl.querySelectorAll(".inv-ac-item")];
    const cur   = acEl.querySelector(".inv-ac-item.ac-active");
    let idx     = cur ? items.indexOf(cur) : -1;
    if (e.key === "ArrowDown")  { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); }
    else if (e.key === "Enter" && cur) { e.preventDefault(); cur.dispatchEvent(new MouseEvent("mousedown")); }
    else if (e.key === "Escape") { hide(); }
    else return;
    items.forEach((li, i) => li.classList.toggle("ac-active", i === idx));
    items[idx]?.scrollIntoView({ block: "nearest" });
  });
}

// ── CP DATE ───────────────────────────────────────────────────────────────
function invUpdateCpDate() {
  const picker  = document.getElementById("invCpDatePicker");
  const display = document.getElementById("invCpDate");
  if (picker && display) display.value = invFmtCpDate(picker.value);
}

// ── CALC ──────────────────────────────────────────────────────────────────
function invCalc() {
  const pct     = parseFloat(document.getElementById("invCommPct")?.value)  || 0;
  const freight = parseFloat(document.getElementById("invFreight")?.value)  || 0;
  const el = document.getElementById("invCommAmt");
  if (!el) return;
  el.value = freight > 0
    ? "$" + (freight * pct / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
}

// ── RESET ─────────────────────────────────────────────────────────────────
function invReset() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set("invNo",           invNextNumberStr());
  set("invDate",         new Date().toISOString().slice(0, 10));
  set("invTo",           "");
  set("invOwner",        "");
  set("invCharterers",   "");
  set("invVessel",       "");
  set("invCpDatePicker", "");
  set("invCpDate",       "");
  set("invCommPct",      "2.5");
  set("invFreight",      "");
  set("invCommAmt",      "");
}

// ── FORM VALIDATION ────────────────────────────────────────────────────────
const _INVF = [
  { label: "Invoice No",           req: true,  elId: "invNo",
    ok: () => !!(document.getElementById("invNo")?.value.trim()) },
  { label: "Invoice Date",         req: true,  elId: "invDate",
    ok: () => !!(document.getElementById("invDate")?.value.trim()) },
  { label: "TO — Company Name",    req: true,  elId: "invTo",
    ok: () => !!((document.getElementById("invTo")?.value||"").split("\n")[0].trim()) },
  { label: "Owner",                req: false, elId: "invOwner",
    ok: () => !!(document.getElementById("invOwner")?.value.trim()) },
  { label: "Charterers",           req: false, elId: "invCharterers",
    ok: () => !!(document.getElementById("invCharterers")?.value.trim()) },
  { label: "Vessel Name",          req: true,  elId: "invVessel",
    ok: () => !!(document.getElementById("invVessel")?.value.trim()) },
  { label: "CP Date",              req: false, elId: "invCpDatePicker",
    ok: () => !!(document.getElementById("invCpDate")?.value.trim()) },
  { label: "Freight Amount (USD)", req: true,  elId: "invFreight",
    ok: () => parseFloat(document.getElementById("invFreight")?.value) > 0 },
  { label: "Commission %",         req: false, elId: "invCommPct",
    ok: () => (document.getElementById("invCommPct")?.value||"").trim() !== "" },
];

function _invMissing() {
  const req = [], opt = [];
  _INVF.forEach(f => { if (!f.ok()) (f.req ? req : opt).push(f); });
  return { req, opt };
}

function _invShowValidModal(missing) {
  document.getElementById("invValidModal")?.remove();
  const hasReq = missing.req.length > 0;
  const overlay = document.createElement("div");
  overlay.id = "invValidModal";
  overlay.className = "inv-modal-overlay";

  const rows = [
    ...missing.req.map(f =>
      `<li class="inv-vf-row inv-vf-req">
         <span class="inv-vf-icon">✕</span>
         <span>${f.label}</span>
         <span class="inv-vf-badge inv-vf-badge-req">required</span>
       </li>`),
    ...missing.opt.map(f =>
      `<li class="inv-vf-row inv-vf-opt">
         <span class="inv-vf-icon">!</span>
         <span>${f.label}</span>
         <span class="inv-vf-badge">optional</span>
       </li>`),
  ].join("");

  overlay.innerHTML = `
    <div class="inv-modal-panel" style="max-width:460px;">
      <div class="inv-modal-hdr">
        <div>
          <h3 style="color:#f59e0b;">⚠ Incomplete Form</h3>
          <span class="inv-modal-sub">The following fields are not filled in</span>
        </div>
        <button class="inv-modal-close" onclick="document.getElementById('invValidModal').remove()">✕</button>
      </div>
      <div style="padding:1.1rem 1.5rem 1.4rem;">
        <ul class="inv-vf-list">${rows}</ul>
        ${hasReq
          ? `<p class="inv-vf-msg">Please fill in the <strong style="color:#f87171;">required</strong> fields before generating.</p>
             <div class="inv-vf-btns">
               <button class="inv-btn-primary" onclick="document.getElementById('invValidModal').remove();_invFocusFirst();">Go Back &amp; Fill</button>
             </div>`
          : `<p class="inv-vf-msg">Optional fields above are empty. You can proceed or go back to fill them in.</p>
             <div class="inv-vf-btns">
               <button class="inv-btn-primary" onclick="document.getElementById('invValidModal').remove();_invDoGenerate();">Proceed Anyway</button>
               <button class="inv-btn-secondary" onclick="document.getElementById('invValidModal').remove();">Go Back &amp; Fill</button>
             </div>`
        }
      </div>
    </div>`;

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("inv-modal-show"));

  // Highlight empty required fields
  missing.req.forEach(f => {
    const el = document.getElementById(f.elId);
    if (el) el.style.borderColor = "#f87171";
  });
}

function _invFocusFirst() {
  const { req, opt } = _invMissing();
  const first = req[0] || opt[0];
  if (!first) return;
  const el = document.getElementById(first.elId);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => el.focus(), 280); }
}

// ── CREATE (entry point — runs validation first) ───────────────────────────
function invCreate() {
  const { req, opt } = _invMissing();
  if (req.length || opt.length) { _invShowValidModal({ req, opt }); return; }
  _invDoGenerate();
}

// ── GENERATE (called after validation passes) ──────────────────────────────
function _invDoGenerate() {
  const g = id => (document.getElementById(id)?.value || "").trim();
  const invoiceNo   = g("invNo");
  const date        = g("invDate");
  const toRaw       = (document.getElementById("invTo")?.value || "").trim();
  const toLines     = toRaw.split("\n");
  const toName      = toLines[0].trim();
  const toAddr      = toLines.slice(1).join("\n").trim();
  const owner       = g("invOwner");
  const charterers  = g("invCharterers");
  const vessel      = g("invVessel");
  const cpDate      = g("invCpDate") || invFmtCpDate(g("invCpDatePicker"));
  const commPct     = parseFloat(document.getElementById("invCommPct")?.value) || 0;
  const freight     = parseFloat(document.getElementById("invFreight")?.value) || 0;

  if (invNumIsUsed(invoiceNo)) {
    if (!confirm(`Invoice number "${invoiceNo}" has already been used.\n\nThis will create a duplicate. Continue anyway?`)) return;
  }

  const commAmt = (freight * commPct / 100).toFixed(2);
  const invoice = { invoiceNo, date, toName, toAddr, owner, charterers, vessel, cpDate, commPct, freight, commAmt, createdAt: Date.now() };

  const invoices = invLoad();
  invoices.unshift(invoice);
  invSave(invoices);

  masterUpsert({ toName, toAddr, owner, charterers, vessel });
  invSaveUsedNumber(invoiceNo);
  invNumAdd(invoiceNo);

  invRender();
  invShowPdfPreview(0);
}

// ── DELETE ────────────────────────────────────────────────────────────────
function invDelete(i) {
  const inv = invLoad()[i];
  if (!inv) return;
  confirmDelete({
    title: `Delete Invoice ${inv.invoiceNo}?`,
    message: "This will permanently remove it from all devices and Firebase.",
    onConfirm() {
      const invoices = invLoad();
      invoices.splice(i, 1);
      invSave(invoices);
      invRender();
    }
  });
}

// ── MULTI-DELETE ─────────────────────────────────────────────────────────
function invToggleAll(checked) {
  document.querySelectorAll(".inv-row-chk").forEach(cb => cb.checked = checked);
  invUpdateBulkActions();
}

function invUpdateBulkActions() {
  const checked = document.querySelectorAll(".inv-row-chk:checked");
  const all     = document.querySelectorAll(".inv-row-chk");
  const btn     = document.getElementById("invDelSelBtn");
  const countEl = document.getElementById("invDelSelCount");
  const selAll  = document.getElementById("invSelectAll");
  if (btn)     btn.style.display = checked.length > 0 ? "flex" : "none";
  if (countEl) countEl.textContent = checked.length;
  if (selAll) {
    selAll.indeterminate = checked.length > 0 && checked.length < all.length;
    selAll.checked = all.length > 0 && checked.length === all.length;
  }
}

function invMultiDelete() {
  const checked = [...document.querySelectorAll(".inv-row-chk:checked")];
  if (!checked.length) return;
  const indices = checked.map(cb => parseInt(cb.dataset.idx, 10));
  const n = indices.length;
  confirmDelete({
    title: `Delete ${n} Invoice${n !== 1 ? "s" : ""}?`,
    message: `${n} invoice${n !== 1 ? "s" : ""} will be permanently removed from all devices and Firebase.`,
    onConfirm() {
      const invoices = invLoad();
      indices.sort((a, b) => b - a).forEach(i => invoices.splice(i, 1));
      invSave(invoices);
      invRender();
    }
  });
}

// ── PDF PREVIEW ───────────────────────────────────────────────────────────
let _pdfPrevIdx = null;

async function invShowPdfPreview(i) {
  const inv = invLoad()[i];
  if (!inv) return;
  _pdfPrevIdx = i;

  const overlay = document.getElementById("pdfPrevModal");
  const body    = document.getElementById("pdfPrevBody");
  document.getElementById("pdfPrevTitle").textContent = inv.invoiceNo;
  body.innerHTML = `<div class="pdf-prev-loading">Rendering preview…</div>`;
  overlay.classList.add("pdf-prev-show");

  const logoBase64 = await _imgToBase64("logo.png");
  const html = invBuildHtml(inv, logoBase64);
  body.innerHTML = `<div class="pdf-prev-scroll"><div class="pdf-prev-content">${html}</div></div>`;
}

function invClosePdfPreview() {
  document.getElementById("pdfPrevModal")?.classList.remove("pdf-prev-show");
  _pdfPrevIdx = null;
}

async function invPdfPreviewDownload() {
  if (_pdfPrevIdx === null) return;
  const btn = document.getElementById("pdfPrevDownloadBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }
  try {
    await invDownloadPdf(_pdfPrevIdx);
    invClosePdfPreview();
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = "&#8659; Download PDF"; }
  }
}

// ── CSV EXPORT ────────────────────────────────────────────────────────────
function invExportCsv() {
  const invoices = invLoad();
  if (!invoices.length) { alert("No invoices to export."); return; }

  const headers = ["Invoice No","Date","TO","Owner","Charterers","Vessel","CP Date","Commission %","Freight USD","Amount USD"];
  const rows = invoices.map(inv => {
    const to = inv.toName
      ? inv.toName + (inv.toAddr ? ", " + inv.toAddr.replace(/\n/g, ", ") : "")
      : (inv.to || "");
    return [
      inv.invoiceNo,
      invFmtShortDate(inv.date),
      to,
      inv.owner      || "",
      inv.charterers || "",
      inv.vessel     || "",
      inv.cpDate     || "",
      (inv.commPct || 0) + "%",
      Number(inv.freight).toFixed(2),
      Number(inv.commAmt).toFixed(2),
    ];
  });

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))
    .join("\r\n");

  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `SeaOrion_Invoices_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── MASTER DATA MODAL ────────────────────────────────────────────────────
function _esc(s) {
  return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function invShowMasterData() {
  document.getElementById("invMasterModal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "invMasterModal";
  overlay.className = "inv-modal-overlay";
  overlay.innerHTML = `
    <div class="inv-modal-panel">
      <div class="inv-modal-hdr">
        <div>
          <h3>Master Data</h3>
          <span class="inv-modal-sub">Click a row to fill the invoice form</span>
        </div>
        <button class="inv-modal-close" onclick="document.getElementById('invMasterModal').remove()">✕</button>
      </div>
      <div id="invMasterTableWrap" class="inv-master-table-wrap">
        ${_masterTableHtml()}
      </div>
    </div>`;

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("inv-modal-show"));
}

function _masterTableHtml() {
  const masters = masterLoad();
  if (!masters.length) {
    return `<div class="inv-master-empty">No master records yet.<br>Records are saved automatically when you generate invoices.</div>`;
  }
  return `<table class="inv-master-table">
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>Company (TO)</th>
        <th>Address</th>
        <th>Owner</th>
        <th>Charterers</th>
        <th>Vessel</th>
        <th style="width:140px">Actions</th>
      </tr>
    </thead>
    <tbody>
      ${masters.map((m, i) => _masterRowHtml(m, i)).join("")}
    </tbody>
  </table>`;
}

function _masterRowHtml(m, i) {
  return `<tr id="invMRow_${i}" class="inv-master-row" onclick="invMasterFill(${i})" title="Click to fill invoice form">
    <td class="inv-master-idx">${i + 1}</td>
    <td class="inv-master-toname">${_esc(m.toName)}</td>
    <td class="inv-master-toaddr">${_esc(m.toAddr || "").replace(/\n/g,"<br>")}</td>
    <td>${_esc(m.owner)}</td>
    <td>${_esc(m.charterers)}</td>
    <td>${_esc(m.vessel)}</td>
    <td class="inv-master-acts" onclick="event.stopPropagation()">
      <button class="inv-master-edit-btn" onclick="invMasterEdit(${i})">✎ Edit</button>
      <button class="inv-master-del-btn"  onclick="invMasterDelete(${i})">✕</button>
    </td>
  </tr>`;
}

function _masterRefresh() {
  const wrap = document.getElementById("invMasterTableWrap");
  if (wrap) wrap.innerHTML = _masterTableHtml();
}

function invMasterFill(i) {
  const m = masterLoad()[i];
  if (!m) return;
  invAcFill(m);
  document.getElementById("invMasterModal")?.remove();
  document.getElementById("invoices")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function invMasterDelete(i) {
  const m = masterLoad()[i];
  if (!m) return;
  const label = m.toName || m.vessel || `Record #${i + 1}`;
  confirmDelete({
    title: "Delete Master Record?",
    message: `"${label}" will be permanently removed from all devices and Firebase.`,
    onConfirm() {
      const masters = masterLoad();
      masters.splice(i, 1);
      masterSave(masters);
      _masterRefresh();
    }
  });
}

function invMasterEdit(i) {
  const m = masterLoad()[i];
  if (!m) return;
  const label = m.toName || m.vessel || `Record #${i + 1}`;
  if (!confirm(`Edit master record for:\n"${label}"?`)) return;

  const row = document.getElementById(`invMRow_${i}`);
  if (!row) return;
  row.removeAttribute("onclick");
  row.title = "";
  row.classList.add("inv-master-editing");
  row.innerHTML = `
    <td class="inv-master-idx">${i + 1}</td>
    <td><input class="inv-master-inp" id="mep_tn_${i}"  value="${_esc(m.toName)}"></td>
    <td><textarea class="inv-master-inp inv-master-ta" id="mep_ta_${i}" rows="2">${_esc(m.toAddr)}</textarea></td>
    <td><input class="inv-master-inp" id="mep_ow_${i}"  value="${_esc(m.owner)}"></td>
    <td><input class="inv-master-inp" id="mep_ch_${i}"  value="${_esc(m.charterers)}"></td>
    <td><input class="inv-master-inp" id="mep_vs_${i}"  value="${_esc(m.vessel)}"></td>
    <td class="inv-master-acts">
      <button class="inv-master-save-btn"   onclick="invMasterSave(${i})">✓ Save</button>
      <button class="inv-master-cancel-btn" onclick="_masterRefresh()">✕</button>
    </td>`;
}

function invMasterSave(i) {
  const g = id => (document.getElementById(id)?.value || "").trim();
  const updated = {
    toName:     g(`mep_tn_${i}`),
    toAddr:     g(`mep_ta_${i}`),
    owner:      g(`mep_ow_${i}`),
    charterers: g(`mep_ch_${i}`),
    vessel:     g(`mep_vs_${i}`),
    updatedAt:  Date.now(),
  };
  if (!updated.toName && !updated.vessel) {
    alert("At least Company Name or Vessel Name is required.");
    return;
  }
  const masters = masterLoad();
  masters[i] = updated;
  masterSave(masters);
  _masterRefresh();
}

// ── SECTION RENDER ────────────────────────────────────────────────────────
function invRender() {
  const el = document.getElementById("invoices");
  if (!el) return;

  const isAdm = sessionStorage.getItem("soa_adm") === "1";
  if (!isAdm) { el.style.display = "none"; return; }
  el.style.display = "";

  const invoices = invLoad();

  el.innerHTML = `
    <div class="section-hdr">
      <div>
        <div class="sec-tag">Admin Only</div>
        <h2 class="sec-title" style="margin-bottom:0">Invoice Generator</h2>
      </div>
      <button class="inv-master-btn" onclick="invShowMasterData()">⊞ Master Data</button>
    </div>

    <div class="inv-form-card">
      <h3 class="inv-card-title">Create New Invoice</h3>
      <div class="inv-form-grid">

        <div class="inv-field">
          <label>Invoice No <em class="inv-hint">editable</em></label>
          <input id="invNo" type="text" value="${invNextNumberStr()}" placeholder="SOS-2627-01" oninput="invCheckInvNo()">
          <span id="invNoWarn" class="inv-no-warn"></span>
        </div>
        <div class="inv-field">
          <label>Invoice Date</label>
          <input id="invDate" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>

        <div class="inv-field">
          <label>TO — Company &amp; Address <em class="inv-hint">first line autocompletes · Enter for address</em></label>
          <div class="inv-ac-wrap">
            <textarea id="invTo" rows="2" placeholder="C&amp;C MARITIME CO., LTD&#10;YEONGDEUNGPO-GU, SEOUL&#10;KOREA" autocomplete="off"></textarea>
          </div>
        </div>

        <div class="inv-field">
          <label>Owner <em class="inv-hint">autocomplete</em></label>
          <div class="inv-ac-wrap">
            <input id="invOwner" type="text" placeholder="C &amp; C MARITIME" autocomplete="off">
          </div>
        </div>
        <div class="inv-field">
          <label>Charterers <em class="inv-hint">autocomplete</em></label>
          <div class="inv-ac-wrap">
            <input id="invCharterers" type="text" placeholder="TRADECHEM INTERNATIONAL" autocomplete="off">
          </div>
        </div>
        <div class="inv-field">
          <label>Vessel Name <em class="inv-hint">autocomplete</em></label>
          <div class="inv-ac-wrap">
            <input id="invVessel" type="text" placeholder="DAEWOO DIAMOND" autocomplete="off">
          </div>
        </div>

        <div class="inv-field">
          <label>CP Date <em class="inv-hint">calendar picker</em></label>
          <div class="inv-cpdate-row">
            <input id="invCpDatePicker" type="date" class="inv-date-picker" onchange="invUpdateCpDate()">
            <input id="invCpDate" type="text" readonly placeholder="12TH MAY 2026" class="inv-cpdate-display">
          </div>
        </div>

        <div class="inv-field">
          <label>Commission %</label>
          <input id="invCommPct" type="number" value="2.5" step="0.5" min="0" oninput="invCalc()">
        </div>
        <div class="inv-field">
          <label>Freight Amount (USD)</label>
          <input id="invFreight" type="number" step="0.01" min="0" placeholder="49263.39" oninput="invCalc()">
        </div>
        <div class="inv-field">
          <label>Commission Amount (USD) <em class="inv-hint">auto-calculated</em></label>
          <input id="invCommAmt" type="text" readonly placeholder="Auto-calculated">
        </div>

      </div>
      <div class="inv-btn-row">
        <button class="inv-btn-primary" onclick="invCreate()">&#9707; Preview &amp; Download PDF</button>
        <button class="inv-btn-secondary" onclick="invReset()">Clear Form</button>
      </div>
    </div>

    <div class="inv-history">
      <div class="inv-history-hdr">
        <h3>Invoice History</h3>
        <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;">
          <span class="inv-count">${invoices.length} invoice${invoices.length !== 1 ? "s" : ""}</span>
          ${invoices.length > 0 ? `
            <button class="inv-del-sel-btn" id="invDelSelBtn" onclick="invMultiDelete()" style="display:none">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Delete <span id="invDelSelCount">0</span> Selected
            </button>
            <button class="inv-csv-btn" onclick="invExportCsv()">&#8595; Export CSV</button>
          ` : ""}
        </div>
      </div>
      ${invoices.length === 0
        ? `<div class="inv-empty">No invoices yet. Fill the form above to create your first invoice.</div>`
        : `<div class="inv-table-wrap"><table class="inv-table">
            <thead><tr>
              <th class="inv-chk-th"><input type="checkbox" id="invSelectAll" onchange="invToggleAll(this.checked)" title="Select all"></th>
              <th>Invoice No</th><th>Date</th><th>TO</th><th>Vessel</th>
              <th>Owner</th><th>Charterers</th><th>CP Date</th>
              <th>Comm %</th><th>Freight (USD)</th><th>Amount (USD)</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${invoices.map((inv, i) => {
                // backward-compat: old invoices used inv.to, new use inv.toName + inv.toAddr
                const toText = inv.toName
                  ? (inv.toName + (inv.toAddr ? "\n" + inv.toAddr : ""))
                  : (inv.to || "");
                return `<tr>
                  <td class="inv-chk-td"><input type="checkbox" class="inv-row-chk" data-idx="${i}" onchange="invUpdateBulkActions()"></td>
                  <td class="inv-no-cell">${inv.invoiceNo}</td>
                  <td>${invFmtShortDate(inv.date)}</td>
                  <td class="inv-to-cell">${toText.replace(/\n/g,"<br>")}</td>
                  <td>${inv.vessel||""}</td>
                  <td>${inv.owner||""}</td>
                  <td>${inv.charterers||""}</td>
                  <td>${inv.cpDate||""}</td>
                  <td>${inv.commPct}%</td>
                  <td>$${Number(inv.freight).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td class="inv-amt-cell">$${Number(inv.commAmt).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td class="inv-act-cell">
                    <button class="inv-dl-btn"  onclick="invShowPdfPreview(${i})" title="Preview &amp; Download PDF">&#9707; PDF</button>
                    <button class="inv-del-btn" onclick="invDelete(${i})"          title="Delete">&#10005;</button>
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table></div>`}
    </div>`;

  // Wire up autocomplete
  invAcAttachTo("invTo");                      // combined TO textarea
  invAcAttach("invOwner",      "owner");
  invAcAttach("invCharterers", "charterers");
  invAcAttach("invVessel",     "vessel");

  invCalc();
}

// ── LOGO LOADER ───────────────────────────────────────────────────────────
// Converts logo.png to base64 so html2canvas embeds it without CORS issues.
function _imgToBase64(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null); // graceful fallback
    img.src = src + "?_=" + Date.now(); // bust cache
  });
}

// ── PDF GENERATION ────────────────────────────────────────────────────────
async function invDownloadPdf(i) {
  const inv = invLoad()[i];
  if (!inv) return;

  if (!window.html2canvas || !window.jspdf) {
    alert("PDF libraries loading — please retry in a moment.");
    return;
  }

  // Load the logo image as base64 (falls back to null → SVG fallback in template)
  const logoBase64 = await _imgToBase64("logo.png");

  const printEl = document.getElementById("invPrintArea");
  printEl.innerHTML = invBuildHtml(inv, logoBase64);
  printEl.style.cssText = "display:block;position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1;";

  try {
    const canvas = await html2canvas(printEl, {
      scale: 2, useCORS: true, backgroundColor: "#ffffff",
      width: 794, windowWidth: 794, logging: false,
    });
    const { jsPDF } = window.jspdf;
    const pdf    = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const imgData = canvas.toDataURL("image/png");
    const pageW  = pdf.internal.pageSize.getWidth();
    const pageH  = pdf.internal.pageSize.getHeight();
    const imgH   = (canvas.height * pageW) / canvas.width;
    if (imgH <= pageH) {
      pdf.addImage(imgData, "PNG", 0, 0, pageW, imgH);
    } else {
      for (let y = 0; y < imgH; y += pageH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -y, pageW, imgH);
      }
    }
    pdf.save(`${inv.invoiceNo}.pdf`);
  } finally {
    printEl.style.display = "none";
    printEl.innerHTML = "";
  }
}

// ── INVOICE HTML TEMPLATE ─────────────────────────────────────────────────
function invBuildHtml(inv, logoBase64) {
  const blu  = "#1a4fa3";
  const gold = "#c5b47a";
  const p    = "padding:7px 10px";      // standard cell padding
  const p2   = "padding:6px 10px";      // slightly tighter

  // backward-compat: old invoices used inv.to, new use inv.toName + inv.toAddr
  const toFull = inv.toName
    ? (inv.toName + (inv.toAddr ? "\n" + inv.toAddr : ""))
    : (inv.to || "");
  const toHtml     = toFull.replace(/\n/g, "<br>");
  const dateFmt    = invFmtShortDate(inv.date);
  const freightFmt = Number(inv.freight).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amtFmt     = Number(inv.commAmt).toLocaleString("en-US",  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Use real logo image when available, SVG mark as fallback
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="height:68px;max-width:230px;object-fit:contain;display:block;" alt="SEAORION">`
    : `<div style="display:flex;align-items:center;gap:10px;">
        <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:44px;height:44px;flex-shrink:0;">
          <circle cx="4" cy="9" r="2" fill="${blu}"/>
          <circle cx="11" cy="7" r="2" fill="${blu}"/>
          <circle cx="18" cy="9" r="2" fill="${blu}"/>
          <path d="M2 15 Q5.5 12 9 15 Q12.5 18 16 15 Q18.5 13 20 15" stroke="${blu}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        </svg>
        <div>
          <div style="font-size:34px;font-weight:900;color:${blu};letter-spacing:3px;line-height:1;font-family:'Arial Black',Arial,sans-serif;">SEAORION</div>
          <div style="font-size:9px;letter-spacing:5px;color:#aaa;margin-top:3px;">SHIPPING LLP</div>
        </div>
      </div>`;

  return `
<div style="font-family:Arial,sans-serif;font-size:11.5px;color:#0a1628;background:#fff;
            padding:28px 36px 36px;width:722px;box-sizing:border-box;">

  <!-- ── HEADER ── -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
    <div>
      ${logoHtml}
    </div>
    <div style="text-align:right;font-size:11.5px;line-height:2.1;color:${blu};">
      <div><strong>CIN : ACW-5120</strong></div>
      <div><strong>GST NO: 27AFXFS0821H1ZHM</strong></div>
    </div>
  </div>

  <!-- ── MAIN TABLE (no cell borders) ── -->
  <table width="100%" style="border-collapse:collapse;font-size:11.5px;">

    <!-- spacers -->
    <tr><td colspan="4" style="height:16px;"></td></tr>
    <tr><td colspan="4" style="height:16px;"></td></tr>

    <!-- TO + Invoice Date/No -->
    <tr>
      <td width="13%" style="${p};font-weight:700;vertical-align:top;white-space:nowrap;">TO</td>
      <td width="1%"  style="${p};vertical-align:top;">:</td>
      <td width="34%" style="${p};vertical-align:top;font-weight:600;line-height:1.75;">${toHtml}</td>
      <td width="52%" style="${p};vertical-align:top;">
        <table width="100%" style="border-collapse:collapse;">
          <tr>
            <td style="width:95px;font-weight:700;padding:2px 0 2px 0;white-space:nowrap;">INVOICE DATE</td>
            <td style="width:14px;padding:2px 6px;">:</td>
            <td style="padding:2px 4px;font-weight:600;">${dateFmt}</td>
          </tr>
          <tr>
            <td style="width:95px;font-weight:700;padding:2px 0 2px 0;white-space:nowrap;">INVOICE NO</td>
            <td style="width:14px;padding:2px 6px;">:</td>
            <td style="padding:2px 4px;font-weight:600;">${inv.invoiceNo}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- spacer -->
    <tr><td colspan="4" style="height:16px;"></td></tr>

    <!-- Owner / Charterers -->
    <tr>
      <td style="${p2};font-weight:700;white-space:nowrap;">OWNER</td>
      <td style="${p2};">:</td>
      <td style="${p2};font-weight:600;">${inv.owner||""}</td>
      <td style="${p2};">
        <table width="100%" style="border-collapse:collapse;"><tr>
          <td style="width:95px;font-weight:700;padding:1px 0;white-space:nowrap;">CHARTERERS</td>
          <td style="width:14px;padding:1px 6px;">:</td>
          <td style="padding:1px 4px;font-weight:600;">${inv.charterers||""}</td>
        </tr></table>
      </td>
    </tr>

    <!-- Vessel / CP Date -->
    <tr>
      <td style="${p2};font-weight:700;vertical-align:top;white-space:nowrap;">VESSEL NAME</td>
      <td style="${p2};vertical-align:top;">:</td>
      <td style="${p2};font-weight:600;vertical-align:top;">${inv.vessel||""}</td>
      <td style="${p2};">
        <table width="100%" style="border-collapse:collapse;"><tr>
          <td style="width:95px;font-weight:700;padding:1px 0;white-space:nowrap;">CP DATE</td>
          <td style="width:14px;padding:1px 6px;">:</td>
          <td style="padding:1px 4px;font-weight:600;">${inv.cpDate||""}</td>
        </tr></table>
      </td>
    </tr>

    <!-- spacer -->
    <tr><td colspan="4" style="height:16px;"></td></tr>

    <!-- All amount rows in ONE table so columns are pixel-perfect aligned -->
    <tr>
      <td colspan="4" style="padding:0;">
        <table width="100%" style="border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col>
            <col style="width:150px;">
          </colgroup>

          <!-- INVOICE DETAILS header (gold) -->
          <tr style="background:${gold};">
            <td style="padding:5px 10px;font-weight:700;font-size:12px;">INVOICE DETAILS</td>
            <td style="padding:5px 18px 5px 10px;font-weight:700;font-size:12px;text-align:center;">AMOUNT IN USD</td>
          </tr>

          <!-- Commission line -->
          <tr>
            <td style="padding:9px 10px;font-weight:600;">
              BROKERAGE COMMISSION ${inv.commPct}% ON FREIGHT OF &nbsp; USD &nbsp; ${freightFmt}
            </td>
            <td style="padding:9px 18px 9px 10px;font-weight:600;text-align:center;">$${amtFmt}</td>
          </tr>

          <!-- Spacers -->
          <tr><td colspan="2" style="height:22px;"></td></tr>
          <tr><td colspan="2" style="height:22px;"></td></tr>
          <tr><td colspan="2" style="height:22px;"></td></tr>

          <!-- TOTAL row (gold) — same column, larger bold amount -->
          <tr style="background:${gold};">
            <td style="padding:5px 10px;font-weight:700;font-size:12px;">TOTAL PAYABLE TO SEAORION SHIPPING LLP</td>
            <td style="padding:5px 18px 5px 10px;font-weight:800;font-size:14px;text-align:center;">$${amtFmt}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- empty row before BANKING DETAILS -->
    <tr><td colspan="4" style="height:14px;"></td></tr>

    <!-- Banking label -->
    <tr>
      <td colspan="4" style="padding:8px 10px 4px;">
        <u style="font-weight:700;color:#0a1628;font-size:11.5px;">BANKING DETAILS</u>
      </td>
    </tr>

    <!-- Banking box — table keeps all colons vertically aligned -->
    <tr>
      <td colspan="4" style="padding:4px 10px 14px;">
        <div style="border:1.5px solid #555;display:inline-block;padding:10px 16px;font-size:11px;min-width:300px;">
          PLEASE REMIT TO BELOW<br>
          ARRANGE REMITTANCE BY SWIFT MT 103 TO<br><br>
          <table style="border:none;border-collapse:collapse;margin-top:2px;line-height:1.9;">
            <tr>
              <td style="font-weight:700;padding:0 0 0 0;white-space:nowrap;vertical-align:top;">SWIFT CODE</td>
              <td style="padding:0 10px;vertical-align:top;">:</td>
              <td style="font-weight:700;vertical-align:top;">${INV_BANK.swift}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:0;white-space:nowrap;vertical-align:top;">BANK NAME</td>
              <td style="padding:0 10px;vertical-align:top;">:</td>
              <td style="font-weight:700;vertical-align:top;">${INV_BANK.bank}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:0;white-space:nowrap;vertical-align:top;">FAVORING</td>
              <td style="padding:0 10px;vertical-align:top;">:</td>
              <td style="font-weight:700;vertical-align:top;">${INV_BANK.favoring}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:0;white-space:nowrap;vertical-align:top;">ACCOUNT NO</td>
              <td style="padding:0 10px;vertical-align:top;">:</td>
              <td style="font-weight:700;vertical-align:top;">${INV_BANK.account}</td>
            </tr>
          </table>
        </div>
      </td>
    </tr>

    <!-- Disclaimer -->
    <tr>
      <td colspan="4" style="padding:12px 10px;text-align:center;">
        <em style="color:#c00000;font-weight:600;font-size:11px;">
          THIS IS COMPUTER GENERATED INVOICE. NO SIGNATURE / STAMP REQUIRED
        </em>
      </td>
    </tr>

  </table>

  <!-- Footer -->
  <div style="margin-top:16px;border-top:3px solid #c8a020;padding-top:6px;">
    <div style="font-size:14px;font-weight:700;color:${blu};">SeaOrion Shipping LLP</div>
    <div style="font-size:9.5px;color:#444;margin-top:2px;">
      A1-2101 Gundecha Trillium, Off W.E Highway, Borivali East, Mumbai - 400066, Maharashtra - India
    </div>
  </div>

</div>`;
}

// ── FIRESTORE SYNC ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  invBootstrapCounter();
  invBootstrapNumbers();
  invRender();

  // Load bank details from localStorage cache first (instant)
  try {
    const cached = JSON.parse(localStorage.getItem("soa_bank"));
    if (cached) { INV_BANK = { ...INV_BANK, ...cached }; invRender(); }
  } catch {}

  const loadBank = () => {
    if (!window._fbEnabled || !window._db) return;
    window._db.collection("config").doc("config").get()
      .then(doc => {
        if (doc.exists && doc.data().bank) {
          INV_BANK = { ...INV_BANK, ...doc.data().bank };
          try { localStorage.setItem("soa_bank", JSON.stringify(doc.data().bank)); } catch {}
          invRender();
        } else {
          console.warn("INV_BANK: config/config doc missing or has no bank field");
        }
      })
      .catch(err => console.error("INV_BANK load failed:", err.code, err.message));
  };

  const trySync = (attempts) => {
    if (window._fbEnabled && window._db) {
      loadBank();
      const keys = [INV_KEY, MASTER_KEY, META_KEY, INV_NUMBERS_KEY];
      Promise.all(keys.map(k =>
        window._db.collection("seaorion").doc(k).get()
          .then(doc => {
            if (!doc.exists) return;
            const data = JSON.parse(doc.data().payload);
            if (!window._cache) window._cache = {};
            window._cache[k] = data;
            try { localStorage.setItem(k, JSON.stringify(data)); } catch {}
          }).catch(err => console.warn("Sync failed for", k, err.code))
      )).then(() => {
        if (sessionStorage.getItem("soa_adm") === "1") {
          invBootstrapCounter();
          invBootstrapNumbers();
          invRender();
        }
      });
    } else if (attempts > 0) {
      setTimeout(() => trySync(attempts - 1), 600);
    }
  };
  setTimeout(() => trySync(10), 800);
});

window.invRefresh = invRender;
