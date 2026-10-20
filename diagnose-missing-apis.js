// Diagnostic script to identify which API key formats are not being detected
// Comparing 16 common API providers

const testAPIs = [
  { name: "OpenAI", key: "sk-proj-FAKEKEYabc123FAKEKEYabc123", shouldMatch: true },
  { name: "Anthropic", key: "sk-ant-api03-FAKEFAKEFAKEFAKEFAKEa", shouldMatch: true },
  { name: "AWS Access", key: "AKIAIOSFODNN7EXAMPLE", shouldMatch: true },
  { name: "AWS Temp", key: "ASIAIOSFODNN7EXAMPLE", shouldMatch: true },
  { name: "GitHub", key: "ghp_FAKEabcdefghijklmnopqrstuvwxyz0123", shouldMatch: true },
  { name: "Slack", key: "xoxb-1234567890-FAKEFAKEFAKEtrk", shouldMatch: true },
  { name: "Google", key: "AIzaSyFAKE-abcdefghijklmnopqrstuvwxyz01", shouldMatch: true },
  { name: "Stripe", key: "sk_live_FAKE1234567890abcdefgh", shouldMatch: true },
  { name: "Twilio", key: "AC0123456789abcdef0123456789abcdef", shouldMatch: true },
  { name: "SendGrid", key: "SG.FAKE1234567890abcdefghij.abcdefghijklmnopqrstuvwxyz01234567", shouldMatch: true },
  { name: "Hugging Face", key: "hf_FAKEabcdefghijklmnopqrstuvwxyz1234", shouldMatch: true },
  { name: "NPM", key: "npm_FAKEabcdefghijklmnopqrstuvwxyz1234", shouldMatch: true },
  { name: "Azure", key: "AccountKey=FAKE1234567890abcdefghij1234567890abcdefghij1234567890abcd==", shouldMatch: true },
  { name: "Labelled (api_key=)", key: "api_key = sk-FAKEabcdefghijklmnopqrst", shouldMatch: true },
  { name: "Labelled (secret=)", key: "client_secret = ghp_FAKEabcdefghijklmnopqrstuvwxyz01", shouldMatch: true },
  { name: "Bearer Token", key: "Authorization: Bearer FAKETOKEN1234567890123456789012", shouldMatch: true },
];

// These patterns are extracted from patterns.js api_key regex
const apiKeyRegexString = /(?:(?:api[_\-\s]?key|access[_\-\s]?key|client[_\-\s]?secret|auth[_\-\s]?token|bearer)\s*[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{20,})["']?|(?:sk-(?:proj-)?[A-Za-z0-9_\-]{20,}|sk-ant-[A-Za-z0-9_\-]{20,}|sk_live_[A-Za-z0-9]{20,}|sk_test_[A-Za-z0-9]{20,}|pk_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|rk_test_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|ghu_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|xoxb-\d+[-A-Za-z0-9\-]+|xoxp-\d+[-A-Za-z0-9\-]+|xoxz-\d+[-A-Za-z0-9\-]+|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|AIza[A-Za-z0-9\-_]{35}|ya29\.[A-Za-z0-9\-_]{30,}|(?:AC|SK)[A-Za-z0-9a-f]{32}|SG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{30,}|hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{20,}|AccountKey=[A-Za-z0-9+\/=]{80,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{20,}))/g;

console.log("API Key Format Detection Diagnostic\n");
console.log("=".repeat(70));

let detected = 0;
let missed = 0;
const missedApis = [];

testAPIs.forEach((test, idx) => {
  const regex = new RegExp(apiKeyRegexString.source, "g");
  const matches = test.key.match(regex);
  const isDetected = matches && matches.length > 0;
  
  if (isDetected === test.shouldMatch) {
    console.log(`✅ ${(idx + 1).toString().padStart(2)}: ${test.name.padEnd(20)} - DETECTED`);
    detected++;
  } else {
    console.log(`❌ ${(idx + 1).toString().padStart(2)}: ${test.name.padEnd(20)} - MISSED`);
    missedApis.push(test.name);
    missed++;
  }
});

console.log("\n" + "=".repeat(70));
console.log(`Detection Rate: ${detected}/${testAPIs.length} (${((detected / testAPIs.length) * 100).toFixed(1)}%)\n`);

if (missed > 0) {
  console.log(`❌ Missing APIs (${missed}):`);
  missedApis.forEach(api => {
    console.log(`   - ${api}`);
  });
  console.log("\n⚠️  Need to enhance regex patterns for these formats");
} else {
  console.log("✅ All 16 API formats are being detected!");
}
