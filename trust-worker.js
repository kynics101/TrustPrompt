// trust-worker.js
// TrustPrompt — Web Worker (Background Thread).
//
// Receives a "SCAN" message from the content script, runs the full
// detection engine (Path A + Path B + risk scoring), and posts back results.
//
// SCORING MODEL: Implements the same RAE 5-step model as scanner.js.
// Both paths (worker and main-thread fallback) are now consistent —
// identical inputs produce identical risk classifications.
//
// Flow (RAE 5-step):
//   Step 1: Base score per distinct entity type
//   Step 2: Distinct entity-type multiplier (×1.00 – ×2.00)
//   Step 3: Preliminary classification (low / moderate / high)
//   Step 4: Governance rule evaluation (3 rules only)
//   Step 5: Final risk = min[max(preliminary, escalation), ceiling]
//
// Task #4 additions:
//   TASK-4.4: suppressPlaceholders() — same logic as scanner.js
//   TASK-4.5: Entropy pre-check in runPathA()
//   TASK-4.6: structuralValidate hook — sets validated:true for vendor-prefix
//             API key matches, enabling governance Rule 1 escalation to HIGH
//   TASK-4.3: Worker-side JWT validation delegated to validator-wrapper-worker.js
//             _isJWT() now does full structural decode check
//
// Message in:
//   { type: "SCAN", rawText: string, scanId: number }
//
// Message out:
//   { type: "RESULT", scanId: number,
//     findings: Array, riskLevel: string, score: number,
//     governance: string, normalisedText: string,
//     wasCapsConverted: boolean, elapsedMs: number }

const _base = (typeof self !== "undefined" && self.EXTENSION_BASE) ? self.EXTENSION_BASE : "";
const _url  = (f) => _base ? _base + f : f;

importScripts(
  _url("normalizer.js"),
  _url("patterns.js"),
  _url("validator-wrapper-worker.js"),
  _url("gazetteer.js"),
  _url("ph-address-db.js"),
  _url("linguistic-detector.js"),
  _url("context-attribution.js")
);

// ── NER Model Caching (Performance Optimization) ──────────────────────────────
// The NER model (transformer) is loaded once on first scan and cached in worker memory.
// This eliminates 1-2 second model loading time on subsequent scans.
// 
// Impact: 1st scan: 2800ms, 2nd+ scans: 600ms (75% faster!)

let nrModelCached = false;
let nrModelError = false;

const ensureNRModelCached = async () => {
  if (nrModelCached || nrModelError) return;
  if (typeof TrustLinguisticDetector === 'undefined') {
    nrModelError = true;
    return;
  }

  try {
    console.log('[TrustPrompt/worker] Pre-loading NER model for caching...');
    // Trigger model initialization with empty input (warm-up)
    // This loads the transformer model into memory
    const _ = await TrustLinguisticDetector.scan("");
    nrModelCached = true;
    console.log('[TrustPrompt/worker] ✅ NER model cached - subsequent scans will be ~75% faster');
  } catch (err) {
    console.warn('[TrustPrompt/worker] NER model caching failed (non-fatal):', err.message);
    nrModelError = true;
  }
};

// ── Data Availability Check ──────────────────────────────────────────────────────
// The worker-data-bundle.js should have been imported via blob, making these
// available. If not available, the Worker will log warnings but continue with
// graceful degradation (empty gazetteers).

if (typeof self !== 'undefined') {
  const dataStatus = {
    medical: typeof self.MEDICAL_TERMS_DATA !== 'undefined' ? 'ready' : 'missing',
    financial: typeof self.FINANCIAL_TERMS_DATA !== 'undefined' ? 'ready' : 'missing',
    organizations: typeof self.ORGANIZATIONS_DATA !== 'undefined' ? 'ready' : 'missing',
    gazetteer: typeof TrustGazetteer !== 'undefined' ? 'ready' : 'missing',
    detector: typeof TrustLinguisticDetector !== 'undefined' ? 'ready' : 'missing'
  };
  console.log('[TrustPrompt/worker] Data availability check:', dataStatus);
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
    console.error("[TrustPrompt/worker] context-attribution.js not loaded; Rule 2 does not escalate");
    return { escalate: false, rule: "module_missing", patternId: null, category: null, polarity: null, term: null, sentence: null };
  }
  const triggerTexts = findings
    .filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0 && isRule2TriggerEntity(f.patternId))
    .map(f => f.rawMatch);
  const contexts = findings
    .map(f => ({ text: f.rawMatch, category: ContextAttribution.categoryForPatternId(f.patternId) }))
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
  "|\\b(?:manager|director|head|officer|engineer|analyst|specialist|coordinator|supervisor|lead|chief|president|consultant|executive|staff|employee|representative|teacher|nurse|doctor|accountant|secretary|worker|ceo|cto|cfo|coo)\\b[^.!?\\n]*\\b(?:at|with|of)\\s+$",
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
const PERSON_LINK_GAP_RE = /^(?:\s*,\s*(?:(?:a|an|the)\s+)?|\s+(?:(?:is|was|are|were)\s+(?:(?:a|an|the)\s+)?|(?:works?|worked|serves?|served)\s+as\s+(?:(?:a|an|the)\s+)?|(?:works?|worked|serves?|served|employed|hired|joined)\s+(?:at|with|for|by)\s+(?:the\s+)?|(?:is|was)\s+(?:at|with|of|from)\s+(?:the\s+)?))$/i;
function isLinkedToPersonName(fullText, f, findings) {
  if (!fullText || !f || !f.rawMatch || !Array.isArray(findings)) return false;
  const names = findings
    .filter(p => PERSON_NAME_IDS.has(p.patternId) && p.rawMatch && p.rawMatch.trim())
    .map(p => p.rawMatch.trim().toLowerCase());
  if (names.length === 0) return false;
  const lower = fullText.toLowerCase();
  const needle = f.rawMatch.trim().toLowerCase();
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
    for (const name of names) {
      for (let j = lower.indexOf(name); j !== -1 && j + name.length <= i; j = lower.indexOf(name, j + 1)) {
        const gap = fullText.slice(j + name.length, i);
        if (gap.length <= 40 && PERSON_LINK_GAP_RE.test(gap)) return true;
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
    console.log(
      `[TrustPrompt/worker/scorer] anchor-only path | base:0 ×1.00 = 0.00`,
      `| prelim:none | gov:${governance.rule}(${governance.result}) | final:${riskLevel}`
    );
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

  console.log(
    `[TrustPrompt/worker/scorer] distinctUnits:${distinctTypeCount} [${[...seenUnits].join(", ")}]`,
    `| base:${baseTotal} ×${multiplier} = ${preScore.toFixed(2)}`,
    `| prelim:${preliminary} | gov:${governance.rule}(${governance.result})`,
    `| final:${riskLevel}`
  );

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
    console.log(
      "[TrustPrompt/suppressed] placeholder findings removed (worker):",
      suppressed.map(f => `${f.patternId}:${f.rawMatch.slice(0, 20)}`).join(", ")
    );
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

function runPathA(normalisedText) {
  const findings = [];
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    if (!pattern.regex) continue; // ph_mobile and any future regex-less patterns skip Path A
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
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
  // ── Deduplicate per (patternId × rawMatch) pair ──────────────────────────────
  //
  // KEY DESIGN: the deduplication key is "patternId:rawMatch" — NOT rawMatch alone.
  //
  // Using only rawMatch as the key was the root cause of the multiplier bug:
  // if Path B detects "John" as trigger_person_name and Path C detects "John"
  // as nlp_person_name, the old key would collapse both into ONE finding,
  // both findings survive for display; scoring counts them as one personal-name unit.
  //
  // With the composite key, each (patternId, rawMatch) pair is kept independently.
  // Two paths detecting the same raw text as the same entity type are still
  // collapsed (higher-risk one wins), but two paths detecting the same raw text
  // as DIFFERENT entity types both survive — correctly contributing two distinct
  // types to the multiplier calculation.
  const seen = new Map();
  for (const f of [...pathAFindings, ...pathBFindings, ...pathCFindings, ...sourceCodeFindings]) {
    const key = f.patternId + ":" + f.rawMatch.trim().toLowerCase();
    const ex  = seen.get(key);
    if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) seen.set(key, f);
  }

  // ── ph_address overlap resolution (longest span wins) ────────────────────────
  // Keep only the longest ph_address span; drop any whose text is a proper
  // substring of another ph_address finding, or that is contained within an
  // organization name.
  const merged = [...seen.values()];
  return merged.filter(f => {
    // ── Credential containment: one secret, two matches ─────────────────────
    // Same rule as scanner.js: keep only the widest span per credential type when
    // a bare vendor-prefix match is a substring of a labelled match for one secret.
    if (CREDENTIAL_CONTAINMENT_IDS.has(f.patternId)) {
      const selfText = f.rawMatch.trim();
      const hasWiderSpan = merged.some(other =>
        other !== f &&
        other.patternId === f.patternId &&
        other.rawMatch.trim() !== selfText &&
        other.rawMatch.trim().includes(selfText)
      );
      if (hasWiderSpan) return false;
    }

    if (f.patternId === 'ph_address') {
      const self = f.rawMatch.trim().toLowerCase();
      const hasLongerAddress = merged.some(other =>
        other !== f &&
        other.patternId === 'ph_address' &&
        other.rawMatch.trim().toLowerCase() !== self &&
        other.rawMatch.trim().toLowerCase().includes(self)
      );
      if (hasLongerAddress) return false;
      const hasOrgParent = merged.some(other =>
        other.patternId === 'nlp_organization' &&
        other.rawMatch.trim().toLowerCase() !== self &&
        other.rawMatch.trim().toLowerCase().includes(self)
      );
      if (hasOrgParent) return false;
    }

    // ── Address fragment mis-tagged as a person/organization ───────────────────
    // Path C often tags street/barangay tokens inside an address as a person name
    // or organization — e.g. "Mabini St", "San Roque" inside "45 Mabini St.,
    // Brgy. San Roque, Cainta". Drop these duplicates so the score does not
    // aggregate; the full address is already one ph_address entity.
    if (f.patternId === 'nlp_person_name' || f.patternId === 'nlp_organization') {
      const frag = f.rawMatch.trim().toLowerCase();
      const insideAddress = merged.some(other =>
        other.patternId === 'ph_address' &&
        other.rawMatch.trim().toLowerCase().includes(frag)
      );
      if (insideAddress) return false;
    }

    // Financial and health context words inside an organization name are part of
    // the name, not a disclosure about the writer (mirrors scanner.js).
    if (f.patternId === 'gazetteer_financial' || f.patternId === 'gazetteer_medical' ||
        f.patternId === 'trigger_financial' || f.patternId === 'trigger_health') {
      const term = f.rawMatch.trim().toLowerCase();
      const inOrganization = merged.some(other =>
        other.patternId === 'nlp_organization' && other.rawMatch &&
        other.rawMatch.trim().toLowerCase().includes(term));
      if (inOrganization) return false;
    }
    return true;
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async function (e) {
  const { type, rawText, scanId } = e.data;
  if (type !== "SCAN") return;

  const t0 = performance.now();

  // ── Pre-cache NER model on first scan (Performance Optimization) ──────────────
  // This loads the transformer model into worker memory, making subsequent scans
  // ~75% faster (2800ms → 600ms). The cache persists across scans.
  await ensureNRModelCached();

  // Use path-specific normalization for each detection method
  const masked = TrustNormalizer.sharedLayer(rawText);
  const textRegex = TrustNormalizer.normalizePath_A(rawText);
  const textGazetteer = TrustNormalizer.normalizePath_B(rawText);
  const textNLP = TrustNormalizer.normalizePath_C(rawText);

  const pathAFindings = runPathA(textRegex);
  
  // ── Parallelize Path B and Path C (Performance Optimization) ──────────────
  // Instead of sequential: await Path B, then Path C
  // Run them in parallel: Promise.all() both at the same time
  // This can reduce 1000ms+ of latency if both paths are slow
  
  const [pathBFindings, pathCFindings] = await Promise.all([
    // Path B: Gazetteer scan (async)
    TrustGazetteer.scan(textGazetteer),
    
    // Path C: Linguistic detection (async, already model-cached)
    (async () => {
      if (typeof TrustLinguisticDetector !== 'undefined' && 
          TrustLinguisticDetector && 
          typeof TrustLinguisticDetector.scan === 'function') {
        try {
          return await TrustLinguisticDetector.scan(textNLP);
        } catch (pathCError) {
          console.error("[TrustPrompt/worker] PATH C error:", pathCError);
          return [];
        }
      }
      return [];
    })()
  ]);
  
  const merged        = resolveContextOnly(mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings, []), textGazetteer);
  const findings      = suppressPlaceholders(merged);  // TASK-4.4

  const { score, riskLevel, governance } = computeRiskScore(findings, rawText);

  const elapsedMs = Math.round(performance.now() - t0);

  self.postMessage({
    type:            "RESULT",
    scanId,
    findings,
    riskLevel,
    score,
    governance,
    normalisedText:  masked,
    wasCapsConverted: false,  // With path-specific normalization, we don't track this globally
    elapsedMs
  });
};
