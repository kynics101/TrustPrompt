// normalizer.js
// LAYER 1 — Global text normalisation.
//
// Runs ONCE on the raw DOM text before it is handed to either
// Path A (regex) or Path B (gazetteer + NLP).
//
// What this layer does:
//   FIX #1 — ALL-CAPS detection: if the message is dominated by uppercase
//             characters, convert the whole message to sentence case so
//             that downstream pattern matching and NLP work reliably.
//
// What this layer deliberately does NOT do:
//   - Fix lowercase names       → needs trigger-phrase context (Path B)
//   - Fix typos                 → needs fuzzy matching (Path B)
//   - Re-add missing punctuation → needs semantic context (Path B)
//
// All four fixes are noted in comments so the logic stays clear.

/* global TrustNormalizer */

const TrustNormalizer = (() => {

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Count the ratio of uppercase alpha characters in a string.
   * Ignores digits, punctuation, and whitespace.
   */
  function uppercaseRatio(str) {
    const alpha = str.replace(/[^a-zA-Z]/g, "");
    if (alpha.length === 0) return 0;
    const upper = str.replace(/[^A-Z]/g, "");
    return upper.length / alpha.length;
  }

  /**
   * Convert a string to sentence case:
   *   - Lowercase everything
   *   - Capitalise the first letter of each sentence (after . ! ?)
   *   - Capitalise the word "I" when standalone
   *
   * This is intentionally conservative — it does NOT try to capitalise
   * proper nouns because it has no NLP context here.
   */
  function toSentenceCase(str) {
    return str
      .toLowerCase()
      // Capitalise first character
      .replace(/^([a-z])/, (c) => c.toUpperCase())
      // Capitalise after sentence-ending punctuation + whitespace
      .replace(/([.!?]\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase())
      // Restore standalone "i" → "I"
      .replace(/\bi\b/g, "I");
  }

  // ── Unicode cleanup (runs unconditionally) ───────────────────────────────────

  /**
   * Normalise unicode, smart quotes, em-dashes, and whitespace.
   * This always runs regardless of casing.
   */
  function unicodeClean(str) {
    return str
      .normalize("NFC")
      .replace(/[\u2018\u2019]/g, "'")   // smart single quotes → '
      .replace(/[\u201C\u201D]/g, '"')   // smart double quotes → "
      .replace(/[\u2013\u2014]/g, "-")   // en/em dash → hyphen
      .replace(/\u00A0/g, " ")           // non-breaking space → regular space
      .replace(/[^\S\n]+/g, " ")         // collapse inline whitespace (keep newlines)
      .trim();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Run Layer 1 normalisation on raw DOM text.
   *
   * @param {string} rawText  - text as extracted directly from the DOM element
   * @returns {{ text: string, wasCapsConverted: boolean }}
   *   text             - cleaned text ready for Path A and Path B
   *   wasCapsConverted - true if ALL-CAPS conversion was applied (FIX #1)
   */
  function normalize(rawText) {
    if (!rawText || typeof rawText !== "string") {
      return { text: "", wasCapsConverted: false };
    }

    // Step 1 — unicode cleanup (always)
    let text = unicodeClean(rawText);

    // Step 2 — FIX #1: ALL-CAPS guard
    // Threshold: >70% of alpha characters are uppercase AND the text is
    // longer than 10 chars (avoid false-positives on short things like "OK").
    const wasCapsConverted = text.length > 10 && uppercaseRatio(text) > 0.70;
    if (wasCapsConverted) {
      text = toSentenceCase(text);
    }

    // NOTE: FIX #2 (lowercase names), FIX #3 (no punctuation boundary),
    // FIX #4 (typos) are all handled in Path B (gazetteer.js) where
    // trigger-phrase context is available.

    return { text, wasCapsConverted };
  }

  return { normalize };

})();
