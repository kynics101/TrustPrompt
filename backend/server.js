/**
 * TrustPrompt Transformer Backend
 * 
 * Provides NER (Named Entity Recognition) API endpoint
 * for the browser extension via HTTP requests
 * 
 * Endpoints:
 *   POST /api/ner - Perform NER on text
 *   GET /health - Health check
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize transformers pipeline
let nerPipeline = null;

/**
 * Initialize the NER model on startup
 */
async function initializeModel() {
  try {
    console.log('[Backend] Initializing BERT-NER model...');
    
    // Import transformers from npm package
    const { pipeline } = await import('@huggingface/transformers');
    
    // Load the BERT-NER model
    nerPipeline = await pipeline(
      'token-classification',
      'Xenova/bert-base-multilingual-cased-ner'
    );
    
    console.log('[Backend] ✓ BERT-NER model loaded successfully');
  } catch (error) {
    console.error('[Backend] Failed to initialize model:', error.message);
    console.log('[Backend] Will use Hugging Face Inference API instead');
  }
}

/**
 * Call Hugging Face Inference API (fallback if local model fails)
 */
async function callHuggingFaceAPI(text) {
  const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
  
  if (!HF_API_KEY) {
    throw new Error('HUGGINGFACE_API_KEY not set in .env file');
  }
  
  const response = await fetch(
    'https://api-inference.huggingface.co/models/Xenova/bert-base-multilingual-cased-ner',
    {
      headers: { Authorization: `Bearer ${HF_API_KEY}` },
      method: 'POST',
      body: JSON.stringify({ inputs: text }),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Hugging Face API error: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Perform NER on text
 * Returns entities with type and confidence
 */
app.post('/api/ner', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid text parameter' });
    }
    
    console.log(`[Backend] NER request: ${text.substring(0, 100)}...`);
    
    let entities;
    
    // Try local model first
    if (nerPipeline) {
      try {
        console.log('[Backend] Using local BERT-NER model');
        entities = await nerPipeline(text);
      } catch (localError) {
        console.warn('[Backend] Local model failed, falling back to API:', localError.message);
        entities = await callHuggingFaceAPI(text);
      }
    } else {
      // Use Hugging Face API
      console.log('[Backend] Using Hugging Face Inference API');
      entities = await callHuggingFaceAPI(text);
    }
    
    console.log(`[Backend] Found ${entities.length} entities`);
    
    res.json({
      success: true,
      entities: entities,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Backend] NER error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    modelLoaded: nerPipeline !== null,
    timestamp: new Date().toISOString()
  });
});

/**
 * Start the server
 */
async function start() {
  await initializeModel();
  
  app.listen(PORT, () => {
    console.log(`[Backend] Server running on http://localhost:${PORT}`);
    console.log(`[Backend] POST /api/ner - Perform NER`);
    console.log(`[Backend] GET /health - Health check`);
  });
}

start().catch(err => {
  console.error('[Backend] Failed to start:', err);
  process.exit(1);
});
