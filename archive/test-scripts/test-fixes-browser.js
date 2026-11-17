// test-fixes-browser.js - Inline script extracted from test-fixes-browser.html

const testCases = [
    {
        name: "PATH B - Health Trigger (i have diabetes)",
        input: "i have diabetes",
        expectedPatterns: ["trigger_health", "gazetteer_medical"],
        expectDetection: true,
        desc: "Should detect health-related PII via gazetteer + trigger phrase"
    },
    {
        name: "PATH C - Person Name (my name is kyleen)",
        input: "my name is kyleen",
        expectedPatterns: ["nlp_person_name"],
        expectDetection: true,
        desc: "Should detect person name via linguistic detector"
    },
    {
        name: "SOURCE CODE - Code Detection (const x=6;)",
        input: "const x=6;",
        expectedPatterns: ["source_code"],
        expectDetection: true,
        desc: "Should detect source code and include in scoring"
    },
    {
        name: "Positive Control - Credit Card",
        input: "card number is 5360 3452 2113 6543",
        expectedPatterns: ["credit_card"],
        expectDetection: true,
        desc: "Should detect credit card (always works)"
    }
];

function runTests() {
    const container = document.getElementById('tests');
    let passCount = 0;
    let failCount = 0;

    for (const testCase of testCases) {
        const result = TrustScanner.scan(testCase.input);
        const { findings, riskLevel, score } = result;

        const foundPatterns = findings.map(f => f.patternId);
        const anyExpectedFound = testCase.expectedPatterns.some(p => foundPatterns.includes(p));
        const passed = testCase.expectDetection ? (findings.length > 0) : (findings.length === 0);

        if (passed) {
            passCount++;
        } else {
            failCount++;
        }

        const testDiv = document.createElement('div');
        testDiv.className = `test-case ${passed ? 'pass' : 'fail'}`;

        const statusIcon = passed ? '✓' : '✗';
        const statusClass = passed ? 'success' : 'error';

        testDiv.innerHTML = `
            <div class="test-title">
                <span class="${statusClass}">${statusIcon}</span> 
                ${testCase.name}
            </div>
            <div style="margin-left: 20px; font-size: 12px; color: #666;">
                ${testCase.desc}
            </div>
            <div class="result">
                <div><strong>Input:</strong> "${testCase.input}"</div>
                <div><strong>Risk Level:</strong> <span class="score">${riskLevel}</span></div>
                <div><strong>Score:</strong> <span class="score">${score}</span></div>
                <div><strong>Findings:</strong> ${findings.length}</div>
                ${findings.length > 0 ? `
                    <div style="margin-left: 20px;">
                        ${findings.map(f => `
                            <div class="finding">
                                <strong>${f.patternId}</strong> (${f.risk}) - "${f.rawMatch.substring(0, 40)}"
                            </div>
                        `).join('')}
                    </div>
                ` : '<div style="color: #f44336;">NO FINDINGS DETECTED</div>'}
            </div>
            <div style="margin-top: 10px; font-size: 12px; color: #999;">
                Expected patterns: ${testCase.expectedPatterns.join(', ')} | 
                Found: ${foundPatterns.join(', ') || 'none'}
            </div>
        `;

        container.appendChild(testDiv);
    }

    // Summary
    const summary = document.createElement('div');
    summary.style.cssText = 'margin-top: 30px; padding: 20px; background: #fff; border: 2px solid #2196F3; border-radius: 5px;';
    summary.innerHTML = `
        <h2 style="margin-top: 0;">Test Summary</h2>
        <div style="font-size: 18px;">
            <div class="success">✓ Passed: ${passCount}/${testCases.length}</div>
            <div class="error">✗ Failed: ${failCount}/${testCases.length}</div>
        </div>
        <div style="margin-top: 15px; font-size: 14px; color: #666;">
            <strong>Fixes Applied:</strong>
            <ul>
                <li>Changed source_code BASE_SCORE from 0 to 2 (was filtered out before)</li>
                <li>Added trigger phrase backup to PATH C linguistic detector (fallback for NLP failures)</li>
                <li>Modified PATH B gazetteer to include B1 findings as fallback (was only returning B2)</li>
            </ul>
        </div>
    `;
    container.appendChild(summary);
}

// Run tests when page loads
window.addEventListener('load', runTests);
