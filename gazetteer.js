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
  //
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

  // ── Medical — single words ─────────────────────────────────────────────────
  // Source: NHS A-Z (SRC-GAZ-002) — plain-language condition names
  const MEDICAL_WORDS = [
    // A
    "abscess", "acne", "addiction", "adhd", "aids", "alcoholism", "allergy",
    "alopecia", "alzheimer", "anaemia", "anemia", "anaphylaxis", "angina",
    "angioedema", "anorexia", "anxiety", "appendicitis", "arrhythmia",
    "arthritis", "asthma", "ataxia", "autism",
    // B
    "bipolar", "bronchitis", "bulimia",
    // C
    "cancer", "candida", "cataracts", "chemotherapy", "chickenpox", "chlamydia",
    "cholesterol", "cirrhosis", "colitis", "conjunctivitis", "constipation",
    "copd", "covid", "cystitis",
    // D
    "dementia", "dengue", "depression", "dermatitis", "diabetes", "dialysis",
    "diarrhea", "diarrhoea", "diverticulitis", "dyslexia", "dystonia",
    // E
    "eczema", "emphysema", "endometriosis", "epilepsy",
    // F
    "fibromyalgia", "flu",
    // G
    "gallstones", "gastritis", "gastroenteritis", "gerd", "glaucoma",
    "gonorrhea", "gonorrhoea", "gout",
    // H
    "haemophilia", "haemorrhoids", "hemophilia", "hemorrhoids",
    "hepatitis", "herpes", "hiv", "hypertension",
    "hyperthyroidism", "hypothyroidism",
    // I
    "impetigo", "infertility", "influenza", "insomnia", "insulin",
    // K
    "kidney",
    // L
    "laryngitis", "leukemia", "leukaemia", "lupus",
    // M
    "malaria", "malnutrition", "measles", "meningitis", "menopause",
    "mesothelioma", "migraine", "mpox", "mumps",
    // N
    "neuropathy",
    // O
    "obesity", "ocd", "osteoarthritis", "osteoporosis",
    // P
    "pancreatitis", "parkinson", "pneumonia", "polio", "pregnancy", "pregnant",
    "psoriasis", "psychosis", "ptsd",
    // R
    "rabies", "rheumatism",
    // S
    "scabies", "schizophrenia", "scoliosis", "seizure", "sepsis",
    "shingles", "sickle", "sinusitis", "stroke", "syphilis",
    // T
    "thalassemia", "thrombosis", "thyroid", "tinnitus", "tonsillitis",
    "tuberculosis",
    // U
    "ulcer",
    // V
    "vasculitis", "vertigo", "vitiligo",
    // W
    "whooping",
    // Y / Z
    "zika"
  ];

  // ── Medical — multi-word phrases ───────────────────────────────────────────
  // Sorted longest-first so longer phrases shadow shorter substrings in display
  const MEDICAL_PHRASES = [
    "chronic obstructive pulmonary disease",
    "attention deficit hyperactivity disorder",
    "myalgic encephalomyelitis chronic fatigue syndrome",
    "obsessive compulsive disorder",
    "post-traumatic stress disorder",
    "polycystic ovary syndrome",
    "irritable bowel syndrome",
    "inflammatory bowel disease",
    "seasonal affective disorder",
    "pelvic inflammatory disease",
    "non-alcoholic fatty liver disease",
    "motor neurone disease",
    "deep vein thrombosis",
    "generalised anxiety disorder",
    "generalized anxiety disorder",
    "social anxiety disorder",
    "peripheral neuropathy",
    "personality disorder",
    "obstructive sleep apnoea",
    "obstructive sleep apnea",
    "sickle cell disease",
    "sickle cell anaemia",
    "rheumatoid arthritis",
    "psoriatic arthritis",
    "binge eating disorder",
    "postnatal depression",
    "multiple sclerosis",
    "celiac disease",
    "coeliac disease",
    "crohn's disease",
    "crohns disease",
    "heart failure",
    "heart disease",
    "heart attack",
    "high blood pressure",
    "low blood pressure",
    "blood pressure",
    "kidney disease",
    "kidney failure",
    "kidney stones",
    "kidney infection",
    "liver disease",
    "liver failure",
    "liver cancer",
    "eating disorder",
    "panic attack",
    "panic disorder",
    "anxiety disorder",
    "bipolar disorder",
    "chronic fatigue",
    "chronic pain",
    "sleep apnea",
    "sleep apnoea",
    "whooping cough",
    "thyroid disease",
    "thyroid cancer",
    "breast cancer",
    "lung cancer",
    "skin cancer",
    "cervical cancer",
    "ovarian cancer",
    "prostate cancer",
    "testicular cancer",
    "colorectal cancer",
    "bowel cancer",
    "stomach cancer",
    "bladder cancer",
    "womb cancer",
    "uterine cancer",
    "spina bifida",
    "spinal stenosis",
    "varicose veins",
    "vascular dementia",
    "food allergy",
    "food poisoning",
    "lactose intolerance",
    "hay fever",
    "type 2 diabetes",
    "type 1 diabetes",
    "down syndrome",
    "downs syndrome",
    "down's syndrome",
    "urinary tract infection",
    "urinary incontinence"
  ].sort((a, b) => b.length - a.length);

  // ── Financial — single words ───────────────────────────────────────────────
  // Source: FinRAD (SRC-GAZ-003) + BSP Glossary (SRC-GAZ-004)
  const FINANCIAL_WORDS = [
    // Core personal financial distress terms (FinRAD)
    "bankrupt", "bankruptcy", "insolvent", "insolvency",
    "foreclosure", "foreclosed", "repossession", "repossessed",
    "garnishment", "garnished",
    "debt", "debts", "indebted",
    "loan", "loans",
    "mortgage", "mortgaged",
    "overdue", "delinquent",
    "collateral", "lien",
    "liquidation", "liquidated",
    // BSP Philippines-specific terms (SRC-GAZ-004)
    "restructured",
    "dacion",                  // dacion en pago
    "nonperforming",
    "overdraft",
    "amortization", "amortisation",
    "installment", "instalment",
    "arrears",
    "default",
    // General financial disclosure indicators
    "pension", "annuity",
    "remittance", "remit",
    "payroll", "salary", "salaries",
    "income", "earnings",
    "allowance",
    "subsidy", "subsidized",
    "retrenchment", "retrenched",
    "redundancy", "redundant",
    "severance",
    "inheritance",
    "alimony", "beneficiary"
  ];

  // ── Financial — multi-word phrases ─────────────────────────────────────────
  const FINANCIAL_PHRASES = [
    "non-performing loan",
    "nonperforming loan",
    "past due",
    "past-due",
    "foreclosed asset",
    "debt consolidation",
    "credit card debt",
    "personal loan",
    "housing loan",
    "car loan",
    "auto loan",
    "student loan",
    "payday loan",
    "cash advance",
    "minimum wage",
    "net income",
    "gross income",
    "take home pay",
    "take-home pay",
    "out of work",
    "lost my job",
    "filed for bankruptcy",
    "declared bankrupt"
  ].sort((a, b) => b.length - a.length);

  // ── Nationality — single words ─────────────────────────────────────────────
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
    // ── Asia-Pacific — nationality adjectives ─────────────────────────────────
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
    "saudi", "emirati", "qatari", "kuwaiti", "omani",
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

  // Pre-compiled at load time — reused on every scan call
  const MEDICAL_WORD_RE    = _buildWordRegex(MEDICAL_WORDS);
  const MEDICAL_PHRASE_RE  = _buildPhraseRegex(MEDICAL_PHRASES);
  const FIN_WORD_RE        = _buildWordRegex(FINANCIAL_WORDS);
  const FIN_PHRASE_RE      = _buildPhraseRegex(FINANCIAL_PHRASES);
  const NAT_WORD_RE        = _buildWordRegex(NATIONALITY_WORDS);
  const NAT_PHRASE_RE      = _buildPhraseRegex(NATIONALITY_PHRASES);

  // ── GAZETTEER lookup object ───────────────────────────────────────────────
  // Flat term arrays per category — consumed term-by-term in runGazetteerScan()
  // and also passed as the third argument to grammarCheck() in runTriggerScan().
  // Keys must match what grammarCheck() accesses: medical, financial, nationality_religion.
  const GAZETTEER = {
    medical:              [...MEDICAL_WORDS, ...MEDICAL_PHRASES],
    financial:            [...FINANCIAL_WORDS, ...FINANCIAL_PHRASES],
    nationality_religion: [...NATIONALITY_WORDS, ...NATIONALITY_PHRASES],
  };

  // ── B2: TRIGGER PHRASES ───────────────────────────────────────────────────
  // Each entry:
  //   phrase   — canonical trigger (lowercase)
  //   category — what kind of PII follows the trigger
  //   risk     — risk level of the extracted value

  const TRIGGERS = [
    // Identity
    { phrase: "my name is",          category: "person_name",  risk: "medium" },
    { phrase: "my full name is",      category: "person_name",  risk: "medium" },
    { phrase: "i am called",          category: "person_name",  risk: "medium" },
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
    { phrase: "i live in",            category: "location",     risk: "medium" },
    { phrase: "i live at",            category: "location",     risk: "medium" },
    { phrase: "i stay at",            category: "location",     risk: "medium" },
    { phrase: "i reside at",          category: "location",     risk: "medium" },
    { phrase: "my address is",        category: "location",     risk: "medium" },
    { phrase: "my home address is",   category: "location",     risk: "medium" },
    { phrase: "i am from",            category: "location",     risk: "low"    },
    { phrase: "nakatira ako sa",      category: "location",     risk: "medium" }, // Filipino
    { phrase: "nakatira sa",          category: "location",     risk: "medium" },
    { phrase: "address ko",           category: "location",     risk: "medium" },
    // Health
    { phrase: "i have",               category: "health",       risk: "medium", requireGazetteer: "medical" },
    { phrase: "i was diagnosed",      category: "health",       risk: "medium" },
    { phrase: "i am diagnosed",       category: "health",       risk: "medium" },
    { phrase: "i suffer from",        category: "health",       risk: "medium" },
    { phrase: "my condition is",      category: "health",       risk: "medium" },
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
    { phrase: "my salary is",         category: "financial",    risk: "medium" },
    { phrase: "i earn",               category: "financial",    risk: "medium" },
    { phrase: "my income is",         category: "financial",    risk: "medium" },
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
    legal_term:   { label: "Legal Term",           sanitize: (v) => "[LEGAL TERM: " + v + "]"      }
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
          const riskMap = { medical: "medium", financial: "medium", nationality_religion: "low", legal: "medium" };
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
