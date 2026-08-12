// normalizer.js — TrustPrompt text normalisation pipeline
//
// Two-layer architecture:
//
//   LAYER 1 — SHARED (always runs, language-agnostic)
//     • Unicode NFKC normalisation
//     • Remove invisible / zero-width unicode characters
//     • Normalize line endings  (CRLF / CR → LF)
//     • Trim leading and trailing whitespace
//
//   LAYER 2 — LINGUISTIC (always runs after Layer 1)
//     • Smart quote → ASCII quote
//     • En/em dash → hyphen
//     • Non-breaking and exotic spaces → regular space
//     • Collapse consecutive inline whitespace (preserve newlines)
//     • ALL-CAPS guard: if >70% alpha chars are uppercase, convert to
//       sentence case so downstream regex and NLP work reliably
//
// Return shape (unchanged for callers):
//   { text: string, wasCapsConverted: boolean }

/* global TrustNormalizer */

const TrustNormalizer = (() => {

  // ── Layer 1 — Shared ───────────────────────────────────────────────────────

  /**
   * Invisible / zero-width characters that should be stripped entirely.
   *
   * U+200B  ZERO WIDTH SPACE
   * U+200C  ZERO WIDTH NON-JOINER
   * U+200D  ZERO WIDTH JOINER
   * U+200E  LEFT-TO-RIGHT MARK
   * U+200F  RIGHT-TO-LEFT MARK
   * U+FEFF  BYTE ORDER MARK / ZERO WIDTH NO-BREAK SPACE
   * U+00AD  SOFT HYPHEN
   * U+2060  WORD JOINER
   * U+2061–U+2064  INVISIBLE mathematical operators
   * U+206x  various deprecated formatting characters
   */
  const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060-\u2064\u206A-\u206F\uFEFF]/g;

  function sharedLayer(raw) {
    return raw
      // 1a. NFKC: decomposes compatibility characters (e.g. ﬁ → fi, ² → 2,
      //     fullwidth ASCII → ASCII) and then recomposes canonically.
      .normalize("NFKC")
      // 1b. Strip invisible / zero-width control characters
      .replace(INVISIBLE_RE, "")
      // 1c. Normalise line endings: CRLF and lone CR → LF
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // 1d. Trim leading and trailing whitespace (including newlines)
      .trim();
  }

  // ── Layer 2 — Linguistic ───────────────────────────────────────────────────

  /**
   * Count the ratio of uppercase alpha characters in a string.
   * Ignores digits, punctuation, and whitespace.
   */
  function uppercaseRatio(str) {
    const alpha = str.replace(/[^a-zA-Z]/g, "");
    if (alpha.length === 0) return 0;
    return str.replace(/[^A-Z]/g, "").length / alpha.length;
  }

  /**
   * Convert a string to sentence case:
   *   - Lowercase everything
   *   - Capitalise the first letter of each sentence (after . ! ?)
   *   - Restore standalone "I"
   *
   * Intentionally conservative — does not capitalise proper nouns
   * because no NLP context is available here.
   */
  function toSentenceCase(str) {
    return str
      .toLowerCase()
      .replace(/^([a-z])/, (c) => c.toUpperCase())
      .replace(/([.!?]\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase())
      .replace(/\bi\b/g, "I");
  }

  function linguisticLayer(str) {
    let out = str
      // 2a. Smart / curly quotes → ASCII equivalents
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // single variants → '
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // double variants → "
      // 2b. Dashes → hyphen-minus
      .replace(/[\u2010-\u2015\u2212]/g, "-")        // various dashes + minus sign
      // 2c. Non-breaking and other exotic space variants → regular space
      //     (U+00A0 NBSP, U+202F NARROW NBSP, U+3000 IDEOGRAPHIC SPACE, etc.)
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      // 2d. Collapse consecutive inline whitespace; preserve intentional newlines
      .replace(/[^\S\n]+/g, " ");

    // 2e. ALL-CAPS guard
    // Threshold: >70% uppercase alpha AND text longer than 10 chars
    // (avoids false-positives on short strings like "OK" or "TIN").
    const wasCapsConverted = out.length > 10 && uppercaseRatio(out) > 0.70;
    if (wasCapsConverted) {
      out = toSentenceCase(out);
    }

    return { text: out, wasCapsConverted };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run the full normalisation pipeline on raw DOM text.
   *
   * @param   {string} rawText
   * @returns {{ text: string, wasCapsConverted: boolean }}
   */
  function normalize(rawText) {
    if (!rawText || typeof rawText !== "string") {
      return { text: "", wasCapsConverted: false };
    }
    const afterShared = sharedLayer(rawText);
    return linguisticLayer(afterShared);
  }

  // Expose individual layers for unit-testing and the worker's internal use.
  return { normalize, sharedLayer, linguisticLayer };

})();
