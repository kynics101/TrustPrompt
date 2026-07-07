// patterns.js
// All detection patterns for TrustPrompt.
// Each entry defines:
//   id        - machine-readable key
//   label     - human-readable display name
//   regex     - detection regex (non-sticky, global flag applied at runtime)
//   risk      - "high" | "medium" | "low"  (maps to NIST SP 800-122 sensitivity)
//   validate  - optional validator.js method name to confirm the raw match
//   sanitize  - function(match) => redacted string shown in safe version
//
// Risk mapping (NIST SP 800-122 inspired):
//   high   → direct financial or authentication identifiers (red)
//   medium → contact / locating information (orange)
//   low    → metadata / indirect identifiers (yellow)

/* global TRUSTPROMPT_PATTERNS */

const TRUSTPROMPT_PATTERNS = [

  // ── HIGH RISK ──────────────────────────────────────────────────────────────

  {
    id: "credit_card",
    label: "Credit / Debit Card Number",
    // 13–19 digit card numbers, optionally separated by spaces or hyphens
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    risk: "high",
    validate: "isCreditCard",
    sanitize: (m) => m.replace(/\d(?=\d{4})/g, "*")
  },

  {
    id: "api_key",
    label: "API Key / Secret Token",
    // Broad catch for common key patterns: 20+ alphanumeric+special chars
    // after keywords, or standalone hex/base64 blobs of suspicious length
    regex: /(?:api[_\-\s]?key|secret|token|access[_\-\s]?key|client[_\-\s]?secret)\s*[:=]\s*["']?([A-Za-z0-9\-_\.+/=]{20,})["']?/gi,
    risk: "high",
    validate: null,
    sanitize: (m) => m.replace(/([A-Za-z0-9\-_\.+/=]{20,})/, "[REDACTED-KEY]")
  },

  {
    id: "jwt",
    label: "JSON Web Token (JWT)",
    // Three base64url segments separated by dots
    regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]+/g,
    risk: "high",
    validate: "isJWT",
    sanitize: (_m) => "[REDACTED-JWT]"
  },

  {
    id: "password_inline",
    label: "Inline Password",
    // password/pwd/pass followed by an assignment and a value
    regex: /(?:password|passwd|pwd|pass)\s*[:=]\s*["']?([^\s"',;]{6,})["']?/gi,
    risk: "high",
    validate: null,
    sanitize: (m) => m.replace(/([^\s"',;]{6,})$/, "[REDACTED-PASSWORD]")
  },

  // ── MEDIUM RISK ────────────────────────────────────────────────────────────

  {
    id: "email",
    label: "Email Address",
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    risk: "medium",
    validate: "isEmail",
    sanitize: (m) => {
      const [local, domain] = m.split("@");
      return local[0] + "***@" + domain;
    }
  },

  {
    id: "ph_mobile",
    label: "Philippine Mobile Number",
    // 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX
    regex: /(?:\+?63|0)9\d{9}/g,
    risk: "medium",
    validate: "isMobilePhone_PH",  // custom handler in validator-wrapper.js
    sanitize: (m) => m.slice(0, -6) + "xxxxxx"
  },

  {
    id: "phone_intl",
    label: "Phone Number (International)",
    // +1 (555) 123-4567  |  +44 20 7946 0958  |  etc.
    regex: /\+?1?\s?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g,
    risk: "medium",
    validate: "isMobilePhone",
    sanitize: (m) => m.slice(0, -4) + "xxxx"
  },

  {
    id: "ipv4",
    label: "IPv4 Address",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    risk: "medium",
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
    regex: /(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}|(?:[A-Fa-f0-9]{1,4}:){1,7}:|::(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}/g,
    risk: "medium",
    validate: "isIPv6",
    sanitize: (_m) => "[REDACTED-IPv6]"
  },

  {
    id: "mac_address",
    label: "MAC Address",
    regex: /\b([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
    risk: "medium",
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
    // fenced markdown code block OR common code keywords suggesting a paste
    regex: /```[\s\S]*?```|`[^`\n]{10,}`/g,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[CODE BLOCK REMOVED]"
  },

  {
    id: "context_label",
    label: "Labelled Personal Field",
    // Explicit labels like "Name: John", "Age: 25", "Address: ..."
    // Covers the most common PII field names in English and Filipino
    regex: /\b(?:name|pangalan|full\s?name|buong\s?pangalan|age|edad|birthday|birthdate|petsa\s?ng\s?kapanganakan|address|tirahan|home\s?address|school\s?address|work\s?address|employer|trabaho|company|occupation|hanapbuhay|religion|relihiyon|civil\s?status|relationship\s?status|nationality|nasyonalidad|gender|kasarian|sex|sss|gsis|philhealth|pagibig|tin|passport|driver.?s?\s?licen[cs]e|license\s?no|plate\s?no|student\s?id|employee\s?id|id\s?number|mother.?s?\s?maiden|emergency\s?contact)\s*:[ \t]*.+/gi,
    risk: "low",
    validate: null,
    sanitize: (m) => {
      // Keep the label, redact the value
      const colonIdx = m.indexOf(":");
      return m.slice(0, colonIdx + 1) + " [REDACTED]";
    }
  },

  {
    id: "ph_address",
    label: "Philippine Physical Address",
    // Detected via ph-address-db.js lookup — regex here is a broad street cue;
    // the DB validator filters false positives.
    regex: /\b(?:barangay|brgy\.?|sitio|purok|street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|subdivision|subd\.?|village|vill\.?)\b[^.!?]{0,80}/gi,
    risk: "low",
    validate: "isPHAddress",  // custom in validator-wrapper.js
    sanitize: (_m) => "[PHILIPPINE ADDRESS REMOVED]"
  }

];

// Freeze to prevent accidental mutation at runtime.
Object.freeze(TRUSTPROMPT_PATTERNS);
