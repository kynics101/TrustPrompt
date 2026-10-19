/**
 * Download compromise.js and save locally
 * 
 * This ensures compromise.js is bundled with the extension
 * (no CDN dependency, completely local/offline)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const COMPROMISE_URL = 'https://cdn.jsdelivr.net/npm/compromise@14.12.0/builds/compromise.js';
const OUTPUT_PATH = path.join(__dirname, 'lib', 'compromise.min.js');

console.log('[Setup] Downloading compromise.js...');
console.log('[Setup] URL:', COMPROMISE_URL);
console.log('[Setup] Output:', OUTPUT_PATH);

https.get(COMPROMISE_URL, (response) => {
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
  }

  const file = fs.createWriteStream(OUTPUT_PATH);
  response.pipe(file);

  file.on('finish', () => {
    file.close();
    const stats = fs.statSync(OUTPUT_PATH);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log('[Setup] ✓ compromise.js downloaded successfully');
    console.log('[Setup] File size:', sizeMB, 'MB');
    console.log('[Setup] Saved to:', OUTPUT_PATH);
    console.log('\nNext: Add lib/compromise.min.js to manifest.json content_scripts');
  });

  file.on('error', (err) => {
    fs.unlink(OUTPUT_PATH, () => {});
    throw err;
  });

}).on('error', (err) => {
  throw err;
});
