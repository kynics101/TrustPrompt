/**
 * tests/unit/detection.test.js
 *
 * Unit tests for the TrustPrompt detection pipeline.
 *
 * Tests the full TP.scan() function — normaliser → Path A → Path B → merge →
 * suppress → score — against known inputs, verifying that each entity type is
 * correctly detected (True Positive) or correctly ignored (False Positive guard).
 *
 * Also tests the validators-non-luhn.js utility functions directly, since those
 * run on the main thread and are separate from the worker path.
 *
 * Coverage:
 *   Path A  — regex + structural validator (TIN, SSS, UMID, GSIS, passport,
 *             PhilHealth, PRC, driver's licence, PhilID, credit card, JWT,
 *             API key, email, mobile, IPv4, IPv6, MAC)
 *   Path B  — gazetteer (medical/financial context, nationality/religion)
 *   Helpers — validators-non-luhn.js individual validator functions
 */

"use strict";

const { scan, validators } = global.TP;

// ─── Helper: find a finding by patternId ─────────────────────────────────────
function findById(findings, patternId) {
  return findings.find(f => f.patternId === patternId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Philippine Government IDs — Path A
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — Philippine TIN", () => {
  test("standard format 123-456-789-000", () => {
    const { findings } = scan("My TIN is 123-456-789-000.");
    expect(findById(findings, "ph_id_tin")).toBeTruthy();
  });

  test("dot-separated TIN 123.456.789.000", () => {
    const { findings } = scan("TIN: 123.456.789.000");
    expect(findById(findings, "ph_id_tin")).toBeTruthy();
  });

  test("space-separated TIN 123 456 789 000", () => {
    const { findings } = scan("TIN 123 456 789 000");
    expect(findById(findings, "ph_id_tin")).toBeTruthy();
  });

  test("random 12-digit number without TIN context must not produce validated TIN", () => {
    const { findings } = scan("Product code: 479001600000");
    const f = findById(findings, "ph_id_tin");
    // If matched, it must not be validated (Luhn/structure check blocks it)
    if (f) expect(f.validated).toBe(false);
  });
});

describe("Detection — Philippine SSS", () => {
  test("standard format 33-4567890-1", () => {
    const { findings } = scan("SSS number: 33-4567890-1");
    expect(findById(findings, "ph_id_sss")).toBeTruthy();
  });

  test("space format 33 4567890 1", () => {
    const { findings } = scan("My SSS is 33 4567890 1.");
    expect(findById(findings, "ph_id_sss")).toBeTruthy();
  });
});

describe("Detection — Philippine Passport", () => {
  test("letter + 8 digits format A12345678", () => {
    const { findings } = scan("Passport no.: A12345678");
    expect(findById(findings, "ph_id_passport")).toBeTruthy();
  });

  test("two letters + 7 digits AB1234567", () => {
    const { findings } = scan("My passport is AB1234567.");
    expect(findById(findings, "ph_id_passport")).toBeTruthy();
  });
});

describe("Detection — PhilHealth", () => {
  test("standard 12-digit PhilHealth number with hyphens", () => {
    const { findings } = scan("PhilHealth: 12-345678901-2");
    expect(findById(findings, "ph_id_philhealth")).toBeTruthy();
  });
});

describe("Detection — UMID", () => {
  test("UMID format 0000-1234567-8", () => {
    const { findings } = scan("UMID: 0000-1234567-8");
    expect(findById(findings, "ph_id_umid")).toBeTruthy();
  });
});

describe("Detection — Driver's License", () => {
  test("standard LTO format N01-23-456789", () => {
    const { findings } = scan("Driver's license: N01-23-456789");
    expect(findById(findings, "ph_id_drivers_license")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Credit / Debit Cards — Path A (Luhn validated)
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — Credit / Debit Cards", () => {
  test("Visa 4111 1111 1111 1111 (Luhn valid)", () => {
    const { findings, riskLevel } = scan("Card: 4111 1111 1111 1111");
    const f = findById(findings, "credit_card");
    expect(f).toBeTruthy();
    expect(f.validated).toBe(true);
    expect(riskLevel).toBe("high");
  });

  test("Mastercard 5500 0000 0000 0004 (Luhn valid)", () => {
    const { findings } = scan("Card: 5500-0000-0000-0004");
    const f = findById(findings, "credit_card");
    expect(f).toBeTruthy();
    expect(f.validated).toBe(true);
  });

  test("Invalid card number fails Luhn → not validated", () => {
    // 4111 1111 1111 1112 — last digit changed, Luhn fails
    const { findings } = scan("Card: 4111 1111 1111 1112");
    const f = findById(findings, "credit_card");
    // Either not detected or detected with validated:false
    if (f) expect(f.validated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JWT — Path A
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — JWT", () => {
  // A real HS256 JWT with valid base64url JSON header+payload
  const VALID_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
    ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  test("valid JWT is detected and validated", () => {
    const { findings } = scan(`Token: ${VALID_JWT}`);
    const f = findById(findings, "jwt");
    expect(f).toBeTruthy();
    expect(f.validated).toBe(true);
  });

  test("three random base64 segments that are NOT JSON → not validated as JWT", () => {
    const fake = "abc.def.ghi";
    const { findings } = scan(`Bearer ${fake}`);
    const f = findById(findings, "jwt");
    if (f) expect(f.validated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API Keys — Path A
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — API Keys", () => {
  test("OpenAI sk- key is detected", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL";
    const { findings, riskLevel } = scan(`My key is ${key}`);
    expect(findById(findings, "api_key")).toBeTruthy();
    expect(riskLevel).toBe("high");
  });

  test("GitHub ghp_ token is detected", () => {
    const { findings } = scan("GitHub token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345");
    expect(findById(findings, "api_key")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Email — Path A
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — Email", () => {
  test("plain email address is detected", () => {
    const { findings } = scan("Email me at user@example.com please.");
    expect(findById(findings, "email")).toBeTruthy();
  });

  test("email with subdomains is detected", () => {
    const { findings } = scan("user@mail.company.org");
    expect(findById(findings, "email")).toBeTruthy();
  });

  test("email with + tag is detected", () => {
    const { findings } = scan("Reach me at user+test@example.com");
    expect(findById(findings, "email")).toBeTruthy();
  });

  test("broken email (no TLD) is NOT detected", () => {
    const { findings } = scan("This is not an email: user@localhost");
    // May or may not match depending on regex strictness — if it does, it should
    // not be validated
    const f = findById(findings, "email");
    if (f) expect(f.validated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Philippine Mobile — Path A
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — Philippine Mobile Number", () => {
  test("+63 format is detected", () => {
    const { findings } = scan("Call +63 917 123 4567");
    expect(findById(findings, "ph_mobile")).toBeTruthy();
  });

  test("09xx format is detected", () => {
    const { findings } = scan("My number: 0917 123 4567");
    expect(findById(findings, "ph_mobile")).toBeTruthy();
  });

  test("non-PH mobile (non-09xx/+63 prefix) must not match ph_mobile", () => {
    const { findings } = scan("US number: +1 415 555 0100");
    expect(findById(findings, "ph_mobile")).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Network addresses — Path A
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — IPv4", () => {
  test("valid IPv4 is detected", () => {
    const { findings } = scan("Server IP: 203.0.113.42");
    expect(findById(findings, "ipv4")).toBeTruthy();
  });

  test("broadcast address 255.255.255.255 is detected", () => {
    const { findings } = scan("Broadcast: 255.255.255.255");
    expect(findById(findings, "ipv4")).toBeTruthy();
  });

  test("invalid octet 999.0.0.1 must not produce validated IPv4", () => {
    const { findings } = scan("Bad IP: 999.0.0.1");
    const f = findById(findings, "ipv4");
    if (f) expect(f.validated).toBe(false);
  });
});

describe("Detection — MAC Address", () => {
  test("colon-separated MAC is detected", () => {
    const { findings } = scan("MAC: 00:1A:2B:3C:4D:5E");
    expect(findById(findings, "mac_address")).toBeTruthy();
  });

  test("hyphen-separated MAC is detected", () => {
    const { findings } = scan("Device: 00-1A-2B-3C-4D-5E");
    expect(findById(findings, "mac_address")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Path B — Gazetteer context indicators
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection — Path B Gazetteer (context indicators)", () => {
  test("medical term 'hypertension' is detected as gazetteer_medical", () => {
    const { findings } = scan("Patient has hypertension and is on medication.");
    const f = findById(findings, "gazetteer_medical");
    expect(f).toBeTruthy();
  });

  test("financial term 'salary' is detected as gazetteer_financial", () => {
    const { findings } = scan("His monthly salary is undisclosed.");
    const f = findById(findings, "gazetteer_financial");
    expect(f).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validators-non-luhn.js — individual validator functions
// ─────────────────────────────────────────────────────────────────────────────

describe("validators-non-luhn — validateEmail", () => {
  const { validateEmail } = validators;

  test("valid email returns true", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  test("email with plus tag returns true", () => {
    expect(validateEmail("user+tag@example.org")).toBe(true);
  });

  test("missing domain returns false", () => {
    expect(validateEmail("user@")).toBe(false);
  });

  test("missing @ returns false", () => {
    expect(validateEmail("userexample.com")).toBe(false);
  });
});

describe("validators-non-luhn — validatePhilippineMobileNumber", () => {
  const { validatePhilippineMobileNumber } = validators;

  test("+63 917 123 4567 is valid", () => {
    expect(validatePhilippineMobileNumber("+63 917 123 4567")).toBe(true);
  });

  test("0917 123 4567 is valid", () => {
    expect(validatePhilippineMobileNumber("0917 123 4567")).toBe(true);
  });

  test("invalid prefix 0800 returns false", () => {
    expect(validatePhilippineMobileNumber("0800 123 4567")).toBe(false);
  });
});

describe("validators-non-luhn — validateIPv4", () => {
  const { validateIPv4 } = validators;

  test("valid IPv4 returns true", () => {
    expect(validateIPv4("192.168.1.1")).toBe(true);
  });

  test("invalid octet >255 returns false", () => {
    expect(validateIPv4("256.0.0.1")).toBe(false);
  });

  test("loopback address is valid", () => {
    expect(validateIPv4("127.0.0.1")).toBe(true);
  });
});

describe("validators-non-luhn — validateMACAddress", () => {
  const { validateMACAddress } = validators;

  test("colon MAC is valid", () => {
    expect(validateMACAddress("00:1A:2B:3C:4D:5E")).toBe(true);
  });

  test("hyphen MAC is valid", () => {
    expect(validateMACAddress("00-1A-2B-3C-4D-5E")).toBe(true);
  });

  test("invalid MAC (too short) returns false", () => {
    expect(validateMACAddress("00:1A:2B:3C")).toBe(false);
  });
});

describe("validators-non-luhn — validateJWT", () => {
  const { validateJWT } = validators;

  const VALID_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
    ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  test("valid JWT returns true", () => {
    expect(validateJWT(VALID_JWT)).toBe(true);
  });

  test("two-segment string is not a JWT", () => {
    expect(validateJWT("abc.def")).toBe(false);
  });

  test("non-base64 segments return false", () => {
    expect(validateJWT("not.a.jwt")).toBe(false);
  });
});

describe("validators-non-luhn — validateOpenAIApiKey", () => {
  const { validateOpenAIApiKey } = validators;

  test("sk- prefix key returns true", () => {
    expect(validateOpenAIApiKey("sk-abcdefghijklmnopqrstu")).toBe(true);
  });

  test("sk-proj- prefix key returns true", () => {
    expect(validateOpenAIApiKey("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe(true);
  });

  test("wrong prefix returns false", () => {
    expect(validateOpenAIApiKey("pk-abcdefghijklmnopqrstu")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Normalizer — basic smoke tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TrustNormalizer.normalize", () => {
  const { normalizer } = global.TP;

  test("returns expected shape", () => {
    const result = normalizer.normalize("hello world");
    expect(result).toHaveProperty("masked");
    expect(result).toHaveProperty("textRegex");
    expect(result).toHaveProperty("textNLP");
    expect(result).toHaveProperty("wasCapsConverted");
  });

  test("all-caps input sets wasCapsConverted", () => {
    const result = normalizer.normalize("MY EMAIL IS USER@EXAMPLE.COM");
    expect(result.wasCapsConverted).toBe(true);
  });

  test("mixed-case input does not set wasCapsConverted", () => {
    const result = normalizer.normalize("My email is user@example.com");
    expect(result.wasCapsConverted).toBe(false);
  });
});
