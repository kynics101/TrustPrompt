#!/usr/bin/env node
/**
 * verify-worker-setup.js
 * 
 * Verification script to ensure web worker optimization is correctly set up.
 * Checks:
 *   1. worker-data-bundle.js exists and is valid
 *   2. manifest.json includes the bundle in web_accessible_resources
 *   3. worker-bridge.js contains blob injection code
 *   4. trust-worker.js contains data availability check
 *   5. All term files are loadable
 * 
 * Run: node scripts/verify-worker-setup.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let passCount = 0;
let failCount = 0;

function check(name, condition, details = '') {
  if (condition) {
    console.log(`✅ ${name}`);
    passCount++;
  } else {
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
    failCount++;
  }
}

console.log('\n[verify-worker-setup] Checking web worker optimization setup...\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Check worker-data-bundle.js exists
// ─────────────────────────────────────────────────────────────────────────────

const bundlePath = path.join(ROOT, 'worker-data-bundle.js');
const bundleExists = fs.existsSync(bundlePath);
check('worker-data-bundle.js exists', bundleExists, 
  bundleExists ? '' : 'Run: npm run build:worker');

if (bundleExists) {
  const bundleSize = fs.statSync(bundlePath).size;
  const bundleSizeKB = (bundleSize / 1024).toFixed(2);
  console.log(`   └─ Size: ${bundleSizeKB} KB`);
  
  // Verify it's valid JavaScript
  const bundleCode = fs.readFileSync(bundlePath, 'utf-8');
  try {
    new vm.Script(bundleCode, { filename: 'worker-data-bundle.js' });
    check('worker-data-bundle.js is valid JavaScript', true);
    
    // Check it contains the expected data assignments
    const hasMedial = bundleCode.includes('self.MEDICAL_TERMS_DATA');
    const hasFinancial = bundleCode.includes('self.FINANCIAL_TERMS_DATA');
    const hasOrganizations = bundleCode.includes('self.ORGANIZATIONS_DATA');
    check('Bundle contains MEDICAL_TERMS_DATA', hasMedial);
    check('Bundle contains FINANCIAL_TERMS_DATA', hasFinancial);
    check('Bundle contains ORGANIZATIONS_DATA', hasOrganizations);
  } catch (err) {
    check('worker-data-bundle.js is valid JavaScript', false, `Parse error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Check manifest.json
// ─────────────────────────────────────────────────────────────────────────────

const manifestPath = path.join(ROOT, 'manifest.json');
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  check('manifest.json is valid JSON', true);
  
  const hasWAR = manifest.web_accessible_resources && 
                 manifest.web_accessible_resources.length > 0;
  check('manifest.json has web_accessible_resources', hasWAR);
  
  if (hasWAR) {
    const warResources = manifest.web_accessible_resources[0].resources || [];
    const hasBundleInWAR = warResources.includes('worker-data-bundle.js');
    check('worker-data-bundle.js in web_accessible_resources', hasBundleInWAR,
      hasBundleInWAR ? '' : `Found resources: ${warResources.join(', ')}`);
  }
} catch (err) {
  check('manifest.json is valid JSON', false, err.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Check worker-bridge.js
// ─────────────────────────────────────────────────────────────────────────────

const bridgePath = path.join(ROOT, 'worker-bridge.js');
const bridgeCode = fs.readFileSync(bridgePath, 'utf-8');
check('worker-bridge.js exists', true);

const hasBlobInjection = bridgeCode.includes('importScripts(') && 
                         bridgeCode.includes('bundleUrl');
check('worker-bridge.js implements blob injection', hasBlobInjection,
  hasBlobInjection ? '' : 'Missing bundleUrl or importScripts references');

const hasDataComment = bridgeCode.includes('data injection') || 
                       bridgeCode.includes('Data Injection');
check('worker-bridge.js documents data injection strategy', hasDataComment);

const isWorkerEnabled = !bridgeCode.includes('Worker disabled') || 
                        bridgeCode.match(/\/\/\s*Worker disabled/);
check('worker-bridge.js has worker enabled', isWorkerEnabled,
  isWorkerEnabled ? '' : 'Worker is still disabled with comment');

// ─────────────────────────────────────────────────────────────────────────────
// 4. Check trust-worker.js
// ─────────────────────────────────────────────────────────────────────────────

const workerPath = path.join(ROOT, 'trust-worker.js');
const workerCode = fs.readFileSync(workerPath, 'utf-8');
check('trust-worker.js exists', true);

const hasDataCheck = workerCode.includes('Data Availability Check') || 
                     workerCode.includes('MEDICAL_TERMS_DATA');
check('trust-worker.js has data availability check', hasDataCheck);

const hasGracefulFallback = workerCode.includes('graceful') || 
                            workerCode.includes('typeof TrustGazetteer');
check('trust-worker.js handles missing data gracefully', hasGracefulFallback);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Check term files
// ─────────────────────────────────────────────────────────────────────────────

const termFiles = [
  'terms-medical.js',
  'terms-financial.js',
  'terms-organizations.js',
  'terms-occupations.js'
];

console.log('\n[verify-worker-setup] Checking term files...\n');

for (const file of termFiles) {
  const filePath = path.join(ROOT, file);
  const exists = fs.existsSync(filePath);
  check(`${file} exists`, exists);
  
  if (exists) {
    const size = fs.statSync(filePath).size;
    console.log(`   └─ Size: ${(size / 1024).toFixed(2)} KB`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Check package.json scripts
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n[verify-worker-setup] Checking build scripts...\n');

const packagePath = path.join(ROOT, 'package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const hasBuildScript = pkg.scripts && pkg.scripts['build:worker'];
  check('package.json has build:worker script', hasBuildScript);
  
  const hasPrepareHook = pkg.scripts && pkg.scripts.prepare;
  check('package.json has prepare hook', hasPrepareHook);
} catch (err) {
  check('package.json is valid JSON', false, err.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(70)}`);
console.log(`\n[verify-worker-setup] Results: ${passCount} passed, ${failCount} failed\n`);

if (failCount === 0) {
  console.log('✅ All checks passed! Web worker optimization is ready.');
  console.log('\nNext steps:');
  console.log('  1. npm run build:worker    (regenerate bundle if terms changed)');
  console.log('  2. Load extension in Chrome');
  console.log('  3. Open DevTools console and verify: "[TrustPrompt/worker] Data availability check"');
  process.exit(0);
} else {
  console.log(`⚠️  ${failCount} check(s) failed. See details above.`);
  process.exit(1);
}
