## compare-runs: after-g15.json  ->  after-g16s1.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 100 | 104 | 71/104 | 75/104 | 32/57 | 32/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 68 | 71 | 49/73 | 52/73 | 22/42 | 22/42 |
| hidden (C-111..161 minus the 5) | 46 | 32 | 33 | 22/31 | 23/31 | 10/15 | 10/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 100 | 104 | 97 | 101 | 65/104 | 69/104 | 5 | 5 |
| dev | 115 | 68 | 71 | 67 | 70 | 45/73 | 48/73 | 3 | 3 |
| hidden | 46 | 32 | 33 | 30 | 31 | 20/31 | 21/31 | 2 | 2 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":4}

### 1c. Finding-level precision / recall / F1 (definitions in the header of this file)
**before: after-g15.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 81.6 / 71.0 / 75.9 | 73.2 / 87.0 / 79.5 | 80.3 / 82.0 / 81.1 | 228 / 56 / 50 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 86.2 / 75.0 / 80.2 | 73.2 / 87.0 / 79.5 | 81.7 / 83.5 / 82.6 | 232 / 52 / 46 |
| dev | exact | 80.8 / 86.3 / 83.4 | 78.0 / 61.5 / 68.8 | 62.2 / 84.8 / 71.8 | 75.0 / 77.8 / 76.4 | 123 / 41 / 35 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 82.9 / 65.4 / 73.1 | 62.2 / 84.8 / 71.8 | 76.2 / 79.1 / 77.6 | 125 / 39 / 33 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 84.8 / 81.3 / 83.0 | 86.5 / 88.9 / 87.7 | 87.5 / 87.5 / 87.5 | 105 / 15 / 15 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 89.1 / 85.4 / 87.2 | 86.5 / 88.9 / 87.7 | 89.2 / 89.2 / 89.2 | 107 / 13 / 13 |

**after: after-g16s1.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 82.8 / 77.0 / 79.8 | 73.2 / 87.0 / 79.5 | 80.7 / 84.2 / 82.4 | 234 / 56 / 44 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 87.1 / 81.0 / 83.9 | 73.2 / 87.0 / 79.5 | 82.1 / 85.6 / 83.8 | 238 / 52 / 40 |
| dev | exact | 80.8 / 86.3 / 83.4 | 80.4 / 71.2 / 75.5 | 62.2 / 84.8 / 71.8 | 75.7 / 81.0 / 78.3 | 128 / 41 / 30 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 84.8 / 75.0 / 79.6 | 62.2 / 84.8 / 71.8 | 76.9 / 82.3 / 79.5 | 130 / 39 / 28 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 85.1 / 83.3 / 84.2 | 86.5 / 88.9 / 87.7 | 87.6 / 88.3 / 88.0 | 106 / 15 / 14 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 89.4 / 87.5 / 88.4 | 86.5 / 88.9 / 87.7 | 89.3 / 90.0 / 89.6 | 108 / 13 / 12 |

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 115 | 115 | 0 |
| nlp_job_title | 87 | 93 | 6 |
| nlp_organization | 82 | 82 | 0 |
| TOTAL | 284 | 290 | 6 |

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
| C-030 | dev | yes | missing -> strict-clean | job_title:"Branch Coordinator" | - |
| C-104 | dev | yes | missing -> strict-clean | job_title:"lawyer" | - |
| C-109 | dev | yes | missing -> strict-clean | job_title:"electrician"; job_title:"accountant"; job_title:"pharmacist" | - |
| C-111 | hidden | yes | missing -> strict-clean | job_title:"principal" | - |

### 5. Regressions (strict-clean before, not strict-clean after)
none
