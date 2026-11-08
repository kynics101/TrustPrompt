## compare-runs: after-cur.json  ->  after-narrow2.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 92 | 94 | 66/104 | 66/104 | 30/57 | 32/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 61 | 62 | 44/73 | 44/73 | 21/42 | 22/42 |
| hidden (C-111..161 minus the 5) | 46 | 31 | 32 | 22/31 | 22/31 | 9/15 | 10/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 92 | 94 | 89 | 91 | 59/104 | 59/104 | 6 | 6 |
| dev | 115 | 61 | 62 | 60 | 61 | 39/73 | 39/73 | 3 | 3 |
| hidden | 46 | 31 | 32 | 29 | 30 | 20/31 | 20/31 | 3 | 3 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":5}

### 1c. Finding-level precision / recall / F1 (definitions in the header of this file)
**before: after-cur.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 77.5 / 62.0 / 68.9 | 65.2 / 87.0 / 74.5 | 76.3 / 78.8 / 77.5 | 219 / 68 / 59 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 83.8 / 67.0 / 74.4 | 65.2 / 87.0 / 74.5 | 78.0 / 80.6 / 79.3 | 224 / 63 / 54 |
| dev | exact | 80.8 / 86.3 / 83.4 | 72.2 / 50.0 / 59.1 | 51.9 / 84.8 / 64.4 | 69.6 / 74.1 / 71.8 | 117 / 51 / 41 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 77.8 / 53.8 / 63.6 | 51.9 / 84.8 / 64.4 | 70.8 / 75.3 / 73.0 | 119 / 49 / 39 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 81.8 / 75.0 / 78.3 | 84.2 / 88.9 / 86.5 | 85.7 / 85.0 / 85.4 | 102 / 17 / 18 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 88.6 / 81.3 / 84.8 | 84.2 / 88.9 / 86.5 | 88.2 / 87.5 / 87.9 | 105 / 14 / 15 |

**after: after-narrow2.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 77.5 / 62.0 / 68.9 | 72.3 / 87.0 / 78.9 | 78.8 / 78.8 / 78.8 | 219 / 59 / 59 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 83.8 / 67.0 / 74.4 | 72.3 / 87.0 / 78.9 | 80.6 / 80.6 / 80.6 | 224 / 54 / 54 |
| dev | exact | 80.8 / 86.3 / 83.4 | 72.2 / 50.0 / 59.1 | 60.9 / 84.8 / 70.9 | 73.1 / 74.1 / 73.6 | 117 / 43 / 41 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 77.8 / 53.8 / 63.6 | 60.9 / 84.8 / 70.9 | 74.4 / 75.3 / 74.8 | 119 / 41 / 39 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 81.8 / 75.0 / 78.3 | 86.5 / 88.9 / 87.7 | 86.4 / 85.0 / 85.7 | 102 / 16 / 18 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 88.6 / 81.3 / 84.8 | 86.5 / 88.9 / 87.7 | 89.0 / 87.5 / 88.2 | 105 / 13 / 15 |

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 115 | 115 | 0 |
| nlp_job_title | 80 | 80 | 0 |
| nlp_organization | 92 | 83 | -9 |
| TOTAL | 287 | 278 | -9 |

### 3. should-not-flag rows that have findings (before -> after)
before: 27 rows, after: 25 rows
| id | split | before | after |
|---|---|---|---|
| C-003 | dev | person_name:"Roberto Villanueva Jr"; organization:"the philippines" | person_name:"Roberto Villanueva Jr" |
| C-012 | dev | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" |
| C-014 | dev | person_name:"Nathaniel Ocampo" | person_name:"Nathaniel Ocampo" |
| C-026 | dev | person_name:"Corazon Magsaysay" | person_name:"Corazon Magsaysay" |
| C-040 | dev | organization:"best way"; person_name:"Victoria" | person_name:"Victoria" |
| C-051 | dev | job_title:"boss" | job_title:"boss" |
| C-056 | dev | job_title:"pharmacy technician"; organization:"the philippines" | job_title:"pharmacy technician" |
| C-061 | dev | job_title:"flight attendant" | job_title:"flight attendant" |
| C-066 | dev | organization:"PhilHealth" | organization:"PhilHealth" |
| C-067 | dev | organization:"University of the Philippines Diliman"; organization:"Tarlac State University" | organization:"University of the Philippines Diliman"; organization:"Tarlac State University" |
| C-070 | dev | person_name:"Amazon"; organization:"Apple"; organization:"Shell" | person_name:"Amazon"; organization:"Apple"; organization:"Shell" |
| C-071 | dev | organization:"Apple"; organization:"Shell" | organization:"Apple"; organization:"Shell" |
| C-072 | dev | organization:"PLDT" | organization:"PLDT" |
| C-077 | dev | organization:"a university" | - |
| C-078 | dev | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" |
| C-079 | dev | organization:"Microsoft"; organization:"Google"; organization:"the philippines" | organization:"Microsoft"; organization:"Google" |
| C-080 | dev | organization:"Philippine Daily Inquirer" | organization:"Philippine Daily Inquirer" |
| C-085 | dev | organization:"Philippine National Police" | organization:"Philippine National Police" |
| C-086 | dev | organization:"Henry Sy Foundation" | organization:"Henry Sy Foundation" |
| C-087 | dev | person_name:"Ayala Lane" | person_name:"Ayala Lane" |
| C-088 | dev | organization:"Department of Wealth Management" | organization:"Department of Wealth Management" |
| C-117 | hidden | job_title:"nurse"; organization:"St. Luke's Medical Center" | job_title:"nurse"; organization:"St. Luke's Medical Center" |
| C-118 | hidden | job_title:"pharmacist"; organization:"Mercury Drug" | job_title:"pharmacist"; organization:"Mercury Drug" |
| C-122 | hidden | job_title:"radiologic technologist"; organization:"Philippine General Hospital" | job_title:"radiologic technologist"; organization:"Philippine General Hospital" |
| C-123 | hidden | job_title:"customer service representative"; job_title:"call center agent"; organization:"Teleperformance"; organization:"Concentrix" | job_title:"customer service representative"; job_title:"call center agent"; organization:"Teleperformance"; organization:"Concentrix" |
| C-145 | hidden | person_name:"Concepcion" | person_name:"Concepcion" |
| C-149 | hidden | organization:"to store" | - |

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
|---|---|---|---|---|---|
| C-001 | dev | yes | missing -> missing | - | organization:"make it" |
| C-003 | dev | no | false-positive -> false-positive | - | organization:"the philippines" |
| C-040 | dev | no | false-positive -> false-positive | - | organization:"best way" |
| C-043 | dev | yes | missing -> missing | - | organization:"move into" |
| C-056 | dev | no | false-positive -> false-positive | - | organization:"the philippines" |
| C-077 | dev | no | false-positive -> clean | - | organization:"a university" |
| C-079 | dev | no | false-positive -> false-positive | - | organization:"the philippines" |
| C-110 | dev | yes | missing -> missing | - | organization:"make it" |
| C-149 | hidden | no | false-positive -> clean | - | organization:"to store" |

### 5. Regressions (strict-clean before, not strict-clean after)
none
