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
//     → suppressPlaceholders (TASK-4.4)
//     → Step 1: base score per distinct entity type
//     → Step 2: distinct entity-type multiplier
//     → Step 3: preliminary classification
//     → Step 4: governance rule evaluation
//     → Step 5: final risk classification

/* global TrustNormalizer, TRUSTPROMPT_PATTERNS, TrustValidator, TrustGazetteer */
/* global shannonEntropy, isKnownPlaceholder, PLACEHOLDER_PATTERNS */

const TrustScanner = (() => {

  const RISK_ORDER = { none: 0, low: 1, moderate: 2, high: 3 };

  // ── STEP 1: Entity classification & base scores ───────────────────────────

  const BASE_SCORES = {
    // ── Critical / access-critical (score 10) ────────────────────────────
    credit_card:      10,
    jwt:              10,
    api_key:          10,
    // password_inline:  10,
    id_label:         10,

    // ── Direct personal identifiers (score 5) ────────────────────────────
    email:            5,
    ph_mobile:        5,
    phone_intl:       5,
    ph_address:       5,

    // ── Contextual indicators (score 2) ──────────────────────────────────
    ipv4:             2,
    ipv6:             2,
    mac_address:      2,
    personal_label:   2,
    trigger_person_name: 2,
    trigger_age:         2,
    trigger_dob:         2,
    trigger_employer:    2,
    trigger_location:    2,
    trigger_health:      2,
    trigger_financial:   2,
    gazetteer_medical:   2,
    gazetteer_financial: 2,

    // ── Container (score 0) ───────────────────────────────────────────────
    source_code: 0
  };

  const ENTITY_TIER = {
    credit_card:      "critical",
    jwt:              "critical",
    api_key:          "critical",
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
    trigger_location:    "contextual",
    trigger_health:      "contextual",
    trigger_financial:   "contextual",
    gazetteer_medical:   "contextual",
    gazetteer_financial: "contextual",

    source_code: "container"
  };

  const SENSITIVE_CONTEXT_IDS = new Set([
    "gazetteer_medical",
    "gazetteer_financial",
    "trigger_health",
    "trigger_financial"
  ]);

  // ── STEP 2: Distinct entity-type multiplier ───────────────────────────────

  function getMultiplier(distinctTypeCount) {
    if (distinctTypeCount >= 5) return 2.00;
    if (distinctTypeCount === 4) return 1.70;
    if (distinctTypeCount === 3) return 1.40;
    if (distinctTypeCount === 2) return 1.20;
    return 1.00;
  }

  // ── STEP 3: Preliminary classification ───────────────────────────────────

  function preliminaryClass(score) {
    if (score >= 10) return "high";
    if (score >= 5)  return "moderate";
    if (score >= 2)  return "low";
    return "none";
  }

  // ── STEP 4: Governance rule evaluation ───────────────────────────────────

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

    if (hasValidatedCritical) {
      return { rule: "critical_entity", result: "high" };
    }

    if (hasDirectOrCritical && hasSensitiveContext) {
      const raised = RISK_ORDER[preliminary] < RISK_ORDER["high"]
        ? Object.keys(RISK_ORDER).find(k => RISK_ORDER[k] === RISK_ORDER[preliminary] + 1)
        : "high";
      return { rule: "sensitive_context", result: raised };
    }

    if (allContextualOrContainer && findings.some(
      f => ENTITY_TIER[f.patternId] === "contextual")
    ) {
      return { rule: "contextual_ceiling", result: null };
    }

    return { rule: "none", result: null };
  }

  // ── STEP 5: Final classification ─────────────────────────────────────────

  function finalClass(preliminary, governance) {
    const { rule, result } = governance;

    if (rule === "critical_entity") {
      return "high";
    }

    if (rule === "sensitive_context") {
      return result;
    }

    if (rule === "contextual_ceiling") {
      return RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary;
    }

    return preliminary;
  }

  // ── Main scoring function ─────────────────────────────────────────────────

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

  // ── TASK-4.4: Placeholder suppression ────────────────────────────────────
  //
  // Removes findings whose rawMatch is a known placeholder value or matches
  // a structural placeholder pattern. Suppressed findings are logged to the
  // console but never shown to the user.
  //
  // Called after mergeAndDedupe() and before computeRiskScore().

  function suppressPlaceholders(findings) {
    const kept      = [];
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
        "[TrustPrompt/suppressed] placeholder findings removed:",
        suppressed.map(f => `${f.patternId}:${f.rawMatch.slice(0, 20)}`).join(", ")
      );
    }

    return kept;
  }

  // ── PATH A — regex + validator.js ────────────────────────────────────────
  //
  // TASK-4.5: Added entropy pre-check — if pattern.minEntropy is set, the
  //   extracted value must meet the minimum Shannon entropy threshold or the
  //   match is discarded before the validator step.
  //
  // Each finding receives a `validated` boolean:
  //   true  — passed TrustValidator.validate() (mathematical confirmation)
  //   false — regex matched but failed validator (format-only candidate)

  function runPathA(normalisedText) {
    const findings = [];
    for (const pattern of TRUSTPROMPT_PATTERNS) {
      if (!pattern.regex) continue; // ph_mobile and any future regex-less patterns skip Path A
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = re.exec(normalisedText)) !== null) {
        const raw = match[0];

        // TASK-4.5: Entropy pre-check — reject low-entropy dummy values
        if (pattern.minEntropy !== undefined) {
          // Extract the value portion (after any label=... prefix) for entropy check
          const valueMatch = raw.match(/[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{10,})["']?\s*$/)
                          || raw.match(/^([A-Za-z0-9\-_\.+\/=]{10,})$/);
          const valueStr = valueMatch ? valueMatch[1] : raw;
          if (shannonEntropy(valueStr) < pattern.minEntropy) {
            console.log(`[TrustPrompt/entropy] rejected low-entropy match: ${raw.slice(0, 30)}`);
            continue;
          }
        }

        const validated = TrustValidator.validate(pattern.validate, raw);
        if (!validated) continue;

        findings.push({
          patternId:   pattern.id,
          label:       pattern.label,
          risk:        pattern.risk,
          rawMatch:    raw,
          safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
          validated:   true,
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
    const merged        = mergeAndDedupe(pathAFindings, pathBFindings);
    const findings      = suppressPlaceholders(merged);  // TASK-4.4
    const { score, riskLevel, governance } = computeRiskScore(findings);

    console.log(
      "[TrustPrompt/scanner] risk:", riskLevel, `score:${score}`,
      "| findings:", findings.length,
      `(A:${pathAFindings.length} B:${pathBFindings.length})`,
      wasCapsConverted ? "| CAPS→sentenceCase" : ""
    );

    return { findings, riskLevel, score, governance, normalisedText: masked, wasCapsConverted };
  }

  return { scan, computeRiskScore, BASE_SCORES, ENTITY_TIER, SENSITIVE_CONTEXT_IDS };

})();
