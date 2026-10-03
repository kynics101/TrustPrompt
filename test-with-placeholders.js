// Test the updated regex with placeholder characters

const DS_PH_OPEN  = "\uE002";
const DS_PH_CLOSE = "\uE003";

// Updated regex
const phoneRegex = /(?<![a-zA-Z0-9])(?:\+63|0)[\s\-\uE002\uE003]?9[\s\-\uE002\uE003]?\d{2}[\s\-\uE002\uE003]?\d{4}[\s\-\uE002\uE003]?\d{3}(?![a-zA-Z0-9])/gi;

console.log('Testing regex with placeholder characters\n');

const testCases = [
  {
    input: '09098340056',
    desc: 'No separators'
  },
  {
    input: '0909 834 0056',
    desc: 'With spaces - needs simulation'
  },
  {
    input: `0909${DS_PH_OPEN}0${DS_PH_CLOSE}34${DS_PH_OPEN}1${DS_PH_CLOSE}0056`,
    desc: 'Simulated normalized: "0909 834 0056"'
  },
  {
    input: '+639098340056',
    desc: 'International, no separators'
  },
  {
    input: `+639${DS_PH_OPEN}0${DS_PH_CLOSE}9${DS_PH_OPEN}8${DS_PH_CLOSE}340${DS_PH_OPEN}0${DS_PH_CLOSE}56`,
    desc: 'Simulated normalized: "+63 9 09 8340 056"'
  },
];

testCases.forEach(test => {
  phoneRegex.lastIndex = 0;
  const matched = phoneRegex.test(test.input);
  const status = matched ? '✓' : '✗';
  console.log(`${status} "${test.input}"`);
  console.log(`   → ${test.desc}`);
  
  if (matched) {
    phoneRegex.lastIndex = 0;
    const m = test.input.match(phoneRegex);
    console.log(`   Matched: "${m[0]}"`);
  }
  console.log();
});

// More realistic simulation: how the normalizer actually protects the string
console.log('\n--- Realistic Simulation ---\n');

function simulateNormalization(input) {
  // The normalizer does: replace(\d)([ -])(\d), so "0 8" becomes protected
  // But we need to preserve what was protected
  let output = input;
  let idx = 0;
  
  // For each space or hyphen between digits, replace with placeholder
  output = output.replace(/(\d)([\s\-])(\d)/g, (match, d1, sep, d2) => {
    // Store the match, return placeholder with index
    const result = `${d1}${DS_PH_OPEN}${idx}${DS_PH_CLOSE}${d2}`;
    idx++;
    return result;
  });
  
  return output;
}

const simulated1 = simulateNormalization('0909 834 0056');
console.log(`Input:      "0909 834 0056"`);
console.log(`Normalized: "${simulated1}"`);
phoneRegex.lastIndex = 0;
console.log(`Match:      ${phoneRegex.test(simulated1)}`);

const simulated2 = simulateNormalization('+63 909 8340 056');
console.log(`\nInput:      "+63 909 8340 056"`);
console.log(`Normalized: "${simulated2}"`);
phoneRegex.lastIndex = 0;
console.log(`Match:      ${phoneRegex.test(simulated2)}`);
