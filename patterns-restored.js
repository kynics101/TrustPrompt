// patterns.js - RESTORED WITH NEW PERSONAL ATTRIBUTE PATTERNS
// All detection patterns for TrustPrompt.
// Each entry defines:
//   id                - machine-readable key
//   label             - human-readable display name
//   regex             - detection regex (non-sticky, global flag applied at runtime)
//   risk              - "high" | "moderate" | "low"  (maps to NIST SP 800-122 sensitivity)
//   validate          - optional validator.js method name to confirm the raw match
//   sanitize          - function(match) => redacted string shown in safe version
//   reason            - plain-language explanation of why this is flagged as a risk
//   minEntropy        - optional minimum Shannon entropy (bits/char) required for the
//                       value portion of the match; matches below this threshold are
//                       discarded as low-entropy dummy values (TASK-4.5)
//   structuralValidate - optional function(raw) => boolean; called in the web worker
//                       path to set validated:true for vendor-prefixed keys where
//                       mathematical validation is unavailable (TASK-4.6)

/* global TRUSTPROMPT_PATTERNS */

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS (extracted from original patterns.js)
// ─────────────────────────────────────────────────────────────────────────────

function extractPHIDValue(raw) {
  if (!raw || typeof raw !== "string") return "";
  let value = raw.replace(/^["']|["']$/g, "").trim();
  const labelPatterns = [
    /^driver.{0,2}s.{0,2}\s+licen[cs]e\s*\.?\s*[:=\s]*/i,
    /^passport\s+no\s*\.?\s*[:=\s]*/i,
    /^id\s+no\s*\.?\s*[:=\s]*/i,
    /^license\s+no\s*\.?\s*[:=\s]*/i,
    /^student\s+id\s*\.?\s*[:=\s]*/i,
    /^employee\s+id\s*\.?\s*[:=\s]*/i,
    /^mother.{0,2}s.{0,2}\s+maiden\s*\.?\s*[:=\s]*/i,
    /^sss\s+no\s*\.?\s*[:=\s]*/i,
    /^gsis\s+no\s*\.?\s*[:=\s]*/i,
    /^pag.?ibig\s*\.?\s*[:=\s]*/i,
    /^barangay\s*\.?\s*[:=\s]*/i,
    /^comelec\s*\.?\s*[:=\s]*/i,
    /^philhealth\s*\.?\s*[:=\s]*/i,
    /^philid\s*\.?\s*[:=\s]*/i,
    /^police\s*\.?\s*[:=\s]*/i,
    /^umid\s*\.?\s*[:=\s]*/i,
    /^prc\s*\.?\s*[:=\s]*/i,
    /^tin\s*\.?\s*[:=\s]*/i,
    /^number\s*\.?\s*[:=\s]*/i,
    /^nbi\s*\.?\s*[:=\s]*/i,
    /^id\s*\.?\s*[:=\s]*/i,
    /^no\s*\.?\s*[:=\s]*/i,
  ];
  for (const pattern of labelPatterns) {
    if (pattern.test(value)) {
      value = value.replace(pattern, "");
      break;
    }
  }
  return value.trim();
}

function isPhIDPlaceholder(patternId, value) {
  if (!value || typeof value !== "string") return true;
  const normalized = value.toLowerCase().trim();
  if (/^<[^>]*>$/.test(normalized)) return true;
  if (/^(placeholder|example|test|demo|fake|dummy|sample|insert|changeme|xxx|your_\w+|sample_\w+)$/i.test(normalized)) return true;
  if (/^([0-9x\-\s])\1*$|^(0+[\-\s]*)*0+$|^(1+[\-\s]*)*1+$|^(x+[\-\s]*)*x+$/i.test(normalized)) return true;
  return false;
}

function normalizePHID(value, stripChars) {
  if (!value || typeof value !== "string") return "";
  let normalized = value;
  if (stripChars && typeof stripChars === "string") {
    const chars = stripChars.split("").map(ch => ch === "-" ? "\\-" : ch).join("");
    const regex = new RegExp(`^[${chars}]+`, "i");
    normalized = normalized.replace(regex, "");
  }
  normalized = normalized.replace(/[\-\s\.]/g, "");
  return normalized;
}

function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const len = str.length;
  let H = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    H -= p * Math.log2(p);
  }
  return H;
}

// Philippine ID structural validators
function structuralValidatePHID_Passport(raw) {
  if (!raw || typeof raw !== "string") return false;
  let normalized = normalizePHID(raw, "P-");
  if (normalized.length > 0 && normalized[0].toUpperCase() === "H") {
    normalized = normalized.slice(1);
  }
  if (normalized.length !== 7 && normalized.length !== 8) return false;
  if (!/^\d{7,8}$/.test(normalized)) return false;
  return true;
}

function structuralValidatePHID_UMID(raw) {
  if (!raw || typeof raw !== "string") return false;
  const normalized = normalizePHID(raw);
  if (!/^\d{12}$/.test(normalized)) return false;
  return true;
}

function structuralValidatePHID_GSIS(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{10}$/.test(raw)) return false;
  const agencyCode = (raw.charCodeAt(0) - 48) * 1000 +
                     (raw.charCodeAt(1) - 48) * 100 +
                     (raw.charCodeAt(2) - 48) * 10 +
                     (raw.charCodeAt(3) - 48);
  if (agencyCode < 1 || agencyCode > 9999) return false;
  let digitSum = 0;
  for (let i = 0; i < 9; i++) {
    digitSum += raw.charCodeAt(i) - 48;
  }
  const remainder = digitSum % 10;
  const expectedCheckDigit = (10 - remainder) % 10;
  const checkDigitProvided = raw.charCodeAt(9) - 48;
  return checkDigitProvided === expectedCheckDigit;
}

function structuralValidatePHID_SSS(raw) {
  if (!raw || typeof raw !== "string") return false;
  const normalized = normalizePHID(raw);
  if (!/^\d{10}$/.test(normalized)) return false;
  const branchFirst = normalized.charCodeAt(0) - 48;
  const branchSecond = normalized.charCodeAt(1) - 48;
  const branchCode = branchFirst * 10 + branchSecond;
  if (branchCode < 1 || branchCode > 59) return false;
  return true;
}

function structuralValidatePHID_TIN(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{9}$/.test(raw)) return false;
  const areaCode = (raw.charCodeAt(0) - 48) * 100 +
                   (raw.charCodeAt(1) - 48) * 10 +
                   (raw.charCodeAt(2) - 48);
  if (areaCode < 100 || areaCode > 900) return false;
  const weights = [6, 5, 4, 3, 2, 7, 6, 5];
  let checksum = 0;
  for (let i = 0; i < 8; i++) {
    checksum += (raw.charCodeAt(i) - 48) * weights[i];
  }
  const remainder = checksum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;
  const finalCheckDigit = expectedCheckDigit === 10 ? 0 : expectedCheckDigit;
  const checkDigitProvided = raw.charCodeAt(8) - 48;
  return checkDigitProvided === finalCheckDigit;
}

function structuralValidatePHID_PRC(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{7}$/.test(raw)) return false;
  return true;
}

function structuralValidatePHID_DriversLicense(raw) {
  if (!raw || typeof raw !== "string") return false;
  const normalized = normalizePHID(raw);
  if (!/^[0-9A-Za-z]{11}$/.test(normalized)) return false;
  if (!/^\d{2}/.test(normalized)) return false;
  if (!/^[0-9]{2}[0-9A-Za-z]{2}/.test(normalized)) return false;
  return true;
}

function structuralValidateApiKey(raw) {
  if (!raw || typeof raw !== "string") return false;
  return /^[A-Za-z0-9\-_\.+\/=:@!]{15,}$/.test(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-COMPILED REGEXES
// ─────────────────────────────────────────────────────────────────────────────

const REGEX_12_DIGITS = /^\d{12}$/;

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN DEFINITIONS ARRAY
// ─────────────────────────────────────────────────────────────────────────────

const TRUSTPROMPT_PATTERNS = [

  // ── HIGH RISK ──────────────────────────────────────────────────────────────

  {
    id: "credit_card",
    label: "Credit / Debit Card Number",
    reason: "Card numbers give direct access to your financial accounts. Sharing one with an AI model means it is transmitted to and stored by a third-party server.",
    regex: /\b(?:\d[\s\-]?){13,19}\b/g,
    risk: "high",
    validate: "isCreditCard",
    sanitize: (m) => m.replace(/\d(?=\d{4})/g, "*")
  },

  {
    id: "api_key",
    label: "API Key / Secret Token",
    reason: "API keys and secret tokens authenticate your identity with a service — they are the equivalent of a password for software systems. Exposing one allows anyone who sees it to make requests on your behalf, potentially incurring charges, accessing private data, or compromising connected systems. This includes vendor-specific formats: OpenAI (sk-..., sk-proj-...), Anthropic (sk-ant-...), GitHub (ghp_..., gho_..., github_pat_...), Slack (xoxb-...), AWS (AKIA..., ASIA...), Google (AIza..., ya29...), Stripe (sk_live_..., sk_test_...), Twilio, SendGrid, Hugging Face, Azure, and private keys. Keys included in prompts may be logged by the AI provider.",
    regex: /(?:(?:api[_\-\s]?key|access[_\-\s]?key|client[_\-\s]?secret|auth[_\-\s]?token|bearer|password|passwd|secret[_\-]?access[_\-]?key|secret|connection)(?:\s*[:=]\s*|[\s]+)["']?([A-Za-z0-9\-_\.+\/=:@!]{15,})["']?|(?:postgres|mongodb)[+a-z]*:\/\/\S+|[a-z]+:\/\/[^:]+:[^@ \n\r\t]+@\S+|sk-(?:proj-)?[A-Za-z0-9_\-]{20,}|sk-ant-[A-Za-z0-9_\-]{20,}|sk_live_[A-Za-z0-9]{20,}|sk_test_[A-Za-z0-9]{20,}|pk_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|rk_test_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|ghu_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|xoxb-\d+[-A-Za-z0-9\-]+|xoxp-\d+[-A-Za-z0-9\-]+|xoxz-\d+[-A-Za-z0-9\-]+|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|AIza[A-Za-z0-9\-_]{35}|ya29\.[A-Za-z0-9\-_]{30,}|(?:AC|SK)[A-Za-z0-9a-f]{32}|SG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{30,}|hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{20,}|AccountKey=[A-Za-z0-9+\/=]{80,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{20,})/g,
    risk: "high",
    validate: null,
    minEntropy: 3.5,
    structuralValidate: structuralValidateApiKey,
    sanitize: (m) => {
      const colonIdx = m.search(/[:=]/);
      if (colonIdx !== -1) {
        return m.slice(0, colonIdx + 1) + " [REDACTED-KEY]";
      }
      return "[REDACTED-KEY]";
    }
  },

  {
    id: "jwt",
    label: "JSON Web Token (JWT)",
    reason: "A JSON Web Token is a session credential that proves you are logged in to a service. Sharing a live JWT gives anyone who obtains it the ability to impersonate your session until it expires. JWTs are often short-lived but can grant access to sensitive APIs, dashboards, or user data.",
    regex: /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\.[A-Za-z0-9\-_.+\/=]{20,}/g,
    risk: "high",
    validate: "isJWT",
    minEntropy: 3.5,
    sanitize: (_m) => "[REDACTED-JWT]"
  },

  {
    id: "id_label",
    label: "Government-Issued ID Field",
    reason: "Government-issued identifiers are classified as Sensitive Personal Information under RA 10173. Sharing these — even just the field label with a value — with an AI assistant transmits them to a third-party server where they may be logged or retained. These identifiers can be used for identity theft, benefit fraud, or account takeover.",
    regex: /\b(?:sss|gsis|philhealth|pagibig|pag[- ]?ibig|tin|passport(?:\s?no(?:\.|\b))?|driver.?s?\s?licen[cs]e(?:\s?no(?:\.|\b))?|license\s?no|plate\s?no|student\s?id|employee\s?id|id\s?number|mother.?s?\s?maiden(?:\s?name)?|umid|postal\s?id|voter.?s?\s?id|national\s?id|philsys)\s*:[ \t]*.+/gi,
    risk: "high",
    validate: null,
    sanitize: (m) => {
      const colonIdx = m.indexOf(":");
      return m.slice(0, colonIdx + 1) + " [REDACTED]";
    }
  },

  // ── MODERATE RISK ────────────────────────────────────────────────────────────

  {
    id: "email",
    label: "Email Address",
    reason: "Email addresses are personally identifiable information (PII) under the Philippine Data Privacy Act (RA 10173). Sharing someone else's email without consent may violate data privacy law. Even your own email can be used for targeted phishing, spam, or account enumeration attacks if exposed.",
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    risk: "moderate",
    validate: "isEmail",
    sanitize: (m) => {
      const [local, domain] = m.split("@");
      return local[0] + "***@" + domain;
    }
  },

  {
    id: "ph_mobile",
    label: "Philippine Mobile Number",
    reason: "Philippine mobile numbers (09XX or +639XX format) are directly tied to a person's identity through SIM registration (RA 11934). Exposing a mobile number enables unsolicited contact, SIM-swap fraud, and social engineering attacks.",
    regex: /(?<![a-zA-Z0-9])(?:\+63|0)[\s\-\uE002\uE003]?9[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d[\s\-\uE002\uE003]?\d(?![a-zA-Z0-9])/gi,
    risk: "moderate",
    validate: "isMobilePhone_PH",
    sanitize: (m) => m.slice(0, -6) + "xxxxxx"
  },

  {
    id: "ipv4",
    label: "IPv4 Address",
    reason: "Internal or private IP addresses reveal your network topology, which can assist attackers in mapping your infrastructure. Public IPs can be used to geolocate you or target your connection. Sharing server IPs in prompts may expose backend systems to reconnaissance.",
    regex: /\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    risk: "moderate",
    validate: "isIP",
    sanitize: (m) => {
      const parts = m.split(".");
      parts[2] = "xxx";
      parts[3] = "xxx";
      return parts.join(".");
    }
  },

  {
    id: "ipv6",
    label: "IPv6 Address",
    reason: "IPv6 addresses can uniquely identify a specific device on the internet and may be directly tied to your hardware. Exposing an IPv6 address reveals more precise device and network information than an IPv4 address, and can be used for tracking or targeted attacks.",
    regex: /(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}|(?:[A-Fa-f0-9]{1,4}:){1,7}:|::(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}/g,
    risk: "moderate",
    validate: "isIPv6",
    sanitize: (_m) => "[REDACTED-IPv6]"
  },

  {
    id: "mac_address",
    label: "MAC Address",
    reason: "A MAC address is a hardware identifier burned into your network interface. It can be used to uniquely fingerprint and track a specific device across networks. MAC addresses are treated as device identifiers and their exposure can assist in device-level tracking or impersonation.",
    regex: /\b([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
    risk: "moderate",
    validate: "isMACAddress",
    sanitize: (m) => {
      const sep = m.includes(":") ? ":" : "-";
      const parts = m.split(sep);
      return parts[0] + sep + parts[1] + sep + "xx" + sep + "xx" + sep + "xx" + sep + "xx";
    }
  },

  // ── LOW RISK ───────────────────────────────────────────────────────────────

  {
    id: "source_code",
    label: "Source Code Block",
    reason: "Code blocks may contain hardcoded credentials, internal logic, proprietary algorithms, or configuration details that should not be shared externally. Even seemingly harmless code can reveal system architecture or security assumptions.",
    regex: /```[\s\S]*?```|`[^`\n]{10,}`/g,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[CODE BLOCK REMOVED]"
  },

  {
    id: "personal_label",
    label: "Labelled Personal Field",
    reason: "Explicitly labelled fields are indicators of structured personal data. Under the Philippine Data Privacy Act (RA 10173), these are Personal Information (PI) that may contribute to individual identification when combined with other data.",
    regex: /\b(?:name|pangalan|full\s?name|buong\s?pangalan|age|edad|birthday|birthdate|petsa\s?ng\s?kapanganakan|civil\s?status|relationship\s?status|marital\s?status|kalagayan\s?ng\s?pakikipag|nationality|nasyonalidad|gender|kasarian|sex|blood\s?type|uri\s?ng\s?dugo|eye\s?colou?r?|kulay\s?ng\s?matá|religion|relihiyon|employer|trabaho|company|occupation|hanapbuhay|emergency\s?contact)\s*:[ \t]*.+/gi,
    risk: "low",
    validate: null,
    sanitize: (m) => {
      const colonIdx = m.indexOf(":");
      return m.slice(0, colonIdx + 1) + " [REDACTED]";
    }
  },

  {
    id: "ph_address",
    label: "Philippine Physical Address",
    reason: "Physical addresses are sensitive location data under the Data Privacy Act. A Philippine address (barangay, street, subdivision, etc.) can precisely identify where a person lives or works. Combined with a name or contact number, it enables stalking, physical harassment, or targeted fraud.",
    regex: /\b(?:barangay|brgy\.?|sitio|purok|street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|subdivision|subd\.?|village|vill\.?)\b[^.!?]{0,80}/gi,
    risk: "low",
    validate: "isPHAddress",
    sanitize: (_m) => "[PHILIPPINE ADDRESS REMOVED]"
  },

  // ── PATH C: LINGUISTIC NLP-BASED PATTERNS ──────────────────────────────────

  {
    id: "nlp_person_name",
    label: "Person Name (NLP)",
    reason: "Person names are direct personal identifiers under RA 10173. While a name alone may not uniquely identify an individual, it is classified as Personal Information and is sensitive contextual data. The system detects names using Named Entity Recognition (NER) on normalized text to capture natural language mentions (e.g., 'My name is Alice', 'I am John') that regex and gazetteers may miss.",
    regex: null,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[NAME REDACTED]"
  },

  {
    id: "nlp_job_title",
    label: "Job Title (NLP)",
    reason: "Job titles and professional roles are contextual personal information under RA 10173. While not uniquely identifying on their own, they represent sensitive occupational data that, combined with name or organization, can infer identity. The system detects job titles using POS tagging and named entity recognition on normalized text to identify occupational mentions in natural language (e.g., 'I am a Senior Engineer', 'My role is Project Manager').",
    regex: null,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[JOB TITLE REDACTED]"
  },

  {
    id: "nlp_organization",
    label: "Organization (NLP)",
    reason: "Organization and company names are contextual personal information under RA 10173. They represent workplace affiliations that, combined with a person's name or job title, can infer identity and enable social engineering or targeted attacks. The system detects organizations using Named Entity Recognition (NER) on normalized text to identify company and institutional mentions (e.g., 'I work at Google', 'I'm employed by Acme Corp').",
    regex: null,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[ORGANIZATION REDACTED]"
  },

  // ── NATURAL LANGUAGE PERSONAL ATTRIBUTES (NEW) ──────────────────────────────
  // These patterns detect personal attributes mentioned in natural language
  // (without requiring a label/colon structure). They catch phrases like:
  //   "I am 17 years old"
  //   "blue eye color"
  //   "blood type o+"
  //   "marital status is single"

  {
    id: "age_mention",
    label: "Age Mention",
    reason: "Age is personal information under RA 10173. When mentioned in natural language (e.g., 'I am 17 years old'), it is a direct personal attribute that can help identify individuals. Combined with other details like birthdate or location, age is sensitive contextual data.",
    regex: /\b(\d{1,3})\s+(?:years?\s+)?(?:old|yo|years?\s+old|age|edad)\b|(?:age[sd]?|aged|I\s+am)\s+(\d{1,3})(?:\s+years?\s+old)?/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[AGE REDACTED]"
  },

  {
    id: "eye_color_mention",
    label: "Eye Color Mention",
    reason: "Eye color is personal information that can contribute to physical identification under RA 10173. Combined with other attributes like age, height, or location, eye color is a biometric descriptor used in identity verification and surveillance.",
    regex: /(?:eye\s*colou?r?|eyes?)\s*(?:is|are|:)?\s*(?:blue|brown|green|black|hazel|gray|grey|amber|dark|light|blue-grey|light brown|dark brown|honey|black brown)\b/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[EYE COLOR REDACTED]"
  },

  {
    id: "blood_type_mention",
    label: "Blood Type Mention",
    reason: "Blood type is personal health information under RA 10173 and is considered sensitive medical data. It can be linked to genetic information, used for medical emergencies, organ donation systems, or population-level health surveillance.",
    regex: /(?:blood\s*type|type)\s*(?:is|:)?\s*([ABO](?:B|O)?[+-]?|AB[+-]?|O[+-]?|A[+-]?|rh\s*[+-]?)\b/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[BLOOD TYPE REDACTED]"
  },

  {
    id: "marital_status_mention",
    label: "Marital Status Mention",
    reason: "Marital/relationship status is personal information under RA 10173. When disclosed, it reveals relationship state and can be used for social engineering, target marketing, or combined with other data to infer identity.",
    regex: /(?:marital\s*status|relationship\s*status|I'?m|am|is|are)\s+(?:single|married|divorced|widowed|separated|in\s+a\s+relationship|engaged|unmarried|not\s+married)\b/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[MARITAL STATUS REDACTED]"
  },

  {
    id: "sex_mention",
    label: "Biological Sex Mention",
    reason: "Biological sex is personal information under RA 10173 and is sensitive demographic data. Combined with other attributes, it can be used for targeted profiling, discrimination, or identity inference.",
    regex: /(?:sex|gender|boy|girl|man|woman)\s*(?:is|:)?\s*(?:male|female|boy|girl|man|woman)\b/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[SEX REDACTED]"
  },

  // ── PHILIPPINE GOVERNMENT IDs (HIGH RISK) ──────────────────────────────────

  {
    id: "ph_id_philid",
    label: "Philippine National ID",
    reason: "PhilID is the government-issued national identification card from the Philippine Statistics Authority (PSA). It contains unique personal identifiers including birthdate and sex, making it a critical identifier under RA 10173 that requires strict protection.",
    regex: /(?<!sk[_-])(?<!rk[_-])(?<!ghp_)(?<!gho_)(?<!ghu_)(?<!xoxb-)(?<!xoxp-)(?<!xoxz-)(?<!AKIA)(?<!ASIA)(?<!AIza)(?<!ya29\.)(?<!hf_)(?<!npm_)(?<!AC)(?<!SK)\b\d{4}-\d{4}-\d{4}-\d{4}\b(?!-[A-Za-z0-9])/g,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 16) {
        return digits.slice(0, 4) + "-****-****-" + digits.slice(-4);
      }
      return "[REDACTED-PHILID]";
    }
  },

  {
    id: "ph_id_umid",
    label: "UMID (Unified Multi-Purpose ID)",
    reason: "UMID is the Unified Multi-Purpose ID issued by SSS and represents a unified government identifier credential under RA 10173. Contains SSS system code and includes check digit validation for authentication.",
    regex: /(?<!sk[_-])(?<!rk[_-])(?<!ghp_)(?<!gho_)(?<!ghu_)(?<!xoxb-)(?<!xoxp-)(?<!xoxz-)(?<!AKIA)(?<!ASIA)(?<!AIza)(?<!ya29\.)(?<!hf_)(?<!npm_)(?<!AC)(?<!SK)\b\d{4}-\d{7}-\d\b(?!-[A-Za-z0-9])/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_UMID,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 12) {
        return digits.slice(0, 4) + "-" + "*".repeat(7) + "-" + digits.slice(-1);
      }
      return "[REDACTED-UMID]";
    }
  },

  {
    id: "ph_id_passport",
    label: "Philippine Passport",
    reason: "Passport issued by the Bureau of Immigration (BI) is an international travel credential and critical identifier under RA 10173 and UNCHR standards. Philippine passports are recognized globally for travel and identity verification purposes.",
    regex: /(?:passport\s+(?:number|no\.?|no|id|#)?:?\s*)?(?:^|[\s])[A-Z]{2}\d{7}(?:\s|$|[^\w])|passport\s+(?:number|no\.?|no|id|#)?:?\s*[A-Z]{2}\d{7}/gim,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_Passport,
    sanitize: (m) => {
      const letters = m.replace(/[0-9\s\-.:]/g, "").toUpperCase();
      const digits = m.replace(/[^0-9]/g, "");
      if (digits.length === 7 && letters.length >= 2) {
        return letters.slice(0, 2) + digits.slice(0, 2) + "*".repeat(3) + digits.slice(-2);
      }
      return "[REDACTED-PASSPORT]";
    }
  },

  {
    id: "ph_id_prc",
    label: "PRC (Professional Regulation Commission)",
    reason: "PRC license number is a professional credential that identifies individuals in regulated professions under RA 10173. Includes physicians, engineers, lawyers, and other licensed professionals whose identity is critical for professional accountability.",
    regex: /(?<!sk[_-])(?<!rk[_-])(?<!ghp_)(?<!gho_)(?<!ghu_)(?<!xoxb-)(?<!xoxp-)(?<!xoxz-)(?<!AKIA)(?<!ASIA)(?<!AIza)(?<!ya29\.)(?<!hf_)(?<!npm_)(?<!AC)(?<!SK)(?<!_)(?<!\d-)(?<!=)(?<!:)\b\d{7}\b(?![-_A-Za-z0-9])/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PRC,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 7) {
        return digits.slice(0, 2) + "*".repeat(3) + digits.slice(-2);
      }
      return "[REDACTED-PRC]";
    }
  },

  {
    id: "ph_id_postal",
    label: "Postal ID",
    reason: "Postal ID is a government-issued identification credential issued by the Philippine Postal Corporation. It serves as a valid ID for various government and private transactions under RA 10173.",
    regex: /\b[A-Z]\d{7}-\d{4}-[A-Z]\b/gi,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const alphanumeric = m.replace(/[^A-Za-z0-9]/g, "");
      if (alphanumeric.length === 14) {
        return alphanumeric.slice(0, 1) + "*".repeat(7) + "-****-" + alphanumeric.slice(-1);
      }
      return "[REDACTED-POSTAL]";
    }
  },

  {
    id: "ph_id_pwd",
    label: "PWD ID (Persons with Disability)",
    reason: "PWD ID is an identification issued to persons with disability under RA 9442. It provides identification and access to disability-related benefits and services.",
    regex: /\b\d{2}-\d{4}-\d{3}-\d{7}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const parts = m.split("-");
      if (parts.length === 4) {
        return "**-" + parts[1].slice(0, 2) + "**-***-" + parts[3].slice(-3);
      }
      return "[REDACTED-PWD]";
    }
  },

  {
    id: "ph_id_senior_citizen",
    label: "Digital National Senior Citizen ID",
    reason: "Senior Citizen ID is an identification issued to Filipino senior citizens (60 years old and above). It provides identification and access to senior citizen benefits and privileges.",
    regex: /(?:(?:senior|citizen|osca|id|number|no\.?|sc|sc\.)\s*[:\-\s]?\s*)(\d{10})|\b(\d{10})\b(?![A-Za-z0-9_\-])/gi,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 10) {
        return digits.slice(0, 3) + "*".repeat(4) + digits.slice(-3);
      }
      return "[REDACTED-SENIOR-CITIZEN]";
    }
  },

  {
    id: "ph_id_gsis",
    label: "GSIS (Government Service Insurance System)",
    reason: "GSIS number identifies government employees and their benefits under RA 10173. Used for government employee payroll and benefit administration, it is a critical identifier for the public sector workforce.",
    regex: /\b\d{4}[_\-\s]?\d{7}[_\-\s]?\d\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_GSIS,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 10) {
        return digits.slice(0, 4) + "-" + "*".repeat(5) + "-" + digits.slice(-1);
      }
      return "[REDACTED-GSIS]";
    }
  },

  {
    id: "ph_id_sss",
    label: "SSS (Social Security System)",
    reason: "SSS number is a social insurance identifier linked to employment and benefits under RA 10173. Required for employee registration and benefit claims, it serves as a key employment identifier in the Philippines.",
    regex: /\d{2}-\d{7}-\d/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_SSS,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 10) {
        return digits.slice(0, 2) + "-" + "*".repeat(7) + "-" + digits.slice(-1);
      }
      return "[REDACTED-SSS]";
    }
  },

  {
    id: "ph_id_philhealth",
    label: "PhilHealth (Health Insurance)",
    reason: "PhilHealth number is a healthcare identifier linked to medical records and insurance coverage under RA 10173. Used for health insurance claims and medical services access, it is critical for healthcare identity and benefit verification.",
    regex: /\d{2}-\d{9}-\d/g,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 12) {
        return digits.slice(0, 2) + "-" + "*".repeat(9) + "-" + digits.slice(-1);
      }
      return "[REDACTED-PHILHEALTH]";
    }
  },

  {
    id: "ph_id_drivers_license",
    label: "Driver's License (LTO)",
    reason: "Driver's License issued by the Land Transportation Office (LTO) is a government-issued identification credential used for vehicle operation and identity verification under RA 10173. It contains personal information and driving privileges data.",
    regex: /[A-Z]\d{2}-\d{2}-\d{6}/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_DriversLicense,
    sanitize: (m) => {
      const alphanumeric = m.replace(/[^A-Za-z0-9]/g, "");
      if (alphanumeric.length >= 10) {
        return alphanumeric.slice(0, 1) + "**-**-" + alphanumeric.slice(-3);
      }
      return "[REDACTED-DRIVERS-LICENSE]";
    }
  },

  {
    id: "ph_id_voters",
    label: "Voter's ID (COMELEC)",
    reason: "Voter's ID issued by the Commission on Elections (COMELEC) is a government-issued identification used for voting and electoral verification under RA 10173. It contains voter registration and personal identification data linked to electoral rolls.",
    regex: /\d{4}-\d{2}-\d{8}-[A-Z]/g,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const parts = m.split("-");
      if (parts.length === 4) {
        return "****-**-" + parts[2].slice(-4) + "-" + parts[3];
      }
      return "[REDACTED-VOTERS-ID]";
    }
  },

  {
    id: "ph_id_tin",
    label: "TIN (Taxpayer Identification Number)",
    reason: "TIN is a unique identifier issued by the Bureau of Internal Revenue (BIR) to all businesses and individuals required to register for tax purposes under RA 10173. It is a critical financial and tax identifier.",
    regex: /\b\d{3}-\d{3}-\d{3}-\d{3}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_TIN,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 9) {
        return digits.slice(0, 3) + "-***-***-" + digits.slice(-3);
      }
      return "[REDACTED-TIN]";
    }
  }

];

// Freeze to prevent accidental mutation at runtime.
Object.freeze(TRUSTPROMPT_PATTERNS);

// ── Export TRUSTPROMPT_PATTERNS to global scope ──────────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.TRUSTPROMPT_PATTERNS = TRUSTPROMPT_PATTERNS;
}
if (typeof window !== 'undefined') {
  window.TRUSTPROMPT_PATTERNS = TRUSTPROMPT_PATTERNS;
}
if (typeof window !== 'undefined') {
  window.shannonEntropy = shannonEntropy;
}
