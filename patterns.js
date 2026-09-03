// patterns.js
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
//
// Risk mapping (NIST SP 800-122 inspired):
//   high   → direct financial or authentication identifiers (red)
//   moderate → contact / locating information (orange)
//   low    → metadata / indirect identifiers (yellow)

/* global TRUSTPROMPT_PATTERNS */

// ── TASK-4.5: Shannon entropy utility ────────────────────────────────────────
// Returns the Shannon entropy of str in bits per character.
// H = -Σ p(x) * log2(p(x))
// A real API key / JWT has H ≥ ~3.5 bits/char.
// An all-same-character string has H = 0.
/**
 * Calculate Shannon entropy of a string.
 * @param {string} str - input string to measure
 * @returns {number} entropy in bits per character (0 for empty / uniform strings)
 */
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

// ── TASK-4.4: Known-placeholder suppression constants ─────────────────────────
// PLACEHOLDER_SUPPRESSIONS maps patternId → Set of known-safe dummy values.
// Values are stored lowercased with spaces and dashes stripped for comparison.
// These are universally recognized test/documentation values that carry no
// real risk (Stripe test cards, AWS docs example key, jwt.io default token).
const PLACEHOLDER_SUPPRESSIONS = Object.freeze({
  credit_card: new Set([
    "4111111111111111",        // Stripe Visa test (SRC-SYN-001)
    "5500000000000004",        // Stripe Mastercard test
    "378282246310005",         // Stripe Amex test
    "6011111111111117",        // Stripe Discover test
    "3566002020360505",        // Stripe JCB test
    "4242424242424242",        // Stripe second Visa test
    "5105105105105100",        // Stripe Mastercard test 2
  ]),
  api_key: new Set([
    "akiaiosfodnn7example",    // AWS documentation example (TASK-4.4.6)
    "wjalkfsmuoi",             // AWS secret key example suffix (docs)
  ]),
  jwt: new Set([
    // jwt.io default payload: {"sub":"1234567890","name":"John Doe","iat":1516239022}
    // Store the base64url-encoded payload segment as the lookup key
    "eyjzdwiioiixmjm0nty3odkwiiwibmftzsi6ikpvag4grgvliiwiaweioiixnte2mjm5mdiyyn0",
  ]),
});

// PLACEHOLDER_PATTERNS: structural regexes that identify placeholder-shaped values
// regardless of exact content. Applied to the extracted value portion of a match.
const PLACEHOLDER_PATTERNS = Object.freeze([
  /^<[A-Z_][A-Z0-9_]*>$/,          // <YOUR_API_KEY>, <TOKEN>, <SECRET>
  /^YOUR_[A-Z][A-Z0-9_]*$/,        // YOUR_API_KEY, YOUR_SECRET_TOKEN
  /^x+$/i,                          // xxx...xxx (all-x strings)
  /^0+$/,                           // 000...000 (all-zero strings)
  /^1+$/,                           // 111...111 (all-one strings, e.g. 4111...)
  /^(placeholder|example|test|demo|fake|dummy|sample|insert.?here|changeme)$/i,
]);

/**
 * TASK-4.4: Check whether a raw match value is a known placeholder.
 * Strips formatting (spaces, dashes) and lowercases before lookup.
 * @param {string} patternId - the pattern's id field
 * @param {string} rawValue  - the matched value string
 * @returns {boolean} true if this value should be suppressed
 */
function isKnownPlaceholder(patternId, rawValue) {
  const normalized = rawValue.replace(/[\s\-]/g, "").toLowerCase();
  const suppressed = PLACEHOLDER_SUPPRESSIONS[patternId];
  if (suppressed && suppressed.has(normalized)) return true;
  // Also check structural placeholder patterns against the normalized value
  return PLACEHOLDER_PATTERNS.some(re => re.test(rawValue.trim()));
}

// ── TASK-4.6: Vendor-prefix structural validator ──────────────────────────────
// Used by the web worker path where validator.js is unavailable.
// Returns true if the raw match starts with a known vendor-specific API key prefix,
// which is structurally distinctive enough to confirm the match without Luhn/RFC5322.
const VENDOR_PREFIXES = Object.freeze([
  /^sk-[A-Za-z0-9\-_]{20,}/,             // OpenAI (sk-..., sk-proj-...)
  /^ghp_[A-Za-z0-9]{36}/,                // GitHub Personal Access Token
  /^gho_[A-Za-z0-9]{36}/,                // GitHub OAuth token
  /^github_pat_[A-Za-z0-9_]{82}/,        // GitHub fine-grained PAT
  /^xoxb-\d+-[A-Za-z0-9\-]+/,            // Slack Bot token
  /^xoxp-\d+-[A-Za-z0-9\-]+/,            // Slack User token
  /^AKIA[A-Z0-9]{16}/,                   // AWS Access Key ID
  /^AIza[A-Za-z0-9\-_]{35}/,             // Google API key
  /^ya29\.[A-Za-z0-9\-_]+/,              // Google OAuth access token
]);

/**
 * TASK-4.6: Structural vendor-prefix check for use in the web worker path.
 * @param {string} raw - the full raw match from the regex
 * @returns {boolean} true if the value matches a known vendor key prefix
 */
function structuralValidateApiKey(raw) {
  // Extract the value portion (after any label=... prefix)
  const valueMatch = raw.match(/[:=]\s*["']?(.+?)["']?\s*$/) || raw.match(/^(.+)$/);
  const value = valueMatch ? valueMatch[1].trim() : raw.trim();
  return VENDOR_PREFIXES.some(re => re.test(value));
}

const TRUSTPROMPT_PATTERNS = [

  // ── HIGH RISK ──────────────────────────────────────────────────────────────

  {
    id: "credit_card",
    label: "Credit / Debit Card Number",
    reason: "Card numbers give direct access to your financial accounts. Sharing one with an AI model means it is transmitted to and stored by a third-party server.",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    risk: "high",
    validate: "isCreditCard",
    sanitize: (m) => m.replace(/\d(?=\d{4})/g, "*")
  },

  // TASK-4.2: Hardened api_key pattern.
  //
  // Changes from original:
  //   (1) Tightened keyword list — dropped bare `secret` and bare `token` as
  //       standalone keywords; these caused false positives on natural language
  //       (e.g. "my secret recipe", "access token: pending_approval_by_admin").
  //       Retained: api_key, api-key, access_key, access-key, client_secret,
  //       client-secret, auth_token, auth-token, bearer.
  //
  //   (2) Added vendor-prefix OR branch — detects well-known API key shapes
  //       without requiring a label prefix: OpenAI (sk-), GitHub (ghp_, gho_,
  //       github_pat_), Slack (xoxb-, xoxp-), AWS (AKIA), Google (AIza, ya29.).
  //       These are structurally distinctive enough to confirm without a label.
  //
  //   (3) minEntropy: 3.5 — rejects low-entropy dummy values (all-same-char
  //       strings, sequential patterns) that pass the regex shape. See TASK-4.5.
  //
  //   (4) structuralValidate — allows the web worker path to set validated:true
  //       for vendor-prefix matches, enabling governance Rule 1 escalation to
  //       HIGH. See TASK-4.6.
  {
    id: "api_key",
    label: "API Key / Secret Token",
    reason: "API keys and secret tokens authenticate your identity with a service — they are the equivalent of a password for software systems. Exposing one allows anyone who sees it to make requests on your behalf, potentially incurring charges, accessing private data, or compromising connected systems. This includes vendor-specific formats: OpenAI (sk-...), GitHub (ghp_...), Slack (xoxb-...), AWS (AKIA...), and Google (AIza...). Keys included in prompts may be logged by the AI provider.",
    // Labelled-key branch: tightened keyword list (no bare `secret` or `token`)
    // Vendor-prefix branch: structurally distinctive prefixes without requiring a label
    regex: /(?:(?:api[_\-\s]?key|access[_\-\s]?key|client[_\-\s]?secret|auth[_\-\s]?token|bearer)\s*[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{20,})["']?|(?:sk-[A-Za-z0-9\-_]{20,}|ghp_[A-Za-z0-9]{36,}|gho_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82,}|xoxb-\d{9,}-[A-Za-z0-9\-]{20,}|xoxp-\d{9,}-[A-Za-z0-9\-]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9\-_]{35}|ya29\.[A-Za-z0-9\-_]{50,}))/g,
    risk: "high",
    validate: null,  // no single validator covers all key formats; entropy + structural checks used instead
    minEntropy: 3.5, // TASK-4.5: reject low-entropy dummy values
    structuralValidate: structuralValidateApiKey, // TASK-4.6: worker-path vendor-prefix check
    sanitize: (m) => {
      // Preserve label if present, redact the value
      const colonIdx = m.search(/[:=]/);
      if (colonIdx !== -1) {
        return m.slice(0, colonIdx + 1) + " [REDACTED-KEY]";
      }
      return "[REDACTED-KEY]";
    }
  },

  // TASK-4.3: Hardened JWT pattern.
  //
  // Changes from original:
  //   (1) Added segment-length guards in the regex: header ≥ 10 chars,
  //       payload ≥ 10 chars, signature ≥ 20 chars. This rejects truncated
  //       or malformed strings that happen to contain dots.
  //
  //   (2) minEntropy: 3.5 — same entropy guard as api_key. A real JWT has
  //       high entropy across all three segments.
  //
  //   (3) Sanitize decision (TASK-4.3.4): full [REDACTED-JWT] is the correct
  //       behaviour. A partial token is still a security risk (header reveals
  //       algorithm; payload may contain claims). Full redaction is intentional.
  {
    id: "jwt",
    label: "JSON Web Token (JWT)",
    reason: "A JSON Web Token is a session credential that proves you are logged in to a service. Sharing a live JWT gives anyone who obtains it the ability to impersonate your session until it expires. JWTs are often short-lived but can grant access to sensitive APIs, dashboards, or user data.",
    // Segment-length guards: header ≥10, payload ≥10, signature ≥20 chars
    regex: /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\.[A-Za-z0-9\-_.+\/=]{20,}/g,
    risk: "high",
    validate: "isJWT",
    minEntropy: 3.5, // TASK-4.5
    sanitize: (_m) => "[REDACTED-JWT]"
    // Full redaction is intentional: partial tokens still reveal algorithm (header)
    // and payload claims. [REDACTED-JWT] is the safe version. (TASK-4.3.4)
  },

  // {
  //   id: "password_inline",
  //   label: "Inline Password",
  //   reason: "Passwords are the primary authentication credential for most accounts. Including one in a prompt sends it as plain text to the AI provider's servers where it may be logged, used for model training, or exposed in a data breach. No legitimate debugging scenario requires sharing a real password.",
  //   regex: /(?:password|passwd|pwd|pass)\s*[:=]\s*["']?([^\s"',;]{6,})["']?/gi,
  //   risk: "high",
  //   validate: null,
  //   sanitize: (m) => m.replace(/([^\s"',;]{6,})$/, "[REDACTED-PASSWORD]")
  // },

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
    validate: "isMobilePhone_PH",
    sanitize: (m) => m.slice(0, -6) + "xxxxxx"
  },

  {
    id: "phone_intl",
    label: "Phone Number (International)",
    reason: "International phone numbers are contact identifiers that can be used for unsolicited calls, SMS phishing (smishing), and identity verification bypass. Including phone numbers in AI prompts sends them to third-party servers, where they may be retained and potentially linked to other data.",
    regex: /\+?1?\s?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g,
    risk: "moderate",
    validate: "isMobilePhone",
    sanitize: (m) => m.slice(0, -4) + "xxxx"
  },

  {
    id: "ipv4",
    label: "IPv4 Address",
    reason: "Internal or private IP addresses reveal your network topology, which can assist attackers in mapping your infrastructure. Public IPs can be used to geolocate you or target your connection. Sharing server IPs in prompts may expose backend systems to reconnaissance.",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
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
    id: "id_label",
    label: "Government-Issued ID Field",
    reason: "Government-issued identifiers classified are classified as Sensitive Personal Information under RA 10173. Sharing these — even just the field label with a value — with an AI assistant transmits them to a third-party server where they may be logged or retained. These identifiers can be used for identity theft, benefit fraud, or account takeover.",
    regex: /\b(?:sss|gsis|philhealth|pagibig|pag[- ]?ibig|tin|passport(?:\s?no(?:\.|\b))?|driver.?s?\s?licen[cs]e(?:\s?no(?:\.|\b))?|license\s?no|plate\s?no|student\s?id|employee\s?id|id\s?number|mother.?s?\s?maiden(?:\s?name)?|umid|postal\s?id|voter.?s?\s?id|national\s?id|philsys)\s*:[ \t]*.+/gi,
    risk: "high",
    validate: null,
    sanitize: (m) => {
      const colonIdx = m.indexOf(":");
      return m.slice(0, colonIdx + 1) + " [REDACTED]";
    }
  },

  {
    id: "personal_label",
    label: "Labelled Personal Field",
    reason: "Explicitly labelled fields are indicators of structured personal data. Under the Philippine Data Privacy Act (RA 10173), these are Personal Information (PI) that may contribute to individual identification when combined with other data.",
    regex: /\b(?:name|pangalan|full\s?name|buong\s?pangalan|age|edad|birthday|birthdate|petsa\s?ng\s?kapanganakan|civil\s?status|relationship\s?status|nationality|nasyonalidad|gender|kasarian|sex|religion|relihiyon|employer|trabaho|company|occupation|hanapbuhay|emergency\s?contact)\s*:[ \t]*.+/gi,
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
  }

];

// Freeze to prevent accidental mutation at runtime.
Object.freeze(TRUSTPROMPT_PATTERNS);
