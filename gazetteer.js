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

/* global PH_ADDRESS_DB, TrustGazetteer, MEDICAL_TERMS_DATA, FINANCIAL_TERMS_DATA, ORGANIZATIONS_DATA */

const TrustGazetteer = (() => {

  // ── PRELOADED TERM DATA (loaded from JavaScript modules) ────────────────
  // These are directly injected via manifest.json content script loading.
  // No async loading needed — data is available synchronously.
  
  // Sources:
  //   medical             — NHS A-Z common conditions (SRC-GAZ-002)
  //                         Plain-language names a user would type in a prompt.
  //                         Excludes ICD-10 clinical codes (too many, too slow,
  //                         too many false positives on technical text).
  //   financial           — FinRAD vocabulary + BSP Glossary (SRC-GAZ-003, SRC-GAZ-004)
  //   nationality_religion — country-nationality-list MIT (SRC-GAZ-001) + curated religions
  //
  // Word lists are split into:
  //   *_WORDS  — single-word terms (faster alternation regex)
  //   *_PHRASES — multi-word terms (separate phrase regex, sorted longest-first
  //               so longer matches shadow shorter substrings)
  //
  // All entries are lowercase. Regex matching is case-insensitive.

  // Initialize term arrays from JavaScript data
  let MEDICAL_WORDS = [];
  let MEDICAL_PHRASES = [];
  let FINANCIAL_WORDS = [];
  let FINANCIAL_PHRASES = [];

  // Load medical terms from terms-medical.js
  // MEDICAL_TERMS_DATA is injected by manifest.json before this file loads
  console.log('[TrustGazetteer] Checking for MEDICAL_TERMS_DATA:', typeof MEDICAL_TERMS_DATA, Array.isArray(MEDICAL_TERMS_DATA ? MEDICAL_TERMS_DATA : null));
  if (typeof MEDICAL_TERMS_DATA !== 'undefined' && Array.isArray(MEDICAL_TERMS_DATA)) {
    console.log('[TrustGazetteer] ✅ Found MEDICAL_TERMS_DATA, loading', MEDICAL_TERMS_DATA.length, 'terms');
    const medicalTerms = MEDICAL_TERMS_DATA.map(t => t.toLowerCase());
    MEDICAL_PHRASES = medicalTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
    MEDICAL_WORDS = medicalTerms.filter(t => !t.includes(' '));
  } else if (typeof window !== 'undefined' && window.MEDICAL_TERMS_DATA) {
    console.log('[TrustGazetteer] ✅ Found window.MEDICAL_TERMS_DATA, loading', window.MEDICAL_TERMS_DATA.length, 'terms');
    const medicalTerms = window.MEDICAL_TERMS_DATA.map(t => t.toLowerCase());
    MEDICAL_PHRASES = medicalTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
    MEDICAL_WORDS = medicalTerms.filter(t => !t.includes(' '));
  } else {
    console.warn('[TrustGazetteer] ❌ MEDICAL_TERMS_DATA not found in global scope');
  }

  // Load financial terms from terms-financial.js
  // FINANCIAL_TERMS_DATA is injected by manifest.json before this file loads
  console.log('[TrustGazetteer] Checking for FINANCIAL_TERMS_DATA:', typeof FINANCIAL_TERMS_DATA, Array.isArray(FINANCIAL_TERMS_DATA ? FINANCIAL_TERMS_DATA : null));
  if (typeof FINANCIAL_TERMS_DATA !== 'undefined' && Array.isArray(FINANCIAL_TERMS_DATA)) {
    console.log('[TrustGazetteer] ✅ Found FINANCIAL_TERMS_DATA, loading', FINANCIAL_TERMS_DATA.length, 'terms');
    const financialTerms = FINANCIAL_TERMS_DATA.map(t => t.toLowerCase());
    FINANCIAL_PHRASES = financialTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
    FINANCIAL_WORDS = financialTerms.filter(t => !t.includes(' '));
  } else if (typeof window !== 'undefined' && window.FINANCIAL_TERMS_DATA) {
    console.log('[TrustGazetteer] ✅ Found window.FINANCIAL_TERMS_DATA, loading', window.FINANCIAL_TERMS_DATA.length, 'terms');
    const financialTerms = window.FINANCIAL_TERMS_DATA.map(t => t.toLowerCase());
    FINANCIAL_PHRASES = financialTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
    FINANCIAL_WORDS = financialTerms.filter(t => !t.includes(' '));
  } else {
    console.warn('[TrustGazetteer] ❌ FINANCIAL_TERMS_DATA not found in global scope');
  }

  // Also load organizations data if available
  let ORGANIZATIONS_WORDS = [];
  if (typeof ORGANIZATIONS_DATA !== 'undefined' && Array.isArray(ORGANIZATIONS_DATA)) {
    ORGANIZATIONS_WORDS = ORGANIZATIONS_DATA.map(t => t.toLowerCase());
  } else if (typeof window !== 'undefined' && window.ORGANIZATIONS_DATA) {
    ORGANIZATIONS_WORDS = window.ORGANIZATIONS_DATA.map(t => t.toLowerCase());
  }

  // ── PERFORMANCE: Pre-compile combined regexes ─────────────────────────────
  //
  // Called once at module load time. Each category gets:
  //   _WORD_RE   — single alternation regex for all single-word terms
  //   _PHRASE_RE — single alternation regex for all multi-word phrases
  //              (or null if no phrases in that category)
  //
  // Both use word-boundary anchors (\b) and case-insensitive flag.
  // Hyphen in multi-word phrases is escaped for regex safety.

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function _buildWordRegex(words) {
    if (!words || words.length === 0) return null;
    const escaped = words.map(_escapeRegex);
    return new RegExp("\\b(?:" + escaped.join("|") + ")\\b", "gi");
  }

  function _buildPhraseRegex(phrases) {
    if (!phrases || phrases.length === 0) return null;
    // Phrases already sorted longest-first by the arrays above
    const escaped = phrases.map(_escapeRegex);
    return new RegExp("(?:" + escaped.join("|") + ")", "gi");
  }

  // Pre-compiled at load time — initialized from loaded data
  let MEDICAL_WORD_RE    = null;
  let MEDICAL_PHRASE_RE  = null;
  let FIN_WORD_RE        = null;
  let FIN_PHRASE_RE      = null;

  // Initialize and rebuild regexes from loaded term data
  function initializeTerms() {
    rebuildGazetteers();  // Ensure GAZETTEER has the latest data
    MEDICAL_WORD_RE = _buildWordRegex(MEDICAL_WORDS);
    MEDICAL_PHRASE_RE = _buildPhraseRegex(MEDICAL_PHRASES);
    FIN_WORD_RE = _buildWordRegex(FINANCIAL_WORDS);
    FIN_PHRASE_RE = _buildPhraseRegex(FINANCIAL_PHRASES);
    // Note: Nationality regexes are immutable (const), so they're built on first load
    // Rebuild is not needed unless the nationality lists change at runtime (unlikely)
    console.log('[TrustGazetteer] Initialized with ' + MEDICAL_WORDS.length + ' medical terms, ' + FINANCIAL_WORDS.length + ' financial terms, ' + ORGANIZATIONS_WORDS.length + ' organization terms (direct JS loading, no CSV needed)');
  }

  // ── PERSONAL DESCRIPTORS ──────────────────────────────────────────────────
  // Physical characteristics that are PII when attributed to a person

  // Eye color — common color descriptors people use to describe themselves
  const EYE_COLOR_TERMS = [
    "blue", "blue eyes",
    "brown", "brown eyes",
    "black", "black eyes",          // Note: "black" also appears in nationality context
    "green", "green eyes",
    "gray", "gray eyes",
    "grey", "grey eyes",
    "hazel", "hazel eyes",
    "amber", "amber eyes",
    "light blue", "dark blue",
    "light brown", "dark brown",
    "light green", "dark green"
  ];

  // Sex / Gender — self-identified biological sex or gender identity
  const SEX_GENDER_TERMS = [
    "female",
    "male",
    "intersex",
    "non-binary", "nonbinary",
    "woman", "man",
    "girl", "boy",
    "femme", "masc",
    "genderqueer", "genderfluid",
    "agender",
    "bigender",
    "two-spirit"
  ];

  // ── Nationality — single words ─────────────────────────────────────────────────
  // Sources:
  //   SRC-GAZ-001 — country-nationality-list MIT (nationality adjectives)
  //   Part A/B audit (2026-08-29) — Filipino/Taglish self-identifiers, PH
  //   ethno-regional identifiers, religion terms, misspellings
  //
  // REMOVALS from original list (Part B audit):
  //   "thai"       — HIGH FP: fires on "Thai restaurant", "Thai massage"
  //   "french"     — HIGH FP: fires on "French fries", "in French", "translate to French"
  //   "polish"     — CRITICAL FP: fires on "polish my resume", "nail polish" (verb/noun)
  //   "english"    — CRITICAL FP: fires on "respond in English", "English translation"
  //   "karaniwang" — FACTUAL ERROR: means "ordinary/common" in Tagalog, NOT a denomination
  //   "dutch"      — HIGH FP: "going Dutch", "Dutch courage" idioms
  //   "iglesia"    — moved to PHRASES as "iglesia ni cristo" (bare word = any church)
  //
  // Word-boundary (\b) guards are applied by _buildWordRegex(). All entries lowercase.
  const NATIONALITY_WORDS = [
    "filipino", "filipina",
    "pilipino", "pilipina",       // Tagalog-language spellings (different string, not a typo)
    "philipino", "philipina",     // very common one-l misspellings
    "fillipino", "fillipina",     // double-l misspellings
    "philippino",                  // double-p misspelling
    "pinoy", "pinay",              // most common informal Filipino self-identifiers
    "chinese", "japanese", "korean", "vietnamese",
    "indonesian", "malaysian", "singaporean",
    "burmese", "myanmarese",       // both forms used; myanmarese for post-rename docs
    "cambodian", "laotian",
    "taiwanese", "hongkonger",
    "indian", "pakistani", "bangladeshi", "nepali", "nepalese",
    "bruneian",                    // ASEAN member; relevant for border/labor contexts
    "timorese", "mongolian",       // Southeast/Central Asia additions
    "kazakhstani", "uzbekistani",  // Central Asian OFW sending countries
    "fijian", "samoan",            // Pacific Islands
    "australian",
    // ── Americas ──────────────────────────────────────────────────────────────
    "american", "canadian", "mexican", "brazilian", "colombian",
    "argentinian", "argentine",    // both forms in use
    "peruvian", "chilean", "venezuelan",
    "bolivian", "ecuadorian", "paraguayan", "uruguayan",
    "guatemalan", "honduran", "salvadoran", "nicaraguan",
    "cuban", "jamaican", "haitian", "trinidadian", "guyanese",
    "panamanian",
    // ── Europe ────────────────────────────────────────────────────────────────
    "british", "scottish", "welsh", "irish",
    // NOTE: "english" and "french" removed — critical false positives on language references
    // NOTE: "polish" removed — critical false positive as verb ("polish my resume")
    // NOTE: "dutch" removed — false positive on "going Dutch" idiom
    "german", "spanish", "italian", "portuguese",
    "belgian", "swiss", "swedish", "norwegian", "danish",
    "finnish", "ukrainian", "russian",
    "greek", "turkish",
    "austrian", "czech", "slovak", "croatian", "serbian",
    "slovenian", "bulgarian", "romanian", "hungarian", "latvian",
    "lithuanian", "estonian", "macedonian", "montenegrin",
    "icelandic", "maltese", "cypriot",
    "albanian", "azerbaijani", "armenian", "georgian",
    "belarusian", "moldovan",
    // ── Middle East / Africa ──────────────────────────────────────────────────
    "saudi arabian", "emirati", "qatari", "kuwaiti", "omani",
    "iranian", "iraqi", "syrian", "yemeni", "lebanese",
    "jordanian", "palestinian", "israeli", "afghan",
    "egyptian", "libyan", "tunisian", "moroccan",
    "algerian", "sudanese", "south sudanese",
    "nigerian", "kenyan", "ghanaian", "ethiopian",
    "tanzanian", "ugandan", "rwandan", "cameroonian",
    "senegalese", "zambian", "zimbabwean", "namibian",
    "mozambican", "angolan", "congolese", "somali",   // OFW destination countries
    // ── PH-specific identity / status terms ───────────────────────────────────
    "balikbayan",    // returning Filipino from abroad; uniquely PH term
    "kababayan",     // "fellow Filipino"; diaspora self-identifier
    "dayuhan",       // Tagalog: "foreigner"; signals foreign nationality discussion
    "banyaga",       // Tagalog: more formal/literary "foreigner"
    "ofw",           // Overseas Filipino Worker — highest-value institutional term
    // ── PH mixed-heritage identity ────────────────────────────────────────────
    "chinoy",        // Chinese-Filipino self-identifier
    "tisoy", "tisay",              // half-Filipino, half-Caucasian
    "mestizo", "mestiza",          // mixed-heritage Filipino
    // ── PH ethno-regional self-identifiers ────────────────────────────────────
    "bisaya",        // Visayan ethnic/linguistic identity (largest regional group)
    "ilocano", "ilokano",          // Ilocos region (both spellings common)
    "cebuano",
    "kapampangan",
    "waray",         // Eastern Visayas; also a PH surname — word-boundary acceptable
    "bicolano", "bikolano",
    "bangsamoro",    // Muslim Mindanao political/ethnic self-identifier
    "maranao", "maranaw",
    "tausug",
    "maguindanao",
    "moro",          // historic/community self-identifier; PH Muslim identity
    // ── Religion — standard English ───────────────────────────────────────────
    "muslim", "christian", "catholic", "protestant", "evangelical",
    "buddhist", "hindu", "jewish", "sikh",
    "atheist", "agnostic",
    "adventist", "pentecostal",
    "mormon",        // colloquial name for LDS; more commonly typed than "latter-day saint"
    "presbyterian", "methodist", "episcopal",
    "taoist",        // Chinese-Filipino community
    "sunni", "islamic",
    "moslem",        // older spelling; appears on PH civil registry and school records
    // ── Religion — Filipino-language terms ────────────────────────────────────
    "kristyano",     // Tagalog: "Christian"
    "katoliko", "katolika",        // Tagalog: Catholic (male/female)
    "protestante",   // Tagalog: "Protestant"
    "budista",       // Tagalog: "Buddhist"
    // ── PH-specific denominations ─────────────────────────────────────────────
    "aglipayan",     // Philippine Independent Church
    "baptist",
    "lds",           // Latter-day Saints abbreviation; "Latter-day Saint" in PHRASES
    // NOTE: "iglesia" removed as standalone — means any church in Filipino
    //       Use phrase "iglesia ni cristo" instead (in NATIONALITY_PHRASES)
    // NOTE: "karaniwang" removed — means "ordinary/common", NOT a denomination
  ];

  // ── Nationality — multi-word phrases ─────────────────────────────────────
  // Sorted longest-first so longer phrases shadow shorter substrings.
  // These match without \b anchors — natural spacing provides the boundary.
  const NATIONALITY_PHRASES = [
    // Denominations and religious identities
    "iglesia ni cristo",           // full name; more reliable than bare "iglesia"
    "inc member",                  // INC abbreviation in phrase context
    "seventh-day adventist",
    "born again christian",        // full form; more common than bare "born again"
    "roman catholic",
    "born again",
    "jehovah's witness",
    "jehovahs witness",            // no-apostrophe variant
    "jehovah witness",             // no-apostrophe, no-s variant
    "latter-day saint",
    "latter day saint",
    // Citizenship and status
    "overseas filipino worker",    // full expanded form of OFW
    "dual citizen",                // RA 9225 Filipino dual citizenship
    "dual nationality",
    "naturalized filipino",
    "naturalized citizen",
    "fil-am",                      // Filipino-American
    "fil-chi",                     // Filipino-Chinese
    // Descriptions of foreign nationals
    "taga-ibang bansa",            // Tagalog: "from another country"
    "mainland chinese",            // distinguishes PRC from HK/TW
    "chinese national",
    "hong konger",                 // spaced variant of "hongkonger"
    "hong kong",
    "south african",
    "sri lankan",
    "new zealander",
    "new zealand",
    // Non-Catholic phrases (appear in PH school/hospital enrollment forms)
    "non-catholic christian",
    "non-catholic",
    // Additional multi-word nationalities from countries.csv (SRC-GAZ-001)
    "trinidadian or tobagonian",
    "papua new guinean",
    "equatorial guinean",
    "bissau-guinean",
    "sierra leonean",
    "north korean",
    "south korean",
    "costa rican",
    "puerto rican",
    "south sudanese",
  ].sort((a, b) => b.length - a.length);



  // ── PERFORMANCE: Pre-compile combined regexes ─────────────────────────────
  //
  // Called once at module load time. Each category gets:
  //   _WORD_RE   — single alternation regex for all single-word terms
  //   _PHRASE_RE — single alternation regex for all multi-word phrases
  //              (or null if no phrases in that category)
  //
  // Both use word-boundary anchors (\b) and case-insensitive flag.
  // Hyphen in multi-word phrases is escaped for regex safety.

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function _buildWordRegex(words) {
    if (!words || words.length === 0) return null;
    const escaped = words.map(_escapeRegex);
    return new RegExp("\\b(?:" + escaped.join("|") + ")\\b", "gi");
  }

  function _buildPhraseRegex(phrases) {
    if (!phrases || phrases.length === 0) return null;
    // Phrases already sorted longest-first by the arrays above
    const escaped = phrases.map(_escapeRegex);
    return new RegExp("(?:" + escaped.join("|") + ")", "gi");
  }

  // ── B2: TRIGGER PHRASES ───────────────────────────────────────────────────
  // Each entry:
  //   phrase   — canonical trigger (lowercase)
  //   category — what kind of PII follows the trigger
  //   risk     — risk level of the extracted value

  const TRIGGERS = [
    // Identity
    // NOTE: risk values must be "low", "moderate", or "high" only.
    // "medium" is not a valid RISK_ORDER key and causes deduplication failures.
    { phrase: "my name is",          category: "person_name",  risk: "low" },
    { phrase: "my full name is",      category: "person_name",  risk: "low" },
    { phrase: "i am called",          category: "person_name",  risk: "low" },
    { phrase: "call me",              category: "person_name",  risk: "low"    },
    { phrase: "my nickname is",       category: "person_name",  risk: "low"    },
    // Age / DOB
    // FIXED: Made "years old" suffix mandatory to prevent false positives like "worked for 20 years"
    // Changed followPattern from /^\d{1,3}\s*(years?\s*old|yrs?\s*old|y\/o)?/ (optional suffix)
    // to /^\d{1,3}\s+(years?\s*old|yrs?\s*old|y\/o)/ (required suffix)
    { phrase: "i am",                 category: "age",          risk: "low",   followPattern: /^\d{1,3}\s+(years?\s*old|yrs?\s*old|y\/o)/ },
    { phrase: "i'm",                  category: "age",          risk: "low",   followPattern: /^\d{1,3}\s+(years?\s*old|yrs?\s*old|y\/o)/ },
    { phrase: "my age is",            category: "age",          risk: "low"    },
    { phrase: "i was born",           category: "dob",          risk: "low"    },
    { phrase: "my birthday is",       category: "dob",          risk: "low",   followPattern: /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/i },
    { phrase: "my birthday is on",    category: "dob",          risk: "low",   followPattern: /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/i },
    { phrase: "date of birth",        category: "dob",          risk: "low"    },
    // Location
    // NOTE: "medium" is not a valid RISK_ORDER key — all values must be "low", "moderate", or "high".
    { phrase: "i live in",            category: "location",     risk: "low" },
    { phrase: "i live at",            category: "location",     risk: "low" },
    { phrase: "i stay at",            category: "location",     risk: "low" },
    { phrase: "i reside at",          category: "location",     risk: "low" },
    { phrase: "my address is",        category: "location",     risk: "low" },
    { phrase: "my home address is",   category: "location",     risk: "low" },
    { phrase: "i am from",            category: "location",     risk: "low"    },
    { phrase: "nakatira ako sa",      category: "location",     risk: "low" }, // Filipino
    { phrase: "nakatira sa",          category: "location",     risk: "low" },
    { phrase: "address ko",           category: "location",     risk: "low" },
    // Health
    { phrase: "i have",               category: "health",       risk: "low", requireGazetteer: "medical" },
    { phrase: "i am experiencing",    category: "health",       risk: "low", requireGazetteer: "medical" },
    { phrase: "i'm experiencing",     category: "health",       risk: "low", requireGazetteer: "medical" },
    { phrase: "i was diagnosed",      category: "health",       risk: "low" },
    { phrase: "i am diagnosed",       category: "health",       risk: "low" },
    { phrase: "i suffer from",        category: "health",       risk: "low" },
    { phrase: "my condition is",      category: "health",       risk: "low" },
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
    { phrase: "my salary is",         category: "financial",    risk: "low" },
    { phrase: "i earn",               category: "financial",    risk: "low" },
    { phrase: "my income is",         category: "financial",    risk: "low" },
    { phrase: "my account number is", category: "financial",    risk: "high"   },
    { phrase: "my card number is",    category: "financial",    risk: "high"   },
    // Physical Descriptors — eye color and sex/gender
    { phrase: "my eye color is",      category: "eye_color",    risk: "low",   requireGazetteer: "eye_color" },
    { phrase: "my eyes are",          category: "eye_color",    risk: "low",   requireGazetteer: "eye_color" },
    { phrase: "i have",               category: "eye_color",    risk: "low",   requireGazetteer: "eye_color",   followPattern: /^(blue|brown|black|green|gray|grey|hazel|amber)\s*(eyes)?/ },
    { phrase: "my sex is",            category: "sex_gender",   risk: "low",   requireGazetteer: "sex_gender" },
    { phrase: "my gender is",         category: "sex_gender",   risk: "low",   requireGazetteer: "sex_gender" },
    { phrase: "i am",                 category: "sex_gender",   risk: "low",   requireGazetteer: "sex_gender",   followPattern: /^(female|male|intersex|non-binary|nonbinary|woman|man|girl|boy|femme|masc|genderqueer|genderfluid|agender|bigender)/ },
    // ── CONTACT INFORMATION (Phone & IP) ──────────────────────────────────
    // These use context-aware detection: only flagged when followed by actual sharing intent
    // Suppressed in educational contexts ("how many", "example", "format", etc.)
    { phrase: "my number is",         category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "my phone is",          category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "call me at",           category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "reach me at",          category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "text me at",           category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "send to",              category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "her number is",        category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "his number is",        category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "their number is",      category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "phone number is",      category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "mobile number is",     category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "our number is",        category: "phone_number", risk: "moderate", isContactInfo: true },
    { phrase: "your number",          category: "phone_number", risk: "moderate", isContactInfo: true },
    // IP Addresses
    { phrase: "server is",            category: "ip_address",   risk: "moderate", isContactInfo: true },
    { phrase: "server address",       category: "ip_address",   risk: "moderate", isContactInfo: true },
    { phrase: "IP is",                category: "ip_address",   risk: "moderate", isContactInfo: true },
    { phrase: "IP address is",        category: "ip_address",   risk: "moderate", isContactInfo: true },
    { phrase: "address is",           category: "ip_address",   risk: "moderate", isContactInfo: true },
    { phrase: "connect to",           category: "ip_address",   risk: "moderate", isContactInfo: true },
    { phrase: "access",               category: "ip_address",   risk: "moderate", isContactInfo: true },
    { phrase: "hostname",             category: "ip_address",   risk: "moderate", isContactInfo: true }
  ];

  // ── GAZETTEER OBJECT — Aggregated word/phrase lists for validation ─────────
  // Used by runTriggerScan() to validate extracted spans against gazetteers.
  // When trigger.requireGazetteer is set, the extracted value must contain
  // at least one term from GAZETTEER[trigger.requireGazetteer].
  let GAZETTEER = {
    medical: [
      ...MEDICAL_WORDS,
      ...MEDICAL_PHRASES
    ],
    financial: [
      ...FINANCIAL_WORDS,
      ...FINANCIAL_PHRASES
    ],
    organizations: ORGANIZATIONS_WORDS,
    eye_color: EYE_COLOR_TERMS,
    sex_gender: SEX_GENDER_TERMS,
    nationality_religion: [
      ...NATIONALITY_WORDS,
      ...NATIONALITY_PHRASES
    ]
  };

  // Helper function to rebuild GAZETTEER if data loads after initialization
  function rebuildGazetteers() {
    // Reload from globals in case they've been updated
    if (typeof MEDICAL_TERMS_DATA !== 'undefined' && Array.isArray(MEDICAL_TERMS_DATA)) {
      const medicalTerms = MEDICAL_TERMS_DATA.map(t => t.toLowerCase());
      MEDICAL_PHRASES = medicalTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
      MEDICAL_WORDS = medicalTerms.filter(t => !t.includes(' '));
    } else if (typeof window !== 'undefined' && window.MEDICAL_TERMS_DATA) {
      const medicalTerms = window.MEDICAL_TERMS_DATA.map(t => t.toLowerCase());
      MEDICAL_PHRASES = medicalTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
      MEDICAL_WORDS = medicalTerms.filter(t => !t.includes(' '));
    }
    
    if (typeof FINANCIAL_TERMS_DATA !== 'undefined' && Array.isArray(FINANCIAL_TERMS_DATA)) {
      const financialTerms = FINANCIAL_TERMS_DATA.map(t => t.toLowerCase());
      FINANCIAL_PHRASES = financialTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
      FINANCIAL_WORDS = financialTerms.filter(t => !t.includes(' '));
    } else if (typeof window !== 'undefined' && window.FINANCIAL_TERMS_DATA) {
      const financialTerms = window.FINANCIAL_TERMS_DATA.map(t => t.toLowerCase());
      FINANCIAL_PHRASES = financialTerms.filter(t => t.includes(' ')).sort((a, b) => b.length - a.length);
      FINANCIAL_WORDS = financialTerms.filter(t => !t.includes(' '));
    }

    if (typeof ORGANIZATIONS_DATA !== 'undefined' && Array.isArray(ORGANIZATIONS_DATA)) {
      ORGANIZATIONS_WORDS = ORGANIZATIONS_DATA.map(t => t.toLowerCase());
    } else if (typeof window !== 'undefined' && window.ORGANIZATIONS_DATA) {
      ORGANIZATIONS_WORDS = window.ORGANIZATIONS_DATA.map(t => t.toLowerCase());
    }

    // Rebuild GAZETTEER with fresh data
    GAZETTEER = {
      medical: [
        ...MEDICAL_WORDS,
        ...MEDICAL_PHRASES
      ],
      financial: [
        ...FINANCIAL_WORDS,
        ...FINANCIAL_PHRASES
      ],
      organizations: ORGANIZATIONS_WORDS,
      eye_color: EYE_COLOR_TERMS,
      sex_gender: SEX_GENDER_TERMS,
      nationality_religion: [
        ...NATIONALITY_WORDS,
        ...NATIONALITY_PHRASES
      ]
    };
    
    console.log('[TrustGazetteer] Gazetteers rebuilt: ' + MEDICAL_WORDS.length + ' medical, ' + FINANCIAL_WORDS.length + ' financial, ' + ORGANIZATIONS_WORDS.length + ' organizations');
  }

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
    "what", "why", "how", "when", "where", "which",       // Question words (not names)
    "ako", "ka", "siya", "kami", "tayo", "kayo", "sila",  // Filipino pronouns
    "ang", "ng", "sa", "na", "at", "ay", "mga"             // Filipino particles
  ]);

  // Category → display label + sanitize function
  // Keys here must match both GAZETTEER object keys (for B1 scan) and TRIGGERS category values (for B2 scan).
  const CATEGORY_META = {
    // ── B2 trigger categories ─────────────────────────────────────────────
    person_name:  { label: "Person Name",          sanitize: (v) => v[0] + "***"                   },
    age:          { label: "Age / Date of Birth",   sanitize: (_) => "[AGE REDACTED]"                },
    dob:          { label: "Date of Birth",         sanitize: (_) => "[DOB REDACTED]"                },
    location:     { label: "Location / Address",    sanitize: (_) => "[LOCATION REDACTED]"           },
    health:       { label: "Health Condition",      sanitize: (_) => "[HEALTH INFO REDACTED]"        },
    employer:     { label: "Employer / Workplace",  sanitize: (_) => "[EMPLOYER REDACTED]"           },
    religion:     { label: "Religion / Belief",     sanitize: (_) => "[BELIEF INFO REDACTED]"        },
    financial:    { label: "Financial Information", sanitize: (_) => "[FINANCIAL INFO REDACTED]"     },
    eye_color:    { label: "Eye Color",             sanitize: (_) => "[EYE COLOR REDACTED]"          },
    sex_gender:   { label: "Sex / Gender",          sanitize: (_) => "[SEX/GENDER REDACTED]"         },
    // ── B1 gazetteer scan categories (must match GAZETTEER object keys) ───
    medical:             { label: "Medical Term",            sanitize: (v) => "[MEDICAL: " + v + "]"          },
    financial:           { label: "Financial Term",          sanitize: (v) => "[FINANCIAL: " + v + "]"        },
    organizations:       { label: "Organization",            sanitize: (v) => "[ORGANIZATION: " + v + "]"     },
    nationality_religion: { label: "Nationality / Religion", sanitize: (v) => "[NATIONALITY/RELIGION: " + v + "]" },
    // Legacy aliases kept for backwards compat
    medical_term: { label: "Medical Term",          sanitize: (v) => "[MEDICAL: " + v + "]"          },
    fin_term:     { label: "Financial Term",        sanitize: (v) => "[FINANCIAL TERM: " + v + "]"  },
    legal_term:   { label: "Legal Term",            sanitize: (v) => "[LEGAL TERM: " + v + "]"      },
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

  // ★ CRITICAL: Increased from 0.80 to 0.90 to prevent false positives while catching real typos
  // 0.80 allowed "tuberculosis" (12 chars) to match "epituberculosis" (15 chars) = different diseases!
  // 0.90 requires high similarity but still catches common typos like "menstration" → "menstruation"
  // Combined with length-ratio validation (min 85%), this prevents 25% length differences
  const FUZZY_THRESHOLD = 0.90; // ≥ 0.90 similarity required for medical terms

  /**
   * Fuzzy-match a trigger phrase against the text using Levenshtein similarity ≥ 0.90.
   * Slides a word-window across the text and checks similarity of each window
   * against the canonical phrase.
   * 
   * ★ ENHANCED: Now rejects prefix/suffix variations before checking similarity
   */
  function fuzzyMatchPhrase(text, phrase) {
    const phraseWords = phrase.toLowerCase().split(" ");
    const textWords   = text.toLowerCase().split(/\s+/);
    const wLen        = phraseWords.length;

    for (let i = 0; i <= textWords.length - wLen; i++) {
      const window = textWords.slice(i, i + wLen).join(" ");
      
      // ★ NEW: Reject prefix/suffix variations before calculating similarity
      if (isPrefixSuffixVariation(window, phrase.toLowerCase(), 20)) {
        continue;  // Skip this potential match
      }
      
      if (similarityRatio(window, phrase.toLowerCase()) >= FUZZY_THRESHOLD) {
        return { matched: true, startWordIdx: i, endWordIdx: i + wLen };
      }
    }
    return { matched: false };
  }

  /**
   * Fuzzy-match a single medical term against text using Levenshtein similarity.
   * Returns all matches found in the text with their positions.
   * Handles typos like "menstration" → "menstruation" with ≥ 0.90 similarity.
   * 
   * ★ ENHANCED: Now rejects prefix/suffix variations before checking similarity
   * This prevents "tuberculosis" from matching "epituberculosis"
   * 
   * @param {string} text - The text to search in
   * @param {string} term - The medical term to find (e.g., "menstruation")
   * @param {number} threshold - Similarity threshold (default 0.90)
   * @returns {Array} Array of { matchText, index, canonical } objects
   */
  function fuzzyMatchMedicalTerm(text, term, threshold = FUZZY_THRESHOLD) {
    const textWords = text.toLowerCase().split(/\s+/);
    const termWords = term.toLowerCase().split(/\s+/);
    const tLen = termWords.length;
    const matches = [];

    // Single-word terms: match individual words
    if (tLen === 1) {
      textWords.forEach((word, idx) => {
        // Remove trailing punctuation for comparison
        const cleanWord = word.replace(/[.,!?;:'"]/g, "");
        
        // ★ NEW: Reject prefix/suffix variations before calculating distance
        if (isPrefixSuffixVariation(cleanWord, term.toLowerCase(), 20)) {
          return;  // Skip this potential match
        }
        
        // ★ CRITICAL FIX: Prevent matching terms with drastically different lengths
        // Example: "tuberculosis" (12 chars) should NOT fuzzy-match "epituberculosis" (15 chars)
        // Allow max 15% length difference (length ratio between 0.85 and 1.18)
        const minLen = Math.min(cleanWord.length, term.length);
        const maxLen = Math.max(cleanWord.length, term.length);
        const lengthRatio = minLen / maxLen;
        
        if (lengthRatio < 0.85) {
          // Terms differ too much in length — skip fuzzy match
          // This prevents "tuberculosis" matching "epituberculosis" which differ by 25%
          return;
        }
        
        const similarity = similarityRatio(cleanWord, term.toLowerCase());
        
        if (similarity >= threshold && cleanWord.length > 0) {
          matches.push({
            matchText: word,
            index: idx,
            canonical: term,
            similarity: similarity
          });
        }
      });
    } else {
      // Multi-word terms: match word sequences
      for (let i = 0; i <= textWords.length - tLen; i++) {
        const window = textWords.slice(i, i + tLen).join(" ");
        
        // ★ NEW: Reject prefix/suffix variations before calculating distance
        if (isPrefixSuffixVariation(window, term.toLowerCase(), 20)) {
          continue;  // Skip this potential match
        }
        
        const similarity = similarityRatio(window, term.toLowerCase());
        
        if (similarity >= threshold) {
          matches.push({
            matchText: window,
            startIndex: i,
            endIndex: i + tLen,
            canonical: term,
            similarity: similarity
          });
        }
      }
    }

    return matches;
  }

  // ── MEDICAL TERM GROUPING ────────────────────────────────────────────────────
  // Normalizes related medical terms to a canonical form for better grouping
  // Examples:
  //   - "menstration" (typo) → "menstruation" (canonical)
  //   - "heavy menstruation" + "menstration" → grouped as 1 finding
  
  const MEDICAL_TERM_NORMALIZATION = {
    // Menstruation variations (very common typo)
    'menstration': 'menstruation',
    'mensuration': 'menstruation',
    'menstreation': 'menstruation',
    'menstraton': 'menstruation',
    'mentration': 'menstruation',
    // Common typo patterns for other terms
    'diabeties': 'diabetes',
    'diabetic': 'diabetes',
    'diebetes': 'diabetes',
    'asma': 'asthma',
    'athsma': 'asthma',
    'depression': 'depression',  // already correct
    'anxeity': 'anxiety',
    'anxety': 'anxiety',
    'maleria': 'malaria',
    'malaria': 'malaria',  // already correct
    'pneumonia': 'pneumonia',  // already correct
    'bronchitis': 'bronchitis',  // already correct
    'tonsillitis': 'tonsillitis',  // already correct
    'migrane': 'migraine',
    'migrain': 'migraine',
    'headache': 'headache',  // already correct
    'cancre': 'cancer',
    'canser': 'cancer',
    'cardiak': 'cardiac',
    'hypetension': 'hypertension',
    'hypertention': 'hypertension',
    'cholestoral': 'cholesterol',
    'cholestrol': 'cholesterol'
    // Add more as discovered
  };

  /**
   * Normalize a medical term to its canonical form for grouping.
   * Handles typos and variations so "menstration" and "menstruation" are grouped together.
   * 
   * @param {string} term - The medical term to normalize
   * @returns {string} The canonical form, or original if no mapping exists
   */
  function normalizeMedicalTerm(term) {
    const lower = term.toLowerCase();
    return MEDICAL_TERM_NORMALIZATION[lower] || lower;
  }

  /**
   * Get human-readable correction message for a typo.
   * Shows "menstration" → "menstruation" format for user awareness.
   * 
   * @param {string} typo - The typo variant detected
   * @param {string} canonical - The correct spelling
   * @returns {string} Correction message, or empty if not a typo
   */
  function getCorrectionMessage(typo, canonical) {
    const typoLower = typo.toLowerCase();
    const canonicalLower = canonical.toLowerCase();
    
    // Only show correction if they're actually different
    if (typoLower !== canonicalLower) {
      return `"${typo}" corrected to "${canonical}"`;
    }
    return "";
  }

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
    // If this trigger has a followPattern requirement, check if the next word matches it
    if (trigger.followPattern && startIdx < textWords.length) {
      const nextWords = textWords.slice(startIdx).join(" ");
      if (!trigger.followPattern.test(nextWords)) {
        // Pattern doesn't match — don't extract any value
        return { span: null, wordCount: 0 };
      }
    }

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

      case "eye_color":
        // Eye color must be a recognized color term from the gazetteer
        return gazetteers.eye_color.some(t => span.toLowerCase().includes(t));

      case "sex_gender":
        // Sex/gender must be a recognized term from the gazetteer
        return gazetteers.sex_gender.some(t => span.toLowerCase().includes(t));

      default:
        return span.length >= 2;
    }
  }

  // ── CONTEXTUAL NLP ANALYSIS (COMPROMISE-LITE) ────────────────────────────
  //
  // Before flagging a bare gazetteer term as PII, analyze the semantic context:
  //
  // SAFE contexts (NOT PII):
  //   - Information-seeking: "What does Filipino mean?", "How to learn Tagalog"
  //   - Educational: "Turn 09098340056 grams into tons"
  //   - Linguistic inquiry: "What is the Filipino term for beautiful?"
  //   - Language discussion: "Translate this to Filipino", "Filipino grammar"
  //   - Product/food: "I like Filipino cuisine", "Filipino restaurant"
  //   - Generic reference: "Filipino culture", "Filipino history"
  //
  // RISKY contexts (IS PII):
  //   - Personal identification: "I'm Filipino", "My friend is Filipino"
  //   - Nationality/ethnicity disclosure: "A friend of mine is Filipino, I want to understand her language"
  //   - Sensitive subject reference: "I have Filipino heritage", "As a Filipino woman..."
  //   - Contact-related: "Please create an email with 09098340056"

  /**
   * Analyze the semantic context around a detected gazetteer term.
   * Returns true if the term appears to be actual sensitive PII,
   * false if it's safe (educational, informational, or generic reference).
   *
   * Uses heuristics based on:
   *   - Preceding context (question markers, educational phrases)
   *   - Following context (what comes after the term)
   *   - Sentence structure (personal pronouns, disclosure markers)
   *   - Term category (nationality/religion require stronger markers)
   *
   * @param {string} fullText - the complete text
   * @param {number} matchIndex - character index where the term was found
   * @param {number} matchLength - length of the matched term
   * @param {string} category - gazetteer category (e.g., "nationality_religion")
   * @returns {boolean} true if risky PII context, false if safe
   */
  function analyzeTermContext(fullText, matchIndex, matchLength, category) {
    // Extract surrounding context: ~150 chars before and after
    const contextBefore = fullText.substring(Math.max(0, matchIndex - 150), matchIndex);
    const contextAfter = fullText.substring(matchIndex + matchLength, Math.min(fullText.length, matchIndex + matchLength + 150));
    const fullContext = contextBefore + " [TERM] " + contextAfter;

    // Normalize context for analysis
    const contextLower = contextBefore.toLowerCase();  // Use contextBefore for more reliable matching
    const contextAfterLower = contextAfter.toLowerCase();

    // ── CLAUSE-LOCAL CONTEXT ─────────────────────────────────────────────────
    // Personal-disclosure markers ("my", "our", "I am", pronouns) only indicate
    // that the DETECTED TERM is PII when they belong to the SAME clause as the
    // term. Scanning the whole 150-char window caused false positives: in
    // "...my former teacher. She taught me Filipino", the possessive "my" binds
    // to "teacher" (a different clause) yet wrongly flagged "Filipino".
    //
    // We isolate the clause immediately preceding the term by cutting at the
    // last clause/sentence boundary (sentence enders, comma, semicolon, colon,
    // or a coordinating conjunction). The disclosure heuristics below operate on
    // this narrower window so distant, grammatically-unrelated possessives and
    // pronouns no longer leak across clause boundaries.
    // Boundaries used: sentence enders (. ! ? ;) and subordinating/relative
    // conjunctions that start a new clause with a potentially different subject
    // ("because", "while", "when", "who", "which"). Commas are intentionally NOT
    // treated as boundaries, so appositive/listing disclosures in the same
    // sentence (e.g. "I am a 30 year old, Filipino man") remain detectable.
    const clauseBoundaryRe = /.*(?:[.!?;]|\b(?:because|while|when|who|which)\b)\s*/is;
    const nearContextLower = contextLower.replace(clauseBoundaryRe, "");

    // ── LOCATION-CONTEXT GUARD (nationality/religion only) ───────────────────
    // DEF-005: A country/place name used as a LOCATION ("worked in Saudi Arabia",
    // "lived in Japan for 20 years", "based in Qatar") is a place reference, not a
    // nationality/ethnicity disclosure about the writer. When a nationality term
    // is immediately preceded by a locational preposition (in/to/from/at) AND the
    // near context contains a residence/work/movement verb, treat it as a safe
    // location mention. (Bare PH place names are separately flagged as location
    // data by the ph_address place-name pattern in patterns.js.)
    if (category === "nationality_religion") {
      const precededByPlacePrep = /\b(in|to|from|at)\s*$/.test(nearContextLower);
      const locationVerbNearby = /\b(work(?:ed|ing|s)?|liv(?:ed|ing|es)?|resid(?:ed|ing|es)?|bas(?:ed|ing)|mov(?:ed|ing)|relocat(?:ed|ing)|station(?:ed)?|deploy(?:ed)?|assign(?:ed)?|went|stay(?:ed|ing)?|visit(?:ed|ing)?|travel(?:led|ing|ed)?)\b/.test(nearContextLower);
      if (precededByPlacePrep && locationVerbNearby) {
        return false;  // Safe: country used as a location, not a nationality claim
      }
    }

    // ── FINANCIAL GENERIC-QUESTION GUARD (evaluated before risky rules) ──────
    // DEF-007: A financial term used in a generic how-to / compliance question
    // ("How do I declare my income to the BIR?", "how to compute my tax") is not
    // a disclosure of the user's actual finances — no amount is being shared.
    // Treat financial terms as safe when the context is interrogative/procedural
    // and no monetary figure appears nearby. This must run BEFORE the possessive
    // ("my") risky rule, otherwise "my income" would be flagged first. (Financial
    // terms are context indicators that add no score, so this only affects
    // whether the term surfaces as a detection.)
    if (category === "financial") {
      const combined = contextLower + " " + contextAfterLower;
      const procedural = /\b(how\s+(?:do|to|can|should)|declare|file|compute|calculate|report|register|what\s+(?:is|are)|explain)\b/.test(combined);
      const hasAmountNearby = /(?:php|₱|\$|usd)\s?\d|\b\d{3,}(?:[.,]\d+)?\b/.test(combined);
      if (procedural && !hasAmountNearby) {
        return false;  // Safe: generic financial/tax question, no value disclosed
      }
      // DEF-002: Otherwise a financial term is a legitimate SENSITIVE-CONTEXT
      // indicator and should surface (e.g. "changing its payroll provider").
      // Financial terms carry NO independent score (BASE_SCORES = 0); flagging
      // them only makes the blue "CONTEXT: FINANCIAL" badge appear and lets the
      // Sensitive-Context Co-occurrence rule consider them. It never raises the
      // numeric risk on its own.
      return true;
    }

    // ── RISKY HEURISTICS (Check these FIRST to catch PII patterns) ──────────
    
    // 1. Direct personal disclosure: "I'm X" or "I am X" in the SAME clause
    if (/\b(i\s+am|i'm|im)\b/.test(nearContextLower)) {
      return true;  // Risky: Direct personal identification like "I'm Filipino"
    }

    // 2. "Have diabetes", "have depression", etc. - personal possession
    if (/\bhave\b/.test(nearContextLower) && category === "medical") {
      return true;  // Risky: "I have diabetes"
    }

    // 2b. "Am experiencing" or "experiencing" for medical terms
    if (/\b(experiencing|experience|am experiencing|i'm experiencing)\b/.test(nearContextLower) && category === "medical") {
      return true;  // Risky: "I am experiencing heavy menstruation"
    }

    // 3. Possessive personal disclosure in the SAME clause: "My X is", "Our X"
    //    Must be clause-local so "my former teacher. She taught me Filipino"
    //    does NOT flag "Filipino" via a possessive that refers to the teacher.
    if (/\b(my|our)\b/.test(nearContextLower)) {
      return true;  // Risky: "My girlfriend is Filipino", "My heritage is Filipino"
    }

    // 4. Contact/sensitive-information SHARING request.
    //    Previously this fired on any occurrence of common task verbs
    //    ("create", "write", "email", "details", ...) anywhere in the 150-char
    //    window. That produced false positives on ordinary requests such as
    //    "...changing its payroll provider. Draft an email to employees..." —
    //    where "email" is the deliverable the user is asking the AI to write,
    //    not contact information being disclosed.
    //
    //    The marker now only counts when it appears in the SAME clause as the
    //    detected term AND is paired with a first-person sharing/possessive cue
    //    ("my", "our", "me", "i") — i.e. the user is actually sharing their own
    //    contact/sensitive detail (e.g. "create an email for me with ...",
    //    "my phone number is ..."). Generic task verbs alone no longer trigger.
    const contactMarkers = /\b(send|contact|call|phone number|phone|my number|details|address)\b/;
    const sharingCue = /\b(my|our|me|i)\b/;
    if (contactMarkers.test(nearContextLower) && sharingCue.test(nearContextLower)) {
      return true;  // Risky: user sharing their own contact/sensitive detail
    }

    // 5. Third-person personal disclosure: "Friend/Person/Someone is X"
    // BUT only if combined with sensitivity markers (understanding, knowing, etc.)
    // Use clause-local context so a pronoun from a prior clause (e.g. "She taught
    // me") does not bind to a nationality term in the following clause.
    if (/\b(friend|person|woman|man|girl|boy|someone|she|he)\b/.test(nearContextLower)) {
      const disclosureVerb = /\b(is|are|was|were)\b/.test(nearContextLower);
      const sensitivityMarker = /\b(understand|know|learn|relate|connect|talk to|discuss)\b/.test(contextAfterLower);
      if (disclosureVerb && sensitivityMarker) {
        return true;  // Risky: "My friend is Filipino, I want to understand her"
      }
    }

    // 6. Self-identification pattern: "As a X [personal vulnerability/context]"
    // e.g., "As a Filipino woman, I face unique challenges"
    if (/\bas\s+(?:a|an)\s+/.test(contextLower)) {
      const vulnerabilityMarker = /\b(face|experience|deal with|struggle|challenge|difficulty|issue|problem|concern)\b/.test(contextAfterLower);
      if (vulnerabilityMarker) {
        return true;  // Risky: Self-identification with personal context
      }
    }

    // ── SAFE HEURISTICS (Check these AFTER risky to prevent safe from overriding) ──
    
    // 1. Question marks at the BEGINNING (pure information-seeking)
    if (/^\s*(what|how|explain|describe|can you|tell me|show me|give me|search for|research|define|meaning)\b/.test(contextLower)) {
      return false;  // Safe: Pure information-seeking question
    }

    // 2. Educational/linguistic context in BEFORE section (and no personal markers)
    const educationalMarkers = [
      /\b(translate|language|term|word|grammar|spell|pronounce|pronunciation|dialect|accent)\b/,
    ];
    const hasNoPersonal = !/(i|i'm|im|have|my|me|friend|person|she|he|as\s+(?:a|an))\b/.test(contextLower);
    if (hasNoPersonal) {
      for (const marker of educationalMarkers) {
        if (marker.test(contextLower)) {
          return false;  // Safe: Educational context without personal reference
        }
      }
    }

    // 3. Food/cuisine context
    if (/\b(cuisine|food|restaurant|dish|cooking|recipe)\b/.test(contextAfterLower)) {
      return false;  // Safe: Food reference like "Filipino cuisine"
    }

    // 4. Cultural/historical context
    if (/\b(culture|history|tradition|music|art|dance|architecture)\b/.test(contextAfterLower)) {
      // But exclude if there's personal possession before
      if (!/\b(my|our|have|as\s+(?:a|an))\b/.test(contextLower)) {
        return false;  // Safe: Cultural reference like "Filipino culture"
      }
    }

    // 5. Unit conversion or mathematical context
    if (/\b(gram|ton|unit|measure|convert|calculation)\b/.test(contextAfterLower)) {
      return false;  // Safe: Unit conversion or measurement context
    }

    // 6. ORGANIZATIONS: Require employment/affiliation context
    //    Generic mentions of organization names in code, documentation, etc. are safe
    //    Only flag if clear employment disclosure pattern
    if (category === "organizations") {
      // Only risky if combined with employment verbs/nouns and first-person context
      const hasEmploymentKeyword = /\b(work|employed|employ|hire|job|position|staff|manager|director|ceo|founder|owner|employer|company|workplace|office)\b/.test(contextLower) || /\b(work|employed|employ|hire|job|position|staff)\b/.test(contextAfterLower);
      const hasPersonalContext = /\b(i|i'm|i am|my|me|we|our)\b/.test(contextLower);
      
      if (!hasEmploymentKeyword || !hasPersonalContext) {
        // Generic mention without employment context — it's safe
        return false;  // Safe: Not a personal employment disclosure
      }
    }

    // ── DEFAULT: ALLOW unless explicitly risky ───────────────────────────────
    // This prevents false positives on ambiguous contexts
    return false;
  }

  // ── CONTEXT ANALYSIS FOR "X YEARS" PATTERNS ─────────────────────────────────
  // Distinguish between:
  //   1. AGE: "i am 20 years old", "my age is 25", "turned 30 years"
  //   2. DURATION: "worked for 20 years", "lived there 15 years", "stayed 10 years"
  //   3. TIME-AGO: "20 years ago", "happened 25 years back", "left 15 years ago"
  // Only AGE contexts should be flagged as PII
  
  /**
   * Determine if "X years" is indicating AGE, DURATION, or TIME-AGO context
   * EXPANDED VERSION with more comprehensive markers based on real user prompts
   * 
   * @param {string} fullText - the complete text being analyzed
   * @param {number} numberIndex - character index where the number starts
   * @param {string} numberStr - the number string (e.g., "20")
   * @returns {string} "age" | "duration" | "time_ago" | "unknown"
   */
  function determineYearsContext(fullText, numberIndex, numberStr) {
    // Get context: ~150 chars before, ~100 chars after for better accuracy
    const contextStart = Math.max(0, numberIndex - 150);
    const beforeText = fullText.substring(contextStart, numberIndex).toLowerCase().trim();
    
    const afterStart = numberIndex + numberStr.length;
    const contextEnd = Math.min(fullText.length, afterStart + 100);
    const afterText = fullText.substring(afterStart, contextEnd).toLowerCase();
    
    // EXPANDED AGE MARKERS - comprehensive list for age disclosure detection
    const ageMarkers = [
      // Personal disclosure - require "my" or first person
      /\b(i\s+am|i'm|im|age|edad|old|aged|turned|born|will be|just turned|turning)\b/,
      /\b(my age|my birthday|born|how old|what (age|year)|when (were|was) (i|you|they|he|she))\b/,
      /\byears?\s+old\b/,
      /\b(currently|is)\s+\d{1,3}\s+years?\b/,
      // Age references and qualifiers
      /\b(senior citizen|retirement age|adult|minor|under 18|over 65|age group|eligible at|over)\b/,
      /\b(born in|class of|graduating|graduated)\b/,
      // Relational references - require possessive
      /\b(my (son|daughter|wife|husband|kid|child|baby|friend|brother|sister))\b/,
    ];
    
    // NON-PII CONTEXTS - calendar dates, holidays, scenarios, historical events, deadlines, etc.
    // If these match, NOT a personal age disclosure
    // IMPORTANT: These should only match when NOT preceded by personal markers like "my"
    const nonPIIContextPatterns = [
      // Calendar/Current Date References
      /\b(today is|it is|the date is|as of today|right now it's|current date)\s+\w+\s+\d{1,2},?\s*\d{4}\b/,
      /^on\s+\w+\s+\d{1,2},?\s*\d{4}\b/,
      
      // Holidays & Cultural Events
      /\b(\w+\s+(is\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec))\b/,
      /\b(christmas|thanksgiving|valentine|easter|independence day|new year|diwali|ramadan|passover|halloween|mother's day|father's day)\b/,
      
      // Historical/News Events
      /\b(moon landing|was assassinated|occurred|happened|took place|war|attack|bombing|event|incident|tragedy)\b/,
      /\b(9\/11|911|covid|pandemic|depression|revolution|rebellion)\b/,
      
      // Deadlines & Project Timelines
      /\b(deadline|due date|project|launch|release|submit by|scheduled for|completion|due by|expected by)\b/,
      
      // Historical Periods & Eras
      /\b(in \d{4}|during the \d{3}0s|era|period|century|age of|back in|during the|medieval|renaissance|victorian)\b/,
      /\b(world war|wwi|wwii|ancient|middle ages|industrial|modern era)\b/,
      
      // Fictional/Hypothetical Scenarios
      /\b(year \d{4}|set in|where the year is|imagine|what if|in a world where|fictional|hypothetical)\b/,
      /\b(story|tale|fiction|novel|character|plot|chapter|narrative|scenario)\b/,
      
      // Educational/Academic References
      /\b(biography|historical|famous|scholar|academic|historical figure|scientist|author)\b/,
      
      // Product Release/Version Dates
      /\b(launched|released|version|patch|update|build|deployment|released on|comes out|came out)\b/,
      
      // Seasonal References
      /\b(summer|spring|fall|autumn|winter|Q[1-4]|fiscal year|season|seasonal)\b/,
      
      // Age/Era of Things (NOT People)
      /\b(manufactured|built in|made in|from \d{4}|dates to|year model|vintage|production date|model year)\b/,
      
      // Formal Correspondence Markers
      /\b(letter|email|memo|wrote|date:|re:|subject:|from:|sent:)\b/,
      /\b(dated|posted|published|submitted|archived|correspondence)\b/,
      
      // Medical/Scientific Data
      /\b(study|research|trial|data|published|conducted|findings|research from|study from)\b/,
      /\b(clinical trial|experiment|analysis|investigation)\b/,
      
      // Legal/Contract Dates
      /\b(effective|expires|signed on|valid through|enforcement|contract|agreement|policy)\b/,
      /\b(law enacted|statute|regulation|ordinance)\b/,
      
      // Sports/Competition Dates
      /\b(olympics|world cup|super bowl|championship|tournament|sports|game|match|season)\b/,
      
      // Religious/Astronomical Events
      /\b(eclipse|equinox|solstice|passover|lunar|solar|astronomical|astronomy|full moon|new moon)\b/,
      
      // Time Period Descriptions
      /\b(from \d{4} to \d{4}|between .* and .*|span of|period of|range|timeframe|era)\b/,
      /\b(past|history|historically|previously|former|old|vintage)\b/,
    ];
    
    // EXPANDED DURATION MARKERS - for work, education, residence
    const durationMarkers = [
      // Work experience
      /\b(worked|work|employed|employment|tenure|experience|career)\s+(for|of|spanning)\b/,
      /\b(years (of|in|at|with)|years experience|worked for|work for|been at|been with)\b/,
      /\b(more than|over|less than|at least)\s+\d{1,3}\s+years\b/,
      // Education
      /\b(studied|school|university|college|graduated|studied for)\b/,
      /\b(took|spent)\s+\d{1,3}\s+years\b/,
      // Residence and location duration
      /\b(lived|lived for|lived in|stayed|residing|residence|been here|based in)\b/,
      // General time duration
      /\b(for|during|throughout|spanning|lasting|period|duration)\b/,
    ];
    
    // EXPANDED TIME-AGO MARKERS - for historical references
    const timeAgoMarkers = [
      /\b(years?\s+ago|years?\s+back|years?\s+prior|years?\s+before|years?\s+earlier)\b/,
      /\b(ago|back|since|past|previously|formerly|before)\b/,
      /\b(in the past|over the past|for the past)\b/,
      /\b(when i was|when we were|back then|those days)\b/,
    ];
    
    // Priority order: non-pii → time-ago → duration → age
    
    // CRITICAL: Check for explicit "today is" + date pattern FIRST (highest priority)
    // This prevents "birthday" keywords elsewhere from triggering false positives
    const todayPatterns = [
      /today\s+is/,
      /the\s+date\s+is/,
      /it\s+is/,
      /as\s+of\s+today/,
      /right\s+now\s+it'?s/,
      /current\s+date/,
    ];
    
    const hasTodayPattern = todayPatterns.some(p => p.test(beforeText)) || todayPatterns.some(p => p.test(afterText));
    
    if (hasTodayPattern) {
      // Also verify we have a date-like pattern (month names or numeric dates)
      const datePatterns = [
        /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/,
        /\d{1,2},?\s*\d{4}/,
      ];
      
      if (datePatterns.some(p => p.test(beforeText)) || datePatterns.some(p => p.test(afterText))) {
        return "non_pii_context";  // Definitely a calendar date, not a birthday
      }
    }
    
    // Check for non-PII contexts first (most specific)
    if (nonPIIContextPatterns.some(m => m.test(beforeText)) || nonPIIContextPatterns.some(m => m.test(afterText))) {
      return "non_pii_context";
    }
    
    // Check for time-ago first (most specific, highest priority)
    if (timeAgoMarkers.some(m => m.test(afterText)) || timeAgoMarkers.some(m => m.test(beforeText))) {
      return "time_ago";
    }
    
    // Check for duration second (specific work/education/residence keywords)
    if (durationMarkers.some(m => m.test(beforeText))) {
      return "duration";
    }
    
    // Check for age context (default to age if other markers not found)
    if (ageMarkers.some(m => m.test(beforeText)) || ageMarkers.some(m => m.test(afterText))) {
      return "age";
    }
    
    return "unknown";
  }

  // ── B1: GAZETTEER SCAN (INTERNAL HELPER ONLY) ────────────────────────────
  // This function now produces full findings with all required fields.
  // B1 findings serve as fallback when B2 trigger phrases don't match,
  // ensuring contextual terms are always detected.
  // ENHANCED: Context analysis to filter out non-PII references

  function runGazetteerScan(text) {
    const findings = [];
    const lower = text.toLowerCase();
    const seen = new Set();  // Track already-found items to avoid duplicates

    for (const [category, terms] of Object.entries(GAZETTEER)) {
      for (const term of terms) {
        // ── EXACT MATCH (original behavior) ────────────────────────────────
        const re = new RegExp("\\b" + term.replace(/[-]/g, "\\-") + "\\b", "i");
        let match;
        const globalRe = new RegExp("\\b" + term.replace(/[-]/g, "\\-") + "\\b", "gi");
        
        // Check all occurrences of this term
        while ((match = globalRe.exec(text)) !== null) {
          // NEW: Analyze context before flagging as PII
          const isRiskyContext = analyzeTermContext(text, match.index, match[0].length, category);
          
          if (!isRiskyContext) {
            // Context analysis indicates this is safe/educational, skip it
            console.log(
              '[TrustPrompt/PATH_B/B1] Filtered safe context: "' + match[0] + 
              '" in category "' + category + '"'
            );
            continue;  // Skip this match
          }

          // B1 findings: bare gazetteer terms detected in risky context
          // These have proper structure for scoring and display
          const meta = CATEGORY_META[category] || { label: category, sanitize: () => "[REDACTED]" };
          const dedupeKey = category + ":" + match[0].toLowerCase();
          
          if (!seen.has(dedupeKey)) {
            findings.push({
              patternId:   "gazetteer_" + category,
              label:       meta.label,
              risk:        "low",  // Base risk for gazetteer terms
              // ★ For consistency, use normalized term for rawMatch
              rawMatch:    category === "medical" ? normalizeMedicalTerm(match[0]) : match[0],
              originalMatch: match[0],  // Keep original for reference
              safeVersion: meta.sanitize ? meta.sanitize(match[0]) : "[REDACTED]",
              source:      "B1_gazetteer",
              validated:   false,
              matchType:   "exact",
              normalizedTerm: category === "medical" ? normalizeMedicalTerm(match[0]) : undefined
            });
            seen.add(dedupeKey);
          }
        }

        // ── FUZZY MATCH (new: for medical terms with typo tolerance) ────────
        // Only apply fuzzy matching to medical category to catch typos like "menstration"
        if (category === "medical") {
          const fuzzyMatches = fuzzyMatchMedicalTerm(text, term, FUZZY_THRESHOLD);
          
          for (const fuzzyMatch of fuzzyMatches) {
            // Skip if this exact text already found via exact match
            const dedupeKey = category + ":" + fuzzyMatch.matchText.toLowerCase();
            if (seen.has(dedupeKey)) {
              continue;
            }
            
            // Only report fuzzy matches if similarity is good but not perfect (>= threshold, < 1.0)
            if (fuzzyMatch.similarity < 1.0 && fuzzyMatch.similarity >= FUZZY_THRESHOLD) {
              // Analyze context before flagging as PII
              // For fuzzy matches, find the character position in the original text
              let charIndex = 0;
              let wordCount = 0;
              const searchText = text.toLowerCase();
              const matchLower = fuzzyMatch.matchText.toLowerCase();
              charIndex = searchText.indexOf(matchLower);
              
              if (charIndex >= 0) {
                const isRiskyContext = analyzeTermContext(text, charIndex, fuzzyMatch.matchText.length, category);
                
                if (!isRiskyContext) {
                  console.log(
                    '[TrustPrompt/PATH_B/B1] Filtered safe context (fuzzy): "' + fuzzyMatch.matchText + 
                    '" in category "' + category + '"'
                  );
                  continue;  // Skip this match
                }
              }

              const meta = CATEGORY_META[category] || { label: category, sanitize: () => "[REDACTED]" };
              const correctionMsg = getCorrectionMessage(fuzzyMatch.matchText, fuzzyMatch.canonical);
              
              findings.push({
                patternId:   "gazetteer_" + category,
                label:       meta.label,
                risk:        "low",
                // ★ DISPLAY CORRECTED SPELLING: Show what was found, but normalize to canonical form for display
                // For fuzzy matches, display the canonical/correct spelling instead of the typo
                rawMatch:    fuzzyMatch.canonical,         // Display corrected spelling (canonical term)
                originalMatch: fuzzyMatch.matchText,       // Keep actual matched typo for reference
                canonicalMatch: fuzzyMatch.canonical,      // The canonical form from DB (for grouping)
                safeVersion: meta.sanitize ? meta.sanitize(fuzzyMatch.canonical) : "[REDACTED]",
                source:      "B1_gazetteer_fuzzy",
                validated:   false,
                matchType:   "fuzzy",
                similarity:  fuzzyMatch.similarity.toFixed(2),
                detectedAs:  fuzzyMatch.matchText,         // ★ NEW: Show what was actually detected (the typo)
                correctedTo: fuzzyMatch.canonical,         // ★ NEW: Show the correction
                correctionMessage: correctionMsg,         // Shows what was found vs what's in DB
                normalizedTerm: normalizeMedicalTerm(fuzzyMatch.matchText)  // Normalize what was actually found
              });
              seen.add(dedupeKey);
              
              console.log(
                '[TrustPrompt/PATH_B/B1] Fuzzy match found: "' + fuzzyMatch.matchText + 
                '" → "' + fuzzyMatch.canonical + '" (similarity: ' + fuzzyMatch.similarity.toFixed(2) + ')'
              );
            }
          }
        }
      }
    }

    return findings;
  }

  // ── B2 + B3: TRIGGER-PHRASE SCAN + GRAMMAR CHECK + NLP CONTEXT ──────────
  //
  // Enhanced with NLP context checking to distinguish:
  //   - General information-seeking: "what foods for diabetes?" → NO finding
  //   - Personal disclosure: "i have diabetes" → FINDING
  //
  // The NLP check examines text context (before the trigger) to detect:
  //   - Question markers: "what are", "how to", "explain", etc. → info-seeking
  //   - Personal markers: "i have", "i suffer", "my condition", etc. → PII

  /**
   * Check if the context around a trigger phrase indicates personal disclosure
   * (actual PII) vs. general information-seeking.
   *
   * For example:
   *   "what are good foods for diabetes?" → Question context, NOT personal
   *   "i have diabetes and need help" → Personal disclosure, IS PII
   */
  function isPersonalContext(text, startIdx, triggerCategory) {
    // Get the text leading up to the trigger
    const beforeText = text.substring(0, startIdx).toLowerCase();

    // Question markers that suggest info-seeking (NOT PII)
    const isInformationSeeking = /\b(what|how|explain|describe|tell me|show me|give me|search for)\b/.test(beforeText);

    // If preceded by question/info-seeking language, it's not personal PII
    if (isInformationSeeking) {
      return false;
    }

    // For specific categories, check for personal disclosure markers
    if (triggerCategory === "health") {
      return /\b(i|me|my)\b/.test(beforeText) || beforeText.match(/suffer|diagnosed|condition|illness/);
    }

    if (triggerCategory === "financial") {
      return /\b(i|me|my)\b/.test(beforeText) || beforeText.match(/earn|salary|income|account|card/);
    }

    if (triggerCategory === "location") {
      return /\b(i|me|my)\b/.test(beforeText) || beforeText.match(/live|address|home|stay|reside/);
    }

    // Default: allow (trigger itself suggests personal context)
    return true;
  }

  // ── CONTEXT-AWARE FILTERING FOR PHONE & IP ───────────────────────────────────
  // These helpers suppress phone/IP detection in educational/technical contexts
  // while preserving detection when there's clear sharing intent

  /**
   * Detect if phone/IP is used in educational/technical context.
   * NOTE: This does NOT suppress detection - phone/IP are ALWAYS flagged as they are PII.
   * Instead, this is used to adjust risk level:
   *   - Educational context: "how many grams in 09172345678?" → risk: LOW (accidental exposure)
   *   - Sharing intent: "my number is 09171234567" → risk: MODERATE/HIGH (intentional sharing)
   *
   * @param {string} text - full text
   * @param {number} matchStart - character index where match starts
   * @param {number} matchLength - character length of the match
   * @returns {boolean} true if educational/technical context detected
   */
  function isEducationalContext(text, matchStart, matchLength) {
    // Extract 150-char window before and after match
    const beforeStart = Math.max(0, matchStart - 150);
    const afterEnd = Math.min(text.length, matchStart + matchLength + 150);
    const beforeWindow = text.substring(beforeStart, matchStart);
    const afterWindow = text.substring(matchStart + matchLength, afterEnd);
    const contextWindow = (beforeWindow + afterWindow).toLowerCase();

    // Educational/technical keywords that indicate discussion, not direct sharing
    const educationalKeywords = [
      "example", "like", "such as", "e.g.", "for instance",
      "format", "valid", "invalid", "range", "specification",
      "typical", "usually", "commonly", "standard", "how many",
      "what is", "question", "asking"
    ];

    // Check if any educational keyword is present in the context
    const hasEducationalKeyword = educationalKeywords.some(kw => contextWindow.includes(kw));
    
    // Questions ending with "?" may indicate information-seeking rather than sharing
    const hasQuestion = contextWindow.includes("?");
    
    // Technical documentation keywords
    const technicalKeywords = ["rfc", "subnet", "cidr", "netmask", "protocol", "documentation", "specification"];
    const hasTechnicalContext = technicalKeywords.some(kw => contextWindow.includes(kw));

    // Educational context = has educational keywords OR is a question (but not "call me" etc)
    const isEducational = hasEducationalKeyword || (hasQuestion && !contextWindow.includes("call") && !contextWindow.includes("send") && !contextWindow.includes("reach"));

    return isEducational || hasTechnicalContext;
  }

  /**
   * Stub: Check if a trigger indicates personal context or information-seeking.
   * This function is referenced in the standard trigger processing path.
   * For now, return true (allow) to ensure compatibility.
   */
  function isPersonalContext(text, triggerCharIdx, category) {
    // For phone/IP, we use hasEducationalContext instead
    // For other categories, trust the trigger phrase to indicate personal context
    return true;
  }

  /**
   * Extract phone number from text following a trigger phrase.
   * Handles formats: 09171234567, 0917-123-4567, +639171234567, etc.
   *
   * @param {string} text - full text
   * @param {number} triggerEnd - character index where trigger phrase ends
   * @returns {string|null} extracted phone number or null
   */
  function extractPhoneAfterTrigger(text, triggerEnd) {
    // Look at next 25 characters for phone number
    const afterTrigger = text.substring(triggerEnd, triggerEnd + 25);
    
    // Match: (09 or +639) followed by 9 digits (with optional spaces/dashes)
    const phoneRegex = /^\s*:?\s*((?:\+639|09)[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d)/i;
    const match = afterTrigger.match(phoneRegex);
    
    return match ? match[1].trim() : null;
  }

  /**
   * Extract IP address from text following a trigger phrase.
   * Matches XXX.XXX.XXX.XXX pattern.
   *
   * @param {string} text - full text
   * @param {number} triggerEnd - character index where trigger phrase ends
   * @returns {string|null} extracted IP address or null
   */
  function extractIPAfterTrigger(text, triggerEnd) {
    // Look at next 20 characters for IP address
    const afterTrigger = text.substring(triggerEnd, triggerEnd + 20);
    
    // Match: XXX.XXX.XXX.XXX (valid octets 0-255)
    const ipRegex = /^\s*:?\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
    const match = afterTrigger.match(ipRegex);
    
    return match ? match[1] : null;
  }

  /**
   * Sanitize phone number: show only first 3 and last 2 digits
   */
  function sanitizePhone(phone) {
    const cleaned = phone.replace(/[\s\-+]/g, '');
    if (cleaned.length < 5) return "[PHONE REDACTED]";
    return cleaned.slice(0, 3) + '****' + cleaned.slice(-2);
  }

  /**
   * Sanitize IP address: redact last two octets
   */
  function sanitizeIP(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return "[IP REDACTED]";
    parts[2] = 'xxx';
    parts[3] = 'xxx';
    return parts.join('.');
  }

  function runTriggerScan(text) {
    const findings = [];
    const textWords = text.split(/\s+/).filter(Boolean);

    console.log("[TrustGazetteer/DEBUG] runTriggerScan starting with " + TRIGGERS.length + " triggers");
    console.log("[TrustGazetteer/DEBUG] Text:", text.substring(0, 60));

    for (const trigger of TRIGGERS) {
      const { matched, startWordIdx, endWordIdx } = fuzzyMatchPhrase(text, trigger.phrase);
      if (!matched) continue;

      // Find character index where trigger phrase starts and ends
      let triggerCharIdx = 0;
      let triggerEndIdx = 0;
      let wordCount = 0;
      let currentPos = 0;
      
      for (let i = 0; i < text.length; i++) {
        if (!/\s/.test(text[i])) {
          if (wordCount === startWordIdx && triggerCharIdx === 0) {
            triggerCharIdx = i;
          }
          if (wordCount === endWordIdx - 1) {
            // Find end of this word
            while (i < text.length && !/\s/.test(text[i])) i++;
            triggerEndIdx = i;
            break;
          }
          if (i === 0 || /\s/.test(text[i - 1])) {
            wordCount++;
          }
        }
      }

      // ── CONTEXT-AWARE FILTERING FOR PHONE/IP ────────────────────────────────────
      // Phone and IP triggers need special handling: ALWAYS flag them as PII,
      // but mark context so scanner can adjust risk level
      if (trigger.isContactInfo) {
        // Check for educational context (DO NOT SUPPRESS - still flag as PII)
        const hasEducContext = isEducationalContext(text, triggerCharIdx, trigger.phrase.length);
        
        // Extract the actual phone/IP value
        let extractedValue = null;
        if (trigger.category === "phone_number") {
          extractedValue = extractPhoneAfterTrigger(text, triggerEndIdx);
        } else if (trigger.category === "ip_address") {
          extractedValue = extractIPAfterTrigger(text, triggerEndIdx);
        }

        if (!extractedValue) continue;  // No valid phone/IP found after trigger

        const meta = CATEGORY_META[trigger.category] || {
          label: trigger.category,
          sanitize: trigger.category === "phone_number" ? sanitizePhone : sanitizeIP
        };

        // Determine risk based on context
        let adjustedRisk = trigger.risk;
        if (hasEducContext) {
          // Educational context: lower the risk to indicate accidental exposure
          // MODERATE → LOW, HIGH → MODERATE (risk level reduced by one tier)
          adjustedRisk = trigger.risk === "high" ? "moderate" : "low";
        }

        findings.push({
          patternId:   "trigger_" + trigger.category,
          label:       meta.label || (trigger.category === "phone_number" ? "Philippine Mobile Number" : "IP Address"),
          risk:        adjustedRisk,
          rawMatch:    extractedValue,
          safeVersion: trigger.category === "phone_number" ? sanitizePhone(extractedValue) : sanitizeIP(extractedValue),
          source:      "B2_trigger",
          context:     hasEducContext ? "educational_context" : "sharing_intent"  // Mark context for governance rules
        });
        continue;  // Skip to next trigger
      }

      // ── STANDARD TRIGGER PROCESSING (for non-contact-info triggers) ─────────────────────

      // FIX #3: extract value without relying on punctuation
      const { span } = extractValue(textWords, endWordIdx, trigger);
      if (!span) continue;

      // If trigger requires a gazetteer hit in the following span, check it
      if (trigger.requireGazetteer) {
        const terms = GAZETTEER[trigger.requireGazetteer] || [];
        if (!terms.some(t => span.toLowerCase().includes(t))) continue;
      }

      // NLP CONTEXT CHECK: Verify this is personal PII, not general information
      if (!isPersonalContext(text, triggerCharIdx, trigger.category)) {
        // Context suggests this is general info-seeking, not personal disclosure
        continue;
      }

      // FIX #4: already handled — fuzzyMatchPhrase let this through

      // FIX #2: recapitalise the span before grammar check
      const recapSpan = recapitalise(span);

      // B3: grammar check
      if (!grammarCheck(recapSpan, trigger.category, GAZETTEER)) continue;

      const meta = CATEGORY_META[trigger.category] || { label: trigger.category, sanitize: () => "[REDACTED]" };

      // Extract just the PII value (not the trigger phrase)
      // rawMatch should be the actual PII, not the entire trigger+value phrase
      const rawMatch = span;

      findings.push({
        patternId:   "trigger_" + trigger.category,
        label:       meta.label,
        risk:        trigger.risk,
        rawMatch:    rawMatch,  // Just the extracted value (e.g., "kyleen" not "my name is kyleen")
        safeVersion: meta.sanitize(recapSpan),  // Just sanitized value
        source:      "B2_trigger"
      });
    }

    return findings;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Run the Path B scan on already-normalised text.
   *
   * Returns both B1 (bare gazetteer terms) and B2 (trigger-phrase + context) findings.
   * B1 provides fallback detection when B2's trigger phrases don't match, ensuring
   * contextual terms are always detected (e.g., "i have diabetes" where "diabetes" is
   * explicitly a personal disclosure).
   *
   * @param {string} normalisedText
   * @returns {Array} Combined B1 + B2 findings array
   */
  function scan(normalisedText) {
    // B1: Bare gazetteer term detection (internal validation tool + fallback)
    const gazetterFindings = runGazetteerScan(normalisedText);

    // B2: Trigger phrase + context check (primary detection)
    const triggerFindings = runTriggerScan(normalisedText);

    // Combine: Use B2 findings primarily, but include B1 as fallback
    // This ensures contextual terms are detected even without trigger phrases
    const combined = [...triggerFindings];
    
    // Add B1 findings that aren't already covered by B2 (deduplication by rawMatch)
    const b2Matches = new Set(triggerFindings.map(f => f.rawMatch.toLowerCase().trim()));
    for (const b1Finding of gazetterFindings) {
      if (!b2Matches.has(b1Finding.rawMatch.toLowerCase().trim())) {
        combined.push(b1Finding);
      }
    }

    console.log(
      '[TrustPrompt/PATH_B] Results: B2 triggers: ' + triggerFindings.length + 
      ', B1 fallback: ' + (combined.length - triggerFindings.length)
    );

    return combined;
  }

  // Initialize terms on module load (synchronous - no async needed)
  initializeTerms();

  return { scan };

})();

// ── Export TrustGazetteer to global scope ────────────────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.TrustGazetteer = TrustGazetteer;
}
if (typeof window !== 'undefined') {
  window.TrustGazetteer = TrustGazetteer;
}
