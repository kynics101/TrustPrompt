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

/* global window, OCCUPATIONS_DATA, ORGANIZATIONS_DATA */

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

  // Non-name words that get capitalized but are not names
  // These are typically adjectives, nouns, or descriptors that should not be treated as person names
  const NON_NAME_WORDS = new Set([
    // ★ CRITICAL: Possessive pronouns and determiners — MUST NEVER be treated as first name
    // These always precede nouns/descriptors, never person names
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'mine', 'yours', 'theirs',
    'a', 'an', 'the', 'this', 'that', 'these', 'those',

    // ★ Prepositions / conjunctions that get capitalized at sentence start
    // (e.g. "In Davao, we...", "On Monday", "At the office") — never names.
    'in', 'on', 'at', 'of', 'to', 'for', 'with', 'from', 'by', 'as',
    'and', 'or', 'but', 'nor', 'so', 'if', 'is', 'are', 'was', 'were',
    
    // ★ EXPANDED: Added common verbs, participles, and discourse markers causing false positives
    
    // Adjectives (descriptive) — ★ CRITICAL: Includes adjectives that commonly appear before nouns
    'heavy', 'light', 'small', 'large', 'big', 'little', 'new', 'old', 'young', 'ancient',
    'fast', 'slow', 'quick', 'rapid', 'bright', 'dark', 'long', 'short', 'tall', 'wide',
    'hot', 'cold', 'warm', 'cool', 'thick', 'thin', 'strong', 'weak', 'tight', 'loose',
    'good', 'bad', 'better', 'worse', 'best', 'worst', 'nice', 'ugly', 'pretty', 'beautiful',
    'smart', 'dumb', 'clever', 'silly', 'funny', 'serious', 'happy', 'sad', 'angry', 'calm',
    'famous', 'unknown', 'unique', 'common', 'special', 'normal', 'rare', 'modern', 'current',
    'genuine', 'optimal', 'sufficient', 'adequate', 'true', 'false', 'real', 'virtual', 'late',
    'early', 'late', 'initial', 'final', 'social', 'economic', 'political', 'cultural',
    
    // ★ NEW: Discourse markers & connectors (prevent "According to X" → X being flagged as name)
    'according', 'regarding', 'concerning', 'considering', 'given', 'speaking', 'talking',
    'based', 'depending', 'following', 'contrary', 'unlike', 'similar', 'compared',
    'relative', 'relevant', 'adjacent', 'opposite', 'however', 'therefore',
    'moreover', 'furthermore', 'nevertheless', 'meanwhile', 'likewise', 'hence', 'thus',
    
    // ★ CRITICAL FIX: Present participles/gerunds (avoid "Experiencing X" → X being flagged as name)
    // These are verb-participles ending in -ing that commonly appear before nouns
    'experiencing', 'reporting', 'stating', 'saying', 'telling', 'asking', 'calling',
    'including', 'excluding', 'considering', 'regarding', 'concerning', 'involving',
    'creating', 'making', 'taking', 'giving', 'getting', 'showing', 'finding', 'leaving',
    'using', 'providing', 'containing', 'requiring', 'adding', 'offering', 'having',
    'going', 'running', 'walking', 'talking', 'working', 'helping', 'doing', 'being',
    'understanding', 'managing', 'handling', 'processing', 'recognizing', 'bringing',
    'developing', 'improving', 'establishing', 'changing', 'building', 'planning',
    
    // ★ CRITICAL: Additional -ing forms for better coverage
    'existing', 'existing', 'pending', 'rising', 'falling', 'growing', 'declining',
    'increasing', 'decreasing', 'maintaining', 'controlling', 'monitoring', 'tracking',
    'measuring', 'assessing', 'evaluating', 'analyzing', 'designing', 'engineering',
    
    // ★ NEW: Common verbs in past tense (avoid "Worked X", "Lived Y" → X, Y as names)
    'worked', 'lived', 'played', 'called', 'named', 'heard', 'seen', 'found', 'left',
    'made', 'went', 'came', 'said', 'gave', 'got', 'took', 'put', 'sent', 'showed',
    'reported', 'stated', 'told', 'asked', 'gave', 'helped', 'helped', 'offered',
    
    // Temporal/Spatial
    'future', 'past', 'present', 'today', 'tomorrow', 'yesterday', 'now', 'then', 'here', 'there',
    'above', 'below', 'inside', 'outside', 'before', 'after', 'during', 'between', 'through',
    'morning', 'afternoon', 'evening', 'night', 'day', 'week', 'month', 'year', 'time', 'hour',
    
    // Abstract nouns & common concepts
    'number', 'thing', 'stuff', 'world', 'place', 'way', 'reason', 'cause', 'result', 'effect',
    'start', 'end', 'beginning', 'middle', 'center', 'point', 'line', 'space', 'system', 'process',
    'issue', 'problem', 'challenge', 'situation', 'context', 'scenario', 'topic', 'subject',
    'information', 'knowledge', 'data', 'content', 'document', 'file', 'record',
    
    // ★ CRITICAL: Personal attribute words - NOT person names (e.g., "My birthday", "Your address", "His email")
    // These should be filtered when paired with possessive pronouns
    'birthday', 'age', 'email', 'phone', 'address', 'job', 'title', 'company', 'department', 
    'ssn', 'password', 'pin', 'account', 'license', 'gender', 'sex', 'height', 'weight', 
    'color', 'eyes', 'hair', 'health', 'condition', 'salary', 'income', 'location', 'country', 
    'city', 'state', 'zip', 'religion', 'belief', 'nationality', 'status', 'relationship', 
    'spouse', 'parent', 'child', 'sibling', 'emergency', 'contact', 'reference', 'description', 
    'notes', 'comments', 'details', 'preference', 'hobby', 'interest', 'experience', 'qualification'
  ]);

  // ★ Place / country names that compromise.js and the capitalized-word
  // heuristics sometimes mis-tag as person names (e.g. "Saudi Arabia", "Japan").
  // A location is not a person name — reject these candidates. Stored lowercase;
  // multi-word entries are matched against the full candidate, single words
  // against each token. (PH places are handled separately as location data.)
  const PLACE_NAME_WORDS = new Set([
    'saudi', 'arabia', 'saudi arabia', 'qatar', 'kuwait', 'bahrain', 'oman',
    'dubai', 'abu dhabi', 'emirates', 'uae', 'japan', 'korea', 'china', 'taiwan',
    'hong kong', 'singapore', 'malaysia', 'indonesia', 'thailand', 'vietnam',
    'india', 'pakistan', 'canada', 'america', 'australia', 'england', 'britain',
    'germany', 'france', 'spain', 'italy', 'russia', 'brazil', 'mexico',
    'manila', 'cebu', 'davao', 'luzon', 'visayas', 'mindanao'
  ]);

  function looksLikePlaceName(candidate) {
    if (!candidate) return false;
    const lower = candidate.toLowerCase().trim();
    if (PLACE_NAME_WORDS.has(lower)) return true;
    return lower.split(/\s+/).some(w => PLACE_NAME_WORDS.has(w));
  }

  // Common job titles used for optional filtering
  const COMMON_JOB_TITLES = new Set([
    'manager', 'engineer', 'developer', 'analyst', 'designer', 'director',
    'coordinator', 'specialist', 'consultant', 'assistant', 'associate',
    'person', 'people', 'employee', 'staff', 'worker'
  ]);

  // ★ JAVASCRIPT-FIRST APPROACH: Terms loaded directly from JS modules
  // No async loading needed — data is available synchronously from OCCUPATIONS_DATA and ORGANIZATIONS_DATA
  let EXTENSIVE_JOB_TITLES = new Set();
  let EXTENSIVE_JOB_TITLES_ARRAY = [];  // For length-sorted matching
  let EXTENSIVE_ORGANIZATIONS = new Set();
  let EXTENSIVE_ORGANIZATIONS_ARRAY = [];  // For length-sorted matching
  let ORG_KEYWORDS_INDEX = new Map();  // Keyword → org names mapping

  /**
   * Initialize EXTENSIVE_JOB_TITLES from OCCUPATIONS_DATA JavaScript array
   * Called on module load to populate the complete job titles set
   * Sorts by length (longest first) for optimal matching
   * @private
   */
  function initializeExtensiveJobTitles() {
    try {
      console.log('[TrustLinguisticDetector] Initializing job titles from OCCUPATIONS_DATA...');
      
      // Check if OCCUPATIONS_DATA is available from terms-occupations.js
      if (typeof OCCUPATIONS_DATA === 'undefined' || !Array.isArray(OCCUPATIONS_DATA)) {
        throw new Error('OCCUPATIONS_DATA not available - ensure terms-occupations.js is loaded first');
      }
      
      // Convert to lowercase and create set
      const titles = OCCUPATIONS_DATA
        .map(title => title.toLowerCase())
        .filter(title => title && title.length > 0);
      
      console.log(`[TrustLinguisticDetector] Loaded ${titles.length} job titles from OCCUPATIONS_DATA`);
      
      // Populate the Set with unique titles
      EXTENSIVE_JOB_TITLES = new Set(titles);
      
      // Sort by length (longest first) for fuzzy matching and multi-word matching
      EXTENSIVE_JOB_TITLES_ARRAY = Array.from(titles).sort((a, b) => b.length - a.length);
      
      console.log(`[TrustLinguisticDetector] ✅ Successfully loaded ${EXTENSIVE_JOB_TITLES.size} job titles`);
      console.log(`[TrustLinguisticDetector] First 5 titles: ${EXTENSIVE_JOB_TITLES_ARRAY.slice(0, 5).join(', ')}`);
      console.log(`[TrustLinguisticDetector] Contains 'gynecologist': ${EXTENSIVE_JOB_TITLES.has('gynecologist')}`);
      return true;
    } catch (error) {
      console.error('[TrustLinguisticDetector] ❌ Failed to load job titles:', error);
      console.error('[TrustLinguisticDetector] Error message:', error.message);
      console.warn('[TrustLinguisticDetector] Falling back to basic COMMON_JOB_TITLES only');
      // Graceful degradation: fall back to common titles if JS data unavailable
      EXTENSIVE_JOB_TITLES = new Set(COMMON_JOB_TITLES);
      EXTENSIVE_JOB_TITLES_ARRAY = Array.from(COMMON_JOB_TITLES);
      return false;
    }
  }

  /**
   * Initialize EXTENSIVE_ORGANIZATIONS from ORGANIZATIONS_DATA JavaScript array
   * Builds indexes for efficient multi-pass matching
   * @private
   */
  function initializeExtensiveOrganizations() {
    try {
      console.log('[TrustLinguisticDetector] Initializing organizations from ORGANIZATIONS_DATA...');
      
      // Check if ORGANIZATIONS_DATA is available from terms-organizations.js
      if (typeof ORGANIZATIONS_DATA === 'undefined' || !Array.isArray(ORGANIZATIONS_DATA)) {
        throw new Error('ORGANIZATIONS_DATA not available - ensure terms-organizations.js is loaded first');
      }
      
      // Convert to lowercase, handle quoted values, and filter
      const orgs = ORGANIZATIONS_DATA
        .map(org => {
          const trimmed = org.trim();
          // Handle quoted values (e.g., "Abad Outsourcing Co., Ltd.")
          if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return trimmed.slice(1, -1).trim();
          }
          return trimmed;
        })
        .filter(org => org && org.length > 2);
      
      console.log(`[TrustLinguisticDetector] Loaded ${orgs.length} organizations from ORGANIZATIONS_DATA`);
      
      // Populate Sets and arrays
      EXTENSIVE_ORGANIZATIONS = new Set(orgs.map(o => o.toLowerCase()));
      EXTENSIVE_ORGANIZATIONS_ARRAY = Array.from(orgs).sort((a, b) => b.length - a.length);
      
      // Build keyword index for component matching
      for (const org of EXTENSIVE_ORGANIZATIONS_ARRAY) {
        const keywords = org.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        for (const keyword of keywords) {
          if (!ORG_KEYWORDS_INDEX.has(keyword)) {
            ORG_KEYWORDS_INDEX.set(keyword, []);
          }
          ORG_KEYWORDS_INDEX.get(keyword).push(org);
        }
      }
      
      console.log(`[TrustLinguisticDetector] ✅ Successfully loaded ${EXTENSIVE_ORGANIZATIONS.size} organizations`);
      console.log(`[TrustLinguisticDetector] First 5 organizations: ${EXTENSIVE_ORGANIZATIONS_ARRAY.slice(0, 5).join(', ')}`);
      console.log(`[TrustLinguisticDetector] Contains 'accenture': ${EXTENSIVE_ORGANIZATIONS.has('accenture')}`);
      return true;
    } catch (error) {
      console.error('[TrustLinguisticDetector] ❌ Failed to load organizations:', error);
      console.error('[TrustLinguisticDetector] Error message:', error.message);
      EXTENSIVE_ORGANIZATIONS = new Set();
      EXTENSIVE_ORGANIZATIONS_ARRAY = [];
      ORG_KEYWORDS_INDEX = new Map();
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // CSV-FIRST UTILITY FUNCTIONS
  // ──────────────────────────────────────────────────────────────────────────────

  /**
   * Levenshtein distance between two strings
   * Measures edit distance (insertions, deletions, substitutions)
   * Used for fuzzy matching with typo tolerance
   * @private
   */
  function levenshteinDistance(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));
    
    for (let i = 0; i <= str1.length; i += 1) {
      track[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j += 1) {
      track[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }
    
    return track[str2.length][str1.length];
  }

  /**
   * ★ NEW: Detect and reject prefix/suffix variations
   * Examples:
   *   tuberculosis → epituberculosis (prefix "epi")
   *   tuberculosis → tuberculosisss (suffix repeated)
   * 
   * Heuristic: If one string contains the other as a substring,
   * and the difference is > 20% length growth, it's likely a different term.
   * 
   * @param {string} text - First string to compare
   * @param {string} term - Second string to compare
   * @param {number} threshold - Growth percentage to reject (default: 20%)
   * @returns {boolean} true if this is a prefix/suffix variation to reject
   * @private
   */
  function isPrefixSuffixVariation(text, term, threshold = 20) {
    // If one is a substring of the other
    if (text.includes(term) || term.includes(text)) {
      const shorter = Math.min(text.length, term.length);
      const longer = Math.max(text.length, term.length);
      
      // Calculate growth percentage
      const growthPercent = ((longer - shorter) / shorter) * 100;
      
      // If growth > threshold, it's likely a different term (prefix/suffix variant)
      // Examples:
      //   tuberculosis (12) → epituberculosis (15): 25% growth → REJECT
      //   mestration (10) → menstruation (12): 20% growth → BORDERLINE (allow)
      if (growthPercent > threshold) {
        return true;  // Reject as prefix/suffix variation
      }
    }
    
    return false;  // Not a prefix/suffix variation
  }

  /**
   * Fuzzy find matches in text with Levenshtein distance tolerance
   * Handles typos, missing words, word order changes
   * 
   * ★ ENHANCED: Now rejects prefix/suffix variations before applying Levenshtein
   * This prevents "tuberculosis" from matching "epituberculosis"
   * 
   * @param {string} text - Text to search in
   * @param {string} pattern - Pattern to find
   * @param {number} maxDistance - Max edit distance to tolerate (default: 2)
   * @returns {Array} array of matched strings
   * @private
   */
  function fuzzyFind(text, pattern, maxDistance = 2) {
    const textWords = text.toLowerCase().split(/[\s,;.!?'"\-()]+/).filter(w => w.length > 0);
    const patternWords = pattern.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    
    if (patternWords.length === 0) return [];
    
    const matches = [];
    const patternLength = patternWords.length;
    
    // Slide window over text words and compute distance
    for (let i = 0; i <= textWords.length - patternLength; i++) {
      const textPhrase = textWords.slice(i, i + patternLength).join(' ');
      
      // ★ NEW: Reject prefix/suffix variations before calculating distance
      if (isPrefixSuffixVariation(textPhrase, pattern.toLowerCase(), 20)) {
        continue;  // Skip this potential match
      }
      
      const distance = levenshteinDistance(textPhrase, pattern.toLowerCase());
      
      if (distance <= maxDistance) {
        matches.push(textPhrase);
      }
    }
    
    return matches;
  }

  /**
   * Escape special regex characters
   * @private
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Find actual text span in original text (for POS tagging)
   * Returns the matched substring with original casing preserved
   * @private
   */
  function findActualSpan(text, pattern) {
    const lowerText = text.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    const index = lowerText.indexOf(lowerPattern);
    
    if (index === -1) return pattern;
    return text.slice(index, index + pattern.length);
  }

  /**
   * Check if span appears in job context
   * Looks for job trigger phrases before the span
   * @private
   */
  function checkJobContext(text, actualSpan) {
    const index = text.toLowerCase().indexOf(actualSpan.toLowerCase());
    if (index === -1) return false;
    
    // Look back up to 50 characters for job indicators
    const before = text.slice(Math.max(0, index - 50), index).toLowerCase();
    
    const jobTriggers = [
      'is a ', 'is an ', 'is the ',
      'am a ', 'am an ', 'am the ',           // ★ FIX: Added "am" for "I am a" constructions
      'are a ', 'are an ', 'are the ',       // ★ FIX: Added "are" for plural/formal
      'was a ', 'was an ', 'was the ',       // ★ FIX: Added "was" for past tense
      'were a ', 'were an ', 'were the ',    // ★ FIX: Added "were" for past plural
      'works as ', 'employed as ', 'works for ',
      'worked as ', 'work as ',              // ★ FIX: Added past and base forms
      'my ', 'your ', 'their ', 'her ', 'his ',
      'be a ', 'become a ', 'hired as ',
      "i'm a ", "i'm an ",                   // ★ FIX: Added "i'm an" variant
      "you're a ", "you're an ",             // ★ FIX: Added "you're an" variant
      "they're a ", "they're an ",           // ★ FIX: Added "they're an" variant
      "he's a ", "she's a ", "she's an "     // ★ FIX: Added he/she contractions
    ];
    
    return jobTriggers.some(trigger => before.includes(trigger));
  }

  /**
   * Check if span appears in organization context
   * Looks for org trigger phrases before/after the span
   * @private
   */
  function checkOrgContext(text, actualSpan) {
    const index = text.toLowerCase().indexOf(actualSpan.toLowerCase());
    if (index === -1) return false;
    
    // Extended context windows: look further back to cross sentence boundaries
    const before = text.slice(Math.max(0, index - 100), index).toLowerCase();
    const after = text.slice(index + actualSpan.length, Math.min(text.length, index + actualSpan.length + 50)).toLowerCase();
    
    const orgTriggers = [
      'at ', 'in ', 'works at ', 'works in ',
      'employed at ', 'hired by ', 'from ', 'department of ',
      'head of ', 'director of ', 'working at ', 'company ', 'organization ',
      'firm ', 'business ', 'corporation ', 'enterprise '
    ];
    
    const orgMarkers = [
      ' inc', ' inc.', ' corp', ' corp.', ' ltd', ' ltd.', ' co,', ' co.', ' co', 
      ' university', ' college', ' department', ' dept',
      ' ministry', ' ministry.', ' agency', ' agency.', ' bank', ' bank.', ' hospital',
      ' hospital.', ' school', ' school.', ' institute', ' institute.',
      ' company', ' company.', ' business', ' business.', ' firm', ' firm.'
    ];
    
    const hasOrgTrigger = orgTriggers.some(trigger => before.includes(trigger));
    const hasOrgMarker = orgMarkers.some(marker => 
      after.includes(marker) || actualSpan.toLowerCase().includes(marker)
    );
    
    // If it's a known high-profile company, be more lenient
    const knownCompanies = new Set([
      'accenture', 'google', 'microsoft', 'amazon', 'apple', 'facebook', 'meta',
      'netflix', 'uber', 'airbnb', 'slack', 'zoom', 'adobe', 'intel', 'nvidia',
      'salesforce', 'oracle', 'ibm', 'cisco', 'vmware', 'dell', 'hp', 'lenovo'
    ]);
    
    if (knownCompanies.has(actualSpan.toLowerCase())) {
      // For known companies, just check it appears in text (lower validation bar)
      console.debug(`[PATH_C/VAL_ORG] Known company "${actualSpan}" - accepting with lenient validation`);
      return true;
    }
    
    console.debug(`[PATH_C/VAL_ORG] Context check for "${actualSpan}": trigger=${hasOrgTrigger}, marker=${hasOrgMarker}`);
    return hasOrgTrigger || hasOrgMarker || before.includes('at the ');
  }

  /**
   * Check for bad POS patterns that indicate false positives
   * Rejects if: mostly verbs/adjectives, single letters, etc.
   * @private
   */
  function checkBadPOS(doc) {
    if (!doc || !doc.sentences || doc.sentences().length === 0) {
      return false;  // Can't validate, assume OK
    }
    
    try {
      const tokens = doc.sentences().first().tokens();
      
      if (!tokens || tokens.length === 0) return false;
      
      let nounCount = 0;
      let verbCount = 0;
      let adjCount = 0;
      
      for (const token of tokens) {
        const tag = token.tag ? token.tag() : '';
        if (tag && tag.startsWith('NN')) nounCount++;
        if (tag && tag.startsWith('VB')) verbCount++;
        if (tag && tag.startsWith('JJ')) adjCount++;
      }
      
      // If mostly verbs or adjectives, reject
      const totalNonNoun = verbCount + adjCount;
      if (nounCount > 0 && totalNonNoun > nounCount) {
        return true;  // BAD pattern
      }
      
      // Check for single letter tokens (filtering artifacts)
      if (tokens.some(t => t.text && t.text().length === 1 && /^[a-z]$/i.test(t.text()))) {
        return true;  // BAD pattern
      }
    } catch (error) {
      console.debug('[TrustLinguisticDetector] POS check failed:', error.message);
    }
    
    return false;  // No bad patterns detected
  }

  /**
   * Check if organization is in governance database
   * Performs exact and case-insensitive matching
   * @param {string} orgName - Organization name to validate
   * @returns {boolean} true if organization is known/governed
   * @private
   */
  function isGovernedOrganization(orgName) {
    if (!orgName || orgName.length < 2) return false;
    
    // Exact match first (case-sensitive)
    if (GOVERNANCE_ORGANIZATIONS.has(orgName)) return true;
    
    // Case-insensitive match via lowercase index
    const lower = orgName.toLowerCase();
    return GOVERNANCE_ORGANIZATIONS_LOWER.has(lower);
  }

  /**
   * Get canonical organization name from governance database
   * Useful for normalizing org names detected by NLP
   * @param {string} orgName - Organization name to look up
   * @returns {string|null} canonical name from DB or null if not found
   * @private
   */
  function getCanonicalOrganizationName(orgName) {
    if (!orgName) return null;
    
    // Try exact match
    if (GOVERNANCE_ORGANIZATIONS.has(orgName)) return orgName;
    
    // Try case-insensitive lookup
    const lower = orgName.toLowerCase();
    return GOVERNANCE_ORGANIZATIONS_LOWER.get(lower) || null;
  }

  // Honorifics: Mr, Ms, Mrs, Sir, Dr, Prof, Professor, etc.
  // These indicate that a proper noun following them is likely a person name.
  //
  // ★ CRITICAL FIX (DEF-003): This pattern is CASE-SENSITIVE (no /i flag) and the
  // honorific itself must be Capitalized. Previously the /gi flag meant:
  //   (a) the lowercase common noun "professor" matched the "Professor" honorific
  //       alternative, and
  //   (b) the trailing name group [A-Z][a-z]+ matched lowercase words,
  // so "...to my professor for missing the lab exam" produced a bogus person-name
  // finding of "for missing the lab exam". A genuine honorific+name is written in
  // Title Case (e.g. "Prof. Reyes", "Dr. Smith"); a lowercase "professor" is just a
  // common noun and must NOT trigger name extraction.
  const HONORIFICS = /\b(Mr|Ms|Mrs|Miss|Mx|Sir|Madam|Dr|Prof|Professor|Rev|Reverend|Fr|Father|Sr|Esq|Eng|Engr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;

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
    //
    // ★ CRITICAL FIX (DEF-002/DEF-003): This pattern is CASE-SENSITIVE (no /i flag).
    // The previous /gi flag neutralised the [A-Z][a-z]+ capitalization requirement
    // because, under case-insensitivity, [A-Z] and [a-z] both match ANY letter.
    // That caused ordinary lowercase word sequences such as "for missing the",
    // "in davao" and "change" to be captured and reported as person names.
    // Real person names are capitalized, so we require genuine Title-Case tokens.
    const standaloneNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
    
    // ★ FIX: Possessive pronouns that should NEVER start a person name
    // These are always descriptors, not names (e.g., "My Birthday", "Your Address")
    const possessivePronouns = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
    
    let match;
    while ((match = standaloneNamePattern.exec(text)) !== null) {
      const potentialName = match[1].trim();
      const words = potentialName.split(/\s+/);
      
      // ★ FIX: CRITICAL — Reject if first word is a possessive pronoun
      // This filters "My Birthday", "Your Address", "His Workplace", etc.
      if (possessivePronouns.has(words[0].toLowerCase())) {
        continue;
      }
      
      // Heuristic 0: Filter non-name words (adjectives, descriptors, etc.)
      // Check if ANY word in the phrase is a known non-name word
      const hasNonNameWord = words.some(word => NON_NAME_WORDS.has(word.toLowerCase()));
      if (hasNonNameWord) {
        continue;  // Skip any phrase containing non-name words like "Heavy"
      }

      // Heuristic 0b: Reject place/country names (e.g. "Saudi Arabia", "Japan").
      if (looksLikePlaceName(potentialName)) {
        continue;
      }
      
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
   * ★ FIX: Now checks EXTENSIVE_JOB_TITLES from occupations.csv for positive validation
   * If a title is in the CSV database, it's ALWAYS kept (never filtered).
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
    
    // ★ FIX #1: POSITIVE VALIDATION AGAINST CSV DATABASE
    // If the title is in EXTENSIVE_JOB_TITLES (loaded from occupations.csv), KEEP IT
    if (EXTENSIVE_JOB_TITLES.size > 0) {
      if (EXTENSIVE_JOB_TITLES.has(lower)) {
        console.debug(`[TrustPrompt/linguistic-detector] Job title "${title}" validated against CSV database`);
        return false;  // Don't filter - it's a valid job title from CSV
      }
    }
    
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
      'name', 'file', 'type', 'text', 'content', 'message', 'email', 'phone',
      // ★ FIX (DEF-002): common nouns/verbs fuzzy-matched to org names
      'change', 'changes', 'provider', 'providers', 'company', 'office', 'email',
      'letter', 'speech', 'notice', 'update', 'account', 'payroll', 'income',
      'salary', 'tax', 'fiesta', 'exam', 'class', 'section', 'load', 'rules',
      // ★ FIX (DEF-005): country/place fragments mis-tagged as orgs
      'arabia', 'saudi', 'america', 'africa', 'asia', 'europe', 'manila',
      'luzon', 'visayas', 'mindanao'
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

  // ── Helper: Find organization in CSV database (reverse lookup) ──────────────

  /**
   * ★ FIX #2: Reverse lookup for organizations in GOVERNANCE_ORGANIZATIONS CSV database.
   * 
   * Search for mentions of known organizations within the text.
   * This catches organizations like "University of Santo Tomas" that might be missed
   * by regex extraction patterns.
   * 
   * Strategy:
   * 1. Exact substring match (case-insensitive) — ONLY method used to prevent false positives
   * 2. Return canonical organization name if found
   * 
   * NOTE: Fuzzy matching removed due to false positives (e.g., "university of santo" matching "University of Santo Tomas")
   * Fuzzy matching is too aggressive and requires too many heuristics to disambiguate.
   * 
   * @param {string} text - The text to search
   * @returns {Array} array of found organizations with metadata
   * @private
   */
  function findOrganizationsInCSV(text) {
    const found = [];
    
    if (!text || text.length === 0 || EXTENSIVE_ORGANIZATIONS.size === 0) {
      return found;
    }
    
    const textLower = text.toLowerCase();
    
    for (const org of EXTENSIVE_ORGANIZATIONS) {
      const orgLower = org.toLowerCase();
      
      // ★ EXACT SUBSTRING MATCH ONLY: Check if organization appears in text
      // This is the most reliable method — only detect if full org name appears
      // 
      // Examples of what this catches:
      // - "I work at University of Santo Tomas" → matches "university of santo tomas"
      // - "She is a librarian at Accenture Inc" → matches "accenture inc"
      // 
      // Examples of what this doesn't catch (correctly filtered):
      // - "she is a librarian in university of santo" → does NOT match (incomplete)
      // - "university of santo tomas" in CSV but text only has "university of santo" → no match
      if (textLower.includes(orgLower)) {
        // ★ NEW: Filter out code patterns (prevent "script" in "terms-organizations.js" from being flagged)
        if (isCodePattern(text, org)) {
          console.debug(`[PATH_C/findOrganizationsInCSV] Filtered code pattern: "${org}" (appears as code element)`);
          continue;  // Skip code patterns
        }
        
        // Avoid duplicates
        if (!found.some(f => f.name.toLowerCase() === org.toLowerCase())) {
          found.push({
            name: org,
            source: 'csv_exact_match',
            confidence: 'high'
          });
        }
        continue;  
      }
    }
    
    return found;
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

    // ★ PATTERN 5: Generic programming terms in code contexts (NEW)
    // "script", "file", "code", "config", "data", etc. in file paths or code references
    // These should NOT be flagged as organizations even if they appear in the text
    const genericCodeTerms = new Set([
      'script', 'scripts', 'code', 'file', 'files', 'config', 'configs', 'data', 
      'class', 'function', 'method', 'module', 'component', 'page', 'route', 'view',
      'model', 'schema', 'template', 'service', 'handler', 'util', 'helper', 'hook',
      'test', 'tests', 'spec', 'specs', 'build', 'dist', 'src', 'lib', 'utils'
    ]);
    
    const candidateLower = candidate.toLowerCase();
    if (genericCodeTerms.has(candidateLower)) {
      // Check if this appears in a code-like context (has file extensions, paths, etc)
      const hasCodeContext = /\.(js|ts|jsx|tsx|py|java|cs|rb|go|rs|php|html|css|json|yaml|xml|sql)\b/i.test(text) ||
                            /(?:terms-|_\.js|-file|-script|-config|\.js|\.ts)/.test(text) ||
                            /\b(?:api_?key|error|returning|keeps?|config|const|let|var|function|class|import|require|export)\b/i.test(text) ||
                            /\b(?:file|path|directory|folder|import|require|export|function|class|const|let|var|json|xml|html)\b/i.test(contextWindow);
      
      if (hasCodeContext) {
        return true;  // It's a generic programming term in code context
      }
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
    // ★ FIX: CASE-SENSITIVE (no /i). Under /i the [A-Z][a-z]+ subject matched
    // lowercase common nouns too, so "My mother is a retired nurse" captured
    // "mother" as a name. The subject of a name-introducing copular clause is a
    // proper noun, so we require genuine Title Case; the "is a/an/the" trailer
    // stays lowercase as written.
    const subjectPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the)\s+/g;
    
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
   * (Fix: Don't capture single letters like "i" in "librarian i")
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
   * 4. Reject any title containing single letters (e.g., "librarian i" → invalid)
   * 5. Return ONLY the job title without context
   *
   * Examples:
   * - "Maria is a human resource manager" → "human resource manager"
   * - "she is a librarian at university" → "librarian" (stops at " at ")
   * - "she is a librarian in university of santo" → "librarian" (stops at " in ")
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
    
    // Helper: Validate that a title doesn't contain isolated single letters (like "i")
    function hasValidWords(title) {
      // Split by spaces and check each word is 2+ characters
      const words = title.split(/\s+/);
      return words.every(word => word.length >= 2);
    }
    
    // ★ NEW: Case-insensitive pattern to catch "Gynecologist", "GYNECOLOGIST", "gynecologist", etc.
    // Pattern 1: "[Name or Pronoun] is a [job phrase]"
    // Capture until: preposition + space, or punctuation, or end of string
    const predicatePatternA = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[a-z]+)\s+is\s+a\s+([a-z]+(?:\s+[a-z]+)*)(?=\s+(?:at|in|for|of|by|and|or)|[.,;!?]|$)/gi;
    
    let match;
    while ((match = predicatePatternA.exec(text)) !== null) {
      let title = match[1].trim();
      
      // Additional cleanup: remove trailing prepositions if any slipped through
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      // Heuristic 1: Must be 2+ characters
      if (title.length < 2) continue;
      
      // Heuristic 2: Reject titles with single-letter words (e.g., "librarian i")
      if (!hasValidWords(title)) continue;
      
      // Heuristic 3: Filter obvious non-titles
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      
      // Heuristic 4: Avoid duplicates
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // Pattern 2: "[Name or Pronoun] is an [job phrase]"
    const predicatePatternAn = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[a-z]+)\s+is\s+an\s+([a-z]+(?:\s+[a-z]+)*)(?=\s+(?:at|in|for|of|by|and|or)|[.,;!?]|$)/gi;
    
    while ((match = predicatePatternAn.exec(text)) !== null) {
      let title = match[1].trim();
      title = title.replace(/\s+(?:at|for|in|of|by|and|or)\s*$/i, '').trim();
      
      if (title.length < 2) continue;
      if (!hasValidWords(title)) continue;
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
      if (!hasValidWords(title)) continue;
      if (shouldFilterCommonJobTitle(title, { isFromPredicate: true })) continue;
      if (titles.some(t => t.toLowerCase() === title.toLowerCase())) continue;
      
      titles.push(title);
    }
    
    // ★ ENHANCED: Pattern for mixed case like "Gynecologist" at start of sentence
    // Pattern 3b: "Capitalized word" or "Capitalized Multi-Word" standing alone as job predicate
    // This catches cases where NLP might not match the copular pattern perfectly
    // Examples: "Gynecologist." at end of sentence, "Gynecologist," in lists
    const predicateCapitalizedPattern = /(?:^|\s+|\(|\[)([A-Z][a-z]+(?:\s+[a-z]+){0,2})(?=[\.,;!?\)]|$|\n)/gi;
    while ((match = predicateCapitalizedPattern.exec(text)) !== null) {
      let title = match[1].trim();
      
      // Only process if it looks like a job title (in appropriate context)
      // Must be 3+ characters to avoid single words
      if (title.length < 3) continue;
      
      // Check against CSV database FIRST
      const titleLower = title.toLowerCase();
      if (EXTENSIVE_JOB_TITLES.size > 0 && EXTENSIVE_JOB_TITLES.has(titleLower)) {
        if (!titles.some(t => t.toLowerCase() === titleLower)) {
          console.debug(`[TrustPrompt/linguistic-detector] Enhanced pattern found job title: ${title}`);
          titles.push(title);
        }
      }
    }
    
    // Pattern 4: Extract individual job-indicator words from predicate context
    const jobIndicators = [
      'manager', 'engineer', 'director', 'coordinator', 'specialist', 'consultant',
      'analyst', 'assistant', 'designer', 'developer', 'officer', 'representative',
      'advocate', 'architect', 'administrator', 'supervisor', 'lead', 'head',
      'chief', 'coordinator', 'handler', 'officer', 'executive', 'strategist',
      'planner', 'auditor', 'inspector', 'supervisor', 'correspondent',
      'physician', 'doctor', 'nurse', 'therapist', 'teacher', 'professor',
      'lawyer', 'attorney', 'accountant', 'pharmacist', 'technician',
      'gynecologist', 'cardiologist', 'dentist', 'surgeon'  // ★ Added medical specialties
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

  /**
   * ★ MISSING FUNCTION: Extract organizations from contextual patterns
   * 
   * Detects organizations in patterns like:
   * - "is the head of [ORG]"
   * - "is part of [ORG]"  
   * - "works at [ORG]"
   * - "works for [ORG]"
   * - Standalone acronyms like "OICT", "Google"
   *
   * This function was being called but was never defined, causing organizations
   * to be extracted incorrectly or not at all.
   *
   * @param {string} text - The text to search
   * @returns {Array} array of extracted organization names
   * @private
   */
  function extractOrganizationContexts(text) {
    const orgs = [];

    // Pattern 1: "in the [ORG]" where ORG is complete words until sentence end
    // CRITICAL: Match complete words from "the" onwards, capturing until:
    // - End of sentence (. , ; or $)
    // - NOT at word boundary inside organization name like "santo" before "tomas"
    // Use word-based matching: each word is [a-z]+ separated by \s+
    const headOfPattern = /\bin\s+the\s+([a-z]+(?:\s+[a-z]+)*?)(?=\s*(?:\.|\,|;|$))/gi;
    let match;
    while ((match = headOfPattern.exec(text)) !== null) {
      let org = match[1].trim();
      // Remove trailing prepositions/conjunctions
      org = org.replace(/\s+(?:and|or|at)\s*$/i, '').trim();

      if (org.length >= 3 && !['the', 'a', 'an', 'that', 'this', 'who', 'which'].includes(org.toLowerCase())) {
        if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
          console.debug(`[extractOrganizationContexts] Pattern 1 (in the): found "${org}"`);
          orgs.push(org);
        }
      }
    }

    // Pattern 1b: "is the head/director of [ORG]"
    const headOfPattern2 = /\bis\s+(?:the\s+)?(?:head|chief|director|coordinator|manager)\s+of\s+([a-z]+(?:\s+[a-z]+)*?)(?=\s*(?:\.|\,|;|$))/gi;
    while ((match = headOfPattern2.exec(text)) !== null) {
      let org = match[1].trim();
      org = org.replace(/\s+(?:and|or|at)\s*$/i, '').trim();

      if (org.length >= 3 && !['the', 'a', 'an', 'that', 'this', 'who', 'which'].includes(org.toLowerCase())) {
        if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
          console.debug(`[extractOrganizationContexts] Pattern 1b (is head of): found "${org}"`);
          orgs.push(org);
        }
      }
    }

    // Pattern 2: "works at/for [ORG]" or "employed at [ORG]"
    // Match complete words until sentence boundary
    const worksAtPattern = /\b(?:works?|employed?|working)\s+(?:at|by|for|with)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+)*?)(?=\s*(?:\.|\,|;|$))/gi;
    while ((match = worksAtPattern.exec(text)) !== null) {
      let org = match[1].trim();
      org = org.replace(/\s+(?:and|or|which|where)\s*$/i, '').trim();

      if (org.length >= 3 && !['the', 'a', 'an', 'that', 'this', 'there'].includes(org.toLowerCase())) {
        if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
          console.debug(`[extractOrganizationContexts] Pattern 2 (works at): found "${org}"`);
          orgs.push(org);
        }
      }
    }

    // Pattern 3: Standalone acronyms like "OICT", "Google", "IBM"
    // Match either uppercase acronyms or capitalized words
    const acronymPattern = /\b([A-Z]{2,5}|[A-Z][a-z]+)\b(?!\w)/gi;
    const blacklist = new Set(['THE', 'AND', 'FOR', 'WITH', 'FROM', 'THAT', 'THIS', 'KYL', 'NIC']);

    while ((match = acronymPattern.exec(text)) !== null) {
      const org = match[1].trim();

      if (org.length >= 2 && !blacklist.has(org.toUpperCase())) {
        if (!orgs.some(o => o.toLowerCase() === org.toLowerCase())) {
          console.debug(`[extractOrganizationContexts] Pattern 3 (acronym): found "${org}"`);
          orgs.push(org);
        }
      }
    }

    return orgs;
  }

  function extractFromAppositives(text) {
    const roles = [];
    const organizations = [];
    
    // ★ CRITICAL FIX: These patterns should ONLY extract roles, NOT organizations
    // Organizations are extracted via extractOrganizationContexts() which handles CSV validation
    // This function is for extracting role titles from copular constructions like:
    // - "She is the head of X" → extract role "head"
    // - "He is responsible for X" → extract role "responsible for"
    
    // Pattern 1: "is the head of [ROLE/ORG]" 
    // Extract ONLY the role word (head), NOT what follows (the org)
    let match = /\bis\s+(?:the\s+)?(head|director|chair|leader|coordinator|manager|officer|specialist)\s+(?:of|for|in)\s+/gi.exec(text);
    if (match) {
      const role = match[1].trim();
      if (role.length >= 2 && !shouldFilterCommonJobTitle(role)) {
        roles.push(role);
      }
    }
    
    // Pattern 2: "is part of [ORG]" - SKIP, don't extract
    // This was causing "university of santo" → incomplete extraction
    // Let extractOrganizationContexts() handle organization extraction instead
    
    // Pattern 3: "is the [role] of [something]" - extract only the role
    match = /\bis\s+(?:the\s+)?([a-z]+?)\s+(?:of|for|in)\s+(?:the\s+)?(?:department|division|team|group|network|security|infrastructure)/gi.exec(text);
    if (match) {
      const role = match[1].trim();
      if (role.length >= 2 && role.length <= 20 && !shouldFilterCommonJobTitle(role)) {
        roles.push(role);
      }
    }
    
    // Pattern 4: "responsible for [ROLE/RESPONSIBILITY]" 
    // Extract ONLY role indicators, not the full phrase
    match = /\bresponsible\s+for\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,2})(?:\.|,|;|and|or|$)/gi.exec(text);
    if (match) {
      const phrase = match[1].trim();
      // Only keep if it looks like a role (short phrase, no "university", etc.)
      if (phrase.length >= 2 && phrase.length <= 30 && 
          !phrase.toLowerCase().includes('university') &&
          !phrase.toLowerCase().includes('department of') &&
          !shouldFilterCommonJobTitle(phrase)) {
        roles.push(phrase);
      }
    }
    
    // Pattern 5: "serves as [ROLE]" - extract the role only
    match = /\bserves\s+as\s+(?:the\s+)?(head|director|chair|lead|manager|officer|coordinator)\b/gi.exec(text);
    if (match) {
      const role = match[1].trim();
      if (role.length >= 2 && !shouldFilterCommonJobTitle(role)) {
        roles.push(role);
      }
    }
    
    return { 
      roles: [...new Set(roles)],  // Deduplicate
      organizations: []  // ★ CRITICAL: Return EMPTY array - don't extract orgs here!
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
      'agency', 'administration', 'admin', 'institute', 'institutes', 'university', 'universities',
      'college', 'colleges', 'school', 'schools', 'academy', 'academies',
      'hospital', 'hospitals', 'clinic', 'clinics', 'bank', 'banks', 'fund', 'funds',
      'association', 'associations', 'society', 'societies', 'enterprises', 'enterprise',
      'organization', 'organizations', 'org', 'council', 'councils', 'committee',
      'board', 'foundation', 'foundations', 'cooperative', 'cooperatives',
      'ministry', 'office', 'offices', 'authority', 'center', 'centre', 'centers',
      'service', 'services', 'network', 'systems', 'holdings', 'ventures', 'solutions',
      'company', 'companies', 'corporation', 'corporations'
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
   * ★ CSV-FIRST APPROACH: Find organizations in text using CSV dictionaries
   * 
   * PASS 1: Exact substring match (case-insensitive, word boundaries)
   * PASS 2: Fuzzy match (tolerates 1-2 character differences / typos)
   * PASS 3: Keyword component matching (extract keywords and match against CSV)
   * 
   * @param {string} text - The text to search
   * @returns {Array} array of organization findings
   * @private
   */
  function findOrganizationsCSVFirst(text) {
    const found = [];
    const seen = new Set();
    
    console.debug(`[PATH_C/CSV_ORG] findOrganizationsCSVFirst called`);
    console.debug(`[PATH_C/CSV_ORG] Input text: "${text.substring(0, 50)}..."`);
    console.debug(`[PATH_C/CSV_ORG] EXTENSIVE_ORGANIZATIONS_ARRAY.length: ${EXTENSIVE_ORGANIZATIONS_ARRAY.length}`);
    console.debug(`[PATH_C/CSV_ORG] EXTENSIVE_ORGANIZATIONS.size: ${EXTENSIVE_ORGANIZATIONS.size}`);
    
    if (!text || text.length === 0 || EXTENSIVE_ORGANIZATIONS_ARRAY.length === 0) {
      console.warn(`[PATH_C/CSV_ORG] ⚠️ Early return - CSV not loaded or text empty`);
      return found;
    }
    
    const textLower = text.toLowerCase();
    
    // ────────────────────────────────────────────────────────────────────────
    // PASS 1: Exact substring match (case-insensitive, word boundaries)
    // ────────────────────────────────────────────────────────────────────────
    console.debug(`[PATH_C/CSV_ORG] PASS 1: Testing ${EXTENSIVE_ORGANIZATIONS_ARRAY.length} organizations for exact match`);
    for (const org of EXTENSIVE_ORGANIZATIONS_ARRAY) {
      const orgLower = org.toLowerCase();
      const escaped = escapeRegex(orgLower);
      const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
      
      if (pattern.test(text)) {
        const normalized = orgLower;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          found.push({
            name: org,
            rawMatch: org,
            confidence: 'high',
            source: 'csv_exact_match',
            csvValidated: true
          });
          console.debug(`[PATH_C/CSV_ORG] Pass 1 (exact): ✅ found "${org}"`);
        }
      }
    }
    
    console.debug(`[PATH_C/CSV_ORG] PASS 1 complete: ${found.length} matches found`);
    
    // ────────────────────────────────────────────────────────────────────────
    // PASS 2: Fuzzy match (1-2 character differences, handles typos)
    // ────────────────────────────────────────────────────────────────────────
    // ★ CRITICAL FIX: Prevent short words like "with" and "what" (4 chars)
    // from fuzzy-matching to organizations. Only match if:
    //   1. The organization name is > 5 chars (substantial name)
    //   2. The matched text is also > 5 chars (not a common short word)
    //   3. Length ratio is >= 0.70 (matched text is at least 70% of org name length)
    //
    // Examples of what this blocks:
    //   "with" (4) → "wish" (4) — BLOCKED: match length = 4, too short
    //   "what" (4) → "wist" (4) — BLOCKED: match length = 4, too short
    //   "trust" (5) → "trusts" (6) — ALLOWED: match length = 5, ratio = 0.83
    for (const org of EXTENSIVE_ORGANIZATIONS_ARRAY) {
      if (org.length > 5) {  // Only fuzzy match longer orgs (avoid noise)
        const fuzzyMatches = fuzzyFind(text, org, 2);
        
        for (const match of fuzzyMatches) {
          // ★ NEW: Reject if matched text is suspiciously short
          // Short words like "with", "what", "that" should not match organizations
          if (match.length <= 5) {
            console.debug(`[PATH_C/CSV_ORG] Pass 2 (fuzzy): SKIP - matched text too short: "${match}" (${match.length} chars) → org: "${org}"`);
            continue;  // Skip matches where the found text is too short
          }
          
          // ★ NEW: Ensure length ratio between matched text and org is reasonable
          // Prevents fuzzy matching of very short partial matches
          const lengthRatio = match.length / org.length;
          if (lengthRatio < 0.70) {
            console.debug(`[PATH_C/CSV_ORG] Pass 2 (fuzzy): SKIP - length ratio too small: "${match}" (${match.length}) vs "${org}" (${org.length}), ratio=${(lengthRatio * 100).toFixed(0)}%`);
            continue;  // Skip if matched text is less than 70% of org name
          }
          
          const normalized = match.toLowerCase();
          if (!seen.has(normalized)) {
            seen.add(normalized);
            found.push({
              name: org,  // Canonical name from CSV
              rawMatch: match,  // What was found in text
              confidence: 'medium',
              source: 'csv_fuzzy_match',
              csvValidated: true
            });
            console.debug(`[PATH_C/CSV_ORG] Pass 2 (fuzzy): found "${match}" → canonical: "${org}"`);
          }
        }
      }
    }
    
    // ────────────────────────────────────────────────────────────────────────
    // PASS 3: Keyword component matching
    // ────────────────────────────────────────────────────────────────────────
    // Example: "Santo Tomas University" (reverse order) → extract keywords
    const textWords = textLower.split(/\s+/).filter(w => w.length > 3);
    
    for (const word of textWords) {
      // Remove punctuation from word
      const cleanWord = word.replace(/[.,;!?'"\-()]/g, '');
      
      if (ORG_KEYWORDS_INDEX.has(cleanWord)) {
        const potentialOrgs = ORG_KEYWORDS_INDEX.get(cleanWord);
        
        for (const potentialOrg of potentialOrgs) {
          // Verify multiple keywords from same org appear in text proximity
          const orgKeywords = potentialOrg.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const textWindowWords = textLower.split(/\s+/).slice(
            Math.max(0, textWords.indexOf(cleanWord) - 5),
            textWords.indexOf(cleanWord) + 6
          );
          
          const keywordMatches = orgKeywords.filter(keyword =>
            textWindowWords.some(tw => tw.includes(keyword))
          ).length;
          
          // If at least 60% of org keywords appear in proximity, flag it
          if (keywordMatches >= Math.ceil(orgKeywords.length * 0.6)) {
            const normalized = potentialOrg.toLowerCase();
            if (!seen.has(normalized)) {
              seen.add(normalized);
              found.push({
                name: potentialOrg,
                confidence: 'medium',
                source: 'csv_keyword_component',
                csvValidated: true
              });
              console.debug(`[PATH_C/CSV_ORG] Pass 3 (component): found via keywords: "${potentialOrg}"`);
              break;
            }
          }
        }
      }
    }
    
    return found;
  }

  /**
   * ★ CSV-FIRST APPROACH: Find job titles in text using CSV dictionaries
   * 
   * PASS 1: Exact substring match (case-insensitive, word boundaries)
   * PASS 2: Multi-word phrase matching (last 2-3 words must be in CSV)
   * PASS 3: Fuzzy match (tolerates 1 character difference)
   * 
   * @param {string} text - The text to search
   * @returns {Array} array of job title findings
   * @private
   */
  function findJobTitlesCSVFirst(text) {
    const found = [];
    const seen = new Set();
    
    console.debug(`[PATH_C/CSV_JOB] findJobTitlesCSVFirst called`);
    console.debug(`[PATH_C/CSV_JOB] Input text: "${text.substring(0, 50)}..."`);
    console.debug(`[PATH_C/CSV_JOB] EXTENSIVE_JOB_TITLES_ARRAY.length: ${EXTENSIVE_JOB_TITLES_ARRAY.length}`);
    console.debug(`[PATH_C/CSV_JOB] EXTENSIVE_JOB_TITLES.size: ${EXTENSIVE_JOB_TITLES.size}`);
    
    if (!text || text.length === 0 || EXTENSIVE_JOB_TITLES_ARRAY.length === 0) {
      console.warn(`[PATH_C/CSV_JOB] ⚠️ Early return - CSV not loaded or text empty`);
      return found;
    }
    
    const textLower = text.toLowerCase();
    
    // ────────────────────────────────────────────────────────────────────────
    // PASS 1: Exact substring match (case-insensitive, word boundaries)
    // ────────────────────────────────────────────────────────────────────────
    for (const title of EXTENSIVE_JOB_TITLES_ARRAY) {
      const escaped = escapeRegex(title);
      const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
      
      if (pattern.test(text)) {
        if (!seen.has(title)) {
          seen.add(title);
          found.push({
            name: title,
            rawMatch: title,
            confidence: 'high',
            source: 'csv_exact_match',
            csvValidated: true
          });
          console.debug(`[PATH_C/CSV_JOB] Pass 1 (exact): found "${title}"`);
        }
      }
    }
    
    // ────────────────────────────────────────────────────────────────────────
    // PASS 2: Multi-word phrase matching
    // ────────────────────────────────────────────────────────────────────────
    // Extract 2-3 word windows and check against CSV
    const textWords = textLower.split(/\s+/).filter(w => w.length > 0);
    
    for (let i = 1; i < textWords.length; i++) {
      // Clean punctuation from words
      const w1 = textWords[i - 1].replace(/[.,;!?'"\-()]/g, '');
      const w2 = textWords[i].replace(/[.,;!?'"\-()]/g, '');
      const w0 = (i >= 2) ? textWords[i - 2].replace(/[.,;!?'"\-()]/g, '') : null;
      
      // Check 2-word phrases
      const twoWordPhrase = [w1, w2].filter(w => w.length > 0).join(' ');
      if (twoWordPhrase && EXTENSIVE_JOB_TITLES.has(twoWordPhrase)) {
        if (!seen.has(twoWordPhrase)) {
          seen.add(twoWordPhrase);
          found.push({
            name: twoWordPhrase,
            rawMatch: twoWordPhrase,
            confidence: 'high',
            source: 'csv_phrase_match',
            csvValidated: true
          });
          console.debug(`[PATH_C/CSV_JOB] Pass 2 (phrase 2-word): found "${twoWordPhrase}"`);
        }
      }
      
      // Check 3-word phrases
      if (w0) {
        const threeWordPhrase = [w0, w1, w2].filter(w => w.length > 0).join(' ');
        if (threeWordPhrase && EXTENSIVE_JOB_TITLES.has(threeWordPhrase)) {
          if (!seen.has(threeWordPhrase)) {
            seen.add(threeWordPhrase);
            found.push({
              name: threeWordPhrase,
              rawMatch: threeWordPhrase,
              confidence: 'high',
              source: 'csv_phrase_match',
              csvValidated: true
            });
            console.debug(`[PATH_C/CSV_JOB] Pass 2 (phrase 3-word): found "${threeWordPhrase}"`);
          }
        }
      }
    }
    
    // ────────────────────────────────────────────────────────────────────────
    // PASS 3: Fuzzy match (1 character difference, handles typos)
    // ────────────────────────────────────────────────────────────────────────
    // ★ CRITICAL FIX: Prevent short words from fuzzy-matching to job titles
    // Only match if matched text is > 5 chars and reasonably sized relative to title
    for (const title of EXTENSIVE_JOB_TITLES_ARRAY) {
      if (title.length > 5) {  // Only fuzzy match longer titles
        const fuzzyMatches = fuzzyFind(text, title, 1);
        
        for (const match of fuzzyMatches) {
          // ★ NEW: Reject if matched text is too short
          if (match.length <= 5) {
            console.debug(`[PATH_C/CSV_JOB] Pass 3 (fuzzy): SKIP - matched text too short: "${match}" (${match.length} chars) → title: "${title}"`);
            continue;  // Skip matches where the found text is too short
          }
          
          // ★ NEW: Ensure length ratio is reasonable
          const lengthRatio = match.length / title.length;
          if (lengthRatio < 0.70) {
            console.debug(`[PATH_C/CSV_JOB] Pass 3 (fuzzy): SKIP - length ratio too small: "${match}" vs "${title}", ratio=${(lengthRatio * 100).toFixed(0)}%`);
            continue;  // Skip if matched text is less than 70% of title
          }
          
          if (!seen.has(match.toLowerCase())) {
            seen.add(match.toLowerCase());
            found.push({
              name: title,  // Canonical name from CSV
              rawMatch: match,  // What was found in text
              confidence: 'medium',
              source: 'csv_fuzzy_match',
              csvValidated: true
            });

            console.debug(`[PATH_C/CSV_JOB] Pass 3 (fuzzy): found "${match}" → canonical: "${title}"`);
          }
        }
      }
    }
    
    return found;
  }

  /**
   * ★ COMPROMISE.JS VALIDATION: Filter CSV findings using NLP
   * 
   * Validates job titles by checking:
   *   - Context (preceded by job triggers: "is a", "works as", etc)
   *   - POS patterns (must be mostly nouns, not verbs/adjectives)
   * 
   * @param {Array} csvFindings - Findings from CSV scan
   * @param {string} text - Original text for context checking
   * @param {object} doc - compromise.js document (optional)
   * @returns {Array} filtered/validated findings
   * @private
   */
  function validateJobTitlesWithCompromise(csvFindings, text, doc) {
    if (!COMPROMISE_AVAILABLE || csvFindings.length === 0) {
      // If no compromise or no findings, return all CSV findings
      return csvFindings;
    }
    
    const validated = [];
    
    for (const finding of csvFindings) {
      const actualSpan = findActualSpan(text, finding.rawMatch || finding.name);
      
      try {
        // High-confidence CSV matches (exact) bypass most validation
        if (finding.source === 'csv_exact_match' && finding.confidence === 'high') {
          // Still check context - must appear in job-related context
          if (checkJobContext(text, actualSpan)) {
            validated.push(finding);
            console.debug(`[PATH_C/VAL_JOB] PASS (high-conf + context): "${finding.name}"`);
          } else {
            // Even exact matches should have job context to be flagged
            console.debug(`[PATH_C/VAL_JOB] FILTER (no context): "${finding.name}"`);
          }
          continue;
        }
        
        // Lower-confidence findings must pass both context and POS checks
        const hasJobContext = checkJobContext(text, actualSpan);
        
        // POS validation with compromise
        const nlpSpan = window.nlp ? window.nlp(actualSpan) : null;
        const hasBadPOS = nlpSpan ? checkBadPOS(nlpSpan) : false;
        
        if (hasJobContext && !hasBadPOS) {
          validated.push(finding);
          console.debug(`[PATH_C/VAL_JOB] PASS (context + POS): "${finding.name}"`);
        } else {
          console.debug(`[PATH_C/VAL_JOB] FILTER (context: ${hasJobContext}, badPOS: ${hasBadPOS}): "${finding.name}"`);
        }
      } catch (error) {
        console.debug(`[PATH_C/VAL_JOB] Validation error: ${error.message}, keeping finding`);
        validated.push(finding);
      }
    }
    
    return validated;
  }

  /**
   * ★ COMPROMISE.JS VALIDATION: Filter CSV findings for organizations
   * 
   * Validates organizations by checking:
   *   - Context (preceded by org triggers: "at", "in", "works at", etc)
   *   - POS patterns (proper noun + noun patterns)
   *   - Length (3+ words typical for orgs)
   * 
   * @param {Array} csvFindings - Findings from CSV scan
   * @param {string} text - Original text for context checking
   * @param {object} doc - compromise.js document (optional)
   * @returns {Array} filtered/validated findings
   * @private
   */
  function validateOrganizationsWithCompromise(csvFindings, text, doc) {
    if (!COMPROMISE_AVAILABLE || csvFindings.length === 0) {
      // If no compromise or no findings, return all CSV findings
      return csvFindings;
    }
    
    const validated = [];
    
    for (const finding of csvFindings) {
      const actualSpan = findActualSpan(text, finding.rawMatch || finding.name);
      
      try {
        // High-confidence CSV exact matches bypass validation
        if (finding.source === 'csv_exact_match' && finding.confidence === 'high') {
          validated.push(finding);
          console.debug(`[PATH_C/VAL_ORG] PASS (high-conf exact): "${finding.name}"`);
          continue;
        }
        
        // Medium-confidence findings must pass context check
        const hasOrgContext = checkOrgContext(text, actualSpan);
        
        // POS validation
        const nlpSpan = window.nlp ? window.nlp(actualSpan) : null;
        const hasBadPOS = nlpSpan ? checkBadPOS(nlpSpan) : false;
        
        if (hasOrgContext && !hasBadPOS) {
          validated.push(finding);
          console.debug(`[PATH_C/VAL_ORG] PASS (context + POS): "${finding.name}"`);
        } else {
          console.debug(`[PATH_C/VAL_ORG] FILTER (context: ${hasOrgContext}, badPOS: ${hasBadPOS}): "${finding.name}"`);
        }
      } catch (error) {
        console.debug(`[PATH_C/VAL_ORG] Validation error: ${error.message}, keeping finding`);
        validated.push(finding);
      }
    }
    
    return validated;
  }
    
  // ── Helper: Link entities across sentences ────────────────────────────────────
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

  // ── Helper: Merge consecutive detected names ──────────────────────────────

  /**
   * ★ NEW FEATURE: Merge first and last names when detected consecutively.
   * 
   * Problem: "Maricel Balais" → detected as two separate names: ["Maricel", "Balais"]
   * Solution: Merge them into a single full name when they appear consecutively
   * 
   * Algorithm:
   * 1. Sort findings by their position in the original text
   * 2. For each pair of consecutive names, check if they're adjacent in text
   * 3. If adjacent (within 1 space), merge them as "FirstName LastName"
   * 4. Replace individual name findings with merged version
   * 
   * Examples:
   * - Text: "Maricel Balais is the head"
   *   - Before merge: ["Maricel", "Balais"]
   *   - After merge: ["Maricel Balais"]
   * - Text: "Maria works here. Santos is the director"
   *   - Before merge: ["Maria", "Santos"]
   *   - After merge: ["Maria", "Santos"] (NOT merged - not consecutive in text)
   * - Text: "John Smith and Jane Doe"
   *   - Before merge: ["John", "Smith", "Jane", "Doe"]
   *   - After merge: ["John Smith", "Jane Doe"]
   *
   * @param {Array} personFindings - Person name findings array
   * @param {string} originalText - Original text for position checking
   * @returns {Array} merged findings
   * @private
   */
  function mergeConsecutiveNames(personFindings, originalText) {
    if (!personFindings || personFindings.length < 2 || !originalText) {
      return personFindings;
    }
    
    const text = originalText.toLowerCase();
    const merged = [];
    const merged_set = new Set();
    
    let i = 0;
    while (i < personFindings.length) {
      const current = personFindings[i];
      const next = personFindings[i + 1];
      
      // Check if current and next names are consecutive in the text
      if (next && current && current.rawMatch && next.rawMatch) {
        const currentLower = current.rawMatch.toLowerCase();
        const nextLower = next.rawMatch.toLowerCase();
        
        // Find positions in text
        const currentPos = text.indexOf(currentLower);
        const nextPos = text.indexOf(nextLower, currentPos + currentLower.length);
        
        // Check if they're adjacent:
        // - currentPos is valid
        // - nextPos immediately follows current (with 0-1 space between)
        // - The gap is exactly one space or word separator
        if (currentPos >= 0 && nextPos > 0) {
          const gap = nextPos - (currentPos + currentLower.length);
          
          // Adjacent if gap is 0-2 characters (one space or newline/tab)
          if (gap >= 0 && gap <= 2) {
            const gapContent = originalText.substring(
              currentPos + currentLower.length,
              nextPos
            ).trim();
            
            // If gap is just whitespace, these are consecutive names
            if (gapContent === '') {
              const mergedName = current.rawMatch + ' ' + next.rawMatch;
              
              // Check for duplicates (don't merge if already merged)
              if (!merged_set.has(mergedName.toLowerCase())) {
                merged_set.add(mergedName.toLowerCase());
                merged.push({
                  patternId: current.patternId,
                  label: 'Person Name (NLP - Merged)',
                  risk: current.risk,
                  rawMatch: mergedName,
                  safeVersion: current.safeVersion.replace(/REDACTED/, 'MERGED NAME REDACTED'),
                  source: current.source,
                  validated: false
                });
                
                // ★ CRITICAL FIX: When we merge names, skip the next finding
                // Otherwise we'd add both the individual name and the merged version
                i += 2;
                continue;
              }
            }
          }
        }
      }
      
      // If not merged, add the current finding as-is
      const currentLower = current.rawMatch.toLowerCase();
      if (!merged_set.has(currentLower)) {
        merged_set.add(currentLower);
        merged.push(current);
      }
      
      i++;
    }
    
    return merged;
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
   * ★ NEW: Merging logic (FIX #1)
   * - After all extraction methods, merge consecutive first and last names
   * - Example: "Maricel" + "Balais" → "Maricel Balais"
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

          // ★ FIX (DEF-002/DEF-003): compromise.js NER frequently mis-tags
          // organization names as people (e.g. "Mapua Malayan Colleges").
          // Run the org/name classifier and drop anything that looks like an
          // organization so it is not reported as a person name. The dedicated
          // organization extractor still captures it with the correct label.
          if (classifyNameVsOrganization(rawMatch) === 'organization') {
            continue;
          }

          // Also reject candidates that contain a non-name/stop word (e.g.
          // "In Davao", "The Change") which compromise occasionally emits.
          const candidateWords = rawMatch.split(/\s+/);
          if (candidateWords.some(w => NON_NAME_WORDS.has(w.toLowerCase()))) {
            continue;
          }

          // Reject place/country names mis-tagged as people (e.g. "Saudi Arabia").
          if (looksLikePlaceName(rawMatch)) {
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

    // ★ FIX #1: Merge consecutive first and last names
    // Example: "Maricel" + "Balais" detected separately → merge to "Maricel Balais"
    const mergedFindings = mergeConsecutiveNames(findings, doc ? doc.out('text') : '');
    return mergedFindings;
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
        // org is now an object with {name, governed, source, confidence}
        const orgName = typeof org === 'string' ? org : org.name;
        const isGoverned = typeof org === 'object' ? org.governed : false;
        const orgSource = typeof org === 'object' ? org.source : 'unknown';
        const confidence = typeof org === 'object' ? org.confidence : 'medium';
        
        if (orgName.length >= 3 && !shouldFilterCommonOrganization(orgName) && !isCodePattern(text, orgName) && !findings.some(f => f.rawMatch.toLowerCase() === orgName.toLowerCase())) {
          findings.push({
            patternId: 'nlp_organization',
            label: `Organization (NLP - ${orgSource})`,
            risk: 'low',
            rawMatch: orgName,
            safeVersion: '[ORGANIZATION REDACTED]',
            source: 'C_linguistic',
            validated: false,
            // ★ GOVERNANCE METADATA
            governed: isGoverned,
            governanceConfidence: confidence,
            governanceSource: orgSource
          });
        }
      }
      
      // Method 2: Extract from appositive phrases (NEW)
      // Patterns: "is the head of oict", "is part of oict", etc.
      const { organizations } = extractFromAppositives(text);
      for (const org of organizations) {
        if (org.length >= 3 && !shouldFilterCommonOrganization(org) && !isCodePattern(text, org) && !findings.some(f => f.rawMatch.toLowerCase() === org.toLowerCase())) {
          // ★ HYBRID: Check governance database for appositive-extracted orgs
          const canonical = getCanonicalOrganizationName(org);
          const finalOrgName = canonical || org;
          const isGoverned = !!canonical;
          
          findings.push({
            patternId: 'nlp_organization',
            label: 'Organization (NLP - Appositive)',
            risk: 'low',
            rawMatch: finalOrgName,
            safeVersion: '[ORGANIZATION REDACTED]',
            source: 'C_linguistic',
            validated: false,
            // ★ GOVERNANCE METADATA
            governed: isGoverned,
            governanceConfidence: isGoverned ? 'high' : 'low',
            governanceSource: 'appositive_validation'
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
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // METHOD 5 (NEW): REVERSE CSV LOOKUP FOR ORGANIZATIONS
      // ★ FIX #2: Search organizations.csv for mentions in text
      // 
      // Catches organizations like "University of Santo Tomas" that regex might miss
      // Uses exact match and fuzzy word-level matching (70%+ overlap)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const csvOrganizations = findOrganizationsInCSV(text);
      for (const csvOrg of csvOrganizations) {
        const orgName = csvOrg.name;
        
        // Check if not already added from previous methods
        if (!findings.some(f => f.rawMatch.toLowerCase() === orgName.toLowerCase())) {
          findings.push({
            patternId: 'nlp_organization',
            label: `Organization (NLP - CSV ${csvOrg.source})`,
            risk: 'low',
            rawMatch: orgName,
            safeVersion: '[ORGANIZATION REDACTED]',
            source: 'C_linguistic',
            validated: true,
            // ★ GOVERNANCE METADATA
            governed: true,
            governanceConfidence: csvOrg.confidence,
            governanceSource: csvOrg.source
          });
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
      console.debug('[TrustPrompt/PATH_C] Empty input');
      return [];
    }

    console.log('[TrustPrompt/PATH_C] ★★★ SCAN FUNCTION CALLED ★★★');
    console.log('[TrustPrompt/PATH_C] Input text FULL:', textNLP);
    console.log('[TrustPrompt/PATH_C] Input text length:', textNLP.length);
    console.log('[TrustPrompt/PATH_C] First 100 chars:', textNLP.substring(0, 100));

    const findings = [];

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 1: PERSON NAME DETECTION (Original Methods - No CSV)
      // ═══════════════════════════════════════════════════════════════════════
      
      console.debug('[TrustPrompt/PATH_C] STAGE 1: Person Name Detection');
      let nameCount = 0;
      
      // METHOD 1: Names with honorifics - "Ms Padua", "Dr. Smith"
      const honorificNames = extractNamesWithHonorific(textNLP);
      for (const name of honorificNames) {
        if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
          nameCount++;
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (Honorific)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            extractionMethod: 'honorific'
          });
          console.debug(`[PATH_C/NAMES] Found via honorific: "${name}"`);
        }
      }
      
      // METHOD 2: Names from trigger phrases - "my name is", "i am", "call me"
      const nameTriggerPatterns = [
        /\bmy\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
        /\b(?:i\s+)?(?:am|'m)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
        /\bcall\s+me\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
        /\bi['']m\s+called\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
      ];
      
      for (const pattern of nameTriggerPatterns) {
        let match;
        while ((match = pattern.exec(textNLP)) !== null) {
          const name = match[1].trim();
          
          // ★ FIX: Filter out non-name words (adjectives, verbs, descriptors, etc.)
          // Check if ANY word in the phrase is a known non-name word
          const words = name.split(/\s+/);
          const hasNonNameWord = words.some(word => NON_NAME_WORDS.has(word.toLowerCase()));
          if (hasNonNameWord) {
            console.debug(`[PATH_C/NAMES] METHOD 2: Filtered - contains non-name word: ${words.filter(w => NON_NAME_WORDS.has(w.toLowerCase())).join(', ')}`);
            continue;  // Skip phrases containing non-name words like "experiencing" or "heavy"
          }
          
          if (name.length >= 2 && !shouldFilterCommonName(name)) {
            if (!findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) {
              nameCount++;
              findings.push({
                patternId: 'nlp_person_name',
                label: 'Person Name (Trigger)',
                risk: 'low',
                rawMatch: name,
                safeVersion: '[NAME REDACTED]',
                source: 'C_linguistic',
                extractionMethod: 'trigger_phrase'
              });
              console.debug(`[PATH_C/NAMES] Found via trigger: "${name}"`);
            }
          }
        }
      }
      
      // METHOD 3: Extract names from subject position patterns
      // Simple: Look for capitalized words that appear before verbs/states
      console.log(`[PATH_C/NAMES] METHOD 3: Subject position names`);
      
      // Pattern: [Capitalized Words] + [Verb/State]
      // Captures: "Maricel Balais is experiencing", "John is working", "Maria said", etc.
      // MUST capture multi-word names as a unit, not individual words
      const subjectNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|are|was|were|said|told|asked|explained|works|worked|goes|went|comes|came|living|lived|named|called)\b/g;
      
      let match;
      while ((match = subjectNamePattern.exec(textNLP)) !== null) {
        const candidateName = match[1].trim();
        console.log(`[PATH_C/NAMES] METHOD 3: Found: "${candidateName}"`);
        
        // Basic filters
        const pronouns = new Set(['i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her', 'us', 'them']);
        if (pronouns.has(candidateName.toLowerCase())) {
          console.log(`[PATH_C/NAMES] METHOD 3: Skip "${candidateName}" - pronoun`);
          continue;
        }
        
        if (candidateName.length < 2) {
          console.log(`[PATH_C/NAMES] METHOD 3: Skip "${candidateName}" - too short`);
          continue;
        }
        
        // ★ FIX: Filter out non-name words (adjectives, verbs, descriptors, etc.)
        // Check if ANY word in the phrase is a known non-name word
        const words = candidateName.split(/\s+/);
        const hasNonNameWord = words.some(word => NON_NAME_WORDS.has(word.toLowerCase()));
        if (hasNonNameWord) {
          console.log(`[PATH_C/NAMES] METHOD 3: Skip "${candidateName}" - contains non-name word: ${words.filter(w => NON_NAME_WORDS.has(w.toLowerCase())).join(', ')}`);
          continue;  // Skip phrases containing non-name words
        }
        
        // Check for duplicates
        if (findings.some(f => f.rawMatch.toLowerCase() === candidateName.toLowerCase())) {
          console.log(`[PATH_C/NAMES] METHOD 3: Skip "${candidateName}" - duplicate`);
          continue;
        }
        
        nameCount++;
        findings.push({
          patternId: 'nlp_person_name',
          label: 'Person Name (Subject Position)',
          risk: 'low',
          rawMatch: candidateName,
          safeVersion: '[NAME REDACTED]',
          source: 'C_linguistic',
          extractionMethod: 'subject_position'
        });
        console.log(`[PATH_C/NAMES] METHOD 3: ✅ ADDED: "${candidateName}"`);
      }
      
      // METHOD 4: Standalone capitalized multi-word phrases (names without explicit triggers)
      // Examples: "Maricel Balais said...", "John Smith works at..."
      // Look for 2-3 consecutive capitalized words that might be names
      const standaloneNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
      let standaloneMatch;
      const processedStandalone = new Set();
      
      console.debug(`[PATH_C/NAMES] METHOD 4: Testing standalone capitalized multi-word pattern on text`);
      while ((standaloneMatch = standaloneNamePattern.exec(textNLP)) !== null) {
        const candidateName = standaloneMatch[1].trim();
        
        console.debug(`[PATH_C/NAMES] METHOD 4: Regex matched - candidateName="${candidateName}"`);
        
        // Avoid duplicates in this method
        if (processedStandalone.has(candidateName.toLowerCase())) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - duplicate within METHOD 4`);
          continue;
        }
        processedStandalone.add(candidateName.toLowerCase());
        
        // Skip if already found in findings
        if (findings.some(f => f.rawMatch.toLowerCase() === candidateName.toLowerCase())) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - already found in earlier methods`);
          continue;
        }
        
        // Filter out pronouns and possessive pronouns
        const words = candidateName.split(/\s+/);
        const pronouns = new Set(['i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her', 'us', 'them']);
        const possessivePronouns = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
        
        if (words.some(w => pronouns.has(w.toLowerCase()))) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - contains pronoun`);
          continue;
        }
        
        // ★ FIX: Reject if first word is a possessive pronoun (e.g., "My birthday", "Your address")
        if (words.length > 0 && possessivePronouns.has(words[0].toLowerCase())) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - starts with possessive pronoun: "${words[0]}"`);
          continue;
        }
        
        // Check if it contains non-name words (adjectives, verbs, discourse markers)
        if (words.some(w => NON_NAME_WORDS.has(w.toLowerCase()))) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - contains non-name word: ${words.filter(w => NON_NAME_WORDS.has(w.toLowerCase())).join(', ')}`);
          continue;
        }

        // ★ FIX (DEF-003/DEF-005): Reject organization names and place/country
        // names that compromise and the capitalized-phrase heuristic mis-tag as
        // people — e.g. "Mapua Malayan Colleges", "Saudi Arabia". These are
        // captured by the dedicated org extractor / location pattern instead.
        if (classifyNameVsOrganization(candidateName) === 'organization') {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - classified as organization: "${candidateName}"`);
          continue;
        }
        if (looksLikePlaceName(candidateName)) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - place/country name: "${candidateName}"`);
          continue;
        }

        // ★ FIX (DEF-002): If the capitalized phrase is immediately followed by a
        // corporate suffix (Inc, Corp, Ltd, LLC, Co, Company, Corporation), it is
        // an organization, not a person — e.g. "Pacific Rim Logistics Inc.".
        // classifyNameVsOrganization only sees the phrase itself and would score
        // a 3-word Title-Case phrase as a name, so we check the trailing context.
        const afterMatch = textNLP.slice(standaloneMatch.index + candidateName.length, standaloneMatch.index + candidateName.length + 16);
        if (/^\s*,?\s*(?:inc|corp|corporation|incorporated|ltd|limited|llc|llp|co|company|enterprises?|holdings|ventures|group)\b\.?/i.test(afterMatch)) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - followed by corporate suffix (organization): "${candidateName}"`);
          continue;
        }
        
        // Must pass common name filter
        if (!shouldFilterCommonName(candidateName)) {
          nameCount++;
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (Standalone)',
            risk: 'low',
            rawMatch: candidateName,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            extractionMethod: 'standalone_capitalized'
          });
          console.debug(`[PATH_C/NAMES] Found standalone: "${candidateName}"`);
        } else {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - "${candidateName}" is common first name`);
        }
      }
      
      console.debug(`[TrustPrompt/PATH_C] Names found: ${nameCount}`);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 2: CSV-FIRST DETECTION (Job Titles + Organizations)
      // ═══════════════════════════════════════════════════════════════════════
      
      console.debug('[TrustPrompt/PATH_C] STAGE 2: CSV-First Detection');
      
      let csvJobFindings = findJobTitlesCSVFirst(textNLP);
      console.debug(`[TrustPrompt/PATH_C] CSV Job Titles found: ${csvJobFindings.length}`);
      
      let csvOrgFindings = findOrganizationsCSVFirst(textNLP);
      console.debug(`[TrustPrompt/PATH_C] CSV Organizations found: ${csvOrgFindings.length}`);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 3: COMPROMISE.JS VALIDATION GATE
      // ═══════════════════════════════════════════════════════════════════════
      
      console.debug('[TrustPrompt/PATH_C] STAGE 3: Compromise.js Validation');
      
      let validatedJobTitles = csvJobFindings;
      let validatedOrganizations = csvOrgFindings;
      
      if (COMPROMISE_AVAILABLE) {
        validatedJobTitles = validateJobTitlesWithCompromise(csvJobFindings, textNLP);
        console.debug(`[TrustPrompt/PATH_C] Job Titles after validation: ${validatedJobTitles.length}`);
        
        validatedOrganizations = validateOrganizationsWithCompromise(csvOrgFindings, textNLP);
        console.debug(`[TrustPrompt/PATH_C] Organizations after validation: ${validatedOrganizations.length}`);
      } else {
        console.debug('[TrustPrompt/PATH_C] Compromise.js unavailable, skipping validation');
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 4: Add job titles and organizations to findings
      // ═══════════════════════════════════════════════════════════════════════
      
      // Add job titles to findings
      for (const title of validatedJobTitles) {
        findings.push({
          patternId: 'nlp_job_title',
          label: `Job Title (${title.source})`,
          risk: 'low',
          rawMatch: title.rawMatch || title.name,
          safeVersion: '[JOB TITLE REDACTED]',
          source: 'C_linguistic',
          confidence: title.confidence,
          csvValidated: true
        });
      }
      
      // Add organizations to findings
      for (const org of validatedOrganizations) {
        const orgRaw = org.rawMatch || org.name;
        // ★ FIX (DEF-002/DEF-005): apply the common-word filter to CSV org
        // matches too. Fuzzy/keyword passes otherwise surface false positives
        // such as "change" and "arabia" (fragment of "Saudi Arabia"/"Saudi
        // Aramco"). This guard was already applied to context/appositive orgs
        // but not to the CSV-first results.
        if (shouldFilterCommonOrganization(orgRaw)) {
          console.debug(`[TrustPrompt/PATH_C] Filtered CSV org (common word): "${orgRaw}"`);
          continue;
        }
        if (looksLikePlaceName(orgRaw)) {
          console.debug(`[TrustPrompt/PATH_C] Filtered CSV org (place name): "${orgRaw}"`);
          continue;
        }
        findings.push({
          patternId: 'nlp_organization',
          label: `Organization (${org.source})`,
          risk: 'low',
          rawMatch: orgRaw,
          safeVersion: '[ORGANIZATION REDACTED]',
          source: 'C_linguistic',
          confidence: org.confidence,
          csvValidated: true
        });
      }
      
      console.debug(`[TrustPrompt/PATH_C] Total findings: ${findings.length} (names: ${nameCount}, jobs: ${validatedJobTitles.length}, orgs: ${validatedOrganizations.length})`);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STAGE 5: METHOD 4.5 - Names in directive contexts (object position)
      // ═══════════════════════════════════════════════════════════════════════
      // Catches single-word names following action verbs and prepositions
      // Examples: "generate an email for Kyleen", "send message to John"
      console.debug('[TrustPrompt/PATH_C] METHOD 4.5: Extracting names from directive contexts...');
      let method45Count = 0;
      
      // Filter: Non-name words that shouldn't be detected as person names
      const nonNameWordsDirective = new Set([
        'heavy', 'light', 'small', 'large', 'big', 'little', 'new', 'old', 'young', 'ancient',
        'fast', 'slow', 'quick', 'rapid', 'bright', 'dark', 'long', 'short', 'tall', 'wide',
        'hot', 'cold', 'warm', 'cool', 'thick', 'thin', 'strong', 'weak', 'tight', 'loose',
        'good', 'bad', 'better', 'worse', 'best', 'worst', 'nice', 'ugly', 'pretty', 'beautiful',
        'smart', 'dumb', 'clever', 'silly', 'funny', 'serious', 'happy', 'sad', 'angry', 'calm',
        'experiencing', 'reporting', 'stating', 'saying', 'telling', 'asking', 'calling'
      ]);
      
      const directiveContextPatterns = [
        // Prepositions: "for [Name]", "to [Name]", "with [Name]"
        // Captures the capitalized name directly after these prepositions
        { pattern: /\b(?:for|to|with)\s+([A-Z][a-z]+)\b/g, name: 'preposition' },
        // Action verbs with direct object names (direct capture only, no intermediate prepositions)
        // Matches: "contact Kyleen", "call John", "invite Sarah"
        // Does NOT match: "email for Kyleen" (has preposition in between)
        { pattern: /\b(?:contact|call|invite|notify)\s+([A-Z][a-z]+)\b/g, name: 'action_verb' },
        // "from [Name]" context - captures name after "from"
        { pattern: /\bfrom\s+([A-Z][a-z]+)\b/g, name: 'from_context' }
      ];
      
      for (const patternObj of directiveContextPatterns) {
        const pattern = patternObj.pattern;
        let match;
        while ((match = pattern.exec(textNLP)) !== null) {
          const name = match[1].trim();
          
          // Filter: Name must be 2+ characters
          if (name.length < 2) continue;
          
          // Filter: Reject common non-names and placeholder words
          if (shouldFilterCommonName(name)) continue;
          
          // Filter: Reject if it's a known non-name word (adjectives, verbs, discourse markers)
          if (nonNameWordsDirective.has(name.toLowerCase())) continue;
          
          // Filter: Reject known organizations and AI models
          const knownOrganizations = new Set(['azure', 'google', 'amazon', 'microsoft', 'apple', 'claude', 'gpt', 'gemini', 'bard']);
          if (knownOrganizations.has(name.toLowerCase())) continue;
          
          // Filter: Avoid duplicates
          if (findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) continue;
          
          method45Count++;
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (Directive Context)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            extractionMethod: 'directive_context',
            validatedMethod: patternObj.name,
            validated: false
          });
          console.debug(`[TrustPrompt/PATH_C] METHOD 4.5 found via ${patternObj.name}: "${name}"`);
        }
      }
      console.debug('[TrustPrompt/PATH_C] METHOD 4.5 found:', method45Count);
      
    } catch (error) {
      console.error('[TrustPrompt/PATH_C] Scan error:', error);
    }

    console.log('[TrustPrompt/PATH_C] ★★★ SCAN FUNCTION RETURNING ★★★');
    console.log('[TrustPrompt/PATH_C] Total findings from scan():', findings.length);
    findings.forEach((f, i) => console.log(`  [${i}] ${f.patternId}: ${f.rawMatch}`));
    
    return findings;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LEGACY SCAN METHODS (kept for backward compatibility if needed)
  // ════════════════════════════════════════════════════════════════════════════
  
  function scanLegacy(textNLP) {
    // Validate input
    if (!textNLP || typeof textNLP !== 'string' || textNLP.trim().length === 0) {
      console.debug('[TrustPrompt/PATH_C] SIMPLIFIED scan() - Empty input');
      return [];
    }

    console.debug('[TrustPrompt/PATH_C] SIMPLIFIED scan() starting - using 3 core methods only');

    const findings = [];

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // LEGACY: 3 CORE DETECTION METHODS ONLY
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
      // METHOD 3.5: SURNAME-ONLY EXTRACTION - "Balais", last names after verbs
      // Patterns: "[Name] is", "[Name] said", "[Name] told", "[Name] asked"
      // These typically indicate surnames used alone in professional/formal context
      // ★ DISABLED: This is causing "Balais" to be detected instead of "Maricel Balais"
      // The parent METHOD 3 already handles this case
      // ─────────────────────────────────────────────────────────────────────
      console.debug('[TrustPrompt/PATH_C] METHOD 3.5: DISABLED - skipping surname-only patterns');
      
      /*
      const surnameContextPatterns = [
        /\b([A-Z][a-z]+)\s+(?:is\s+(?:a|an|the|my|your|his|her|our|their)|said|told|asked|explained|mentioned|noted|indicated|suggested|proposed|added|answered|remarked|observed|stated|declared|communicated|reported|revealed|announced|expressed|emphasized|revealed|outlined|described)(?:\s|$)/gi,
        // "the [Surname]" + work context (e.g., "the Balais mentioned librarian")
        /\bthe\s+([A-Z][a-z]+)\s+(?:mentioned|noted|said|explained|who|that|of|in|at)/gi,
      ];
      
      for (const pattern of surnameContextPatterns) {
        while ((match = pattern.exec(textNLP)) !== null) {
          const possibleSurname = match[1].trim();
          
          // Filters for surname-only detection
          const isNotCommon = !shouldFilterCommonName(possibleSurname);
          const isNotPronoun = !['i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her', 'us', 'them'].includes(possibleSurname.toLowerCase());
          const isProperLength = possibleSurname.length >= 2;
          const isCapitalized = /^[A-Z]/.test(possibleSurname);
          
          if (isNotCommon && isNotPronoun && isProperLength && isCapitalized) {
            const nameLower = possibleSurname.toLowerCase();
            if (!findings.some(f => f.rawMatch.toLowerCase() === nameLower)) {
              method3Count++;
              findings.push({
                patternId: 'nlp_person_name',
                label: 'Person Name (NLP - Surname Context)',
                risk: 'low',
                rawMatch: possibleSurname,
                safeVersion: '[NAME REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      console.debug('[TrustPrompt/PATH_C] METHOD 3.5 found:', method3Count);
      */

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
        
        // ★ FIX: Personal attribute words - NOT person names (e.g., "My birthday", "Your address")
        const personalAttributeWords = new Set(['name', 'birthday', 'age', 'email', 'phone', 'address', 'job', 'title', 'company', 'department', 'ssn', 'password', 'pin', 'account', 'number', 'id', 'license', 'gender', 'sex', 'height', 'weight', 'color', 'eyes', 'hair', 'health', 'condition', 'salary', 'income', 'location', 'country', 'city', 'state', 'zip', 'religion', 'belief', 'nationality', 'status', 'relationship', 'spouse', 'parent', 'child', 'sibling', 'emergency', 'contact', 'reference', 'description', 'notes', 'comments', 'details', 'information']);
        
        const lowerName = name.toLowerCase();
        
        // ★ FIX: Check if name starts with possessive pronoun (e.g., "My birthday", "Your address")
        // These are personal attributes, NOT person names
        const possessivePronounWords = ['my', 'your', 'his', 'her', 'its', 'our', 'their'];
        const nameWords = lowerName.split(/\s+/);
        if (nameWords.length >= 1 && possessivePronounWords.includes(nameWords[0])) {
          continue;  // Skip phrases starting with possessive pronouns
        }
        
        // ★ FIX: Check if name contains personal attribute words (e.g., "My birthday", "Your email")
        if (nameWords.some(word => personalAttributeWords.has(word))) {
          continue;  // Skip if any word is a personal attribute descriptor
        }
        
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
      // METHOD 4.5: Names in directive contexts (e.g., "for Jerralyn", "to John")
      // ─────────────────────────────────────────────────────────────────────
      // Catches single-word names following action verbs and prepositions
      // Examples: "generate an email for Jerralyn", "send message to John", "contact Sarah"
      console.debug('[TrustPrompt/PATH_C] METHOD 4.5: Extracting names from directive contexts...');
      let method45Count = 0;
      
      // Filter: Non-name words that shouldn't be detected as person names
      const nonNameWords = new Set([
        'heavy', 'light', 'small', 'large', 'big', 'little', 'new', 'old', 'young', 'ancient',
        'fast', 'slow', 'quick', 'rapid', 'bright', 'dark', 'long', 'short', 'tall', 'wide',
        'hot', 'cold', 'warm', 'cool', 'thick', 'thin', 'strong', 'weak', 'tight', 'loose',
        'good', 'bad', 'better', 'worse', 'best', 'worst', 'nice', 'ugly', 'pretty', 'beautiful',
        'smart', 'dumb', 'clever', 'silly', 'funny', 'serious', 'happy', 'sad', 'angry', 'calm',
        'experiencing', 'reporting', 'stating', 'saying', 'telling', 'asking', 'calling'
      ]);
      
      const directiveContextPatterns = [
        // Prepositions: "for [Name]", "to [Name]", "with [Name]"
        /\b(?:for|to|with)\s+([A-Z][a-z]+)\b/gi,
        // Action verbs with direct object: "contact [Name]", "email [Name]", "call [Name]", "invite [Name]"
        /\b(?:contact|email|call|message|invite|notify|reach\s+out\s+to|send\s+to)\s+([A-Z][a-z]+)\b/gi,
        // "from [Name]" context
        /\bfrom\s+([A-Z][a-z]+)\b/gi
      ];
      
      for (const pattern of directiveContextPatterns) {
        let match;
        while ((match = pattern.exec(textNLP)) !== null) {
          const name = match[1].trim();
          
          // Filter: Name must be 2+ characters
          if (name.length < 2) continue;
          
          // Filter: Reject common non-names and placeholder words
          if (shouldFilterCommonName(name)) continue;
          
          // Filter: Reject if it's a known non-name word (adjectives, verbs, discourse markers)
          if (nonNameWords.has(name.toLowerCase())) continue;
          
          // Filter: Reject known organizations and AI models
          const knownOrganizations = new Set(['azure', 'google', 'amazon', 'microsoft', 'apple', 'claude', 'gpt', 'gemini', 'bard']);
          if (knownOrganizations.has(name.toLowerCase())) continue;
          
          // Filter: Avoid duplicates
          if (findings.some(f => f.rawMatch.toLowerCase() === name.toLowerCase())) continue;
          
          method45Count++;
          findings.push({
            patternId: 'nlp_person_name',
            label: 'Person Name (Directive Context)',
            risk: 'low',
            rawMatch: name,
            safeVersion: '[NAME REDACTED]',
            source: 'C_linguistic',
            validated: false
          });
        }
      }
      console.debug('[TrustPrompt/PATH_C] METHOD 4.5 found:', method45Count);
      
      // ─────────────────────────────────────────────────────────────────────
      // METHOD 5: Organization extraction (CRITICAL - was missing!)
      // ─────────────────────────────────────────────────────────────────────
      console.debug('[TrustPrompt/PATH_C] METHOD 5: Extracting organizations...');
      let method5Count = 0;
      
      // Extract organizations from contextual patterns
      const contextOrgs = extractOrganizationContexts(textNLP);
      for (const org of contextOrgs) {
        const orgName = typeof org === 'string' ? org : org.name;
        if (orgName && orgName.length >= 2 && !shouldFilterCommonOrganization(orgName) && !isCodePattern(textNLP, orgName)) {
          if (!findings.some(f => f.rawMatch.toLowerCase() === orgName.toLowerCase())) {
            method5Count++;
            findings.push({
              patternId: 'nlp_organization',
              label: 'Organization (NLP)',
              risk: 'low',
              rawMatch: orgName,
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

  // Initialize extensive data sources from JS-based term data
  // Runs synchronously since terms-occupations.js and terms-organizations.js are already loaded
  console.log('[TrustLinguisticDetector] Starting JS initialization...');
  
  // Initialize the JS-based term data synchronously
  initializeExtensiveJobTitles();
  initializeExtensiveOrganizations();
  
  console.log('[TrustLinguisticDetector] ✅ JS initialization complete (synchronous)');
  console.log(`[TrustLinguisticDetector] Loaded ${EXTENSIVE_JOB_TITLES.size} job titles and ${EXTENSIVE_ORGANIZATIONS.size} organizations`);
  console.log(`[TrustLinguisticDetector] Contains 'gynecologist': ${EXTENSIVE_JOB_TITLES.has('gynecologist')}`);
  console.log(`[TrustLinguisticDetector] Contains 'accenture': ${EXTENSIVE_ORGANIZATIONS.has('accenture')}`);
  console.log(`[TrustLinguisticDetector] EXTENSIVE_ORGANIZATIONS_ARRAY first 10: ${EXTENSIVE_ORGANIZATIONS_ARRAY.slice(0, 10).join(', ')}`);

  // Expose a wait function that returns immediately (for backwards compatibility)
  const waitForCSVInit = () => Promise.resolve(true);

  return { scan, waitForCSVInit };

})();

// ── IMMEDIATE EXPORT (before any async initialization) ──────────────────────────
// Export the detector immediately so it's available to scanner.js
// The CSV loading is asynchronous but the scan() function works without CSV data

if (typeof window !== 'undefined') {
  window.TrustLinguisticDetector = TrustLinguisticDetector;
  console.log('[STARTUP] TrustLinguisticDetector assigned to window immediately');
}

if (typeof globalThis !== 'undefined') {
  globalThis.TrustLinguisticDetector = TrustLinguisticDetector;
  console.log('[STARTUP] TrustLinguisticDetector assigned to globalThis immediately');
}
  
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

// Also export to globalThis for scanner.js compatibility
// Async CSV initialization - runs after detector is exported
// Graceful degradation: detector works without CSV data using pattern matching only
console.log('[STARTUP] linguistic-detector.js loaded and exported');
