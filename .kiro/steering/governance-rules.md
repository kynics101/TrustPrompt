---
inclusion: auto
name: governance-rules
description: Use when implementing, modifying, debugging, reviewing, or testing TrustPrompt's privacy-disclosure risk scoring, preliminary classification, governance rules, or final risk mapping.
---

# TrustPrompt Governance and Risk Scoring

## Source of truth

The approved Capstone Manuscript, Chapter 3, "Risk Scoring and Data Masking Implementation" (Tables 10–18; pp. 128–140 in the current manuscript), is the primary source for scoring and governance decisions.

- Preserve the manuscript's terminology, scoring units, values, thresholds, rule conditions, and decision order.
- Do not silently introduce or change entity categories, weights, multipliers, thresholds, governance rules, or system responses.
- If implementation, older notes, or tests conflict with the current manuscript, identify the conflict and request/record an explicit decision. Do not silently merge versions.
- Exact operational values are researcher-defined parameters informed by NIST SP 800-122 and RA 10173; do not describe them as values prescribed by those sources.

## Engine position and input

Risk assessment runs after the Hybrid Detection Engine has validated, consolidated, reliability-filtered, and deduplicated findings.

The engine uses the consolidated findings to:
1. Assign base scores to distinct scoring units.
2. Apply the Distinct Entity-Type Multiplier.
3. Determine the preliminary classification.
4. Apply governance rules in the specified order.
5. Map the final classification to the user-facing response.

Context indicators are not scored. They are considered only by the Sensitive-Context Co-occurrence Rule.

## 1. Base entity scores — Manuscript Table 10

| Impact tier | Base score | Entity types |
|---|---:|---|
| High (Critical) | 10 | API keys, JWT tokens, credit/debit card numbers, the nine supported Philippine government-ID types (PhilID, UMID, Philippine Passport, PRC, Postal, PWD, Digital National Senior Citizen ID, SSS, PhilHealth) |
| Moderate (Significant) | 5 | Date of birth, email addresses, Philippine physical addresses, Philippine phone numbers |
| Low (Limited) | 2 | Personal names; personal attributes (age, blood type, eye color, height, sex, weight); department; job titles/roles; organizational name; religion; MAC address; IP address; source code |

Assign scores only to supported, validated findings. Do not assign an independent score to context indicators.

## 2. Scoring-unit grouping — Manuscript Table 11

Closely related fields are grouped to prevent score inflation. Detection remains field-specific, but each scoring unit contributes its base score only once per prompt.

| Scoring unit | Included fields | Base score | Counting rule |
|---|---|---:|---|
| Contact Information | Email address and/or phone number | 5 | Count once if either or both are detected. |
| Organizational Affiliation | Organizational name, job title/role, and department | 2 | Count once if one or more are detected. |
| Personal Attributes | Age, height, weight, eye color, blood type, and sex | 2 | Count once if one or more are detected. |

Every entity type not listed in Table 11 remains a separate scoring unit. Do not count grouped fields individually in the score, even though each detected field may still be displayed and explained separately.

Examples:
- Email + phone = one Contact Information unit, score 5.
- Organization + job title + department = one Organizational Affiliation unit, score 2.
- Age + height = one Personal Attributes unit, score 2.
- Personal name + email = two units: Personal Name (2) + Contact Information (5).
- The two personal-name detectors (`trigger_person_name` and `nlp_person_name`) are one Personal Name unit (base 2). When both find the same name, the prompt still counts 2, not 4. Both findings remain in the detection list for display.

### Scoring-eligibility gates (first-person attribution)

Table 11 groups fields into scoring units, but a unit contributes its base score only when at least one of its findings passes the eligibility gate below. A finding that fails its gate is still detected, shown, explained, and masked. It adds no base score, adds no scoring unit, does not raise the multiplier, and does not count as a scored entity for Rule 3.

| Field(s) | Eligible for scoring when |
|---|---|
| Job title/role (`nlp_job_title`) | The sentence has a first-person self-attribution ("I am/I'm a, an, or the [title]", "I work as", "my role is", "as the [title] of ...", or a self-introduction such as "I'm Maria Santos, a nurse" or "My name is Maria Santos, a nurse"), or the title is the value of a labeled record field (Position, Job title, Role, Designation, Occupation). |
| Organization name (`nlp_organization`) | The sentence ties the name to the writer ("my company X", "I work at X", "I am a member of X"), or the name is the value of a labeled record field (Company, Employer, Organization, Workplace, Agency, Affiliation). |
| Personal Attributes: age, height, weight, eye color, blood type, sex | One of the three conditions in the personal-attribute gate below. |

A labeled record needs at least two "Label: value" fields and must not be a hiring or vacancy notice.

#### Personal-attribute gate

A personal-attribute finding is eligible when one of these holds in the sentence that contains the value:

1. **First-person lead.** "I'm", "I am", "I was", "I will be", "I turned" or "I am turning", "I weigh", "I stand", or "I measure" precedes the value, with at most 6 words between the lead and the end of the value. "I have", "I've got", and "I had" also count, but only for eye color and blood type.
2. **First-person possessive.** "my age", "my height", "my weight", "my blood type" or "my blood group", "my eye color", "my eyes", "my sex", or "my gender" precedes the value, with the same 6-word limit.
3. **Labeled record field.** The value follows a label (Age, Sex, Gender, Height, Weight, Blood type, Eye color) in a record as defined above.

In conditions 1 and 2, a third-person word between the lead and the value makes the finding ineligible. The words are: my, his, her, hers, their, our, your, he, she, they, we, you, the, this, that, these, those, its, it, who, whom, whose, which.

| Prompt | Scored? |
|---|---|
| "I'm 25 years old." | Yes. One Personal Attributes unit (2), Low. |
| "My height is 170 cm." | Yes. |
| "Height: 170 cm. Weight: 70 kg." | Yes. One Personal Attributes unit (2), Low. |
| "My son is 12 years old." | No. Detected and shown, not scored. No Detected Risk. |
| "The patient is 45 years old." | No. |
| "I have a 25 year old son." | No. "I have" does not attribute an age. |
| "Maria is 25 years old." | No for the age. A name used in place of "I" is not attributed. |
| "Age: 25" as the only labeled field | No. A record needs at least two labeled fields. |

The gate does not change Rule 2. Personal attributes are not Rule 2 personal-entity triggers.

**Status.** The job-title and organization gates were already implemented. The personal-attribute gate was added on 2026-11-18 by the same approach. Manuscript Table 11 does not state attribution gates, so the manuscript owner needs to confirm all three. Do not extend a gate to another field without that decision.

**Implementation.** `isScorable` in `scanner.js` and `isScorableFinding` in `trust-worker.js` call `isAttributedPersonalAttribute`. Both copies must stay identical. Call sites must pass the raw prompt text, because a missing text makes every gate return false. Existing parity gaps that this gate did not change: `trust-worker.js` gives a base score to `age_value` only among the six attributes, defines no `personal_attribute` or `religion` unit group, and has no job-title gate. The Jest shim in `tests/setup/trustprompt-env.js` calls `computeRiskScore(findings)` without the raw text, so the gates evaluate false there.
## 3. Non-scoring context indicators — Manuscript Table 12

The gazetteer identifies these context categories:

- Nationality: e.g., Filipino, Chinese, Australian.
- Financial: e.g., salary, loan, payment, debt.
- Medical: e.g., diagnosis, treatment, medication.

Context indicators have a base score of 0. Their presence alone does not establish disclosure of personal information and must not increase the numeric score or the number of scoring units. They may participate in Rule 2 only.

## 4. Distinct Entity-Type Multiplier — Manuscript Table 13

Count the number of distinct scoring units present, not the number of raw findings, fields, or matches.

| Distinct scoring units | Multiplier |
|---:|---:|
| 1 | ×1.00 |
| 2 | ×1.20 |
| 3 | ×1.40 |
| 4 | ×1.70 |
| 5 or more | ×2.00 |

The multiplier reflects the breadth of privacy-relevant information in the prompt. It is capped at ×2.00.

### Formula

`Pre-governance Risk Score = (Sum of base scores of distinct scoring units) × Distinct Entity-Type Multiplier`

Implementation requirements:
- Sum each scoring unit's base score once.
- Determine the multiplier from the count of distinct scoring units.
- Do not count context indicators as scoring units.
- Do not count multiple detections within one grouped unit more than once.
- Keep field-level detections available for explanation and masking; scoring aggregation must not erase them.

## 5. Preliminary classification — Manuscript Table 14

| Pre-governance score | Preliminary classification |
|---:|---|
| 0 | No Detected Risk |
| 2–4.99 | Low |
| 5–14.99 | Moderate |
| 15 or higher | High |

A score of 0 maps to No Detected Risk when no supported validated entity contributes a score. This label does not mean the prompt is guaranteed safe: TrustPrompt only screens its supported detection categories and may not identify unlisted sensitive information or standalone context details.

The thresholds and multiplier values are researcher-defined operational parameters subject to validation.

## 6. Governance rules

Governance rules are evaluated after preliminary classification. They address conditions where the numeric score alone may understate or overstate disclosure severity.

## Supported Philippine Government ID detection scope

The following are the **only Philippine government-ID types currently in scope for detection**. Do not add or assume support for TIN, GSIS, Pag-IBIG, NBI Clearance, Police Clearance, PSA Certificate, Barangay Clearance, COMELEC Voter's ID, Driver's License, or any other ID type unless the project specification is formally revised.

| ID type | Supplied format specification |
|---|---|
| Philippine National ID (PhilID) | 12 digits, grouped as `xxxx-xxxx-xxxx` |
| UMID | 12 digits, grouped as `xxxx-xxxxxxx-x` |
| Philippine Passport | 8–9 alphanumeric characters: 1–2 prefix letters followed by 7 digits; no dashes |
| PRC ID | 7 numeric digits |
| Postal ID | Described as 14 alphanumeric characters; supplied layout: `Letterxxxxxxx-xxxx-Letter` |
| PWD ID | `RR-PPMM-BBB-NNNNNNN` |
| Digital National Senior Citizen ID | 10 numeric digits |
| SSS ID/number | 10 digits, grouped as `xx-xxxxxxx-x` |
| PhilHealth ID/number | 12 digits, grouped as `xx-xxxxxxxxx-x` |

**Format details requiring confirmation before final validator implementation:**
- The supplied Postal ID layout `Letterxxxxxxx-xxxx-Letter` contains 13 character positions when counted literally, while the description states 14 alphanumeric characters. Do not silently change either specification; confirm the intended format.
- The character classes represented by `R`, `P`, `M`, `B`, and `N` in the PWD format have not been defined. Preserve the supplied template, but do not infer whether each position must be numeric or alphabetic until confirmed.
- Confirm whether prefix letters for the passport must be uppercase, or whether matching should be case-insensitive. Do not assume a rule not stated here.

Detection must apply the stated structure for each ID type. A format match alone must not be described as independently validated unless the detection/validation specification defines and implements an additional validation check. Do not claim checksum or registry validation for these IDs unless explicitly implemented.

### Rule 1 — Strongly Validated Critical-Entity Rule

**Condition**

At least one strongly validated critical/access-critical entity is detected:

- API key;
- JWT token;
- credit/debit card number; or
- One of the nine supported Philippine government-ID types listed in the **Supported Philippine Government ID detection scope** section.

A candidate must satisfy the applicable pattern and validation checks to be considered strongly validated. For card numbers, the applicable checksum validation is required. Format-only candidates do not qualify.

**Effect**

Escalate directly to **High** regardless of the preliminary classification.

**Rationale**

A critical entity has a base score of 10, which by itself falls in the Moderate preliminary range. This rule ensures strongly validated critical/access-critical disclosures receive High classification.

### Rule 2 — Sensitive-Context Co-occurrence Rule

**Condition**

A supported nationality, medical, or financial context indicator is present together with either:

1. At least one valid personal entity in the same prompt, such as a personal name, email address, phone number, Philippine physical address, date of birth, credit/debit card number, or one of the nine supported Philippine government-ID types listed in the detection-scope section; **or**
2. An explicit first-person self-attribution anchor and a context indicator in the same sentence. For medical indicators, the anchor must pass the Medical Anchor Rule codebook entry below. Financial indicators cannot use this path.

The self-attribution anchor is a trigger only. It is not a scored entity and does not change the numeric base score. A bare pronoun such as “I” is not sufficient by itself.

Other scored entity types may contribute to the numeric score but are not Rule 2 personal-entity triggers unless included in the manuscript-defined trigger set.

**Contextual exclusion filter**

Before escalation, apply the deterministic contextual exclusion filter to the sentence containing the relevant identifier/context reference. The filter may suppress Rule 2 escalation for non-disclosure references such as:

- Research/academic: researching, studying, investigating, thesis, assignment.
- Educational/informational: what is, explain, define, how does, causes of, symptoms of.
- General discussion: commonly affects, refers to, is defined as, examples of.
- Hypothetical: imagine if, suppose that, for example, hypothetically.

The filter is conservative:
- An exclusion phrase may suppress only the Rule 2 escalation; it must not remove findings or alter the numeric score.
- A clear personal disclosure or attribution overrides an exclusion phrase. Examples include “I have [condition],” “I was diagnosed with [condition],” “my diagnosis is [condition],” “I take [medication],” and “[person] was diagnosed with [condition].” Medical anchors are limited to the Medical Anchor Rule codebook entry. Financial phrases such as “my salary is [amount]” are not anchors and do not override an exclusion phrase.
- Absence of an exclusion phrase does not prove that the context belongs to the identified person.
- Co-occurrence is an observable condition, not semantic confirmation that the context belongs to the detected person.

**Effect**

Raise the preliminary classification by exactly one level, at most once per prompt, capped at High:

`No Detected Risk → Low → Moderate → High`

If the filter suppresses escalation, continue to the next governance rule without changing the findings or score.

#### Medical Anchor Rule (codebook entry — approved in chat on 2026-11-18; pending manuscript amendment)

Status: approved for the steering file. It is not yet in Manuscript Chapter 3, and the veto-over-attribution change needs a manuscript amendment. It applies to medical context indicators only. Evaluate the steps in order. The first failed step means the anchor does not fire.

**Preprocessing.** Expand contractions (I'm → I am, I've → I have, I'd → I had). Split sentences on terminal punctuation, using an abbreviation list (Dr., approx., etc.) to avoid false splits.

1. **Term eligibility.** The term comes from the condition or medication gazetteer, not general symptoms. It appears in the same sentence as the anchor. Pronouns do not resolve to earlier terms.
2. **Closed anchor list.** The speaker is the subject. Allowed forms:
   - I have / I had / I've had
   - I am / I was diagnosed with; I've been diagnosed with; I got diagnosed with
   - I am [condition adjective], where the adjective is a condition term in the gazetteer (for example, diabetic)
   - I take / I am taking / I am on [medication]
   - I'm living with [condition]
   - my diagnosis is / my condition is [condition]
3. **Vetoes.** These cannot be overridden by the attribution precedence in the exclusion filter.
   - The anchor is inside quotation marks.
   - The anchor is negated (not, never, no, don't, doesn't, didn't, isn't, aren't, can't).
   - The clause is interrogative: it ends with "?" or starts with a wh-word or auxiliary (do, does, did, can, could, should, am, is, are).
   - The anchor is the complement of an embedding verb (think, wonder, ask, know, guess).
   - A hypothetical marker precedes the anchor in the clause: if, what if, suppose, imagine, pretend.
   - An uncertainty marker precedes the anchor in the clause: not sure, unsure, whether, not certain.
   - The subject is a third party, or a shared subject that includes a third party ("my mother and I").
4. **Adjacency.** The term follows the anchor directly. Only these tokens may appear between them: a, an, type, 1, 2, stage, chronic, severe, mild, had, been. A duration phrase after the term (for example, "for years") does not affect this step.
5. **Noun-compound check.** The term is not followed by a role or event noun: class, exam, seminar, researcher, nurse, educator, awareness, research, study, program, support group. A hyphenated compound counts as one token.

**Effect.** If the anchor fires, raise the preliminary classification by one level, at most once per prompt, with no score added. Exclusion phrases from the research and educational list cannot suppress it, because Step 3 covers those cases. Record which step fired or vetoed the anchor, so the reason is available to the UI.

#### Financial indicators (approved; same-sentence scope)

- Financial context indicators (salary, loan, payment, debt) never use an anchor.
- A financial indicator escalates only through Rule 2 condition 1: a valid personal entity in the same prompt. "Validated identifier" means the personal identifiers in that condition: personal name, email address, phone number, Philippine physical address, date of birth, credit/debit card number, and the nine supported Philippine government-ID types. Each must pass its existing detection and validation.
- The contextual exclusion filter still applies to financial terms.
- Financial terms and amounts add no score.
- Same sentence: the personal entity must be in the same sentence as the financial term. This is approved in chat and is stricter than the manuscript's "same prompt" wording, so it is pending manuscript amendment.
- Medical and nationality co-occurrence use the same sentence scope (approved in chat, 2026-11-18). The document-level fallback that let a name in one sentence escalate a medical term in another is removed.
- If `context-attribution.js` fails to load, Rule 2 does not escalate and an error is logged (fail closed).
- Context terms are reported only when they share a sentence with a Rule 2 identifier, or when the term's own personal-context check marks it risky. A medical, financial, or nationality term that is "safe" by itself and has no identifier in its sentence is dropped, as before. Without this, a term like "diabetes" in "Maria Santos has diabetes." was never reported, so Rule 2 could not see it. Scores are unchanged because context terms carry no base score.

### Rule 3 — Low-Impact Entity Cap

**Condition**

All scored entities belong to Low-impact scoring units (base score 2), and no Moderate- or High-impact scoring unit is present.

**Effect**

Cap the final classification at **Moderate**. This cap applies even if the multiplied pre-governance score is 15 or higher.

Do not use raw entity-tier labels or the number of fields as a substitute for checking the base score of every scored finding/scoring unit. Grouped fields must follow the scoring-unit rules above.

### No governance rule

If Rules 1–3 do not apply, retain the preliminary classification as the final classification.

## 7. Governance decision order — Manuscript Table 17

Evaluate rules as a deterministic, ordered decision sequence. The first applicable rule determines the result:

| Order | Rule | Result |
|---:|---|---|
| 1 | Strongly Validated Critical-Entity Rule | Set final classification to High. |
| 2 | Sensitive-Context Co-occurrence Rule | Raise preliminary classification by one level, capped at High. |
| 3 | Low-Impact Entity Cap | Cap classification at Moderate. |
| 4 | No rule applies | Retain preliminary classification. |

Implement this as a cascading decision sequence (`if / else-if` or equivalent), not as independent adjustments that can accidentally stack. In particular, Rule 2 is applied at most once per prompt. Do not allow the Low-Impact Cap to override Rule 1 or a Rule 2 escalation: the established order gives higher-priority rules precedence.

## 8. Final classification and system response — Manuscript Table 18

| Final classification | Required response |
|---|---|
| No Detected Risk | No risk notification is required; prompt may proceed. |
| Low | Allow submission; optional passive notice. |
| Moderate | Notify the user and show detected entity types and a disclosure-risk explanation. |
| High | Show a warning and recommend a masked version. The user may proceed with the original prompt or copy/use the masked version. |

TrustPrompt preserves user autonomy. It does not block submission or enforce masking. If the user chooses to proceed, the original prompt may be submitted unmodified.

## 9. Explainability and implementation constraints

- Preserve the distinction between field-level detection and scoring-unit aggregation.
- Keep context indicators separate from scored entities.
- Record the pre-governance score, number of distinct scoring units, multiplier, preliminary classification, governance rule applied, and final classification so the result can be traced and explained.
- Make the reason for any escalation or cap available to the UI.
- Run governance only on the consolidated, validated findings from the detection pipeline.
- Ensure context-only prompts can still be evaluated for Rule 2 when an explicit self-attribution anchor and a supported context indicator are present; do not short-circuit solely because the numeric score is 0.
- Keep the contextual exclusion and attribution pattern lists deterministic and validate them against the project test dataset.
- Do not infer semantic ownership, identity relationships, or truth from co-occurrence.
- Do not add context bonuses, entity-correlation bonuses, likelihood estimates, predictive logic, or additional risk factors unless the approved manuscript is revised.
- Do not change detection reliability thresholds or validation behavior from this governance file; those belong to the detection/validation specification.

## 10. Validation cases that must remain consistent

Use these as minimum scoring/governance sanity checks; expand the test suite from the approved test dataset.

| Scenario | Calculation / governance | Expected final result |
|---|---|---|
| Personal name only | 2 × 1.00 = 2.00 | Low |
| Email only | 5 × 1.00 = 5.00 | Moderate |
| Personal name + email | (2 + 5) × 1.20 = 8.40 | Moderate |
| Email + phone | One Contact Information unit: 5 × 1.00 | Moderate |
| Organization + job title + department | One Organizational Affiliation unit: 2 × 1.00 | Low |
| Validated critical entity only | 10 × 1.00 = 10.00; Rule 1 | High |
| Five distinct Low-impact units | 10 × 2.00 = 20.00; Rule 3 | Moderate |
| Financial/medical/nationality context only | No scored unit; no Rule 2 trigger | No Detected Risk |
| “I was diagnosed with diabetes” | Score 0; anchor + medical context; Rule 2 | Low |
| Personal name + medical context, with clear personal attribution | Numeric score remains based on scored unit(s); Rule 2 raises one level | One level above preliminary |
| Academic/informational/hypothetical reference with no attribution override | Rule 2 escalation suppressed; score/findings unchanged | Preliminary classification retained |
| "I'm 25 years old." (personal-attribute gate) | One Personal Attributes unit: 2 x 1.00 = 2.00 | Low |
| "My son is 12 years old." (personal-attribute gate) | Age detected but not self-attributed; 0 scored units | No Detected Risk |

If code or test results disagree with these rules, identify the exact mismatch and determine whether the implementation or the approved manuscript needs revision. Do not alter expected outcomes ad hoc.