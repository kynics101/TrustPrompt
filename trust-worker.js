// trust-worker.js
// TrustPrompt — Web Worker (Background Thread).
//
// Receives a "SCAN" message from the content script, runs the full
// detection engine (Path A + Path B + risk scoring), and posts back results.
//
// SCORING MODEL: Implements the same RAE 5-step model as scanner.js.
// Both paths (worker and main-thread fallback) are now consistent —
// identical inputs produce identical risk classifications.
//
// Flow (RAE 5-step):
//   Step 1: Base score per distinct entity type
//   Step 2: Distinct entity-type multiplier (×1.00 – ×2.00)
//   Step 3: Preliminary classification (low / moderate / high)
//   Step 4: Governance rule evaluation (3 rules only)
//   Step 5: Final risk = min[max(preliminary, escalation), ceiling]
//
// Message in:
//   { type: "SCAN", rawText: string, scanId: number }
//
// Message out:
//   { type: "RESULT", scanId: number,
//     findings: Array, riskLevel: string, score: number,
//     governance: string, normalisedText: string,
//     wasCapsConverted: boolean, elapsedMs: number }

const _base = (typeof self !== "undefined" && self.EXTENSION_BASE) ? self.EXTENSION_BASE : "";
const _url  = (f) => _base ? _base + f : f;

importScripts(
  _url("normalizer.js"),
  _url("patterns.js"),
  _url("validator-wrapper-worker.js"),
  _url("gazetteer.js"),
  _url("ph-address-db.js")
);

// ── STEP 1: Base scores ───────────────────────────────────────────────────────
// Mirrors scanner.js BASE_SCORES exactly.
// Three tiers per RAE proposed model + RA 10173 / NIST SP 800-122:
//  (High) CRITICAL / ACCESS-CRITICAL  → 10
//  (Moderate)  DIRECT PERSONAL IDENTIFIERS → 5
//  (Low)  CONTEXTUAL INDICATORS       → 2
//   SOURCE CODE (container)     → 0

const BASE_SCORES = {
  // Critical / access-critical (score 10)
  credit_card:      10,
  jwt:              10,
  api_key:          10,
  // password_inline:  10,
  id_label:         10,   // government-issued ID field (TIN, SSS, Passport…)

  // Direct personal identifiers (score 5)
  email:            5,
  ph_mobile:        5,
  phone_intl:       5,
  ph_address:       5,

  // Contextual indicators (score 2)
  // IP & MAC are contextual per proposed model — NOT direct identifiers
  ipv4:             2,
  ipv6:             2,
  mac_address:      2,
  personal_label:   2,
  trigger_person_name: 2,
  trigger_age:         2,
  trigger_dob:         2,
  trigger_employer:    2,
  // trigger_religion:    2,
  // gazetteer_nationality_religion: 2,
  trigger_location:    2,
  trigger_health:      2,
  trigger_financial:   2,
  gazetteer_medical:   2,
  gazetteer_financial: 2,
  // gazetteer_legal:     2,

  // Container (score 0)
  source_code: 0
};

// ── Entity tiers ──────────────────────────────────────────────────────────────
// Mirrors scanner.js ENTITY_TIER exactly.

const ENTITY_TIER = {
  credit_card:      "critical",
  jwt:              "critical",
  api_key:          "critical",
  // password_inline:  "critical",
  id_label:         "critical",

  email:            "direct",
  ph_mobile:        "direct",
  phone_intl:       "direct",
  ph_address:       "direct",

  ipv4:             "contextual",
  ipv6:             "contextual",
  mac_address:      "contextual",
  personal_label:   "contextual",
  trigger_person_name: "contextual",
  trigger_age:         "contextual",
  trigger_dob:         "contextual",
  trigger_employer:    "contextual",
  // trigger_religion:    "contextual",
  trigger_location:    "contextual",
  trigger_health:      "contextual",
  trigger_financial:   "contextual",
  // gazetteer_nationality_religion: "contextual",
  gazetteer_medical:   "contextual",
  gazetteer_financial: "contextual",
  // gazetteer_legal:     "contextual",

  source_code: "container"
};

const SENSITIVE_CONTEXT_IDS = new Set([
  "gazetteer_medical",
  // "gazetteer_legal",
  "gazetteer_financial",
  "trigger_health",
  "trigger_financial"
]);

const RISK_ORDER = { none: 0, low: 1, moderate: 2, high: 3 };

// ── STEP 2: Distinct entity-type multiplier ───────────────────────────────────
// Capped at ×2.00. Mirrors scanner.js getMultiplier() exactly.

function getMultiplier(distinctTypeCount) {
  if (distinctTypeCount >= 5) return 2.00;
  if (distinctTypeCount === 4) return 1.70;
  if (distinctTypeCount === 3) return 1.40;
  if (distinctTypeCount === 2) return 1.20;
  return 1.00;
}

// ── STEP 3: Preliminary classification ───────────────────────────────────────

function preliminaryClass(score) {
  if (score >= 10) return "high";
  if (score >= 5)  return "moderate";
  if (score >= 2)  return "low";
  return "none";
}

// ── STEP 4: Governance rule evaluation ───────────────────────────────────────
// Exactly three rules. Mirrors scanner.js evaluateGovernance() exactly.
//
// Rule 1 — Strongly validated critical entity → HIGH
//   Only findings where validated === true qualify.
//   Format-only candidates (validated === false) do not trigger escalation.
//
// Rule 2 — Sensitive-context co-occurrence → raise preliminary +1 level
//   Requires at least one valid personal (direct or critical) entity
//   plus one or more medical / legal / financial context term.
//   Capped at high.
//
// Rule 3 — Contextual-only ceiling → cannot exceed MODERATE

function evaluateGovernance(findings, preliminary) {
  const hasValidatedCritical = findings.some(
    f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true
  );
  const hasDirectOrCritical = findings.some(
    f => ENTITY_TIER[f.patternId] === "critical" ||
         ENTITY_TIER[f.patternId] === "direct"
  );
  const hasSensitiveContext = findings.some(
    f => SENSITIVE_CONTEXT_IDS.has(f.patternId)
  );
  const allContextualOrContainer = findings.every(
    f => ENTITY_TIER[f.patternId] === "contextual" ||
         ENTITY_TIER[f.patternId] === "container"
  );

  // Rule 1
  if (hasValidatedCritical) {
    return { rule: "critical_entity", result: "high" };
  }

  // Rule 2
  if (hasDirectOrCritical && hasSensitiveContext) {
    const raised = RISK_ORDER[preliminary] < RISK_ORDER["high"]
      ? Object.keys(RISK_ORDER).find(k => RISK_ORDER[k] === RISK_ORDER[preliminary] + 1)
      : "high";
    return { rule: "sensitive_context", result: raised };
  }

  // Rule 3
  if (allContextualOrContainer && findings.some(
    f => ENTITY_TIER[f.patternId] === "contextual")
  ) {
    return { rule: "contextual_ceiling", result: null };
  }

  return { rule: "none", result: null };
}

// ── STEP 5: Final classification ──────────────────────────────────────────────
// Mirrors scanner.js finalClass() exactly.

function finalClass(preliminary, governance) {
  const { rule, result } = governance;

  if (rule === "critical_entity")   return "high";
  if (rule === "sensitive_context") return result;
  if (rule === "contextual_ceiling") {
    return RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary;
  }
  return preliminary;
}

// ── Main scoring function ─────────────────────────────────────────────────────

function computeRiskScore(findings) {
  const scorable = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0);
  if (scorable.length === 0) return { score: 0, riskLevel: "none", governance: "none" };

  // Step 1: base score per distinct entity type
  const seenTypes = new Set();
  let baseTotal   = 0;
  for (const f of scorable) {
    if (!seenTypes.has(f.patternId)) {
      seenTypes.add(f.patternId);
      baseTotal += BASE_SCORES[f.patternId] ?? 0;
    }
  }

  // Step 2: multiplier
  const distinctTypeCount = seenTypes.size;
  const multiplier        = getMultiplier(distinctTypeCount);
  const preScore          = baseTotal * multiplier;

  // Step 3: preliminary
  const preliminary = preliminaryClass(preScore);

  // Step 4: governance
  const governance = evaluateGovernance(findings, preliminary);

  // Step 5: final
  const riskLevel = finalClass(preliminary, governance);

  return {
    score:      Math.round(preScore * 100) / 100,
    riskLevel,
    governance: governance.rule
  };
}

// ── PATH A — Regex (worker-safe) ──────────────────────────────────────────────
//
// validator.js cannot run in a Worker (size / ESM constraints).
// TrustValidatorWorker is used instead — it passes all matches except
// isPHAddress which still runs the gazetteer DB check.
//

//
// NOTE: Because the worker cannot run the full mathematical validator.js
// (Luhn, RFC5322, etc.), `validated` is set to true for all non-address
// patterns that pass the regex. The main-thread fallback (scanner.js)
// applies full mathematical validation. This is a known limitation of the
// worker path and is documented in the gap analysis.

function runPathA(normalisedText) {
  const findings = [];
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = re.exec(normalisedText)) !== null) {
      const raw    = match[0];
      const result = TrustValidatorWorker.validate(pattern.validate, raw);

      // Reject matches that failed structural / gazetteer check
      if (!result.passed) continue;

      // validated = true  → Tier 1 (gazetteer) or Tier 2 (heuristic)
      //             false → Tier 3 (regex shape only — Luhn/RFC5322 not available)
      // Only validated:true findings qualify for critical-entity governance escalation.
      const validated = result.tier !== "3_regex_only";

      findings.push({
        patternId:   pattern.id,
        label:       pattern.label,
        risk:        pattern.risk,
        rawMatch:    raw,
        safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
        validated,
        source:      "A_regex"
      });
    }
  }
  return findings;
}

// ── Merge + deduplicate ───────────────────────────────────────────────────────

function mergeAndDedupe(pathAFindings, pathBFindings) {
  const seen = new Map();
  for (const f of [...pathAFindings, ...pathBFindings]) {
    const key = f.rawMatch.trim().toLowerCase();
    const ex  = seen.get(key);
    if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) seen.set(key, f);
  }
  return [...seen.values()];
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = function (e) {
  const { type, rawText, scanId } = e.data;
  if (type !== "SCAN") return;

  const t0 = performance.now();

  const { masked, textRegex, textNLP, wasCapsConverted } =
    TrustNormalizer.normalize(rawText);

  const pathAFindings = runPathA(textRegex);
  const pathBFindings = TrustGazetteer.scan(textNLP);
  const findings      = mergeAndDedupe(pathAFindings, pathBFindings);

  const { score, riskLevel, governance } = computeRiskScore(findings);

  const elapsedMs = Math.round(performance.now() - t0);

  self.postMessage({
    type:            "RESULT",
    scanId,
    findings,
    riskLevel,
    score,
    governance,
    normalisedText:  masked,
    wasCapsConverted,
    elapsedMs
  });
};
