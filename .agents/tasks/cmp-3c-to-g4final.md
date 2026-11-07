## compare-runs: after-group3c.json  ->  after-g4h1.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 84 | 93 | 57/104 | 67/104 | 30/57 | 30/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 53 | 62 | 35/73 | 45/73 | 21/42 | 21/42 |
| hidden (C-111..161 minus the 5) | 46 | 31 | 31 | 22/31 | 22/31 | 9/15 | 9/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 84 | 93 | 80 | 90 | 50/104 | 60/104 | 7 | 6 |
| dev | 115 | 53 | 62 | 51 | 61 | 30/73 | 40/73 | 4 | 3 |
| hidden | 46 | 31 | 31 | 29 | 29 | 20/31 | 20/31 | 3 | 3 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":5}

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 112 | 113 | 1 |
| nlp_job_title | 80 | 80 | 0 |
| nlp_organization | 92 | 92 | 0 |
| TOTAL | 284 | 285 | 1 |

### 3. should-not-flag rows that have findings (before -> after)
before: 27 rows, after: 27 rows
| id | split | before | after |
|---|---|---|---|
| C-003 | dev | person_name:"Roberto Villanueva Jr"; organization:"the philippines" | person_name:"Roberto Villanueva Jr"; organization:"the philippines" |
| C-012 | dev | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" | person_name:"Emilio Aguinaldo"; person_name:"Andres Bonifacio" |
| C-014 | dev | person_name:"Nathaniel Ocampo" | person_name:"Nathaniel Ocampo" |
| C-026 | dev | person_name:"Corazon Magsaysay" | person_name:"Corazon Magsaysay" |
| C-040 | dev | organization:"best way"; person_name:"Victoria" | organization:"best way"; person_name:"Victoria" |
| C-051 | dev | job_title:"boss" | job_title:"boss" |
| C-056 | dev | job_title:"pharmacy technician"; organization:"the philippines" | job_title:"pharmacy technician"; organization:"the philippines" |
| C-061 | dev | job_title:"flight attendant" | job_title:"flight attendant" |
| C-066 | dev | organization:"PhilHealth" | organization:"PhilHealth" |
| C-067 | dev | organization:"University of the Philippines Diliman"; organization:"Tarlac State University" | organization:"University of the Philippines Diliman"; organization:"Tarlac State University" |
| C-070 | dev | person_name:"Amazon"; organization:"Apple"; organization:"Shell" | person_name:"Amazon"; organization:"Apple"; organization:"Shell" |
| C-071 | dev | organization:"Apple"; organization:"Shell" | organization:"Apple"; organization:"Shell" |
| C-072 | dev | organization:"PLDT" | organization:"PLDT" |
| C-077 | dev | organization:"a university" | organization:"a university" |
| C-078 | dev | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" | person_name:"Bangko Sentral"; organization:"Commission on Audit"; organization:"Office of the Ombudsman" |
| C-079 | dev | organization:"Microsoft"; organization:"Google"; organization:"the philippines" | organization:"Microsoft"; organization:"Google"; organization:"the philippines" |
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
| C-149 | hidden | organization:"to store" | organization:"to store" |

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
|---|---|---|---|---|---|
| C-002 | dev | yes | missing -> strict-clean | person_name:"Juan dela Cruz" | person_name:"Juan" |
| C-005 | dev | yes | missing -> strict-clean | person_name:"Angelica Reyes-Domingo" | person_name:"Angelica Reyes" |
| C-009 | dev | yes | missing -> strict-clean | person_name:"Ma. Cristina Peña-Muñoz" | person_name:"Cristina Pe"; person_name:"Ma" |
| C-011 | dev | yes | missing -> strict-clean | person_name:"J. P. Rizal-Alonso" | - |
| C-016 | dev | yes | missing -> strict-clean | person_name:"Sofia Hernandez" | - |
| C-017 | dev | yes | missing -> strict-clean | person_name:"Ferdinand Miguel Alcantara III" | person_name:"Ferdinand Miguel Alcantara" |
| C-018 | dev | yes | missing -> strict-clean | person_name:"Lorna Lacson-Pineda" | person_name:"Lorna Lacson" |
| C-024 | dev | yes | missing -> strict-clean | person_name:"Fatima Al-Rashid" | person_name:"Fatima Al" |
| C-029 | dev | yes | missing -> missing | person_name:"Juan dela Cruz" | - |
| C-030 | dev | yes | missing -> missing | person_name:"Maria Santos" | person_name:"Maria Santos Branch" |
| C-036 | dev | yes | missing -> strict-clean | person_name:"Maria Cristina Esperanza Villanueva y Montenegro-Dela Paz" | person_name:"Maria Cristina Esperanza"; person_name:"Dela Paz" |
| C-109 | dev | yes | missing -> missing | person_name:"Anna Marie Co" | - |
| C-128 | hidden | yes | missing -> missing | person_name:"SyCip Salazar Hernandez" | person_name:"Salazar Hernandez" |
| C-133 | dev | yes | missing -> loose-only(extras) | person_name:"rowena dizon" | - |
| C-135 | hidden | yes | missing -> missing | person_name:"Grace Dela Peña" | person_name:"Grace Dela Pe" |
| C-154 | dev | yes | missing -> missing | - | person_name:"Sentinel Shield Security" |
| C-155 | hidden | yes | missing -> missing | person_name:"Alvin Jay Dela Rosa" | person_name:"Alvin Jay Dela"; person_name:"Rosa" |

### 5. Regressions (strict-clean before, not strict-clean after)
none
