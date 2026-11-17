// Test the age_value contextFilter function
const fullText = "What's the average height and weight of a 25 year old Filipino male?";
const rawMatch = "25 year old";
const matchIndex = fullText.indexOf("25");

console.log("Testing age_value contextFilter:");
console.log("fullText:", fullText);
console.log("rawMatch:", rawMatch);
console.log("matchIndex:", matchIndex);

// Recreate the contextFilter from patterns.js
function contextFilter(rawMatch, fullText, matchIndex) {
  if (!fullText || typeof fullText !== "string") return true;
  
  const contextStart = Math.max(0, matchIndex - 150);
  const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 150);
  const context = fullText.substring(contextStart, contextEnd).toLowerCase();
  
  console.log("Context window:", context);
  
  const generalQuestionPatterns = [
    /\b(what\s+is|what\s+are|define|definition\s+of|explain|explained)\b/,
    /\b(refers?\s+to|is\s+defined\s+as|are\s+defined\s+as|means?\b)/,
    /\b(average|typical|general|demographic|statistics?|common|usually|normally|generally)\b/,
    /\b(for educational|for informational|for reference|as\s+a\s+guide)\b/,
    /\b(research|study|investigation|analysis|findings?|data|survey|reported|subjects?|participants?)\b/,
    /\b(examples?\s+of|such as|like|for instance|in general)\b/,
    /\b(age group|age range|age bracket|age category|ages?\s+\d+-\d+)\b/,
  ];
  
  const isGeneralContext = generalQuestionPatterns.some(p => p.test(context));
  console.log("isGeneralContext:", isGeneralContext);
  
  if (isGeneralContext) {
    console.log("[RESULT] SUPPRESS: General information, not personal disclosure");
    return false;
  }
  
  console.log("[RESULT] ALLOW: Likely personal age disclosure");
  return true;
}

const result = contextFilter(rawMatch, fullText, matchIndex);
console.log("\nFinal result (true=ALLOW, false=SUPPRESS):", result);
