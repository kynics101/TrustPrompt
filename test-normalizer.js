// test-normalizer.js — TrustNormalizer unit tests (Node.js)
// Run with: node test-normalizer.js

const TrustNormalizer = (() => {
  const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060-\u2064\u206A-\u206F\uFEFF]/g;

  function sharedLayer(raw) {
    return raw.normalize("NFKC")
      .replace(INVISIBLE_RE, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
  }

  function uppercaseRatio(str) {
    const alpha = str.replace(/[^a-zA-Z]/g, "");
    if (!alpha.length) return 0;
    return str.replace(/[^A-Z]/g, "").length / alpha.length;
  }

  function toSentenceCase(str) {
    return str.toLowerCase()
      .replace(/^([a-z])/, c => c.toUpperCase())
      .replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase())
      .replace(/\bi\b/g, "I");
  }

  function linguisticLayer(str) {
    let out = str
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/[^\S\n]+/g, " ");
    const wasCapsConverted = out.length > 10 && uppercaseRatio(out) > 0.70;
    if (wasCapsConverted) out = toSentenceCase(out);
    return { text: out, wasCapsConverted };
  }

  function normalize(rawText) {
    if (!rawText || typeof rawText !== "string") return { text: "", wasCapsConverted: false };
    return linguisticLayer(sharedLayer(rawText));
  }

  return { normalize, sharedLayer, linguisticLayer };
})();

// ── Test runner ────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? "✅" : "❌"), label);
  if (!ok) {
    console.log("   got:     ", JSON.stringify(actual));
    console.log("   expected:", JSON.stringify(expected));
    failed++;
  } else {
    passed++;
  }
}

// ── Layer 1: Shared ────────────────────────────────────────────────────────
console.log("\n── Layer 1: Shared ──");

assert("NFKC fullwidth digits",
  TrustNormalizer.sharedLayer("４１１１２２２２３３３３４４４４"),
  "4111222233334444");

assert("NFKC ligature fi → fi",
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
  TrustNormalizer.sharedLayer("line1\r\nline2"),
  "line1\nline2");

assert("Line endings: CR → LF",
  TrustNormalizer.sharedLayer("line1\rline2"),
  "line1\nline2");

assert("Trim leading/trailing spaces",
  TrustNormalizer.sharedLayer("   hello world   "),
  "hello world");

assert("Trim leading/trailing newlines",
  TrustNormalizer.sharedLayer("\n\nhello\n\n"),
  "hello");

// ── Layer 2: Linguistic ────────────────────────────────────────────────────
console.log("\n── Layer 2: Linguistic ──");

assert("Smart single quote right →  '",
  TrustNormalizer.linguisticLayer("it\u2019s").text,
  "it's");

assert("Smart single quote left → '",
  TrustNormalizer.linguisticLayer("\u2018hello\u2019").text,
  "'hello'");

assert("Smart double quotes → \"\"",
  TrustNormalizer.linguisticLayer("\u201Chello\u201D").text,
  '"hello"');

assert("En dash → hyphen",
  TrustNormalizer.linguisticLayer("2024\u20132025").text,
  "2024-2025");

assert("Em dash → hyphen",
  TrustNormalizer.linguisticLayer("word\u2014word").text,
  "word-word");

assert("Minus sign → hyphen",
  TrustNormalizer.linguisticLayer("100\u2212200").text,
  "100-200");

assert("NBSP → space",
  TrustNormalizer.linguisticLayer("hello\u00A0world").text,
  "hello world");

assert("Thin space → space",
  TrustNormalizer.linguisticLayer("hello\u2009world").text,
  "hello world");

assert("Ideographic space → space",
  TrustNormalizer.linguisticLayer("hello\u3000world").text,
  "hello world");

assert("Consecutive spaces collapsed",
  TrustNormalizer.linguisticLayer("hello   world").text,
  "hello world");

assert("Newlines preserved through space collapse",
  TrustNormalizer.linguisticLayer("line1\nline2").text,
  "line1\nline2");

assert("ALL-CAPS converts (wasCapsConverted: true)",
  TrustNormalizer.linguisticLayer("PLEASE SEND YOUR FULL NAME AND ADDRESS"),
  { text: "Please send your full name and address", wasCapsConverted: true });

assert("ALL-CAPS: sentence boundary capitalised",
  TrustNormalizer.linguisticLayer("HELLO WORLD. HOW ARE YOU?"),
  { text: "Hello world. How are you?", wasCapsConverted: true });

assert("ALL-CAPS: standalone I restored",
  TrustNormalizer.linguisticLayer("I AM GOING TO SEND THIS NOW"),
  { text: "I am going to send this now", wasCapsConverted: true });

assert("Short ALL-CAPS — no conversion (≤10 chars)",
  TrustNormalizer.linguisticLayer("OK").wasCapsConverted,
  false);

assert("Mixed case — no conversion",
  TrustNormalizer.linguisticLayer("Hello World").wasCapsConverted,
  false);

// ── Full pipeline ──────────────────────────────────────────────────────────
console.log("\n── Full pipeline ──");

assert("NFKC + invisible + CAPS",
  TrustNormalizer.normalize("MY CARD ４１１１\u200B２２２２"),
  { text: "My card 41112222", wasCapsConverted: true });

assert("Smart quotes in normal text",
  TrustNormalizer.normalize("She said \u201Cplease help\u201D"),
  { text: 'She said "please help"', wasCapsConverted: false });

assert("CRLF + smart quotes",
  TrustNormalizer.normalize("line1\r\nline2\u2019s"),
  { text: "line1\nline2's", wasCapsConverted: false });

assert("Empty string",
  TrustNormalizer.normalize(""),
  { text: "", wasCapsConverted: false });

assert("Null input",
  TrustNormalizer.normalize(null),
  { text: "", wasCapsConverted: false });

assert("Only whitespace",
  TrustNormalizer.normalize("   \t  \n  "),
  { text: "", wasCapsConverted: false });

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
