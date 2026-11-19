// context-attribution.js
// Shared Rule 2 Sensitive-Context Co-occurrence logic (governance-rules.md, Rule 2).
// This is the only copy of the Rule 2 decision logic. scanner.js and
// trust-worker.js both call evaluateCooccurrence() and must not keep their own.
//
// PER-SENTENCE DECISION (first match wins, sentence by sentence)
// -------------------------------------------------------------
// 1. Medical anchor (Medical Anchor Rule codebook): a medical term passes
//    steps 1–5 in the SAME sentence -> escalate. Exclusion phrases cannot
//    suppress it.
// 2. Candidate sentence: a Rule 2 trigger (valid personal identifier) in the
//    same sentence as a financial, medical or nationality term, or a
//    nationality anchor in the same sentence as a nationality term.
//    Financial terms never use an anchor.
// 3. Nationality positive attribution (nat_pos_*) -> escalate, overrides exclusion.
// 4. Exclusion phrase -> suppress escalation for this sentence only.
// 5. Otherwise -> escalate.
//
// SENTENCE SCOPE FOR ALL CATEGORIES
// -----------------------------------
// Medical, financial and nationality co-occurrence all require the trigger or
// anchor and the context term in the same sentence. There is no document-level
// fallback, so a name in one sentence never escalates a term in another.
//
// The module never changes detected entities or base scores. Its output only
// decides whether the Rule 2 escalation happens.
//
// Exposes (globalThis.ContextAttribution and module.exports):
//   evaluateCooccurrence(fullText, { triggerTexts, contexts })
//     contexts: [{ text, category }] where category is medical | financial | nationality
//   categoryForPatternId(patternId)  -> "medical" | "financial" | "nationality" | null
//   hasNationalityAnchor(sentence)
//   evaluateMedicalAnchor(sentence, medicalTerms)
//   splitSentences(text)

(function (root) {
  "use strict";

  const WORD_CHAR = "A-Za-z0-9\\u00C0-\\u024F";
  const NOT_WORD_AFTER = "(?![" + WORD_CHAR + "])";
  const NOT_WORD_BEFORE = "(?<![" + WORD_CHAR + "])";

  // ── Context category mapping ──────────────────────────────────────────────
  const CONTEXT_CATEGORY_BY_ID = {
    gazetteer_medical:   "medical",
    trigger_health:      "medical",
    gazetteer_financial: "financial",
    trigger_financial:   "financial",
    gazetteer_nationality: "nationality",
  };

  function categoryForPatternId(patternId) {
    return Object.prototype.hasOwnProperty.call(CONTEXT_CATEGORY_BY_ID, patternId)
      ? CONTEXT_CATEGORY_BY_ID[patternId]
      : null;
  }

  // ── Nationality codebook ──────────────────────────────────────────────────

  // Determiner / adjective words allowed between a positive verb phrase and the
  // context term ("I am a [Filipino]"). Deliberately short and closed.
  const TERM_GAP_WORDS =
    "(?:a|an|the|some|my|his|her|their|mild|severe|chronic|acute|advanced|early|type\\s*\\d|stage\\s*\\d)";

  // Nationality-only terms. "I am Filipino" must not count as positive
  // attribution (manuscript rule).
  const NATIONALITY_ONLY_TERMS = ["filipino", "filipina", "pinoy", "pinay"];

  // Sentence-level nationality anchors (not used at document level).
  const NATIONALITY_ANCHORS = [
    /\bi\s+am\s+(?:a|an)\b.*\b(?:catholic|muslim|christian|buddhist|filipino|ilocano|cebuano|bicolano|tagalog|kapampangan|bisaya)\b/i,
    /\bi['’]m\s+(?:a|an)\b.*\b(?:catholic|muslim|christian|buddhist|filipino|ilocano|cebuano|bicolano|tagalog|kapampangan|bisaya)\b/i,
    /\bmy\s+(?:ethnicity|nationality|religion|race)\s+(?:is|was)\b/i,
  ];

  // Nationality positive attribution. Overrides the exclusion filter.
  // Medical and financial attribution is handled by the anchor codebook below
  // (medical) or is not overridable (financial).
  const POSITIVE_PATTERNS = [
    { id: "nat_pos_i_am",         category: "nationality", termGap: true,
      excludeTerms: NATIONALITY_ONLY_TERMS,
      pattern: /\bi(?:\s+am|['’]m)\b/i },
    { id: "nat_pos_my_ethnicity", category: "nationality", termGap: true,
      pattern: /\bmy\s+(?:ethnicity|ethnic\s+group)\s+(?:is|was)\b/i },
  ];

  // ── Medical Anchor Rule codebook (approved; see governance-rules.md) ──────

  // Closed anchor list. Contractions are expanded before matching.
  const MEDICAL_ANCHOR_FORMS = [
    { id: "med_anchor_have",         source: "\\bi\\s+(?:have|had)\\b" },
    { id: "med_anchor_diagnosed",    source: "\\bi\\s+(?:am|was|were|got|have\\s+been)\\s+diagnosed\\s+(?:with|for|as)\\b" },
    { id: "med_anchor_take",         source: "\\bi\\s+(?:take|am\\s+taking|am\\s+on)\\b" },
    { id: "med_anchor_living",       source: "\\bi\\s+(?:am\\s+)?living\\s+with\\b" },
    { id: "med_anchor_my_diagnosis", source: "\\bmy\\s+(?:diagnosis|condition)\\s+is\\b" },
    { id: "med_anchor_adjective",    source: "\\bi\\s+am\\b" },   // "I am [condition adjective]"
  ];

  // Qualifiers allowed between the anchor and the term (step 4).
  const MED_QUALIFIERS = "(?:a|an|type|1|2|stage|chronic|severe|mild|had|been)";

  // Role or event nouns that make the term a compound, not a disclosure (step 5).
  const MED_NOUN_COMPOUND_RE = new RegExp(
    "^[\\s-]*(?:class|classes|exam|exams|seminar|seminars|researcher|researchers|nurse|nurses|" +
    "educator|educators|awareness|research|study|studies|program|programs|support\\s+group|support\\s+groups)" +
    NOT_WORD_AFTER, "i");

  // Veto patterns (step 3).
  const NEGATION_RE = /\b(?:not|never|no|neither|nor|without|don['’]?t|doesn['’]?t|didn['’]?t|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|can['’]?t|cannot|won['’]?t|haven['’]?t|hasn['’]?t|hadn['’]?t)\b/i;
  const HYPOTHETICAL_RE = /\b(?:if|suppose|imagine|pretend)\b/i;
  const UNCERTAIN_RE = /\b(?:not\s+sure|unsure|not\s+certain|whether)\b/i;
  const THIRD_PARTY_RE = /\b(?:he|she|they|his|her|hers|their|them|my\s+(?:mother|mom|mum|father|dad|son|daughter|child|children|kids?|husband|wife|partner|spouse|sister|brother|friend|aunt|uncle|grandmother|grandfather|grandma|grandpa|parents?|relatives?|family|cousin|niece|nephew|boss|colleague|patient|client|boyfriend|girlfriend|roommate|classmate|teacher|doctor))\b/i;
  const EMBEDDING_BEFORE_RE = /\b(?:think|thinks|thought|wonder|wondering|ask|asked|asking|know|knew|guess|guessing)\s+(?:(?:if|whether|that)\s+)?$/i;
  const INTERROGATIVE_START_RE = /^\s*(?:(?:so|and|but|then|well|oh)\s+)?(?:do|does|did|can|could|should|would|will|am|is|are|was|were|have|has|what|which|who|whom|whose|why|how|where|when)\b/i;
  const CLAUSE_BOUNDARY_RE = /[,;:]|\b(?:but|while|although|because|so|then|however|and|or|with|&)\b/gi;

  // ── Exclusion codebook (unchanged; applies to Rule 2 escalation only) ────
  const EXCLUSION_PATTERNS = [
    // Research / academic reference
    { id: "excl_research", category: "research",
      pattern: /\b(?:researching|studying|investigating|conducting\s+research|school\s+project|thesis|dissertation|assignment|coursework|research\s+(?:on|about|paper)|for\s+my\s+(?:thesis|research|paper|study|report))\b/i },
    // Declared-hypothetical / sample data framing.
    { id: "excl_sample_data", category: "hypothetical",
      pattern: /\b(?:sample\s+(?:fake\s+)?(?:record|data|entry|case|profile|example)|faux\s+(?:record|data|patient|entry|example)|mock\s+(?:record|data)|example\s+(?:record|data)|test\s+(?:data|case)|dummy\s+(?:data|record)|(?:might|could|would)\s+read\b|critique\s+(?:how|the)|how\s+realistic|this\s+is\s+(?:example|sample|test|dummy|faux|mock)\s+(?:data|record)?)\b/i },
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

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Turns a term such as "heart  disease" into a regex that tolerates any
  // whitespace between its words.
  function termSource(term) {
    return term.trim().split(/\s+/).map(escapeRegex).join("\\s+");
  }

  function containsTerm(sentence, term) {
    const re = new RegExp(NOT_WORD_BEFORE + termSource(term) + NOT_WORD_AFTER, "i");
    return re.test(sentence);
  }

  // Builds the term-anchored form of a nationality positive entry.
  function termGapRegex(entry, term) {
    return new RegExp(
      "(?:" + entry.pattern.source + ")\\s+(?:" + TERM_GAP_WORDS + "\\s+){0,2}" +
      NOT_WORD_BEFORE + termSource(term) + NOT_WORD_AFTER,
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

  function normaliseContexts(list) {
    const out = [];
    const seen = new Set();
    for (const c of list || []) {
      if (!c || typeof c.text !== "string" || !c.text.trim() || !c.category) continue;
      const text = c.text.trim();
      const key = c.category + "|" + text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: text, category: c.category });
    }
    return out;
  }

  function hasNationalityAnchor(sentence) {
    if (!sentence) return false;
    return NATIONALITY_ANCHORS.some(re => re.test(sentence));
  }

  // Contraction expansion for anchor matching only. The sentence text used for
  // term matching is not changed.
  function expandAnchorContractions(text) {
    return text
      .replace(/[’‘]/g, "'")
      .replace(/\bI'm\b/gi, "I am")
      .replace(/\bI've\b/gi, "I have")
      .replace(/\bI'd\b/gi, "I had");
  }

  // Returns the clause that contains the anchor (text after the last clause
  // boundary before it), plus the boundary word and the text before it.
  function clauseBefore(before) {
    const re = new RegExp(CLAUSE_BOUNDARY_RE.source, "gi");
    let lastEnd = 0;
    let lastIdx = -1;
    let lastWord = null;
    let m;
    while ((m = re.exec(before)) !== null) {
      lastEnd = m.index + m[0].length;
      lastIdx = m.index;
      lastWord = m[0].toLowerCase();
    }
    return {
      clause: before.slice(lastEnd),
      boundaryWord: lastWord,
      prefix: lastIdx >= 0 ? before.slice(0, lastIdx) : "",
    };
  }

  // Step 3: returns the veto reason for an anchor at [start, end), or null.
  function anchorVeto(sentence, start, end) {
    const before = sentence.slice(0, start);

    if ((before.match(/["“”]/g) || []).length % 2 === 1) return "quoted";
    if (/\?\s*$/.test(sentence) || INTERROGATIVE_START_RE.test(sentence)) return "interrogative";
    if (EMBEDDING_BEFORE_RE.test(before)) return "embedding_verb";

    const { clause, boundaryWord, prefix } = clauseBefore(before);
    if (NEGATION_RE.test(clause)) return "negated";
    if (HYPOTHETICAL_RE.test(clause)) return "hypothetical";
    if (UNCERTAIN_RE.test(clause)) return "uncertain";
    if (THIRD_PARTY_RE.test(clause)) return "third_party";

    // Shared subject: "my mother and I", "Maria and I".
    if (boundaryWord && ["and", "or", "&", "with"].includes(boundaryWord.trim())) {
      const tail = prefix.trim().split(/\s+/).slice(-2).join(" ");
      if (THIRD_PARTY_RE.test(tail) || /\b[A-Z][a-z]+\b/.test(tail)) return "shared_subject";
    }
    return null;
  }

  // Steps 1–5 of the Medical Anchor Rule. Returns the matched anchor, or null.
  function evaluateMedicalAnchor(sentence, medicalTerms) {
    if (!sentence || !medicalTerms || medicalTerms.length === 0) return null;
    const s = expandAnchorContractions(sentence);

    for (const form of MEDICAL_ANCHOR_FORMS) {
      const re = new RegExp(form.source, "gi");
      let m;
      while ((m = re.exec(s)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        const after = s.slice(end);

        for (const term of medicalTerms) {
          // Step 4: adjacency. The term follows the anchor directly, with only
          // closed qualifiers in between.
          const adj = new RegExp(
            "^\\s+(?:" + MED_QUALIFIERS + "\\s+){0,4}" + termSource(term) + NOT_WORD_AFTER, "i"
          ).exec(after);
          if (!adj) continue;

          // Step 5: noun-compound check.
          if (MED_NOUN_COMPOUND_RE.test(after.slice(adj[0].length))) continue;

          // Step 3: vetoes.
          if (anchorVeto(s, start, end)) continue;

          return { id: form.id, category: "medical", term: term, polarity: "anchor" };
        }
      }
    }
    return null;
  }

  // Returns the first nationality positive entry that matches, or null.
  function matchNationalityPositive(sentence, nationalityTerms) {
    for (const entry of POSITIVE_PATTERNS) {
      if (!entry.termGap) {
        if (entry.pattern.test(sentence)) return entry;
        continue;
      }
      for (const term of nationalityTerms) {
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

  function decide(escalate, rule, sentence, entry) {
    let patternId = null;
    let category = null;
    let polarity = null;
    let term = null;
    if (entry) {
      patternId = entry.id;
      category = entry.category;
      polarity = entry.polarity || (POSITIVE_PATTERNS.includes(entry) ? "positive" : "exclusion");
      term = entry.term || null;
    }
    return {
      escalate: escalate,
      rule: rule,  // medical_anchor | positive_attribution | no_exclusion | no_exclusion_doc_level | exclusion_suppressed | no_cooccurrence | no_context
      patternId: patternId,
      category: category,
      polarity: polarity,
      term: term,
      sentence: sentence,
    };
  }

  // ── Main decision ─────────────────────────────────────────────────────────
  //
  // fullText      raw prompt text
  // triggerTexts  rawMatch strings of eligible identifier findings (Rule 2 triggers)
  // contexts      [{ text, category }] sensitive context findings (category is
  //               medical | financial | nationality)
  //
  // Returns { escalate, rule, patternId, category, polarity, term, sentence }.
  function evaluateCooccurrence(fullText, opts) {
    const options = opts || {};
    const triggers = unique(options.triggerTexts);
    const contexts = normaliseContexts(options.contexts);

    if (!fullText || contexts.length === 0) {
      return decide(false, "no_context", null, null);
    }

    let sentences = splitSentences(fullText);
    // If no context term can be located in any sentence (for example, the
    // detector's rawMatch was normalised differently), evaluate the prompt as
    // one unit instead of silently dropping the co-occurrence.
    if (!contexts.some(c => sentences.some(s => containsTerm(s, c.text)))) {
      sentences = [fullText];
    }

    let suppressed = null;
    for (const sentence of sentences) {
      const here = contexts.filter(c => containsTerm(sentence, c.text));
      if (here.length === 0) continue;

      // 1. Medical anchor. Same sentence only. Exclusion phrases cannot suppress it.
      const medicalTerms = here.filter(c => c.category === "medical").map(c => c.text);
      const anchor = evaluateMedicalAnchor(sentence, medicalTerms);
      if (anchor) return decide(true, "medical_anchor", sentence, anchor);

      // 2. Candidate sentence: same-sentence trigger, or a nationality anchor.
      const triggerHere = triggers.some(t => containsTerm(sentence, t));
      const nationalityTerms = here.filter(c => c.category === "nationality").map(c => c.text);
      const natAnchorHere = nationalityTerms.length > 0 && hasNationalityAnchor(sentence);
      if (!triggerHere && !natAnchorHere) continue;

      // 3. Nationality positive attribution overrides the exclusion filter.
      const positive = matchNationalityPositive(sentence, nationalityTerms);
      if (positive) return decide(true, "positive_attribution", sentence, positive);

      // 4. Exclusion phrase suppresses this sentence only.
      const exclusion = matchExclusion(sentence);
      if (exclusion) {
        if (!suppressed) suppressed = { sentence: sentence, entry: exclusion };
        continue;
      }

      // 5. Escalate.
      return decide(true, "no_exclusion", sentence, null);
    }

    if (suppressed) return decide(false, "exclusion_suppressed", suppressed.sentence, suppressed.entry);

    return decide(false, "no_cooccurrence", null, null);
  }

  // ── Context-only candidates ───────────────────────────────────────────────
  // The gazetteer keeps a sensitive term whose personal-context check is "safe"
  // as a candidate: contextOnly = true, contextSpans = [{ start, end }] (offsets
  // into the text the gazetteer scanned). A candidate is reported only when a
  // Rule 2 identifier (trigger text) shares its sentence. Kept candidates lose
  // the candidate fields; all other candidates are dropped.
  function sentenceAround(text, start, end) {
    let l = start;
    while (l > 0 && !/[.!?\n]/.test(text.charAt(l - 1))) l--;
    let r = end;
    while (r < text.length && !/[.!?\n]/.test(text.charAt(r))) r++;
    return text.slice(l, r);
  }

  function resolveContextOnlyFindings(findings, scannedText, triggerTexts) {
    const triggers = unique(triggerTexts);
    const out = [];
    for (const f of findings || []) {
      if (!f || !f.contextOnly) { out.push(f); continue; }
      const spans = Array.isArray(f.contextSpans) ? f.contextSpans : [];
      const keep = !!scannedText && triggers.length > 0 && spans.some(sp => {
        const sentence = sentenceAround(scannedText, sp.start, sp.end);
        return triggers.some(t => containsTerm(sentence, t));
      });
      if (keep) {
        const kept = Object.assign({}, f);
        delete kept.contextOnly;
        delete kept.contextSpans;
        out.push(kept);
      }
    }
    return out;
  }

  const api = {
    evaluateCooccurrence: evaluateCooccurrence,
    categoryForPatternId: categoryForPatternId,
    hasNationalityAnchor: hasNationalityAnchor,
    evaluateMedicalAnchor: evaluateMedicalAnchor,
    splitSentences: splitSentences,
    POSITIVE_PATTERNS: POSITIVE_PATTERNS,
    EXCLUSION_PATTERNS: EXCLUSION_PATTERNS,
    MEDICAL_ANCHOR_FORMS: MEDICAL_ANCHOR_FORMS,
    resolveContextOnlyFindings: resolveContextOnlyFindings,
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
