/**
 * download-bert-model.js - Download BERT model for offline use
 * 
 * This script downloads the BERT-NER model and caches it locally
 * so TrustPrompt NEVER downloads data from the internet
 * 
 * Run: node scripts/download-bert-model.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Model files to download
const BERT_MODEL_ID = 'Xenova/bert-base-multilingual-cased-ner';
const CACHE_DIR = path.join(__dirname, '../lib/models');

// Create cache directory
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`✓ Created cache directory: ${CACHE_DIR}`);
}

/**
 * Download a file from URL
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 404) {
        reject(new Error(`File not found: ${url}`));
        return;
      }
      
      const len = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = Math.round((downloaded / len) * 100);
        process.stdout.write(`\r  Downloaded: ${percent}%`);
      });

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\n  ✓ Download complete');
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

/**
 * Download BERT model files
 */
async function downloadBertModel() {
  console.log('\n📥 Downloading BERT-NER model for offline use...');
  console.log(`   Model: ${BERT_MODEL_ID}`);
  console.log(`   Cache: ${CACHE_DIR}\n`);

  try {
    // Model files from Hugging Face
    const files = [
      {
        name: 'config.json',
        url: `https://huggingface.co/${BERT_MODEL_ID}/resolve/main/config.json`
      },
      {
        name: 'tokenizer.json',
        url: `https://huggingface.co/${BERT_MODEL_ID}/resolve/main/tokenizer.json`
      },
      {
        name: 'tokenizer_config.json',
        url: `https://huggingface.co/${BERT_MODEL_ID}/resolve/main/tokenizer_config.json`
      },
      {
        name: 'model.onnx',
        url: `https://huggingface.co/${BERT_MODEL_ID}/resolve/main/onnx/model.onnx`
      },
      {
        name: 'model_quantized.onnx',
        url: `https://huggingface.co/${BERT_MODEL_ID}/resolve/main/onnx/model_quantized.onnx`
      }
    ];

    for (const file of files) {
      const outputPath = path.join(CACHE_DIR, file.name);
      
      // Check if already exists
      if (fs.existsSync(outputPath)) {
        console.log(`  ⊘ Already cached: ${file.name}`);
        continue;
      }

      console.log(`  ⬇ Downloading: ${file.name}`);
      await downloadFile(file.url, outputPath);
    }

    console.log('\n✅ All model files cached locally!');
    console.log(`   Path: ${CACHE_DIR}`);
    console.log('\n   TrustPrompt will now work 100% offline.');
    console.log('   No PII data will ever leave your machine.\n');

  } catch (error) {
    console.error('\n❌ Download failed:', error.message);
    console.error('\n⚠️  TrustPrompt will attempt to download on first use.');
    process.exit(1);
  }
}

// Run
downloadBertModel();
