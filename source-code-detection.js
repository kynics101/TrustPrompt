// source-code-detection.js
// Detects source code snippets embedded in prompts
// Identifies: Python, JavaScript, SQL, Java, and other code blocks
// Does NOT modify scoring — only adds code detection findings

const SourceCodeDetector = (() => {
  
  // ── CODE SYNTAX PATTERNS ──────────────────────────────────────────────
  // Language-specific regex patterns for detecting code blocks
  
  const codePatterns = {
    // Python function definitions
    python_function: /def\s+\w+\s*\([^)]*\)\s*:/g,
    // Python imports
    python_import: /^(import|from)\s+[\w.]+/gm,
    // Python specific keywords in context
    python_keywords: /\b(import|from|def|class|return|if|else|elif|for|while|try|except|finally|with|as|lambda|yield|assert|raise|pass|break|continue)\b/g,
    
    // JavaScript/TypeScript function/var declarations
    js_var_const: /\b(const|let|var)\s+\w+\s*=/g,
    // JavaScript function syntax
    js_function: /\b(function|async\s+function|\w+\s*:\s*function|\w+\s*:\s*async\s+\(|\(\w*\)\s*=>\s*\{?)/g,
    // JavaScript specific syntax
    js_syntax: /\{.*:\s*(true|false|\d+|['"][^'"]*['"]|function)/g,
    
    // SQL patterns
    sql_select: /SELECT\s+.*\s+FROM\s+\w+/gi,
    sql_insert: /INSERT\s+INTO\s+\w+\s*\(/gi,
    sql_update: /UPDATE\s+\w+\s+SET\s+/gi,
    sql_delete: /DELETE\s+FROM\s+\w+/gi,
    sql_where: /WHERE\s+\w+\s*=\s*['"]?[^'"\s]+['"]?/gi,
    
    // Java/C# method calls and syntax
    java_method: /\w+\.(put|get|execute|send|call|post|request)\s*\(/g,
    java_class: /\b(class|public|private|protected|static|final)\s+\w+/g,
    
    // Generic code indicators
    code_braces: /\{[^{}]*[:=][^{}]*\}/g,
    code_brackets: /\[[^\]]*\]/g,
    code_parens_with_symbols: /\([^)]*[=:><&|]+[^)]*\)/g,
  };

  // ── LANGUAGE DETECTION CONTEXT ────────────────────────────────────────
  
  const languageIndicators = {
    python: {
      keywords: ['def ', 'import ', 'from ', 'class ', 'return ', 'if ', 'else:', 'for ', 'while ', 'try:', 'except', 'finally:', 'with ', 'lambda', 'yield'],
      syntax: ['():', '= [', 'smtplib', 'smtp.', 'server.', 'msg = ', 'def '],
      confidence: 0.8,
    },
    javascript: {
      keywords: ['const ', 'let ', 'var ', 'function ', '=> ', 'async ', 'await', 'return ', 'if (', '} else {', 'for (', 'while ('],
      syntax: ['{}', '()', ';', '==', '===', '!==', '{', '}'],
      confidence: 0.7,
    },
    sql: {
      keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'GROUP BY', 'ORDER BY'],
      syntax: ['WHERE', '=', 'AND', 'OR', 'INSERT INTO', 'VALUES'],
      confidence: 0.85,
    },
    java: {
      keywords: ['public ', 'private ', 'class ', 'static ', 'void ', 'new ', 'throw'],
      syntax: ['{}', '.', '()', ';', '='],
      confidence: 0.7,
    },
  };

  // ── CODE BLOCK EXTRACTION ─────────────────────────────────────────────
  
  function extractCodeBlocks(text) {
    const blocks = [];
    
    // Match markdown code blocks ```language ... ```
    const markdownCodeRegex = /```([\w]*)\n?([\s\S]*?)```/g;
    let match;
    while ((match = markdownCodeRegex.exec(text)) !== null) {
      blocks.push({
        language: match[1] || 'unknown',
        code: match[2],
        isMarkdown: true,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    
    // Match backtick code: `code here`
    const backtickCodeRegex = /`([^`\n]*(?:[=:{}\(\)[\];])[^`\n]*)`/g;
    while ((match = backtickCodeRegex.exec(text)) !== null) {
      blocks.push({
        language: 'inline',
        code: match[1],
        isMarkdown: false,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    
    return blocks;
  }

  // ── LANGUAGE DETECTION ────────────────────────────────────────────────
  
  function detectLanguage(codeSnippet) {
    const detections = {};
    let maxScore = 0;
    let detectedLanguage = 'unknown';

    for (const [lang, indicators] of Object.entries(languageIndicators)) {
      let score = 0;

      // Check keywords
      for (const keyword of indicators.keywords) {
        if (codeSnippet.toLowerCase().includes(keyword.toLowerCase())) {
          score += 2;
        }
      }

      // Check syntax
      for (const syntax of indicators.syntax) {
        if (codeSnippet.includes(syntax)) {
          score += 1;
        }
      }

      detections[lang] = score;
      if (score > maxScore) {
        maxScore = score;
        detectedLanguage = lang;
      }
    }

    return { language: detectedLanguage, score: maxScore, detections };
  }

  // ── CODE PATTERN MATCHING ─────────────────────────────────────────────
  
  function findCodePatterns(text, language) {
    const patterns = [];
    
    if (language === 'python') {
      // Check for Python-specific patterns
      if (codePatterns.python_function.test(text)) patterns.push('function_def');
      if (codePatterns.python_import.test(text)) patterns.push('import');
      if (text.includes('def ') && text.includes('return')) patterns.push('function_with_return');
    } else if (language === 'javascript') {
      // Check for JS-specific patterns
      if (codePatterns.js_var_const.test(text)) patterns.push('var_declaration');
      if (codePatterns.js_function.test(text)) patterns.push('function_declaration');
      if (/\{\w+\s*:\s*\w+/.test(text)) patterns.push('object_literal');
    } else if (language === 'sql') {
      // Check for SQL patterns
      if (/SELECT\s+\*/i.test(text)) patterns.push('select_all');
      if (/WHERE\s+\w+\s*=\s*/i.test(text)) patterns.push('where_clause');
      if (/INSERT\s+INTO/i.test(text)) patterns.push('insert_statement');
    } else if (language === 'java') {
      // Check for Java patterns
      if (/\.\w+\s*\(/.test(text)) patterns.push('method_call');
      if (/class\s+\w+/.test(text)) patterns.push('class_declaration');
    }
    
    return patterns;
  }

  // ── MAIN DETECTION FUNCTION ───────────────────────────────────────────
  
  function detectSourceCode(text) {
    const findings = [];
    
    // Extract code blocks (markdown and inline)
    const codeBlocks = extractCodeBlocks(text);
    
    for (const block of codeBlocks) {
      const { language: detectedLang, score, detections } = detectLanguage(block.code);
      
      if (score >= 2) {  // Confidence threshold
        const patterns = findCodePatterns(block.code, detectedLang);
        
        findings.push({
          patternId: 'SOURCE_CODE',
          label: `${detectedLang.toUpperCase()} Code`,
          risk: 'source_code',
          category: 'source_code',
          language: detectedLang,
          rawMatch: block.code.substring(0, 100),
          fullCode: block.code,
          patterns: patterns,
          confidence: score,
          detectionScores: detections,
          startIndex: block.startIndex,
          endIndex: block.endIndex,
          isMarkdown: block.isMarkdown,
        });
      }
    }
    
    // Also detect inline code patterns not in markdown
    // This handles natural-language prompts with code-like structures
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip lines that are already part of extracted code blocks
      let skipLine = false;
      for (const block of codeBlocks) {
        if (block.startIndex <= line && line <= block.endIndex) {
          skipLine = true;
          break;
        }
      }
      if (skipLine) continue;
      
      // Check for inline code patterns
      if (line.includes('{') && line.includes(':') && line.includes('}')) {
        // Looks like object literal or code
        const { language: detectedLang, score } = detectLanguage(line);
        if (score >= 2) {
          findings.push({
            patternId: 'SOURCE_CODE_INLINE',
            label: `Inline ${detectedLang.toUpperCase()} Code`,
            risk: 'source_code',
            category: 'source_code',
            language: detectedLang,
            rawMatch: line,
            confidence: score,
            lineNumber: i + 1,
          });
        }
      }
    }
    
    return findings;
  }

  return {
    detectSourceCode,
    extractCodeBlocks,
    detectLanguage,
    findCodePatterns,
  };
})();

// Export for use in main detection pipeline
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SourceCodeDetector;
}
