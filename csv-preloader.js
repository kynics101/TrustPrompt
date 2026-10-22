/**
 * csv-preloader.js
 * 
 * Synchronously preloads CSV files and stores them as global data
 * for immediate access by gazetteer.js
 * 
 * This must be loaded BEFORE gazetteer.js in manifest.json content_scripts
 */

(function() {
  // Create global namespace for CSV data
  if (typeof window !== 'undefined') {
    window.CSVDataCache = {
      medical: '',
      financial: '',
      loaded: false,
      loadPromise: null
    };
  } else if (typeof globalThis !== 'undefined') {
    globalThis.CSVDataCache = {
      medical: '',
      financial: '',
      loaded: false,
      loadPromise: null
    };
  }

  // Function to load CSV file
  async function loadCSVFile(filename) {
    try {
      // Try chrome.runtime.getURL first
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const url = chrome.runtime.getURL('csv/' + filename);
        const response = await fetch(url);
        if (response.ok) {
          const text = await response.text();
          console.log('[CSVPreloader] Loaded ' + filename + ' via extension URL');
          return text;
        }
      }

      // Fallback to direct fetch
      const paths = ['csv/' + filename, '/csv/' + filename];
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            console.log('[CSVPreloader] Loaded ' + filename + ' via fetch');
            return await response.text();
          }
        } catch (e) {
          // Continue
        }
      }
    } catch (e) {
      console.warn('[CSVPreloader] Failed to load ' + filename + ':', e.message);
    }
    return '';
  }

  // Preload both CSV files immediately
  const csvCache = typeof window !== 'undefined' ? window.CSVDataCache : globalThis.CSVDataCache;
  
  csvCache.loadPromise = Promise.all([
    loadCSVFile('medical_terms.csv').then(data => {
      csvCache.medical = data;
      console.log('[CSVPreloader] Medical terms cached: ' + data.split('\n').length + ' lines');
    }),
    loadCSVFile('financial_terms.csv').then(data => {
      csvCache.financial = data;
      console.log('[CSVPreloader] Financial terms cached: ' + data.split('\n').length + ' lines');
    })
  ]).then(() => {
    csvCache.loaded = true;
    console.log('[CSVPreloader] All CSV files preloaded');
  }).catch(err => {
    console.warn('[CSVPreloader] Error during preload:', err);
    csvCache.loaded = false;
  });
})();
