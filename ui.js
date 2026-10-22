// ui.js — TrustPrompt shared UI layer v0.0.5
// Three visual components:
//   1. BADGE   — pill floating above the input box (all tiers)
//   2. BAR     — colored strip below the input box (low / moderate / high)
//   3. PANEL   — side panel sliding in from the right (moderate / high only)
//
// Tier behaviour:
//   none     → badge: green "No Detected Privacy Risk",  no bar,  no panel
//   low      → badge: yellow,  bar: yellow,  panel: items only
//   moderate → badge: orange,  bar: orange,  panel: items + why
//   high     → badge: red,     bar: red,     panel: items + safe ver + why + Copy/Send btns
//
// Day/Night mode (panel only):
//   A ☀/☾ toggle lives inside the panel header.
//   Preference is persisted in localStorage under "tp-theme".
//   Only the panel re-renders on toggle — badge and bar are unaffected.

/* global TrustUI */

const TrustUI = (() => {

  // ── IDs ────────────────────────────────────────────────────────────────────
  const ID_BADGE   = "tp-badge";
  const ID_BAR     = "tp-bar";
  const ID_PANEL   = "tp-panel";
  const ID_OVERLAY = "tp-overlay";

  // ── Day / Night state (panel only) ─────────────────────────────────────────
  let isDark = (localStorage.getItem("tp-theme") ?? "dark") === "dark";

  // ── Badge / bar theme (unchanged by day/night toggle) ─────────────────────
  const THEME = {
    scanning: { bg: "#e5e7eb", text: "#6b7280", dot: "#9ca3af", label: "TrustPrompt is scanning…" },
    none:     { bg: "#dcfce7", text: "#15803d", dot: "#22c55e", label: "No Detected Privacy Risk" },
    low:      { bg: "#fef9c3", text: "#a16207", dot: "#eab308", label: "Low risk detected"      },
    moderate: { bg: "#ffedd5", text: "#c2410c", dot: "#f97316", label: "Moderate risk detected"  },
    high:     { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444", label: "High risk detected"      },
  };

  // ── Accent colours — bar & panel ───────────────────────────────────────────
  const ACCENT = {
    low:      { solid: "#eab308", text: "#fff", dark: "#854d0e" },
    moderate: { solid: "#f97316", text: "#fff", dark: "#7c2d12" },
    high:     { solid: "#ef4444", text: "#fff", dark: "#7f1d1d" },
  };

  // ── Panel palette — changes with day/night ─────────────────────────────────
  function PANEL_COLORS() {
    return isDark ? {
      // Night mode — unified dark surface, high contrast text
      panelBg:      "#1a1d27",   // deep navy-dark — whole panel
      headerBorder: "#2a2d3a",   // slightly lighter — dividers
      summaryBg:    "#23263a",   // same dark family — summary block
      summaryText:  "#f3f4f6",   // near-white — heading
      subtitleText: "#9ca3af",   // medium gray — subtitle
      cardBg:       "#23263a",   // same dark family — cards blend cleanly
      cardBorder:   "#2e3245",   // subtle separation between card and bg
      cardText:     "#e5e7eb",   // light gray — body text
      detectedText: "#9ca3af",   // medium gray — "Detected" label
      whyBg:        "#1a1d27",   // same as panel — "why" drawer recessed
      whyText:      "#9ca3af",   // medium gray — why body text
      btnSendBg:    "#23263a",   // dark — Send Anyway button
      btnSendText:  "#e5e7eb",   // light gray — button label
      btnSendBorder:"#3a3f55",   // visible border
      btnRefText:   "#6b7280",   // dimmed gray — Refresh link
      legendBorder: "#2a2d3a",   // same as dividers
      legendLabel:  "#6b7280",   // dimmed gray — "RISK LEVELS"
      legendText:   "#9ca3af",   // medium gray — legend text
      footerBorder: "#2a2d3a",   // divider
      lowFooterText:"#9ca3af",   // medium gray
      toggleBg:     "#2a2d3a",   // dark pill
      toggleText:   "#f3f4f6",   // near-white icon
      toggleBorder: "#3a3f55",   // subtle border
      toggleIcon:   "&#9728;",   // ☀  — click to go light
      toggleLabel:  "",          // icon only
    } : {
      // Day mode — pure white, high contrast
      panelBg:      "#ffffff",   // Pure white — panel background
      headerBorder: "#e5e7eb",   // Light gray — dividers
      summaryBg:    "#f3f4f6",   // Off-white — risk summary block
      summaryText:  "#0F5132",   // Forest — strong heading text
      subtitleText: "#4b5563",   // Dark gray — subtitles
      cardBg:       "#f9fafb",   // Very light gray — cards (subtle contrast from bg)
      cardBorder:   "#e5e7eb",   // Light gray — card outline
      cardText:     "#111827",   // Near-black — card body text
      detectedText: "#374151",   // Dark gray — "Detected" label
      whyBg:        "#f3f4f6",   // Light gray — "why" drawer
      whyText:      "#374151",   // Dark gray — why body text
      btnSendBg:    "#0F5132",   // Forest — Send Anyway button (prominent)
      btnSendText:  "#ffffff",   // White — button label
      btnSendBorder:"#0F5132",   // Forest — button border
      legendBorder: "#e5e7eb",   // Light gray — legend top border
      legendLabel:  "#4b5563",   // Dark gray — "RISK LEVELS" label
      legendText:   "#111827",   // Near-black — legend item text
      footerBorder: "#e5e7eb",   // Light gray — footer divider
      lowFooterText:"#374151",   // Dark gray — footer text
      toggleBg:     "#0F5132",   // Forest — toggle pill background
      toggleText:   "#ffffff",   // White — toggle label
      toggleBorder: "#0F5132",   // Forest — toggle border
      toggleIcon:   "&#9790;",   // ☾  — click to go dark
      toggleLabel:  "",          // icon only
    };
  }

  // ── "Why is this flagged?" explanations ────────────────────────────────────
  const WHY = {
    credit_card:      "Matched pattern: credit/debit card number that passed a validity check.\nWhy it matters: card numbers can be used for fraud if stored or reproduced.\nRule: Personal information (RA 10173); payment card data (PCI DSS).\nCategory: Financial Information.",
    api_key:          "Matched pattern: API key / access token format.\nWhy it matters: anyone holding it may be able to access your accounts or systems.\nRule: Credential, not personal data (OWASP LLM02:2025).\nCategory: Authentication Credentials.",
    jwt:              "Matched pattern: JSON Web Token (login token).\nWhy it matters: it can grant access to an account until it expires.\nRule: Credential, not personal data (OWASP LLM02:2025).\nCategory: Authentication Credentials.",
    email:            "Matched pattern: email address format.\nWhy it matters: it can be used to identify or contact you, including for phishing.\nRule: Personal information (RA 10173).\nCategory: Contact Information.",
    ph_mobile:        "Matched pattern: Philippine mobile number format.\nWhy it matters: it can be used to identify or contact you, including for scams.\nRule: Personal information (RA 10173).\nCategory: Contact Information.",
    phone_intl:       "Matched pattern: international phone number format.\nWhy it matters: it can be used to identify or contact you.\nRule: Personal information (RA 10173).\nCategory: Contact Information.",
    ipv4:             "Matched pattern: IPv4 address.\nWhy it matters: network addresses can help trace a device or location.\nRule: Personal information when linkable to a person (RA 10173).\nCategory: Network Identifier.",
    ipv6:             "Matched pattern: IPv6 address.\nWhy it matters: network addresses can help trace a device or location.\nRule: Personal information when linkable to a person (RA 10173).\nCategory: Network Identifier.",
    mac_address:      "Matched pattern: device (MAC) address.\nWhy it matters: it is a hardware identifier that can help trace a specific device.\nRule: Personal information when linkable to a person (RA 10173).\nCategory: Network Identifier.",
    source_code:      "Matched pattern: block of source code.\nWhy it matters: code may contain proprietary logic or hidden secrets. TrustPrompt cannot tell whether this code is sensitive.\nRule: Not personal data; may be confidential (OWASP LLM02:2025).\nCategory: Technical Data.",
    context_label:    "Matched pattern: labeled personal field (e.g. Name:, Age:).\nWhy it matters: labeled fields usually hold details about a specific person.\nRule: Personal information (RA 10173).\nCategory: Personal Identifier.",
    ph_address:       "Matched pattern: Philippine physical address.\nWhy it matters: it can reveal where you live or work.\nRule: Personal information (RA 10173).\nCategory: Location Data.",
    ph_id_philid:     "Matched pattern: Philippine National ID number.\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Government ID.",
    ph_id_umid:       "Matched pattern: UMID (Unified Multi-Purpose ID) number.\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Government ID.",
    ph_id_passport:   "Matched pattern: Philippine passport number.\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Government ID.",
    ph_id_prc:        "Matched pattern: PRC license number.\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Professional ID.",
    ph_id_postal:     "Matched pattern: Postal ID number.\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Government ID.",
    ph_id_pwd:        "Matched pattern: PWD ID number.\nWhy it matters: it can reveal a disability status and be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Government ID.",
    ph_id_senior_citizen: "Matched pattern: Senior Citizen ID number.\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Government ID.",
    ph_id_gsis:       "Matched pattern: GSIS number.\nWhy it matters: it is tied to government employment and benefits records.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Employment ID.",
    ph_id_sss:        "Matched pattern: SSS number.\nWhy it matters: it is tied to your social security and benefits records.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Employment ID.",
    ph_id_philhealth: "Matched pattern: PhilHealth number.\nWhy it matters: it is tied to your health insurance and medical records.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Healthcare ID.",
    ph_id_drivers_license: "Matched pattern: driver's license number (LTO).\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Government ID.",
    ph_id_voters:     "Matched pattern: voter's ID number (COMELEC).\nWhy it matters: government-issued numbers can be used to verify or impersonate you.\nRule: Government-issued identifier (RA 10173, SPI).\nCategory: Electoral ID.",
    gazetteer_medical:   "Detected a health-related term.\nWhy it matters: health details can be sensitive when tied to a person. A term alone does not identify anyone and adds no score by itself.\nRule: Health information, a sensitive category (RA 10173).\nCategory: Health Information.",
    gazetteer_financial: "Detected a finance-related term.\nWhy it matters: money details can matter when tied to a person. A term alone does not identify anyone and adds no score by itself.\nRule: Financial context (not a listed sensitive category in RA 10173).\nCategory: Financial Information.",
    gazetteer_nationality_religion: "Detected a nationality or religion term.\nWhy it matters: beliefs and affiliations can be sensitive when tied to a person. A term alone does not identify anyone and adds no score by itself.\nRule: Religious affiliation is sensitive under RA 10173; nationality is not.\nCategory: Belief / Affiliation.",
    trigger_person_name: "Trigger phrase matched a person's name.\nWhy it matters: names become more revealing when combined with other details.\nRule: Personal information (RA 10173).\nCategory: Personal Identifier.",
    trigger_location:    "Trigger phrase matched a location.\nWhy it matters: specific locations can reveal where you live or work.\nRule: Personal information when specific (RA 10173).\nCategory: Location Data.",
    trigger_health:      "Trigger phrase matched a health condition.\nWhy it matters: health details can be sensitive when tied to a person.\nRule: Health information, a sensitive category (RA 10173).\nCategory: Health Information.",
    trigger_employer:    "Trigger phrase matched an employer or workplace.\nWhy it matters: employer details can help identify you when combined with other information.\nRule: Personal information (RA 10173).\nCategory: Occupational Data.",
    trigger_financial:   "Trigger phrase matched financial information.\nWhy it matters: money details can matter when tied to a person.\nRule: Financial context (not a listed sensitive category in RA 10173).\nCategory: Financial Information.",
    trigger_age:         "Trigger phrase matched an age.\nWhy it matters: age is a small detail, but it helps identify you when combined with others.\nRule: Sensitive personal information (RA 10173, Sec. 3(l)(1)).\nCategory: Personal Identifier.",
    trigger_dob:         "Trigger phrase matched a date of birth.\nWhy it matters: a birth date is commonly used to verify identity.\nRule: Personal information (RA 10173).\nCategory: Personal Identifier.",
  };

  // ── Utilities ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function trunc(s, n) { return s.length > n ? s.slice(0, n) + "…" : s; }

  // ── 1. BADGE ───────────────────────────────────────────────────────────────

  function findComposerRect(el) {
    if (!el) return null;
    let best = el;
    let cur  = el;
    const viewW = window.innerWidth;
    while (cur && cur !== document.body) {
      const r = cur.getBoundingClientRect();
      if (r.width > 300 && r.width < viewW * 0.98) best = cur;
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
      "padding:4px 12px",
      "border-radius:999px",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "font-size:11px",
      "font-weight:500",
      "white-space:nowrap",
      "z-index:10000",
      "box-shadow:0 1px 6px rgba(0,0,0,0.18)",
      "pointer-events:none",
      "transition:background 0.25s,color 0.25s,opacity 0.25s",
    ].join(";");
    document.body.appendChild(badge);
    return badge;
  }

  function positionBadge(inputEl) {
    const badge = document.getElementById(ID_BADGE);
    if (!badge || !inputEl) return;
    const card  = getCardRect(inputEl);
    const input = inputEl.getBoundingClientRect();
    if (!card || !input) return;
    const BADGE_H = 28;
    const badgeW  = badge.getBoundingClientRect().width || 160;
    badge.style.left = (card.left + card.width / 2 - badgeW / 2) + "px";
    badge.style.top  = (input.top - BADGE_H - 4) + "px";
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

  function removeBar() { document.getElementById(ID_BAR)?.remove(); }

  function getCardRect(inputEl) {
    if (!inputEl) return null;
    const inputRect = inputEl.getBoundingClientRect();
    const inputH    = inputRect.height || 40;
    const maxH      = inputH * 3;
    const inputW    = inputRect.width || 400;
    const maxW      = Math.min(inputW * 1.05, 760);
    let best        = inputRect;
    let el          = inputEl.parentElement;
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.height > maxH) break;
      if (r.width > best.width && r.width <= maxW) best = r;
      el = el.parentElement;
    }
    return best;
  }

  function showBar(riskLevel, findingsCount, inputEl, onOpen) {
    removeBar();
    if (riskLevel === "none" || riskLevel === "scanning") return;

    const acc = ACCENT[riskLevel] || ACCENT.moderate;
    const box = inputEl.getBoundingClientRect();
    if (!box) return;

    // Walk up to clear the send-button row
    let composerBottom = box.bottom;
    let composerLeft   = box.left;
    let composerWidth  = box.width;
    let el = inputEl.parentElement;
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.height > box.height + 200) break;
      composerBottom = r.bottom;
      composerLeft   = r.left;
      composerWidth  = r.width;
      if (r.bottom >= box.bottom + 30) break;
      el = el.parentElement;
    }

    const barTop    = composerBottom + 6;
    const isHigh    = riskLevel === "high";
    const riskLabel = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);

    // Day mode bar uses a slightly darker tint for readability
    const barBg   = isDark ? acc.solid : acc.solid;   // same solid for both modes
    const barText = "#fff";

    const bar = document.createElement("div");
    bar.id = ID_BAR;
    bar.style.cssText = [
      "all:initial",
      "position:fixed",
      `left:${composerLeft}px`,
      `top:${barTop}px`,
      `width:${composerWidth}px`,
      "max-width:760px",
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      `background:${barBg}`,
      `color:${barText}`,
      "padding:7px 12px",
      "border-radius:8px",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "font-size:12px",
      "font-weight:500",
      isHigh ? "cursor:default" : "cursor:pointer",
      "z-index:9999",
      "box-sizing:border-box",
      "box-shadow:0 2px 8px rgba(0,0,0,0.18)",
    ].join(";");

    bar.innerHTML = `
      <span style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;">
          <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"
                fill="rgba(255,255,255,0.9)"/>
        </svg>
        <strong style="white-space:nowrap;">${riskLabel} risk</strong>
        <span style="opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          — ${findingsCount} sensitive item${findingsCount !== 1 ? "s" : ""} found
        </span>
      </span>
      ${!isHigh ? `<span style="opacity:0.9;font-size:11px;white-space:nowrap;margin-left:8px;flex-shrink:0;">
        View details →
      </span>` : ""}`;

    if (!isHigh) {
      bar.addEventListener("click", () => { if (typeof onOpen === "function") onOpen(); });
    }

    document.body.appendChild(bar);
  }

  // ── 3. SIDE PANEL ─────────────────────────────────────────────────────────

  function removePanel() {
    document.getElementById(ID_PANEL)?.remove();
    document.getElementById(ID_OVERLAY)?.remove();
  }

  function buildFindingCard(f, tier) {
    const pc       = PANEL_COLORS();
    const dotColor = f.risk === "high" ? "#ef4444" : f.risk === "moderate" ? "#f97316" : "#eab308";
    const riskTag  = f.risk.toUpperCase();
    const why      = WHY[f.patternId] || "Matched a known sensitive data pattern.";
    const showSafe = (tier === "high" || tier === "moderate");

    const card = document.createElement("div");
    card.style.cssText = [
      `background:${pc.cardBg}`,
      `border:1px solid ${pc.cardBorder}`,
      "border-radius:8px",
      "padding:10px 12px",
      "margin-bottom:8px",
      "font-size:12px",
      `color:${pc.cardText}`,
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
        <span style="color:${pc.detectedText};font-size:11px;">Detected</span>
        <span style="color:#f87171;font-family:monospace;word-break:break-all;font-size:11px;">
          ${esc(trunc(f.rawMatch, 60))}
        </span>
        ${showSafe ? `
        <span style="color:${pc.detectedText};font-size:11px;">Safe ver.</span>
        <span style="color:#4ade80;font-family:monospace;word-break:break-all;font-size:11px;">
          ${esc(f.safeVersion)}
        </span>` : ""}
      </div>
      <details style="margin-top:4px;">
        <summary style="color:${pc.whyText};font-size:11px;cursor:pointer;list-style:none;
                        display:flex;align-items:center;gap:4px;">
          <span style="font-size:9px;">▶</span> Why is this flagged?
        </summary>
        <div style="margin-top:6px;padding:8px;background:${pc.whyBg};border-radius:6px;
                    color:${pc.whyText};font-size:11px;line-height:1.6;white-space:pre-line;">
          ${esc(why)}
        </div>
      </details>`;
    return card;
  }

  function openPanel(findings, riskLevel, safeText, onSendAnyway, onRefresh) {
    removePanel();
    const tier = riskLevel;
    const acc  = ACCENT[tier] || ACCENT.moderate;
    const t    = THEME[tier] || THEME.moderate;
    const pc   = PANEL_COLORS();

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
      `background:${pc.panelBg}`,
      "z-index:99999",
      "display:flex",
      "flex-direction:column",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "box-shadow:-4px 0 24px rgba(0,0,0,0.4)",
      "overflow:hidden",
    ].join(";");
    panel.addEventListener("click", e => e.stopPropagation());
    document.body.appendChild(panel);
    buildPanelContent(panel, findings, riskLevel, tier, acc, t, pc, safeText, onSendAnyway, onRefresh);
  }

  function buildPanelContent(panel, findings, riskLevel, tier, acc, t, pc, safeText, onSendAnyway, onRefresh) {
    const header = document.createElement("div");
    header.style.cssText = `padding:14px 16px 10px;border-bottom:1px solid ${pc.headerBorder};flex-shrink:0;background:${pc.panelBg};`;
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
          <div style="font-weight:700;font-size:14px;color:${pc.summaryText};">TrustPrompt</div>
          <div style="font-size:10px;color:${pc.subtitleText};">Prompt privacy shield — v0.0.5</div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
          <button id="tp-theme-toggle"
            title="Toggle day / night mode"
            style="background:${pc.toggleBg};color:${pc.toggleText};border:1px solid ${pc.toggleBorder};
                   border-radius:999px;padding:4px 8px;font-size:13px;line-height:1;
                   cursor:pointer;font-family:inherit;white-space:nowrap;">
            ${pc.toggleIcon}
          </button>
          <button id="tp-panel-close"
            style="background:none;border:none;color:${pc.subtitleText};
                   font-size:18px;cursor:pointer;padding:2px 4px;line-height:1;">×</button>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;
                  background:${pc.summaryBg};border-radius:8px;padding:8px 12px;">
        <span style="display:flex;align-items:center;gap:7px;font-weight:600;
                     font-size:13px;color:${pc.summaryText};">
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

    // Toggle button — flip isDark, persist, rebuild panel in place
    panel.querySelector("#tp-theme-toggle").addEventListener("click", () => {
      isDark = !isDark;
      localStorage.setItem("tp-theme", isDark ? "dark" : "light");
      // Update the panel container background immediately before rebuild
      const newPc  = PANEL_COLORS();
      panel.style.background = newPc.panelBg;
      panel.innerHTML = "";
      const newAcc = ACCENT[tier] || ACCENT.moderate;
      const newT   = THEME[tier]  || THEME.moderate;
      buildPanelContent(panel, findings, riskLevel, tier, newAcc, newT, newPc, safeText, onSendAnyway, onRefresh);
    });

    const listWrap = document.createElement("div");
    listWrap.id = "tp-panel-list";
    listWrap.style.cssText = `flex:1;overflow-y:auto;padding:12px 16px 8px;background:${pc.panelBg};`;
    // Scrollbar — thin, theme-aware (day/night)
    listWrap.style.scrollbarWidth = "thin";   // Firefox
    listWrap.style.scrollbarColor = isDark
      ? "#3a3f55 #1a1d27"   // thumb track — night
      : "#c7ccd6 #f3f4f6";  // thumb track — day
    // WebKit (Chrome/Edge): inject themed scrollbar style, replacing any prior rule
    const existingStyle = document.getElementById("tp-scrollbar-style");
    if (existingStyle) existingStyle.remove();
    const s = document.createElement("style");
    s.id = "tp-scrollbar-style";
    if (isDark) {
      s.textContent = [
        "#tp-panel-list::-webkit-scrollbar { width: 5px; }",
        "#tp-panel-list::-webkit-scrollbar-track { background: #1a1d27; border-radius: 0 0 0 0; }",
        "#tp-panel-list::-webkit-scrollbar-thumb { background: #3a3f55; border-radius: 4px; }",
        "#tp-panel-list::-webkit-scrollbar-thumb:hover { background: #52597a; }",
      ].join("\n");
    } else {
      s.textContent = [
        "#tp-panel-list::-webkit-scrollbar { width: 5px; }",
        "#tp-panel-list::-webkit-scrollbar-track { background: #f3f4f6; border-radius: 0 0 0 0; }",
        "#tp-panel-list::-webkit-scrollbar-thumb { background: #c7ccd6; border-radius: 4px; }",
        "#tp-panel-list::-webkit-scrollbar-thumb:hover { background: #9ca3af; }",
      ].join("\n");
    }
    document.head.appendChild(s);
    listWrap.innerHTML = `<div style="font-size:10px;font-weight:600;letter-spacing:.8px;
      color:${pc.subtitleText};margin-bottom:8px;">DETECTIONS (${findings.length})</div>`;
    for (const f of findings) listWrap.appendChild(buildFindingCard(f, tier));
    panel.appendChild(listWrap);

    const footer = document.createElement("div");
    footer.style.cssText = `padding:12px 16px;border-top:1px solid ${pc.footerBorder};flex-shrink:0;background:${pc.panelBg};`;

    if (tier === "low") {
      footer.innerHTML = `
        <div style="font-size:11px;color:${pc.lowFooterText};text-align:center;padding:4px 0;">
          Low risk — no action required. You may continue.
        </div>`;
    } else {
      if (tier === "high") {
        const btnCopy = document.createElement("button");
        btnCopy.textContent = "Copy Safe Version";
        btnCopy.style.cssText = "width:100%;background:#166534;color:#fff;border:none;" +
          "border-radius:8px;padding:10px;font-size:13px;font-weight:600;" +
          "cursor:pointer;font-family:inherit;margin-bottom:8px;";
        btnCopy.addEventListener("click", () => {
          if (!safeText) return;
          navigator.clipboard.writeText(safeText).then(() => {
            btnCopy.textContent = "✔ Copied to clipboard!";
            setTimeout(() => { btnCopy.textContent = "Copy Safe Version"; }, 2000);
          });
        });
        footer.appendChild(btnCopy);
      }

      const btnSend = document.createElement("button");
      btnSend.textContent = "Send Anyway";
      btnSend.style.cssText = `width:100%;background:${pc.btnSendBg};color:${pc.btnSendText};` +
        `border:1px solid ${pc.btnSendBorder};` +
        "border-radius:8px;padding:9px;font-size:13px;cursor:pointer;font-family:inherit;margin-bottom:6px;";
      btnSend.addEventListener("click", () => {
        removePanel();
        if (typeof onSendAnyway === "function") onSendAnyway();
      });

      const btnRefresh = document.createElement("button");
      btnRefresh.textContent = "↺ Refresh Rules";
      btnRefresh.style.cssText = `width:100%;background:none;color:${pc.btnRefText};border:none;` +
        "font-size:11px;cursor:pointer;font-family:inherit;padding:4px;";
      btnRefresh.addEventListener("click", () => {
        btnRefresh.textContent = "Refreshing…";
        chrome.runtime.sendMessage({ type: "REFRESH_RULES" }, () => {
          btnRefresh.textContent = "✅ Rules updated";
          setTimeout(() => { btnRefresh.textContent = "↺ Refresh Rules"; }, 2000);
        });
      });

      footer.appendChild(btnSend);
      footer.appendChild(btnRefresh);
    }

    footer.innerHTML += `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid ${pc.legendBorder};">
        <div style="font-size:9px;letter-spacing:.7px;color:${pc.legendLabel};margin-bottom:4px;">RISK LEVELS</div>
        <div style="font-size:10px;color:${pc.legendText};line-height:1.8;">
          <span style="color:#ef4444;">●</span> High — Cards, IDs, Keys, or accumulated data types present<br>
          <span style="color:#f97316;">●</span> Moderate — Email, phone, address, or date of birth<br>
          <span style="color:#eab308;">●</span> Low — Limited details, such as name or age/ labels<br>
          <span style="color:#22c55e;">●</span> No Detected Privacy Risk present - No supported sensitive data found
        </div>
      </div>`;
    panel.appendChild(footer);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // State kept for live re-render on theme toggle
  let _currentInputEl  = null;
  let _currentComposer = null;
  let _lastRiskLevel   = null;
  let _lastFindings    = null;
  let _lastSafeText    = null;
  let _lastOnSendAnyway = null;

  function update(riskLevel, findings, safeText, inputEl, _composerEl, onSendAnyway) {
    _currentInputEl   = inputEl;
    _currentComposer  = inputEl;
    _lastRiskLevel    = riskLevel;
    _lastFindings     = findings;
    _lastSafeText     = safeText;
    _lastOnSendAnyway = onSendAnyway;

    setBadge(riskLevel, inputEl);

    if (riskLevel === "none" || riskLevel === "scanning") {
      // Safe / scanning — clear bar and panel
      removeBar();
      removePanel();
      return;
    }

    // Show bar; for high risk the bar is display-only (no click handler)
    showBar(riskLevel, findings.length, inputEl,
      riskLevel !== "high"
        ? () => openPanel(findings, riskLevel, safeText, onSendAnyway, null)
        : null
    );

    // High risk: auto-open the panel immediately (single call, removePanel is inside openPanel)
    if (riskLevel === "high") {
      openPanel(findings, riskLevel, safeText, onSendAnyway, null);
      return;
    }

    // Low / moderate: re-render panel only if it was already open
    if (document.getElementById(ID_PANEL)) {
      openPanel(findings, riskLevel, safeText, onSendAnyway, null);
    }
  }

  function _reposition() {
    if (!_currentInputEl) return;
    positionBadge(_currentInputEl);
    const bar = document.getElementById(ID_BAR);
    if (bar) {
      const box = _currentInputEl.getBoundingClientRect();
      if (!box) return;
      let composerBottom = box.bottom;
      let composerLeft   = box.left;
      let composerWidth  = box.width;
      let el = _currentInputEl.parentElement;
      while (el && el !== document.body) {
        const r = el.getBoundingClientRect();
        if (r.height > box.height + 200) break;
        composerBottom = r.bottom;
        composerLeft   = r.left;
        composerWidth  = r.width;
        if (r.bottom >= box.bottom + 30) break;
        el = el.parentElement;
      }
      bar.style.left  = composerLeft + "px";
      bar.style.top   = (composerBottom + 6) + "px";
      bar.style.width = composerWidth + "px";
    }
  }

  window.addEventListener("scroll", _reposition, true);
  window.addEventListener("resize", _reposition);

  function setScanning(inputEl) {
    _currentInputEl  = inputEl;
    _currentComposer = inputEl;
    _lastRiskLevel   = "scanning";
    setBadge("scanning", inputEl);
    removeBar();
  }

  function reset(inputEl) {
    _currentInputEl  = inputEl;
    _currentComposer = inputEl;
    _lastRiskLevel   = "none";
    setBadge("none", inputEl);
    removeBar();
    removePanel();
  }

  function teardown() {
    document.getElementById(ID_BADGE)?.remove();
    removeBar();
    removePanel();
    _currentInputEl   = null;
    _currentComposer  = null;
    _lastRiskLevel    = null;
    _lastFindings     = null;
    _lastSafeText     = null;
    _lastOnSendAnyway = null;
  }

  return {
    update,
    setScanning,
    reset,
    teardown,
    removePanel,
    ID_BADGE, ID_BAR, ID_PANEL,
  };

})();
