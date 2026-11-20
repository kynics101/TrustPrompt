/**
 * tests/unit/medical-anchor.test.js
 *
 * Regression tests for the Medical Anchor Rule through the live scan path
 * (TP.scan). Covers "I am diabetic" (condition adjective) and "I have diabetes"
 * (verb form) and checks that negated, interrogative, hypothetical, and
 * research-framed sentences do not escalate.
 */
"use strict";

const { scan } = global.TP;

function personNameFindings(result) {
  return result.findings.filter(f => f.patternId === "trigger_person_name");
}

describe("Medical Anchor Rule — positive disclosures escalate (Rule 2, one level)", () => {
  test.each([
    "I am diabetic.",
    "i am diabetic, what foods must i eat?",
    "I have diabetes.",
  ])("%s → sensitive_context, final Low, no scored unit", (text) => {
    const r = scan(text);
    expect(r.governance).toBe("sensitive_context");
    expect(r.riskLevel).toBe("low");
    expect(r.score).toBe(0);
  });

  test("'I am diabetic' is not scored as a personal name", () => {
    const r = scan("I am diabetic.");
    expect(personNameFindings(r)).toHaveLength(0);
  });
});

describe("Medical Anchor Rule — non-disclosures do not escalate", () => {
  test.each([
    "I am not diabetic, what foods must I eat?",
    "What foods must I eat if I am diabetic?",
    "Am I diabetic?",
    "If I am diabetic, what foods must I eat?",
    "I am researching diabetic diets for my thesis.",
  ])("%s → no Rule 2 escalation", (text) => {
    const r = scan(text);
    expect(r.governance).toBe("none");
    expect(r.riskLevel).toBe("none");
    expect(r.score).toBe(0);
  });

  test("'I am not diabetic' does not create a personal-name finding", () => {
    const r = scan("I am not diabetic, what foods must I eat?");
    expect(personNameFindings(r)).toHaveLength(0);
  });
});

describe("'I am <Name>' self-introduction still detects a personal name", () => {
  test("I am Maria Santos. → personal name, scored Low", () => {
    const r = scan("I am Maria Santos.");
    expect(personNameFindings(r).length).toBeGreaterThan(0);
    expect(r.score).toBe(2);
  });
});

describe("Health trigger value stops at a clause break", () => {
  test("I have asthma, any tips for cold weather? → health finding is 'asthma' only", () => {
    const r = scan("I have asthma, any tips for cold weather?");
    const health = r.findings.filter(f => f.patternId === "trigger_health");
    expect(health.map(f => f.rawMatch)).toEqual(["asthma"]);
    expect(r.governance).toBe("sensitive_context");
    expect(r.riskLevel).toBe("low");
  });
});
