// linguistic-detector.js — PATH C: Linguistic-based PII detection using compromise.js
//
// This module uses NLP (tokenization, POS tagging, NER) to detect broad PII
// categories that are too variable for regex or gazetteer approaches:
//   - Person names (PERSON entities)
//   - Job titles / roles (JOB entities + POS heuristics)
//   - Organization names (ORG entities)
//
// The detector runs on the linguistic-normalized text view (textNLP) and returns
// findings with the same structure as PATH A/B findings for seamless integration
// into the scanner pipeline.
//
// Graceful degradation: If compromise.js is unavailable, returns empty findings
// without error, allowing scanner to continue with PATH A/B results only.

/* global window */

console.log("[STARTUP] linguistic-detector.js loading...");

const TrustLinguisticDetector = (() => {

  // ── Module initialization ──────────────────────────────────────────────────
  // Check if compromise.js is available in global scope
  const COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined;

  console.log("[STARTUP] COMPROMISE_AVAILABLE:", COMPROMISE_AVAILABLE);
  console.log("[STARTUP] typeof window.nlp:", typeof window.nlp);

  if (!COMPROMISE_AVAILABLE) {
    console.debug('[TrustPrompt/PATH_C] compromise.js not found; skipping linguistic detection');
  }
  
  console.log("[STARTUP] TrustLinguisticDetector initialized");

  // ── Constants & heuristic data ─────────────────────────────────────────────

  // Common first names used for optional filtering of obvious non-PII
  const COMMON_FIRST_NAMES = new Set([
    'john', 'mary', 'james', 'david', 'robert', 'michael', 'william', 'richard',
    'charles', 'joseph', 'thomas', 'alice', 'bob', 'charlie', 'example', 'user',
    'test', 'demo', 'sample', 'admin', 'root'
  ]);

  // Common job titles used for optional filtering
  const COMMON_JOB_TITLES = new Set([
    'manager', 'engineer', 'developer', 'analyst', 'designer', 'director',
    'coordinator', 'specialist', 'consultant', 'assistant', 'associate',
    'person', 'people', 'employee', 'staff', 'worker'
  ]);

  // ── Helper: Filter common non-PII names ─────────────────────────────────────

  /**
   * Check if a name is a common generic name that should be filtered.
   * @param {string} name - The name to check
   * @returns {boolean} true if the name should be filtered out
   * @private
   */
  function shouldFilterCommonName(name) {
    if (!name || name.length === 0) return true;
    const lower = name.toLowerCase().trim();
    const firstWord = lower.split(/\s+/)[0];
    return COMMON_FIRST_NAMES.has(firstWord);
  }

  /**
   * Check if a job title is a common generic title that should be filtered.
   * @param {string} title - The job title to check
   * @returns {boolean} true if the title should be filtered out
   * @private
   */
  function shouldFilterCommonJobTitle(title) {
    if (!title || title.length === 0) return true;
    const lower = title.toLowerCase().trim();
    return COMMON_JOB_TITLES.has(lower);
  }

  // ── Helper: Deduplicate within PATH C ───────────────────────────────────────

  /**
   * Remove duplicate findings within PATH C (same entity extracted multiple ways).
   * @param {Array} findings - Array of findings
   * @returns {Array} deduplicated findings
   * @private
   */
  function deduplicateWithinPath(findings) {
    const seen = new Map();
    const result = [];

    for (const f of findings) {
      const key = f.rawMatch.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.set(key, f);
        result.push(f);
      }
    }

    return result;
  }

  // ── Entity extraction: Person names ────────────────────────────────────────

  /**
   * Extract person name findings from the document.
   * Uses NER tagging and linguistic analysis from compromise.js
   *
   * Strategy:
   * - First attempt: Use compromise.js NER (doc.people()) if available
   * - Fallback: Use trigger phrases for common name patterns ("my name is", "i am called", etc.)
   * 
   * @param {object} doc - compromise.js document object
   * @returns {Array} array of person name findings
   * @private
   */
  function extractPersons(doc) {
    const findings = [];

    if (!doc) return findings;

    try {
      // Method 1: Use compromise.js NER to extract people
      // doc.people() returns entities tagged as person names
      const entities = doc.people();
      if (entities && entities.length > 0) {
        const peopleList = entities.out('array');
        for (const person of peopleList) {
          const rawMatch = person.trim();

          // Filter out common non-PII names
          if (!rawMatch || shouldFilterCommonName(rawMatch) || rawMatch.length < 2) {
            continue;
          }

          // Deduplicate
          if (!findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
            findings.push({
              patternId: 'nlp_person_name',
              label: 'Person Name (NLP)',
              risk: 'low',
              rawMatch,
              safeVersion: '[NAME REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Method 2: Fallback to trigger phrases for explicit name declarations
      // This catches cases like "my name is X" that might not trigger NER
      const text = doc.out('text');
      const nameTriggers = [
        /\bmy\s+name\s+is\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
        /\bi['']m\s+called\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
        /\bi\s+am\s+named\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
        /\bcall\s+me\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi,
      ];
      
      for (const trigger of nameTriggers) {
        let match;
        while ((match = trigger.exec(text)) !== null) {
          const potentialName = match[1].trim();
          
          // Filter common names and ensure minimum length
          if (potentialName.length >= 2 && !shouldFilterCommonName(potentialName)) {
            // Check if not already added from NER
            if (!findings.some(f => f.rawMatch.toLowerCase() === potentialName.toLowerCase())) {
              findings.push({
                patternId: 'nlp_person_name',
                label: 'Person Name (NLP)',
                risk: 'low',
                rawMatch: potentialName,
                safeVersion: '[NAME REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] NER people extraction failed:', error.message);
    }

    return findings;
  }

  // ── Entity extraction: Job titles ──────────────────────────────────────────

  /**
   * Extract job title findings from the document.
   * Uses compromise.js tagging to identify occupational entities via:
   * - NER tagging (if available for JOB entities)
   * - POS heuristics + sentence parsing for occupational noun phrases
   * 
   * Compromise.js provides tokenization and POS tagging that allows us to:
   * - Identify noun phrases that follow occupational patterns
   * - Match context like "I work as a [noun]" or "I am a [noun]"
   * - Recognize titles in various sentence structures
   *
   * @param {object} doc - compromise.js document object
   * @returns {Array} array of job title findings
   * @private
   */
  function extractJobTitles(doc) {
    const findings = [];

    if (!doc) return findings;

    try {
      // Compromise.js doesn't have explicit "JOB" entity type, but provides:
      // 1. Tokenization with lemma and pos (part-of-speech) tags
      // 2. Sentence-level analysis to identify grammatical structures
      //
      // We use a combination of:
      // - Pattern matching for known occupational triggers
      // - POS analysis to identify noun phrases
      // - Context analysis to validate potential titles
      
      const text = doc.out('text');
      
      // Define job trigger phrases that indicate occupational context
      const jobTriggers = [
        /\bi\s+work\s+as\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bi\s+work\s+as\s+an\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bi['']m\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bi\s+am\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bwork(?:ing|ed)?\s+as\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bemploy(?:ed)?\s+as\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\bposition\s+(?:is|as)\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\brole\s+(?:is|as)\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
        /\b(?:job\s+)?title\s+(?:is|:)?\s+a\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi,
      ];
      
      // Extract job titles using trigger patterns
      for (const trigger of jobTriggers) {
        let match;
        while ((match = trigger.exec(text)) !== null) {
          const potentialTitle = match[1].trim();
          
          // Filter common generic titles and ensure minimum length
          if (potentialTitle.length >= 2 && !shouldFilterCommonJobTitle(potentialTitle)) {
            // Check for duplicates
            if (!findings.some(f => f.rawMatch.toLowerCase() === potentialTitle.toLowerCase())) {
              findings.push({
                patternId: 'nlp_job_title',
                label: 'Job Title (NLP)',
                risk: 'low',
                rawMatch: potentialTitle,
                safeVersion: '[JOB TITLE REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] Job title extraction failed:', error.message);
    }

    return findings;
  }

  // ── Entity extraction: Organizations ───────────────────────────────────────

  /**
   * Extract organization name findings from the document.
   * Uses NER tagging and contextual analysis from compromise.js
   *
   * Strategy:
   * - First attempt: Use compromise.js NER (doc.organizations()) if available
   * - Fallback: Use trigger phrases for explicit organization declarations
   *
   * @param {object} doc - compromise.js document object
   * @returns {Array} array of organization findings
   * @private
   */
  function extractOrganizations(doc) {
    const findings = [];

    if (!doc) return findings;

    try {
      // Method 1: Use compromise.js NER to extract organizations
      // doc.organizations() returns entities tagged as organization names
      const entities = doc.organizations();
      if (entities && entities.length > 0) {
        const orgList = entities.out('array');
        for (const org of orgList) {
          const rawMatch = org.trim();

          // Filter out short strings (likely false positives)
          if (!rawMatch || rawMatch.length < 3) {
            continue;
          }

          // Deduplicate
          if (!findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
            findings.push({
              patternId: 'nlp_organization',
              label: 'Organization (NLP)',
              risk: 'low',
              rawMatch,
              safeVersion: '[ORGANIZATION REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
      }
      
      // Method 2: Fallback to trigger phrases for explicit org declarations
      // This catches cases where NER might miss organizations or need context
      const text = doc.out('text');
      const orgTriggers = [
        /\bwork\s+at\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bwork\s+for\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bwork\s+with\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bemploy(?:ed)?\s+(?:at|by)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
        /\bworking\s+(?:at|for)\s+([A-Za-z0-9&\s,]+?)(?:\.|,|;|$|\band\b)/gi,
      ];
      
      for (const trigger of orgTriggers) {
        let match;
        while ((match = trigger.exec(text)) !== null) {
          const potentialOrg = match[1].trim();
          
          // Filter out short strings and ensure quality
          if (potentialOrg.length >= 3) {
            // Check if not already added from NER
            if (!findings.some(f => f.rawMatch.toLowerCase() === potentialOrg.toLowerCase())) {
              findings.push({
                patternId: 'nlp_organization',
                label: 'Organization (NLP)',
                risk: 'low',
                rawMatch: potentialOrg,
                safeVersion: '[ORGANIZATION REDACTED]',
                source: 'C_linguistic',
                validated: false
              });
            }
          }
        }
      }
      
    } catch (error) {
      console.debug('[TrustPrompt/PATH_C] NER organization extraction failed:', error.message);
    }

    return findings;
  }

  // ── Main scanning function ─────────────────────────────────────────────────

  /**
   * Scan normalized text for linguistic PII using compromise.js NLP.
   *
   * Pipeline (WITH compromise.js):
   *   1. Initialize compromise.js document from normalized text
   *   2. Extract person names via NER
   *   3. Extract job titles via POS/context analysis
   *   4. Extract organizations via NER
   *   5. Deduplicate findings
   *
   * Fallback Pipeline (WITHOUT compromise.js):
   *   - Uses trigger phrase regex patterns for person, job, and org extraction
   *   - Provides reasonable detection without NLP library
   *
   * @param {string} textNLP - Linguistic-normalized text view from Normalizer
   * @returns {Array} array of finding objects with structure:
   *   {
   *     patternId: string (nlp_person_name, nlp_job_title, nlp_organization),
   *     label: string,
   *     risk: 'low',
   *     rawMatch: string,
   *     safeVersion: string,
   *     source: 'C_linguistic',
   *     validated: false
   *   }
   * @public
   */
  function scan(textNLP) {
    // Validate input
    if (!textNLP || typeof textNLP !== 'string' || textNLP.trim().length === 0) {
      return [];
    }

    const findings = [];

    try {
      if (COMPROMISE_AVAILABLE) {
        // Full NLP pipeline when compromise.js is available
        const doc = window.nlp(textNLP);

        // Extract entities using compromise.js NER
        const personFindings = extractPersons(doc);
        const jobFindings = extractJobTitles(doc);
        const orgFindings = extractOrganizations(doc);

        findings.push(...personFindings, ...jobFindings, ...orgFindings);

        console.log(
          '[TrustPrompt/PATH_C] detected (with NLP):',
          `person:${personFindings.length}`,
          `job:${jobFindings.length}`,
          `org:${orgFindings.length}`,
          `| deduplicated:${deduplicateWithinPath(findings).length}`
        );
      } else {
        // Fallback: trigger phrase extraction when compromise.js is unavailable
        console.debug('[TrustPrompt/PATH_C] Using trigger phrase fallback (compromise.js not available)');
        
        // Person detection via trigger phrases
        const nameMatch = /(?:my name is|i (?:am|'m)|i (?:am|'m) called|call me)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi.exec(textNLP);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          if (name.length >= 2 && !shouldFilterCommonName(name)) {
            findings.push({
              patternId: 'nlp_person_name',
              label: 'Person Name (NLP)',
              risk: 'low',
              rawMatch: name,
              safeVersion: '[NAME REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
        
        // Job title detection via trigger phrases
        const jobMatch = /(?:i work as a|i'm a|work as a|employed as a|role is a)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi.exec(textNLP);
        if (jobMatch) {
          const job = jobMatch[1].trim();
          if (job.length >= 2 && !shouldFilterCommonJobTitle(job)) {
            findings.push({
              patternId: 'nlp_job_title',
              label: 'Job Title (NLP)',
              risk: 'low',
              rawMatch: job,
              safeVersion: '[JOB TITLE REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }
        
        // Organization detection via trigger phrases
        const orgMatch = /(?:work at|work for|employed at|employed by)\s+([A-Za-z0-9&\s]+?)(?:\.|,|;|$|and)/gi.exec(textNLP);
        if (orgMatch) {
          const org = orgMatch[1].trim();
          if (org.length >= 3) {
            findings.push({
              patternId: 'nlp_organization',
              label: 'Organization (NLP)',
              risk: 'low',
              rawMatch: org,
              safeVersion: '[ORGANIZATION REDACTED]',
              source: 'C_linguistic',
              validated: false
            });
          }
        }

        console.log(
          '[TrustPrompt/PATH_C] detected (fallback):',
          `person:${findings.filter(f => f.patternId === 'nlp_person_name').length}`,
          `job:${findings.filter(f => f.patternId === 'nlp_job_title').length}`,
          `org:${findings.filter(f => f.patternId === 'nlp_organization').length}`
        );
      }

      // Deduplicate within PATH C
      const deduplicated = deduplicateWithinPath(findings);
      return deduplicated;

    } catch (error) {
      console.error('[TrustPrompt/PATH_C] Error during linguistic detection:', error);
      return []; // Fail gracefully
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { scan };

})();

// ── QUICK TEST (for browser console) ──────────────────────────────────────────
console.log("[STARTUP] TrustLinguisticDetector is ready. Test with:");
console.log("testLinguisticDetector()");

// Make sure both are globally accessible
if (typeof window !== 'undefined') {
  window.TrustLinguisticDetector = TrustLinguisticDetector;
  
  window.testLinguisticDetector = function() {
    const testText = 'i am kyleen. professor';
    console.log('[TEST] Running testLinguisticDetector...');
    console.log('[TEST] Input:', testText);
    
    if (!window.TrustLinguisticDetector || !window.TrustLinguisticDetector.scan) {
      console.error('[TEST] ERROR: TrustLinguisticDetector.scan is not available');
      return [];
    }
    
    const result = window.TrustLinguisticDetector.scan(testText);
    console.log('[TEST] Result:', result);
    console.log('[TEST] Findings count:', result.length);
    for (const f of result) {
      console.log(`  - ${f.patternId}: "${f.rawMatch}" → "${f.safeVersion}"`);
    }
    return result;
  };
  
  console.log('[STARTUP] testLinguisticDetector attached to window');
  console.log('[STARTUP] typeof window.testLinguisticDetector:', typeof window.testLinguisticDetector);
}

