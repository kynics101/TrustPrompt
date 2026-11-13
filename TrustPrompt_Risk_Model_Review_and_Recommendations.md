# TrustPrompt Risk Scoring Model: Review and Recommendations

Review of `TrustPrompt_Improved_Risk_Scoring_Model.md` (proposed revision of the manuscript's Tables 10-17).

Status: proposed for team review. None of the recommendations below is implemented. The code in `scanner.js` and `trust-worker.js` still uses the original logic (per-`patternId` counting, first-match governance, any scored entity qualifies for the context rule). All scenario results are computed by hand from the formulas, not from test runs.

---

## 1. Summary

The revision fixes the main problems of the first model: related-field overcounting, prompt-wide context escalation, ambiguous rule precedence, and overstated source-code sensitivity. Four weaknesses remain, and two of them are introduced by the revision itself (the age-attribute grouping and the weak context-entity definition). The 15-point High threshold does not need to change.

Priority order of fixes:

1. Move health attributes (blood type) out of the Low age-attribute group.
2. Tighten the context rule: define qualifying entities, widen the proximity match, split context into two classes.
3. Treat business addresses as part of Organizational Affiliation.
4. Add a provisional record-set (bulk disclosure) rule.
5. Define "strong validation" per critical entity type.
6. Smaller items (rule-order pseudocode, badge wording, conversation limit, placeholder names).

---

## 2. What the revision fixes

| Earlier weakness | How the revision handles it |
|---|---|
| Name, org, job title, department counted as separate types | One Organizational Affiliation unit |
| Email and phone counted separately | One Contact Information unit |
| Context term anywhere in the prompt escalated risk | Same-sentence co-occurrence required |
| Context rule could bypass the Low-Impact Cap | Context rule and cap now apply in sequence |
| Source code scored as Moderate in some documents | Source code stays Low; embedded credentials scored separately |
| Volume threshold invented without data | Not added until tested |
| Critical entities cannot reach 15 numerically | Critical-entity rule applied first |

---

## 3. Remaining loopholes and mitigations

### 3.1 Grouping creates an undercount for health-like attributes

Example: "Juan Dela Cruz, 45, male, blood type O+, 80kg".
Computation: (Name 2 + Age attributes 2) x 1.20 = 4.80 -> Low -> allowed with no notice.
An identifiable health profile passes silently. The original model scored this at Moderate.

Mitigation:
- Move blood type, and any similar health attribute, out of the "Personal age attributes" group and into the health context indicators.
- Name + blood type then triggers the context rule: Low -> Moderate.

### 3.2 The context rule is loose in some places and too tight in others

Problems:
- **Undefined entity set.** "A valid scored personal entity" is not defined. If organization, IP, MAC address, or source code qualify:
  - "What is the average salary of a software engineer at Google?" is escalated (org + "salary").
  - `processPayment(user)` in a code block is escalated (source code + "payment").
- **Sentence boundaries miss structured text.** "Patient: Juan Dela Cruz" and "Diagnosis: hypertension" on separate lines are different sentences, so the clearest medical-record leak is not escalated. Forms, bullet lists, and CSV rows have the same problem.
- **Financial words can reach High.** "Email the loan form to juan@x.com": Contact 5 -> Moderate, context rule -> High. A red warning with masking is too strong.

Mitigation:
1. Qualifying entities for the context rule: name, contact, physical address, date of birth, age attributes, government ID, card number. Exclude organizational affiliation, IP, MAC, and source code.
2. Proximity: context term and entity are in the same sentence, or the same line or list item, or within about 120 characters (value to calibrate).
3. Two context classes:
   - Sensitive (health, ethnicity, religion): raise one tier, up to High.
   - Financial: raise one tier, up to Moderate only.
4. Ignore context terms inside code blocks and identifiers.
5. Exclude language-task phrases ("translate to Tagalog", "in Bisaya") for ethnicity terms.
6. Prune generic gazetteer terms (for example "payment", "tax", "treatment" with no other cue) or require a second cue.

Note: RA 10173 section 3(l) lists health, ethnic origin, religion, age, and government-issued IDs as sensitive personal information. Financial data is not listed in the same way. Verify against the Act text before citing it, and describe the model as informed by it, not compliant with it.

### 3.3 Business address inflates a common prompt to High

Example: email signature with name, title and company, phone and email, plus an office address.
Computation: (2 + 2 + 5 + 5) x 1.70 = 23.80 -> High.
This is a business address, not a home address.

Mitigation:
- If the address sits in the same block as the organization or job title and has no residential cue ("I live at", "my address", "residing at", "home address"), merge it into the Organizational Affiliation unit.
- The signature then scores (2 + 2 + 5) x 1.40 = 12.60 -> Moderate.
- A home address stays a separate Moderate unit.
- Validate whether the address detector can supply this cue. If not, treat this as a known limitation.

### 3.4 Bulk disclosure is the largest remaining gap

A pasted customer table of 100 rows (name, email, phone) scores (2 + 5) x 1.20 = 8.40 -> Moderate. This is the most realistic serious leak for an enterprise user.

The revision is right not to pick a number without evidence. Provisional rule, to be calibrated:
- Record set: at least 5 delimited rows (CSV, table, list) where each row has 2 or more scoring units, or at least 10 distinct normalized values of one Moderate unit.
- Effect: raise the level by one tier, capped at High.
- Test thresholds of 5, 10, and 20 against signatures, CC lists, directories, and customer records, as the revision already plans.
- A 5-address CC list stays Moderate.

### 3.5 "Strong validation" is not defined

- Luhn passes for roughly 1 in 10 random 16-digit numbers. Test cards such as 4111 1111 1111 1111 also pass.
- Most Philippine government IDs have no public checksum.
- Documentation example keys (for example `AKIAIOSFODNN7EXAMPLE`) look like real credentials.
- Each false critical hit produces an unjustified High, because the override ignores the score.

Mitigation:
- Cards: Luhn + issuer prefix + length + denylist of known test numbers.
- Government IDs: list which are "strong" by checksum, and which require a nearby label ("SSS:", "TIN:") plus format.
- Credentials: known prefix or entropy check + denylist of documentation examples.
- Optional: a label-present but validation-failed ID becomes a Moderate "possible ID" unit instead of being dropped. Decide fail-open or fail-closed explicitly.

### 3.6 Name false positives can inflate the unit count

An NLP-only name (for example "Python Developer") adds a Low unit and can move k up by one.

Mitigation (optional, test first):
- Count a unit toward k only if it has at least one High-reliability detection, or two independent Moderate-reliability detections.
- Check the side effect: name + email + DOB with an NLP-only name falls from 16.80 (High) to 14.40 (Moderate), because the name still adds 2 points but k drops from 3 to 2: (2 + 5 + 5) x 1.20 = 14.40.

### 3.7 Smaller items

- **Rule order.** The governance table reads as first-match and the sequence text reads as composed. The current code is first-match. Write the order as pseudocode (section 4).
- **Badge wording.** "No Detected Risk" with a green badge reads as "safe". Unsupported types (TIN, Pag-IBIG, bank account numbers, passwords, private keys) show as green. Use "No supported sensitive data detected" with a neutral color.
- **Conversation scope.** The model scores one prompt at a time. Details split across messages (name, then email, then phone) are not combined. List it as a limitation. A session accumulator could be future work.
- **Placeholders and public names.** Filter placeholder names (John Doe, Juan Dela Cruz), example domains, and fictional or public-figure names before scoring.
- **Coverage.** Check that every `patternId` from `patterns.js` has an entry in the scoring tables, including TIN, Pag-IBIG, NBI, Police Clearance, PSA Certificate, and Barangay Clearance. Keep one shared scoring module for `scanner.js` and `trust-worker.js` to avoid drift.

---

## 4. Suggested governance order (pseudocode)

```
if criticalEntityStronglyValidated:
    return High

level = preliminaryLevel(score)

if contextMatch(sensitive) and qualifyingPersonalUnit:
    level = min(level + 1, High)
elif contextMatch(financial) and qualifyingPersonalUnit:
    level = max(level, min(level + 1, Moderate))

if recordSetDetected:               # provisional, calibrate
    level = min(level + 1, High)

if allScoringUnitsLowImpact:
    level = min(level, Moderate)

return level
```

The governance engine should log which rule changed the level, the pre-governance score, and the matched context term and entity.

---

## 5. Realistic scenario results

| Prompt | Improved model as written | With refinements |
|---|---|---|
| Signature: name, title, company, phone, email, office address | High (23.80) | Moderate (12.60) |
| "Ship to Juan Dela Cruz, 123 Rizal St, QC, 0917..." (home address) | High (16.80) | High (16.80) |
| Average salary of a software engineer at Google | Low -> Moderate if org qualifies | Low |
| `processPayment(user)` in a code block | Low -> Moderate if code qualifies | Low |
| "Email the loan form to juan@x.com" | High | Moderate |
| "Patient: Juan Dela Cruz" / "Diagnosis: hypertension" on separate lines | Low | Moderate |
| Juan, 45, male, blood type O+, 80kg | Low (4.80) | Moderate |
| 100-row customer table (name, email, phone) | Moderate (8.40) | High |
| Test card 4111 1111 1111 1111 | High | No supported data detected |
| Name + email + "I have diabetes" (same sentence) | High | High |
| "My name is Carlo and I have diabetes" | Moderate | Moderate |
| "What is diabetes?" | No Detected Risk | No supported data detected |

---

## 6. Threshold review

Recommendation: keep Low 2-4.99, Moderate 5-14.99, High 15+.

With the revised groups, every non-critical score the model can produce is one of:
2, 4.80, 5, 8.40, 12.00, 12.60, 13.60, 16.80, 18.70, 20.00, 21.00, 23.80 and higher.

(Computed from m Moderate units and l Low units: sum = 5m + 2l, k = m + l, multipliers 1.00 / 1.20 / 1.40 / 1.70 / 2.00.)

No score falls between 13.60 and 16.80. Any High cutoff in that range gives identical results, so the value 15 is not what decides outcomes. The sensitive points are elsewhere:

| Sensitive point | Effect | Action |
|---|---|---|
| Step from 3 to 4 units | Contact + Name + Org (12.60, Moderate) plus one more Low unit becomes 18.70 (High) | Review in the validation set; main over-warning risk |
| Two Moderate units alone | Address + Contact = 12.00 (Moderate). A cutoff at 12 would make home address + phone High | Keep 15 unless reviewers label these High |
| Multiplier values | k = 4 at 1.70 vs 1.40 changes the result for any set with one Moderate and three Low units | Rerun the scenario set with each multiplier moved by +/-0.1 and list the prompts that change level |
| Wide Moderate band (5 to 14.99) | A lone email and a near-High combination show the same orange panel | Show the score and detected unit types in the panel |

Validation plan (extends the revision's section 8):
1. Build 40-60 prompts across: clean, code, résumé and cover-letter edits, signatures, shipping details, customer tables, HR and medical questions, credentials in code, quoted or hypothetical examples.
2. Have 2-3 reviewers label each prompt Allow / Notify / Warn before seeing system output.
3. Report agreement (Cohen's kappa) between reviewers and between reviewers and the system, plus the false-warn rate on benign prompts.
4. Tune only the parameters the data shows to be sensitive (multiplier steps, record-set threshold, context proximity window).

---

## 7. Implementation notes

- The detector output needs a character offset (start and end) for each finding, plus a reliability level. Same-sentence, same-line, and window matching depend on offsets. Confirm what `scanner.js` currently provides.
- Replace per-`patternId` counting with a `UNIT_OF[patternId]` map (Contact, Age attributes, Organizational affiliation, and so on), then dedupe by unit.
- Add a `QUALIFYING_FOR_CONTEXT` set and two context classes (`SENSITIVE_CONTEXT_IDS`, `FINANCIAL_CONTEXT_IDS`).
- Rewrite `evaluateGovernance` / `finalClass` to the composed order in section 4. The current version returns at the first matching rule.
- Update `risk-scoring.md`, `governance-rules.md`, and Table 17 examples together so no older rule remains.

---

## 8. Limitations to state in the manuscript

- The model estimates disclosure severity from supported patterns. It does not estimate provider misuse, training use, or breach probability.
- Co-occurrence of a context term and an entity is a text-location condition, not proof that the term describes the person.
- A name may refer to the user, a third party, a public figure, or a fictional person.
- Business versus home address classification depends on text cues.
- Source-code structure does not show that code is confidential.
- Scores, multipliers, thresholds, and the proximity window are researcher-defined parameters, not values prescribed by NIST SP 800-122 or RA 10173.
- Details split across several prompts are not combined.
- "No supported sensitive data detected" does not mean the prompt is safe.
