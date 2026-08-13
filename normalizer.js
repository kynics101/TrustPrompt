// normalizer.js — TrustPrompt text normalisation pipeline v0.0.6
//
// ══ ARCHITECTURE ══════════════════════════════════════════════════════════════
//
//   rawText
//     │
//     ▼
//   sharedLayer()          — NFKC, invisible unicode, CRLF→LF, trim
//     │
//     ├─ [copy 1]  masked            → returned as-is for UI display
//     │
//     ├─ [copy 2]  regexLayer()      → for Path A (regex + validator)
//     │              code-block isolation (newlines/indentation preserved)
//     │              digit-group separator protection (card / phone numbers)
//     │              smart quotes/dashes/exotic spaces → ASCII
//     │              prose whitespace collapse (newlines → space)
//     │              ALL-CAPS guard (prose only, not code)
//     │
//     └─ [copy 3]  linguisticLayer() → for Path B (gazetteer + Compromise NLP)
//                    smart quotes/dashes/exotic spaces → ASCII
//                    ALL whitespace → single space
//                    punctuation normalisation
//                    sentence boundary detection
//                    sentence case estimation   ← critical for Compromise
//                    ALL-CAPS guard
//
// ══ RETURN SHAPE ══════════════════════════════════════════════════════════════
//
//   normalize(rawText) →
//     {
//       masked:           string,   // shared layer output — for masked display
//       textRegex:        string,   // Path A input
//       textNLP:          string,   // Path B / Compromise input
//       wasCapsConverted: boolean   // true if ALL-CAPS guard fired
//     }
//
// ══ INDIVIDUAL LAYERS (exported for unit testing) ═════════════════════════════
//   sharedLayer(raw)          → string
//   regexLayer(shared)        → { text, wasCapsConverted }
//   linguisticLayer(shared)   → { text, wasCapsConverted }
//
// =============================================================================

/* global TrustNormalizer */

const TrustNormalizer = (() => {

  // ── LAYER 1: SHARED ──────────────────────────────────────────────────────────
  // Language-agnostic structural cleanup. Runs once; all three copies branch here.

  /**
   * Invisible / zero-width characters that carry no semantic meaning.
   *
   * U+00AD  SOFT HYPHEN
   * U+200B  ZERO WIDTH SPACE
   * U+200C  ZERO WIDTH NON-JOINER
   * U+200D  ZERO WIDTH JOINER
   * U+200E  LEFT-TO-RIGHT MARK
   * U+200F  RIGHT-TO-LEFT MARK
   * U+2060  WORD JOINER
   * U+2061–U+2064  INVISIBLE mathematical operators
   * U+206A–U+206F  deprecated formatting characters
   * U+FEFF  BYTE ORDER MARK / ZERO WIDTH NO-BREAK SPACE
   */
  const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060-\u2064\u206A-\u206F\uFEFF]/g;

  function sharedLayer(raw) {
    if (!raw || typeof raw !== "string") return "";
    return raw
      .normalize("NFKC")           // ﬁ→fi, ４→4, ²→2, fullwidth ASCII→ASCII
      .replace(INVISIBLE_RE, "")   // strip zero-width / invisible chars
      .replace(/\r\n/g, "\n")      // CRLF → LF
      .replace(/\r/g, "\n")        // lone CR → LF
      .trim();
  }

  // ── SHARED HELPERS ────────────────────────────────────────────────────────────

  /** Replace typographic quotes and dashes with ASCII equivalents. */
  function asciiPunctuation(str) {
    return str
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")          // single quotes → '
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')          // double quotes → "
      .replace(/[\u2010-\u2015\u2212]/g, "-")               // dashes + minus → -
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " "); // exotic spaces → space
  }

  /** Ratio of uppercase alpha chars to all alpha chars. */
  function uppercaseRatio(str) {
    const alpha = str.replace(/[^a-zA-Z]/g, "");
    if (!alpha.length) return 0;
    return str.replace(/[^A-Z]/g, "").length / alpha.length;
  }

  /**
   * Sentence case:
   *   - Lowercase everything
   *   - Capitalise after . ! ?
   *   - Restore standalone "I"
   */
  function toSentenceCase(str) {
    return str
      .toLowerCase()
      .replace(/^([a-z])/, c => c.toUpperCase())
      .replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase())
      .replace(/\bi\b/g, "I");
  }

  /**
   * ALL-CAPS guard: converts to sentence case when >70% of alpha chars are
   * uppercase AND text is longer than 10 chars.
   *
   * Special case: suppress if the text is a short label token like "TIN",
   * "SSS", "API" (≤4 uppercase letters optionally followed by non-alpha).
   * These are acronyms / ID labels that should stay uppercase.
   */
  function capsGuard(str) {
    // Suppress for short all-caps labels (e.g. "TIN: 123", "API key")
    if (/^[A-Z]{1,4}[^a-z]*$/.test(str.trim())) {
      return { text: str, wasCapsConverted: false };
    }
    const fire = str.length > 10 && uppercaseRatio(str) > 0.70;
    return { text: fire ? toSentenceCase(str) : str, wasCapsConverted: fire };
  }

  // ── LAYER 2a: REGEX ──────────────────────────────────────────────────────────
  // Prepares text for Path A (regex + validator.js).
  //
  // Design constraints:
  //   CODE BLOCKS  — ```…``` and long `…` must keep newlines/indentation.
  //   CARD NUMBERS — spaces/hyphens between digit groups must survive.
  //   TOKENS       — . _ - / + = @ : inside credentials must not be stripped.
  //   PROSE        — everything else flattened to single-space for clean matching.
  //
  // Placeholder characters chosen to be:
  //   • Outside normal ASCII so they never appear in real prompts
  //   • Not null bytes (which corrupt JS string operations)
  //   • Not in the NFKC / invisible strip sets above
  //   U+E000 §CODE_n§  (Private Use Area — safe placeholder)
  //   U+E001 §DS_n§    (digit-separator placeholder)

  const CODE_BLOCK_RE = /```[\s\S]*?```|`[^`\n]{10,}`/g;
  const CODE_PH_OPEN  = "\uE000";   // private-use open sentinel
  const CODE_PH_CLOSE = "\uE001";   // private-use close sentinel
  const DS_PH_OPEN    = "\uE002";
  const DS_PH_CLOSE   = "\uE003";

  function regexLayer(shared) {

    // Step 1 — Extract code blocks into a side-store.
    // Replace each block with a sentinel that includes its index.
    // We also preserve any leading/trailing newline that was adjacent to the
    // fence so the surrounding prose collapses cleanly around it.
    const codeBlocks = [];
    let prose = shared.replace(CODE_BLOCK_RE, (match) => {
      const idx = codeBlocks.length;
      codeBlocks.push(match);
      // Wrap placeholder in newlines so prose whitespace collapse doesn't
      // merge the surrounding text into the placeholder token.
      return `\n${CODE_PH_OPEN}${idx}${CODE_PH_CLOSE}\n`;
    });

    // Step 2 — ASCII punctuation on prose (sentinels are in PUA, untouched).
    prose = asciiPunctuation(prose);

    // Step 3 — Protect digit-group separators before whitespace collapse.
    // Matches a space or hyphen between two digit characters.
    // Covers: "4111 1111", "4111-1111", "+63 917", "0917 123"
    const digitSepStore = [];
    prose = prose.replace(/(\d)([ -])(\d)/g, (m) => {
      const idx = digitSepStore.length;
      digitSepStore.push(m);
      return `${DS_PH_OPEN}${idx}${DS_PH_CLOSE}`;
    });

    // Step 4 — Collapse all prose whitespace (including newlines) to one space.
    // The sentinels are single chars so they survive this intact.
    prose = prose.replace(/\s+/g, " ").trim();

    // Step 5 — Restore digit separators.
    prose = prose.replace(
      new RegExp(`${DS_PH_OPEN}(\\d+)${DS_PH_CLOSE}`, "g"),
      (_, i) => digitSepStore[Number(i)]
    );

    // Step 6 — ALL-CAPS guard on prose only (before reinserting code).
    const { text: guardedProse, wasCapsConverted } = capsGuard(prose);
    prose = guardedProse;

    // Step 7 — Reinsert code blocks at their sentinels.
    // Trim the single surrounding spaces the collapse left around sentinels.
    let result = prose.replace(
      new RegExp(` ?${CODE_PH_OPEN}(\\d+)${CODE_PH_CLOSE} ?`, "g"),
      (_, i) => "\n" + codeBlocks[Number(i)] + "\n"
    );

    // Clean up any double newlines introduced by the reinsertion
    result = result.replace(/\n{3,}/g, "\n\n").trim();

    return { text: result, wasCapsConverted };
  }

  // ── LAYER 2b: LINGUISTIC ─────────────────────────────────────────────────────
  // Prepares text for Path B (gazetteer + Compromise NLP).
  // Goal: well-formed English prose with correct capitalisation and sentence
  // boundaries so Compromise can reliably find names, job titles, and orgs.

  function linguisticLayer(shared) {
    let out = asciiPunctuation(shared);

    // Step 1 — Collapse ALL whitespace (incl. newlines) into a single space.
    // Compromise works on a flat prose string, not multi-line fragments.
    out = out.replace(/\s+/g, " ").trim();

    // Step 2 — Punctuation normalisation.
    out = out.replace(/([.!?])\1+/g,  "$1");          // "!!!" → "!"
    out = out.replace(/ ([,;:!?.])/g, "$1");           // "hello ," → "hello,"
    out = out.replace(/([,;:!?.])([a-zA-Z])/g, "$1 $2"); // "hello,world" → "hello, world"
    out = out.replace(/,\s+/g, ", ");                  // normalise comma-space

    // Step 3 — Sentence boundary detection (conservative).
    // Insert a "." when a lowercase word is followed by an uppercase word that
    // doesn't look like a proper-noun continuation of the same sentence.
    out = out.replace(/([a-z])( )([A-Z][a-z]{2,})/g, (full, end, sp, start) => {
      // Don't insert a period if preceded by a common verb (part of same sentence)
      const verbEnding = /\b(?:is|are|was|were|be|have|has|had|do|does|did|will|would|could|should|may|might|can|shall|tell|send|help|give|need|want|please|named?|called?)$/i;
      const prefix = full.slice(0, 1 + sp.length); // everything up to the uppercase word
      if (verbEnding.test(end)) return full;
      return end + "." + sp + start;
    });

    // Step 4 — Sentence case estimation.
    const { text: afterCaps, wasCapsConverted } = capsGuard(out);
    out = afterCaps;

    // Even if capsGuard didn't fire, ensure every sentence starts capitalised.
    // Skip the first char if it is a leading quote/bracket so capitalisation
    // lands on the actual first letter.
    out = out.replace(/^(["'(\[{]*)([a-z])/, (_, lead, c) => lead + c.toUpperCase());
    // Capitalise after sentence-ending punctuation
    out = out.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());

    return { text: out, wasCapsConverted };
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────────

  /**
   * Run the full normalisation pipeline.
   *
   * @param   {string} rawText
   * @returns {{
   *   masked:           string,
   *   textRegex:        string,
   *   textNLP:          string,
   *   wasCapsConverted: boolean
   * }}
   */
  function normalize(rawText) {
    if (!rawText || typeof rawText !== "string") {
      return { masked: "", textRegex: "", textNLP: "", wasCapsConverted: false };
    }
    const masked = sharedLayer(rawText);
    const { text: textRegex, wasCapsConverted: capsA } = regexLayer(masked);
    const { text: textNLP,   wasCapsConverted: capsB } = linguisticLayer(masked);
    return { masked, textRegex, textNLP, wasCapsConverted: capsA || capsB };
  }

  return { normalize, sharedLayer, regexLayer, linguisticLayer };

})();
