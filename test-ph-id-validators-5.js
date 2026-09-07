#!/usr/bin/env node
// test-ph-id-validators-5.js
// Test the 5 remaining Philippine ID validators (5.2 - 5.6)
// Tasks: 5.2 NBI, 5.3 Police, 5.4 Barangay, 5.5 COMELEC, 5.6 PhilID

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS (copied from patterns.js for testing)
// ────────────────────────────────────────────────────────────────────────────

function normalizePHID(value, stripChars) {
  if (!value || typeof value !== "string") return "";
  let normalized = value;
  if (stripChars && typeof stripChars === "string") {
    const chars = stripChars.split("").map(ch => ch === "-" ? "\\-" : ch).join("");
    const regex = new RegExp(`^[${chars}]+`, "i");
    normalized = normalized.replace(regex, "");
  }
  normalized = normalized.replace(/[\-\s\.]/g, "");
  return normalized;
}

// ────────────────────────────────────────────────────────────────────────────
// VALIDATOR FUNCTIONS FROM patterns.js
// ────────────────────────────────────────────────────────────────────────────

function structuralValidatePHID_NBIClearance(raw) {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  let normalized = normalizePHID(raw, "NBI");
  if (normalized.length < 7 || normalized.length > 10) {
    return false;
  }
  if (!/^\d{7,10}$/.test(normalized)) {
    return false;
  }
  const yearStr = normalized.slice(0, 2);
  const officeCodeStr = normalized.slice(2, 5);
  const sequenceStr = normalized.slice(5);
  const year = parseInt(yearStr, 10);
  if (year < 0 || year > 99) {
    return false;
  }
  const officeCode = parseInt(officeCodeStr, 10);
  if (officeCode < 1 || officeCode > 999) {
    return false;
  }
  if (sequenceStr.length < 2 || sequenceStr.length > 5) {
    return false;
  }
  return true;
}

function structuralValidatePHID_PoliceClearance(raw) {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  let normalized = normalizePHID(raw, "PNP");
  let baseID = normalized;
  let year = null;

  if (normalized.length > 6 && /^\d+$/.test(normalized)) {
    const possibleYear = parseInt(normalized.slice(0, 4), 10);
    if (possibleYear >= 1900 && possibleYear <= 2099) {
      year = possibleYear;
      baseID = normalized.slice(4);
    }
  }

  if (baseID.length < 6 || baseID.length > 10) {
    return false;
  }
  if (!/^[A-Za-z0-9]{6,10}$/.test(baseID)) {
    return false;
  }
  if (/^\d+$/.test(baseID)) {
    const officeCodeStr = baseID.slice(0, 2);
    const officeCode = parseInt(officeCodeStr, 10);
    if (officeCode < 1 || officeCode > 99) {
      return false;
    }
  }
  return true;
}

function structuralValidatePHID_BarangayClearance(raw) {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  let normalized = normalizePHID(raw, "BC");
  if (normalized.toLowerCase().startsWith("barangay")) {
    normalized = normalized.slice(8);
  }
  normalized = normalized.trim();

  let baseID = normalized;
  let year = null;

  if (normalized.length > 4 && /^\d+$/.test(normalized)) {
    const possibleYear = parseInt(normalized.slice(0, 4), 10);
    if (possibleYear >= 1900 && possibleYear <= 2099) {
      year = possibleYear;
      baseID = normalized.slice(4);
    }
  }

  if (baseID.length < 4 || baseID.length > 8) {
    return false;
  }
  if (!/^\d{4,8}$/.test(baseID)) {
    return false;
  }
  const barangayCodeStr = baseID.slice(0, 2);
  const barangayCode = parseInt(barangayCodeStr, 10);
  if (barangayCode < 1 || barangayCode > 99) {
    return false;
  }
  const sequenceStr = baseID.slice(2);
  const sequence = parseInt(sequenceStr, 10);
  const maxSequence = Math.pow(10, sequenceStr.length) - 1;
  if (sequence < 0 || sequence > maxSequence) {
    return false;
  }
  return true;
}

function structuralValidatePHID_COMELECVoterID(raw) {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  const normalized = normalizePHID(raw);
  if (normalized.length < 10 || normalized.length > 14) {
    return false;
  }
  if (!/^\d{10,14}$/.test(normalized)) {
    return false;
  }
  const provinceCodeStr = normalized.slice(0, 2);
  const cityCodeStr = normalized.slice(2, 4);
  const barangayCodeStr = normalized.slice(4, 6);
  const precinctStr = normalized.slice(6, 10);
  const sequenceStr = normalized.slice(10);

  const provinceCode = parseInt(provinceCodeStr, 10);
  if (provinceCode < 1 || provinceCode > 82) {
    return false;
  }
  const cityCode = parseInt(cityCodeStr, 10);
  if (cityCode < 1 || cityCode > 99) {
    return false;
  }
  const barangayCode = parseInt(barangayCodeStr, 10);
  if (barangayCode < 1 || barangayCode > 99) {
    return false;
  }
  const precinct = parseInt(precinctStr, 10);
  if (precinct < 0 || precinct > 9999) {
    return false;
  }
  if (sequenceStr.length > 0) {
    const sequence = parseInt(sequenceStr, 10);
    const maxSequence = Math.pow(10, sequenceStr.length) - 1;
    if (sequence < 0 || sequence > maxSequence) {
      return false;
    }
  }
  return true;
}

function structuralValidatePHID_PhilID(raw) {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  const normalized = normalizePHID(raw);
  if (normalized.length !== 12) {
    return false;
  }
  if (!/^\d{12}$/.test(normalized)) {
    return false;
  }
  const yearStr = normalized.slice(0, 2);
  const monthStr = normalized.slice(2, 4);
  const dayStr = normalized.slice(4, 6);
  const cityCodeStr = normalized.slice(6, 9);
  const registrationOrderStr = normalized.slice(9, 11);
  const sexDigitStr = normalized.slice(11, 12);

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (year < 0 || year > 99) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }
  const cityCode = parseInt(cityCodeStr, 10);
  if (cityCode < 0 || cityCode > 999) {
    return false;
  }
  const registrationOrder = parseInt(registrationOrderStr, 10);
  if (registrationOrder < 0 || registrationOrder > 99) {
    return false;
  }
  const sexDigit = parseInt(sexDigitStr, 10);
  if (sexDigit !== 1 && sexDigit !== 2) {
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, validator, input, expected) {
  const result = validator(input);
  const status = result === expected ? "✓" : "✗";
  if (result === expected) {
    passed++;
  } else {
    failed++;
    console.error(`${status} ${name}: expected ${expected}, got ${result} for "${input}"`);
  }
  console.log(`${status} ${name}`);
}

console.log("\n========================================");
console.log("TASK 5.2: NBI Clearance Validator Tests");
console.log("========================================\n");

// Valid cases
test("NBI: 10-digit valid", structuralValidatePHID_NBIClearance, "1234567890", true);
test("NBI: 7-digit valid", structuralValidatePHID_NBIClearance, "1234567", true);
test("NBI: with NBI prefix", structuralValidatePHID_NBIClearance, "NBI1234567890", true);
test("NBI: with separators", structuralValidatePHID_NBIClearance, "12-34-567-890", true);
test("NBI: office code 001", structuralValidatePHID_NBIClearance, "12-001-5678", true);

// Invalid cases
test("NBI: office code 000", structuralValidatePHID_NBIClearance, "1200000000", false);
test("NBI: too short (6)", structuralValidatePHID_NBIClearance, "123456", false);
test("NBI: too long (11)", structuralValidatePHID_NBIClearance, "12345678901", false);
test("NBI: contains letters", structuralValidatePHID_NBIClearance, "12345A7890", false);
test("NBI: null input", structuralValidatePHID_NBIClearance, null, false);

console.log("\n=========================================");
console.log("TASK 5.3: Police Clearance Validator Tests");
console.log("=========================================\n");

// Valid cases
test("Police: 6-digit numeric", structuralValidatePHID_PoliceClearance, "123456", true);
test("Police: with PNP prefix", structuralValidatePHID_PoliceClearance, "PNP123456", true);
test("Police: with year prefix", structuralValidatePHID_PoliceClearance, "2021-123456", true);
test("Police: alphanumeric", structuralValidatePHID_PoliceClearance, "PNP2021AB1234", true);
test("Police: 10-char alphanumeric", structuralValidatePHID_PoliceClearance, "1234567890", true);

// Invalid cases
test("Police: office code 00", structuralValidatePHID_PoliceClearance, "001234", false);
test("Police: too short (5)", structuralValidatePHID_PoliceClearance, "12345", false);
test("Police: too long (11)", structuralValidatePHID_PoliceClearance, "12345678901", false);
test("Police: null input", structuralValidatePHID_PoliceClearance, null, false);

console.log("\n=============================================");
console.log("TASK 5.4: Barangay Clearance Validator Tests");
console.log("=============================================\n");

// Valid cases
test("Barangay: 6-digit (BC + barangay+seq)", structuralValidatePHID_BarangayClearance, "011234", true);
test("Barangay: with BC prefix", structuralValidatePHID_BarangayClearance, "BC-011234", true);
test("Barangay: with year", structuralValidatePHID_BarangayClearance, "2021-011234", true);
test("Barangay: 4-digit", structuralValidatePHID_BarangayClearance, "0112", true);
test("Barangay: 8-digit", structuralValidatePHID_BarangayClearance, "01123456", true);

// Invalid cases
test("Barangay: barangay code 00", structuralValidatePHID_BarangayClearance, "001234", false);
test("Barangay: too short (3)", structuralValidatePHID_BarangayClearance, "011", false);
test("Barangay: too long (9)", structuralValidatePHID_BarangayClearance, "011234567", false);
test("Barangay: contains letters", structuralValidatePHID_BarangayClearance, "01BC1234", false);

console.log("\n===============================================");
console.log("TASK 5.5: COMELEC Voter's ID Validator Tests");
console.log("===============================================\n");

// Valid cases
test("COMELEC: 10-digit base", structuralValidatePHID_COMELECVoterID, "1234567890", true);
test("COMELEC: 14-digit full", structuralValidatePHID_COMELECVoterID, "12345678901234", true);
test("COMELEC: with separators", structuralValidatePHID_COMELECVoterID, "12-34-56-7890-1234", true);
test("COMELEC: province 01", structuralValidatePHID_COMELECVoterID, "01345678901234", true);
test("COMELEC: province 82", structuralValidatePHID_COMELECVoterID, "82345678901234", true);

// Invalid cases
test("COMELEC: province 00", structuralValidatePHID_COMELECVoterID, "00345678901234", false);
test("COMELEC: province 83", structuralValidatePHID_COMELECVoterID, "83345678901234", false);
test("COMELEC: city 00", structuralValidatePHID_COMELECVoterID, "12005678901234", false);
test("COMELEC: barangay 00", structuralValidatePHID_COMELECVoterID, "12340078901234", false);
test("COMELEC: too short (9)", structuralValidatePHID_COMELECVoterID, "123456789", false);
test("COMELEC: too long (15)", structuralValidatePHID_COMELECVoterID, "123456789012345", false);

console.log("\n==============================================");
console.log("TASK 5.6: PhilID (PSA National ID) Validator Tests");
console.log("==============================================\n");

// Valid cases
test("PhilID: valid 12-digit", structuralValidatePHID_PhilID, "920315123456", true);
test("PhilID: with separators", structuralValidatePHID_PhilID, "92-03-15-123-45-6", true);
test("PhilID: sex digit 1 (male)", structuralValidatePHID_PhilID, "920315123451", true);
test("PhilID: sex digit 2 (female)", structuralValidatePHID_PhilID, "920315123452", true);
test("PhilID: leap year day 29", structuralValidatePHID_PhilID, "960229100001", true);

// Invalid cases
test("PhilID: sex digit 0", structuralValidatePHID_PhilID, "920315123450", false);
test("PhilID: sex digit 9", structuralValidatePHID_PhilID, "920315123459", false);
test("PhilID: invalid month 13", structuralValidatePHID_PhilID, "921315123451", false);
test("PhilID: invalid day 00", structuralValidatePHID_PhilID, "920300123451", false);
test("PhilID: invalid day 32", structuralValidatePHID_PhilID, "920332123451", false);
test("PhilID: 11 digits", structuralValidatePHID_PhilID, "92031512345", false);
test("PhilID: 13 digits", structuralValidatePHID_PhilID, "9203151234561", false);
test("PhilID: contains letters", structuralValidatePHID_PhilID, "920315123A56", false);

console.log("\n========================================");
console.log("TEST SUMMARY");
console.log("========================================");
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log("");

if (failed === 0) {
  console.log("✓ All tests passed!");
  process.exit(0);
} else {
  console.log(`✗ ${failed} test(s) failed`);
  process.exit(1);
}
