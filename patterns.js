// patterns.js
// All detection patterns for TrustPrompt.
// Each entry defines:
//   id        - machine-readable key
//   label     - human-readable display name
//   regex     - detection regex (non-sticky, global flag applied at runtime)
//   risk      - "high" | "moderate" | "low"  (maps to NIST SP 800-122 sensitivity)
//   validate  - optional validator.js method name to confirm the raw match
//   sanitize  - function(match) => redacted string shown in safe version
//   reason    - plain-language explanation of why this is flagged as a risk
//
// Risk mapping (NIST SP 800-122 inspired):
//   high   → direct financial or authentication identifiers (red)
//   moderate → contact / locating information (orange)
//   low    → metadata / indirect identifiers (yellow)

/* global TRUSTPROMPT_PATTERNS */

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

  {
    id: "api_key",
    label: "API Key / Secret Token",
    reason: "API keys and secret tokens authenticate your identity with a service — they are the equivalent of a password for software systems. Exposing one allows anyone who sees it to make requests on your behalf, potentially incurring charges, accessing private data, or compromising connected systems. Keys included in prompts may be logged by the AI provider.",
    regex: /(?:api[_\-\s]?key|secret|token|access[_\-\s]?key|client[_\-\s]?secret)\s*[:=]\s*["']?([A-Za-z0-9\-_\.+/=]{20,})["']?/gi,
    risk: "high",
    validate: null,
    sanitize: (m) => m.replace(/([A-Za-z0-9\-_\.+/=]{20,})/, "[REDACTED-KEY]")
  },

  {
    id: "jwt",
    label: "JSON Web Token (JWT)",
    reason: "A JSON Web Token is a session credential that proves you are logged in to a service. Sharing a live JWT gives anyone who obtains it the ability to impersonate your session until it expires. JWTs are often short-lived but can grant access to sensitive APIs, dashboards, or user data.",
    regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]+/g,
    risk: "high",
    validate: "isJWT",
    sanitize: (_m) => "[REDACTED-JWT]"
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

  // ── id_label: government-issued ID field labels ───────────────────────────
  // Tier: CRITICAL (score 10) — maps to HIGH-IMPACT per proposed scoring model.
  // These field names explicitly identify government-issued IDs or financial
  // account numbers. Under RA 10173, these are Sensitive Personal Information
  // (SPI) when present with a value. A labelled government ID field is treated
  // the same as a critical credential for scoring purposes.
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

  // ── personal_label: generic personal field labels ─────────────────────────
  // Tier: CONTEXTUAL (score 2) — maps to LOW-IMPACT per proposed scoring model.
  // These are general personal field labels (name, age, etc.).
  // They indicate that structured personal data may be present but do not by
  // themselves constitute SPI. They contribute to identification when combined
  // with direct identifiers (RA 10173 Sec. 3(g) aggregation principle).
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
