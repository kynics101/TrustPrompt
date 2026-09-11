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
// Task #4 additions:
//   TASK-4.4: suppressPlaceholders() — same logic as scanner.js
//   TASK-4.5: Entropy pre-check in runPathA()
//   TASK-4.6: structuralValidate hook — sets validated:true for vendor-prefix
//             API key matches, enabling governance Rule 1 escalation to HIGH
//   TASK-4.3: Worker-side JWT validation delegated to validator-wrapper-worker.js
//             _isJWT() now does full structural decode check
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
  _url("ph-address-db.js"),
  _url("linguistic-detector.js")
);

// ── STEP 1: Base scores ───────────────────────────────────────────────────────

const BASE_SCORES = {
  credit_card:      10,
  jwt:              10,
  api_key:          10,
  id_label:         10,

  // ── Philippine Government IDs (all score 10) ────────────────────────────
  ph_id_philid:              10,  // PhilID (PSA National ID)
  ph_id_drivers_license:     10,  // Driver's License (LTO)
  ph_id_passport:            10,  // Passport (BI)
  ph_id_umid:                10,  // UMID (Unified Multi-Purpose ID)
  ph_id_sss:                 10,  // SSS (Social Security System)
  ph_id_gsis:                10,  // GSIS (Government Service Insurance System)
  ph_id_prc:                 10,  // PRC (Professional Regulation Commission)
  ph_id_tin:                 10,  // TIN (Taxpayer Identification Number)
  ph_id_philhealth:          10,  // PhilHealth (Health Insurance)
  ph_id_nbi_clearance:       10,  // NBI Clearance
  ph_id_police_clearance:    10,  // Police Clearance (PNP)
  ph_id_psa_certificate:     10,  // PSA Certificate (Vital Records)
  ph_id_barangay_clearance:  10,  // Barangay Clearance
  ph_id_comelec_voter_id:    10,  // COMELEC Voter's ID

  email:            5,
  ph_mobile:        5,
  phone_intl:       5,
  ph_address:       5,
  source_code:      5,  // Source code blocks are significant-tier

  ipv4:             2,
  ipv6:             2,
  mac_address:      2,
  personal_label:   2,
  trigger_person_name: 2,
  trigger_age:         2,
  trigger_dob:         2,
  trigger_employer:    2,
  trigger_location:    2,
  trigger_religion:    2,  // Religion triggers are limited-tier

  trigger_health:      0,  // FIXED: Context indicator, not scored
  trigger_financial:   0,  // FIXED: Context indicator, not scored
  gazetteer_medical:   0,  // FIXED: Context indicator, not scored
  gazetteer_financial: 0,  // FIXED: Context indicator, not scored
  nlp_person_name:     2,  // PATH C linguistic
  nlp_job_title:       2,  // PATH C linguistic
  nlp_organization:    2,  // PATH C linguistic
};

// ── Entity tiers ──────────────────────────────────────────────────────────────

const ENTITY_TIER = {
  credit_card:      "critical",
  jwt:              "critical",
  api_key:          "critical",
  id_label:         "critical",

  // ── Philippine Government IDs (all critical tier) ────────────────────────
  ph_id_philid:              "critical",  // PhilID (PSA National ID)
  ph_id_drivers_license:     "critical",  // Driver's License (LTO)
  ph_id_passport:            "critical",  // Passport (BI)
  ph_id_umid:                "critical",  // UMID (Unified Multi-Purpose ID)
  ph_id_sss:                 "critical",  // SSS (Social Security System)
  ph_id_gsis:                "critical",  // GSIS (Government Service Insurance System)
  ph_id_prc:                 "critical",  // PRC (Professional Regulation Commission)
  ph_id_tin:                 "critical",  // TIN (Taxpayer Identification Number)
  ph_id_philhealth:          "critical",  // PhilHealth (Health Insurance)
  ph_id_nbi_clearance:       "critical",  // NBI Clearance
  ph_id_police_clearance:    "critical",  // Police Clearance (PNP)
  ph_id_psa_certificate:     "critical",  // PSA Certificate (Vital Records)
  ph_id_barangay_clearance:  "critical",  // Barangay Clearance
  ph_id_comelec_voter_id:    "critical",  // COMELEC Voter's ID

  email:            "significant",  // FIXED: Should be "significant", not "direct"
  ph_mobile:        "significant",  // FIXED: Should be "significant", not "direct"
  phone_intl:       "significant",  // FIXED: Should be "significant", not "direct"
  ph_address:       "significant",  // FIXED: Should be "significant", not "direct"
  source_code:      "significant",  // Source code is significant-tier

  ipv4:             "limited",
  ipv6:             "limited",
  mac_address:      "limited",
  personal_label:   "limited",
  trigger_person_name: "limited",
  trigger_age:         "limited",
  trigger_dob:         "limited",
  trigger_employer:    "limited",
  trigger_location:    "limited",
  trigger_religion:    "limited",  // Religion triggers are limited-tier
  trigger_health:      "contextual",
  trigger_financial:   "contextual",
  gazetteer_medical:   "contextual",
  gazetteer_financial: "contextual",
  nlp_person_name:     "limited",  // PATH C linguistic
  nlp_job_title:       "limited",  // PATH C linguistic
  nlp_organization:    "limited",  // PATH C linguistic
};

const SENSITIVE_CONTEXT_IDS = new Set([
  "gazetteer_medical",
  "gazetteer_financial",
  "trigger_health",
  "trigger_financial"
]);

const RISK_ORDER = { none: 0, low: 1, moderate: 2, high: 3 };

// ── STEP 2: Distinct entity-type multiplier ───────────────────────────────────

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
//
// Rules are evaluated in strict decision order (Table 12 of risk-scoring spec).
// Only the first matching rule determines the outcome — cascading if/else-if.
//
// Rule 1 — Critical Entity Escalation
//   Any validated critical entity → HIGH (regardless of preliminary score)
//
// Rule 2 — Sensitive Context Co-occurrence
//   Direct/critical entity + sensitive context indicator → raise preliminary by one level
//
// Rule 3 — Low-Impact Cap
//   ALL of the following must be true:
//     (a) every scored entity (BASE_SCORES > 0) has a base score of exactly 2
//     (b) at least one scored entity exists
//   Effect: cap final result at Moderate — prevents pure low-impact aggregation
//   from escalating to High through the multiplier alone.
//
// Note: non-scorable findings (source_code, context-only gazetteer hits with
// no base score) are excluded from the Rule 3 base-score check.

function evaluateGovernance(findings, preliminary) {

  // ── Rule 1: validated critical entity → HIGH ────────────────────────────
  const hasValidatedCritical = findings.some(
    f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true
  );
  if (hasValidatedCritical) {
    return { rule: "critical_entity", result: "high" };
  }

  // ── Rule 2: significant/critical entity + sensitive context → raise one level ─
  const hasDirectOrCritical = findings.some(
    f => ENTITY_TIER[f.patternId] === "critical" ||
         ENTITY_TIER[f.patternId] === "significant"  // FIXED: Should be "significant", not "direct"
  );
  const hasSensitiveContext = findings.some(
    f => SENSITIVE_CONTEXT_IDS.has(f.patternId)
  );
  if (hasDirectOrCritical && hasSensitiveContext) {
    const raised = RISK_ORDER[preliminary] < RISK_ORDER["high"]
      ? Object.keys(RISK_ORDER).find(k => RISK_ORDER[k] === RISK_ORDER[preliminary] + 1)
      : "high";
    return { rule: "sensitive_context", result: raised };
  }

  // ── Rule 3: Low-Impact Cap ───────────────────────────────────────────────
  // Condition: every *scored* entity (BASE_SCORES > 0) has a base score of
  // exactly 2, meaning no Moderate (5) or Critical (10) entity is present.
  const scoredFindings = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0);
  const hasAnyScoredEntity = scoredFindings.length > 0;
  const allLowImpact = scoredFindings.every(
    f => (BASE_SCORES[f.patternId] ?? 0) === 2
  );

  if (hasAnyScoredEntity && allLowImpact) {
    return { rule: "low_impact_cap", result: null };
  }

  // ── Rule 4: no governance rule applies → retain preliminary ─────────────
  return { rule: "none", result: null };
}

// ── STEP 5: Final classification ──────────────────────────────────────────────

function finalClass(preliminary, governance) {
  const { rule, result } = governance;

  if (rule === "critical_entity")   return "high";
  if (rule === "sensitive_context") return result;
  if (rule === "low_impact_cap") {
    return RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary;
  }
  return preliminary;
}

// ── Main scoring function ─────────────────────────────────────────────────────

function computeRiskScore(findings) {
  const scorable = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0);
  if (scorable.length === 0) return { score: 0, riskLevel: "none", governance: "none" };

  const seenTypes = new Set();
  let baseTotal   = 0;
  for (const f of scorable) {
    if (!seenTypes.has(f.patternId)) {
      seenTypes.add(f.patternId);
      baseTotal += BASE_SCORES[f.patternId] ?? 0;
    }
  }

  const distinctTypeCount = seenTypes.size;
  const multiplier        = getMultiplier(distinctTypeCount);
  const preScore          = baseTotal * multiplier;
  const preliminary       = preliminaryClass(preScore);
  const governance        = evaluateGovernance(findings, preliminary);
  const riskLevel         = finalClass(preliminary, governance);

  return {
    score:      Math.round(preScore * 100) / 100,
    riskLevel,
    governance: governance.rule
  };
}

// ── TASK-4.4: Placeholder suppression ────────────────────────────────────────
// Mirror of scanner.js suppressPlaceholders() — same logic, same result.

function suppressPlaceholders(findings) {
  const kept       = [];
  const suppressed = [];

  for (const f of findings) {
    if (isKnownPlaceholder(f.patternId, f.rawMatch)) {
      suppressed.push(f);
    } else {
      kept.push(f);
    }
  }

  if (suppressed.length > 0) {
    console.log(
      "[TrustPrompt/suppressed] placeholder findings removed (worker):",
      suppressed.map(f => `${f.patternId}:${f.rawMatch.slice(0, 20)}`).join(", ")
    );
  }

  return kept;
}

// ── PATH A — Regex (worker-safe) ──────────────────────────────────────────────
//
// TASK-4.5: Entropy pre-check — if pattern.minEntropy is set, extract the value
//   portion and check Shannon entropy. Reject if below threshold.
//
// TASK-4.6: structuralValidate hook — if pattern.structuralValidate is defined
//   and returns true for the raw match, set validated:true even though the full
//   mathematical validator (Luhn, RFC5322) is unavailable in the worker.
//   This enables governance Rule 1 (critical_entity → HIGH) for vendor-prefix
//   API keys in the worker path, fixing Known Issue #4 from review.md.
//
// TASK-4.3: JWT validation is now handled by validator-wrapper-worker.js
//   _isJWT() which does a structural decode check (base64url → JSON).

function runPathA(normalisedText) {
  const findings = [];
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    if (!pattern.regex) continue; // ph_mobile and any future regex-less patterns skip Path A
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = re.exec(normalisedText)) !== null) {
      const raw = match[0];

      // TASK-4.5: Entropy pre-check
      if (pattern.minEntropy !== undefined) {
        const valueMatch = raw.match(/[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{10,})["']?\s*$/)
                        || raw.match(/^([A-Za-z0-9\-_\.+\/=]{10,})$/);
        const valueStr = valueMatch ? valueMatch[1] : raw;
        if (shannonEntropy(valueStr) < pattern.minEntropy) {
          continue;
        }
      }

      const result = TrustValidatorWorker.validate(pattern.validate, raw);

      if (!result.passed) continue;

      // TASK-4.6: structuralValidate hook — override tier for vendor-prefix matches
      let validated = result.tier !== "3_regex_only";
      if (!validated && typeof pattern.structuralValidate === "function") {
        if (pattern.structuralValidate(raw)) {
          validated = true;
        }
      }

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

function mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings) {
  const seen = new Map();
  for (const f of [...pathAFindings, ...pathBFindings, ...pathCFindings]) {
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
  
  // PATH C with safe fallback if TrustLinguisticDetector is unavailable
  let pathCFindings = [];
  if (typeof TrustLinguisticDetector !== 'undefined' && TrustLinguisticDetector && typeof TrustLinguisticDetector.scan === 'function') {
    try {
      pathCFindings = TrustLinguisticDetector.scan(textNLP);
    } catch (pathCError) {
      console.error("[TrustPrompt/worker] PATH C error:", pathCError);
      pathCFindings = [];
    }
  }
  
  const merged        = mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings);
  const findings      = suppressPlaceholders(merged);  // TASK-4.4

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
