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

/* global TrustNormalizer, TRUSTPROMPT_PATTERNS, TrustValidator, TrustGazetteer, TrustLinguisticDetector */
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
    nlp_person_name:     2,  // PATH C linguistic
    nlp_job_title:       2,  // PATH C linguistic
    nlp_organization:    2,  // PATH C linguistic

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
    nlp_person_name:     "contextual",  // PATH C linguistic
    nlp_job_title:       "contextual",  // PATH C linguistic
    nlp_organization:    "contextual",  // PATH C linguistic

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

  // ── Context-aware filtering helper ──────────────────────────────────────────
  // TASK-4.7: Rejects matches that appear in measurement/unit contexts
  // This prevents false positives like "0909835056 grams" being flagged as a phone number.
  // Checks the original text around the match position for unit keywords.

  function isMeasurementContext(rawMatch, fullText, matchIndex) {
    // Measurement unit keywords that commonly follow numeric values
    const unitPatterns = [
      /\b(grams?|ounces?|pounds?|kilograms?|kg|lb|oz)\b/i,
      /\b(milliliters?|liters?|ml|l|gallons?|cups?|tablespoons?|teaspoons?)\b/i,
      /\b(meters?|kilometers?|miles?|feet|yards?|inches?|cm|mm|km|mi)\b/i,
      /\b(seconds?|minutes?|hours?|days?|weeks?|months?|years?|ms|sec|min|hr)\b/i,
      /\b(watts?|volts?|amperes?|hertz|Hz|MHz|GHz|W|V|A)\b/i,
      /\b(celsius|fahrenheit|degrees?|°C|°F)\b/i,
      /\b(bytes?|kilobytes?|megabytes?|gigabytes?|kb|mb|gb|bits?)\b/i,
      /\b(rpm|mph|kph|m\/s|km\/h)\b/i,
    ];

    // Look ahead after the match (up to 50 characters)
    const startLookahead = matchIndex + rawMatch.length;
    const lookahead = fullText.slice(startLookahead, startLookahead + 50);
    
    // Check if any unit pattern matches the lookahead
    if (unitPatterns.some(pattern => pattern.test(lookahead))) {
      return true;
    }

    return false;
  }

  // ── PATH A — regex + validator.js ────────────────────────────────────────
  //
  // TASK-4.5: Added entropy pre-check — if pattern.minEntropy is set, the
  //   extracted value must meet the minimum Shannon entropy threshold or the
  //   match is discarded before the validator step.
  //
  // TASK-4.7: Added context-aware filtering — for phone numbers, rejects matches
  //   that appear immediately before measurement units (e.g., "0909835056 grams").
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
        const matchIndex = match.index;

        // TASK-4.7: Context-aware filtering for phone numbers
        if (pattern.id === "phone_intl" && isMeasurementContext(raw, normalisedText, matchIndex)) {
          console.log(`[TrustPrompt/context] rejected measurement context: ${raw.slice(0, 30)} grams/unit`);
          continue;
        }

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

  // ── Merge + deduplicate ───────────────────────────────────────────────────────
  //
  // Merges findings from all three paths (A: regex, B: gazetteer, C: linguistic).
  // When the same rawMatch appears in multiple paths, the finding with the highest
  // risk level is preserved (highest RISK_ORDER value wins).

  function mergeAndDedupe(pathA, pathB, pathC) {
    const seen = new Map();
    for (const f of [...pathA, ...pathB, ...pathC]) {
      const key = f.rawMatch.trim().toLowerCase();
      const ex  = seen.get(key);
      if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) seen.set(key, f);
    }
    return [...seen.values()];
  }

  // ── Public API ────────────────────────────────────────────────────────────
  //
  // Three-path architecture:
  //   PATH A (regex + validator.js) — runs on textRegex view
  //   PATH B (gazetteer + trigger phrases) — runs on textNLP view
  //   PATH C (linguistic NER/POS) — runs on textNLP view in parallel with PATH B
  //
  // After all paths complete, findings are merged and deduplicated (highest risk wins).
  // The normalized textNLP view is prepared specifically for linguistic analysis:
  // sentence case estimated, whitespace normalized, punctuation standardized.

  function scan(rawText) {
    console.log("[TrustPrompt/scanner] SCAN START - input:", rawText.substring(0, 50));
    
    if (!rawText || !rawText.trim()) {
      console.log("[TrustPrompt/scanner] Empty text - returning empty findings");
      return { findings: [], riskLevel: "none", score: 0,
               governance: "none", normalisedText: "", wasCapsConverted: false };
    }
    
    console.log("[TrustPrompt/scanner] Normalizing...");
    const { masked, textRegex, textNLP, wasCapsConverted } =
      TrustNormalizer.normalize(rawText);
    
    console.log("[TrustPrompt/scanner] Running PATH A (regex)...");
    const pathAFindings = runPathA(textRegex);
    console.log("[TrustPrompt/scanner] PATH A findings:", pathAFindings.length);
    
    // PATH B and PATH C execute in parallel on the same textNLP input
    console.log("[TrustPrompt/scanner] Running PATH B (gazetteer)...");
    const pathBFindings = TrustGazetteer.scan(textNLP);
    console.log("[TrustPrompt/scanner] PATH B findings:", pathBFindings.length);
    
    // ========== DIAGNOSTIC LOGGING ==========
    console.log("[DIAGNOSTIC] TrustLinguisticDetector type:", typeof TrustLinguisticDetector);
    console.log("[DIAGNOSTIC] TrustLinguisticDetector available:", !!TrustLinguisticDetector);
    console.log("[DIAGNOSTIC] Text to scan:", textNLP.substring(0, 100));
    // =========================================
    
    // PATH C with safe fallback if TrustLinguisticDetector is unavailable
    let pathCFindings = [];
    if (typeof TrustLinguisticDetector !== 'undefined' && TrustLinguisticDetector && typeof TrustLinguisticDetector.scan === 'function') {
      try {
        console.log("[DIAGNOSTIC] Calling TrustLinguisticDetector.scan()...");
        pathCFindings = TrustLinguisticDetector.scan(textNLP);
        console.log("[DIAGNOSTIC] PATH C returned:", pathCFindings.length, "findings");
        for (let i = 0; i < pathCFindings.length; i++) {
          console.log(`  [${i}]`, pathCFindings[i].patternId, ":", pathCFindings[i].rawMatch);
        }
      } catch (pathCError) {
        console.error("[TrustPrompt/scanner] PATH C error:", pathCError);
        console.log("[DIAGNOSTIC] PATH C crashed");
        pathCFindings = [];
      }
    } else {
      console.warn("[TrustPrompt/scanner] TrustLinguisticDetector not available - PATH C skipped");
      console.log("[DIAGNOSTIC] PATH C not available");
    }
    
    const merged        = mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings);
    const findings      = suppressPlaceholders(merged);  // TASK-4.4
    const { score, riskLevel, governance } = computeRiskScore(findings);

    console.log(
      "[TrustPrompt/scanner] risk:", riskLevel, `score:${score}`,
      "| findings:", findings.length,
      `(A:${pathAFindings.length} B:${pathBFindings.length} C:${pathCFindings.length})`,
      wasCapsConverted ? "| CAPS→sentenceCase" : ""
    );

    return { findings, riskLevel, score, governance, normalisedText: masked, wasCapsConverted };
  }

  return { scan, computeRiskScore, BASE_SCORES, ENTITY_TIER, SENSITIVE_CONTEXT_IDS };

})();
