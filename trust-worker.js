// trust-worker.js
// TrustPrompt — Web Worker host for the scanner.
//
// This worker runs the same engine as the content script: scanner.js
// (TrustScanner.scan). It loads the same detection and scoring scripts, in the
// same order as the content-script entry in manifest.json, so the worker and the
// main-thread fallback always produce identical results. Do not copy scoring or
// detection logic into this file. Change scanner.js (or the scripts it loads)
// and both paths pick up the change.
//
// Scripts that need the DOM or the extension runtime (ui.js, consent-state.js,
// dom-claude.js, dom-chatgpt.js, worker-bridge.js) are not loaded here.
//
// Message in:
//   { type: "SCAN", rawText: string, scanId: number }
// Message out:
<<<<<<< HEAD
//   { type: "RESULT", scanId: number,
//     findings: Array, riskLevel: string, score: number,
//     governance: string, normalisedText: string,
//     wasCapsConverted: boolean, elapsedMs: number }
//
// OPTIMIZATION (Nov 2026):
// ───────────────────────
// The entire scan pipeline now runs in the worker to avoid blocking the main thread:
//   - Text normalization (3 paths: regex, gazetteer, NLP)
//   - Pattern regex matching (Path A)
//   - Gazetteer + trigger-phrase scanning (Path B)
//   - Linguistic NLP detection (Path C, via compromise.js)
//   - Risk scoring and governance rule evaluation (Steps 1–5)
//
// Main-thread content script only:
//   1. Extracts text from the prompt box (1ms)
//   2. Posts raw text to worker (async)
//   3. Receives findings and updates UI (async)
//   4. No regex compilation, no pattern matching, no scoring
//
// Performance target: 81 chars → <100ms (down from 800ms)
//   - Debounce: 400ms (unchanged)
//   - Worker pipeline: 50–100ms (from ~700ms on main thread)
//   - UI update: 5–10ms
=======
//   { type: "RESULT", scanId, findings, riskLevel, score, governance,
//     normalisedText, wasCapsConverted, elapsedMs }
//   { type: "ERROR", scanId, message }

// The scanner scripts read the global object as `window` (for example
// window.nlp, the Compromise NLP library). In a worker the global object is
// `self`, so alias it. This matches the content-script scope, where window is
// the global object. Without it the POS checks are skipped and results differ.
if (typeof window === "undefined") self.window = self;
>>>>>>> c27645219dc2cb3a1217598842940224945a1e9f

const _base = (typeof self !== "undefined" && self.EXTENSION_BASE) ? self.EXTENSION_BASE : "";
const _url  = (f) => _base + f;

// Same order as the content-script list in manifest.json (minus DOM/UI files).
importScripts(
  _url("lib/validator.min.js"),
  _url("lib/compromise.min.js"),
  _url("ph-address-db.js"),
  _url("terms-identity.js"),
  _url("normalizer.js"),
  _url("patterns.js"),
  _url("terms-medical.js"),
  _url("terms-financial.js"),
  _url("terms-organizations.js"),
  _url("terms-occupations.js"),
  _url("terms-names.js"),
  _url("terms-names-extra.js"),
  _url("context-attribution.js"),
  _url("gazetteer.js"),
  _url("organization-loader.js"),
  _url("organization-detector-enhanced.js"),
  _url("linguistic-detector.js"),
  _url("validator-wrapper.js"),
  _url("scanner.js")
);

<<<<<<< HEAD
// ── NER Model Caching (Performance Optimization) ──────────────────────────────
// The NER model (transformer) is loaded once on first scan and cached in worker memory.
// This eliminates 600-1000ms model loading time on subsequent scans.
// 
// AUTO WARM-UP: Model initialization begins when worker loads (non-blocking),
// so by the time user opens their first prompt, the model is ready.
// Impact: 1st scan: 1500ms, 2nd+ scans: 600ms (60% faster after warm-up)

let nrModelCached = false;
let nrModelError = false;

const ensureNRModelCached = async () => {
  if (nrModelCached || nrModelError) return;
  if (typeof TrustLinguisticDetector === 'undefined') {
    nrModelError = true;
    return;
  }

  try {
    // Trigger model initialization with empty input (warm-up)
    // This loads the transformer model into worker memory
    const _ = await TrustLinguisticDetector.scan("");
    nrModelCached = true;
  } catch (err) {
    nrModelError = true;
  }
};

// AUTO WARM-UP: Start model loading immediately when worker loads (non-blocking)
// This runs in background so the first scan won't pay the full model-loading penalty
ensureNRModelCached();  // Fire and forget — runs in background

// ── Data Availability Check ──────────────────────────────────────────────────────
// The worker-data-bundle.js should have been imported via blob, making these
// available. If not available, the Worker will log warnings but continue with
// graceful degradation (empty gazetteers).

// Data availability check (silent — no logging overhead)
if (typeof self !== 'undefined') {
  const dataStatus = {
    medical: typeof self.MEDICAL_TERMS_DATA !== 'undefined' ? 'ready' : 'missing',
    financial: typeof self.FINANCIAL_TERMS_DATA !== 'undefined' ? 'ready' : 'missing',
    organizations: typeof self.ORGANIZATIONS_DATA !== 'undefined' ? 'ready' : 'missing',
    gazetteer: typeof TrustGazetteer !== 'undefined' ? 'ready' : 'missing',
    detector: typeof TrustLinguisticDetector !== 'undefined' ? 'ready' : 'missing'
  };
  // Silent check — no console logging to avoid performance overhead
}

// ── STEP 1: Base scores ───────────────────────────────────────────────────────

const BASE_SCORES = {
  credit_card:      10,
  jwt:              10,
  api_key:          10,
  id_label:         10,

  // ── Philippine Government IDs (all score 10) ────────────────────────────
  ph_id_philid:              10,  // PhilID (PSA National ID)
  ph_id_passport:            10,  // Passport (BI)
  ph_id_umid:                10,  // UMID (Unified Multi-Purpose ID)
  ph_id_sss:                 10,  // SSS (Social Security System)
  ph_id_prc:                 10,  // PRC (Professional Regulation Commission)
  ph_id_philhealth:          10,  // PhilHealth (Health Insurance)

  email:            5,
  ph_mobile:        5,
  phone_intl:       5,
  ph_address:       5,
  source_code:      5,  // Source code blocks are significant-tier
  birthday_date:    5,  // Birthday / birth date — demographic identifier (Moderate)

  ipv4:             2,
  ipv6:             2,
  mac_address:      2,
  personal_label:   2,
  trigger_person_name: 2,
  trigger_age:         2,
  trigger_dob:         2,
  trigger_employer:    0,  // not scored: employer mentions are detected but add no score or unit
  trigger_location:    2,
  location_field:      0,  // labeled "Location:" place — shown, not scored
  trigger_religion:    2,  // Religion triggers are limited-tier

  trigger_health:      0,  // Context indicator, not scored
  trigger_financial:   0,  // Context indicator, not scored
  gazetteer_medical:   0,  // Context indicator, not scored
  gazetteer_financial: 0,  // Context indicator, not scored
  gazetteer_nationality: 0,  // Nationality context — no independent score
  nlp_person_name:     2,  // PATH C linguistic
  nlp_job_title:       2,  // PATH C linguistic
  nlp_organization:    2,  // PATH C linguistic
  age_value:           2,  // Age (numeric or text) — demographic identifier (Low)
};

// ── Entity tiers ──────────────────────────────────────────────────────────────

const ENTITY_TIER = {
  credit_card:      "critical",
  jwt:              "critical",
  api_key:          "critical",
  id_label:         "critical",

  // ── Philippine Government IDs (all critical tier) ────────────────────────
  ph_id_philid:              "critical",  // PhilID (PSA National ID)
  ph_id_passport:            "critical",  // Passport (BI)
  ph_id_umid:                "critical",  // UMID (Unified Multi-Purpose ID)
  ph_id_sss:                 "critical",  // SSS (Social Security System)
  ph_id_prc:                 "critical",  // PRC (Professional Regulation Commission)
  ph_id_philhealth:          "critical",  // PhilHealth (Health Insurance)

  email:            "significant",  // FIXED: Should be "significant", not "direct"
  ph_mobile:        "significant",  // FIXED: Should be "significant", not "direct"
  phone_intl:       "significant",  // FIXED: Should be "significant", not "direct"
  ph_address:       "significant",  // FIXED: Should be "significant", not "direct"
  source_code:      "significant",  // Source code is significant-tier
  birthday_date:    "significant",  // Birthday / birth date — demographic identifier

  ipv4:             "limited",
  ipv6:             "limited",
  mac_address:      "limited",
  personal_label:   "limited",
  trigger_person_name: "limited",
  trigger_age:         "limited",
  trigger_dob:         "limited",
  trigger_employer:    "contextual",
  trigger_location:    "limited",
  trigger_religion:    "limited",  // Religion triggers are limited-tier
  trigger_health:      "contextual",
  trigger_financial:   "contextual",
  gazetteer_medical:   "contextual",
  gazetteer_financial: "contextual",
  gazetteer_nationality: "contextual",  // Nationality context indicator
  nlp_person_name:     "limited",  // PATH C linguistic
  nlp_job_title:       "limited",  // PATH C linguistic
  nlp_organization:    "limited",  // PATH C linguistic
  age_value:           "limited",  // Age (numeric or text) — demographic identifier
};

// Rule 2 condition 1 is limited to valid personal identifiers: personal name,
// email, phone, physical address, date of birth, card number, government ID.
const RULE2_TRIGGER_IDS = new Set([
  "nlp_person_name", "trigger_person_name",
  "email", "ph_mobile", "phone_intl",
  "ph_address",
  "birthday_date", "trigger_dob",
  "credit_card",
  "id_label",
]);
function isRule2TriggerEntity(patternId) {
  return RULE2_TRIGGER_IDS.has(patternId) || /^ph_id_/.test(patternId);
}

const SENSITIVE_CONTEXT_IDS = new Set([
  "gazetteer_medical",
  "gazetteer_financial",
  "gazetteer_nationality",  // Nationality — Rule 2 context indicator (religion is NOT a context indicator)
  "trigger_health",
  "trigger_financial",
]);

const RISK_ORDER = { none: 0, low: 1, moderate: 2, high: 3 };

// ── Scoring-unit grouping (mirror of scanner.js) ──────────────────────────────
//
// Closely related fields collapse into one "scoring unit" so the distinct-type
// count and base total are not inflated when several fields describe the same
// information category. Detection stays field-specific; only the risk
// calculation counts the unit once.
//   Contact Information       → email and/or phone number  (base 5)
//   Organizational Affiliation → org name, job title, dept  (base 2)
const SCORING_UNIT_GROUPS = {
  // One personal-name entity type. The NLP and trigger detectors can both find
  // the same name; they count as one unit (base 2), once per prompt.
  personal_name: new Set([
    "nlp_person_name",
    "trigger_person_name",
  ]),
  contact_information: new Set([
    "email",
    "ph_mobile",
    "phone_intl",
  ]),
  organizational_affiliation: new Set([
    "nlp_organization",
    "nlp_job_title",
  ]),
};

const SCORING_UNIT_BASE = {
  personal_name:              2,
  contact_information:        5,
  organizational_affiliation: 2,
};

function scoringUnitKey(patternId) {
  for (const unitKey in SCORING_UNIT_GROUPS) {
    if (SCORING_UNIT_GROUPS[unitKey].has(patternId)) return unitKey;
  }
  return patternId;
}

function scoringUnitBase(unitKey) {
  if (unitKey in SCORING_UNIT_BASE) return SCORING_UNIT_BASE[unitKey];
  return BASE_SCORES[unitKey] ?? 0;
}

// ── Rule 2 — Sentence-level co-occurrence (shared with scanner.js) ───────────
//
// The decision logic lives in context-attribution.js, loaded via importScripts.
// It is the only copy of the Rule 2 codebook (Medical Anchor Rule, nationality
// attribution, exclusion filter). Do not duplicate it here.
// Gazetteer context-only candidates are kept only when a Rule 2 identifier
// shares the sentence. If the shared module is missing, candidates are dropped.
function resolveContextOnly(findings, scannedText) {
  if (typeof ContextAttribution === "undefined") {
    return findings.filter(f => !f.contextOnly);
  }
  const triggers = findings
    .filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0 && isRule2TriggerEntity(f.patternId))
    .map(f => f.rawMatch);
  return ContextAttribution.resolveContextOnlyFindings(findings, scannedText, triggers);
}

function evaluateSentenceCooccurrence(findings, fullText) {
  if (typeof ContextAttribution === "undefined") {
    // Silent error — context-attribution module not loaded
    return { escalate: false, rule: "module_missing", patternId: null, category: null, polarity: null, term: null, sentence: null };
  }
  const triggerTexts = findings
    .filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0 && isRule2TriggerEntity(f.patternId))
    .map(f => f.rawMatch);
  const contexts = findings
    .map(f => {
      const category = ContextAttribution.categoryForPatternId(f.patternId);
      // Medical rawMatch is the canonical form ("diabetic" -> "diabetes"). The
      // anchor check needs the word the user typed, so use originalMatch.
      const typed = category === "medical" && typeof f.originalMatch === "string" ? f.originalMatch.trim() : "";
      return { text: typed || f.rawMatch, category: category };
    })
    .filter(c => c.category);
  return ContextAttribution.evaluateCooccurrence(fullText, { triggerTexts: triggerTexts, contexts: contexts });
}

// ── STEP 2: Distinct entity-type multiplier ───────────────────────────────────

function getMultiplier(distinctTypeCount) {
  if (distinctTypeCount >= 5) return 2.00;
  if (distinctTypeCount === 4) return 1.70;
  if (distinctTypeCount === 3) return 1.40;
  if (distinctTypeCount === 2) return 1.20;
  return 1.00;
}

// ── STEP 3: Preliminary classification (Table 13) ────────────────────────────
//
// Thresholds per manuscript Table 13:
//   No Risk  = 0
//   Low      = 2 – 4.99
//   Moderate = 5 – 14.99
//   High     = 15+

function preliminaryClass(score) {
  if (score >= 15) return "high";
  if (score >= 5)  return "moderate";
  if (score >= 2)  return "low";
  return "none";
}

// ── STEP 4: Governance rule evaluation (Table 15) ────────────────────────────
//
// Rules are evaluated in strict decision order — cascading if/else-if.
// Only the first matching rule applies.
//
// Rule 1 — Strongly Validated Critical-Entity Rule
//   Any finding where ENTITY_TIER = "critical" AND validated = true → HIGH
//
// Rule 2 — Sensitive-Context Co-occurrence Rule
//   At least one scored entity (BASE_SCORES > 0) AND at least one context
//   indicator (SENSITIVE_CONTEXT_IDS) → raise preliminary by one level
//
// Rule 3 — Low-Impact Cap
//   ALL scored entities have BASE_SCORES === 2 (no moderate or high entity)
//   → cap final result at Moderate
//
// Rule 4 — No governance rule applies → retain preliminary

// ── Organization attribution (scoring gate; mirrors scanner.js) ───────────────
// An organization is scored only when the sentence ties it to the writer
// ("my company X", "I work at X", "I am a member of X"). A third-party or
// general mention is detected and shown with no score.
const ORG_AFFILIATION_BEFORE_RE = new RegExp(
  "\\b(?:my|our|mine)\\s+(?:[\\w'’-]+\\s+){0,2}?" +
    "(?:company|employer|workplace|office|school|university|college|organization|team|firm|church|association|club|agency|hospital|clinic|branch|department|unit|group)\\b[^.!?\\n]*$" +
  "|" +
  "\\b(?:i|we)\\s+(?:" +
    "(?:work|worked|works|working|serve|served|study|studied|intern|interned|volunteer|volunteered|teach|taught|belong|belonged|joined|employed|hired|graduated|attended)\\b" +
    "|(?:am|was|are|were)\\s+(?:(?:a|an|the)\\s+)?" +
      "(?:(?:member|members|employee|employees|staff|student|students|intern|interns|volunteer|volunteers|alumni|alumnus|alumna|graduate|graduates)\\s+(?:of|at|with|for)\\b" +
      "|(?:hired|employed|recruited)\\s+(?:by|at)\\b)" +
  ")[^.!?\\n]*$" +
  "|\\b(?:before|after)\\s+working\\s+(?:at|for)\\b[^.!?\\n]*$" +
  "|\\bi['’]m\\s+(?:(?:a|an|the)\\s+)?(?:(?:member|employee|student|intern|volunteer|alumni|alumnus|alumna|graduate)\\s+(?:of|at|with|for)\\b)[^.!?\\n]*$" +
  // a job title right before "at" / "with": "Head of Operations at X", "IT Manager at X"
  "|\\b(?:manager|director|head|officer|engineer|analyst|specialist|coordinator|supervisor|lead|chief|president|consultant|executive|staff|employee|representative|teacher|nurse|doctor|accountant|secretary|worker|agent|leader|operator|technician|clerk|cashier|assistant|associate|administrator|mechanic|electrician|welder|driver|guard|cook|chef|developer|programmer|designer|trainer|tutor|pharmacist|dentist|therapist|caregiver|counselor|counsellor|advisor|adviser|minister|pastor|reporter|editor|writer|researcher|scientist|professor|lecturer|ceo|cto|cfo|coo)\\b[^.!?\\n]*\\b(?:at|with|of)\\s+$",
  "i"
);
function isAttributedOrganization(fullText, name) {
  if (!fullText || !name) return false;
  const lower = fullText.toLowerCase();
  const needle = name.trim().toLowerCase();
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
    const sentenceStart = Math.max(lower.lastIndexOf('.', i - 1), lower.lastIndexOf('!', i - 1),
                                   lower.lastIndexOf('?', i - 1), lower.lastIndexOf('\n', i - 1)) + 1;
    if (ORG_AFFILIATION_BEFORE_RE.test(fullText.slice(sentenceStart, i))) return true;
  }
  return false;
}
// Labeled record fields (mirrors scanner.js): the value of a "Company:" field in a
// multi-field record that is not a hiring notice is an attributed organization.
const RECORD_FIELD_LABEL_RE = /(?:^|[\n.;|]|\s)\s*[A-Za-z][A-Za-z ]{1,24}\s*[:=]\s*\S/g;
const RECORD_ORG_LABEL_RE = /(?:^|[\n.;|,]|\s)\s*(?:company|employer|organi[sz]ation|workplace|agency|affiliation)\s*[:=]\s*$/i;
const RECORD_HIRING_RE = /\b(?:hiring|vacanc(?:y|ies)|job\s+(?:opening|openings|posting|ad|advert(?:isement)?)|now\s+accepting|apply\s+(?:now|here|at|by|online)|applicants?|we\s+are\s+looking\s+for|qualifications?|requirements?)\b/i;
function isRecordFieldValue(fullText, name, labelRe) {
  if (!fullText || !name) return false;
  if ((fullText.match(RECORD_FIELD_LABEL_RE) || []).length < 2) return false;
  if (RECORD_HIRING_RE.test(fullText)) return false;
  const lower = fullText.toLowerCase();
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
    if (labelRe.test(fullText.slice(Math.max(0, i - 40), i))) return true;
  }
  return false;
}
// ── Personal attributes (scoring gate; mirrors scanner.js) ───────────────────
// Age, height, weight, eye color, blood type and sex are scored only when the
// sentence ties the value to the writer ("I'm 25", "I weigh 70 kg", "my height
// is 170 cm") or the value belongs to a labeled record field ("Age: 25" in a
// record with at least two labeled fields that is not a hiring notice).
// Third-person / generic mentions are detected and shown but add no score.
// Only age_value currently has a base score in this file's BASE_SCORES.
const PERSONAL_ATTRIBUTE_IDS = new Set([
  "age_value",
  "height_mention",
  "weight_mention",
  "eye_color_mention",
  "blood_type_mention",
  "sex_mention",
]);
const ATTR_MAX_TAIL_WORDS = 6;
const ATTR_LEAD_RE = /\b(?:i['’]?m|i\s+am|i\s+was|i['’]ll\s+be|i\s+will\s+be|i\s+(?:just\s+)?turn(?:ed|ing|s)?|i['’]ll\s+turn|i\s+will\s+turn|i\s+weigh(?:ed)?|i\s+stand|i\s+measure[ds]?)\b/gi;
const ATTR_LEAD_HAVE_RE = /\b(?:i\s+have|i['’]ve(?:\s+got)?|i\s+had|i\s+got)\b/gi;
const ATTR_POSSESSIVE_RE = /\bmy\s+(?:own\s+)?(?:age|height|weight|blood\s*(?:type|group)|eye\s*colou?r|eyes?|sex|gender)\b/gi;
const ATTR_NON_SELF_WORDS = new Set([
  "my", "his", "her", "hers", "their", "our", "your", "he", "she", "they", "we", "you",
  "the", "this", "that", "these", "those", "its", "it", "who", "whom", "whose", "which",
]);
const RECORD_ATTR_LABEL_RE = /(?:^|[\n.;|,]|\s)\s*(?:age|sex|gender|height|weight|blood\s*(?:type|group)|eye\s*colou?r|eyes?)\s*[:=]\s*(?:[^\n;|.]|\.(?=\d)){0,24}$/i;

function attrTailIsSelf(prefix, re) {
  const rx = new RegExp(re.source, re.flags);
  let m;
  while ((m = rx.exec(prefix)) !== null) {
    if (m[0] === "") { rx.lastIndex++; continue; }
    const tail = prefix.slice(m.index + m[0].length).trim();
    const words = tail ? tail.split(/\s+/) : [];
    if (words.length > ATTR_MAX_TAIL_WORDS) continue;
    if (words.some(w => ATTR_NON_SELF_WORDS.has(w.toLowerCase().replace(/[^a-z']/g, "")))) continue;
    return true;
  }
  return false;
}
function isAttributeRecordValue(fullText, end) {
  if ((fullText.match(RECORD_FIELD_LABEL_RE) || []).length < 2) return false;
  if (RECORD_HIRING_RE.test(fullText)) return false;
  return RECORD_ATTR_LABEL_RE.test(fullText.slice(Math.max(0, end - 60), end));
}
function isAttributedPersonalAttribute(fullText, f) {
  const name = f && f.rawMatch;
  if (!fullText || !name) return false;
  const lower = fullText.toLowerCase();
  const needle = String(name).trim().toLowerCase();
  if (!needle) return false;
  const allowHave = f.patternId === "eye_color_mention" || f.patternId === "blood_type_mention";
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    const upto = fullText.slice(0, end);
    const boundary = /[\s\S]*(?:[.!?]+\s+|\n)/.exec(upto);
    const prefix = boundary ? upto.slice(boundary[0].length) : upto;
    if (attrTailIsSelf(prefix, ATTR_LEAD_RE)) return true;
    if (attrTailIsSelf(prefix, ATTR_POSSESSIVE_RE)) return true;
    if (allowHave && attrTailIsSelf(prefix, ATTR_LEAD_HAVE_RE)) return true;
    if (isAttributeRecordValue(fullText, end)) return true;
  }
  return false;
}

// Job-title record label (mirrors scanner.js RECORD_JOB_LABEL_RE). A title that is the value of "Position:", "Role:", etc. is scored.
const RECORD_JOB_LABEL_RE = /(?:^|[\n.;|,]|\s)\s*(?:position|job\s*title|title|role|designation|occupation)\s*[:=]\s*$/i;

// ── Name-linked job titles and organizations (scoring gate) ─────────────────
// A job title or organization is also scored when it is linked to a detected
// personal name in the same sentence, through an appositive comma or a short
// copula / employment link placed between them:
//   "Marites Aquino, a call center agent"   (appositive)
//   "Carlo is a nurse"                      (copula)
//   "Carlo works at Ayala Corporation"      (employment link)
// The gap between the name and the finding must match one of these links
// exactly, so a sentence break, a clause, or any other word in between blocks
// the link. Mirrors isLinkedToPersonName in scanner.js; keep the two identical.
const PERSON_NAME_IDS = new Set(["nlp_person_name", "trigger_person_name"]);
const PERSON_LINK_GAP_RE = /^(?:\s*,\s*(?:(?:a|an|the)\s+)?|\s+(?:(?:is|was|are|were)\s+(?:(?:a|an|the)\s+)?|(?:works?|worked|serves?|served)\s+as\s+(?:(?:a|an|the)\s+)?|(?:works?|worked|serves?|served|employed|hired|joined)\s+(?:at|with|for|by)\s+(?:the\s+)?|(?:is|was)\s+(?:at|with|of|from)\s+(?:the\s+)?|(?:a|an)\s+))$/i;
// Coordinated title in the same appositive: "Name, a graphic designer and illustrator".
// The gap is ", a <title words> and " (or "or"). Third-person words block the link.
const COORDINATED_TITLE_GAP_RE = /^\s*,\s*(?:a|an|the)\s+(?!.*\b(?:my|his|her|their|our|your|he|she|they|we|you|who|whom|whose|which)\b)[^,.;:!?]*?\s+(?:and|or)\s+$/i;
// Possessive appositive: "Ms. Charlene Dizon, my former teacher". Only the gap itself is accepted.
const POSSESSIVE_TITLE_GAP_RE = /^\s*,\s*my\s+(?:(?:former|current|late|old)\s+)?$/i;
// Organization after the name with "of" / "from": "Armando Dizon of Tarlac National High School".
// Organizations only. A job title is never linked this way.
const ORG_OF_GAP_RE = /^\s+(?:of|from)\s+(?:the\s+)?$/i;
// Title before the name: "teacher Rey Bautista", "Principal Mr. Armando Dizon".
// Only whitespace and an optional honorific may separate them.
const PRE_NOMINAL_GAP_RE = /^\s+(?:(?:mr|mrs|ms|miss|mx|dr|prof|engr|atty|sir|madam)\.?\s+)?$/i;
// Sentence bounds for the same-sentence link. A period ends a sentence only when it is not part of
// an honorific or abbreviation ("our principal, Mr. Armando Dizon, announced").
const LINK_ABBREV_RE = /\b(?:mr|mrs|ms|mx|dr|prof|jr|sr|st|atty|engr|gen|rev|fr|dept|vs|etc)\.$/i;
function isLinkSentenceEnd(text, k) {
  if (text[k] === "." && LINK_ABBREV_RE.test(text.slice(Math.max(0, k - 12), k + 1))) return false;
  return k + 1 >= text.length || /\s/.test(text[k + 1]);
}
function linkSentenceBounds(text, pos) {
  const isEnd = (c, k) => c === "\n" || ((c === "." || c === "!" || c === "?") && isLinkSentenceEnd(text, k));
  let start = 0;
  for (let k = pos - 1; k >= 0; k--) { if (isEnd(text[k], k)) { start = k + 1; break; } }
  let end = text.length;
  for (let k = pos; k < text.length; k++) { if (isEnd(text[k], k)) { end = k; break; } }
  return [start, end];
}
function isLinkedToPersonName(fullText, f, findings) {
  if (!fullText || !f || !f.rawMatch || !Array.isArray(findings)) return false;
  const names = findings
    .filter(p => PERSON_NAME_IDS.has(p.patternId) && p.rawMatch && p.rawMatch.trim())
    .map(p => p.rawMatch.trim().toLowerCase());
  if (names.length === 0) return false;
  // Markdown table row: a name and a job title or organization in the same "| ... |" row
  // describe one record ("| Gina Ramos | Safety Officer | Mabuhay Steelworks Inc. |").
  const rowNeedle = f.rawMatch.trim().toLowerCase();
  if (fullText.split("\n").some(line => {
    const row = line.trim().toLowerCase();
    return row.startsWith("|") && row.includes(rowNeedle) && names.some(n => row.includes(n));
  })) return true;
  // Same sentence (framework section 2): a detected personal name and this finding share one sentence,
  // in either order, with any words between them.
  const lower = fullText.toLowerCase();
  const needle = f.rawMatch.trim().toLowerCase();
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
    const [s, e] = linkSentenceBounds(fullText, i);
    for (const name of names) {
      for (let j = lower.indexOf(name, s); j !== -1 && j + name.length <= e; j = lower.indexOf(name, j + 1)) {
        if (j + name.length <= i || j >= i + needle.length) return true;
      }
    }
  }
  const isOrg = f.patternId === "nlp_organization";
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    // The finding must start on a word boundary, so "nurse" does not match inside "nursery".
    const startsWord = i === 0 || !/[\p{L}\p{N}]/u.test(lower.charAt(i - 1));
    for (const name of names) {
      // Name before the finding: "Carlo is a nurse", "Carlo works at X", "Carlo of X" (organizations).
      for (let j = lower.indexOf(name); j !== -1 && j + name.length <= i; j = lower.indexOf(name, j + 1)) {
        const gap = fullText.slice(j + name.length, i);
        if (gap.length <= 40 && (PERSON_LINK_GAP_RE.test(gap) || COORDINATED_TITLE_GAP_RE.test(gap) || POSSESSIVE_TITLE_GAP_RE.test(gap) || (isOrg && ORG_OF_GAP_RE.test(gap)))) return true;
      }
      // Finding before the name: "teacher Rey Bautista", "Principal Armando Dizon".
      if (startsWord) {
        for (let k = lower.indexOf(name, end); k !== -1; k = lower.indexOf(name, k + 1)) {
          const gap = fullText.slice(end, k);
          if (gap.length > 20) break;
          if (PRE_NOMINAL_GAP_RE.test(gap)) return true;
        }
      }
    }
  }
  return false;
}

function isScorableFinding(f, fullText, findings) {
  if ((BASE_SCORES[f.patternId] ?? 0) <= 0) return false;
  // nlp_job_title: scored when first-person attributed (attributed === true), a labeled record field value, or linked to a personal name in the same sentence.
  if (f.patternId === "nlp_job_title") return f.attributed === true || isRecordFieldValue(fullText, f.rawMatch, RECORD_JOB_LABEL_RE) || isLinkedToPersonName(fullText, f, findings);
  if (f.patternId === "nlp_organization") return isAttributedOrganization(fullText, f.rawMatch) || isRecordFieldValue(fullText, f.rawMatch, RECORD_ORG_LABEL_RE) || isLinkedToPersonName(fullText, f, findings);
  if (PERSONAL_ATTRIBUTE_IDS.has(f.patternId)) return isAttributedPersonalAttribute(fullText, f);
  return true;
}

function evaluateGovernance(findings, preliminary, fullText) {

  // ── Rule 1: validated critical entity → HIGH ────────────────────────────
  const hasValidatedCritical = findings.some(
    f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true
  );
  if (hasValidatedCritical) {
    return { rule: "critical_entity", result: "high" };
  }

  // ── Rule 2: sensitive context + same-sentence co-occurrence ──────────────
  // Decision in evaluateSentenceCooccurrence (context-attribution.js).
  const hasSensitiveContext = findings.some(
    f => SENSITIVE_CONTEXT_IDS.has(f.patternId)
  );
  if (hasSensitiveContext) {
    const cooc = evaluateSentenceCooccurrence(findings, fullText);
    if (cooc.escalate) {
      const raised = RISK_ORDER[preliminary] < RISK_ORDER["high"]
        ? Object.keys(RISK_ORDER).find(k => RISK_ORDER[k] === RISK_ORDER[preliminary] + 1)
        : "high";
      return { rule: "sensitive_context", result: raised };
    }
  }

  // ── Rule 3: Low-Impact Cap ───────────────────────────────────────────────
  // Condition: every *scored* entity (BASE_SCORES > 0) has a base score of
  // exactly 2, meaning no Moderate (5) or Critical (10) entity is present.
  const scoredFindings = findings.filter(f => isScorableFinding(f, fullText, findings));
  const hasAnyScoredEntity = scoredFindings.length > 0;
  const allLowImpact = scoredFindings.every(
    f => (BASE_SCORES[f.patternId] ?? 0) === 2
  );

  if (hasAnyScoredEntity && allLowImpact) {
    return { rule: "low_impact_cap", result: null };
  }

  // ── Rule 4: no governance rule applies → retain preliminary ─────────────
  return { rule: "none", result: null };
}

// ── STEP 5: Final classification ──────────────────────────────────────────────

function finalClass(preliminary, governance) {
  const { rule, result } = governance;

  if (rule === "critical_entity")   return "high";
  if (rule === "sensitive_context") return result;
  if (rule === "low_impact_cap") {
    return RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary;
  }
  return preliminary;
}

// ── Main scoring function ─────────────────────────────────────────────────────

function computeRiskScore(findings, fullText) {
  const scorable = findings.filter(f => isScorableFinding(f, fullText, findings));

  // ── No scored entities ──────────────────────────────────────────────────
  // Normally No Detected Risk — except the Rule 2 anchor-only path: an
  // explicit first-person self-attribution anchor (unscored) co-occurring
  // with a sensitive context indicator must still be evaluated so governance
  // can raise No Detected Risk → Low (e.g. "I was diagnosed with diabetes").
  if (scorable.length === 0) {
    const hasSensitiveContext = findings.some(f => SENSITIVE_CONTEXT_IDS.has(f.patternId));
    if (!hasSensitiveContext) {
      return { score: 0, riskLevel: "none", governance: "none" };
    }
    const preliminary = "none";
    const governance  = evaluateGovernance(findings, preliminary, fullText);
    const riskLevel   = finalClass(preliminary, governance);
    // No logging for performance
    return { score: 0, riskLevel, governance: governance.rule };
  }

  // ── Scoring-unit grouping ──────────────────────────────────────────────
  // Count each distinct SCORING UNIT once (grouped fields collapse into a
  // single unit), feeding both the base total and the distinct-type count.
  const seenUnits = new Set();
  let baseTotal   = 0;
  for (const f of scorable) {
    const unitKey = scoringUnitKey(f.patternId);
    if (!seenUnits.has(unitKey)) {
      seenUnits.add(unitKey);
      baseTotal += scoringUnitBase(unitKey);
    }
  }

  const distinctTypeCount = seenUnits.size;
  const multiplier        = getMultiplier(distinctTypeCount);
  const preScore          = baseTotal * multiplier;
  const preliminary       = preliminaryClass(preScore);
  const governance        = evaluateGovernance(findings, preliminary, fullText);
  const riskLevel         = finalClass(preliminary, governance);

  // No logging for performance
  return {
    score:      Math.round(preScore * 100) / 100,
    riskLevel,
    governance: governance.rule
  };
}

// ── TASK-4.4: Placeholder suppression ────────────────────────────────────────
// Mirror of scanner.js suppressPlaceholders() — same logic, same result.

function suppressPlaceholders(findings) {
  const kept       = [];
  const suppressed = [];

  for (const f of findings) {
    if (isKnownPlaceholder(f.patternId, f.rawMatch)) {
      suppressed.push(f);
    } else {
      kept.push(f);
    }
  }

  if (suppressed.length > 0) {
    // No logging for performance
  }

  return kept;
}

// ── PATH A — Regex (worker-safe) ──────────────────────────────────────────────
//
// TASK-4.5: Entropy pre-check — if pattern.minEntropy is set, extract the value
//   portion and check Shannon entropy. Reject if below threshold.
//
// TASK-4.6: structuralValidate hook — if pattern.structuralValidate is defined
//   and returns true for the raw match, set validated:true even though the full
//   mathematical validator (Luhn, RFC5322) is unavailable in the worker.
//   This enables governance Rule 1 (critical_entity → HIGH) for vendor-prefix
//   API keys in the worker path, fixing Known Issue #4 from review.md.
//
// TASK-4.3: JWT validation is now handled by validator-wrapper-worker.js
//   _isJWT() which does a structural decode check (base64url → JSON).

// OPTIMIZATION 1: Initialize regex caching at worker load time
function _initializePatternRegexes() {
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    if (pattern.regex && !pattern._compiled) {
      pattern._compiled = pattern.regex;
    }
  }
}

function runPathA(normalisedText) {
  const findings = [];
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    if (!pattern._compiled) continue;
    
    // OPTIMIZATION: Use cached compiled regex; reset lastIndex
    const re = pattern._compiled;
    re.lastIndex = 0;
    
    let match;
    while ((match = re.exec(normalisedText)) !== null) {
      const raw = match[0];

      // TASK-4.5: Entropy pre-check
      if (pattern.minEntropy !== undefined) {
        const valueMatch = raw.match(/[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{10,})["']?\s*$/)
                        || raw.match(/^([A-Za-z0-9\-_\.+\/=]{10,})$/);
        const valueStr = valueMatch ? valueMatch[1] : raw;
        if (shannonEntropy(valueStr) < pattern.minEntropy) {
          continue;
        }
      }

      const result = TrustValidatorWorker.validate(pattern.validate, raw);

      if (!result.passed) continue;

      // TASK-4.6: structuralValidate hook — override tier for vendor-prefix matches
      let validated = result.tier !== "3_regex_only";
      if (!validated && typeof pattern.structuralValidate === "function") {
        if (pattern.structuralValidate(raw)) {
          validated = true;
        }
      }

      findings.push({
        patternId:   pattern.id,
        label:       pattern.label,
        risk:        pattern.risk,
        rawMatch:    raw,
        safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
        validated,
        source:      "A_regex"
      });
      
      // Apply pattern-specific post-processing (e.g., strip verbs from weight_mention)
      if (pattern.postProcess && typeof pattern.postProcess === 'function') {
        const lastFinding = findings[findings.length - 1];
        const processed = pattern.postProcess(lastFinding);
        findings[findings.length - 1] = processed;
      }
    }
  }
  return findings;
}

// ── Merge + deduplicate ───────────────────────────────────────────────────────

// Credential types where one secret can be matched by several regex alternatives
// with different spans (bare value vs. labelled assignment). Same set as scanner.js.
const CREDENTIAL_CONTAINMENT_IDS = new Set([
  'api_key', 'aws_key', 'github_token', 'jwt', 'connection_string', 'private_key'
]);

function mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings, sourceCodeFindings = []) {
  const allFindings = [...pathAFindings, ...pathBFindings, ...pathCFindings, ...sourceCodeFindings];

  // OPTIMIZATION 2: Pre-compute normalized metadata on each finding
  for (const f of allFindings) {
    if (!f._dedupCache) {
      f._dedupCache = {
        key: f.patternId + ":" + f.rawMatch.trim().toLowerCase(),
        rawTrimmed: f.rawMatch.trim(),
        rawLower: f.rawMatch.trim().toLowerCase(),
        length: f.rawMatch.length
      };
    }
  }

  // ── Deduplicate per (patternId × rawMatch) pair using cached keys ──
  const seen = new Map();
  for (const f of allFindings) {
    const key = f._dedupCache.key;
    const ex = seen.get(key);
    if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) {
      seen.set(key, f);
    }
  }

  // ── ph_address overlap resolution (longest span wins) ────────────────────────
  const merged = [...seen.values()];
  return merged.filter(f => {
    // ── Credential containment: one secret, two matches ─────────────────────
    if (CREDENTIAL_CONTAINMENT_IDS.has(f.patternId)) {
      const hasWiderSpan = merged.some(other =>
        other !== f &&
        other.patternId === f.patternId &&
        other._dedupCache.rawTrimmed !== f._dedupCache.rawTrimmed &&
        other._dedupCache.rawLower.includes(f._dedupCache.rawLower)
      );
      if (hasWiderSpan) return false;
    }

    if (f.patternId === 'ph_address') {
      const self = f._dedupCache.rawLower;
      const hasLongerAddress = merged.some(other =>
        other !== f &&
        other.patternId === 'ph_address' &&
        other._dedupCache.rawLower !== self &&
        other._dedupCache.rawLower.includes(self)
      );
      if (hasLongerAddress) return false;
      const hasOrgParent = merged.some(other =>
        other.patternId === 'nlp_organization' &&
        other._dedupCache.rawLower !== self &&
        other._dedupCache.rawLower.includes(self)
      );
      if (hasOrgParent) return false;
    }

    if (f.patternId === 'nlp_person_name' || f.patternId === 'nlp_organization') {
      const frag = f._dedupCache.rawLower;
      const insideAddress = merged.some(other =>
        other.patternId === 'ph_address' &&
        other._dedupCache.rawLower.includes(frag)
      );
      if (insideAddress) return false;
    }

    if (f.patternId === 'gazetteer_financial' || f.patternId === 'gazetteer_medical' ||
        f.patternId === 'trigger_financial' || f.patternId === 'trigger_health') {
      const term = f._dedupCache.rawLower;
      const inOrganization = merged.some(other =>
        other.patternId === 'nlp_organization' && other.rawMatch &&
        other._dedupCache.rawLower.includes(term)
      );
      if (inOrganization) return false;
    }
    return true;
  });
}

// ── Helper: Decide if Path C should run ────────────────────────────────────────
// Path C (NLP/Linguistic) is expensive (~600ms) but essential for detecting names,
// job titles, and organizations. For short prompts, we can skip it and save time.
//
// Decision logic:
//   < 50 words:   SKIP Path C entirely (save 600ms)
//   50-150 words: RUN Path C only if Path A+B found ambiguous/incomplete results
//   > 150 words:  ALWAYS run Path C (narrative text likely has untriggered entities)

function shouldRunPathC(rawText, pathAFindings, pathBFindings) {
  const wordCount = rawText.trim().split(/\s+/).length;
  
  // Always run for longer prompts (more likely to have narrative entities)
  if (wordCount > 150) {
    return true;
  }
  
  // Skip entirely for very short prompts
  if (wordCount < 50) {
    return false;
  }
  
  // For medium-length prompts (50-150 words), run Path C only if needed
  // Run if we found very few entities or only keywords/context indicators
  const hasHighRiskFindings = pathAFindings.some(f => 
    BASE_SCORES[f.patternId] >= 10 ||  // Critical entities (cards, IDs, APIs)
    BASE_SCORES[f.patternId] === 5      // Significant entities (emails, addresses)
  );
  
  const hasEntityNames = 
    pathAFindings.some(f => f.patternId === 'trigger_person_name' || f.patternId === 'nlp_person_name') ||
    pathBFindings.some(f => f.patternId === 'trigger_person_name' || f.patternId === 'nlp_person_name');
  
  // If we already found high-risk or person-name entities, Path C is optional
  if (hasHighRiskFindings || hasEntityNames) {
    return false;
  }
  
  // Otherwise, run Path C to catch missed names/titles/orgs
  return true;
}

// ── Message handler ───────────────────────────────────────────────────────────

=======
>>>>>>> c27645219dc2cb3a1217598842940224945a1e9f
self.onmessage = async function (e) {
  const { type, rawText, scanId, debug } = e.data || {};
  if (type !== "SCAN") return;
  self.TP_DEBUG = debug === true;

<<<<<<< HEAD
  const t0 = performance.now();

  // NER model is pre-warming in background. For short prompts where we might
  // skip Path C entirely, this doesn't matter. For longer prompts that need
  // Path C, the model will likely be ready or nearly ready.

  // Use path-specific normalization for each detection method
  const masked = TrustNormalizer.sharedLayer(rawText);
  const textRegex = TrustNormalizer.normalizePath_A(rawText);
  const textGazetteer = TrustNormalizer.normalizePath_B(rawText);
  const textNLP = TrustNormalizer.normalizePath_C(rawText);

  // ── RUN PATH A and PATH B in parallel (always) ──────────────────────────────
  const [pathAFindings, pathBFindings] = await Promise.all([
    // Path A: Regex detection (sync wrapped in async for parallelization)
    (async () => {
      try {
        const results = runPathA(textRegex);
        return results;
      } catch (pathAError) {
        // Silent error handling — no logging
        return [];
      }
    })(),
    
    // Path B: Gazetteer scan (async)
    (async () => {
      try {
        if (typeof TrustGazetteer === 'undefined' || !TrustGazetteer || typeof TrustGazetteer.scan !== 'function') {
          return [];
        }
        return await TrustGazetteer.scan(textGazetteer);
      } catch (pathBError) {
        // Silent error handling — no logging
        return [];
      }
    })()
  ]);

  // ── CONDITIONALLY RUN PATH C based on text length and A+B results ───────────
  let pathCFindings = [];
  if (shouldRunPathC(rawText, pathAFindings, pathBFindings)) {
    try {
      if (typeof TrustLinguisticDetector !== 'undefined' && 
          TrustLinguisticDetector && 
          typeof TrustLinguisticDetector.scan === 'function') {
        pathCFindings = await TrustLinguisticDetector.scan(textNLP);
      }
    } catch (pathCError) {
      // Silent error handling — no logging
      pathCFindings = [];
    }
=======
  try {
    const r = await TrustScanner.scan(rawText);
    self.postMessage({
      type:             "RESULT",
      scanId,
      findings:         r.findings,
      riskLevel:        r.riskLevel,
      score:            r.score,
      governance:       r.governance,
      normalisedText:   r.normalisedText,
      wasCapsConverted: r.wasCapsConverted,
      elapsedMs:        r.elapsedMs,
    });
  } catch (err) {
    self.postMessage({ type: "ERROR", scanId, message: String((err && err.message) || err) });
>>>>>>> c27645219dc2cb3a1217598842940224945a1e9f
  }
};
