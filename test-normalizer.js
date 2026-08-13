// test-normalizer.js — TrustNormalizer unit tests v0.0.6
// Run with: node test-normalizer.js
//
// Loads normalizer.js directly via a thin browser-shim so we never maintain
// a separate inlined copy that can go stale.

// ── Browser shim: expose globals normalizer.js expects ───────────────────────
global.TrustNormalizer = undefined; // will be set by the IIFE below

// Patch: normalizer.js ends with `return { ... }` inside an IIFE assigned to
// `const TrustNormalizer`. We eval it in this context so the global is set.
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/normalizer.js", "utf8")
  // Strip the `/* global TrustNormalizer */` comment so Node doesn't warn
  .replace(/\/\*.*?\*\//gs, "");
// Wrap so the const leaks into our scope via eval
eval("var TrustNormalizer; " + src.replace(/^const TrustNormalizer/, "TrustNormalizer"));

if (!TrustNormalizer || typeof TrustNormalizer.normalize !== "function") {
  console.error("❌ Failed to load TrustNormalizer from normalizer.js");
  process.exit(1);
}
console.log("✅ Loaded TrustNormalizer from normalizer.js\n");

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? "✅" : "❌", label);
  if (!ok) {
    console.log("   got:     ", JSON.stringify(actual));
    console.log("   expected:", JSON.stringify(expected));
    failed++;
  } else {
    passed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — SHARED
// ══════════════════════════════════════════════════════════════════════════════
section("Layer 1: Shared");

assert("NFKC fullwidth digits",
  TrustNormalizer.sharedLayer("４１１１２２２２３３３３４４４４"),
  "4111222233334444");

assert("NFKC ligature fi",
  TrustNormalizer.sharedLayer("ﬁle ﬀ"),
  "file ff");

assert("NFKC superscript → digit",
  TrustNormalizer.sharedLayer("x²"),
  "x2");

assert("Invisible: zero-width space stripped",
  TrustNormalizer.sharedLayer("09\u200B17"),
  "0917");

assert("Invisible: zero-width non-joiner stripped",
  TrustNormalizer.sharedLayer("09\u200C17"),
  "0917");

assert("Invisible: BOM stripped",
  TrustNormalizer.sharedLayer("\uFEFFhello"),
  "hello");

assert("Invisible: soft hyphen stripped",
  TrustNormalizer.sharedLayer("hel\u00ADlo"),
  "hello");

assert("Line endings: CRLF → LF",
  TrustNormalizer.sharedLayer("a\r\nb"),
  "a\nb");

assert("Line endings: CR → LF",
  TrustNormalizer.sharedLayer("a\rb"),
  "a\nb");

assert("Trim leading/trailing spaces",
  TrustNormalizer.sharedLayer("  hello  "),
  "hello");

assert("Trim leading/trailing newlines",
  TrustNormalizer.sharedLayer("\nhello\n"),
  "hello");

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2a — REGEX: sensitive data patterns
// ══════════════════════════════════════════════════════════════════════════════
section("Layer 2a: Regex — credit/debit card numbers");

assert("Spaced groups preserved (4111 1111 1111 1111)",
  TrustNormalizer.regexLayer("4111 1111 1111 1111").text,
  "4111 1111 1111 1111");

assert("Hyphenated groups preserved (4111-1111-1111-1111)",
  TrustNormalizer.regexLayer("4111-1111-1111-1111").text,
  "4111-1111-1111-1111");

assert("Compact number preserved (4111111111111)",
  TrustNormalizer.regexLayer("4111111111111").text,
  "4111111111111");

assert("Card in prose sentence",
  TrustNormalizer.regexLayer("my card is 4111 1111 1111 1111 please help").text,
  "my card is 4111 1111 1111 1111 please help");

section("Layer 2a: Regex — email addresses");

assert("Standard email preserved",
  TrustNormalizer.regexLayer("contact me at user@example.com please").text,
  "contact me at user@example.com please");

assert("Subdomain email preserved",
  TrustNormalizer.regexLayer("reach me at john.doe@mail.company.org").text,
  "reach me at john.doe@mail.company.org");

section("Layer 2a: Regex — phone numbers");

assert("PH mobile 09XX format",
  TrustNormalizer.regexLayer("call 0917 123 4567 anytime").text,
  "call 0917 123 4567 anytime");

assert("PH mobile +63 format",
  TrustNormalizer.regexLayer("+63 917 123 4567").text,
  "+63 917 123 4567");

assert("International US format",
  TrustNormalizer.regexLayer("call me at +1 (555) 867-5309").text,
  "call me at +1 (555) 867-5309");

section("Layer 2a: Regex — API keys and tokens");

assert("API key with hyphen prefix",
  TrustNormalizer.regexLayer("api_key: sk-abcdefghijklmnopqrstuvwxyz123456").text,
  "api_key: sk-abcdefghijklmnopqrstuvwxyz123456");

assert("Access token with underscores",
  TrustNormalizer.regexLayer("access_token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ01234").text,
  "access_token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ01234");

section("Layer 2a: Regex — JSON Web Tokens (JWT)");

assert("Three-segment JWT preserved",
  TrustNormalizer.regexLayer(
    "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  ).text,
  "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");

section("Layer 2a: Regex — IP and MAC addresses");

assert("IPv4 preserved",
  TrustNormalizer.regexLayer("server at 192.168.1.100 is down").text,
  "server at 192.168.1.100 is down");

assert("IPv6 full address preserved",
  TrustNormalizer.regexLayer("addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334").text,
  "addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334");

assert("IPv6 compressed form preserved",
  TrustNormalizer.regexLayer("addr ::1 is localhost").text,
  "addr ::1 is localhost");

assert("MAC colon format preserved",
  TrustNormalizer.regexLayer("mac AA:BB:CC:DD:EE:FF device").text,
  "mac AA:BB:CC:DD:EE:FF device");

assert("MAC hyphen format preserved",
  TrustNormalizer.regexLayer("mac AA-BB-CC-DD-EE-FF device").text,
  "mac AA-BB-CC-DD-EE-FF device");

section("Layer 2a: Regex — Philippine IDs and context labels");

assert("Name label preserved",
  TrustNormalizer.regexLayer("Name: Juan dela Cruz").text,
  "Name: Juan dela Cruz");

assert("TIN acronym label preserved (no caps conversion)",
  TrustNormalizer.regexLayer("TIN: 123-456-789").text,
  "TIN: 123-456-789");

assert("SSS label preserved",
  TrustNormalizer.regexLayer("SSS: 34-5678901-2").text,
  "SSS: 34-5678901-2");

assert("Passport label preserved",
  TrustNormalizer.regexLayer("passport: A12345678").text,
  "passport: A12345678");

assert("PhilHealth label preserved",
  TrustNormalizer.regexLayer("philhealth: 1234-5678-9012").text,
  "philhealth: 1234-5678-9012");

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2a — REGEX: source code blocks
// ══════════════════════════════════════════════════════════════════════════════
section("Layer 2a: Regex — source code (fenced blocks)");

assert("Fenced block: internal newlines preserved",
  TrustNormalizer.regexLayer(
    "here is my code:\n```python\ndef hello():\n    print('hi')\n```\nthank you"
  ).text,
  "here is my code:\n```python\ndef hello():\n    print('hi')\n```\nthank you");

assert("Fenced block: credentials inside preserved",
  TrustNormalizer.regexLayer(
    "```js\nconst key = 'sk-abcdefghijklmnopqrst';\n```"
  ).text,
  "```js\nconst key = 'sk-abcdefghijklmnopqrst';\n```");

assert("Fenced block: Python indentation preserved",
  TrustNormalizer.regexLayer(
    "```python\nfor i in range(10):\n    print(i)\n```"
  ).text,
  "```python\nfor i in range(10):\n    print(i)\n```");

assert("Fenced block: JavaScript indentation preserved",
  TrustNormalizer.regexLayer(
    "```\nfunction foo() {\n  return 42;\n}\n```"
  ).text,
  "```\nfunction foo() {\n  return 42;\n}\n```");

assert("Multiple fenced blocks both preserved",
  TrustNormalizer.regexLayer(
    "```sql\nSELECT * FROM users;\n```\nand\n```bash\necho hello\n```"
  ).text,
  "```sql\nSELECT * FROM users;\n```\nand\n```bash\necho hello\n```");

assert("Long inline backtick preserved",
  TrustNormalizer.regexLayer("run `npm install --save-dev webpack` first").text,
  "run `npm install --save-dev webpack` first");

assert("Short inline tick (< 10 chars) not treated as code",
  TrustNormalizer.regexLayer("use `npm` to install").text,
  "use `npm` to install");

assert("Prose around block is collapsed to single space",
  (() => {
    const t = TrustNormalizer.regexLayer(
      "before  block\n```\ncode here\n```\nafter   block"
    ).text;
    return t.includes("```\ncode here\n```") && !t.includes("  ");
  })(),
  true);

assert("ALL-CAPS in prose converted, code block left unchanged",
  (() => {
    const t = TrustNormalizer.regexLayer(
      "PLEASE CHECK THIS:\n```\nCONST X = 1;\n```"
    ).text;
    // prose converted to sentence case; code block untouched
    return t.includes("CONST X = 1;") && t.startsWith("Please");
  })(),
  true);

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2a — REGEX: general prose
// ══════════════════════════════════════════════════════════════════════════════
section("Layer 2a: Regex — general prose");

assert("Multiple spaces collapsed",
  TrustNormalizer.regexLayer("hello   world").text,
  "hello world");

assert("Prose newline collapsed to space",
  TrustNormalizer.regexLayer("line one\nline two").text,
  "line one line two");

assert("Smart quotes → ASCII",
  TrustNormalizer.regexLayer("\u201Chello\u201D").text,
  '"hello"');

assert("ALL-CAPS prose converted",
  TrustNormalizer.regexLayer("SEND YOUR FULL NAME AND ADDRESS").text,
  "Send your full name and address");

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2b — LINGUISTIC
// ══════════════════════════════════════════════════════════════════════════════
section("Layer 2b: Linguistic");

assert("Smart single quote → ASCII",
  TrustNormalizer.linguisticLayer("it\u2019s fine").text,
  "It's fine");

assert("Smart double quotes → ASCII, first char capitalised",
  TrustNormalizer.linguisticLayer("\u201Chello\u201D").text,
  '"Hello"');

assert("Em dash → hyphen",
  TrustNormalizer.linguisticLayer("word\u2014word").text,
  "Word-word");

assert("NBSP → space",
  TrustNormalizer.linguisticLayer("hello\u00A0world").text,
  "Hello world");

assert("Multiple spaces collapsed",
  TrustNormalizer.linguisticLayer("hello   world").text,
  "Hello world");

assert("Newlines collapsed to space",
  TrustNormalizer.linguisticLayer("line one\nline two").text,
  "Line one line two");

assert("Repeated punctuation removed",
  TrustNormalizer.linguisticLayer("really!!!").text,
  "Really!");

assert("Space before punctuation removed",
  TrustNormalizer.linguisticLayer("hello , world").text,
  "Hello, world");

assert("Space after punctuation ensured",
  TrustNormalizer.linguisticLayer("hello,world").text,
  "Hello, world");

assert("First character capitalised",
  TrustNormalizer.linguisticLayer("my name is juan").text,
  "My name is juan");
  // Note: mid-sentence proper nouns (Juan) are NOT capitalised here —
  // that is Compromise NLP's responsibility in Path B.

assert("ALL-CAPS converted (wasCapsConverted: true)",
  TrustNormalizer.linguisticLayer("MY NAME IS JUAN DELA CRUZ"),
  { text: "My name is juan dela cruz", wasCapsConverted: true });

assert("Sentence boundary capitalised after period",
  TrustNormalizer.linguisticLayer("hello world. next sentence here").text,
  "Hello world. Next sentence here");

assert("Mixed case — wasCapsConverted false",
  TrustNormalizer.linguisticLayer("Hello World").wasCapsConverted,
  false);

assert("Short ALL-CAPS (≤10 chars) — no conversion",
  TrustNormalizer.linguisticLayer("OK").wasCapsConverted,
  false);

// ══════════════════════════════════════════════════════════════════════════════
// FULL PIPELINE — normalize()
// ══════════════════════════════════════════════════════════════════════════════
section("Full pipeline: normalize()");

assert("Returns correct four keys",
  (() => Object.keys(TrustNormalizer.normalize("hello")).sort().join(","))(),
  "masked,textNLP,textRegex,wasCapsConverted");

assert("masked = sharedLayer output (preserves newlines and casing)",
  TrustNormalizer.normalize("Hello\nWorld").masked,
  "Hello\nWorld");

assert("textRegex: prose newlines collapsed to space",
  TrustNormalizer.normalize("line one\nline two").textRegex,
  "line one line two");

assert("textRegex: card number digit groups preserved",
  TrustNormalizer.normalize("card: 4111 1111 1111 1111").textRegex,
  "card: 4111 1111 1111 1111");

assert("textNLP: first character capitalised",
  TrustNormalizer.normalize("my name is juan").textNLP,
  "My name is juan");

assert("NFKC fullwidth digits: zero-width spaces stripped, digits run together",
  // After NFKC + invisible strip the zero-width spaces are gone,
  // so fullwidth digit groups merge into one continuous number.
  // The digit-separator guard only applies to ASCII spaces/hyphens between
  // digit groups — it cannot reconstruct separators that no longer exist.
  TrustNormalizer.normalize("card \uFF14\uFF11\uFF11\uFF11\u200B\uFF12\uFF12\uFF12\uFF12").textRegex,
  "card 41112222");

assert("ALL-CAPS sets wasCapsConverted true",
  TrustNormalizer.normalize("MY NAME IS JUAN").wasCapsConverted,
  true);

assert("Source code block preserved through full pipeline",
  TrustNormalizer.normalize("fix this:\n```js\nconst x = 1;\n```").textRegex,
  "fix this:\n```js\nconst x = 1;\n```");

assert("Empty string",
  TrustNormalizer.normalize(""),
  { masked: "", textRegex: "", textNLP: "", wasCapsConverted: false });

assert("Null input",
  TrustNormalizer.normalize(null),
  { masked: "", textRegex: "", textNLP: "", wasCapsConverted: false });

assert("Whitespace-only input",
  TrustNormalizer.normalize("   \n  "),
  { masked: "", textRegex: "", textNLP: "", wasCapsConverted: false });

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
