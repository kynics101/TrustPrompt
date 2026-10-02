// linguistic-detector.js — PATH C: Linguistic-based PII detection using compromise.js
//
// This module uses NLP (tokenization, POS tagging, NER) to detect broad PII
// categories that are too variable for regex or gazetteer approaches:
//   - Person names (PERSON entities)
//   - Job titles / roles (JOB entities + POS heuristics)
//   - Organization names (ORG entities)
//
// The detector runs on the linguistic-normalized text view (textNLP) and returns
// findings with the same structure as PATH A/B findings for seamless integration
// into the scanner pipeline.
//
// Graceful degradation: If compromise.js is unavailable, returns empty findings
// without error, allowing scanner to continue with PATH A/B results only.

/* global window */

console.log("[STARTUP] linguistic-detector.js loading...");

const TrustLinguisticDetector = (() => {

  // ── Module initialization ──────────────────────────────────────────────────
  // Check if compromise.js is available in global scope
  const COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined;

  console.log("[STARTUP] COMPROMISE_AVAILABLE:", COMPROMISE_AVAILABLE);
  console.log("[STARTUP] typeof window.nlp:", typeof window.nlp);

  if (!COMPROMISE_AVAILABLE) {
    console.debug('[TrustPrompt/PATH_C] compromise.js not found; skipping linguistic detection');
  }
  
  console.log("[STARTUP] TrustLinguisticDetector initialized");

  // ── Constants & heuristic data ─────────────────────────────────────────────

  // Common first names used for optional filtering of obvious non-PII
  const COMMON_FIRST_NAMES = new Set([
    'john', 'mary', 'james', 'david', 'robert', 'michael', 'william', 'richard',
    'charles', 'joseph', 'thomas', 'alice', 'bob', 'charlie', 'example', 'user',
    'test', 'demo', 'sample', 'admin', 'root'
  ]);

  // Common job titles used for optional filtering
  const COMMON_JOB_TITLES = new Set([
    'manager', 'engineer', 'developer', 'analyst', 'designer', 'director',
    'coordinator', 'specialist', 'consultant', 'assistant', 'associate',
    'person', 'people', 'employee', 'staff', 'worker'
  ]);

  // Honorifics: Mr, Ms, Mrs, Sir, Dr, Prof, Professor, etc.
  // These indicate that a proper noun following them is likely a person name
  const HONORIFICS = /\b(Mr|Ms|Mrs|Miss|Mx|Sir|Madam|Dr|Prof|Professor|Rev|Reverend|Fr|Father|Sr|Esq|Eng|Engr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;

  // ── Helper: Extract names with honorifics ────────────────────────────────────

  /**
   * Extract person names that are preceded by honorifics (Mr, Ms, Dr, Prof, etc.)
   * Pattern: [Honorific] [FirstName] [LastName] [followed by context]
   * 
   * Examples:
   * - "Ms padua is the head of..." → "padua"
   * - "Sir victorio is the head of..." → "victorio"
   * - "Dr. Smith presented..." → "Smith"
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted names
   * @private
   */
  function extractNamesWithHonorific(text) {
    const names = [];
    let match;
    
    while ((match = HONORIFICS.exec(text)) !== null) {
      const honorific = match[1];
      const name = match[2].trim();
      
      // Filter out common non-PII names
      if (name.length >= 2 && !shouldFilterCommonName(name)) {
        // Check for duplicates
        if (!names.some(n => n.toLowerCase() === name.toLowerCase())) {
          names.push(name);
        }
      }
    }
    
    return names;
  }

  // Appositive phrases that indicate roles/positions
  // Patterns like "is the head of", "is the director of", "serves as", etc.
  const APPOSITIVE_ROLE_PHRASES = [
    /is\s+(?:the\s+)?head\s+(?:of|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /is\s+(?:the\s+)?director\s+(?:of|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /is\s+(?:the\s+)?chair(?:man|woman|person)?\s+(?:of|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /is\s+(?:the\s+)?lead(?:er)?\s+(?:of|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /is\s+(?:the\s+)?coordinator\s+(?:of|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /is\s+(?:part\s+)?(?:of|in)\s+(?:the\s+)?([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /serves\s+as\s+(?:the\s+)?(?:head|director|chair|lead)\s+(?:of|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /works?\s+(?:as|for)\s+(?:the\s+)?([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
    /responsible\s+for\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$)/gi,
  ];

  // Role indicators in context (words that suggest someone is in a role)
  // e.g., "3 professors as my panelist", "my advisor", "my mentor"
  const ROLE_INDICATORS = [
    'professor', 'professors', 'panelist', 'panelists', 'advisor', 'advisors',
    'mentor', 'mentors', 'instructor', 'instructors', 'teacher', 'teachers',
    'lecturer', 'lecturers', 'chairman', 'chairperson', 'director', 'directors',
    'manager', 'managers', 'head', 'heads', 'coordinator', 'coordinators',
    'specialist', 'specialists', 'consultant', 'consultants', 'officer', 'officers',
    'representative', 'representatives', 'analyst', 'analysts'
  ];

  // ── Helper: Filter common non-PII names ─────────────────────────────────────

  /**
   * Check if a name is a common generic name that should be filtered.
   * Uses a lightweight heuristic instead of relying solely on a dictionary.
   * 
   * @param {string} name - The name to check
   * @param {object} options - Optional flags for context
   * @param {boolean} options.isInSubjectPosition - true if the name appeared before "is a/an"
   * @returns {boolean} true if the name should be filtered out
   * @private
   */
  function shouldFilterCommonName(name, options = {}) {
    if (!name || name.length === 0) return true;
    const lower = name.toLowerCase().trim();
    const firstWord = lower.split(/\s+/)[0];
    
    // If it's in subject position before "is a/an", be more lenient
    // (subject position + capitalization = likely real name)
    if (options.isInSubjectPosition) {
      // Only filter if it's an obvious placeholder
      if (['example', 'test', 'demo', 'sample', 'user', 'admin', 'root'].includes(firstWord)) {
        return true;
      }
      // Allow names that appear in subject position, even if generic
      return false;
    }
    
    // For other contexts, use dictionary + heuristics
    return COMMON_FIRST_NAMES.has(firstWord);
  }

  /**
   * Check if a job title is a common generic title that should be filtered.
   * Uses linguistic heuristics instead of relying solely on dictionary.
   * 
   * @param {string} title - The job title to check
   * @param {object} options - Optional flags for context
   * @param {boolean} options.isFromPredicate - true if extracted from "is a/an [title]"
   * @returns {boolean} true if the title should be filtered out
   * @private
   */
  function shouldFilterCommonJobTitle(title, options = {}) {
    if (!title || title.length === 0) return true;
    const lower = title.toLowerCase().trim();
    
    // If from predicate position ("is a/an X"), be more lenient with filtering
    // Reason: predicate position + article indicates occupational context
    if (options.isFromPredicate) {
      // Only filter obvious non-PII placeholders
      if (['person', 'people', 'employee', 'staff', 'worker', 'thing', 'being'].includes(lower)) {
        return true;
      }
      // Allow most other terms as valid job titles
      return false;
    }
    
    // For other contexts, use dictionary
    return COMMON_JOB_TITLES.has(lower);
  }

  // ── Helper: Extract names from subject position without honorifics ──────────

  /**
   * ALGORITHM: Extract person names that appear in subject position before "is a/an/the".
   * 
   * Key insight: In English, the subject of a copular sentence (before "is") is typically
   * a proper noun when capitalized. This lets us detect names without honorifics.
   * 
   * Pattern: [Capitalized Word(s)] + "is a/an/the" → subject is likely a name
   * 
   * Examples:
   * - "Maria is a human resource manager" → "Maria"
   * - "Marie is a software engineer" → "Marie"
   * - "John Smith is the head of IT" → "John Smith"
   * - "Dr. Smith is the director" → "Smith" (also caught by honorific pattern)
   *
   * NOT captured:
   * - "The manager is responsible" (subject "manager" is common noun, all-lowercase)
   * - "management is complex" (common noun, lowercase)
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted subject-position names
   * @private
   */
  function extractSubjectPositionNames(text) {
    const names = [];
    
    // Pattern: 1-3 capitalized words followed by "is a", "is an", or "is the"
    // Requires at least one capital letter to avoid matching common nouns
    // Stop at sentence boundaries or common conjunctions
    const subjectPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the)\s+/gi;
    
    let match;
    while ((match = subjectPattern.exec(text)) !== null) {
      const potentialName = match[1].trim();
      
      // Heuristic 1: Must be 2+ characters
      if (potentialName.length < 2) continue;
      
      // Heuristic 2: Must start with capital letter (strong indicator of proper noun)
      if (!/^[A-Z]/.test(potentialName)) continue;
      
      // Heuristic 3: If single word, require 3+ characters to avoid false positives like "Jo"
      const words = potentialName.split(/\s+/);
      if (words.length === 1 && potentialName.length < 3) continue;
      
      // Heuristic 4: Filter obvious non-names (using subject position context)
      if (shouldFilterCommonName(potentialName, { isInSubjectPosition: true })) continue;
      
      // Heuristic 5: Avoid duplicates
      if (names.some(n => n.toLowerCase() === potentialName.toLowerCase())) continue;
      
      names.push(potentialName);
    }
    
    return names;
  }

  // ── Helper: Extract job titles from predicate position ──────────────────────

  /**
   * ALGORITHM: Extract job titles from predicate position after "is a/an/the".
   * 
   * Key insight: In English, occupations follow copular verbs with articles:
   * - "[Name] is a [JOB PHRASE]"
   * - "[Name] is an [JOB PHRASE]"  
   * - "[Name] is the [JOB PHRASE] of [ORG]"
   *
   * The job phrase can be multi-word: "human resource manager", "software engineer",
   * "chief information officer", etc. We extract the entire noun phrase without
   * requiring it to be in a dictionary.
   *
   * Strategy:
   * 1. Match pattern "[Name] is a/an/the [PHRASE]" 
   * 2. Extract the phrase up to natural boundaries (punctuation, "of", "at", "for", etc.)
   * 3. Clean up boundaries intelligently (remove trailing articles, prepositions)
   * 4. Return the extracted phrase as a potential job title
   *
   * Examples:
   * - "Maria is a human resource manager" → "human resource manager"
   * - "John is the head of IT" → "head" (or "head of IT" depending on boundary)
   * - "Sarah is an administrative assistant" → "administrative assistant"
   * - "Michael is a senior software engineer at Google" → "senior software engineer"
   *
   * Does NOT rely on dictionary. Validates via linguistic patterns:
   * - Multi-word titles accepted (esp. with adjective+noun patterns)
   * - Single-word titles accepted if preceded by article (a/an/the)
   * - Filters only obvious non-titles (person, people, thing, being)
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted job title phrases
   * @private
   */
  function extractPredicateJobTitles(text) {
    const titles = [];
    
    // Pattern 1: "[Name] is a [job phrase]"
    // Captures: capitalized word(s) + "is a" + lowercase noun phrase
    // Stops at: prepositions (at, for, in, of, by), punctuation, or sentence end
    // Word after "is a" must be lowercase (indicates adjective or noun, not proper noun)
    const predicatePatternA = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+a\s+([a-z][a-z\s]*?)(?:\s+(?:at|for|in|of|by|and|or)|\.|\,|;|$)/gi;
    
    let match;
    while ((match = predicatePatternA.exec(text)) !== null) {
      let title = match[1].trim();
      
      // Clean up: remove trailing prepositions if any slipped through
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      // Heuristic 1: Must be 2+ characters
      if (title.length < 2) continue;
      
      // Heuristic 2: Filter obvious non-titles
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      
      // Heuristic 3: Avoid duplicates
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // Pattern 2: "[Name] is an [job phrase]"
    // Similar to Pattern 1, but for titles starting with vowels
    const predicatePatternAn = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+an\s+([a-z][a-z\s]*?)(?:\s+(?:at|for|in|of|by|and|or)|\.|\,|;|$)/gi;
    
    while ((match = predicatePatternAn.exec(text)) !== null) {
      let title = match[1].trim();
      
      // Clean up: remove trailing prepositions if any slipped through
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      // Heuristic 1: Must be 2+ characters
      if (title.length < 2) continue;
      
      // Heuristic 2: Filter obvious non-titles
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      
      // Heuristic 3: Avoid duplicates
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // Pattern 3: "[Name] is the [job phrase]"
    // The definite article "the" often precedes unique roles or organizational positions
    // e.g., "John is the head of IT", "Maria is the director of HR"
    const predicatePatternThe = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+the\s+([a-z][a-z\s]*?)(?:\s+(?:at|for|in|of|by|and|or)|\.|\,|;|$)/gi;
    
    while ((match = predicatePatternThe.exec(text)) !== null) {
      let title = match[1].trim();
      
      // Clean up: remove trailing prepositions if any slipped through
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      // Heuristic 1: Must be 2+ characters
      if (title.length < 2) continue;
      
      // Heuristic 2: Filter obvious non-titles
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      
      // Heuristic 3: Avoid duplicates
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // Pattern 4: Extract individual words that are common job title indicators
    // When we see a phrase like "manager", "engineer", "director", "coordinator" alone,
    // it's worth extracting even without the full title. This catches cases where
    // the user wants just "manager" detected from "human resource manager".
    // 
    // Strategy: Look for lowercase job-indicator words (often final word in titles)
    // that appear after "is a/an/the" or in standalone contexts
    const jobIndicators = [
      'manager', 'engineer', 'director', 'coordinator', 'specialist', 'consultant',
      'analyst', 'assistant', 'designer', 'developer', 'officer', 'representative',
      'advocate', 'architect', 'administrator', 'supervisor', 'lead', 'head',
      'chief', 'coordinator', 'handler', 'officer', 'executive', 'strategist',
      'planner', 'auditor', 'inspector', 'supervisor', 'correspondent'
    ];
    
    for (const indicator of jobIndicators) {
      // Only extract if it appears in occupational context: "is a/an [indicator]"
      // This ensures we catch standalone job titles when they appear as predicates
      const indicatorPattern = new RegExp(`\\bis\\s+a(?:n)?\\s+${indicator}\\b`, 'gi');
      if (indicatorPattern.test(text)) {
        // Check if not already extracted from multi-word title
        if (!titles.some(t => t.toLowerCase().includes(indicator.toLowerCase()))) {
          titles.push(indicator);
        }
      }
    }
    
    return titles;
  }
  function extractFromAppositives(text) {
    const roles = [];
    const organizations = [];
    
    // Pattern 1: "is the head of [X]" where X is typically a department/org
    let match = /\bis\s+(?:the\s+)?head\s+(?:of|for)\s+(?:the\s+)?([A-Za-z0-9&\s]+?)(?:\s+who|\.|,|;|$)/gi.exec(text);
    if (match) {
      const extracted = match[1].trim();
      if (extracted.length >= 2 && extracted.length <= 50) {
        organizations.push(extracted);
      }
    }
    
    // Pattern 2: "is part of [X]" or "is also part of [X]" where X is typically an org
    match = /\bis\s+(?:also\s+)?part\s+of\s+(?:the\s+)?([A-Za-z0-9&\s]+?)(?:\s+at|\.|,|;|$|and)/gi.exec(text);
    if (match) {
      const extracted = match[1].trim();
      if (extracted.length >= 2 && extracted.length <= 50) {
        organizations.push(extracted);
      }
    }
    
    // Pattern 3: "is the head of [network/security/infrastructure/track]" - these are roles/domains
    match = /\bis\s+(?:the\s+)?head\s+(?:of|for)\s+(?:the\s+)?([a-z\s]+?(?:network|security|infrastructure|track|it|engineering|department)[\w\s]*?)(?:\s+and|\.|,|;|$)/gi.exec(text);
    if (match) {
      const extracted = match[1].trim();
      if (extracted.length >= 2 && extracted.length <= 50 && !extracted.toLowerCase().includes('infrastructure of')) {
        roles.push(extracted);
      }
    }
    
    // Pattern 4: "responsible for [X]"
    match = /\bresponsible\s+for\s+(?:the\s+)?([A-Za-z0-9&\s]+?)(?:\.|,|;|$)/gi.exec(text);
    if (match) {
      const extracted = match[1].trim();
      if (extracted.length >= 2 && extracted.length <= 50) {
        roles.push(extracted);
      }
    }
    
    // Pattern 5: "serves as [Role]"
    match = /\bserves\s+as\s+(?:the\s+)?(?:head|director|chair|lead)\s+(?:of|for)\s+([A-Za-z0-9&\s]+?)(?:\.|,|;|$)/gi.exec(text);
    if (match) {
      const extracted = match[1].trim();
      if (extracted.length >= 2 && extracted.length <= 50) {
        roles.push(extracted);
      }
    }
    
    return { 
      roles: [...new Set(roles)],  // Deduplicate
      organizations: [...new Set(organizations)]
    };
  }

  // ── Helper: Extract organization names from context ────────────────────────

  /**
   * ALGORITHM: Extract organization names from contextual patterns.
   *
   * Key insight: Organizations are often mentioned in three contexts:
   * 1. Appositive position: "[Name] is the head/member of [ORG]"
   * 2. Predicate position: "[Name] works at/for [ORG]"
   * 3. Possessive context: "[Name]'s [ORG]" or "[Name] in [ORG]"
   *
   * Instead of a hardcoded org list, we use linguistic patterns:
   * - Multi-word capitalized phrases after "of", "at", "for"
   * - Acronyms (all caps, 2-5 characters)
   * - Branded terms (capitalized words in organizational context)
   *
   * Examples:
   * - "is the head of the oict" → "oict" 
   * - "works at Google" → "Google"
   * - "is part of HR department" → "HR department"
   *
   * Strategy:
   * - Extract capitalized multi-word phrases after organizational prepositions
   * - Accept acronyms (especially common in corporate/government contexts)
   * - Clean up articles and common words
   * - Validate through boundary detection (punctuation, conjunctions)
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted organization names
   * @private
   */
  function extractOrganizationContexts(text) {
    const orgs = [];
    
    // Pattern 1: "is the head/member of [ORG]" or "is part of [ORG]" or "in [ORG]"
    // Captures capitalized words or acronyms after prepositions
    // Stops at punctuation, conjunctions, or sentence end
    const headOfPattern = /\b(?:is\s+(?:the\s+)?(?:head|chief|member|part|employee|leader|director|coordinator)|in)\s+(?:of|in|the\s+)?(?:the\s+)?([A-Z][A-Za-z\s&]*?)(?:\s+(?:and|or|at|which|where)|\.|\,|;|$)/gi;
    
    let match;
    while ((match = headOfPattern.exec(text)) !== null) {
      let org = match[1].trim();
      
      // Clean up trailing articles or low-value words
      org = org.replace(/\s+(?:and|or|at)\s*$/i, '').trim();
      
      // Heuristic 1: Must be 2+ characters
      if (org.length < 2) continue;
      
      // Heuristic 2: Avoid obvious non-organizations
      const lower = org.toLowerCase();
      if (['the', 'a', 'an', 'that', 'this', 'who', 'which'].includes(lower)) continue;
      
      // Heuristic 3: Avoid duplicates
      if (orgs.some(o => o.toLowerCase() === lower)) continue;
      
      orgs.push(org);
    }
    
    // Pattern 1B: Standalone capitalized words/phrases (catch organizations mentioned without context)
    // Examples: "university of santo tomas", "oict", "Google"
    // Pattern: Capitalized word(s), potentially with "of", "and", or "the" between them
    // Often organizations are in all-caps or title case, possibly multi-word
    const standaloneOrgPattern = /\b([A-Z][A-Za-z]+(?:\s+(?:of|and|the)\s+[A-Z][A-Za-z]+)+)\b/gi;
    
    while ((match = standaloneOrgPattern.exec(text)) !== null) {
      let org = match[1].trim();
      
      // Clean up trailing articles
      org = org.replace(/\s+(?:the)\s+$/i, '').trim();
      
      // Heuristic: Must be meaningful length (at least 5 chars for multi-word)
      if (org.length < 5) continue;
      
      // Avoid duplicates
      if (orgs.some(o => o.toLowerCase() === org.toLowerCase())) continue;
      
      orgs.push(org);
    }
    
    // Pattern 1C: Acronyms or single capitalized words (OICT, Google, etc.)
    // This catches single-word organization names
    const acronymOrgPattern = /\b([A-Z]{2,}|[A-Z][a-z]{3,})\b/gi;
    
    while ((match = acronymOrgPattern.exec(text)) !== null) {
      let org = match[1].trim();
      
      // Only include actual acronyms (all caps) or recognized org names (Title Case, 4+ chars)
      if (!/^[A-Z]+$/.test(org) && org.length < 4) continue;
      
      // Skip common English words
      const lower = org.toLowerCase();
      const commonWords = ['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'which', 'who', 'why', 'how', 'name', 'human', 'manager', 'head', 'part', 'person'];
      if (commonWords.includes(lower)) continue;
      
      // Avoid duplicates
      if (orgs.some(o => o.toLowerCase() === lower)) continue;
      
      orgs.push(org);
    }
    
    // Pattern 2: "works at/for [ORG]" or "employed at/by [ORG]"
    // Captures capitalized words after workplace prepositions
    const worksAtPattern = /\b(?:works?|employed?|working)\s+(?:at|by|for|with)\s+(?:the\s+)?([A-Z][A-Za-z\s&]*?)(?:\s+(?:and|or|which|where)|\.|\,|;|$)/gi;
    
    while ((match = worksAtPattern.exec(text)) !== null) {
      let org = match[1].trim();
      
      // Clean up trailing words
      org = org.replace(/\s+(?:and|or|which|where)\s*$/i, '').trim();
      
      // Heuristic 1: Must be 3+ characters (longer threshold for workplace context)
      if (org.length < 3) continue;
      
      // Heuristic 2: Avoid obvious non-organizations
      const lower = org.toLowerCase();
      if (['the', 'a', 'an', 'that', 'this', 'there'].includes(lower)) continue;
      
      // Heuristic 3: Avoid duplicates
      if (orgs.some(o => o.toLowerCase() === lower)) continue;
      
      orgs.push(org);
    }
    
    // Pattern 3: Acronyms or all-caps organization names
    // Patterns like "OICT", "HR", "IT", "Google", "Apple", "Microsoft"
    // These appear in contexts like "is part of OICT" or "head of HR"
    // Look for 2-5 letter acronyms or capitalized single words
    const acronymPattern = /\b(?:of|at|for|in|with)\s+([A-Z]{2,5})(?:\s+(?:and|or|department|unit)|\.|\,|;|$)/gi;
    
    while ((match = acronymPattern.exec(text)) !== null) {
      let org = match[1].trim();
      
      // Heuristic: Acronyms should be 2-5 chars
      if (org.length < 2 || org.length > 5) continue;
      
      // Avoid common non-org acronyms
      if (['THE', 'AND', 'FOR', 'WITH', 'THIS', 'THAT', 'WHEN', 'WHAT', 'WHICH'].includes(org)) continue;
      
      // Avoid duplicates
      if (orgs.some(o => o.toLowerCase() === org.toLowerCase())) continue;
      
      orgs.push(org);
    }
    
    // Pattern 4: Department or division names
    // Patterns like "HR department", "IT division", "Finance team"
    // These are tagged with formal department markers
    const departmentPattern = /\b(?:of|in|from|with)\s+(?:the\s+)?([A-Z][a-z]*(?:\s+(?:department|division|unit|team|group|branch|office|bureau|section))?)\s+(?:department|division|unit|team|group|branch|office|bureau|section)(?:\s+(?:and|or)|\.|\,|;|$)/gi;
    
    while ((match = departmentPattern.exec(text)) !== null) {
      let org = match[1].trim();
      
      // Heuristic: Must be 2+ characters
      if (org.length < 2) continue;
      
      // Avoid duplicates
      if (orgs.some(o => o.toLowerCase() === org.toLowerCase())) continue;
      
      orgs.push(org);
    }
    
    return orgs;
  }

  // ── Helper: Link entities across sentences ────────────────────────────────────

  /**
   * Parse text into sentences and extract entities with their context.
   * This enables multi-sentence linking of names, roles, and organizations.
   *
   * Example:
   *   "i have 3 professors as my panelist. Ms padua is the head of the oict."
   *   
   *   Sentence 1: role_context = ["professors", "panelist"]
   *   Sentence 2: name = "padua", appositive = "head of oict"
   *   Result: Link "padua" to "professor" role and "oict" organization
   *
   * @param {string} text - The text to analyze
   * @returns {Array} array of entity objects with context
   * @private
   */
  function extractEntityContextPairs(text) {
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const entities = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      
      // Extract names with honorifics in this sentence
      const honorificNames = extractNamesWithHonorific(sentence);
      
      // Extract appositive info
      const { roles, organizations } = extractFromAppositives(sentence);
      
      // Extract role indicators ("3 professors", "my panelist")
      const roleIndicatorsInSentence = [];
      for (const indicator of ROLE_INDICATORS) {
        if (new RegExp(`\\b${indicator}\\b`, 'gi').test(sentence)) {
          roleIndicatorsInSentence.push(indicator);
        }
      }
      
      // If this sentence mentions roles but no names, store context for next sentence
      if ((roleIndicatorsInSentence.length > 0 || roles.length > 0) && honorificNames.length === 0) {
        entities.push({
          type: 'role_context',
          roles: roleIndicatorsInSentence,
          organizations: organizations,
          sentence: sentence,
          sentenceIndex: i
        });
      }
      
      // If this sentence has names with appositive info, link them
      for (const name of honorificNames) {
        entities.push({
          type: 'person',
          name: name,
          roles: roles,
          organizations: organizations,
          roleIndicators: roleIndicatorsInSentence,
          sentence: sentence,
          sentenceIndex: i
        });
      }
    }
    
    // Link nearby context: if a sentence with role_context is followed by a sentence with names,
    // apply the context to those names
    for (let i = 0; i < entities.length - 1; i++) {
      if (entities[i].type === 'role_context' && entities[i + 1]?.type === 'person') {
        // Person in next sentence inherits context from previous
        if (entities[i + 1].sentenceIndex - entities[i].sentenceIndex === 1) {
          entities[i + 1].roleIndicators = [
            ...new Set([...entities[i + 1].roleIndicators, ...entities[i].roles])
          ];
          entities[i + 1].organizations = [
            ...new Set([...entities[i + 1].organizations, ...entities[i].organizations])
          ];
        }
      }
    }
    
    return entities;
  }

  // ── Helper: Deduplicate within PATH C ───────────────────────────────────────

  /**
   * Remove duplicate findings within PATH C (same entity extracted multiple ways).
   * @param {Array} findings - Array of findings
   * @returns {Array} deduplicated findings
   * @private
   */
  function deduplicateWithinPath(findings) {
    const seen = new Map();
    const result = [];

    for (const f of findings) {
      const key = f.rawMatch.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.set(key, f);
        result.push(f);
      }
    }

    return result;
  }

  // ── Entity extraction: Person names ────────────────────────────────────────

  /**
   * Extract person name findings from the document.
   * Uses NER tagging and linguistic analysis from compromise.js
   *
   * Strategy:
   * - Method 1: Use compromise.js NER (doc.people()) if available
   * - Method 2: Extract names with honorifics (Mr, Ms, Dr, Prof, etc.)
   * - Method 3: Extract from appositive phrases and multi-sentence context
   * - Method 4: Fallback to trigger phrases for explicit declarations ("my name is", etc.)
   * 
   * @param {object} doc - compromise.js document object
   * @returns {Array} array of person name findings
   * @private
   */
  function extractPersons(doc) {
    const findings = [];

    if (!doc) return findings;

    try {
      const text = doc.out('text');
      
      // Method 1: Use compromise.js NER to extract people
      // doc.people() returns entities tagged as person names
      const entities = doc.people();
      if (entities && entities.length > 0) {
        const peopleList = entities.out('array');
        for (const person of peopleList) {
          const rawMatch = person.trim();

          // Filter out common non-PII names
          if (!rawMatch || shouldFilterCommonName(rawMatch) || rawMatch.length < 2) {
            continue;
          }

          // Deduplicate
          if (!findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
            findings.push({
              patternId: 'nlp_person_name',
              label: 'Person Name (NLP)',
              risk: 'low',
              rawMatch,
              safeVersion: '[NAME REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Method 2: Extract names with honorifics (NEW)
      // Patterns: "Ms padua", "Sir victorio", "Dr. Smith", etc.
      const honorificNames = extractNamesWithHonorific(text);
      for (const name of honorificNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (NLP - Honorific)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      
      // Method 2.5: Extract names from subject position (NEW - MAIN IMPROVEMENT)
      // Detects names in "[Name] is a/an/the [job]" without requiring honorifics
      // This is the KEY algorithm that handles "Maria is a human resource manager"
      const subjectNames = extractSubjectPositionNames(text);
      for (const name of subjectNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (NLP - Subject Position)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      
      // Method 3: Extract from multi-sentence context (NEW)
      // Handles cases like: "i have 3 professors. Ms padua is the head of oict."
      const entityContexts = extractEntityContextPairs(text);
      for (const entity of entityContexts) {
        if (entity.type === 'person') {
          if (!findings.some(f => f.rawMatch.toLowerCase() === entity.name.toLowerCase())) {
            findings.push({
              patternId: 'nlp_person_name',
              label: 'Person Name (NLP - Contextual)',
              risk: 'low',
              rawMatch: entity.name,
              safeVersion: '[NAME REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Method 4: Fallback to trigger phrases for explicit name declarations
      // This catches cases like "my name is X" that might not trigger NER
      const nameTriggers = [
        /\bmy\s+name\s+is\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
        /\bi['']m\s+called\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
        /\bi\s+am\s+named\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
        /\bcall\s+me\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
        // NEW: Predicate nominative with job title - "[Name] is a/an [job]"
        // Captures capitalized word before "is a/an" - the subject name
        /\b([A-Z][a-z]+)\s+is\s+a(?:n)?\s+[a-z]/gi,
      ];
      
      for (const trigger of nameTriggers) {
        let match;
        while ((match = trigger.exec(text)) !== null) {
          const potentialName = match[1].trim();
          
          // Filter common names and ensure minimum length
          if (potentialName.length >= 2 && !shouldFilterCommonName(potentialName)) {
            // Check if not already added
            if (!findings.some(f => f.rawMatch.toLowerCase() === potentialName.toLowerCase())) {
              findings.push({
                patternId: 'nlp_person_name',
                label: 'Person Name (NLP)',
                risk: 'low',
                rawMatch: potentialName,
                safeVersion: '[NAME REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] NER people extraction failed:', error.message);
    }

    return findings;
  }

  // ── Entity extraction: Job titles ──────────────────────────────────────────

  /**
   * Extract job title findings from the document.
   * Uses compromise.js tagging and multi-method detection to identify occupational entities via:
   * - Appositive phrases ("is the head of", "serves as")
   * - Role indicators with names ("3 professors", "my panelist")
   * - Context analysis from honorific patterns
   * - POS heuristics + sentence parsing for occupational noun phrases
   *
   * @param {object} doc - compromise.js document object
   * @returns {Array} array of job title findings
   * @private
   */
  function extractJobTitles(doc) {
    const findings = [];

    if (!doc) return findings;

    try {
      const text = doc.out('text');
      
      // Method 1: Extract job titles from predicate position (NEW - MAIN IMPROVEMENT)
      // Patterns: "[Name] is a [human resource manager]", "[Name] is an [engineer]"
      // This is the KEY algorithm that handles "manager" alone and full phrases
      // WITHOUT requiring a job title dictionary
      const predicateTitles = extractPredicateJobTitles(text);
      for (const title of predicateTitles) {
        if (title.length >= 2 && !shouldFilterCommonJobTitle(title, { isFromPredicate: true })) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === title.toLowerCase())) {
            findings.push({
              patternId: 'nlp_job_title',
              label: 'Job Title (NLP - Predicate Position)',
              risk: 'low',
              rawMatch: title,
              safeVersion: '[JOB TITLE REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Method 1.5: Extract from appositive phrases (NEW)
      // Patterns: "is the head of [role]", "serves as [role]", etc.
      const { roles, organizations } = extractFromAppositives(text);
      for (const role of roles) {
        if (role.length >= 2 && !shouldFilterCommonJobTitle(role)) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === role.toLowerCase())) {
            findings.push({
              patternId: 'nlp_job_title',
              label: 'Job Title (NLP - Appositive)',
              risk: 'low',
              rawMatch: role,
              safeVersion: '[JOB TITLE REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Method 2: Extract from entity context (NEW)
      // Captures role indicators like "professor", "panelist" when used with names
      const entityContexts = extractEntityContextPairs(text);
      for (const entity of entityContexts) {
        if (entity.type === 'person') {
          for (const roleIndicator of entity.roleIndicators) {
            if (!shouldFilterCommonJobTitle(roleIndicator)) {
              if (!findings.some(f => f.rawMatch.toLowerCase() === roleIndicator.toLowerCase())) {
                findings.push({
                  patternId: 'nlp_job_title',
                  label: 'Job Title (NLP - Role Indicator)',
                  risk: 'low',
                  rawMatch: roleIndicator,
                  safeVersion: '[JOB TITLE REDACTED]',
                  source: 'C_linguistic',
                  validated: false
                });
              }
            }
          }
        }
      }
      
      // Method 3: Traditional job trigger phrases (existing logic)
      const jobTriggers = [
        /\bi\s+work\s+as\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bi\s+work\s+as\s+an\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bi['']m\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bi\s+am\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bwork(?:ing|ed)?\s+as\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bemploy(?:ed)?\s+as\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bposition\s+(?:is|as)\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\brole\s+(?:is|as)\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\b(?:job\s+)?title\s+(?:is|:)?\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        // NEW: Predicate nominative - "[Name] is a/an [job]"
        // Captures job title after "is a/an"
        /\b[A-Z][a-z]+\s+is\s+a(?:n)?\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+at|\s+in|\.|,|$)/gi,
      ];
      
      // Extract job titles using trigger patterns
      for (const trigger of jobTriggers) {
        let match;
        while ((match = trigger.exec(text)) !== null) {
          const potentialTitle = match[1].trim();
          
          // Filter common generic titles and ensure minimum length
          if (potentialTitle.length >= 2 && !shouldFilterCommonJobTitle(potentialTitle)) {
            // Check for duplicates
            if (!findings.some(f => f.rawMatch.toLowerCase() === potentialTitle.toLowerCase())) {
              findings.push({
                patternId: 'nlp_job_title',
                label: 'Job Title (NLP)',
                risk: 'low',
                rawMatch: potentialTitle,
                safeVersion: '[JOB TITLE REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] Job title extraction failed:', error.message);
    }

    return findings;
  }

  // ── Entity extraction: Organizations ───────────────────────────────────────

  /**
   * Extract organization name findings from the document.
   * Uses NER tagging, appositive analysis, and contextual extraction
   *
   * Strategy:
   * - Method 1: Use compromise.js NER (doc.organizations()) if available
   * - Method 2: Extract from appositive phrases ("is the head of oict")
   * - Method 3: Extract from entity context linking
   * - Method 4: Fallback to trigger phrases for explicit org declarations
   *
   * @param {object} doc - compromise.js document object
   * @returns {Array} array of organization findings
   * @private
   */
  function extractOrganizations(doc) {
    const findings = [];

    if (!doc) return findings;

    try {
      const text = doc.out('text');
      
      // Method 1: Use compromise.js NER to extract organizations
      // doc.organizations() returns entities tagged as organization names
      const entities = doc.organizations();
      if (entities && entities.length > 0) {
        const orgList = entities.out('array');
        for (const org of orgList) {
          const rawMatch = org.trim();

          // Filter out short strings (likely false positives)
          if (!rawMatch || rawMatch.length < 3) {
            continue;
          }

          // Deduplicate
          if (!findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
            findings.push({
              patternId: 'nlp_organization',
              label: 'Organization (NLP)',
              risk: 'low',
              rawMatch,
              safeVersion: '[ORGANIZATION REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Method 1.5: Extract from contextual patterns (NEW - MAIN IMPROVEMENT)
      // Patterns: "is the head of [ORG]", "works at [ORG]", etc.
      // WITHOUT requiring a hardcoded org dictionary
      const contextOrgs = extractOrganizationContexts(text);
      for (const org of contextOrgs) {
        if (org.length >= 2 && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
          findings.push({
            patternId: 'nlp_organization',
            label: 'Organization (NLP - Contextual)',
            risk: 'low',
            rawMatch: org,
            safeVersion: '[ORGANIZATION REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      
      // Method 2: Extract from appositive phrases (NEW)
      // Patterns: "is the head of oict", "is part of oict", etc.
      const { organizations } = extractFromAppositives(text);
      for (const org of organizations) {
        if (org.length >= 3 && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
          findings.push({
            patternId: 'nlp_organization',
            label: 'Organization (NLP - Appositive)',
            risk: 'low',
            rawMatch: org,
            safeVersion: '[ORGANIZATION REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      
      // Method 3: Extract from entity context (NEW)
      // Captures organizations linked to named persons
      const entityContexts = extractEntityContextPairs(text);
      for (const entity of entityContexts) {
        if (entity.type === 'person') {
          for (const org of entity.organizations) {
            if (org.length >= 3 && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
              findings.push({
                patternId: 'nlp_organization',
                label: 'Organization (NLP - Contextual)',
                risk: 'low',
                rawMatch: org,
                safeVersion: '[ORGANIZATION REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
      // Method 4: Fallback to trigger phrases for explicit org declarations
      // This catches cases where NER might miss organizations or need context
      const orgTriggers = [
        /\bwork\s+at\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bwork\s+for\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bwork\s+with\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bemploy(?:ed)?\s+(?:at|by)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bworking\s+(?:at|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
      ];
      
      for (const trigger of orgTriggers) {
        let match;
        while ((match = trigger.exec(text)) !== null) {
          const potentialOrg = match[1].trim();
          
          // Filter out short strings and ensure quality
          if (potentialOrg.length >= 3) {
            // Check if not already added from NER
            if (!findings.some(f => f.rawMatch.toLowerCase() === potentialOrg.toLowerCase())) {
              findings.push({
                patternId: 'nlp_organization',
                label: 'Organization (NLP)',
                risk: 'low',
                rawMatch: potentialOrg,
                safeVersion: '[ORGANIZATION REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] NER organization extraction failed:', error.message);
    }

    return findings;
  }

  // ── Main scanning function ─────────────────────────────────────────────────

  /**
   * Scan normalized text for linguistic PII using compromise.js NLP.
   *
   * Pipeline (WITH compromise.js):
   *   1. Initialize compromise.js document from normalized text
   *   2. Extract person names via NER + honorifics + context
   *   3. Extract job titles via POS/context analysis + appositive phrases
   *   4. Extract organizations via NER + context linking
   *   5. Deduplicate findings
   *
   * Fallback Pipeline (WITHOUT compromise.js):
   *   - Uses enhanced trigger phrase regex patterns for person, job, and org extraction
   *   - Includes honorific detection, appositive patterns, and multi-sentence context
   *   - Provides robust detection without NLP library
   *
   * @param {string} textNLP - Linguistic-normalized text view from Normalizer
   * @returns {Array} array of finding objects with structure:
   *   {
   *     patternId: string (nlp_person_name, nlp_job_title, nlp_organization),
   *     label: string,
   *     risk: 'low',
   *     rawMatch: string,
   *     safeVersion: string,
   *     source: 'C_linguistic',
   *     validated: false
   *   }
   * @public
   */
  function scan(textNLP) {
    // Validate input
    if (!textNLP || typeof textNLP !== 'string' || textNLP.trim().length === 0) {
      return [];
    }

    const findings = [];

    try {
      if (COMPROMISE_AVAILABLE) {
        // Full NLP pipeline when compromise.js is available
        const doc = window.nlp(textNLP);

        // Extract entities using compromise.js NER + new methods
        const personFindings = extractPersons(doc);
        const jobFindings = extractJobTitles(doc);
        const orgFindings = extractOrganizations(doc);

        findings.push(...personFindings, ...jobFindings, ...orgFindings);

        console.log(
          '[TrustPrompt/PATH_C] detected (with NLP):',
          `person:${personFindings.length}`,
          `job:${jobFindings.length}`,
          `org:${orgFindings.length}`,
          `| deduplicated:${deduplicateWithinPath(findings).length}`
        );
      }
      
      // ALWAYS run enhanced trigger phrase fallback as backup
      // This ensures real-world patterns like "Ms padua is the head of oict" are always detected
      console.debug('[TrustPrompt/PATH_C] Running enhanced trigger phrase patterns as backup...');
      
      // ★★★ NEW ALGORITHM 1: Subject-Position Names (PRIMARY - RUNS ALWAYS) ★★★
      // Detects names in "[Name] is a/an/the [job]" WITHOUT requiring honorifics
      // This is CRITICAL for "Maria is a human resource manager" detection
      const subjectNames = extractSubjectPositionNames(textNLP);
      for (const name of subjectNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (NLP - Subject Position)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      
      // Person detection: Traditional declaration triggers + predicate nominative
      const nameTriggers = [
        /(?:my name is|i (?:am|'m)|i (?:am|'m) called|call me)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
      ];
      
      for (const trigger of nameTriggers) {
        let match;
        while ((match = trigger.exec(textNLP)) !== null) {
          const name = match[1].trim();
          if (name.length >= 2 && !shouldFilterCommonName(name)) {
            if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
              findings.push({
                patternId: 'nlp_person_name',
                label: 'Person Name (NLP)',
                risk: 'low',
                rawMatch: name,
                safeVersion: '[NAME REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
      // NEW: Contextual name references - "[verb] [Name]"
      // Patterns: "for Maria", "contact John", "email Sarah", "with Alice"
      // Also handle noun forms: "email for Maria", "send message to John"
      const contextualNamePatterns = [
        // Direct patterns: "contact Sarah", "for Maria", "to John"
        /(?:for|to|with|contact|email|send|message|about|regarding|call|text|notify|alert|remind|tell|ask|welcome|greet|meet|see|visit|help|write|invite)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
        // Noun forms: "email for Maria", "message to John", "letter for Sarah", "send message to John"
        /(?:email|message|letter|note|call|text|send)\s+(?:an?|the)?\s*(?:\w+\s+)?(?:for|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
        // Catch remaining: any [verb] [object] to/for [Name] patterns
        /\b(?:send|create|write|generate|compose|prepare|make)\s+(?:an?|the)?\s+\w+\s+(?:for|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
        // Generic: prepositions before capitalized names
        /(?:\s|^)(?:for|to|with|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
        // Fallback: any Capitalized word after prepositions/verbs (to catch edge cases)
        /(?:message|send|call|contact|email|text|notify|about|regarding)\s+(?:\w+\s+)*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
      ];
      
      for (const pattern of contextualNamePatterns) {
        let contextMatch;
        while ((contextMatch = pattern.exec(textNLP)) !== null) {
          const name = contextMatch[1].trim();
          if (name.length >= 2 && !shouldFilterCommonName(name) && /^[A-Z]/.test(name)) {
            if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
              findings.push({
                patternId: 'nlp_person_name',
                label: 'Person Name (NLP)',
                risk: 'low',
                rawMatch: name,
                safeVersion: '[NAME REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
      // Person detection: Honorific + name patterns (NEW)
      // "Ms padua", "Sir victorio", "Dr. Smith", etc.
      const honorificNames = extractNamesWithHonorific(textNLP);
      for (const name of honorificNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (NLP - Honorific)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      
      // Job title detection: Appositive phrases (NEW)
      // "is the head of [title]", "serves as [role]", etc.
      const { roles: appositiveRoles } = extractFromAppositives(textNLP);
      for (const role of appositiveRoles) {
        if (role.length >= 2 && !shouldFilterCommonJobTitle(role)) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === role.toLowerCase())) {
            findings.push({
              patternId: 'nlp_job_title',
              label: 'Job Title (NLP - Appositive)',
              risk: 'low',
              rawMatch: role,
              safeVersion: '[JOB TITLE REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // ★★★ NEW ALGORITHM 2: Predicate Position Job Titles (PRIMARY - RUNS ALWAYS) ★★★
      // Extracts phrases after "is a/an/the" WITHOUT requiring job title dictionary
      // This is CRITICAL for "Maria is a human resource manager" detection
      const predicateTitles = extractPredicateJobTitles(textNLP);
      for (const title of predicateTitles) {
        if (title.length >= 2 && !shouldFilterCommonJobTitle(title, { isFromPredicate: true })) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === title.toLowerCase())) {
            findings.push({
              patternId: 'nlp_job_title',
              label: 'Job Title (NLP - Predicate Position)',
              risk: 'low',
              rawMatch: title,
              safeVersion: '[JOB TITLE REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Job title detection: Traditional triggers
      const jobTriggers = [
        /(?:i work as a|i'm a|work as a|employed as a|role is a)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
      ];
      
      for (const trigger of jobTriggers) {
        let match;
        while ((match = trigger.exec(textNLP)) !== null) {
          const job = match[1].trim();
          if (job.length >= 2 && !shouldFilterCommonJobTitle(job)) {
            if (!findings.some(f => f.rawMatch.toLowerCase() === job.toLowerCase())) {
              findings.push({
                patternId: 'nlp_job_title',
                label: 'Job Title (NLP)',
                risk: 'low',
                rawMatch: job,
                safeVersion: '[JOB TITLE REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
      // NEW: Predicate nominative - "[Name] is a/an [job]"
      // Extract job titles after "is a/an", stopping at common boundaries
      // Use separate patterns for "a" and "an" to avoid regex issues
      
      // Pattern 1: "[Name] is a [job]"
      const predicateJobPatternA = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+is\s+a\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|and|on|for|of|or)|\.|,|$)/gi;
      let jobMatchA;
      while ((jobMatchA = predicateJobPatternA.exec(textNLP)) !== null) {
        let job = jobMatchA[1].trim();
        job = job.replace(/\s+(?:at|in|and|on|for|of|or)$/i, '').trim();
        if (job.length >= 2 && !shouldFilterCommonJobTitle(job)) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === job.toLowerCase())) {
            findings.push({
              patternId: 'nlp_job_title',
              label: 'Job Title (NLP)',
              risk: 'low',
              rawMatch: job,
              safeVersion: '[JOB TITLE REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Pattern 2: "[Name] is an [job]"
      const predicateJobPatternAn = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+is\s+an\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|and|on|for|of|or)|\.|,|$)/gi;
      let jobMatchAn;
      while ((jobMatchAn = predicateJobPatternAn.exec(textNLP)) !== null) {
        let job = jobMatchAn[1].trim();
        job = job.replace(/\s+(?:at|in|and|on|for|of|or)$/i, '').trim();
        if (job.length >= 2 && !shouldFilterCommonJobTitle(job)) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === job.toLowerCase())) {
            findings.push({
              patternId: 'nlp_job_title',
              label: 'Job Title (NLP)',
              risk: 'low',
              rawMatch: job,
              safeVersion: '[JOB TITLE REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Organization detection: Appositive phrases (NEW)
      // "is the head of oict", "is part of oict", etc.
      const { organizations: appositiveOrgs } = extractFromAppositives(textNLP);
      for (const org of appositiveOrgs) {
        if (org.length >= 3) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
            findings.push({
              patternId: 'nlp_organization',
              label: 'Organization (NLP - Appositive)',
              risk: 'low',
              rawMatch: org,
              safeVersion: '[ORGANIZATION REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // ★★★ NEW ALGORITHM 3: Organization Context Detection (PRIMARY - RUNS ALWAYS) ★★★
      // Detects orgs from linguistic patterns WITHOUT hardcoded organization list
      // This is CRITICAL for "Maria is a human resource manager in the oict" detection
      const contextOrgs = extractOrganizationContexts(textNLP);
      for (const org of contextOrgs) {
        if (org.length >= 2 && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
          findings.push({
            patternId: 'nlp_organization',
            label: 'Organization (NLP - Contextual)',
            risk: 'low',
            rawMatch: org,
            safeVersion: '[ORGANIZATION REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      
      // Organization detection: Traditional triggers
      const orgTriggers = [
        /(?:work at|work for|employed at|employed by)\s+([A-Za-z0-9&\s]+?)(?:\.|,|;|$|and)/gi,
      ];
      
      for (const trigger of orgTriggers) {
        let match;
        while ((match = trigger.exec(textNLP)) !== null) {
          const org = match[1].trim();
          if (org.length >= 3) {
            if (!findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
              findings.push({
                patternId: 'nlp_organization',
                label: 'Organization (NLP)',
                risk: 'low',
                rawMatch: org,
                safeVersion: '[ORGANIZATION REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
      if (!COMPROMISE_AVAILABLE) {
        console.log(
          '[TrustPrompt/PATH_C] detected (fallback):',
          `person:${findings.filter(f => f.patternId === 'nlp_person_name').length}`,
          `job:${findings.filter(f => f.patternId === 'nlp_job_title').length}`,
          `org:${findings.filter(f => f.patternId === 'nlp_organization').length}`
        );
      } else {
        console.log(
          '[TrustPrompt/PATH_C] backup trigger patterns detected:',
          `person:${findings.filter(f => f.patternId === 'nlp_person_name').length}`,
          `job:${findings.filter(f => f.patternId === 'nlp_job_title').length}`,
          `org:${findings.filter(f => f.patternId === 'nlp_organization').length}`
        );
      }

      // Deduplicate within PATH C
      const deduplicated = deduplicateWithinPath(findings);
      return deduplicated;

    } catch (error) {
      console.error('[TrustPrompt/PATH_C] Error during linguistic detection:', error);
      return []; // Fail gracefully
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { scan };

})();

// ── QUICK TEST (for browser console) ──────────────────────────────────────────
console.log("[STARTUP] TrustLinguisticDetector is ready. Test with:");
console.log("testLinguisticDetector()");

// Make sure both are globally accessible
if (typeof window !== 'undefined') {
  window.TrustLinguisticDetector = TrustLinguisticDetector;
  
  window.testLinguisticDetector = function() {
    const testText = 'i am kyleen. professor';
    console.log('[TEST] Running testLinguisticDetector...');
    console.log('[TEST] Input:', testText);
    
    if (!window.TrustLinguisticDetector || !window.TrustLinguisticDetector.scan) {
      console.error('[TEST] ERROR: TrustLinguisticDetector.scan is not available');
      return [];
    }
    
    const result = window.TrustLinguisticDetector.scan(testText);
    console.log('[TEST] Result:', result);
    console.log('[TEST] Findings count:', result.length);
    for (const f of result) {
      console.log(`  - ${f.patternId}: "${f.rawMatch}" → "${f.safeVersion}"`);
    }
    return result;
  };
  
  console.log('[STARTUP] testLinguisticDetector attached to window');
  console.log('[STARTUP] typeof window.testLinguisticDetector:', typeof window.testLinguisticDetector);
}



// Also export to globalThis for scanner.js compatibility
if (typeof globalThis !== 'undefined') {
  globalThis.TrustLinguisticDetector = TrustLinguisticDetector;
}
