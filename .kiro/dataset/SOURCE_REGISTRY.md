# TrustPrompt — Dataset Source Registry
**Version:** 0.1.0  
**Owner:** QA / Research Lead  
**Last Updated:** 2026-08-21  
**Scope:** Every upstream dataset, list, or reference used to populate TrustPrompt's gazetteers, NLP trigger layers, and curated test batches.

---

## How to Read This Registry

Each entry covers one upstream source. Fields:

| Field | Meaning |
|---|---|
| **Source ID** | Short stable key used to reference this source in the register and annotation files |
| **Layer** | Which TrustPrompt layer this source feeds (`GAZETTEER`, `NLP-TRIGGER`, `TEST-CASES`, or multiple) |
| **Batches Fed** | Batch IDs in `DATASET_REGISTER.md` that draw from this source |
| **URL / Location** | Canonical URL of the dataset or reference |
| **License** | Known license; `VERIFY` means license must be confirmed before ingestion |
| **Format** | File format of the raw source |
| **Ingestion Status** | `NOT STARTED` / `IN PROGRESS` / `EXTRACTED` / `INTEGRATED` |
| **Extraction Notes** | What subset to extract, transformations needed, and any known issues |

---

## Section 1 — Gazetteer Layer Sources

These sources populate the word lists inside `gazetteer.js` (the `GAZETTEER` object) and the gazetteer lookup used by Path B (B1 sub-step).

---

### SRC-GAZ-001 — Nationality List
| Field | Value |
|---|---|
| **Source ID** | SRC-GAZ-001 |
| **Layer** | GAZETTEER → `nationality_religion` word list |
| **Batches Fed** | `NATRELIG-B1-001` |
| **URL** | https://github.com/Imagin-io/country-nationality-list |
| **License** | MIT — confirmed open use |
| **Format** | JSON (`countries.json`) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Target field: `"nationality"` key in each country object (e.g., `"Filipino"`, `"American"`, `"Korean"`).
- Extract the nationality adjective only — not the country name noun (e.g., extract `"Filipino"` not `"Philippines"`). Country nouns are too broad and would cause false positives on geographic references.
- Convert all entries to lowercase for the `GAZETTEER.nationality_religion` array.
- Deduplicate against religion terms already in the list — there is no overlap expected but confirm before merging.
- Estimated yield: ~195 nationality adjectives. Review and trim to the ~50 most likely to appear in real AI prompts (major nationalities by internet population). Document the trimming criteria in the batch notes.
- **Do not** add demonyms that are also common English words unrelated to nationality (e.g., `"Swiss"` has low false-positive risk; `"American"` has near-zero; review any entry under 6 characters carefully).

---

### SRC-GAZ-002 — Medical / Health Terms (NHS A–Z)
| Field | Value |
|---|---|
| **Source ID** | SRC-GAZ-002 |
| **Layer** | GAZETTEER → `medical` word list |
| **Batches Fed** | `HEALTH-B1-001`, `HEALTH-B1-002`, `HEALTH-B2-001` |
| **URL** | https://www.nhsinform.scot/illnesses-and-conditions/a-to-z/ |
| **License** | © NHS Inform — public health information; content may be referenced but not bulk-redistributed. **Extract condition names only (single words or short noun phrases), not descriptions or clinical text.** |
| **Format** | Web page (HTML — scrape condition names from the A–Z index) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Extract the **condition name** from each A–Z entry only (e.g., `"Diabetes"`, `"Hypertension"`, `"Asthma"`). Do not copy descriptions, symptoms, or treatment text — these are copyright NHS Inform.
- Target: the plain-language, user-typed name a person would use in a chat prompt (not clinical Latin terms like `"Diabetes mellitus type 2"` — just `"diabetes"`).
- Normalize to lowercase single-word or two-word forms. Multi-word conditions (e.g., `"irritable bowel syndrome"`) → keep the full phrase as a single gazetteer entry.
- Exclude conditions whose names are common English words with high false-positive risk (e.g., `"cold"`, `"flu"` — too generic). Flag borderline entries in the batch's `annotation_notes`.
- Estimated yield: ~200–250 condition names after normalization. This is the **replacement** for the ICD-10 database (see decision note in `DATASET_REGISTER.md` Section 2.1).
- The current `gazetteer.js` `medical` list has 22 terms. The NHS A–Z extraction will expand this significantly. Terms must be reviewed against the word-boundary regex (`\b term \b`) for collision risk before integration.

**Rationale for choosing NHS A–Z over ICD-10:**  
ICD-10 (k4m1113/ICD-10-CSV, ~70 000 codes) contains clinical billing codes with lengthy Latin-derived descriptions. A user typing into ChatGPT or Claude would write `"I have asthma"` not `"J45.909 unspecified asthma uncomplicated"`. NHS A–Z reflects real-world plain-English health vocabulary, runs faster on every keypress, and is less likely to generate false positives from medical jargon that happens to share words with common text.

---

### SRC-GAZ-003 — Financial Terms (FinRAD Dataset)
| Field | Value |
|---|---|
| **Source ID** | SRC-GAZ-003 |
| **Layer** | GAZETTEER → `financial` word list; TEST-CASES |
| **Batches Fed** | `FIN-B1-001`, `FIN-B1-002`, `FIN-B2-001` |
| **URL** | https://github.com/sohomghosh/FinRAD_Financial_Readability_Assessment_Dataset |
| **License** | VERIFY — check repository LICENSE file before extraction |
| **Format** | CSV / JSON |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Target: financial vocabulary terms and phrases that indicate personal financial disclosure (e.g., `"loan"`, `"debt"`, `"mortgage"`, `"bankrupt"`, `"foreclosure"`, `"garnishment"`).
- FinRAD is a readability dataset for financial text — its vocabulary lists are the useful artifact, not the full dataset text. Extract only the **term/word columns**, not the readability scores or full sentences.
- Cross-reference extracted terms against the existing `GAZETTEER.financial` array in `gazetteer.js` (11 terms currently). The goal is to expand this list by ~20–30 additional high-signal terms.
- Exclude terms that are too generic to flag as disclosures in isolation (e.g., `"money"`, `"pay"`, `"cost"`). The term must suggest a personal financial situation, not just a financial topic.
- License must be verified before any term is added to `gazetteer.js`. If FinRAD is non-commercial-only, use it for **test case inspiration only** (paraphrase synthetic samples), not for direct word-list extraction.

---

### SRC-GAZ-004 — Financial Terms (BSP Glossary)
| Field | Value |
|---|---|
| **Source ID** | SRC-GAZ-004 |
| **Layer** | GAZETTEER → `financial` word list |
| **Batches Fed** | `FIN-B1-001`, `FIN-B1-002` |
| **URL** | https://www.bsp.gov.ph/SitePages/AboutTheBank/Glossary.aspx (primary) and http://www.bsp.gov.ph/banking/glossary.asp (secondary/legacy) |
| **License** | Bangko Sentral ng Pilipinas — Philippine government publication. Government-produced factual content (glossary definitions) is generally in the public domain under Philippine law; confirm with team legal before extraction. |
| **Format** | Web page (HTML) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Extract the **term names** only (not the definitions). These are official PH banking/financial terms.
- Focus on terms that indicate personal financial distress or disclosure: `"non-performing loan"`, `"restructured loan"`, `"past due"`, `"foreclosed asset"`, `"insolvency"`, `"dacion en pago"`.
- Supplement SRC-GAZ-003 with PH-specific terms that FinRAD (a US/global dataset) would not contain.
- Estimated yield: 15–25 additional PH-relevant financial terms.
- The legacy URL (`banking/glossary.asp`) may redirect or be unavailable — use the SitePages URL as primary.

---

## Section 2 — Compromise.js / NLP Layer Sources

These sources feed the NLP trigger layer (Path B, B2–B3 sub-steps) — specifically expanding the trigger-phrase value-extraction grammar and the Compromise-lite proper-noun heuristics.

---

### SRC-NLP-001 — Philippine Names (Person Detection)
| Field | Value |
|---|---|
| **Source ID** | SRC-NLP-001 |
| **Layer** | NLP-TRIGGER → `trigger_person_name` grammar check; TEST-CASES |
| **Batches Fed** | `NAME-B2-001`, `NAME-B2-002` |
| **URL** | https://github.com/philipperemy/name-dataset |
| **License** | MIT — confirmed open use |
| **Format** | CSV / JSON (by country code; Philippines = `PH`) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Navigate to the `PH` country subset. Extract `first_name` and `last_name` columns.
- Purpose: curate a list of realistic Filipino first names and surnames for use in `trigger_person_name` positive test cases. This is **test-case data only** — it does not go into `gazetteer.js` directly (person names are too numerous and language-overlap-prone for a word list approach).
- Sample a representative set: aim for 200 first names (100 male, 100 female) and 100 surnames. Use frequency-ranked entries where available — the most common names are the most important to test against.
- Verify the B3 grammar check (`grammarCheck("person_name", ...)`) accepts these names by running a quick scan via the browser console after loading the extension.
- For `NAME-B2-002` (typo variants), take a sample of 30 names and introduce single-character edits to the trigger phrase (not the name itself) to test the Levenshtein fuzzy matcher.

---

### SRC-NLP-002 — Organization / Company Designators
| Field | Value |
|---|---|
| **Source ID** | SRC-NLP-002 |
| **Layer** | NLP-TRIGGER → `trigger_employer` value extraction |
| **Batches Fed** | `EMP-B2-001` |
| **URL** | https://github.com/ProfoundNetworks/company_designator |
| **License** | MIT — confirmed open use |
| **Format** | YAML / JSON |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- This dataset contains legal entity suffixes and designators across many jurisdictions (e.g., `Inc.`, `Corp.`, `LLC`, `Ltd.`, `S.A.`, `OPC`, `BV`).
- Purpose: expand the `trigger_employer` grammar check (B3) so it can confirm that an extracted span following "I work at" looks like a company name (ends with or contains a company designator).
- Extract the **Philippines-relevant designators** first: `Corporation`, `Corp.`, `Incorporated`, `Inc.`, `OPC` (One Person Corporation), `Foundation`, `Inc.`, and Philippine government agency patterns (e.g., `DepEd`, `DSWD`, `BIR`).
- Also extract the top 20 international designators by global prevalence (the most common suffixes a user typing into an AI assistant would include).
- These designators will be added as an auxiliary lookup list to the B3 grammar check for `employer` category — not to `gazetteer.js`.

---

### SRC-NLP-003 — Philippine Geographic Data (Regions, Provinces, Cities, Municipalities, Barangays)
| Field | Value |
|---|---|
| **Source ID** | SRC-NLP-003 |
| **Layer** | GAZETTEER → `ph_address` validator (`PH_ADDRESS_DB`); NLP-TRIGGER → `trigger_location` grammar check; TEST-CASES |
| **Batches Fed** | `LOC-A-001`, `LOC-B2-001` |
| **URL** | https://github.com/flores-jacob/philippine-regions-provinces-cities-municipalities-barangays |
| **License** | MIT — confirmed open use |
| **Format** | JSON |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- This source already partially feeds `ph-address-db.js` (the `PH_ADDRESS_DB` object used by `isPHAddress` and the B3 `location` grammar check). Review the current `ph-address-db.js` to understand what is already loaded before re-extracting.
- For **test cases**: extract place names at region, province, city, and municipality level. Barangay-level extraction is optional for test cases (too granular to be commonly typed); focus on city and municipality names.
- For **LOC-A-001** (`ph_address` regex tests): construct synthetic addresses combining a street-type keyword + a real city/municipality name from this dataset. The address need not be real — only the city name needs to exist in `PH_ADDRESS_DB`.
- For **LOC-B2-001** (trigger tests): use city and province names as the value extracted after a location trigger phrase (e.g., `"I live in Cebu City"`, `"nakatira ako sa Quezon City"`).
- Note: the dataset is structured as a nested JSON (Region → Province → City/Municipality → Barangay). Flatten to a single list of unique place names for lookup purposes.

---

### SRC-NLP-004 — International Geographic Data (GeoNames)
| Field | Value |
|---|---|
| **Source ID** | SRC-NLP-004 |
| **Layer** | NLP-TRIGGER → `trigger_location` grammar check (international extension); TEST-CASES |
| **Batches Fed** | `LOC-B2-002` |
| **URL** | https://download.geonames.org/export/dump/ |
| **License** | Creative Commons Attribution 4.0 — attribution required in any derivative work |
| **Format** | Tab-separated values (`.txt`); `cities500.txt` recommended (cities with population > 500) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Use `cities500.txt` or `cities1000.txt` — do not use the full `allCountries.txt` (~11M rows) as it would bloat the extension.
- Filter to English-language `alternatenames` where available, since that is what users type.
- Purpose for TrustPrompt: populate the B3 location grammar check with international city names so `"I live in Singapore"` or `"I am from Toronto"` are recognized as location values, not just PH places.
- **Do not** import the full GeoNames dump into `gazetteer.js` — it is far too large for a browser extension. Instead, use it to curate a **test case sample** of 30–50 international cities for `LOC-B2-002`, and separately propose a future architecture note for how GeoNames could be sampled into a compact lookup for the location grammar check.
- Attribution: any documentation or published report derived from GeoNames data must include: `"Geographical data © GeoNames contributors, licensed CC BY 4.0"`.

---

### SRC-NLP-005 — Job Titles (International — HuggingFace)
| Field | Value |
|---|---|
| **Source ID** | SRC-NLP-005 |
| **Layer** | NLP-TRIGGER → `trigger_employer` / job-title value extraction; TEST-CASES |
| **Batches Fed** | `JOBTITLE-B2-001` |
| **URL** | https://huggingface.co/datasets/gpriday/job-titles |
| **License** | VERIFY — check dataset card on HuggingFace before extraction |
| **Format** | Parquet / CSV (via HuggingFace datasets API) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Extract the job title strings only. Purpose: curate realistic job titles for `trigger_employer` test cases where the user discloses both an employer and a job title.
- The B2 trigger "I work at" captures the *employer name*; a companion trigger or grammar check extension may later handle job title detection separately. For now, use this source only for test case construction.
- Sample 100 titles spanning a range of industries and seniority levels. Ensure Philippine-common titles are represented (e.g., `"OFW"`, `"call center agent"`, `"barangay captain"` — these would come from SRC-NLP-006 below).
- If license is non-commercial, use for test case *inspiration* only (write similar but distinct synthetic titles, do not copy verbatim).

---

### SRC-NLP-006 — Job Titles (Philippines — PSA PSOC)
| Field | Value |
|---|---|
| **Source ID** | SRC-NLP-006 |
| **Layer** | NLP-TRIGGER → `trigger_employer` / job-title value extraction (PH-specific); TEST-CASES |
| **Batches Fed** | `JOBTITLE-B2-001` |
| **URL** | https://psa.gov.ph/classification/psoc |
| **License** | Philippine Statistics Authority — Philippine government publication; public domain under Philippine law (VERIFY with team legal for derivative use) |
| **Format** | Web page / downloadable PDF or Excel |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- PSOC = Philippine Standard Occupational Classification. This is the official PH government job title taxonomy.
- Extract occupation titles at the unit-group level (4-digit codes) — these are specific enough to be realistic user-typed values without being overly technical.
- Focus on the top 50 most common occupations in PH by employment share (available from PSA labor force data). These are the job titles most likely to appear in an AI prompt.
- Include OFW-specific categories (domestic workers, seafarers, etc.) as these are a significant demographic of PH internet users.
- Combine with SRC-NLP-005 to build a merged test corpus of 150 total job titles for `JOBTITLE-B2-001`.

---

### SRC-NLP-007 — O*NET Occupational Database (International)
| Field | Value |
|---|---|
| **Source ID** | SRC-NLP-007 |
| **Layer** | NLP-TRIGGER → `trigger_employer` / job-title value extraction (international backup); TEST-CASES |
| **Batches Fed** | `JOBTITLE-B2-001` |
| **URL** | https://www.onetcenter.org/database.html |
| **License** | US Department of Labor — public domain (US government work) |
| **Format** | Excel / CSV (downloadable from O*NET Resource Center) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Download the `Occupation Data` table. Field `"Title"` contains the job title strings.
- Use as a supplemental source to SRC-NLP-005 if the HuggingFace dataset has licensing issues or insufficient coverage.
- O*NET titles are US-centric; supplement with SRC-NLP-006 (PSA PSOC) for PH-specific roles.
- O*NET is entirely public domain — no attribution constraint, no commercial restriction.

---

## Section 3 — Trigger-Phrase Context Layer Sources

These sources inform the trigger-phrase list (`TRIGGERS` array in `gazetteer.js`) and provide reference patterns for date-of-birth, age, family/relationship, and financial mention detection.

---

### SRC-TRG-001 — Date of Birth Patterns (Microsoft Presidio)
| Field | Value |
|---|---|
| **Source ID** | SRC-TRG-001 |
| **Layer** | NLP-TRIGGER → `trigger_dob` phrase patterns |
| **Batches Fed** | `DOB-B2-001` |
| **URL** | https://github.com/microsoft/presidio |
| **License** | MIT — confirmed open use |
| **Format** | Python source code (pattern definitions in `presidio_analyzer/predefined_recognizers/`) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Presidio is a PII detection framework. The relevant file is `date_recognizer.py` (and related recognizers).
- Do **not** import Presidio's code or models. Use it as a **reference** for: (a) what date-of-birth trigger phrases are commonly used, and (b) what date formats to cover in `DOB-B2-001` test cases.
- Extract the list of trigger phrases Presidio uses for DOB detection (e.g., `"date of birth"`, `"born on"`, `"DOB"`, `"d.o.b."`) and compare against TrustPrompt's existing `TRIGGERS` array. If Presidio covers phrases TrustPrompt misses, propose additions to the `TRIGGERS` array in a separate task.
- Extraction for test cases: use Presidio's documented date format coverage to ensure `DOB-B2-001` tests all common date formats: `MM/DD/YYYY`, `DD-MM-YYYY`, `Month DD, YYYY`, `YYYY-MM-DD` (ISO 8601), and Filipino formats (`DD ng Month YYYY`).

---

### SRC-TRG-002 — Age Patterns (Microsoft Presidio)
| Field | Value |
|---|---|
| **Source ID** | SRC-TRG-002 |
| **Layer** | NLP-TRIGGER → `trigger_age` phrase patterns |
| **Batches Fed** | `AGE-B2-001` |
| **URL** | https://microsoft.github.io/presidio/supported_entities/ |
| **License** | MIT — confirmed open use (documentation reference only) |
| **Format** | Web documentation |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Use the Presidio supported entities documentation as a reference for age-related entity patterns.
- The key insight is the `followPattern` in TrustPrompt's `"i am"` trigger: `/^\d{1,3}\s*(years?\s*old|yrs?\s*old|y\/o)?/` — verify this covers all formats Presidio's AGE entity handles.
- Gaps to check: `"I turned 30 last week"`, `"I'm in my 20s"`, `"I am 30-something"` — these are edge cases the current `followPattern` may miss. Document as boundary cases in `AGE-B2-001`.
- This source is documentation-only — no data extraction, only pattern reference.

---

### SRC-TRG-003 — Family / Relationship Information
| Field | Value |
|---|---|
| **Source ID** | SRC-TRG-003 |
| **Layer** | NLP-TRIGGER → family/relationship disclosure patterns (future trigger expansion) |
| **Batches Fed** | (No current batch — future use when family/relationship triggers are added) |
| **URL** | https://doi.org/10.1371/journal.pone.0283218 (academic paper) and https://github.com/kinbank (reference repository) |
| **License** | Academic paper: open access (PLOS ONE CC BY 4.0); kinbank repository: VERIFY |
| **Format** | Academic paper (PDF); GitHub repository (CSV/JSON) |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- TrustPrompt does not currently have a `trigger_family` or `trigger_relationship` trigger. These sources are catalogued here for **future expansion**.
- The PLOS ONE paper covers kinship terminology across languages. The kinbank repository contains structured kinship vocabulary.
- When family/relationship triggers are added (proposed: `"my mother is"`, `"my husband"`, `"my children"`, `"I have N kids"`), use kinbank's PH/Filipino kinship terms to expand the Filipino-language trigger coverage.
- Action for now: **no extraction**. Log as SRC-TRG-003 in the registry. Revisit when task scope expands to include family/relationship disclosure detection.

---

### SRC-TRG-004 — Unstructured Financial Mentions (FinRAD)
| Field | Value |
|---|---|
| **Source ID** | SRC-TRG-004 |
| **Layer** | NLP-TRIGGER → `trigger_financial` phrase patterns; TEST-CASES |
| **Batches Fed** | `FIN-B2-001` |
| **URL** | https://github.com/sohomghosh/FinRAD_Financial_Readability_Assessment_Dataset |
| **License** | VERIFY — same repository as SRC-GAZ-003; confirm license covers test-case use |
| **Format** | CSV / JSON |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- This is the same repository as SRC-GAZ-003 but used for a different purpose here: extracting **sentence patterns** for unstructured financial mentions.
- Target: sentences where a person discloses personal financial information without using a structured label (e.g., `"I earn around ₱50,000 a month"`, `"my debt is getting bigger"`, `"I can't afford my mortgage anymore"`).
- Use these as templates to write synthetic test cases for `FIN-B2-001`. Do **not** copy sentences verbatim if the license is unclear — paraphrase into new synthetic examples.
- Cross-check with TrustPrompt's existing financial trigger phrases: `"my salary is"`, `"i earn"`, `"my income is"`, `"my account number is"`, `"my card number is"`. Identify any gap patterns worth adding.

---

## Section 4 — Synthetic & Tooling Sources

These are not datasets per se but tools and references used to generate synthetic test data.

---

### SRC-SYN-001 — Luhn-Valid Test Card Numbers
| Field | Value |
|---|---|
| **Source ID** | SRC-SYN-001 |
| **Layer** | TEST-CASES → `credit_card` positive and boundary cases |
| **Batches Fed** | `FIN-A-001` |
| **URL** | https://stripe.com/docs/testing#cards (Stripe test card list) |
| **License** | Public documentation — freely referenceable |
| **Format** | Web documentation |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Stripe's test card numbers are the industry-standard set of Luhn-valid, publicly known non-real card numbers. They are safe to include in test cases because they cannot be used for actual transactions.
- Extract at minimum: Visa (`4111 1111 1111 1111`), Mastercard (`5500 0000 0000 0004`), Amex (`3714 496353 98431`), JCB (`3566 0020 2036 0505`), Discover (`6011 1111 1111 1117`).
- For malformed cases: alter the last digit of each to break the Luhn check.
- For boundary cases: include the minimum-length valid Visa (13 digits: `4111111111111`) and a 19-digit card number.
- Note: `4111 1111 1111 1111` should eventually be caught by the placeholder filter (task #4) even though it is Luhn-valid, because it is a universally known test number. Annotate the placeholder case accordingly.

---

### SRC-SYN-002 — JWT Generator (jwt.io)
| Field | Value |
|---|---|
| **Source ID** | SRC-SYN-002 |
| **Layer** | TEST-CASES → `jwt` positive and boundary cases |
| **Batches Fed** | `AUTH-A-002` |
| **URL** | https://jwt.io |
| **License** | Public tool — output tokens are user-generated |
| **Format** | Interactive web tool |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Use jwt.io to generate tokens with the dummy payload `{"sub":"trustprompt-test","iat":1700000000}` and signing secret `"trustprompt-test-secret"` (HS256 algorithm).
- Generate at least 5 distinct tokens (vary the payload slightly) for positive cases.
- For malformed cases: alter individual characters in the second segment (payload) or remove the third segment (signature) entirely.
- For boundary cases: test a token where the header segment is missing (`eyJ` prefix absent) — this should not fire.

---

### SRC-SYN-003 — Philippine Mobile Number Prefix Registry
| Field | Value |
|---|---|
| **Source ID** | SRC-SYN-003 |
| **Layer** | TEST-CASES → `ph_mobile` boundary cases |
| **Batches Fed** | `CONTACT-A-002` |
| **URL** | https://en.wikipedia.org/wiki/Telephone_numbers_in_the_Philippines (reference) |
| **License** | Wikipedia CC BY-SA 4.0 — reference use only; do not reproduce table verbatim |
| **Format** | Web page |
| **Ingestion Status** | NOT STARTED |

**Extraction Notes:**  
- Extract the valid 09XX prefix ranges assigned to Globe, Smart, DITO, and other PH telcos.
- Purpose: construct boundary test cases at the exact edges of valid prefix ranges.
- Current validator (`isMobilePhone_PH`) accepts prefix 900–999. Verify this is accurate against the current NTC allocation. If the real valid range is narrower (e.g., some prefixes are unassigned), update both the validator and the test cases to match.
- Key boundary cases to write: lowest valid prefix (`0900`), highest valid prefix (`0999`), one below valid range (`0899` → should be `negative`), one just outside assigned range for any carrier.

---

## Section 5 — Source Status Summary

| Source ID | Name | License Status | Ingestion Status | Priority |
|---|---|---|---|---|
| SRC-GAZ-001 | Nationality List (Imagin-io) | MIT ✓ | NOT STARTED | HIGH |
| SRC-GAZ-002 | NHS A–Z Medical Terms | Public health info — names only ✓ | NOT STARTED | HIGH |
| SRC-GAZ-003 | FinRAD Financial Dataset | VERIFY | NOT STARTED | MEDIUM |
| SRC-GAZ-004 | BSP Financial Glossary | Gov't public domain — VERIFY | NOT STARTED | MEDIUM |
| SRC-NLP-001 | PH Name Dataset (philipperemy) | MIT ✓ | NOT STARTED | HIGH |
| SRC-NLP-002 | Company Designators (ProfoundNetworks) | MIT ✓ | NOT STARTED | MEDIUM |
| SRC-NLP-003 | PH Geographic Data (flores-jacob) | MIT ✓ | NOT STARTED | HIGH |
| SRC-NLP-004 | GeoNames International | CC BY 4.0 ✓ (attribution required) | NOT STARTED | LOW |
| SRC-NLP-005 | Job Titles HuggingFace (gpriday) | VERIFY | NOT STARTED | LOW |
| SRC-NLP-006 | PSA PSOC Job Titles | Gov't public domain — VERIFY | NOT STARTED | MEDIUM |
| SRC-NLP-007 | O*NET Occupational Database | US Gov't public domain ✓ | NOT STARTED | LOW |
| SRC-TRG-001 | Presidio DOB Patterns | MIT ✓ (reference only) | NOT STARTED | MEDIUM |
| SRC-TRG-002 | Presidio Age Patterns | MIT ✓ (reference only) | NOT STARTED | MEDIUM |
| SRC-TRG-003 | Kinbank Family/Relationship | VERIFY | NOT STARTED | LOW (future) |
| SRC-TRG-004 | FinRAD Financial Mentions | VERIFY | NOT STARTED | MEDIUM |
| SRC-SYN-001 | Stripe Test Card Numbers | Public docs ✓ | NOT STARTED | HIGH |
| SRC-SYN-002 | jwt.io Token Generator | Public tool ✓ | NOT STARTED | HIGH |
| SRC-SYN-003 | PH Mobile Prefix Registry (Wikipedia) | CC BY-SA ✓ (reference only) | NOT STARTED | MEDIUM |

**Priority key:** HIGH = needed for first curated batch (task #6); MEDIUM = needed before end of QA cycle; LOW = future enhancement or supplemental.

---

## Section 6 — License Verification Checklist

Before any source marked `VERIFY` is used to populate `gazetteer.js` or any shipped file, complete this checklist:

- [ ] Read the LICENSE file (or terms of use page) in full
- [ ] Confirm whether the license allows: (a) extraction of terms/data, (b) inclusion in a browser extension, (c) commercial use (if the extension will ever be distributed commercially)
- [ ] If the license requires attribution, add the attribution to this registry entry and to the relevant source comment in `gazetteer.js`
- [ ] If the license is non-commercial-only (e.g., CC BY-NC), mark the source as `TEST-CASES ONLY` — data from it may inspire synthetic samples but cannot be shipped inside the extension
- [ ] Record the verification result and date in the Change Log below

---

## Section 7 — Change Log

| Date | Version | Changed By | Summary |
|---|---|---|---|
| 2026-08-21 | 0.1.0 | (initial) | Created registry with 18 sources across 4 sections; all ingestion statuses NOT STARTED |
