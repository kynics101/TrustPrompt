## compare-runs: after-g16s1.json  ->  after-g16s2.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 104 | 106 | 75/104 | 77/104 | 32/57 | 32/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 71 | 73 | 52/73 | 54/73 | 22/42 | 22/42 |
| hidden (C-111..161 minus the 5) | 46 | 33 | 33 | 23/31 | 23/31 | 10/15 | 10/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 104 | 106 | 101 | 103 | 69/104 | 71/104 | 5 | 5 |
| dev | 115 | 71 | 73 | 70 | 72 | 48/73 | 50/73 | 3 | 3 |
| hidden | 46 | 33 | 33 | 31 | 31 | 21/31 | 21/31 | 2 | 2 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":4}

### 1c. Finding-level precision / recall / F1 (definitions in the header of this file)
**before: after-g16s1.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 82.8 / 77.0 / 79.8 | 73.2 / 87.0 / 79.5 | 80.7 / 84.2 / 82.4 | 234 / 56 / 44 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 87.1 / 81.0 / 83.9 | 73.2 / 87.0 / 79.5 | 82.1 / 85.6 / 83.8 | 238 / 52 / 40 |
| dev | exact | 80.8 / 86.3 / 83.4 | 80.4 / 71.2 / 75.5 | 62.2 / 84.8 / 71.8 | 75.7 / 81.0 / 78.3 | 128 / 41 / 30 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 84.8 / 75.0 / 79.6 | 62.2 / 84.8 / 71.8 | 76.9 / 82.3 / 79.5 | 130 / 39 / 28 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 85.1 / 83.3 / 84.2 | 86.5 / 88.9 / 87.7 | 87.6 / 88.3 / 88.0 | 106 / 15 / 14 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 89.4 / 87.5 / 88.4 | 86.5 / 88.9 / 87.7 | 89.3 / 90.0 / 89.6 | 108 / 13 / 12 |

**after: after-g16s2.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 84.3 / 89.0 / 86.6 | 83.3 / 80.0 / 81.6 | 73.2 / 87.0 / 79.5 | 80.9 / 85.3 / 83.0 | 237 / 56 / 41 |
| ALL 161 | lenient | 84.3 / 89.0 / 86.6 | 87.5 / 84.0 / 85.7 | 73.2 / 87.0 / 79.5 | 82.3 / 86.7 / 84.4 | 241 / 52 / 37 |
| dev | exact | 80.8 / 86.3 / 83.4 | 81.3 / 75.0 / 78.0 | 62.2 / 84.8 / 71.8 | 76.0 / 82.3 / 79.0 | 130 / 41 / 28 |
| dev | lenient | 80.8 / 86.3 / 83.4 | 85.4 / 78.8 / 82.0 | 62.2 / 84.8 / 71.8 | 77.2 / 83.5 / 80.2 | 132 / 39 / 26 |
| hidden | exact | 91.9 / 94.4 / 93.2 | 85.4 / 85.4 / 85.4 | 86.5 / 88.9 / 87.7 | 87.7 / 89.2 / 88.4 | 107 / 15 / 13 |
| hidden | lenient | 91.9 / 94.4 / 93.2 | 89.6 / 89.6 / 89.6 | 86.5 / 88.9 / 87.7 | 89.3 / 90.8 / 90.1 | 109 / 13 / 11 |

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 115 | 115 | 0 |
| nlp_job_title | 93 | 96 | 3 |
| nlp_organization | 82 | 82 | 0 |
| TOTAL | 290 | 293 | 3 |

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
| C-058 | dev | yes | missing -> strict-clean | job_title:"cashier" | - |
| C-110 | dev | yes | missing -> strict-clean | job_title:"illustrator" | - |
| C-155 | hidden | yes | missing -> missing | job_title:"bookkeeper" | - |

### 5. Regressions (strict-clean before, not strict-clean after)
none
