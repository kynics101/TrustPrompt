// ui.js — TrustPrompt shared UI layer v0.0.4
// Three visual components:
//   1. BADGE   — pill floating above the input box (all tiers)
//   2. BAR     — colored strip below the input box (low / medium / high)
//   3. PANEL   — side panel sliding in from the right (medium / high only)
//
// Tier behaviour (from activity + UI diagrams):
//   none   → badge: green "Safe — no issues found",  no bar,  no panel
//   low    → badge: yellow,  bar: yellow,  panel: items only (no safe ver, no masked)
//   medium → badge: orange,  bar: orange,  panel: items + safe ver + why + Copy/Send btns
//   high   → badge: red,     bar: red,     panel: items + safe ver + why + Copy/Send btns

/* global TrustUI */

const TrustUI = (() => {

  // ── IDs ────────────────────────────────────────────────────────────────────
  const ID_BADGE   = "tp-badge";
  const ID_BAR     = "tp-bar";
  const ID_PANEL   = "tp-panel";
  const ID_OVERLAY = "tp-overlay";

  // ── Theme ──────────────────────────────────────────────────────────────────
  const THEME = {
    scanning: { bg: "#e5e7eb", text: "#6b7280", dot: "#9ca3af", label: "Scanning…"             },
    none:     { bg: "#dcfce7", text: "#15803d", dot: "#22c55e", label: "Safe — no issues found" },
    low:      { bg: "#fef9c3", text: "#a16207", dot: "#eab308", label: "Low risk detected"      },
    medium:   { bg: "#ffedd5", text: "#c2410c", dot: "#f97316", label: "Medium risk detected"   },
    high:     { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444", label: "High risk detected"     }
  };

  // Bar/panel accent colours (solid, not pastel)
  const ACCENT = {
    low:    { solid: "#eab308", text: "#fff", dark: "#854d0e" },
    medium: { solid: "#f97316", text: "#fff", dark: "#7c2d12" },
    high:   { solid: "#ef4444", text: "#fff", dark: "#7f1d1d" }
  };

  // "Why is this flagged?" explanations per pattern
  const WHY = {
    credit_card:      "Matched pattern: credit/debit card number format.\nRule: RA 10173, Sensitive Personal Information (SPI).\nCategory: Financial Information.",
    api_key:          "Matched pattern: API key / token format.\nRule: RA 10173, Sensitive Personal Information (SPI).\nCategory: Authentication Credentials.",
    jwt:              "Matched pattern: JSON Web Token (three base64url segments).\nRule: RA 10173, SPI.\nCategory: Authentication Credentials.",
    password_inline:  "Matched pattern: inline password assignment.\nRule: RA 10173, SPI.\nCategory: Authentication Credentials.",
    email:            "Matched pattern: email address format.\nRule: RA 10173, SPI.\nCategory: Contact Information.",
    ph_mobile:        "Matched pattern: PH mobile number format.\nRule: RA 10173, SPI.\nCategory: Contact Information.",
    phone_intl:       "Matched pattern: international phone number.\nRule: RA 10173, SPI.\nCategory: Contact Information.",
    ipv4:             "Matched pattern: IPv4 address.\nRule: RA 10173, SPI.\nCategory: Network Identifier.",
    ipv6:             "Matched pattern: IPv6 address.\nRule: RA 10173, SPI.\nCategory: Network Identifier.",
    mac_address:      "Matched pattern: MAC address.\nRule: RA 10173, SPI.\nCategory: Network Identifier.",
    source_code:      "Matched pattern: code block.\nRule: RA 10173, Non-sensitive PI.\nCategory: Technical Data.",
    context_label:    "Matched pattern: labelled personal field (e.g. Name:, Age:).\nRule: RA 10173, PI.\nCategory: Personal Identifier.",
    ph_address:       "Matched pattern: Philippine physical address.\nRule: RA 10173, SPI.\nCategory: Location Data.",
    gazetteer_medical:   "Detected medical term in context.\nRule: RA 10173, Sensitive PI — health data.\nCategory: Health Information.",
    gazetteer_financial: "Detected financial term in context.\nRule: RA 10173, SPI.\nCategory: Financial Information.",
    gazetteer_legal:     "Detected legal/criminal term in context.\nRule: RA 10173, SPI.\nCategory: Legal Record.",
    gazetteer_nationality_religion: "Detected nationality/religion term.\nRule: RA 10173, Sensitive PI.\nCategory: Belief / Affiliation.",
    trigger_person_name: "Trigger phrase matched a person name.\nRule: RA 10173, PI.\nCategory: Personal Identifier.",
    trigger_location:    "Trigger phrase matched a location.\nRule: RA 10173, SPI.\nCategory: Location Data.",
    trigger_health:      "Trigger phrase matched a health condition.\nRule: RA 10173, Sensitive PI.\nCategory: Health Information.",
    trigger_employer:    "Trigger phrase matched employer/workplace.\nRule: RA 10173, PI.\nCategory: Occupational Data.",
    trigger_religion:    "Trigger phrase matched religious belief.\nRule: RA 10173, Sensitive PI.\nCategory: Belief / Affiliation.",
    trigger_financial:   "Trigger phrase matched financial information.\nRule: RA 10173, SPI.\nCategory: Financial Information.",
    trigger_age:         "Trigger phrase matched age information.\nRule: RA 10173, PI.\nCategory: Personal Identifier.",
    trigger_dob:         "Trigger phrase matched date of birth.\nRule: RA 10173, SPI.\nCategory: Personal Identifier."
  };

  // ── Utilities ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function trunc(s, n) { return s.length > n ? s.slice(0, n) + "…" : s; }

  // ── 1. BADGE ───────────────────────────────────────────────────────────────
  // Fixed-position pill centred above the input box, outside the box DOM.
  // Position recalculated from getBoundingClientRect() on every update.

  // Walk up from el until we find the widest ancestor that still looks like
  // the composer card (stops before full-viewport-width elements).
  function findComposerRect(el) {
    if (!el) return null;
    let best = el;
    let cur  = el;
    const viewW = window.innerWidth;
    while (cur && cur !== document.body) {
      const r = cur.getBoundingClientRect();
      // Accept elements that are meaningfully wide but not the whole page
      if (r.width > 300 && r.width < viewW * 0.98) {
        best = cur;
      }
      cur = cur.parentElement;
    }
    return best.getBoundingClientRect();
  }

  function ensureBadge() {
    let badge = document.getElementById(ID_BADGE);
    if (badge) return badge;
    badge = document.createElement("div");
    badge.id = ID_BADGE;
    badge.style.cssText = [
      "all:initial",
      "position:fixed",
      "display:inline-flex",
      "align-items:center",
      "gap:6px",
      "padding:4px 14px",
      "border-radius:999px",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "font-size:12px",
      "font-weight:500",
      "white-space:nowrap",
      "z-index:10000",
      "box-shadow:0 1px 6px rgba(0,0,0,0.15)",
      "pointer-events:none",
      "transition:background 0.25s,color 0.25s",
      "transform:translateX(-50%)"
    ].join(";");
    document.body.appendChild(badge);
    return badge;
  }

  function positionBadge(inputEl) {
    const badge = document.getElementById(ID_BADGE);
    if (!badge || !inputEl) return;
    const card = getCardRect(inputEl);
    if (!card) return;
    // Centre horizontally over the card, sit 10px above the card's top edge
    badge.style.left = (card.left + card.width / 2) + "px";
    badge.style.top  = Math.max(4, card.top - 36) + "px";
  }

  function setBadge(riskLevel, inputEl) {
    const badge = ensureBadge();
    const t     = THEME[riskLevel] || THEME.none;
    badge.style.background = t.bg;
    badge.style.color      = t.text;
    badge.style.border     = `1px solid ${t.dot}66`;
    badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;` +
      `background:${t.dot};display:inline-block;flex-shrink:0;"></span>${esc(t.label)}`;
    positionBadge(inputEl);
  }

  // ── 2. BOTTOM BAR ─────────────────────────────────────────────────────────
  // Fixed-position strip sitting just below the composer card, same width.
  // Appended to document.body so it is completely outside the input DOM.

  function removeBar() { document.getElementById(ID_BAR)?.remove(); }

  // Find the rect of the composer "card" — the visible white box that wraps
  // the textarea plus its toolbar row.
  //
  // Strategy: walk UP from inputEl. Accept each ancestor whose height is
  // ≤ 3× the input's own height (so we stay within the card and don't
  // escape to a page-level wrapper). Stop as soon as the next ancestor
  // gets taller than that — we've just left the card.
  function getCardRect(inputEl) {
    if (!inputEl) return null;
    const inputH = inputEl.getBoundingClientRect().height || 40;
    const maxH   = inputH * 8;   // card can be up to 8× textarea height
    const maxW   = window.innerWidth * 0.92;
    let best     = inputEl.getBoundingClientRect();
    let el       = inputEl.parentElement;

    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      // Stop if this ancestor is too tall (we've exited the card)
      if (r.height > maxH) break;
      // Accept if it's reasonably wide but not full-page
      if (r.width > 200 && r.width < maxW) {
        best = r;
      }
      el = el.parentElement;
    }
    return best;
  }

  function showBar(riskLevel, findingsCount, inputEl, onOpen) {
    removeBar();
    if (riskLevel === "none" || riskLevel === "scanning") return;

    const acc  = ACCENT[riskLevel] || ACCENT.medium;
    const card = getCardRect(inputEl);
    if (!card) return;

    // Safety: if card.bottom is more than 80% down the viewport, something
    // went wrong with card detection — fall back to input rect + offset.
    const inputRect = inputEl ? inputEl.getBoundingClientRect() : card;
    const safeBottom = card.bottom < window.innerHeight * 0.85
      ? card.bottom
      : inputRect.bottom;

    const bar = document.createElement("div");
    bar.id = ID_BAR;
    // Use position:fixed so the bar is painted relative to the viewport,
    // completely outside whatever DOM hierarchy the input lives in.
    bar.style.cssText = [
      "all:initial",
      "position:fixed",
      `left:${card.left}px`,
      `top:${safeBottom + 6}px`,
      `width:${card.width}px`,
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      `background:${acc.solid}`,
      "color:#fff",
      "padding:8px 14px",
      "border-radius:8px",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "font-size:12px",
      "font-weight:500",
      "cursor:pointer",
      "z-index:9999",
      "box-sizing:border-box",
      "box-shadow:0 2px 8px rgba(0,0,0,0.18)"
    ].join(";");

    const riskLabel = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);
    bar.innerHTML = `
      <span style="display:flex;align-items:center;gap:8px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"
                fill="rgba(255,255,255,0.9)"/>
        </svg>
        <strong>${riskLabel} risk detected</strong>
        &mdash; ${findingsCount} sensitive item${findingsCount !== 1 ? "s" : ""} detected
      </span>
      <span style="opacity:0.9;font-size:11px;">Click to open TrustPrompt →</span>`;

    bar.addEventListener("click", () => { if (typeof onOpen === "function") onOpen(); });
    document.body.appendChild(bar);
  }

  // ── 3. SIDE PANEL ─────────────────────────────────────────────────────────
  // Dark panel that slides in from the right edge of the viewport.
  // Medium: items + why dropdown (NO safe version).
  // High:   items + safe version + why dropdown.

  function removePanel() {
    document.getElementById(ID_PANEL)?.remove();
    document.getElementById(ID_OVERLAY)?.remove();
  }

  function buildFindingCard(f, tier) {
    const acc      = ACCENT[tier] || ACCENT.medium;
    const dotColor = f.risk === "high" ? "#ef4444" : f.risk === "medium" ? "#f97316" : "#eab308";
    const riskTag  = f.risk.toUpperCase();
    const why      = WHY[f.patternId] || "Matched a known sensitive data pattern.";
    const showSafe = (tier === "high" || tier === "medium"); // both show safe ver per screenshots

    const card = document.createElement("div");
    card.style.cssText = [
      "background:#1a1a1a",
      "border-radius:8px",
      "padding:10px 12px",
      "margin-bottom:8px",
      "font-size:12px",
      "color:#e0e0e0"
    ].join(";");

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};
                display:inline-block;flex-shrink:0;"></span>
          ${esc(f.label)}
        </span>
        <span style="background:${dotColor};color:#fff;border-radius:4px;
              padding:1px 7px;font-size:10px;font-weight:700;letter-spacing:.5px;">
          ${esc(riskTag)}
        </span>
      </div>
      <div style="display:grid;grid-template-columns:60px 1fr;gap:3px 8px;margin-bottom:6px;">
        <span style="color:#888;font-size:11px;">Detected</span>
        <span style="color:#f87171;font-family:monospace;word-break:break-all;font-size:11px;">
          ${esc(trunc(f.rawMatch, 60))}
        </span>
        ${showSafe ? `
        <span style="color:#888;font-size:11px;">Safe ver.</span>
        <span style="color:#4ade80;font-family:monospace;word-break:break-all;font-size:11px;">
          ${esc(f.safeVersion)}
        </span>` : ""}
      </div>
      <details style="margin-top:4px;">
        <summary style="color:#9ca3af;font-size:11px;cursor:pointer;list-style:none;
                        display:flex;align-items:center;gap:4px;">
          <span style="font-size:9px;">▶</span> Why is this flagged?
        </summary>
        <div style="margin-top:6px;padding:8px;background:#111;border-radius:6px;
                    color:#9ca3af;font-size:11px;line-height:1.6;white-space:pre-line;">
          ${esc(why)}
        </div>
      </details>`;
    return card;
  }

  function openPanel(findings, riskLevel, safeText, onSendAnyway, onRefresh) {
    removePanel();
    const tier = riskLevel; // "low" | "medium" | "high"
    const acc  = ACCENT[tier] || ACCENT.medium;
    const t    = THEME[tier]  || THEME.medium;

    // Overlay (click to close)
    const overlay = document.createElement("div");
    overlay.id = ID_OVERLAY;
    overlay.style.cssText = "position:fixed;inset:0;z-index:99998;";
    overlay.addEventListener("click", removePanel);
    document.body.appendChild(overlay);

    const panel = document.createElement("div");
    panel.id = ID_PANEL;
    panel.style.cssText = [
      "position:fixed",
      "top:0", "right:0", "bottom:0",
      "width:340px",
      "background:#111827",
      "z-index:99999",
      "display:flex",
      "flex-direction:column",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "box-shadow:-4px 0 24px rgba(0,0,0,0.4)",
      "overflow:hidden"
    ].join(";");
    // Stop overlay click from closing when clicking inside panel
    panel.addEventListener("click", e => e.stopPropagation());
    document.body.appendChild(panel);
    buildPanelContent(panel, findings, riskLevel, tier, acc, t, safeText, onSendAnyway, onRefresh);
  }

  function buildPanelContent(panel, findings, riskLevel, tier, acc, t, safeText, onSendAnyway, onRefresh) {
    // ── Panel header ──────────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.style.cssText = "padding:14px 16px 10px;border-bottom:1px solid #1f2937;flex-shrink:0;";
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:#166534;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"
                  fill="white"/>
            <text x="12" y="16" text-anchor="middle" font-size="8" font-weight="700"
                  fill="#166534" font-family="Arial,sans-serif">TP</text>
          </svg>
        </div>
        <div>
          <div style="font-weight:700;font-size:14px;color:#f9fafb;">TrustPrompt</div>
          <div style="font-size:10px;color:#6b7280;">Prompt privacy shield — v0.0.4</div>
        </div>
        <button id="tp-panel-close" style="margin-left:auto;background:none;border:none;
          color:#6b7280;font-size:18px;cursor:pointer;padding:2px 6px;line-height:1;">×</button>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;
                  background:#1f2937;border-radius:8px;padding:8px 12px;">
        <span style="display:flex;align-items:center;gap:7px;font-weight:600;
                     font-size:13px;color:#f9fafb;">
          <span style="width:9px;height:9px;border-radius:50%;background:${t.dot};
                display:inline-block;"></span>
          ${esc(riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1))} risk detected
        </span>
        <span style="background:${acc.solid};color:#fff;border-radius:5px;
              padding:2px 9px;font-size:10px;font-weight:700;letter-spacing:.5px;">
          ${esc(riskLevel.toUpperCase())}
        </span>
      </div>`;
    panel.appendChild(header);
    panel.querySelector("#tp-panel-close").addEventListener("click", removePanel);

    // ── Detections list ───────────────────────────────────────────────────────
    const listWrap = document.createElement("div");
    listWrap.style.cssText = "flex:1;overflow-y:auto;padding:12px 16px 8px;";
    listWrap.innerHTML = `<div style="font-size:10px;font-weight:600;letter-spacing:.8px;
      color:#6b7280;margin-bottom:8px;">DETECTIONS (${findings.length})</div>`;
    for (const f of findings) {
      listWrap.appendChild(buildFindingCard(f, tier));
    }
    panel.appendChild(listWrap);

    // ── Action buttons ────────────────────────────────────────────────────────
    const footer = document.createElement("div");
    footer.style.cssText = "padding:12px 16px;border-top:1px solid #1f2937;flex-shrink:0;";

    if (tier === "low") {
      footer.innerHTML = `
        <div style="font-size:11px;color:#9ca3af;text-align:center;padding:4px 0;">
          Low risk — no action required. You may continue.
        </div>`;
    } else {
      // medium / high — Copy Safe + Send Anyway + Refresh
      const btnCopy = document.createElement("button");
      btnCopy.textContent = "🗒 Copy Safe Version";
      btnCopy.style.cssText = "width:100%;background:#166534;color:#fff;border:none;" +
        "border-radius:8px;padding:10px;font-size:13px;font-weight:600;" +
        "cursor:pointer;font-family:inherit;margin-bottom:8px;";
      btnCopy.addEventListener("click", () => {
        if (!safeText) return;
        navigator.clipboard.writeText(safeText).then(() => {
          btnCopy.textContent = "✅ Copied to clipboard!";
          setTimeout(() => { btnCopy.textContent = "🗒 Copy Safe Version"; }, 2000);
        });
      });

      const btnSend = document.createElement("button");
      btnSend.textContent = "Send Anyway";
      btnSend.style.cssText = "width:100%;background:#1f2937;color:#d1d5db;border:none;" +
        "border-radius:8px;padding:9px;font-size:13px;cursor:pointer;font-family:inherit;margin-bottom:6px;";
      btnSend.addEventListener("click", () => {
        removePanel();
        if (typeof onSendAnyway === "function") onSendAnyway();
      });

      const btnRefresh = document.createElement("button");
      btnRefresh.textContent = "↺ Refresh Rules";
      btnRefresh.style.cssText = "width:100%;background:none;color:#6b7280;border:none;" +
        "font-size:11px;cursor:pointer;font-family:inherit;padding:4px;";
      btnRefresh.addEventListener("click", () => {
        btnRefresh.textContent = "Refreshing…";
        chrome.runtime.sendMessage({ type: "REFRESH_RULES" }, () => {
          btnRefresh.textContent = "✅ Rules updated";
          setTimeout(() => { btnRefresh.textContent = "↺ Refresh Rules"; }, 2000);
        });
      });

      footer.appendChild(btnCopy);
      footer.appendChild(btnSend);
      footer.appendChild(btnRefresh);
    }

    // Risk legend
    footer.innerHTML += `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #1f2937;">
        <div style="font-size:9px;letter-spacing:.7px;color:#6b7280;margin-bottom:4px;">RISK LEVELS</div>
        <div style="font-size:10px;color:#9ca3af;line-height:1.8;">
          <span style="color:#ef4444;">●</span> High — financial / auth data<br>
          <span style="color:#f97316;">●</span> Medium — contact / location<br>
          <span style="color:#eab308;">●</span> Low — metadata / labels<br>
          <span style="color:#22c55e;">●</span> Safe — no sensitive data
        </div>
      </div>`;
    panel.appendChild(footer);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // inputEl = the actual prompt <div>/<textarea>
  // composerEl = ignored; findComposerRect() auto-detects the card boundary
  function update(riskLevel, findings, safeText, inputEl, _composerEl, onSendAnyway) {
    _currentInputEl  = inputEl;
    _currentComposer = inputEl; // kept for _reposition compat

    setBadge(riskLevel, inputEl);

    if (riskLevel !== "none" && riskLevel !== "scanning") {
      showBar(riskLevel, findings.length, inputEl, () => {
        openPanel(findings, riskLevel, safeText, onSendAnyway, null);
      });
    } else {
      removeBar();
    }

    if (document.getElementById(ID_PANEL)) {
      openPanel(findings, riskLevel, safeText, onSendAnyway, null);
    }
  }

  // Keep references to reposition on scroll/resize
  let _currentInputEl  = null;
  let _currentComposer = null;

  function _reposition() {
    if (_currentInputEl) {
      positionBadge(_currentInputEl);
      const bar = document.getElementById(ID_BAR);
      if (bar) {
        const card      = getCardRect(_currentInputEl);
        const inputRect = _currentInputEl.getBoundingClientRect();
        if (card) {
          const safeBottom = card.bottom < window.innerHeight * 0.85
            ? card.bottom : inputRect.bottom;
          bar.style.left  = card.left + "px";
          bar.style.top   = (safeBottom + 6) + "px";
          bar.style.width = card.width + "px";
        }
      }
    }
  }

  window.addEventListener("scroll", _reposition, true);
  window.addEventListener("resize", _reposition);

  function setScanning(inputEl) {
    _currentInputEl  = inputEl;
    _currentComposer = inputEl;
    setBadge("scanning", inputEl);
    removeBar();
  }

  function reset(inputEl) {
    _currentInputEl  = inputEl;
    _currentComposer = inputEl;
    setBadge("none", inputEl);
    removeBar();
    removePanel();
  }

  return {
    update,
    setScanning,
    reset,
    teardown,
    removePanel,
    ID_BADGE, ID_BAR, ID_PANEL
  };

})();

  function teardown() {
    document.getElementById(ID_BADGE)?.remove();
    removeBar();
    removePanel();
    _currentInputEl  = null;
    _currentComposer = null;
  }
