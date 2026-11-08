## compare-runs: C:/Users/Andrea/AppData/Local/Temp/claude/90553263fdfd8165/f99b1f86-4612-4852-8a95-27c3470e907c/scratchpad/p-off.json  ->  results/after-prepon.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 117 | 117 | 90/104 | 90/104 | 32/57 | 32/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 80 | 80 | 62/73 | 62/73 | 22/42 | 22/42 |
| hidden (C-111..161 minus the 5) | 46 | 37 | 37 | 28/31 | 28/31 | 10/15 | 10/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 117 | 117 | 113 | 113 | 81/104 | 81/104 | 5 | 5 |
| dev | 115 | 80 | 80 | 78 | 78 | 56/73 | 56/73 | 3 | 3 |
| hidden | 46 | 37 | 37 | 35 | 35 | 25/31 | 25/31 | 2 | 2 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":4}

### 1c. Finding-level precision / recall / F1 (definitions in the header of this file)
**before: C:/Users/Andrea/AppData/Local/Temp/claude/90553263fdfd8165/f99b1f86-4612-4852-8a95-27c3470e907c/scratchpad/p-off.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 85.8 / 89.0 / 87.4 | 84.6 / 88.0 / 86.3 | 75.8 / 100.0 / 86.3 | 82.5 / 91.4 / 86.7 | 254 / 54 / 24 |
| ALL 161 | lenient | 85.8 / 89.0 / 87.4 | 88.5 / 92.0 / 90.2 | 75.8 / 100.0 / 86.3 | 83.8 / 92.8 / 88.1 | 258 / 50 / 20 |
| dev | exact | 81.8 / 86.3 / 84.0 | 84.6 / 84.6 / 84.6 | 66.0 / 100.0 / 79.5 | 78.2 / 88.6 / 83.1 | 140 / 39 / 18 |
| dev | lenient | 81.8 / 86.3 / 84.0 | 88.5 / 88.5 / 88.5 | 66.0 / 100.0 / 79.5 | 79.3 / 89.9 / 84.3 | 142 / 37 / 16 |
| hidden | exact | 94.4 / 94.4 / 94.4 | 84.6 / 91.7 / 88.0 | 87.8 / 100.0 / 93.5 | 88.4 / 95.0 / 91.6 | 114 / 15 / 6 |
| hidden | lenient | 94.4 / 94.4 / 94.4 | 88.5 / 95.8 / 92.0 | 87.8 / 100.0 / 93.5 | 89.9 / 96.7 / 93.2 | 116 / 13 / 4 |

**after: results/after-prepon.json** (each cell: precision / recall / F1, %)
| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |
|---|---|---|---|---|---|---|
| ALL 161 | exact | 85.8 / 89.0 / 87.4 | 84.6 / 88.0 / 86.3 | 75.8 / 100.0 / 86.3 | 82.5 / 91.4 / 86.7 | 254 / 54 / 24 |
| ALL 161 | lenient | 85.8 / 89.0 / 87.4 | 88.5 / 92.0 / 90.2 | 75.8 / 100.0 / 86.3 | 83.8 / 92.8 / 88.1 | 258 / 50 / 20 |
| dev | exact | 81.8 / 86.3 / 84.0 | 84.6 / 84.6 / 84.6 | 66.0 / 100.0 / 79.5 | 78.2 / 88.6 / 83.1 | 140 / 39 / 18 |
| dev | lenient | 81.8 / 86.3 / 84.0 | 88.5 / 88.5 / 88.5 | 66.0 / 100.0 / 79.5 | 79.3 / 89.9 / 84.3 | 142 / 37 / 16 |
| hidden | exact | 94.4 / 94.4 / 94.4 | 84.6 / 91.7 / 88.0 | 87.8 / 100.0 / 93.5 | 88.4 / 95.0 / 91.6 | 114 / 15 / 6 |
| hidden | lenient | 94.4 / 94.4 / 94.4 | 88.5 / 95.8 / 92.0 | 87.8 / 100.0 / 93.5 | 89.9 / 96.7 / 93.2 | 116 / 13 / 4 |

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 113 | 113 | 0 |
| nlp_job_title | 104 | 104 | 0 |
| nlp_organization | 91 | 91 | 0 |
| TOTAL | 308 | 308 | 0 |

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
| C-078 | dev | organization:"Commission on Audit"; organization:"Office of the Ombudsman" | organization:"Commission on Audit"; organization:"Office of the Ombudsman" |
| C-079 | dev | organization:"Microsoft"; organization:"Google" | organization:"Microsoft"; organization:"Google" |
| C-080 | dev | organization:"Philippine Daily Inquirer" | organization:"Philippine Daily Inquirer" |
| C-085 | dev | organization:"Philippine National Police" | organization:"Philippine National Police" |
| C-086 | dev | organization:"Henry Sy Foundation" | organization:"Henry Sy Foundation" |
| C-087 | dev | person_name:"Ayala Lane" | person_name:"Ayala Lane" |
| C-088 | dev | organization:"Department of Wealth Management" | organization:"Department of Wealth Management" |
| C-117 | hidden | job_title:"nurse"; organization:"St. Luke's Medical Center" | job_title:"nurse"; organization:"St. Luke's Medical Center" |
| C-118 | hidden | job_title:"pharmacist"; organization:"Mercury Drug" | job_title:"pharmacist"; organization:"Mercury Drug" |
| C-122 | hidden | job_title:"radiologic technologist"; job_title:"medical technologist"; organization:"Philippine General Hospital" | job_title:"radiologic technologist"; job_title:"medical technologist"; organization:"Philippine General Hospital" |
| C-123 | hidden | job_title:"customer service representative"; job_title:"call center agent"; organization:"Teleperformance"; organization:"Concentrix" | job_title:"customer service representative"; job_title:"call center agent"; organization:"Teleperformance"; organization:"Concentrix" |
| C-145 | hidden | person_name:"Concepcion" | person_name:"Concepcion" |

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
|---|---|---|---|---|---|

### 5. Regressions (strict-clean before, not strict-clean after)
none