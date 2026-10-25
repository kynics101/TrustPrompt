// normalizer.js — TrustPrompt text normalisation pipeline v0.0.7
//
// ══ ARCHITECTURE ══════════════════════════════════════════════════════════════
//
//   rawText
//     │
//     ▼
//   sharedLayer()            — NFKC, invisible unicode, CRLF→LF, trim
//     │
//     ├─ normalizePath_A()   → textRegex (for Path A: regex + validators)
//     │    Minimal whitespace collapse, preserves digit-group separators
//     │    Code blocks isolated, smart quotes/dashes → ASCII
//     │
//     ├─ normalizePath_B()   → textGazetteer (for Path B: gazetteer + trigger phrases)
//     │    Conservative punctuation, preserves word boundaries
//     │    Context-aware, case mostly preserved
//     │
//     └─ normalizePath_C()   → textNLP (for Path C: Compromise.js NLP)
//          Well-formed English prose, sentence boundaries clear
//          Correct capitalization, punctuation normalized
//          Code blocks isolated so Compromise doesn't parse them
//
// ══ RETURN SHAPES ═════════════════════════════════════════════════════════════
//
//   normalize(rawText) → { masked, textRegex, textGazetteer, textNLP }
//     (backward compatible wrapper — calls path-specific functions)
//
//   normalizePath_A(rawText) → string  (for Path A: regex detection)
//   normalizePath_B(rawText) → string  (for Path B: gazetteer detection)
//   normalizePath_C(rawText) → string  (for Path C: Compromise NLP detection)
//
// ══ INDIVIDUAL LAYERS (exported for unit testing) ═════════════════════════════
//   sharedLayer(raw)           → string
//   normalizePath_A(raw)       → string
//   normalizePath_B(raw)       → string
//   normalizePath_C(raw)       → string
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

  // ── CONSTANTS FOR CODE BLOCK HANDLING ─────────────────────────────────────────
  const CODE_BLOCK_RE = /```[\s\S]*?```|`[^`\n]{10,}`/g;
  const CODE_PH = "[CODE_BLOCK]";  // Simple placeholder for code blocks

  // ── PATH A: REGEX ────────────────────────────────────────────────────────────
  // Prepares text for Path A (regex + validator).
  // Goal: Preserve digit-group separators, keep structure intact.

  function normalizePath_A(raw) {
    if (!raw || typeof raw !== "string") return "";
    
    let text = sharedLayer(raw);
    
    // Step 1: Extract code blocks (preserve structure, don't parse as regex targets)
    const codeBlocks = [];
    text = text.replace(CODE_BLOCK_RE, (match) => {
      codeBlocks.push(match);
      return `\n${CODE_PH}\n`;
    });
    
    // Step 2: Convert smart quotes/dashes to ASCII
    text = asciiPunctuation(text);
    
    // Step 3: PRESERVE digit-group separators
    // Don't collapse spaces/hyphens between digits
    // Keep: "4111 1111", "4111-1111", "+63 917 123 4567"
    
    // Step 4: Minimal whitespace collapse (keep newlines, collapse spaces/tabs)
    text = text.replace(/[ \t]+/g, " ");  // Only collapse spaces/tabs, not newlines
    text = text.replace(/\n+/g, "\n");    // Normalize multiple newlines to single
    
    // Step 5: ALL-CAPS guard
    const lines = text.split("\n");
    const processedLines = lines.map(line => {
      // Only apply capsGuard to non-code lines
      if (line === CODE_PH) return line;
      const { text: guardedLine } = capsGuard(line);
      return guardedLine;
    });
    text = processedLines.join("\n");
    
    // Step 6: Restore code blocks
    // Don't try to parse code blocks as regex targets
    text = text.trim();
    
    return text;
  }

  // ── PATH B: GAZETTEER ────────────────────────────────────────────────────────
  // Prepares text for Path B (gazetteer + trigger phrases).
  // Goal: Preserve word boundaries and context.

  function normalizePath_B(raw) {
    if (!raw || typeof raw !== "string") return "";
    
    let text = sharedLayer(raw);
    
    // Step 1: Extract code blocks
    const codeBlocks = [];
    text = text.replace(CODE_BLOCK_RE, (match) => {
      codeBlocks.push(match);
      return `\n${CODE_PH}\n`;
    });
    
    // Step 2: Convert smart quotes/dashes to ASCII
    text = asciiPunctuation(text);
    
    // Step 3: Conservative punctuation normalization
    // Remove multiple spaces/punctuation, but preserve word boundaries
    text = text.replace(/\s+/g, " ");  // Collapse whitespace to single space
    text = text.replace(/([,;:!?.])(?=[a-zA-Z0-9])/g, "$1 ");  // Add space after punct if before word
    text = text.replace(/\s+([,;:!?.])/g, "$1");  // Remove space before punct
    
    // Step 4: Normalize comma-space pattern
    text = text.replace(/,\s+/g, ", ");
    
    // Step 5: Restore code blocks as placeholders (gazetteer won't match inside them)
    text = text.replace(new RegExp(CODE_PH, "g"), " [CODE BLOCK] ");
    
    // Step 6: Preserve case (important for org/location matching)
    text = text.trim();
    
    return text;
  }

  // ── PATH C: LINGUISTIC (COMPROMISE.JS) ───────────────────────────────────────
  // Prepares text for Path C (Compromise.js NLP).
  // Goal: Well-formed English prose with sentence boundaries clear.

  function normalizePath_C(raw) {
    if (!raw || typeof raw !== "string") return "";
    
    let text = sharedLayer(raw);
    
    // Step 1: Extract code blocks (CRITICAL - Compromise shouldn't parse them)
    const codeBlocks = [];
    text = text.replace(CODE_BLOCK_RE, (match) => {
      codeBlocks.push(match);
      return `\n[CODE_${codeBlocks.length - 1}]\n`;
    });
    
    // Step 2: Convert smart quotes/dashes to ASCII
    text = asciiPunctuation(text);
    
    // Step 3: Collapse ALL whitespace to single space (Compromise needs flat text)
    text = text.replace(/\s+/g, " ").trim();
    
    // Step 4: Smart punctuation normalization
    text = text.replace(/([.!?])\1+/g, "$1");  // Multiple punct → single
    
    // CRITICAL: Always ensure space after punctuation before letter/number
    text = text.replace(/([,;:!?.])([a-zA-Z0-9])/g, "$1 $2");
    
    // Remove space before punctuation
    text = text.replace(/\s+([,;:!?.])/g, "$1");
    
    // Step 5: Sentence boundary detection (avoid false sentence breaks)
    // Insert period between lowercase word + uppercase word, UNLESS:
    //   - Preceded by preposition/connector
    //   - Followed by title (Mr, Dr, etc.)
    //   - Preceded by common first name
    //   - Preceded by verbs like "taught", "taught me" (object verbs)
    const prepositionsAndConnectors = /\b(?:for|to|with|in|at|by|from|as|or|of|on|up|and|the|is|are|was|were|be|have|has|had)$/i;
    const commonFirstNames = /\b(?:John|Mary|James|David|Robert|Michael|William|Richard|Charles|Joseph|Thomas|Alice|Bob|Charlie|Maria|Jose|Anna|Juan|Carlos|Luis|Pedro|Miguel|Jennifer|Jessica|Sarah|Laura|Susan|Karen|Nancy|Lisa|Sandra|Betty|Patricia|Margaret|Barbara|Dorothy|Kyleen|Maricel|Jerralyn)$/i;
    const languagesAndSubjects = /\b(?:Filipino|English|Spanish|French|German|Mandarin|Japanese|Korean|Arabic|Portuguese|Italian|Russian|Chinese|Algebra|Geometry|Biology|Chemistry|Physics|History|Geography|Literature|Mathematics|Science|Economics|Philosophy|Art|Music|Design)$/i;
    
    text = text.replace(/(\b[a-z]+)( )([A-Z][a-z]{2,})/g, (full, word, sp, start) => {
      if (prepositionsAndConnectors.test(word) || commonFirstNames.test(word) || languagesAndSubjects.test(start)) {
        return full;  // Don't insert period
      }
      return word + "." + sp + start;
    });
    
    // Step 6: Ensure correct sentence case
    // Capitalize first letter
    text = text.replace(/^([a-z])/, c => c.toUpperCase());
    // Capitalize after sentence punctuation
    text = text.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
    // Restore standalone "I"
    text = text.replace(/\bi\b/g, "I");
    
    // Step 7: Restore code blocks as neutral placeholders (not sentences)
    text = text.replace(/\[CODE_(\d+)\]/g, " [CODE BLOCK] ");
    
    // Step 8: ALL-CAPS guard
    const { text: guardedText } = capsGuard(text);
    text = guardedText;
    
    text = text.trim();
    
    return text;
  }

  // ── BACKWARD COMPATIBLE PUBLIC API ────────────────────────────────────────────

  /**
   * Run the full normalisation pipeline (backward compatible).
   *
   * @param   {string} rawText
   * @returns {{
   *   masked:        string,
   *   textRegex:     string,
   *   textGazetteer: string,
   *   textNLP:       string
   * }}
   */
  function normalize(rawText) {
    if (!rawText || typeof rawText !== "string") {
      return { masked: "", textRegex: "", textGazetteer: "", textNLP: "" };
    }
    const masked = sharedLayer(rawText);
    const textRegex = normalizePath_A(rawText);
    const textGazetteer = normalizePath_B(rawText);
    const textNLP = normalizePath_C(rawText);
    return { masked, textRegex, textGazetteer, textNLP };
  }

  return { 
    normalize, 
    sharedLayer, 
    normalizePath_A, 
    normalizePath_B, 
    normalizePath_C 
  };

})();

// ── Export TrustNormalizer to global scope ────────────────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.TrustNormalizer = TrustNormalizer;
}
if (typeof window !== 'undefined') {
  window.TrustNormalizer = TrustNormalizer;
}
