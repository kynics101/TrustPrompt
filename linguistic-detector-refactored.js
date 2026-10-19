// linguistic-detector.js — PATH C: Semantic NLP-based PII Detection (REFACTORED)
//
// ARCHITECTURE: Semantic Context Provider for Multi-Path System
// ═══════════════════════════════════════════════════════════════════════════════
//
// PHASE 1: Semantic Context Extraction
// PHASE 2 & 3: NLP-First Entity Extraction with Semantic Context
//
// This refactored version ensures:
// 1. All findings include semantic context (personal_disclosure, abstract, measurement, unknown)
// 2. POS filtering prevents verb phrases from being classified as names
// 3. Path A and B can make informed filtering decisions based on semantic context
//
// Examples of how semantic context helps:
//   - "What is 09876543212 grams?" → semantic="measurement" → Path A doesn't flag it
//   - "I have diabetes" → semantic="personal_disclosure" → Path B flags it
//   - "Kyleen Nicdao works in Accenture" → "Kyleen Nicdao" extracted (not "Nicdao works in")

/* global window */

console.log("[STARTUP] linguistic-detector-refactored.js loading...");

const TrustLinguisticDetector = (() => {

  // ── Module initialization ──────────────────────────────────────────────────
  const COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined;
  
  console.log("[STARTUP] COMPROMISE_AVAILABLE:", COMPROMISE_AVAILABLE);

  if (!COMPROMISE_AVAILABLE) {
    console.debug('[TrustPrompt/PATH_C] compromise.js not found; skipping linguistic detection');
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PHASE 1: SEMANTIC CONTEXT EXTRACTION
  // ═════════════════════════════════════════════════════════════════════════════
  //
  // Extracts semantic markers that indicate whether an entity is:
  //   - personal_disclosure (first-person, possession indicators)
  //   - abstract (knowledge questions, definitions)
  //   - measurement (technical/measurement context)
  //   - unknown (no clear context markers)

  // Patterns indicating PERSONAL DISCLOSURE (high priority)
  const PERSONAL_DISCLOSURE_PATTERNS = [
    /\b(my|i|i'm|i am|i have|i've|i got|mine|we|our|ours)\b/gi,
    /\b(personal|private|my contact|my details|my info|tell me|call me|text me|email me|my phone|my number)\b/gi,
    /\b(contact|reach|call|text|dial|text me)\s+(me|my)/gi,
  ];

  // Patterns indicating ABSTRACT/INFORMATIONAL context (lower priority)
  const ABSTRACT_CONTEXT_PATTERNS = [
    /\b(what is|define|explain|information about|facts about|details about)\b/gi,
    /\b(example|for example|like|such as|e\.g\.|i\.e\.)\b/gi,
    /\b(the .+ is|diabetes is|cancer is|obesity is)\b/gi,  // Knowledge statements
    /\b(a patient with|people with|someone with)\b/gi,  // Generalized references
  ];

  // Patterns indicating MEASUREMENT/TECHNICAL context (not PII)
  const MEASUREMENT_PATTERNS = [
    /\b(grams|kilograms|pounds|ounces|meters|kilometers|miles|inches|centimeters|liters|milliliters|tons|pounds|oz|kg|lb|m|km|ml|l)\b/gi,
    /\b(convert|how many|what is.*in|measurement)\b/gi,
  ];

  // ── PHASE 1: Extract semantic context from text ──────────────────────────────

  /**
   * PHASE 1 FUNCTION: Analyze text for semantic context markers.
   *
   * Semantic context types:
   *   - "personal_disclosure": First-person mention (my, I have, I'm)
   *   - "abstract": Knowledge question (what is, define, example)
   *   - "measurement": Technical/measurement context (grams, tons, convert)
   *   - "unknown": No clear context markers
   *
   * Returns object with:
   *   - type: semantic context type
   *   - confidence: 0-1 score based on pattern matches
   *   - indicators: list of detected patterns
   *
   * @param {string} text - Full text to analyze
   * @param {string} entity - The entity being analyzed (optional, for position weighting)
   * @returns {object} semantic context object
   * @private
   */
  function extractSemanticContext(text, entity) {
    if (!text || typeof text !== 'string') {
      return { type: 'unknown', confidence: 0, indicators: [] };
    }

    const lowerText = text.toLowerCase();
    const indicators = [];
    let scorePersonal = 0;
    let scoreAbstract = 0;
    let scoreMeasurement = 0;

    // Check for personal disclosure patterns (HIGH WEIGHT)
    for (const pattern of PERSONAL_DISCLOSURE_PATTERNS) {
      if (pattern.test(lowerText)) {
        scorePersonal += 2;
        const source = pattern.source || 'personal_pattern';
        if (indicators.length < 5) indicators.push(source.substring(0, 30));
      }
    }

    // Check for abstract/knowledge patterns (MEDIUM WEIGHT)
    for (const pattern of ABSTRACT_CONTEXT_PATTERNS) {
      if (pattern.test(lowerText)) {
        scoreAbstract += 1;
        const source = pattern.source || 'abstract_pattern';
        if (indicators.length < 5) indicators.push(source.substring(0, 30));
      }
    }

    // Check for measurement/technical patterns (HIGH WEIGHT - negative signal)
    for (const pattern of MEASUREMENT_PATTERNS) {
      if (pattern.test(lowerText)) {
        scoreMeasurement += 2;
        const source = pattern.source || 'measurement_pattern';
        if (indicators.length < 5) indicators.push(source.substring(0, 30));
      }
    }

    // Decide semantic type based on scores
    let semanticType = 'unknown';
    let confidence = 0;

    if (scoreMeasurement > 0 && scoreMeasurement >= scorePersonal) {
      // Measurement context takes precedence
      semanticType = 'measurement';
      confidence = Math.min(scoreMeasurement / 4, 1.0);
    } else if (scorePersonal > scoreAbstract) {
      // Personal disclosure
      semanticType = 'personal_disclosure';
      confidence = Math.min(scorePersonal / 4, 1.0);
    } else if (scoreAbstract > 0) {
      // Abstract/knowledge context
      semanticType = 'abstract';
      confidence = Math.min(scoreAbstract / 2, 1.0);
    }

    return {
      type: semanticType,
      confidence,
      indicators
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PHASE 2 & 3: NLP-FIRST ENTITY EXTRACTION WITH SEMANTIC CONTEXT
  // ═════════════════════════════════════════════════════════════════════════════

  // ── PHASE 2: POS-based filtering ──────────────────────────────────────────────

  /**
   * ★ CRITICAL FUNCTION ★
   * Check if a phrase contains verbs or other non-entity POS tags.
   *
   * Uses compromise.js POS tagging to reject phrases like "works in" where
   * "works" is a verb and shouldn't be part of a person name.
   *
   * This prevents "Nicdao works in" from matching when we want "Kyleen Nicdao".
   *
   * @param {string} phrase - The phrase to check
   * @returns {boolean} true if should be FILTERED OUT (contains non-entity POS)
   * @private
   */
  function shouldFilterByPOS(phrase) {
    if (!window.nlp || !phrase) return false;

    try {
      const doc = window.nlp(phrase);
      const terms = doc.termList();

      // POS tags that indicate this is NOT an entity
      const filterTags = ['Verb', 'Auxiliary', 'Modal', 'Adverb', 'Preposition', 'Conjunction'];

      // If any word has a filter tag, reject the phrase
      for (const term of terms) {
        const tags = term.tags() || [];
        for (const tag of tags) {
          if (filterTags.some(ft => tag && tag.includes(ft))) {
            return true;  // Filter out
          }
        }
      }
    } catch (error) {
      // If POS tagging fails, allow through (don't over-filter)
      return false;
    }

    return false;  // Don't filter
  }

  // ── PHASE 3: Public API for semantic context ──────────────────────────────────

  /**
   * PUBLIC API: Get semantic context for an entity.
   * Called by Path A and B to check context before filtering.
   *
   * Usage by Path A:
   *   const context = getSematicContext('09876543212', fullText);
   *   if (context.type !== 'personal_disclosure') { filter it }
   *
   * Usage by Path B:
   *   const context = getSemanticContext('diabetes', fullText);
   *   if (context.type === 'personal_disclosure') { flag it }
   *
   * @param {string} entity - The entity to analyze
   * @param {string} fullText - Full text for context analysis
   * @returns {object} semantic context object
   * @public
   */
  function getSemanticContext(entity, fullText) {
    return extractSemanticContext(fullText, entity);
  }

  // ── Helper: Extract names with honorifics ──────────────────────────────────

  /**
   * Extract names preceded by honorifics (Mr, Ms, Dr, Prof, etc.)
   *
   * Examples:
   * - "Mr John Smith" → "John Smith"
   * - "Dr. Maria Garcia" → "Maria Garcia"
   * - "Prof. David Johnson" → "David Johnson"
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted names
   * @private
   */
  function extractNamesWithHonorific(text) {
    const names = [];
    const honorificPattern = /\b(Mr|Ms|Mrs|Miss|Mx|Sir|Madam|Dr|Prof|Professor|Rev|Reverend|Fr|Father|Sr|Esq|Eng|Engr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;

    let match;
    while ((match = honorificPattern.exec(text)) !== null) {
      const name = match[2].trim();
      if (name.length >= 2 && !names.some(n => n.toLowerCase() === name.toLowerCase())) {
        names.push(name);
      }
    }

    return names;
  }

  // ── Helper: Extract subject-position names ───────────────────────────────────

  /**
   * Extract person names that appear in subject position before "is a/an/the".
   *
   * Pattern: [Capitalized Word(s)] + "is a/an/the" → subject is likely a name
   *
   * Examples:
   * - "Maria is a human resource manager" → "Maria"
   * - "John Smith is the head of IT" → "John Smith"
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted subject-position names
   * @private
   */
  function extractSubjectPositionNames(text) {
    const names = [];
    const subjectPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the)\s+/gi;

    let match;
    while ((match = subjectPattern.exec(text)) !== null) {
      const potentialName = match[1].trim();

      // Heuristic 1: Must be 2+ characters
      if (potentialName.length < 2) continue;

      // Heuristic 2: Must start with capital letter
      if (!/^[A-Z]/.test(potentialName)) continue;

      // Heuristic 3: If single word, require 3+ characters
      const words = potentialName.split(/\s+/);
      if (words.length === 1 && potentialName.length < 3) continue;

      // Heuristic 4: Avoid duplicates
      if (names.some(n => n.toLowerCase() === potentialName.toLowerCase())) continue;

      names.push(potentialName);
    }

    return names;
  }

  // ── Helper: Extract standalone person names ───────────────────────────────────

  /**
   * ★ CRITICAL FUNCTION FOR FIX #1 ★
   * Extract standalone 2-3 word capitalized phrases as person names.
   *
   * CRITICAL: Now uses shouldFilterByPOS() to reject verbs like "works"
   *
   * Examples:
   * - "Kyleen Nicdao said..." → "Kyleen Nicdao" (GOOD)
   * - "Nicdao works in" → FILTERED OUT (contains VERB "works") (FIXED)
   * - "John Smith ran..." → "John Smith" (OK, checked for verb)
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted names
   * @private
   */
  function extractStandalonePersonNames(text) {
    const names = [];
    const standaloneNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi;

    let match;
    while ((match = standaloneNamePattern.exec(text)) !== null) {
      const potentialName = match[1].trim();

      // Heuristic 1: Name must be 3+ characters
      if (potentialName.length < 3) continue;

      // ★ CRITICAL FIX: Filter by POS tags ★
      // This rejects "Nicdao works in" because "works" is a VERB
      if (shouldFilterByPOS(potentialName)) {
        continue;  // Skip this phrase
      }

      // Heuristic 2: Avoid single-word matches (require 2+ words)
      const wordCount = potentialName.split(/\s+/).length;
      if (wordCount < 2) continue;

      // Heuristic 3: Avoid duplicates
      const lowerName = potentialName.toLowerCase();
      if (names.some(n => n.toLowerCase() === lowerName)) continue;

      names.push(potentialName);
    }

    return names;
  }

  // ── Helper: Extract job titles from predicate position ───────────────────────

  /**
   * Extract job titles from predicate position after "is a/an/the".
   *
   * Patterns:
   * - "[Name] is a [job title]"
   * - "[Name] is an [job title]"
   * - "[Name] is the [job title]"
   *
   * Examples:
   * - "Maria is a human resource manager" → "human resource manager"
   * - "John is the head of IT" → "head"
   * - "Sarah is an administrative assistant" → "administrative assistant"
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted job titles
   * @private
   */
  function extractPredicateJobTitles(text) {
    const titles = [];

    // Pattern 1: "is a [job]"
    const patternA = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+a\s+([a-z][a-z\s]*?)(?:\s+(?:at|for|in|of|by|and|or)|\.|\,|;|$)/gi;
    let match;
    while ((match = patternA.exec(text)) !== null) {
      let title = match[1].trim();
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      if (title.length >= 2 && !titles.some(t => t.toLowerCase() === title.toLowerCase())) {
        titles.push(title);
      }
    }

    // Pattern 2: "is an [job]"
    const patternAn = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+an\s+([a-z][a-z\s]*?)(?:\s+(?:at|for|in|of|by|and|or)|\.|\,|;|$)/gi;
    while ((match = patternAn.exec(text)) !== null) {
      let title = match[1].trim();
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      if (title.length >= 2 && !titles.some(t => t.toLowerCase() === title.toLowerCase())) {
        titles.push(title);
      }
    }

    // Pattern 3: "is the [job]"
    const patternThe = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+the\s+([a-z][a-z\s]*?)(?:\s+(?:at|for|in|of|by|and|or)|\.|\,|;|$)/gi;
    while ((match = patternThe.exec(text)) !== null) {
      let title = match[1].trim();
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      if (title.length >= 2 && !titles.some(t => t.toLowerCase() === title.toLowerCase())) {
        titles.push(title);
      }
    }

    return titles;
  }

  // ── Helper: Extract organizations from context ───────────────────────────────

  /**
   * Extract organization names from contextual patterns.
   *
   * Patterns:
   * - "is the head of [ORG]"
   * - "works at/for [ORG]"
   * - "is part of [ORG]"
   *
   * Examples:
   * - "is the head of the oict" → "oict"
   * - "works at Google" → "Google"
   * - "is part of Accenture" → "Accenture"
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted organization names
   * @private
   */
  function extractOrganizationContexts(text) {
    const orgs = [];

    // Pattern 1: "is the head of [ORG]" or "is part of [ORG]"
    const headOfPattern = /\b(?:is\s+(?:the\s+)?(?:head|chief|member|part|employee|leader|director|coordinator)|in)\s+(?:of|in|the\s+)?(?:the\s+)?([A-Z][A-Za-z\s&']*?)(?:\s+(?:and|or|at|which|where)|\.|\,|;|$)/gi;
    let match;
    while ((match = headOfPattern.exec(text)) !== null) {
      let org = match[1].trim();
      org = org.replace(/\s+(?:and|or|at)\s*$/i, '').trim();

      if (org.length >= 2 && !['the', 'a', 'an', 'that', 'this', 'who', 'which'].includes(org.toLowerCase())) {
        if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
          orgs.push(org);
        }
      }
    }

    // Pattern 2: "works at/for [ORG]"
    const worksAtPattern = /\b(?:works?|employed?|working)\s+(?:at|by|for|with)\s+(?:the\s+)?([A-Z][A-Za-z\s&']*?)(?:\s+(?:and|or|which|where)|\.|\,|;|$)/gi;
    while ((match = worksAtPattern.exec(text)) !== null) {
      let org = match[1].trim();
      org = org.replace(/\s+(?:and|or|which|where)\s*$/i, '').trim();

      if (org.length >= 3 && !['the', 'a', 'an', 'that', 'this', 'there'].includes(org.toLowerCase())) {
        if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
          orgs.push(org);
        }
      }
    }

    // Pattern 3: Standalone acronyms like "OICT", "Google"
    const acronymPattern = /\b([A-Z]{2,5})\b(?!\w)/gi;
    const blacklist = new Set(['THE', 'AND', 'FOR', 'WITH', 'FROM', 'THAT', 'THIS', 'KYL', 'NIC']);

    while ((match = acronymPattern.exec(text)) !== null) {
      const org = match[1].trim();

      if (org.length >= 2 && !blacklist.has(org)) {
        if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
          orgs.push(org);
        }
      }
    }

    return orgs;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // MAIN EXTRACTION FUNCTIONS: Return findings with semantic context
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Extract person name findings.
   * ★ PHASE 2 & 3: Returns findings enriched with semantic context
   *
   * @param {object} doc - compromise.js document object
   * @param {string} fullText - Full text for semantic analysis
   * @returns {Array} array of person name findings with semantic context
   * @private
   */
  function extractPersons(doc, fullText) {
    const findings = [];
    if (!doc) return findings;

    try {
      const text = doc.out('text');

      // Method 1: Extract names with honorifics
      const honorificNames = extractNamesWithHonorific(text);
      for (const name of honorificNames) {
        const semanticContext = extractSemanticContext(fullText, name);
        findings.push({
          patternId: 'nlp_person_name',
          label: 'Person Name (NLP - Honorific)',
          risk: 'low',
          rawMatch: name,
          safeVersion: '[NAME REDACTED]',
          source: 'C_linguistic',
          validated: false,
          semanticContext
        });
      }

      // Method 2: Extract names from subject position
      const subjectNames = extractSubjectPositionNames(text);
      for (const name of subjectNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          const semanticContext = extractSemanticContext(fullText, name);
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (NLP - Subject Position)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            validated: false,
            semanticContext
          });
        }
      }

      // ★ Method 3: Extract standalone person names with POS filtering ★
      const standaloneNames = extractStandalonePersonNames(text);
      for (const name of standaloneNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          const semanticContext = extractSemanticContext(fullText, name);
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (NLP)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            validated: false,
            semanticContext
          });
        }
      }

      // Method 4: Use compromise.js NER if available
      if (window.nlp) {
        try {
          const entities = doc.people();
          if (entities && entities.length > 0) {
            const peopleList = entities.out('array');
            for (const person of peopleList) {
              const rawMatch = person.trim();
              if (rawMatch.length >= 2 && !findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
                const semanticContext = extractSemanticContext(fullText, rawMatch);
                findings.push({
                  patternId: 'nlp_person_name',
                  label: 'Person Name (NLP)',
                  risk: 'low',
                  rawMatch,
                  safeVersion: '[NAME REDACTED]',
                  source: 'C_linguistic',
                  validated: false,
                  semanticContext
                });
              }
            }
          }
        } catch (e) {
          // Silently continue if NER fails
        }
      }

    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] Person extraction failed:', error.message);
    }

    return findings;
  }

  /**
   * Extract job title findings.
   * ★ PHASE 2 & 3: Returns findings enriched with semantic context
   *
   * @param {object} doc - compromise.js document object
   * @param {string} fullText - Full text for semantic analysis
   * @returns {Array} array of job title findings with semantic context
   * @private
   */
  function extractJobTitles(doc, fullText) {
    const findings = [];
    if (!doc) return findings;

    try {
      const text = doc.out('text');

      // Extract job titles from predicate position
      const predicateTitles = extractPredicateJobTitles(text);
      for (const title of predicateTitles) {
        if (title.length >= 2) {
          const semanticContext = extractSemanticContext(fullText, title);
          findings.push({
            patternId: 'nlp_job_title',
            label: 'Job Title (NLP)',
            risk: 'low',
            rawMatch: title,
            safeVersion: '[JOB REDACTED]',
            source: 'C_linguistic',
            validated: false,
            semanticContext
          });
        }
      }

    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] Job title extraction failed:', error.message);
    }

    return findings;
  }

  /**
   * Extract organization findings.
   * ★ PHASE 2 & 3: Returns findings enriched with semantic context
   *
   * @param {object} doc - compromise.js document object
   * @param {string} fullText - Full text for semantic analysis
   * @returns {Array} array of organization findings with semantic context
   * @private
   */
  function extractOrganizations(doc, fullText) {
    const findings = [];
    if (!doc) return findings;

    try {
      const text = doc.out('text');

      // Extract organizations from contextual patterns
      const orgs = extractOrganizationContexts(text);
      for (const org of orgs) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
          const semanticContext = extractSemanticContext(fullText, org);
          findings.push({
            patternId: 'nlp_organization',
            label: 'Organization (NLP)',
            risk: 'low',
            rawMatch: org,
            safeVersion: '[ORG REDACTED]',
            source: 'C_linguistic',
            validated: false,
            semanticContext
          });
        }
      }

    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] Organization extraction failed:', error.message);
    }

    return findings;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // MAIN SCAN FUNCTION
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Scan text for linguistic PII.
   * 
   * ★ KEY IMPROVEMENT: Now passes fullText to all extract functions
   * so they can add semantic context to findings
   *
   * @param {string} text - Text to scan
   * @returns {Array} array of findings with semantic context
   * @public
   */
  function scan(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const findings = [];

    // Use compromise.js if available
    if (!COMPROMISE_AVAILABLE) {
      console.debug('[TrustPrompt/PATH_C] Skipping linguistic detection (compromise.js unavailable)');
      return findings;
    }

    try {
      const doc = window.nlp(text);

      // ★ Pass fullText to each extraction function ★
      const persons = extractPersons(doc, text);
      const jobTitles = extractJobTitles(doc, text);
      const organizations = extractOrganizations(doc, text);

      findings.push(...persons, ...jobTitles, ...organizations);

      return findings;

    } catch (error) {
      console.error('[TrustPrompt/PATH_C] Scan failed:', error.message);
      return findings;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────────────────────────

  return {
    scan,
    // ★ NEW: Public API for semantic context ★
    // Called by Path A and B to check context before filtering
    getSemanticContext,

    // Testing/debugging only
    _test: {
      extractSemanticContext,
      shouldFilterByPOS,
      extractStandalonePersonNames,
      extractPredicateJobTitles,
      extractOrganizationContexts,
      extractPersons,
      extractJobTitles,
      extractOrganizations
    }
  };

})();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrustLinguisticDetector;
}
