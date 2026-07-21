// scanner.js — TrustPrompt main-thread scan pipeline + risk scoring engine
// Framework basis: NIST SP 800-122 (qualitative impact levels) +
//                  RA 10173 (SPI/PI classification) +
//                  Researcher-defined operational scoring rules
//
// Flow: rawText → normalise → Path A (regex+validator) → Path B (gazetteer)
//       → merge/dedupe → Step1 base scores → Step2 multiplier
//       → Step3 preliminary → Step4 governance → Step5 final

/* global TrustNormalizer, TRUSTPROMPT_PATTERNS, TrustValidator, TrustGazetteer */

const TrustScanner = (() => {

  const RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3 };

  // ── STEP 1: Entity classification & base scores ───────────────────────────
  // Three impact tiers (NIST SP 800-122 aligned):
  //   CRITICAL / ACCESS-CRITICAL  → 10
  //   DIRECT PERSONAL IDENTIFIER  → 5
  //   CONTEXTUAL INDICATOR        → 2
  // Source code = 0 (container only; credentials inside scored normally)

  const BASE_SCORES = {
    // Critical / access-critical (score 10)
    credit_card:      10,
    jwt:              10,
    api_key:          10,
    password_inline:  10,
    // context_label scores depend on what label it is — treated as direct (5)
    // because it explicitly names a field like "Passport No:" or "SSS:"
    context_label:    5,

    // Direct personal identifiers (score 5)
    email:            5,
    ph_mobile:        5,
    phone_intl:       5,
    ph_address:       5,
    ipv4:             5,   // personally linked network identifier
    ipv6:             5,
    mac_address:      5,

    // Contextual indicators (score 2)
    trigger_person_name: 2,
    trigger_age:         2,
    trigger_dob:         2,
    trigger_employer:    2,
    trigger_religion:    2,
    gazetteer_nationality_religion: 2,

    // Contextual-but-sensitive (score 2, governance may escalate)
    trigger_location:    2,
    trigger_health:      2,
    trigger_financial:   2,
    gazetteer_medical:   2,
    gazetteer_financial: 2,
    gazetteer_legal:     2,

    // Source code — no score (container; inner credentials scored if found)
    source_code: 0
  };

  // Entity tier classification — used by governance rules
  const ENTITY_TIER = {
    credit_card:      "critical",
    jwt:              "critical",
    api_key:          "critical",
    password_inline:  "critical",
    context_label:    "direct",

    email:            "direct",
    ph_mobile:        "direct",
    phone_intl:       "direct",
    ph_address:       "direct",
    ipv4:             "direct",
    ipv6:             "direct",
    mac_address:      "direct",

    trigger_person_name: "contextual",
    trigger_age:         "contextual",
    trigger_dob:         "contextual",
    trigger_employer:    "contextual",
    trigger_religion:    "contextual",
    trigger_location:    "contextual",
    trigger_health:      "contextual",
    trigger_financial:   "contextual",
    gazetteer_nationality_religion: "contextual",
    gazetteer_medical:   "contextual",
    gazetteer_financial: "contextual",
    gazetteer_legal:     "contextual",
    source_code:         "container"
  };

  // ── STEP 2: Distinct entity-type multiplier ───────────────────────────────
  // Reflects RA 10173 Sec. 3(g): identifiability from information put together.
  // Counts distinct entity TYPES (not occurrences of the same type).
  // Container types (source_code) excluded from count.

  function getMultiplier(distinctTypeCount) {
    if (distinctTypeCount <= 1) return 1.00;
    if (distinctTypeCount === 2) return 1.20;
    if (distinctTypeCount === 3) return 1.40;
    if (distinctTypeCount === 4) return 1.70;
    return 2.00; // 5 or more
  }

  // ── STEP 3: Preliminary classification ───────────────────────────────────
  //   LOW      2.00 – 4.99
  //   MODERATE 5.00 – 9.99
  //   HIGH     10.00+

  function preliminaryClass(score) {
    if (score >= 10)  return "high";
    if (score >= 5)   return "medium";
    if (score >= 2)   return "low";
    return "none";
  }

  // ── STEP 4: Governance rule evaluation ───────────────────────────────────
  // Rules checked after preliminary classification.
  // Returns the governance-mandated floor, or "none" if no rule fires.

  function evaluateGovernance(findings, distinctTypes) {
    const tiers = findings.map(f => ENTITY_TIER[f.patternId] || "contextual");

    const hasCritical  = tiers.includes("critical");
    const directCount  = new Set(
      findings.filter(f => ENTITY_TIER[f.patternId] === "direct").map(f => f.patternId)
    ).size;
    const contextCount = new Set(
      findings.filter(f => ENTITY_TIER[f.patternId] === "contextual").map(f => f.patternId)
    ).size;
    const allContextual = tiers.every(t => t === "contextual" || t === "container");

    // Rule 1: Strongly validated critical entity → HIGH
    if (hasCritical) return "high";

    // Rule 2: 2+ distinct direct personal identifier types → HIGH
    if (directCount >= 2) return "high";

    // Rule 3: 1+ direct identifier + 2+ contextual types → HIGH
    if (directCount >= 1 && contextCount >= 2) return "high";

    // Rule 4: Embedded secret in source code → HIGH
    const hasSourceCode = findings.some(f => f.patternId === "source_code");
    if (hasSourceCode && hasCritical) return "high";

    // Rule 5: Bulk disclosure (multiple persons) — heuristic: 3+ direct types
    if (directCount >= 3) return "high";

    // Rule 6: Contextual-only ceiling → cannot exceed MODERATE
    if (allContextual && contextCount > 0) return "medium_ceiling";

    // Rule 7: Sensitive-context co-occurrence — a person name + medical/legal
    // contextual term together warrants at least Moderate
    const hasPersonName = findings.some(f => f.patternId === "trigger_person_name");
    const hasSensitiveContext = findings.some(f =>
      ["gazetteer_medical","gazetteer_legal","trigger_health","gazetteer_financial"].includes(f.patternId)
    );
    if (hasPersonName && hasSensitiveContext) return "medium_floor";

    return "none";
  }

  // ── STEP 5: Final classification ─────────────────────────────────────────
  // Final = Max(preliminary, governance)
  // Special: "medium_ceiling" means HIGH is blocked — cap at medium

  function finalClass(preliminary, governance, preScore) {
    if (governance === "high")           return "high";
    if (governance === "medium_ceiling") {
      return RISK_ORDER[preliminary] >= RISK_ORDER["medium"] ? "medium" : preliminary;
    }
    if (governance === "medium_floor") {
      return RISK_ORDER[preliminary] >= RISK_ORDER["medium"] ? preliminary : "medium";
    }
    return preliminary;
  }

  // ── Main scoring function ─────────────────────────────────────────────────

  function computeRiskScore(findings) {
    // Filter out zero-score containers for scoring
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

    // Step 2: multiply by distinct-type breadth multiplier
    const distinctTypeCount = seenTypes.size;
    const multiplier        = getMultiplier(distinctTypeCount);
    const preScore          = baseTotal * multiplier;

    // Step 3: preliminary
    const preliminary = preliminaryClass(preScore);

    // Step 4: governance
    const governance  = evaluateGovernance(findings, distinctTypeCount);

    // Step 5: final
    const riskLevel = finalClass(preliminary, governance, preScore);

    console.log(
      `[TrustPrompt/scorer] base:${baseTotal} × ${multiplier} = ${preScore.toFixed(2)}`,
      `| prelim:${preliminary} | gov:${governance} | final:${riskLevel}`
    );

    return { score: Math.round(preScore * 100) / 100, riskLevel, governance };
  }

  // ── PATH A — regex + validator.js ────────────────────────────────────────

  function runPathA(normalisedText) {
    const findings = [];
    for (const pattern of TRUSTPROMPT_PATTERNS) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = re.exec(normalisedText)) !== null) {
        const raw = match[0];
        if (!TrustValidator.validate(pattern.validate, raw)) continue;
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
               normalisedText: "", wasCapsConverted: false };
    }
    const { text: normalisedText, wasCapsConverted } = TrustNormalizer.normalize(rawText);
    const pathAFindings = runPathA(normalisedText);
    const pathBFindings = TrustGazetteer.scan(normalisedText);
    const findings      = mergeAndDedupe(pathAFindings, pathBFindings);
    const { score, riskLevel, governance } = computeRiskScore(findings);

    console.log(
      "[TrustPrompt/scanner] risk:", riskLevel, `score:${score}`,
      "| findings:", findings.length,
      `(A:${pathAFindings.length} B:${pathBFindings.length})`,
      wasCapsConverted ? "| CAPS→sentenceCase" : ""
    );

    return { findings, riskLevel, score, governance, normalisedText, wasCapsConverted };
  }

  return { scan };

})();
