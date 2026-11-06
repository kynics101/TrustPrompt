## compare-runs: after-group3.json  ->  after-group3b.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 84 | 84 | 57/104 | 57/104 | 30/57 | 30/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 53 | 53 | 35/73 | 35/73 | 21/42 | 21/42 |
| hidden (C-111..161 minus the 5) | 46 | 31 | 31 | 22/31 | 22/31 | 9/15 | 9/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 84 | 84 | 79 | 80 | 49/104 | 50/104 | 9 | 7 |
| dev | 115 | 53 | 53 | 50 | 51 | 29/73 | 30/73 | 6 | 4 |
| hidden | 46 | 31 | 31 | 29 | 29 | 20/31 | 20/31 | 3 | 3 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-030: "Maria Santos Branch" (expected: "Maria Santos")
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":5}

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 112 | 112 | 0 |
| nlp_job_title | 80 | 80 | 0 |
| nlp_organization | 92 | 92 | 0 |
| TOTAL | 284 | 284 | 0 |

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
| C-021 | dev | yes | strict-clean -> strict-clean | person_name:"Nena Pascual" | person_name:"Aling Nena Pascual" |
| C-092 | dev | yes | strict-clean -> strict-clean | person_name:"Elena Cruz" | person_name:"Per Elena Cruz" |
| C-103 | dev | yes | strict-clean -> strict-clean | person_name:"Tonyo" | person_name:"Mang Tonyo" |
| C-105 | dev | yes | missing -> missing | person_name:"Benigno Salonga" | person_name:"Kapitan Benigno Salonga" |

### 5. Regressions (strict-clean before, not strict-clean after)
none