"use strict";

// ─────────────────────────────────── STORAGE ──────────────────────────────────
const _MK = {
  freight : "soa_freight",
  fixtures: "soa_fixtures",
  vessels : "soa_vessels",
  news    : "soa_news",
  bunkers : "soa_bunkers",
  portinfo: "soa_portinfo",
  docs    : "soa_docs",
  contact : "soa_contact",
};

// In-memory cache — populated from Firestore on load, kept in sync on every save
const _cache = {};

function mLoad(key, def) {
  // Return cached Firestore data if available, else localStorage, else default
  if (_cache[key] !== undefined) return _cache[key];
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : JSON.parse(JSON.stringify(def));
  } catch { return JSON.parse(JSON.stringify(def)); }
}

function mSave(key, data) {
  _cache[key] = data;
  // Always write to localStorage as instant cache
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  // Write to Firestore if connected (admin-only — Firestore rules enforce this)
  if (window._fbEnabled && window._db) {
    window._db.collection("seaorion").doc(key)
      .set({ payload: JSON.stringify(data) })
      .catch(err => console.error("Firestore write failed:", err));
  }
}

function isAdmin() { return sessionStorage.getItem("soa_adm") === "1"; }

// Fetch all keys from Firestore and re-render (called once on load)
async function _syncFromFirestore() {
  if (!window._fbEnabled || !window._db) return;
  try {
    const keys   = Object.keys(_MK);
    const snaps  = await Promise.all(
      keys.map(k => window._db.collection("seaorion").doc(_MK[k]).get())
    );
    let changed = false;
    snaps.forEach((snap, i) => {
      if (snap.exists) {
        try {
          _cache[_MK[keys[i]]] = JSON.parse(snap.data().payload);
          changed = true;
        } catch {}
      }
    });
    if (changed) window.mktRefreshAdminState?.();
  } catch (err) {
    console.warn("Firestore read failed — using local data:", err);
  }
}

// ─────────────────────────────────── DEFAULT DATA ─────────────────────────────
const DEF_FREIGHT = {
  PETCHEM: [
    { id:"fea", origin:"EX FEA", routes:[
      { dest:"WCI",               rate:"50–55", unit:"$/MT", trend:"up"   },
      { dest:"US",                rate:"75–80", unit:"$/MT", trend:"flat" },
      { dest:"MED",               rate:"60–65", unit:"$/MT", trend:"down" },
      { dest:"ARA",               rate:"62–67", unit:"$/MT", trend:"up"   },
      { dest:"MIDDLE EAST",       rate:"25–30", unit:"$/MT", trend:"flat" },
      { dest:"SEA",               rate:"18–22", unit:"$/MT", trend:"up"   },
      { dest:"SOUTH AFRICA",      rate:"70–75", unit:"$/MT", trend:"flat" },
    ]},
    { id:"sea", origin:"EX SEA / THAILAND", routes:[
      { dest:"WCI",               rate:"40–45", unit:"$/MT", trend:"up"   },
      { dest:"MIDDLE EAST",       rate:"22–26", unit:"$/MT", trend:"flat" },
      { dest:"ARA",               rate:"55–60", unit:"$/MT", trend:"down" },
      { dest:"MED",               rate:"52–57", unit:"$/MT", trend:"flat" },
      { dest:"FEA",               rate:"15–18", unit:"$/MT", trend:"up"   },
      { dest:"INTRA SEA MARKETS", rate:"12–16", unit:"$/MT", trend:"flat" },
      { dest:"SOUTH AFRICA",      rate:"62–68", unit:"$/MT", trend:"flat" },
    ]},
    { id:"wci", origin:"EX WCI", routes:[
      { dest:"SEA",               rate:"42–47", unit:"$/MT", trend:"up"   },
      { dest:"FEA",               rate:"52–57", unit:"$/MT", trend:"flat" },
      { dest:"MED",               rate:"48–53", unit:"$/MT", trend:"up"   },
      { dest:"ARA",               rate:"50–55", unit:"$/MT", trend:"flat" },
      { dest:"SOUTH AFRICA",      rate:"58–63", unit:"$/MT", trend:"down" },
      { dest:"USG",               rate:"30–35", unit:"$/MT", trend:"flat" },
      { dest:"MIDDLE EAST",       rate:"28–32", unit:"$/MT", trend:"up"   },
    ]},
    { id:"me", origin:"EX MIDDLE EAST", routes:[
      { dest:"WCI",               rate:"25–30", unit:"$/MT", trend:"up"   },
      { dest:"ECI",               rate:"28–33", unit:"$/MT", trend:"flat" },
      { dest:"SEA / THAILAND",    rate:"22–26", unit:"$/MT", trend:"flat" },
      { dest:"FEA",               rate:"38–43", unit:"$/MT", trend:"down" },
      { dest:"MED",               rate:"50–55", unit:"$/MT", trend:"flat" },
      { dest:"ARA",               rate:"52–57", unit:"$/MT", trend:"up"   },
      { dest:"USG",               rate:"60–65", unit:"$/MT", trend:"flat" },
    ]},
  ],
  VEGOILS: [
    { id:"sea_vo", origin:"EX SEA", routes:[
      { dest:"WCI",               rate:"55–60", unit:"$/MT", trend:"up"   },
      { dest:"ECI",               rate:"52–57", unit:"$/MT", trend:"flat" },
      { dest:"FEA",               rate:"18–22", unit:"$/MT", trend:"flat" },
      { dest:"INTRA SEA",         rate:"10–14", unit:"$/MT", trend:"up"   },
      { dest:"AUSTRALIA",         rate:"28–32", unit:"$/MT", trend:"flat" },
      { dest:"MIDDLE EAST",       rate:"25–30", unit:"$/MT", trend:"down" },
    ]},
  ],
};

const DEF_FIXTURES = [
  { vessel:"MT PACIFIC STAR",    charterer:"Shell Trading",  cargo:"Petrochemicals", qty:"6,500 MT",  origin:"FEA",         dest:"WCI",      laycan:"15–18 Jun", rate:"$52/MT", date:"01 Jun 26" },
  { vessel:"MT SEAGULL EXPRESS", charterer:"Vitol",          cargo:"CPP",            qty:"8,000 MT",  origin:"MIDDLE EAST", dest:"WCI",      laycan:"18–21 Jun", rate:"$28/MT", date:"01 Jun 26" },
  { vessel:"MT OCEAN BRAVE",     charterer:"Trafigura",      cargo:"Veg Oil",        qty:"4,000 MT",  origin:"SEA",         dest:"ECI",      laycan:"20–23 Jun", rate:"$56/MT", date:"31 May 26" },
  { vessel:"MT GULF PIONEER",    charterer:"Gunvor",         cargo:"Petrochemicals", qty:"5,500 MT",  origin:"WCI",         dest:"FEA",      laycan:"22–25 Jun", rate:"$54/MT", date:"31 May 26" },
  { vessel:"MT AURORA",          charterer:"Mercuria",       cargo:"CPP",            qty:"10,000 MT", origin:"ARA",         dest:"WCI",      laycan:"24–27 Jun", rate:"$65/MT", date:"30 May 26" },
  { vessel:"MT HORIZON STAR",    charterer:"ADNOC Trading",  cargo:"Petrochemicals", qty:"7,000 MT",  origin:"MIDDLE EAST", dest:"SEA",      laycan:"25–28 Jun", rate:"$24/MT", date:"30 May 26" },
];

const DEF_VESSELS = [
  { vessel:"MT SEAGULL EXPRESS", type:"MR Tanker",  lastPort:"Singapore", nextPort:"Mumbai",    eta:"08 Jun", cargo:"CPP",            status:"laden"   },
  { vessel:"MT PACIFIC STAR",    type:"Chemical",   lastPort:"Ulsan",     nextPort:"Kandla",    eta:"11 Jun", cargo:"Petrochemicals", status:"laden"   },
  { vessel:"MT GULF PIONEER",    type:"MR Tanker",  lastPort:"Fujairah",  nextPort:"Rotterdam", eta:"14 Jun", cargo:"VGO",            status:"laden"   },
  { vessel:"MT OCEAN BRAVE",     type:"Handy",      lastPort:"Mumbai",    nextPort:"Singapore", eta:"07 Jun", cargo:"—",              status:"ballast" },
  { vessel:"MT AURORA",          type:"Chemical",   lastPort:"Rotterdam", nextPort:"Jubail",    eta:"09 Jun", cargo:"—",              status:"ballast" },
  { vessel:"MT HORIZON STAR",    type:"MR Tanker",  lastPort:"Houston",   nextPort:"Singapore", eta:"17 Jun", cargo:"Naphtha",        status:"laden"   },
];

const DEF_NEWS = [
  { id:1, title:"VLSFO prices ease in Singapore amid higher refinery output",           category:"Bunkers",    source:"Platts",   date:"01 Jun 26", summary:"Singapore VLSFO prices dipped by $4/MT this week as refinery output increased across Asia-Pacific, easing supply concerns that had pushed prices higher over the past fortnight." },
  { id:2, title:"CPP tanker demand surges on Indian subcontinent routes",                category:"Market",     source:"Gibson",   date:"01 Jun 26", summary:"Clean petroleum product tanker enquiries on WCI and ECI routes have seen a marked uptick following strong refinery throughput from India's west coast refining complex." },
  { id:3, title:"FEA chemical tanker market tightens on limited spot tonnage",           category:"Market",     source:"Braemar",  date:"31 May 26", summary:"Spot availability of chemical tankers in Far East Asia has dropped to its lowest level in six months, with brokers reporting increased enquiries from Korean and Japanese shippers." },
  { id:4, title:"Suez Canal transit fees increased for the third time in 2026",          category:"Trade",      source:"Reuters",  date:"31 May 26", summary:"The Suez Canal Authority has announced a further 3% increase in transit fees effective 15 June, impacting cost calculations on Europe–Asia trade routes." },
  { id:5, title:"Middle East veg oil exports hit record high in May",                    category:"Market",     source:"Intertek", date:"30 May 26", summary:"Vegetable oil exports from key Middle Eastern origins reached record volumes in May, driven by competitive pricing versus Southeast Asian origins and strong demand from South Asian importers." },
  { id:6, title:"IMO 2027 carbon intensity regulations — industry readiness report",     category:"Regulation", source:"DNV",      date:"30 May 26", summary:"A new report by DNV highlights that over 40% of tanker fleet operators are not yet compliant-ready for the upcoming IMO 2027 CII threshold tightening, potentially removing tonnage from the effective fleet." },
];

const DEF_BUNKERS = [
  { port:"Singapore", vlsfo:612, mgo:785, ifo380:498, trend:["up",   "flat", "down"] },
  { port:"Rotterdam", vlsfo:588, mgo:765, ifo380:472, trend:["flat", "up",   "flat"] },
  { port:"Fujairah",  vlsfo:595, mgo:772, ifo380:485, trend:["up",   "up",   "up"  ] },
  { port:"Hong Kong", vlsfo:618, mgo:792, ifo380:505, trend:["flat", "flat", "flat"] },
  { port:"Houston",   vlsfo:578, mgo:758, ifo380:465, trend:["down", "flat", "down"] },
  { port:"Piraeus",   vlsfo:582, mgo:768, ifo380:470, trend:["flat", "flat", "flat"] },
  { port:"Mumbai",    vlsfo:620, mgo:798, ifo380:510, trend:["up",   "up",   "up"  ] },
];

const DEF_PORTINFO = [
  { port:"Mumbai (JNPT)",   country:"India",       flag:"🇮🇳", maxDraft:"14.5m", maxLOA:"350m", berths:12, pilotage:"Compulsory",        agent:"Forbes Forbes Campbell", notes:"Tide-dependent entry for vessels >12m draft." },
  { port:"Singapore",       country:"Singapore",   flag:"🇸🇬", maxDraft:"21.0m", maxLOA:"400m", berths:55, pilotage:"Compulsory",        agent:"Wilhelmsen",             notes:"24/7 operations. ISPS compliant. World's busiest bunkering hub." },
  { port:"Jebel Ali",       country:"UAE",         flag:"🇦🇪", maxDraft:"17.0m", maxLOA:"400m", berths:22, pilotage:"Compulsory",        agent:"Gulf Agency Co.",         notes:"Largest port in Middle East. DP World operated." },
  { port:"Rotterdam",       country:"Netherlands", flag:"🇳🇱", maxDraft:"23.0m", maxLOA:"450m", berths:40, pilotage:"Compulsory >60m",   agent:"Smit Shipping",          notes:"Tide-independent deep draft terminal available." },
  { port:"Ulsan",           country:"South Korea", flag:"🇰🇷", maxDraft:"16.5m", maxLOA:"330m", berths:18, pilotage:"Compulsory",        agent:"Hansung Line",           notes:"Primary petchem export hub for NE Asia." },
  { port:"Jubail",          country:"Saudi Arabia",flag:"🇸🇦", maxDraft:"15.5m", maxLOA:"310m", berths:20, pilotage:"Compulsory",        agent:"Inchcape Shipping",      notes:"SABIC industrial port. 72hrs pre-arrival notice required." },
];

// ─────────────────────────────────── HELPERS ──────────────────────────────────
const TREND_ICON = { up:"<span class='tr-up'>▲</span>", down:"<span class='tr-dn'>▼</span>", flat:"<span class='tr-fl'>─</span>" };
const NEWS_CAT_COLOR = { Market:"var(--gold)", Bunkers:"var(--sky)", Trade:"#a78bfa", Regulation:"#f472b6" };

function trendIcon(t) { return TREND_ICON[t] || ""; }

// ─────────────────────────────── FREIGHT TRENDS ───────────────────────────────
let _ftTab = "PETCHEM";

function ftShowTab(tab, el) {
  _ftTab = tab;
  document.querySelectorAll(".ft-tab").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  renderFreight();
}

function renderFreight() {
  const data  = mLoad(_MK.freight, DEF_FREIGHT);
  const rows  = data[_ftTab] || [];
  const admin = isAdmin();
  const grid  = document.getElementById("ftGrid");
  if (!grid) return;

  grid.innerHTML = rows.map((block, bi) => `
    <div class="ft-card">
      <div class="ft-card-head">
        <span class="ft-origin">${block.origin}</span>
        <span class="ft-cat">${_ftTab === "PETCHEM" ? "PETCHEM" : "VEG OILS"}</span>
      </div>
      <table class="ft-table">
        <tbody>
          ${block.routes.map((r, ri) => `
            <tr class="ft-row">
              <td class="ft-dest">TO&nbsp;&nbsp;${r.dest}</td>
              <td class="ft-rate">
                ${admin
                  ? `<span class="ft-rate-val adm-editable" data-bi="${bi}" data-ri="${ri}" data-field="rate" title="Click to edit">${r.rate}</span>`
                  : `<span>${r.rate}</span>`}
                <span class="ft-unit">${r.unit}</span>
              </td>
              <td class="ft-trend">
                ${admin
                  ? `<button class="ft-trend-btn" data-bi="${bi}" data-ri="${ri}" title="Toggle trend">${trendIcon(r.trend)}</button>`
                  : trendIcon(r.trend)}
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`).join("");

  // Admin: inline rate editing
  if (admin) {
    grid.querySelectorAll(".ft-rate-val").forEach(el => {
      el.addEventListener("click", function () {
        const bi = +this.dataset.bi, ri = +this.dataset.ri;
        startInlineEdit(this, val => {
          const d = mLoad(_MK.freight, DEF_FREIGHT);
          d[_ftTab][bi].routes[ri].rate = val;
          mSave(_MK.freight, d);
        });
      });
    });
    grid.querySelectorAll(".ft-trend-btn").forEach(btn => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const bi = +this.dataset.bi, ri = +this.dataset.ri;
        const d = mLoad(_MK.freight, DEF_FREIGHT);
        const cycle = { up:"down", down:"flat", flat:"up" };
        d[_ftTab][bi].routes[ri].trend = cycle[d[_ftTab][bi].routes[ri].trend] || "flat";
        mSave(_MK.freight, d);
        renderFreight();
      });
    });
  }
}

// ─────────────────────────────── FIXTURES ─────────────────────────────────────
function renderFixtures() {
  const data  = mLoad(_MK.fixtures, DEF_FIXTURES);
  const admin = isAdmin();
  if (admin) {
    document.getElementById("btnAddFixture") && (document.getElementById("btnAddFixture").style.display = "inline-flex");
  }
  const tbody = document.getElementById("fixturesBody");
  if (!tbody) return;
  tbody.innerHTML = data.map((f, i) => `
    <tr>
      <td><div class="rt-route">${f.vessel}</div></td>
      <td><span class="cbadge">${f.charterer}</span></td>
      <td>${f.cargo}</td>
      <td style="font-family:var(--mono);font-size:12px">${f.qty}</td>
      <td><div class="rt-route">${f.origin} → ${f.dest}</div></td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${f.laycan}</td>
      <td class="rprice">${f.rate}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${f.date}</td>
      ${admin ? `<td style="white-space:nowrap">
        <button class="adm-row-btn" onclick="editFixture(${i})" title="Edit">✎</button>
        <button class="adm-row-btn adm-del-btn" onclick="deleteFixture(${i})" title="Delete">✕</button>
      </td>` : "<td></td>"}
    </tr>`).join("");
}

function openAddFixture()  { openRowModal("Add Fixture",  fixtureFields(), null, saveFixture); }
function editFixture(i) {
  const data = mLoad(_MK.fixtures, DEF_FIXTURES);
  openRowModal("Edit Fixture", fixtureFields(data[i]), i, saveFixture);
}
function deleteFixture(i) {
  confirmDelete({
    title: "Delete Fixture?",
    message: "This fixture will be permanently removed.",
    onConfirm() {
      const d = mLoad(_MK.fixtures, DEF_FIXTURES);
      d.splice(i, 1);
      mSave(_MK.fixtures, d);
      renderFixtures();
    }
  });
}
function saveFixture(idx, vals) {
  const d = mLoad(_MK.fixtures, DEF_FIXTURES);
  const entry = { vessel:vals.vessel, charterer:vals.charterer, cargo:vals.cargo, qty:vals.qty, origin:vals.origin, dest:vals.dest, laycan:vals.laycan, rate:vals.rate, date:vals.date };
  if (idx === null) d.unshift(entry); else d[idx] = entry;
  mSave(_MK.fixtures, d);
  renderFixtures();
}
function fixtureFields(f = {}) {
  return [
    { id:"vessel",     label:"Vessel Name",  type:"text",   val: f.vessel    || "" },
    { id:"charterer",  label:"Charterer",    type:"text",   val: f.charterer || "" },
    { id:"cargo",      label:"Cargo",        type:"text",   val: f.cargo     || "" },
    { id:"qty",        label:"Quantity",     type:"text",   val: f.qty       || "" },
    { id:"origin",     label:"Origin",       type:"text",   val: f.origin    || "" },
    { id:"dest",       label:"Destination",  type:"text",   val: f.dest      || "" },
    { id:"laycan",     label:"Laycan",       type:"text",   val: f.laycan    || "" },
    { id:"rate",       label:"Rate",         type:"text",   val: f.rate      || "" },
    { id:"date",       label:"Date",         type:"text",   val: f.date      || "" },
  ];
}

// ─────────────────────────────── VESSELS ──────────────────────────────────────
function renderVessels() {
  const data  = mLoad(_MK.vessels, DEF_VESSELS);
  const admin = isAdmin();
  if (admin) {
    document.getElementById("btnAddVessel") && (document.getElementById("btnAddVessel").style.display = "inline-flex");
  }
  const tbody = document.getElementById("vesselsBody");
  if (!tbody) return;
  const statusCls = { laden:"spill av", ballast:"spill lm", "at berth":"spill fl" };
  tbody.innerHTML = data.map((v, i) => `
    <tr>
      <td><div class="rt-route">${v.vessel}</div></td>
      <td><span style="font-family:var(--mono);font-size:12px;color:var(--muted)">${v.type}</span></td>
      <td>${v.lastPort}</td>
      <td>${v.nextPort}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--gold)">${v.eta}</td>
      <td style="font-family:var(--mono);font-size:12px">${v.cargo}</td>
      <td><span class="${statusCls[v.status] || "spill lm"}">${v.status}</span></td>
      ${admin ? `<td style="white-space:nowrap">
        <button class="adm-row-btn" onclick="editVessel(${i})" title="Edit">✎</button>
        <button class="adm-row-btn adm-del-btn" onclick="deleteVessel(${i})" title="Delete">✕</button>
      </td>` : "<td></td>"}
    </tr>`).join("");
}

function openAddVessel() { openRowModal("Add Vessel", vesselFields(), null, saveVessel); }
function editVessel(i) {
  const data = mLoad(_MK.vessels, DEF_VESSELS);
  openRowModal("Edit Vessel", vesselFields(data[i]), i, saveVessel);
}
function deleteVessel(i) {
  confirmDelete({
    title: "Delete Vessel?",
    message: "This vessel will be permanently removed.",
    onConfirm() {
      const d = mLoad(_MK.vessels, DEF_VESSELS);
      d.splice(i, 1); mSave(_MK.vessels, d); renderVessels();
    }
  });
}
function saveVessel(idx, vals) {
  const d = mLoad(_MK.vessels, DEF_VESSELS);
  const entry = { vessel:vals.vessel, type:vals.type, lastPort:vals.lastPort, nextPort:vals.nextPort, eta:vals.eta, cargo:vals.cargo, status:vals.status };
  if (idx === null) d.unshift(entry); else d[idx] = entry;
  mSave(_MK.vessels, d); renderVessels();
}
function vesselFields(v = {}) {
  return [
    { id:"vessel",   label:"Vessel Name",  type:"text",   val: v.vessel   || "" },
    { id:"type",     label:"Vessel Type",  type:"text",   val: v.type     || "" },
    { id:"lastPort", label:"Last Port",    type:"text",   val: v.lastPort || "" },
    { id:"nextPort", label:"Next Port",    type:"text",   val: v.nextPort || "" },
    { id:"eta",      label:"ETA",          type:"text",   val: v.eta      || "" },
    { id:"cargo",    label:"Cargo",        type:"text",   val: v.cargo    || "" },
    { id:"status",   label:"Status (laden / ballast / at berth)", type:"text", val: v.status || "ballast" },
  ];
}

// ─────────────────────────────── MARKET NEWS ──────────────────────────────────
function renderNews() {
  const data  = mLoad(_MK.news, DEF_NEWS);
  const admin = isAdmin();
  if (admin) {
    document.getElementById("btnAddNews") && (document.getElementById("btnAddNews").style.display = "inline-flex");
  }
  const grid = document.getElementById("newsGrid");
  if (!grid) return;
  grid.innerHTML = data.map((n, i) => {
    const catColor = NEWS_CAT_COLOR[n.category] || "var(--muted)";
    return `
      <div class="news-card">
        <div class="news-card-top">
          <span class="news-cat" style="color:${catColor};border-color:${catColor}40;background:${catColor}10">${n.category}</span>
          ${admin ? `<div style="display:flex;gap:4px;flex-shrink:0">
            <button class="adm-row-btn" onclick="editNews(${i})" title="Edit">✎</button>
            <button class="adm-row-btn adm-del-btn" onclick="deleteNews(${i})" title="Delete">✕</button>
          </div>` : ""}
        </div>
        <div class="news-title">${n.title}</div>
        <div class="news-summary">${n.summary}</div>
        <div class="news-meta"><span>${n.source}</span><span>${n.date}</span></div>
      </div>`;
  }).join("");
}

function openAddNews() { openRowModal("Add News", newsFields(), null, saveNews); }
function editNews(i) {
  const data = mLoad(_MK.news, DEF_NEWS);
  openRowModal("Edit News", newsFields(data[i]), i, saveNews);
}
function deleteNews(i) {
  confirmDelete({
    title: "Delete News Item?",
    message: "This news item will be permanently removed.",
    onConfirm() {
      const d = mLoad(_MK.news, DEF_NEWS);
      d.splice(i, 1); mSave(_MK.news, d); renderNews();
    }
  });
}
function saveNews(idx, vals) {
  const d = mLoad(_MK.news, DEF_NEWS);
  const entry = { id: Date.now(), title:vals.title, category:vals.category, source:vals.source, date:vals.date, summary:vals.summary };
  if (idx === null) d.unshift(entry); else d[idx] = entry;
  mSave(_MK.news, d); renderNews();
}
function newsFields(n = {}) {
  return [
    { id:"title",    label:"Headline",          type:"text",     val: n.title    || "" },
    { id:"category", label:"Category",          type:"text",     val: n.category || "" },
    { id:"source",   label:"Source",            type:"text",     val: n.source   || "" },
    { id:"date",     label:"Date (e.g. 01 Jun 26)", type:"text", val: n.date     || "" },
    { id:"summary",  label:"Summary",           type:"textarea", val: n.summary  || "" },
  ];
}

// ─────────────────────────────── BUNKER TRENDS ────────────────────────────────
function renderBunkers() {
  const data  = mLoad(_MK.bunkers, DEF_BUNKERS);
  const admin = isAdmin();
  const tbody = document.getElementById("bunkersBody");
  if (!tbody) return;
  tbody.innerHTML = data.map((b, i) => `
    <tr>
      <td><strong>${b.port}</strong></td>
      <td class="rprice">
        ${admin
          ? `<span class="adm-editable" data-bi="${i}" data-field="vlsfo" title="Click to edit">$${b.vlsfo}</span>`
          : `$${b.vlsfo}`}
        ${trendIcon(b.trend[0])}
      </td>
      <td style="color:var(--sky);font-family:var(--mono)">
        ${admin
          ? `<span class="adm-editable" data-bi="${i}" data-field="mgo" title="Click to edit">$${b.mgo}</span>`
          : `$${b.mgo}`}
        ${trendIcon(b.trend[1])}
      </td>
      <td style="font-family:var(--mono)">
        ${admin
          ? `<span class="adm-editable" data-bi="${i}" data-field="ifo380" title="Click to edit">$${b.ifo380}</span>`
          : `$${b.ifo380}`}
        ${trendIcon(b.trend[2])}
      </td>
    </tr>`).join("");

  if (admin) {
    tbody.querySelectorAll(".adm-editable").forEach(el => {
      el.addEventListener("click", function () {
        const bi    = +this.dataset.bi;
        const field = this.dataset.field;
        const raw   = this.textContent.replace("$","").trim();
        startInlineEdit(this, val => {
          const d = mLoad(_MK.bunkers, DEF_BUNKERS);
          d[bi][field] = +val || 0;
          mSave(_MK.bunkers, d);
          renderBunkers();
        }, raw);
      });
    });
  }
}

// ─────────────────────────────── PORT INFO ────────────────────────────────────
function renderPortInfo() {
  const data  = mLoad(_MK.portinfo, DEF_PORTINFO);
  const admin = isAdmin();
  const grid  = document.getElementById("portInfoGrid");
  if (!grid) return;
  if (admin) {
    document.getElementById("btnAddPort") && (document.getElementById("btnAddPort").style.display = "inline-flex");
  }
  grid.innerHTML = data.map((p, i) => `
    <div class="pi-card">
      <div class="pi-card-head">
        <div>
          <span class="pi-flag">${p.flag}</span>
          <div>
            <div class="pi-name">${p.port}</div>
            <div class="pi-country">${p.country}</div>
          </div>
        </div>
        ${admin ? `<div style="display:flex;gap:4px">
          <button class="adm-row-btn" onclick="editPortInfo(${i})" title="Edit">✎</button>
          <button class="adm-row-btn adm-del-btn" onclick="deletePortInfo(${i})" title="Delete">✕</button>
        </div>` : ""}
      </div>
      <div class="pi-specs">
        <div class="pi-spec"><span>Max Draft</span><strong>${p.maxDraft}</strong></div>
        <div class="pi-spec"><span>Max LOA</span><strong>${p.maxLOA}</strong></div>
        <div class="pi-spec"><span>Berths</span><strong>${p.berths}</strong></div>
        <div class="pi-spec"><span>Pilotage</span><strong>${p.pilotage}</strong></div>
      </div>
      <div class="pi-agent">Agent: <strong>${p.agent}</strong></div>
      <div class="pi-notes">${p.notes}</div>
    </div>`).join("");
}

function editPortInfo(i) {
  if (i === -1) { openRowModal("Add Port", portFields(), null, savePortInfo); return; }
  const data = mLoad(_MK.portinfo, DEF_PORTINFO);
  openRowModal("Edit Port Info", portFields(data[i]), i, savePortInfo);
}
function deletePortInfo(i) {
  confirmDelete({
    title: "Delete Port?",
    message: "This port info will be permanently removed.",
    onConfirm() {
      const d = mLoad(_MK.portinfo, DEF_PORTINFO);
      d.splice(i, 1); mSave(_MK.portinfo, d); renderPortInfo();
    }
  });
}
function savePortInfo(idx, vals) {
  const d = mLoad(_MK.portinfo, DEF_PORTINFO);
  const entry = { port:vals.port, country:vals.country, flag:vals.flag, maxDraft:vals.maxDraft, maxLOA:vals.maxLOA, berths:+vals.berths||0, pilotage:vals.pilotage, agent:vals.agent, notes:vals.notes };
  if (idx === null) d.push(entry); else d[idx] = entry;
  mSave(_MK.portinfo, d); renderPortInfo();
}
function portFields(p = {}) {
  return [
    { id:"port",      label:"Port Name",   type:"text", val: p.port      || "" },
    { id:"country",   label:"Country",     type:"text", val: p.country   || "" },
    { id:"flag",      label:"Flag Emoji",  type:"text", val: p.flag      || "" },
    { id:"maxDraft",  label:"Max Draft",   type:"text", val: p.maxDraft  || "" },
    { id:"maxLOA",    label:"Max LOA",     type:"text", val: p.maxLOA    || "" },
    { id:"berths",    label:"Berths",      type:"text", val: p.berths    || "" },
    { id:"pilotage",  label:"Pilotage",    type:"text", val: p.pilotage  || "" },
    { id:"agent",     label:"Agent",       type:"text", val: p.agent     || "" },
    { id:"notes",     label:"Notes",       type:"textarea", val: p.notes || "" },
  ];
}

// ─────────────────────────────── DOCUMENTS ────────────────────────────────────
function renderDocs() {
  const data  = mLoad(_MK.docs, []);
  const admin = isAdmin();
  const grid  = document.getElementById("docsGrid");
  const empty = document.getElementById("docsEmpty");
  if (!grid) return;
  if (admin) {
    document.getElementById("btnUploadDoc") && (document.getElementById("btnUploadDoc").style.display = "inline-flex");
  }
  if (!data.length) { empty && (empty.style.display = "block"); grid.innerHTML = ""; return; }
  empty && (empty.style.display = "none");
  const icons = { pdf:"📄", doc:"📝", docx:"📝", xls:"📊", xlsx:"📊", ppt:"📋", pptx:"📋", txt:"📃" };
  grid.innerHTML = data.map((d, i) => {
    const ext  = d.name.split(".").pop().toLowerCase();
    const icon = icons[ext] || "📁";
    const kb   = (d.size / 1024).toFixed(1);
    return `
      <div class="doc-card">
        <div class="doc-icon">${icon}</div>
        <div class="doc-info">
          <div class="doc-name">${d.name}</div>
          <div class="doc-meta">${kb} KB · ${d.uploaded}</div>
        </div>
        <div class="doc-actions">
          <a class="adm-row-btn" href="${d.data}" download="${d.name}" title="Download">⬇</a>
          ${admin ? `<button class="adm-row-btn adm-del-btn" onclick="deleteDoc(${i})" title="Delete">✕</button>` : ""}
        </div>
      </div>`;
  }).join("");
}

function handleDocUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    const d = mLoad(_MK.docs, []);
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"2-digit" });
    d.unshift({ name:file.name, size:file.size, type:file.type, data:ev.target.result, uploaded:dateStr });
    try { mSave(_MK.docs, d); renderDocs(); }
    catch { alert("File too large to store locally. Try a smaller file (< 4 MB)."); }
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

function deleteDoc(i) {
  confirmDelete({
    title: "Remove Document?",
    message: "This document will be permanently removed.",
    onConfirm() {
      const d = mLoad(_MK.docs, []);
      d.splice(i, 1); mSave(_MK.docs, d); renderDocs();
    }
  });
}

// ─────────────────────────── GENERIC EDIT MODAL ───────────────────────────────
let _mktSaveFn = null, _mktEditIdx = null;

function openRowModal(title, fields, idx, saveFn) {
  _mktSaveFn  = saveFn;
  _mktEditIdx = idx;
  document.getElementById("mktModalTitle").textContent = title;
  document.getElementById("mktModalErr").style.display = "none";
  document.getElementById("mktModalFields").innerHTML = fields.map(f => `
    <div class="fg" style="margin-bottom:0.85rem">
      <label>${f.label}</label>
      ${f.type === "textarea"
        ? `<textarea id="mf_${f.id}" style="background:rgba(6,12,26,.9);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--white);font-family:var(--body);font-size:13px;outline:none;resize:vertical;min-height:72px;transition:border-color .2s" onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor=''">${f.val}</textarea>`
        : `<input id="mf_${f.id}" type="${f.type}" value="${String(f.val).replace(/"/g,"&quot;")}" />`}
    </div>`).join("");
  document.getElementById("mktModalSave").onclick = () => {
    const vals = {};
    fields.forEach(f => {
      const el = document.getElementById("mf_" + f.id);
      vals[f.id] = el ? el.value.trim() : "";
    });
    if (!vals[fields[0].id]) {
      const err = document.getElementById("mktModalErr");
      err.textContent = `${fields[0].label} is required.`;
      err.style.display = "block";
      return;
    }
    _mktSaveFn(_mktEditIdx, vals);
    closeMktModal();
  };
  document.getElementById("mktModal").classList.add("adm-show");
  setTimeout(() => {
    const first = document.getElementById("mf_" + fields[0].id);
    if (first) first.focus();
  }, 80);
}

function closeMktModal() {
  document.getElementById("mktModal").classList.remove("adm-show");
}

// ─────────────────────────── INLINE EDIT ──────────────────────────────────────
function startInlineEdit(el, onSave, rawVal) {
  const current = rawVal !== undefined ? rawVal : el.textContent.trim();
  const input = document.createElement("input");
  input.type  = "text";
  input.value = current;
  input.className = "ft-inline-input";
  el.replaceWith(input);
  input.focus(); input.select();
  function commit() {
    const v = input.value.trim() || current;
    el.textContent = v;
    input.replaceWith(el);
    onSave(v);
  }
  input.addEventListener("blur",    commit);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter")  { e.preventDefault(); input.blur(); }
    if (e.key === "Escape") { input.replaceWith(el); }
  });
}

// ─────────────────────────── CONTACT INFO ─────────────────────────────────────
const DEF_CONTACT = {
  address:    "SEAORION Shipping Pvt. Ltd.\nNariman Point, Mumbai — 400 021\nMaharashtra, India",
  phone:      "+91 98700 00000",
  chartering: "chartering@seaorion.com",
  operations: "ops@seaorion.com",
  general:    "info@seaorion.com",
  linkedin:   "#",
  icechat:    "#",
  skype:      "#",
};

function renderContact() {
  const c     = mLoad("soa_contact", DEF_CONTACT);
  const admin = isAdmin();
  const el    = document.getElementById("contactInfo");
  if (!el) return;

  if (admin) {
    const btn = document.getElementById("btnEditContact");
    if (btn) btn.style.display = "inline-flex";
  }

  const addrHtml = (c.address || "").split("\n").join("<br />");

  el.innerHTML = `
    <div class="ci-block">
      <div class="ci-label">Headquarters</div>
      <div class="ci-val">${addrHtml}</div>
    </div>
    <div class="ci-block">
      <div class="ci-label">Operations Desk (24×7)</div>
      <div class="ci-val"><a href="tel:${c.phone.replace(/\s/g,"")}">${c.phone}</a></div>
    </div>
    <div class="ci-block">
      <div class="ci-label">Chartering</div>
      <div class="ci-val"><a href="mailto:${c.chartering}">${c.chartering}</a></div>
    </div>
    <div class="ci-block">
      <div class="ci-label">Operations &amp; Post-Fixture</div>
      <div class="ci-val"><a href="mailto:${c.operations}">${c.operations}</a></div>
    </div>
    <div class="ci-block">
      <div class="ci-label">General Enquiries</div>
      <div class="ci-val"><a href="mailto:${c.general}">${c.general}</a></div>
    </div>
    <div class="ci-block">
      <div class="ci-label">Also Reach Us On</div>
      <div class="social-row">
        ${c.linkedin ? `<a class="soc-btn" href="${c.linkedin}" target="_blank" rel="noopener">LinkedIn</a>` : ""}
        ${c.icechat  ? `<a class="soc-btn" href="${c.icechat}"  target="_blank" rel="noopener">ICE Chat</a>` : ""}
        ${c.skype    ? `<a class="soc-btn" href="${c.skype}"    target="_blank" rel="noopener">Skype</a>`    : ""}
      </div>
    </div>`;
}

function editContact() {
  const c = mLoad("soa_contact", DEF_CONTACT);
  openRowModal("Edit Contact Info", [
    { id:"address",    label:"Headquarters Address (one line per \\n)", type:"textarea", val: c.address    },
    { id:"phone",      label:"Operations Desk Phone",                   type:"text",     val: c.phone      },
    { id:"chartering", label:"Chartering Email",                        type:"text",     val: c.chartering },
    { id:"operations", label:"Operations & Post-Fixture Email",         type:"text",     val: c.operations },
    { id:"general",    label:"General Enquiries Email",                 type:"text",     val: c.general    },
    { id:"linkedin",   label:"LinkedIn URL",                            type:"text",     val: c.linkedin   },
    { id:"icechat",    label:"ICE Chat URL / Handle",                   type:"text",     val: c.icechat    },
    { id:"skype",      label:"Skype URL / Handle",                      type:"text",     val: c.skype      },
  ], null, (_, vals) => {
    mSave("soa_contact", vals);
    renderContact();
  });
}

// ─────────────────────────────── INIT ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderFreight();
  renderFixtures();
  renderVessels();
  renderNews();
  renderBunkers();
  renderPortInfo();
  renderDocs();
  renderContact();

  // Close mktModal on backdrop click
  document.getElementById("mktModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeMktModal();
  });

  // Fetch latest data from Firestore; re-render when it arrives
  _syncFromFirestore();
});

// Re-render admin controls when admin logs in/out
window.mktRefreshAdminState = function () {
  renderFreight();
  renderFixtures();
  renderVessels();
  renderNews();
  renderBunkers();
  renderPortInfo();
  renderDocs();
  renderContact();
};
