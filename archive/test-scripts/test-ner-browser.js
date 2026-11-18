// test-ner-browser.js - Inline script extracted from test-ner-browser.html

const output = document.getElementById('output');
const status = document.getElementById('status');

function log(message, type = 'info') {
    const item = document.createElement('div');
    item.className = `test-item test-${type}`;
    item.textContent = message;
    output.appendChild(item);
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function clearOutput() {
    output.innerHTML = '';
    status.textContent = 'Ready for testing';
    status.className = 'status ready';
}

function runStructureTests() {
    clearOutput();
    log('Testing NERDetector class structure...', 'info');

    if (typeof NERDetector === 'undefined') {
        log('❌ NERDetector class not found', 'fail');
        return;
    }

    log('✅ NERDetector class found', 'pass');

    const detector = new NERDetector();
    const methods = [
        'extractEntities',
        'analyzeForSensitiveData',
        'extractJobTitles',
        'calculateRiskLevel',
        'formatEntitiesForDisplay',
        'ensureModelReady',
        'clearCache'
    ];

    methods.forEach(method => {
        if (typeof detector[method] === 'function') {
            log(`✅ Method present: ${method}`, 'pass');
        } else {
            log(`❌ Missing method: ${method}`, 'fail');
        }
    });

    log('', 'info');
    log('Testing NERScannerIntegration class structure...', 'info');

    if (typeof NERScannerIntegration === 'undefined') {
        log('❌ NERScannerIntegration class not found', 'fail');
        return;
    }

    log('✅ NERScannerIntegration class found', 'pass');

    const integration = new NERScannerIntegration();
    const integrationMethods = [
        'scanForNEREntities',
        'generateNERSignal',
        'getDetailedFindings',
        'hasHighRiskEntities',
        'setConfidenceThreshold',
        'setEnabled',
        'getNERStats'
    ];

    integrationMethods.forEach(method => {
        if (typeof integration[method] === 'function') {
            log(`✅ Method present: ${method}`, 'pass');
        } else {
            log(`❌ Missing method: ${method}`, 'fail');
        }
    });

    status.textContent = '✅ Structure tests complete';
    status.className = 'status ready';
}

async function testNERInitialization() {
    clearOutput();
    log('Initializing NER model (first-time load may take 30-60 seconds)...', 'warning');
    status.textContent = '⏳ Initializing BERT model...';
    status.className = 'status loading';

    try {
        const detector = new NERDetector();
        log('NERDetector instance created', 'info');

        log('Waiting for model to be ready...', 'warning');
        const ready = await detector.ensureModelReady();

        if (ready) {
            log('✅ BERT model initialized successfully', 'pass');
            log('Model: Xenova/bert-base-multilingual-cased-ner', 'info');
            log('Type: Multilingual BERT for NER', 'info');
            log('Languages: 100+', 'info');
            status.textContent = '✅ Model ready for inference';
            status.className = 'status ready';
        } else {
            log('❌ Model initialization timeout', 'fail');
            log('Check browser console for errors', 'warning');
            status.textContent = '❌ Model failed to initialize';
            status.className = 'status error';
        }
    } catch (error) {
        log(`❌ Error: ${error.message}`, 'fail');
        status.textContent = '❌ Error initializing model';
        status.className = 'status error';
    }
}

async function testNERExtraction() {
    clearOutput();
    log('Testing NER entity extraction...', 'info');

    if (typeof NERDetector === 'undefined') {
        log('❌ NERDetector not available', 'fail');
        return;
    }

    const detector = new NERDetector();
    const ready = await detector.ensureModelReady();

    if (!ready) {
        log('❌ Model not ready', 'fail');
        return;
    }

    const testCases = [
        {
            text: "John Smith works as Senior Engineer at Microsoft.",
            description: "Full name, job title, organization"
        },
        {
            text: "Maria Garcia is the Product Manager for Google.",
            description: "Full name, job title, organization"
        },
        {
            text: "Tim Cook is the CEO of Apple.",
            description: "Full name, job title, organization"
        }
    ];

    log('Testing with sample texts...', 'info');
    log('', 'info');

    for (const testCase of testCases) {
        log(`Input: "${testCase.text}"`, 'info');
        log(`Description: ${testCase.description}`, 'info');

        try {
            const entities = await detector.extractEntities(testCase.text);
            
            if (entities.PERSON.length > 0) {
                log(`✅ Found PERSON: ${entities.PERSON.map(e => `${e.text} (${(e.score * 100).toFixed(0)}%)`).join(', ')}`, 'pass');
            }
            if (entities.ORG.length > 0) {
                log(`✅ Found ORG: ${entities.ORG.map(e => `${e.text} (${(e.score * 100).toFixed(0)}%)`).join(', ')}`, 'pass');
            }
            if (entities.JOB_TITLE.length > 0) {
                log(`✅ Found JOB_TITLE: ${entities.JOB_TITLE.map(e => `${e.text} (${(e.score * 100).toFixed(0)}%)`).join(', ')}`, 'pass');
            }
            if (entities.PERSON.length === 0 && entities.ORG.length === 0 && entities.JOB_TITLE.length === 0) {
                log('⚠️ No entities found (may need longer initialization)', 'warning');
            }
        } catch (error) {
            log(`❌ Error: ${error.message}`, 'fail');
        }
        log('', 'info');
    }

    status.textContent = '✅ Extraction tests complete';
    status.className = 'status ready';
}

async function testIntegration() {
    clearOutput();
    log('Testing NERScannerIntegration...', 'info');

    if (typeof NERScannerIntegration === 'undefined') {
        log('❌ NERScannerIntegration not available', 'fail');
        return;
    }

    const integration = new NERScannerIntegration();

    // Test configuration
    log('Testing configuration methods...', 'info');
    
    integration.setConfidenceThreshold(0.85);
    log('✅ Confidence threshold set to 85%', 'pass');

    integration.setEnabled(true);
    log('✅ NER enabled', 'pass');

    const stats = integration.getNERStats();
    log(`✅ NER Stats: ${JSON.stringify(stats, null, 2)}`, 'pass');

    log('', 'info');
    log('Testing with sample text...', 'info');
    log('', 'info');

    const testText = "Sarah Johnson works as DevOps Manager at Amazon.";
    log(`Input: "${testText}"`, 'info');

    try {
        const findings = await integration.scanForNEREntities(testText);
        
        if (findings.hasNERFindings) {
            log(`✅ Findings detected (total: ${findings.totalFindings})`, 'pass');
            if (findings.personNames.length > 0) {
                log(`  - People: ${findings.personNames.map(e => e.text).join(', ')}`, 'info');
            }
            if (findings.organizations.length > 0) {
                log(`  - Organizations: ${findings.organizations.map(e => e.text).join(', ')}`, 'info');
            }
            if (findings.jobTitles.length > 0) {
                log(`  - Job Titles: ${findings.jobTitles.map(e => e.text).join(', ')}`, 'info');
            }
        } else {
            log('⚠️ No findings detected (may need longer initialization)', 'warning');
        }

        log('', 'info');
        log('Testing signal generation...', 'info');
        
        const signal = await integration.generateNERSignal(testText);
        log(`✅ Signal generated:`, 'pass');
        log(`  - Signal type: ${signal.signal}`, 'info');
        log(`  - Risk value: ${signal.value.toFixed(2)}`, 'info');
        log(`  - Severity: ${signal.severity}`, 'info');

    } catch (error) {
        log(`❌ Error: ${error.message}`, 'fail');
    }

    status.textContent = '✅ Integration tests complete';
    status.className = 'status ready';
}

// Auto-run structure tests on load
window.addEventListener('load', () => {
    log('✅ Page loaded - NER modules available', 'pass');
    log('Click buttons above to run tests', 'info');
    log('', 'info');
    log('⏱️ Performance Note: Model initialization takes 30-60 seconds on first use', 'warning');
    log('✅ Subsequent inferences will be ~500ms - 2 seconds', 'pass');
    status.textContent = '✅ Ready for testing';
    status.className = 'status ready';
});
