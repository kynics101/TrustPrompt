TRUSTPROMPT 

# **Improved Privacy Disclosure Risk Scoring Model** 

A focused revision of the manuscript's original model 

**Recommended direction: Keep the original 2 / 5 / 10 base scores, 15-point numerical High threshold, diversity multiplier, and strongly validated critical-entity override. Make only limited changes to aggregation and governance so the model is easier to explain, implement, and test.** 

### **Document purpose** 

This document proposes a simplified and improved version of the TrustPrompt Privacy Disclosure Risk Assessment Model. It compares the current manuscript's first version with the later Proposal v2 and recommends a conservative revision that addresses identified loopholes without adding unnecessary scoring layers or broad aggregation. 

**Status: Proposed for team review.** The recommendations in this document are not automatically part of the approved methodology. The team must confirm that each rule is consistent with the implemented detection engine and validate the revised scenarios before adopting it in the manuscript. 

TrustPrompt Capstone Project 

October 31, 2026 

TrustPrompt | Improved Risk Scoring Model 

Page 1 

## **1. Recommended Model at a Glance** 

The first manuscript version uses entity base scores, a multiplier based on the number of distinct entity types, and governance rules to determine the final disclosure-severity level. Its main weakness is not that the arithmetic is inherently invalid. The concern is that several closely related detections can contribute separately, while prompt-wide context matching can escalate a prompt even when the context term is unrelated to the personal information. 

The recommended revision preserves most of the existing model. It groups only a few closely related fields, retains separate scoring for information that represents a meaningfully different disclosure, narrows the context trigger, and clarifies the order of governance rules. 

|**Component**|**Recommended treatment**|
|---|---|
|**Base scores**|Retain Low = 2, Moderate = 5, High/Critical = 10.|
|**Numerical thresholds**|Retain Low = 2–4.99; Moderate = 5–14.99; High = 15+.|
|**Multiplier**|Retain the existing values: 1.00, 1.20, 1.40, 1.70, and 2.00.|
|**Aggregation**|Use only three limited groups: Contact Information; Personal Age Attributes; Organizational Affiliation. Keep other<br>entity types separate.|
|**Critical entities**|Retain base score 10 and the Strongly Validated Critical-Entity Rule that escalates the final result to High.|
|**Context indicators**|Keep context indicators at zero points. Require same-sentence co-occurrence with a valid scored personal entity<br>before escalation.|
|**Low-Impact Cap**|Retain the cap: when every scored entity is Low-impact, the final result cannot exceed Moderate.|
|**Volume escalation**|Do not add a numerical volume threshold yet. Test it separately before adoption.|



**Important: This model assesses the potential severity of information disclosed in a prompt. It does not calculate the probability that an AI provider will misuse the data, train on it, or experience a breach.** 

TrustPrompt | Improved Risk Scoring Model 

Page 2 

## **2. Revised Scoring Registry** 

The table below retains the entity categories and base-score levels already used in the manuscript. The limited grouping is applied only where multiple fields commonly describe one disclosure dimension. A group contributes its base score once, even if more than one member field is detected. 

|**Scoring unit / entity**|**Included information**|**Base score**|**Risk tier**|
|---|---|---|---|
|**Financial information**|Credit/debit card numbers|**10**|High / Critical|
|**Government identification**|Supported Philippine government ID numbers|**10**|High / Critical|
|**Access credentials**|Supported API keys, access tokens, and JWT-like credential patterns that<br>satisfy the implemented strong-validation requirements|**10**|High / Critical|
|**Contact Information**<br>**(limited group)**|Email addresses and phone numbers|**5**|Moderate|
|**Physical address**|Supported physical address patterns|**5**|Moderate|
|**Date of birth**|Date-of-birth patterns|**5**|Moderate|
|**Personal name**|Personal names|**2**|Low|
|**Personal age attributes**<br>**(limited group)**|Age, height, weight, sex, and blood type. Date of birth remains separate<br>because it is already Moderate.|**2**|Low|
|**Organizational affiliation**<br>**(limited group)**|Organization name, job title, and department|**2**|Low|
|**IP address**|IP addresses|**2**|Low|
|**MAC address**|MAC addresses|**2**|Low|
|**Source code**|Source-code blocks identified by the existing detection path|**2**|Low|



### **Why only three groups?** 

Email and phone are grouped because they are contact channels. Age, height, weight, sex, and blood type are grouped as personal attributes, while date of birth remains separate because the manuscript assigns it a higher base score. Organization, job title, and department are grouped because they describe an organizational affiliation. Physical address, IP address, MAC address, and source code remain separate; combining them would hide meaningful differences in the type of information disclosed. 

**Implementation note:** The system should count each scoring unit once, not each occurrence. If an email and phone number are both detected, Contact Information contributes 5 points, not 10. If the same entity appears repeatedly, repetitions do not increase the base score under this model. 

**Source-code limitation:** Structural code indicators can identify a code block, but they cannot establish that the code is proprietary or confidential. A strongly validated API key or token found inside code must be scored independently as an access credential. 

TrustPrompt | Improved Risk Scoring Model 

Page 3 

## **3. Calculation and Classification** 

**Step 1 — Use only eligible detections.** An entity contributes to scoring only after it passes the applicable detection and validation requirements. Weak candidates must not automatically receive a score. 

**Step 2 — Assign one base score per scoring unit.** If multiple member fields from one limited group appear, use that group's base score once. Separate entity types continue to contribute separately. 

**Step 3 — Count the distinct scoring units.** Let k represent the number of scoring units detected in the prompt. 

**Step 4 — Apply the existing diversity multiplier.** 

|**Distinct scoring units (k)**|**Multiplier**|
|---|---|
|1|**1.00**|
|2|**1.20**|
|3|**1.40**|
|4|**1.70**|
|5 or more|**2.00**|



### **Risk Score = (Sum of base scores per distinct scoring unit) × Diversity multiplier** 

**Step 5 — Determine the preliminary risk level.** 

|**Risk level**|**Score range**|**Interpretation**|
|---|---|---|
|**No Detected Risk**|0|No supported scored entity was detected. This does not prove that the prompt contains no<br>sensitive information.|
|**Low**|2–4.99|Limited disclosure involving low-impact information.|
|**Moderate**|5–14.99|Disclosure involving a moderate-impact entity or a combination of different scoring units.|
|**High**|15 or higher|A broad combination of information units, or a strongly validated critical entity escalated by<br>governance.|



**Why not change the critical base score from 10 to 15? The manuscript already has a 15-point High threshold and a rule that escalates a strongly validated critical entity to High. Keeping base 10 and retaining that rule is simpler than changing the numeric scale solely to remove the governance override. The value 15 is a researcher-defined threshold, not a number prescribed by NIST or the Data Privacy Act.** 

TrustPrompt | Improved Risk Scoring Model 

Page 4 

## **4. Governance Rules and Precedence** 

Governance is applied after the preliminary score is calculated. The order below removes ambiguity when more than one condition applies. 

|**Order**|**Rule**|**Condition**|**Result**|
|---|---|---|---|
|**1**|**Strongly Validated Critical-Entity**<br>**Rule**|At least one critical/access-critical entity passes its strong<br>validation requirements.|Final classification is High. This takes<br>priority over the other rules.|
|**2**|**Sensitive-Context**<br>**Co-occurrence**|A valid scored personal entity and a supported context<br>indicator occur in the same sentence.|Raise the preliminary level by one tier,<br>capped at High.|
|**3**|**Low-Impact Cap**|All scoring units contributing to the score are Low-impact; no<br>Moderate or Critical unit is present.|Final classification cannot exceed<br>Moderate.|
|**4**|**Default**|No governance rule applies.|Retain the preliminary classification.|



### **Context indicators: what the rule does and does not mean** 

The manuscript treats nationality, medical, and financial context terms as indicators rather than independently scored entities. Revision 3 retains that approach. It narrows the co-occurrence condition from the entire prompt to the same sentence to reduce cases where an unrelated context term elsewhere in a long prompt triggers escalation. 

Same-sentence co-occurrence is still only a deterministic text-location condition. It does not prove that the context term describes the detected person, that the user owns the information, or that the statement is true. The interface should say that both were detected in the same sentence, rather than claiming a verified relationship. 

A context indicator alone remains unscored. For example, a prompt asking “What is diabetes?” does not receive a risk score solely because the word “diabetes” appears. 

### **Governance sequence** 

**1. Critical entity strongly validated?** If yes, classify High. If no, continue. 

**2. Calculate preliminary score** using the scoring units and multiplier. 

**3. Same-sentence context co-occurrence?** If yes, raise one tier, capped at High. 

**4. All scored units Low-impact?** If yes, cap final result at Moderate. 

**5. Otherwise, retain the preliminary/governance-adjusted result.** 

TrustPrompt | Improved Risk Scoring Model 

Page 5 

## **5. Worked Realistic Scenarios** 

These examples show how the proposed scoring units behave in ordinary prompt situations. They assume the detected entities pass the applicable validation requirements. The examples are illustrative; they are not experimental results. 

|**Prompt / detected information**|**Computation**|**Governance**|**Final**|
|---|---|---|---|
|“My name is Ana Reyes. Help me write a<br>short professional bio.”|Personal name: 2 × 1.00 = 2.00|None|**Low**|
|A signature contains one email address and<br>one mobile number.|Contact Information: 5 × 1.00 = 5.00|None|**Moderate**|
|A résumé prompt includes a name, email,<br>and phone number.|(Name 2 + Contact 5) × 1.20 = 8.40|None|**Moderate**|
|A prompt includes a name, email address,<br>and date of birth.|(Name 2 + Contact 5 + DOB 5) × 1.40 = 16.80|None|**High**|
|One supported Philippine government ID<br>passes the strong validation rule.|Government ID: 10 × 1.00 = 10.00; preliminary<br>Moderate|Critical-Entity Rule|**High**|
|An employee profile contains an<br>organization, job title, and department.|Organizational Affiliation: 2 × 1.00 = 2.00|None|**Low**|
|A prompt contains a personal name,<br>organizational affiliation, and IP address.|(2 + 2 + 2) × 1.40 = 8.40|None|**Moderate**|
|Five different Low-impact scoring units are<br>detected, with no Moderate/Critical unit.|(2 + 2 + 2 + 2 + 2) × 2.00 = 20.00; preliminary<br>High|Low-Impact Cap|**Moderate**|
|“My name is Carlo and I have diabetes.”|Name: 2 × 1.00 = 2.00; preliminary Low|Same-sentence context rule raises<br>one tier|**Moderate**|
|“Can you explain what diabetes is?” No<br>scored personal entity.|No scored entity: 0|Context alone does not score|**No Detected**<br>**Risk**|
|A prompt contains five email addresses in a<br>CC/recipient list.|Contact Information: 5 × 1.00 = 5.00|No volume rule in this revision|**Moderate**|



### **Important interpretation** 

The Low-Impact Cap is retained because multiple weak or low-impact detections can otherwise accumulate to a numerical High score. It prevents a High result based only on Low-impact units. It does not mean that combinations of low-impact information are harmless; they may still be classified Moderate. 

The contact-list example exposes a remaining limitation: the current model does not distinguish one contact detail from a large list of contact details. A volume escalation rule should not be added until candidate thresholds are tested against ordinary email signatures, recipient lists, contact directories, and customer records. 

TrustPrompt | Improved Risk Scoring Model 

Page 6 

## **6. Loopholes and Mitigations** 

|**Potential loophole / weakness**|**Mitigation in this revision**|**Residual limitation**|
|---|---|---|
|Organization, job title, and department may inflate<br>the entity count when they describe one affiliation.|Count them as one Organizational Affiliation scoring<br>unit.|The extension does not semantically verify<br>that the fields refer to the same<br>organization/person.|
|Email and phone can overstate severity when<br>both appear in a routine signature.|Count email and phone together as one Contact<br>Information unit.|A large list of contact details is not<br>distinguished from a single contact group.|
|Combining contact and location can hide the<br>separate disclosure of a home address.|Keep Physical Address as a separate Moderate entity.|Address detection still depends on<br>supported patterns and contextual reliability.|
|A critical entity with base 10 does not<br>independently reach the numerical High threshold<br>of 15.|Retain the explicit Strongly Validated Critical-Entity<br>Rule as the first governance decision.|A false positive in a critical detector can<br>cause an unjustified High warning; strict<br>validation is essential.|
|A context term anywhere in a long prompt can<br>escalate an unrelated personal entity.|Require same-sentence co-occurrence with a valid<br>scored personal entity.|Co-occurrence is not semantic proof or<br>ownership verification.|
|Several Low-impact detections can accumulate to<br>a numerical High result.|Retain the Low-Impact Cap: Low-only combinations<br>cannot finish above Moderate.|Low-only combinations can still reach<br>Moderate; this is an intentional conservative<br>limit.|
|Multiple governance rules may be applied<br>inconsistently.|Define fixed precedence: critical rule→context<br>escalation→Low-Impact Cap→default.|Code and test cases must implement this<br>exact order.|
|Bulk disclosure may not be reflected by a score<br>that counts a scoring unit once.|Do not invent a volume threshold. Evaluate values<br>such as 5, 10, and 20 in a separate test set.|Bulk contact disclosure remains a known<br>limitation until a validated volume rule<br>exists.|
|Source-code structure may be mistaken for proof<br>of proprietary content.|Keep source code Low; structural features identify<br>code, not ownership/confidentiality. Detect embedded<br>credentials separately.|The engine cannot determine whether<br>ordinary code is confidential or proprietary.|



**What this revision intentionally does not add: a new 15-point critical base score, a linear multiplier, a five-value volume escalation rule, a context-only Low score floor, or broad merging of contact, location, and technical entities. These changes either duplicate existing governance, need empirical calibration, or risk hiding distinct disclosure types.** 

TrustPrompt | Improved Risk Scoring Model 

Page 7 

## **7. Changes from the First Manuscript Version** 

The first manuscript version is the baseline represented in the current manuscript's risk-assessment discussion and Tables 10–17. The table below distinguishes changes recommended in this revision from the more extensive changes proposed in v2. 

|**Component**|**First manuscript version**|**Recommended revision**|
|---|---|---|
|**Base scores**|Low 2; Moderate 5; High/Critical 10.|Retain the same values.|
|**Score bands**|Low 2–4.99; Moderate 5–14.99; High 15+.|Retain the same thresholds.|
|**Multiplier**|1.00, 1.20, 1.40, 1.70, 2.00 based on distinct entity types.|Retain values; count the limited scoring units rather than every<br>closely related field.|
|**Aggregation**|Distinct eligible entity types are counted separately.|Group only contact channels, personal age attributes, and<br>organizational affiliation.|
|**Critical handling**|Base score 10 plus Strongly Validated Critical-Entity Rule.|Retain; clarify that the critical rule is applied first.|
|**Context indicators**|Zero base score; prompt-level co-occurrence can escalate.|Remain zero-scored; narrow co-occurrence to the same<br>sentence.|
|**Low-Impact Cap**|Low-only scored entities are capped at Moderate.|Retain and clarify its position in the rule order.|
|**Volume escalation**|Not included.|Not added until thresholds are tested.|
|**Context-only floor**|Context alone does not create a scored risk.|Retain: context-only prompt remains unscored.|
|**Source code**|Low score with a separate structural-feature detection<br>path.|Retain Low; clarify that structure does not prove confidentiality.<br>Embedded credentials are scored separately.|



### **What was proposed in v2 but is not adopted here?** 

Proposal v2 suggested raising the critical base score from 10 to 15, replacing the existing multiplier with a linear multiplier, introducing a volume escalation threshold, changing context handling to first-person asserted context, and adding a context-only Low floor. This revision does not adopt those changes wholesale. The existing critical override already handles the 10-versus-15 issue; a volume threshold needs evidence; and first-person assertion detection would require specific patterns and exclusions that must be confirmed against the actual detection implementation. 

TrustPrompt | Improved Risk Scoring Model 

Page 8 

## **8. Validation Before Adoption** 

The revised model should be treated as a candidate methodology until it has been reviewed and tested. A mathematically consistent formula does not by itself establish that the resulting risk labels are appropriate for real prompts. 

|**Validation activity**|**Recommended work**|**Purpose**|
|---|---|---|
|**Rule review**|Freeze the supported entity list, group membership, base scores, thresholds, and<br>governance order. Confirm the exact Philippine ID and credential patterns actually<br>implemented.|Prevent ambiguity between the<br>manuscript and code.|
|**Scenario review**|Prepare 40–60 realistic prompts including positive, negative, mixed, quoted,<br>hypothetical, and edge cases. Have 2–3 reviewers independently assign expected<br>risk levels before seeing system outputs.|Check whether the intended labels are<br>reasonable and reproducible.|
|**Detection evaluation**|Measure precision, recall, F1, false-positive rate, and false-negative rate per entity<br>type. Review critical-entity false positives separately.|Check whether detections are reliable<br>enough to score.|
|**Risk-engine tests**|Test group counting, repeated values, score boundaries, critical override,<br>same-sentence context rule, Low-Impact Cap, and governance precedence.|Confirm the implementation follows the<br>documented model.|
|**Volume-rule study**|If volume escalation is reconsidered, compare thresholds such as 5, 10, and 20<br>distinct normalized values against signatures, recipient lists, directories, and<br>customer records.|Avoid a threshold that over-warns<br>normal user prompts.|



### **Implementation dependencies** 

The detection output should provide, at minimum, the entity type, validation/reliability status, and text span or sentence location. The risk engine maps eligible detections to scoring units, counts each unit once, calculates the preliminary score, and applies governance in the specified order. If sentence location is not currently available, same-sentence context matching is a proposed implementation change and must not be described as existing functionality. 

### **Manuscript sections to update together** 

If the team approves this revision, update the entity registry and scoring tables (Tables 10–17), the risk-assessment activity diagram (Figure 9), the risk-assessment engine flow (Figure 19), the detection-to-risk output structure, test cases, and the relevant Chapter 4 and Chapter 5 explanations. Recalculate every example and ensure no older scoring rule remains in a diagram or paragraph. 

TrustPrompt | Improved Risk Scoring Model 

Page 9 

## **9. Scope Boundaries and Known Limitations** 

TrustPrompt is a deterministic prompt-screening mechanism. It detects supported patterns and estimates disclosure severity from the information types present. It does not determine whether an AI provider uses a prompt for model training, whether a provider will misuse the information, or whether a particular disclosure is unlawful. 

- Only entity types and formats actually implemented and documented should be included in the scoring registry. 

- A name may refer to the user, another person, a public figure, or a fictional person; the extension cannot verify ownership from the name alone. 

- Same-sentence context matching is a text-location rule, not semantic proof that a medical, financial, or nationality term belongs to the detected person. 

- The model does not yet distinguish one contact value from a large list of contact values. 

- Source-code structure does not establish whether code is proprietary or confidential. 

- A No Detected Risk result means no supported scored entity was detected; it is not a guarantee that the prompt is safe. 

- The numeric scores and multiplier are researcher-defined parameters. NIST SP 800-122 informs confidentiality-impact thinking but does not prescribe these exact values. 

## **10. Recommended Decision** 

**Adopt this focused revision as the next candidate model for review. It preserves the manuscript's established numerical framework and non-blocking approach while addressing the most defensible weaknesses: related-field overcounting, prompt-wide context escalation, ambiguous rule precedence, and overstatement of source-code sensitivity. Do not claim the model is validated until the scenario and implementation tests are completed.** 

### **Source basis and traceability** 

Primary source: _4ITA_Group2_Capstone 1-2 Manuscript.docx.pdf_ , particularly the Privacy Disclosure Risk Assessment Engine and Tables 10–17 (printed pages approximately 113–123). Comparison source: _Detection paths.pdf_ for the source-code detection path and the separate Risk Scoring Proposal v2 discussed by the team. This document is a proposed revision and does not silently replace the approved manuscript. 

**Methodology note:** The scoring weights, multiplier, thresholds, and governance rules are researcher-defined operational parameters. They should be described as informed by qualitative confidentiality-impact and identifiability principles, not as numerical values mandated by NIST SP 800-122 or Republic Act No. 10173. 

TrustPrompt | Improved Risk Scoring Model 

Page 10 

