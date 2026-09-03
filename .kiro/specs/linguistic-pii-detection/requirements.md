# Linguistic PII Detection Requirements

## Introduction

TrustPrompt currently detects personal identifiable information (PII) through two methods: strict patterns via regex (PATH A) and a gazetteer wordlist approach (PATH B). This feature adds a third detection method—PATH C—that uses linguistic analysis via compromise.js to identify broad PII categories that are too variable to capture in fixed dictionaries or patterns.

The linguistic detector targets three entity types commonly mentioned in natural language:
- **Person names**: First names, last names, full names (e.g., "My name is Alice Smith")
- **Job titles / roles**: Professional positions (e.g., "I work as a Senior Engineer")
- **Organization names**: Company or institutional names (e.g., "I work at Acme Corp")

This detector runs within the existing scanner pipeline after PATH A and PATH B, follows the same finding structure, participates in risk scoring, and gracefully handles the case where compromise.js is unavailable.

## Glossary

- **System**: TrustPrompt (the extension that detects and redacts PII)
- **Scanner**: The main scanning engine that orchestrates PATH A, PATH B, and PATH C
- **Finding**: A detected PII instance with `patternId`, `label`, `risk`, `rawMatch`, `safeVersion`, `source`, and optional metadata
- **Named Entity Recognition (NER)**: Linguistic technique to identify and classify named entities (PERSON, ORG, JOB) in text
- **Part-of-Speech (POS) tagging**: Linguistic technique to label tokens with grammatical roles (noun, verb, adj, etc.)
- **Tokenization**: Breaking normalized text into individual words / tokens
- **Compromise.js**: NLP library providing tokenization, POS tagging, and named entity recognition
- **Linguistics View**: The normalized text output prepared for PATH C (all punctuation normalized, whitespace collapsed, sentence case estimated)
- **Pattern ID**: Machine-readable key identifying the type of finding (e.g., `nlp_person_name`, `nlp_job_title`, `nlp_organization`)
- **Risk Level**: Classification of PII sensitivity: `high`, `moderate`, or `low`
- **Validation**: Confirmation that a raw match meets structural and/or semantic criteria (e.g., a credit card passes Luhn check)

## Requirements

### Requirement 1: PATH C Integration into Scanner Pipeline

**User Story:** As a privacy analyst, I want PATH C (linguistic detection) to run in parallel with PATH B during scanning, so that both linguistic-based detectors can execute concurrently without blocking each other.

#### Acceptance Criteria

1. WHEN the System scans raw text, THE Normalizer SHALL produce two separate text views: `textRegex` (for PATH A) and `textNLP` (for PATH B and PATH C)
2. WHEN normalized text is available, THE Scanner SHALL invoke PATH A on `textRegex` and invoke PATH B and PATH C in parallel on `textNLP`
3. THE Scanner SHALL wait for all three paths to complete, then merge and deduplicate findings using the same deduplication logic (highest risk level wins)
4. THE Scanner SHALL pass the `textNLP` view (linguistic-normalized text) to PATH C
5. WHILE PATH C is executing, THE System SHALL handle missing compromise.js library gracefully by logging a debug message and returning an empty finding list
6. WHERE compromise.js is available and loaded, THE System SHALL invoke the linguistic detector on PATH C; WHERE compromise.js is not available, THE System SHALL skip PATH C without raising an error

### Requirement 2: Person Name Detection via NER

**User Story:** As a privacy analyst, I want the System to identify person names (first, last, full) extracted from natural language text (e.g., "My name is Alice Smith", "I'm John"), so that I can flag direct personal identifiers that regex and gazetteers miss.

#### Acceptance Criteria

1. WHEN the System receives text containing a person name in natural language form, THE Linguistic_Detector SHALL tokenize the text and apply NER tagging via compromise.js
2. IF a token or sequence of tokens is tagged as PERSON entity by the NER engine, THE Linguistic_Detector SHALL extract the span and create a finding with `patternId: "nlp_person_name"`
3. WHEN a PERSON entity is identified, THE Linguistic_Detector SHALL assign `risk: "low"` (contextual indicator; name alone is not a complete identifier per RA 10173)
4. WHEN a PERSON entity is identified, THE Linguistic_Detector SHALL set `source: "C_linguistic"` and `validated: false` (NER is probabilistic, not mathematically validated)
5. WHEN consecutive PERSON entities are detected (e.g., "Alice Smith" as two separate entities), THE Linguistic_Detector SHALL attempt to merge them into a single finding if they form a contiguous span

### Requirement 3: Job Title Detection via POS Tagging and NER

**User Story:** As a privacy analyst, I want the System to identify job titles and professional roles mentioned in natural language (e.g., "I am a Senior Engineer", "She works as a Project Manager"), so that I can flag occupational context that infers identity.

#### Acceptance Criteria

1. WHEN the System receives text containing job title or role information, THE Linguistic_Detector SHALL apply POS tagging via compromise.js to identify noun phrases likely to represent job titles
2. IF tokens following a trigger phrase (e.g., "I work as", "my role is") are tagged as noun or compound noun, THE Linguistic_Detector SHALL extract the span as a job title finding
3. WHERE NER is available, IF tokens are tagged as JOB entity, THE Linguistic_Detector SHALL extract the span and create a finding with `patternId: "nlp_job_title"`
4. WHERE NER is not available or does not tag JOB entities, THE Linguistic_Detector SHALL use POS heuristics (noun phrases after trigger phrases) to identify job titles
5. WHEN a job title is identified, THE Linguistic_Detector SHALL assign `risk: "low"` (contextual indicator; job title alone does not identify an individual per RA 10173)
6. WHEN a job title is identified, THE Linguistic_Detector SHALL set `source: "C_linguistic"` and `validated: false`

### Requirement 4: Organization Name Detection via NER

**User Story:** As a privacy analyst, I want the System to identify organization and company names mentioned in natural language (e.g., "I work at Acme Corp", "I'm employed by TechStartup Inc"), so that I can flag employment relationships and organizational context.

#### Acceptance Criteria

1. WHEN the System receives text containing an organization name, THE Linguistic_Detector SHALL apply NER tagging via compromise.js to identify ORG entities
2. IF a token or sequence of tokens is tagged as ORG entity by the NER engine, THE Linguistic_Detector SHALL extract the span and create a finding with `patternId: "nlp_organization"`
3. WHEN an ORG entity is identified, THE Linguistic_Detector SHALL assign `risk: "low"` (contextual indicator; organization name alone does not identify an individual per RA 10173)
4. WHEN an ORG entity is identified, THE Linguistic_Detector SHALL set `source: "C_linguistic"` and `validated: false`
5. WHERE an ORG entity overlaps with a trigger phrase (e.g., "work at <ORG>"), THE Linguistic_Detector SHALL prefer the NER-extracted span over the trigger-phrase extraction to avoid duplication

### Requirement 5: Finding Structure and Risk Scoring Integration

**User Story:** As a system architect, I want PATH C findings to follow the same structure as PATH A and PATH B findings and participate in risk scoring, so that the overall risk assessment remains consistent and composable.

#### Acceptance Criteria

1. WHEN PATH C detects an entity, THE Linguistic_Detector SHALL return findings with the following structure:
   - `patternId` (string): one of `nlp_person_name`, `nlp_job_title`, or `nlp_organization`
   - `label` (string): human-readable description (e.g., "Person Name (NLP)")
   - `risk` (string): one of `high`, `moderate`, `low` (all PATH C findings use `low`)
   - `rawMatch` (string): the original matched text
   - `safeVersion` (string): redacted display version (e.g., "[NAME REDACTED]")
   - `source` (string): `"C_linguistic"`
   - `validated` (boolean): `false` (NER is probabilistic)
2. THE Scanner SHALL include PATH C findings in the BASE_SCORES and ENTITY_TIER maps with appropriate scores and classifications
3. WHEN computing risk score, THE Scanner SHALL treat PATH C findings as `contextual` tier entities with score 2 (consistent with gazetteer findings)
4. WHILE merging PATH A/B/C findings, THE Scanner SHALL apply the same deduplication logic: keep the finding with highest risk level if the same rawMatch text appears in multiple paths

### Requirement 6: Optional Graceful Degradation

**User Story:** As a developer, I want PATH C to gracefully handle the absence of compromise.js (optional/fallback mode), so that TrustPrompt remains functional even if the NLP library is not loaded.

#### Acceptance Criteria

1. WHEN compromise.js is not available in the global scope, THE Linguistic_Detector SHALL detect this condition during initialization (not runtime)
2. IF compromise.js is not available, THE Linguistic_Detector SHALL log a debug message: `"[TrustPrompt/PATH_C] compromise.js not found; skipping linguistic detection"`
3. WHEN the Scanner calls PATH C and compromise.js is unavailable, THE Linguistic_Detector SHALL return an empty findings list `[]` without throwing an error
4. WHERE compromise.js is unavailable, THE System SHALL continue scanning with PATH A and PATH B results only, and the overall risk score SHALL be computed normally without PATH C contributions

### Requirement 7: Performance Constraint

**User Story:** As a performance analyst, I want PATH C to have minimal overhead on the scanning pipeline, so that total scan time remains within acceptable bounds (debounce threshold ~400ms perceived latency).

#### Acceptance Criteria

1. WHEN the Scanner runs PATH C on a typical message (100–500 characters), THE Linguistic_Detector SHALL complete its analysis within 50ms on a modern machine
2. THE Linguistic_Detector SHALL use pre-initialized compromise.js instances or cached resources where possible to avoid re-parsing on every scan
3. IF PATH C execution exceeds 100ms (2× the budget), THE Scanner SHALL log a performance warning but NOT suppress or interrupt the findings

### Requirement 8: Tokenization and Linguistic Pipeline

**User Story:** As a system designer, I want PATH C to follow a well-defined linguistic processing pipeline, so that behavior is predictable and testable.

#### Acceptance Criteria

1. WHEN the Linguistic_Detector receives the `textNLP` normalized text view, THE Pipeline SHALL perform these steps in order:
   - Step 1: Tokenize using compromise.js (produces tokens with lemma, pos)
   - Step 2: Apply POS tagging (pos property set by compromise.js)
   - Step 3: Apply NER tagging (identify PERSON, ORG, JOB entities)
   - Step 4: Extract matched entities and convert to findings
2. THE Pipeline SHALL process one normalized text input per scan invocation
3. WHILE PATH B (Gazetteer) and PATH C (Linguistic) execute in parallel on the same `textNLP` input, THE Pipeline SHALL not share state between them
4. WHERE compromise.js does not support a linguistic feature (e.g., JOB tagging), THE Pipeline SHALL use fallback heuristics (POS + trigger phrases) or skip that feature without error

### Requirement 9: Safe Redaction of Linguistic Findings

**User Story:** As a user, I want linguistic findings to be displayed in a safe, redacted form in the UI, so that PII is not exposed even during display.

#### Acceptance Criteria

1. WHEN a person name finding is created with `patternId: "nlp_person_name"`, THE Linguistic_Detector SHALL set `safeVersion` to a format like `"[NAME REDACTED]"` or similar contextual label
2. WHEN a job title finding is created with `patternId: "nlp_job_title"`, THE Linguistic_Detector SHALL set `safeVersion` to `"[JOB TITLE REDACTED]"`
3. WHEN an organization finding is created with `patternId: "nlp_organization"`, THE Linguistic_Detector SHALL set `safeVersion` to `"[ORGANIZATION REDACTED]"`
4. THE Scanner SHALL display these safe versions in the UI without exposing the rawMatch values to the user

### Requirement 10: Lexicon Lookup and Known Entity Filtering

**User Story:** As a developer, I want PATH C to avoid flagging common non-PII entities (e.g., "John" as a common first name in example code), so that false positives are minimized.

#### Acceptance Criteria

1. WHERE a PERSON entity is extracted, THE Linguistic_Detector MAY check against a lightweight common-first-name or common-last-name lexicon to filter obvious non-PII (e.g., generic examples)
2. WHERE a JOB entity is extracted, THE Linguistic_Detector MAY check against a lightweight common-job-title lexicon to filter obvious generics (e.g., "manager", "engineer" without context)
3. IF filtering is applied, THE Linguistic_Detector SHALL preserve findings that are in actual code blocks or clearly indicate real PII (via trigger phrases or context)
4. WHERE compromise.js is unavailable or filtering resources are not loaded, THE Linguistic_Detector SHALL report all entities without filtering and log a debug message

