// sidepanel.js
// TrustPrompt — Side Panel UI controller.
//
// Receives SCAN_RESULT messages relayed from the content script via background.js
// and renders the findings list, risk status, and action buttons.

// ── Risk metadata ─────────────────────────────────────────────────────────────

const RISK_META = {
  scanning: { label: "TrustPrompt is scanning…", badge: "Scanning", cls: "scanning" },
  high:     { label: "High risk detected",   badge: "High",     cls: "high"     },
  moderate:   { label: "Moderate risk detected", badge: "Moderate",   cls: "moderate"   },
  low:      { label: "Low risk detected",    badge: "Low",      cls: "low"      },
  none:     { label: "No sensitive data detected", badge: "Safe", cls: "safe"   },
  idle:     { label: "Waiting for activity…", badge: "Idle",    cls: "idle"     }
};

const RISK_COLOURS = {
  high:   "#D32F2F",
  moderate: "#F57C00",
  low:    "#F9A825",
  none:   "#388E3C"
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const statusBanner  = document.getElementById("status-banner");
const statusDot     = document.getElementById("status-dot");
const statusLabel   = document.getElementById("status-label");
const statusBadge   = document.getElementById("status-badge");
const findingsLabel = document.getElementById("findings-label");
const findingsScroll= document.getElementById("findings-scroll");
const emptyState    = document.getElementById("empty-state");
const btnCopySafe   = document.getElementById("btn-copy-safe");
const btnSendAnyway = document.getElementById("btn-send-anyway");
const btnRefresh    = document.getElementById("btn-refresh");

// ── State ─────────────────────────────────────────────────────────────────────

let lastFindings  = [];
let lastRawText   = "";
let lastRiskLevel = "idle";

// ── Render helpers ────────────────────────────────────────────────────────────

function setStatus(riskLevel) {
  const meta = RISK_META[riskLevel] || RISK_META.idle;

  // Remove all risk classes, apply current one
  statusBanner.className = `status-banner ${meta.cls}`;
  statusDot.className    = `status-dot ${meta.cls}`;
  statusBadge.className  = `status-badge ${meta.cls}`;

  statusLabel.textContent = meta.label;
  statusBadge.textContent = meta.badge;

  lastRiskLevel = riskLevel;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function renderFindings(findings, riskLevel) {
  lastFindings = findings;

  // Update section label count
  findingsLabel.textContent =
    findings.length > 0
      ? `Detections (${findings.length})`
      : "Detections";

  // Clear existing cards (keep empty-state node)
  [...findingsScroll.querySelectorAll(".finding-card")].forEach(el => el.remove());

  if (findings.length === 0) {
    emptyState.style.display = "flex";
    btnCopySafe.disabled     = true;
    btnCopySafe.style.display = "block";
    btnSendAnyway.disabled   = true;
    return;
  }

  emptyState.style.display = "none";
  // Copy Safe Version is only available for high risk, not moderate
  const isHigh = riskLevel === "high";
  btnCopySafe.style.display = isHigh ? "block" : "none";
  btnCopySafe.disabled      = !isHigh;
  btnSendAnyway.disabled    = false;

  for (const f of findings) {
    const colour    = RISK_COLOURS[f.risk] || "#9E9E9E";
    const textColour= f.risk === "low" ? "#000" : "#fff";

    const card = document.createElement("div");
    card.className = "finding-card";
    card.innerHTML = `
      <div class="finding-header">
        <div class="finding-risk-dot" style="background:${colour}"></div>
        <span class="finding-label">${escapeHtml(f.label)}</span>
        <span class="finding-risk-tag"
              style="background:${colour};color:${textColour}">
          ${escapeHtml(f.risk)}
        </span>
      </div>
      <div class="finding-row">
        <span class="finding-row-label">Detected</span>
        <span class="finding-value detected">${escapeHtml(truncate(f.rawMatch, 60))}</span>
      </div>
      <div class="finding-row">
        <span class="finding-row-label">Safe ver.</span>
        <span class="finding-value safe">${escapeHtml(f.safeVersion)}</span>
      </div>
      ${f.reason ? `
      <button class="why-toggle" aria-expanded="false">
        <i class="why-arrow">›</i> Why is this flagged?
      </button>
      <div class="why-body">${escapeHtml(f.reason)}</div>
      ` : ""}
    `;

    // Wire up toggle if reason exists
    if (f.reason) {
      const toggle = card.querySelector(".why-toggle");
      const body   = card.querySelector(".why-body");
      toggle.addEventListener("click", () => {
        const isOpen = body.classList.toggle("open");
        toggle.classList.toggle("open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
      });
    }

    findingsScroll.appendChild(card);
  }
}

// ── Safe text builder ─────────────────────────────────────────────────────────

function buildSafeText(originalText, findings) {
  let safe = originalText;
  // Replace longest matches first so shorter overlapping ones don't break positions
  const sorted = [...findings].sort((a, b) => b.rawMatch.length - a.rawMatch.length);
  for (const f of sorted) {
    const escaped = f.rawMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    safe = safe.replace(new RegExp(escaped, "g"), f.safeVersion);
  }
  return safe;
}

// ── Button handlers ───────────────────────────────────────────────────────────

// Close (×) — closes the side panel (same as clicking Chrome's native × button)
document.getElementById("btn-close-panel").addEventListener("click", () => {
  window.close();
});

btnCopySafe.addEventListener("click", () => {
  if (!lastFindings.length) return;
  const safeText = buildSafeText(lastRawText, lastFindings);
  navigator.clipboard.writeText(safeText).then(() => {
    btnCopySafe.textContent = "✅ Copied!";
    setTimeout(() => { btnCopySafe.textContent = "📋 Copy Safe Version"; }, 2000);
  });
});

btnSendAnyway.addEventListener("click", () => {
  // Notify the content script to clear its warning state
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SEND_ANYWAY" });
    }
  });
  // Reset panel to safe state
  setStatus("none");
  renderFindings([], "none");
});

btnRefresh.addEventListener("click", () => {
  btnRefresh.textContent = "Refreshing…";
  btnRefresh.disabled    = true;
  chrome.runtime.sendMessage({ type: "REFRESH_RULES" }, (resp) => {
    btnRefresh.textContent = resp?.ok ? "✅ Rules updated" : "⚠ Fetch failed";
    btnRefresh.disabled    = false;
    setTimeout(() => { btnRefresh.textContent = "↻ Refresh Rules"; }, 2500);
  });
});

// ── Message listener ──────────────────────────────────────────────────────────
//
// Background.js relays SCAN_RESULT from the active ChatGPT tab to this panel.

chrome.runtime.onMessage.addListener((message) => {

  if (message.type === "SCAN_RESULT") {
    lastRawText = message.rawText || "";
    setStatus(message.riskLevel);
    renderFindings(message.findings || [], message.riskLevel);
  }

  if (message.type === "SCAN_SCANNING") {
    setStatus("scanning");
  }

  if (message.type === "SCAN_CLEARED") {
    lastRawText = "";
    setStatus("none");
    renderFindings([], "none");
    btnCopySafe.style.display = "block";
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
// Show idle state on open; will update as soon as the content script sends data.
setStatus("idle");
