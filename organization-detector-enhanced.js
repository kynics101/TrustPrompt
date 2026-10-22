// organization-detector-enhanced.js
// Enhanced organization detection combining CSV whitelist + fuzzy matching + pattern-based extraction.
//
// Features:
//   1. CSV Whitelist — O(1) exact match against 22k+ known organizations
//   2. Fuzzy Matching — Catch typos via edit distance (e.g., "Appl Inc" → "Apple Inc.")
//   3. Abbreviation Validation — Map "AAPL" to "Apple Inc." to reduce false positives
//   4. Contextual Patterns — Extract orgs from natural language ("works at X", "part of Y")
//   5. Multi-word Org Names — Handle complex names like "University of Santo Tomas"
//   6. Risk Scoring — Low risk for known orgs, moderate for uncertain matches
//
// Integration:
//   - Works alongside linguistic-detector-refactored.js extractOrganizations()
//   - Validates extracted orgs before adding to findings
//   - Escalates confidence score for orgs verified against CSV whitelist
//
// Usage:
//   const detector = TrustOrganizationDetectorEnhanced.getInstance();
//   await detector.initialize();  // Load CSV on first call
//   const result = detector.validateOrganization('apple inc');  // → { isKnown, risk, confidence }
//   const matches = detector.extractContextualOrgs(text);       // → [{ org, context, risk }]

/* global TrustOrganizationDetectorEnhanced, TrustOrganizationLoader */

const TrustOrganizationDetectorEnhanced = (() => {
  let instance = null;

  // ── Configuration ──────────────────────────────────────────────────────
  const CONFIG = {
    enableFuzzyMatch: true,                  // Enable edit-distance matching
    fuzzyDistanceThreshold: 2,               // Max edit distance to consider a match
    enableContextExtraction: true,           // Extract orgs from trigger patterns
    enableAbbreviationValidation: true,      // Validate via known abbreviations
    enableLogging: false,                    // Debug logging
    minOrgLength: 3,                         // Skip very short extractions
    confidenceScores: {
      exactMatch: 1.0,                       // Exact match in CSV
      fuzzyMatch: 0.75,                      // Fuzzy match (typo tolerance)
      contextualPattern: 0.50,               // Extracted from trigger phrase
      abbreviationMatch: 0.80                // Matched via abbreviation
    },
    riskLevels: {
      known: 'low',                          // Org in CSV whitelist
      uncertain: 'low',                      // Fuzzy or contextual match
      unknown: 'low'                         // Not in whitelist (still low for orgs)
    }
  };

  // ── Contextual trigger patterns for org extraction ─────────────────────
  const ORG_PATTERNS = [
    // "is the head/member of [ORG]"
    {
      name: 'head_of',
      regex: /\b(?:is\s+(?:the\s+)?(?:head|chief|member|part|employee|leader|director|manager|coordinator)|in)\s+(?:of|in|the\s+)?(?:the\s+)?([A-Z][A-Za-z\s&'.-]*?)(?:\s+(?:and|or|at|which|where)|\.|\,|;|$)/gi,
      context: 'role_in_org'
    },
    // "works at/for [ORG]"
    {
      name: 'works_at',
      regex: /\b(?:works?|employed?|working)\s+(?:at|by|for|with|in)\s+(?:the\s+)?([A-Z][A-Za-z\s&'.-]*?)(?:\s+(?:and|or|which|where)|\.|\,|;|$)/gi,
      context: 'employment'
    },
    // "is part of [ORG]" / "is a member of [ORG]"
    {
      name: 'part_of',
      regex: /\b(?:is|are)\s+(?:a\s+)?(?:member|part|employee|affiliate)\s+of\s+(?:the\s+)?([A-Z][A-Za-z\s&'.-]*?)(?:\s+(?:and|or|which|where)|\.|\,|;|$)/gi,
      context: 'membership'
    },
    // "at [ORG] headquarters" / "at [ORG] office"
    {
      name: 'at_location',
      regex: /\bat\s+([A-Z][A-Za-z\s&'.-]*?)\s+(?:headquarters|office|campus|facility|location|branch|headquarters|hq|hc)(?:\s+in|\.|\,|;|$)/gi,
      context: 'location'
    },
    // "[ORG] employee" / "[ORG] staff"
    {
      name: 'org_role',
      regex: /\b([A-Z][A-Za-z\s&'.-]*?)\s+(?:employee|staff|team member|associate|contractor|consultant|representative)(?:\s+|\.|\,|;|$)/gi,
      context: 'role_title'
    },
    // Acronym patterns: "[ACRONYM] (full name)" or mention of known acronym
    {
      name: 'acronym',
      regex: /\b([A-Z]{2,6})\b/g,  // Loose — refined via abbreviation validation
      context: 'acronym'
    }
  ];

  // ── Blacklist: Words that look like orgs but aren't ───────────────────
  const ORG_BLACKLIST = new Set([
    'the', 'and', 'or', 'for', 'with', 'from', 'that', 'this', 'which',
    'where', 'when', 'who', 'what', 'how', 'if', 'as', 'is', 'are', 'am',
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'i', 'you', 'he', 'she', 'we', 'they', 'it', 'my', 'your', 'his',
    'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them', 'a', 'an'
  ]);

  // ── Public API: Initialize (load CSV) ──────────────────────────────────
  async function initialize() {
    try {
      if (!TrustOrganizationLoader || !TrustOrganizationLoader.getInstance) {
        throw new Error('TrustOrganizationLoader not available — ensure organization-loader.js is loaded first');
      }

      const loader = TrustOrganizationLoader.getInstance();
      const success = await loader.load();

      if (!success) {
        throw new Error('Failed to load organization CSV');
      }

      if (CONFIG.enableLogging) {
        console.log('[TrustOrganizationDetectorEnhanced] Initialized with CSV');
      }
      return true;
    } catch (error) {
      if (CONFIG.enableLogging) {
        console.error('[TrustOrganizationDetectorEnhanced] Init failed:', error.message);
      }
      return false;
    }
  }

  // ── Utility: Normalize org name ────────────────────────────────────────
  function normalize(org) {
    return org ? org.trim().toLowerCase() : '';
  }

  // ── Utility: Clean extracted org name ──────────────────────────────────
  function cleanOrgName(text) {
    return text
      .replace(/[.,!?;:'"]/g, '')            // Remove punctuation
      .replace(/\s+(?:and|or|at)\s*$/i, '')  // Remove trailing conjunctions
      .trim();
  }

  // ── Public API: Validate a single organization ─────────────────────────
  function validateOrganization(orgName) {
    if (!orgName || orgName.length < CONFIG.minOrgLength) {
      return { isKnown: false, confidence: 0, risk: CONFIG.riskLevels.unknown, reason: 'too_short' };
    }

    const loader = TrustOrganizationLoader.getInstance();
    const normalized = normalize(orgName);
    const cleaned = cleanOrgName(orgName);

    // 1. Exact match
    if (loader.isKnownOrg(cleaned)) {
      return {
        isKnown: true,
        confidence: CONFIG.confidenceScores.exactMatch,
        risk: CONFIG.riskLevels.known,
        reason: 'exact_match',
        matchedOrg: cleaned
      };
    }

    // 2. Abbreviation match
    if (CONFIG.enableAbbreviationValidation) {
      if (loader.looksLikeOrg(cleaned)) {
        return {
          isKnown: true,
          confidence: CONFIG.confidenceScores.abbreviationMatch,
          risk: CONFIG.riskLevels.known,
          reason: 'abbreviation_or_prefix',
          matchedOrg: cleaned
        };
      }
    }

    // 3. Fuzzy match
    if (CONFIG.enableFuzzyMatch) {
      const fuzzyMatch = loader.findFuzzyMatch(cleaned, CONFIG.fuzzyDistanceThreshold);
      if (fuzzyMatch) {
        return {
          isKnown: true,
          confidence: CONFIG.confidenceScores.fuzzyMatch,
          risk: CONFIG.riskLevels.uncertain,
          reason: 'fuzzy_match',
          distance: fuzzyMatch.distance,
          matchedOrg: fuzzyMatch.org,
          input: cleaned
        };
      }
    }

    // Not found in CSV
    return {
      isKnown: false,
      confidence: 0,
      risk: CONFIG.riskLevels.unknown,
      reason: 'not_in_whitelist',
      input: cleaned
    };
  }

  // ── Public API: Extract organizations from contextual patterns ────────
  function extractContextualOrgs(text) {
    if (!CONFIG.enableContextExtraction || !text) return [];

    const findings = [];
    const seen = new Set();  // Deduplicate

    for (const pattern of ORG_PATTERNS) {
      let match;
      const re = new RegExp(pattern.regex);

      while ((match = re.exec(text)) !== null) {
        let orgName = match[1] ? match[1].trim() : null;
        if (!orgName) continue;

        orgName = cleanOrgName(orgName);

        // Skip blacklist and duplicates
        if (orgName.length < CONFIG.minOrgLength) continue;
        if (ORG_BLACKLIST.has(normalize(orgName))) continue;
        if (seen.has(normalize(orgName))) continue;

        seen.add(normalize(orgName));

        // Validate and add finding
        const validation = validateOrganization(orgName);
        findings.push({
          org: orgName,
          pattern: pattern.name,
          context: pattern.context,
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
          ...validation
        });
      }
    }

    return findings;
  }

  // ── Public API: Validate organizations from Compromise.js NER ────────────
  // This is the key integration point for hybrid detection
  function validateCompromiseOrgExtractions(compromiseOrgs) {
    if (!Array.isArray(compromiseOrgs)) return [];

    const findings = [];
    const seen = new Set();

    for (const org of compromiseOrgs) {
      if (!org || typeof org !== 'string') continue;

      const cleaned = cleanOrgName(org);
      
      // Skip if already seen or blacklisted
      if (cleaned.length < CONFIG.minOrgLength) continue;
      if (ORG_BLACKLIST.has(normalize(cleaned))) continue;
      if (seen.has(normalize(cleaned))) continue;

      seen.add(normalize(cleaned));

      // Validate against CSV
      const validation = validateOrganization(cleaned);
      findings.push({
        org: cleaned,
        source: 'compromise_nlp',           // Mark source for debugging
        pattern: 'ner',                      // Named Entity Recognition
        context: 'nlp_extracted',
        ...validation
      });
    }

    return findings;
  }

  // ── Public API: Filter and deduplicate organization findings ──────────
  function filterFindings(findings, minConfidence = 0.50) {
    const unique = new Map();

    for (const finding of findings) {
      const key = normalize(finding.org || finding.matchedOrg);

      // Keep the highest confidence match
      if (!unique.has(key) || unique.get(key).confidence < finding.confidence) {
        if (finding.confidence >= minConfidence) {
          unique.set(key, finding);
        }
      }
    }

    return Array.from(unique.values());
  }

  // ── Public API: Get CSV loader stats ───────────────────────────────────
  function getStats() {
    const loader = TrustOrganizationLoader.getInstance();
    return {
      ...CONFIG,
      loaderStats: loader.getStats()
    };
  }

  // ── Public API: Update configuration ───────────────────────────────────
  function updateConfig(overrides) {
    Object.assign(CONFIG, overrides);
  }

  // ── Singleton pattern ──────────────────────────────────────────────────
  const api = {
    initialize,
    validateOrganization,
    extractContextualOrgs,
    filterFindings,
    getStats,
    updateConfig
  };

  return {
    getInstance: () => api
  };
})();

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrustOrganizationDetectorEnhanced;
}
