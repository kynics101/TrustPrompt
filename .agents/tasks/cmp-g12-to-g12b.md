## compare-runs: after-g12.json  ->  after-g12b.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 94 | 94 | 66/104 | 66/104 | 32/57 | 32/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 62 | 62 | 44/73 | 44/73 | 22/42 | 22/42 |
| hidden (C-111..161 minus the 5) | 46 | 32 | 32 | 22/31 | 22/31 | 10/15 | 10/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 94 | 94 | 91 | 91 | 59/104 | 59/104 | 6 | 6 |
| dev | 115 | 62 | 62 | 61 | 61 | 39/73 | 39/73 | 3 | 3 |
| hidden | 46 | 32 | 32 | 30 | 30 | 20/31 | 20/31 | 3 | 3 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":5}

### 1c. Finding-level precision / recall / F1 (definitions in the header of this file)
**before: after-g12.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 78.3 / 65.0 / 71.0 | 72.3 / 87.0 / 78.9 | 79.0 / 79.9 / 79.4 | 222 / 59 / 56 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 84.3 / 70.0 / 76.5 | 72.3 / 87.0 / 78.9 | 80.8 / 81.7 / 81.2 | 227 / 54 / 51 |
| dev | exact | 80.8 / 86.3 / 83.4 | 73.0 / 51.9 / 60.7 | 60.9 / 84.8 / 70.9 | 73.3 / 74.7 / 74.0 | 118 / 43 / 40 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 78.4 / 55.8 / 65.2 | 60.9 / 84.8 / 70.9 | 74.5 / 75.9 / 75.2 | 120 / 41 / 38 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 82.6 / 79.2 / 80.9 | 86.5 / 88.9 / 87.7 | 86.7 / 86.7 / 86.7 | 104 / 16 / 16 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 89.1 / 85.4 / 87.2 | 86.5 / 88.9 / 87.7 | 89.2 / 89.2 / 89.2 | 107 / 13 / 13 |

**after: after-g12b.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 78.3 / 65.0 / 71.0 | 72.3 / 87.0 / 78.9 | 79.0 / 79.9 / 79.4 | 222 / 59 / 56 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 84.3 / 70.0 / 76.5 | 72.3 / 87.0 / 78.9 | 80.8 / 81.7 / 81.2 | 227 / 54 / 51 |
| dev | exact | 80.8 / 86.3 / 83.4 | 73.0 / 51.9 / 60.7 | 60.9 / 84.8 / 70.9 | 73.3 / 74.7 / 74.0 | 118 / 43 / 40 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 78.4 / 55.8 / 65.2 | 60.9 / 84.8 / 70.9 | 74.5 / 75.9 / 75.2 | 120 / 41 / 38 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 82.6 / 79.2 / 80.9 | 86.5 / 88.9 / 87.7 | 86.7 / 86.7 / 86.7 | 104 / 16 / 16 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 89.1 / 85.4 / 87.2 | 86.5 / 88.9 / 87.7 | 89.2 / 89.2 / 89.2 | 107 / 13 / 13 |

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 115 | 115 | 0 |
| nlp_job_title | 83 | 83 | 0 |
| nlp_organization | 83 | 83 | 0 |
| TOTAL | 281 | 281 | 0 |

### 3. should-not-flag rows that have findings (before -> after)
before: 25 rows, after: 25 rows
| id | split | before | after |
|---|---|---|---|
| C-003 | dev | person_name:"Roberto Villanueva Jr" | person_name:"Roberto Villanueva Jr" |
| C-012 | dev | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" |
| C-014 | dev | person_name:"Nathaniel Ocampo" | person_name:"Nathaniel Ocampo" |
| C-026 | dev | person_name:"Corazon Magsaysay" | person_name:"Corazon Magsaysay" |
| C-040 | dev | person_name:"Victoria" | person_name:"Victoria" |
| C-051 | dev | job_title:"boss" | job_title:"boss" |
| C-056 | dev | job_title:"pharmacy technician" | job_title:"pharmacy technician" |
| C-061 | dev | job_title:"flight attendant" | job_title:"flight attendant" |
| C-066 | dev | organization:"PhilHealth" | organization:"PhilHealth" |
| C-067 | dev | organization:"University of the Philippines Diliman"; organization:"Tarlac State University" | organization:"University of the Philippines Diliman"; organization:"Tarlac State University" |
| C-070 | dev | person_name:"Amazon"; organization:"Apple"; organization:"Shell" | person_name:"Amazon"; organization:"Apple"; organization:"Shell" |
| C-071 | dev | organization:"Apple"; organization:"Shell" | organization:"Apple"; organization:"Shell" |
| C-072 | dev | organization:"PLDT" | organization:"PLDT" |
| C-078 | dev | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" |
| C-079 | dev | organization:"Microsoft"; organization:"Google" | organization:"Microsoft"; organization:"Google" |
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

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
|---|---|---|---|---|---|

### 5. Regressions (strict-clean before, not strict-clean after)
none
