# API Key Detection & Redaction Guide

## What Gets Detected?

### High-Risk API Keys (All Redacted)
API keys and secret tokens are classified as **HIGH RISK** because they provide direct authentication and can be used to:
- Make unauthorized API calls on your behalf
- Access private data
- Incur charges to your account
- Compromise connected systems

### Coverage Matrix

| Provider | Format | Example | Detected | Redacted |
|----------|--------|---------|----------|----------|
| **OpenAI** | sk- or sk-proj- | `sk-proj-abc123...` | ✅ Yes | [REDACTED-KEY] |
| **Anthropic** | sk-ant- | `sk-ant-api03-FAKE...` | ✅ Yes | [REDACTED-KEY] |
| **AWS** | AKIA or ASIA | `AKIAIOSFODNN7EXA...` | ✅ Yes | [REDACTED-KEY] |
| **GitHub** | ghp_, gho_, ghu_, github_pat_ | `ghp_FAKEabcdef...` | ✅ Yes | [REDACTED-KEY] |
| **Slack** | xoxb-, xoxp-, xoxz- | `xoxb-1234567890-FAKE...` | ✅ Yes | [REDACTED-KEY] |
| **Google** | AIza or ya29. | `AIzaSyFAKE...` | ✅ Yes | [REDACTED-KEY] |
| **Stripe** | sk_live_, sk_test_, rk_live_, rk_test_ | `sk_live_FAKE1234...` | ✅ Yes | [REDACTED-KEY] |
| **Twilio** | AC or SK prefix | `AC0123456789abcdef...` | ✅ Yes | [REDACTED-KEY] |
| **SendGrid** | SG.*.* | `SG.FAKE1234...abc123...` | ✅ Yes | [REDACTED-KEY] |
| **Hugging Face** | hf_ | `hf_FAKEabcdef...` | ✅ Yes | [REDACTED-KEY] |
| **NPM** | npm_ | `npm_FAKEabcdef...` | ✅ Yes | [REDACTED-KEY] |
| **Azure** | AccountKey= | `AccountKey=FAKE1234...==` | ✅ Yes | [REDACTED-KEY] |
| **Private Keys** | BEGIN RSA/EC/OPENSSH PRIVATE KEY | `-----BEGIN RSA PRIVATE KEY-----` | ✅ Yes | [REDACTED-KEY] |
| **JWT** | eyJ*.eyJ*.* | `eyJhbGciOi...` | ✅ Yes | [REDACTED-JWT] |
| **Labelled** | api_key=, client_secret=, etc. | `api_key = sk-FAKE...` | ✅ Yes | api_key = [REDACTED-KEY] |

---

## How Detection Works

### Step 1: Regex Pattern Matching
The pattern matches both:
1. **Labelled formats**: `api_key = value` (with minimum 20-char values)
2. **Vendor prefixes**: `sk-`, `AKIA`, `ghp_`, etc. (structurally distinctive)

### Step 2: Entropy Filtering
- Minimum 3.5 bits/character required
- Filters out dummy values like:
  - All same characters: `0000000000`, `xxxxxxxxxx`
  - Sequential patterns: `1111111111`
  - Documentation examples: "EXAMPLE" suffixes

### Step 3: Structural Validation
For vendor prefixes, validates:
- Correct length for the prefix
- Known vendor format patterns
- Enables HIGH-risk escalation in governance rules

### Step 4: Redaction
Sensitive values are replaced with `[REDACTED-KEY]` while:
- Preserving label context: `api_key = [REDACTED-KEY]`
- Preserving JWT label: `[REDACTED-JWT]`

---

## Examples: Before & After

### Example 1: OpenAI API Key
**Before**:
```
I'm using OpenAI's API with key sk-proj-abc123FAKEKEYabc123FAKEKEY in my config
```

**After**:
```
I'm using OpenAI's API with key [REDACTED-KEY] in my config
```

### Example 2: AWS Access Key
**Before**:
```
AWS_ACCESS_KEY_ID = AKIAIOSFODNN7EXAMPLE
```

**After**:
```
AWS_ACCESS_KEY_ID = [REDACTED-KEY]
```

### Example 3: Private Key
**Before**:
```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890...
-----END RSA PRIVATE KEY-----
```

**After**:
```
-----BEGIN RSA PRIVATE KEY-----
[REDACTED-KEY]
-----END RSA PRIVATE KEY-----
```

### Example 4: Labelled Secret
**Before**:
```
client_secret: "ghp_FAKEabcdefghijklmnopqrstuvwxyz0123"
```

**After**:
```
client_secret: [REDACTED-KEY]
```

---

## Why This Matters

### Risk Scenarios

1. **Accidental Exposure in Chat**
   - User: "I can't connect, here's my error: `sk-proj-mytoken123456789`"
   - **Impact**: Token is transmitted to AI provider, stored in logs, potentially used for training
   - **Protection**: Token is detected and redacted before sending

2. **Debug Output Pasted**
   - User copies-pastes environment file with `STRIPE_SECRET_KEY=sk_live_abc123...`
   - **Impact**: Real production credentials exposed
   - **Protection**: Pattern detected, value redacted, user warned

3. **Git Commit History**
   - User accidentally commits `.env` file with `GITHUB_TOKEN=ghp_abc123...`
   - **Impact**: Anyone viewing repo history can extract credentials
   - **Protection**: TrustPrompt warns before user shares this in prompts

4. **Documentation Copy-Paste**
   - Developer copies example from docs, includes real key by mistake
   - **Impact**: Example key still authenticates against real accounts
   - **Protection**: Entropy filtering catches structured-but-real credentials

---

## Customization & Edge Cases

### What About Test Keys?
- ✅ **Test keys are ALSO redacted** (they still leak account information)
- Example: `sk_test_*` from Stripe is flagged same as `sk_live_*`
- Reasoning: Test keys identify your account/environment

### What If My Key Format Is Different?
- The pattern catches vendor-official formats
- Custom formats with unusual separators may not match
- Fallback: Use labelled format with `api_key = your_custom_format_key`
- Minimum 20 characters required for labelled detection

### False Positives Prevention
- Entropy requirement (3.5 bits/char) filters:
  - Documentation examples ("EXAMPLE" suffixes)
  - Placeholder patterns ("FAKE", "TEST", "xxx")
  - Educational material
- **Real keys are rarely uniform or repetitive**

---

## For Developers

### Adding New Vendor Support
Edit `VENDOR_PREFIXES` array in `patterns.js`:

```javascript
const VENDOR_PREFIXES = Object.freeze([
  // Existing patterns...
  /^my-new-vendor-[A-Za-z0-9]{20,}/,  // New provider
]);
```

### Testing Detection
Use `test-api-key-detection.js`:

```bash
node test-api-key-detection.js
```

Expected output: 93.10% success rate on 29 vendor tests

### Integration with Scanner
The pattern integrates with TrustPrompt's:
- Risk scoring (HIGH risk classification)
- Governance rules (escalation to HIGH for vendor-prefixed keys)
- Redaction pipeline (automatic sanitization)
- Logging (detection logged, value never shown)

---

## Questions?

For issues or improvements:
1. Check existing patterns in `patterns.js`
2. Run test suite: `node test-api-key-detection.js`
3. Add test case for new vendor format
4. Submit enhancement request with test coverage
