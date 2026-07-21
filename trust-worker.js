// trust-worker.js
// TrustPrompt — Web Worker (Background Thread).
//
// Receives a "SCAN" message from the content script, runs the full
// detection engine (Path A + Path B + risk scoring), and posts back results.
//
// Falls back to main-thread execution if Worker instantiation fails —
// the DOM drivers handle this transparently via TrustWorkerBridge.
//
// Message in:
//   { type: "SCAN", rawText: string, scanId: number }
//
// Message out:
//   { type: "RESULT", scanId: number,
//     findings: Array, riskLevel: string,
//     normalisedText: string, wasCapsConverted: boolean,
//     elapsedMs: number }
//
// NOTE: importScripts paths are relative to the extension root,
// which Chrome resolves correctly for web_accessible_resources.

importScripts(
  "normalizer.js",
  "patterns.js",
  "validator-wrapper-worker.js",   // validator.js-free version for the worker
  "gazetteer.js",
  "ph-address-db.js"
);

// ── RISK SCORING ENGINE (NIST SP 800-122) ─────────────────────────────────────
//
// Activity diagram implementation:
//   1. Assign base score per entity type
//   2. Scale through multiplier (count of same-type findings)
//   3. Preliminary classification (low / medium / high)
//   4. Escalation & ceiling conditions
//   5. Final = Max(preliminary, governance rule)

const BASE_SCORES = {
  // High-sensitivity entities
  credit_card:      90,
  jwt:              85,
  api_key:          85,
  password_inline:  80,
  // Medium-sensitivity entities
  email:            50,
  ph_mobile:        50,
  phone_intl:       45,
  ipv4:             45,
  ipv6:             45,
  mac_address:      40,
  // Low-sensitivity entities
  source_code:      15,
  context_label:    20,
  ph_address:       25,
  // Gazetteer / NLP entities
  gazetteer_medical:  55,
  gazetteer_financial:50,
  gazetteer_legal:    55,
  gazetteer_nationality_religion: 20,
  trigger_person_name: 45,
  trigger_location:    45,
  trigger_health:      55,
  trigger_employer:    25,
  trigger_religion:    20,
  trigger_financial:   50,
  trigger_age:         15,
  trigger_dob:         20
};

// Governance rules: certain entity types always escalate to a minimum tier
// regardless of score. Max(preliminary, governance).
const GOVERNANCE_FLOOR = {
  credit_card:      "high",
  jwt:              "high",
  api_key:          "high",
  password_inline:  "high",
  gazetteer_legal:  "medium",
  trigger_health:   "medium"
};

function computeRiskScore(findings) {
  if (findings.length === 0) return { score: 0, riskLevel: "none" };

  // Step 1 + 2: sum base scores, apply diminishing multiplier for repeats
  const typeCounts = {};
  let totalScore   = 0;

  for (const f of findings) {
    const id    = f.patternId;
    const base  = BASE_SCORES[id] ?? 30;
    typeCounts[id] = (typeCounts[id] || 0) + 1;
    // Diminishing returns: each additional same-type finding adds 50% of base
    const multiplier = 1 + (typeCounts[id] - 1) * 0.5;
    totalScore += base * multiplier;
  }

  // Clamp to 0-100 ceiling
  totalScore = Math.min(totalScore, 100);

  // Step 3: preliminary classification
  let preliminary;
  if      (totalScore >= 70) preliminary = "high";
  else if (totalScore >= 40) preliminary = "medium";
  else                       preliminary = "low";

  // Step 4: escalation — if ANY finding has a governance floor, apply it
  const TIER_ORDER = { none: 0, low: 1, medium: 2, high: 3 };
  let governanceTier = "none";
  for (const f of findings) {
    const floor = GOVERNANCE_FLOOR[f.patternId];
    if (floor && TIER_ORDER[floor] > TIER_ORDER[governanceTier]) {
      governanceTier = floor;
    }
  }

  // Step 5: Final = Max(preliminary, governance)
  const riskLevel = TIER_ORDER[preliminary] >= TIER_ORDER[governanceTier]
    ? preliminary
    : governanceTier;

  return { score: Math.round(totalScore), riskLevel };
}

// ── PATH A — Regex (worker-safe, no validator.js) ─────────────────────────────
// validator.js can't be loaded in the worker (too large, ESM issues).
// We use the structural regex matches as-is; the worker-safe wrapper
// (validator-wrapper-worker.js) provides null validators that pass all matches.

function runPathA(normalisedText) {
  const findings = [];
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = re.exec(normalisedText)) !== null) {
      const raw = match[0];
      if (!TrustValidatorWorker.validate(pattern.validate, raw)) continue;
      findings.push({
        patternId:   pattern.id,
        label:       pattern.label,
        risk:        pattern.risk,
        rawMatch:    raw,
        safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
        source:      "A_regex"
      });
    }
  }
  return findings;
}

// ── MERGE + DEDUPLICATE ───────────────────────────────────────────────────────

function mergeAndDedupe(pathAFindings, pathBFindings) {
  const RISK_ORDER = { high: 3, medium: 2, low: 1 };
  const seen = new Map();
  for (const f of [...pathAFindings, ...pathBFindings]) {
    const key = f.rawMatch.trim().toLowerCase();
    const ex  = seen.get(key);
    if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) seen.set(key, f);
  }
  return [...seen.values()];
}

// ── MESSAGE HANDLER ───────────────────────────────────────────────────────────

self.onmessage = function (e) {
  const { type, rawText, scanId } = e.data;
  if (type !== "SCAN") return;

  const t0 = performance.now();

  // Layer 1 — normalise
  const { text: normalisedText, wasCapsConverted } = TrustNormalizer.normalize(rawText);

  // Path A — regex
  const pathAFindings = runPathA(normalisedText);

  // Path B — gazetteer + trigger
  const pathBFindings = TrustGazetteer.scan(normalisedText);

  // Merge
  const findings = mergeAndDedupe(pathAFindings, pathBFindings);

  // Risk scoring engine
  const { score, riskLevel } = computeRiskScore(findings);

  const elapsedMs = Math.round(performance.now() - t0);

  self.postMessage({
    type:            "RESULT",
    scanId,
    findings,
    riskLevel,
    score,
    normalisedText,
    wasCapsConverted,
    elapsedMs
  });
};
