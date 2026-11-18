// terms-identity.js — shared religion / identity vocabulary.
//
// Single source of truth for religion, denomination, and nationality terms. Used by:
//   - gazetteer.js           (religion gazetteer category, identity self-identification rule)
//   - linguistic-detector.js (first-person role extraction must not report identity as a job;
//                             extendJobHeadLeft must not absorb religion/nationality modifiers
//                             into a job-title span, e.g. "Muslim Filipina Nurse" → "Nurse")
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

  // Nationality/demonym terms that should also never be absorbed into a job-title
  // span as modifiers. Kept separate from RELIGION_TERMS because their scoring
  // path differs (nationality → gazetteer_nationality, score 0; religion →
  // gazetteer_religion, score 2). The guard in extendJobHeadLeft calls
  // containsIdentityTerm, which checks both sets.
  const NATIONALITY_TERMS = new Set([
    // Philippine demonyms
    "filipino", "filipina", "pilipino", "pilipina",
    // Other common demonyms that could appear as modifiers before a job title
    "american", "canadian", "australian", "british", "english", "japanese",
    "korean", "chinese", "indian", "thai", "indonesian", "malaysian",
    "singaporean", "vietnamese", "cambodian", "burmese", "bangladeshi",
    "pakistani", "saudi", "emirati", "arab",
  ]);

  const NATIONALITY_MATCHERS = [...NATIONALITY_TERMS].map(term => ({
    term,
    re: new RegExp("(?<![a-z])" + escapeRe(term) + "(?![a-z])"),
  }));

  /**
   * True when `candidate` matches a religion OR nationality term.
   * Used by extendJobHeadLeft to prevent absorbing identity modifiers
   * into a job-title span ("Muslim Filipina Nurse" → only "Nurse").
   * @param {string} candidate
   * @returns {boolean}
   */
  function containsIdentityTerm(candidate) {
    if (!candidate) return false;
    const lower = candidate.toLowerCase();
    return MATCHERS.some(({ re }) => re.test(lower)) ||
           NATIONALITY_MATCHERS.some(({ re }) => re.test(lower));
  }

  return { RELIGION_TERMS, NATIONALITY_TERMS, containsTerm, containsIdentityTerm };
})();

if (typeof window !== 'undefined') {
  window.TrustIdentityTerms = TrustIdentityTerms;
}
