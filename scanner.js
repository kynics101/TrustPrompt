// scanner.js — TrustPrompt main-thread scan pipeline + risk scoring engine
//
// Framework basis:
//   NIST SP 800-122  — qualitative impact levels (Low / Moderate / High)
//   RA 10173         — PI, SPI, identifiability from information alone or together
//   Researcher-defined rules — operational scoring, escalation, ceiling, response logic
//                              (must be calibrated and reported transparently)
//
// Flow (RAE 5-step model):
//   rawText
//     → normalise
//     → Path A (regex + validator) + Path B (gazetteer)
//     → merge / dedupe
//     → Step 1: base score per distinct entity type
//     → Step 2: distinct entity-type multiplier
//     → Step 3: preliminary classification
//     → Step 4: governance rule evaluation
//     → Step 5: final risk classification

/* global TrustNormalizer, TRUSTPROMPT_PATTERNS, TrustValidator, TrustGazetteer */

const TrustScanner = (() => {

  const RISK_ORDER = { none: 0, low: 1, moderate: 2, high: 3 };

  // ── STEP 1: Entity classification & base scores ───────────────────────────
  //
  // THREE impact tiers (NIST SP 800-122 aligned, RA 10173 SPI/PI classification):
  //
  //   CRITICAL / ACCESS-CRITICAL INFORMATION   → 10
  //     Government-issued ID; complete card/bank identifier;
  //     API key; token; JWT; private key
  //
  //   DIRECT PERSONAL IDENTIFIERS              → 5
  //     Email address; mobile number; complete physical address;
  //     personally linked network identifier (NOT IP/MAC — see below)
  //
  //   CONTEXTUAL INDICATORS                    → 2
  //     Job title / department; IP address; MAC address; personal name;
  //     organisation; trigger phrases; gazetteer terms
  //
  //   SOURCE CODE (container)                  → 0
  //     Not scored. Credentials / PI found inside are scored normally.
  //
  // NOTE on IP & MAC:
  //   The proposed model places IP & MAC in the LOW-IMPACT / CONTEXTUAL tier
  //   (score 2). They contribute to identification only in combination with
  //   other entities and do not independently justify High severity.
  //
  // NOTE on id_label vs personal_label:
  //   Government-issued ID field labels (TIN, SSS, Passport, etc.) → critical (10)
  //   Generic personal field labels (name, age, civil status, etc.) → contextual (2)

  const BASE_SCORES = {
    // ── Critical / access-critical (score 10) ────────────────────────────
    credit_card:      10,
    jwt:              10,
    api_key:          10,
    // password_inline:  10,
    id_label:         10,   // government-issued ID field (TIN, SSS, Passport…)

    // ── Direct personal identifiers (score 5) ────────────────────────────
    email:            5,
    ph_mobile:        5,
    phone_intl:       5,
    ph_address:       5,

    // ── Contextual indicators (score 2) ──────────────────────────────────
    // IP & MAC moved from direct (5) → contextual (2) per proposed model
    ipv4:             2,
    ipv6:             2,
    mac_address:      2,

    personal_label:   2,   // generic personal field (name, age, etc.)

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

    // ── Container (score 0) ───────────────────────────────────────────────
    source_code: 0
  };

  // Entity tier — used by governance rules
  const ENTITY_TIER = {
    // Critical
    credit_card:      "critical",
    jwt:              "critical",
    api_key:          "critical",
    // password_inline:  "critical",
    id_label:         "critical",

    // Direct personal identifiers
    email:            "direct",
    ph_mobile:        "direct",
    phone_intl:       "direct",
    ph_address:       "direct",

    // Contextual indicators (IP/MAC now here, not "direct")
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

    // Container
    source_code: "container"
  };

  // Sensitive-context terms used by the co-occurrence governance rule
  const SENSITIVE_CONTEXT_IDS = new Set([
    "gazetteer_medical",
    // "gazetteer_legal",
    "gazetteer_financial",
    "trigger_health",
    "trigger_financial"
  ]);

  // ── STEP 2: Distinct entity-type multiplier ───────────────────────────────
  //
  // Reflects RA 10173 Sec. 3(g): identifiability from information put together.
  // Counts distinct entity TYPES (not repeated occurrences of the same type).
  // Container types (source_code) excluded from the count.
  // Capped at ×2.00 — high-consequence cases handled by governance rules.

  function getMultiplier(distinctTypeCount) {
    if (distinctTypeCount >= 5) return 2.00;
    if (distinctTypeCount === 4) return 1.70;
    if (distinctTypeCount === 3) return 1.40;
    if (distinctTypeCount === 2) return 1.20;
    return 1.00; // 1 type
  }

  // ── STEP 3: Preliminary classification ───────────────────────────────────
  //   LOW      2.00 – 4.99   contextual disclosure only
  //   MODERATE 5.00 – 9.99   limited direct personal disclosure
  //   HIGH     10.00+         critical information / breadth / bulk disclosure

  function preliminaryClass(score) {
    if (score >= 10) return "high";
    if (score >= 5)  return "moderate";
    if (score >= 2)  return "low";
    return "none";
  }

  // ── STEP 4: Governance rule evaluation ───────────────────────────────────


  // Decision order:
  //   1. Strongly validated critical-entity rule → ESCALATE TO HIGH
  //   2. Sensitive-context co-occurrence rule    → RAISE +1 LEVEL (capped at high)
  //   3. Contextual-only ceiling                 → CANNOT EXCEED MODERATE
  //   4. No rule fires                           → RETAIN preliminary
  //

  function evaluateGovernance(findings, preliminary) {
    // Partition findings by tier
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

    // Rule 1 — Strongly validated critical entity → HIGH
    // Format-only matches (validated: false) do not qualify
    if (hasValidatedCritical) {
      return { rule: "critical_entity", result: "high" };
    }

    // Rule 2 — Sensitive-context co-occurrence → raise preliminary by +1
    // Requires at least one valid personal (direct or critical) entity
    // plus one or more non-scoring medical / legal / financial context term
    if (hasDirectOrCritical && hasSensitiveContext) {
      const raised = RISK_ORDER[preliminary] < RISK_ORDER["high"]
        ? Object.keys(RISK_ORDER).find(k => RISK_ORDER[k] === RISK_ORDER[preliminary] + 1)
        : "high";
      return { rule: "sensitive_context", result: raised };
    }

    // Rule 3 — Contextual-only ceiling → cannot exceed MODERATE
    if (allContextualOrContainer && findings.some(
      f => ENTITY_TIER[f.patternId] === "contextual")
    ) {
      return { rule: "contextual_ceiling", result: null }; // ceiling applied in Step 5
    }

    return { rule: "none", result: null };
  }

  // ── STEP 5: Final classification ─────────────────────────────────────────
  //
  // final severity level = min[ max(preliminary, high_escalation,
  //                               sensitive_context), ceiling ]
  //
  // Governance always takes precedence.

  function finalClass(preliminary, governance) {
    const { rule, result } = governance;

    if (rule === "critical_entity") {
      return "high"; // absolute escalation
    }

    if (rule === "sensitive_context") {
      // +1 level already computed in evaluateGovernance, capped at high
      return result;
    }

    if (rule === "contextual_ceiling") {
      // Cannot exceed moderate
      return RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary;
    }

    // No governance rule — retain preliminary
    return preliminary;
  }

  // ── Main scoring function ─────────────────────────────────────────────────

  function computeRiskScore(findings) {
    // Exclude zero-score containers from scoring
    const scorable = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0);
    if (scorable.length === 0) return { score: 0, riskLevel: "none", governance: "none" };

    // Step 1: sum base scores per distinct entity type (deduplicate by type)
    const seenTypes = new Set();
    let baseTotal   = 0;
    for (const f of scorable) {
      if (!seenTypes.has(f.patternId)) {
        seenTypes.add(f.patternId);
        baseTotal += BASE_SCORES[f.patternId] ?? 0;
      }
    }

    // Step 2: distinct entity-type breadth multiplier
    const distinctTypeCount = seenTypes.size;
    const multiplier        = getMultiplier(distinctTypeCount);
    const preScore          = baseTotal * multiplier;

    // Step 3: preliminary
    const preliminary = preliminaryClass(preScore);

    // Step 4: governance
    const governance = evaluateGovernance(findings, preliminary);

    // Step 5: final
    const riskLevel = finalClass(preliminary, governance);

    console.log(
      `[TrustPrompt/scorer] base:${baseTotal} ×${multiplier} = ${preScore.toFixed(2)}`,
      `| prelim:${preliminary} | gov:${governance.rule}(${governance.result})`,
      `| final:${riskLevel}`
    );

    return {
      score:      Math.round(preScore * 100) / 100,
      riskLevel,
      governance: governance.rule
    };
  }

  // ── PATH A — regex + validator.js ────────────────────────────────────────
  //
  // Each finding receives a `validated` boolean:
  //   true  — passed TrustValidator.validate() (mathematical confirmation)
  //   false — regex matched but failed validator (format-only candidate)
  //
  // Gap 2 fix: `validated` flag is used by the critical-entity governance
  // rule to exclude format-only matches from escalation.

  function runPathA(normalisedText) {
    const findings = [];
    for (const pattern of TRUSTPROMPT_PATTERNS) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = re.exec(normalisedText)) !== null) {
        const raw       = match[0];
        const validated = TrustValidator.validate(pattern.validate, raw);
        if (!validated) continue; // reject format-only matches from path A
        findings.push({
          patternId:   pattern.id,
          label:       pattern.label,
          risk:        pattern.risk,
          rawMatch:    raw,
          safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
          validated:   true, // passed validator
          source:      "A_regex"
        });
      }
    }
    return findings;
  }

  // ── Merge + deduplicate ───────────────────────────────────────────────────

  function mergeAndDedupe(pathA, pathB) {
    const seen = new Map();
    for (const f of [...pathA, ...pathB]) {
      const key = f.rawMatch.trim().toLowerCase();
      const ex  = seen.get(key);
      if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) seen.set(key, f);
    }
    return [...seen.values()];
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function scan(rawText) {
    if (!rawText || !rawText.trim()) {
      return { findings: [], riskLevel: "none", score: 0,
               governance: "none", normalisedText: "", wasCapsConverted: false };
    }
    const { masked, textRegex, textNLP, wasCapsConverted } =
      TrustNormalizer.normalize(rawText);

    const pathAFindings = runPathA(textRegex);
    const pathBFindings = TrustGazetteer.scan(textNLP);
    const findings      = mergeAndDedupe(pathAFindings, pathBFindings);
    const { score, riskLevel, governance } = computeRiskScore(findings);

    console.log(
      "[TrustPrompt/scanner] risk:", riskLevel, `score:${score}`,
      "| findings:", findings.length,
      `(A:${pathAFindings.length} B:${pathBFindings.length})`,
      wasCapsConverted ? "| CAPS→sentenceCase" : ""
    );

    return { findings, riskLevel, score, governance, normalisedText: masked, wasCapsConverted };
  }

  // Expose computeRiskScore so trust-worker.js can import and reuse it
  return { scan, computeRiskScore, BASE_SCORES, ENTITY_TIER, SENSITIVE_CONTEXT_IDS };

})();
