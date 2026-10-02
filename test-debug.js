// Simple Node.js test for TrustPrompt debugging
const fs = require('fs');

// Check if we're in Node.js environment and set up globals
if (typeof global !== 'undefined') {
    // Set up mock global environment for browser-targeted code
    global.globalThis = global;
    global.window = {};
    global.document = {};
    global.console = console;
}

// Load dependencies in correct order (based on test-scanner-pathc.js pattern)

// 1. Load normalizer
const normalizerSrc = fs.readFileSync(__dirname + "/normalizer.js", "utf8")
  .replace(/\/\*.*?\*\//gs, "");
eval("global.TrustNormalizer = undefined; " + normalizerSrc.replace(/^const TrustNormalizer = \(\(\) => {/, "global.TrustNormalizer = (() => {"));

// 2. Load patterns
require('./patterns.js');

// 3. Load validator wrapper
require('./validator-wrapper.js');

// 4. Load gazetteer
require('./gazetteer.js');

// 5. Load linguistic detector
require('./linguistic-detector.js');

// 6. Load scanner
const TrustScanner = require('./scanner.js');

console.log('=== TrustPrompt Debug Test (Node.js) ===\n');

// Check available globals
console.log('Available globals:');
console.log('- TrustNormalizer:', typeof global.TrustNormalizer);
console.log('- isKnownPlaceholder:', typeof global.isKnownPlaceholder);
console.log('- PLACEHOLDER_PATTERNS:', typeof global.PLACEHOLDER_PATTERNS);
console.log('- shannonEntropy:', typeof global.shannonEntropy);
console.log('- TrustValidator:', typeof global.TrustValidator);
console.log('');

// Test 1: Check if computeSourceCodeScore is available
console.log('Test 1: Check computeSourceCodeScore availability');
if (TrustScanner && TrustScanner.computeSourceCodeScore) {
    console.log('✓ TrustScanner.computeSourceCodeScore is available');
    
    // Test with simple code
    const testCode = `const apiKey = 'sk-abc123def456';
function test() {
    return 42;
}`;
    
    try {
        const result = TrustScanner.computeSourceCodeScore(testCode);
        console.log('Code classification:', result.classification);
        console.log('Code score:', result.score);
        console.log('Strong evidence:', result.strong_evidence);
        console.log('Reason:', result.reason);
        console.log('Features:', JSON.stringify(result.features, null, 2));
    } catch (error) {
        console.log('✗ Error in computeSourceCodeScore:', error.message);
    }
} else {
    console.log('✗ computeSourceCodeScore NOT available');
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 2: Check BASE_SCORES and multiplier
console.log('Test 2: Check BASE_SCORES and multiplier');
if (TrustScanner && TrustScanner.BASE_SCORES) {
    console.log('✓ BASE_SCORES available');
    console.log('source_code score:', TrustScanner.BASE_SCORES.source_code);
    console.log('email score:', TrustScanner.BASE_SCORES.email);
    console.log('personal_label score:', TrustScanner.BASE_SCORES.personal_label);
} else {
    console.log('✗ BASE_SCORES NOT available');
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 3: Check if main scan function works
console.log('Test 3: Main scan function test');
try {
    // Test with multiple entity types to check multiplier
    const testPrompt = `My name is John Doe.
My email is john.doe@example.com.
My phone number is 09123456789.`;
    
    if (TrustScanner && TrustScanner.scan) {
        console.log('Testing prompt:', JSON.stringify(testPrompt));
        const scanResult = TrustScanner.scan(testPrompt);
        console.log('Risk level:', scanResult.riskLevel);
        console.log('Score:', scanResult.score);
        console.log('Findings count:', scanResult.findings.length);
        
        scanResult.findings.forEach((finding, i) => {
            console.log(`Finding ${i+1}: ${finding.patternId} - "${finding.rawMatch}" - risk: ${finding.risk} - validated: ${finding.validated}`);
        });
        
        // Test computeRiskScore directly
        if (TrustScanner.computeRiskScore) {
            const riskResult = TrustScanner.computeRiskScore(scanResult.findings);
            console.log('Direct risk computation:', riskResult);
        }
    } else {
        console.log('✗ TrustScanner.scan NOT available');
    }
} catch (error) {
    console.log('✗ Error in scan test:', error.message);
    console.log('Stack:', error.stack);
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 4: Test source code detection specifically
console.log('Test 4: Source code detection');
const codeWithCredentials = `function authenticate() {
    const apiKey = 'sk-proj-abc123def456ghi789';
    const response = await fetch('/api/data', {
        headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    return response.json();
}`;

try {
    if (TrustScanner && TrustScanner.scan) {
        console.log('Testing code detection...');
        const codeResult = TrustScanner.scan(codeWithCredentials);
        console.log('Code scan - Risk level:', codeResult.riskLevel);
        console.log('Code scan - Score:', codeResult.score);
        console.log('Code scan - Findings count:', codeResult.findings.length);
        
        codeResult.findings.forEach((finding, i) => {
            console.log(`Code finding ${i+1}: ${finding.patternId} - risk: ${finding.risk} - validated: ${finding.validated}`);
            if (finding.patternId === 'source_code') {
                console.log('  Source code metrics:', finding.codeMetrics);
            }
        });
    }
} catch (error) {
    console.log('✗ Error in code detection test:', error.message);
}

console.log('\n=== Debug Test Complete ===');