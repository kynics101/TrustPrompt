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

/* global window, OCCUPATIONS_DATA, ORGANIZATIONS_DATA, NAMES_DATA, PH_ADDRESS_DB */

// KNOWN LIMITATIONS (intentional, documented):
// 1. Lowercase names: names written entirely in lowercase (e.g. after "cousin" or "brother" in casual text)
//    are not detected because all name regexes require [A-Z] as the first character.
//    normalizePath_C sentence-cases fully-lowercase prompts but not mixed-case ones.
// 2. ALL-CAPS names: capsGuard in normalizePath_C sentence-cases ALL-CAPS prompts, which produces
//    "Ricardo antonio bautista" — only the first word is capitalized, so multi-word names are split.
// 3. Trade words inside names: names like "Mason Carpenter" contain tokens that are also job-title words.
//    The detector may emit the trade word as a spurious extra finding or miss the name-vs-job ambiguity.
// 4. Departments without a dedicated tag: there is no nlp_department patternId. Departments are only
//    detected as nlp_organization when present in ORGANIZATIONS_DATA or matched by the structural pass.
//    Informal department names absent from both sources are not detected.
// 5. JOB-TITLE TYPO TOLERANCE (Group 6, D11): fuzzy (edit-distance-1) matching of job titles applies
//    ONLY to dictionary titles of 9 or more letters (FUZZY_JOB_MIN_TITLE_LEN), and only when the first
//    AND last letter of the text and of the title are equal. Shorter titles (e.g. teacher, plumber,
//    mechanic) match only when spelled correctly (exact dictionary match is unaffected at every length).
//    Reason: shorter titles are one letter away from many ordinary words (schedule/scheduler,
//    service/servicer, master/caster, sister/sifter). Cost: a typo in the first or last letter of any
//    title is never recovered. Measured: 14,691 ordinary words -> 831 fuzzy hits before, 3 after (all 3 are
//    genuine misspellings).
// 6. POSSESSIVE JOB WORDS: "my printer", "my boss", "my phone charger" are tagged as job titles because
//    a possessive trigger plus an exact dictionary noun is indistinguishable (structurally) from
//    "my nurse". No structural rule separates them without removing true positives; left as a limitation.

const TrustLinguisticDetector = (() => {

  // ── Module initialization ──────────────────────────────────────────────────
  // Check if compromise.js is available in global scope
  const COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined;

  // ── Constants & heuristic data ─────────────────────────────────────────────

  // ── Group 8: common-names dictionary (terms-names.js), used ONLY as an anchor ("this word is plausibly a person's name") ──────────
  // Two Sets built once at load time; every lookup is one Set.has() (lowercase, accents stripped). If terms-names.js is not loaded
  // (NAMES_DICT_AVAILABLE false) every check below behaves as before the dictionary existed.
  const NAMES_FIRST = new Set(), NAMES_SURNAMES = new Set();
  let NAMES_DICT_AVAILABLE = false;
  try {
    if (typeof NAMES_DATA !== 'undefined' && NAMES_DATA && Array.isArray(NAMES_DATA.firstNames) && Array.isArray(NAMES_DATA.surnames)) {
      NAMES_DATA.firstNames.forEach(n => NAMES_FIRST.add(n));
      NAMES_DATA.surnames.forEach(n => NAMES_SURNAMES.add(n));
      NAMES_DICT_AVAILABLE = NAMES_FIRST.size > 0;
    }
  } catch (_) { /* optional data */ }
  function isKnownNameWord(word) {
    if (!NAMES_DICT_AVAILABLE || !word) return false;
    const k = word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return NAMES_FIRST.has(k) || NAMES_SURNAMES.has(k);
  }

  // Group 4c: placeholders only. A common first name ("John", "Mary") no longer disqualifies a name: "John Reyes" is a real name.
  // Only these placeholder words (as the first word) and these complete placeholder names are filtered.
  const COMMON_FIRST_NAMES = new Set(['example', 'user', 'test', 'demo', 'sample', 'admin', 'root']);
  const PLACEHOLDER_FULL_NAMES = new Set(['john doe', 'jane doe', 'john smith', 'jane smith']);

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
  let JOB_EXTRA_TITLES = new Set();     // Group 17: the titles added by category (see terms-occupations.js)
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
      // Group 17: titles added by category (terms-occupations.js, OCCUPATIONS_EXTRA_ADDED); a generic sentence never accepts them
      JOB_EXTRA_TITLES = new Set((typeof OCCUPATIONS_EXTRA_ADDED !== 'undefined' && Array.isArray(OCCUPATIONS_EXTRA_ADDED) ? OCCUPATIONS_EXTRA_ADDED : [])
        .map(t => t.toLowerCase()));

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
  // Group 9 (speed, O2/O3): fuzzyFind is called once per dictionary entry (about 39,000 times per scan) with the SAME text. The lower-cased
  // word list and the window strings (and their lengths) for each window size depend only on the text, so they are built once per text
  // and reused; the cheap length test now runs before isPrefixSuffixVariation. isPrefixSuffixVariation is a pure function, and both tests
  // only skip a window, so the set and the ORDER of the returned matches are exactly what the original loop produced.
  // Group 9 (speed, O4): bounded edit distance. fuzzyFind only needs to know whether levenshteinDistance(a, b) <= d. This computes exactly
  // that with the standard banded dynamic programme (only cells with |i - j| <= d can lie on a path of cost <= d), on two reused
  // Int32Arrays and with an early exit as soon as every cell of a row exceeds d. Same comparison of UTF-16 code units as levenshteinDistance.
  let _lvPrev = new Int32Array(256), _lvCurr = new Int32Array(256);
  function levenshteinWithin(a, b, d) {
    const n = a.length, m = b.length;
    if (n - m > d || m - n > d) return false;
    if (n === 0) return m <= d;
    if (m === 0) return n <= d;
    if (m + 1 > _lvPrev.length) { _lvPrev = new Int32Array(m + 1); _lvCurr = new Int32Array(m + 1); }
    const INF = d + 1;
    let prev = _lvPrev, curr = _lvCurr;
    for (let j = 0; j <= m; j++) prev[j] = j <= d ? j : INF;
    for (let i = 1; i <= n; i++) {
      const jlo = i - d > 1 ? i - d : 1, jhi = i + d < m ? i + d : m;
      curr[jlo - 1] = jlo === 1 ? (i <= d ? i : INF) : INF;
      if (jhi < m) curr[jhi + 1] = INF;
      const ac = a.charCodeAt(i - 1);
      let rowMin = INF;
      for (let j = jlo; j <= jhi; j++) {
        const sub = prev[j - 1] + (ac === b.charCodeAt(j - 1) ? 0 : 1);
        const del = prev[j] + 1;
        const ins = curr[j - 1] + 1;
        let v = sub < del ? sub : del;
        if (ins < v) v = ins;
        if (v > INF) v = INF;
        curr[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > d) return false;
      const t = prev; prev = curr; curr = t;
    }
    return prev[m] <= d;
  }

  // O6: per-pattern data (lower-cased form and word count) computed once instead of on each of the ~39,000 calls per scan
  const _fzPat = new Map();
  function fuzzyPattern(pattern) {
    let p = _fzPat.get(pattern);
    if (!p) { const lower = pattern.toLowerCase(); p = { lower, k: lower.split(/\s+/).filter(w => w.length > 0).length }; _fzPat.set(pattern, p); }
    return p;
  }

  let _fzText = null, _fzWords = null, _fzByK = null;
  function fuzzyWindows(text, k) {
    if (_fzText !== text) {
      _fzText = text;
      _fzWords = text.toLowerCase().split(/[\s,;.!?'"\-()]+/).filter(w => w.length > 0);
      _fzByK = new Map();
    }
    let w = _fzByK.get(k);
    if (!w) {
      const n = Math.max(0, _fzWords.length - k + 1), phrases = new Array(n), lens = new Int32Array(n);
      for (let i = 0; i < n; i++) { const p = _fzWords.slice(i, i + k).join(' '); phrases[i] = p; lens[i] = p.length; }
      w = { phrases, lens };
      _fzByK.set(k, w);
    }
    return w;
  }

  // firstLast (O5, optional): the caller will discard every match whose first or last character differs from the pattern's, so such windows
  // are skipped here before any distance is computed. Same returned set and order as the caller's own check applied afterwards.
  function fuzzyFind(text, pattern, maxDistance = 2, firstLast = false) {
    const { lower: patLower, k } = fuzzyPattern(pattern);

    if (k === 0) return [];

    const matches = [];
    const { phrases, lens } = fuzzyWindows(text, k);
    const plen = pattern.length;
    const pFirst = patLower.charCodeAt(0), pLast = patLower.charCodeAt(patLower.length - 1);

    // Slide window over text words and compute distance
    for (let i = 0; i < phrases.length; i++) {
      // Length lower-bound pre-check: edit distance can never be smaller than
      // the difference in lengths (levenshtein(a,b) >= |len(a)-len(b)|), so a
      // window whose length differs from the pattern by more than maxDistance
      // can never satisfy distance <= maxDistance. Skip the DP for those pairs.
      if (Math.abs(lens[i] - plen) > maxDistance) {
        continue;
      }
      const textPhrase = phrases[i];
      if (firstLast && (textPhrase.charCodeAt(0) !== pFirst || textPhrase.charCodeAt(textPhrase.length - 1) !== pLast)) continue;

      // ★ NEW: Reject prefix/suffix variations before calculating distance
      if (isPrefixSuffixVariation(textPhrase, patLower, 20)) {
        continue;  // Skip this potential match
      }

      if (levenshteinWithin(textPhrase, patLower, maxDistance)) {
        matches.push(textPhrase);
      }
    }

    return matches;
  }

  // Group 10: NARROWED fuzzy matching for ORGANIZATIONS (job-title fuzzy matching is unchanged). Edit distance 2 over a whole short window let
  // ordinary English phrases match short brand names ("make it" ~ "Move It", "best way" ~ "Best Buy", "the philippines" ~ "TTEC Philippines",
  // "a university" ~ "AMA University", "to store" ~ "SM Store"), while the matches that are real typos are a single slip inside one long word
  // ("universty of the philippines", "philippine general hospitl"). A fuzzy organization match is now accepted only when:
  //   - the dictionary entry has at least 2 words and at least 10 characters;
  //   - the text window has the same number of words as the entry and exactly ONE word differs (all other words are identical);
  //   - the differing word has at least 6 letters in both forms and differs by one insertion, deletion, substitution or adjacent transposition.
  // Everything this accepts was also accepted by the old rule; it only removes matches. Exact matches (PASS 1) are not affected.
  const FUZZY_ORG_MIN_ENTRY_CHARS = 10, FUZZY_ORG_MIN_WORD_LEN = 6;
  function fuzzyOrgEntryEligible(org) { return org.length >= FUZZY_ORG_MIN_ENTRY_CHARS && /\S\s+\S/.test(org); }
  function narrowFuzzyOrgMatch(match, org) {
    const ow = org.toLowerCase().split(/\s+/).filter(Boolean), mw = match.split(' ');
    if (ow.length < 2 || ow.length !== mw.length) return false;
    let diff = 0, x = '', y = '';
    for (let i = 0; i < ow.length; i++) if (ow[i] !== mw[i]) { diff++; x = ow[i]; y = mw[i]; }
    if (diff !== 1) return false;
    if (x.length < FUZZY_ORG_MIN_WORD_LEN || y.length < FUZZY_ORG_MIN_WORD_LEN) return false;
    if (levenshteinWithin(x, y, 1)) return true;
    if (x.length === y.length) {   // adjacent transposition ("mircosoft")
      let i = 0; while (i < x.length && x[i] === y[i]) i++;
      if (i + 1 < x.length && x[i] === y[i + 1] && x[i + 1] === y[i] && x.slice(i + 2) === y.slice(i + 2)) return true;
    }
    return false;
  }

  /**
   * Escape special regex characters
   * @private
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Group 9 (speed, O1): exact-match prefilter for PASS 1 of the organization and job-title dictionaries. A case-insensitive
  // (non-Unicode) RegExp built from an ASCII-only pattern can match only where the text contains the same letters in some case: a
  // non-ASCII text character never canonicalises to an ASCII letter, and toLowerCase() leaves ASCII characters where they are. So
  // `textLower.indexOf(patternLower) === -1` proves "the RegExp cannot match" and the RegExp need not be built. A pattern with any
  // non-ASCII character is NOT prefiltered and always goes through the original RegExp.
  const _ASCII_ONLY = /^[\x00-\x7f]*$/;
  // O6: the lower-case form and the "ASCII only" flag of every dictionary entry, computed once per dictionary instead of on every scan.
  // lowerPattern = true for organizations (their RegExp is built from the lower-cased name), false for job titles (built from the title).
  const _p1Meta = new Map();
  function p1Meta(arr, lowerPattern) {
    let m = _p1Meta.get(arr);
    if (!m || m.n !== arr.length) {
      const n = arr.length, lower = new Array(n), ascii = new Uint8Array(n);
      for (let i = 0; i < n; i++) { const l = arr[i].toLowerCase(); lower[i] = l; ascii[i] = _ASCII_ONLY.test(lowerPattern ? l : arr[i]) ? 1 : 0; }
      m = { n, lower, ascii }; _p1Meta.set(arr, m);
    }
    return m;
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

  // Group 6: possessive triggers, which alone do not justify extending a title over noun modifiers.
  const JOB_POSSESSIVE_TRIGGERS = new Set(['my ', 'your ', 'their ', 'her ', 'his ', 'our ']);
  // Group 16 (cause B, stage 1): "became / becomes / becoming a <title>" is a trigger like "become a", but a hypothetical or a wish before it
  // ("if I became a", "I would like to become a", "when she becomes a") is not about a specific person's job.
  const JOB_BECAME_TRIGGERS = new Set(['became a ', 'became an ', 'became the ', 'becomes a ', 'becomes an ', 'becomes the ', 'becoming a ', 'becoming an ', 'becoming the ']);
  const JOB_HYPOTHETICAL_BEFORE_RE = /\b(?:if|would|could|might|should|wish|wishes|hope|hopes|want|wants|wanted|wanna|plan|plans|planning|dream|dreams|imagine|suppose|what if|how to|how do|how can|when|once|until|before|unless|whether)\b[^.?!;]*$/i;

  /**
   * Check if span appears in job context
   * Looks for job trigger phrases before the span
   * @param {boolean} [nonPossessiveOnly] Group 6: when true, the possessive triggers
   *   (my/your/their/her/his) are ignored, so only copular/role triggers count.
   * @private
   */
  function checkJobContext(text, actualSpan, nonPossessiveOnly) {
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
      'my ', 'your ', 'their ', 'her ', 'his ', 'our ',
      'be a ', 'become a ', 'hired as ',
      ...JOB_BECAME_TRIGGERS,
      "i'm a ", "i'm an ",                   // ★ FIX: Added "i'm an" variant
      "you're a ", "you're an ",             // ★ FIX: Added "you're an" variant
      "they're a ", "they're an ",           // ★ FIX: Added "they're an" variant
      "he's a ", "she's a ", "she's an "     // ★ FIX: Added he/she contractions
    ];
    
    // Group 5: a trigger must start at a word boundary (otherwise "his " matches
    // inside "this " and "my " inside "enemy ").
    return jobTriggers.some(trigger => {
      if (nonPossessiveOnly && JOB_POSSESSIVE_TRIGGERS.has(trigger)) return false;
      for (let i = before.indexOf(trigger); i !== -1; i = before.indexOf(trigger, i + 1)) {
        if (i !== 0 && /[a-z0-9]/.test(before[i - 1])) continue;
        // Group 5: the trigger must sit right before the title: at most 3 words
        // in between ("am a very experienced <title>"), not anywhere in the last 50 chars.
        const gap = before.slice(i + trigger.length).trim();
        if (/[.,;:!?]/.test(gap)) continue;                // punctuation breaks the link to the title
        if (JOB_BECAME_TRIGGERS.has(trigger) && JOB_HYPOTHETICAL_BEFORE_RE.test(before.slice(0, i))) continue;   // Group 16: hypothetical veto
        // Group 16: "our <title> policy / handbook / salary": the title is a modifier of a following common noun, not a person
        if (trigger === 'our ') {
          const nx = text.slice(index + actualSpan.length).match(/^\s+([a-z][a-z'-]*)/);
          if (nx && !JOB_FUNCTION_WORDS.has(nx[1]) && isolatedNameTags(nx[1]).includes('Noun')) continue;
        }
        if (gap === '' || gap.split(/\s+/).length <= 3) return true;
      }
      return false;
    });
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
  // ── Group 4: Unicode-aware name word ─────────────────────────────────────────
  // One Title-Case name word: a capital + at least one lowercase letter + any letters/combining marks, optionally with an
  // "O'" / "D'" prefix, hyphen joins (Santos-Lim, Pena-Munoz) and apostrophe joins before a capital (O'Brien). A possessive
  // "'s" is NOT part of the word. The old [A-Z][a-z]+ cut "Pena" at the n-tilde and "McDonald" at the second capital.
  const NAME_WORD = String.raw`(?:\p{Lu}['’])?\p{Lu}\p{Ll}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*|['’]\p{Lu}[\p{L}\p{M}]*)*`;
  // not in the middle of a word: no letter/digit right before, and no "letter + apostrophe/hyphen" right before ("O'Brien" -> not "Brien"),
  // but an opening quote ('Maria Santos) is fine
  const NAME_LB = String.raw`(?<![\p{L}\p{M}\d_])(?<![\p{L}\p{M}]['’-])`;
  const NAME_RB = String.raw`(?![\p{L}\p{M}\d_])`;
  // Group 4 (stage b): a name RUN is up to six name words. Between words an optional single-letter initial ("S. ") and ONE lowercase
  // or Title-case surname particle sequence (dela, de la, de los, van der, y ...) are allowed; the run may start with initials or
  // "Ma." and end with a Roman-numeral suffix (III). "Jr"/"Sr" are ordinary name words, and their period stays outside the span.
  const NAME_PART_SEQ = String.raw`(?:de\s+la|de\s+los|de\s+las|van\s+der|van\s+den|von\s+der|dela|del|de|van|von|bin|al|el|y|di|da|le|du|der|den|la)`;
  const NAME_JOIN = String.raw`\s+(?:\p{Lu}\.\s+)?(?:${NAME_PART_SEQ}\s+)?${NAME_WORD}`;
  const NAME_LEAD = String.raw`(?:(?:\p{Lu}\.\s+){1,3}|Ma\.\s+)`;
  const NAME_TAIL = String.raw`(?:\s+(?:III|II|IV)${NAME_RB})?`;
  const NAME_RUN1 = String.raw`${NAME_LEAD}?${NAME_WORD}(?:${NAME_JOIN}){0,14}${NAME_TAIL}`;                                   // 1+ words
  const NAME_RUN2 = String.raw`(?:${NAME_LEAD}${NAME_WORD}(?:${NAME_JOIN}){0,14}|${NAME_WORD}(?:${NAME_JOIN}){1,14})${NAME_TAIL}`;  // 2+ tokens
  const HONORIFICS = new RegExp(String.raw`${NAME_LB}(Mr|Ms|Mrs|Miss|Mx|Sir|Madam|Dr|Prof|Professor|Rev|Reverend|Fr|Father|Sr|Esq|Eng|Engr)\.?\s+(${NAME_RUN1})${NAME_RB}`, 'gu');

  // Tags that make a capitalised word a sentence-opener rather than part of a name ("If Maria Santos calls", "Hello Maria Santos").
  const RUN_LEAD_STRIP_TAGS = ['Conjunction', 'Preposition', 'Determiner', 'QuestionWord', 'Adverb', 'Expression'];
  const RUN_PARTICLE_WORDS = new Set(['de', 'del', 'dela', 'la', 'los', 'las', 'van', 'von', 'bin', 'al', 'el', 'y', 'di', 'da', 'le', 'du', 'der', 'den']);

  // Org/person decision for a METHOD 4 name run. classifyNameVsOrganization() counts every token, so a name with particles,
  // initials or a suffix, or any run of 4+ words, was always "organization", and "Co" always counted as a company suffix.
  // Here: (1) particles, initials and Roman suffixes are not counted; (2) a trailing "Co" is a company suffix only when followed by
  // a period or when no other word of the run can be a person's name (Compromise tags no other word as a Person);
  // (3) 4+ counted words are a person only if no word is an organization head word AND some word carries a Person tag.
  // Anything the rule does not accept falls back to the old classifier.
  const RUN_ORG_HEAD_WORDS = new Set([
    'inc', 'corp', 'co', 'ltd', 'llc', 'llp', 'gmbh', 'department', 'dept', 'division', 'unit', 'group', 'team', 'bureau', 'agency',
    'administration', 'institute', 'university', 'college', 'school', 'academy', 'hospital', 'clinic', 'bank', 'fund', 'association',
    'society', 'enterprises', 'enterprise', 'organization', 'org', 'council', 'committee', 'board', 'foundation', 'cooperative',
    'ministry', 'office', 'authority', 'center', 'centre', 'service', 'services', 'network', 'systems', 'holdings', 'ventures',
    'solutions', 'company', 'corporation'
  ]);
  // Group 4c: the safer corporate words added to the structural organization pass (common-noun suffixes are left for Group 7)
  const RUN_NEW_SUFFIX_WORDS = new Set(['holdings', 'enterprises', 'industries', 'ventures', 'pharmaceuticals', 'airlines', 'motors']);
  function classifyPersonRun(candidate, textAfter) {
    const toks = candidate.split(/\s+/);
    let core = toks.filter(t => !RUN_PARTICLE_WORDS.has(t.toLowerCase()) && !/^\p{Lu}\.$/u.test(t) && !/^(?:III|II|IV)$/.test(t));
    const personTagged = ws => ws.some(w => nameHasPersonTag(isolatedNameTags(w)));
    // "<Name> Industries": a run that ends in one of the corporate words is an organization, not a person
    if (core.length >= 2 && RUN_NEW_SUFFIX_WORDS.has(core[core.length - 1].toLowerCase())) return 'organization';
    if (core.length >= 2 && core[core.length - 1] === 'Co' && !/^\s*\./.test(textAfter || '') && personTagged(core.slice(0, -1))) {
      core = core.slice(0, -1);   // "Anna Marie Co": the surname Co
    }
    if (core.length >= 4) {
      if (core.some(w => RUN_ORG_HEAD_WORDS.has(w.toLowerCase().replace(/[.,]$/, '')))) return 'organization';
      return personTagged(core) || toks.length > core.length ? 'name' : 'organization';
    }
    return classifyNameVsOrganization(core.join(' '));
  }

  // ── Stage f / g: list of single names, and lowercase self-introductions ─────────────────────────────────────────────────────────
  // Both are switchable. Each is kept only if it gave 0 false positives on its benign set (test-group4-names.js sections BL / BS).
  const PERSON_LIST_ENABLED = true;
  const PERSON_LOWERCASE_INTRO_ENABLED = true;

  // ═══════════════════════════════════════════════════════════════════════
  // CAUSE B: METHOD 4 (a standalone 2-3 word Title Case phrase, no trigger phrase) needs NAME EVIDENCE.
  // Without it every Title Case phrase that is not an organization or place became a person ("Cell Cycle", "Mango Float", "Worksheet Instructions").
  // Evidence (any one):
  //   (a) a word is a dictionary given name / surname, or Compromise tags it as a person;
  //   (b) a cue next to the phrase: a person-directed verb before it (thank, ask, tell, call, contact, email, meet, remind, invite), "named",
  //       "name is", dear / hi / hello / hey, "this is", "it's", "I'm", "I am", an honorific, or a verb of speech / work right after it
  //       ("said", "works"), or an appositive ", a / an / the ...". A bare preposition (to, for, with, from, by) is NOT a cue
  //       (G_B_PREP_CUES switches it on for measurement only);
  //   (c) initials followed by a surname ("J. P. Rizal-Alonso").
  // The gate is active only when the name dictionary is loaded (NAMES_DICT_AVAILABLE); without it METHOD 4 behaves as before.
  // ═══════════════════════════════════════════════════════════════════════
  const G_B_PREP_CUES = false;
  const G_B_BEFORE_CUE_RE = /(?:\b(?:named|called|name\s+is|name['’]s|dear|hi|hello|hey|greetings|this\s+is|it['’]s|i['’]m|i\s+am|call\s+me|attn:?|attention:?|cc:?|regards,?|sincerely,?|thanks,?|cheers,?|(?:mr|mrs|ms|miss|mx|dr|prof|atty|engr|sir|madam)\.?)\s+)$/i;
  const G_B_PREP_CUE_RE = /\b(?:to|for|with|from|by)\s+$/i;
  const G_B_AFTER_CUE_RE = /^\s*,?\s*(?:said|says|told|asked|asks|works?|worked|replied|wrote|writes|called|speaking)\b/i;
  const G_B_FIRST_WORD_CUES = new Set(['dear', 'hi', 'hello', 'hey', 'greetings', 'thanks', 'cheers', 'regards', 'sincerely']);
  function standaloneHasNameEvidence(text, start, candidate) {
    const words = candidate.split(/\s+/);
    if (words.some(w => isKnownNameWord(w) || nameHasPersonTag(isolatedNameTags(w)))) return true;                          // (a)
    if (/^(?:\p{Lu}\.\s*)+\p{Lu}/u.test(candidate)) return true;                                                             // (c)
    // normalizePath_C may have put a period before the capital ("ask. Chidinma Okoro"); it is not a sentence end for this purpose
    const before = text.slice(Math.max(0, start - 50), start).replace(/\.?\s*$/, ' '), after = text.slice(start + candidate.length, start + candidate.length + 40);
    if (G_B_FIRST_WORD_CUES.has(words[0].toLowerCase()) || LEAD_PERSON_VERBS.has(words[0].toLowerCase())) return true;       // the cue word is inside the run
    if (G_B_BEFORE_CUE_RE.test(before) || PERSON_DIRECTED_BEFORE_RE.test(before)) return true;                               // (b) before
    if (G_B_PREP_CUES && G_B_PREP_CUE_RE.test(before)) return true;
    if (G_B_AFTER_CUE_RE.test(after) || /^\s*,\s*(?:an?|the)\s/i.test(after)) return true;                                   // (b) after
    return false;
  }

  // A word that is evidently NOT a bare name: non-name list, closed class, dictionary job title, digit, or a word Compromise tags
  // as ordinary (verb, adjective, adverb...). Used only for words that carry no Person tag.
  function isOrdinaryNonNameWord(w) {
    const lw = w.toLowerCase(), tg = isolatedNameTags(w);
    return /\d/.test(w) || NON_NAME_WORDS.has(lw) || INTERNAL_FUNCTION_WORDS.has(lw) || LEAD_PERSON_VERBS.has(lw) || EXTENSIVE_JOB_TITLES.has(lw) ||
      tg.some(t => COMMON_WORD_TAGS.includes(t) || NAME_CLOSED_TAGS.includes(t));
  }
  function isPlaceOrOrgWord(w) {
    const lw = w.toLowerCase();
    return isKnownPlaceWord(w) || EXTENSIVE_ORGANIZATIONS.has(lw);
  }

  // Stage f. "Ana, Ben, Carla and Dan": three or more single Title-Case words separated by commas / "and". The list is a list of
  // people only when at least half of its items carry a Compromise Person tag; the other items must then be neither ordinary words,
  // places, organizations nor job titles. A list item glued to a neighbouring Title-Case word ("Ana Cruz, Ben, Carla") is dropped.
  function extractNameLists(text, findings) {
    const W = NAME_WORD;
    const re = new RegExp(`${NAME_LB}(${W}(?:\\s*,\\s*${W}){1,12}(?:,?\\s+(?:and|&)\\s+${W})?)${NAME_RB}`, 'gu');
    let m;
    while ((m = re.exec(text)) !== null) {
      let items = m[1].split(/\s*,\s*(?:and\s+|&\s+)?|\s+(?:and|&)\s+/).filter(Boolean);
      let start = m.index;
      if (/\p{Lu}[\p{L}\p{M}'’-]*\s+$/u.test(text.slice(Math.max(0, start - 40), start))) { start += items[0].length; items = items.slice(1); }
      if (/^\s+\p{Lu}[\p{L}\p{M}]/u.test(text.slice(m.index + m[1].length, m.index + m[1].length + 3)) && items.length) items = items.slice(0, -1);
      if (items.length < 3) continue;
      const tagged = items.filter(w => nameHasPersonTag(isolatedNameTags(w)));
      if (tagged.length * 2 <= items.length) continue;   // Group 8b: a STRICT majority of the items must be anchored ("Alpha, Bravo, Charlie and Delta" has 2 of 4)
      for (const w of items) {
        if (!nameHasPersonTag(isolatedNameTags(w)) && (isOrdinaryNonNameWord(w) || isPlaceOrOrgWord(w))) continue;
        if (findings.some(f => f.rawMatch && f.rawMatch.toLowerCase() === w.toLowerCase())) continue;
        findings.push({ patternId: 'nlp_person_name', label: 'Person Name (List)', risk: 'low', rawMatch: w, safeVersion: '[NAME REDACTED]', source: 'C_linguistic', extractionMethod: 'name_list' });
      }
    }
  }

  // Stage g. Lowercase names right after a self-introduction ("my name is carlo mendoza", "im rowena dizon"). Strictest forms only:
  //   "my name is" + 1-2 lowercase words that are not ordinary words; "im / i'm / i am / call me" need TWO lowercase words, the first with a
  //   Person tag and the second not an ordinary word, so "im sorry", "i am from ...", "im a student", "i am 22 years old" never qualify.
  function extractLowercaseSelfIntros(text, findings) {
    const LW = String.raw`\p{Ll}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*)*`;
    const END = String.raw`(?![\p{L}\p{M}\d_'’])`;
    const pats = [
      { re: new RegExp(String.raw`\b[Mm]y\s+name\s+is\s+(${LW})(?:\s+(${LW}))?${END}`, 'gu'), strict: false },
      { re: new RegExp(String.raw`\b(?:[Ii]m|[Ii]['’]m|[Ii]\s+am|[Cc]all\s+me)\s+(${LW})(?:\s+(${LW}))?${END}`, 'gu'), strict: true },
    ];
    for (const { re, strict } of pats) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const t1 = m[1], t2 = m[2];
        const ok1 = nameHasPersonTag(isolatedNameTags(t1)) || (!strict && !isOrdinaryNonNameWord(t1) && !isPlaceOrOrgWord(t1));
        if (!ok1) continue;
        const ok2 = t2 && !isOrdinaryNonNameWord(t2) && !isPlaceOrOrgWord(t2) && t2.length >= 2;
        if (strict && !ok2) continue;
        const name = ok2 ? `${t1} ${t2}` : t1;
        if (name.length < 2 || shouldFilterCommonName(name)) continue;
        if (findings.some(f => f.rawMatch && f.rawMatch.toLowerCase() === name.toLowerCase())) continue;
        findings.push({ patternId: 'nlp_person_name', label: 'Person Name (Lowercase intro)', risk: 'low', rawMatch: name, safeVersion: '[NAME REDACTED]', source: 'C_linguistic', extractionMethod: 'lowercase_self_intro' });
      }
    }
  }

  // Group 4c: the "y" rule for findings made by ANY method (METHOD 3 subject pattern, trigger phrases...). A person finding that contains a
  // standalone "y" is split there unless it is a compound surname: 2+ name words on the left and exactly one word on the right.
  // Single-word pieces are kept only when every piece carries a Person tag ("Maria y Jose").
  function splitPersonFindingsAtY(findings) {
    const out = [];
    for (const f of findings) {
      if (f.patternId !== 'nlp_person_name' || !f.rawMatch || !/\sy\s/.test(f.rawMatch)) { out.push(f); continue; }
      const toks = f.rawMatch.split(/\s+/), segs = []; let cur = [];
      for (let i = 0; i < toks.length; i++) {
        if (toks[i] === 'y' && cur.length) {
          const j = toks.indexOf('y', i + 1), right = toks.slice(i + 1, j < 0 ? toks.length : j);
          const lw = cur.filter(t => !RUN_PARTICLE_WORDS.has(t.toLowerCase())).length, rw = right.filter(t => !RUN_PARTICLE_WORDS.has(t.toLowerCase())).length;
          if (!(lw >= 2 && rw === 1)) { segs.push(cur); cur = []; continue; }
        }
        cur.push(toks[i]);
      }
      if (cur.length) segs.push(cur);
      if (segs.length < 2) { out.push(f); continue; }
      const singleOk = segs.every(sg => sg.length === 1 && nameHasPersonTag(isolatedNameTags(sg[0])));
      for (const sg of segs) {
        if (sg.length < 2 && !singleOk) continue;
        const txt = sg.join(' ');
        if (!out.some(o => o.rawMatch && o.rawMatch.toLowerCase() === txt.toLowerCase())) out.push(Object.assign({}, f, { rawMatch: txt }));
      }
    }
    findings.length = 0; findings.push(...out);
  }

  // Stage d (mirror rule): a job span must start where the person span ends. The title extension (D10) can absorb the Title-Case words
  // in front of a title ("Hilario Ferrer Regional Manager" -> one nlp_job_title). When a person finding is a proper prefix of such a
  // job finding and the remainder is a dictionary title (or ends in one), the job is re-bounded to the remainder.
  function trimJobSpansOverNames(findings) {
    const persons = findings.filter(f => f.patternId === 'nlp_person_name' && f.rawMatch);
    if (!persons.length) return;
    findings.forEach(j => {
      if (j.patternId !== 'nlp_job_title' || !j.rawMatch) return;
      const jl = j.rawMatch.toLowerCase();
      for (const p of persons) {
        const pl = p.rawMatch.trim().toLowerCase();
        if (jl.length > pl.length + 1 && jl.startsWith(pl + ' ')) {
          const rest = j.rawMatch.slice(pl.length + 1).trim();
          if (EXTENSIVE_JOB_TITLES.has(rest.toLowerCase()) || EXTENSIVE_JOB_TITLES.has(rest.split(/\s+/).pop().toLowerCase())) { j.rawMatch = rest; break; }
        }
      }
    });
  }

  // Stage e: a token that cannot be part of a person name inside a Title-Case-only prompt: a known non-name word, a person-directed
  // verb, a function word, an honorific, a dictionary job title, or a word Compromise tags as ordinary/closed-class WITHOUT a Person tag.
  // Unknown words (Compromise tags them Noun/Singular only) are NOT splitters, so unfamiliar surnames stay inside the name.
  function isTitleRunSplitter(tok) {
    const w = tok.replace(/[.,;:!?]+$/, ''), lw = w.toLowerCase();
    if (!/^\p{Lu}\p{Ll}/u.test(w) || RUN_PARTICLE_WORDS.has(lw)) return false;
    const tg = isolatedNameTags(w);
    if (nameHasPersonTag(tg)) return false;
    return NON_NAME_WORDS.has(lw) || LEAD_PERSON_VERBS.has(lw) || INTERNAL_FUNCTION_WORDS.has(lw) || NAME_HONORIFIC_TOKENS.has(lw) ||
      EXTENSIVE_JOB_TITLES.has(lw) || tg.some(t => COMMON_WORD_TAGS.includes(t) || NAME_CLOSED_TAGS.includes(t));
  }
  // Split a captured run at its splitter tokens; returns [{run, index}] pieces of 2+ tokens, or null when nothing was split.
  // keepFirst: the first token is never a split point (sentence-case runs: a leading title/verb/honorific is stripped, with re-bounding,
  // by the Group 3 pass, as before: "Engineer John Paul Tolentino").
  function splitTitleRun(run, startIndex, keepFirst) {
    const re = /\S+/g; const toks = []; let m;
    while ((m = re.exec(run)) !== null) toks.push({ w: m[0], s: m.index, e: m.index + m[0].length, cut: !(keepFirst && !toks.length) && isTitleRunSplitter(m[0]) });
    if (!toks.some(t => t.cut)) return null;
    const pieces = []; let cur = [];
    const flush = () => { if (cur.length >= 2) pieces.push({ run: run.slice(cur[0].s, cur[cur.length - 1].e), index: startIndex + cur[0].s }); cur = []; };
    for (const t of toks) { if (t.cut) flush(); else cur.push(t); }
    flush();
    return pieces;
  }

  // Iterator over name runs in `text`, with the same exec() shape as a global RegExp (result[1] = run, result.index = start).
  // Two clean-ups the regex cannot express: (1) a single leading initial that follows a lowercase word is a sentence end or an
  // ordinary letter ("plan B. Maria Santos"), not part of the name; (2) when 3+ tokens are captured, leading sentence-opener words
  // (conjunction, preposition, determiner, question word, adverb, expression, with no Person tag) are not part of the name.
  function nameRunMatcher(text, runSrc) {
    const re = new RegExp(`${NAME_LB}(${runSrc})${NAME_RB}`, 'gu');
    const queue = [];   // pieces of a run that was split (stage e)
    const emit = (piece, index) => { const o = [piece, piece]; o.index = index; return o; };
    return {
      exec() {
        if (queue.length) { const q = queue.shift(); return emit(q.run, q.index); }
        for (;;) {
          const m = re.exec(text);
          if (!m) return null;
          let s = m.index, run = m[1];
          const lead = run.match(/^((?:\p{Lu}\.\s+)+)/u);
          if (lead && (lead[1].match(/\./g) || []).length === 1 && /\p{Ll}\s+$/u.test(text.slice(0, s))) { s += lead[1].length; run = run.slice(lead[1].length); }
          let toks = run.split(/\s+/);
          while (toks.length >= 3 && /^\p{Lu}\p{Ll}/u.test(toks[0]) && !RUN_PARTICLE_WORDS.has(toks[0].toLowerCase())) {
            const tg = isolatedNameTags(toks[0]);
            if (!tg.some(t => RUN_LEAD_STRIP_TAGS.includes(t)) || nameHasPersonTag(tg)) break;
            const cut = run.indexOf(toks[0]) + toks[0].length;
            const ws = run.slice(cut).match(/^\s+/)[0].length;
            s += cut + ws; run = run.slice(cut + ws); toks = run.split(/\s+/);
          }
          // Stage e: a Title-Case-only passage ("Draft An Email For Ana Cruz About The Plan") shows itself by capitalised function words
          // INSIDE the run (in sentence case "An"/"For" are never capitalised mid-phrase) or by a surrounding run of Title-Case words.
          // The whole run is split at the words that cannot be part of a name (isTitleRunSplitter) and each piece of 2+ tokens is offered
          // as a candidate. The Group 3 heading guard (R6) is the anchor test: a piece survives only with a strong cue or when half its
          // tokens carry a Person tag. Otherwise a run longer than six tokens is cut into a six-token name and the rest.
          const styled = toks.length >= 3 && (toks.slice(1).some(t => INTERNAL_FUNCTION_WORDS.has(t.toLowerCase())) || inTitleCaseRun(text, s, s + run.length));
          if (styled) {
            const pieces = splitTitleRun(run, s);
            if (pieces) { queue.push(...pieces); if (queue.length) { const q = queue.shift(); return emit(q.run, q.index); } continue; }
          } else if (toks.length >= 4 && splitTitleRun(run, s, true)) {
            // a 4+ token run in ordinary sentence case that contains words which cannot be part of a name ("Ana Cruz Tarlac State University",
            // "Alvin Dela Rosa Senior Accountant") is split the same way; shorter runs keep the old reject-the-whole-candidate behaviour.
            queue.push(...splitTitleRun(run, s, true)); if (queue.length) { const q = queue.shift(); return emit(q.run, q.index); } continue;
          } else if (toks.filter(t => !RUN_PARTICLE_WORDS.has(t.toLowerCase())).length > 6) {
            // cap: six name words (particles such as "y" or "dela" do not count); the rest is its own candidate
            let cnt = 0, idx = toks.length;
            for (let i = 0; i < toks.length; i++) { if (!RUN_PARTICLE_WORDS.has(toks[i].toLowerCase()) && ++cnt > 6) { idx = i; break; } }
            while (idx > 0 && RUN_PARTICLE_WORDS.has(toks[idx - 1].toLowerCase())) idx--;
            const first = toks.slice(0, idx).join(' '), rest = toks.slice(idx);
            if (rest.length >= 2) queue.push({ run: rest.join(' '), index: s + first.length + 1 });
            run = first; toks = toks.slice(0, idx);
          }
          // Stage d: a person span stops where a job title begins. A trailing dictionary job title (1-3 words) is cut off together with
          // the ordinary-word modifiers directly before it ("Regional", "Branch"), when at least two name tokens remain, the title word
          // is not itself a Person word (Baker, Taylor), and no person cue (honorific, "my name is") sits in front of the run.
          if (toks.length >= 3 && !hasPersonCueAround(text, s, s + run.length)) {
            const plain = toks.map(t => t.replace(/[.,]$/, ''));
            let cutAt = -1;
            for (let n = Math.min(3, plain.length - 2); n >= 1 && cutAt < 0; n--) {
              const win = plain.slice(plain.length - n).join(' ').toLowerCase();
              if (EXTENSIVE_JOB_TITLES.has(win) && !(n === 1 && nameHasPersonTag(isolatedNameTags(plain[plain.length - 1])))) cutAt = plain.length - n;
            }
            if (cutAt >= 2) {
              while (cutAt - 1 >= 2) {
                const pw = plain[cutAt - 1], pt = isolatedNameTags(pw);
                if (TITLE_LEVEL_WORDS.has(pw.toLowerCase()) || (pt.some(t => COMMON_WORD_TAGS.includes(t)) && !nameHasPersonTag(pt))) cutAt--; else break;
              }
              run = toks.slice(0, cutAt).join(' '); toks = toks.slice(0, cutAt);
            }
          }
          // Group 4c: the Spanish/Filipino "y" joins ONE name ("Jose Rizal y Mercado": 2+ name words on the left, a single word on
          // the right). Any other use is a conjunction between two people ("Ana Santos y Ben Cruz", "Maria y Jose"): split there.
          if (toks.includes('y') && toks.indexOf('y') > 0) {
            const segs = []; let cur = [];
            for (let i = 0; i < toks.length; i++) {
              if (toks[i] === 'y' && cur.length) {
                const j = toks.indexOf('y', i + 1), right = toks.slice(i + 1, j < 0 ? toks.length : j);
                const leftWords = cur.filter(t => !RUN_PARTICLE_WORDS.has(t.toLowerCase())).length;
                const rightWords = right.filter(t => !RUN_PARTICLE_WORDS.has(t.toLowerCase())).length;
                if (!(leftWords >= 2 && rightWords === 1)) { segs.push(cur); cur = []; continue; }
              }
              cur.push(toks[i]);
            }
            if (cur.length) segs.push(cur);
            if (segs.length > 1) {
              // "Maria y Jose": two single names are kept only when each carries a Person tag (same anchor as the list rule)
              const singleOk = segs.every(sg => sg.length === 1 && nameHasPersonTag(isolatedNameTags(sg[0])));
              let pos = s;
              for (const sg of segs) {
                const txt = sg.join(' ');
                // the 'y' that separated two segments was consumed: advance past it
                const at = text.indexOf(txt, pos);
                if (at >= 0) { if (sg.length >= 2 || runSrc !== NAME_RUN2 || singleOk) queue.push({ run: txt, index: at }); pos = at + txt.length; }
              }
              if (queue.length) { const q = queue.shift(); return emit(q.run, q.index); }
              continue;
            }
          }
          if (toks.length < 2 && runSrc === NAME_RUN2) continue;
          return emit(run, s);
        }
      }
    };
  }

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
      // Group 4: "Sr" after a full name ("Orlando Villacorta Sr. Went home") is the generational suffix, not the honorific "Sr." (Sister).
      if (/^(?:Sr|Esq)$/.test(honorific) && /\p{Lu}[\p{L}\p{M}'’-]*\s+\p{Lu}[\p{L}\p{M}'’-]*\s+$/u.test(text.slice(Math.max(0, match.index - 60), match.index))) continue;
      
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
    return COMMON_FIRST_NAMES.has(firstWord) || PLACEHOLDER_FULL_NAMES.has(lower.replace(/\s+/g, ' '));
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
    // D5 FIX: For org names that end in a non-word character (e.g. a trailing
    // period in "SGV & Co."), the trailing \b requires the next character to be
    // a word character, which fails when the org is followed by whitespace or
    // end-of-string.  Replace the trailing \b with a lookahead that accepts
    // whitespace, end-of-string, or common punctuation — while keeping the
    // leading \b so we still require a word boundary at the start.
    console.debug(`[PATH_C/CSV_ORG] PASS 1: Testing ${EXTENSIVE_ORGANIZATIONS_ARRAY.length} organizations for exact match`);
    const _om = p1Meta(EXTENSIVE_ORGANIZATIONS_ARRAY, true);
    for (let oi = 0; oi < EXTENSIVE_ORGANIZATIONS_ARRAY.length; oi++) {
      const org = EXTENSIVE_ORGANIZATIONS_ARRAY[oi];
      const orgLower = _om.lower[oi];
      if (_om.ascii[oi] === 1 && textLower.indexOf(orgLower) === -1) continue;   // O1: provably no match
      const escaped = escapeRegex(orgLower);
      // Use a trailing lookahead instead of \b when the org name ends in a
      // non-word character (e.g. "Inc." ends with ".").
      const endsInNonWord = /\W$/.test(orgLower);
      const trailingBoundary = endsInNonWord ? '(?=[\\s,;:.!?\'"\\)]|$)' : '\\b';
      const pattern = new RegExp(`\\b${escaped}${trailingBoundary}`, 'gi');
      
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
      if (org.length > 5 && fuzzyOrgEntryEligible(org)) {  // Only fuzzy match longer orgs (avoid noise); Group 10: and only multi-word entries
        const fuzzyMatches = fuzzyFind(text, org, 2).filter(m => narrowFuzzyOrgMatch(m, org));
        
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
    // Group 10: REMOVED. The keyword-proximity pass flagged an organization when 60% of its keywords (words longer than 3 letters) appeared
    // within 5 words of each other, in any order. On the 161 test rows it produced no final finding, and it generated candidates such as
    // "DBS Bank", "AMA University", "Best Buy" or "Van Travel Pte Ltd" from ordinary sentences. It also cost a second text split per hit.
    // Reversed-order mentions ("Santo Tomas University" for "University of Santo Tomas") are therefore no longer matched.

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
  // Group 6 (D11): minimum dictionary-title length (letters, spaces included) for fuzzy job matching.
  // Chosen as the lowest N (tested 6,7,8,9 on 14,691 ordinary words) with no ordinary-word false positive.
  const FUZZY_JOB_MIN_TITLE_LEN = 9;

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
    const _jm = p1Meta(EXTENSIVE_JOB_TITLES_ARRAY, false);
    for (let ji = 0; ji < EXTENSIVE_JOB_TITLES_ARRAY.length; ji++) {
      const title = EXTENSIVE_JOB_TITLES_ARRAY[ji];
      if (_jm.ascii[ji] === 1 && textLower.indexOf(_jm.lower[ji]) === -1) continue;   // O1: provably no match
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
    // PASS 2p (Group 17, cause E): plural of a dictionary title ("welders", "call center agents", "secretaries")
    // The last word is a regular plural (-s, -es, -ies) and the singular phrase is a dictionary title. The same validation as for the
    // singular follows, except that the "multi-word title" cue never applies to a plural (see validateJobTitlesWithCompromise).
    // ────────────────────────────────────────────────────────────────────────
    {
      const wordRe = /[A-Za-z][A-Za-z'’-]*/g, ws = [];
      let wm;
      while ((wm = wordRe.exec(text)) !== null) ws.push([wm.index, wm.index + wm[0].length]);
      for (let wi = 0; wi < ws.length; wi++) {
        const last = text.slice(ws[wi][0], ws[wi][1]), ll = last.toLowerCase();
        if (ll.length < 4 || ll[ll.length - 1] !== 's') continue;
        const sing = [ll.slice(0, -1)];
        if (/(?:[sxz]|ch|sh)es$/.test(ll)) sing.push(ll.slice(0, -2));
        if (/ies$/.test(ll)) sing.push(ll.slice(0, -3) + 'y');
        for (let n = 0; n <= 2 && wi - n >= 0; n++) {       // 0-2 words in front of the plural head
          if (n > 0 && text.slice(ws[wi - n][1], ws[wi - n + 1][0]) !== ' ') break;            // words must be separated by one space
          const prefix = n > 0 ? text.slice(ws[wi - n][0], ws[wi][0]).toLowerCase() : '';
          const plural = n > 0 ? text.slice(ws[wi - n][0], ws[wi][1]) : last;
          if (EXTENSIVE_JOB_TITLES.has(plural.toLowerCase())) continue;                  // the plural form is itself a title: PASS 1 has it
          if (sing.some(sg => EXTENSIVE_JOB_TITLES.has(prefix + sg)) && !seen.has(plural.toLowerCase())) {
            seen.add(plural.toLowerCase());
            found.push({ name: plural, rawMatch: plural, confidence: 'high', source: 'csv_exact_match', csvValidated: true, plural: true });
            console.debug(`[PATH_C/CSV_JOB] Pass 2p (plural): found "${plural}"`);
          }
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PASS 3: Fuzzy match (1 character difference, handles typos)
    // ────────────────────────────────────────────────────────────────────────
    // ★ CRITICAL FIX: Prevent short words from fuzzy-matching to job titles
    // Only match if matched text is > 5 chars and reasonably sized relative to title
    // Group 6 (D11): typo tolerance only for titles of FUZZY_JOB_MIN_TITLE_LEN+ letters, and only
    // when the first AND last letter of the text and of the title are equal (so an end-of-word
    // change such as scheduler/servicer/helper/handler is never treated as a typo).
    for (const title of EXTENSIVE_JOB_TITLES_ARRAY) {
      if (title.length >= FUZZY_JOB_MIN_TITLE_LEN) {  // Only fuzzy match longer titles
        const fuzzyMatches = fuzzyFind(text, title, 1, true);   // O5: the first/last-letter rule below is applied inside fuzzyFind
        const titleLower = title.toLowerCase();

        for (const match of fuzzyMatches) {
          if (match[0] !== titleLower[0] || match[match.length - 1] !== titleLower[titleLower.length - 1]) {
            console.debug(`[PATH_C/CSV_JOB] Pass 3 (fuzzy): SKIP - first/last letter differs: "${match}" vs "${title}"`);
            continue;
          }
          // Group 12b: the first/last-letter rule above looks only at the ends of the whole phrase. In a multi-word match the same rule
          // is applied to every word (an end-of-word change inside "change person" -> "changed person" is a different word, not a typo).
          // Phrases with a different word count (a space typo such as "bar tender") keep the old behaviour.
          {
            const mw = match.split(/\s+/), tw = titleLower.split(/\s+/);
            if (tw.length > 1 && mw.length === tw.length &&
                mw.some((w, k) => w[0] !== tw[k][0] || w[w.length - 1] !== tw[k][tw[k].length - 1])) {
              console.debug(`[PATH_C/CSV_JOB] Pass 3 (fuzzy): SKIP - word ends differ: "${match}" vs "${title}"`);
              continue;
            }
          }
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
  // ── Group 5: structural job-title cues (D9) and head-noun extension (D10) ──

  // Closed-class words that can never be part of a job-title modifier phrase.
  const JOB_MOD_STOP = new Set((
    'a an the this that these those my your our their his her its i we you he she they it who whom whose which what ' +
    'and or but nor of in on at for to from by with as into onto over under about after before between through ' +
    'is are was were be been being am do does did has have had will would can could should may might must shall ' +
    'not no yes new good best great old other more most very just also only some any each every all both many much few ' +
    'than then so if when while because since although'
  ).split(' '));
  // Closed set of qualification / seniority / status adjectives that commonly
  // prefix a job head noun (adjectives in general are NOT accepted: "good", "new").
  const JOB_MOD_ADJ = new Set((
    'senior junior chief head lead assistant associate deputy acting interim registered certified licensed ' +
    'public private civil virtual online general executive staff resident visiting part-time full-time ' +
    'freelance independent professional sworn charge'
  ).split(' '));
  // Group 6: closed-class (function) words. A capitalised function word at a sentence start
  // ("The", "He", "In", "And", "Please") carries no evidence of being part of a person's name.
  const JOB_FUNCTION_WORDS = new Set((
    // determiners / quantifiers
    'the a an this that these those my your his her its our their some any each every all both no another such several many much few more most other ' +
    // pronouns / wh-words
    'i me he him she it we us you they them who whom whose which what whatever whoever myself yourself himself herself itself ourselves themselves one ' +
    // conjunctions
    'and or but nor so yet for if because although though while when whenever whereas unless until since once than whether ' +
    // prepositions
    'of in on at to from by with as into onto over under about after before between through during without within across against among around behind beside beyond despite down except inside near off out outside past per toward towards upon via ' +
    // auxiliaries / modals / copulas
    'is are was were be been being am do does did has have had will would can could should may might must shall ' +
    // adverbs / discourse words
    'then there here also just only not now please thanks thank yes how why where however therefore thus still even too very really already again ever never always often sometimes ' +
    'hello hi hey dear good'
  ).split(' '));
  const JOB_NOT_NAME_START = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/;

  /** All whole-word, case-insensitive occurrences of span in text as [start,end]. */
  function jobOccurrences(text, span) {
    const out = [], hay = text.toLowerCase(), n = span.toLowerCase();
    if (!n) return out;
    for (let i = hay.indexOf(n); i !== -1; i = hay.indexOf(n, i + 1)) {
      const b = i === 0 ? ' ' : hay[i - 1], a = i + n.length >= hay.length ? ' ' : hay[i + n.length];
      if (!/[\p{L}\p{M}\d]/u.test(b) && !/[\p{L}\p{M}\d]/u.test(a)) out.push([i, i + n.length]);
    }
    return out;
  }

  /**
   * D9: does this occurrence of a dictionary title show a STRUCTURAL sign that
   * it describes a person's job (as opposed to a common noun)?  Cues:
   *   1. multi-word title (specific enough on its own)
   *   2. a job label right before it ("job:", "position -", "role =")
   *   3. "as / hired as / promoted to [a|the]" right before it
   *   4. followed by "at|of|for|with|under|from [the] Capitalized" (an employer)
   *   5. directly followed by a full capitalised name ("Title First Last")
   *   6. directly after "First Last," (appositive), optionally with a/an/the
   *   7. next to a list/résumé delimiter ("|", "•")
   */
  // Group 16: a run of Title Case tokens that can be a person's name: no function words, no dictionary job title, at least one anchored
  // given name or surname (Compromise Person tag or the names dictionary), and at least two tokens unless the single token is an anchored name.
  function looksLikePersonNameRun(tokens) {
    const toks = tokens.map(t => t.replace(/[.,]$/, '')).filter(Boolean);
    if (!toks.length || toks.length > 4) return false;
    if (toks.some(t => JOB_FUNCTION_WORDS.has(t.toLowerCase()) || EXTENSIVE_JOB_TITLES.has(t.toLowerCase()))) return false;
    const anchored = toks.filter(t => isKnownNameWord(t) || nameHasPersonTag(isolatedNameTags(t)));
    return toks.length >= 2 ? anchored.length >= 1 : anchored.length === 1;
  }
  const JOB_OBJECT_ROLE_BEFORE_AS_RE = /\b(?:us(?:e|es|ed|ing)|design(?:ed|s|ing)?|intend(?:ed|s)?|meant|treat(?:ed|s|ing)?|regard(?:ed|s|ing)?|consider(?:ed|s|ing)?|view(?:ed|s|ing)?|seen|describ(?:ed|es|ing))\b(?:\s+[\w'’-]+){0,3}?\s+as\s+(?:an?\s+|the\s+)?$/i;
  // Group 17: is the sentence that holds [s,e] a generic one (question / definition / comparison opener or phrase)?
  // Group 17b: is [s,e] part of a Title Case HEADING rather than a statement about a person? True when the span starts with a capital and either
  //   (a) it sits in a run of 3 or more consecutive Title Case words that contains no anchored person name, or
  //   (b) the word right after it is a heading-like ending (List, Guide, Schedule, Checklist, Menu, Plan, Report, Directory...).
  // Used only to withhold the "multi-word title" shortcut from titles added by category; any other cue still counts.
  const JOB_HEADING_ENDINGS = new Set(['list', 'lists', 'guide', 'schedule', 'checklist', 'menu', 'plan', 'report', 'directory', 'handbook', 'roster', 'chart', 'table', 'calendar', 'form', 'template', 'registry', 'index', 'catalog', 'catalogue']);
  function jobHeadingLikeAt(text, s, e) {
    if (!/^[A-Z]/.test(text.slice(s, e))) return false;
    const nx = text.slice(e, e + 40).match(/^\s+([A-Za-z]+)/);
    if (nx && JOB_HEADING_ENDINGS.has(nx[1].toLowerCase())) return true;
    const left = (text.slice(Math.max(0, s - 100), s).match(/((?:[A-Z][\w'’-]*\s+)*)$/) || ['', ''])[1].trim().split(/\s+/).filter(Boolean);
    const right = (text.slice(e, e + 100).match(/^((?:\s+[A-Z][\w'’-]*)*)/) || ['', ''])[1].trim().split(/\s+/).filter(Boolean);
    const run = left.concat(text.slice(s, e).trim().split(/\s+/), right);
    if (run.length < 3) return false;
    return !run.some(w => isKnownNameWord(w) || nameHasPersonTag(isolatedNameTags(w)));
  }
  function jobGenericAt(text, s, e) {
    const ss = Math.max(text.lastIndexOf('.', s - 1), text.lastIndexOf('?', s - 1), text.lastIndexOf('!', s - 1), text.lastIndexOf('\n', s - 1)) + 1;
    let se = text.length;
    for (const ch of ['.', '?', '!', '\n']) { const k = text.indexOf(ch, e); if (k !== -1 && k < se) se = k; }
    return JOB_GENERIC_SENTENCE_RE.test(text.slice(ss, se));
  }
  function hasStructuralJobCue(text, s, e, leadOnly, noMulti) {
    // Group 14 (cause A): leadOnly = look only at what stands BEFORE the span (cues 2, 3, 3b, 6, 7-before); used for a span that was
    // extended leftwards over modifier words, so the "multi-word" cue 1 and the after-side cues (4, 5, 5b) say nothing new.
    const before = text.slice(Math.max(0, s - 60), s);
    const after = text.slice(e, e + 70);
    const span = text.slice(s, e);
    // Heading guard: when most other words in the sentence are Capitalised (Title
    // Case headings, ALL-CAPS), capitalisation carries no information, so the
    // name/employer cues (4, 5, 6) are disabled for this occurrence.
    const capsUselessBase = (() => {
      const sentStart = Math.max(text.lastIndexOf('.', s - 1), text.lastIndexOf('!', s - 1), text.lastIndexOf('?', s - 1)) + 1;
      let sentEnd = text.length;
      for (const ch of ['.', '!', '?']) { const k = text.indexOf(ch, e); if (k !== -1 && k < sentEnd) sentEnd = k; }
      const words = (text.slice(sentStart, s) + ' ' + text.slice(e, sentEnd)).match(/[A-Za-z][A-Za-z'’-]*/g) || [];
      const rest = words.slice(1);                                   // ignore the sentence-initial word
      if (rest.length < 4) return false;
      return rest.filter(w => /^[A-Z]/.test(w)).length / rest.length > 0.75;
    })();
    // Group 17b: for a title added by category, a Title Case heading context also disables the capitalisation cues (4, 5, 5b, 6) -
    // "<Title> Meeting Notes" is not "<Title> <First> <Last>".
    const capsUseless = capsUselessBase || (JOB_EXTRA_TITLES.has(span.trim().toLowerCase()) && jobHeadingLikeAt(text, s, e));
    const definiteBefore = /\b(?:the|this|that|these|those)\s+$/i.test(before);
    // (Group 17: not for a plural, and not for a title added by category when the sentence is generic)
    if (!leadOnly && !noMulti && /\s/.test(span.trim()) && !definiteBefore &&
        !(JOB_EXTRA_TITLES.has(span.trim().toLowerCase()) && (jobGenericAt(text, s, e) || capsUseless || jobHeadingLikeAt(text, s, e)))) return true;            // 1 (multi-word, not a bare definite description)
    if (/(?:job|role|position|title|occupation|profession|designation)["']?\s*[:=-]\s*["']?\s*$/i.test(before)) return true; // 2
    // Group 15 (a): a bare "as a" right after a verb of use / purpose / treatment ("use it as a", "designed as a", "treated as a") names the
    // role of a THING; it is not evidence of a person's job. "works as", "serves as", "employed as", "hired as" are not in that class.
    if (/(?<!such )\b(?:as|hired as|promoted to|appointed|named)\s+(?:an?\s+|the\s+)?$/i.test(before) && !JOB_OBJECT_ROLE_BEFORE_AS_RE.test(before)) return true;      // 3
    if (/\w,\s*an?\s+$/i.test(before)) return true;                                                                      // 3b appositive "X, a <title>"
    // Group 16: "became / becomes / becoming a <title>" is a role change like "promoted to" (not for hypotheticals)
    if (/\b(?:became|becomes|becoming)\s+(?:an?\s+|the\s+)$/i.test(before) && !JOB_HYPOTHETICAL_BEFORE_RE.test(before.replace(/\b(?:became|becomes|becoming)\s+(?:an?\s+|the\s+)$/i, ''))) return true;   // 3c
    // Group 16 (cause B, stage 1)
    {
      const nameBefore = (re) => { const m = before.match(re); return m ? looksLikePersonNameRun(m[1].trim().split(/\s+/)) : false; };
      // rule 2: a title in parentheses right after a person's name: "Anna Marie Co (accountant)". The heading guard is not applied: a
      // list of names is all Title Case by nature, and the name itself must be anchored (names dictionary / Person tag).
      if (/\(\s*$/.test(before) && (leadOnly || /^\s*\)/.test(after)) &&
          nameBefore(/((?:[A-Z][\w'’.-]*\s+){0,3}[A-Z][\w'’-]*)\s*\(\s*$/)) return true;                                                // 8
      // rule 4: a Title Case title directly after a full name with no punctuation: "Maria Santos Branch Coordinator"
      // (multi-word spans only: a single Title Case word after a name is too often a surname - Cook, Baker, Miller, Porter - and the
      //  names dictionary does not list all of them)
      if (!capsUseless && !noMulti && /\s/.test(span.trim()) && /^[A-Z]/.test(span) &&
          nameBefore(/((?:[A-Z][\w'’-]*\s+){1,3})$/)) return true;                                                                       // 9
    }
    if (!capsUseless && !leadOnly) {
      const orgM = after.match(/^[,\s]*(?:at|of|for|with|under|from)\s+(?:the\s+)?([A-Z][A-Za-z'.&-]*)/);               // 4
      if (orgM && !JOB_NOT_NAME_START.test(orgM[1])) return true;
      // (an optional "." is tolerated: normalizePath_C inserts one between a lowercase word and a Title-case word)
      // Group 6: the first capitalised word must not be a function word (determiner, pronoun,
      // conjunction, preposition, auxiliary...): "main breaker. The Bureau of Fire" is not a name,
      // "nurse. Grace Cruz" still is.
      // Group 12: an honorific between the title and the name ("principal, Mr. Armando Dizon") is skipped; the honorific itself
      // is the evidence of a person, so one or more capitalised words after it are enough.
      const honM = after.match(/^([.,]?\s+)(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Atty|Engr|Arch|Hon|Fr|Rev|Sen|Gov)\.?\s+(?=[A-Z][a-z'’-]+)/);
      if (honM && !noMulti) {   // Group 17: a name right after a PLURAL ("Associates Law Offices", "Doctors Without Borders") is not evidence
        const nm = after.slice(honM[0].length).match(/^[A-Z][a-z'’-]+(?:\s+(?:[A-Z]\.?|[A-Z][a-z'’.-]+)){0,3}\b/);
        if (nm) return true;                                                                                          // 5b
      }
      const nameM = after.match(/^[.,]?\s+([A-Z][a-z'’-]+)(?:\s+(?:[A-Z]\.?|[A-Z][a-z'’.-]+)){1,3}\b/);
      if (!noMulti && nameM && !JOB_FUNCTION_WORDS.has(nameM[1].toLowerCase()) &&
          !JOB_NOT_NAME_START.test(after.replace(/^[.,]?\s+/, ''))) return true;                                        // 5
      if (!noMulti && /(?:[A-Z][a-z'’-]+\s+){1,3}[A-Z][a-z'’-]+,\s*(?:an?\s+|the\s+)?$/.test(before)) return true;     // 6 (not for a plural: "<Org Name>, Doctors ...")
    }
    if (leadOnly && !capsUseless && /(?:[A-Z][a-z'’-]+\s+){1,3}[A-Z][a-z'’-]+,\s*(?:an?\s+|the\s+)?$/.test(before)) return true;   // 6 (lead-only)
    if (/[|•]\s*$/.test(before) || (!leadOnly && /^\s*[|•]/.test(after))) return true;                               // 7
    return false;
  }

  /**
   * D10: extend an accepted title leftwards over up to 3 modifier words
   * ("registered nurse", "jeepney driver", "public school teacher").
   * A modifier is a non-closed-class word that Compromise tags as a noun, or a
   * word from the small closed qualification/seniority adjective set; hyphen
   * prefixes ("co-teacher") are attached directly. Returns the new start index.
   */
  function extendJobHeadLeft(text, s, adjOnly, steps, e) {
    // steps (optional array): receives the start index after each accepted modifier word (Group 14, cause A)
    let start = s;
    for (let k = 0; k < 3; k++) {
      const pre = text.slice(0, start);
      let m = pre.match(/([A-Za-z]+)-$/);                     // attached prefix: co-, vice-
      if (m) { start -= m[0].length; if (steps) steps.push(start); continue; }
      m = pre.match(/([A-Za-z][A-Za-z'’-]*)\s$/);             // single preceding word
      if (!m) break;
      const w = m[1], lw = w.toLowerCase();
      if (JOB_MOD_STOP.has(lw) || w.length < 3) break;
      if (/['’]s$|s['’]$/i.test(w)) break;                    // Group 14 (G): a possessive ("Protection's fire marshal") ends the title
      let ok = JOB_MOD_ADJ.has(lw);
      // Group 6: when the finding is backed only by a possessive trigger ("my sourdough starter"),
      // extend over qualification adjectives only, never over noun modifiers.
      if (!ok && !adjOnly && window.nlp) {
        try {
          const d = window.nlp(w);
          ok = d.has('#Noun') && !d.has('#Pronoun') && !d.has('#Value') && !d.has('#Person') &&
               !d.has('#Adjective');
          // Group 15 (b): an ambiguous noun/verb ("store", "run", "play") is judged together with the part of the title already accepted
          // ("store owner"), where Compromise tags it as a noun; a word that stays a verb/adjective there ("hired nurse") is still refused.
          if (!ok && e !== undefined) {
            const t0 = window.nlp(w + ' ' + text.slice(start, e)).json({ terms: { tags: true } })[0];
            const tg = (t0 && t0.terms[0] && t0.terms[0].tags) || [];
            ok = tg.includes('Noun') && !tg.some(t => ['Pronoun', 'Value', 'Person', 'Adjective', 'Verb', 'Gerund'].includes(t));
          }
        } catch (_) { ok = false; }
      }
      if (!ok) break;
      start -= m[0].length;
      if (steps) steps.push(start);
    }
    return start;
  }

  // Group 16 (cause B, stage 2): coordination of titles. Connector before / after a title; an employer phrase ("at Punongbayan & Araullo")
  // may stand between the partner and the connector on the left.
  const JOB_COORD_LEFT_RE = /(?:,\s*(?:(?:and|or)\s+)?|\s+(?:and|or|&)\s+|\s*\/\s*)(?:(?:an?|the)\s+)?$/i;
  const JOB_COORD_RIGHT_RE = /^(?:,\s*(?:(?:and|or)\s+)?|\s+(?:and|or|&)\s+|\s*\/\s*)(?:(?:an?|the)\s+)?/i;
  const JOB_EMPLOYER_PP_RE = /\s+(?:at|of|for|with|under|from)\s+(?:the\s+)?[A-Z][\w&'.’-]*(?:\s+(?:[A-Z&][\w&'.’-]*|of|the|and)){0,4}$/;
  // generic sentence markers (always veto): question / definition / comparison openers and phrases
  const JOB_GENERIC_SENTENCE_RE = /^\s*(?:what|how|why|which|who|whom|is|are|does|do|did|can|should|would|could|if|explain|define|compare|describe|tell me about)\b|\b(?:to become|compared to|compare|earn(?:s)? more|versus|vs\.?|how much|salary of)\b|\b(?:is|are)\s+(?:a|an|the)\s+(?:person|people|someone|somebody|professional|worker|specialist)\s+(?:who|that|whose|responsible)\b|\b(?:means|refers to|is defined as|is known as|is called)\b/i;
  // a job-post HEADER only ("WANTED: ...", "Hiring: ..."): free text such as "the hospital is hiring a ..." is not one (it is also how
  // generic announcements are written, and such announcements are policy rows)
  const JOB_POST_BEFORE_RE = /(?:^|[\n.!?]\s*)(?:wanted|now hiring|hiring|vacanc(?:y|ies)|job openings?|openings?|looking for|seeking|needed)\s*[:\-–]\s*[^.?!\n]*$/i;
  const JOB_EMPLOYMENT_HISTORY_BEFORE_RE = /\b(?:previously|formerly|currently|presently|since\s+\d{4}|from\s+\d{4})\b[^.?!\n]*$/i;
  // a pronoun copula + article ("I am a", "she is a"; NOT "we are looking"), "works as", or a possessive, at most 6 words before the title
  const JOB_FIRST_PERSON_TIE_RE = /\b(?:(?:i['’]?m|i am|i was|she is|he is|she['’]?s|he['’]?s|they are|we are)\s+(?:an?|the)|(?:work(?:s|ed|ing)?|serv(?:e|es|ed|ing)|employed)\s+as|my|our|his|her|their|your)\s+(?:[\w'’&-]+\s+){0,6}$/i;
  function jobCoordinationContextOk(text, s, e) {
    const ss = Math.max(text.lastIndexOf('.', s - 1), text.lastIndexOf('?', s - 1), text.lastIndexOf('!', s - 1), text.lastIndexOf('\n', s - 1)) + 1;
    let se = text.length;
    for (const ch of ['.', '?', '!', '\n']) { const k = text.indexOf(ch, e); if (k !== -1 && k < se) se = k; }
    const sentence = text.slice(ss, se), beforeS = text.slice(ss, s);
    if (JOB_GENERIC_SENTENCE_RE.test(sentence)) return false;                                  // generic veto is always on
    const linePre = text.slice(text.lastIndexOf('\n', s - 1) + 1, s);
    if (/^\s*(?:[-*•▪◦]|\d+[.)])\s/.test(linePre) || /\|/.test(linePre)) return true;         // bullet / table row
    if (JOB_POST_BEFORE_RE.test(beforeS)) return true;                                           // WANTED: / hiring / looking for ...
    if (JOB_EMPLOYMENT_HISTORY_BEFORE_RE.test(beforeS) || JOB_FIRST_PERSON_TIE_RE.test(beforeS)) return true;
    for (const m of sentence.matchAll(/(?:[A-Z][\w'’-]*\s+){1,3}[A-Z][\w'’-]*/g)) {            // a person's name in the sentence
      if (looksLikePersonNameRun(m[0].trim().split(/\s+/))) return true;
    }
    return false;
  }

  // Group 14 (cause A): the structural cues ("as a", "Job:", ", a", "Name, the") must stand directly before the title, but a modifier
  // can sit between them and the dictionary head ("as a registered nurse", "Job: tricycle driver"). Walk the modifiers that
  // extendJobHeadLeft accepts (at most 3) and look for a before-side cue at each stop. Returns [start, end] of the extended title or null.
  function findLeadingModifierCue(text, occs, plural) {
    for (const [s, e] of occs) {
      const steps = [];
      extendJobHeadLeft(text, s, false, steps, e);
      for (const ns of steps) {
        if (hasStructuralJobCue(text, ns, e, true, plural) || checkJobContext(text, text.slice(ns, e), true)) return [ns, e];
      }
    }
    return null;
  }

  function validateJobTitlesWithCompromise(csvFindings, text, doc) {
    if (!COMPROMISE_AVAILABLE || csvFindings.length === 0) {
      // If no compromise or no findings, return all CSV findings
      return csvFindings;
    }

    const validated = [];
    const deferred = [];

    for (const finding of csvFindings) {
      const actualSpan = findActualSpan(text, finding.rawMatch || finding.name);

      try {
        // Exact / phrase dictionary hits (high confidence)
        if ((finding.source === 'csv_exact_match' || finding.source === 'csv_phrase_match') && finding.confidence === 'high') {
          // Group 5 (D9): keep when a trigger phrase OR any occurrence shows a
          // structural personal-job cue; a bare common noun with neither stays out.
          let occs = jobOccurrences(text, actualSpan);
          // Group 17: a plural, or a title added by category, is never accepted from a generic sentence
          if (finding.plural || JOB_EXTRA_TITLES.has(actualSpan.trim().toLowerCase())) {
            occs = occs.filter(([gs, ge]) => !jobGenericAt(text, gs, ge));
            if (!occs.length) { console.debug(`[PATH_C/VAL_JOB] FILTER (generic sentence): "${finding.name}"`); continue; }
          }
          let keepStart = -1, keepEnd = -1;
          if (checkJobContext(text, actualSpan, !!finding.plural)) { keepStart = occs.length ? occs[0][0] : -1; keepEnd = occs.length ? occs[0][1] : -1; }
          if (keepStart < 0 || !occs.length) {
            for (const [s, e] of occs) {
              if (hasStructuralJobCue(text, s, e, false, finding.plural)) { keepStart = s; keepEnd = e; break; }
            }
          }
          const trig = checkJobContext(text, actualSpan, !!finding.plural);
          let keepStructural = -1;
          for (const [s2, e2] of occs) { if (hasStructuralJobCue(text, s2, e2, false, finding.plural)) { keepStructural = s2; break; } }
          if (!trig && keepStart < 0) {
            // Group 14 (cause A): a cue that stands before accepted modifier words ("as a registered nurse") counts for the whole title
            const lead = findLeadingModifierCue(text, occs, finding.plural);
            if (lead) {
              const ext = text.slice(lead[0], lead[1]);
              validated.push(Object.assign({}, finding, { name: ext, rawMatch: ext, source: 'csv_head_extension' }));
              console.debug(`[PATH_C/VAL_JOB] PASS (cue before modifiers): "${ext}"`);
              continue;
            }
            console.debug(`[PATH_C/VAL_JOB] FILTER (no context/cue): "${finding.name}"`);
            deferred.push({ finding, occs });          // Group 16 (stage 2): may still be accepted by coordination with another title
            continue;
          }
          // A lone adjective-only word ("former", "extra") is not a title, unless a
          // strong structural cue (not just a trigger phrase) vouches for it.
          if (keepStructural < 0 && !/[\s-]/.test(actualSpan.trim()) && window.nlp) {   // Group 17: a hyphenated compound ("bar-tender") is not a lone adjective
            const d = window.nlp(actualSpan);
            if (d.has('#Adjective') && !d.has('#Noun')) { console.debug(`[PATH_C/VAL_JOB] FILTER (adjective): "${finding.name}"`); continue; }
          }
          // Group 5 (D10): head-noun extension to the left.
          if (keepStart >= 0) {
            // Group 6: noun-modifier extension needs a non-possessive trigger or a structural cue.
            const nounExtOk = keepStructural >= 0 || checkJobContext(text, actualSpan, true);
            const ns = extendJobHeadLeft(text, keepStart, !nounExtOk, undefined, keepEnd);
            if (ns < keepStart) {
              const ext = text.slice(ns, keepEnd);
              validated.push(Object.assign({}, finding, { name: ext, rawMatch: ext, source: 'csv_head_extension' }));
              console.debug(`[PATH_C/VAL_JOB] PASS (extended head): "${ext}"`);
              continue;
            }
          }
          validated.push(finding);
          console.debug(`[PATH_C/VAL_JOB] PASS (high-conf + context/cue): "${finding.name}"`);
          continue;
        }
        
        // Lower-confidence findings must pass both context and POS checks
        // Group 12: a typo'd title right after an appositive "X, a/an" is in the same position as cue 3b for exact matches
        let hasJobContext = checkJobContext(text, actualSpan);
        if (!hasJobContext && finding.source === 'csv_fuzzy_match') {
          hasJobContext = jobOccurrences(text, actualSpan).some(([s]) => /\w,\s*an?\s+$/i.test(text.slice(Math.max(0, s - 60), s)));
        }

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

    // Group 16 (cause B, stage 2): a title that had no cue of its own is accepted when it is coordinated ("A and B", "A, B, and C",
    // "A at Org and a B") with an accepted title or another candidate title, AND the sentence shows a person tie or a job-post/list
    // context, AND is not a generic question/definition/comparison.
    if (deferred.length) {
      const accSpans = [], defSpans = [];
      validated.forEach(f => jobOccurrences(text, f.rawMatch || f.name).forEach(o => accSpans.push(o)));
      deferred.forEach((d, di) => d.occs.forEach(o => defSpans.push([o[0], o[1], di])));
      deferred.forEach((d, di) => {
        const partnerEnds = pos => accSpans.some(o => o[1] === pos) || defSpans.some(o => o[1] === pos && o[2] !== di);
        const partnerStarts = pos => accSpans.some(o => o[0] === pos) || defSpans.some(o => o[0] === pos && o[2] !== di);
        for (const [s, e] of d.occs) {
          let linked = false;
          const lm = text.slice(0, s).match(JOB_COORD_LEFT_RE);
          if (lm) {
            const pre = text.slice(0, s - lm[0].length);
            linked = partnerEnds(pre.length) || partnerEnds(pre.replace(JOB_EMPLOYER_PP_RE, '').length);
          }
          if (!linked) {
            const rm = text.slice(e).match(JOB_COORD_RIGHT_RE);
            if (rm) linked = partnerStarts(e + rm[0].length);
          }
          if (linked && jobCoordinationContextOk(text, s, e)) {
            validated.push(d.finding);
            console.debug(`[PATH_C/VAL_JOB] PASS (coordination + person tie / list context): "${d.finding.name}"`);
            break;
          }
        }
      });
    }

    // Group 5: containment dedup — drop a title whose every occurrence lies
    // inside an occurrence of a longer kept title ("agent" in "call center
    // agent"), and collapse identical spans produced by head extension.
    const seenSpan = new Set();
    const unique = validated.filter(f => {
      const k = (f.rawMatch || f.name).toLowerCase();
      if (seenSpan.has(k)) return false;
      seenSpan.add(k);
      return true;
    });
    return unique.filter(f => {
      const short = f.rawMatch || f.name;
      const sOcc = jobOccurrences(text, short);
      if (!sOcc.length) return true;
      const lOcc = [];
      for (const g of unique) {
        const longer = g.rawMatch || g.name;
        if (g !== f && longer.length > short.length && longer.toLowerCase().includes(short.toLowerCase())) {
          lOcc.push(...jobOccurrences(text, longer));
        }
      }
      return !(lOcc.length && sOcc.every(([s, e]) => lOcc.some(([ls, le]) => s >= ls && e <= le)));
    });
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

  // ── D3: Structural organization detection (suffix + head-word patterns) ──────

  /**
   * D3 FIX: Detect organization names that are NOT in ORGANIZATIONS_DATA by
   * matching structural patterns — either a recognized corporate suffix or a
   * recognized head word — instead of relying on the CSV whitelist alone.
   *
   * Two sub-patterns:
   *   (a) SUFFIX pattern  — capitalized phrase ending with a corporate/legal
   *       suffix such as "Corporation", "Inc.", "Ltd.", "LLC", "& Co."
   *   (b) HEAD pattern    — capitalized phrase starting with a recognized
   *       org head word such as "Bureau", "Department of", "Foundation", etc.
   *
   * Guards (to prevent common-phrase false positives):
   *   1. Minimum span: at least 2 words total.
   *   2. Deduplication against CSV findings (already captured).
   *   3. shouldFilterCommonOrganization: standard common-word filter.
   *   4. looksLikePlaceName: place heuristic (all structural matches are non-CSV).
   *
   * Structural findings skip validateOrganizationsWithCompromise because that
   * validator tests CSV membership context (checkOrgContext looks for triggers
   * that most non-CSV orgs will lack) and would reject most valid hits.
   *
   * @param {string} text - The normalized text to search.
   * @param {Set<string>} alreadyFoundLower - Lower-cased rawMatches already
   *   detected by findOrganizationsCSVFirst (for deduplication).
   * @returns {Array} structural org findings (source: 'structural_match').
   * @private
   */
  function findOrganizationsStructural(text, alreadyFoundLower) {
    const found = [];
    if (!text || text.length === 0) return found;

    // ── (a) SUFFIX pattern ───────────────────────────────────────────────────
    // Matches: "[Name Fragment] <suffix>"  where the name fragment is a
    // sequence of one or more "name tokens" joined by spaces, " & ", or " and ".
    //
    // A name token is:  [A-Z][A-Za-z'.-]*(?:-[A-Za-z'.-]+)*
    //   • starts with uppercase
    //   • may contain apostrophes (O'Brien), periods (St., Dr.), hyphens (Santos-Lim)
    //   • hyphenated extensions are allowed (e.g. "Santos-Lim", "Luke's")
    //
    // The comma-before-suffix case is handled by an optional ",\s*" immediately
    // before the suffix word (e.g. "Southpoint Supplies, Inc.").
    //
    // Stop-word filter: at least one token in the name fragment must NOT be a
    // pure stop word ("The", "A", "An") so bare "The Inc." is never emitted.
    //
    // NAME_TOKEN:  an individual name word — starts uppercase, may contain
    //   apostrophes (O'Brien), periods (St., Ltd.), hyphens (Santos-Lim).
    //   Note: a trailing period is absorbed into the token (e.g. "Ltd.").
    //
    // The leading negative lookahead and the per-continuation-token lookahead both
    // block title-cased conjunctions/articles from being matched as name tokens.
    // This prevents normalizer sentence-casing ("Ltd. And Southpoint") from
    // causing a cross-org greedy match.
    //
    // SUFFIX_RE structure:
    //   \b (?!TITLE_STOP) <fragment: NAME_TOKENs> ,?\s+ <SUFFIX_WORD> \b
    //   Trailing comma-space before the suffix handles "Supplies, Inc."
    // TITLE_STOP: single-word conjunctions/articles that the normalizer may
    // sentence-case (e.g. "And" after a period).  Used as:
    //   1. A negative lookahead inside NAME_FRAG to prevent continuation tokens
    //      from being title-cased conjunctions ("Eastwind Packaging Ltd. And Southpoint")
    //   2. A guard at the START of SUFFIX_RE to prevent a match from beginning
    //      with a title-cased conjunction ("And Southpoint Supplies, Inc")
    const TITLE_STOP_PAT = '(?:And|Or|But|The|A|An|Of|For|In|At|On|By|To)(?=[^A-Za-z\'.-]|$)';
    const NAME_TOKEN  = '[A-Z][A-Za-z\'.-]*(?:-[A-Za-z\'.-]+)*';
    // Leading token: blocked from being a stand-alone title-stop word.
    // Continuation tokens: also blocked from starting at a title-stop word.
    // The connector between tokens allows an optional " & " (ampersand) so
    // "O'Brien & Associates Ltd" is captured as a single fragment, but ONLY
    // when the & is NOT immediately followed by "Co" (which starts a suffix).
    const NAME_FRAG   = `(?!${TITLE_STOP_PAT})${NAME_TOKEN}(?:\\s+(?:&(?!\\s*Co)\\s+)?(?!${TITLE_STOP_PAT})${NAME_TOKEN})*`;
    // Group 4c: the safer corporate words (rarely ordinary words after a Title-Case name). Common-noun suffixes (Group, Partners,
    // Services, Solutions, Systems, Capital, Media...) are left for Group 7.
    const SUFFIX_WORD = '(?:Corporation|Corp\\.?|Incorporated|Inc\\.?|Limited|Ltd\\.?|LLC|LLP|&\\s*Co\\.?|Holdings|Enterprises|Industries|Ventures|Pharmaceuticals|Airlines|Motors)';
    // (Group 4d removed Insurance, Trading, Logistics and Realty again: with the "one unknown word" gate they matched ordinary phrases
    //  such as "Health Insurance", "Stock Trading", "Military Logistics", "Luxury Realty". They go to Group 7.)
    const SUFFIX_RE = new RegExp(
      `\\b(${NAME_FRAG}),?\\s+(${SUFFIX_WORD})\\b`, 'g'
    );

    // Stop words that alone are not meaningful name fragments
    const FRAG_STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'for', 'in', 'and', 'or', 'but', 'at', 'on', 'by', 'to']);

    /**
     * Returns true when the name fragment before the suffix contains at
     * least one capitalised token that is not a stop word.
     */
    function hasNonStopToken(fragment) {
      return fragment.split(/[\s&]+/).some(
        tok => tok.length > 0 && !FRAG_STOP_WORDS.has(tok.toLowerCase())
      );
    }

    let m;
    while ((m = SUFFIX_RE.exec(text)) !== null) {
      const fragment = m[1].trim();
      const suffixWord = m[2].trim();
      // Reconstruct the full match, preserving the original comma-space if present
      const rawText = m[0].trim();
      const full = rawText.replace(/\s+/g, ' ');
      if (!hasNonStopToken(fragment)) continue;            // stop-word guard (Fix 3)
      if (full.split(/\s+/).length < 2) continue;          // guard 1: ≥ 2 words
      const lowerFull = full.toLowerCase();
      if (alreadyFoundLower.has(lowerFull)) continue;      // guard 2: dedup
      if (shouldFilterCommonOrganization(full)) continue;  // guard 3
      if (looksLikePlaceName(full)) continue;              // guard 4
      // guard 5 (Group 4c): for the corporate words that are also ordinary words (Trading, Insurance, Technologies...), a fragment that
      // contains an adjective / gerund / determiner ("New Technologies", "Modern Manufacturing") is a phrase, not a company name
      // Group 4d/8: no preceding token may be an ordinary word (adjective, gerund, determiner...). Group 8 removed Technologies, Manufacturing,
      // Properties and Laboratories again: they matched 14 of 40 new benign Title-Case phrases even with the unknown-word gate.
      {
        const sfxLow = suffixWord.toLowerCase();
        if (RUN_NEW_SUFFIX_WORDS.has(sfxLow)) {
          const isCommonW = w => { const tg = isolatedNameTags(w); return !nameHasPersonTag(tg) && tg.some(t => COMMON_WORD_TAGS.includes(t) || NAME_CLOSED_TAGS.includes(t)); };
          const fw = fragment.split(/\s+/);
          if (fw.some(isCommonW)) continue;
        }
      }
      alreadyFoundLower.add(lowerFull);                    // mark seen
      found.push({
        name: full,
        rawMatch: full,
        confidence: 'medium',
        source: 'structural_match',
        csvValidated: false,
        validated: false
      });
      console.debug(`[PATH_C/STRUCTURAL] Suffix match: "${full}"`);
    }

    // ── (b) HEAD pattern ─────────────────────────────────────────────────────
    // Split into two sub-patterns based on whether the head word appears at
    // the START or END of the name phrase:
    //
    // (b1) HEAD_PREPOSITION_RE — head words that appear at the START and MUST
    //      be followed by a linking preposition (of/on/for/in) before the name.
    //      Without the preposition, these are ordinary English words that appear
    //      in many non-org phrases (e.g. "Unit Testing Basics", "Center Stage").
    //
    // (b2) HEAD_SUFFIX_RE — head words that appear at the END of a phrase,
    //      preceded by a proper-name fragment. These are already suffix-like and
    //      do not need a preposition gate.
    //
    // (b3) DEPT_RE — "Department of [Name]" (two-word trigger, already gated).

    // (b1) Preposition-gated head-first patterns
    // Pattern: [optional leading modifiers] <HeadWord> <prep> [the|a|an] <Capitalized words>
    //
    // FIX A — Leading-modifier back-extension:
    //   Optionally captures 1–3 leading capitalized modifier words that precede the
    //   head word, e.g. "Federal" in "Federal Bureau of Investigation" or "National"
    //   in "National Commission on Indigenous Peoples".
    //
    //   A leading-modifier token is a capitalized word that is NOT any of the
    //   excluded function words: The, A, An, This, That, And, Or, But, Of, On,
    //   For, In, At, By, With, From, To.  The negative lookahead ensures these
    //   purely functional words are never consumed as modifiers.
    //
    // Note: "in" is intentionally excluded from the preposition alternatives — it
    // is a spatial preposition that commonly appears after head words in benign
    // phrases like "Center in Quezon City" or "School in Manila" but rarely forms
    // an org name (unlike "of", "on", "for" which are structural org-name connectors).
    //
    // The pattern stops before a possessive "'s" by using [A-Za-z-]* in the
    // name-word component (no apostrophe, to prevent consuming "'s' at phrase end).
    //
    // LEADING_MOD: one capitalized word that is not a function word, repeated 1–3 times.
    const LEADING_MOD_EXCL = '(?:The|A|An|This|That|And|Or|But|Of|On|For|In|At|By|With|From|To)\\b';
    const LEADING_MOD      = `(?:(?!${LEADING_MOD_EXCL})[A-Z][A-Za-z'.-]+\\s+){1,3}`;
    const HEAD_PREPOSITION_RE = new RegExp(
      `\\b((?:${LEADING_MOD})?(?:Bureau|Office|Commission|Council|Agency|Authority|Center|Unit|School)\\s+(?:of|on|for)\\s+(?:(?:the|a|an)\\s+)?[A-Z][A-Za-z-]*(?:\\s+[A-Z][A-Za-z-]*){0,5})(?='s\\b|[^A-Za-z'-]|$)`,
      'g'
    );

    while ((m = HEAD_PREPOSITION_RE.exec(text)) !== null) {
      const span = m[1].trim();
      if (span.split(/\s+/).length < 3) continue;           // guard 1: head + prep + at-least-one-name-word
      const lowerSpan = span.toLowerCase();
      if (alreadyFoundLower.has(lowerSpan)) continue;       // guard 2: dedup
      if (shouldFilterCommonOrganization(span)) continue;   // guard 3
      if (looksLikePlaceName(span)) continue;               // guard 4
      alreadyFoundLower.add(lowerSpan);
      found.push({
        name: span,
        rawMatch: span,
        confidence: 'medium',
        source: 'structural_match',
        csvValidated: false,
        validated: false
      });
      console.debug(`[PATH_C/STRUCTURAL] Head match (preposition-gated): "${span}"`);
    }

    // (b2) Head-suffix patterns — head word at the END, preceded by a name fragment
    // Pattern: <Capitalized name fragment> <SuffixHeadWord>
    // At least one preceding capitalized word is required.
    // Guard: the fragment must not begin with a title-stop word ("The", "A", etc.)
    // since "The Philippine Nurses Association" would otherwise match starting from "The".
    const TITLE_STOP_START = /^(?:The|A|An|Of|For|In|At|On|By|To|And|Or|But)\s/i;
    const HEAD_SUFFIX_RE = /\b([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*)*\s+(?:Association|Cooperative|Foundation|Federation|Society))\b/g;

    while ((m = HEAD_SUFFIX_RE.exec(text)) !== null) {
      const span = m[1].trim();
      if (span.split(/\s+/).length < 2) continue;           // guard 1: ≥ 2 words
      if (TITLE_STOP_START.test(span)) continue;            // guard 1b: no stop-word fragment start
      const lowerSpan = span.toLowerCase();
      if (alreadyFoundLower.has(lowerSpan)) continue;       // guard 2: dedup
      if (shouldFilterCommonOrganization(span)) continue;   // guard 3
      if (looksLikePlaceName(span)) continue;               // guard 4
      alreadyFoundLower.add(lowerSpan);
      found.push({
        name: span,
        rawMatch: span,
        confidence: 'medium',
        source: 'structural_match',
        csvValidated: false,
        validated: false
      });
      console.debug(`[PATH_C/STRUCTURAL] Head match (suffix-style): "${span}"`);
    }

    // (b3) "Department of [Name]" — two-word trigger, at least one following word
    // Stops before possessive 's to avoid "Department of Education's" → use non-apostrophe in name-word.
    const DEPT_RE = /\b(Department\s+of(?:\s+(?:the\s+)?[A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*){0,4})?)(?='s\b|[^A-Za-z-]|$)/g;

    while ((m = DEPT_RE.exec(text)) !== null) {
      const span = m[1].trim();
      if (span.split(/\s+/).length < 3) continue;           // guard 1: ≥ 3 words (Dept + of + name)
      const lowerSpan = span.toLowerCase();
      if (alreadyFoundLower.has(lowerSpan)) continue;       // guard 2: dedup
      if (shouldFilterCommonOrganization(span)) continue;   // guard 3
      if (looksLikePlaceName(span)) continue;               // guard 4
      alreadyFoundLower.add(lowerSpan);
      found.push({
        name: span,
        rawMatch: span,
        confidence: 'medium',
        source: 'structural_match',
        csvValidated: false,
        validated: false
      });
      console.debug(`[PATH_C/STRUCTURAL] Head match (dept): "${span}"`);
    }

    // ── (c) INSTITUTION_RE — institution-ending words ─────────────────────
    // FIX B: Detect organization names that end in a well-known institution
    // type word (Hospital, University, College, School, Bank, Clinic,
    // Institute, Academy) or the two-word ending "Medical Center".
    //
    // Pattern: <name fragment> <institution ending>
    //
    // The name fragment uses the same generalized name-token definition as
    // SUFFIX_RE: starts uppercase, allows hyphens, apostrophes, periods,
    // ampersands.  Minimum: at least one name token before the ending
    // (the institution ending itself counts as the second word, giving ≥ 2
    // words total).
    //
    // A bare institution ending word with no preceding proper-name fragment
    // (e.g. "Hospital" alone) is blocked because the fragment requires ≥ 1
    // non-stop-word token.
    //
    // "School" overlap: HEAD_PREPOSITION_RE captures "School of X" (head first).
    // INSTITUTION_RE captures "X School" (ending last).  Both can fire
    // independently; deduplication handles the rare overlap.
    //
    // "Medical Center" is a two-word ending handled by an alternative branch.
    //
    // INST_ENDING: the institution-type keyword (single or two-word).
    const INST_NAME_TOKEN = '[A-Z][A-Za-z\'.-]*(?:-[A-Za-z\'.-]+)*';
    // Connector between name tokens: space, or " & " (ampersand connector).
    const INST_NAME_FRAG  = `(?!${TITLE_STOP_PAT})${INST_NAME_TOKEN}(?:\\s+(?:&(?!\\s*Co)\\s+)?(?!${TITLE_STOP_PAT})${INST_NAME_TOKEN})*`;
    const INST_ENDING_PAT = '(?:Hospital|University|College|School|Bank|Clinic|Institute|Academy|Medical\\s+Center)';
    const INSTITUTION_RE  = new RegExp(
      // Optional "of/for/on [the] Name…" tail (group 2) completes names like "X Institute of Y";
      // it is kept only for endings that take such a complement (see EXT_ENDINGS below).
      `\\b(${INST_NAME_FRAG}\\s+${INST_ENDING_PAT})(\\s+(?:of|for|on)\\s+(?:(?:the|a|an)\\s+)?[A-Z][A-Za-z-]*(?:\\s+[A-Z][A-Za-z-]*){0,3})?\\b`,
      'g'
    );

    while ((m = INSTITUTION_RE.exec(text)) !== null) {
      const span = m[1].trim();                            // name fragment + ending word
      const extTail = (m[2] || '').replace(/\s+/g, ' ').trim();   // optional "of/for/on …" tail
      const EXT_ENDINGS = /(?:University|College|School|Bank|Institute|Academy)$/;
      // Guard 1: require ≥ 2 words total
      if (span.split(/\s+/).length < 2) continue;
      // Guard 2: the name fragment (everything before the ending word) must
      // contain at least one non-stop-word token, to block bare endings.
      // Extract fragment by removing the ending from the tail.
      const endingMatch = span.match(new RegExp(`\\s+${INST_ENDING_PAT}$`));
      if (!endingMatch) continue;
      const fragment = span.slice(0, span.length - endingMatch[0].length).trim();
      if (!fragment || !hasNonStopToken(fragment)) continue;
      // Guard 3 (Group 2c fix): an institution ending cannot directly follow
      // another institution ending ("X University College"): the earlier ending
      // already closed the name.  Emit the shorter span instead of the run-on.
      // Guard 4: bound the name fragment to its last 4 tokens so the match
      // cannot absorb an unbounded run of capitalised words (e.g. a person's
      // name written on the line before the org).
      const fragTokens = fragment.split(/\s+/);
      const followsEnding = new RegExp(`^${INST_ENDING_PAT}$`).test(fragTokens[fragTokens.length - 1]);
      let finalSpan;
      if (followsEnding) {
        if (fragTokens.length < 2) continue;               // bare ending alone
        finalSpan = fragTokens.slice(-5).join(' ');        // up to 4 name tokens + their ending
      } else {
        finalSpan = fragTokens.slice(-4).join(' ') + endingMatch[0];
      }
      // Guard 5: if the span ends with an org already verified by an earlier
      // pass (dictionary), cut it back to that verified org; the leading
      // tokens are then more likely neighbouring text than part of the name.
      const lowerFinal = finalSpan.toLowerCase();
      for (const known of alreadyFoundLower) {
        if (known.length < lowerFinal.length && lowerFinal.endsWith(' ' + known)) {
          finalSpan = finalSpan.slice(finalSpan.length - known.length);
          break;
        }
      }
      // Complement tail ("X Institute of Y"): only when the span was not cut back
      // to a verified org and the ending is one that takes an "of" complement.
      if (extTail && !followsEnding && finalSpan.toLowerCase() === (fragTokens.slice(-4).join(' ') + endingMatch[0]).toLowerCase() && EXT_ENDINGS.test(finalSpan)) {
        finalSpan = finalSpan + ' ' + extTail;
      }
      const lowerSpan = finalSpan.toLowerCase();
      if (alreadyFoundLower.has(lowerSpan)) continue;      // guard: dedup
      if (shouldFilterCommonOrganization(finalSpan)) continue;  // common-word guard
      if (looksLikePlaceName(finalSpan)) continue;              // place guard
      alreadyFoundLower.add(lowerSpan);
      found.push({
        name: finalSpan,
        rawMatch: finalSpan,
        confidence: 'medium',
        source: 'structural_match',
        csvValidated: false,
        validated: false
      });
      console.debug(`[PATH_C/STRUCTURAL] Institution match: "${finalSpan}"`);
    }

    // ── (d) GROUP 7 stage 1 ──────────────────────────────────────────────────
    const pushG7 = (span, tag) => {
      const lowerSpan = span.toLowerCase();
      if (alreadyFoundLower.has(lowerSpan)) return;
      // a longer span replaces a shorter structural finding it contains ("Reyes & Associates" inside "Reyes & Associates Law Offices")
      for (let i = found.length - 1; i >= 0; i--) { const fl = found[i].name.toLowerCase(); if (fl !== lowerSpan && lowerSpan.includes(fl)) found.splice(i, 1); }
      alreadyFoundLower.add(lowerSpan);
      // g7: the place word is part of the name (checked by the rule itself), so the generic place filter must not drop it, and a
      // person finding with the same text must not hide it (the person finding is removed later as "inside an organization")
      found.push({ name: span, rawMatch: span, confidence: 'medium', source: 'structural_match', csvValidated: false, validated: false, g7: true });
      console.debug(`[PATH_C/STRUCTURAL] ${tag}: "${span}"`);
    };
    findOrgsLawFirms(text, pushG7);
    findOrgsInstitutionOfPlace(text, pushG7);
    findOrgsBrandDescriptor(text, pushG7);
    findOrgsGroupAgency(text, pushG7);
    findOrgsUnitDivision(text, pushG7);

    return found;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 7 (stage 2): "Group" / "Agency" and "Unit" / "Division" / "Section" as organization head words.
  // These are very common ordinary words, so each rule needs capitalised words in front of the head that include a sector word
  // (Medical, Security, Cardiology...) or a known place; "Group" / "Agency" are also accepted after capitalised name-like words
  // (not generic modifiers such as Age, Study, Focus) when an affiliation cue stands before them. Never flagged:
  //   - a head in a Title Case HEADING line (>= 80% of the content words capitalised, >= 4 words) unless the line is just the name or a cue exists;
  //   - a head followed by a heading ending (Guide, Topics, Rules...), a number / letter / roman numeral ("Unit 4"), or another capitalised
  //     word ("Unit Test", "Group Discussion"), or by "of the <lower-case noun>" ("Finance Section of the newspaper").
  // The sector list is language-level (departments and industries), not organization names.
  // ═══════════════════════════════════════════════════════════════════════
  const G7_SECTOR_WORDS = new Set((
    'medical health healthcare dental pharmaceutical pharmacy nursing clinical surgical cardiology pediatrics paediatrics oncology radiology pathology laboratory emergency intensive care ' +
    'security safety insurance financial finance banking investment capital energy power electric utility water telecom telecommunications communications media broadcasting publishing ' +
    'education educational logistics shipping transport transportation aviation maritime construction engineering manufacturing industrial mining agricultural agri food retail trading ' +
    'marketing advertising consulting staffing recruitment placement employment manpower realty property hospitality tourism technology software digital cyber legal accounting audit ' +
    'human resources payroll procurement operations sales customer service services research development planning administration maintenance environmental forestry fisheries ' +
    'records management quality assurance information fire prevention rural public relations compliance risk treasury training'
  ).split(' '));
  // modifiers that make "<modifier> Group / Agency" an ordinary phrase (Age Group, Study Group, News Agency...); they never count as a name
  const G7_GENERIC_MODS = new Set((
    'age blood focus support study peer reading control discussion working travel news government user target pressure ethnic minority social tour family friends class team project ' +
    'interest action self task work math science history english sports sub work-study prayer book chat'
  ).split(' '));
  const G7_HEADING_ENDINGS = new Set((
    'list lists guide guides schedule checklist menu plan plans report reports directory handbook roster chart table calendar form template registry index catalog catalogue topics topic ' +
    'notes basics tips examples activities overview summary exercises rules policies procedures lesson lessons quiz test tests worksheet outline syllabus curriculum questions answers ' +
    'review meeting meetings discussion discussions'
  ).split(' '));
  const G7_NEXT_LOWER_BLOCK = new Set(['test', 'tests', 'plan', 'price', 'prices', 'cost', 'costs', 'conversion', 'rate', 'rates', 'chat', 'discussion', 'activity', 'activities']);
  const G7_ORG_AFTER_OK = /^(?:Inc|Corp|Corporation|Ltd|Limited|LLC|LLP|Co|Holdings|Enterprises|Industries)\b/;

  function g7SectorOrPlace(tok) { return G7_SECTOR_WORDS.has(tok.toLowerCase()) || isKnownPlaceWord(tok); }
  function g7SectorOnly(tok) { return G7_SECTOR_WORDS.has(tok.toLowerCase()); }
  // true when the word can stand in the name part: a sector word, a known place, or a capitalised word that is not a common word
  function g7Eligible(tok) {
    if (!/^[A-Z]/.test(tok)) return false;
    if (g7SectorOrPlace(tok)) return true;
    return tok.length >= 3 && !g7IsCommonWord(tok) && !G7_GENERIC_MODS.has(tok.toLowerCase());
  }
  // the run of eligible capitalised words (and "and" / "&" between two of them) right before position s: { tokens, start }
  function g7LeftRun(text, s, maxTokens) {
    const seg = text.slice(Math.max(0, s - 90), s);
    const m = seg.match(/((?:[A-Z][A-Za-z'’-]*\s+(?:(?:and|&)\s+)?){1,6})$/);
    if (!m) return null;
    const base = s - m[1].length;
    const parts = []; const re = /[A-Z][A-Za-z'’-]*|and|&/g; let t;
    while ((t = re.exec(m[1])) !== null) parts.push({ w: t[0], i: base + t.index });
    const keep = []; let count = 0;
    for (let k = parts.length - 1; k >= 0 && count < maxTokens; k--) {
      const p = parts[k];
      if (p.w === 'and' || p.w === '&') {
        const before = parts[k - 1];
        if (keep.length && before && g7SectorOnly(before.w) && g7SectorOnly(keep[0].w)) { keep.unshift(p); continue; }
        break;
      }
      if (!g7Eligible(p.w)) break;
      keep.unshift(p); count++;
    }
    while (keep.length && (keep[0].w === 'and' || keep[0].w === '&')) keep.shift();
    if (!keep.length) return null;
    return { tokens: keep.map(x => x.w), start: keep[0].i };
  }
  function g7InHeadingLine(text, s, e) {
    const ss = Math.max(text.lastIndexOf('.', s - 1), text.lastIndexOf('?', s - 1), text.lastIndexOf('!', s - 1), text.lastIndexOf('\n', s - 1)) + 1;
    let se = text.length;
    for (const ch of ['.', '?', '!', '\n']) { const k = text.indexOf(ch, e); if (k !== -1 && k < se) se = k; }
    const seg = text.slice(ss, se).trim();
    if (seg.replace(/[\s,;:!?.]+$/, '') === text.slice(s, e).trim()) return false;           // the line is only the name
    const words = (seg.match(/[A-Za-z][A-Za-z'’-]*/g) || []).filter(w => !G7_STOP_RE.test(w));
    if (words.length < 4) return false;
    return words.filter(w => /^[A-Z]/.test(w)).length / words.length >= 0.8;
  }
  // shared checks on what follows the head word; returns true when the head must NOT be taken as an organization
  function g7BadFollower(text, he) {
    const after = text.slice(he, he + 60);
    if (/^['’]s\b/.test(after)) return false;
    const nm = after.match(/^\s+([A-Za-z0-9][\w'’-]*)/);
    if (nm) {
      const w = nm[1];
      if (/^\d/.test(w) || /^[A-Z]$/.test(w) || /^[IVX]+$/.test(w)) return true;                              // Unit 4, Section A, Division II
      if (/^[A-Z]/.test(w) && !G7_ORG_AFTER_OK.test(w) && !G7_STOP_RE.test(w)) return true;                   // another capitalised word: a longer phrase
      if (G7_HEADING_ENDINGS.has(w.toLowerCase())) return true;
      if (G7_NEXT_LOWER_BLOCK.has(w.toLowerCase())) return true;
    }
    if (/^\s+of\s+(?:the|a|an|this|our|my|his|her)\s+[a-z]/.test(after)) return true;                          // "Finance Section of the newspaper"
    return false;
  }

  function findOrgsGroupAgency(text, push) {
    const RE = /\b(Group|Agency)\b/g; let m;
    while ((m = RE.exec(text)) !== null) {
      const he = m.index + m[0].length;
      const run = g7LeftRun(text, m.index, 3);
      if (!run) continue;
      const span = text.slice(run.start, he).replace(/\s+/g, ' ');
      if (g7BadFollower(text, he)) continue;
      const qualified = run.tokens.some(g7SectorOrPlace);
      const cue = hasOrgAffiliationCue(text, run.start);
      if (!qualified && !cue) continue;
      if (!cue && g7InHeadingLine(text, run.start, he)) continue;
      push(span, qualified ? 'Group/Agency (sector)' : 'Group/Agency (cue)');
    }
  }
  function findOrgsUnitDivision(text, push) {
    const RE = /\b(Unit|Division|Section)\b/g; let m;
    while ((m = RE.exec(text)) !== null) {
      const he = m.index + m[0].length;
      const run = g7LeftRun(text, m.index, 3);
      if (!run) continue;
      if (!run.tokens.some(g7SectorOnly)) continue;
      if (g7BadFollower(text, he)) continue;
      if (g7InHeadingLine(text, run.start, he) && !hasOrgAffiliationCue(text, run.start)) continue;
      push(text.slice(run.start, he).replace(/\s+/g, ' '), 'Unit/Division/Section');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 7 (stage 1): three structural organization rules
  //   (a) law / audit firm: a run of capitalised surnames joined by "&" / "and" that either ends in a firm suffix
  //       (Law Offices, Law Firm, & Associates, & Co) or has a firm / affiliation cue before it;
  //   (b1) "<institution head> of <Place>": Archdiocese, Diocese, Prelature, Vicariate always; Province, Municipality unless
  //       the phrase is used as a location ("born in the Province of ...");
  //   (b2) "<known brand> <descriptor> [<Place>]": descriptor Unibank (alone) or City / Mall / Malls (place required).
  // None of these uses a list of firm or brand names. Brands come from the organization dictionary (see getOrgBrandTokens).
  // ═══════════════════════════════════════════════════════════════════════
  const G7_SURNAME_TOKEN = "[A-Z][A-Za-zÀ-ÿ'’-]*";
  const G7_HONORIFIC_RE = /^(?:mr|mrs|ms|miss|mx|dr|prof|atty|engr|arch|sir|madam|hon|fr|rev|sen|gov|st)\.?$/i;
  const G7_STOP_RE = /^(?:the|a|an|of|for|in|at|on|by|to|and|or|but|with|from|this|that|our|my|your|their|his|her)$/i;
  // a word that cannot be a surname: a closed-class or verb/adjective-class word with no person-name tag ("Call", "Best", "Your")
  function g7IsCommonWord(w) {
    if (G7_STOP_RE.test(w) || G7_HONORIFIC_RE.test(w)) return true;
    if (/^(?:Associates|Partners|Company|Brothers|Sons)$/.test(w)) return false;   // ordinary plural nouns, but normal inside a firm name
    const tg = isolatedNameTags(w);
    return !nameHasPersonTag(tg) && !!tg && tg.some(t => COMMON_WORD_TAGS.includes(t) || NAME_CLOSED_TAGS.includes(t));
  }
  // cue words before a firm name that mean "a firm" in plain words (used for the "and" joiner and as an extra cue for "&")
  const G7_FIRM_CUE_RE = /(?:\b(?:partners?|associates?|counsel|attorneys?|lawyers?|solicitors?|litigators?|auditors?|accountants?|paralegals?)\s+(?:at|of|from)\s+(?:the\s+)?(?:(?:law|audit|accounting)\s+(?:firm|offices?)\s+(?:of\s+)?)?|\b(?:law|audit|accounting|legal)\s+(?:firm|offices?)\s+(?:of\s+|called\s+|named\s+)?|\bfirm\s+(?:of\s+|called\s+|named\s+)?|\b(?:represented|audited|advised|retained|sued|handled|drafted)\s+by\s+(?:the\s+)?(?:(?:law|audit)\s+(?:firm|offices?)\s+(?:of\s+)?)?)$/i;
  const G7_FIRM_SUFFIX_RE = /^(?:Law\s+(?:Offices?|Firms?|Group)|LLP|CPAs?)$/;

  function findOrgsLawFirms(text, push) {
    // maximal run of capitalised words with "&", "and" and commas between them
    const RUN = new RegExp(`${G7_SURNAME_TOKEN}\\.?(?:(?:,?\\s+(?:&|and)\\s+|,\\s+|\\s+)${G7_SURNAME_TOKEN}\\.?)+`, 'g');
    let m;
    while ((m = RUN.exec(text)) !== null) {
      const run = m[0], runStart = m.index;
      if (!/(?:&|\band\b)/.test(run) && !/\bLaw\s+(?:Offices?|Firms?|Group)\b/.test(run)) continue;
      // tokens with positions: words, "&"/"and" connectors, commas
      const toks = [];
      const TK = new RegExp(`(${G7_SURNAME_TOKEN}\\.?)|(&)|(\\band\\b)|(,)`, 'g');
      let t;
      while ((t = TK.exec(run)) !== null) toks.push({ w: t[0], word: !!t[1], conn: !!(t[2] || t[3]), amp: !!t[2], s: t.index, e: t.index + t[0].length });
      // 0. a firm name ends at its first suffix; the run may go on into the next name ("... Law Offices and Santos-Lim Trading")
      for (let i = 0; i < toks.length; i++) {
        const w1 = toks[i].word ? toks[i].w.replace(/\.$/, '') : '', w0 = i > 0 && toks[i - 1].word ? toks[i - 1].w : '';
        const closes = G7_FIRM_SUFFIX_RE.test(w1) || (w0 && G7_FIRM_SUFFIX_RE.test(w0 + ' ' + w1)) ||
          (i > 0 && toks[i - 1].conn && /^(?:Associates|Partners|Co|Company)$/.test(w1) && (toks[i - 1].amp || /^(?:Associates|Partners)$/.test(w1)));
        const lawNext = toks[i + 2] && toks[i + 1].word && toks[i + 2].word && G7_FIRM_SUFFIX_RE.test(toks[i + 1].w + ' ' + toks[i + 2].w);
        if (closes && !lawNext) { toks.length = i + 1; break; }
      }
      // 1. firm suffix at the end
      let end = toks.length, kind = '';
      const words = i => toks[i] && toks[i].word ? toks[i].w.replace(/\.$/, '') : '';
      const lastW = end - 1;
      if (/^Co(?:mpany)?$/.test(words(lastW)) && toks[lastW - 1] && toks[lastW - 1].amp) { kind = 'co'; end = lastW - 1; }
      else if (/^(?:Associates|Partners)$/.test(words(lastW)) && toks[lastW - 1] && toks[lastW - 1].conn) { kind = 'assoc'; end = lastW - 1; }
      else if (lastW >= 1 && G7_FIRM_SUFFIX_RE.test(words(lastW - 1) + ' ' + words(lastW))) { kind = 'law'; end = lastW - 1; }
      else if (G7_FIRM_SUFFIX_RE.test(words(lastW))) { kind = 'law'; end = lastW; }
      // 2. name part: trim leading words that cannot be surnames; commas between names are dropped from the count
      let begin = 0;
      while (begin < end && (!toks[begin].word || g7IsCommonWord(toks[begin].w))) begin++;
      // trailing connectors / commas
      while (end > begin && !toks[end - 1].word) end--;
      const nameToks = toks.slice(begin, end).filter(x => x.word);
      if (nameToks.length < 1) continue;
      if (nameToks.some(x => g7IsCommonWord(x.w) || x.w.length < 2)) {
        // a common word inside the run: keep only the last stretch of surname-like words
        let k = end - 1; while (k >= begin && (!toks[k].word || !g7IsCommonWord(toks[k].w))) k--;
        begin = k + 1; while (begin < end && !toks[begin].word) begin++;
      }
      const names = toks.slice(begin, end).filter(x => x.word);
      const hasConn = toks.slice(begin, end).some(x => x.conn);
      let spanEnd;
      if (kind === 'co' || kind === 'assoc') {
        if (names.length < 1 || names.length > 4) continue;
        if (kind === 'assoc' && names.length < 1) continue;
        spanEnd = toks[toks.length - 1].e;
      } else if (kind === 'law') {
        if (names.length < 2 || names.length > 5) continue;   // "Best Law Firm", "Family Law Firm": one stray word is not a firm name
        spanEnd = toks[toks.length - 1].e;
      } else {
        // no suffix: at least two surnames joined by a connector, and a cue before the run
        if (names.length < 2 || names.length > 5 || !hasConn) continue;
        const ends = toks[end - 1].e, s0 = runStart + toks[begin].s;
        const before = text.slice(Math.max(0, s0 - 90), s0);
        const usesAmp = toks.slice(begin, end).some(x => x.amp);
        // affiliation cue: "&" accepts any of them; "and" only the employer prepositions (at / for / by), because "works with A and B" names people
        const affil = hasOrgAffiliationCue(text, s0) && (usesAmp || /\b(?:at|for|by)\s+(?:the\s+)?$/i.test(before));
        if (!(G7_FIRM_CUE_RE.test(before) || affil)) continue;
        spanEnd = ends;
      }
      if (kind === 'law' || kind === 'co' || kind === 'assoc') {
        // the surnames of a suffixed firm have to be real words of a name: reject if the first one is a person's given name followed by a verb etc.
        if (names.some(x => g7IsCommonWord(x.w))) continue;
      }
      let span = text.slice(runStart + toks[begin].s, runStart + spanEnd).replace(/\s+/g, ' ').replace(/\s+,/g, ',');
      if (/[.]$/.test(span) && !/\b(?:Co|Inc|Ltd)\.$/.test(span)) span = span.replace(/\.$/, '');
      if (span.split(/\s+/).length < 2) continue;
      push(span, 'Law/audit firm');
    }
  }

  // religious bodies always; civic bodies unless used as a location
  const G7_HEAD_RE = /\b(Archdiocese|Diocese|Prelature|Vicariate|Eparchy|Province|Municipality)\s+of\s+((?:the\s+)?)([A-Z][A-Za-zñÑ'’-]*(?:\s+(?:(?:de|del|dela|ng|la|las)\s+)*[A-Z][A-Za-zñÑ'’-]*){0,3})/g;
  const G7_LOCATIVE_BEFORE_RE = /\b(?:in|within|near|across|around|throughout|outside|inside|to|into|through|toward|towards|visit(?:ed|ing)?|born)\s+(?:the\s+)?$/i;
  function g7PlaceKnown(phrase) {
    try { if (typeof PH_ADDRESS_DB !== 'undefined' && PH_ADDRESS_DB && PH_ADDRESS_DB.isPlaceNameExact && PH_ADDRESS_DB.isPlaceNameExact(phrase)) return true; } catch (_) { /* optional */ }
    return PLACE_NAME_WORDS.has(phrase.toLowerCase());
  }
  // the longest prefix of a capitalised word run that is a place; returns the number of words (0 = none)
  function g7PlacePrefix(ws, allowUnknownFirst) {
    for (let k = ws.length; k >= 1; k--) if (g7PlaceKnown(ws.slice(0, k).join(' '))) return k;
    if (allowUnknownFirst && ws.length && !g7IsCommonWord(ws[0]) && ws[0].length >= 3) {
      let k = 1;
      while (k < ws.length && g7PlaceKnown(ws[k])) k++;
      return k;
    }
    return 0;
  }
  function findOrgsInstitutionOfPlace(text, push) {
    let m;
    G7_HEAD_RE.lastIndex = 0;
    while ((m = G7_HEAD_RE.exec(text)) !== null) {
      const head = m[1], religious = /^(?:Archdiocese|Diocese|Prelature|Vicariate|Eparchy)$/.test(head);
      const ws = m[3].split(/\s+/);
      const k = g7PlacePrefix(ws, religious);
      if (!k) continue;
      if (!religious && G7_LOCATIVE_BEFORE_RE.test(text.slice(Math.max(0, m.index - 30), m.index)) && !hasOrgAffiliationCue(text, m.index)) continue;
      const placeText = ws.slice(0, k).join(' ');
      push(`${head} of ${m[2]}${placeText}`, 'Institution of place');
    }
  }

  // ── known brand + descriptor ───────────────────────────────────────────
  let G7_BRANDS = null;
  // Brand evidence from the organization dictionary (built once): (1) a complete single-word entry; (2) the first word of at least 2 entries;
  // (3) a short upper-case first word of an entry or of a parenthetical alternate name ("Banco de Oro (BDO Unibank)" gives "bdo").
  function getOrgBrandTokens() {
    if (G7_BRANDS) return G7_BRANDS;
    const single = new Set(), firstCount = new Map(), caps = new Set();
    for (const org of EXTENSIVE_ORGANIZATIONS_ARRAY) {
      const o = String(org);
      const words = o.split(/\s+/);
      const w0 = words[0].toLowerCase();
      if (words.length === 1) single.add(w0);
      else firstCount.set(w0, (firstCount.get(w0) || 0) + 1);
      const pm = o.match(/\(([^)]+)\)/);
      if (pm) { const w = pm[1].trim().split(/\s+/)[0]; if (/^[A-Z]{2,6}$/.test(w)) caps.add(w.toLowerCase()); }
      if (/^[A-Z]{2,6}$/.test(words[0]) && words.length > 1) caps.add(w0);
    }
    G7_BRANDS = { single, firstCount, caps };
    return G7_BRANDS;
  }
  function g7IsKnownBrand(tok) {
    if (!tok || tok.length < 2) return false;
    const low = tok.toLowerCase(), B = getOrgBrandTokens();
    const upper = tok === tok.toUpperCase();
    if (upper) return B.caps.has(low) || B.single.has(low);
    if (!/^[A-Z][a-z]/.test(tok)) return false;
    if (g7IsCommonWord(tok) || g7PlaceKnown(tok)) return false;
    return B.single.has(low) || (B.firstCount.get(low) || 0) >= 2;
  }
  const G7_BRAND_DESC_RE = /\b([A-Za-z][A-Za-z0-9&'’-]*)\s+(Unibank|City|Malls?)\b(?:\s+([A-Z][A-Za-zñÑ'’-]*(?:\s+(?:(?:de|del|dela|ng|la|las)\s+)*[A-Z][A-Za-zñÑ'’-]*){0,2}))?/g;
  function findOrgsBrandDescriptor(text, push) {
    let m;
    G7_BRAND_DESC_RE.lastIndex = 0;
    while ((m = G7_BRAND_DESC_RE.exec(text)) !== null) {
      const brand = m[1], desc = m[2];
      if (!g7IsKnownBrand(brand)) continue;
      if (desc === 'Unibank') { push(`${brand} ${desc}`, 'Brand + descriptor'); continue; }
      if (!m[3]) continue;
      const ws = m[3].split(/\s+/);
      const k = g7PlacePrefix(ws, true);
      if (!k) continue;
      push(`${brand} ${desc} ${ws.slice(0, k).join(' ')}`, 'Brand + descriptor + place');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 1 (D1/D2): organizations and places must not ALSO be person names
  // ═══════════════════════════════════════════════════════════════════════
  // One post-pass over all person findings (METHOD 1-4.5), run after every
  // organization detector has finished, so the organization findings can be used as
  // evidence. A person finding is dropped when one of these holds for ALL of its
  // occurrences and no PERSON CUE protects the occurrence:
  //   (a) the occurrence lies inside the span of an nlp_organization finding
  //   (b) the phrase ends in an unambiguous street/campus head word (Street, Avenue, Campus...)
  //   (c) a multi-word phrase has an internal preposition/conjunction/determiner
  //       ("... Without ..."); surname particles (de, dela, van, von, bin, al, el, y...) are exempt
  //   (e) the phrase contains an unmistakable institutional head word (STRONG_ORG_HEAD_WORDS). The full
  //       classifyNameVsOrganization() is NOT used here: its explicit-org list also contains Bank, Group,
  //       Foundation, Center, Office, Team..., which can be real surnames; those need organization evidence (a).
  //   (d) a single word that is a known place name AND is used locatively
  //       ("relocate to <Place>", "in <Place>") with no person cue
  // PERSON CUES (keep the person finding): an honorific before, "my name is / I am / call me"
  // before, a dictionary job title right before ("nurse Grace Cruz"), or an appositive job
  // after ("Maria Santos, a nurse"). A cue does NOT override an organization found by the
  // structural suffix pass (Inc, Corp, Foundation...), which is stronger evidence.
  const PERSON_SURNAME_PARTICLES = new Set([
    'de', 'del', 'dela', 'la', 'los', 'las', 'van', 'von', 'bin', 'al', 'el', 'y', 'der', 'den', 'di', 'da', 'le', 'du'
  ]);
  // Closed-class words that cannot be inside a person name. Auxiliaries and pronouns are left
  // out on purpose: "Will", "May" are real given names.
  const INTERNAL_FUNCTION_WORDS = new Set((
    'the a an this that these those of in on at to from by with without for and or but nor over under into onto upon ' +
    'about after before between through during within against among toward towards versus via'
  ).split(' '));
  // Head words that are never part of a person's name.
  const STRONG_ORG_HEAD_WORDS = new Set([
    'hospital', 'hospitals', 'university', 'universities', 'college', 'colleges', 'school', 'schools', 'academy', 'academies',
    'institute', 'institutes', 'clinic', 'clinics', 'association', 'associations', 'cooperative', 'cooperatives',
    'corporation', 'corporations', 'company', 'companies', 'department', 'dept', 'ministry', 'agency', 'administration',
    'authority', 'organization', 'organizations', 'incorporated', 'inc', 'corp', 'ltd', 'llc', 'llp', 'gmbh', 'enterprises'
  ]);
  const STREET_HEAD_WORDS = new Set([
    'street', 'avenue', 'boulevard', 'blvd', 'highway', 'road', 'expressway', 'campus', 'barangay', 'subdivision'
  ]);
  const GENERIC_PLACE_WORDS = new Set(['paris', 'london', 'tokyo', 'seoul', 'beijing', 'georgia', 'california', 'texas', 'new york']);
  const PLACE_MOTION_WORDS = /\b(?:travel(?:l?ing)?|trip|route|relocat\w*|mov(?:e|es|ed|ing)|fly(?:ing)?|flight|driv(?:e|es|ing)|commut\w*|visit\w*|ship\w*|migrat\w*|transfer\w*|head(?:ing)?|go(?:ing)?|located|based|liv(?:e|es|ed|ing)|resid\w*)\b/i;

  function isKnownPlaceWord(word) {
    const lw = word.toLowerCase();
    if (PLACE_NAME_WORDS.has(lw) || GENERIC_PLACE_WORDS.has(lw)) return true;
    try {
      if (typeof PH_ADDRESS_DB !== 'undefined' && PH_ADDRESS_DB && PH_ADDRESS_DB.isPlaceNameExact) {
        return !!PH_ADDRESS_DB.isPlaceNameExact(word);
      }
    } catch (_) { /* optional data */ }
    return false;
  }

  function isJobPhrase(words) {
    // any contiguous window of 1-3 words is a dictionary job title
    for (let i = 0; i < words.length; i++) {
      for (let n = 1; n <= 3 && i + n <= words.length; n++) {
        if (EXTENSIVE_JOB_TITLES.has(words.slice(i, i + n).join(' '))) return true;
      }
    }
    return false;
  }

  function hasPersonCueAround(text, s, e) {
    const before = text.slice(Math.max(0, s - 40), s);
    if (/\b(?:mr|mrs|ms|miss|mx|dr|prof|atty|engr|arch|sir|madam|hon|fr|rev|sen|gov)\.?\s+$/i.test(before)) return true;      // honorific
    if (/\b(?:my\s+name\s+is|name\s+is|i\s+am|i['’]m|im|call\s+me)\s+$/i.test(before)) return true;                           // self-introduction
    // job title right before ("nurse Grace Cruz"; the normalizer may have inserted a period: "nurse. Grace Cruz")
    const beforeTrim = before.replace(/\.?\s+$/, '');
    const prev = /[,;:!?]$/.test(beforeTrim) ? [] : beforeTrim.split(/\s+/).slice(-3).map(w => w.toLowerCase().replace(/[^a-z-]/g, '')).filter(Boolean);
    for (let n = 1; n <= prev.length; n++) {
      if (EXTENSIVE_JOB_TITLES.has(prev.slice(prev.length - n).join(' '))) return true;
    }
    // appositive job after the name ("Maria Santos, a nurse")
    const am = text.slice(e, e + 70).match(/^\s*,\s*(?:an?|the)\s+([A-Za-z][A-Za-z -]*)/);
    if (am) {
      const w = am[1].toLowerCase().split(/\s+/).slice(0, 4).map(x => x.replace(/[^a-z-]/g, '')).filter(Boolean);
      if (isJobPhrase(w)) return true;
    }
    return false;
  }

  function hasLocativeCue(text, s, e) {
    if (/^['’]s\b/.test(text.slice(e, e + 2))) return false;                                    // possessive: a person
    const before = text.slice(Math.max(0, s - 90), s);
    if (/\b(?:in|at|near|around|within|outside|inside|toward|towards)\s+$/i.test(before)) return true;
    if (/\b(?:to|from)\s+$/i.test(before)) {
      const sentence = before.split(/[.!?]\s/).pop();
      return PLACE_MOTION_WORDS.test(sentence);
    }
    return false;
  }

  // Group 4d: words people address with "Ask/Tell/Thank/Call/Email ..." that are not a person's name
  // Group 8: shrunk from 78 entries to the 4 that are still needed. With the dictionary anchor, a word after a person-directed verb is
  // accepted only if it has a Person tag or is a dictionary name, so words such as 'permission', 'home', 'mom', 'support', 'technology' are
  // rejected without being listed. What remains are words that DO carry a Person tag / dictionary entry but are addressed as a
  // thing: a voice assistant (Alexa), an AI model (Claude), a deity (Jesus), a form of address (sir).
  const ADDRESSEE_NON_NAME_WORDS = new Set(['alexa', 'claude', 'jesus', 'sir']);
  // true when the word following a person-directed verb is evidently not a person's name (see ADDRESSEE_NON_NAME_WORDS)
  function isAddresseeNonName(word) {
    const lc = word.toLowerCase(), tg = isolatedNameTags(word);
    if (ADDRESSEE_NON_NAME_WORDS.has(lc)) return true;
    if (nameHasPersonTag(tg)) return false;
    // Group 8: any single word after a person-directed verb needs an anchor (Compromise Person tag or dictionary name)
    if (NAMES_DICT_AVAILABLE) return true;
    return EXTENSIVE_JOB_TITLES.has(lc) || tg.includes('Plural') || tg.some(t => NAME_CLOSED_TAGS.includes(t));
  }
  const PERSON_DIRECTED_VERB_RE =/^(?:thank(?:s|ed|ing)?|contact(?:s|ed|ing)?|e-?mail(?:s|ed|ing)?|tell(?:s|ing)?|told|ask(?:s|ed|ing)?|call(?:s|ed|ing)?|meet(?:s|ing)?|met|remind(?:s|ed|ing)?|invite[sd]?|inviting)$/i;
  const PERSON_DIRECTED_LEAD_RE = /^(?:thank(?:s|ed|ing)?|contact(?:s|ed|ing)?|e-?mail(?:s|ed|ing)?|tell(?:s|ing)?|told|ask(?:s|ed|ing)?|call(?:s|ed|ing)?|meet(?:s|ing)?|met|remind(?:s|ed|ing)?|invite[sd]?|inviting|sent|send(?:s|ing)?|gave|give[sn]?|giving|help(?:ed|s|ing)?|named?|names)$/i;
  const PERSON_DIRECTED_BEFORE_RE =/\b(?:thank(?:s|ed|ing)?|contact(?:s|ed|ing)?|e-?mail(?:s|ed|ing)?|tell(?:s|ing)?|told|ask(?:s|ed|ing)?|call(?:s|ed|ing)?|meet(?:s|ing)?|met|remind(?:s|ed|ing)?|invite[sd]?|inviting)\s+(?:(?:to|with|for|that)\s+)?$/i;
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 13: occurrence-level filters for dictionary organizations (no policy change)
  //   (a) an occurrence inside an e-mail address ("ramon@meralco.com.ph") is not a mention of the organization;
  //   (b) a SINGLE-WORD organization written entirely in lowercase is kept only if an affiliation cue stands right before it, or if it
  //       shows no sign of being an ordinary word. The only sign is that Compromise's own lexicon lists the word with a verb/adjective/
  //       etc. tag ("target", "smart", "wise"). A determiner or possessive before the word is NOT a sign: "the shopee app", "my gcash
  //       account" are brands (measured: a determiner-based sign lost 100% of real lowercase brands in the/my/our/a frames).
  //       A Title Case or UPPER CASE occurrence is always kept.
  //   A finding survives while at least one occurrence survives.
  // ═══════════════════════════════════════════════════════════════════════
  // true only for a word that Compromise's own lexicon lists with a verb/adjective/etc. tag (unknown words get guessed tags from their
  // suffix: "harpic" -> Adjective, "chowking" -> Gerund; those guesses are not evidence of an ordinary word)
  function isLexiconOrdinaryWord(w) {
    try {
      const lex = window.nlp.world().model.one.lexicon, t = lex[w.toLowerCase()];
      return !!t && COMMON_WORD_TAGS.includes(t);
    } catch (_) { return false; }
  }
  function hasOrgAffiliationCue(text, s) {
    const before = text.slice(Math.max(0, s - 80), s);
    // "works at / worked for / employed by / interning with / formerly with / now at / joined / left ..."
    if (/\b(?:work(?:s|ed|ing)?|employed|hired|intern(?:s|ed|ing)?|joined|left|resigned|formerly|previously|currently|now|staff|seaman)\s+(?:\w+\s+){0,2}?(?:at|for|with|by|from|of|in)\s+(?:the\s+)?$/i.test(before)) return true;
    // "my employer is / our company, ..."
    if (/\b(?:my|our|his|her|their)\s+(?:current\s+|former\s+|previous\s+|prospective\s+)?(?:employer|company|firm|workplace)\b[^.]{0,25}$/i.test(before)) return true;
    // "<job title> at / of / for / with / from <Org>"
    const jm = before.replace(/[\s,]+$/, '').match(/((?:[\w'-]+\s+){0,2}[\w'-]+)\s+(?:at|of|for|with|from)\s*(?:the\s*)?$/i);
    if (jm) {
      const w = jm[1].toLowerCase().split(/\s+/);
      for (let n = 1; n <= w.length; n++) if (EXTENSIVE_JOB_TITLES.has(w.slice(w.length - n).join(' '))) return true;
    }
    // "<First> <Last> from / of <Org>"
    if (/\b[A-Z][\w'’-]+\s+[A-Z][\w'’-]+,?\s+(?:from|of)\s+(?:the\s+)?$/.test(before)) return true;
    // the same in lowercase chat ("rodel aquino of pldt"): one of the two words must be an anchored name
    const lm = before.match(/([a-z][\w'’-]*)\s+([a-z][\w'’-]*),?\s+(?:from|of)\s+(?:the\s+)?$/i);
    if (lm && (nameHasPersonTag(isolatedNameTags(lm[1])) || nameHasPersonTag(isolatedNameTags(lm[2])))) return true;
    // header / record fields: "From: Name, Org", "Employer: Org", "\"employer\": \"Org\""
    if (/(?:^|\n)\s*(?:from|employer|company|organization|affiliation)\s*[:=]\s*[^\n]{0,60}$/i.test(before) || /"(?:employer|company|organization)"\s*:\s*"$/i.test(before)) return true;
    return false;
  }
  function refineOrganizationFindings(findings, text) {
    // normalizePath_C may already have split an address ("ramon. Dizon@meralco. Com. Ph"), so an occurrence counts as "inside an e-mail
    // address" when the whitespace-delimited token that contains it also contains an "@".
    const inEmail = (s, e) => /\S*@\S*$/.test(text.slice(Math.max(0, s - 120), s)) || /^\S*@/.test(text.slice(e, e + 120));
    const drop = new Set();
    findings.forEach((f, idx) => {
      if (f.patternId !== 'nlp_organization' || !f.rawMatch) return;
      const raw = f.rawMatch.trim();
      let occs = jobOccurrences(text, raw);
      if (!occs.length) return;
      occs = occs.filter(([s, e]) => !inEmail(s, e));
      if (!occs.length) { drop.add(idx); console.debug(`[PATH_C/G13] Dropped organization inside e-mail address: "${raw}"`); return; }
      if (/\s/.test(raw)) return;
      const commonTag = isLexiconOrdinaryWord(raw);
      occs = occs.filter(([s, e]) => {
        const seg = text.slice(s, e);
        if (seg !== seg.toLowerCase()) return true;                                  // Title Case / UPPER CASE
        if (hasOrgAffiliationCue(text, s)) return true;
        return !commonTag;
      });
      if (!occs.length) { drop.add(idx); console.debug(`[PATH_C/G13] Dropped lowercase ordinary-word organization: "${raw}"`); }
    });
    return findings.filter((_, i) => !drop.has(i));
  }

  function suppressPersonsAsOrganizationsOrPlaces(findings, text) {
    const orgs = findings
      .filter(f => f.patternId === 'nlp_organization' && f.rawMatch)
      .map(o => ({ o, spans: jobOccurrences(text, o.rawMatch) }));
    const drop = new Set();
    findings.forEach((f, idx) => {
      if (f.patternId !== 'nlp_person_name' || !f.rawMatch) return;
      const raw = f.rawMatch.trim();
      const occs = jobOccurrences(text, raw);
      if (!occs.length) return;
      const words = raw.split(/\s+/);
      const cued = occs.map(([s, e]) => hasPersonCueAround(text, s, e));
      // (a) inside an organization span
      const absorbed = occs.every(([s, e], i) => orgs.some(({ o, spans }) =>
        spans.some(([os, oe]) => s >= os && e <= oe) && !(cued[i] && o.source !== 'structural_match')));
      if (absorbed) { drop.add(idx); console.debug(`[PATH_C/G1] Dropped person inside organization: "${raw}"`); return; }
      if (cued.some(Boolean)) return;
      // (b) street / campus head word
      if (words.length >= 2 && STREET_HEAD_WORDS.has(words[words.length - 1].toLowerCase())) {
        drop.add(idx); console.debug(`[PATH_C/G1] Dropped person (street/campus head): "${raw}"`); return;
      }
      // (c) internal function word (not a surname particle)
      if (words.length >= 2 && words.slice(1).some(w => {
        const lw = w.toLowerCase();
        return !PERSON_SURNAME_PARTICLES.has(lw) && INTERNAL_FUNCTION_WORDS.has(lw);
      })) {
        drop.add(idx); console.debug(`[PATH_C/G1] Dropped person (internal function word): "${raw}"`); return;
      }
      // (e) an unmistakable institutional head word (Hospital, University, Inc...) closes the question even when
      //     no organization finding exists (METHOD 1/2/3/4.5 had no such guard).
      if (words.length >= 2 && words.some(w => STRONG_ORG_HEAD_WORDS.has(w.toLowerCase().replace(/\.$/, '')))) {
        drop.add(idx); console.debug(`[PATH_C/G1] Dropped person (institutional head word): "${raw}"`); return;
      }
      // (e2) Group 11: a candidate that is ONLY a head word, with or without a determiner ("University", "The Bank"), is not a person.
      //      (A cue above, or a second word such as "Hannah Bank", keeps the finding.)
      //      Uses the existing organization head-word lists. STRONG_ORG_HEAD_WORDS alone omits Bank/Office/Bureau/Group/Foundation (they can be
      //      real surnames, so they must not close a two-word case such as "Hannah Bank"), but a bare one of them is not a name.
      if (words.length === 1 && (w0 => STRONG_ORG_HEAD_WORDS.has(w0) || RUN_ORG_HEAD_WORDS.has(w0))(words[0].toLowerCase().replace(/\.$/, ''))) {
        drop.add(idx); console.debug(`[PATH_C/G1] Dropped person (bare head word): "${raw}"`); return;
      }
      // (d) single-word place used locatively
      if (words.length === 1 && isKnownPlaceWord(raw) && occs.every(([s, e]) => hasLocativeCue(text, s, e))) {
        drop.add(idx); console.debug(`[PATH_C/G1] Dropped person (place in locative context): "${raw}"`); return;
      }
      // (f) Group 4c: a 1-2 word finding that IS an exact place name ("Baguio", "Nueva Ecija", "Compare Tarlac" = verb + place) and has no
      //     cue is a place, not a person. A person-directed verb (thank, contact, email, tell, ask, call, meet, remind, invite) right
      //     before it, or as its own first word, protects it; place verbs (visit, go to, travel to, compare) do not.
      if (words.length <= 2) {
        const tk = words.map(w => w.replace(/[.,]$/, ''));
        // a place verb (visit, compare, travel...) or any ordinary word without a Person tag in front of the place
        const leadVerb = tk.length === 2 && !nameHasPersonTag(isolatedNameTags(tk[0])) &&
          (isOrdinaryNonNameWord(tk[0]) || /^(?:compar\w*|visit\w*|explor\w*|tour\w*|see|seeing|trip|travel\w*|go|going|fly|flying|drive|driving|mov\w*|relocat\w*)$/i.test(tk[0]));
        const placePart = leadVerb ? tk[1] : tk.join(' ');
        if (isKnownPlaceWord(placePart) && !(leadVerb && PERSON_DIRECTED_VERB_RE.test(tk[0])) &&
            !occs.some(([s]) => PERSON_DIRECTED_BEFORE_RE.test(text.slice(Math.max(0, s - 30), s)))) {
          drop.add(idx); console.debug(`[PATH_C/G1] Dropped person (exact place name, no person cue): "${raw}"`);
        }
      }
    });
    return findings.filter((_, i) => !drop.has(i));   // always a new array (the caller replaces the contents in place)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 3 (D6): names that are not names
  // ═══════════════════════════════════════════════════════════════════════
  // One post-pass over the person findings (METHOD 1-4.5), run before the Group 1 pass.
  //   R1  a bare honorific (Mr, Dr, Ms...) is never a name; a leading honorific is stripped from a span.
  //   R3  a leading verb is stripped from a span ("Tell X Y", "Thank X"): Compromise tags the first token as a
  //       Verb and NOT as a Person, either in context or on its own. Real first names that are also verbs
  //       (Mark, Will, Grace, Hope...) are tagged Person by Compromise and are kept.
  //   R4  a leading dictionary job title is stripped ("Nurse X", "Engineer X Y") unless the word is itself tagged
  //       Person (Mason, Miller, Taylor...), and only when at least two tokens remain or the next token is a
  //       first name. A trailing "<level word> <title>" ("Senior Accountant") is stripped; a trailing title that
  //       is already reported as a nlp_job_title span of 2+ words is stripped; a span lying wholly inside a
  //       nlp_job_title finding is dropped. A single trailing title word is NEVER stripped (it may be a surname).
  //   Re-bound: after leading tokens were stripped, the span is extended to the right by the same number of
  //       Title-Case tokens, because the extractor's 3-word cap had cut the name ("Thank Nurse Karen" Tiongson).
  //   R5  label words (Section, Grade, Class...) before a name-like word, or a single word followed by a digit
  //       ("Grade 6"), are designations, not names.
  //   R2  a single-word candidate is rejected when Compromise tags the lowercase word as a question word,
  //       determiner, pronoun, preposition, conjunction, adverb, expression, number, weekday, month or date, or
  //       when it is an indefinite pronoun (someone, everybody...). Month names that are also first names
  //       (May, April, June, August, March, Jun) are rejected only after a date preposition or before a digit;
  //       otherwise they are kept ("write to May"). A PERSON CUE (honorific before, "my name is", title before,
  //       appositive job after) always keeps the candidate.
  //   R6  heading guard: a candidate inside a run of Title-Case words (3+ other capitalised content words, run
  //       broken by commas, periods, pipes, digits or lowercase content words) is dropped unless a person cue
  //       exists or at least half of its tokens carry a Compromise Person/FirstName/LastName tag.
  //       KNOWN LIMIT: in a prompt written ENTIRELY in Title Case, a name Compromise does not know (many Filipino
  //       first names: measured recall about 0.66 on a fictional list) is dropped by this guard. Set
  //       PERSON_HEADING_GUARD_ENABLED to false to disable it.
  //   R7  a finding whose every occurrence lies inside a longer person finding is a duplicate fragment: dropped.
  //   R8  a multi-word phrase made mostly of ordinary dictionary words, with no Person tag on any token and no cue, is
  //       dropped ("Quarterly Report Template"). Compromise gives an unknown name only Noun/Singular and a known ordinary
  //       word an extra Verb/Adjective/Uncountable/... tag; test-compromise-pin.js fails if that behaviour changes.
  //   3b  Filipino honorific / kinship prefixes (Aling, Mang, Kapitan, Tita, Kuya...) and a leading preposition ("Per X Y")
  //       are stripped like R1; Don, Dona, Ka, Kap are stripped only when Compromise does not tag them as a Person.
  //       A span that is only honorifics / prefixes is re-bounded onto the Title-Case tokens that follow it.
  //
  //   3c  METHOD 4 no longer rejects a candidate whose ONLY non-name word is a leading person-directed verb (LEAD_PERSON_VERBS:
  //       contact, email, called, told, asked, sent, gave, helped, named, thanked, met) when Compromise tags at least one
  //       remaining word as a Person; the leading strip removes that verb (it also uses the list, because Compromise tags
  //       "Email" as a noun). R10: after a verb strip, a 3+ token remainder with no Person tag and no cue is dropped.
  //       A month name after "from" is a date only if a digit, a dash, or a range word + month/digit/date word follows.
  //
  // KNOWN LIMITATIONS (measured; see test-group3-names.js, test-group3b-r8.js, test-group3b-prefixes.js):
  //   - Surname-as-leading-title: a leading word that is a dictionary title and not Person-tagged by Compromise
  //     (Baker, Cook, Porter, Butler, Sawyer, Archer, Carpenter...) is stripped when two or more tokens follow, so
  //     "Baker Anne Reyes" is reported as "Anne Reyes". Surname-last order ("Anne Reyes Baker") is not affected.
  //   - Title Case-only prompts: the extractors do not find names at all in a prompt written entirely in Title Case
  //     (the METHOD 4 regex consumes the words into overlapping chunks that the non-name filter then rejects). This was
  //     0 of 16 before Group 3 and is still 0 of 16; Group 3 did not cause it and does not fix it.
  //   - R6 (heading guard) depends on Compromise for Title Case recall: inside a Title-Case run a name survives only if
  //     a cue exists or at least half of its tokens are Person-tagged, and Compromise misses about a third of Filipino
  //     first names (measured recall about 0.66 on a fictional list). Set PERSON_HEADING_GUARD_ENABLED to false to disable.
  //   - R8 can drop a real two-word name made only of ordinary words with no Person tag (measured: 2 of 140 findable
  //     frames, e.g. Faith Hope and Ruby Rain in Title Case).
  //   - Month names that are also first names are rejected only after a date preposition or before a digit: "Is May
  //     the hottest month" style subjects are kept. "from <Month> until/through <non-date word>" is also kept as a possible name.
  //   - Leading person-directed verb + a name Compromise does not know ("Contact Marites Dalisay"): not found, because a Person
  //     tag on the remainder is required to keep headings like "Contact Lens Care Guide" out (measured: 4 of 22 frames for an
  //     unknown name against 22 of 22 for names Compromise knows).
  const PERSON_HEADING_GUARD_ENABLED = true;
  const NAME_HONORIFIC_TOKENS = new Set([
    'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'atty', 'engr', 'arch', 'sir', 'madam', 'hon', 'fr', 'rev', 'sen', 'gov', 'esq'
  ]);
  const NAME_LABEL_WORDS = new Set([
    'section', 'grade', 'class', 'chapter', 'level', 'room', 'unit', 'batch', 'block', 'lot', 'phase', 'year', 'week',
    'module', 'lesson', 'topic', 'item', 'column', 'figure', 'table'
  ]);
  const INDEFINITE_PRONOUNS = new Set([
    'someone', 'somebody', 'anyone', 'anybody', 'everyone', 'everybody', 'nobody', 'something', 'anything', 'everything',
    'nothing', 'whoever', 'whomever', 'whatever', 'whichever', 'somewhere', 'anywhere', 'everywhere', 'nowhere',
    // quantifiers and discourse words that Compromise does not tag with a closed-class tag on their own
    'many', 'most', 'other', 'another', 'several', 'few', 'some', 'any', 'all', 'both', 'each', 'every', 'here', 'there',
    'still', 'sorry', 'dear', 'thanks', 'regards', 'tonight'
  ]);
  const AMBIGUOUS_MONTH_NAMES = new Set(['may', 'april', 'june', 'august', 'march', 'jun']);
  const DATE_PREPOSITION_BEFORE = /\b(?:in|on|by|until|since|during|before|after|of|this|next|last)\s+$/i;
  // "from <Month>" is a date only when, within the next two tokens, there is a digit, a dash, or a range word
  // (to / until / through / till) that is itself followed by a month name, a digit or another date word:
  // "from May to June", "from May 5", "from May - June" are dates; "from May to the team" and "a message from May"
  // may be a person.
  const MONTH_RANGE_DATE_WORD = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|today|tomorrow|yesterday|tonight)\.?$|^\d/i;
  function monthFromIsDate(text, s, e) {
    if (!/\bfrom\s+$/i.test(text.slice(Math.max(0, s - 8), s))) return false;
    const toks = (text.slice(e, e + 60).match(/\S+/g) || []).map(t => t.replace(/[.,;:]+$/, ''));
    if (toks.slice(0, 2).some(t => /^[-–—]/.test(t) || /^\d/.test(t))) return true;                   // dash or digit
    const i = toks.slice(0, 2).findIndex(t => /^(?:to|until|through|till)$/i.test(t));                // range word ...
    return i >= 0 && !!toks[i + 1] && MONTH_RANGE_DATE_WORD.test(toks[i + 1]);                         // ... followed by a date word
  }
  const TITLE_LEVEL_WORDS = new Set([
    'senior', 'junior', 'chief', 'head', 'assistant', 'associate', 'lead', 'deputy', 'executive', 'staff', 'general', 'principal'
  ]);
  const NAME_CLOSED_TAGS = ['QuestionWord', 'Determiner', 'Pronoun', 'Preposition', 'Conjunction', 'Adverb', 'Expression',
    'Value', 'Negative', 'Date', 'WeekDay', 'Month', 'Time'];
  // Filipino honorifics and kinship / title prefixes. UNAMBIGUOUS ones are always stripped from a name span. The AMBIGUOUS
  // ones are also real given names (Don, Dona, Ka, Kap): they are stripped only when Compromise does not tag the word as a
  // Person, so "Don Santiago" keeps its first name while "Ka Ramon" loses the prefix.
  const FILIPINO_NAME_PREFIXES = new Set([
    'aling', 'aleng', 'mang', 'manong', 'manang', 'kapitan', 'ate', 'kuya', 'tita', 'tito', 'lola', 'lolo', 'ninong', 'ninang'
  ]);
  const FILIPINO_AMBIGUOUS_PREFIXES = new Set(['don', 'dona', 'ka', 'kap']);
  // Person-directed verbs (several are on NON_NAME_WORDS because they are also nouns: "emergency contact", "his email").
  // Used as a leading verb they introduce a person ("Contact Maria Santos about..."): see METHOD 4 and the Group 3 leading strip.
  const LEAD_PERSON_VERBS = new Set(['contact', 'email', 'called', 'told', 'asked', 'sent', 'gave', 'helped', 'named', 'thanked', 'met']);
  const COMMON_WORD_TAGS = ['Verb', 'Adjective', 'Adverb', 'Preposition', 'Uncountable', 'Gerund', 'Conjunction', 'Determiner', 'Pronoun', 'Modal', 'Auxiliary'];
  const PERSON_TAG_NAMES =['Person', 'FirstName', 'LastName', 'MaleName', 'FemaleName'];
  const RUN_FUNCTION_WORDS = new Set('of for and the a an to in on at by with from na ng sa y de del la los las or nor but vs'.split(' '));
  const _isolatedTagCache = new Map();
  const _contextTagCache = new Map();

  function nameHasPersonTag(tags) { return !!tags && tags.some(t => PERSON_TAG_NAMES.includes(t)); }

  function isolatedNameTags(word) {
    const lw = word.toLowerCase();
    if (_isolatedTagCache.has(lw)) return _isolatedTagCache.get(lw);
    let tags = [];
    try {
      if (typeof window !== 'undefined' && window.nlp) {
        const j = window.nlp(lw).json({ terms: { tags: true } });
        tags = (j[0] && j[0].terms[0] && j[0].terms[0].tags) || [];
      }
    } catch (_) { tags = []; }
    // Group 8: a word in the common-names dictionary counts as a Person word, exactly like Compromise's own Person tag
    if (isKnownNameWord(word) && !tags.includes('Person')) tags = tags.concat(['Person', 'NameDictionary']);
    _isolatedTagCache.set(lw, tags);
    return tags;
  }

  // Compromise tags of the terms in the sentence window that contains [s, e)
  function contextNameTerms(text, s, e) {
    const from = Math.max(0, Math.max(text.lastIndexOf('. ', s - 1), text.lastIndexOf('? ', s - 1), text.lastIndexOf('! ', s - 1), text.lastIndexOf('"', s - 1)) + 1);
    const win = text.slice(from, Math.min(text.length, e + 60)).trim();
    if (_contextTagCache.has(win)) return _contextTagCache.get(win);
    let terms = [];
    try {
      if (typeof window !== 'undefined' && window.nlp) {
        terms = window.nlp(win).json({ terms: { tags: true } }).reduce((acc, sent) => acc.concat(sent.terms || []), []);
      }
    } catch (_) { terms = []; }
    _contextTagCache.set(win, terms);
    return terms;
  }

  function nameTagsFor(terms, word) {
    const t = terms.find(x => x.text === word) || terms.find(x => (x.text || '').toLowerCase() === word.toLowerCase());
    const tags = (t && t.tags) || [];
    return isKnownNameWord(word) && !tags.includes('Person') ? tags.concat(['Person', 'NameDictionary']) : tags;   // Group 8
  }

  // true when [s, e) sits in a run of Title-Case words with 3+ OTHER capitalised content words
  function inTitleCaseRun(text, s, e) {
    const TOK = /[A-Za-z][A-Za-z'’-]*|:|[,.;!?|•\n\r\t]+|[0-9]+|[^\sA-Za-z0-9]/g;
    const walk = (chunk, backwards) => {
      const toks = chunk.match(TOK) || [];
      if (backwards) toks.reverse();
      let n = 0;
      for (const t of toks) {
        if (t === ':') continue;
        if (/^[A-Za-z]/.test(t)) {
          if (/^[A-Z]/.test(t)) { if (!RUN_FUNCTION_WORDS.has(t.toLowerCase())) n++; continue; }
          if (RUN_FUNCTION_WORDS.has(t)) continue;
        }
        break;
      }
      return n;
    };
    const others = walk(text.slice(Math.max(0, s - 220), s), true) + walk(text.slice(e, e + 220), false);
    return others >= 3;
  }

  function refinePersonCandidates(findings, text) {
    const persons = findings.filter(f => f.patternId === 'nlp_person_name' && f.rawMatch);
    if (!persons.length) return findings.slice();   // always a new array: the caller clears and refills the original in place
    const core = w => w.replace(/^["'“‘(]+/, '').replace(/[.,;:!?)"”’]+$/, '');
    const jobSpans = findings.filter(f => f.patternId === 'nlp_job_title' && f.rawMatch)
      .flatMap(j => jobOccurrences(text, j.rawMatch).map(([s, e]) => [s, e]));
    const orgSpans = findings.filter(f => f.patternId === 'nlp_organization' && f.rawMatch)
      .flatMap(o => jobOccurrences(text, o.rawMatch).map(([s, e]) => [s, e]));
    const clipSpans = jobSpans.concat(orgSpans);   // a person span stops where a job-title or organization span begins
    const drop = new Set();
    const strippedVerbOf = new WeakMap();   // finding -> the leading verb that was stripped from it

    persons.forEach(f => {
      const raw = f.rawMatch.trim();
      const occs = jobOccurrences(text, raw);
      if (!occs.length) return;
      const [s0, e0] = occs[0];
      const toks = []; { const re = /\S+/g, sub = text.slice(s0, e0); let m; while ((m = re.exec(sub)) !== null) toks.push({ w: core(m[0]), s: s0 + m.index, e: s0 + m.index + m[0].length }); }
      if (!toks.length) return;
      const cuedAt = (s, e) => hasPersonCueAround(text, s, e);
      let a = 0, b = toks.length, verbStripped = false;
      const terms = contextNameTerms(text, s0, e0);
      // ── leading strip: honorific (R1), label (R5), verb (R3), dictionary title (R4)
      while (b - a >= 1) {
        const w = toks[a].w, lw = w.toLowerCase();
        if (!w) { a++; continue; }
        if (NAME_HONORIFIC_TOKENS.has(lw) || FILIPINO_NAME_PREFIXES.has(lw)) { a++; continue; }
        if (b - a >= 2) {
          if (NAME_LABEL_WORDS.has(lw)) { b = a; break; }
          const ctx = nameTagsFor(terms, w);
          const iso = isolatedNameTags(w);
          if (FILIPINO_AMBIGUOUS_PREFIXES.has(lw) && !nameHasPersonTag(ctx) && !nameHasPersonTag(iso)) { a++; continue; }
          // a leading preposition ("Per Elena Cruz") is stripped when at least two tokens remain ("Per Andersson" is kept)
          if (b - a >= 3 && iso.includes('Preposition') && !nameHasPersonTag(iso)) { a++; continue; }
          if ((ctx.includes('Verb') || iso.includes('Verb') || LEAD_PERSON_VERBS.has(lw)) && !nameHasPersonTag(ctx) && !nameHasPersonTag(iso)) {
            // "Hope Santiago will review it": the name is a subject (a verb follows it), so the first word is not an imperative
            const ti = terms.findIndex(x => x.text === toks[0].w);
            const nt = ti >= 0 ? terms[ti + toks.length] : null;
            const subjectUse = nt && (nt.tags || []).some(x => ['Verb', 'Modal', 'Auxiliary', 'Copula'].includes(x));
            if (!subjectUse) { a++; verbStripped = true; strippedVerbOf.set(f, lw); continue; }
          }
          if (EXTENSIVE_JOB_TITLES.has(lw) && !nameHasPersonTag(isolatedNameTags(w))) {
            const next = nameTagsFor(terms, toks[a + 1].w);
            // tokens that remain after the title, counting adjacent Title-Case tokens beyond the extractor's 3-word cap
            let follow = 0, fEnd = toks[b - 1].e, fm;
            while (follow < 2 && (fm = text.slice(fEnd).match(/^ +(\p{Lu}[\p{Ll}\p{M}'’-]+)(?![\p{L}\p{M}'’])/u))) { follow++; fEnd += fm[0].length; }
            if (b - a - 1 + follow >= 2 || next.includes('FirstName')) { a++; continue; }
          }
        }
        break;
      }
      if (b - a < 1) {
        // Only honorifics / prefixes were captured (METHOD 4.5 takes one word: "to Dr.", "call Tita"): the Title-Case
        // tokens that follow them (up to two) are the name, so re-bound onto those instead of dropping the finding.
        if (a >= toks.length) {
          let end = toks[toks.length - 1].e, startPos = -1, got = 0, fm;
          while (got < 2 && (fm = text.slice(end).match(/^\.?[ ]+(\p{Lu}[\p{Ll}\p{M}'’-]+)(?![\p{L}\p{M}'’])/u))) {
            const lw2 = fm[1].toLowerCase();
            if (NAME_HONORIFIC_TOKENS.has(lw2) || FILIPINO_NAME_PREFIXES.has(lw2) || NAME_LABEL_WORDS.has(lw2) || NON_NAME_WORDS.has(lw2) ||
                EXTENSIVE_JOB_TITLES.has(lw2) || isolatedNameTags(fm[1]).some(t => NAME_CLOSED_TAGS.includes(t))) break;
            if (startPos < 0) startPos = end + fm[0].length - fm[1].length;
            end += fm[0].length; got++;
          }
          if (got) { console.debug(`[PATH_C/G3] Re-bounded bare prefix "${raw}" -> "${text.slice(startPos, end)}"`); f.rawMatch = text.slice(startPos, end); return; }
        }
        drop.add(f); console.debug(`[PATH_C/G3] Dropped person (title/label/honorific only): "${raw}"`); return;
      }
      // ── trailing strip (R4): "<level word> <title>" or a 2+ word nlp_job_title span at the end
      if (b - a >= 2) {
        const last = toks[b - 1].w.toLowerCase();
        let k = b - 1;
        if (EXTENSIVE_JOB_TITLES.has(last)) {
          while (k - 1 >= a && TITLE_LEVEL_WORDS.has(toks[k - 1].w.toLowerCase())) k--;
        }
        if (k < b - 1 && k > a) b = k;
        else {
          for (const [js, je] of clipSpans) {
            // Stage d: ANY job or organization span that starts inside the person span (not only one ending exactly at its end)
            // ends the name there.
            if (je > js && js > toks[a].s && js < toks[b - 1].e) {
              const kk = toks.findIndex((t, i) => i >= a && t.s === js);
              if (kk > a) { b = kk; break; }
            }
          }
        }
      }
      // ── span wholly inside a nlp_job_title finding (e.g. "Safety Officer"), no person cue
      const sA = toks[a].s, eB = toks[b - 1].e;
      if (jobSpans.some(([js, je]) => sA >= js && eB <= je) && !cuedAt(sA, eB)) {
        drop.add(f); console.debug(`[PATH_C/G3] Dropped person (inside a job-title span): "${raw}"`); return;
      }
      let newRaw = text.slice(sA, eB).replace(/[.,;:!?]+$/, '');
      // ── re-bound: restore the token budget the stripped leading tokens used
      if (a > 0) {
        let extra = a, end = eB;
        while (extra > 0) {
          const m = text.slice(end).match(/^ +(\p{Lu}[\p{Ll}\p{M}'’-]+)(?![\p{L}\p{M}'’])/u);
          if (!m) break;
          const lw = m[1].toLowerCase();
          if (NAME_HONORIFIC_TOKENS.has(lw) || NAME_LABEL_WORDS.has(lw) || NON_NAME_WORDS.has(lw) || EXTENSIVE_JOB_TITLES.has(lw) ||
              isolatedNameTags(m[1]).some(t => NAME_CLOSED_TAGS.includes(t))) break;
          end += m[0].length; extra--;
        }
        newRaw = text.slice(sA, end);
      }
      // R10: after a leading verb was stripped, capitalisation is the only evidence left. A remainder of 3+ tokens with no
      // Person tag on any token and no cue is a phrase of ordinary words ("Thanked Donors Appreciation Letter"), not a name.
      if (verbStripped && newRaw.split(/\s+/).length >= 3 && !cuedAt(sA, eB) &&
          !newRaw.split(/\s+/).some(w => nameHasPersonTag(nameTagsFor(terms, core(w))))) {
        drop.add(f); console.debug(`[PATH_C/G3] Dropped person (no Person tag after leading verb strip): "${raw}"`); return;
      }
      if (newRaw !== raw) { console.debug(`[PATH_C/G3] Re-bounded person: "${raw}" -> "${newRaw}"`); f.rawMatch = newRaw; }
    });

    // ── single-word rules (R5 digit, R2) and heading guard (R6) on the (possibly trimmed) findings
    persons.forEach(f => {
      if (drop.has(f)) return;
      const raw = f.rawMatch.trim();
      const occs = jobOccurrences(text, raw);
      if (!occs.length) return;
      const cued = occs.some(([s, e]) => hasPersonCueAround(text, s, e));
      const words = raw.split(/\s+/);
      const lw = raw.toLowerCase();
      // Group 4c: a single word left after an ordinary (not person-directed) verb was stripped ("Install Python", "Order Burger") has no
      // evidence of being a name: keep it only with a Person tag or a cue. "Thank Hazel", "Contact Hope", "Thank Grace" are protected by the verb.
      // (and after a person-directed verb the word must not be an evident non-name addressee: "Ask Alexa", "Call Mom", "Thank God")
      if (words.length === 1 && strippedVerbOf.has(f) && PERSON_DIRECTED_LEAD_RE.test(strippedVerbOf.get(f)) && isAddresseeNonName(raw)) {
        drop.add(f); console.debug(`[PATH_C/G3] Dropped person (addressee that is not a name after a person-directed verb): "${raw}"`); return;
      }
      if (words.length === 1 && !cued && strippedVerbOf.has(f) && !PERSON_DIRECTED_LEAD_RE.test(strippedVerbOf.get(f)) && !nameHasPersonTag(isolatedNameTags(raw))) {
        drop.add(f); console.debug(`[PATH_C/G3] Dropped person (single word after an ordinary verb, no Person tag): "${raw}"`); return;
      }
      if (words.length === 1 && !cued) {
        let why = null;
        if (NAME_HONORIFIC_TOKENS.has(lw)) why = 'honorific';
        else if (NAME_LABEL_WORDS.has(lw)) why = 'label word';
        else if (occs.every(([s, e]) => /^\s*\d/.test(text.slice(e, e + 4)))) why = 'followed by a digit';
        else if (INDEFINITE_PRONOUNS.has(lw)) why = 'indefinite pronoun';
        else {
          const t = isolatedNameTags(raw);
          // (the set is used directly: Compromise 14.12.0 tags april/june/august/jun as Month but NOT "may" (Modal) or "march" (Noun))
          if (AMBIGUOUS_MONTH_NAMES.has(lw)) {
            if (occs.every(([s, e]) => /^\s*\d/.test(text.slice(e, e + 4)) || DATE_PREPOSITION_BEFORE.test(text.slice(Math.max(0, s - 14), s)) || monthFromIsDate(text, s, e))) why = 'month/date use';
          } else if (t.some(x => NAME_CLOSED_TAGS.includes(x))) why = 'function/question/date word';
        }
        if (why) { drop.add(f); console.debug(`[PATH_C/G3] Dropped person (${why}): "${raw}"`); return; }
      }
      // R8: a multi-word phrase made mostly of ordinary dictionary words and with no Person tag on any token
      // ("Quarterly Report Template", "Rice Without"). Compromise gives an unknown name only Noun/Singular, and a
      // known ordinary word an extra Verb/Adjective/Uncountable/... tag. A single Person tag or a cue protects.
      if (words.length >= 2 && !cued) {
        const terms8 = contextNameTerms(text, occs[0][0], occs[0][1]);
        const per = words.map(w => ({ ctx: nameTagsFor(terms8, core(w)), iso: isolatedNameTags(w) }));
        const anyPerson = per.some(t => nameHasPersonTag(t.ctx) || nameHasPersonTag(t.iso));
        const common = per.filter(t => t.iso.some(x => COMMON_WORD_TAGS.includes(x))).length;
        if (!anyPerson && common * 2 > words.length) { drop.add(f); console.debug(`[PATH_C/G3] Dropped person (phrase of ordinary words): "${raw}"`); return; }
      }
      // Inside a Title-Case run a job word before the name ("How To Cook Sinigang...") is not evidence, so only the strong
      // cues count there: honorific, self-introduction, or a sign-off line ("Best regards, <Name>").
      const strongCue = occs.some(([s, e]) => {
        const before = text.slice(Math.max(0, s - 40), s);
        return /\b(?:mr|mrs|ms|miss|mx|dr|prof|atty|engr|arch|sir|madam|hon|fr|rev|sen|gov)\.?\s+$/i.test(before) ||
          /\b(?:my\s+name\s+is|name\s+is|i\s+am|i['’]m|im|call\s+me)\s+$/i.test(before) ||
          /\b(?:regards|sincerely|thanks|thank\s+you|cheers|respectfully|yours\s+truly|best|warmly|faithfully|gratefully)[,!]?\s*$/i.test(before);
      });
      // only occurrences written exactly like the finding count: a lowercase mention elsewhere is not evidence about a Title-Case one
      const exactOccs = occs.filter(([s, e]) => text.slice(s, e) === raw);
      if (PERSON_HEADING_GUARD_ENABLED && !strongCue && exactOccs.length && exactOccs.every(([s, e]) => inTitleCaseRun(text, s, e))) {
        const terms = contextNameTerms(text, occs[0][0], occs[0][1]);
        const tagged = words.filter(w => nameHasPersonTag(nameTagsFor(terms, core(w)))).length;
        if (tagged < Math.ceil(words.length / 2)) { drop.add(f); console.debug(`[PATH_C/G3] Dropped person (Title-Case heading run, no person evidence): "${raw}"`); }
      }
    });

    // ── R7: exact duplicates, and fragments lying wholly inside a longer person finding
    const live = persons.filter(f => !drop.has(f));
    const seen = new Set();
    live.forEach(f => { const k = f.rawMatch.trim().toLowerCase(); if (seen.has(k)) drop.add(f); else seen.add(k); });
    const liveOcc = live.filter(f => !drop.has(f)).map(f => ({ f, occs: jobOccurrences(text, f.rawMatch.trim()) }));
    liveOcc.forEach(({ f, occs }) => {
      if (!occs.length) return;
      const inside = occs.every(([s, e]) => liveOcc.some(o => o.f !== f && o.occs.some(([os, oe]) => s >= os && e <= oe && (oe - os) > (e - s))));
      if (inside) { drop.add(f); console.debug(`[PATH_C/G3] Dropped person fragment inside a longer person finding: "${f.rawMatch}"`); }
    });
    return findings.filter(f => !drop.has(f));
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
        // The trigger words accept an upper-case first letter so a sentence-initial
        // "My name is Carlo" / "Call me Maria" matches. The captured name stays
        // case-sensitive (Title Case only) so common nouns are not captured.
        // (The path normalizer capitalises the first character of the prompt,
        // so a prompt that begins with this phrase always arrives as "My name is".)
        new RegExp(String.raw`\b[Mm]y\s+[Nn]ame\s+[Ii]s\s+(${NAME_RUN1})${NAME_RB}`, 'gu'),
        new RegExp(String.raw`\b(?:i\s+)?(?:am|'m)\s+(${NAME_RUN1})${NAME_RB}`, 'gu'),
        new RegExp(String.raw`\b[Cc]all\s+me\s+(${NAME_RUN1})${NAME_RB}`, 'gu'),
        new RegExp(String.raw`\bi['’]m\s+called\s+(${NAME_RUN1})${NAME_RB}`, 'gu'),
      ];
      
      for (const pattern of nameTriggerPatterns) {
        let match;
        while ((match = pattern.exec(textNLP)) !== null) {
          // Group 4: the run can now be up to six words. Trailing words that cannot be part of a name (a job title, a
          // closed-class word or a known non-name word: "my name is Ana Cruz Manager at ...") are cut off, so the name keeps its own words.
          let name = match[1].trim();
          for (let tw = name.split(/\s+/); tw.length > 1; tw = name.split(/\s+/)) {
            const lastW = tw[tw.length - 1], lw = lastW.toLowerCase(), lt = isolatedNameTags(lastW);
            if (!(NON_NAME_WORDS.has(lw) || EXTENSIVE_JOB_TITLES.has(lw) || (lt.some(t => NAME_CLOSED_TAGS.includes(t)) && !nameHasPersonTag(lt)))) break;
            name = tw.slice(0, -1).join(' ');
          }

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
      const subjectNamePattern = new RegExp(String.raw`${NAME_LB}(${NAME_RUN1})\s+(?:is|are|was|were|said|told|asked|explained|works|worked|goes|went|comes|came|living|lived|named|called)\b`, 'gu');
      
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
      const standaloneNamePattern = nameRunMatcher(textNLP, NAME_RUN2);
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
        {
          const nonNameHits = words.filter(w => NON_NAME_WORDS.has(w.toLowerCase()));
          // Group 3c: a person-directed verb that is ONLY the first word ("Contact Maria Santos") is not evidence against a
          // name, provided Compromise tags at least one of the remaining words as a Person. The Group 3 pass strips the verb.
          let leadVerbPass = false;
          if (nonNameHits.length === 1 && nonNameHits[0] === words[0] && words.length >= 2 && LEAD_PERSON_VERBS.has(words[0].toLowerCase())) {
            const leadTerms = contextNameTerms(textNLP, standaloneMatch.index, standaloneMatch.index + candidateName.length);
            leadVerbPass = words.slice(1).some(w => nameHasPersonTag(nameTagsFor(leadTerms, w)));
          }
          if (nonNameHits.length && !leadVerbPass) {
            console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - contains non-name word: ${nonNameHits.join(', ')}`);
            continue;
          }
        }

        // ★ FIX (DEF-003/DEF-005): Reject organization names and place/country
        // names that compromise and the capitalized-phrase heuristic mis-tag as
        // people — e.g. "Mapua Malayan Colleges", "Saudi Arabia". These are
        // captured by the dedicated org extractor / location pattern instead.
        if (classifyPersonRun(candidateName, textNLP.slice(standaloneMatch.index + candidateName.length, standaloneMatch.index + candidateName.length + 4)) === 'organization') {
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
        // Group 4: the suffix must be a whole word ("Co", not the "co" of "co-authored")
        if (/^\s*,?\s*(?:inc|corp|corporation|incorporated|ltd|limited|llc|llp|co|company|enterprises?|holdings|ventures|group)(?![\p{L}\p{M}\d'’-])\.?/iu.test(afterMatch)) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - followed by corporate suffix (organization): "${candidateName}"`);
          continue;
        }
        
        // Cause B: an unanchored Title Case phrase needs name evidence (dictionary / Compromise person tag / cue / initials)
        if (NAMES_DICT_AVAILABLE && !standaloneHasNameEvidence(textNLP, standaloneMatch.index + Math.max(0, standaloneMatch[0].indexOf(candidateName)), candidateName)) {
          console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - no name evidence: "${candidateName}"`);
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

      // D3: Structural org pass — runs after CSV to avoid re-detecting CSV hits.
      // Build a set of lower-cased rawMatches already found so structural can
      // skip them.  We pass the set by reference so structural can also mark its
      // own hits (prevents duplicate structural matches within the same call).
      const csvOrgFoundLower = new Set(
        csvOrgFindings.map(o => (o.rawMatch || o.name).toLowerCase())
      );
      const structuralOrgFindings = findOrganizationsStructural(textNLP, csvOrgFoundLower);
      console.debug(`[TrustPrompt/PATH_C] Structural Org Findings: ${structuralOrgFindings.length}`);
      
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
        // D4 FIX: CSV exact-match findings are trusted over the place heuristic.
        // "Cebu Pacific" is a real registered org in the CSV; dropping it because
        // "cebu" is in PLACE_NAME_WORDS produces a false negative.  We only apply
        // the place filter to non-exact findings (fuzzy / keyword / structural).
        if (org.source !== 'csv_exact_match' && looksLikePlaceName(orgRaw)) {
          console.debug(`[TrustPrompt/PATH_C] Filtered non-exact CSV org (place name): "${orgRaw}"`);
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

      // D3: Push structural org findings (not run through Compromise validation).
      // Apply the same shouldFilterCommonOrganization and looksLikePlaceName
      // guards that CSV findings pass above.
      for (const org of structuralOrgFindings) {
        const orgRaw = org.rawMatch || org.name;
        if (shouldFilterCommonOrganization(orgRaw)) {
          console.debug(`[TrustPrompt/PATH_C] Filtered structural org (common word): "${orgRaw}"`);
          continue;
        }
        if (!org.g7 && looksLikePlaceName(orgRaw)) {
          console.debug(`[TrustPrompt/PATH_C] Filtered structural org (place name): "${orgRaw}"`);
          continue;
        }
        // Skip if already present as any finding (name or org) with the same rawMatch
        if (findings.some(f => f.rawMatch.toLowerCase() === orgRaw.toLowerCase() && (!org.g7 || f.patternId === 'nlp_organization'))) {
          console.debug(`[TrustPrompt/PATH_C] Skipped structural org (duplicate in findings): "${orgRaw}"`);
          continue;
        }
        findings.push({
          patternId: 'nlp_organization',
          label: 'Organization (structural_match)',
          risk: 'low',
          rawMatch: orgRaw,
          safeVersion: '[ORGANIZATION REDACTED]',
          source: 'C_linguistic',
          confidence: org.confidence,
          csvValidated: false
        });
        console.debug(`[TrustPrompt/PATH_C] Added structural org: "${orgRaw}"`);
      }
      console.debug(`[TrustPrompt/PATH_C] Structural orgs added: ${structuralOrgFindings.length}`);

      // Group 2c fix: containment dedup.  Drop an org finding whose every
      // occurrence in the text lies inside an occurrence of a longer org
      // finding ("Asian Institute" inside "Asian Institute of Management").
      // A short org that also appears on its own elsewhere is kept.
      {
        const occ = (needle) => {
          const out = [], hay = textNLP.toLowerCase(), n = needle.toLowerCase();
          if (!n) return out;
          for (let i = hay.indexOf(n); i !== -1; i = hay.indexOf(n, i + 1)) {
            const before = i === 0 ? ' ' : hay[i - 1], after = i + n.length >= hay.length ? ' ' : hay[i + n.length];
            if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) out.push([i, i + n.length]);
          }
          return out;
        };
        const orgIdx = findings.map((f, i) => (f.patternId === 'nlp_organization' ? i : -1)).filter(i => i >= 0);
        const drop = new Set();
        for (const i of orgIdx) {
          const short = findings[i].rawMatch;
          const shortOcc = occ(short);
          if (!shortOcc.length) continue;
          const longerOcc = [];
          for (const j of orgIdx) {
            const longer = findings[j].rawMatch;
            if (j !== i && longer.length > short.length && longer.toLowerCase().includes(short.toLowerCase())) {
              longerOcc.push(...occ(longer));
            }
          }
          if (longerOcc.length && shortOcc.every(([s, e]) => longerOcc.some(([ls, le]) => s >= ls && e <= le))) drop.add(i);
        }
        if (drop.size) {
          for (const i of [...drop].sort((a, b) => b - a)) {
            console.debug(`[PATH_C/ORG_DEDUP] Dropped contained org: "${findings[i].rawMatch}"`);
            findings.splice(i, 1);
          }
        }
      }
      
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
        { pattern: new RegExp(String.raw`\b(?:for|to|with)\s+(${NAME_WORD})${NAME_RB}`, 'gu'), name: 'preposition' },
        // Action verbs with direct object names (direct capture only, no intermediate prepositions)
        // Matches: "contact Kyleen", "call John", "invite Sarah"
        // Does NOT match: "email for Kyleen" (has preposition in between)
        // Group 4d: the person-directed verbs (contact, call, invite, notify, thank, email, tell, ask, meet, remind) in any inflection; the
        // first letter may be upper case so a sentence-initial "Thank Grace" / "Contact Hope" matches.
        // The optional "." is the one normalizePath_C step 5 inserts between a lowercase verb and a Title-Case word it does not know
        // ("Please thank. Hilario"); the same tolerance already exists for job titles.
        { pattern: new RegExp(String.raw`\b(?:[Cc]ontact(?:s|ed|ing)?|[Cc]all(?:s|ed|ing)?|[Ii]nvite[sd]?|[Ii]nviting|[Nn]otif(?:y|ies|ied|ying)|[Tt]hank(?:s|ed|ing)?|[Ee]-?mail(?:s|ed|ing)?|[Tt]ell(?:s|ing)?|[Tt]old|[Aa]sk(?:s|ed|ing)?|[Mm]eet(?:s|ing)?|[Mm]et|[Rr]emind(?:s|ed|ing)?)\.?\s+(${NAME_WORD})${NAME_RB}`, 'gu'), name: 'action_verb' },
        // "from [Name]" context - captures name after "from"
        { pattern: new RegExp(String.raw`\bfrom\s+(${NAME_WORD})${NAME_RB}`, 'gu'), name: 'from_context' }
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

          // Group 4d: after a person-directed verb the word is kept unless it is evidently an addressee that is not a person's name:
          // a voice assistant / AI, a kinship or deity word, a generic support/role word, a dictionary job title, or a closed-class
          // word (pronoun, determiner, adverb, date...: "Tell Me", "Thank You", "Ask Again"). Ordinary words that are also names
          // (Hope, Joy, Rose) are NOT rejected here: the verb is the cue.
          if (patternObj.name === 'action_verb' && isAddresseeNonName(name)) continue;
          // "called" also NAMES things: "The event is called X", "a group called X" are not people being addressed
          if (patternObj.name === 'action_verb' && /^[Cc]alled/.test(match[0]) &&
              /(?:\b(?:is|are|was|were|be|been|being|so|also)|\b(?:a|an|the|this|that|our|my|his|her|their)\s+\p{L}+)\s+$/u.test(textNLP.slice(Math.max(0, match.index - 40), match.index))) continue;
          
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

      // Group 3 (D6): titles, honorifics, leading verbs and ordinary words must not be reported as person names.
      if (PERSON_LIST_ENABLED) extractNameLists(textNLP, findings);
      if (PERSON_LOWERCASE_INTRO_ENABLED) extractLowercaseSelfIntros(textNLP, findings);
      splitPersonFindingsAtY(findings);
      trimJobSpansOverNames(findings);
      { const refined = refinePersonCandidates(findings, textNLP); findings.length = 0; findings.push(...refined); }
      // Group 13: e-mail addresses and lowercase ordinary words are not organization mentions (runs before Group 1 so it sees the final organizations).
      { const orgKept = refineOrganizationFindings(findings, textNLP); findings.length = 0; findings.push(...orgKept); }
      // Group 1 (D1/D2): organizations and places must not also be reported as person names.
      { const kept = suppressPersonsAsOrganizationsOrPlaces(findings, textNLP); findings.length = 0; findings.push(...kept); }
      
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
