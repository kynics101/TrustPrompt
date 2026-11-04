/** @type {import('jest').Config} */
module.exports = {
  // Node environment — no DOM needed; we shim browser globals ourselves
  testEnvironment: "node",

  // Run our module-loading shim before every test file
  setupFiles: ["<rootDir>/tests/setup/trustprompt-env.js"],

  // Test file locations
  testMatch: [
    "<rootDir>/tests/**/*.test.js",
  ],

  // Show individual test names in output
  verbose: true,

  // Timeout: perf tests iterate hundreds of times; 30 s is plenty
  testTimeout: 30000,

  // Coverage (only collected when --coverage flag is passed)
  collectCoverageFrom: [
    "normalizer.js",
    "patterns.js",
    "gazetteer.js",
    "trust-worker.js",
    "linguistic-detector.js",
    "validators-non-luhn.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
};
