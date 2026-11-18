#!/usr/bin/env node

// Mock browser globals
global.window = global;
global.globalThis = global;
global.document = {};

// Mock Chrome API
global.chrome = {
  runtime: {
    getURL: () => ''
  },
  storage: {
    local: {}
  }
};

try {
  require('./linguistic-detector.js');
  
  const detector = global.TrustLinguisticDetector || global.window.TrustLinguisticDetector;
  if (detector && typeof detector.scan === 'function') {
    console.log('[TEST] ✓ Detector loaded and exported successfully');
    console.log('[TEST] ✓ TrustLinguisticDetector.scan is available');
    process.exit(0);
  } else {
    console.error('[TEST] ✗ Detector not properly exported');
    process.exit(1);
  }
} catch (error) {
  console.error('[TEST] ✗ Load error:', error.message);
  process.exit(1);
}
