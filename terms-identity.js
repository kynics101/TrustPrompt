// terms-identity.js — shared religion / identity vocabulary.
//
// Single source of truth for religion and denomination terms. Used by:
//   - gazetteer.js           (religion gazetteer category, identity self-identification rule)
//   - linguistic-detector.js (first-person role extraction must not report identity as a job)
//
// Load order: before gazetteer.js and linguistic-detector.js in the manifest.

const TrustIdentityTerms = (() => {

  // Lowercase. Single words and multi-word phrases.
  const RELIGION_TERMS = new Set([
    // Standard English
    "muslim", "christian", "catholic", "protestant", "evangelical",
    "buddhist", "hindu", "jewish", "sikh",
    "atheist", "agnostic",
    "adventist", "pentecostal",
    "mormon", "presbyterian", "methodist", "episcopal",
    "taoist", "sunni", "islamic", "moslem",
    // Filipino-language
    "kristyano", "katoliko", "katolika", "protestante", "budista",
    // PH-specific denominations
    "aglipayan", "baptist", "lds",
    // Phrases
    "iglesia ni cristo", "inc member", "seventh-day adventist",
    "born again christian", "roman catholic", "born again", "born-again",
    "jehovah's witness", "jehovahs witness", "jehovah witness",
    "latter-day saint", "latter day saint",
    "non-catholic christian", "non-catholic",
  ]);

  const escapeRe = term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Whole-word matchers, compiled once.
  const MATCHERS = [...RELIGION_TERMS].map(term => ({
    term,
    re: new RegExp("(?<![a-z])" + escapeRe(term) + "(?![a-z])"),
  }));

  /**
   * True when `candidate` is, or contains as whole words, a religion/identity term.
   * @param {string} candidate
   * @returns {boolean}
   */
  function containsTerm(candidate) {
    if (!candidate) return false;
    const lower = candidate.toLowerCase();
    return MATCHERS.some(({ re }) => re.test(lower));
  }

  return { RELIGION_TERMS, containsTerm };
})();

if (typeof window !== 'undefined') {
  window.TrustIdentityTerms = TrustIdentityTerms;
}
