      "use strict";

      // ── CURRENCIES ──
      const CURR_META = [
        { code: "EUR", name: "Euro", flag: "🇪🇺", base: 0.9218 },
        { code: "GBP", name: "British Pound", flag: "🇬🇧", base: 0.7921 },
        { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳", base: 7.2341 },
        { code: "INR", name: "Indian Rupee", flag: "🇮🇳", base: 83.41 },
        { code: "JPY", name: "Japanese Yen", flag: "🇯🇵", base: 149.72 },
        { code: "AED", name: "UAE Dirham", flag: "🇦🇪", base: 3.6725 },
        { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬", base: 1.3452 },
        { code: "KRW", name: "South Korean Won", flag: "🇰🇷", base: 1324.5 },
        { code: "HKD", name: "Hong Kong Dollar", flag: "🇭🇰", base: 7.8201 },
        { code: "BRL", name: "Brazilian Real", flag: "🇧🇷", base: 4.9712 },
        { code: "MYR", name: "Malaysian Ringgit", flag: "🇲🇾", base: 4.6831 },
        { code: "THB", name: "Thai Baht", flag: "🇹🇭", base: 34.812 },
      ];
      let _rates = {},
        _rateFetched = null;

      async function fetchRates() {
        try {
          const r = await fetch("https://open.er-api.com/v6/latest/USD");
          if (!r.ok) throw 0;
          const d = await r.json();
          if (d.result !== "success") throw 0;
          _rates = d.rates;
          _rateFetched = new Date();
          renderCurr(true);
          refreshTicker();
        } catch {
          renderCurr(false);
        }
      }
      function getRate(c) {
        return (
          _rates[c] || (CURR_META.find((x) => x.code === c) || {}).base || 1
        );
      }

      function renderCurr(live) {
        const ts = _rateFetched
          ? `Updated ${_rateFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Simulated";
        document.getElementById("currTs").textContent = ts;
        document.getElementById("currGrid").innerHTML = CURR_META.map((c) => {
          const r = getRate(c.code);
          const chg = ((Math.random() - 0.48) * 0.6).toFixed(2);
          const pos = parseFloat(chg) >= 0;
          const fmt =
            r < 10 ? r.toFixed(4) : r < 100 ? r.toFixed(3) : r.toFixed(2);
          return `<div class="curr-card">
      <div class="cc-left"><div class="cc-flag">${c.flag}</div>
        <div><div class="cc-code">${c.code}</div><div class="cc-name">${c.name}</div></div></div>
      <div class="cc-right">
        <div class="cc-rate">${fmt}</div>
        <div class="cc-chg ${pos ? "pos" : "neg"}">${pos ? "▲" : "▼"} ${Math.abs(chg)}%</div>
      </div></div>`;
        }).join("");
      }

      // ── MARKET INDICES ──
      const MKT = [
        {
          k: "BDI",
          label: "Baltic Dry Index",
          val: 1842,
          unit: "",
          sub: "Dry bulk benchmark",
          pos: true,
        },
        {
          k: "CPP",
          label: "CPP Tanker Index",
          val: 712,
          unit: "",
          sub: "Clean Petroleum Products",
          pos: false,
        },
        {
          k: "BRENT",
          label: "Brent Crude",
          val: 84.2,
          unit: "$",
          sub: "USD per barrel",
          pos: true,
        },
        {
          k: "VLSFO",
          label: "VLSFO Bunker",
          val: 612,
          unit: "$",
          sub: "USD/MT · Singapore",
          pos: true,
        },
        {
          k: "IFO",
          label: "IFO380 Bunker",
          val: 498,
          unit: "$",
          sub: "USD/MT · Rotterdam",
          pos: false,
        },
        {
          k: "TPAC",
          label: "Transpacific Rate",
          val: 2840,
          unit: "$",
          sub: "USD/FEU CNSHA→USLAX",
          pos: true,
        },
        {
          k: "AEX",
          label: "Asia–Europe Rate",
          val: 2210,
          unit: "$",
          sub: "USD/TEU CNSHA→NLRTM",
          pos: false,
        },
        {
          k: "CHEM",
          label: "Chemical Tanker Index",
          val: 643,
          unit: "",
          sub: "Spot rate index",
          pos: true,
        },
      ];
      function spark(data) {
        const mn = Math.min(...data),
          mx = Math.max(...data),
          rng = mx - mn || 1;
        return data
          .map((v, i) => {
            const x = (i / (data.length - 1)) * 120,
              y = 36 - ((v - mn) / rng) * 30;
            return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
      }
      function renderMarket() {
        document.getElementById("marketGrid").innerHTML = MKT.map((m) => {
          const v = m.val * (1 + (Math.random() - 0.5) * 0.018);
          const disp = v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString();
          const hist = Array.from(
            { length: 14 },
            () => m.val * (0.91 + Math.random() * 0.18),
          );
          const chgVal = ((Math.random() - 0.45) * 3).toFixed(1);
          const pos = parseFloat(chgVal) >= 0;
          return `<div class="mcard">
      <div class="mcard-lbl">${m.label}</div>
      <div class="mcard-val" style="color:${m.pos ? "var(--gold)" : "var(--sky)"}">${m.unit}${disp}</div>
      <div class="mcard-sub">${m.sub}</div>
      <div class="mcard-chg"><span style="color:${pos ? "var(--green)" : "var(--red)"}">${pos ? "▲" : "▼"}${Math.abs(chgVal)}%</span><span style="color:var(--muted);font-size:10px;margin-left:3px">24h</span></div>
      <svg class="spark" viewBox="0 0 120 40" preserveAspectRatio="none">
        <path d="${spark(hist)}" fill="none" stroke="${m.pos ? "var(--gold)" : "var(--sky)"}" stroke-width="1.5" opacity=".65"/>
      </svg>
    </div>`;
        }).join("");
      }

      // ── ROUTES ──
      const ROUTES = [
        {
          from: "Mumbai",
          to: "Rotterdam",
          code: "INBOM→NLRTM",
          carrier: "Maersk",
          type: "40GP",
          rate: 1650,
          days: "20–23",
          cap: 70,
          st: "av",
          region: "asia",
        },
        {
          from: "Mumbai",
          to: "Singapore",
          code: "INBOM→SGSIN",
          carrier: "MSC",
          type: "Handy",
          rate: 820,
          days: "8–10",
          cap: 55,
          st: "av",
          region: "asia",
        },
        {
          from: "Dubai",
          to: "Shanghai",
          code: "AEDXB→CNSHA",
          carrier: "COSCO",
          type: "MR",
          rate: 980,
          days: "16–18",
          cap: 60,
          st: "av",
          region: "asia",
        },
        {
          from: "Chennai",
          to: "Hamburg",
          code: "INMAA→DEHAM",
          carrier: "CMA CGM",
          type: "40GP",
          rate: 1440,
          days: "22–24",
          cap: 40,
          st: "lm",
          region: "asia",
        },
        {
          from: "Shanghai",
          to: "Rotterdam",
          code: "CNSHA→NLRTM",
          carrier: "Hapag-Lloyd",
          type: "40HC",
          rate: 2210,
          days: "28–30",
          cap: 45,
          st: "lm",
          region: "asia",
        },
        {
          from: "Singapore",
          to: "Hamburg",
          code: "SGSIN→DEHAM",
          carrier: "ONE",
          type: "MR",
          rate: 1980,
          days: "24–26",
          cap: 88,
          st: "av",
          region: "asia",
        },
        {
          from: "Busan",
          to: "New York",
          code: "KRPUS→USNYC",
          carrier: "HMM",
          type: "40HC",
          rate: 3120,
          days: "18–21",
          cap: 30,
          st: "lm",
          region: "asia",
        },
        {
          from: "Rotterdam",
          to: "New York",
          code: "NLRTM→USNYC",
          carrier: "CMA CGM",
          type: "40GP",
          rate: 1680,
          days: "10–12",
          cap: 85,
          st: "av",
          region: "europe",
        },
        {
          from: "Hamburg",
          to: "Shanghai",
          code: "DEHAM→CNSHA",
          carrier: "Maersk",
          type: "40GP",
          rate: 890,
          days: "28–30",
          cap: 65,
          st: "av",
          region: "europe",
        },
        {
          from: "Felixstowe",
          to: "Singapore",
          code: "GBFXT→SGSIN",
          carrier: "Evergreen",
          type: "40HC",
          rate: 2340,
          days: "22–25",
          cap: 55,
          st: "lm",
          region: "europe",
        },
        {
          from: "New York",
          to: "Rotterdam",
          code: "USNYC→NLRTM",
          carrier: "MSC",
          type: "40GP",
          rate: 1420,
          days: "10–11",
          cap: 92,
          st: "av",
          region: "americas",
        },
        {
          from: "Los Angeles",
          to: "Tokyo",
          code: "USLAX→JPTYO",
          carrier: "NYK",
          type: "40HC",
          rate: 1890,
          days: "12–14",
          cap: 20,
          st: "fl",
          region: "americas",
        },
      ];
      let _rFilter = "all";
      function filterR() {
        _rFilter = document.getElementById("rFilter").value;
        renderRoutes();
      }
      function renderRoutes() {
        const data =
          _rFilter === "all"
            ? ROUTES
            : ROUTES.filter((r) => r.region === _rFilter);
        document.getElementById("rBody").innerHTML = data
          .map((r) => {
            const rate = Math.round(
              r.rate * (1 + (Math.random() - 0.5) * 0.025),
            );
            const smap = { av: "av", lm: "lm", fl: "fl" };
            const slbl = { av: "Available", lm: "Limited", fl: "Full" };
            return `<tr>
      <td><div class="rt-route">${r.from} → ${r.to}</div><div class="rt-code">${r.code}</div></td>
      <td><span class="cbadge">${r.carrier}</span></td>
      <td><span style="font-family:var(--mono);font-size:12px">${r.type}</span></td>
      <td class="rprice">$${rate.toLocaleString()}</td>
      <td style="color:var(--muted);font-family:var(--mono);font-size:12px">${r.days} days</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div style="flex:1;height:3px;background:rgba(255,255,255,.07);border-radius:2px;min-width:50px">
            <div style="height:100%;width:${r.cap}%;background:${r.cap > 70 ? "var(--green)" : r.cap > 40 ? "var(--gold)" : "var(--red)"};border-radius:2px"></div>
          </div>
          <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">${r.cap}%</span>
        </div>
      </td>
      <td><span class="spill ${smap[r.st]}">${slbl[r.st]}</span></td>
    </tr>`;
          })
          .join("");
      }

      // ── PORTS ──
      const PORTS = [
        {
          name: "Mumbai JNPT",
          loc: "India · INBOM",
          cls: "p-active",
          vol: "5.8M TEU",
          util: 74,
          wait: "1.1d",
        },
        {
          name: "Dubai (Jebel Ali)",
          loc: "UAE · AEDXB",
          cls: "p-active",
          vol: "14.1M TEU",
          util: 67,
          wait: "0.6d",
        },
        {
          name: "Singapore",
          loc: "Singapore · SGSIN",
          cls: "p-active",
          vol: "37.2M TEU",
          util: 72,
          wait: "0.8d",
        },
        {
          name: "Shanghai",
          loc: "China · CNSHA",
          cls: "p-cong",
          vol: "45.5M TEU",
          util: 88,
          wait: "2.4d",
        },
        {
          name: "Rotterdam",
          loc: "Netherlands · NLRTM",
          cls: "p-active",
          vol: "14.8M TEU",
          util: 65,
          wait: "0.5d",
        },
        {
          name: "Hamburg",
          loc: "Germany · DEHAM",
          cls: "p-cong",
          vol: "8.3M TEU",
          util: 82,
          wait: "1.8d",
        },
        {
          name: "New York",
          loc: "USA · USNYC",
          cls: "p-delay",
          vol: "7.7M TEU",
          util: 91,
          wait: "3.1d",
        },
        {
          name: "Busan",
          loc: "South Korea · KRPUS",
          cls: "p-active",
          vol: "21.7M TEU",
          util: 70,
          wait: "0.7d",
        },
        {
          name: "Los Angeles",
          loc: "USA · USLAX",
          cls: "p-active",
          vol: "9.9M TEU",
          util: 58,
          wait: "0.6d",
        },
        {
          name: "Chennai",
          loc: "India · INMAA",
          cls: "p-active",
          vol: "2.1M TEU",
          util: 61,
          wait: "0.9d",
        },
        {
          name: "Tokyo",
          loc: "Japan · JPTYO",
          cls: "p-active",
          vol: "4.5M TEU",
          util: 55,
          wait: "0.5d",
        },
        {
          name: "Felixstowe",
          loc: "UK · GBFXT",
          cls: "p-active",
          vol: "4.0M TEU",
          util: 59,
          wait: "0.8d",
        },
      ];
      function renderPorts() {
        const lbl = {
          "p-active": "Operational",
          "p-cong": "Congested",
          "p-delay": "Delays",
        };
        document.getElementById("portGrid").innerHTML = PORTS.map(
          (p) => `
    <div class="port-card ${p.cls}">
      <div class="port-name">${p.name}</div>
      <div class="port-loc">${p.loc}</div>
      <div class="port-meta">
        <div><div style="font-size:10px;color:var(--muted);font-family:var(--mono)">VOLUME</div><div>${p.vol}</div></div>
        <div style="text-align:right"><div style="font-size:10px;color:var(--muted);font-family:var(--mono)">AVG WAIT</div><div>${p.wait}</div></div>
      </div>
      <div class="port-status"><span class="ps-dot"></span><span>${lbl[p.cls]}</span></div>
      <div class="port-bar"><div class="port-fill" style="width:${p.util}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:3px">
        <span>Utilisation</span><span>${p.util}%</span>
      </div>
    </div>`,
        ).join("");
      }

      // ── CALCULATOR ──
      const DIST = {
        "CNSHA-USNYC": 13670,
        "CNSHA-USLAX": 10165,
        "CNSHA-NLRTM": 19550,
        "CNSHA-DEHAM": 19800,
        "CNSHA-GBFXT": 19900,
        "CNSHA-SGSIN": 4490,
        "CNSHA-JPTYO": 1760,
        "CNSHA-INMAA": 6530,
        "CNSHA-INBOM": 7200,
        "CNSHA-AEDXB": 9940,
        "CNSHA-KRPUS": 900,
        "SGSIN-USNYC": 19470,
        "SGSIN-NLRTM": 16420,
        "SGSIN-DEHAM": 16670,
        "SGSIN-GBFXT": 16560,
        "SGSIN-JPTYO": 5320,
        "SGSIN-INMAA": 2190,
        "SGSIN-INBOM": 2870,
        "SGSIN-AEDXB": 5640,
        "SGSIN-KRPUS": 4530,
        "USNYC-NLRTM": 5530,
        "USNYC-DEHAM": 5770,
        "NLRTM-DEHAM": 390,
        "NLRTM-GBFXT": 320,
        "JPTYO-USLAX": 8740,
        "JPTYO-USNYC": 11870,
        "INMAA-NLRTM": 11600,
        "INMAA-DEHAM": 11850,
        "INMAA-AEDXB": 3280,
        "INMAA-SGSIN": 2190,
        "INBOM-NLRTM": 11350,
        "INBOM-DEHAM": 11600,
        "INBOM-AEDXB": 2650,
        "INBOM-SGSIN": 2870,
        "AEDXB-NLRTM": 8930,
        "AEDXB-DEHAM": 9180,
        "KRPUS-USNYC": 11850,
        "KRPUS-USLAX": 9300,
      };
      const TMUL = {
        "20GP": 1,
        "40GP": 1.85,
        "40HC": 2,
        "45HC": 2.2,
        HANDY: 2.8,
        MR: 4.5,
      };
      const TCO2 = {
        "20GP": 2.5,
        "40GP": 4.8,
        "40HC": 5,
        "45HC": 5.5,
        HANDY: 8,
        MR: 14,
      };

      function getDist(o, d) {
        return DIST[`${o}-${d}`] || DIST[`${d}-${o}`] || 11500;
      }
      function getETA(nm) {
        const d = Math.ceil(nm / 432);
        return `${d}–${d + 3} days`;
      }

      function runCalc() {
        const o = document.getElementById("c-orig").value,
          d = document.getElementById("c-dest").value;
        const tp = document.getElementById("c-type").value,
          wt = parseFloat(document.getElementById("c-wt").value) || 12;
        const curr = document.getElementById("c-curr").value;
        if (o === d) {
          alert("Origin and destination must differ.");
          return;
        }
        const nm = getDist(o, d);
        const base = (800 + nm * 0.12 + (Math.random() * 280 - 140)) * TMUL[tp];
        const baf = base * 0.22;
        const tot = base + baf;
        const co2 = (nm / 1000) * TCO2[tp];
        const fx = curr === "USD" ? 1 : getRate(curr);
        const fmt = (v) =>
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: curr,
            maximumFractionDigits: 0,
          }).format(v * fx);
        document.getElementById("r-base").textContent = fmt(base);
        document.getElementById("r-baf").textContent = fmt(baf);
        document.getElementById("r-tot").textContent = fmt(tot);
        document.getElementById("r-eta").textContent = getETA(nm);
        document.getElementById("r-mt").textContent = fmt(tot / wt) + "/MT";
        document.getElementById("r-co2").textContent =
          co2.toFixed(1) + " MT CO₂";
        document.getElementById("r-note").textContent =
          `Route distance: ${nm.toLocaleString()} nm · Type: ${tp} · Cargo: ${document.getElementById("c-cargo").value} · Indicative estimate only.`;
        const el = document.getElementById("calcOut");
        el.classList.add("show");
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      // ── TICKER REFRESH ──
      function refreshTicker() {
        const set = (id, v) => {
          const e = document.getElementById(id);
          if (e) e.textContent = v;
        };
        if (_rates.EUR) set("tb-eur", _rates.EUR.toFixed(4));
        if (_rates.INR) set("tb-inr", _rates.INR.toFixed(2));
        if (_rates.CNY) set("tb-cny", _rates.CNY.toFixed(4));
      }

      // ── DELETE CONFIRMATION MODAL ──
      let _delCallback = null;
      function confirmDelete({ title = "Delete?", message = "This action cannot be undone.", confirmText = "Delete", onConfirm }) {
        _delCallback = onConfirm;
        document.getElementById("delConfirmTitle").textContent = title;
        document.getElementById("delConfirmMsg").textContent = message;
        document.getElementById("delConfirmBtn").textContent = confirmText;
        const el = document.getElementById("delConfirmModal");
        el.classList.add("del-show");
        setTimeout(() => el.querySelector(".del-confirm-cancel").focus(), 60);
      }
      function _delConfirmClose() {
        document.getElementById("delConfirmModal").classList.remove("del-show");
        _delCallback = null;
      }
      function _delConfirmExecute() {
        const cb = _delCallback;
        _delConfirmClose();
        if (cb) cb();
      }

      // ── LOGO: strip white background so logo sits on dark nav ──
      function _stripWhiteBg(img, threshold = 232) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = d.data;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] > threshold && px[i + 1] > threshold && px[i + 2] > threshold) {
            px[i + 3] = 0;
          }
        }
        ctx.putImageData(d, 0, 0);
        img.src = canvas.toDataURL("image/png");
      }

      // ── INIT ──
      document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".logo-img, .logo-img-foot").forEach(img => {
          if (img.complete && img.naturalWidth) _stripWhiteBg(img);
          else img.addEventListener("load", () => _stripWhiteBg(img), { once: true });
        });
        renderMarket();
        renderCurr(false);
        fetchRates();
        renderRoutes();
        renderPorts();
        setInterval(() => {
          fetchRates();
          renderMarket();
        }, 60000);
      });
