/**
 * tests/unit/nationality-language.test.js
 *
 * "Filipino" used as the name of a language is not a nationality disclosure.
 * Checked through the live scan path (TP.scan).
 */
"use strict";

const { scan } = global.TP;

function nationalityFindings(result) {
  return result.findings.filter(f => f.patternId === "gazetteer_nationality");
}

describe("Language usage of a demonym is not detected as nationality", () => {
  test("taught me Filipino, Math and Science → no nationality finding", () => {
    const r = scan("I want to thank the people who taught me Filipino, Math and Science in elementary school. Help me write a short Facebook post.");
    expect(nationalityFindings(r)).toHaveLength(0);
    expect(r.governance).toBe("none");
    expect(r.score).toBe(0);
  });

  test("writing a letter in Filipino, learned formal Filipino → no nationality finding", () => {
    const r = scan("I'm writing a letter in Filipino to our relatives abroad, but I only learned formal Filipino in school. Can you make it sound warmer, like how we talk at home?");
    expect(nationalityFindings(r)).toHaveLength(0);
    expect(r.governance).toBe("none");
    expect(r.score).toBe(0);
  });

  test("I speak Filipino at home → no nationality finding", () => {
    const r = scan("I speak Filipino at home.");
    expect(nationalityFindings(r)).toHaveLength(0);
  });
});

describe("Nationality disclosures are still detected", () => {
  test("My parents are Filipino. → nationality context finding kept", () => {
    const r = scan("My parents are Filipino.");
    expect(nationalityFindings(r).length).toBeGreaterThan(0);
  });
});
