// Simple test for Path C semantic context
// Run: node test-path-c-semantic-simple.js

// Mock window and nlp for testing
global.window = {
  nlp: require('compromise')
};

// Load the detector
const TrustLinguisticDetector = require('./linguistic-detector.js');

const testCases = [
    "Kyleen Nicdao works in Accenture",
    "Madeline is a virtual assistant at PGH Hospital",
    "juliah is a nurse",
    "GENERATE AN EMAIL FOR BEATRICE, THE PROJECT MANAGER OF AZURE"
];

console.log('\n' + '='.repeat(80));
console.log('PATH C SEMANTIC CONTEXT TEST');
console.log('='.repeat(80));

for (const testText of testCases) {
    console.log('\n' + '-'.repeat(80));
    console.log('INPUT:', testText);
    console.log('-'.repeat(80));
    
    try {
        const findings = TrustLinguisticDetector.scan(testText);
        
        console.log(`FINDINGS: ${findings.length} detected\n`);
        
        if (findings.length === 0) {
            console.log('  [NO FINDINGS]');
        } else {
            for (let i = 0; i < findings.length; i++) {
                const f = findings[i];
                console.log(`  [${i+1}] Pattern: ${f.patternId}`);
                console.log(`      Raw Match: "${f.rawMatch}"`);
                console.log(`      Label: ${f.label}`);
                
                if (f.semanticContext) {
                    console.log(`      Semantic Context:`);
                    console.log(`        - Type: ${f.semanticContext.type}`);
                    console.log(`        - Confidence: ${f.semanticContext.confidence}`);
                    console.log(`        - Indicators: ${JSON.stringify(f.semanticContext.indicators)}`);
                } else {
                    console.log(`      ⚠️  SEMANTIC CONTEXT: MISSING`);
                }
            }
        }
    } catch (error) {
        console.error('ERROR:', error.message);
        console.error(error.stack);
    }
}

console.log('\n' + '='.repeat(80));
console.log('TEST COMPLETE');
console.log('='.repeat(80));
