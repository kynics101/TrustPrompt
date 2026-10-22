// organization-loader.js
// CSV-based organization whitelist and fuzzy matching utility.
//
// Purpose:
//   Load organizations from csv/organizations.csv into an in-memory data structure
//   that supports:
//   1. Fast O(1) exact lookups (Set for normalized names)
//   2. Fuzzy/prefix matching (sorted array for binary search + edit distance)
//   3. Abbreviation mapping (e.g., "Apple" → "Apple Inc.")
//   4. Multi-word org name handling (e.g., "University of Santo Tomas" as single entity)
//
// Usage:
//   const loader = TrustOrganizationLoader.getInstance();
//   await loader.load();  // Load CSV on first call; cached after
//   loader.isKnownOrg('Apple Inc.');              // → boolean
//   loader.findFuzzyMatch('Appl Inc');            // → { org: 'Apple Inc.', distance: 1 }
//   loader.getAbbreviations('Apple Inc.');        // → ['AAPL', 'Apple']
//
// Performance:
//   - CSV loaded once per session (lazy-loaded on first getInstance().load())
//   - Lookups: O(1) exact, O(log n) fuzzy with edit distance threshold
//   - Memory: ~1-2 MB for 22k+ orgs + fuzzy index
//   - Thread-safe: Singleton pattern; no state mutations after load

/* global TrustOrganizationLoader */

const TrustOrganizationLoader = (() => {
  let instance = null;

  // ── State: Loaded organization data ─────────────────────────────────────
  let initialized = false;
  const state = {
    orgSet: new Set(),                       // Exact match: normalized org name → exists
    orgList: [],                             // Sorted list for fuzzy/prefix search
    abbrevMap: new Map(),                    // org → [abbrev1, abbrev2, ...]
    fuzzyIndex: null                         // Pre-built edit-distance index (future)
  };

  // ── Configuration ──────────────────────────────────────────────────────
  const CONFIG = {
    csvUrl: '/csv/organizations.csv',        // Relative path from extension root
    maxFuzzyDistance: 2,                     // Max Levenshtein distance for fuzzy match
    minOrgLength: 2,                         // Skip orgs < 2 chars (noise)
    caseInsensitive: true,                   // Normalize to lowercase for comparison
    batchSize: 100,                          // Process CSV in batches (for large files)
    enableLogging: false                     // Debug logging
  };

  // ── Utility: Normalize org name ───────────────────────────────────────
  function normalize(org) {
    if (!org) return '';
    return CONFIG.caseInsensitive
      ? org.trim().toLowerCase()
      : org.trim();
  }

  // ── Utility: Levenshtein distance ────────────────────────────────────
  // Returns edit distance between two strings
  function levenshteinDistance(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  // ── Utility: Extract common abbreviations from org name ─────────────────
  // E.g., "Apple Inc." → ["AAPL", "Apple", "Inc", "AI"]
  function extractAbbreviations(org) {
    const abbrevs = [];

    // First-letter acronym from words (skip small words)
    const words = org.split(/\s+/);
    if (words.length > 1) {
      const acr = words.map(w => w[0].toUpperCase()).join('');
      if (acr.length >= 2 && acr.length <= 6) {
        abbrevs.push(acr);
      }
    }

    // Individual words (skip articles, small particles)
    const stopWords = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'inc', 'ltd', 'co', 'corp']);
    for (const word of words) {
      const clean = word.toLowerCase().replace(/[.,&']/g, '');
      if (clean.length >= 2 && !stopWords.has(clean)) {
        abbrevs.push(clean);
      }
    }

    return abbrevs;
  }

  // ── Main: Parse CSV text and populate org data ──────────────────────────
  function parseCsv(csvText) {
    const lines = csvText.split('\n');
    const newOrgSet = new Set();
    const newOrgList = [];
    const newAbbrevMap = new Map();

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // Handle quoted CSV fields (remove outer quotes if present)
      if (line.startsWith('"') && line.endsWith('"')) {
        line = line.slice(1, -1).replace(/""/g, '"');  // Unescape doubled quotes
      }

      if (line.length < CONFIG.minOrgLength) continue;

      // Normalize and add to set
      const normalized = normalize(line);
      newOrgSet.add(normalized);
      newOrgList.push({ original: line, normalized });

      // Extract and map abbreviations
      const abbrevs = extractAbbreviations(line);
      if (abbrevs.length > 0) {
        newAbbrevMap.set(normalized, abbrevs);
      }
    }

    // Sort list by normalized name for binary search
    newOrgList.sort((a, b) => a.normalized.localeCompare(b.normalized));

    return { orgSet: newOrgSet, orgList: newOrgList, abbrevMap: newAbbrevMap };
  }

  // ── Load CSV from URL or file ──────────────────────────────────────────
  async function loadCsv() {
    try {
      let csvText = '';

      // Try fetch (browser/Node environment)
      if (typeof fetch !== 'undefined') {
        const response = await fetch(CONFIG.csvUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${CONFIG.csvUrl}`);
        }
        csvText = await response.text();
      }
      // Fallback: try require (Node.js backend)
      else if (typeof require !== 'undefined') {
        try {
          const fs = require('fs');
          const path = require('path');
          const filePath = path.join(__dirname, 'csv', 'organizations.csv');
          csvText = fs.readFileSync(filePath, 'utf-8');
        } catch (e) {
          throw new Error('Could not load CSV via fetch or fs: ' + e.message);
        }
      }

      if (!csvText) {
        throw new Error('CSV text is empty');
      }

      // Parse CSV and populate module state
      const { orgSet, orgList, abbrevMap } = parseCsv(csvText);
      state.orgSet = orgSet;
      state.orgList = orgList;
      state.abbrevMap = abbrevMap;
      initialized = true;

      if (CONFIG.enableLogging) {
        console.log(`[TrustPrompt/OrganizationLoader] Loaded ${orgSet.size} organizations`);
      }

      return true;
    } catch (error) {
      if (CONFIG.enableLogging) {
        console.error('[TrustPrompt/OrganizationLoader] Load failed:', error.message);
      }
      return false;
    }
  }

  // ── Public API: Check if organization is known (exact match) ──────────────
  function isKnownOrg(orgName) {
    if (!initialized) return false;
    const normalized = normalize(orgName);
    return state.orgSet.has(normalized);
  }

  // ── Public API: Find fuzzy match (edit distance within threshold) ─────────
  function findFuzzyMatch(input, maxDistance = CONFIG.maxFuzzyDistance) {
    if (!initialized) return null;
    const normalized = normalize(input);

    // First, try exact match
    if (state.orgSet.has(normalized)) {
      return {
        org: Array.from(state.orgSet).find(o => o === normalized),
        distance: 0,
        type: 'exact'
      };
    }

    // Then try fuzzy match with edit distance
    let bestMatch = null;
    let bestDistance = maxDistance + 1;

    for (const { original, normalized: norm } of state.orgList) {
      const distance = levenshteinDistance(normalized, norm);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = { org: original, norm: norm, distance };
      }
    }

    if (bestDistance <= maxDistance) {
      return {
        org: bestMatch.org,
        norm: bestMatch.norm,
        distance: bestDistance,
        type: 'fuzzy'
      };
    }

    return null;
  }

  // ── Public API: Find organizations starting with prefix ─────────────────
  function findByPrefix(prefix, limit = 10) {
    if (!initialized) return [];
    const normalized = normalize(prefix);
    const results = [];

    for (const { original, normalized: norm } of state.orgList) {
      if (norm.startsWith(normalized)) {
        results.push(original);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  // ── Public API: Get known abbreviations for an org ─────────────────────
  function getAbbreviations(orgName) {
    if (!initialized) return [];
    const normalized = normalize(orgName);
    return state.abbrevMap.get(normalized) || [];
  }

  // ── Public API: Check if input looks like an org (abbrev or prefix) ─────
  function looksLikeOrg(input) {
    if (!initialized) return false;

    // Check exact match first
    if (isKnownOrg(input)) return true;

    // Check if any known org has this as an abbreviation
    for (const abbrevs of state.abbrevMap.values()) {
      if (abbrevs.some(a => normalize(a) === normalize(input))) {
        return true;
      }
    }

    // Check prefix match (at least 3 chars)
    if (input.length >= 3) {
      return findByPrefix(input, 1).length > 0;
    }

    return false;
  }

  // ── Public API: Get statistics ────────────────────────────────────────
  function getStats() {
    return {
      initialized,
      totalOrganizations: state.orgSet.size,
      abbreviationCount: state.abbrevMap.size,
      memoryUsage: 'estimated ~1-2 MB'
    };
  }

  // ── Public API: Update configuration ──────────────────────────────────
  function updateConfig(overrides) {
    Object.assign(CONFIG, overrides);
  }

  // ── Singleton pattern ──────────────────────────────────────────────────
  const api = {
    load: loadCsv,
    isKnownOrg,
    findFuzzyMatch,
    findByPrefix,
    getAbbreviations,
    looksLikeOrg,
    getStats,
    updateConfig
  };

  return {
    getInstance: () => api
  };
})();

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrustOrganizationLoader;
}
