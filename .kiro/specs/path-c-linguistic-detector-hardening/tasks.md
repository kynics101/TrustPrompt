# Implementation Plan: Path C Linguistic Detector Hardening

## Overview

Nine tasks grouped by concern. Groups A, B, C, and D can be started in order. Within Group A, tasks 1–3 must be done before Group B tasks because B depends on `PHILIPPINE_NAMES` being loaded. Group D tasks are independent of Groups B and C.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] },
    { "wave": 3, "tasks": ["4", "6", "8"] },
    { "wave": 4, "tasks": ["5", "7", "9"] }
  ]
}
```

## Tasks

### Group A — Dictionary Data

- [ ] 1. Create `terms-names.js` with Philippine given names and surnames
  - Create `terms-names.js` in the workspace root following the exact structure of `terms-occupations.js`
  - Declare `const NAMES_DATA = [...]` — no `module.exports`, no `export` keyword (browser content script)
  - Include at minimum 500 Philippine given names (Filipino and Spanish-origin), for example: Aaliyah, Abby, Ace, Agnes, Aiza, Alejandro, Alexis, Alfredo, Alicia, Alma, Amado, Amanda, Analiza, Andrea, Angel, Angela, Angelica, Angelo, Angie, Anna, Annaliza, Anthony, Antonio, Arjay, Arnel, Arthur, Arvie, Ashley, Ate, Audrey, Axel, Ayesha, Benedicto, Benny, Berna, Bernard, Bianca, Bobby, Brian, Brigitte, Bryan, Carina, Carla, Carlo, Carlos, Carmela, Carmen, Carmi, Cathy, Cecilia, Celine, Charmaine, Cherry, Christine, Christopher, Cindy, Claire, Clarence, Clarissa, Claudette, Clifford, Corazon, Cristina, Czarina, Dana, Daniel, Daniela, Danilo, Dante, Darren, Darwin, Dave, David, Dayanara, Deanna, Delia, Denise, Dennis, Desiree, Diana, Dominga, Donald, Donna, Donnie, Dory, Earl, Eddie, Edgardo, Edna, Eduardo, Elaine, Eleanor, Elena, Elisa, Elizabeth, Ella, Elpidio, Emilio, Emmanuel, Eric, Erica, Ernesto, Erwin, Esmeralda, Estrella, Eunice, Evangeline, Evelyn, Faith, Fe, Ferdinand, Ferdie, Frances, Francis, Francisco, Frederick, Genalyn, George, Geraldine, Gina, Giovanni, Gladys, Gloria, Grace, Gregorio, Hannah, Helena, Herbert, Hernan, Hope, Imelda, Irene, Isabel, Isadora, Ivan, Jacqueline, Jasmine, Jason, Javier, Jayson, Jean, Jeffrey, Jenny, Jerome, Jessica, Jesus, Joana, Joel, Joella, John, Jonathan, Jose, Joseph, Josephine, Joshua, Joyce, Juan, Julius, Justin, Karen, Karl, Katrina, Kayla, Kevin, Kim, Kristina, Kristine, Kyleen, Laura, Leah, Leilani, Leonardo, Leslie, Leticia, Lila, Liza, Lorena, Lorna, Lourdes, Luisa, Luz, Lydia, Madeleine, Madeline, Magdalena, Mara, Maria, Maricel, Maricris, Marie, Marites, Mark, Marlon, Martha, Martin, Marvin, Mary, Maylene, Mena, Mercedes, Michelle, Miguel, Milagros, Myra, Natividad, Nellie, Nelson, Nina, Noel, Nora, Norma, Ophelia, Orlando, Pablo, Pacita, Patricia, Patrick, Paul, Paula, Pauline, Pearl, Pedro, Philip, Precilla, Rachel, Ramon, Randy, Rebecca, Reginald, Remedios, Renato, Ricardo, Richard, Robert, Roberto, Roberta, Rodrigo, Roland, Romeo, Ronaldo, Rosalinda, Rosario, Rose, Rowena, Ruel, Ryan, Sabrina, Salvador, Samantha, Sandra, Santiago, Sarah, Sheila, Sheryl, Shirley, Simone, Sofia, Stella, Stephanie, Stephen, Susan, Susana, Teodora, Teresa, Theresa, Timothy, Tina, Tirso, Todd, Victoria, Victorio, Virginia, Vivian, Wilfredo, William, Xavier, Yvonne, Zenaida
  - Include at minimum 500 Philippine surnames (Filipino and Spanish-origin), for example: Abad, Abaya, Abueva, Acosta, Aguilar, Agustin, Alcantara, Alejandro, Almazan, Alvarado, Alvarez, Andres, Angeles, Aquino, Arellano, Arguelles, Arroyo, Austria, Avila, Azurin, Bacalso, Balmaceda, Baltazar, Basa, Batungbakal, Bautista, Bello, Bernardo, Bilog, Borja, Buenaventura, Burgos, Caballero, Cabrera, Campos, Capistrano, Castillo, Castro, Cayabyab, Celestino, Chan, Chico, Chua, Climaco, Cojuangco, Consunji, Corpuz, Cruz, Dacera, David, De Castro, De Guzman, De Jesus, De la Cruz, De Leon, De Lima, De Mesa, De Ocampo, De Vera, Del Pilar, Dela Cruz, Dela Rosa, Delgado, Diaz, Dingcong, Diokno, Divino, Domingo, Dones, Dumlao, Durano, Dy, Enriquez, Espinosa, Estrada, Estrellas, Evangelista, Fajardo, Felipe, Fernandez, Ferrer, Figueroa, Flores, Florido, Fonacier, Fuentes, Gacusan, Galang, Gallego, Gana, Garcia, Gil, Gonzales, Gonzalez, Gorospe, Gotianun, Guinto, Gutierrez, Herrera, Hilario, Hizon, Ibarra, Imperial, Infante, Javier, Jimenez, Jurado, Lacson, Lagman, Lara, Laurel, Laurente, Ledesma, Legarda, Leon, Llamas, Llorente, Lopez, Lucero, Luna, Macapagal, Macaraeg, Madrigal, Magbanua, Malaluan, Malaya, Maliksi, Manalo, Maranon, Marcos, Marquez, Medina, Mendoza, Mercado, Miraflor, Molina, Montano, Montelibano, Montes, Montilla, Morales, Muñoz, Natividad, Naval, Neri, Nicolas, Nicdao, Nograles, Ocampo, Oco, Ojeada, Olmedo, Ordonez, Ortega, Osi, Padilla, Paguia, Palma, Panganiban, Paraiso, Parungao, Pascual, Paular, Pedrosa, Perez, Perlas, Pimentel, Pineda, Policarpio, Ponce, Porras, Punzalan, Quiambao, Quimpo, Quizon, Ramos, Razon, Reyes, Rico, Rivera, Rizal, Robles, Roces, Rodrigo, Rodriguez, Romero, Roquero, Rosario, Roxas, Ruiz, Salazar, Salcedo, Sales, Salmingo, Sambrano, Santos, Sarmiento, Sebastian, Sese, Silva, Sison, Solis, Soriano, Taguig, Tan, Tiongco, Tiongson, Torres, Tupas, Ty, Umali, Valencia, Valenzuela, Vasquez, Velasco, Velasquez, Vera, Vergara, Villar, Villanueva, Villanueva, Villaruel, Viray, Vitug, Yalong, Yap, Yaptinchay, Ylagan, Yu, Zabala
  - Sort entries alphabetically within each section (same style as `terms-occupations.js` which is alphabetical)
  - **Acceptance:** File exists at workspace root, `const NAMES_DATA` is declared, array has ≥ 500 given names and ≥ 500 surnames, no syntax errors (load in Node.js with `require` to verify)

- [ ] 2. Register `terms-names.js` in `manifest.json`
  - Open `manifest.json` and locate the three `content_scripts` blocks (for claude.ai, chatgpt.com, and the third site)
  - In each block, insert `"terms-names.js"` immediately before `"linguistic-detector.js"`
  - Do not change any other entry in the manifest
  - **Acceptance:** `manifest.json` has `terms-names.js` before `linguistic-detector.js` in all three content script arrays; manifest remains valid JSON

- [ ] 3. Add `initializePhilippineNames()` to `linguistic-detector.js`
  - Declare `let PHILIPPINE_NAMES = new Set()` at the top of the module alongside `EXTENSIVE_JOB_TITLES` and `EXTENSIVE_ORGANIZATIONS`
  - Write `initializePhilippineNames()` using the same pattern as `initializeExtensiveJobTitles()`: check `typeof NAMES_DATA`, map to lowercase, populate the Set, log result, return bool
  - Add graceful degradation: if `NAMES_DATA` is undefined, log a warning (`console.warn`) and return `false` — do not throw
  - Call `initializePhilippineNames()` inside the existing initialization block (wherever `initializeExtensiveJobTitles()` and `initializeExtensiveOrganizations()` are called)
  - **Acceptance:** After loading the extension, `PHILIPPINE_NAMES.size` is ≥ 1000 in the browser console; if `NAMES_DATA` is removed from manifest, no error is thrown

---

## Group B — Name Detection Logic

## Group B — Name Detection Logic
  - In `linguistic-detector.js`, find the `NON_NAME_WORDS` Set declaration (currently ~100 entries)
  - Replace the entire set with only: possessive pronouns (`my`, `your`, `his`, `her`, `its`, `our`, `their`), articles (`a`, `an`, `the`), demonstratives (`this`, `that`, `these`, `those`), and common conjunctions/prepositions that appear at sentence start (`and`, `or`, `but`, `for`, `nor`, `yet`, `so`, `in`, `on`, `at`, `by`, `to`, `of`, `up`)
  - Maximum 20 entries total
  - **Acceptance:** `NON_NAME_WORDS.size <= 20`; existing test prompt "My birthday is tomorrow" does not flag "birthday" as a name

- [ ] 5. Add dictionary cross-reference gate to `extractStandalonePersonNames`
  - In `extractStandalonePersonNames`, after the existing `NON_NAME_WORDS` check (which is now only pronouns/articles), add two new rejection checks for each word in the candidate phrase:
    - If `EXTENSIVE_JOB_TITLES.has(word.toLowerCase())` → skip entire phrase (it contains a job title word)
    - If `EXTENSIVE_ORGANIZATIONS.has(word.toLowerCase())` → skip entire phrase (it contains an org name word)
  - Then add a positive acceptance gate after the rejection checks: a phrase is accepted only if at least one word passes `PHILIPPINE_NAMES.has(word.toLowerCase())` OR Compromise.js NER confirms the phrase as a person (call `window.nlp(potentialName).people().length > 0`)
  - If neither positive check passes → skip the phrase (no positive signal)
  - Preserve the existing duplicate check (`names.some(n => n.toLowerCase() === lowerName)`) — it still runs
  - **Acceptance:** "Human Resource Manager" is not emitted as a person name; "Kyleen Nicdao" is emitted; "Accenture Philippines" is not emitted as a person name

---

### Group C — Organization Detection Priority

- [ ] 6. Enforce three-pass org detection order with shared deduplication in `scan()`
  - In the `scan()` function, find where organization findings are collected (currently `findOrganizationsCSVFirst`, `extractOrganizationContexts`, and Compromise.js `.organizations()` calls)
  - Introduce a shared `const seenOrgSpans = new Set()` initialized before any org pass runs
  - Run Pass A (`findOrganizationsCSVFirst`) first; add every `rawMatch.toLowerCase()` to `seenOrgSpans`
  - Run Pass B (Compromise.js `.organizations()` NER) second; before accepting any span, check `seenOrgSpans.has(span.toLowerCase())` — skip if already seen, otherwise add to set
  - Run Pass C (`extractOrganizationContexts` or `findOrganizationsInCSV`) only if `passAFindings.length + passBFindings.length < 2`; apply the same `seenOrgSpans` gate
  - Merge all three passes into the final org findings array
  - **Acceptance:** A prompt containing "Accenture Philippines Inc" produces exactly one `nlp_organization` finding for that span, not two or three

- [ ] 7. Set `validated: true` on dictionary-backed org findings, `validated: false` on NLP-only findings
  - For findings that come from Pass A (dictionary exact match), set `validated: true`
  - For findings that come from Pass B (Compromise.js NER only, no dictionary backing), set `validated: false`
  - For findings that come from Pass C (context patterns), set `validated: false` unless the span is in `EXTENSIVE_ORGANIZATIONS`
  - This does not change any scoring logic — `validated` is only used for UI display
  - **Acceptance:** `findOrganizationsCSVFirst` result objects have `validated: true`; Compromise.js-only org findings have `validated: false`

---

### Group D — Performance and Disambiguation

- [ ] 8. Add `getCandidateOrgsFromIndex()` and gate fuzzy Pass 2 in `findOrganizationsCSVFirst`
  - Write a new private function `getCandidateOrgsFromIndex(text)`:
    - Split `text` to lowercase words longer than 3 characters
    - For each word, look up `ORG_KEYWORDS_INDEX.get(word)` and add all returned org names to a `Set<string>`
    - Return the Set
  - In `findOrganizationsCSVFirst`, replace the current Pass 2 loop (which iterates all 22,151 orgs) with the following logic:
    - Call `getCandidateOrgsFromIndex(text)` to get candidates
    - If `candidates.size === 0`, skip Pass 2 (no relevant keywords in text)
    - If `candidates.size > 200`, skip Pass 2 (too many candidates, not useful)
    - Otherwise, iterate only `candidates` for the Levenshtein loop (same existing length-ratio checks apply)
  - Do not modify `fuzzyFind()` itself
  - **Acceptance:** On a 500-word prompt with no org keyword matches, Pass 2 loop body executes 0 times; on a prompt with "Accenture" mentioned, Pass 2 runs only against orgs that share a keyword with "Accenture"; total `scan()` time on a 500-word prompt stays under 50ms (verify with `console.time`)

- [ ] 9. Add dictionary-first lookup to `classifyNameVsOrganization`
  - At the very top of `classifyNameVsOrganization`, before any existing logic:
    - Check `EXTENSIVE_ORGANIZATIONS.has(text.toLowerCase())` — if true, return `"organization"` immediately
    - Check if `PHILIPPINE_NAMES.size > 0` and every word of `text` passes `PHILIPPINE_NAMES.has(word.toLowerCase())` — if true, return `"name"` immediately
  - Leave all existing scoring heuristics (`nameScore`, `orgScore`, `explicitOrgWords`, etc.) completely unchanged below these two new checks
  - **Acceptance:** `classifyNameVsOrganization("Abad Brothers")` returns `"organization"` (because "Abad Brothers" or similar is in `EXTENSIVE_ORGANIZATIONS`); `classifyNameVsOrganization("Kyleen Nicdao")` returns `"name"` (because both words are in `PHILIPPINE_NAMES`); existing behavior for inputs not in either dictionary is unchanged
