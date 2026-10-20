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

const TrustLinguisticDetector = (() => {

  // ── Module initialization ──────────────────────────────────────────────────
  // Check if compromise.js is available in global scope
  const COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined;

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

  // ── Helper: Extract standalone person names without honorifics ─────────────

  /**
   * Extract standalone 2-3 word capitalized phrases as person names.
   * This catches names mentioned without honorifics or copular construction.
   * 
   * Examples:
   * - "Kyleen Nicdao said..." → "Kyleen Nicdao"
   * - "My colleague John Smith..." → "John Smith"
   * - "Contact Maria Garcia for..." → "Maria Garcia"
   *
   * Important: Filters out common job titles and organizational names to reduce
   * false positives (e.g., "Human Resources", "Product Manager").
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted names
   * @private
   */
  function extractStandalonePersonNames(text) {
    const names = [];
    
    // Pattern: 2-3 consecutive capitalized words (typical person name format)
    // Examples: "John Smith", "Maria Garcia Lopez"
    // Does NOT require "is a/an/the" trigger (unlike extractSubjectPositionNames)
    const standaloneNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi;
    
    let match;
    while ((match = standaloneNamePattern.exec(text)) !== null) {
      const potentialName = match[1].trim();
      
      // Heuristic 1: Name must be 3+ characters (lowered from 4 to catch more names)
      if (potentialName.length < 3) continue;
      
      // Heuristic 2: Filter out ONLY extreme cases of organizational terms
      // Be less aggressive to allow real names like "Technology" or "Finance" if they appear as names
      const extremeOrgTerms = [
        'human resource', 'product manager', 'project manager', 'information technology',
        'information system'
      ];
      const lowerName = potentialName.toLowerCase();
      if (extremeOrgTerms.some(term => lowerName.includes(term))) continue;
      
      // Heuristic 3: Use classifier to distinguish from organization names
      // This is the key filter - if it classifies as "organization", skip it
      const classification = classifyNameVsOrganization(potentialName);
      if (classification === "organization") continue;  // Skip if classified as org
      
      // Heuristic 4: Avoid single-word matches (must be 2+ words for safety)
      const wordCount = potentialName.split(/\s+/).length;
      if (wordCount < 2) continue;  // Require at least 2 words
      
      // Heuristic 5: Avoid duplicates
      if (names.some(n => n.toLowerCase() === lowerName)) continue;
      
      names.push(potentialName);
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

  // ── Helper: Filter out common words that aren't organizations ──────────────

  /**
   * Check if a candidate string is a common word that shouldn't be classified as organization.
   * This filters out compromises.js NER false positives like person names, medical terms, verbs, etc.
   *
   * @param {string} candidate - The organization candidate
   * @returns {boolean} true if should be filtered out (not a real organization)
   * @private
   */
  function shouldFilterCommonOrganization(candidate) {
    if (!candidate || candidate.length === 0) return true;
    const lower = candidate.toLowerCase().trim();

    // Filter out common person first/last names (might be misclassified as orgs)
    const commonNames = new Set([
      'paul', 'john', 'james', 'michael', 'david', 'robert', 'william', 'richard',
      'charles', 'joseph', 'thomas', 'alice', 'mary', 'patricia', 'jennifer', 'linda',
      'barbara', 'susan', 'jessica', 'sarah', 'karen', 'nancy', 'betty', 'margaret',
      'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis',
      'rodriguez', 'martinez', 'hernandez', 'lopez', 'reyes', 'cruz', 'torres', 'nicdao'
    ]);
    if (commonNames.has(lower)) return true;

    // Filter out medical terms that might be misclassified as organizations
    const medicalTerms = new Set([
      'diabetes', 'cancer', 'fever', 'hypertension', 'depression', 'anxiety', 'asthma',
      'arthritis', 'allergies', 'infection', 'virus', 'bacteria', 'treatment', 'medication',
      'diagnosis', 'disease', 'illness', 'condition', 'symptom', 'pain', 'fatigue',
      'headache', 'migraine', 'flu', 'cold', 'cough', 'pneumonia', 'covid', 'mpox'
    ]);
    if (medicalTerms.has(lower)) return true;

    // Filter out common verbs and auxiliary verbs
    const commonVerbs = new Set([
      'have', 'has', 'had', 'do', 'does', 'did', 'be', 'being', 'been',
      'is', 'are', 'was', 'were', 'am', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'can', 'need', 'want', 'like', 'love', 'think',
      'know', 'believe', 'say', 'said', 'tell', 'told', 'ask', 'asked', 'give',
      'made', 'make', 'work', 'help', 'go', 'come', 'get', 'take', 'bring'
    ]);
    if (commonVerbs.has(lower)) return true;

    // Filter out single-word common terms that aren't organizations
    // Organizations typically have multiple words or are proper nouns with context
    const singleWordNonOrgs = new Set([
      'and', 'or', 'but', 'the', 'a', 'an', 'this', 'that', 'these', 'those',
      'person', 'people', 'thing', 'stuff', 'item', 'group', 'team', 'member',
      'information', 'data', 'system', 'technology', 'service', 'result', 'file',
      'name', 'file', 'type', 'text', 'content', 'message', 'email', 'phone'
    ]);
    
    const words = lower.split(/\s+/).length;
    if (words === 1 && singleWordNonOrgs.has(lower)) {
      return true;
    }

    // Filter out lowercase or all-lowercase single words (unlikely to be org names)
    // Real org names are typically capitalized and/or multi-word
    if (words === 1 && /^[a-z]+$/.test(candidate)) {
      return true;
    }

    return false;
  }

  // ── Helper: Detect if text is a code pattern ───────────────────────────────
  /**
   * FILTER: Reject findings that are actually code patterns (variables, assignments, etc).
   * 
   * This prevents Path C from misclassifying code elements as organizations/persons.
   * For example: "const myValue = 5;" should NOT trigger nlp_organization on "myValue".
   * 
   * Code pattern indicators:
   * - Contains assignment operators (=, :)
   * - camelCase or snake_case identifiers
   * - Common programming keywords (const, let, var, function, class, etc)
   * - Semicolons
   * - Parentheses/braces in close proximity
   *
   * @param {string} text - Full surrounding text context
   * @param {string} candidate - The candidate word being evaluated
   * @returns {boolean} true if appears to be code, should filter out
   * @private
   */
  function isCodePattern(text, candidate) {
    if (!candidate || candidate.length === 0) return false;

    // Pattern 1: Explicit code keywords — if text has code keywords, flag any identifier-like candidate
    const codeKeywords = /\b(const|let|var|function|class|return|async|await|import|export|interface|type|enum|if|for|while|switch|case|default|break|continue|new|this|super|extends|implements)\b/gi;
    if (codeKeywords.test(text)) {
      // If text contains code keywords AND candidate is not a typical person/org name
      // Typical names are multi-word or have all capitals (LIKE "JOHN" or "Inc" at the end)
      const isTypicalName = /\s/.test(candidate) || /^[A-Z]{2,}$/.test(candidate);
      if (!isTypicalName) {
        // Single word or mixed case in code context = likely variable
        if (/[a-z][a-zA-Z0-9]*[A-Z]/.test(candidate) || /_[a-z]/.test(candidate)) {
          return true;  // camelCase or snake_case in code context
        }
      }
    }

    // Pattern 2: Assignment operators nearby — strong indicator of code
    const candidateIndex = text.toLowerCase().indexOf(candidate.toLowerCase());
    if (candidateIndex === -1) return false;
    
    const contextWindow = text.slice(Math.max(0, candidateIndex - 50), 
                                     Math.min(text.length, candidateIndex + candidate.length + 50));
    
    // If surrounded by code punctuation/operators, it's likely code
    const hasAssignmentOp = /\s*=\s*|;\s*$|:\s*/.test(contextWindow);
    const hasBraces = /[{}()\[\]]/.test(contextWindow);
    
    if ((hasAssignmentOp || hasBraces) && !(/\s/.test(candidate))) {
      // Single word surrounded by code markers = variable, not a name
      return true;
    }

    // Pattern 3: camelCase or snake_case without capital at start (strong code indicator)
    const isCamelCase = /^[a-z]+[a-z0-9]*[A-Z]/.test(candidate);
    const isSnakeCase = /_/.test(candidate) && /^[a-z_0-9]+$/.test(candidate);
    
    if ((isCamelCase || isSnakeCase) && candidate.length >= 2) {
      // These patterns almost never appear in person or org names
      return true;
    }
    
    // Pattern 4: Standalone code keywords themselves
    const standalonKeywords = /^(const|let|var|function|class|return|if|else|for|while|do|switch|case|default|break|continue|new|this|import|export|from|as)$/i;
    if (standalonKeywords.test(candidate)) {
      return true;
    }

    return false;
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
   * CLEAN EXTRACTION: Capture ONLY the job title, not context.
   * (Fix: Don't capture "librarian at" or "librarian in the" — just "librarian")
   *
   * Key insight: In English, occupations follow copular verbs with articles:
   * - "[Name] is a [JOB PHRASE]"
   * - "[Name] is an [JOB PHRASE]"  
   * - "[Name] is the [JOB PHRASE] of [ORG]"
   * - "[Pronoun] is a [JOB PHRASE]" — includes pronouns (she, he, they, etc.)
   *
   * Strategy:
   * 1. Match pattern "[Name or Pronoun] is a/an/the [PHRASE]" 
   * 2. Extract phrase up to natural boundaries (prepositions with space after, punctuation)
   * 3. Stop at: " at ", " in ", " for ", " of " (prepositions with spaces)
   * 4. Return ONLY the job title without context
   *
   * Examples:
   * - "Maria is a human resource manager" → "human resource manager"
   * - "she is a librarian at university" → "librarian" (stops at " at ")
   * - "John is the head of IT" → "head" (stops at " of ")
   * - "Sarah is an administrative assistant" → "administrative assistant"
   * - "Michael is a senior software engineer at Google" → "senior software engineer"
   * - "they are lawyers" → "lawyers"
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted job title phrases (clean only)
   * @private
   */
  function extractPredicateJobTitles(text) {
    const titles = [];
    
    // Pattern 1: "[Name or Pronoun] is a [job phrase]"
    // Capture until: preposition + space, or punctuation, or end of string
    // More lenient: allows single words, multi-words, stops cleanly
    const predicatePatternA = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[a-z]+)\s+is\s+a\s+([a-z]+(?:\s+[a-z]+)*)(?=\s+(?:at|in|for|of|by|and|or)|[.,;!?]|$)/gi;
    
    let match;
    while ((match = predicatePatternA.exec(text)) !== null) {
      let title = match[1].trim();
      
      // Additional cleanup: remove trailing prepositions if any slipped through
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      // Heuristic 1: Must be 2+ characters
      if (title.length < 2) continue;
      
      // Heuristic 2: Filter obvious non-titles
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      
      // Heuristic 3: Avoid duplicates
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // Pattern 2: "[Name or Pronoun] is an [job phrase]"
    const predicatePatternAn = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[a-z]+)\s+is\s+an\s+([a-z]+(?:\s+[a-z]+)*)(?=\s+(?:at|in|for|of|by|and|or)|[.,;!?]|$)/gi;
    
    while ((match = predicatePatternAn.exec(text)) !== null) {
      let title = match[1].trim();
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      if (title.length < 2) continue;
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // Pattern 3: "[Name or Pronoun] is the [job phrase]"
    const predicatePatternThe = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[a-z]+)\s+is\s+the\s+([a-z]+(?:\s+[a-z]+)*)(?=\s+(?:at|in|for|of|by|and|or)|[.,;!?]|$)/gi;
    
    while ((match = predicatePatternThe.exec(text)) !== null) {
      let title = match[1].trim();
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      if (title.length < 2) continue;
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // Pattern 4: Extract individual job-indicator words from predicate context
    const jobIndicators = [
      'manager', 'engineer', 'director', 'coordinator', 'specialist', 'consultant',
      'analyst', 'assistant', 'designer', 'developer', 'officer', 'representative',
      'advocate', 'architect', 'administrator', 'supervisor', 'lead', 'head',
      'chief', 'coordinator', 'handler', 'officer', 'executive', 'strategist',
      'planner', 'auditor', 'inspector', 'supervisor', 'correspondent'
    ];
    
    for (const indicator of jobIndicators) {
      const indicatorPattern = new RegExp(`\\bis\\s+a(?:n)?\\s+${indicator}\\b`, 'gi');
      if (indicatorPattern.test(text)) {
        if (!titles.some(t => t.toLowerCase().includes(indicator.toLowerCase()))) {
          titles.push(indicator);
        }
      }
    }
    
    // Pattern 5: "works as a [job]" or "works as an [job]"
    // Must stop before "in" or other prepositions
    const worksAsPattern = /\b(?:works?|employed?)\s+as\s+a(?:n)?\s+([a-z]+(?:\s+[a-z]+)?)(?=\s+(?:at|in|for|,)|[.,;!?]|$)/gi;
    while ((match = worksAsPattern.exec(text)) !== null) {
      let title = match[1].trim();
      if (title.length >= 2 && !shouldFilterCommonJobTitle(title, { isFromPredicate: true })) {
        if (!titles.some(t => t.toLowerCase() === title.toLowerCase())) {
          titles.push(title);
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

  // ── Helper: Heuristics to distinguish names from organizations ──────────────

  /**
   * ALGORITHM: Distinguish personal names from organization names.
   *
   * Key insight: Personal names and organization names have distinct patterns:
   *
   * Personal Names typically:
   * - 2-3 words (FirstName LastName, or FirstName MiddleName LastName)
   * - Each word is 2-10 characters (typical name syllable length)
   * - Pattern: [Capitalized] [Capitalized] or [Capitalized] [Capitalized] [Capitalized]
   * - Examples: "Maria Santos", "John Smith", "Kyleen Nicdao"
   *
   * Organization Names typically:
   * - 2+ words with specific structural markers:
   *   - Include prepositions: "of", "for", "and" (e.g., "University of Santo Tomas")
   *   - Include functional words: "Department", "Division", "Group", "Inc", "Ltd", "Co"
   *   - Acronyms: all-caps 2-5 character sequences (e.g., "IBM", "Google", "OICT")
   *   - Longer compound words (5+ words total)
   * - Contain numbers (e.g., "3M", "3Com")
   * - Examples: "University of Santo Tomas", "Department of IT", "Google Inc"
   *
   * FIX: Improved name/org disambiguation with better defaults:
   * - If text contains org indicator words (Inc, Ltd, Corp, Department, etc.) → org
   * - If text contains prepositions (of, for, in, at) → favor org
   * - Default for ambiguous 2-3 word text: favor ORG if no strong name signals
   *
   * @param {string} text - The candidate text to classify
   * @returns {string} "name" | "organization" | "unknown"
   * @private
   */
  function classifyNameVsOrganization(text) {
    if (!text || text.length < 2) return "unknown";
    
    const lower = text.toLowerCase();
    const words = text.split(/\s+/);
    
    // ★ FILTER: First-person copular patterns are NEVER organizations ★
    // These patterns introduce personal descriptions (names, roles, states), not orgs
    // Examples: "i am kyleen", "you are the manager", "they are consultants"
    const firstPersonCopularPattern = /^(?:i\s+am|you\s+are|we\s+are|they\s+are|she\s+is|he\s+is)\s+/i;
    if (firstPersonCopularPattern.test(text)) {
      return "name";  // First-person patterns always introduce names/descriptions, not organizations
    }
    
    // ★ QUICK WIN: Check for explicit org indicator words FIRST ★
    const explicitOrgWords = new Set([
      'inc', 'corp', 'co', 'ltd', 'llc', 'llp', 'gmbh', 'ag', 'nv', 'sa',
      'department', 'dept', 'division', 'div', 'unit', 'group', 'team', 'bureau',
      'agency', 'administration', 'admin', 'institute', 'university', 'college',
      'school', 'hospital', 'clinic', 'bank', 'fund', 'association', 'society',
      'organization', 'org', 'council', 'committee', 'board', 'foundation',
      'ministry', 'office', 'authority', 'center', 'centre', 'service', 'network',
      'company', 'corporation'
    ]);
    const hasExplicitOrgWord = words.some(w => explicitOrgWords.has(w.toLowerCase()));
    if (hasExplicitOrgWord) {
      return "organization";  // ★ EARLY RETURN: Org indicator overrides everything
    }
    
    // ★ NAME INDICATORS ★
    let nameScore = 0;
    
    // Name pattern: 2-3 capitalized words of typical name length
    if (words.length >= 2 && words.length <= 3) {
      const allWordsProperLength = words.every(w => w.length >= 2 && w.length <= 12);
      if (allWordsProperLength) {
        nameScore += 2;  // Strong name signal
      }
    }
    
    // Each word starts with capital letter (proper noun indicator)
    const allCapitalized = words.every(w => /^[A-Z]/.test(w));
    if (allCapitalized && words.length <= 3) {
      nameScore += 1;
    }
    
    // Words are typical name words (not common org indicators)
    const namePatternWords = ['saint', 'san', 'de', 'la', 'von', 'van', 'el'];  // Common in names
    const hasNameWords = words.some(w => namePatternWords.includes(w.toLowerCase()));
    if (hasNameWords && words.length <= 3) {
      nameScore += 1;
    }
    
    // ★ ORGANIZATION INDICATORS ★
    let orgScore = 0;
    
    // Presence of prepositions (strong org signal)
    const hasPrepositions = /\s(of|for|and|in|at|by|from|with)\s/i.test(' ' + text + ' ');
    if (hasPrepositions) {
      orgScore += 2;
    }
    
    // Presence of functional org words
    const orgWords = [
      'company', 'corporation', 'corp', 'inc', 'ltd', 'llc', 'llp', 'gmbh',
      'department', 'dept', 'division', 'unit', 'group', 'team', 'bureau',
      'agency', 'administration', 'institute', 'institute', 'university', 'college',
      'school', 'hospital', 'clinic', 'bank', 'fund', 'association', 'society',
      'organization', 'org', 'council', 'committee', 'board', 'foundation',
      'ministry', 'office', 'authority', 'center', 'centre', 'service', 'network'
    ];
    const hasOrgWords = words.some(w => orgWords.includes(w.toLowerCase()));
    if (hasOrgWords) {
      orgScore += 3;  // Very strong org signal
    }
    
    // 4+ words often indicates organization (compound names)
    if (words.length >= 4) {
      orgScore += 1;
    }
    
    // Contains numbers (common in orgs: "3M", "3Com", "IBM", "3PL")
    if (/\d/.test(text)) {
      orgScore += 2;
    }
    
    // All uppercase (acronym like "OICT", "IBM", "NASA")
    if (/^[A-Z]{2,}$/.test(text)) {
      orgScore += 2;
    }
    
    // Contains ampersand (common in org names: "Smith & Sons", "A&B Inc")
    if (/&/.test(text)) {
      orgScore += 1;
    }
    
    // Hyphenated words (more common in orgs than names)
    if (/\-/.test(text) && words.length >= 2) {
      orgScore += 1;
    }
    
    // ★ MAKE DECISION ★
    if (nameScore > orgScore && nameScore >= 2) {
      return "name";
    } else if (orgScore > nameScore && orgScore >= 2) {
      return "organization";
    }
    
    // ★ FIX: Improved default logic ★
    // BEFORE: Default to "name" for 2-3 words (caused "Google Inc" to be classified as name)
    // AFTER: Check if there's ANY org indicator; default to org if ambiguous
    if (hasPrepositions) {
      // Prepositions in text strongly suggest org (e.g., "Head of Department")
      return "organization";
    }
    
    if (words.length === 2 || words.length === 3) {
      // For 2-3 word text without prepositions or org keywords, check for name patterns
      // If no explicit name patterns, default to ORGANIZATION (more likely in context)
      // This fixes: "Google Inc", "Microsoft Corp" being misclassified as names
      if (nameScore > 0) {
        return "name";
      } else {
        return "organization";  // ★ FLIP: Ambiguous 2-3 words → organization (less common as names)
      }
    } else if (words.length >= 4) {
      return "organization";
    }
    
    return "unknown";
  }

  /**
   * ORGANIZATION EXTRACTION - CONTEXT ONLY
   * 
   * CRITICAL FIX: Don't extract from "is a" sentences at all!
   * "She is a librarian in..." is about a PERSON'S JOB, not an organization.
   * 
   * ONLY extract from EXPLICIT WORKPLACE CONTEXT:
   * - "works at/in/for/by [ORG]"
   * - "[NAME] Inc/Corp/Ltd/University"
   * - Known acronyms after prepositions
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted organization names ONLY
   * @private
   */
  function extractOrganizationContexts(text) {
    const orgs = [];
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PATTERN 1: EXPLICIT ORG TYPE MARKERS ONLY
    // "[NAME] Inc|Corp|Ltd|LLC|University|College|School|Institute|etc"
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const orgTypes = 'Inc|Corp|Ltd|LLC|Company|University|College|School|Institute|Foundation|Department|Agency|Bank|Hospital|Organization|Network|Service';
    const pattern1 = new RegExp(`\\b([A-Z][A-Za-z\\s&.'-]*?)\\s+(${orgTypes})\\b`, 'gi');
    
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      const name = match[1].trim();
      const type = match[2].trim();
      
      if (name.length < 2) continue;
      if (['the', 'a', 'an', 'is', 'are'].includes(name.toLowerCase())) continue;
      
      const fullName = name + ' ' + type;
      if (!orgs.some(o => o.toLowerCase() === fullName.toLowerCase())) {
        orgs.push(fullName);
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PATTERN 2: WORKPLACE VERBS - "works/employed at/in/for [ORG]"
    // KEY: Match from "works" word, not from "is a" position
    // Extract: Everything after preposition until natural boundary
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STRICT: Start with "works/employed", then preposition, then capture
    const pattern2 = /\b(?:works?|employed?|working)\s+(?:at|in|for|by)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&.'-]*?)(?=\s+[a-z]|\s*[.,;!?\n]|$)/gi;
    
    while ((match = pattern2.exec(text)) !== null) {
      let org = match[1].trim();
      
      // Clean: Remove trailing articles/prepositions
      org = org.replace(/[\s,;.!?\)]+$/g, '')
               .replace(/\s+(?:the|a|an|and|or|is|are|at|in|for|of)\s*$/i, '')
               .trim();
      
      if (org.length < 2) continue;
      
      // Reject job titles (these belong in job extraction, not org)
      const jobTitles = ['librarian', 'manager', 'engineer', 'director', 'coordinator', 
                         'analyst', 'specialist', 'consultant', 'officer', 'employee', 
                         'head', 'chief', 'leader'];
      if (jobTitles.includes(org.toLowerCase())) continue;
      
      // CRITICAL: Reject if it contains "is" (indicates it's from a copular sentence)
      if (org.toLowerCase().includes(' is ')) continue;
      
      if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
        orgs.push(org);
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PATTERN 3: KNOWN ACRONYMS ONLY (WHITELIST)
    // After prepositions: "at OICT", "in IBM", "of UNESCO"
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const knownOrgAcronyms = new Set([
      'OICT', 'IBM', 'DOE', 'HSA', 'BIR', 'NBI', 'PNP', 'AFP', 'OFW',
      'BDO', 'BPI', 'RCBC', 'PNB', 'AXA', 'MANULIFE',
      'UNESCO', 'UNICEF', 'WHO', 'WWF', 'ASEAN', 'ADB', 'IMF', 'ILO',
      'FBI', 'CIA', 'NSA', 'NASA', 'DOJ'
    ]);
    
    const pattern3 = /\b(?:at|in|of|for|by)\s+([A-Z]{2,5})(?=[\s,;.!?]|$)/gi;
    
    while ((match = pattern3.exec(text)) !== null) {
      const acronym = match[1].trim();
      if (!knownOrgAcronyms.has(acronym)) continue;
      
      if (!orgs.some(o => o.toLowerCase() === acronym.toLowerCase())) {
        orgs.push(acronym);
      }
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
      
      // FIX #1: NEW Method 2.75 — Extract standalone person names without triggers
      // Detects 2-3 word capitalized names mentioned standalone (e.g., "Kyleen Nicdao")
      // Does NOT require honorifics, copular construction, or other context
      // Examples: "Kyleen Nicdao said...", "My colleague John Smith..."
      const standaloneNames = extractStandalonePersonNames(text);
      for (const name of standaloneNames) {
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
        /\bmy\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\.|,|;|and|but|or|$)/gi,
        /\bi['']m\s+called\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\.|,|;|and|but|or|$)/gi,
        /\bi\s+am\s+named\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\.|,|;|and|but|or|$)/gi,
        /\bcall\s+me\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\.|,|;|and|but|or|$)/gi,
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

          // Filter out: short strings, common words, medical terms, person names, verbs
          if (!rawMatch || rawMatch.length < 3 || shouldFilterCommonOrganization(rawMatch)) {
            continue;
          }

          // Filter out code patterns (e.g., variable names like "myValue")
          if (isCodePattern(text, rawMatch)) {
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
        if (org.length >= 3 && !shouldFilterCommonOrganization(org) && !isCodePattern(text, org) && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
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
        if (org.length >= 3 && !shouldFilterCommonOrganization(org) && !isCodePattern(text, org) && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
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
            if (org.length >= 3 && !shouldFilterCommonOrganization(org) && !isCodePattern(text, org) && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
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
          
          // Filter out short strings, common words, and ensure quality
          if (potentialOrg.length >= 3 && !shouldFilterCommonOrganization(potentialOrg)) {
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
      console.debug('[TrustPrompt/PATH_C] SIMPLIFIED scan() - Empty input');
      return [];
    }

    console.debug('[TrustPrompt/PATH_C] SIMPLIFIED scan() starting - using 3 core methods only');

    const findings = [];

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // SIMPLIFIED SCAN: 3 CORE DETECTION METHODS ONLY
      // ═══════════════════════════════════════════════════════════════════════
      
      let method1Count = 0;  // Honorifics
      let method2Count = 0;  // Name triggers  
      let method3Count = 0;  // Job titles
      let method4Count = 0;  // Standalone names

      // ─────────────────────────────────────────────────────────────────────
      // METHOD 1: extractNamesWithHonorific() - "Ms Padua", "Dr. Smith", etc.
      // ─────────────────────────────────────────────────────────────────────
      console.debug('[TrustPrompt/PATH_C] METHOD 1: Extracting honorific patterns...');
      const honorificNames = extractNamesWithHonorific(textNLP);
      
      for (const name of honorificNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          method1Count++;
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
      console.debug('[TrustPrompt/PATH_C] METHOD 1 found:', method1Count);

      // ─────────────────────────────────────────────────────────────────────
      // METHOD 2: Name trigger patterns - "I am John", "call me Maria", "my name is Alice"
      // ─────────────────────────────────────────────────────────────────────
      console.debug('[TrustPrompt/PATH_C] METHOD 2: Extracting name trigger patterns...');
      
      const nameTriggerPatterns = [
        /\bmy\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
        /\b(?:i\s+)?(?:am|'m)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
        /\bcall\s+me\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
        /\bi['']m\s+called\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
      ];
      
      for (const pattern of nameTriggerPatterns) {
        let match;
        while ((match = pattern.exec(textNLP)) !== null) {
          const name = match[1].trim();
          if (name.length >= 2 && !shouldFilterCommonName(name)) {
            if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
              method2Count++;
              findings.push({
                patternId: 'nlp_person_name',
                label: 'Person Name (NLP - Trigger)',
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
      console.debug('[TrustPrompt/PATH_C] METHOD 2 found:', method2Count);

      // ─────────────────────────────────────────────────────────────────────
      // METHOD 3: Job title patterns - "[Name] is a/an/the/my [job]"
      // ─────────────────────────────────────────────────────────────────────
      console.debug('[TrustPrompt/PATH_C] METHOD 3: Extracting job title patterns...');
      
      // Pattern allows: "X is a job", "X is my job", "X is the job", etc.
      // This handles: "Maria is a software engineer", "Kyleen is my engineer"
      const jobTitlePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the|my|your|his|her|its|our|their)?\s*([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|and|on|for|of|or)|\.|,|;|$)/gi;
      
      let match;
      while ((match = jobTitlePattern.exec(textNLP)) !== null) {
        const subjectName = match[1].trim();
        const jobTitle = match[2].trim();
        
        // FILTER: Reject if subject is a pronoun or common word
        const pronouns = new Set(['i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her', 'us', 'them', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose']);
        if (pronouns.has(subjectName.toLowerCase())) {
          continue;  // Skip pronouns - they're not names
        }
        
        // Clean up job title (remove trailing prepositions)
        let cleanJob = jobTitle.replace(/\s+(?:at|in|and|on|for|of|or)$/i, '').trim();
        
        // Extract the name if it passes filters
        if (subjectName.length >= 2 && !shouldFilterCommonName(subjectName)) {
          const nameLower = subjectName.toLowerCase();
          if (!findings.some(f => f.rawMatch.toLowerCase() === nameLower)) {
            // Split multi-word names into individual names
            const nameParts = subjectName.split(/\s+/);
            for (const part of nameParts) {
              if (part.length >= 2 && /^[A-Z]/.test(part) && !shouldFilterCommonName(part)) {
                if (!findings.some(f => f.rawMatch.toLowerCase() === part.toLowerCase())) {
                  method3Count++;
                  findings.push({
                    patternId: 'nlp_person_name',
                    label: 'Person Name (NLP - Subject)',
                    risk: 'low',
                    rawMatch: part,
                    safeVersion: '[NAME REDACTED]',
                    source: 'C_linguistic',
                    validated: false
                  });
                }
              }
            }
          }
        }
        
        // Extract the job title if it passes filters (NOT if it's an adjective like "beautiful" or "pronoun")
        if (cleanJob.length >= 2 && !shouldFilterCommonJobTitle(cleanJob, { isFromPredicate: true })) {
          const jobLower = cleanJob.toLowerCase();
          if (!findings.some(f => f.rawMatch.toLowerCase() === jobLower)) {
            // Additional filters: reject adjectives, linguistic terms, and common non-job words
            const adjectives = new Set(['beautiful', 'happy', 'sad', 'good', 'bad', 'nice', 'ugly', 'smart', 'dumb', 'fast', 'slow', 'rich', 'poor', 'tall', 'short', 'fat', 'thin', 'strong', 'weak', 'old', 'young', 'new', 'big', 'small', 'red', 'blue', 'green', 'yellow', 'hot', 'cold', 'wet', 'dry', 'clean', 'dirty']);
            const linguisticTerms = new Set(['pronoun', 'noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'article', 'determiner', 'interjection', 'word', 'phrase', 'sentence', 'clause', 'subject', 'predicate', 'object', 'tense', 'mood', 'voice']);
            const nonJobWords = new Set(['number', 'letter', 'character', 'string', 'text', 'code', 'data', 'file', 'format', 'type', 'value', 'variable', 'function', 'method', 'class', 'property']);
            
            if (!adjectives.has(jobLower) && !linguisticTerms.has(jobLower) && !nonJobWords.has(jobLower)) {
              method3Count++;
              findings.push({
                patternId: 'nlp_job_title',
                label: 'Job Title (NLP - Predicate)',
                risk: 'low',
                rawMatch: cleanJob,
                safeVersion: '[JOB TITLE REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      console.debug('[TrustPrompt/PATH_C] METHOD 3 found:', method3Count);

      // ─────────────────────────────────────────────────────────────────────
      // METHOD 4: Standalone person names - Single capitalized words like "Kyleen"
      // ─────────────────────────────────────────────────────────────────────
      console.debug('[TrustPrompt/PATH_C] METHOD 4: Extracting standalone names...');
      
      // Simple pattern: Any capitalized word
      const standaloneNamePattern = /\b([A-Z][a-z]+)\b/g;
      let standaloneName;
      
      while ((standaloneName = standaloneNamePattern.exec(textNLP)) !== null) {
        const name = standaloneName[1].trim();
        
        // Filter out measurement words, verbs, and skip very common words
        const measurementWords = new Set(['number', 'phone', 'digit', 'code', 'value', 'amount', 'count', 'total', 'sum', 'average', 'result']);
        
        // Technical/credential context keywords - often capitalized but not person names
        const technicalContextWords = new Set([
          // Payment/service providers
          'stripe', 'twilio', 'sendgrid', 'mailgun', 'braintree', 'paypal', 'square', 'adyen',
          // Authentication/security terms
          'bearer', 'authorization', 'authentication', 'private', 'public', 'secret', 'token', 'key',
          // Connection/configuration terms
          'connection', 'endpoint', 'hostname', 'database', 'server', 'client', 'request', 'response',
          // Data/format terms
          'json', 'xml', 'protocol', 'scheme', 'format', 'content', 'header', 'body', 'query',
          // Common credential field names
          'default', 'account', 'user', 'admin', 'master', 'default', 'test', 'live',
          // URL/domain related
          'http', 'https', 'ftp', 'ssh', 'port', 'host', 'domain', 'url', 'path',
          // Generic assignment context
          'generic', 'example', 'sample', 'test', 'fake', 'mock', 'dummy',
          // Encryption/encoding
          'base64', 'encode', 'decode', 'encrypt', 'decrypt', 'hash', 'signature',
        ]);
        const commonVerbs = new Set(['give', 'get', 'make', 'take', 'go', 'see', 'know', 'think', 'come', 'say', 'find', 'tell', 'ask', 'work', 'call', 'try', 'let', 'put', 'mean', 'keep', 'seem', 'help', 'talk', 'turn', 'start', 'show', 'hear', 'play', 'run', 'move', 'like', 'live', 'believe', 'hold', 'bring', 'begin', 'read', 'write', 'spend', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak', 'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill', 'cover', 'catch', 'draw', 'break', 'grow', 'lift', 'raise', 'search', 'sell', 'seek', 'settle', 'generate', 'provide', 'produce', 'display', 'render', 'compose', 'extract', 'parse', 'analyze', 'review', 'translate', 'compile', 'deploy', 'fetch', 'query', 'upload', 'download', 'install', 'uninstall', 'configure', 'validate', 'optimize', 'format', 'convert', 'import', 'export', 'transfer', 'sync', 'backup', 'restore', 'delete', 'remove', 'copy', 'paste', 'merge', 'split', 'append', 'prepend', 'replace', 'update', 'modify', 'process', 'execute', 'run', 'compile', 'link', 'debug', 'test', 'trace', 'profile', 'monitor', 'measure', 'verify', 'validate', 'confirm', 'check', 'scan', 'detect', 'identify', 'recognize', 'classify', 'categorize', 'sort', 'filter', 'map', 'reduce', 'aggregate', 'calculate', 'compute', 'evaluate', 'assess', 'analyze', 'examine', 'inspect', 'explore', 'investigate', 'research', 'document', 'comment', 'annotate', 'label', 'tag', 'mark', 'highlight', 'emphasize', 'focus', 'concentrate', 'prioritize', 'order', 'arrange', 'organize', 'structure', 'format', 'serialize', 'deserialize', 'use']);
        const pronouns = new Set(['i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her', 'us', 'them', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'my', 'your', 'his', 'its', 'our', 'their']);
        const commonWords = new Set(['i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'of', 'to', 'in', 'at', 'by', 'for', 'on', 'with', 'from', 'up', 'about', 'into', 'through', 'during', 'and', 'or', 'but', 'not', 'please', 'thanks', 'thank', 'sorry', 'excuse', 'hi', 'hello', 'hey', 'ok', 'okay', 'yes', 'no', 'maybe', 'sure', 'right', 'wrong', 'true', 'false', 'good', 'bad', 'well', 'just', 'only', 'even', 'such', 'back', 'also', 'too', 'more', 'most', 'very', 'so', 'as', 'if', 'then', 'else', 'because', 'since', 'after', 'before', 'while', 'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose']);
        
        const lowerName = name.toLowerCase();
        
        // Skip if it's a known organization or AI model name - don't detect as person name
        const knownOrganizations = new Set([
          // Major cloud & tech companies
          'azure', 'google', 'anthropic', 'amazon', 'microsoft', 'apple', 'facebook', 'twitter', 'meta', 'netflix', 'spotify', 'uber', 'airbnb', 'slack', 'zoom', 'dropbox', 'github', 'gitlab', 'docker', 'kubernetes', 'tensorflow', 'pytorch', 'openai', 'deepmind', 'ibm', 'oracle', 'salesforce', 'adobe', 'intel', 'nvidia', 'qualcomm', 'cisco', 'juniper', 'vmware', 'redhat', 'canonical', 'mozilla', 'apache', 'linux', 'unix', 'windows', 'macos', 'ios', 'android', 'chromeos', 'firefox', 'chrome', 'safari', 'edge', 
          // Databases & data platforms
          'postgresql', 'mongodb', 'mysql', 'redis', 'elasticsearch', 'kafka', 'spark', 'hadoop', 'hive', 'pig', 'impala', 'cassandra', 'dynamodb', 'firestore', 'pinecone', 'weaviate', 'milvus', 'qdrant', 'chroma',
          // AWS services
          'cognito', 'lambda', 'ec2', 's3', 'rds', 'ecs', 'eks', 'sns', 'sqs', 'cloudformation',
          // DevOps & infrastructure
          'terraform', 'ansible', 'puppet', 'chef', 'jenkins', 'bitbucket', 'jira', 'confluence', 'trello', 'asana', 'notion',
          // Communication platforms
          'teams', 'discord', 'telegram', 'whatsapp', 'signal',
          // AI/ML platforms & APIs
          'hugging', 'face', 'replicate', 'stability', 'together', 'modal', 'baseten', 'cohere', 'huggingface', 'labs', 'inference',
          // Additional ML platforms
          'gradient', 'paperspace', 'runwayml', 'levity', 'flyte', 'polyaxon', 'weights', 'biases',
          // Other platforms
          'heroku', 'vercel', 'netlify', 'railway', 'render'
        ]);
        
        // AI model names - these are products, not person names
        const aiModelNames = new Set(['claude', 'gpt', 'gemini', 'bard', 'llama', 'mistral', 'vicuna', 'falcon', 'alpaca', 'bert', 'roberta', 'distilbert', 'xlnet', 't5', 'bart', 'pegasus', 'marian', 'mgeneration', 'gpt2', 'gpt3', 'gpt4', 'davinci', 'curie', 'babbage', 'ada']);
        
        if (knownOrganizations.has(lowerName) || aiModelNames.has(lowerName)) {
          continue;  // Skip known organizations and AI models
        }
        
        if (measurementWords.has(lowerName) || commonWords.has(lowerName) || commonVerbs.has(lowerName) || pronouns.has(lowerName) || technicalContextWords.has(lowerName)) {
          continue;  // Skip measurement/common words/verbs/pronouns/technical context
        }
        
        if (name.length >= 2 && !shouldFilterCommonName(name)) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
            method4Count++;
            findings.push({
              patternId: 'nlp_person_name',
              label: 'Person Name (Standalone)',
              risk: 'low',
              rawMatch: name,
              safeVersion: '[NAME REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      console.debug('[TrustPrompt/PATH_C] METHOD 4 found:', method4Count);
      
      // ─────────────────────────────────────────────────────────────────────
      // METHOD 5: Organization extraction (CRITICAL - was missing!)
      // ─────────────────────────────────────────────────────────────────────
      console.debug('[TrustPrompt/PATH_C] METHOD 5: Extracting organizations...');
      let method5Count = 0;
      
      // Extract organizations from contextual patterns
      const contextOrgs = extractOrganizationContexts(textNLP);
      for (const org of contextOrgs) {
        if (org.length >= 2 && !shouldFilterCommonOrganization(org) && !isCodePattern(textNLP, org)) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
            method5Count++;
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
      console.debug('[TrustPrompt/PATH_C] METHOD 5 found:', method5Count);
      
      console.debug('[TrustPrompt/PATH_C] SIMPLIFIED scan complete - found', 
        `honorifics:${method1Count}`, 
        `triggers:${method2Count}`, 
        `jobs:${method3Count}`,
        `standalone:${method4Count}`,
        `orgs:${method5Count}`,
        `total:${findings.length}`
      );
      
      // Deduplicate within PATH C
      const deduplicated = deduplicateWithinPath(findings);
      
      console.debug('[TrustPrompt/PATH_C] After dedup:', deduplicated.length, 'findings');
      return deduplicated;
      
    } catch (error) {
      console.error('[TrustPrompt/PATH_C] SIMPLIFIED scan error:', error.message);
      console.error(error.stack);
      return [];  // Fail gracefully
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { scan };

})();

// ── QUICK TEST (for browser console) ──────────────────────────────────────────
// Silent initialization - test function available but not auto-invoked
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
  
  // Silent debug logging - only visible if DevTools shows debug level
  console.debug('[STARTUP] TrustLinguisticDetector initialized (test available as testLinguisticDetector())');
}



// Also export to globalThis for scanner.js compatibility
if (typeof globalThis !== 'undefined') {
  globalThis.TrustLinguisticDetector = TrustLinguisticDetector;
}
