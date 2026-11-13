/**
 * F1 Score Evaluation Script for TrustPrompt Scanner
 * 
 * Usage:
 *   node evaluate-f1-score.js [dataset.json]
 * 
 * Dataset format:
 *   [
 *     {
 *       "text": "What's the average height and weight of a 25 year old Filipino male?",
 *       "ground_truth": {
 *         "should_flag": false,
 *         "expected_patterns": []
 *       }
 *     },
 *     ...
 *   ]
 */

require('./terms-medical.js');
require('./terms-financial.js');
require('./terms-organizations.js');
require('./normalizer.js');
require('./gazetteer.js');
require('./patterns.js');
const TrustScanner = require('./scanner.js');

// Sample test cases for debugging
const TEST_CASES = [
  {
    text: "What's the average height and weight of a 25 year old Filipino male?",
    ground_truth: {
      should_flag_age: false,
      description: "General question - should NOT flag age"
    }
  },
  {
    text: "I am 25 years old and need help with my resume.",
    ground_truth: {
      should_flag_age: true,
      description: "Personal disclosure - should flag age"
    }
  },
  {
    text: "The typical age for this demographic is 25 years old.",
    ground_truth: {
      should_flag_age: false,
      description: "Demographic info - should NOT flag age"
    }
  },
  {
    text: "My age is 25 years old, and my blood type is O+.",
    ground_truth: {
      should_flag_age: true,
      description: "Personal info - should flag age"
    }
  },
];

class F1Evaluator {
  constructor() {
    this.results = [];
    this.metrics = {
      age_value: {
        tp: 0,  // true positives
        fp: 0,  // false positives
        fn: 0,  // false negatives
        tn: 0   // true negatives
      }
    };
  }

  evaluate(testCases) {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  TrustPrompt F1 Score Evaluation                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    testCases.forEach((testCase, idx) => {
      console.log(`\n[Test ${idx + 1}] ${testCase.ground_truth.description}`);
      console.log('─'.repeat(68));
      console.log(`Text: "${testCase.text.substring(0, 60)}..."`);
      
      // Run scanner
      const result = TrustScanner.scan(testCase.text);
      const ageFindings = result.findings.filter(f => f.patternId === 'age_value');
      
      const predicted_flag_age = ageFindings.length > 0;
      const expected_flag_age = testCase.ground_truth.should_flag_age;
      
      console.log(`Expected: ${expected_flag_age ? 'FLAG age' : 'NO age flag'}`);
      console.log(`Predicted: ${predicted_flag_age ? 'FLAG age' : 'NO age flag'}`);
      
      // Calculate confusion matrix
      if (expected_flag_age && predicted_flag_age) {
        this.metrics.age_value.tp++;
        console.log('Result: ✓ TP (True Positive)');
      } else if (!expected_flag_age && !predicted_flag_age) {
        this.metrics.age_value.tn++;
        console.log('Result: ✓ TN (True Negative)');
      } else if (expected_flag_age && !predicted_flag_age) {
        this.metrics.age_value.fn++;
        console.log('Result: ✗ FN (False Negative) - MISSED a real age disclosure');
      } else if (!expected_flag_age && predicted_flag_age) {
        this.metrics.age_value.fp++;
        console.log('Result: ✗ FP (False Positive) - FLAGGED when should not flag');
      }
      
      if (ageFindings.length > 0) {
        console.log(`Found: ${ageFindings.map(f => f.rawMatch).join(', ')}`);
      }
    });

    this.printMetrics();
  }

  printMetrics() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  METRICS                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const { tp, fp, fn, tn } = this.metrics.age_value;
    
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : 2 * (precision * recall) / (precision + recall);
    const accuracy = (tp + tn) / (tp + fp + fn + tn);

    console.log('Age Value Detection (age_value pattern):');
    console.log(`  True Positives (TP):   ${tp}  (correctly flagged personal age)`);
    console.log(`  False Positives (FP):  ${fp}  (incorrectly flagged general age)`);
    console.log(`  False Negatives (FN):  ${fn}  (missed personal age disclosures)`);
    console.log(`  True Negatives (TN):   ${tn}  (correctly skipped general age)\n`);
    
    console.log(`  Precision: ${(precision * 100).toFixed(1)}% - of flagged items, how many are real?`);
    console.log(`  Recall:    ${(recall * 100).toFixed(1)}% - of real items, how many did we catch?`);
    console.log(`  F1 Score:  ${(f1 * 100).toFixed(1)}% - harmonic mean of precision & recall`);
    console.log(`  Accuracy:  ${(accuracy * 100).toFixed(1)}% - overall correctness\n`);

    if (f1 >= 0.8) {
      console.log('✓✓✓ EXCELLENT - F1 >= 80%');
    } else if (f1 >= 0.7) {
      console.log('✓✓ GOOD - F1 >= 70%');
    } else if (f1 >= 0.6) {
      console.log('✓ FAIR - F1 >= 60%');
    } else {
      console.log('✗ POOR - F1 < 60% - needs improvement');
    }

    console.log('\nRecommendations:');
    if (fp > 0) {
      console.log(`  • ${fp} false positives - improve context filtering to reduce over-flagging`);
    }
    if (fn > 0) {
      console.log(`  • ${fn} false negatives - add more age detection patterns or triggers`);
    }
    if (fp === 0 && fn === 0 && (tp + tn) > 0) {
      console.log(`  • Perfect score! All tests passed.`);
    }
  }
}

// Run evaluation
const evaluator = new F1Evaluator();
evaluator.evaluate(TEST_CASES);
