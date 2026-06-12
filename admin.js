"use strict";

const _SK = "soa_adm"; // sessionStorage key
const _PK = "soa_prefs"; // localStorage key

const DEFAULT_SECTIONS = [
  { id: "about", label: "About SEAORION" },
  { id: "services", label: "Our Services" },
  { id: "market", label: "Freight Market Indices" },
  { id: "currencies", label: "Live Currency Rates" },
  { id: "calculator", label: "Freight Calculator" },
  { id: "routes", label: "Live Freight Routes" },
  { id: "ports", label: "Port Status" },
  { id: "freight", label: "Freight Trends" },
  { id: "bunkers", label: "Bunker Trends" },
  { id: "fixtures", label: "Fixtures Reported" },
  { id: "vessels", label: "Vessel Positions" },
  { id: "portinfo", label: "Port Information" },
  { id: "news", label: "Market News" },
  { id: "documents", label: "Documents" },
  { id: "invoices", label: "Invoice Generator" },
  { id: "contact", label: "Contact SEAORION" },
];

// ── STATE ──────────────────────────────────────────────────────────────
let admSections = DEFAULT_SECTIONS.map((s) => ({ ...s, visible: true }));
let _dragSrc = null;

// ── SESSION ────────────────────────────────────────────────────────────
function admHasSession() {
  return sessionStorage.getItem(_SK) === "1";
}
function admSetSession() {
  sessionStorage.setItem(_SK, "1");
}
function admClearSession() {
  sessionStorage.removeItem(_SK);
}

// ── PERSISTENCE ────────────────────────────────────────────────────────
function admLoadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(_PK));
    if (
      Array.isArray(p?.sections) &&
      p.sections.length === DEFAULT_SECTIONS.length
    )
      admSections = p.sections;
  } catch {}
}
function admSavePrefs() {
  localStorage.setItem(_PK, JSON.stringify({ sections: admSections }));
}
function admClearPrefs() {
  localStorage.removeItem(_PK);
}

// ── ADMIN CHECK ────────────────────────────────────────────────────────
function _isAllowedAdmin(email) {
  if (!window._fbEnabled || !window._db) return Promise.resolve(false);
  return window._db.collection("config").doc("admins").get()
    .then((doc) => {
      const list = doc.exists ? (doc.data().allowedEmails || []) : [];
      return list.includes(email);
    })
    .catch(() => false);
}

// ── MODAL ──────────────────────────────────────────────────────────────
function admOpenModal() {
  const err = document.getElementById("admErr");
  err.textContent = "";
  err.style.display = "none";
  document.getElementById("admModal").classList.add("adm-show");
}

function admCloseModal() {
  document.getElementById("admModal").classList.remove("adm-show");
}

function admLogin() {
  if (!window._fbEnabled || !window._auth) return;
  const err = document.getElementById("admErr");
  err.style.display = "none";

  const provider = new firebase.auth.GoogleAuthProvider();
  window._auth.signInWithPopup(provider)
    .then((result) => {
      const email = result.user.email;
      return _isAllowedAdmin(email).then((allowed) => {
        if (!allowed) {
          window._auth.signOut();
          err.textContent = "Login is only for authorized administrators.";
          err.style.display = "block";
          return;
        }
        admSetSession();
        admCloseModal();
        showNavAdmin();
        window.mktRefreshAdminState?.();
        window.invRefresh?.();
      });
    })
    .catch((error) => {
      if (error.code === "auth/popup-closed-by-user") return;
      console.error("Google sign-in error:", error.code, error.message);
      const msg = error.code === "auth/operation-not-allowed"
        ? "Google sign-in is not enabled in Firebase Console."
        : error.code === "auth/unauthorized-domain"
        ? "This domain is not authorized in Firebase Console."
        : `Sign-in failed (${error.code}).`;
      err.textContent = msg;
      err.style.display = "block";
    });
}

// ── LOGOUT ─────────────────────────────────────────────────────────────
function admLogout() {
  admClearSession();
  document.getElementById("admPanel").classList.remove("adm-open");
  document.getElementById("navUser").classList.remove("active");
  document.getElementById("navLoginBtn").style.display = "flex";
  document.getElementById("navUser").style.display = "none";
  window.mktRefreshAdminState?.();
  window.invRefresh?.();
  // Sign out of Firebase too
  if (window._fbEnabled && window._auth) {
    window._auth.signOut().catch(() => {});
  }
}

// ── NAV UI ─────────────────────────────────────────────────────────────
function showNavAdmin() {
  document.getElementById("navLoginBtn").style.display = "none";
  document.getElementById("navUser").style.display = "flex";
}

// ── PANEL ──────────────────────────────────────────────────────────────
function admOpenPanel() {
  document.getElementById("admPanel").classList.add("adm-open");
  document.getElementById("navUser").classList.add("active");
  admRenderList();
}

function admTogglePanel() {
  const panel = document.getElementById("admPanel");
  const avatar = document.getElementById("navUser");
  const opening = !panel.classList.contains("adm-open");
  panel.classList.toggle("adm-open", opening);
  avatar.classList.toggle("active", opening);
  if (opening) admRenderList();
}

// ── SCROLL TO SECTION ─────────────────────────────────────────────────
function admScrollTo(id) {
  const el = document.getElementById(id);
  if (el && el.style.display !== "none") {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ── RENDER SECTION LIST ────────────────────────────────────────────────
const EYE_ON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function admRenderList() {
  const n = admSections.length;
  document.getElementById("admSectionList").innerHTML = admSections
    .map(
      (s, i) => `
    <div class="adm-row${s.visible ? "" : " adm-row-hidden"}"
         draggable="true" data-i="${i}"
         ondragstart="admDragStart(event,${i})"
         ondragover="admDragOver(event)"
         ondrop="admDrop(event,${i})"
         ondragend="admDragEnd()">
      <span class="adm-grip">⠿</span>
      <span class="adm-lbl" onclick="admScrollTo('${s.id}')" title="Scroll to section">${s.label}</span>
      <button class="adm-vis-btn${s.visible ? " adm-vis-on" : ""}"
              title="${s.visible ? "Hide section" : "Show section"}"
              onclick="admToggleVis(${i})">${s.visible ? EYE_ON : EYE_OFF}</button>
      <div class="adm-arrows">
        <button onclick="admMoveUp(${i})"   ${i === 0 ? "disabled" : ""} title="Move up">↑</button>
        <button onclick="admMoveDown(${i})" ${i === n - 1 ? "disabled" : ""} title="Move down">↓</button>
      </div>
    </div>`,
    )
    .join("");
}

// ── VISIBILITY ─────────────────────────────────────────────────────────
function admToggleVis(i) {
  admSections[i].visible = !admSections[i].visible;
  admRenderList();
  applyPageLayout();
}

// ── REORDER ────────────────────────────────────────────────────────────
function admMoveUp(i) {
  if (i === 0) return;
  [admSections[i - 1], admSections[i]] = [admSections[i], admSections[i - 1]];
  admRenderList();
  applyPageLayout();
}
function admMoveDown(i) {
  if (i >= admSections.length - 1) return;
  [admSections[i], admSections[i + 1]] = [admSections[i + 1], admSections[i]];
  admRenderList();
  applyPageLayout();
}

// ── DRAG & DROP ────────────────────────────────────────────────────────
function admDragStart(e, i) {
  _dragSrc = i;
  e.dataTransfer.effectAllowed = "move";
  setTimeout(
    () => e.currentTarget && e.currentTarget.classList.add("adm-dragging"),
    0,
  );
}
function admDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document
    .querySelectorAll(".adm-row")
    .forEach((r) => r.classList.remove("adm-over"));
  e.currentTarget.classList.add("adm-over");
}
function admDrop(e, targetI) {
  e.preventDefault();
  if (_dragSrc === null || _dragSrc === targetI) return;
  const [moved] = admSections.splice(_dragSrc, 1);
  admSections.splice(targetI, 0, moved);
  _dragSrc = null;
  admRenderList();
  applyPageLayout();
}
function admDragEnd() {
  _dragSrc = null;
  document
    .querySelectorAll(".adm-row")
    .forEach((r) => r.classList.remove("adm-dragging", "adm-over"));
}

// ── SAVE / RESET ───────────────────────────────────────────────────────
function admSave() {
  admSavePrefs();
  const btn = document.getElementById("admSaveBtn");
  btn.textContent = "✓ Saved";
  btn.style.cssText = "background:var(--green);color:#060c1a";
  setTimeout(() => {
    btn.textContent = "Save Layout";
    btn.style.cssText = "";
  }, 1800);
}
function admReset() {
  if (!confirm("Reset to default order and show all sections?")) return;
  admSections = DEFAULT_SECTIONS.map((s) => ({ ...s, visible: true }));
  admClearPrefs();
  admRenderList();
  applyPageLayout();
}

// ── APPLY LAYOUT TO PAGE ───────────────────────────────────────────────
function applyPageLayout() {
  const pairs = {};
  admSections.forEach((s) => {
    const el = document.getElementById(s.id);
    if (!el) return;
    const next = el.nextElementSibling;
    pairs[s.id] = { el, hr: next?.tagName === "HR" ? next : null };
  });

  let anchor = document.querySelector("section.hero + hr");
  if (!anchor) return;

  admSections.forEach((s) => {
    const p = pairs[s.id];
    if (!p) return;
    anchor.after(p.el);
    anchor = p.el;
    if (p.hr) {
      anchor.after(p.hr);
      anchor = p.hr;
    }
    const forceHide = s.id === "invoices" && !admHasSession();
    p.el.style.display = s.visible && !forceHide ? "" : "none";
    if (p.hr) p.hr.style.display = s.visible && !forceHide ? "" : "none";
  });

  document.querySelectorAll(".nav-links a").forEach((a) => {
    const id = (a.getAttribute("href") || "").replace("#", "");
    const sec = admSections.find((s) => s.id === id);
    if (sec) a.style.display = sec.visible ? "" : "none";
  });

  // Hide entire nav group when all its links are hidden
  document.querySelectorAll(".nav-group").forEach((group) => {
    const links = Array.from(group.querySelectorAll(".nav-dropdown a"));
    const anyVisible = links.some((a) => a.style.display !== "none");
    group.style.display = anyVisible ? "" : "none";
  });
}

// ── INIT ───────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  admLoadPrefs();
  applyPageLayout();

  // Restore admin UI if session is still active
  if (admHasSession()) {
    showNavAdmin();
  }

  // Persist auth state across page reloads
  if (window._fbEnabled && window._auth) {
    window._auth.onAuthStateChanged((user) => {
      if (user) {
        _isAllowedAdmin(user.email).then((allowed) => {
          if (allowed) {
            admSetSession();
            showNavAdmin();
            window.mktRefreshAdminState?.();
            window.invRefresh?.();
          } else {
            window._auth.signOut();
            admClearSession();
          }
        });
      } else {
        admClearSession();
      }
    });
  }

  // Close modal on backdrop click
  document.getElementById("admModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) admCloseModal();
  });

  // Close admin panel when clicking outside of it
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("admPanel");
    const avatar = document.getElementById("navUser");
    if (
      panel.classList.contains("adm-open") &&
      !panel.contains(e.target) &&
      !avatar.contains(e.target)
    ) {
      panel.classList.remove("adm-open");
      avatar.classList.remove("active");
    }
  });
});
