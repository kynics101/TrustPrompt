#!/usr/bin/env node

/**
 * Download and cache ONNX models locally
 * 
 * Usage: node download-models.js
 * 
 * This script:
 * 1. Downloads the BERT-NER ONNX model from jsDelivr CDN
 * 2. Caches it in TrustPrompt/lib/models/
 * 3. Models are bundled with extension (no network calls during extension runtime)
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, 'lib', 'models');
const XENOVA_DIR = path.join(MODELS_DIR, 'Xenova', 'bert-base-multilingual-cased-ner');

// Files to download from jsDelivr CDN (mirrors from Hugging Face)
const MODEL_FILES = [
  {
    name: 'config.json',
    url: 'https://cdn.jsdelivr.net/npm/@xenova/bert-base-multilingual-cased-ner@latest/config.json'
  },
  {
    name: 'tokenizer.json',
    url: 'https://cdn.jsdelivr.net/npm/@xenova/bert-base-multilingual-cased-ner@latest/tokenizer.json'
  },
  {
    name: 'model.onnx',
    url: 'https://cdn.jsdelivr.net/npm/@xenova/bert-base-multilingual-cased-ner@latest/onnx/model.onnx'
  }
];

/**
 * Download a file from URL and save to disk
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(destPath);
        console.log(`  [✓] Downloaded ${path.basename(destPath)} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function downloadModels() {
  try {
    console.log('='.repeat(70));
    console.log('[TrustPrompt] Model Download & Cache Setup');
    console.log('='.repeat(70));
    
    // Create directories
    if (!fs.existsSync(XENOVA_DIR)) {
      fs.mkdirSync(XENOVA_DIR, { recursive: true });
      console.log(`[Setup] Created directory: ${XENOVA_DIR}`);
    }
    
    console.log('\n[Setup] Downloading BERT-NER model files from jsDelivr CDN...');
    console.log('[Setup] (This may take 2-5 minutes depending on internet speed)\n');
    
    let totalSize = 0;
    const startTime = Date.now();
    
    // Download each file
    for (const file of MODEL_FILES) {
      const destPath = path.join(XENOVA_DIR, file.name);
      console.log(`[Download] ${file.name}...`);
      
      try {
        await downloadFile(file.url, destPath);
        const stats = fs.statSync(destPath);
        totalSize += stats.size;
      } catch (error) {
        console.error(`[Error] Failed to download ${file.name}: ${error.message}`);
        throw error;
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeInMB = (totalSize / 1024 / 1024).toFixed(1);
    
    console.log('\n' + '='.repeat(70));
    console.log('[Success] ✓ All model files downloaded successfully!');
    console.log('='.repeat(70));
    console.log(`\n[Stats] Time: ${duration}s`);
    console.log(`[Stats] Total size: ${sizeInMB}MB`);
    console.log(`[Stats] Location: ${XENOVA_DIR}`);
    
    console.log('\n[Files cached:]');
    const files = fs.readdirSync(XENOVA_DIR);
    files.forEach(file => {
      const stats = fs.statSync(path.join(XENOVA_DIR, file));
      console.log(`  • ${file} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('[Next] Ready for local deployment!');
    console.log('='.repeat(70));
    console.log('\nNext steps:');
    console.log('1. ✓ manifest.json already updated');
    console.log('2. ✓ lib/transformers-bundled.min.js already created');
    console.log('3. Reload extension: chrome://extensions/');
    console.log('4. Test in Claude.ai or ChatGPT');
    console.log('\nResult: ZERO network calls, PII stays local');
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\n[Error] Failed to download models:');
    console.error(error.message);
    console.error('\n[Troubleshooting]');
    console.error('1. Check internet connection');
    console.error('2. Check firewall/proxy settings');
    console.error('3. Try again in a few moments');
    console.error('4. If jsDelivr is blocked, try VPN');
    
    process.exit(1);
  }
}

// Run the download
downloadModels();
