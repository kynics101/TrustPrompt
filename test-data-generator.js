/**
 * test-data-generator.js
 * 
 * Generates anonymized test data for PII detection testing.
 * This separates test data from production detection code, preventing
 * accidental deployment of real PII test cases.
 * 
 * Usage:
 *   const testData = TestDataGenerator.getTestCases();
 *   // Test with anonymized data instead of real names
 * 
 * Philosophy:
 * - Tests use ANONYMIZED names (PERSON_1, PERSON_2, etc.)
 * - But these anonymized names are tagged with what they represent
 * - Detection logic remains identical - tests validate detection works
 * - Production code never contains real PII for testing
 */

const TestDataGenerator = (() => {
  
  // Anonymized test names (use [PERSON_N], [ORG_N], [JOB_N] format)
  const ANONYMIZED_FIRST_NAMES = [
    '[PERSON_1]',
    '[PERSON_2]',
    '[PERSON_3]',
    '[PERSON_4]',
    '[PERSON_5]'
  ];

  const ANONYMIZED_LAST_NAMES = [
    '[LASTNAME_1]',
    '[LASTNAME_2]',
    '[LASTNAME_3]',
    '[LASTNAME_4]',
    '[LASTNAME_5]'
  ];

  const ANONYMIZED_ORGS = [
    '[ORG_1]',
    '[ORG_2]',
    '[ORG_3]',
    '[ORG_4]'
  ];

  const ANONYMIZED_JOB_TITLES = [
    '[JOB_SOFTWARE_ENGINEER]',
    '[JOB_MANAGER]',
    '[JOB_ANALYST]',
    '[JOB_DESIGNER]',
    '[JOB_DIRECTOR]'
  ];

  /**
   * Get a random anonymized test case
   * @returns {object} Test case with anonymized data
   */
  function getRandomTestCase() {
    const person1 = ANONYMIZED_FIRST_NAMES[Math.floor(Math.random() * ANONYMIZED_FIRST_NAMES.length)];
    const person2 = ANONYMIZED_FIRST_NAMES[Math.floor(Math.random() * ANONYMIZED_FIRST_NAMES.length)];
    const lastName = ANONYMIZED_LAST_NAMES[Math.floor(Math.random() * ANONYMIZED_LAST_NAMES.length)];
    const org = ANONYMIZED_ORGS[Math.floor(Math.random() * ANONYMIZED_ORGS.length)];
    const job = ANONYMIZED_JOB_TITLES[Math.floor(Math.random() * ANONYMIZED_JOB_TITLES.length)];

    return { person1, person2, lastName, org, job };
  }

  /**
   * Get all predefined test cases with anonymized data
   * Each test case has:
   * - text: the test input with anonymized data
   * - expectedDetections: what should be detected
   * - category: "personal_disclosure", "abstract", "measurement", etc.
   */
  function getTestCases() {
    const anonymized = getRandomTestCase();

    return [
      {
        name: 'personal_disclosure_simple',
        text: `My name is ${anonymized.person1} ${anonymized.lastName}`,
        expectedDetections: {
          person_names: [anonymized.person1, anonymized.lastName],
          context: 'personal_disclosure'
        },
        category: 'personal_disclosure'
      },
      {
        name: 'personal_disclosure_with_job',
        text: `I work as a ${anonymized.job} at ${anonymized.org}. My name is ${anonymized.person1}.`,
        expectedDetections: {
          person_names: [anonymized.person1],
          job_titles: [anonymized.job],
          organizations: [anonymized.org],
          context: 'personal_disclosure'
        },
        category: 'personal_disclosure'
      },
      {
        name: 'abstract_knowledge',
        text: `What is the definition of ${anonymized.job}? Example: A ${anonymized.job} works in technology.`,
        expectedDetections: {
          job_titles: [anonymized.job],
          context: 'abstract'
        },
        category: 'abstract'
      },
      {
        name: 'measurement_context',
        text: `Convert 5 kilograms to pounds. The measurement is 11 pounds.`,
        expectedDetections: {
          measurements: ['5 kilograms', '11 pounds'],
          context: 'measurement'
        },
        category: 'measurement'
      },
      {
        name: 'subject_position_name',
        text: `${anonymized.person1} ${anonymized.lastName} is a ${anonymized.job}.`,
        expectedDetections: {
          person_names: [anonymized.person1, anonymized.lastName],
          job_titles: [anonymized.job],
          context: 'personal_disclosure'
        },
        category: 'personal_disclosure'
      },
      {
        name: 'standalone_names',
        text: `Contact ${anonymized.person1} or ${anonymized.person2} for support.`,
        expectedDetections: {
          person_names: [anonymized.person1, anonymized.person2],
          context: 'personal_disclosure'
        },
        category: 'personal_disclosure'
      }
    ];
  }

  /**
   * Get test data with REAL names (for local testing only, not in production)
   * This function is intentionally marked for local use only.
   * 
   * DO NOT DEPLOY WITH REAL NAMES - use only in local development
   */
  function getTestCasesWithRealNames() {
    // WARNING: This is for LOCAL TESTING ONLY
    // In production, always use anonymized data above
    
    if (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost') {
      // Only allow real names in localhost/local development
      return [
        {
          name: 'personal_disclosure_simple_realname',
          text: 'My name is Kyleen Nicdao',
          expectedDetections: {
            person_names: ['Kyleen', 'Nicdao'],
            context: 'personal_disclosure'
          },
          category: 'personal_disclosure'
        },
        {
          name: 'personal_disclosure_realname2',
          text: 'I work as an engineer. My name is Cristina Santos.',
          expectedDetections: {
            person_names: ['Cristina', 'Santos'],
            job_titles: ['engineer'],
            context: 'personal_disclosure'
          },
          category: 'personal_disclosure'
        }
      ];
    }

    // Production environment: never return real names
    console.warn('[TestDataGenerator] Real names requested in non-local environment. Returning anonymized data instead.');
    return getTestCases();
  }

  /**
   * Metadata about anonymization
   * Shows what each anonymized token represents
   */
  function getAnonymizationMap() {
    return {
      '[PERSON_N]': 'Represents a first name (person)',
      '[LASTNAME_N]': 'Represents a last name (person)',
      '[ORG_N]': 'Represents an organization name',
      '[JOB_*]': 'Represents a job title (specific job type appended)',
      'note': 'All test data uses anonymized tokens instead of real PII'
    };
  }

  // Public API
  return {
    getTestCases,
    getTestCasesWithRealNames,
    getAnonymizationMap,
    getRandomTestCase
  };
})();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestDataGenerator;
}
