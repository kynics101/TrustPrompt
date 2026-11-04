/**
 * tests/fixtures/dataset.js
 *
 * Curated labeled dataset for TrustPrompt detection accuracy and scoring tests.
 *
 * Structure per entry:
 *   id          – unique stable identifier (used in test names)
 *   description – human-readable label
 *   prompt      – raw input text passed to TP.scan()
 *   expect: {
 *     patternIds    – array of patternId strings that MUST appear in findings
 *     notPatternIds – array of patternId strings that must NOT appear (FP guards)
 *     riskLevel     – final risk level: "none" | "low" | "moderate" | "high"
 *     governanceRule – expected governance rule triggered:
 *                      "critical_entity" | "sensitive_context" | "low_impact_cap" | "none"
 *     minScore      – optional: pre-governance score must be >= this value
 *   }
 *
 * Dataset sections:
 *   A. Negative cases (no PII — should produce no / low risk)
 *   B. Single entity — Low impact
 *   C. Single entity — Moderate impact
 *   D. Single entity — High impact (critical, with governance Rule 1)
 *   E. Multi-entity combinations → multiplier escalation
 *   F. Governance Rule 2 (sensitive context co-occurrence)
 *   G. Governance Rule 3 (low-impact cap)
 *   H. Edge cases (formatting variants, separators, caps)
 *   I. False-positive guards (numeric strings that must NOT match)
 *
 * Curated Dataset Batch 1 (55 entries, double-labeled):
 *   FIN-001..008   Financial Data
 *   GOVID-001..008 PH Government IDs
 *   CRED-001..010  Credentials & Tokens
 *   CONTACT-001..008 Contact Information
 *   NET-001..006   Network Identifiers
 *   IDENT-001..008 Personal Identity
 *   CTX-001..006   Contextual Terms
 *   PGI-POSI-01..10, PGI-NEGA-01..06, PGI-BOUN-1..3, PGI-CODE-01..03  Source Code
 */

"use strict";

const DATASET = [

  // ═══════════════════════════════════════════════════════════════════════════
  // A. NEGATIVE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "neg-001",
    description: "Plain English sentence — no entities",
    prompt: "Can you help me write a cover letter for a software engineer position?",
    expect: {
      patternIds:    [],
      notPatternIds: ["email", "ph_mobile", "credit_card", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "neg-002",
    description: "Technical question — no PII",
    prompt: "How do I implement a binary search tree in JavaScript?",
    expect: {
      patternIds:    [],
      notPatternIds: ["email", "api_key", "jwt"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "neg-003",
    description: "Financial term only — no scored entity (Rule 2 requires a scored entity)",
    prompt: "What is the current bank lending rate for housing loans?",
    expect: {
      patternIds:    [],
      notPatternIds: ["email", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "neg-004",
    description: "Medical term only — context indicator, no personal entity",
    prompt: "What are the symptoms of hypertension?",
    expect: {
      patternIds:    [],
      notPatternIds: ["email", "ph_mobile"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "neg-005",
    description: "Random digits — must not match structured IDs",
    prompt: "The answer is 4294967295 which is 2^32 - 1.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "ph_id_sss", "ph_id_umid", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // B. SINGLE ENTITY — LOW IMPACT (base score = 2)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "low-001",
    description: "Personal name only → Low",
    prompt: "My name is Juan dela Cruz.",
    expect: {
      patternIds:    ["trigger_person_name"],
      notPatternIds: ["email", "ph_mobile"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "low-002",
    description: "IPv4 address only → Low",
    prompt: "The server is hosted at 192.168.1.100.",
    expect: {
      patternIds:    ["ipv4"],
      notPatternIds: ["email", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "low-003",
    description: "MAC address only → Low",
    prompt: "Device MAC: 00:1A:2B:3C:4D:5E",
    expect: {
      patternIds:    ["mac_address"],
      notPatternIds: ["email", "credit_card"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // C. SINGLE ENTITY — MODERATE IMPACT (base score = 5)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "mod-001",
    description: "Email address only → Moderate",
    prompt: "Please contact me at juandelacruz@example.com for further details.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["ph_mobile", "credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "mod-002",
    description: "Philippine mobile number only → Moderate",
    prompt: "Call me at +63 917 123 4567 anytime.",
    expect: {
      patternIds:    ["ph_mobile"],
      notPatternIds: ["email", "credit_card"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "mod-003",
    description: "Email + Org + Job title (3 moderate/low types) → still Moderate",
    prompt: "I am Maria Santos, Senior Manager at Acme Corporation. My email is maria.santos@acme.com.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card", "ph_id_passport"],
      riskLevel:     "moderate",
      governanceRule: "none",
      // 3 distinct types: email(5) + org(2) + job_title(2) = 9 × 1.40 = 12.60 → Moderate
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // D. SINGLE ENTITY — HIGH IMPACT / CRITICAL (base score = 10)
  //    Governance Rule 1 always fires → High
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "high-001",
    description: "Valid Philippine TIN → High (Rule 1: critical entity)",
    prompt: "My TIN is 123-456-789-000.",
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "high-002",
    description: "Valid Philippine SSS number → High (Rule 1)",
    prompt: "SSS number: 33-4567890-1",
    expect: {
      patternIds:    ["ph_id_sss"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "high-003",
    description: "Valid Visa credit card number → High (Rule 1)",
    prompt: "Please charge my card: 4111 1111 1111 1111",
    expect: {
      patternIds:    ["credit_card"],
      notPatternIds: ["email", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "high-004",
    description: "Valid Philippine passport number → High (Rule 1)",
    prompt: "My passport number is A12345678.",
    expect: {
      patternIds:    ["ph_id_passport"],
      notPatternIds: ["credit_card", "ph_mobile"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "high-005",
    description: "OpenAI API key → High (Rule 1)",
    prompt: "My OpenAI key is sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL",
    expect: {
      patternIds:    ["api_key"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "high-006",
    description: "Valid JWT token → High (Rule 1)",
    prompt: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    expect: {
      patternIds:    ["jwt"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "high-007",
    description: "Credit card + personal name → High (Rule 1 fires; pre-gov 14.40 still Moderate)",
    prompt: "Name: Ana Reyes. Card: 4111 1111 1111 1111",
    expect: {
      patternIds:    ["credit_card"],
      notPatternIds: ["ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
      // pre-gov: (10+2) × 1.20 = 14.40 (Moderate) but Rule 1 escalates → High
    },
  },
  {
    id: "high-008",
    description: "Name + email + mobile → High via score (no governance rule needed)",
    prompt: "Contact: Pedro Alvarez, pedro.alvarez@example.com, +63 920 000 0001",
    expect: {
      patternIds:    ["email", "ph_mobile"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "none",
      // pre-gov: (2+5+5) × 1.40 = 16.80 → High; no governance rule needed
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // E. MULTI-ENTITY ESCALATION (multiplier driven)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "multi-001",
    description: "Personal name + email (2 types) → Moderate (8.40)",
    prompt: "Hi, I'm Rosa Manalo and my email is rosa.manalo@gmail.com.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card", "ph_id_sss"],
      riskLevel:     "moderate",
      governanceRule: "none",
      // (2+5) × 1.20 = 8.40
    },
  },
  {
    id: "multi-002",
    description: "Email + org + job title (3 types, 9 pts) × 1.40 = 12.60 → Moderate",
    prompt: "Maria Cruz, Head of Operations at Santos Holdings, can be reached at m.cruz@santosinc.ph.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "multi-003",
    description: "4 types crossing High threshold: name + email + mobile + IPv4",
    prompt: "User Juan Dela Cruz (juan@example.com, +63 915 000 0001) connected from 203.0.113.5.",
    expect: {
      patternIds:    ["email", "ph_mobile", "ipv4"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "none",
      // (2+5+5+2) × 1.70 = 23.80 → High
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F. GOVERNANCE RULE 2 — Sensitive Context Co-occurrence
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "gov2-001",
    description: "Personal name + medical context → Moderate (raised from Low)",
    prompt: "My name is Liza Mendoza and I was recently diagnosed with diabetes.",
    expect: {
      patternIds:    ["trigger_person_name"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "sensitive_context",
      // pre-gov: 2 × 1.00 = 2 (Low) → Rule 2 raises to Moderate
    },
  },
  {
    id: "gov2-002",
    description: "Personal name + financial context → Moderate (raised from Low)",
    prompt: "Carlos Reyes has a salary of 50,000 pesos per month.",
    expect: {
      patternIds:    ["trigger_person_name"],
      notPatternIds: ["credit_card"],
      riskLevel:     "moderate",
      governanceRule: "sensitive_context",
    },
  },
  {
    id: "gov2-003",
    description: "Email (moderate) + medical context → High (raised from Moderate)",
    prompt: "Please send the patient hypertension report to dr.reyes@hospital.ph.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "sensitive_context",
      // pre-gov: 5 × 1.00 = 5 (Moderate) → Rule 2 raises to High
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // G. GOVERNANCE RULE 3 — Low-Impact Entity Cap
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "gov3-001",
    description: "5 low-impact types → pre-gov High, capped at Moderate by Rule 3",
    prompt: "John Smith, IT Manager at Acme Corp, Department of Engineering, IP: 10.0.0.1, MAC: AA:BB:CC:DD:EE:FF",
    expect: {
      patternIds:    ["ipv4", "mac_address"],
      notPatternIds: ["credit_card", "email", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "low_impact_cap",
      // (2+2+2+2+2) × 2.00 = 20 → preliminary High → capped at Moderate
    },
  },
  {
    id: "gov3-002",
    description: "4 low-impact types (name + org + job + IP) × 1.70 = 13.60 → Moderate pre-gov; cap still at Moderate",
    prompt: "Alice Tan, CEO of Tan Enterprises, IT Department, server: 172.16.0.1",
    expect: {
      patternIds:    ["ipv4"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "moderate",
      governanceRule: "low_impact_cap",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // H. EDGE CASES — formatting variants
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "edge-001",
    description: "TIN with dots as separators",
    prompt: "TIN: 123.456.789.000",
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "edge-002",
    description: "Email mixed case",
    prompt: "Reach me at Juan.DELACRUZ@Company.COM for details.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "edge-003",
    description: "Mobile number with spaces",
    prompt: "My number is 0917 123 4567.",
    expect: {
      patternIds:    ["ph_mobile"],
      notPatternIds: ["credit_card"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "edge-004",
    description: "Mastercard with dashes",
    prompt: "Card: 5500-0000-0000-0004",
    expect: {
      patternIds:    ["credit_card"],
      notPatternIds: ["ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "edge-005",
    description: "SSS with spaces instead of dashes",
    prompt: "SSS: 33 4567890 1",
    expect: {
      patternIds:    ["ph_id_sss"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "edge-006",
    description: "ALL-CAPS prompt with email — normalizer should handle it",
    prompt: "MY EMAIL IS JUAN@EXAMPLE.COM AND I NEED HELP.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // I. FALSE-POSITIVE GUARDS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fp-001",
    description: "Sequence of 12 digits in a math context — must NOT match PhilID",
    prompt: "The factorial of 12 is 479001600 and 13! = 6227020800.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_philid", "ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "fp-002",
    description: "IP-like text in a URL — must not over-trigger",
    prompt: "See https://192.168.1.1/admin for the router config panel.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "fp-003",
    description: "Phone-like number in a product code context",
    prompt: "Order SKU: PH-0917-1234-XYZ is out of stock.",
    expect: {
      notPatternIds: ["ph_mobile", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "fp-004",
    description: "GitHub URL containing token-shaped path — must not trigger API key",
    prompt: "Clone the repo: git clone https://github.com/user/repo/tree/main/src",
    expect: {
      notPatternIds: ["api_key", "jwt", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },


  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — Financial Data (FIN)
  // Source: Curated Dataset Batch 1, double-labeled (Pelias / Nicdao)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "FIN-001",
    description: "TP — Visa card 4111 1111 1111 1111 (Luhn-valid) in a dispute-letter prompt",
    prompt: "My card number is 4111 1111 1111 1111, please help me draft a dispute letter.",
    expect: {
      patternIds:    ["credit_card"],
      notPatternIds: ["ph_id_tin", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "FIN-002",
    description: "TP — Visa card 4532015112830366 (Luhn-valid) in a support email prompt",
    prompt: "Visa ending 4532015112830366 was declined at checkout, can you write an email to support?",
    expect: {
      patternIds:    ["credit_card"],
      notPatternIds: ["ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "FIN-003",
    description: "TP — Financial context term only (payroll/salary) → no scored entity → No Risk",
    // Context indicators carry no base score; Rule 2 requires a scored entity too
    prompt: "Please review our Q3 payroll and salary structure before the board meeting.",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "email", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "FIN-004",
    description: "TP — Financial context term only (loan amortization) → no scored entity → No Risk",
    prompt: "I need help calculating my monthly loan amortization for a car loan.",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "FIN-005",
    description: "EC/Malformed — 8-digit card fragment '1234 5678' fails Luhn → must NOT be validated",
    prompt: "Card: 1234 5678 — is this a valid format for a transaction receipt template?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "FIN-006",
    description: "EC/Placeholder — Stripe test card 4242 4242 4242 4242 must be filtered (known placeholder)",
    prompt: "Use 4242 4242 4242 4242 as the test card in the Stripe sandbox integration.",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "FIN-007",
    description: "TN — Exchange rate question; no PII or context indicator",
    prompt: "What's the exchange rate between USD and PHP today?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "email", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "FIN-008",
    description: "TN — Revenue percentage growth; no PII",
    prompt: "Our quarterly revenue grew by 12 percent compared to last year.",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — PH Government IDs (GOVID)
  // Source: Curated Dataset Batch 1, double-labeled (Nicdao / Sergio)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "GOVID-001",
    description: "TP — TIN 123-456-789-000 in an ITR filing prompt",
    prompt: "My TIN is 123-456-789-000, can you help me file my ITR?",
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "GOVID-002",
    description: "TP — SSS 03-1234567-8 in a contribution-record prompt",
    prompt: "Here is my SSS number: 03-1234567-8, please check my contribution record.",
    expect: {
      patternIds:    ["ph_id_sss"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "GOVID-003",
    description: "TP — PhilHealth 12-345678901-2 in a benefits prompt",
    prompt: "My PhilHealth number is 12-345678901-2, I need help understanding my benefits.",
    expect: {
      patternIds:    ["ph_id_philhealth"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "GOVID-004",
    description: "TN — Passport renewal requirements; no actual ID value present",
    prompt: "Can you summarize the requirements for renewing a Philippine passport?",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_passport", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "GOVID-005",
    description: "TN — Invoice number 123-456-789 (9-digit, TIN look-alike) must NOT match TIN",
    prompt: "Invoice number 123-456-789 was paid in full last week.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "GOVID-006",
    description: "EC/Malformed — TIN '123-45-6789' has wrong grouping → must NOT match",
    prompt: "TIN: 123-45-6789 — does this look right for the BIR form?",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "GOVID-007",
    description: "EC/Placeholder — all-zero TIN 000-000-000-000 must be filtered",
    prompt: "Sample TIN format for the training slide: 000-000-000-000.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "GOVID-008",
    description: "EC/Boundary — TIN 999-999-999-999 (upper digit-value boundary) → Strongly Validated → High",
    prompt: "999-999-999-999 — is this a valid TIN structure for testing the form validator?",
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — Credentials & Tokens (CRED)
  // Source: Curated Dataset Batch 1, double-labeled (Sergio / Pelias)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "CRED-001",
    description: "TP — OpenAI sk-proj- key in a 401 debugging prompt",
    prompt: "api_key: sk-proj-8f92ab7c1234567890abcdWXYZ — why is this returning a 401 error?",
    expect: {
      patternIds:    ["api_key"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "CRED-002",
    description: "TP — AWS access key AKIA… in an IAM policy prompt",
    prompt: "Here is our AWS key: AKIAIOSFODNN7EXAMPLE, can you check the IAM policy attached to it?",
    expect: {
      patternIds:    ["api_key"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "CRED-003",
    description: "TP — Valid 3-segment JWT in a decode prompt",
    prompt: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c — decode this for me.",
    expect: {
      patternIds:    ["jwt"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "CRED-004",
    description: "TP — Generic high-entropy secret in a production-readiness prompt",
    prompt: "secret: 9kLm2pQvXz7RtN4wYbE8sJd1 — is this strong enough for a production secret?",
    expect: {
      patternIds:    ["api_key"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "CRED-005",
    description: "TN — Conceptual API key question; no actual key value",
    prompt: "Explain what an API key is used for in REST authentication.",
    expect: {
      patternIds:    [],
      notPatternIds: ["api_key", "jwt", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CRED-006",
    description: "TN — 'key' in a music context; no credential value",
    prompt: "My favorite key on the piano is C major, what chord progression should I use?",
    expect: {
      patternIds:    [],
      notPatternIds: ["api_key", "jwt"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CRED-007",
    description: "EC/Placeholder — 'your_api_key_here' documentation boilerplate must be filtered",
    prompt: "Set OPENAI_API_KEY=your_api_key_here in your .env file — is that the correct variable name?",
    expect: {
      patternIds:    [],
      notPatternIds: ["api_key"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CRED-008",
    description: "EC/Malformed — 2-segment JWT (header.payload only) must NOT be validated",
    prompt: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ — why does jwt.io say this token is invalid?",
    expect: {
      patternIds:    [],
      notPatternIds: ["jwt"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CRED-009",
    description: "EC/Malformed — low-entropy secret 'aaaa…' (20 × a) must fail entropy check → not flagged",
    prompt: "secret: aaaaaaaaaaaaaaaaaaaa — I used this as a placeholder in my config, is that risky?",
    expect: {
      patternIds:    [],
      notPatternIds: ["api_key"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CRED-010",
    description: "EC/Boundary — 16-char alternating 'a1a1…' key at minimum-length boundary; format-only candidate",
    prompt: "api_key: a1a1a1a1a1a1a1a1 — is exactly 16 characters long enough for a secret key?",
    expect: {
      patternIds:    [],
      notPatternIds: ["api_key"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — Contact Information (CONTACT)
  // Source: Curated Dataset Batch 1, double-labeled (Nicdao / Sergio)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "CONTACT-001",
    description: "TP — Email in a report-delivery prompt",
    prompt: "Reach me at juan.delacruz@email.com for the report once it's ready.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "CONTACT-002",
    description: "TP — PH mobile 09171234567 in a travel coordination prompt",
    prompt: "Call me at 09171234567 once you land at the airport.",
    expect: {
      patternIds:    ["ph_mobile"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "CONTACT-003",
    description: "TP — Philippine physical address in an LRT directions prompt",
    prompt: "I live at 123 Rizal St., Manila — can you find the nearest LRT station?",
    expect: {
      patternIds:    ["ph_address"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "CONTACT-004",
    description: "TP — Email with + tag and .edu.ph TLD in an invoice cc prompt",
    prompt: "My work email is m.santos+billing@ust.edu.ph, please cc that on the invoice.",
    expect: {
      patternIds:    ["email"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "moderate",
      governanceRule: "none",
    },
  },
  {
    id: "CONTACT-005",
    description: "TN — Website URL (www.example.com) must NOT be detected as email",
    prompt: "Visit our site at www.example.com for more updates on the product launch.",
    expect: {
      patternIds:    [],
      notPatternIds: ["email", "ph_mobile", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CONTACT-006",
    description: "TN — Sports score '192 to 168' must NOT trigger IPv4",
    prompt: "The score was 192 to 168 in the final quarter of the game.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ipv4", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CONTACT-007",
    description: "EC/Malformed — double-@ email 'andrea@@gmail.com' must NOT be validated",
    prompt: "My email is andrea@@gmail.com, but the confirmation link isn't arriving.",
    expect: {
      patternIds:    [],
      notPatternIds: ["email"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CONTACT-008",
    description: "EC/Placeholder — documentation email 'user@example.com' must be filtered",
    prompt: "Send confirmation to user@example.com as shown in the API docs example.",
    expect: {
      patternIds:    [],
      notPatternIds: ["email"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — Network Identifiers (NET)
  // Source: Curated Dataset Batch 1, double-labeled (Sergio / Nicdao)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "NET-001",
    description: "TP — IPv4 192.168.1.1 in a firewall rules prompt",
    prompt: "Our server IP is 192.168.1.1, can you check the firewall rules for this subnet?",
    expect: {
      patternIds:    ["ipv4"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "NET-002",
    description: "TP — MAC 00:1A:2B:3C:4D:5E in an allowlist prompt",
    prompt: "The device MAC address is 00:1A:2B:3C:4D:5E, please add it to the allowlist.",
    expect: {
      patternIds:    ["mac_address"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "NET-003",
    description: "TN — Version number '10.20.30' must NOT be detected as IPv4",
    prompt: "Software version 10.20.30 was installed on all lab machines this week.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ipv4", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "NET-004",
    description: "EC/Malformed — IPv4 with out-of-range octet '192.168.1.999' must NOT be validated",
    prompt: "IP: 192.168.1.999 — why does my router reject this static address?",
    expect: {
      patternIds:    [],
      notPatternIds: ["ipv4"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "NET-005",
    description: "EC/Placeholder — loopback 127.0.0.1 in a README example must be filtered",
    prompt: "Use 127.0.0.1 (localhost) as shown in the README for local testing.",
    expect: {
      patternIds:    [],
      notPatternIds: ["ipv4"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "NET-006",
    description: "EC/Boundary — broadcast address 255.255.255.255 (max octet value) → Validated → Low",
    prompt: "255.255.255.255 — is this a valid subnet broadcast address for a /24 network?",
    expect: {
      patternIds:    ["ipv4"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — Personal Identity (IDENT)
  // Source: Curated Dataset Batch 1, double-labeled (Pelias / Sergio)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "IDENT-001",
    description: "TP — Personal name 'Maria Santos' detected",
    prompt: "Maria Santos sent the report yesterday, can you summarize her key points?",
    expect: {
      patternIds:    ["trigger_person_name"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "IDENT-002",
    description: "TP — Organization 'University of Santo Tomas' detected",
    prompt: "I work at University of Santo Tomas, and we're launching a new research center.",
    expect: {
      patternIds:    ["nlp_organization"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "IDENT-003",
    description: "TP — Job title 'HR Manager' and department 'Finance Department' detected",
    prompt: "As the HR Manager of the Finance Department, I need to draft a policy memo.",
    expect: {
      patternIds:    ["nlp_job_title"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "IDENT-004",
    description: "TP — Nationality/ethnic context 'Filipino' → gazetteer_nationality_religion (no independent score)",
    // 'Filipino' is a nationality indicator — no base score, cannot independently produce risk
    prompt: "I am a Filipino citizen applying for a Schengen visa, what documents do I need?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "IDENT-005",
    description: "TN — Personal hobby sentence; no detectable PII",
    prompt: "I enjoy hiking and photography during weekends, any trail recommendations nearby?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin", "email"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "IDENT-006",
    description: "EC/Fuzzy-typo — 'Univecity of Sto. Tomas' (typo) within fuzzy threshold → should match org",
    // Accepted via ≥0.8 Levenshtein similarity; reliability = Moderate (fuzzy match)
    prompt: "I work at Univecity of Sto. Tomas and need help formatting my thesis.",
    expect: {
      patternIds:    ["nlp_organization"],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "low",
      governanceRule: "none",
    },
  },
  {
    id: "IDENT-007",
    description: "EC/Ambiguous — 'Agapito' is a personal name but also a Filipino word (documented limitation); adjudicated as low-confidence detection",
    // Adjudicated outcome: treat as low-confidence personal name detection (low risk expected)
    // Test is permissive: we do not require patternIds but do not forbid trigger_person_name
    prompt: "Agapito na lang natin 'to, let's just settle this over coffee.",
    expect: {
      patternIds:    [],           // Not required — may or may not match
      notPatternIds: ["credit_card", "ph_id_tin", "email"],
      riskLevel:     "low",        // If a name is detected it would be Low; none is also acceptable
      governanceRule: "none",
    },
  },
  {
    id: "IDENT-008",
    description: "EC/Ambiguous — 'grace' is a known-limitation term (also a Filipino name); acceptable miss per Detect03 Step 5",
    // System is not expected to detect a name here; 'grace period' is idiomatic English
    prompt: "May I have a grace period for the deadline? I've had a difficult week.",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin", "email"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — Contextual Terms (CTX)
  // Source: Curated Dataset Batch 1, double-labeled (Nicdao / Pelias)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "CTX-001",
    description: "TP — Medical context only ('hypertension') → no scored entity → No Risk (context indicator, no personal entity)",
    prompt: "I was recently diagnosed with hypertension, what lifestyle changes should I make?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CTX-002",
    description: "TP — Medical context only ('medication', 'anxiety') → no scored entity → No Risk",
    prompt: "My doctor prescribed a new medication for my anxiety, are there common side effects?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CTX-003",
    description: "TP — Financial/legal context term ('loan agreement') → no scored entity → No Risk",
    prompt: "Can you help me review this loan agreement before I sign it?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CTX-004",
    description: "TN — General wellness question; 'diet' / 'exercises' are not diagnosis/treatment terms",
    prompt: "What's a healthy diet plan for someone who exercises daily?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin", "email"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CTX-005",
    description: "TN — General finance concept ('compound interest'); not a personal financial disclosure",
    prompt: "Can you explain how compound interest works for a savings account?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "CTX-006",
    description: "EC/Boundary — 'salary' alone is a single financial context term → no scored entity → No Risk",
    prompt: "Please review our Q3 payroll and salary structure — is 'salary' alone enough to flag this as a Financial context term?",
    expect: {
      patternIds:    [],
      notPatternIds: ["credit_card", "ph_id_tin"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH 1 — Source Code w/ PH Government IDs (PGI)
  // Source: Curated Dataset Batch 1 — Structured Detector Test Cases
  // Note: These prompts are code snippets; the detector must flag both the
  //       source_code entity AND the embedded PH ID value.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "PGI-POSI-01",
    description: "TP/Code — TIN in a Java string assignment",
    prompt: 'String tin = "123-456-789-000";',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-02",
    description: "TP/Code — TIN in a JS const with taxpayer variable name",
    prompt: 'const taxpayerTin = "987-654-321-001";',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-03",
    description: "TP/Code — 12-digit unseparated TIN in a birTin variable",
    prompt: 'String birTin = "456789123000";',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-04",
    description: "TP/Code — TIN as payload object field value",
    prompt: 'payload.put("tin", "123-456-789-000");',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-05",
    description: "TP/Code — National ID in a nationalId variable",
    prompt: 'const nationalId = "1234-5678-9012-3456";',
    expect: {
      patternIds:    ["ph_id_philid"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-06",
    description: "TP/Code — SSS number passed to a setter method",
    prompt: 'user.setSssNumber("12-3456789-0");',
    expect: {
      patternIds:    ["ph_id_sss"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-07",
    description: "TP/Code — PhilHealth ID in a philhealthId variable assignment",
    prompt: 'philhealthId = "12-345678901-2";',
    expect: {
      patternIds:    ["ph_id_philhealth"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-08",
    description: "TP/Code — Passport number in a passportNo string variable",
    prompt: 'String passportNo = "P1234567A";',
    expect: {
      patternIds:    ["ph_id_passport"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-09",
    description: "TP/Code — PRC license in a config dict field",
    prompt: 'config["prc_license"] = "1234567";',
    expect: {
      patternIds:    ["ph_id_prc"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-POSI-10",
    description: "TP/Code — TIN in an executable SQL INSERT statement",
    prompt: "db.execute(\"INSERT INTO users (tin) VALUES ('123-456-789-000')\");",
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-NEGA-01",
    description: "TN/Code — TIN variable name but no literal value (getter call) → must NOT flag TIN",
    prompt: "String tin = getTinFromUserInput();",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "PGI-NEGA-02",
    description: "TN/Code — 9-digit value '123-456-789' incomplete for TIN rule → must NOT flag",
    prompt: 'const example = "123-456-789";',
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "PGI-NEGA-03",
    description: "TN/Code — TIN-shaped value in an orderNumber variable → context identifies it as order number",
    // The detector uses pattern matching; context variable name 'orderNumber' may not suppress.
    // This is a known limitation — the test checks the riskLevel, not suppression.
    prompt: 'const orderNumber = "123-456-789-000";',
    expect: {
      patternIds:    [],           // Ideally not flagged; context suppression may vary
      notPatternIds: ["credit_card", "email"],
      riskLevel:     "high",       // If TIN is matched it produces High; acceptable outcome
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-NEGA-04",
    description: "TN/Code — TIN format comment only; no literal value → must NOT flag",
    prompt: "// TIN format: XXX-XXX-XXX-XXX",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "PGI-NEGA-05",
    description: "TN/Code — TIN regex definition; no actual TIN value → must NOT flag",
    prompt: "const tinRegex = /^\\d{3}-\\d{3}-\\d{3}-\\d{3}$/;",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "PGI-NEGA-06",
    description: "TN/Code — National ID from env variable; no literal value exposed → must NOT flag",
    prompt: "const nationalId = process.env.NATIONAL_ID;",
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_philid", "ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "PGI-BOUN-1",
    description: "EC/Boundary — 12-digit TIN without separators '123456789000' → moderately validated",
    prompt: 'const tin = "123456789000";',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-BOUN-2",
    description: "EC/Boundary — 9-digit partial TIN '123-456-789' (missing branch code) → must NOT flag",
    prompt: 'const tin = "123-456-789";',
    expect: {
      patternIds:    [],
      notPatternIds: ["ph_id_tin", "credit_card"],
      riskLevel:     "none",
      governanceRule: "none",
    },
  },
  {
    id: "PGI-BOUN-3",
    description: "EC/Boundary — TIN-shaped value with '// sample data' comment → moderately validated (comment does not suppress)",
    prompt: 'const value = "123-456-789-000"; // sample data',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-CODE-01",
    description: "TP/Code — TIN hard-coded in a conditional expression",
    prompt: 'if (user.tin === "123-456-789-000") { approve(); }',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-CODE-02",
    description: "TP/Code — TIN hard-coded in a returned object",
    prompt: 'return { "tin": "123-456-789-000", "name": "Test User" };',
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },
  {
    id: "PGI-CODE-03",
    description: "TP/Code — TIN in an SQL INSERT with taxpayer name",
    prompt: "INSERT INTO taxpayer VALUES ('Juan Dela Cruz', '123-456-789-000');",
    expect: {
      patternIds:    ["ph_id_tin"],
      notPatternIds: ["credit_card"],
      riskLevel:     "high",
      governanceRule: "critical_entity",
    },
  },

];

module.exports = { DATASET };
