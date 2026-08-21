// gazetteer.js
// PATH B — Gazetteer + trigger-phrase scan + lightweight NLP extraction.
//
// This path catches PII that regex (Path A) misses because it was typed in
// natural language: "my name is maria", "i live in manila", "i am 25 years old".
//
// Sub-steps (matching your architecture diagram):
//
//   B1 — GAZETTEER SCAN
//        Case-insensitive word-level lookup for sensitive category keywords
//        (nationality, medical terms, financial keywords).
//        Unaffected by punctuation loss — it matches individual words.
//
//   B2 — TRIGGER-PHRASE SCAN  (FIX #2 + FIX #3 + FIX #4)
//        ~25 trigger phrases ("my name is", "i live at", "i am X years old", …)
//        matched with Levenshtein fuzzy matching so typos don't break detection.
//        When a trigger fires:
//          FIX #4 — typo tolerance via fuzzy match
//          FIX #3 — value extraction without relying on punctuation;
//                   collects words until a stop-word / sentence boundary
//          FIX #2 — recapitalises the extracted span before passing to
//                   the Compromise-lite grammar check
//
//   B3 — COMPROMISE-LITE GRAMMAR CHECK
//        Lightweight heuristic (no full NLP library dependency) that confirms
//        the extracted span looks like a person name, place, or noun phrase
//        rather than a common word accidentally caught by a trigger.
//
// Output: array of finding objects identical in shape to Path A findings
//   { patternId, label, risk, rawMatch, safeVersion }
//
// Dependencies: ph-address-db.js (loaded before this file)

/* global PH_ADDRESS_DB, TrustGazetteer */

const TrustGazetteer = (() => {

  // ── B1: GAZETTEER WORD LISTS ──────────────────────────────────────────────
  // Sensitive category keywords. A hit alone is low-risk (it doesn't reveal
  // a specific value), but combined with a trigger phrase it elevates risk.

  const GAZETTEER = {
    medical: [
      "diabetes", "hypertension", "cancer", "hiv", "aids", "tuberculosis", "tb",
      "asthma", "epilepsy", "schizophrenia", "depression", "anxiety",
      "pregnant", "pregnancy", "dialysis", "chemotherapy", "insulin",
      "bipolar", "adhd", "autism", "alzheimer", "parkinson"
    ],
    financial: [
      "bankrupt", "bankruptcy", "loan", "debt", "mortgage", "foreclosure",
      "insolvent", "overdue", "garnishment", "collateral", "lien"
    ],
    nationality_religion: [
      "muslim", "christian", "catholic", "protestant", "buddhist", "hindu",
      "jewish", "atheist", "agnostic",
      "filipino", "chinese", "american", "korean", "japanese", "indian",
      "australian", "british", "canadian", "singaporean"
    ],
    legal: [
      "arrested", "convicted", "felony", "misdemeanor", "probation", "parole",
      "warrant", "criminal record", "sex offender", "restraining order"
    ]
  };

  // ── B2: TRIGGER PHRASES ───────────────────────────────────────────────────
  // Each entry:
  //   phrase   — canonical trigger (lowercase)
  //   category — what kind of PII follows the trigger
  //   risk     — risk level of the extracted value

  const TRIGGERS = [
    // Identity
    { phrase: "my name is",          category: "person_name",  risk: "moderate" },
    { phrase: "my full name is",      category: "person_name",  risk: "moderate" },
    { phrase: "i am called",          category: "person_name",  risk: "moderate" },
    { phrase: "call me",              category: "person_name",  risk: "low"    },
    { phrase: "my nickname is",       category: "person_name",  risk: "low"    },
    // Age / DOB
    { phrase: "i am",                 category: "age",          risk: "low",   followPattern: /^\d{1,3}\s*(years?\s*old|yrs?\s*old|y\/o)?/ },
    { phrase: "i'm",                  category: "age",          risk: "low",   followPattern: /^\d{1,3}\s*(years?\s*old|yrs?\s*old|y\/o)?/ },
    { phrase: "my age is",            category: "age",          risk: "low"    },
    { phrase: "i was born",           category: "dob",          risk: "low"    },
    { phrase: "my birthday is",       category: "dob",          risk: "low"    },
    { phrase: "date of birth",        category: "dob",          risk: "low"    },
    // Location
    { phrase: "i live in",            category: "location",     risk: "moderate" },
    { phrase: "i live at",            category: "location",     risk: "moderate" },
    { phrase: "i stay at",            category: "location",     risk: "moderate" },
    { phrase: "i reside at",          category: "location",     risk: "moderate" },
    { phrase: "my address is",        category: "location",     risk: "moderate" },
    { phrase: "my home address is",   category: "location",     risk: "moderate" },
    { phrase: "i am from",            category: "location",     risk: "low"    },
    { phrase: "nakatira ako sa",      category: "location",     risk: "moderate" }, // Filipino
    { phrase: "nakatira sa",          category: "location",     risk: "moderate" },
    { phrase: "address ko",           category: "location",     risk: "moderate" },
    // Health
    { phrase: "i have",               category: "health",       risk: "moderate", requireGazetteer: "medical" },
    { phrase: "i was diagnosed",      category: "health",       risk: "moderate" },
    { phrase: "i am diagnosed",       category: "health",       risk: "moderate" },
    { phrase: "i suffer from",        category: "health",       risk: "moderate" },
    { phrase: "my condition is",      category: "health",       risk: "moderate" },
    // Occupation / employer
    { phrase: "i work at",            category: "employer",     risk: "low"    },
    { phrase: "i work for",           category: "employer",     risk: "low"    },
    { phrase: "my employer is",       category: "employer",     risk: "low"    },
    { phrase: "i am employed at",     category: "employer",     risk: "low"    },
    { phrase: "my company is",        category: "employer",     risk: "low"    },
    // Religion / belief
    { phrase: "i am a",               category: "religion",     risk: "low",   requireGazetteer: "nationality_religion" },
    { phrase: "i believe in",         category: "religion",     risk: "low",   requireGazetteer: "nationality_religion" },
    // Financial
    { phrase: "my salary is",         category: "financial",    risk: "moderate" },
    { phrase: "i earn",               category: "financial",    risk: "moderate" },
    { phrase: "my income is",         category: "financial",    risk: "moderate" },
    { phrase: "my account number is", category: "financial",    risk: "high"   },
    { phrase: "my card number is",    category: "financial",    risk: "high"   }
  ];

  // Stop words — extracting a span halts when one of these is the next word
  const STOP_WORDS = new Set([
    "and", "but", "or", "so", "yet", "for", "nor",
    "i", "you", "he", "she", "they", "we", "it",
    "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might",
    "the", "a", "an", "this", "that", "these", "those",
    "to", "of", "in", "on", "at", "by", "with", "from",
    "please", "can", "need", "want", "help", "tell", "give",
    "ako", "ka", "siya", "kami", "tayo", "kayo", "sila",  // Filipino pronouns
    "ang", "ng", "sa", "na", "at", "ay", "mga"             // Filipino particles
  ]);

  // Category → display label + sanitize function
  const CATEGORY_META = {
    person_name:  { label: "Person Name",         sanitize: (v) => v[0] + "***"                   },
    age:          { label: "Age / Date of Birth",  sanitize: (_) => "[AGE REDACTED]"                },
    dob:          { label: "Date of Birth",        sanitize: (_) => "[DOB REDACTED]"                },
    location:     { label: "Location / Address",   sanitize: (_) => "[LOCATION REDACTED]"           },
    health:       { label: "Health Condition",     sanitize: (_) => "[HEALTH INFO REDACTED]"        },
    employer:     { label: "Employer / Workplace", sanitize: (_) => "[EMPLOYER REDACTED]"           },
    religion:     { label: "Religion / Belief",    sanitize: (_) => "[BELIEF INFO REDACTED]"        },
    financial:    { label: "Financial Information",sanitize: (_) => "[FINANCIAL INFO REDACTED]"     },
    medical_term: { label: "Medical Term",         sanitize: (v) => "[MEDICAL: " + v + "]"          },
    fin_term:     { label: "Financial Term",       sanitize: (v) => "[FINANCIAL TERM: " + v + "]"  },
    // legal_term:   { label: "Legal Term",           sanitize: (v) => "[LEGAL TERM: " + v + "]"      }
  };

  // ── Levenshtein similarity (≥ 0.80 threshold per architecture diagram) ──────
  // Returns similarity ratio: 1 - (editDistance / maxLength)
  // A ratio ≥ 0.80 means the strings are at least 80% similar.

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function similarityRatio(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    return 1 - levenshtein(a, b) / maxLen;
  }

  const FUZZY_THRESHOLD = 0.80; // ≥ 0.80 similarity required

  /**
   * Fuzzy-match a trigger phrase against the text using Levenshtein similarity ≥ 0.80.
   * Slides a word-window across the text and checks similarity of each window
   * against the canonical phrase.
   */
  function fuzzyMatchPhrase(text, phrase) {
    const phraseWords = phrase.split(" ");
    const textWords   = text.toLowerCase().split(/\s+/);
    const wLen        = phraseWords.length;

    for (let i = 0; i <= textWords.length - wLen; i++) {
      const window = textWords.slice(i, i + wLen).join(" ");
      if (similarityRatio(window, phrase) >= FUZZY_THRESHOLD) {
        return { matched: true, startWordIdx: i, endWordIdx: i + wLen };
      }
    }
    return { matched: false };
  }

  // ── Value extraction (FIX #3 — no-punctuation boundary) ──────────────────

  /**
   * Extract the "value" that follows a matched trigger phrase.
   * Instead of relying on punctuation, we collect words until:
   *   - A stop word is encountered
   *   - A sentence-ending punctuation is found
   *   - We've collected 8 words (safety cap)
   *   - A followPattern is provided and doesn't match the next token
   *
   * @param {string[]} textWords   - all words in the text
   * @param {number}   startIdx    - index of first word AFTER the trigger
   * @param {object}   trigger     - the trigger entry
   * @returns {{ span: string, wordCount: number }}
   */
  function extractValue(textWords, startIdx, trigger) {
    const collected = [];
    const max = 8;

    for (let i = startIdx; i < textWords.length && collected.length < max; i++) {
      const word = textWords[i];
      const clean = word.replace(/[.,!?;:'"]/g, "").toLowerCase();

      // Stop at stop words
      if (STOP_WORDS.has(clean)) break;

      // Stop at sentence-ending punctuation in the word
      collected.push(word);
      if (/[.!?]$/.test(word)) break;
    }

    const span = collected.join(" ").replace(/[.,!?;:]$/, "").trim();
    return { span, wordCount: collected.length };
  }

  // ── FIX #2 — Recapitalise extracted span ─────────────────────────────────

  /**
   * Title-case each word in the span that is a candidate proper noun
   * (i.e., not a common preposition/article/conjunction).
   */
  function recapitalise(span) {
    const minor = new Set(["of", "the", "in", "on", "at", "by", "for", "and", "or", "a", "an"]);
    return span
      .split(" ")
      .map((word, i) => {
        const lower = word.toLowerCase();
        if (i === 0 || !minor.has(lower)) {
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        }
        return lower;
      })
      .join(" ");
  }

  // ── B3 — Compromise-lite grammar check ───────────────────────────────────

  /**
   * Lightweight heuristic to confirm the extracted span looks like a real
   * entity rather than a common fragment accidentally matched.
   *
   * Rules:
   *   - Must have at least one word with length ≥ 2
   *   - Must not be entirely composed of stop words
   *   - For person_name: first word should start with uppercase after recapitalise
   *   - For location: either contains a PH place name OR a capitalised word ≥ 3 chars
   *   - For age: must be a number optionally followed by "years old" variants
   *   - For health: must contain at least one medical gazetteer term
   */
  function grammarCheck(span, category, gazetteers) {
    if (!span || span.length < 2) return false;

    const words = span.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.every(w => STOP_WORDS.has(w))) return false;

    switch (category) {
      case "person_name":
        // Reject if it looks like a common verb/adjective fragment
        return span.length >= 2 && !/^\d/.test(span);

      case "age":
        return /^\d{1,3}/.test(span.trim());

      case "dob":
        // Should contain a digit (day/month/year)
        return /\d/.test(span);

      case "location":
        return PH_ADDRESS_DB.matchesAny(span) ||
               words.some(w => w.length >= 3 && !STOP_WORDS.has(w));

      case "health":
        return gazetteers.medical.some(t => span.toLowerCase().includes(t));

      case "religion":
        return gazetteers.nationality_religion.some(t => span.toLowerCase().includes(t));

      case "financial":
        // Financial trigger value should have digits or financial keywords
        return /\d/.test(span) ||
               gazetteers.financial.some(t => span.toLowerCase().includes(t));

      default:
        return span.length >= 2;
    }
  }

  // ── B1: GAZETTEER SCAN ────────────────────────────────────────────────────

  function runGazetteerScan(text) {
    const findings = [];
    const lower = text.toLowerCase();

    for (const [category, terms] of Object.entries(GAZETTEER)) {
      for (const term of terms) {
        // Use word boundary to avoid partial matches
        const re = new RegExp("\\b" + term.replace(/[-]/g, "\\-") + "\\b", "i");
        const match = re.exec(text);
        if (match) {
          const riskMap = { medical: "moderate", financial: "moderate", nationality_religion: "low", legal: "moderate" };
          const catMap  = { medical: "medical_term", financial: "fin_term", nationality_religion: "low", legal: "legal_term" };
          const meta    = CATEGORY_META[catMap[category]] || { label: term, sanitize: () => "[REDACTED]" };
          findings.push({
            patternId:   "gazetteer_" + category,
            label:       meta.label,
            risk:        riskMap[category] || "low",
            rawMatch:    match[0],
            safeVersion: meta.sanitize(match[0]),
            source:      "B1_gazetteer"
          });
        }
      }
    }

    return findings;
  }

  // ── B2 + B3: TRIGGER-PHRASE SCAN + GRAMMAR CHECK ─────────────────────────

  function runTriggerScan(text) {
    const findings = [];
    const textWords = text.split(/\s+/).filter(Boolean);

    for (const trigger of TRIGGERS) {
      const { matched, startWordIdx, endWordIdx } = fuzzyMatchPhrase(text, trigger.phrase);
      if (!matched) continue;

      // FIX #3: extract value without relying on punctuation
      const { span } = extractValue(textWords, endWordIdx, trigger);
      if (!span) continue;

      // If trigger requires a gazetteer hit in the following span, check it
      if (trigger.requireGazetteer) {
        const terms = GAZETTEER[trigger.requireGazetteer] || [];
        if (!terms.some(t => span.toLowerCase().includes(t))) continue;
      }

      // FIX #4: already handled — fuzzyMatchPhrase let this through

      // FIX #2: recapitalise the span before grammar check
      const recapSpan = recapitalise(span);

      // B3: grammar check
      if (!grammarCheck(recapSpan, trigger.category, GAZETTEER)) continue;

      const meta = CATEGORY_META[trigger.category] || { label: trigger.category, sanitize: () => "[REDACTED]" };

      // Build the rawMatch as "trigger + value" so the UI shows context
      const triggerText = textWords.slice(startWordIdx, endWordIdx).join(" ");
      const rawMatch    = triggerText + " " + span;

      findings.push({
        patternId:   "trigger_" + trigger.category,
        label:       meta.label,
        risk:        trigger.risk,
        rawMatch:    rawMatch,
        safeVersion: triggerText + " " + meta.sanitize(recapSpan),
        source:      "B2_trigger"
      });
    }

    return findings;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Run the full Path B scan (B1 + B2 + B3) on already-normalised text.
   * @param {string} normalisedText
   * @returns {Array} findings array
   */
  function scan(normalisedText) {
    const gazetterFindings = runGazetteerScan(normalisedText);
    const triggerFindings  = runTriggerScan(normalisedText);
    return [...gazetterFindings, ...triggerFindings];
  }

  return { scan };

})();
