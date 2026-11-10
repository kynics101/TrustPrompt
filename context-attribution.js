// context-attribution.js
// Sentence-level codebook and decision logic for the Rule 2
// Sensitive-Context Co-occurrence check (governance-rules.md, Rule 2).
//
// WHAT THIS MODULE DECIDES
// ------------------------
// Rule 2 escalates only when, in the SAME SENTENCE, both of these are present:
//   (a) an eligible identifier (personal name, email, phone, PH address,
//       date of birth, card number, PH government ID) or a first-person
//       self-attribution anchor, and
//   (b) a sensitive context term (medical, financial, nationality).
//
// For each such sentence, in this order:
//   1. Positive attribution pattern matches  -> escalate (overrides exclusion)
//   2. Exclusion pattern matches             -> suppress escalation for this sentence
//   3. Otherwise                             -> escalate
//
// The module never changes detected entities or base scores. Its output only
// decides whether the Rule 2 escalation happens. The caller (scanner.js
// evaluateGovernance) still applies the level raise and the rule order.
//
// CODEBOOK
// --------
// POSITIVE_PATTERNS and EXCLUSION_PATTERNS are plain arrays so the codebook can
// be edited without touching the logic below. Each entry has:
//   id        unique key, written to the decision log
//   category  medical | financial | nationality | research | educational | general | hypothetical
//   pattern   RegExp tested against one sentence
//   termGap   (positive entries only) when true, the pattern must be followed by
//             at most two determiner/adjective words and then the context term,
//             e.g. "I have [diabetes]". Standalone entries (termGap false) match
//             without requiring a particular term.
//   excludeTerms (optional) context terms that must not satisfy this entry.
//
// Exposes (globalThis.ContextAttribution and module.exports):
//   evaluateCooccurrence(fullText, { triggerTexts, contextTexts, hasAnchor })
//   splitSentences(text)
//   POSITIVE_PATTERNS, EXCLUSION_PATTERNS (codebook, read-only by convention)

(function (root) {
  "use strict";

  // ── Codebook ──────────────────────────────────────────────────────────────

  // Determiner / adjective words allowed between a positive verb phrase and the
  // context term ("I have a severe [asthma]"). Deliberately short and closed:
  // "I have been researching [cancer]" must NOT count as attribution.
  const TERM_GAP_WORDS =
    "(?:a|an|the|some|my|his|her|their|mild|severe|chronic|acute|advanced|early|type\\s*\\d|stage\\s*\\d)";

  // Sentence-initial words that look like a capitalised name but are not a
  // person. Used by the case-sensitive third-person patterns.
  const NOT_A_PERSON =
    "(?!(?:This|That|These|Those|It|There|Which|What|Who|How|Research|Studies|Many|Some|Patients|Doctors|Students)\\b)";

  // Nationality-only terms. "I am Filipino" must not count as positive
  // attribution (manuscript rule). These terms are still scored normally.
  const NATIONALITY_ONLY_TERMS = ["filipino", "filipina", "pinoy", "pinay"];

  const POSITIVE_PATTERNS = [
    // ── Medical ─────────────────────────────────────────────────────────────
    { id: "med_pos_i_have",        category: "medical", termGap: true,
      pattern: /\bi(?:['’]ve|\s+have|\s+had)\b/i },
    { id: "med_pos_i_take",        category: "medical", termGap: true,
      pattern: /(?:\bi\s+take\b|\bi(?:\s+am|['’]m)\s+taking\b)/i },
    { id: "med_pos_my_diagnosis",  category: "medical", termGap: true,
      pattern: /\bmy\s+diagnosis\s+(?:is|was)\b/i },
    { id: "med_pos_i_diagnosed",   category: "medical", termGap: false,
      pattern: /\bi(?:\s+was|\s+were|\s+got|\s+am|['’]m|['’]ve\s+been|\s+have\s+been)\s+diagnosed\s+(?:with|for|as)\b/i },
    { id: "med_pos_pronoun_diagnosed", category: "medical", termGap: false,
      pattern: /\b(?:he|she|they)\s+(?:was|were|got|is|has\s+been)\s+diagnosed\s+(?:with|for|as)\b/i },
    { id: "med_pos_third_person_diagnosed", category: "medical", termGap: false,
      pattern: new RegExp(NOT_A_PERSON + "\\b[A-Z][a-z]+\\s+(?:was|were|got|is|has\\s+been)\\s+diagnosed\\s+(?:with|for|as)\\b") },
    { id: "med_pos_third_person_has", category: "medical", termGap: true,
      pattern: new RegExp(NOT_A_PERSON + "\\b[A-Z][a-z]+\\s+has\\b") },

    // ── Financial ───────────────────────────────────────────────────────────
    { id: "fin_pos_my_amount",     category: "financial", termGap: false,
      pattern: /\bmy\s+(?:salary|loan|debt|income)\s+(?:is|was|of)\b/i },
    { id: "fin_pos_i_owe_earn",    category: "financial", termGap: false,
      pattern: /\bi\s+(?:owe|earn)\b/i },
    { id: "fin_pos_third_person_possessive", category: "financial", termGap: false,
      pattern: new RegExp(NOT_A_PERSON + "\\b[A-Z][a-z]+(?:['’]s)?\\s+(?:salary|loan|debt|income)\\s+(?:is|was)\\b") },
    { id: "fin_pos_third_person_owes", category: "financial", termGap: false,
      pattern: new RegExp(NOT_A_PERSON + "\\b[A-Z][a-z]+\\s+owes\\b") },

    // ── Nationality (context indicator) ─────────────────────────────────────
    { id: "nat_pos_i_am",          category: "nationality", termGap: true,
      excludeTerms: NATIONALITY_ONLY_TERMS,
      pattern: /\bi(?:\s+am|['’]m)\b/i },
    { id: "nat_pos_my_ethnicity",  category: "nationality", termGap: true,
      pattern: /\bmy\s+(?:ethnicity|ethnic\s+group)\s+(?:is|was)\b/i },
  ];

  const EXCLUSION_PATTERNS = [
    // Research / academic reference
    { id: "excl_research", category: "research",
      pattern: /\b(?:researching|studying|investigating|conducting\s+research|school\s+project|thesis|dissertation|assignment|coursework|research\s+(?:on|about|paper))\b/i },
    // Educational / informational inquiry
    { id: "excl_educational", category: "educational",
      pattern: /\b(?:what\s+is|what\s+are|explain|define|definition\s+of|how\s+does|how\s+do|causes?\s+of|symptoms?\s+of|tell\s+me\s+about|reading\s+about|learning\s+about)\b/i },
    // General discussion
    { id: "excl_general", category: "general",
      pattern: /\b(?:commonly\s+affects|refers?\s+to|is\s+defined\s+as|are\s+defined\s+as|examples?\s+of|generally\s+known\s+as)\b/i },
    // Hypothetical reference
    { id: "excl_hypothetical", category: "hypothetical",
      pattern: /\b(?:imagine\s+if|suppose\s+that|for\s+example|hypothetically|let's\s+say|what\s+if)\b/i },
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────

  const WORD_CHAR = "A-Za-z0-9\\u00C0-\\u024F";

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Turns a term such as "heart  disease" into a regex that tolerates any
  // whitespace between its words.
  function termSource(term) {
    return term.trim().split(/\s+/).map(escapeRegex).join("\\s+");
  }

  function containsTerm(sentence, term) {
    const re = new RegExp("(?<![" + WORD_CHAR + "])" + termSource(term) + "(?![" + WORD_CHAR + "])", "i");
    return re.test(sentence);
  }

  // Builds the term-anchored form of a positive entry:
  //   <entry pattern> <optional determiner run> <term>
  function termGapRegex(entry, term) {
    return new RegExp(
      "(?:" + entry.pattern.source + ")\\s+(?:" + TERM_GAP_WORDS + "\\s+){0,2}" +
      "(?<![" + WORD_CHAR + "])" + termSource(term) + "(?![" + WORD_CHAR + "])",
      entry.pattern.flags
    );
  }

  // Splits on ., !, ? followed by whitespace, and on newlines. Does not split
  // after a few common abbreviations ("Dr. Santos has diabetes" stays one
  // sentence).
  function splitSentences(text) {
    if (!text || typeof text !== "string") return [];
    return text
      .split(/(?<!\b(?:Dr|Mr|Mrs|Ms|Jr|Sr|St|vs|etc|e\.g|i\.e)\.)(?<=[.!?])\s+|\n+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Returns the first positive entry that matches the sentence, or null.
  function matchPositive(sentence, contextTermsInSentence) {
    for (const entry of POSITIVE_PATTERNS) {
      if (!entry.termGap) {
        if (entry.pattern.test(sentence)) return entry;
        continue;
      }
      for (const term of contextTermsInSentence) {
        if (entry.excludeTerms && entry.excludeTerms.includes(term.toLowerCase())) continue;
        if (termGapRegex(entry, term).test(sentence)) return entry;
      }
    }
    return null;
  }

  // Returns the first exclusion entry that matches the sentence, or null.
  function matchExclusion(sentence) {
    for (const entry of EXCLUSION_PATTERNS) {
      if (entry.pattern.test(sentence)) return entry;
    }
    return null;
  }

  function unique(values) {
    const seen = new Set();
    const out = [];
    for (const v of values || []) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  function decide(escalate, rule, sentence, entry) {
    return {
      escalate: escalate,
      rule: rule,                       // positive_attribution | no_exclusion | exclusion_suppressed | no_cooccurrence | no_context
      patternId: entry ? entry.id : null,
      category: entry ? entry.category : null,
      polarity: entry ? (POSITIVE_PATTERNS.includes(entry) ? "positive" : "exclusion") : null,
      sentence: sentence,
    };
  }

  // ── Main decision ─────────────────────────────────────────────────────────
  //
  // fullText      raw prompt text
  // triggerTexts  rawMatch strings of eligible identifier findings (Rule 2 triggers)
  // contextTexts  rawMatch strings of sensitive context findings
  // hasAnchor     (sentence) => boolean, first-person self-attribution test
  //
  // Returns { escalate, rule, patternId, category, polarity, sentence }.
  // The first sentence that escalates wins. Exclusions only suppress the
  // sentence they match, so an exclusion in one sentence never hides a
  // disclosure in another.
  function evaluateCooccurrence(fullText, opts) {
    const options = opts || {};
    const triggers = unique(options.triggerTexts);
    const contexts = unique(options.contextTexts);
    const hasAnchor = typeof options.hasAnchor === "function" ? options.hasAnchor : () => false;

    if (!fullText || contexts.length === 0) {
      return decide(false, "no_context", null, null);
    }

    let sentences = splitSentences(fullText);
    // If no context term can be located in any sentence (for example, the
    // detector's rawMatch was normalised differently), evaluate the prompt as
    // one unit instead of silently dropping the co-occurrence.
    if (!contexts.some(t => sentences.some(s => containsTerm(s, t)))) {
      sentences = [fullText];
    }

    let suppressed = null;
    for (const sentence of sentences) {
      const contextHere = contexts.filter(t => containsTerm(sentence, t));
      if (contextHere.length === 0) continue;

      const identifierHere = triggers.some(t => containsTerm(sentence, t)) || !!hasAnchor(sentence);
      if (!identifierHere) continue;

      const positive = matchPositive(sentence, contextHere);
      if (positive) return decide(true, "positive_attribution", sentence, positive);

      const exclusion = matchExclusion(sentence);
      if (exclusion) {
        if (!suppressed) suppressed = { sentence, entry: exclusion };
        continue;
      }

      return decide(true, "no_exclusion", sentence, null);
    }

    if (suppressed) return decide(false, "exclusion_suppressed", suppressed.sentence, suppressed.entry);
    return decide(false, "no_cooccurrence", null, null);
  }

  const api = {
    evaluateCooccurrence: evaluateCooccurrence,
    splitSentences: splitSentences,
    POSITIVE_PATTERNS: POSITIVE_PATTERNS,
    EXCLUSION_PATTERNS: EXCLUSION_PATTERNS,
  };

  // ── Universal export (window / worker self / Node) ────────────────────────
  root.ContextAttribution = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(
  typeof globalThis !== "undefined" ? globalThis
    : typeof self !== "undefined" ? self
    : typeof window !== "undefined" ? window
    : this
);
