#!/usr/bin/env node

/**
 * run-tests.js
 * 
 * Node.js test runner for TrustPrompt
 * Provides comprehensive testing without browser CSP restrictions
 * 
 * Usage:
 *   node run-tests.js
 *   node run-tests.js --debug
 *   node run-tests.js --fixes
 *   node run-tests.js --semantic
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    let prefix = `[${timestamp}]`;
    
    switch (type) {
        case 'pass':
            console.log(`${colors.green}✓${colors.reset} ${prefix} ${message}`);
            break;
        case 'fail':
            console.log(`${colors.red}✗${colors.reset} ${prefix} ${message}`);
            break;
        case 'warn':
            console.log(`${colors.yellow}⚠${colors.reset} ${prefix} ${message}`);
            break;
        case 'info':
            console.log(`${colors.blue}ℹ${colors.reset} ${prefix} ${message}`);
            break;
        case 'title':
            console.log(`\n${colors.bright}${colors.cyan}${message}${colors.reset}\n`);
            break;
        case 'section':
            console.log(`\n${colors.bright}${message}${colors.reset}`);
            break;
        default:
            console.log(`${prefix} ${message}`);
    }
}

function header() {
    console.log(`
${colors.bright}${colors.cyan}
╔═══════════════════════════════════════════════════════╗
║         TrustPrompt Test Runner - Node.js             ║
║     Comprehensive PII Detection & Risk Scoring        ║
╚═══════════════════════════════════════════════════════╝
${colors.reset}
    `);
}

function footer(passCount, failCount) {
    const total = passCount + failCount;
    const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : 0;
    
    console.log(`
${colors.bright}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${colors.green}✓ Passed: ${passCount}${colors.reset}
${colors.red}✗ Failed: ${failCount}${colors.reset}
   Total:  ${total}
   Rate:   ${passRate}%
${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${colors.reset}
    `);
}

function runDebugTests() {
    log('DEBUG TEST SUITE', 'title');
    let passCount = 0;
    let failCount = 0;

    log('Test 1: TrustScanner availability', 'section');
    try {
        if (typeof TrustScanner !== 'undefined') {
            log('✓ TrustScanner module loaded', 'pass');
            passCount++;

            if (typeof TrustScanner.scan === 'function') {
                log('✓ TrustScanner.scan() method available', 'pass');
                passCount++;
            } else {
                log('✗ TrustScanner.scan() not available', 'fail');
                failCount++;
            }

            if (typeof TrustScanner.computeSourceCodeScore === 'function') {
                log('✓ TrustScanner.computeSourceCodeScore() available', 'pass');
                passCount++;
            } else {
                log('✗ TrustScanner.computeSourceCodeScore() not available', 'fail');
                failCount++;
            }
        } else {
            log('✗ TrustScanner module not loaded', 'fail');
            failCount++;
        }
    } catch (e) {
        log(`✗ Error: ${e.message}`, 'fail');
        failCount++;
    }

    log('Test 2: Basic scanning', 'section');
    try {
        const testText = "My name is John and my email is john@example.com";
        const result = TrustScanner.scan(testText);
        
        if (result && result.findings && Array.isArray(result.findings)) {
            log(`✓ Scan completed: ${result.findings.length} findings detected`, 'pass');
            passCount++;
            
            result.findings.forEach((f, i) => {
                log(`  ${i+1}. ${f.patternId}: "${f.rawMatch}"`, 'info');
            });
        } else {
            log('✗ Scan did not return expected structure', 'fail');
            failCount++;
        }
    } catch (e) {
        log(`✗ Error during scan: ${e.message}`, 'fail');
        failCount++;
    }

    log('Test 3: Source code detection', 'section');
    try {
        const testCode = `const apiKey = 'sk-abc123def456';
function test() {
    return 42;
}`;
        
        const result = TrustScanner.scan(testCode);
        
        if (result.findings.length > 0) {
            log(`✓ Source code detected: ${result.findings.length} findings`, 'pass');
            passCount++;
            log(`  Risk level: ${result.riskLevel}`, 'info');
        } else {
            log('⚠ No findings for source code (might be normal)', 'warn');
            failCount++;
        }
    } catch (e) {
        log(`✗ Error in source code test: ${e.message}`, 'fail');
        failCount++;
    }

    return { passCount, failCount };
}

function runFixesTests() {
    log('DETECTION FIXES TEST SUITE', 'title');
    let passCount = 0;
    let failCount = 0;

    const testCases = [
        {
            name: "Credit Card (Positive Control)",
            input: "card number is 5360 3452 2113 6543",
            shouldDetect: true,
            expectedPattern: "credit_card"
        },
        {
            name: "PATH B - Health Trigger",
            input: "i have diabetes",
            shouldDetect: true,
            expectedPattern: "gazetteer_medical"
        },
        {
            name: "PATH C - Person Name",
            input: "my name is kyleen",
            shouldDetect: true,
            expectedPattern: "nlp_person_name"
        },
        {
            name: "Source Code Detection",
            input: "const x=6;",
            shouldDetect: true,
            expectedPattern: "source_code"
        },
        {
            name: "Email Detection",
            input: "contact me at john.doe@example.com",
            shouldDetect: true,
            expectedPattern: "email"
        }
    ];

    testCases.forEach((testCase, index) => {
        log(`Test ${index + 1}: ${testCase.name}`, 'section');
        try {
            const result = TrustScanner.scan(testCase.input);
            const detected = result.findings.length > 0;
            
            if (detected === testCase.shouldDetect) {
                log(`✓ ${testCase.name} - Correct detection`, 'pass');
                passCount++;
                log(`  Input: "${testCase.input}"`, 'info');
                log(`  Risk: ${result.riskLevel} | Score: ${result.score}`, 'info');
                log(`  Findings: ${result.findings.length}`, 'info');
                
                result.findings.forEach(f => {
                    log(`    - ${f.patternId}: "${f.rawMatch}"`, 'info');
                });
            } else {
                log(`✗ ${testCase.name} - Detection mismatch`, 'fail');
                failCount++;
                log(`  Expected: ${testCase.shouldDetect ? 'detected' : 'not detected'}`, 'info');
                log(`  Got: ${detected ? 'detected' : 'not detected'}`, 'info');
            }
        } catch (e) {
            log(`✗ Error: ${e.message}`, 'fail');
            failCount++;
        }
    });

    return { passCount, failCount };
}

function runSemanticTests() {
    log('SEMANTIC CONTEXT TEST SUITE', 'title');
    let passCount = 0;
    let failCount = 0;

    const testCases = [
        "Kyleen Nicdao works in Accenture",
        "Madeline is a virtual assistant at PGH Hospital",
        "juliah is a nurse",
        "GENERATE AN EMAIL FOR BEATRICE, THE PROJECT MANAGER OF AZURE"
    ];

    log('Semantic Context Detection', 'section');
    
    testCases.forEach((testText, index) => {
        try {
            const result = TrustScanner.scan(testText);
            const findings = result.findings;
            
            if (findings.length > 0) {
                log(`✓ Test ${index + 1}: "${testText}"`, 'pass');
                passCount++;
                
                findings.forEach((f, i) => {
                    log(`    ${i+1}. ${f.patternId}: "${f.rawMatch}" (${f.risk})`, 'info');
                });
            } else {
                log(`⚠ Test ${index + 1}: "${testText}" - No findings`, 'warn');
                failCount++;
            }
        } catch (e) {
            log(`✗ Test ${index + 1} Error: ${e.message}`, 'fail');
            failCount++;
        }
    });

    return { passCount, failCount };
}

// Main execution
async function main() {
    header();

    const args = process.argv.slice(2);
    const testType = args[0]?.toLowerCase() || 'all';

    let totalPass = 0;
    let totalFail = 0;

    try {
        // Try to load TrustScanner in Node.js environment
        // Note: This is a simulation; in real Node.js, you'd need proper module exports
        if (testType === 'debug' || testType === 'all') {
            const result = runDebugTests();
            totalPass += result.passCount;
            totalFail += result.failCount;
        }

        if (testType === 'fixes' || testType === 'all') {
            const result = runFixesTests();
            totalPass += result.passCount;
            totalFail += result.failCount;
        }

        if (testType === 'semantic' || testType === 'all') {
            const result = runSemanticTests();
            totalPass += result.passCount;
            totalFail += result.failCount;
        }

    } catch (error) {
        log(`Fatal error: ${error.message}`, 'fail');
        process.exit(1);
    }

    footer(totalPass, totalFail);
    process.exit(totalFail > 0 ? 1 : 0);
}

main();
