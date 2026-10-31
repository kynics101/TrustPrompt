// ph-address-db.js
// Lightweight Philippine geographic reference data used to confirm that a
// matched street-level snippet actually belongs to a Philippine address.
//
// Coverage: all 17 regions, 82 provinces, and the most populous cities /
// municipalities (NCR, regional capitals, and major urban centres).
//
// Usage: PH_ADDRESS_DB.matchesAny(text) → true if any known PH place name
//        is found inside the text string (case-insensitive).

/* global PH_ADDRESS_DB */

const PH_ADDRESS_DB = (() => {

  // ── Regions ────────────────────────────────────────────────────────────────
  const REGIONS = [
    "ilocos region", "region i",
    "cagayan valley", "region ii",
    "central luzon", "region iii",
    "calabarzon", "region iv-a",
    "mimaropa", "region iv-b",
    "bicol region", "region v",
    "western visayas", "region vi",
    "central visayas", "region vii",
    "eastern visayas", "region viii",
    "zamboanga peninsula", "region ix",
    "northern mindanao", "region x",
    "davao region", "region xi",
    "soccsksargen", "region xii",
    "national capital region", "ncr", "metro manila",
    "caraga", "region xiii",
    "barmm", "bangsamoro",
    "cordillera administrative region", "car"
  ];

  // ── Provinces ──────────────────────────────────────────────────────────────
  const PROVINCES = [
    // Luzon
    "ilocos norte", "ilocos sur", "la union", "pangasinan",
    "batanes", "cagayan", "isabela", "nueva vizcaya", "quirino",
    "aurora", "bataan", "bulacan", "nueva ecija", "pampanga", "tarlac", "zambales",
    "batangas", "cavite", "laguna", "quezon", "rizal",
    "marinduque", "occidental mindoro", "oriental mindoro", "palawan", "romblon",
    "albay", "camarines norte", "camarines sur", "catanduanes", "masbate", "sorsogon",
    // Visayas
    "aklan", "antique", "capiz", "guimaras", "iloilo", "negros occidental",
    "bohol", "cebu", "negros oriental", "siquijor",
    "biliran", "eastern samar", "leyte", "northern samar", "samar", "southern leyte",
    // Mindanao
    "zamboanga del norte", "zamboanga del sur", "zamboanga sibugay",
    "bukidnon", "camiguin", "lanao del norte", "misamis occidental", "misamis oriental",
    "davao de oro", "davao del norte", "davao del sur", "davao occidental", "davao oriental",
    "cotabato", "sarangani", "south cotabato", "sultan kudarat",
    "agusan del norte", "agusan del sur", "dinagat islands", "surigao del norte", "surigao del sur",
    "basilan", "lanao del sur", "maguindanao del norte", "maguindanao del sur",
    "sulu", "tawi-tawi",
    // CAR
    "abra", "apayao", "benguet", "ifugao", "kalinga", "mountain province"
  ];

  // ── Cities & Major Municipalities ─────────────────────────────────────────
  const CITIES = [
    // NCR
    "manila", "quezon city", "caloocan", "las piñas", "makati", "malabon",
    "mandaluyong", "marikina", "muntinlupa", "navotas", "parañaque", "pasay",
    "pasig", "pateros", "san juan", "taguig", "valenzuela",
    // Region I
    "laoag", "vigan", "san fernando la union", "dagupan", "urdaneta",
    // Region II
    "tuguegarao", "santiago",
    // Region III
    "angeles", "olongapo", "san jose del monte", "malolos", "meycauayan",
    "cabanatuan", "gapan", "munoz", "palayan", "san jose nueva ecija",
    "balanga", "san fernando pampanga",
    // Region IV-A
    "batangas city", "lipa", "calamba", "san pablo", "sta rosa", "antipolo",
    "bacoor", "dasmariñas", "general trias", "imus", "lucena",
    // Region IV-B
    "calapan", "puerto princesa",
    // Region V
    "legazpi", "naga", "iriga",
    // Region VI
    "iloilo city", "bacolod", "roxas",
    // Region VII
    "cebu city", "mandaue", "lapu-lapu", "tagbilaran", "dumaguete",
    // Region VIII
    "tacloban", "ormoc",
    // Region IX
    "zamboanga city", "dapitan", "dipolog", "pagadian",
    // Region X
    "cagayan de oro", "iligan", "malaybalay", "oroquieta", "ozamiz", "tangub",
    // Region XI
    "davao city", "davao", "tagum", "panabo", "samal", "digos",
    // Region XII
    "general santos", "kidapawan", "koronadal",
    // Region XIII
    "butuan", "surigao",
    // CAR
    "baguio", "tabuk", "bangued", "bontoc",
    // BARMM
    "cotabato city", "marawi", "lamitan"
  ];

  // ── Barangay keywords ─────────────────────────────────────────────────────
  // Full barangay list is too large to bundle; instead we match the presence
  // of the word "barangay" / "brgy" (already caught by the regex in patterns.js)
  // combined with any of the above place names.

  // Build a single sorted lookup array (lower-cased, longest first so
  // substring matches don't shadow longer ones).
  const ALL_PLACES = [...REGIONS, ...PROVINCES, ...CITIES]
    .map(p => p.toLowerCase())
    .sort((a, b) => b.length - a.length);

  /**
   * Returns true if `text` contains any known Philippine place name.
   * @param {string} text
   * @returns {boolean}
   */
  function matchesAny(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return ALL_PLACES.some(place => lower.includes(place));
  }

  /**
   * Returns all matched place names found inside `text`.
   * @param {string} text
   * @returns {string[]}
   */
  function findMatches(text) {
    if (!text) return [];
    const lower = text.toLowerCase();
    return ALL_PLACES.filter(place => lower.includes(place));
  }

  // Pre-built lookup structures for fast, allocation-free whole-word matching.
  //   PLACE_SET          — all place strings (lowercase) for O(1) exact lookup
  //   PLACE_PHRASE_LIST  — multi-word places only (checked as word-boundary
  //                         substrings, needed because a candidate like
  //                         "Davao City" should match the phrase "davao city")
  const PLACE_SET = new Set(ALL_PLACES);
  const PLACE_PHRASE_LIST = ALL_PLACES.filter(p => p.includes(" "));

  /**
   * Strict, whole-word match against the place list. Unlike matchesAny (which
   * uses substring .includes and can false-match e.g. "car" inside "Carol"),
   * this requires the place to appear as a whole word or phrase.
   * Used to validate bare place-name candidates (DEF-002/003/004/005/006).
   * @param {string} text
   * @returns {boolean}
   */
  function matchesWhole(text) {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    // Fast path: the whole candidate is exactly a known place.
    if (PLACE_SET.has(lower)) return true;
    // Token path: any individual word of the candidate is a single-word place.
    const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
    for (const tok of tokens) {
      if (PLACE_SET.has(tok)) return true;
    }
    // Phrase path: a multi-word place appears as a whole phrase in the candidate.
    for (const phrase of PLACE_PHRASE_LIST) {
      const idx = lower.indexOf(phrase);
      if (idx === -1) continue;
      const before = idx === 0 ? " " : lower[idx - 1];
      const after = idx + phrase.length >= lower.length ? " " : lower[idx + phrase.length];
      if (/[^a-z0-9]/.test(before) && /[^a-z0-9]/.test(after)) return true;
    }
    return false;
  }

  /**
   * Strict whole-candidate place match: returns true ONLY when the entire
   * candidate string is itself a known place (exact set membership), not when a
   * place merely appears as one token inside a longer phrase.
   *
   * This is the validator for the bare-place-name location PATTERN (patterns.js).
   * It prevents an organization name that happens to end in a province — e.g.
   * "Mapua Malayan Colleges Laguna" — from being flagged as a location, while a
   * standalone "Laguna" or "Davao City" still validates. (DEF-003)
   * @param {string} text
   * @returns {boolean}
   */
  function isPlaceNameExact(text) {
    if (!text) return false;
    return PLACE_SET.has(text.toLowerCase().trim());
  }

  return { matchesAny, findMatches, matchesWhole, isPlaceNameExact };

})();
