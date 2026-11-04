/**
 * tests/unit/scoring.test.js
 *
 * Unit tests for the TrustPrompt Risk Assessment Engine (RAE) scoring pipeline.
 *
 * Tests the scoring functions directly via global.TP.engine, which exposes the
 * internal functions from trust-worker.js without going through the full scan
 * pipeline.  This keeps tests fast and deterministic.
 *
 * Coverage:
 *   - getMultiplier()       – Table 12 (RA 10173 §3(g))
 *   - preliminaryClass()    – Table 13 thresholds
 *   - evaluateGovernance()  – Rules 1, 2, 3, 4 (Table 15)
 *   - finalClass()          – Rule outcomes map to correct final level
 *   - computeRiskScore()    – End-to-end scoring from a findings array
 */

"use strict";

// Engine functions are exposed by the setupFile via global.TP.engine
const {
  getMultiplier,
  preliminaryClass,
  evaluateGovernance,
  finalClass,
  computeRiskScore,
  BASE_SCORES,
  SENSITIVE_CONTEXT_IDS,
} = global.TP.engine;

// ─── Helpers to build synthetic finding objects ──────────────────────────────

function finding(patternId, { validated = false, rawMatch = "TEST_VALUE" } = {}) {
  return { patternId, rawMatch, validated, risk: "high" };
}

// ─────────────────────────────────────────────────────────────────────────────
// getMultiplier — Table 12
// ─────────────────────────────────────────────────────────────────────────────

describe("getMultiplier (Table 12)", () => {
  test("1 distinct type → ×1.00", () => {
    expect(getMultiplier(1)).toBe(1.00);
  });
  test("2 distinct types → ×1.20", () => {
    expect(getMultiplier(2)).toBe(1.20);
  });
  test("3 distinct types → ×1.40", () => {
    expect(getMultiplier(3)).toBe(1.40);
  });
  test("4 distinct types → ×1.70", () => {
    expect(getMultiplier(4)).toBe(1.70);
  });
  test("5 distinct types → ×2.00", () => {
    expect(getMultiplier(5)).toBe(2.00);
  });
  test("6 distinct types → ×2.00 (5+ ceiling)", () => {
    expect(getMultiplier(6)).toBe(2.00);
  });
  test("0 distinct types → ×1.00 (edge — no score anyway)", () => {
    expect(getMultiplier(0)).toBe(1.00);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// preliminaryClass — Table 13 thresholds
// ─────────────────────────────────────────────────────────────────────────────

describe("preliminaryClass (Table 13)", () => {
  test("score 0 → none", () => {
    expect(preliminaryClass(0)).toBe("none");
  });
  test("score 2 → low (boundary)", () => {
    expect(preliminaryClass(2)).toBe("low");
  });
  test("score 4.99 → low (boundary)", () => {
    expect(preliminaryClass(4.99)).toBe("low");
  });
  test("score 5 → moderate (boundary)", () => {
    expect(preliminaryClass(5)).toBe("moderate");
  });
  test("score 8.40 → moderate", () => {
    expect(preliminaryClass(8.40)).toBe("moderate");
  });
  test("score 14.99 → moderate (boundary)", () => {
    expect(preliminaryClass(14.99)).toBe("moderate");
  });
  test("score 15 → high (boundary)", () => {
    expect(preliminaryClass(15)).toBe("high");
  });
  test("score 20 → high", () => {
    expect(preliminaryClass(20)).toBe("high");
  });
  test("score 1.99 → none (below Low threshold)", () => {
    expect(preliminaryClass(1.99)).toBe("none");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateGovernance — Rule 1: Strongly Validated Critical-Entity
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateGovernance — Rule 1 (critical entity)", () => {
  test("validated credit_card → critical_entity rule fires", () => {
    const findings = [finding("credit_card", { validated: true })];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("critical_entity");
    expect(gov.result).toBe("high");
  });

  test("validated ph_id_tin → critical_entity rule fires", () => {
    const findings = [finding("ph_id_tin", { validated: true })];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("critical_entity");
  });

  test("validated ph_id_passport → critical_entity rule fires", () => {
    const findings = [finding("ph_id_passport", { validated: true })];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("critical_entity");
    expect(gov.result).toBe("high");
  });

  test("unvalidated credit_card → Rule 1 does NOT fire", () => {
    const findings = [finding("credit_card", { validated: false })];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).not.toBe("critical_entity");
  });

  test("validated api_key → Rule 1 fires (API keys are critical tier)", () => {
    const findings = [finding("api_key", { validated: true })];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("critical_entity");
  });

  test("validated jwt → Rule 1 fires", () => {
    const findings = [finding("jwt", { validated: true })];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("critical_entity");
  });

  // Rule 1 takes priority — Rule 2 is not evaluated when Rule 1 matches
  test("Rule 1 outranks Rule 2 when both conditions are present", () => {
    const findings = [
      finding("credit_card", { validated: true }),
      finding("gazetteer_medical"),
    ];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("critical_entity");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateGovernance — Rule 2: Sensitive-Context Co-occurrence
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateGovernance — Rule 2 (sensitive context co-occurrence)", () => {
  test("personal name (Low) + medical context → Rule 2 fires", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("gazetteer_medical"),
    ];
    const gov = evaluateGovernance(findings, "low");
    expect(gov.rule).toBe("sensitive_context");
  });

  test("Low → raised to Moderate", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("gazetteer_medical"),
    ];
    const gov = evaluateGovernance(findings, "low");
    expect(gov.result).toBe("moderate");
  });

  test("Moderate → raised to High", () => {
    const findings = [
      finding("email"),
      finding("gazetteer_financial"),
    ];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("sensitive_context");
    expect(gov.result).toBe("high");
  });

  test("High + sensitive context → stays High (ceiling)", () => {
    const findings = [
      finding("email"),
      finding("gazetteer_medical"),
    ];
    const gov = evaluateGovernance(findings, "high");
    expect(gov.rule).toBe("sensitive_context");
    expect(gov.result).toBe("high");
  });

  test("context indicator ONLY (no scored entity) → Rule 2 does NOT fire", () => {
    const findings = [
      finding("gazetteer_medical"),
    ];
    const gov = evaluateGovernance(findings, "none");
    // BASE_SCORES for context indicators = 0, so hasScoredEntity is false
    expect(gov.rule).not.toBe("sensitive_context");
  });

  test("scored entity ONLY (no context indicator) → Rule 2 does NOT fire", () => {
    const findings = [finding("email")];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).not.toBe("sensitive_context");
  });

  test("gazetteer_nationality_religion qualifies as sensitive context indicator", () => {
    expect(SENSITIVE_CONTEXT_IDS.has("gazetteer_nationality_religion")).toBe(true);
    const findings = [
      finding("trigger_person_name"),
      finding("gazetteer_nationality_religion"),
    ];
    const gov = evaluateGovernance(findings, "low");
    expect(gov.rule).toBe("sensitive_context");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateGovernance — Rule 3: Low-Impact Entity Cap
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateGovernance — Rule 3 (low-impact cap)", () => {
  test("all Low-impact scored entities → low_impact_cap fires", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("ipv4"),
      finding("mac_address"),
      finding("nlp_organization"),
      finding("nlp_job_title"),
    ];
    const gov = evaluateGovernance(findings, "high");
    expect(gov.rule).toBe("low_impact_cap");
  });

  test("mixing in an email (Moderate) → Rule 3 does NOT fire", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("email"),
    ];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).not.toBe("low_impact_cap");
  });

  test("mixing in a credit_card (Critical) → Rule 3 does NOT fire", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("credit_card", { validated: false }),
    ];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).not.toBe("low_impact_cap");
  });

  test("Rule 3 result is null (cap is applied by finalClass, not by the rule itself)", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("ipv4"),
    ];
    const gov = evaluateGovernance(findings, "high");
    expect(gov.rule).toBe("low_impact_cap");
    expect(gov.result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateGovernance — Rule 4: No rule applies
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateGovernance — Rule 4 (no rule)", () => {
  test("single email, no context → rule is 'none'", () => {
    const findings = [finding("email")];
    const gov = evaluateGovernance(findings, "moderate");
    expect(gov.rule).toBe("none");
  });

  test("empty findings array → rule is 'none'", () => {
    const gov = evaluateGovernance([], "none");
    expect(gov.rule).toBe("none");
  });

  test("3 types crossing High without critical or context → rule is 'none'", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("email"),
      finding("ph_mobile"),
    ];
    const gov = evaluateGovernance(findings, "high");
    expect(gov.rule).toBe("none");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// finalClass — maps governance outcomes to final risk level
// ─────────────────────────────────────────────────────────────────────────────

describe("finalClass", () => {
  test("Rule 1 (critical_entity) → always high", () => {
    expect(finalClass("moderate", { rule: "critical_entity", result: "high" })).toBe("high");
    expect(finalClass("low",      { rule: "critical_entity", result: "high" })).toBe("high");
  });

  test("Rule 2 returns the raised level", () => {
    expect(finalClass("low",      { rule: "sensitive_context", result: "moderate" })).toBe("moderate");
    expect(finalClass("moderate", { rule: "sensitive_context", result: "high" })).toBe("high");
  });

  test("Rule 3 caps preliminary High at Moderate", () => {
    expect(finalClass("high",     { rule: "low_impact_cap", result: null })).toBe("moderate");
  });

  test("Rule 3 retains Moderate if preliminary was already Moderate", () => {
    expect(finalClass("moderate", { rule: "low_impact_cap", result: null })).toBe("moderate");
  });

  test("Rule 3 retains Low if preliminary was Low", () => {
    expect(finalClass("low",      { rule: "low_impact_cap", result: null })).toBe("low");
  });

  test("Rule 4 (none) → retains preliminary", () => {
    expect(finalClass("none",     { rule: "none", result: null })).toBe("none");
    expect(finalClass("low",      { rule: "none", result: null })).toBe("low");
    expect(finalClass("moderate", { rule: "none", result: null })).toBe("moderate");
    expect(finalClass("high",     { rule: "none", result: null })).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeRiskScore — end-to-end scoring from a findings array
// Worked examples from Table 17 of the manuscript
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRiskScore — Table 17 worked examples", () => {
  test("personal name only → Low (2 × 1.00 = 2.00)", () => {
    const findings = [finding("trigger_person_name")];
    const { score, riskLevel, governance } = computeRiskScore(findings);
    expect(score).toBeCloseTo(2.00);
    expect(riskLevel).toBe("low");
    // Single low-impact entity: Rule 3 fires (all scored entities are low-impact)
    // but the final riskLevel is still "low" — the cap only prevents going above Moderate
    expect(governance).toBe("low_impact_cap");
  });

  test("email only → Moderate (5 × 1.00 = 5.00)", () => {
    const findings = [finding("email")];
    const { score, riskLevel } = computeRiskScore(findings);
    expect(score).toBeCloseTo(5.00);
    expect(riskLevel).toBe("moderate");
  });

  test("personal name + email → Moderate (7 × 1.20 = 8.40)", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("email"),
    ];
    const { score, riskLevel } = computeRiskScore(findings);
    expect(score).toBeCloseTo(8.40);
    expect(riskLevel).toBe("moderate");
  });

  test("email + org + job title → Moderate (9 × 1.40 = 12.60)", () => {
    const findings = [
      finding("email"),
      finding("nlp_organization"),
      finding("nlp_job_title"),
    ];
    const { score, riskLevel } = computeRiskScore(findings);
    expect(score).toBeCloseTo(12.60);
    expect(riskLevel).toBe("moderate");
  });

  test("name + email + phone → High (12 × 1.40 = 16.80)", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("email"),
      finding("ph_mobile"),
    ];
    const { score, riskLevel } = computeRiskScore(findings);
    expect(score).toBeCloseTo(16.80);
    expect(riskLevel).toBe("high");
  });

  test("validated passport (single critical) → High via Rule 1 (10 × 1.00 = 10.00 pre-gov)", () => {
    const findings = [finding("ph_id_passport", { validated: true })];
    const { score, riskLevel, governance } = computeRiskScore(findings);
    expect(score).toBeCloseTo(10.00);
    expect(riskLevel).toBe("high");
    expect(governance).toBe("critical_entity");
  });

  test("validated credit card + name → High via Rule 1 (14.40 pre-gov)", () => {
    const findings = [
      finding("credit_card", { validated: true }),
      finding("trigger_person_name"),
    ];
    const { score, riskLevel, governance } = computeRiskScore(findings);
    expect(score).toBeCloseTo(14.40);
    expect(riskLevel).toBe("high");
    expect(governance).toBe("critical_entity");
  });

  test("5 low-impact types → Moderate via Rule 3 (20.00 pre-gov, capped)", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("nlp_organization"),
      finding("nlp_job_title"),
      finding("mac_address"),
      finding("ipv4"),
    ];
    const { score, riskLevel, governance } = computeRiskScore(findings);
    expect(score).toBeCloseTo(20.00);
    expect(riskLevel).toBe("moderate");
    expect(governance).toBe("low_impact_cap");
  });

  test("name + medical context → Moderate via Rule 2 (2.00 pre-gov Low, raised)", () => {
    const findings = [
      finding("trigger_person_name"),
      finding("gazetteer_medical"),
    ];
    const { riskLevel, governance } = computeRiskScore(findings);
    expect(riskLevel).toBe("moderate");
    expect(governance).toBe("sensitive_context");
  });

  test("financial term only (context, no personal entity) → No Risk", () => {
    const findings = [finding("gazetteer_financial")];
    const { score, riskLevel } = computeRiskScore(findings);
    expect(score).toBe(0);
    expect(riskLevel).toBe("none");
  });

  test("empty findings → No Risk (score 0)", () => {
    const { score, riskLevel } = computeRiskScore([]);
    expect(score).toBe(0);
    expect(riskLevel).toBe("none");
  });

  test("duplicate same patternId → counted once in score", () => {
    // Two email findings must not double-count the base score
    const findings = [
      finding("email", { rawMatch: "a@example.com" }),
      finding("email", { rawMatch: "b@example.com" }),
    ];
    const { score } = computeRiskScore(findings);
    // 1 distinct type × 1.00 = 5.00
    expect(score).toBeCloseTo(5.00);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BASE_SCORES — spot-check the scoring table (Table 10)
// ─────────────────────────────────────────────────────────────────────────────

describe("BASE_SCORES (Table 10)", () => {
  const criticalIds = [
    "credit_card", "jwt", "api_key",
    "ph_id_tin", "ph_id_sss", "ph_id_gsis", "ph_id_philhealth",
    "ph_id_passport", "ph_id_umid", "ph_id_prc", "ph_id_philid",
    "ph_id_drivers_license", "ph_id_nbi_clearance", "ph_id_police_clearance",
    "ph_id_psa_certificate", "ph_id_barangay_clearance", "ph_id_comelec_voter_id",
  ];
  const moderateIds = ["email", "ph_mobile", "phone_intl", "ph_address", "source_code"];
  const lowIds      = ["ipv4", "ipv6", "mac_address", "trigger_person_name", "nlp_organization", "nlp_job_title"];
  const contextIds  = ["gazetteer_medical", "gazetteer_financial", "trigger_health", "trigger_financial", "gazetteer_nationality_religion"];

  test.each(criticalIds)("%s has base score 10", (id) => {
    expect(BASE_SCORES[id]).toBe(10);
  });

  test.each(moderateIds)("%s has base score 5", (id) => {
    expect(BASE_SCORES[id]).toBe(5);
  });

  test.each(lowIds)("%s has base score 2", (id) => {
    expect(BASE_SCORES[id]).toBe(2);
  });

  test.each(contextIds)("%s has base score 0 (context indicator)", (id) => {
    expect(BASE_SCORES[id]).toBe(0);
  });
});
